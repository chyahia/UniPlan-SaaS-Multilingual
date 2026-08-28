import sqlite3
import json
import os

# اسم قاعدة بياناتك القديمة (تأكد من مطابقته للاسم الفعلي عندك)
DB_FILE = 'schedule_database.db'
# اسم الملف السحابي الذي سيتم إنتاجه
OUTPUT_JSON = 'uniplan_migrated_backup.json'

def migrate_data():
    if not os.path.exists(DB_FILE):
        print(f"❌ لم يتم العثور على قاعدة البيانات: {DB_FILE}")
        return

    print("⏳ جاري قراءة البيانات من قاعدة البيانات القديمة...")
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # الهيكل السحابي المعتمد في SaaS
    backup_data = {
        "settings": [],
        "course_natures": [],
        "rooms": [],
        "levels": [],
        "teachers": [],
        "users": [],
        "courses": [],
        "teacher_requests": []
    }

    try:
        # 1. استخراج الرموز وطبيعة المواد
        for row in cursor.execute("SELECT * FROM course_natures"):
            backup_data["course_natures"].append({"name": row["name"], "symbol": row["symbol"]})
        
        # 2. استخراج القاعات بأنواعها
        for row in cursor.execute("SELECT * FROM rooms"):
            backup_data["rooms"].append({"name": row["name"], "type": row["type"]})
            
        # 3. استخراج المستويات
        for row in cursor.execute("SELECT * FROM levels"):
            backup_data["levels"].append({"name": row["name"]})
            
        # 4. استخراج الأساتذة
        for row in cursor.execute("SELECT * FROM teachers"):
            # التحقق من وجود عمود show_assigned في النسخ القديمة
            show_assigned = row["show_assigned"] if "show_assigned" in row.keys() else 0
            backup_data["teachers"].append({
                "old_id": row["id"], 
                "name": row["name"], 
                "show_assigned": show_assigned
            })

        # 5. استخراج المواد (مع الشعبة، التخصص، الطبيعة، والمستويات المرتبطة) وإسنادها (teacher_id)
        courses_query = """
            SELECT c.id, c.name, c.room_type, c.division, c.specialization, c.course_nature, c.teacher_id,
                   group_concat(l.name, ',') as level_names
            FROM courses c
            LEFT JOIN course_levels cl ON c.id = cl.course_id
            LEFT JOIN levels l ON cl.level_id = l.id
            GROUP BY c.id
        """
        for row in cursor.execute(courses_query):
            backup_data["courses"].append({
                "old_id": row["id"],
                "name": row["name"],
                "room_type": row["room_type"],
                "division": row["division"] if row["division"] else "",
                "specialization": row["specialization"] if row["specialization"] else "",
                "course_nature": row["course_nature"] if row["course_nature"] else "أعمال موجهة",
                "old_teacher_id": row["teacher_id"], # هنا يتم نقل الإسناد!
                "level_names": row["level_names"].split(',') if row["level_names"] else []
            })

        # حفظ البيانات بصيغة JSON متوافقة مع بيئة SaaS
        with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
            json.dump(backup_data, f, ensure_ascii=False, indent=2)

        print(f"✅ تمت العملية بنجاح! تم استخراج:")
        print(f"  - {len(backup_data['teachers'])} أستاذ")
        print(f"  - {len(backup_data['rooms'])} قاعة")
        print(f"  - {len(backup_data['levels'])} مستوى")
        print(f"  - {len(backup_data['courses'])} مادة (مع تفاصيل الشعب، التخصصات، والإسناد)")
        print(f"\n🚀 يمكنك الآن أخذ ملف '{OUTPUT_JSON}' ورفعه في المنصة السحابية من خلال زر (استعادة نسخة احتياطية json)!")

    except Exception as e:
        print(f"❌ حدث خطأ أثناء تحويل البيانات: {str(e)}")
    finally:
        conn.close()

if __name__ == '__main__':
    migrate_data()