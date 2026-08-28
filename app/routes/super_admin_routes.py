# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from flask import Blueprint, jsonify, request, session
from werkzeug.security import generate_password_hash
from app.database import db, Tenant, User, Teacher, Course
from flask_babel import _ # ✨ استيراد دالة الترجمة

super_admin_bp = Blueprint('super_admin_api', __name__)

# 1. جلب بيانات لوحة التحكم (الإحصائيات وقائمة الأقسام)
@super_admin_bp.route('/api/super_admin/dashboard', methods=['GET'])
def get_dashboard_data():
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح بهذا الإجراء")}), 403

    # إحصائيات عامة على مستوى المنصة ككل
    total_tenants = Tenant.query.count()
    total_teachers = Teacher.query.count()
    total_courses = Course.query.count()

    # جلب قائمة الأقسام مع اسم حساب رئيس القسم الخاص بكل منها
    tenants = Tenant.query.order_by(Tenant.id.desc()).all()
    tenants_data = []
    for t in tenants:
        admin_user = User.query.filter_by(tenant_id=t.id, role='tenant_admin').first()
        # داخل حلقة for التي تبني بيانات الـ tenants:
        tenants_data.append({
            "id": t.id,
            "name": t.name,
            "admin_username": admin_user.username if admin_user else _("غير محدد"),
            "created_at": t.created_at.strftime("%Y-%m-%d") if t.created_at else _("حديث"),
            # إضافة هذين السطرين لتقرأ الواجهة الحالة
            "has_teaching": getattr(t, 'has_teaching', True), 
            "has_exams": getattr(t, 'has_exams', True)
        })

    return jsonify({
        "stats": {
            "tenants": total_tenants,
            "teachers": total_teachers,
            "courses": total_courses
        },
        "tenants": tenants_data
    })

# 2. إنشاء قسم جديد وحساب لرئيس القسم
@super_admin_bp.route('/api/super_admin/create_tenant', methods=['POST'])
def create_tenant():
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح")}), 403

    data = request.json
    tenant_name = data.get('tenant_name')
    admin_username = data.get('admin_username')
    admin_password = data.get('admin_password')

    if not tenant_name or not admin_username or not admin_password:
        return jsonify({"error": _("جميع الحقول مطلوبة")}), 400

    # التحقق من عدم تكرار اسم القسم أو اسم المستخدم
    if Tenant.query.filter_by(name=tenant_name).first():
        return jsonify({"error": _("اسم القسم هذا مسجل مسبقاً في المنصة!")}), 400
    if User.query.filter_by(username=admin_username).first():
        return jsonify({"error": _("اسم المستخدم محجوز، يرجى اختيار اسم آخر لرئيس القسم.")}), 400

    try:
        # أ. إنشاء بيئة القسم (Tenant)
        new_tenant = Tenant(name=tenant_name)
        db.session.add(new_tenant)
        db.session.flush() # للحصول على معرف القسم الجديد (ID) فوراً

        # ب. إنشاء حساب رئيس القسم وربطه ببيئته (Tenant ID)
        hashed_pw = generate_password_hash(admin_password)
        new_admin = User(
            username=admin_username,
            password_hash=hashed_pw,
            role='tenant_admin',
            tenant_id=new_tenant.id
        )
        db.session.add(new_admin)

        db.session.commit()
        return jsonify({"success": True, "message": _("تم بنجاح إنشاء بيئة عمل {tenant_name} وتسجيل حساب مديره!").format(tenant_name=tenant_name)})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": _("حدث خطأ داخلي: {error}").format(error=str(e))}), 500
    
from app.database import Room, Level, CourseNature, Setting, TeacherRequest

# 3. مسار حذف قسم بالكامل
@super_admin_bp.route('/api/super_admin/tenant/<int:tenant_id>', methods=['DELETE'])
def delete_tenant(tenant_id):
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح")}), 403
        
    try:
        # مسح جميع بيانات القسم المعزولة
        User.query.filter_by(tenant_id=tenant_id).delete()
        TeacherRequest.query.filter_by(tenant_id=tenant_id).delete()
        for c in Course.query.filter_by(tenant_id=tenant_id).all():
            c.levels = []
            db.session.delete(c)
        CourseNature.query.filter_by(tenant_id=tenant_id).delete()
        Room.query.filter_by(tenant_id=tenant_id).delete()
        Level.query.filter_by(tenant_id=tenant_id).delete()
        Teacher.query.filter_by(tenant_id=tenant_id).delete()
        Setting.query.filter_by(tenant_id=tenant_id).delete()
        Tenant.query.filter_by(id=tenant_id).delete()
        
        db.session.commit()
        return jsonify({"success": True, "message": _("تم حذف القسم وجميع بياناته بشكل نهائي.")})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": _("حدث خطأ: {error}").format(error=str(e))}), 500

# 4. مسار إعادة تعيين كلمة مرور رئيس القسم
@super_admin_bp.route('/api/super_admin/tenant/<int:tenant_id>/reset_password', methods=['POST'])
def reset_tenant_password(tenant_id):
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح")}), 403
        
    data = request.json
    new_password = data.get('new_password')
    
    if not new_password:
        return jsonify({"error": _("كلمة المرور مطلوبة")}), 400
        
    try:
        admin_user = User.query.filter_by(tenant_id=tenant_id, role='tenant_admin').first()
        if not admin_user:
            return jsonify({"error": _("حساب رئيس القسم غير موجود")}), 404
            
        admin_user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        return jsonify({"success": True, "message": _("تم تغيير كلمة المرور بنجاح.")})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": _("حدث خطأ: {error}").format(error=str(e))}), 500
    
# 5. مسار تعديل اسم القسم
@super_admin_bp.route('/api/super_admin/tenant/<int:tenant_id>/edit_name', methods=['POST'])
def edit_tenant_name(tenant_id):
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح")}), 403
        
    data = request.json
    new_name = data.get('new_name')
    
    if not new_name or not new_name.strip():
        return jsonify({"error": _("اسم القسم مطلوب")}), 400
        
    new_name = new_name.strip()
    
    try:
        # التأكد من أن الاسم الجديد غير محجوز لقسم آخر
        existing_tenant = Tenant.query.filter_by(name=new_name).first()
        if existing_tenant and existing_tenant.id != tenant_id:
            return jsonify({"error": _("اسم القسم هذا موجود مسبقاً، يرجى اختيار اسم آخر.")}), 400
            
        tenant = Tenant.query.get(tenant_id)
        if not tenant:
            return jsonify({"error": _("القسم غير موجود")}), 404
            
        # تحديث الاسم
        tenant.name = new_name
        db.session.commit()
        
        return jsonify({"success": True, "message": _("تم تعديل اسم القسم بنجاح.")})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": _("حدث خطأ: {error}").format(error=str(e))}), 500

# 6. مسار تغيير بيانات دخول المدير العام (Super Admin)
@super_admin_bp.route('/api/super_admin/change_credentials', methods=['POST'])
def change_super_admin_credentials():
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح")}), 403

    data = request.json
    new_username = data.get('username')
    new_password = data.get('password')

    if not new_username or not new_password:
        return jsonify({"error": _("يرجى توفير اسم المستخدم وكلمة المرور الجديدة")}), 400

    try:
        # البحث عن حساب المدير العام (الذي قام بتسجيل الدخول حالياً)
        super_admin_user = User.query.filter_by(id=session.get('user_id'), role='super_admin').first()
        if not super_admin_user:
            return jsonify({"error": _("حساب المدير العام غير موجود")}), 404

        # تحديث البيانات وتشفير كلمة المرور الجديدة
        super_admin_user.username = new_username
        super_admin_user.password_hash = generate_password_hash(new_password)
        db.session.commit()

        return jsonify({"success": True, "message": _("تم تحديث بيانات الدخول الخاصة بك بنجاح!")})
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": _("حدث خطأ: {error}").format(error=str(e))}), 500
    
# 🌟 المسار الجديد للتحكم بصلاحيات الأنظمة (التدريس / الامتحانات)
@super_admin_bp.route('/api/super_admin/tenant/<int:tenant_id>/toggle_access', methods=['POST'])
def toggle_tenant_access(tenant_id):
    if session.get('role') != 'super_admin':
        return jsonify({"error": _("غير مصرح")}), 403
        
    data = request.get_json()
    system_type = data.get('system') # إما 'teaching' أو 'exams'
    
    from app.database import Tenant, db
    tenant = Tenant.query.get_or_404(tenant_id)
    
    if system_type == 'teaching':
        # عكس الحالة الحالية
        tenant.has_teaching = not getattr(tenant, 'has_teaching', True)
    elif system_type == 'exams':
        # عكس الحالة الحالية
        tenant.has_exams = not getattr(tenant, 'has_exams', True)
        
    db.session.commit()
    
    return jsonify({"success": True, "message": _("تم تحديث الصلاحيات بنجاح")})