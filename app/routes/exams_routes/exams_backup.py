from flask import Blueprint, request, jsonify, send_file, session
import json
import io
from app.database import db, ExamTeacher, ExamRoom, ExamLevel, ExamSubject, ExamDay, ExamSetting

exams_backup_bp = Blueprint('exams_backup', __name__)

# ==========================================
# 1. تصدير البيانات (SaaS Backup)
# ==========================================
@exams_backup_bp.route('/exams/api/backup', methods=['GET'])
def backup_data():
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": "غير مصرح"}), 403
        
    try:
        # تجميع إعدادات وأيام الامتحانات في ملف JSON
        backup_dict = {
            "exam_days": [{"day_order": d.day_order, "date_text": d.date_text, "morning_slots": d.morning_slots, "afternoon_slots": d.afternoon_slots} for d in ExamDay.query.filter_by(tenant_id=tenant_id).all()],
            "exam_settings": [{"key": s.key, "value": s.value} for s in ExamSetting.query.filter_by(tenant_id=tenant_id).all()]
        }
        
        json_string = json.dumps(backup_dict, ensure_ascii=False, indent=4)
        buffer = io.BytesIO(json_string.encode('utf-8'))
        
        return send_file(buffer, as_attachment=True, download_name="exam_guard_backup.json", mimetype="application/json")
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ==========================================
# 2. تصفير بيانات الامتحانات (ضبط المصنع)
# ==========================================
@exams_backup_bp.route('/exams/api/reset-all', methods=['POST'])
def reset_all_data():
    tenant_id = session.get('tenant_id')
    if not tenant_id:
        return jsonify({"error": "غير مصرح"}), 403

    try:
        # مسح العلاقات أولاً ثم الكائنات الخاصة بالامتحانات للقسم الحالي فقط
        for t in ExamTeacher.query.filter_by(tenant_id=tenant_id).all():
            t.subjects = [] # تفريغ مواد الأستاذ
            db.session.delete(t)
            
        for l in ExamLevel.query.filter_by(tenant_id=tenant_id).all():
            l.rooms = [] # تفريغ قاعات المستوى
            db.session.delete(l)

        # مسح بقية البيانات
        ExamSubject.query.filter_by(tenant_id=tenant_id).delete()
        ExamRoom.query.filter_by(tenant_id=tenant_id).delete()
        ExamDay.query.filter_by(tenant_id=tenant_id).delete()
        ExamSetting.query.filter_by(tenant_id=tenant_id).delete()
        
        db.session.commit()
        return jsonify({"success": True, "message": "تم مسح جميع بيانات الامتحانات بنجاح. سيتم إعادة تحميل الصفحة."})
    except Exception as e: 
        db.session.rollback()
        return jsonify({"error": f"حدث خطأ أثناء مسح البيانات: {str(e)}"}), 500  
