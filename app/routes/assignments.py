from flask import Blueprint, jsonify, request, session
from app.database import db, Teacher, Course
from flask_babel import _  # ✨ استيراد دالة الترجمة

assignments_bp = Blueprint('assignments', __name__)

# جلب كافة الأساتذة والمواد مع حالة الإسناد الحالية
@assignments_bp.route('/api/assignments/data', methods=['GET'])
def get_assignments_data():
    tenant_id = session.get('tenant_id')
    
    teachers = Teacher.query.filter_by(tenant_id=tenant_id).all()
    teachers_data = [{"id": t.id, "name": t.name} for t in teachers]
    
    courses = Course.query.filter_by(tenant_id=tenant_id).all()
    courses_data = []
    
    for c in courses:
        levels_str = _("، ").join([l.name for l in c.levels]) # ✨ ترجمة الفاصلة
        
        # التصحيح هنا: التحقق من وجود الأستاذ فعلياً
        teacher_name = None
        if c.teacher_id:
            teacher_obj = next((t for t in teachers if t.id == c.teacher_id), None)
            if teacher_obj:
                teacher_name = teacher_obj.name
            else:
                # إذا كان teacher_id موجوداً في المادة لكنه محذوف من جدول الأساتذة
                c.teacher_id = None
                db.session.commit()
        
        courses_data.append({
            "id": c.id,
            "name": c.name,
            "room_type": c.room_type,
            "teacher_id": c.teacher_id, # سيصبح None تلقائياً إذا تم حذفه
            "teacher_name": teacher_name, # سيكون None إذا تم حذفه
            "levels": levels_str
        })
        
    return jsonify({'teachers': teachers_data, 'courses': courses_data})

# تخصيص (إسناد) مجموعة مواد لأستاذ
@assignments_bp.route('/api/assignments/assign', methods=['POST'])
def assign_courses():
    tenant_id = session.get('tenant_id')
    data = request.json
    teacher_id = data.get('teacher_id')
    course_ids = data.get('course_ids', [])
    
    if not teacher_id or not course_ids:
        return jsonify({'error': _('بيانات مفقودة')}), 400 # ✨ ترجمة نص الخطأ
        
    # فلترة المواد بـ tenant_id لضمان أن رئيس القسم لا يسند مواد أقسام أخرى
    courses = Course.query.filter(Course.id.in_(course_ids), Course.tenant_id == tenant_id).all()
    
    for course in courses:
        course.teacher_id = teacher_id
        
    db.session.commit()
    return jsonify({'success': True})

# إلغاء إسناد مادة واحدة (للنقر المزدوج على المادة)
@assignments_bp.route('/api/assignments/unassign_course/<int:course_id>', methods=['POST'])
def unassign_course(course_id):
    tenant_id = session.get('tenant_id')
    
    course = Course.query.filter_by(id=course_id, tenant_id=tenant_id).first()
    if course:
        course.teacher_id = None
        db.session.commit()
        
    return jsonify({'success': True})