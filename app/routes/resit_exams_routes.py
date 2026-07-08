import os
import json
from flask import Blueprint, render_template, request, redirect, url_for, flash, send_file, jsonify, session
from io import BytesIO

# استدعاء دوال إدارة البيانات السحابية (الجديدة)
from app.resit_data_manager import (
    load_full_db, save_full_db,
    add_teacher, remove_teacher, edit_teacher_name,
    add_room, remove_room, edit_room_name,
    add_level, remove_level, edit_level_name,
    add_subject, remove_subject, edit_subject_name,
    update_complex_state
)

# ملاحظة: سنقوم بربط الخوارزمية لاحقاً بـ Celery
# from app.solver import run_distribution
# from app.exporter import generate_levels_word, generate_teachers_word

# إنشاء الـ Blueprint الخاص بالامتحانات الاستدراكية
resit_exams_bp = Blueprint('resit_exams', __name__, url_prefix='/resit_exams')

# ==========================================
# 🌟 حماية المسارات (التأكد من تسجيل الدخول)
# ==========================================
@resit_exams_bp.before_request
def require_login():
    if 'user_id' not in session:
        return redirect(url_for('auth.login'))
    # نمنع فقط الأساتذة من الدخول، ونسمح لأي إدارة (مهما كان اسم الصلاحية)
    if session.get('role') == 'teacher':
        flash("غير مصرح لك بالدخول إلى هذا النظام.", "danger")
        return redirect(url_for('portal'))

# ==========================================
# المسار الرئيسي
# ==========================================
@resit_exams_bp.route('/')
def index():
    db_dict = load_full_db()
    return render_template('resit_exams/index.html', db=db_dict)

# ==========================================
# إدارة البيانات الأساسية
# ==========================================
@resit_exams_bp.route('/manage_data', methods=['GET', 'POST'])
def manage_data():
    db_dict = load_full_db()
    
    if request.method == 'POST':
        action = request.form.get('action')
        
        # --- الإضافة ---
        if action == 'add_teacher':
            t_input = request.form.get('teachers_input')
            if t_input:
                new_t = list(dict.fromkeys([n.strip() for n in t_input.split('\n') if n.strip()]))
                for t in new_t: add_teacher(t)
                flash(f"تم إضافة {len(new_t)} أستاذ بنجاح.", "success")
                
        elif action == 'add_room':
            r_type = request.form.get('room_type')
            r_input = request.form.get('rooms_input')
            if r_input:
                new_r = list(dict.fromkeys([n.strip() for n in r_input.split('\n') if n.strip()]))
                for r in new_r: add_room(r, r_type)
                flash(f"تم إضافة {len(new_r)} قاعة بنجاح.", "success")
                
        elif action == 'add_level':
            l_input = request.form.get('levels_input')
            if l_input:
                new_l = list(dict.fromkeys([n.strip() for n in l_input.split('\n') if n.strip()]))
                for l in new_l: add_level(l)
                flash(f"تم إضافة {len(new_l)} مستوى بنجاح.", "success")
                
        elif action == 'add_subject':
            s_level = request.form.get('subject_level')
            s_input = request.form.get('subjects_input')
            if s_input and s_level:
                new_s = list(dict.fromkeys([n.strip() for n in s_input.split('\n') if n.strip()]))
                for sub in new_s: add_subject(sub, s_level)
                flash(f"تم إضافة {len(new_s)} مادة بنجاح.", "success")

        # --- الحذف (مع التنظيف) ---
        elif action == 'delete_teacher':
            t_del = request.form.get('teacher_name')
            if t_del:
                remove_teacher(t_del)
                ts_dict = db_dict.get('teacher_subjects', {})
                if t_del in ts_dict:
                    del ts_dict[t_del]
                    update_complex_state('teacher_subjects', ts_dict)
                flash(f"تم حذف الأستاذ {t_del} وتنظيف ارتباطاته.", "danger")

        elif action == 'delete_room':
            r_del = request.form.get('room_name')
            if r_del:
                remove_room(r_del)
                lr_dict = db_dict.get('level_rooms', {})
                for lvl in lr_dict:
                    lr_dict[lvl] = [r for r in lr_dict[lvl] if not r.startswith(r_del)]
                update_complex_state('level_rooms', lr_dict)
                flash(f"تم حذف القاعة {r_del}.", "danger")

        elif action == 'delete_level':
            l_del = request.form.get('level_name')
            if l_del:
                remove_level(l_del)
                # حذف المواد المرتبطة
                db_dict['subjects'] = [s for s in db_dict['subjects'] if s['level'] != l_del]
                save_full_db(db_dict)
                
                # تنظيف الإسنادات
                ts_dict = db_dict.get('teacher_subjects', {})
                for t in ts_dict:
                    ts_dict[t] = [sub for sub in ts_dict[t] if not sub.endswith(f"({l_del})")]
                update_complex_state('teacher_subjects', ts_dict)
                flash(f"تم حذف المستوى {l_del} وارتباطاته بنجاح.", "danger")

        elif action == 'delete_subject':
            subject_identifier = request.form.get('subject_identifier')
            if subject_identifier and '|' in subject_identifier:
                s_del, l_for_s = subject_identifier.split('|')
                remove_subject(s_del, l_for_s)
                
                ts_dict = db_dict.get('teacher_subjects', {})
                target_sub = f"{s_del} ({l_for_s})"
                for t in ts_dict:
                    if target_sub in ts_dict[t]:
                        ts_dict[t].remove(target_sub)
                update_complex_state('teacher_subjects', ts_dict)
                flash(f"تم حذف المادة {s_del}.", "danger")

        # --- التعديل ---
        elif action == 'edit_teacher':
            old_name = request.form.get('old_name')
            new_name = request.form.get('new_name', '').strip()
            if old_name and new_name and old_name != new_name:
                edit_teacher_name(old_name, new_name)
                ts_dict = db_dict.get('teacher_subjects', {})
                if old_name in ts_dict:
                    ts_dict[new_name] = ts_dict.pop(old_name)
                    update_complex_state('teacher_subjects', ts_dict)
                flash(f"تم تعديل الأستاذ إلى [{new_name}].", "success")

        elif action == 'edit_room':
            old_name = request.form.get('old_name')
            new_name = request.form.get('new_name', '').strip()
            if old_name and new_name and old_name != new_name:
                edit_room_name(old_name, new_name)
                lr_dict = db_dict.get('level_rooms', {})
                modified_lr = False
                for lvl in lr_dict:
                    updated_rooms = []
                    for r in lr_dict[lvl]:
                        if r.startswith(f"{old_name} ("):
                            updated_rooms.append(r.replace(f"{old_name} (", f"{new_name} (", 1))
                            modified_lr = True
                        else:
                            updated_rooms.append(r)
                    lr_dict[lvl] = updated_rooms
                if modified_lr:
                    update_complex_state('level_rooms', lr_dict)
                flash(f"تم تعديل القاعة إلى [{new_name}].", "success")

        return redirect(url_for('resit_exams.manage_data'))

    return render_template('resit_exams/manage_data.html', db=db_dict)

# ==========================================
# مرحلة إسناد المواد
# ==========================================
@resit_exams_bp.route('/assign_subjects', methods=['GET', 'POST'])
def assign_subjects():
    db_dict = load_full_db()
    ts_dict = db_dict.get('teacher_subjects', {})
    
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'assign_selected':
            t_name = request.form.get('teacher_name')
            subjects_json = request.form.get('subjects_list')
            
            if t_name and subjects_json:
                subjects_list = json.loads(subjects_json)
                if t_name not in ts_dict:
                    ts_dict[t_name] = []
                
                for s in subjects_list:
                    for other_t in ts_dict:
                        if s in ts_dict[other_t]:
                            ts_dict[other_t].remove(s)
                    if s not in ts_dict[t_name]:
                        ts_dict[t_name].append(s)
                        
                update_complex_state('teacher_subjects', ts_dict)
                flash(f"تم تخصيص المواد للأستاذ {t_name}.", "success")
                
        elif action == 'unassign_teacher':
            t_name = request.form.get('teacher_name')
            if t_name in ts_dict:
                ts_dict[t_name] = []
                update_complex_state('teacher_subjects', ts_dict)
                flash(f"تم إلغاء مواد الأستاذ {t_name}.", "warning")
                
        elif action == 'unassign_subject':
            s_name = request.form.get('subject_name')
            for t in ts_dict:
                if s_name in ts_dict[t]:
                    ts_dict[t].remove(s_name)
            update_complex_state('teacher_subjects', ts_dict)
            flash(f"تم إلغاء إسناد المادة {s_name}.", "warning")
            
        return redirect(url_for('resit_exams.assign_subjects'))

    subject_to_teacher = {}
    for t, subs in ts_dict.items():
        for s in subs:
            subject_to_teacher[s] = t

    return render_template('resit_exams/assign_subjects.html', db=db_dict, subject_to_teacher=subject_to_teacher)

# ==========================================
# تخصيص القاعات
# ==========================================
@resit_exams_bp.route('/assign_rooms', methods=['GET', 'POST'])
def assign_rooms():
    db_dict = load_full_db()
    
    if request.method == 'POST':
        action = request.form.get('action')
        if action == 'save_level_rooms':
            new_level_rooms = {}
            for level in db_dict.get('levels', []):
                selected_rooms = request.form.getlist(f'rooms_for_{level}')
                if selected_rooms:
                    new_level_rooms[level] = selected_rooms
                
            update_complex_state('level_rooms', new_level_rooms)
            flash("تم حفظ تخصيص القاعات بنجاح!", "success")
            return redirect(url_for('resit_exams.assign_rooms'))
            
    return render_template('resit_exams/assign_rooms.html', db=db_dict)


import datetime
ARABIC_DAYS = {6: "الأحد", 0: "الإثنين", 1: "الثلاثاء", 2: "الأربعاء", 3: "الخميس", 4: "الجمعة", 5: "السبت"}

# ==========================================
# أيام وأوقات الامتحان
# ==========================================
@resit_exams_bp.route('/manage_schedule', methods=['GET', 'POST'])
def manage_schedule():
    db_dict = load_full_db()
    schedule = db_dict.get('schedule', {})
        
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'add_day':
            date_str = request.form.get('exam_date')
            if date_str:
                date_obj = datetime.datetime.strptime(date_str, '%Y-%m-%d')
                day_name = ARABIC_DAYS[date_obj.weekday()]
                new_day = f"{day_name} ({date_str})"
                if new_day not in schedule:
                    schedule[new_day] = []
                    update_complex_state('schedule', schedule)
                    flash(f"تم إضافة يوم {new_day}.", "success")
                    
        elif action == 'delete_day':
            day_to_del = request.form.get('day_key')
            if day_to_del in schedule:
                del schedule[day_to_del]
                update_complex_state('schedule', schedule)
                flash(f"تم حذف يوم {day_to_del}.", "danger")
                
        elif action == 'add_time':
            day_key = request.form.get('day_key')
            time_val = request.form.get('time_val')
            if day_key and time_val:
                schedule[day_key].append({
                    "time": time_val, 
                    "primary_levels": [], 
                    "reserve_levels": []
                })
                update_complex_state('schedule', schedule)
                flash("تم إضافة الفترة الزمنية.", "success")
                
        elif action == 'delete_time':
            day_key = request.form.get('day_key')
            time_idx = request.form.get('time_idx')
            if day_key in schedule and time_idx is not None:
                try:
                    idx = int(time_idx)
                    del schedule[day_key][idx]
                    if not schedule[day_key]: del schedule[day_key]
                    update_complex_state('schedule', schedule)
                except ValueError: pass
                
        elif action == 'save_levels':
            day_key = request.form.get('day_key')
            if day_key in schedule:
                for idx, slot in enumerate(schedule[day_key]):
                    slot['primary_levels'] = request.form.getlist(f"primary_levels_{idx}")
                    slot['reserve_levels'] = request.form.getlist(f"reserve_levels_{idx}")
                update_complex_state('schedule', schedule)
                flash("تم تحديث المستويات في الفترات.", "success")
                
        return redirect(url_for('resit_exams.manage_schedule'))
        
    return render_template('resit_exams/manage_schedule.html', db=db_dict)


# ==========================================
# إدارة القيود والشروط (المسار المفقود)
# ==========================================
@resit_exams_bp.route('/manage_constraints', methods=['GET', 'POST'])
def manage_constraints():
    db_dict = load_full_db()
    
    # تهيئة ذواكر القيود إذا لم تكن موجودة
    if 'constraints' not in db_dict:
        db_dict['constraints'] = {}
        
    c_db = db_dict['constraints']
    if 'incompatible_levels' not in c_db: c_db['incompatible_levels'] = []
    if 'prioritized_teachers' not in c_db: c_db['prioritized_teachers'] = []
    if 'carpool_pairs' not in c_db: c_db['carpool_pairs'] = []
    if 'conflict_pairs' not in c_db: c_db['conflict_pairs'] = []
    if 'no_first_slot_teachers' not in c_db: c_db['no_first_slot_teachers'] = []

    if request.method == 'POST':
        action = request.form.get('action')
        
        # 1. قيد تعارض المستويات
        if action == 'add_incompatible':
            l1, l2 = request.form.get('level1'), request.form.get('level2')
            if l1 and l2 and l1 != l2:
                pair = sorted([l1, l2])
                if pair not in c_db['incompatible_levels']:
                    c_db['incompatible_levels'].append(pair)
                    update_complex_state('constraints', c_db)
                    flash("تم إضافة قيد تعارض المستويات.", "success")
        elif action == 'del_incompatible':
            idx = int(request.form.get('idx'))
            c_db['incompatible_levels'].pop(idx)
            update_complex_state('constraints', c_db)
            flash("تم حذف القيد.", "danger")
            
        # 2. الأساتذة ذوو الأولوية
        elif action == 'add_prioritized':
            teacher = request.form.get('teacher')
            if teacher and teacher not in c_db['prioritized_teachers']:
                c_db['prioritized_teachers'].append(teacher)
                update_complex_state('constraints', c_db)
                flash(f"تم إضافة الأستاذ [{teacher}] لقائمة الأولوية بنجاح.", "success")

        elif action == 'add_all_prioritized':
            all_teachers = db_dict.get('teachers', [])
            added_count = 0
            for t in all_teachers:
                if t not in c_db['prioritized_teachers']:
                    c_db['prioritized_teachers'].append(t)
                    added_count += 1
            
            if added_count > 0:
                update_complex_state('constraints', c_db)
                flash(f"تم إضافة جميع الأساتذة المتبقين وعددهم ({added_count}) إلى قائمة الأولوية.", "success")
            else:
                flash("جميع الأساتذة متواجدون بالفعل في قائمة الأولوية.", "info")
            
        elif action == 'del_prioritized':
            teacher = request.form.get('teacher')
            if teacher and teacher in c_db.get('prioritized_teachers', []):
                c_db['prioritized_teachers'].remove(teacher)
            else:
                idx = request.form.get('idx')
                if idx is not None:
                    c_db['prioritized_teachers'].pop(int(idx))
            update_complex_state('constraints', c_db)
            flash("تم حذف الأستاذ من قائمة الأولوية بنجاح.", "danger")
        
        # 3. أساتذة في سيارة واحدة (مرافقة)
        elif action == 'add_carpool':
            t1, t2 = request.form.get('t1'), request.form.get('t2')
            if t1 and t2 and t1 != t2:
                pair = sorted([t1, t2])
                if pair not in c_db['carpool_pairs']:
                    c_db['carpool_pairs'].append(pair)
                    update_complex_state('constraints', c_db)
                    flash("تم إضافة قيد المرافقة.", "success")
        elif action == 'del_carpool':
            idx = int(request.form.get('idx'))
            c_db['carpool_pairs'].pop(idx)
            update_complex_state('constraints', c_db)
            flash("تم حذف قيد المرافقة.", "danger")
            
        # 4. قيد الانفصال (عدم الاشتراك)
        elif action == 'add_conflict':
            t1, t2 = request.form.get('t1'), request.form.get('t2')
            if t1 and t2 and t1 != t2:
                pair = sorted([t1, t2])
                if pair not in c_db['conflict_pairs']:
                    c_db['conflict_pairs'].append(pair)
                    update_complex_state('constraints', c_db)
                    flash("تم إضافة قيد الانفصال.", "success")
        elif action == 'del_conflict':
            idx = int(request.form.get('idx'))
            c_db['conflict_pairs'].pop(idx)
            update_complex_state('constraints', c_db)
            flash("تم حذف قيد الانفصال.", "danger")
            
        # 5. إعفاء من الحصة الأولى
        elif action == 'add_no_first':
            t = request.form.get('teacher')
            if t and t not in c_db['no_first_slot_teachers']:
                c_db['no_first_slot_teachers'].append(t)
                update_complex_state('constraints', c_db)
                flash("تم إعفاء الأستاذ من الحصة الأولى.", "success")
        elif action == 'del_no_first':
            t = request.form.get('teacher')
            c_db['no_first_slot_teachers'].remove(t)
            update_complex_state('constraints', c_db)
            flash("تم إلغاء الإعفاء.", "danger")
            
        # 6. مجموعات العزل
        elif action == 'add_isolation_group':
            group_name = request.form.get('group_name', '').strip()
            group_levels = request.form.getlist('group_levels')
            if group_name and group_levels:
                if 'isolation_groups' not in c_db:
                    c_db['isolation_groups'] = {}
                c_db['isolation_groups'][group_name] = group_levels
                update_complex_state('constraints', c_db)
                flash(f"تم إنشاء مجموعة العزل [{group_name}] وتشفير مستوياتها بنجاح.", "success")
                
        elif action == 'del_isolation_group':
            group_name = request.form.get('group_name')
            if 'isolation_groups' in c_db and group_name in c_db['isolation_groups']:
                del c_db['isolation_groups'][group_name]
                update_complex_state('constraints', c_db)
                flash(f"تم فك العزل وحذف المجموعة [{group_name}].", "success")
        
        return redirect(url_for('resit_exams.manage_constraints'))
        
    return render_template('resit_exams/manage_constraints.html', db=db_dict, c_db=c_db)

# ==========================================
# 🌟 الاستيراد المباشر من الامتحانات السداسية
# ==========================================
@resit_exams_bp.route('/import_from_exams', methods=['POST'])
def import_from_exams():
    try:
        # 1. استيراد النماذج (Models) الخاصة بالامتحانات السداسية من قاعدة البيانات
        from app.database import ExamTeacher, ExamRoom, ExamLevel, ExamSubject
        
        tenant_id = session.get('tenant_id')
        if not tenant_id:
            flash("غير مصرح لك بإجراء هذه العملية.", "danger")
            return redirect(url_for('resit_exams.manage_data'))
        
        # 2. جلب البيانات الفعلية من جداول الامتحانات السداسية للقسم الحالي
        exams_teachers = ExamTeacher.query.filter_by(tenant_id=tenant_id).all()
        exams_rooms = ExamRoom.query.filter_by(tenant_id=tenant_id).all()
        exams_levels = ExamLevel.query.filter_by(tenant_id=tenant_id).all()
        exams_subjects = ExamSubject.query.filter_by(tenant_id=tenant_id).all()
        
        # التحقق مما إذا كانت هناك بيانات فعلياً
        if not exams_teachers and not exams_subjects:
            flash("⚠️ البيانات في نظام الامتحانات السداسية تبدو فارغة. تأكد من إدخالها هناك أولاً.", "warning")
            return redirect(url_for('resit_exams.manage_data'))
            
        # 3. جلب صندوق الاستدراكي الحالي
        resit_db = load_full_db()
        
        # 4. تحويل البيانات العلائقية إلى صيغة القاموس (JSON) الخاصة بالاستدراكي
        
        # أ. الأساتذة
        resit_db['teachers'] = [t.name for t in exams_teachers]
        
        # ب. القاعات (تحويل إلى قاموس: الاسم -> النوع)
        resit_db['rooms'] = {r.name: r.type for r in exams_rooms}
        
        # ج. المستويات
        resit_db['levels'] = [l.name for l in exams_levels]
        
        # د. المواد (تحويل إلى قائمة قواميس)
        resit_db['subjects'] = [
            {"name": s.name, "level": s.level.name if s.level else "بدون مستوى"}
            for s in exams_subjects
        ]
        
        # هـ. الإسناد (استخراج مواد كل أستاذ بذكاء)
        teacher_subjects_dict = {}
        for t in exams_teachers:
            assigned_subs = []
            for s in t.subjects:
                level_name = s.level.name if s.level else "بدون مستوى"
                # تنسيق اسم المادة ليتوافق مع نظام الاستدراكي: "اسم المادة (المستوى)"
                assigned_subs.append(f"{s.name} ({level_name})")
            
            if assigned_subs:
                teacher_subjects_dict[t.name] = assigned_subs
                
        resit_db['teacher_subjects'] = teacher_subjects_dict
        
        # 5. حفظ التغييرات في قاعدة بيانات الاستدراكي
        save_full_db(resit_db)
        
        flash(f"✅ تم سحب البيانات بنجاح! استُورِد: ({len(resit_db['teachers'])}) أستاذ، ({len(resit_db['rooms'])}) قاعة، و({len(resit_db['subjects'])}) مادة.", "success")
        
    except Exception as e:
        flash(f"❌ خطأ في الاستيراد: {str(e)}", "danger")
        
    return redirect(url_for('resit_exams.manage_data'))


# ==========================================
# 🌟 مسارات الاستيراد والتصدير المتوافقة مع السحابة (SaaS)
# ==========================================
@resit_exams_bp.route('/export_data')
def export_data():
    """تصدير بيانات الاستدراكي للقسم الحالي على شكل JSON (آمن)"""
    db_dict = load_full_db()
    
    # تحويل القاموس إلى ملف JSON في الذاكرة
    json_data = json.dumps(db_dict, ensure_ascii=False, indent=4)
    buffer = BytesIO()
    buffer.write(json_data.encode('utf-8'))
    buffer.seek(0)
    
    return send_file(
        buffer, 
        as_attachment=True, 
        download_name='resit_exam_backup.json',
        mimetype='application/json'
    )

@resit_exams_bp.route('/import_smart', methods=['POST'])
def import_smart():
    """استيراد وتفريغ البيانات من ملف JSON بأمان تام"""
    if 'data_file' not in request.files:
        return redirect(url_for('resit_exams.manage_data'))
        
    file = request.files['data_file']
    if file.filename.endswith('.json'):
        try:
            # قراءة الملف من الذاكرة دون حفظه في السيرفر
            file_content = file.read().decode('utf-8')
            imported_data = json.loads(file_content)
            
            # حفظ البيانات الكاملة في الصندوق الخاص بالقسم
            save_full_db(imported_data)
            flash("✅ تم استعادة بيانات الاستدراكي بنجاح!", "success")
            
        except Exception as e:
            flash(f"❌ حدث خطأ أثناء الاستيراد: {str(e)}", "danger")
    else:
        flash("❌ يرجى رفع ملف بصيغة .json", "danger")
        
    return redirect(url_for('resit_exams.manage_data'))


from app.resit_exporter import generate_levels_word, generate_teachers_word

# ==========================================
# 🌟 مسارات تشغيل الخوارزمية (SaaS)
# ==========================================
@resit_exams_bp.route('/generate_schedule', methods=['GET'])
def generate_schedule():
    db_dict = load_full_db()
    # جلب المخالفات من التوليد السابق إن وجدت
    app_state = {'is_generated': 'final_schedule' in db_dict, 'violations': db_dict.get('final_violations', [])}
    return render_template('resit_exams/generate_schedule.html', db=db_dict, app_state=app_state)

# ==========================================
# 🌟 مسارات تشغيل الخوارزمية (SaaS)
# ==========================================
@resit_exams_bp.route('/start_solver', methods=['POST'])
def start_solver():
    # ✨ الحل السحري: الاستيراد من داخل الدالة لكسر الدوامة الدائرية
    from app.resit_tasks import run_resit_distribution_task
    
    data = request.get_json(silent=True) or request.form or {}
    
    algo_choice = data.get('algo_choice', 'lns')
    strategy = data.get('strategy', 'teacher')
    
    try:
        duration = int(float(data.get('lns_duration') or data.get('duration') or 10))
        destruction_rate = int(float(data.get('lns_destruction') or data.get('destruction_rate') or 20))
    except (ValueError, TypeError):
        duration, destruction_rate = 10, 20
        
    # حفظ الإعدادات لتبقى للمرة القادمة
    db_dict = load_full_db()
    constraints = db_dict.get('constraints', {})
    constraints.update({'algo_choice': algo_choice, 'strategy': strategy, 'duration': duration, 'destruction_rate': destruction_rate})
    update_complex_state('constraints', constraints)
    
    # 🚀 إرسال المهمة لخادم المهام (Celery)
    tenant_id = session.get('tenant_id')
    task = run_resit_distribution_task.delay(tenant_id, algo_choice, duration, destruction_rate, strategy)
    
    # حفظ رقم المهمة في الجلسة ليتمكن المتصفح من متابعتها
    session['resit_task_id'] = task.id
    
    return jsonify({"status": "started", "duration_used": duration})

@resit_exams_bp.route('/solver_progress')
def get_solver_progress():
    # ✨ الاستيراد هنا أيضاً
    from app.resit_tasks import run_resit_distribution_task
    
    task_id = session.get('resit_task_id')
    if not task_id:
        return jsonify({"is_running": False, "done": False})
        
    task = run_resit_distribution_task.AsyncResult(task_id)
    if task.state == 'PENDING':
        response = {"is_running": True, "elapsed": 0, "done": False}
    elif task.state == 'PROGRESS':
        response = {
            "is_running": True, "done": False,
            "elapsed": task.info.get('elapsed', 0),
            "duration": task.info.get('duration', 10),
            "unassigned": task.info.get('unassigned', 0),
            "hard": task.info.get('hard', 0),
            "soft": task.info.get('soft', 0)
        }
    elif task.state == 'SUCCESS':
        response = {"is_running": False, "done": True}
    else:
        response = {"is_running": False, "done": True, "error": str(task.info)}
        
    return jsonify(response)

# ==========================================
# 🌟 مسارات تحميل ملفات Word
# ==========================================
@resit_exams_bp.route('/download/<doc_type>')
def download_doc(doc_type):
    db_dict = load_full_db()
    final_schedule = db_dict.get('final_schedule')
        
    if not final_schedule:
        flash("لم يتم توليد الجدول بعد.", "danger")
        return redirect(url_for('resit_exams.generate_schedule'))
        
    if doc_type == 'levels':
        doc_stream = generate_levels_word(db_dict, final_schedule)
        filename = "جداول_المستويات_استدراكي.docx"
    elif doc_type == 'teachers':
        doc_stream = generate_teachers_word(db_dict, final_schedule)
        filename = "جداول_الأساتذة_استدراكي.docx"
    else:
        return redirect(url_for('resit_exams.generate_schedule'))
        
    doc_stream.seek(0)
    return send_file(
        doc_stream, 
        as_attachment=True, 
        download_name=filename, 
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )