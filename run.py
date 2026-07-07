from app import create_app
import os

app = create_app()

if __name__ == '__main__':
    # أخذ المنفذ من متغيرات البيئة الخاصة بالسحابة، أو استخدام 5050 محلياً
    port = int(os.environ.get("PORT", 5050))
    
    # host='0.0.0.0' ضرورية جداً في السحابة لكي يقبل الخادم الاتصالات من الإنترنت (وليس فقط من 127.0.0.1)
    app.run(host='0.0.0.0', port=port, debug=False)