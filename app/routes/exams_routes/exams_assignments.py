from flask import Blueprint, request, jsonify, session
from app.database import db, ExamTeacher, ExamRoom, ExamLevel, ExamSubject

exams_assignments_bp = Blueprint('exams_assignments', __name__)

# ==========================================
# 👨‍🏫 أ. إسناد المواد للأساتذة (حراسة الامتحانات)
# ==========================================

@exams_assignments_bp.route('/exams/api/assignments/professors', methods=['GET'])
def get_professor_assignments():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({"error": "غير مصرح"}), 403

    teachers = ExamTeacher.query.filter_by(tenant_id=tenant_id).all()
    data = {}
    
    for t in teachers:
        data[t.id] = {
            'prof_id': t.id, 
            'prof_name': t.name, 
            'subjects': []
        }
        # بفضل SQLAlchemy يمكننا الوصول للمواد المرتبطة مباشرة كقائمة (List)
        for s in t.subjects:
            data[t.id]['subjects'].append({
                'subj_id': s.id,
                'subj_name': s.name,
                'level_name': s.level.name if s.level else "غير محدد"
            })
            
    # إرجاع القيم كقائمة (Array) ليتعرف عليها متصفح المستخدم
    return jsonify(list(data.values()))

@exams_assignments_bp.route('/exams/api/assignments/professors/<int:prof_id>/<int:subj_id>', methods=['POST'])
def assign_professor_subject(prof_id, subj_id):
    tenant_id = session.get('tenant_id')
    teacher = ExamTeacher.query.filter_by(id=prof_id, tenant_id=tenant_id).first()
    subject = ExamSubject.query.filter_by(id=subj_id, tenant_id=tenant_id).first()
    
    if teacher and subject and subject not in teacher.subjects:
        teacher.subjects.append(subject) # إضافة المادة للأستاذ بكلمة واحدة!
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False, 'message': 'تعذر الإسناد أو أن المادة مسندة مسبقاً'})

@exams_assignments_bp.route('/exams/api/assignments/professors/<int:prof_id>/<int:subj_id>', methods=['DELETE'])
def remove_professor_subject(prof_id, subj_id):
    tenant_id = session.get('tenant_id')
    teacher = ExamTeacher.query.filter_by(id=prof_id, tenant_id=tenant_id).first()
    subject = ExamSubject.query.filter_by(id=subj_id, tenant_id=tenant_id).first()
    
    if teacher and subject in teacher.subjects:
        teacher.subjects.remove(subject) # حذف المادة من الأستاذ بكلمة واحدة!
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False})

@exams_assignments_bp.route('/exams/api/assignments/professors/bulk', methods=['POST'])
def bulk_update_professor_subjects():
    tenant_id = session.get('tenant_id')
    data = request.json # تستقبل: { "prof_id": [subj_id1, subj_id2] }
    
    for prof_id_str, subj_ids in data.items():
        teacher = ExamTeacher.query.filter_by(id=int(prof_id_str), tenant_id=tenant_id).first()
        if teacher:
            # جلب المواد الجديدة
            subjects = ExamSubject.query.filter(ExamSubject.id.in_(subj_ids), ExamSubject.tenant_id == tenant_id).all()
            # استبدال القديم بالجديد، والمحرك سيتكفل بحذف وتنظيف العلاقات القديمة!
            teacher.subjects = subjects 
            
    db.session.commit()
    return jsonify({'success': True, 'message': 'تم حفظ الإسنادات بنجاح'})

# ==========================================
# 🏢 ب. إسناد القاعات للمستويات (للامتحانات)
# ==========================================

@exams_assignments_bp.route('/exams/api/assignments/levels', methods=['GET'])
def get_level_assignments():
    tenant_id = session.get('tenant_id')
    levels = ExamLevel.query.filter_by(tenant_id=tenant_id).all()
    
    data = {}
    for l in levels:
        data[l.id] = {
            'level_id': l.id,
            'level_name': l.name,
            'halls': [{'hall_id': r.id, 'hall_name': r.name, 'hall_type': r.type} for r in l.rooms]
        }
        
    return jsonify(list(data.values()))

@exams_assignments_bp.route('/exams/api/assignments/levels/<int:level_id>/<int:hall_id>', methods=['POST'])
def assign_level_hall(level_id, hall_id):
    tenant_id = session.get('tenant_id')
    level = ExamLevel.query.filter_by(id=level_id, tenant_id=tenant_id).first()
    room = ExamRoom.query.filter_by(id=hall_id, tenant_id=tenant_id).first()
    
    if level and room and room not in level.rooms:
        level.rooms.append(room)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False})

@exams_assignments_bp.route('/exams/api/assignments/levels/<int:level_id>/<int:hall_id>', methods=['DELETE'])
def remove_level_hall(level_id, hall_id):
    tenant_id = session.get('tenant_id')
    level = ExamLevel.query.filter_by(id=level_id, tenant_id=tenant_id).first()
    room = ExamRoom.query.filter_by(id=hall_id, tenant_id=tenant_id).first()
    
    if level and room in level.rooms:
        level.rooms.remove(room)
        db.session.commit()
        return jsonify({'success': True})
    return jsonify({'success': False})

@exams_assignments_bp.route('/exams/api/assignments/levels/bulk', methods=['POST'])
def bulk_update_level_halls():
    tenant_id = session.get('tenant_id')
    data = request.json # تستقبل: { "level_id": [hall_id1, hall_id2] }
    
    for level_id_str, hall_ids in data.items():
        level = ExamLevel.query.filter_by(id=int(level_id_str), tenant_id=tenant_id).first()
        if level:
            rooms = ExamRoom.query.filter(ExamRoom.id.in_(hall_ids), ExamRoom.tenant_id == tenant_id).all()
            level.rooms = rooms
            
    db.session.commit()
    return jsonify({'success': True, 'message': 'تم حفظ قاعات المستويات بنجاح'})