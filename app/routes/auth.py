# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from flask import Blueprint, request, jsonify, session, render_template, redirect, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from app.database import db, User, Teacher
from flask_babel import _ # ✨ استيراد دالة الترجمة

auth_bp = Blueprint('auth', __name__)

# --- دالة لمعرفة هل النظام جديد كلياً ---
def is_first_run():
    # التحقق من عدم وجود مدير عام (Super Admin) في قاعدة البيانات
    admin = User.query.filter_by(role='super_admin').first()
    return admin is None

# --- مسار الإعداد لأول مرة (إنشاء المدير العام) ---
@auth_bp.route('/setup', methods=['GET', 'POST'])
def setup():
    if not is_first_run():
        return redirect(url_for('auth.login'))
        
    if request.method == 'GET':
        return render_template('setup.html')
        
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({"success": False, "error": _("يرجى ملء جميع الحقول.")})
        
    hashed_pw = generate_password_hash(password)
    # إضافة المدير العام (لا يتبع لأي قسم tenant_id = None)
    new_admin = User(username=username, password_hash=hashed_pw, role='super_admin')
    db.session.add(new_admin)
    db.session.commit()
    
    return jsonify({"success": True, "message": _("تم إعداد النظام وإنشاء المدير العام بنجاح!")})

# --- مسار صفحة وعملية تسجيل الدخول ---
@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if is_first_run():
        return redirect(url_for('auth.setup'))
        
    if request.method == 'GET':
        if 'user_id' in session:
            return redirect('/') 
        return render_template('login.html')
    
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    # البحث عن المستخدم باستخدام SQLAlchemy
    user = User.query.filter_by(username=username).first()
    
    if user and check_password_hash(user.password_hash, password):
        session['user_id'] = user.id
        session['username'] = user.username
        session['role'] = user.role
        session['tenant_id'] = user.tenant_id  # مهم جداً للعزل (سيكون None للمدير العام)
        session['teacher_id'] = user.teacher_id
        return jsonify({"success": True, "role": user.role})
    
    return jsonify({"success": False, "error": _("اسم المستخدم أو كلمة المرور غير صحيحة")}), 401

@auth_bp.route('/logout', methods=['GET', 'POST'])
def logout():
    session.clear() 
    return redirect(url_for('auth.login'))

# ==========================================
# إدارة حسابات الأساتذة من قبل رئيس القسم (tenant_admin)
# ==========================================
@auth_bp.route('/api/manage_account/<int:teacher_id>', methods=['GET'])
def get_teacher_account(teacher_id):
    if session.get('role') != 'tenant_admin': 
        return jsonify({"error": _("غير مصرح")}), 403
    
    # العزل: يجب أن يتأكد أن الأستاذ ينتمي لنفس القسم
    user = User.query.filter_by(teacher_id=teacher_id, tenant_id=session.get('tenant_id')).first()
    
    if user:
        return jsonify({"has_account": True, "username": user.username})
    return jsonify({"has_account": False})

@auth_bp.route('/api/manage_account', methods=['POST'])
def save_teacher_account():
    if session.get('role') != 'tenant_admin': 
        return jsonify({"error": _("غير مصرح")}), 403
    
    data = request.json
    teacher_id = data.get('teacher_id')
    username = data.get('username')
    password = data.get('password')
    tenant_id = session.get('tenant_id')
    
    if not username or not password:
        return jsonify({"error": _("اسم المستخدم وكلمة المرور مطلوبان")}), 400
        
    # التأكد من أن اسم المستخدم غير محجوز لشخص آخر في النظام
    existing = User.query.filter(User.username == username, User.teacher_id != teacher_id).first()
    if existing:
        return jsonify({"error": _("اسم المستخدم هذا محجوز لأستاذ آخر، جرب اسماً مختلفاً.")}), 400
        
    hashed_pw = generate_password_hash(password)
    user = User.query.filter_by(teacher_id=teacher_id, tenant_id=tenant_id).first()
    
    if user:
        user.username = username
        user.password_hash = hashed_pw
    else:
        new_user = User(username=username, password_hash=hashed_pw, role='teacher', teacher_id=teacher_id, tenant_id=tenant_id)
        db.session.add(new_user)
        
    db.session.commit()
    return jsonify({"success": True, "message": _("✅ تم حفظ بيانات دخول الأستاذ بنجاح!")})

@auth_bp.route('/api/admin/credentials', methods=['POST'])
def update_admin_credentials():
    # يسمح بتغيير الرقم السري لرئيس القسم أو المدير العام
    if session.get('role') not in ['tenant_admin', 'super_admin']: 
        return jsonify({"error": _("غير مصرح")}), 403
    
    data = request.json
    new_username = data.get('username')
    new_password = data.get('password')
    
    if not new_username or not new_password:
        return jsonify({"error": _("يرجى ملء جميع الحقول")}), 400
        
    existing = User.query.filter(User.username == new_username, User.id != session.get('user_id')).first()
    if existing:
        return jsonify({"error": _("اسم المستخدم هذا محجوز لشخص آخر، يرجى اختيار اسم مختلف.")}), 400
        
    user = User.query.get(session.get('user_id'))
    user.username = new_username
    user.password_hash = generate_password_hash(new_password)
    db.session.commit()
    
    session['username'] = new_username
    
    return jsonify({"success": True, "message": _("✅ تم تحديث بيانات الدخول بنجاح!")})