from flask import Blueprint, request, jsonify, session
import json
from app.database import db, ExamSetting
from flask_babel import _

# استخدمنا اسم exams_times_bp لكي لا يتعارض مع مسار الأوقات في برنامج الجداول
exams_times_bp = Blueprint('exams_times', __name__)

@exams_times_bp.route('/exams/api/exam-schedule', methods=['GET'])
def get_exam_schedule():
    """جلب جدول الامتحانات المحفوظ مسبقاً (معزول بالقسم)"""
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": _("غير مصرح")}), 403

    setting = ExamSetting.query.filter_by(key='exam_schedule', tenant_id=tenant_id).first()
    
    if setting and setting.value:
        return jsonify(json.loads(setting.value))
    return jsonify({})

@exams_times_bp.route('/exams/api/exam-schedule', methods=['POST'])
def save_exam_schedule():
    """حفظ هيكل جدول الامتحانات (الأيام، الفترات، والمستويات)"""
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": _("غير مصرح")}), 403

    schedule_data = request.json
    value_str = json.dumps(schedule_data)
    
    setting = ExamSetting.query.filter_by(key='exam_schedule', tenant_id=tenant_id).first()
    
    if setting:
        setting.value = value_str
    else:
        new_setting = ExamSetting(key='exam_schedule', value=value_str, tenant_id=tenant_id)
        db.session.add(new_setting)
        
    db.session.commit()
    return jsonify({'success': True, 'message': _('تم حفظ هيكل جدول الامتحانات بنجاح.')})