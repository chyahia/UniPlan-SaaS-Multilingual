from flask import Flask, render_template, jsonify, session, redirect, url_for, request, has_request_context
import os
import sys
from dotenv import load_dotenv
from app.database import db
from flask_migrate import Migrate
from flask_babel import Babel  # ✨ استيراد مكتبة الترجمة

# استيراد المسارات
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
    app.config['ENABLE_DOMINO_FEATURE'] = True
    app.config['ENABLE_SURGICAL_FEATURE'] = True
    app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY', 'chy_secret_key_2026_fallback')
    
    if getattr(sys, 'frozen', False):
        app.config['APP_MODE'] = 'desktop'
    else:
        app.config['APP_MODE'] = os.environ.get('APP_MODE', 'production')

    # ==========================================
    # ✨ إعدادات اللغات والترجمة (Flask-Babel)
    # ==========================================
    app.config['BABEL_DEFAULT_LOCALE'] = 'ar'
    
    # التعديل هنا: تحديد المسار المطلق لمجلد الترجمات
    base_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
    app.config['BABEL_TRANSLATION_DIRECTORIES'] = os.path.join(base_dir, 'translations')

    def get_locale():
        # نتحقق أولاً إذا كنا داخل طلب ويب (Request) لتجنب أخطاء المهام الخلفية
        if has_request_context():
            # 1. إذا كانت اللغة محفوظة في الجلسة مسبقاً
            if 'lang' in session:
                return session['lang']
            
            # 2. إذا كانت أول زيارة، نفرض العربية في الجلسة ونعيدها
            session['lang'] = 'ar'
            return 'ar'
        
        # اللغة الافتراضية إذا كان الكود يعمل في الخلفية (Threads/Celery)
        return 'ar'

    # تفعيل Babel وربطه بالتطبيق
    babel = Babel(app, locale_selector=get_locale)

    # ==========================================
    # الكود الذكي لتحديد مسار قاعدة البيانات 
    # ==========================================
    def get_db_path():
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
            
        if "Program Files" in base_dir or "ProgramFiles" in base_dir:
            appdata = os.environ.get('APPDATA')
            db_dir = os.path.join(appdata, 'UniPlanSaaS') 
            if not os.path.exists(db_dir):
                os.makedirs(db_dir)
            return os.path.join(db_dir, 'saas_database.db')
        else:
            instance_dir = os.path.join(base_dir, 'instance')
            if not os.path.exists(instance_dir):
                os.makedirs(instance_dir)
            return os.path.join(instance_dir, 'saas_database.db')
            
    db_path = get_db_path()

    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', f'sqlite:///{db_path}')
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    migrate = Migrate(app, db, render_as_batch=True)

    with app.app_context():
        db.create_all()

    # ==========================================
    # مسار جديد لتغيير لغة النظام ديناميكياً
    # ==========================================
    @app.route('/set_lang/<lang>')
    def set_lang(lang):
        # نقبل فقط اللغات المدعومة
        if lang in ['ar', 'en']:
            session['lang'] = lang
        # نعود بالمستخدم إلى الصفحة التي كان فيها (أو الرئيسية)
        return redirect(request.referrer or url_for('portal'))

    # ==========================================
    # الروابط الأساسية للمنصة
    # ==========================================

    @app.route('/')
    def portal():
        if 'user_id' not in session:
            return redirect(url_for('auth.login')) 
            
        if session.get('role') == 'teacher':
            return redirect(url_for('teacher_portal.teacher_dashboard'))
            
        if session.get('role') == 'super_admin':
            return redirect(url_for('super_admin_api.super_admin')) # تم التصحيح هنا لربط مسار super admin الأصلي

        from app.database import Tenant
        current_tenant = Tenant.query.get(session.get('tenant_id'))
        
        return render_template('hod_portal.html', tenant=current_tenant)
        
    @app.route('/teaching')
    def teaching_index():
        if 'user_id' not in session or session.get('role') in ['teacher', 'super_admin']:
            return redirect(url_for('portal'))
            
        return render_template('index.html')

    @app.route('/super_admin')
    def super_admin():
        if session.get('role') != 'super_admin':
            return redirect(url_for('auth.login'))
        return render_template('super_admin.html')    

    # ==========================================
    # تسجيل المسارات (Blueprints)
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

    # مسارات برنامج الامتحانات السداسية
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

    # مسارات برنامج الامتحانات الاستدراكية
    from .routes.resit_exams_routes import resit_exams_bp
    app.register_blueprint(resit_exams_bp)

    # ==========================================
    # مسار الإغلاق الآمن للنظام 
    # ==========================================
    @app.route('/shutdown', methods=['POST'])
    def shutdown():
        import os
        import subprocess
        import threading
        
        if app.config.get('APP_MODE') == 'desktop':
            def terminate_all_processes():
                subprocess.run(['taskkill', '/F', '/IM', 'celery.exe'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                subprocess.run(['taskkill', '/F', '/T', '/PID', str(os.getpid())], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)

            threading.Timer(1.0, terminate_all_processes).start()
            return jsonify({"success": True})
        
        return jsonify({"success": False, "error": "ميزة الإغلاق معطلة في النسخة السحابية الحية."}), 403

    return app