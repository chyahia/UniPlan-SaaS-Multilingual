import sys
import os
import webbrowser
import threading

# ✨ الإصلاح السحري لمشكلة noconsole: إنشاء منافذ وهمية للطباعة
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

# استيراد ملف التشغيل الرئيسي
import run

def open_browser():
    # فتح المتصفح الافتراضي
    webbrowser.open_new('http://127.0.0.1:5000')

def start_flask():
    # تأخير فتح المتصفح لثانية ونصف حتى يقلع الخادم
    threading.Timer(1.5, open_browser).start()
    run.app.run(host='0.0.0.0', port=5000, debug=False)

if __name__ == '__main__':
    # 🚀 بفضل المحول الذكي، لم نعد بحاجة لتشغيل عملية Celery فرعية هنا!
    # فقط نشغل خادم Flask وهو سيتكفل بكل شيء عبر الذاكرة الحية (RAM)
    try:
        start_flask()
    except KeyboardInterrupt:
        pass