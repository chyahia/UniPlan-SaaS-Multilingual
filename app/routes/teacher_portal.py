from flask import Blueprint, render_template, session, redirect, url_for, jsonify, request
from app.database import db, Teacher, Course, Setting, TeacherRequest
import json

teacher_portal_bp = Blueprint('teacher_portal', __name__)

@teacher_portal_bp.route('/teacher')
def teacher_dashboard():
    if session.get('role') != 'teacher':
        return redirect(url_for('auth.login'))
    return render_template('teacher_portal.html')

@teacher_portal_bp.route('/api/teacher/data')
def get_teacher_data():
    if session.get('role') != 'teacher': return jsonify({"error": "غير مصرح"}), 403
    
    teacher_id = session.get('teacher_id')
    tenant_id = session.get('tenant_id')
    
    teacher = Teacher.query.filter_by(id=teacher_id, tenant_id=tenant_id).first()
    if not teacher: return jsonify({"error": "الأستاذ غير موجود"}), 404
        
    teacher_name = teacher.name
    show_assigned = getattr(teacher, 'show_assigned', 0)

    # جلب جميع مواد القسم
    courses = Course.query.filter_by(tenant_id=tenant_id).all()
    
    # 🛠️ الإصلاح 1: تصفية المواد لتظهر فقط (المواد غير المسندة لأي أستاذ)
    grouped_courses = {}
    for c in courses:
        if c.teacher_id is None:  # هذا الشرط يمنع ظهور المواد المحجوزة
            levels_str = "، ".join([l.name for l in c.levels])
            if levels_str not in grouped_courses:
                grouped_courses[levels_str] = []
            grouped_courses[levels_str].append({
                "id": c.id, "name": c.name, "room_type": c.room_type, "teacher_id": c.teacher_id
            })

    struct_setting = Setting.query.filter_by(key='schedule_structure', tenant_id=tenant_id).first()
    struct = json.loads(struct_setting.value) if struct_setting and struct_setting.value else []
    days = [d['name'] for d in struct]

    req = TeacherRequest.query.filter_by(teacher_id=teacher_id, tenant_id=tenant_id).first()

    pub_setting = Setting.query.filter_by(key='is_published', tenant_id=tenant_id).first()
    is_published = pub_setting.value == '1' if pub_setting else False
    
    lock_setting = Setting.query.filter_by(key='requests_locked', tenant_id=tenant_id).first()
    requests_locked = lock_setting.value == 'true' if lock_setting else False

    my_schedule = {}
    sched_setting = Setting.query.filter_by(key='schedule_result', tenant_id=tenant_id).first()
    
    if is_published and sched_setting and sched_setting.value:
        full_sched = json.loads(sched_setting.value)
        my_schedule = {day: [] for day in days}
        for lvl, grid in full_sched.items():
            for d_idx, day_slots in enumerate(grid):
                if d_idx >= len(days): continue
                day_name = days[d_idx]
                for s_idx, slot_lectures in enumerate(day_slots):
                    for lec in slot_lectures:
                        if lec.get('teacher_name') == teacher_name:
                            my_schedule[day_name].append({
                                "slot_index": s_idx, "name": lec.get('name'), "room": lec.get('room'), "level": lvl
                            })

    # 🛠️ الإصلاح 2: تغيير مفتاح "levels" إلى "level" ليتعرف عليه الجافاسكربت
    assigned_courses = [{"name": c.name, "level": "، ".join([l.name for l in c.levels])} for c in courses if c.teacher_id == teacher_id]
    
    cond_setting = Setting.query.filter_by(key='schedule_conditions', tenant_id=tenant_id).first()
    cond = json.loads(cond_setting.value) if cond_setting and cond_setting.value else {}
    max_sess_global = int(cond.get('global', {}).get('max_slots', 10))
    max_courses_count = max_sess_global
    
    teacher_rules = cond.get('teacher_rules', {}).get(str(teacher_id))
    if teacher_rules and teacher_rules.get('limits') and 'always_s2_e4' in teacher_rules['limits']:
        max_courses_count = 12

    return jsonify({
        "teacher_name": teacher_name,
        "max_courses_count": max_courses_count,
        "grouped_courses": grouped_courses,
        "days": days,
        "structure": struct,          
        "is_published": is_published, 
        "requests_locked": requests_locked,
        "my_schedule": my_schedule,   
        "show_assigned": bool(show_assigned),
        "assigned_courses": assigned_courses,
        "assigned_count": len(assigned_courses), # 🛠️ الإصلاح 3: إضافة العداد المفقود
        "request": {
            "courses": json.loads(req.requested_courses) if req and req.requested_courses else [],
            "days": json.loads(req.requested_days) if req and req.requested_days else [],
            "has_submitted": True if req else False
        }
    })

@teacher_portal_bp.route('/api/teacher/submit', methods=['POST'])
def submit_request():
    if session.get('role') != 'teacher': return jsonify({"error": "غير مصرح"}), 403
    
    teacher_id = session.get('teacher_id')
    tenant_id = session.get('tenant_id')
    data = request.json
    
    courses_json = json.dumps(data.get('courses', []))
    days_json = json.dumps(data.get('days', []))
    
    req = TeacherRequest.query.filter_by(teacher_id=teacher_id, tenant_id=tenant_id).first()
    if req:
        req.requested_courses = courses_json
        req.requested_days = days_json
        req.status = 'قيد المراجعة'
    else:
        req = TeacherRequest(teacher_id=teacher_id, requested_courses=courses_json, requested_days=days_json, tenant_id=tenant_id)
        db.session.add(req)
        
    db.session.commit()
    return jsonify({"success": True, "message": "تم حفظ الرغبات بنجاح"})