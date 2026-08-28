# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from flask import Blueprint, render_template, session, redirect, url_for, jsonify, request
from app.database import db, Teacher, Course, Setting, TeacherRequest, ExamSetting, ExamTeacher
import json
from flask_babel import _ # ✨ استيراد دالة الترجمة

teacher_portal_bp = Blueprint('teacher_portal', __name__)

@teacher_portal_bp.route('/teacher')
def teacher_dashboard():
    if session.get('role') != 'teacher':
        return redirect(url_for('auth.login'))
    return render_template('teacher_portal.html')

@teacher_portal_bp.route('/api/teacher/data')
def get_teacher_data():
    if session.get('role') != 'teacher': return jsonify({"error": _("غير مصرح")}), 403
    
    teacher_id = session.get('teacher_id')
    tenant_id = session.get('tenant_id')
    
    teacher = Teacher.query.filter_by(id=teacher_id, tenant_id=tenant_id).first()
    if not teacher: return jsonify({"error": _("الأستاذ غير موجود")}), 404
        
    teacher_name = teacher.name
    show_assigned = getattr(teacher, 'show_assigned', 0)

    # 1. جلب بيانات التدريس (كما هي)
    courses = Course.query.filter_by(tenant_id=tenant_id).all()
    grouped_courses = {}
    for c in courses:
        if c.teacher_id is None:
            levels_str = _("، ").join([l.name for l in c.levels]) # ✨ ترجمة الفاصلة
            if levels_str not in grouped_courses:
                grouped_courses[levels_str] = []
            grouped_courses[levels_str].append({
                "id": c.id, "name": c.name, "room_type": c.room_type, "teacher_id": c.teacher_id
            })

    struct_setting = Setting.query.filter_by(key='schedule_structure', tenant_id=tenant_id).first()
    struct = json.loads(struct_setting.value) if struct_setting and struct_setting.value else []
    days = [d['name'] for d in struct]

    req = TeacherRequest.query.filter_by(teacher_id=teacher_id, tenant_id=tenant_id).first()
    pub_setting = Setting.query.filter_by(key='is_published', tenant_id=tenant_id).first()
    # 🟢 تعديل 1: السماح بقراءة 'true' أو '1' لتطابق لوحة الإدارة
    is_published = pub_setting.value in ['1', 'true', 'True'] if pub_setting else False
    
    lock_setting = Setting.query.filter_by(key='requests_locked', tenant_id=tenant_id).first()
    requests_locked = lock_setting.value == 'true' if lock_setting else False

    my_schedule = []
    # 🟢 تعديل 2: جلب الجداول من published_schedule الذي تصدره الإدارة
    sched_setting = Setting.query.filter_by(key='published_schedule', tenant_id=tenant_id).first()
    
    if is_published and sched_setting and sched_setting.value:
        all_prof_schedules = json.loads(sched_setting.value)
        # 🟢 تعديل 3: استخراج جدول هذا الأستاذ مباشرة بصيغة المصفوفة التي تفهمها الجافاسكريبت
        my_schedule = all_prof_schedules.get(teacher_name, [])

    assigned_courses = [{"name": c.name, "level": _("، ").join([l.name for l in c.levels])} for c in courses if c.teacher_id == teacher_id]
    
    cond_setting = Setting.query.filter_by(key='schedule_conditions', tenant_id=tenant_id).first()
    cond = json.loads(cond_setting.value) if cond_setting and cond_setting.value else {}
    max_sess_global = int(cond.get('global', {}).get('max_slots', 10))
    max_courses_count = max_sess_global
    teacher_rules = cond.get('teacher_rules', {}).get(str(teacher_id))
    if teacher_rules and teacher_rules.get('limits') and 'always_s2_e4' in teacher_rules['limits']:
        max_courses_count = 12

    # 2. 🌟 الجزء الجديد: جلب بيانات الامتحانات الخاصة بالأستاذ 🌟
    pub_exam_setting = ExamSetting.query.filter_by(key='is_exam_published', tenant_id=tenant_id).first()
    is_exam_published = pub_exam_setting.value == '1' if pub_exam_setting else False
    
    my_exam_schedule = []
    exam_dates = []
    exam_times = []
    
    if is_exam_published:
        sched_exam_setting = ExamSetting.query.filter_by(key='published_exam_schedule', tenant_id=tenant_id).first()
        if sched_exam_setting and sched_exam_setting.value:
            full_exam_sched = json.loads(sched_exam_setting.value)
            
            # استخراج التواريخ والفترات لبناء الشبكة في الواجهة
            # ترتيب الأيام زمنياً بناءً على التاريخ الموجود بين القوسين
            exam_dates = sorted(list(full_exam_sched.keys()), key=lambda x: x.split('(')[1].strip(')') if '(' in x else x)
            times_set = set()
            for day_data in full_exam_sched.values():
                for t in day_data.keys():
                    times_set.add(t)
            exam_times = sorted(list(times_set))

            # معرفة المواد المملوكة للأستاذ
            exam_teacher = ExamTeacher.query.filter_by(name=teacher_name, tenant_id=tenant_id).first()
            owned_subjects = []
            # --- 1. في الجزء الخاص بـ (معرفة المواد المملوكة للأستاذ) ---
            if exam_teacher:
                for s in exam_teacher.subjects:
                    levels_list = sorted([l.name for l in s.levels]) if hasattr(s, 'levels') and s.levels else []
                    # ❌ تم إزالة الترجمة من هنا لكي يتطابق مع قاعدة البيانات
                    c_level = " + ".join(levels_list) if levels_list else "بدون مستوى" 
                    owned_subjects.append((s.name, c_level))

            # --- 2. في الجزء الخاص بـ (تفريغ الجدول واستخراج حصص الأستاذ فقط) ---
            for date, time_slots in full_exam_sched.items():
                for time_slot, exams in time_slots.items():
                    for exam in exams:
                        is_guard = teacher_name in exam.get('guards', [])
                        is_owner = (exam.get('subject'), exam.get('level')) in owned_subjects
                        
                        if is_guard or is_owner:
                            # ❌ تم إزالة الترجمة من المتغير الداخلي ليتمكن JS من قراءته
                            role = "حارس" if is_guard else "أستاذ المادة"
                            if is_guard and is_owner: role = "حارس + أستاذ المادة"
                            
                            halls = ", ".join([h['name'] for h in exam.get('halls', [])])
                            
                            my_exam_schedule.append({
                                "date": date,
                                "time": time_slot,
                                "subject": exam.get('subject'),
                                "level": exam.get('level'),
                                "halls": halls,
                                "role": role
                            })

    # 3. 🌟 الجزء الجديد جداً: جلب بيانات الامتحانات الاستدراكية 🌟
    pub_resit_setting = ExamSetting.query.filter_by(key='is_resit_published', tenant_id=tenant_id).first()
    is_resit_published = pub_resit_setting.value == '1' if pub_resit_setting else False
    
    my_resit_schedule = []
    resit_dates = []
    resit_times = []
    
    if is_resit_published:
        sched_resit_setting = ExamSetting.query.filter_by(key='published_resit_schedule', tenant_id=tenant_id).first()
        if sched_resit_setting and sched_resit_setting.value:
            full_resit_sched = json.loads(sched_resit_setting.value)
            
            # ترتيب أيام الاستدراكي زمنياً أيضاً
            resit_dates = sorted(list(full_resit_sched.keys()), key=lambda x: x.split('(')[1].strip(')') if '(' in x else x)
            r_times_set = set()
            for day_data in full_resit_sched.values():
                for t in day_data.keys():
                    r_times_set.add(t)
            resit_times = sorted(list(r_times_set))
            
            # استخراج حصص الأستاذ من الهيكل الاستدراكي
            for date, time_slots in full_resit_sched.items():
                for time_slot, levels in time_slots.items():
                    for level, data in levels.items():
                        is_owner = teacher_name in data.get('subject_teachers', [])
                        
                        is_guard = False
                        my_rooms = []
                        for room, guards in data.get('rooms', {}).items():
                            if teacher_name in guards:
                                is_guard = True
                                my_rooms.append(room)
                                
                        if is_guard or is_owner:
                            # ❌ تم إزالة الترجمة هنا أيضاً لنفس السبب
                            role = "حارس" if is_guard else "أستاذ المادة"
                            if is_guard and is_owner: role = "حارس + أستاذ المادة"
                            
                            # (يمكنك ترك الترجمة هنا لأن halls_str يُطبع مباشرة للمستخدم ولا يعتمد عليه الـ JS في الشروط)
                            halls_str = _("، ").join(my_rooms) if my_rooms else _("متابعة عامة")
                            
                            my_resit_schedule.append({
                                "date": date,
                                "time": time_slot,
                                "subject": data.get('subject', ''),
                                "level": level,
                                "halls": halls_str,
                                "role": role
                            })
    
    return jsonify({
        "teacher_name": teacher_name,
        "max_courses_count": max_courses_count,
        "grouped_courses": grouped_courses,
        "days": days,
        "structure": struct,          
        "is_published": is_published, 
        "requests_locked": requests_locked,
        "my_schedule": my_schedule,   
        "show_assigned": bool(show_assigned),
        "assigned_courses": assigned_courses,
        "assigned_count": len(assigned_courses),
        "request": {
            "courses": json.loads(req.requested_courses) if req and req.requested_courses else [],
            "days": json.loads(req.requested_days) if req and req.requested_days else [],
            "has_submitted": True if req else False
        },
        # المتغيرات المرسلة لجدول الامتحانات
        "is_exam_published": is_exam_published,
        "exam_dates": exam_dates,
        "exam_times": exam_times,
        "my_exam_schedule": my_exam_schedule,
        "is_resit_published": is_resit_published,
        "resit_dates": resit_dates,
        "resit_times": resit_times,
        "my_resit_schedule": my_resit_schedule
    })

@teacher_portal_bp.route('/api/teacher/submit', methods=['POST'])
def submit_request():
    if session.get('role') != 'teacher': return jsonify({"error": _("غير مصرح")}), 403
    
    teacher_id = session.get('teacher_id')
    tenant_id = session.get('tenant_id')
    data = request.json
    
    courses_json = json.dumps(data.get('courses', []))
    days_json = json.dumps(data.get('days', []))
    
    req = TeacherRequest.query.filter_by(teacher_id=teacher_id, tenant_id=tenant_id).first()
    if req:
        req.requested_courses = courses_json
        req.requested_days = days_json
        req.status = 'قيد المراجعة' # تبقى كقيمة حالة للقاعدة
    else:
        req = TeacherRequest(teacher_id=teacher_id, requested_courses=courses_json, requested_days=days_json, tenant_id=tenant_id)
        db.session.add(req)
        
    db.session.commit()
    return jsonify({"success": True, "message": _("تم حفظ الرغبات بنجاح")})