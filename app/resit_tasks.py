from app.celery_setup import celery_app
from app import create_app
from app.resit_solver import run_distribution
from app.resit_data_manager import load_full_db, update_complex_state

# 🌟 إنشاء تطبيق فلاسك هنا
flask_app = create_app()

# ✨ فصلنا المنطق في دالة مستقلة لتعمل في البيئتين
def execute_resit_distribution(tenant_id, algo_choice, duration, destruction_rate, strategy, celery_task=None):
    db_dict = load_full_db(tenant_id_override=tenant_id)
    
    use_lns = (algo_choice == 'lns')
    is_teacher_focused = (strategy == 'teacher')
    
    def progress_callback(elapsed, duration, unassigned, hard, soft):
        meta_data = {
            'elapsed': elapsed,
            'duration': duration,
            'unassigned': unassigned,
            'hard': hard,
            'soft': soft
        }
        if celery_task:
            # مسار السحابة: إرسال عبر Celery
            celery_task.update_state(state='PROGRESS', meta=meta_data)
        else:
            # مسار سطح المكتب: تحديث الذاكرة الحية (RAM) مباشرة
            from app.memory_logger import store
            with store.lock:
                store.status[f"progress_{tenant_id}"] = meta_data
        
    best_dist, violations = run_distribution(
        db_dict,
        use_lns=use_lns,
        duration=duration,
        destruction_rate=destruction_rate,
        progress_callback=progress_callback,
        is_teacher_focused=is_teacher_focused
    )
    
    update_complex_state('final_schedule', best_dist, tenant_id_override=tenant_id)
    update_complex_state('final_violations', violations, tenant_id_override=tenant_id)
    
    if not celery_task:
        # إعطاء إشارة الانتهاء لنسخة سطح المكتب
        from app.memory_logger import store
        with store.lock:
            store.status[f"done_{tenant_id}"] = violations
            store.status[f"running_{tenant_id}"] = False

    return {'status': 'done', 'violations': violations}

@celery_app.task(bind=True)
def run_resit_distribution_task(self, tenant_id, algo_choice, duration, destruction_rate, strategy):
    # 🌟 تغليف المهمة بسياق التطبيق للسحابة
    with flask_app.app_context():
        return execute_resit_distribution(tenant_id, algo_choice, duration, destruction_rate, strategy, celery_task=self)