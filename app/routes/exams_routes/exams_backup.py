from flask import Blueprint, request, jsonify, send_file, session
import json
import io
from datetime import datetime
from app.database import db, ExamTeacher, ExamRoom, ExamLevel, ExamSubject, ExamDay, ExamSetting
from flask_babel import _

exams_backup_bp = Blueprint('exams_backup', __name__)

# ==========================================
# 1. تصدير البيانات الشامل (SaaS Full Backup)
# ==========================================
@exams_backup_bp.route('/exams/api/backup', methods=['GET'])
def backup_data():
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": _("غير مصرح")}), 403
        
    try:
        # جلب كافة بيانات الامتحانات للقسم الحالي فقط
        settings = ExamSetting.query.filter_by(tenant_id=tenant_id).all()
        rooms = ExamRoom.query.filter_by(tenant_id=tenant_id).all()
        levels = ExamLevel.query.filter_by(tenant_id=tenant_id).all()
        subjects = ExamSubject.query.filter_by(tenant_id=tenant_id).all()
        teachers = ExamTeacher.query.filter_by(tenant_id=tenant_id).all()
        days = ExamDay.query.filter_by(tenant_id=tenant_id).all()

        # بناء هيكل JSON شامل لكل تفاصيل الامتحانات
        backup_dict = {
            'settings': [{'key': s.key, 'value': s.value} for s in settings],
            'rooms': [{'name': r.name, 'type': r.type} for r in rooms],
            'levels': [{'name': l.name} for l in levels],
            'subjects': [{'name': s.name, 'level_name': s.level.name if s.level else None} for s in subjects],
            'teachers': [{'name': t.name, 'subjects': [sub.name for sub in t.subjects]} for t in teachers],
            'days': [{'day_order': d.day_order, 'date_text': d.date_text, 'morning_slots': d.morning_slots, 'afternoon_slots': d.afternoon_slots} for d in days],
            'level_rooms': [{'level_name': l.name, 'rooms': [r.name for r in l.rooms]} for l in levels]
        }
        
        json_string = json.dumps(backup_dict, ensure_ascii=False, indent=4)
        buffer = io.BytesIO(json_string.encode('utf-8'))
        
        filename = f"ExamGuard_Backup_{datetime.now().strftime('%Y%m%d')}.json"
        return send_file(buffer, as_attachment=True, download_name=filename, mimetype="application/json")
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================
# 2. استيراد البيانات (Secure SaaS Restore)
# ==========================================
@exams_backup_bp.route('/exams/api/restore', methods=['POST'])
def restore_exams():
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": _("غير مصرح")}), 403

    data = request.get_json()
    if not data:
        return jsonify({"success": False, "error": _("ملف فارغ أو غير صالح")}), 400

    try:
        # أ. مسح بيانات الامتحانات السابقة للقسم المعني فقط (تهيئة الساحة)
        for t in ExamTeacher.query.filter_by(tenant_id=tenant_id).all():
            t.subjects = []
            db.session.delete(t)
            
        for l in ExamLevel.query.filter_by(tenant_id=tenant_id).all():
            l.rooms = []
            db.session.delete(l)

        ExamSubject.query.filter_by(tenant_id=tenant_id).delete()
        ExamRoom.query.filter_by(tenant_id=tenant_id).delete()
        ExamDay.query.filter_by(tenant_id=tenant_id).delete()
        ExamSetting.query.filter_by(tenant_id=tenant_id).delete()
        
        db.session.commit()

        # ب. إدراج البيانات الجديدة تحت tenant_id الحالي حصراً (الحماية السحابية)
        for s_data in data.get('settings', []):
            db.session.add(ExamSetting(key=s_data['key'], value=s_data['value'], tenant_id=tenant_id))

        for r_data in data.get('rooms', []):
            db.session.add(ExamRoom(name=r_data['name'], type=r_data['type'], tenant_id=tenant_id))
            
        for l_data in data.get('levels', []):
            db.session.add(ExamLevel(name=l_data['name'], tenant_id=tenant_id))
            
        db.session.commit() # حفظ لإنشاء الـ IDs للمستويات والقاعات

        for s_data in data.get('subjects', []):
            level = ExamLevel.query.filter_by(name=s_data['level_name'], tenant_id=tenant_id).first()
            db.session.add(ExamSubject(name=s_data['name'], level_id=level.id if level else None, tenant_id=tenant_id))
            
        db.session.commit() # حفظ لإنشاء الـ IDs للمواد

        # إعادة ربط الأساتذة بالمواد
        for t_data in data.get('teachers', []):
            teacher = ExamTeacher(name=t_data['name'], tenant_id=tenant_id)
            for sub_name in t_data.get('subjects', []):
                subject = ExamSubject.query.filter_by(name=sub_name, tenant_id=tenant_id).first()
                if subject: teacher.subjects.append(subject)
            db.session.add(teacher)

        for d_data in data.get('days', []):
            db.session.add(ExamDay(
                day_order=d_data['day_order'], date_text=d_data['date_text'], 
                morning_slots=d_data['morning_slots'], afternoon_slots=d_data['afternoon_slots'],
                tenant_id=tenant_id
            ))

        # إعادة ربط المستويات بالقاعات
        for lr_data in data.get('level_rooms', []):
            level = ExamLevel.query.filter_by(name=lr_data['level_name'], tenant_id=tenant_id).first()
            if level:
                for room_name in lr_data.get('rooms', []):
                    room = ExamRoom.query.filter_by(name=room_name, tenant_id=tenant_id).first()
                    if room: level.rooms.append(room)

        db.session.commit()
        return jsonify({"success": True, "message": _("✅ تم استعادة بيانات الامتحانات بنجاح!")})

    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": _("حدث خطأ أثناء الاستعادة: {e}").format(e=str(e))}), 500


# ==========================================
# 3. تصفير بيانات الامتحانات (ضبط المصنع)
# ==========================================
@exams_backup_bp.route('/exams/api/reset-all', methods=['POST'])
def reset_all_data():
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": _("غير مصرح")}), 403

    try:
        # مسح العلاقات أولاً ثم الكائنات الخاصة بالامتحانات للقسم الحالي فقط
        for t in ExamTeacher.query.filter_by(tenant_id=tenant_id).all():
            t.subjects = [] # تفريغ مواد الأستاذ
            db.session.delete(t)
            
        for l in ExamLevel.query.filter_by(tenant_id=tenant_id).all():
            l.rooms = [] # تفريغ قاعات المستوى
            db.session.delete(l)

        # مسح بقية البيانات
        ExamSubject.query.filter_by(tenant_id=tenant_id).delete()
        ExamRoom.query.filter_by(tenant_id=tenant_id).delete()
        ExamDay.query.filter_by(tenant_id=tenant_id).delete()
        ExamSetting.query.filter_by(tenant_id=tenant_id).delete()
        
        db.session.commit()
        return jsonify({"success": True, "message": _("تم مسح جميع بيانات الامتحانات بنجاح. سيتم إعادة تحميل الصفحة.")})
    except Exception as e: 
        db.session.rollback()
        return jsonify({"error": _("حدث خطأ أثناء مسح البيانات: {e}").format(e=str(e))}), 500
