from celery_worker import celery_app
from app.resit_solver import run_distribution
from app.resit_data_manager import load_full_db, update_complex_state


@celery_app.task(bind=True)
def run_resit_distribution_task(self, tenant_id, algo_choice, duration, destruction_rate, strategy):
    from run import app
    # توفير سياق التطبيق للسماح للسيليري بالاتصال بقاعدة البيانات
    with app.app_context():
        # تحميل بيانات القسم الصحيح
        db_dict = load_full_db(tenant_id_override=tenant_id)
        
        use_lns = (algo_choice == 'lns')
        is_teacher_focused = (strategy == 'teacher')
        
        # دالة الإرسال اللحظي للمتصفح
        def progress_callback(elapsed, total_duration, unassigned, hard, soft):
            self.update_state(state='PROGRESS', meta={
                'elapsed': elapsed,
                'duration': total_duration,
                'unassigned': unassigned,
                'hard': hard,
                'soft': soft
            })
            
        # تشغيل خوارزميتك الأصلية
        best_dist, violations = run_distribution(
            db_dict,
            use_lns=use_lns,
            duration=duration,
            destruction_rate=destruction_rate,
            progress_callback=progress_callback,
            is_teacher_focused=is_teacher_focused
        )
        
        # حفظ النتيجة النهائية في قاعدة بيانات القسم
        update_complex_state('final_schedule', best_dist, tenant_id_override=tenant_id)
        update_complex_state('final_violations', violations, tenant_id_override=tenant_id)
        
        return {'status': 'done'}