from flask import Flask, render_template, jsonify, session, redirect, url_for
import os
from dotenv import load_dotenv
from app.database import db  # استيراد db من الهيكلة الجديدة

# استيراد المسارات (نفسها دون تغيير)
from app.routes.basic_data import basic_data_bp
from app.routes.manage_data import manage_data_bp
from app.routes.assignments import assignments_bp
from app.routes.structure import structure_bp
from app.routes.conditions import conditions_bp
from app.routes.generation import generation_bp
from app.routes.backup import backup_bp
from app.routes.export import export_bp
from app.routes.auth import auth_bp
from app.routes.teacher_portal import teacher_portal_bp
from app.routes.admin_requests import admin_requests_bp
from app.routes.super_admin_routes import super_admin_bp

def create_app():
    load_dotenv()
    app = Flask(__name__)
    
    # 1. الإعدادات الأساسية
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'chy_secret_key_2026_fallback')
    
    # 2. إعدادات قاعدة البيانات (PostgreSQL أو SQLite مؤقتاً)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', 'sqlite:///saas_database.db')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    # 3. ربط قاعدة البيانات بالتطبيق
    db.init_app(app)

    # 4. إنشاء الجداول تلقائياً
    with app.app_context():
        db.create_all()

    # ==========================================
    # 🌟 الروابط الأساسية للمنصة (تم التحديث هنا)
    # ==========================================

    @app.route('/')
    def portal():
        # التأكد من تسجيل الدخول أولاً
        if 'user_id' not in session:
            return redirect(url_for('auth.login')) 
            
        # توجيه الأستاذ والمدير العام لشاشاتهم
        if session.get('role') == 'teacher':
            return redirect(url_for('teacher_portal.teacher_dashboard'))
            
        if session.get('role') == 'super_admin':
            return redirect(url_for('super_admin'))

        # ✨ جلب بيانات القسم للتحقق من التراخيص
        from app.database import Tenant
        current_tenant = Tenant.query.get(session.get('tenant_id'))
        
        # ✨ التعديل: توجيه رئيس القسم إلى البوابة الجديدة ذات البطاقتين
        return render_template('hod_portal.html', tenant=current_tenant)
        
            

    @app.route('/teaching')
    def teaching_index():
        # حماية المسار: التأكد أن المستخدم رئيس قسم
        if 'user_id' not in session or session.get('role') in ['teacher', 'super_admin']:
            return redirect(url_for('portal'))
            
        # فتح نظام الجداول الدراسية
        return render_template('index.html')

    @app.route('/super_admin')
    def super_admin():
        if session.get('role') != 'super_admin':
            return redirect(url_for('auth.login'))
        return render_template('super_admin.html')    

    # ==========================================
    # 5. تسجيل المسارات (Blueprints)
    # ==========================================
    app.register_blueprint(basic_data_bp)
    app.register_blueprint(manage_data_bp)
    app.register_blueprint(assignments_bp)
    app.register_blueprint(structure_bp)
    app.register_blueprint(conditions_bp)
    app.register_blueprint(generation_bp)
    app.register_blueprint(backup_bp)
    app.register_blueprint(export_bp)
    app.register_blueprint(auth_bp)
    app.register_blueprint(teacher_portal_bp)
    app.register_blueprint(admin_requests_bp)
    app.register_blueprint(super_admin_bp)

    # ==========================================
    # 🌟 تسجيل مسارات برنامج الامتحانات (بشكل معزول)
    # ==========================================
    from .routes.exams_routes.exams_basic_data import exams_basic_data_bp
    app.register_blueprint(exams_basic_data_bp)

    from .routes.exams_routes.exams_manage_data import exams_manage_data_bp
    app.register_blueprint(exams_manage_data_bp)

    from .routes.exams_routes.exams_assignments import exams_assignments_bp
    app.register_blueprint(exams_assignments_bp)

    from .routes.exams_routes.exams_times import exams_times_bp
    app.register_blueprint(exams_times_bp)

    from .routes.exams_routes.exams_conditions import exams_conditions_bp
    app.register_blueprint(exams_conditions_bp)

    from .routes.exams_routes.exams_generation import exams_generation_bp
    app.register_blueprint(exams_generation_bp)

    from .routes.exams_routes.exams_backup import exams_backup_bp
    app.register_blueprint(exams_backup_bp)

    from .routes.exams_routes.exams_export import exams_export_bp
    app.register_blueprint(exams_export_bp)

    return app