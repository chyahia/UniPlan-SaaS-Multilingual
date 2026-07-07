from flask import Blueprint, request, jsonify, session
from app.database import db, ExamTeacher, ExamRoom, ExamLevel, ExamSubject

exams_manage_data_bp = Blueprint('exams_manage_data', __name__)

# ==========================================
# 🗑️ دوال الحذف (Delete) - مع التنظيف الشامل المعزول
# ==========================================
@exams_manage_data_bp.route('/exams/api/delete-<entity>/<int:id>', methods=['DELETE'])
def delete_entity(entity, id):
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": "غير مصرح"}), 403

    # خريطة تربط الكيان بالكائن الصحيح في قاعدة البيانات
    allowed_entities = {
        'professor': ExamTeacher,
        'hall': ExamRoom,
        'level': ExamLevel,
        'subject': ExamSubject
    }
    
    if entity not in allowed_entities:
        return jsonify({'success': False, 'message': 'كيان غير صالح'})

    ModelClass = allowed_entities[entity]
    item = ModelClass.query.filter_by(id=id, tenant_id=tenant_id).first()
    
    if item:
        try:
            # تنظيف العلاقات (Many-to-Many) قبل الحذف لتفادي أخطاء الربط
            if entity == 'professor' and hasattr(item, 'subjects'):
                item.subjects = []
            elif entity == 'level' and hasattr(item, 'rooms'):
                item.rooms = []
                
            db.session.delete(item)
            db.session.commit()
            return jsonify({'success': True})
        except Exception as e:
            db.session.rollback()
            return jsonify({'success': False, 'message': str(e)})
            
    return jsonify({'success': False, 'message': 'العنصر غير موجود'})

# ==========================================
# ✏️ دوال التعديل (Edit)
# ==========================================
@exams_manage_data_bp.route('/exams/api/edit-hall/<int:id>', methods=['PUT'])
def edit_hall(id):
    tenant_id = session.get('tenant_id')
    name = request.json.get('name').strip()
    hall_type = request.json.get('type')
    
    item = ExamRoom.query.filter_by(id=id, tenant_id=tenant_id).first()
    if not item: return jsonify({'success': False})
    
    # فحص التكرار (منع تسمية قاعتين بنفس الاسم في نفس القسم)
    duplicate = ExamRoom.query.filter_by(name=name, tenant_id=tenant_id).first()
    if duplicate and duplicate.id != id:
        return jsonify({'success': False, 'message': 'هذه القاعة موجودة مسبقاً'})
        
    item.name = name
    item.type = hall_type
    db.session.commit()
    return jsonify({'success': True})

@exams_manage_data_bp.route('/exams/api/edit-level/<int:id>', methods=['PUT'])
def edit_level(id):
    tenant_id = session.get('tenant_id')
    name = request.json.get('name').strip()
    
    item = ExamLevel.query.filter_by(id=id, tenant_id=tenant_id).first()
    if not item: return jsonify({'success': False})
    
    duplicate = ExamLevel.query.filter_by(name=name, tenant_id=tenant_id).first()
    if duplicate and duplicate.id != id:
        return jsonify({'success': False, 'message': 'هذا المستوى موجود مسبقاً'})
        
    item.name = name
    db.session.commit()
    return jsonify({'success': True})

@exams_manage_data_bp.route('/exams/api/edit-subject/<int:id>', methods=['PUT'])
def edit_subject(id):
    tenant_id = session.get('tenant_id')
    name = request.json.get('name').strip()
    
    item = ExamSubject.query.filter_by(id=id, tenant_id=tenant_id).first()
    if not item: return jsonify({'success': False})
    
    # لا نمانع تكرار اسم المادة لأنها قد تكون مرتبطة بمستويات مختلفة
    item.name = name
    db.session.commit()
    return jsonify({'success': True})