from flask import Blueprint, jsonify, request, session
from app.database import db, Teacher, Room, Level, Course, CourseNature

manage_data_bp = Blueprint('manage_data', __name__)

def adjust_course_name_by_nature(name, nature, nature_dict):
    """دالة ديناميكية لتحديث القوسين في نهاية اسم المادة بناءً على طبيعتها من قاعدة البيانات"""
    if not nature or not name: return name
    
    # تنظيف الاسم من أي رمز بيداغوجي مسجل مسبقاً (ديناميكياً)
    clean_name = name
    for symbol in nature_dict.values():
        clean_name = clean_name.replace(f" {symbol}", "").replace(symbol, "").strip()
    
    # إضافة الرمز الجديد
    new_symbol = nature_dict.get(nature, "")
    if new_symbol:
        return f"{clean_name} {new_symbol}"
    return clean_name

# ====== مسارات الحذف (معزولة بـ tenant_id) ======

@manage_data_bp.route('/api/teachers/<int:id>', methods=['DELETE'])
def delete_teacher(id):
    tenant_id = session.get('tenant_id')
    teacher = Teacher.query.filter_by(id=id, tenant_id=tenant_id).first()
    if teacher:
        db.session.delete(teacher)
        db.session.commit()
    return jsonify({"success": True})

@manage_data_bp.route('/api/rooms/<int:id>', methods=['DELETE'])
def delete_room(id):
    tenant_id = session.get('tenant_id')
    room = Room.query.filter_by(id=id, tenant_id=tenant_id).first()
    if room:
        db.session.delete(room)
        db.session.commit()
    return jsonify({"success": True})

@manage_data_bp.route('/api/levels/<string:name>', methods=['DELETE'])
def delete_level(name):
    tenant_id = session.get('tenant_id')
    level = Level.query.filter_by(name=name, tenant_id=tenant_id).first()
    if level:
        db.session.delete(level)
        db.session.commit()
    return jsonify({"success": True})

@manage_data_bp.route('/api/courses/<int:id>', methods=['DELETE'])
def delete_course(id):
    tenant_id = session.get('tenant_id')
    course = Course.query.filter_by(id=id, tenant_id=tenant_id).first()
    if course:
        db.session.delete(course)
        db.session.commit()
    return jsonify({"success": True})

# ====== مسارات التعديل (معزولة بـ tenant_id) ======

@manage_data_bp.route('/api/rooms/rename/<int:id>', methods=['POST'])
def rename_room(id):
    tenant_id = session.get('tenant_id')
    new_name = request.json.get('name')
    if not new_name:
        return jsonify({"success": False, "error": "الاسم مطلوب"}), 400
        
    room = Room.query.filter_by(id=id, tenant_id=tenant_id).first()
    if room:
        room.name = new_name
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "error": "القاعة غير موجودة"}), 404

@manage_data_bp.route('/api/courses/bulk-nature', methods=['POST'])
def update_course_nature_bulk():
    tenant_id = session.get('tenant_id')
    course_ids = request.json.get('course_ids', [])
    new_nature = request.json.get('course_nature')
    
    if not course_ids or not new_nature:
        return jsonify({"success": False, "error": "بيانات غير مكتملة"}), 400

    # جلب رموز الطبيعة الخاصة بهذا القسم فقط
    natures = CourseNature.query.filter_by(tenant_id=tenant_id).all()
    nature_dict = {n.name: n.symbol for n in natures}

    courses = Course.query.filter(Course.id.in_(course_ids), Course.tenant_id == tenant_id).all()
    for crs in courses:
        updated_name = adjust_course_name_by_nature(crs.name, new_nature, nature_dict)
        crs.name = updated_name
        crs.course_nature = new_nature
        
    db.session.commit()
    return jsonify({"success": True, "message": f"تم تعديل طبيعة {len(courses)} مواد بنجاح!"})

@manage_data_bp.route('/api/courses/bulk-properties', methods=['POST'])
def update_course_properties_bulk():
    tenant_id = session.get('tenant_id')
    data = request.json
    course_ids = data.get('course_ids', [])
    new_division = data.get('division')
    new_specialization = data.get('specialization')
    new_nature = data.get('course_nature')

    if not course_ids:
        return jsonify({"success": False, "error": "لم يتم تحديد أي مواد"}), 400
        
    try:
        courses = Course.query.filter(Course.id.in_(course_ids), Course.tenant_id == tenant_id).all()
        
        # إذا تم طلب تغيير طبيعة المادة، نجلب القاموس أولاً لتحديث الاسم
        if new_nature is not None:
            natures = CourseNature.query.filter_by(tenant_id=tenant_id).all()
            nature_dict = {n.name: n.symbol for n in natures}
            
            for crs in courses:
                updated_name = adjust_course_name_by_nature(crs.name, new_nature, nature_dict)
                crs.name = updated_name
                crs.course_nature = new_nature
                
        # تحديث الشعبة والتخصص إن وجدا
        for crs in courses:
            if new_division is not None:
                crs.division = new_division
            if new_specialization is not None:
                crs.specialization = new_specialization
                
        db.session.commit()
        return jsonify({"success": True, "message": f"تم تعديل {len(courses)} مواد بنجاح!"})
        
    except Exception as e:
        db.session.rollback()
        return jsonify({"success": False, "error": str(e)}), 500