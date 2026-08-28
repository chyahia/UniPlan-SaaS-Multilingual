# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from app.celery_setup import celery_app
from app import create_app
# ✨ 1. استدعاء المترجم المستقل بدلاً من Babel
from app.resit_solver import run_distribution, set_resit_algorithm_language 
from app.resit_data_manager import load_full_db, update_complex_state

# 🌟 إنشاء تطبيق فلاسك هنا
flask_app = create_app()

# ✨ فصلنا المنطق في دالة مستقلة لتعمل في البيئتين
def execute_resit_distribution(tenant_id, duration, destruction_rate, strategy, celery_task=None):
    db_dict = load_full_db(tenant_id_override=tenant_id) #[cite: 3]
    
    
    is_teacher_focused = (strategy == 'teacher') #[cite: 3]
    
    def progress_callback(elapsed, duration, unassigned, hard, soft): #[cite: 3]
        meta_data = {
            'elapsed': elapsed,
            'duration': duration,
            'unassigned': unassigned,
            'hard': hard,
            'soft': soft
        } #[cite: 3]
        if celery_task:
            # مسار السحابة: إرسال عبر Celery
            celery_task.update_state(state='PROGRESS', meta=meta_data) #[cite: 3]
        else:
            # مسار سطح المكتب: تحديث الذاكرة الحية (RAM) مباشرة
            from app.memory_logger import store
            with store.lock:
                store.status[f"progress_{tenant_id}"] = meta_data #[cite: 3]
        
    best_dist, violations = run_distribution(
        db_dict,
        duration=duration,
        destruction_rate=destruction_rate,
        progress_callback=progress_callback,
        is_teacher_focused=is_teacher_focused
    ) #[cite: 3]
    
    update_complex_state('final_schedule', best_dist, tenant_id_override=tenant_id) #[cite: 3]
    update_complex_state('final_violations', violations, tenant_id_override=tenant_id) #[cite: 3]
    
    if not celery_task:
        # إعطاء إشارة الانتهاء لنسخة سطح المكتب
        from app.memory_logger import store
        with store.lock:
            store.status[f"done_{tenant_id}"] = violations
            store.status[f"running_{tenant_id}"] = False #[cite: 3]

    return {'status': 'done', 'violations': violations} #[cite: 3]

# ✨ 2. أضفنا المتغير lang (مع إعطائه قيمة افتراضية 'ar' لتفادي أي أخطاء)
@celery_app.task(bind=True)
def run_resit_distribution_task(self, tenant_id, duration, destruction_rate, strategy, lang='ar'):
    
    # ✨ 2. تفعيل اللغة المعزولة للخوارزمية قبل الدخول في أي سياق آخر
    set_resit_algorithm_language(lang)
    
    # 🌟 تغليف المهمة بسياق التطبيق للسحابة
    with flask_app.app_context():
        return execute_resit_distribution(tenant_id, duration, destruction_rate, strategy, celery_task=self)