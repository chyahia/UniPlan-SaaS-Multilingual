import sys
import multiprocessing
import subprocess
import os
import webbrowser
import threading

# ✨ الإصلاح السحري لمشكلة noconsole: إنشاء منافذ وهمية للطباعة
if sys.stdout is None:
    sys.stdout = open(os.devnull, 'w')
if sys.stderr is None:
    sys.stderr = open(os.devnull, 'w')

# استيراد ملفات المشروع
import run
import celery_worker

def open_browser():
    # فتح المتصفح الافتراضي
    webbrowser.open_new('http://127.0.0.1:5000')

def start_flask():
    # تأخير فتح المتصفح لثانية ونصف حتى يقلع الخادم
    threading.Timer(1.5, open_browser).start()
    run.app.run(host='0.0.0.0', port=5000, debug=False)

def start_celery():
    # توجيه سجلات السيليري إلى ملف حقيقي لتفادي الطباعة في الشاشة المخفية
    appdata = os.environ.get('APPDATA')
    log_dir = os.path.join(appdata, 'UniPlanSaaS')
    if not os.path.exists(log_dir):
        os.makedirs(log_dir)
    log_file = os.path.join(log_dir, 'celery_worker.log')
    
    # تمرير مسار السجل في الأوامر
    argv = ['worker', '--loglevel=info', '--pool=solo', f'--logfile={log_file}']
    celery_worker.celery_app.worker_main(argv)

if __name__ == '__main__':
    multiprocessing.freeze_support()

    if len(sys.argv) > 1 and sys.argv[1] == 'worker':
        start_celery()
    else:
        creation_flags = 0
        if sys.platform == "win32":
            creation_flags = subprocess.CREATE_NO_WINDOW

        # تشغيل السيليري مع كتم كل منافذ الإدخال والإخراج لزيادة الأمان
        worker_process = subprocess.Popen(
            [sys.executable, 'worker'],
            creationflags=creation_flags,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            stdin=subprocess.DEVNULL
        )
        
        try:
            start_flask()
        except KeyboardInterrupt:
            worker_process.terminate()