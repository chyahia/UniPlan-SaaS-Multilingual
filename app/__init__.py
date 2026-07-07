from flask import Flask, render_template, jsonify, session, redirect, url_for
import os
import sys
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
    # التعرف التلقائي الذكي على البيئة (Desktop vs Web)
    if getattr(sys, 'frozen', False):
        # إذا كان النظام يعمل كملف تنفيذي (exe)، فهو حتماً في بيئة سطح المكتب
        app.config['APP_MODE'] = 'desktop'
    else:
        # إذا كان يعمل كسكريبت بايثون (على استضافة أو للتطوير)، نقرأ من ملف .env
        app.config['APP_MODE'] = os.environ.get('APP_MODE', 'production')

    # ==========================================
    # 🌟 الكود الذكي لتحديد مسار قاعدة البيانات 
    # ==========================================
    def get_db_path():
        # تحديد المسار الرئيسي للبرنامج (سواء كان سكربت بايثون أو ملف exe)
        if getattr(sys, 'frozen', False):
            base_dir = os.path.dirname(sys.executable)
        else:
            base_dir = os.path.abspath(os.path.dirname(os.path.dirname(__file__)))
            
        # التحقق مما إذا كان المسار يحتوي على Program Files
        if "Program Files" in base_dir or "ProgramFiles" in base_dir:
            # توجيه قاعدة البيانات إلى مجلد AppData/Roaming الآمن
            appdata = os.environ.get('APPDATA')
            db_dir = os.path.join(appdata, 'UniPlanSaaS') # سيتم إنشاء مجلد بهذا الاسم
            if not os.path.exists(db_dir):
                os.makedirs(db_dir)
            return os.path.join(db_dir, 'saas_database.db')
        else:
            # إنشاء قاعدة البيانات بجوار الملف التنفيذي مباشرة
            return os.path.join(base_dir, 'saas_database.db')
            
    # توليد المسار النهائي
    db_path = get_db_path()

    # 2. إعدادات قاعدة البيانات (PostgreSQL سحابي أو SQLite محلي)
    app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get('DATABASE_URL', f'sqlite:///{db_path}')
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

    # ==========================================
    # 🌟 مسار الإغلاق الآمن للنظام (يعمل فقط في وضع سطح المكتب)
    # ==========================================
    @app.route('/shutdown', methods=['POST'])
    def shutdown():
        import os
        import subprocess
        import threading
        
        # التحقق من أن النظام يعمل في بيئة سطح المكتب
        if app.config.get('APP_MODE') == 'desktop':
            
            # دالة الإغلاق الشامل لشجرة العمليات (البرنامج الرئيسي + السيليري)
            def terminate_process_tree():
                # استخدام أمر الويندوز لقتل العملية وأبنائها بشكل نظيف ومخفي
                subprocess.run(
                    ['taskkill', '/F', '/T', '/PID', str(os.getpid())],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW
                )

            # نضبط مؤقت زمني لثانية واحدة:
            # لكي نعطي فرصة للخادم ليرد على المتصفح بـ (success: True) أولاً
            # ثم يقوم بالانتحار وإغلاق كل شيء.
            threading.Timer(1.0, terminate_process_tree).start()
            
            return jsonify({"success": True})
        
        # إذا كان على استضافة حقيقية، نرفض طلب الإغلاق
        return jsonify({"success": False, "error": "ميزة الإغلاق معطلة في النسخة السحابية الحية."}), 403

    return app