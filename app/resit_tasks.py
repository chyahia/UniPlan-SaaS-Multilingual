from app.celery_setup import celery_app
from app import create_app
from app.resit_solver import run_distribution  # 🌟 تم استيراد الدالة
from app.resit_data_manager import load_full_db, update_complex_state  # 🌟 تم استيراد دوال البيانات

# 🌟 إنشاء تطبيق فلاسك هنا
flask_app = create_app()

@celery_app.task(bind=True)
def run_resit_distribution_task(self, tenant_id, algo_choice, duration, destruction_rate, strategy):
    # 🌟 تغليف المهمة بسياق التطبيق
    with flask_app.app_context():
        
        # 🌟 1. استدعاء البيانات الخاصة بهذا القسم ( tenant_id)
        db_dict = load_full_db(tenant_id_override=tenant_id)
        
        # 🌟 2. تحويل المعطيات للقيم التي تفهمها الخوارزمية
        use_lns = (algo_choice == 'lns')
        is_teacher_focused = (strategy == 'teacher')
        
        # 🌟 دالة إرسال التحديثات الحية للشاشة السوداء
        def progress_callback(elapsed, duration, unassigned, hard, soft):
            self.update_state(state='PROGRESS', meta={
                'elapsed': elapsed,
                'duration': duration,
                'unassigned': unassigned,
                'hard': hard,
                'soft': soft
            })
            
        # 🌟 3. تشغيل الخوارزمية مع تمرير المتغيرات المعرفة الآن
        best_dist, violations = run_distribution(
            db_dict,
            use_lns=use_lns,
            duration=duration,
            destruction_rate=destruction_rate,
            progress_callback=progress_callback,
            is_teacher_focused=is_teacher_focused
        )
        
        # 🌟 4. حفظ النتيجة النهائية
        update_complex_state('final_schedule', best_dist, tenant_id_override=tenant_id)
        update_complex_state('final_violations', violations, tenant_id_override=tenant_id)
        
        return {'status': 'done', 'violations': violations}