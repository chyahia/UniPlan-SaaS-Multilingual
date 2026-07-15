import threading

class MemoryStore:
    def __init__(self):
        self.logs = {}
        self.status = {}
        self.stop_flags = {}
        self.mutations = {}
        self.lock = threading.Lock()

# كائن عام (Singleton) يحفظ الذاكرة أثناء عمل البرنامج
store = MemoryStore()

class MemoryLogQueue:
    """
    أداة محلية (Desktop) لكتابة وقراءة سجلات الخوارزمية 
    كبديل خفيف جداً عن Redis وبنفس الدوال تماماً!
    """
    def __init__(self, tenant_id):
        self.tenant_id = tenant_id

    def put(self, msg):
        with store.lock:
            if self.tenant_id not in store.logs:
                store.logs[self.tenant_id] = []
            store.logs[self.tenant_id].append(str(msg))

    def get_logs(self, start_index=0):
        with store.lock:
            return list(store.logs.get(self.tenant_id, []))[start_index:]

    def clear_logs(self):
        with store.lock:
            store.logs[self.tenant_id] = []

    def set_running(self, is_running):
        with store.lock:
            store.status[self.tenant_id] = is_running

    def is_running(self):
        with store.lock:
            return store.status.get(self.tenant_id, False)

    def set_stop_flag(self, should_stop):
        with store.lock:
            store.stop_flags[self.tenant_id] = should_stop

    def should_stop(self):
        with store.lock:
            return store.stop_flags.get(self.tenant_id, False)

    # دوال إضافية خاصة بدعم الطفرة (Mutation) للبرنامج الأول
    def set_mutation(self, intensity):
        with store.lock:
            store.mutations[self.tenant_id] = intensity

    def get_mutation(self):
        with store.lock:
            return store.mutations.get(self.tenant_id)

    def clear_mutation(self):
        with store.lock:
            if self.tenant_id in store.mutations:
                del store.mutations[self.tenant_id]