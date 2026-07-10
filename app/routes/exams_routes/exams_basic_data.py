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
    """جلب قائمة كل المواد مع دمج أسماء مستوياتها بذكاء"""
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify([])
    
    subjects = ExamSubject.query.filter_by(tenant_id=tenant_id).order_by(ExamSubject.name).all()
    
    data = []
    for s in subjects:
        # ✨ التعديل: جلب كل المستويات ودمجها بعلامة +
        level_names = " + ".join([l.name for l in s.levels]) if hasattr(s, 'levels') and s.levels else "غير محدد"
        data.append({
            "id": s.id, 
            "name": s.name, 
            "level_name": level_names
        })
    return jsonify(data)

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
    """إضافة عدة مواد وربطها بعدة مستويات"""
    tenant_id = session.get('tenant_id')
    data = request.json
    # ✨ التعديل: استقبال قائمة المستويات بدلاً من مستوى واحد
    level_ids = data.get('level_ids', [])
    subjects = data.get('subjects', [])
    
    if not level_ids:
        return jsonify({'success': False, 'message': 'لا بد من تحديد مستوى واحد على الأقل من القائمة'})
        
    levels = ExamLevel.query.filter(ExamLevel.id.in_(level_ids), ExamLevel.tenant_id == tenant_id).all()
    if not levels: 
        return jsonify({'success': False, 'message': 'المستويات المحددة غير موجودة'})

    added, duplicates = 0, 0
    
    for subj_name in subjects:
        subj_name = subj_name.strip()
        if subj_name:
            # البحث عن المادة في القسم بأكمله
            existing_subject = ExamSubject.query.filter_by(name=subj_name, tenant_id=tenant_id).first()
            if existing_subject:
                # إذا كانت موجودة، نقوم بإضافة المستويات الجديدة لها
                for lvl in levels:
                    if lvl not in existing_subject.levels:
                        existing_subject.levels.append(lvl)
                duplicates += 1
            else:
                # إنشاء مادة جديدة وربطها بالمستويات المحددة
                new_subject = ExamSubject(name=subj_name, tenant_id=tenant_id)
                new_subject.levels.extend(levels)
                db.session.add(new_subject)
                added += 1
                
    db.session.commit()
    return jsonify({'success': True, 'added': added, 'duplicates': duplicates})

# ==========================================
# 🔄 مسار سحب البيانات المشتركة من نظام التدريس (محدث ومحافظ على المنطق الخاص بك)
# ==========================================
@exams_basic_data_bp.route('/exams/api/sync-from-teaching', methods=['POST'])
def sync_from_teaching():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({"error": "غير مصرح"}), 403
    
    added_profs, added_levels, added_subjects, added_assignments = 0, 0, 0, 0
    
    try:
        from app.database import Teacher, Level, Course, Setting
        
        # ✨ تم الحفاظ على: جلب الرموز لاستبعاد الأعمال الموجهة والتطبيقية
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
            # ✨ تم الحفاظ على: فلترة وتجاهل أعمال التوجيه والتطبيق
            if sym_td in tc.name or sym_tp in tc.name:
                continue 

            # ✨ تم الحفاظ على: جلب الأستاذ عبر الحقل teacher_id مباشرة من قاعدة البيانات
            course_teachers = []
            if tc.teacher_id:
                teacher = Teacher.query.get(tc.teacher_id)
                if teacher:
                    course_teachers.append(teacher)

            # ✨ التعديل الجديد (Many-to-Many): جمع المستويات الخاصة بهذه المادة
            exam_levels_for_this_subject = []
            for tl in tc.levels:
                exam_level = ExamLevel.query.filter_by(name=tl.name, tenant_id=tenant_id).first()
                if exam_level:
                    exam_levels_for_this_subject.append(exam_level)
            
            if exam_levels_for_this_subject:
                # البحث عن المادة
                exam_subject = ExamSubject.query.filter_by(name=tc.name, tenant_id=tenant_id).first()
                if not exam_subject:
                    exam_subject = ExamSubject(name=tc.name, tenant_id=tenant_id)
                    db.session.add(exam_subject)
                    added_subjects += 1
                
                # ربط المادة بمستوياتها
                for lvl in exam_levels_for_this_subject:
                    if lvl not in exam_subject.levels:
                        exam_subject.levels.append(lvl)
                
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