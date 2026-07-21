from flask import Blueprint, request, jsonify, session
from app.database import db, ExamTeacher, ExamRoom, ExamLevel, ExamSubject
from flask_babel import _

exams_assignments_bp = Blueprint('exams_assignments', __name__)

# ==========================================
# 👨‍🏫 أ. إسناد المواد للأساتذة (حراسة الامتحانات)
# ==========================================

@exams_assignments_bp.route('/exams/api/assignments/professors', methods=['GET'])
def get_professor_assignments():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({"error": _("غير مصرح")}), 403

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
            # ✨ التعديل: قراءة قائمة المستويات ودمجها بدلاً من مستوى واحد
            level_names = " + ".join([l.name for l in s.levels]) if hasattr(s, 'levels') and s.levels else _("غير محدد")
            data[t.id]['subjects'].append({
                'subj_id': s.id,
                'subj_name': s.name,
                'level_name': level_names
            })
            
    # إرجاع القيم كقائمة (Array) ليتعرف عليها متصفح المستخدم
    return jsonify(list(data.values()))

@exams_assignments_bp.route('/exams/api/assignments/unassigned-subjects', methods=['GET'])
def get_unassigned_subjects():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({"error": _("غير مصرح")}), 403

    all_subjects = ExamSubject.query.filter_by(tenant_id=tenant_id).all()
    unassigned_subjects = [s for s in all_subjects if not s.teachers]
    
    data = []
    for s in unassigned_subjects:
        # ✨ التعديل: قراءة قائمة المستويات ودمجها
        level_names = " + ".join([l.name for l in s.levels]) if hasattr(s, 'levels') and s.levels else _("غير محدد")
        data.append({
            'subj_id': s.id,
            'subj_name': s.name,
            'level_name': level_names
        })
    return jsonify(data)

@exams_assignments_bp.route('/exams/api/assignments/assign', methods=['POST'])
def assign_subject_to_professor():
    tenant_id = session.get('tenant_id')
    data = request.json
    prof_id = data.get('prof_id')
    subj_ids = data.get('subj_ids', []) # يدعم تعيين عدة مواد دفعة واحدة
    
    teacher = ExamTeacher.query.filter_by(id=prof_id, tenant_id=tenant_id).first()
    if not teacher: return jsonify({'success': False, 'message': _('الأستاذ غير موجود')})

    added = 0
    for subj_id in subj_ids:
        subject = ExamSubject.query.filter_by(id=subj_id, tenant_id=tenant_id).first()
        if subject and subject not in teacher.subjects:
            teacher.subjects.append(subject)
            added += 1
            
    db.session.commit()
    return jsonify({'success': True, 'added': added})

@exams_assignments_bp.route('/exams/api/assignments/unassign', methods=['POST'])
def unassign_subject_from_professor():
    tenant_id = session.get('tenant_id')
    data = request.json
    prof_id = data.get('prof_id')
    subj_ids = data.get('subj_ids', [])
    
    teacher = ExamTeacher.query.filter_by(id=prof_id, tenant_id=tenant_id).first()
    if not teacher: return jsonify({'success': False})

    removed = 0
    for subj_id in subj_ids:
        subject = ExamSubject.query.filter_by(id=subj_id, tenant_id=tenant_id).first()
        if subject and subject in teacher.subjects:
            teacher.subjects.remove(subject)
            removed += 1
            
    db.session.commit()
    return jsonify({'success': True, 'removed': removed})

# ==========================================
# 🏫 ب. إسناد القاعات للمستويات
# ==========================================

@exams_assignments_bp.route('/exams/api/assignments/levels', methods=['GET'])
def get_level_halls():
    tenant_id = session.get('tenant_id')
    levels = ExamLevel.query.filter_by(tenant_id=tenant_id).all()
    halls = ExamRoom.query.filter_by(tenant_id=tenant_id).order_by(ExamRoom.type, ExamRoom.name).all()
    
    data = {
        'levels': [],
        'all_halls': [{'id': h.id, 'name': h.name, 'type': h.type} for h in halls]
    }
    
    for l in levels:
        data['levels'].append({
            'id': l.id,
            'name': l.name,
            'assigned_halls': [{'id': h.id, 'name': h.name, 'type': h.type} for h in l.rooms]
        })
        
    return jsonify(data)

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
        level_id = int(level_id_str)
        level = ExamLevel.query.filter_by(id=level_id, tenant_id=tenant_id).first()
        if not level: continue
        
        level.rooms.clear()
        
        rooms = ExamRoom.query.filter(ExamRoom.id.in_(hall_ids), ExamRoom.tenant_id == tenant_id).all()
        level.rooms.extend(rooms)
        
    db.session.commit()
    return jsonify({'success': True})