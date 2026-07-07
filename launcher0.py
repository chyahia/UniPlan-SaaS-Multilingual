import sys
import multiprocessing
import subprocess
import os
import webbrowser
import threading

# استيراد ملفات المشروع
import run
import celery_worker

def open_browser():
    webbrowser.open_new('http://127.0.0.1:5000')

def start_flask():
    threading.Timer(1.5, open_browser).start()
    run.app.run(host='0.0.0.0', port=5000, debug=False)

def start_celery():
    argv = ['worker', '--loglevel=info', '--pool=solo']
    celery_worker.celery_app.worker_main(argv)

if __name__ == '__main__':
    multiprocessing.freeze_support()

    if len(sys.argv) > 1 and sys.argv[1] == 'worker':
        start_celery()
    else:
        # ✨ التعديل هنا: منع انبثاق الشاشة السوداء للعمليات الفرعية في ويندوز
        creation_flags = 0
        if sys.platform == "win32":
            creation_flags = subprocess.CREATE_NO_WINDOW

        # تشغيل السيليري في الخلفية بصمت تام
        worker_process = subprocess.Popen(
            [sys.executable, 'worker'],
            creationflags=creation_flags
        )
        
        try:
            start_flask()
        except KeyboardInterrupt:
            worker_process.terminate()