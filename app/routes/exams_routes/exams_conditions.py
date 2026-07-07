from flask import Blueprint, request, jsonify, session
import json
from app.database import db, ExamSetting

# تسمية Blueprint بشكل مستقل لمنع التضارب
exams_conditions_bp = Blueprint('exams_conditions', __name__)

@exams_conditions_bp.route('/exams/api/settings', methods=['GET'])
def get_settings():
    """جلب كل إعدادات وقيود البرنامج المحفوظة (للإمتحانات)"""
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": "غير مصرح"}), 403

    setting = ExamSetting.query.filter_by(key='main_settings', tenant_id=tenant_id).first()
    
    if setting and setting.value:
        return jsonify(json.loads(setting.value))
    return jsonify({})

@exams_conditions_bp.route('/exams/api/settings', methods=['POST'])
def save_settings():
    """حفظ إعدادات وقيود البرنامج (للإمتحانات)"""
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": "غير مصرح"}), 403

    settings_data = request.json
    value_str = json.dumps(settings_data)
    
    setting = ExamSetting.query.filter_by(key='main_settings', tenant_id=tenant_id).first()
    
    if setting:
        setting.value = value_str
    else:
        new_setting = ExamSetting(key='main_settings', value=value_str, tenant_id=tenant_id)
        db.session.add(new_setting)
        
    db.session.commit()
    return jsonify({'success': True, 'message': 'تم حفظ القيود والشروط بنجاح.'})