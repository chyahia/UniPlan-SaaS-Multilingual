# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from flask import Blueprint, request, jsonify, session
from app.database import db, Teacher, Room, Level, Course, CourseNature
from flask_babel import _  # ✨ استيراد دالة الترجمة

basic_data_bp = Blueprint('basic_data', __name__)

# ====== مسارات جلب البيانات (GET) ======
@basic_data_bp.route('/teachers', methods=['GET'])
def get_teachers():
    tenant_id = session.get('tenant_id')
    teachers = Teacher.query.filter_by(tenant_id=tenant_id).all()
    return jsonify([{"id": t.id, "name": t.name} for t in teachers])

@basic_data_bp.route('/rooms', methods=['GET'])
def get_rooms():
    tenant_id = session.get('tenant_id')
    rooms = Room.query.filter_by(tenant_id=tenant_id).all()
    return jsonify([{"id": r.id, "name": r.name, "type": r.type} for r in rooms])

@basic_data_bp.route('/api/levels', methods=['GET'])
def get_levels():
    tenant_id = session.get('tenant_id')
    levels = Level.query.filter_by(tenant_id=tenant_id).order_by(Level.name).all()
    return jsonify([lvl.name for lvl in levels])

@basic_data_bp.route('/api/courses', methods=['GET'])
def get_courses():
    tenant_id = session.get('tenant_id')
    courses = Course.query.filter_by(tenant_id=tenant_id).all()
    result = []
    for c in courses:
        levels_str = _("، ").join([l.name for l in c.levels]) # ✨ ترجمة الفاصلة
        result.append({
            "id": c.id,
            "name": c.name,
            "room_type": c.room_type,
            "division": c.division,
            "specialization": c.specialization,
            "course_nature": c.course_nature,
            "levels": levels_str
        })
    return jsonify(result)

# ====== مسارات إضافة البيانات (POST) ======
@basic_data_bp.route('/api/teachers', methods=['POST'])
def add_teachers():
    names = request.json.get('names', [])
    tenant_id = session.get('tenant_id')
    if not names: return jsonify({"error": _("قائمة الأساتذة فارغة")}), 400 # ✨ ترجمة
    
    added = 0
    for name in names:
        # التأكد من عدم تكرار الأستاذ داخل نفس القسم
        if not Teacher.query.filter_by(name=name, tenant_id=tenant_id).first():
            new_teacher = Teacher(name=name, tenant_id=tenant_id)
            db.session.add(new_teacher)
            added += 1
            
    db.session.commit()
    # ✨ ترجمة متغيرات النص
    return jsonify({"success": True, "message": _("تمت إضافة {count} أساتذة.").format(count=added)})

@basic_data_bp.route('/api/rooms', methods=['POST'])
def add_rooms():
    names = request.json.get('names', [])
    room_type = request.json.get('type')
    tenant_id = session.get('tenant_id')
    if not names or not room_type: return jsonify({"error": _("البيانات غير مكتملة")}), 400 # ✨ ترجمة
    
    added = 0
    for name in names:
        if not Room.query.filter_by(name=name, tenant_id=tenant_id).first():
            new_room = Room(name=name, type=room_type, tenant_id=tenant_id)
            db.session.add(new_room)
            added += 1
            
    db.session.commit()
    return jsonify({"success": True, "message": _("تمت إضافة {count} قاعات.").format(count=added)})

@basic_data_bp.route('/api/levels', methods=['POST'])
def add_levels():
    levels = request.json.get('levels', [])
    tenant_id = session.get('tenant_id')
    if not levels: return jsonify({"error": _("قائمة المستويات فارغة")}), 400 # ✨ ترجمة
    
    added = 0
    for level_name in levels:
        if not Level.query.filter_by(name=level_name, tenant_id=tenant_id).first():
            new_level = Level(name=level_name, tenant_id=tenant_id)
            db.session.add(new_level)
            added += 1
            
    db.session.commit()
    return jsonify({"success": True, "message": _("تمت إضافة {count} مستويات.").format(count=added)})

@basic_data_bp.route('/api/students/bulk', methods=['POST'])
def add_courses_bulk():
    courses = request.json
    tenant_id = session.get('tenant_id')
    if not courses: return jsonify({"error": _("لا توجد بيانات")}), 400 # ✨ ترجمة
    
    added = 0
    for c in courses:
        new_course = Course(
            name=c['name'],
            room_type=c['room_type'],
            division=c.get('division', ''),
            specialization=c.get('specialization', ''),
            course_nature=c.get('course_nature', 'أعمال موجهة'), # تبقى كما هي لأنها قيمة افتراضية لقاعدة البيانات
            tenant_id=tenant_id
        )
        
        # ربط المستويات بالمقرر
        for level_name in c.get('levels', []):
            level_obj = Level.query.filter_by(name=level_name, tenant_id=tenant_id).first()
            if level_obj:
                new_course.levels.append(level_obj)
                
        db.session.add(new_course)
        added += 1
        
    db.session.commit()
    return jsonify({"success": True, "message": _("تمت إضافة {count} مقررات بنجاح.").format(count=added)})

# ====== مسارات الرموز البيداغوجية الديناميكية ======
@basic_data_bp.route('/api/course_natures', methods=['GET'])
def get_course_natures():
    tenant_id = session.get('tenant_id')
    natures = CourseNature.query.filter_by(tenant_id=tenant_id).order_by(CourseNature.id).all()
    return jsonify([{"id": n.id, "name": n.name, "symbol": n.symbol} for n in natures])

@basic_data_bp.route('/api/course_natures', methods=['POST'])
def update_course_nature():
    data = request.json
    tenant_id = session.get('tenant_id')
    nature = CourseNature.query.filter_by(name=data['name'], tenant_id=tenant_id).first()
    
    if nature:
        nature.symbol = data['symbol']
    else:
        # في حال لم تكن مسجلة مسبقاً، ننشئها
        new_nature = CourseNature(name=data['name'], symbol=data['symbol'], tenant_id=tenant_id)
        db.session.add(new_nature)
        
    db.session.commit()
    return jsonify({"success": True})

@basic_data_bp.route('/api/course_natures/<int:id>', methods=['DELETE'])
def delete_course_nature(id):
    tenant_id = session.get('tenant_id')
    nature = CourseNature.query.filter_by(id=id, tenant_id=tenant_id).first()
    if nature:
        db.session.delete(nature)
        db.session.commit()
    return jsonify({"success": True})