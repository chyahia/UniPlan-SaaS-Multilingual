from flask import Blueprint, jsonify, request, session
from app.database import db, Teacher, Room, Level, Course, CourseNature
from flask_babel import _  # ✨ استيراد دالة الترجمة

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
        return jsonify({"success": False, "error": _("الاسم مطلوب")}), 400 # ✨ ترجمة
        
    room = Room.query.filter_by(id=id, tenant_id=tenant_id).first()
    if room:
        room.name = new_name
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "error": _("القاعة غير موجودة")}), 404 # ✨ ترجمة

@manage_data_bp.route('/api/courses/bulk-nature', methods=['POST'])
def update_course_nature_bulk():
    tenant_id = session.get('tenant_id')
    course_ids = request.json.get('course_ids', [])
    new_nature = request.json.get('course_nature')
    
    if not course_ids or not new_nature:
        return jsonify({"success": False, "error": _("بيانات غير مكتملة")}), 400 # ✨ ترجمة

    # جلب رموز الطبيعة الخاصة بهذا القسم فقط
    natures = CourseNature.query.filter_by(tenant_id=tenant_id).all()
    nature_dict = {n.name: n.symbol for n in natures}

    courses = Course.query.filter(Course.id.in_(course_ids), Course.tenant_id == tenant_id).all()
    for crs in courses:
        updated_name = adjust_course_name_by_nature(crs.name, new_nature, nature_dict)
        crs.name = updated_name
        crs.course_nature = new_nature
        
    db.session.commit()
    # ✨ ترجمة مع ضبط المتغير
    return jsonify({"success": True, "message": _("تم تعديل طبيعة {count} مواد بنجاح!").format(count=len(courses))})

@manage_data_bp.route('/api/courses/bulk-properties', methods=['POST'])
def update_course_properties_bulk():
    tenant_id = session.get('tenant_id')
    data = request.json
    course_ids = data.get('course_ids', [])
    new_division = data.get('division')
    new_specialization = data.get('specialization')
    new_nature = data.get('course_nature')

    if not course_ids:
        return jsonify({"success": False, "error": _("لم يتم تحديد أي مواد")}), 400 # ✨ ترجمة
        
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
        # ✨ ترجمة مع ضبط المتغير
        return jsonify({"success": True, "message": _("تم تعديل {count} مواد بنجاح!").format(count=len(courses))})
        
    except Exception as e:
        db.session.rollback()
        # ✨ تغليف رسالة الخطأ لتتوافق مع الترجمة
        return jsonify({"success": False, "error": _("حدث خطأ: {error}").format(error=str(e))}), 500
    
# ==============================================================
# ✏️ مسارات التعديل المباشر (PUT) الفردية (معزولة بـ tenant_id)
# ==============================================================

@manage_data_bp.route('/api/teachers/<int:id>', methods=['PUT'])
def edit_teacher(id):
    tenant_id = session.get('tenant_id')
    data = request.get_json()
    new_name = data.get('name')
    
    teacher = Teacher.query.filter_by(id=id, tenant_id=tenant_id).first()
    if not teacher:
        return jsonify({"success": False, "error": _("الأستاذ غير موجود")}), 404 # ✨ ترجمة
        
    if new_name:
        teacher.name = new_name.strip()
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "error": _("الاسم مطلوب")}), 400 # ✨ ترجمة

@manage_data_bp.route('/api/rooms/<int:id>', methods=['PUT'])
def edit_room(id):
    tenant_id = session.get('tenant_id')
    data = request.get_json()
    new_name = data.get('name')
    new_type = data.get('type')
    
    room = Room.query.filter_by(id=id, tenant_id=tenant_id).first()
    if not room:
        return jsonify({"success": False, "error": _("القاعة غير موجودة")}), 404 # ✨ ترجمة
        
    if new_name:
        room.name = new_name.strip()
        if new_type:
            room.type = new_type.strip()
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "error": _("الاسم مطلوب")}), 400 # ✨ ترجمة

@manage_data_bp.route('/api/levels/<string:name>', methods=['PUT'])
def edit_level(name):
    tenant_id = session.get('tenant_id')
    data = request.get_json()
    new_name = data.get('name')
    
    level = Level.query.filter_by(name=name, tenant_id=tenant_id).first()
    if not level:
        return jsonify({"success": False, "error": _("المستوى غير موجود")}), 404 # ✨ ترجمة
        
    if new_name:
        level.name = new_name.strip()
        db.session.commit()
        return jsonify({"success": True})
    return jsonify({"success": False, "error": _("الاسم مطلوب")}), 400 # ✨ ترجمة

@manage_data_bp.route('/api/courses/<int:id>', methods=['PUT'])
def edit_course(id):
    tenant_id = session.get('tenant_id')
    data = request.get_json()
    
    course = Course.query.filter_by(id=id, tenant_id=tenant_id).first()
    if not course:
        return jsonify({"success": False, "error": _("المادة غير موجودة")}), 404 # ✨ ترجمة
        
    try:
        if 'name' in data and data['name']: 
            course.name = data['name'].strip()
        if 'room_type' in data: 
            course.room_type = data['room_type']
        if 'division' in data: 
            course.division = data['division']
        if 'specialization' in data: 
            course.specialization = data['specialization']
        if 'course_nature' in data: 
            course.course_nature = data['course_nature']
        
        # تحديث المستويات المرتبطة بالمادة (Many-to-Many)
        if 'levels' in data and isinstance(data['levels'], list):
            level_names = data['levels']
            new_levels = Level.query.filter(Level.name.in_(level_names), Level.tenant_id == tenant_id).all()
            course.levels = new_levels
            
        db.session.commit()
        return jsonify({"success": True})
    except Exception as e:
        db.session.rollback()
        # ✨ تغليف رسالة الخطأ المتغيرة
        return jsonify({"success": False, "error": _("حدث خطأ: {error}").format(error=str(e))}), 500