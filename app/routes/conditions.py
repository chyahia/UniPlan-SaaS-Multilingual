# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from flask import Blueprint, request, jsonify, session
from app.database import db, Setting
import json
from flask_babel import _  # ✨ استيراد دالة الترجمة تحسباً لأي رسائل إضافية في المستقبل

conditions_bp = Blueprint('conditions', __name__)

# مسار المرحلة 5 (القيود)
@conditions_bp.route('/api/conditions', methods=['GET', 'POST'])
def manage_conditions():
    tenant_id = session.get('tenant_id')
    
    if request.method == 'POST':
        value_str = json.dumps(request.json)
        setting = Setting.query.filter_by(key='schedule_conditions', tenant_id=tenant_id).first()
        
        if setting:
            setting.value = value_str
        else:
            new_setting = Setting(key='schedule_conditions', value=value_str, tenant_id=tenant_id)
            db.session.add(new_setting)
            
        db.session.commit()
        return jsonify({'success': True})
    else:
        setting = Setting.query.filter_by(key='schedule_conditions', tenant_id=tenant_id).first()
        saved_conditions = json.loads(setting.value) if setting and setting.value else {}
        return jsonify(saved_conditions)

# مسار المرحلة 6 (إعدادات الخوارزميات)
@conditions_bp.route('/api/algorithm-settings', methods=['GET', 'POST'])
def manage_algo_settings():
    tenant_id = session.get('tenant_id')
    
    if request.method == 'POST':
        value_str = json.dumps(request.json)
        setting = Setting.query.filter_by(key='algorithm_settings', tenant_id=tenant_id).first()
        
        if setting:
            setting.value = value_str
        else:
            new_setting = Setting(key='algorithm_settings', value=value_str, tenant_id=tenant_id)
            db.session.add(new_setting)
            
        db.session.commit()
        return jsonify({'success': True})
    else:
        setting = Setting.query.filter_by(key='algorithm_settings', tenant_id=tenant_id).first()
        saved_settings = json.loads(setting.value) if setting and setting.value else {}
        return jsonify(saved_settings)
    
# ================= مسارات النماذج المحفوظة (Profiles) في السحابة =================
@conditions_bp.route('/api/profiles', methods=['GET', 'POST', 'DELETE'])
def manage_profiles():
    tenant_id = session.get('tenant_id')
    # نستخدم مفتاح 'saved_profiles' لتخزين كل نماذج القسم في حقل واحد كـ JSON
    setting = Setting.query.filter_by(key='saved_profiles', tenant_id=tenant_id).first()
    
    # 1. جلب النماذج المحفوظة
    if request.method == 'GET':
        profiles = json.loads(setting.value) if setting and setting.value else {}
        return jsonify(profiles)
        
    # 2. حفظ نموذج جديد أو تحديث نموذج موجود
    elif request.method == 'POST':
        req_data = request.json
        profile_name = req_data.get('name')
        profile_data = req_data.get('data')
        
        profiles = json.loads(setting.value) if setting and setting.value else {}
        profiles[profile_name] = profile_data
        
        if setting:
            setting.value = json.dumps(profiles)
        else:
            new_setting = Setting(key='saved_profiles', value=json.dumps(profiles), tenant_id=tenant_id)
            db.session.add(new_setting)
            
        db.session.commit()
        return jsonify({'success': True})
        
    # 3. حذف نموذج محدد
    elif request.method == 'DELETE':
        profile_name = request.json.get('name')
        if setting and setting.value:
            profiles = json.loads(setting.value)
            if profile_name in profiles:
                del profiles[profile_name]
                setting.value = json.dumps(profiles)
                db.session.commit()
        return jsonify({'success': True})