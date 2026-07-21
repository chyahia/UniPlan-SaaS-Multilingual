from flask import Blueprint, request, jsonify, session
from app.database import db, Setting, Room
import json
from flask_babel import _ # ✨ استيراد دالة الترجمة تحسباً لأي استخدام مستقبلي

structure_bp = Blueprint('structure', __name__)

# جلب هيكل الجدول المحفوظ مسبقاً
@structure_bp.route('/api/structure', methods=['GET'])
def get_structure():
    tenant_id = session.get('tenant_id')
    setting = Setting.query.filter_by(key='schedule_structure', tenant_id=tenant_id).first()
    
    if setting and setting.value:
        return jsonify(json.loads(setting.value))
    return jsonify([])

# حفظ هيكل الجدول
@structure_bp.route('/api/structure', methods=['POST'])
def save_structure():
    tenant_id = session.get('tenant_id')
    structure_data = request.json
    value_str = json.dumps(structure_data)
    
    # تحديث أو إنشاء الإعداد في قاعدة البيانات (معزول بالقسم)
    setting = Setting.query.filter_by(key='schedule_structure', tenant_id=tenant_id).first()
    if setting:
        setting.value = value_str
    else:
        new_setting = Setting(key='schedule_structure', value=value_str, tenant_id=tenant_id)
        db.session.add(new_setting)
        
    db.session.commit()
    return jsonify({'success': True})

# جلب أسماء المدرجات فقط (لاستخدامها في قيود القاعات المحددة)
@structure_bp.route('/api/halls', methods=['GET'])
def get_halls():
    tenant_id = session.get('tenant_id')
    halls = Room.query.filter_by(type='مدرج', tenant_id=tenant_id).all()
    
    return jsonify([{"id": h.id, "name": h.name} for h in halls])