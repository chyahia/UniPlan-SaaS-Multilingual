import random
import time
import copy

def validate_schedule(db, final_dist):
    violations = []
    constraints = db.get('constraints', {})
    incompatibles = constraints.get('incompatible_levels', [])
    prioritized_teachers = constraints.get('prioritized_teachers', [])
    carpool_pairs = constraints.get('carpool_pairs', [])
    conflict_pairs = constraints.get('conflict_pairs', [])
    no_first_slot = constraints.get('no_first_slot_teachers', [])
    schedule = db.get('schedule', {})
    
    first_slots = {day: slots[0]['time'] for day, slots in schedule.items() if slots}
    
    for day, times in final_dist.items():
        for time_val, levels_dict in times.items():
            levels_in_this_slot = list(levels_dict.keys())
            for inc in incompatibles:
                if inc[0] in levels_in_this_slot and inc[1] in levels_in_this_slot:
                    violations.append(f"❌ [قيد صارم]: اجتماع '{inc[0]}' مع '{inc[1]}' في نفس الوقت ({day} - {time_val}).")

    teacher_days = {t: set() for t in db.get('teachers', [])}
    teacher_first_slots = {t: set() for t in db.get('teachers', [])}
    
    for day, times in final_dist.items():
        for time_val, levels_dict in times.items():
            for lvl, data in levels_dict.items():
                for t in data.get("subject_teachers", []):
                    teacher_days[t].add(day)
                    if time_val == first_slots.get(day):
                        teacher_first_slots[t].add(day)
                        
    # 🌟 فحص مخالفات التجميع والتتابع والانفصال
    day_list = list(schedule.keys())
    prioritized_dict = prioritized_teachers if isinstance(prioritized_teachers, dict) else {t: 'flexible' for t in prioritized_teachers}
    
    for t, pref in prioritized_dict.items():
        days = teacher_days.get(t, set())
        if len(days) > 1:
            day_indices = sorted([day_list.index(d) for d in days if d in day_list])
            has_consecutive = any(day_indices[i] - day_indices[i-1] == 1 for i in range(1, len(day_indices)))
            
            if pref == 'consecutive' and not has_consecutive:
                violations.append(f"⚠️ [الأولوية - تتابع]: الأستاذ '{t}' تفرقت مواده في أيام غير متتالية.")
            elif pref == 'separated' and has_consecutive:
                violations.append(f"⚠️ [الأولوية - انفصال]: الأستاذ '{t}' اجتمعت مواده في أيام متتالية (طلب انفصال).")
            elif pref == 'flexible':
                violations.append(f"⚠️ [تجميع الأيام - مرن]: الأستاذ '{t}' تفرقت مواده على {len(days)} أيام.")
            
    for pair in carpool_pairs:
        t1, t2 = pair[0], pair[1]
        days1, days2 = teacher_days.get(t1, set()), teacher_days.get(t2, set())
        if days1 and days2: 
            shared_days = days1.intersection(days2)
            if not shared_days:
                violations.append(f"⚠️ [المرافقة]: الأستاذ '{t1}' والأستاذ '{t2}' لم يجمعهما أي يوم مشترك.")

    for pair in conflict_pairs:
        t1, t2 = pair[0], pair[1]
        shared_days = teacher_days.get(t1, set()).intersection(teacher_days.get(t2, set()))
        if shared_days:
            violations.append(f"⚠️ [الانفصال]: الأستاذ '{t1}' والأستاذ '{t2}' اشتركا في يوم ({', '.join(shared_days)}).")

    for t in no_first_slot:
        if teacher_first_slots.get(t, set()):
            days_str = ", ".join(teacher_first_slots[t])
            violations.append(f"⚠️ [الحصة الأولى]: الأستاذ '{t}' تمت برمجته في الحصة الأولى من يوم ({days_str}).")
            
    return violations

def optimize_unified_rooms(final_dist):
    for day, times in final_dist.items():
        for time_val, levels_dict in times.items():
            teacher_to_levels = {}
            for lvl, data in levels_dict.items():
                for t in data.get("subject_teachers", []):
                    if t != "غير محدد":
                        if t not in teacher_to_levels:
                            teacher_to_levels[t] = []
                        teacher_to_levels[t].append(lvl)
                        
            for t, lvls in teacher_to_levels.items():
                if len(lvls) > 1:
                    primary_lvl = lvls[0]
                    primary_rooms = levels_dict[primary_lvl].get("rooms", {})
                    if primary_rooms:
                        unified_room = list(primary_rooms.keys())[0]
                    else:
                        unified_room = "قاعة مدمجة"
                    for lvl in lvls:
                        levels_dict[lvl]["rooms"] = {unified_room: [t]}
    return final_dist

# ==============================================================================
# 1. دالة التوزيع الخاصة بتفضيل الأستاذ
# ==============================================================================
def build_teacher_focused_schedule(db, sub_info_list, randomize=False, destruction_rate=0):
    schedule = db.get('schedule', {})
    levels = db.get('levels', [])
    constraints = db.get('constraints', {})
    incompatibles = constraints.get('incompatible_levels', [])
    prioritized_teachers = constraints.get('prioritized_teachers', [])
    carpool_pairs = constraints.get('carpool_pairs', [])
    conflict_pairs = constraints.get('conflict_pairs', [])
    no_first_slot = constraints.get('no_first_slot_teachers', [])
    level_rooms = db.get('level_rooms', {})
    
    first_slots = {day: slots[0]['time'] for day, slots in schedule.items() if slots}
    final_dist = {d: {slot['time']: {} for slot in slots} for d, slots in schedule.items()}
    
    # --- 🌟 بناء قواميس الفترات وخريطة مجموعات العزل الصريحة 🌟 ---
    primary_slots = {lvl: [] for lvl in levels}
    reserve_slots = {lvl: [] for lvl in levels}
    
    isolation_groups = constraints.get('isolation_groups', {})
    level_to_group = {} # قاموس يربط كل مستوى بمجموعته الصريحة
    for g_name, g_lvls in isolation_groups.items():
        for lvl in g_lvls:
            level_to_group[lvl] = g_name
    
    day_list = list(schedule.keys())
    
    for d, slots in schedule.items():
        for slot in slots:
            time_tuple = (d, slot['time'])
            # قراءة الفترات الأساسية
            for lvl in slot.get('primary_levels', []):
                if lvl not in primary_slots: primary_slots[lvl] = []
                primary_slots[lvl].append(time_tuple)
            # قراءة الفترات الاحتياطية
            for lvl in slot.get('reserve_levels', []):
                if lvl not in reserve_slots: reserve_slots[lvl] = []
                reserve_slots[lvl].append(time_tuple)
                    
    reserve_claims = {} # (اليوم, الوقت) -> اسم مجموعة العزل
    # -----------------------------------------------------------------
                
    teacher_placements = {t: {'times': set(), 'days': set()} for t in db.get('teachers', [])}
    teacher_placements["غير محدد"] = {'times': set(), 'days': set()} 
    slot_contents = {}
    unassigned_subjects = []
    score_accumulator = 0
    
    working_subs = copy.deepcopy(sub_info_list)
    if randomize:
        shuffle_subset = int(len(working_subs) * (destruction_rate / 100.0))
        if shuffle_subset > 0:
            part1 = working_subs[:shuffle_subset]
            part2 = working_subs[shuffle_subset:]
            random.shuffle(part1)
            working_subs = part1 + part2
        working_subs.sort(key=lambda s: s['teacher'] in prioritized_teachers, reverse=True)
    
    for s in working_subs:
        lvl = s['level']
        t = s['teacher']
        lvl_group = level_to_group.get(lvl) # يجلب اسم المجموعة، أو يرجع None إذا كان "جوكر"
        
        used_slots_by_lvl = [(d, t_s) for (d, t_s), lvls in slot_contents.items() if lvl in lvls]
        
        # --- الخطوة 1: البحث في الفترات الأساسية حصراً ---
        free_primary = [sl for sl in primary_slots.get(lvl, []) if sl not in used_slots_by_lvl]
        strictly_valid_slots = []
        
        for slot in free_primary:
            has_conflict = False
            for existing_lvl in slot_contents.get(slot, []):
                for inc in incompatibles:
                    if (lvl == inc[0] and existing_lvl == inc[1]) or (lvl == inc[1] and existing_lvl == inc[0]):
                        has_conflict = True; break
                if has_conflict: break
            if not has_conflict: strictly_valid_slots.append(slot)
                
        # --- الخطوة 2: الفترات الاحتياطية مع تطبيق (العزل الذكي والجوكر) ---
        if not strictly_valid_slots:
            free_reserve = [sl for sl in reserve_slots.get(lvl, []) if sl not in used_slots_by_lvl]
            for slot in free_reserve:
                claimed_by = reserve_claims.get(slot)
                
                # 🛡️ القاعدة الذهبية:
                if lvl_group is not None:
                    # المستوى معزول: يجب أن تكون الفترة غير محجوزة، أو محجوزة لمجموعته
                    if claimed_by is not None and claimed_by != lvl_group:
                        continue # طرد! الفترة مشفرة لمجموعة أخرى
                else:
                    # المستوى "جوكر": يدخل أي مكان ولا يهم إن كانت الفترة محجوزة لغيره
                    pass 
                    
                has_conflict = False
                for existing_lvl in slot_contents.get(slot, []):
                    for inc in incompatibles:
                        if (lvl == inc[0] and existing_lvl == inc[1]) or (lvl == inc[1] and existing_lvl == inc[0]):
                            has_conflict = True; break
                    if has_conflict: break
                if not has_conflict: strictly_valid_slots.append(slot)
                
        if not strictly_valid_slots:
            unassigned_subjects.append(s)
            score_accumulator -= 100000 
            continue
            
        best_slot = strictly_valid_slots[0]
        best_score = -999999
        
        for slot in strictly_valid_slots:
            day, time_val = slot
            score = 0
            
            if t != "غير محدد":
                slot_key = f"{day}_{time_val}"
                is_first_slot = (time_val == first_slots.get(day))
                bonus = 2 if t in prioritized_teachers else 1
                
                if slot_key in teacher_placements[t]['times']: score += (1000 * bonus)
                elif day in teacher_placements[t]['days']: score += (500 * bonus)
                else:
                    day_idx = day_list.index(day)
                    teacher_days_indices = [day_list.index(pd) for pd in teacher_placements[t]['days']]
                    if teacher_days_indices: # تفعيل فقط إذا كان له يوم سابق
                        is_consecutive = any(abs(day_idx - idx) == 1 for idx in teacher_days_indices)
                        
                        pref = prioritized_teachers.get(t, 'flexible') if isinstance(prioritized_teachers, dict) else 'flexible'
                        
                        if pref == 'consecutive':
                            if is_consecutive: score += (300 * bonus)
                            else: score -= (300 * bonus)
                        elif pref == 'separated':
                            if is_consecutive: score -= (300 * bonus)
                            else: score += (300 * bonus)
                        else: # مرن
                            if is_consecutive: score += (200 * bonus)
                    
                if is_first_slot and t in no_first_slot: score -= 5000
                    
                for pair in carpool_pairs:
                    partner = pair[1] if t == pair[0] else (pair[0] if t == pair[1] else None)
                    if partner and day in teacher_placements[partner]['days']: score += 800 
                        
                for pair in conflict_pairs:
                    partner = pair[1] if t == pair[0] else (pair[0] if t == pair[1] else None)
                    if partner and day in teacher_placements[partner]['days']: score -= 8000 
                    
            if randomize: score += random.randint(0, destruction_rate * 2) 
                
            if score > best_score:
                best_score = score
                best_slot = slot
                
        b_day, b_time = best_slot
        score_accumulator += best_score
        
        # --- الخطوة 3: تسجيل ملكية الفترة الاحتياطية (تشفيرها) ---
        if best_slot in reserve_slots.get(lvl, []):
            if lvl_group is not None:
                reserve_claims[best_slot] = lvl_group # الجوكر لن ينفذ هذا السطر ولن يشفر الفترة
        
        teacher_placements[t]['times'].add(f"{b_day}_{b_time}")
        teacher_placements[t]['days'].add(b_day)
        if best_slot not in slot_contents: slot_contents[best_slot] = []
        slot_contents[best_slot].append(lvl)
        
        rooms = level_rooms.get(lvl, ["قاعة غير محددة"])
        room_dict = {r.split(' (')[0] if ' (' in r else r: [t] if t != "غير محدد" else [] for r in rooms}
        final_dist[b_day][b_time][lvl] = {"subject": s['name'], "subject_teachers": [t] if t != "غير محدد" else [], "rooms": room_dict}
        
    return final_dist, unassigned_subjects, score_accumulator

# ==============================================================================
# 2. دالة التوزيع الخاصة بتفضيل الطالب
# ==============================================================================
def build_student_focused_schedule(db, sub_info_list, randomize=False, destruction_rate=0):
    schedule = db.get('schedule', {})
    levels = db.get('levels', [])
    constraints = db.get('constraints', {})
    incompatibles = constraints.get('incompatible_levels', [])
    prioritized_teachers = constraints.get('prioritized_teachers', [])
    carpool_pairs = constraints.get('carpool_pairs', [])
    conflict_pairs = constraints.get('conflict_pairs', [])
    no_first_slot = constraints.get('no_first_slot_teachers', [])
    level_rooms = db.get('level_rooms', {})
    
    first_slots = {day: slots[0]['time'] for day, slots in schedule.items() if slots}
    final_dist = {d: {slot['time']: {} for slot in slots} for d, slots in schedule.items()}
    
    # --- 🌟 بناء قواميس الفترات وخريطة مجموعات العزل الصريحة 🌟 ---
    primary_slots = {lvl: [] for lvl in levels}
    reserve_slots = {lvl: [] for lvl in levels}
    
    isolation_groups = constraints.get('isolation_groups', {})
    level_to_group = {} 
    for g_name, g_lvls in isolation_groups.items():
        for lvl in g_lvls:
            level_to_group[lvl] = g_name
    
    day_list = list(schedule.keys())
    
    for d, slots in schedule.items():
        for slot in slots:
            time_tuple = (d, slot['time'])
            for lvl in slot.get('primary_levels', []):
                if lvl not in primary_slots: primary_slots[lvl] = []
                primary_slots[lvl].append(time_tuple)
            for lvl in slot.get('reserve_levels', []):
                if lvl not in reserve_slots: reserve_slots[lvl] = []
                reserve_slots[lvl].append(time_tuple)
                    
    reserve_claims = {} 
    # -----------------------------------------------------------------
                
    teacher_placements = {t: {'times': set(), 'days': set()} for t in db.get('teachers', [])}
    teacher_placements["غير محدد"] = {'times': set(), 'days': set()} 
    slot_contents = {}
    unassigned_subjects = []
    score_accumulator = 0
    
    working_subs = copy.deepcopy(sub_info_list)
    if randomize:
        shuffle_subset = int(len(working_subs) * (destruction_rate / 100.0))
        if shuffle_subset > 0:
            part1 = working_subs[:shuffle_subset]
            part2 = working_subs[shuffle_subset:]
            random.shuffle(part1)
            working_subs = part1 + part2
        working_subs.sort(key=lambda s: s['teacher'] in prioritized_teachers, reverse=True)
    
    for s in working_subs:
        lvl = s['level']
        t = s['teacher']
        lvl_group = level_to_group.get(lvl) 
        
        used_slots_by_lvl = [(d, t_s) for (d, t_s), lvls in slot_contents.items() if lvl in lvls]
        
        free_primary = [sl for sl in primary_slots.get(lvl, []) if sl not in used_slots_by_lvl]
        strictly_valid_slots = []
        
        for slot in free_primary:
            has_conflict = False
            for existing_lvl in slot_contents.get(slot, []):
                for inc in incompatibles:
                    if (lvl == inc[0] and existing_lvl == inc[1]) or (lvl == inc[1] and existing_lvl == inc[0]):
                        has_conflict = True; break
                if has_conflict: break
            if not has_conflict: strictly_valid_slots.append(slot)
                
        if not strictly_valid_slots:
            free_reserve = [sl for sl in reserve_slots.get(lvl, []) if sl not in used_slots_by_lvl]
            for slot in free_reserve:
                claimed_by = reserve_claims.get(slot)
                
                if lvl_group is not None:
                    if claimed_by is not None and claimed_by != lvl_group:
                        continue 
                else:
                    pass 
                    
                has_conflict = False
                for existing_lvl in slot_contents.get(slot, []):
                    for inc in incompatibles:
                        if (lvl == inc[0] and existing_lvl == inc[1]) or (lvl == inc[1] and existing_lvl == inc[0]):
                            has_conflict = True; break
                    if has_conflict: break
                if not has_conflict: strictly_valid_slots.append(slot)
                
        if not strictly_valid_slots:
            unassigned_subjects.append(s)
            score_accumulator -= 100000 
            continue
            
        best_slot = strictly_valid_slots[0]
        best_score = -999999
        
        for slot in strictly_valid_slots:
            day, time_val = slot
            score = 0
            
            day_idx = day_list.index(day)
            time_idx = next((i for i, sl in enumerate(schedule[day]) if sl['time'] == time_val), 0)
            
            score -= (day_idx * 10)  
            score -= (time_idx * 2)  
            
            bonus = 2 if t in prioritized_teachers else 1
            
            prev_time = schedule[day][time_idx - 1]['time'] if time_idx > 0 else None
            next_time = schedule[day][time_idx + 1]['time'] if time_idx < len(schedule[day]) - 1 else None
            
            if prev_time and lvl in slot_contents.get((day, prev_time), []):
                score += (500 * bonus)
            if next_time and lvl in slot_contents.get((day, next_time), []):
                score += (500 * bonus)

            if t != "غير محدد":
                slot_key = f"{day}_{time_val}"
                is_first_slot = (time_val == first_slots.get(day))
                
                if day in teacher_placements[t]['days']:
                    score += (1000 * bonus)
                    if slot_key in teacher_placements[t]['times']:
                        score += (400 * bonus)
                else: # ✨ الإضافة الجديدة لدعم التتابع والانفصال
                    day_idx = day_list.index(day)
                    teacher_days_indices = [day_list.index(pd) for pd in teacher_placements[t]['days']]
                    if teacher_days_indices:
                        is_consecutive = any(abs(day_idx - idx) == 1 for idx in teacher_days_indices)
                        
                        pref = prioritized_teachers.get(t, 'flexible') if isinstance(prioritized_teachers, dict) else 'flexible'
                        
                        if pref == 'consecutive':
                            if is_consecutive: score += (300 * bonus)
                            else: score -= (300 * bonus)
                        elif pref == 'separated':
                            if is_consecutive: score -= (300 * bonus)
                            else: score += (300 * bonus)
                        else: # مرن
                            if is_consecutive: score += (200 * bonus)
                        
                if is_first_slot and t in no_first_slot:
                    score -= 5000
                    
                for pair in carpool_pairs:
                    partner = pair[1] if t == pair[0] else (pair[0] if t == pair[1] else None)
                    if partner and day in teacher_placements[partner]['days']:
                        score += 800 
                        
                for pair in conflict_pairs:
                    partner = pair[1] if t == pair[0] else (pair[0] if t == pair[1] else None)
                    if partner and day in teacher_placements[partner]['days']:
                        score -= 8000 
                    
            if randomize:
                score += random.randint(0, destruction_rate * 2) 
                
            if score > best_score:
                best_score = score
                best_slot = slot
                
        b_day, b_time = best_slot
        score_accumulator += best_score
        
        if best_slot in reserve_slots.get(lvl, []):
            if lvl_group is not None:
                reserve_claims[best_slot] = lvl_group 
        
        teacher_placements[t]['times'].add(f"{b_day}_{b_time}")
        teacher_placements[t]['days'].add(b_day)
        if best_slot not in slot_contents: slot_contents[best_slot] = []
        slot_contents[best_slot].append(lvl)
        
        rooms = level_rooms.get(lvl, ["قاعة غير محددة"])
        room_dict = {r.split(' (')[0] if ' (' in r else r: [t] if t != "غير محدد" else [] for r in rooms}
        final_dist[b_day][b_time][lvl] = {"subject": s['name'], "subject_teachers": [t] if t != "غير محدد" else [], "rooms": room_dict}
        
    return final_dist, unassigned_subjects, score_accumulator

# ==============================================================================
# 3. المدير الذي يختار الخوارزمية المناسبة
# ==============================================================================
def run_distribution(db, use_lns=True, duration=5, destruction_rate=25, progress_callback=None, is_teacher_focused=False):
    subjects = db.get('subjects', [])
    teachers = db.get('teachers', [])
    teacher_subjects = db.get('teacher_subjects', {})
    prioritized_teachers = db.get('constraints', {}).get('prioritized_teachers', [])
    
    sub_info = [] 
    for sub in subjects:
        teacher = "غير محدد"
        formatted_sub_name = f"{sub['name']} ({sub['level']})"
        for t, t_subs in teacher_subjects.items():
            if formatted_sub_name in t_subs:
                teacher = t
                break
        sub_info.append({'name': sub['name'], 'level': sub['level'], 'teacher': teacher})
        
    # 🌟 التوافقية لفرز المواد: نحتاج لقائمة المفاتيح (أسماء الأساتذة) 
    prioritized_keys = list(prioritized_teachers.keys()) if isinstance(prioritized_teachers, dict) else prioritized_teachers
    
    teacher_sub_counts = {t: sum(1 for s in sub_info if s['teacher'] == t) for t in teachers}
    sub_info.sort(key=lambda s: (s['teacher'] in prioritized_keys, teacher_sub_counts.get(s['teacher'], 0)), reverse=True)

    build_func = build_teacher_focused_schedule if is_teacher_focused else build_student_focused_schedule

    if not use_lns:
        best_dist, unassigned, _ = build_func(db, sub_info, randomize=False, destruction_rate=0)
    else:
        best_dist = {}
        best_unassigned = sub_info.copy()
        best_score = -float('inf')
        
        start_time = time.time()
        last_ui_update = start_time
        
        while time.time() - start_time < duration:
            current_dist, current_unassigned, current_score = build_func(db, sub_info, randomize=True, destruction_rate=destruction_rate)
            
            if len(current_unassigned) < len(best_unassigned) or (len(current_unassigned) == len(best_unassigned) and current_score > best_score):
                best_dist = current_dist
                best_unassigned = current_unassigned
                best_score = current_score
                
            current_time = time.time()
            elapsed = current_time - start_time
            if current_time - last_ui_update >= 0.5:
                unassigned_count = len(best_unassigned)
                strict_count = 0
                soft_count = 0
                if best_dist:
                    temp_viols = validate_schedule(db, best_dist)
                    strict_count = sum(1 for v in temp_viols if '❌' in v)
                    soft_count = sum(1 for v in temp_viols if '⚠️' in v)
                    
                if progress_callback:
                    # تمرير المتغيرات الثلاثة منفصلة
                    progress_callback(elapsed, duration, unassigned_count, strict_count, soft_count)
                    
                if unassigned_count == 0 and strict_count == 0 and soft_count == 0:
                    break 
                    
                last_ui_update = current_time

    if best_dist:
        best_dist = optimize_unified_rooms(best_dist)

    final_violations = []
    unassigned_list = best_unassigned if use_lns else unassigned
    for s in unassigned_list:
        final_violations.append(f"❌ المادة '{s['name']}' ({s['level']}): لم تُبرمج! كل الأوقات المتاحة تسبب تعارضاً.")

    if best_dist:
        eval_violations = validate_schedule(db, best_dist)
        final_violations.extend(eval_violations)
        
    return best_dist, final_violations