from flask import Blueprint, send_file, request, jsonify, session
import json
import io
from app.database import db, Teacher, Room, Level, Course, CourseNature, Setting, TeacherRequest, User

backup_bp = Blueprint('backup', __name__)

# ==========================================
# 1. مسار تصدير (تحميل) النسخة الاحتياطية (SaaS Export)
# ==========================================
@backup_bp.route('/api/backup/export', methods=['GET'])
def export_db():
    if session.get('role') not in ['super_admin', 'tenant_admin']: 
        return jsonify({"error": "غير مصرح بهذا الإجراء"}), 403
        
    tenant_id = session.get('tenant_id')
    
    try:
        # تجميع كل بيانات القسم في قاموس واحد
        backup_data = {
            "settings": [{"key": s.key, "value": s.value} for s in Setting.query.filter_by(tenant_id=tenant_id).all()],
            "course_natures": [{"name": n.name, "symbol": n.symbol} for n in CourseNature.query.filter_by(tenant_id=tenant_id).all()],
            "rooms": [{"name": r.name, "type": r.type} for r in Room.query.filter_by(tenant_id=tenant_id).all()],
            "levels": [{"name": l.name} for l in Level.query.filter_by(tenant_id=tenant_id).all()],
            "teachers": [{"old_id": t.id, "name": t.name, "show_assigned": getattr(t, 'show_assigned', 0)} for t in Teacher.query.filter_by(tenant_id=tenant_id).all()],
            # جلب حسابات الأساتذة فقط (للحفاظ على كلمات المرور الخاصة بهم)
            "users": [{"username": u.username, "password_hash": u.password_hash, "old_teacher_id": u.teacher_id} for u in User.query.filter_by(tenant_id=tenant_id, role='teacher').all()],
            "courses": [],
            "teacher_requests": []
        }
        
        # تجميع المواد (بما فيها ربطها بالمستويات والأستاذ)
        for c in Course.query.filter_by(tenant_id=tenant_id).all():
            backup_data["courses"].append({
                "old_id": c.id,
                "name": c.name,
                "room_type": c.room_type,
                "division": c.division,
                "specialization": c.specialization,
                "course_nature": c.course_nature,
                "old_teacher_id": c.teacher_id,
                "level_names": [l.name for l in c.levels]
            })
            
        # تجميع طلبات الأساتذة
        for req in TeacherRequest.query.filter_by(tenant_id=tenant_id).all():
            backup_data["teacher_requests"].append({
                "old_teacher_id": req.teacher_id,
                "requested_courses": req.requested_courses,
                "requested_days": req.requested_days,
                "status": req.status
            })
            
        # تحويل البيانات لملف JSON وإرسالها للتحميل
        json_data = json.dumps(backup_data, ensure_ascii=False, indent=2)
        output = io.BytesIO(json_data.encode('utf-8'))
        
        return send_file(output, mimetype='application/json', as_attachment=True, download_name='uniplan_backup.json')
        
    except Exception as e:
        return jsonify({"error": f"حدث خطأ أثناء التصدير: {str(e)}"}), 500


# ==========================================
# 2. مسار استيراد (رفع) النسخة الاحتياطية (SaaS Import)
# ==========================================
@backup_bp.route('/api/backup/import', methods=['POST'])
def import_db():
    if session.get('role') not in ['super_admin', 'tenant_admin']: 
        return jsonify({"error": "غير مصرح"}), 403
        
    if 'file' not in request.files:
        return jsonify({"error": "لم يتم إرفاق ملف"}), 400
        
    file = request.files['file']
    if file.filename == '' or not file.filename.endswith('.json'):
        return jsonify({"error": "صيغة الملف غير صالحة. يجب رفع ملف بصيغة .json"}), 400
        
    tenant_id = session.get('tenant_id')
    
    try:
        # 1. قراءة الملف المرفوع
        backup_data = json.loads(file.read().decode('utf-8'))
        
        # 2. مسح البيانات الحالية للقسم بأمان (Factory Reset)
        # يجب تفريغ الجداول الفرعية أولاً
        User.query.filter_by(tenant_id=tenant_id, role='teacher').delete()
        TeacherRequest.query.filter_by(tenant_id=tenant_id).delete()
        for c in Course.query.filter_by(tenant_id=tenant_id).all():
            c.levels = []  # فك الارتباط بالمستويات
            db.session.delete(c)
        CourseNature.query.filter_by(tenant_id=tenant_id).delete()
        Room.query.filter_by(tenant_id=tenant_id).delete()
        Level.query.filter_by(tenant_id=tenant_id).delete()
        Teacher.query.filter_by(tenant_id=tenant_id).delete()
        Setting.query.filter_by(tenant_id=tenant_id).delete()
        db.session.commit()

        # 3. زراعة البيانات الجديدة مع بناء الروابط (ID Mapping)
        
        # أ- الإعدادات، طبيعة المواد، والقاعات
        for s in backup_data.get("settings", []): db.session.add(Setting(key=s["key"], value=s["value"], tenant_id=tenant_id))
        for n in backup_data.get("course_natures", []): db.session.add(CourseNature(name=n["name"], symbol=n["symbol"], tenant_id=tenant_id))
        for r in backup_data.get("rooms", []): db.session.add(Room(name=r["name"], type=r["type"], tenant_id=tenant_id))
        
        # ب- المستويات (تخزينها في قاموس لربطها بالمواد لاحقاً)
        level_map = {}
        for l in backup_data.get("levels", []):
            new_l = Level(name=l["name"], tenant_id=tenant_id)
            db.session.add(new_l)
            level_map[l["name"]] = new_l
            
        # ج- الأساتذة (بناء خريطة للـ ID القديم والجديد)
        teacher_map = {}
        for t in backup_data.get("teachers", []):
            new_t = Teacher(name=t["name"], tenant_id=tenant_id)
            if "show_assigned" in t: new_t.show_assigned = t["show_assigned"]
            db.session.add(new_t)
            db.session.flush() # الحصول على الـ ID الجديد فوراً
            teacher_map[t["old_id"]] = new_t.id
            
        # د- حسابات الدخول (ربطها بالأساتذة الجدد)
        for u in backup_data.get("users", []):
            new_u = User(username=u["username"], password_hash=u["password_hash"], role='teacher', tenant_id=tenant_id)
            old_t_id = u.get("old_teacher_id")
            if old_t_id in teacher_map:
                new_u.teacher_id = teacher_map[old_t_id]
            db.session.add(new_u)
            
        # هـ- المواد (ربطها بالأساتذة والمستويات الجدد)
        course_map = {}
        for c in backup_data.get("courses", []):
            new_c = Course(name=c["name"], room_type=c["room_type"], division=c.get("division"), specialization=c.get("specialization"), course_nature=c.get("course_nature"), tenant_id=tenant_id)
            old_t_id = c.get("old_teacher_id")
            if old_t_id in teacher_map: new_c.teacher_id = teacher_map[old_t_id]
            
            for l_name in c.get("level_names", []):
                if l_name in level_map: new_c.levels.append(level_map[l_name])
                
            db.session.add(new_c)
            db.session.flush()
            course_map[c["old_id"]] = new_c.id
            
        # و- طلبات الأساتذة (تحديث أرقام المواد بداخل مصفوفة الـ JSON)
        for req in backup_data.get("teacher_requests", []):
            old_t_id = req.get("old_teacher_id")
            if old_t_id in teacher_map:
                old_courses = json.loads(req["requested_courses"]) if req["requested_courses"] else []
                new_courses = [str(course_map[int(cid)]) for cid in old_courses if int(cid) in course_map]
                
                new_req = TeacherRequest(teacher_id=teacher_map[old_t_id], requested_courses=json.dumps(new_courses), requested_days=req["requested_days"], status=req["status"], tenant_id=tenant_id)
                db.session.add(new_req)

        db.session.commit()
        return jsonify({"success": True, "message": "تم استعادة النسخة الاحتياطية بنجاح وتحديث النظام بالكامل!"})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"حدث خطأ أثناء الاستعادة. تأكد من سلامة الملف. التفاصيل: {str(e)}"}), 500


# ==========================================
# 3. مسار ضبط المصنع (مسح كل بيانات القسم ما عدا حساب المدير)
# ==========================================
@backup_bp.route('/api/admin/factory_reset', methods=['POST'])
def factory_reset():
    if session.get('role') not in ['super_admin', 'tenant_admin']: 
        return jsonify({"error": "غير مصرح بهذا الإجراء"}), 403
    
    try:
        tenant_id = session.get('tenant_id')
        
        # مسح كل شيء للقسم (باستثناء حساب الإدارة نفسه)
        User.query.filter_by(tenant_id=tenant_id, role='teacher').delete()
        TeacherRequest.query.filter_by(tenant_id=tenant_id).delete()
        for c in Course.query.filter_by(tenant_id=tenant_id).all():
            c.levels = []
            db.session.delete(c)
        CourseNature.query.filter_by(tenant_id=tenant_id).delete()
        Room.query.filter_by(tenant_id=tenant_id).delete()
        Level.query.filter_by(tenant_id=tenant_id).delete()
        Teacher.query.filter_by(tenant_id=tenant_id).delete()
        Setting.query.filter_by(tenant_id=tenant_id).delete()
        
        db.session.commit()
        return jsonify({"success": True, "message": "تم مسح جميع بيانات القسم بنجاح. النظام الآن فارغ كلياً."})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": f"حدث خطأ أثناء ضبط المصنع: {str(e)}"}), 500