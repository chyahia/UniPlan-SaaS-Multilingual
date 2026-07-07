import sqlite3
from app.database import get_smart_db_path
from werkzeug.security import generate_password_hash

# ⬇️ اكتب معلومات الدخول الجديدة التي تريدها هنا ⬇️
NEW_USERNAME = "chaib"
NEW_PASSWORD = "yahia"

def update_admin():
    # 1. جلب مسار قاعدة البيانات مباشرة
    db_path = get_smart_db_path()
    
    # 2. الاتصال المباشر بقاعدة البيانات (بدون المرور عبر بيئة Flask)
    conn = sqlite3.connect(db_path)
    
    # 3. تشفير كلمة المرور
    hashed_pw = generate_password_hash(NEW_PASSWORD)
    
    # 4. تحديث بيانات المدير
    conn.execute("UPDATE users SET username = ?, password_hash = ? WHERE role = 'admin'", 
                 (NEW_USERNAME, hashed_pw))
    
    conn.commit()
    conn.close()
    
    print(f"✅ تم بنجاح تغيير معلومات المدير!")
    print(f"اسم المستخدم الجديد: {NEW_USERNAME}")
    print(f"كلمة المرور الجديدة: {NEW_PASSWORD}")

if __name__ == '__main__':
    update_admin()