from flask import Blueprint, request, jsonify, session, render_template, redirect
from app.database import db, ExamTeacher, ExamRoom, ExamLevel, ExamSubject

# تغيير اسم الـ Blueprint لمنع أي تضارب
exams_basic_data_bp = Blueprint('exams_basic_data', __name__)

# ==========================================
# 🌐 مسار عرض واجهة برنامج الامتحانات (HTML)
# ==========================================
@exams_basic_data_bp.route('/exams')
@exams_basic_data_bp.route('/exams/')
def index():
    # التأكد من تسجيل الدخول وحماية المسار (يسمح فقط لرئيس القسم)
    if 'user_id' not in session or session.get('role') in ['teacher', 'super_admin']:
        return redirect('/')
    return render_template('exams/exams_index.html')

# ==========================================
# 🔍 دوال جلب البيانات (Get Data) للمعاينة الفورية
# ==========================================

@exams_basic_data_bp.route('/exams/api/get-professors', methods=['GET'])
def get_professors():
    """جلب قائمة كل الأساتذة في القسم"""
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify([])
    
    professors = ExamTeacher.query.filter_by(tenant_id=tenant_id).order_by(ExamTeacher.name).all()
    return jsonify([{"id": p.id, "name": p.name} for p in professors])

@exams_basic_data_bp.route('/exams/api/get-halls', methods=['GET'])
def get_halls():
    """جلب قائمة كل القاعات في القسم"""
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify([])
    
    halls = ExamRoom.query.filter_by(tenant_id=tenant_id).order_by(ExamRoom.type, ExamRoom.name).all()
    return jsonify([{"id": r.id, "name": r.name, "type": r.type} for r in halls])

@exams_basic_data_bp.route('/exams/api/get-levels', methods=['GET'])
def get_levels():
    """جلب قائمة كل المستويات الدراسية في القسم"""
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify([])
    
    levels = ExamLevel.query.filter_by(tenant_id=tenant_id).order_by(ExamLevel.name).all()
    return jsonify([{"id": l.id, "name": l.name} for l in levels])

@exams_basic_data_bp.route('/exams/api/get-subjects', methods=['GET'])
def get_subjects():
    """جلب قائمة كل المواد مع ربطها باسم مستواها بذكاء"""
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify([])
    
    # استخدام العلاقة (Relationship) لجلب المستويات مع المواد والترتيب أبجدياً
    subjects = ExamSubject.query.filter_by(tenant_id=tenant_id).join(ExamLevel).order_by(ExamLevel.name, ExamSubject.name).all()
    
    return jsonify([{
        "id": s.id, 
        "name": s.name, 
        "level_name": s.level.name if s.level else "بدون مستوى"
    } for s in subjects])

# ==========================================
# ➕ دوال الإضافة المتعددة (Bulk Add)
# ==========================================

@exams_basic_data_bp.route('/exams/api/add-professors', methods=['POST'])
def add_professors():
    """إضافة عدة أساتذة مرة واحدة مع فلترة المكرر في نفس القسم"""
    tenant_id = session.get('tenant_id')
    professors = request.json.get('professors', [])
    added, duplicates = 0, 0
    
    for prof_name in professors:
        prof_name = prof_name.strip()
        if prof_name:
            # التحقق الذكي من التكرار داخل القسم فقط
            exists = ExamTeacher.query.filter_by(name=prof_name, tenant_id=tenant_id).first()
            if not exists:
                db.session.add(ExamTeacher(name=prof_name, tenant_id=tenant_id))
                added += 1
            else:
                duplicates += 1
                
    db.session.commit()
    return jsonify({'success': True, 'added': added, 'duplicates': duplicates})

@exams_basic_data_bp.route('/exams/api/add-halls', methods=['POST'])
def add_halls():
    """إضافة عدة قاعات مرة واحدة مع نوعها"""
    tenant_id = session.get('tenant_id')
    data = request.json
    halls = data.get('halls', [])
    hall_type = data.get('type')
    added, duplicates = 0, 0
    
    for hall_name in halls:
        hall_name = hall_name.strip()
        if hall_name:
            exists = ExamRoom.query.filter_by(name=hall_name, tenant_id=tenant_id).first()
            if not exists:
                db.session.add(ExamRoom(name=hall_name, type=hall_type, tenant_id=tenant_id))
                added += 1
            else:
                duplicates += 1
                
    db.session.commit()
    return jsonify({'success': True, 'added': added, 'duplicates': duplicates})

@exams_basic_data_bp.route('/exams/api/add-levels', methods=['POST'])
def add_levels():
    """إضافة عدة مستويات دراسية مرة واحدة"""
    tenant_id = session.get('tenant_id')
    levels = request.json.get('levels', [])
    added, duplicates = 0, 0
    
    for level_name in levels:
        level_name = level_name.strip()
        if level_name:
            exists = ExamLevel.query.filter_by(name=level_name, tenant_id=tenant_id).first()
            if not exists:
                db.session.add(ExamLevel(name=level_name, tenant_id=tenant_id))
                added += 1
            else:
                duplicates += 1
                
    db.session.commit()
    return jsonify({'success': True, 'added': added, 'duplicates': duplicates})

@exams_basic_data_bp.route('/exams/api/add-subjects', methods=['POST'])
def add_subjects():
    """إضافة عدة مواد وربطها بمستوى معين"""
    tenant_id = session.get('tenant_id')
    data = request.json
    level_id = data.get('level_id')
    subjects = data.get('subjects', [])
    
    if not level_id:
        return jsonify({'success': False, 'message': 'لا بد من تحديد المستوى أولاً من القائمة'})
        
    added, duplicates = 0, 0
    
    for subj_name in subjects:
        subj_name = subj_name.strip()
        if subj_name:
            # هنا نفحص إذا كانت المادة مكررة في *نفس المستوى* داخل *نفس القسم*
            exists = ExamSubject.query.filter_by(name=subj_name, level_id=level_id, tenant_id=tenant_id).first()
            if not exists:
                db.session.add(ExamSubject(name=subj_name, level_id=level_id, tenant_id=tenant_id))
                added += 1
            else:
                duplicates += 1
                
    db.session.commit()
    return jsonify({'success': True, 'added': added, 'duplicates': duplicates})

# ==========================================
# 🔄 مسار سحب البيانات المشتركة من نظام التدريس (محدث ليدعم الإسناد عبر المفتاح)
# ==========================================
@exams_basic_data_bp.route('/exams/api/sync-from-teaching', methods=['POST'])
def sync_from_teaching():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({"error": "غير مصرح"}), 403
    
    added_profs, added_levels, added_subjects, added_assignments = 0, 0, 0, 0
    
    try:
        from app.database import Teacher, Level, Course, Setting
        
        # جلب الرموز لاستبعاد الأعمال الموجهة والتطبيقية
        td_setting = Setting.query.filter_by(key='symbol_td', tenant_id=tenant_id).first()
        tp_setting = Setting.query.filter_by(key='symbol_tp', tenant_id=tenant_id).first()
        sym_td = td_setting.value if td_setting and td_setting.value else "[أم]"
        sym_tp = tp_setting.value if tp_setting and tp_setting.value else "[أت]"

        # 1. استيراد الأساتذة
        for tp in Teacher.query.filter_by(tenant_id=tenant_id).all():
            if not ExamTeacher.query.filter_by(name=tp.name, tenant_id=tenant_id).first():
                db.session.add(ExamTeacher(name=tp.name, tenant_id=tenant_id))
                added_profs += 1
                
        # 2. استيراد المستويات
        for tl in Level.query.filter_by(tenant_id=tenant_id).all():
            if not ExamLevel.query.filter_by(name=tl.name, tenant_id=tenant_id).first():
                db.session.add(ExamLevel(name=tl.name, tenant_id=tenant_id))
                added_levels += 1
                
        db.session.commit()

        # 3. استيراد المواد (المحاضرات فقط) + 4. استيراد الإسناد
        for tc in Course.query.filter_by(tenant_id=tenant_id).all():
            if sym_td in tc.name or sym_tp in tc.name:
                continue 

            # ✨ التعديل الجذري: جلب الأستاذ عبر الحقل teacher_id مباشرة من قاعدة البيانات
            course_teachers = []
            if tc.teacher_id:
                teacher = Teacher.query.get(tc.teacher_id)
                if teacher:
                    course_teachers.append(teacher)

            for tl in tc.levels:
                exam_level = ExamLevel.query.filter_by(name=tl.name, tenant_id=tenant_id).first()
                if exam_level:
                    # إضافة المادة
                    exam_subject = ExamSubject.query.filter_by(name=tc.name, level_id=exam_level.id, tenant_id=tenant_id).first()
                    if not exam_subject:
                        exam_subject = ExamSubject(name=tc.name, level_id=exam_level.id, tenant_id=tenant_id)
                        db.session.add(exam_subject)
                        added_subjects += 1
                    
                    # إسناد المادة لأساتذتها فوراً
                    for tp in course_teachers:
                        exam_teacher = ExamTeacher.query.filter_by(name=tp.name, tenant_id=tenant_id).first()
                        if exam_teacher and exam_subject not in exam_teacher.subjects:
                            exam_teacher.subjects.append(exam_subject)
                            added_assignments += 1
                            
        db.session.commit()
        return jsonify({
            "success": True, 
            "added_profs": added_profs, 
            "added_levels": added_levels, 
            "added_subjects": added_subjects,
            "added_assignments": added_assignments
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)})