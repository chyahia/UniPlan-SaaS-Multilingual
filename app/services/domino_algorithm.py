# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
import copy
import json
import traceback
from collections import defaultdict


# الاستدعاءات السحابية المعزولة (SQLAlchemy)
from app.database import db, Teacher, Room, Level, Course, Setting
from app.services.algorithms import is_placement_valid, set_algorithm_language, _
from app.redis_logger import RedisLogQueue

# =====================================================================
# 0. دالة جلب البيانات والقيود بأمان سحابي تام
# =====================================================================
def _load_scheduling_context(tenant_id):
    # جلب الأساتذة
    teachers_list = Teacher.query.filter_by(tenant_id=tenant_id).all()
    teacher_map = {t.id: t.name for t in teachers_list}
    teachers = [{"id": t.id, "name": t.name} for t in teachers_list]
    
    # جلب القاعات وتوحيد مسميات الحجم
    rooms_data = [{"id": r.id, "name": r.name, "type": r.type} for r in Room.query.filter_by(tenant_id=tenant_id).all()]
    for r in rooms_data:
        if r['type'] in ['عادية', 'قاعة', 'صغيرة']: r['type'] = 'صغيرة'
        elif r['type'] in ['مدرج', 'كبيرة']: r['type'] = 'كبيرة'
    
    # جلب المستويات
    levels = [lvl.name for lvl in Level.query.filter_by(tenant_id=tenant_id).order_by(Level.name).all()]
    
    # جلب المواد وإسناداتها
    courses_db = Course.query.filter_by(tenant_id=tenant_id).all()
    all_lectures = []
    lectures_by_teacher_map = defaultdict(list)
    
    for c in courses_db:
        t_name = teacher_map.get(c.teacher_id) 
        rt = 'صغيرة' if c.room_type in ['عادية', 'قاعة', 'صغيرة'] else 'كبيرة'
        lec = {
            "id": c.id, "name": c.name, "room_type": rt,
            "course_nature": c.course_nature, "teacher_name": t_name,
            "levels": [l.name for l in c.levels]
        }
        all_lectures.append(lec)
        if t_name: lectures_by_teacher_map[t_name].append(lec)

    # جلب الإعدادات السحابية
    struct_setting = Setting.query.filter_by(key='schedule_structure', tenant_id=tenant_id).first()
    cond_setting = Setting.query.filter_by(key='schedule_conditions', tenant_id=tenant_id).first()
    
    structure_data = json.loads(struct_setting.value) if struct_setting and struct_setting.value else []
    conditions_data = json.loads(cond_setting.value) if cond_setting and cond_setting.value else {}
    
    days = [d['name'] for d in structure_data]
    day_to_idx = {d: i for i, d in enumerate(days)}
    slots = [f"{s['start']}-{s['end']}" for s in structure_data[0]['slots']] if structure_data and structure_data[0].get('slots') else []
    
    rules_grid = [[[] for _dummy in slots] for _dummy in days]
    for d_idx, day_obj in enumerate(structure_data):
        for s_idx, slot_obj in enumerate(day_obj.get('slots') or []):
            for constr in slot_obj.get('constraints') or []:
                rt = 'ANY_HALL'
                if constr['room_rule'] == 'regular': rt = 'SMALL_HALLS_ONLY'
                elif constr['room_rule'] == 'specific': rt = 'SPECIFIC_LARGE_HALL'
                elif constr['room_rule'] == 'none': rt = 'NO_HALLS_ALLOWED'
                rules_grid[d_idx][s_idx].append({'rule_type': rt, 'levels': constr['levels'], 'hall_name': constr['specific_halls'][0] if constr['specific_halls'] else None})
    
    # بناء هيكل القيود (مع حماية القواميس الفارغة)
    teacher_rules = conditions_data.get('teacher_rules') or {}
    spec_teachers = conditions_data.get('special_teachers') or {}
    global_rules = conditions_data.get('global') or {}
    
    teacher_constraints = {}
    special_constraints = {}
    saturday_teachers = []
    last_slot_restrictions = {}
    
    for t_id_str, rule in teacher_rules.items():
        if not rule: continue
        t_name = next((t['name'] for t in teachers if str(t['id']) == t_id_str), None)
        if not t_name: continue
        if rule.get('days'):
            teacher_constraints[t_name] = {'allowed_days': {day_to_idx[d] for d in rule['days'] if d in day_to_idx}}
        s_const = {}
        limits = rule.get('limits') or []
        if 'always_s2_e4' in limits: s_const['always_s2_to_s4'] = True
        if 's2' in limits: s_const['start_d1_s2'] = True
        if 's3' in limits: s_const['start_d1_s3'] = True
        if 'e3' in limits: s_const['end_s3'] = True
        if 'e4' in limits: s_const['end_s4'] = True
        if rule.get('rule') and rule.get('rule') != 'unspecified': s_const['distribution_rule'] = rule.get('rule')
        special_constraints[t_name] = s_const

    for t_id_str, spec in spec_teachers.items():
        if not spec: continue
        t_name = next((t['name'] for t in teachers if str(t['id']) == t_id_str), None)
        if not t_name: continue
        if spec.get('allow_saturday'): saturday_teachers.append(t_name)
        if spec.get('prevent_last') == '1': last_slot_restrictions[t_name] = 'last_1'
        elif spec.get('prevent_last') == '2': last_slot_restrictions[t_name] = 'last_2'

    globally_unavailable_slots = set()
    if global_rules.get('rest_tue_pm') and 'الثلاثاء' in day_to_idx and len(slots) >= 2:
        globally_unavailable_slots.update([(day_to_idx['الثلاثاء'], len(slots)-1), (day_to_idx['الثلاثاء'], len(slots)-2)])
    if global_rules.get('rest_last_day_pm') and len(days) > 0 and len(slots) >= 1:
        last_day_idx = len(days) - 1 
        num_slots_to_block = int(global_rules.get('rest_last_day_slots', 2))
        for i in range(1, num_slots_to_block + 1):
            if len(slots) - i >= 0:
                globally_unavailable_slots.add((last_day_idx, len(slots) - i))

    level_specific_large_rooms = {}
    for lvl, r_id in (conditions_data.get('level_amphis') or {}).items():
        r_name = next((r['name'] for r in rooms_data if str(r['id']) == str(r_id)), None)
        if r_name: level_specific_large_rooms[lvl] = r_name
        
    specific_small_room_assignments = {}
    for lvl, r_ids in (conditions_data.get('level_small_rooms') or {}).items():
        if not isinstance(r_ids, list): r_ids = [r_ids] 
        room_names = []
        for r_id in r_ids:
            r_name = next((r['name'] for r in rooms_data if str(r['id']) == str(r_id)), None)
            if r_name: room_names.append(r_name)
        if room_names:
            is_excl = (conditions_data.get('level_exclusive_rooms') or {}).get(lvl)
            specific_small_room_assignments[lvl] = [f"EXCL_{name}" if is_excl else name for name in room_names]

    strict_kwargs = {
        "teacher_constraints": teacher_constraints,
        "special_constraints": special_constraints,
        "identifiers_by_level": conditions_data.get('identifiers') or {},
        "rules_grid": rules_grid,
        "globally_unavailable_slots": globally_unavailable_slots,
        "rooms_data": rooms_data,
        "saturday_teachers": saturday_teachers,
        "day_to_idx": day_to_idx,
        "level_specific_large_rooms": level_specific_large_rooms,
        "specific_small_room_assignments": specific_small_room_assignments,
        "consecutive_large_hall_rule": global_rules.get('consecutive_hall_ban', 'none')
    }

    domino_teachers_ids = conditions_data.get('domino_teachers') or []
    domino_teacher_names = [next((t['name'] for t in teachers if str(t['id']) == str(t_id)), None) for t_id in domino_teachers_ids]
    domino_teacher_names = [n for n in domino_teacher_names if n]

    return strict_kwargs, domino_teacher_names, teachers, days, slots, rooms_data

# =====================================================================
# 1. جهاز الاستشراف والمحاكاة الذكي
# =====================================================================
def check_escape_route(orphan_lec, orphan_lvl, target_days, schedule, strict_kwargs, slots_len, days_len):
    teacher = orphan_lec.get('teacher_name')
    if not teacher: return False, None
    
    teacher_schedule = defaultdict(set)
    room_schedule = defaultdict(set)
    for lvl_name, grid in schedule.items():
        for d, day in enumerate(grid):
            for s, slot in enumerate(day):
                for lec in slot:
                    if lec.get('teacher_name'): teacher_schedule[lec['teacher_name']].add((d, s))
                    if lec.get('room'): room_schedule[lec['room']].add((d, s))
                    
    teacher_slots = teacher_schedule.get(teacher, set())

    for d in target_days:
        for s in range(slots_len):
            if (d, s) in teacher_slots: continue 

            is_valid, room_or_reason = is_placement_valid(
                orphan_lec, d, s, schedule, teacher_schedule, room_schedule, 
                strict_kwargs['teacher_constraints'], strict_kwargs['special_constraints'], 
                strict_kwargs['identifiers_by_level'], strict_kwargs['rules_grid'], 
                strict_kwargs['globally_unavailable_slots'], strict_kwargs['rooms_data'], 
                strict_kwargs['saturday_teachers'], strict_kwargs['day_to_idx'], 
                strict_kwargs['level_specific_large_rooms'], strict_kwargs['specific_small_room_assignments'], 
                strict_kwargs['consecutive_large_hall_rule']
            )
            
            if is_valid:
                return True, {"type": "direct", "target_d": d, "target_s": s, "new_room": room_or_reason}

            for lvl_b, grid_b in schedule.items():
                if len(grid_b) <= d or len(grid_b[d]) <= s: continue
                for lec_b in list(grid_b[d][s]):
                    t_b = lec_b.get('teacher_name')
                    if not t_b or t_b == teacher: continue

                    grid_b[d][s].remove(lec_b)
                    teacher_schedule[t_b].remove((d, s))
                    if lec_b.get('room'): room_schedule[lec_b['room']].discard((d, s))

                    is_valid_now, room_now = is_placement_valid(
                        orphan_lec, d, s, schedule, teacher_schedule, room_schedule, 
                        strict_kwargs['teacher_constraints'], strict_kwargs['special_constraints'], 
                        strict_kwargs['identifiers_by_level'], strict_kwargs['rules_grid'], 
                        strict_kwargs['globally_unavailable_slots'], strict_kwargs['rooms_data'], 
                        strict_kwargs['saturday_teachers'], strict_kwargs['day_to_idx'], 
                        strict_kwargs['level_specific_large_rooms'], strict_kwargs['specific_small_room_assignments'], 
                        strict_kwargs['consecutive_large_hall_rule']
                    )

                    if is_valid_now:
                        found_home_for_b = False
                        t_b_slots = teacher_schedule.get(t_b, set())
                        
                        for d_b in range(days_len):
                            for s_b in range(slots_len):
                                if (d_b, s_b) == (d, s) or (d_b, s_b) in t_b_slots: continue
                                
                                v_b, r_b = is_placement_valid(
                                    lec_b, d_b, s_b, schedule, teacher_schedule, room_schedule, 
                                    strict_kwargs['teacher_constraints'], strict_kwargs['special_constraints'], 
                                    strict_kwargs['identifiers_by_level'], strict_kwargs['rules_grid'], 
                                    strict_kwargs['globally_unavailable_slots'], strict_kwargs['rooms_data'], 
                                    strict_kwargs['saturday_teachers'], strict_kwargs['day_to_idx'], 
                                    strict_kwargs['level_specific_large_rooms'], strict_kwargs['specific_small_room_assignments'], 
                                    strict_kwargs['consecutive_large_hall_rule']
                                )
                                if v_b:
                                    found_home_for_b = True
                                    escape_data = {
                                        "type": "domino", "target_d": d, "target_s": s, "new_room": room_now,
                                        "displaced_lec": lec_b, "displaced_lvl": lvl_b, 
                                        "disp_target_d": d_b, "disp_target_s": s_b, "disp_new_room": r_b
                                    }
                                    break
                            if found_home_for_b: break

                        if found_home_for_b:
                            grid_b[d][s].append(lec_b)
                            return True, escape_data

                    grid_b[d][s].append(lec_b)
                    teacher_schedule[t_b].add((d, s))
                    if lec_b.get('room'): room_schedule[lec_b['room']].add((d, s))
                    
    return False, None

# =====================================================================
# 2. 🟢 زر [ تفعيل الدومينو ] (صناعة الحصص اليتيمة)
# =====================================================================
def background_activate_domino_task(app, tenant_id, current_schedule, user_lang='ar'):
    # ✨ تفعيل المترجم المستقل قبل أي شيء!
    set_algorithm_language(user_lang)
    with app.app_context():
        log_q = RedisLogQueue(tenant_id)
        log_q.clear_logs()
        log_q.set_running(True)
        
        try:
            # ✨ إضافة الترجمة للرسالة
            log_q.put(_("\n=== 🟢 تفعيل الدومينو: جاري تشتيت الحصص لصناعة مسارات الدومينو ==="))
            strict_kwargs, domino_teacher_names, teachers, days, slots, rooms_data = _load_scheduling_context(tenant_id)
            
            if not domino_teacher_names:
                # ✨ إضافة الترجمة للرسالة
                log_q.put(_("\n⚠️ تنبيه هام: قائمة أساتذة الدومينو فارغة! الرجاء التأكد من تأشيرهم في 'المرحلة 5' والضغط على زر (حفظ جميع القيود)."))
                
            teacher_schedule = defaultdict(set)
            room_schedule = defaultdict(set)
            for lvl_name, grid in current_schedule.items():
                for d, day in enumerate(grid):
                    for s, slot in enumerate(day):
                        for lec in slot:
                            if lec.get('teacher_name'): teacher_schedule[lec['teacher_name']].add((d, s))
                            if lec.get('room'): room_schedule[lec['room']].add((d, s))

            relaxed_t_constraints = copy.deepcopy(strict_kwargs['teacher_constraints'])
            relaxed_s_constraints = copy.deepcopy(strict_kwargs['special_constraints'])
            for t_name in domino_teacher_names:
                if t_name in relaxed_t_constraints:
                    relaxed_t_constraints[t_name].pop('allowed_days', None)
                if t_name in relaxed_s_constraints:
                    relaxed_s_constraints[t_name] = {} 

            extracted_count = 0

            for teacher in domino_teacher_names:
                worked_days = defaultdict(list)
                for lvl_name, grid in current_schedule.items():
                    for d, day in enumerate(grid):
                        for s, slot in enumerate(day):
                            for lec in slot:
                                if lec.get('teacher_name') == teacher:
                                    worked_days[d].append((s, lec, lvl_name))
                                    
                if not worked_days: 
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ⚠️ تخطي [{teacher}] (ليس لديه حصص في هذا الجدول).").format(teacher=teacher))
                    continue
                if len(worked_days) >= len(days):
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ⚠️ تخطي [{teacher}] (يعمل طيلة أيام الأسبوع، لا يوجد يوم فارغ لرمي الحصة فيه).").format(teacher=teacher))
                    continue
                
                sorted_heavy_days = sorted(worked_days.keys(), key=lambda d: len(worked_days[d]), reverse=True)
                
                selected_candidate = None
                best_day = None
                for d in sorted_heavy_days:
                    safe_candidates = [
                        item for item in worked_days[d] 
                        if item[1].get('room_type') != 'كبيرة' and len(item[1].get('levels') or []) <= 1
                    ]
                    if safe_candidates:
                        selected_candidate = max(safe_candidates, key=lambda x: x[0])
                        best_day = d
                        break
                        
                if not selected_candidate:
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ⚠️ تخطي [{teacher}] (جميع حصصه مدرجات أو مواد مشتركة).").format(teacher=teacher))
                    continue
                    
                s_target, orphan_lec, orphan_lvl = selected_candidate
                
                # السحب الجراحي
                current_schedule[orphan_lvl][best_day][s_target] = [l for l in current_schedule[orphan_lvl][best_day][s_target] if l.get('id') != orphan_lec['id']]
                teacher_schedule[teacher].discard((best_day, s_target))
                if orphan_lec.get('room'): room_schedule[orphan_lec['room']].discard((best_day, s_target))
                
                candidate_days = [d for d in range(len(days)) if d not in worked_days]
                candidate_days.sort(key=lambda d: min(abs(d - wd) for wd in worked_days.keys()))
                
                placed = False
                for d in candidate_days: 
                    for s in range(len(slots)):
                        if (d, s) in teacher_schedule[teacher]: continue
                        
                        is_valid, room_or_reason = is_placement_valid(
                            orphan_lec, d, s, current_schedule, teacher_schedule, room_schedule, 
                            relaxed_t_constraints, relaxed_s_constraints, 
                            strict_kwargs['identifiers_by_level'], strict_kwargs['rules_grid'], 
                            strict_kwargs['globally_unavailable_slots'], strict_kwargs['rooms_data'], 
                            strict_kwargs['saturday_teachers'], strict_kwargs['day_to_idx'], 
                            strict_kwargs['level_specific_large_rooms'], strict_kwargs['specific_small_room_assignments'], 
                            strict_kwargs['consecutive_large_hall_rule']
                        )
                        
                        if is_valid:
                            orphan_lec['room'] = room_or_reason
                            orphan_lec['is_orphan'] = True
                            current_schedule[orphan_lvl][d][s].append(orphan_lec)
                            teacher_schedule[teacher].add((d, s))
                            if room_or_reason: room_schedule[room_or_reason].add((d, s))
                            
                            placed = True
                            extracted_count += 1
                            # ✨ تعديل واستخدام الترجمة و format
                            log_q.put(_("   🎯 تم استخراج حصة يتيمة لـ [{teacher}] (انتقلت من {day_from} إلى {day_to}).").format(teacher=teacher, day_from=days[best_day], day_to=days[d]))
                            break
                    if placed: break
                    
                if not placed:
                    current_schedule[orphan_lvl][best_day][s_target].append(orphan_lec)
                    teacher_schedule[teacher].add((best_day, s_target))
                    if orphan_lec.get('room'): room_schedule[orphan_lec['room']].add((best_day, s_target))
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ⚠️ فشل إيجاد مكان للحصة اليتيمة للأستاذ [{teacher}].").format(teacher=teacher))

            # ✨ تعديل واستخدام الترجمة و format
            log_q.put(_("\n✅ اكتمل تفعيل الدومينو! تم تشتيت حصص ({extracted_count}) أساتذة بنجاح.").format(extracted_count=extracted_count))
            
            prof_schedules = {t['name']: [[[] for _dummy in slots] for _dummy in days] for t in teachers}
            for level_name, grid in current_schedule.items():
                for d, day_slots in enumerate(grid):
                    for s, slot_lectures in enumerate(day_slots):
                        for lec in slot_lectures:
                            t_name = lec.get('teacher_name')
                            if t_name and t_name in prof_schedules:
                                lec_copy = lec.copy()
                                lec_copy['level'] = level_name
                                prof_schedules[t_name][d][s].append(lec_copy)
            prof_schedules = {p: g for p, g in prof_schedules.items() if any(lec for day in g for slot in day for lec in slot)}

            # ✨ إضافة: إعادة حساب القاعات الفارغة بعد تحركات الدومينو
            free_rooms = [[[] for _dummy in slots] for _dummy in days]
            for d in range(len(days)):
                for s in range(len(slots)):
                    busy_rooms = set()
                    for grid in current_schedule.values():
                        for lec in grid[d][s]:
                            if lec.get('room'): busy_rooms.add(lec['room'])
                    for r in rooms_data:
                        if r['name'] not in busy_rooms:
                            free_rooms[d][s].append(r['name'])

            final_result = {
                "schedule": current_schedule, 
                "prof_schedules": prof_schedules,
                "free_rooms": free_rooms, # ✨ تمرير القاعات الشاغرة المحدثة للواجهة
                "days": days, 
                "slots": slots
            }
            # ✨ إضافة: حفظ النتيجة النهائية في قاعدة البيانات السحابية (لتجنب فقدانها عند تحديث الصفحة)
            res_setting = Setting.query.filter_by(key='schedule_result', tenant_id=tenant_id).first()
            if res_setting: 
                res_setting.value = json.dumps(current_schedule)
            else: 
                db.session.add(Setting(key='schedule_result', value=json.dumps(current_schedule), tenant_id=tenant_id))
            db.session.commit()
            
            # (رسالة تواصل داخلي لا تحتاج لترجمة)
            log_q.put(f"DONE{json.dumps(final_result)}")

        except Exception as e:
            # ✨ ميزة تكسير الأسطر لتظهر الـ Traceback بالكامل في الشاشة السوداء!
            err_msg = traceback.format_exc()
            # ✨ إضافة الترجمة للرسالة
            log_q.put(_("\n❌ حدث خطأ فادح أثناء التفعيل:"))
            for line in err_msg.split('\n'):
                if line.strip():
                    log_q.put(line)
        finally:
            log_q.set_running(False)


# =====================================================================
# 3. 🔵 زر [ تجميع الدومينو ] (ضغط الجدول واستعادة الحصص)
# =====================================================================
def background_compress_domino_task(app, tenant_id, current_schedule, user_lang='ar'):
    # ✨ تفعيل المترجم المستقل!
    set_algorithm_language(user_lang)
    with app.app_context():
        log_q = RedisLogQueue(tenant_id)
        log_q.clear_logs()
        log_q.set_running(True)
        
        try:
            # ✨ إضافة الترجمة للرسالة
            log_q.put(_("\n=== 🔵 تجميع الدومينو: جاري إرجاع الحصص اليتيمة وضغط الجداول ==="))
            strict_kwargs, domino_teacher_names, teachers, days, slots, rooms_data = _load_scheduling_context(tenant_id)
            
            if not domino_teacher_names:
                # ✨ إضافة الترجمة للرسالة
                log_q.put(_("\n⚠️ تنبيه هام: قائمة أساتذة الدومينو فارغة! الرجاء التأكد من تأشيرهم والضغط على زر (حفظ جميع القيود) قبل التجميع."))

            moves_made = 0

            for teacher in domino_teacher_names:
                worked_days = defaultdict(list)
                for lvl, grid in current_schedule.items():
                    for d, day in enumerate(grid):
                        for s, slot in enumerate(day):
                            for lec in slot:
                                if lec.get('teacher_name') == teacher:
                                    worked_days[d].append((s, lec, lvl))
                                    
                if len(worked_days) < 2: 
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ⚠️ تخطي [{teacher}] (يعمل في يوم واحد فقط).").format(teacher=teacher))
                    continue
                
                counts = {d: len(lecs) for d, lecs in worked_days.items()}
                min_count = min(counts.values())
                if min_count != 1: 
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ⚠️ تخطي [{teacher}] (لا توجد لديه 'حصة يتيمة' لضغطها).").format(teacher=teacher))
                    continue 

                orphan_days = [d for d, c in counts.items() if c == 1]
                orphan_day = orphan_days[0]
                
                target_days = [d for d in counts.keys() if d != orphan_day]
                orphan_slot, orphan_lec, orphan_lvl = worked_days[orphan_day][0]

                # ✨ تعديل واستخدام الترجمة و format
                log_q.put(_("🔍 محاولة ضغط الحصة اليتيمة للأستاذ [{teacher}]...").format(teacher=teacher))
                
                has_escape, escape_data = check_escape_route(orphan_lec, orphan_lvl, target_days, current_schedule, strict_kwargs, len(slots), len(days))
                
                if has_escape and escape_data:
                    current_schedule[orphan_lvl][orphan_day][orphan_slot] = [l for l in current_schedule[orphan_lvl][orphan_day][orphan_slot] if l.get('id') != orphan_lec['id']]
                    
                    if escape_data["type"] == "direct":
                        orphan_lec['room'] = escape_data["new_room"]
                        current_schedule[orphan_lvl][escape_data["target_d"]][escape_data["target_s"]].append(orphan_lec)
                        # ✨ تعديل واستخدام الترجمة و format
                        log_q.put(_("   ✅ تم الضغط بنجاح (نقل مباشر) للحصة نحو يوم {target_day}.").format(target_day=days[escape_data['target_d']]))
                        moves_made += 1
                    
                    elif escape_data["type"] == "domino":
                        disp_lec = escape_data["displaced_lec"]
                        disp_lvl = escape_data["displaced_lvl"]
                        
                        current_schedule[disp_lvl][escape_data["target_d"]][escape_data["target_s"]] = [l for l in current_schedule[disp_lvl][escape_data["target_d"]][escape_data["target_s"]] if l.get('id') != disp_lec['id']]
                        disp_lec['room'] = escape_data["disp_new_room"]
                        current_schedule[disp_lvl][escape_data["disp_target_d"]][escape_data["disp_target_s"]].append(disp_lec)
                        
                        orphan_lec['room'] = escape_data["new_room"]
                        current_schedule[orphan_lvl][escape_data["target_d"]][escape_data["target_s"]].append(orphan_lec)
                        
                        # ✨ تعديل واستخدام الترجمة و format
                        log_q.put(_("   ✅ نجاح الدومينو! إزاحة حصة [{displaced_teacher}] لتفسح المجال لأستاذنا.").format(displaced_teacher=disp_lec.get('teacher_name')))
                        moves_made += 1
                else:
                    # ✨ تعديل واستخدام الترجمة و format
                    log_q.put(_("   ❌ فشل الضغط. مسار الهروب مغلق حالياً للأستاذ [{teacher}].").format(teacher=teacher))

            # ✨ تعديل واستخدام الترجمة و format
            log_q.put(_("\n🎉 اكتمل التجميع! تم تنفيذ ({moves_made}) عملية ضغط بنجاح.").format(moves_made=moves_made))
            
            prof_schedules = {t['name']: [[[] for _dummy in slots] for _dummy in days] for t in teachers}
            for level_name, grid in current_schedule.items():
                for d, day_slots in enumerate(grid):
                    for s, slot_lectures in enumerate(day_slots):
                        for lec in slot_lectures:
                            t_name = lec.get('teacher_name')
                            if t_name and t_name in prof_schedules:
                                lec_copy = lec.copy()
                                lec_copy['level'] = level_name
                                prof_schedules[t_name][d][s].append(lec_copy)
            prof_schedules = {p: g for p, g in prof_schedules.items() if any(lec for day in g for slot in day for lec in slot)}

            # ✨ إضافة: إعادة حساب القاعات الفارغة بعد تحركات الدومينو
            free_rooms = [[[] for _dummy in slots] for _dummy in days]
            for d in range(len(days)):
                for s in range(len(slots)):
                    busy_rooms = set()
                    for grid in current_schedule.values():
                        for lec in grid[d][s]:
                            if lec.get('room'): busy_rooms.add(lec['room'])
                    for r in rooms_data:
                        if r['name'] not in busy_rooms:
                            free_rooms[d][s].append(r['name'])

            final_result = {
                "schedule": current_schedule, 
                "prof_schedules": prof_schedules,
                "free_rooms": free_rooms, # ✨ تمرير القاعات الشاغرة المحدثة للواجهة
                "days": days, 
                "slots": slots
            }
            # ✨ إضافة: حفظ النتيجة النهائية في قاعدة البيانات السحابية (لتجنب فقدانها عند تحديث الصفحة)
            res_setting = Setting.query.filter_by(key='schedule_result', tenant_id=tenant_id).first()
            if res_setting: 
                res_setting.value = json.dumps(current_schedule)
            else: 
                db.session.add(Setting(key='schedule_result', value=json.dumps(current_schedule), tenant_id=tenant_id))
            db.session.commit()
            
            # (رسالة تواصل داخلي لا تحتاج لترجمة)
            log_q.put(f"DONE{json.dumps(final_result)}")

        except Exception as e:
            # ✨ ميزة تكسير الأسطر لتظهر الـ Traceback بالكامل في الشاشة السوداء!
            err_msg = traceback.format_exc()
            # ✨ إضافة الترجمة للرسالة
            log_q.put(_("\n❌ حدث خطأ فادح أثناء التجميع:"))
            for line in err_msg.split('\n'):
                if line.strip():
                    log_q.put(line)
        finally:
            log_q.set_running(False)