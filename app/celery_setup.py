from celery import Celery
import os

# تهيئة كائن Celery العام
redis_url = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379/0')
celery_app = Celery('uniplan_tasks', broker=redis_url, backend=redis_url)

def init_celery(app):
    """
    دالة لربط Celery بتطبيق Flask 
    لكي تتمكن مهام الخلفية من الوصول لقاعدة البيانات
    """
    celery_app.conf.update(app.config)

    class ContextTask(celery_app.Task):
        def __call__(self, *args, **kwargs):
            # فتح سياق التطبيق (App Context) قبل تنفيذ أي خوارزمية
            with app.app_context():
                return self.run(*args, **kwargs)

    celery_app.Task = ContextTask
    return celery_app