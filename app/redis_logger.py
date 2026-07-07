import redis
import os

# الاتصال بقاعدة بيانات Redis
redis_url = os.environ.get('REDIS_URL', 'redis://127.0.0.1:6379/0')
redis_client = redis.from_url(redis_url, decode_responses=True)

class RedisLogQueue:
    """
    أداة سحابية لكتابة وقراءة سجلات الخوارزمية (الشاشة السوداء) 
    معزولة تماماً برقم القسم (Tenant ID)
    """
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id
        self.log_key = f"logs:tenant_{tenant_id}"
        self.status_key = f"status:tenant_{tenant_id}"
        self.stop_key = f"stop:tenant_{tenant_id}"
        
    def put(self, msg):
        """كتابة سطر جديد في الشاشة السوداء (تعادل log_message القديمة)"""
        redis_client.rpush(self.log_key, str(msg))
        redis_client.expire(self.log_key, 3600) # حذف السجل آلياً بعد ساعة لتنظيف الذاكرة

    def get_logs(self, start_index=0):
        """قراءة السجلات الحية لعرضها في الواجهة"""
        return redis_client.lrange(self.log_key, start_index, -1)
        
    def clear_logs(self):
        """مسح الشاشة السوداء لبدء عملية جديدة"""
        redis_client.delete(self.log_key)
        
    # --- إدارة حالة الخوارزمية (تعمل / متوقفة) ---
    def set_running(self, is_running):
        redis_client.set(self.status_key, "1" if is_running else "0", ex=3600)
        
    def is_running(self):
        return redis_client.get(self.status_key) == "1"
        
    # --- إدارة زر الطوارئ (إيقاف إجباري) ---
    def set_stop_flag(self, should_stop):
        redis_client.set(self.stop_key, "1" if should_stop else "0", ex=3600)
        
    def should_stop(self):
        return redis_client.get(self.stop_key) == "1"