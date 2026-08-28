# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from app import create_app
from app.celery_setup import celery_app
import app.resit_tasks

# 1. تشغيل بيئة Flask كاملة ليتعرف Celery على قاعدة البيانات وإعداداتها
app = create_app()
app.app_context().push()

# ==========================================
# 2. 🌟 تسجيل مهام السحابة (Celery Tasks)
# ==========================================

# أ. استدعاء مهمة توليد جداول الامتحانات (التي برمجناها للتو)
from app.routes.exams_routes.exams_generation import background_exam_generation_task

# ب. استدعاء مهمة توليد الجداول الدراسية (التي برمجناها سابقاً في نظام التدريس)
# (نفترض أن اسمها هكذا وموجودة في مسار التدريس، تأكد من مطابقة الاسم إذا كان مختلفاً لديك)
try:
    from app.routes.generation import background_schedule_generation_task
except ImportError:
    pass