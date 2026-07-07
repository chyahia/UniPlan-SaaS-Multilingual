import copy
import random
import math
import uuid
import threading
from collections import defaultdict, Counter, deque


# ===================================================================
# 1. دوال القيود والتكلفة
# ===================================================================
def is_assignment_valid(prof, exam, prof_assignments, prof_large_counts, settings, date_map):
    duty_patterns = settings.get('dutyPatterns', {})
    unavailable_days = settings.get('unavailableDays', {})
    prof_clean = prof.strip()

    # 1. 🔴 المستحيلات المطلقة (تعارض، غياب، تنافر)
    if any(e['date'] == exam['date'] and e['time'] == exam['time'] for e in prof_assignments.get(prof_clean, [])): return False
    if exam['date'] in unavailable_days.get(prof_clean, []): return False
    
    exclusive_profs = settings.get('exclusiveProfessors', [])
    for pair in exclusive_profs:
        if prof_clean == pair[0].strip() and any(e['date'] == exam['date'] for e in prof_assignments.get(pair[1].strip(), [])): return False
        if prof_clean == pair[1].strip() and any(e['date'] == exam['date'] for e in prof_assignments.get(pair[0].strip(), [])): return False

    # 2. 🟠 القيود الإدارية الصارمة (لا تُكسر أبداً في هذه المرحلة)
    
    # أ. فحص سقف الحراسات
    max_shifts = int(settings.get('maxShifts', '0')) if settings.get('maxShifts', '0') != '0' else float('inf')
    if len(prof_assignments.get(prof_clean, [])) >= max_shifts: return False

    # ب. الإصلاح الدقيق للقاعات الكبيرة
    guards_large_hall_setting = int(settings.get('guardsLargeHall', 4))
    large_guards_needed = sum(guards_large_hall_setting for h in exam.get('halls', []) if h.get('type') == 'كبيرة')
    current_guards_count = len([g for g in exam.get('guards', []) if g != "**نقص**"])
    
    is_large_hall_position = current_guards_count < large_guards_needed
    max_large_hall_shifts = int(settings.get('maxLargeHallShifts', '2')) if settings.get('maxLargeHallShifts', '2') != '0' else float('inf')
    
    if is_large_hall_position and prof_large_counts.get(prof_clean, 0) >= max_large_hall_shifts: return False

    # ج. فحص الأنماط (مع استثناء unlimited)
    prof_pattern = duty_patterns.get(prof_clean, 'flexible_2_days')
    if prof_pattern != 'unlimited':
        duties_dates = {d['date'] for d in prof_assignments.get(prof_clean, [])}
        is_new_day = exam['date'] not in duties_dates
        num_duty_days = len(duties_dates)

        if is_new_day:
            if (prof_pattern == 'one_day_only' and num_duty_days >= 1) or \
               (prof_pattern == 'flexible_2_days' and num_duty_days >= 2) or \
               (prof_pattern == 'flexible_3_days' and num_duty_days >= 3) or \
               (prof_pattern == 'consecutive_strict' and num_duty_days >= 2):
                return False
            elif prof_pattern == 'consecutive_strict' and num_duty_days == 1:
                idx1 = date_map.get(list(duties_dates)[0])
                idx2 = date_map.get(exam['date'])
                if idx1 is None or idx2 is None or abs(idx1 - idx2) != 1: return False
                
    return True

def is_schedule_valid(schedule, settings, all_professors, duty_patterns, date_map):
    unavailable_days = settings.get('unavailableDays', {})
    max_shifts = int(settings.get('maxShifts', '0')) if settings.get('maxShifts', '0') != '0' else float('inf')
    max_large_hall_shifts = int(settings.get('maxLargeHallShifts', '2')) if settings.get('maxLargeHallShifts', '2') != '0' else float('inf')

    prof_assignments = defaultdict(list)
    prof_large_counts = defaultdict(int)
    all_exams = [exam for date_slots in schedule.values() for time_slots in date_slots.values() for exam in time_slots]

    for exam in all_exams:
        is_large_exam = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
        for guard in exam.get('guards', []):
            if guard == "**نقص**": return False 
            for other_exam in prof_assignments.get(guard, []):
                if other_exam['date'] == exam['date'] and other_exam['time'] == exam['time']: return False 
            if exam['date'] in unavailable_days.get(guard, []): return False 
            prof_assignments[guard].append(exam)
            if is_large_exam: prof_large_counts[guard] += 1

    for prof in all_professors:
        if len(prof_assignments[prof]) > max_shifts: return False
        if prof_large_counts[prof] > max_large_hall_shifts: return False
            
    prof_assigned_slots = defaultdict(list)
    for exam in all_exams:
        for guard in exam.get('guards', []):
            if guard != "**نقص**": prof_assigned_slots[guard].append((exam['date'], exam['time']))

    for prof, pattern in duty_patterns.items():
        if not prof_assigned_slots.get(prof): continue
        duties_dates_indices = sorted(list({date_map.get(d_date) for d_date, d_time in prof_assigned_slots.get(prof, []) if date_map.get(d_date) is not None}))
        num_unique_duty_days = len(duties_dates_indices)
        if pattern == 'consecutive_strict':
            if num_unique_duty_days > 0 and (num_unique_duty_days != 2 or (len(duties_dates_indices)>1 and duties_dates_indices[1] - duties_dates_indices[0] != 1)): return False
        elif pattern == 'one_day_only' and num_unique_duty_days > 1: return False
        elif pattern == 'flexible_2_days' and num_unique_duty_days > 0 and num_unique_duty_days != 2: return False
        elif pattern == 'flexible_3_days' and num_unique_duty_days > 0 and (num_unique_duty_days < 2 or num_unique_duty_days > 3): return False
    
    professor_pairs = settings.get('professorPartnerships', [])
    prof_duty_days = defaultdict(set)
    for guard, duties in prof_assigned_slots.items():
        for duty_date, _ in duties: prof_duty_days[guard].add(duty_date)
            
    for pair in professor_pairs:
        if len(pair) == 2:
            if prof_duty_days.get(pair[0], set()) != prof_duty_days.get(pair[1], set()): return False

    # ✨ قيد التنافر (عدم التشارك) الجديد للشكل الشامل
    exclusive_profs = settings.get('exclusiveProfessors', [])
    for pair in exclusive_profs:
        if len(pair) == 2:
            if not prof_duty_days.get(pair[0], set()).isdisjoint(prof_duty_days.get(pair[1], set())): return False

    return True

def calculate_cost(schedule, settings, all_professors, duty_patterns, date_map):
    from collections import Counter
    
    all_exams_flat = [exam for day in schedule.values() for slot in day.values() for exam in slot]
    shortage_component = sum(e.get('guards', []).count("**نقص**") for e in all_exams_flat)
    
    # 🌟 الاستدعاء المباشر لدالة التقرير لضمان التطابق التام 100% 🌟
    violation_report = generate_violation_report(schedule, settings, all_professors)
    hard_constraint_component = len(violation_report["strict"])
    soft_constraint_component = len(violation_report["soft"]) * 10 # كل ملاحظة مرنة نعتبرها بـ 10 نقاط

    deviation_component = 0.0
    large_hall_weight = float(settings.get('largeHallWeight', 3.0))
    prof_stats = {prof: {'large': 0, 'other': 0} for prof in all_professors}
    guards_large_hall = int(settings.get('guardsLargeHall', 4))
    
    for exam in all_exams_flat:
        # إضافة strip لإزالة أي مسافات مخفية قد تسبب مشاكل في الحساب
        guards_copy = [g.strip() for g in exam.get('guards', []) if g != "**نقص**"] 
        large_guards_needed = sum(guards_large_hall for h in exam.get('halls', []) if h.get('type') == 'كبيرة')
        
        for guard in guards_copy[:large_guards_needed]:
            if guard in prof_stats: prof_stats[guard]['large'] += 1
        for guard in guards_copy[large_guards_needed:]:
            if guard in prof_stats: prof_stats[guard]['other'] += 1
            
    enable_custom_targets = settings.get('enableCustomTargets', False)
    custom_target_patterns = settings.get('customTargetPatterns', [])

    if enable_custom_targets and custom_target_patterns:
        target_counts = Counter((p['large'], p['other']) for p in custom_target_patterns for _ in range(p.get('count', 0)))
        actual_counts = Counter((s['large'], s['other']) for s in prof_stats.values())
        total_deviation = sum(abs(actual_counts.get(p, 0) - target_counts.get(p, 0)) for p in set(target_counts.keys()) | set(actual_counts.keys()))
        deviation_component = total_deviation * 2.0
    else:
        prof_workload = {p: s['large'] * large_hall_weight + s['other'] for p, s in prof_stats.items()}
        if prof_workload:
            workload_values = list(prof_workload.values())
            deviation_component = max(workload_values) - min(workload_values) if workload_values else 0.0

    return (shortage_component, hard_constraint_component, deviation_component, soft_constraint_component)

def format_cost_tuple(cost_tuple):
    s, h, d, f = cost_tuple
    return f"(نقص: {s}, قيود صارمة: {h}, انحراف: {d:.2f}, قيود مرنة: {f})"

# ===================================================================
# 2. بناء الجدول المبدئي وتوزيع المواد (بناءً على الفترات الأساسية والاحتياطية)
# ===================================================================

def clean_string_for_matching(s):
    """دالة مساعدة لتوحيد النصوص ومنع أخطاء المسافات"""
    return str(s).strip() if s else ""

def _run_initial_subject_placement(settings, all_subjects, all_levels_list, subject_owners, all_halls):
    """
    توزيع المواد في الخانات الزمنية (الأساسية ثم الاحتياطية).
    """
    base_subject_schedule = defaultdict(lambda: defaultdict(list))
    exam_schedule_settings = settings.get('examSchedule', {})
    
    all_subjects_to_schedule = {(clean_string_for_matching(s['name']), clean_string_for_matching(s['level'])) for s in all_subjects}
    group_mappings = {}
    primary_slots_by_group = defaultdict(list)
    reserve_slots = []
    sorted_dates = sorted(exam_schedule_settings.keys())
    
    for date in sorted_dates:
        for s in exam_schedule_settings.get(date, []):
            slot_with_date = s.copy(); slot_with_date['date'] = date
            slot_time, slot_type = s.get('time'), s.get('type')
            if slot_type == 'primary':
                primary_slots_by_group[slot_time].append(slot_with_date)
                for level in s.get('levels', []): group_mappings[level] = slot_time
            elif slot_type == 'reserve': reserve_slots.append(slot_with_date)
    
    subjects_by_group = defaultdict(set)
    for subject in all_subjects_to_schedule:
        group_id = group_mappings.get(subject[1])
        if group_id: subjects_by_group[group_id].add(subject)
    
    leftovers_by_group = defaultdict(set)
    available_halls_by_slot = defaultdict(lambda: {h['name'] for h in all_halls})
    level_hall_assignments = settings.get('levelHallAssignments', {})

    def schedule_exam_internal(subject, date, time, available_halls):
        subject_name, level_key = subject
        level_name_found = next((lvl for lvl in all_levels_list if clean_string_for_matching(lvl) == level_key), level_key)
        halls_for_level = set(level_hall_assignments.get(level_name_found, []))
        
        if not halls_for_level or not halls_for_level.issubset(available_halls): return False
        
        halls_details = [h for h in all_halls if h['name'] in halls_for_level]
        exam = {"date": date, "time": time, "subject": subject_name, "level": level_name_found, "professor": subject_owners.get(subject, "غير محدد"), "halls": halls_details, "guards": []}
        base_subject_schedule[date][time].append(exam)
        
        for hall_name in halls_for_level: available_halls.remove(hall_name)
        return True

    for group_id, subjects_pool in subjects_by_group.items():
        slots_pool = primary_slots_by_group.get(group_id, [])
        current_leftovers = set(subjects_pool)
        for subject in sorted(list(current_leftovers)):
            for slot in slots_pool:
                if subject[1] in slot.get('levels', []):
                    if schedule_exam_internal(subject, slot['date'], slot['time'], available_halls_by_slot[(slot['date'], slot['time'])]):
                        current_leftovers.remove(subject)
                        break
        leftovers_by_group[group_id] = current_leftovers

    total_leftovers = sum(len(s) for s in leftovers_by_group.values())
    if total_leftovers > 0:
        reserve_slot_claims = {}
        for group_id, subjects_left_over in sorted(leftovers_by_group.items(), key=lambda item: len(item[1]), reverse=True):
            subjects_to_remove = set()
            for subject in sorted(list(subjects_left_over)):
                for slot in reserve_slots:
                    slot_key = (slot['date'], slot['time'])
                    claimed_by = reserve_slot_claims.get(slot_key)
                    if claimed_by and claimed_by != group_id: continue
                    if schedule_exam_internal(subject, slot['date'], slot['time'], available_halls_by_slot[slot_key]):
                        subjects_to_remove.add(subject)
                        if not claimed_by: reserve_slot_claims[slot_key] = group_id
                        break
            leftovers_by_group[group_id] -= subjects_to_remove
            
    # إرجاع الجدول و group_mappings لنحتاجها في المرحلة 1.5
    return base_subject_schedule, group_mappings


def run_subject_optimization_phase(schedule, assignments, all_levels_list, subject_owners, settings, log_q, group_mappings, ideal_guard_days=None, stop_event=None):
    """
    المرحلة 1.5: تجميع مواد الأستاذ الواحد في أقل عدد من الأيام.
    """
    log_q.put(">>> بدء المرحلة 1.5: تحسين تجميع مواد الأساتذة (تقليل التشتت)...")
    
    passes = 3
    max_improvement_attempts_per_prof = 25
    optimized_schedule = copy.deepcopy(schedule)
    sorted_dates = sorted(optimized_schedule.keys())
    date_map = {date: i for i, date in enumerate(sorted_dates)}

    for p in range(passes):
        if stop_event and stop_event.is_set(): break
        
        prof_to_exams = defaultdict(list)
        for date, time_slots in optimized_schedule.items():
            for time, exams in time_slots.items():
                for exam in exams:
                    owner = exam.get('professor')
                    if owner and owner != "غير محدد": prof_to_exams[owner].append(exam)
        
        sorted_profs = sorted(prof_to_exams.keys(), key=lambda prof: len({e['date'] for e in prof_to_exams[prof]}), reverse=True)

        for prof in sorted_profs:
            if stop_event and stop_event.is_set(): break
            
            for improvement_attempt in range(max_improvement_attempts_per_prof):
                prof_exams = prof_to_exams[prof]
                exam_days = set(e['date'] for e in prof_exams)
                if len(exam_days) <= 1: break 

                anchor_day = None
                prof_ideal_days = ideal_guard_days.get(prof) if ideal_guard_days else None
                
                if prof_ideal_days:
                    days_in_common = exam_days.intersection(prof_ideal_days)
                    if days_in_common: anchor_day = random.choice(list(days_in_common))
                
                if not anchor_day:
                    day_counts = Counter(e['date'] for e in prof_exams)
                    anchor_day = day_counts.most_common(1)[0][0]
                
                exams_to_move = [e for e in prof_exams if e['date'] != anchor_day]
                if not exams_to_move: break
                exam_to_move = random.choice(exams_to_move)

                target_day_for_swap = anchor_day
                partner_found = None
                
                partners = optimized_schedule.get(target_day_for_swap, {}).get(exam_to_move['time'], [])
                for partner in partners:
                    if partner['level'] == exam_to_move['level']:
                        owner_c = partner.get('professor')
                        if owner_c and owner_c != "غير محدد":
                            current_days_c = {e['date'] for e in prof_to_exams.get(owner_c, [])}
                            new_days_c = (current_days_c - {target_day_for_swap}) | {exam_to_move['date']}
                            if len(new_days_c) > len(current_days_c): continue 
                        partner_found = partner
                        break
                
                if not partner_found:
                    anchor_day_index = date_map.get(anchor_day)
                    adjacent_dates = []
                    if anchor_day_index > 0: adjacent_dates.append(sorted_dates[anchor_day_index - 1])
                    if anchor_day_index < len(sorted_dates) - 1: adjacent_dates.append(sorted_dates[anchor_day_index + 1])
                    
                    for adj_date in adjacent_dates:
                        if adj_date in exam_days: continue
                        target_day_for_swap = adj_date
                        partners = optimized_schedule.get(target_day_for_swap, {}).get(exam_to_move['time'], [])
                        for partner in partners:
                            if partner['level'] == exam_to_move['level']:
                                owner_c = partner.get('professor')
                                if owner_c and owner_c != "غير محدد":
                                    current_days_c = {e['date'] for e in prof_to_exams.get(owner_c, [])}
                                    new_days_c = (current_days_c - {target_day_for_swap}) | {exam_to_move['date']}
                                    if len(new_days_c) > len(current_days_c): continue
                                partner_found = partner
                                break
                        if partner_found: break
                
                if partner_found:
                    try:
                        list_b = optimized_schedule[exam_to_move['date']][exam_to_move['time']]
                        list_c = optimized_schedule[target_day_for_swap][partner_found['time']]
                        idx_b = list_b.index(exam_to_move)
                        idx_c = list_c.index(partner_found)
                        
                        list_b[idx_b], list_c[idx_c] = partner_found, exam_to_move
                        exam_to_move['date'], partner_found['date'] = target_day_for_swap, exam_to_move['date']
                    except (ValueError, KeyError):
                        pass

    log_q.put("✓ اكتملت المرحلة 1.5 بنجاح.")
    return optimized_schedule

def complete_schedule_with_guards(subject_schedule, settings, all_professors, assignments, all_levels_list, duty_patterns, date_map, all_subjects, locked_guards=set(), stop_event=None, log_q=None):
    schedule = copy.deepcopy(subject_schedule)
    guards_large_hall = int(settings.get('guardsLargeHall', 4))
    guards_medium_hall = int(settings.get('guardsMediumHall', 2))
    guards_small_hall = int(settings.get('guardsSmallHall', 1))
    
    settings_for_validation = {
        'dutyPatterns': duty_patterns,
        'unavailableDays': settings.get('unavailableDays', {}),
        'maxShifts': settings.get('maxShifts', '0'),
        'maxLargeHallShifts': settings.get('maxLargeHallShifts', '2'),
        'exclusiveProfessors': settings.get('exclusiveProfessors', [])
    }

    duties_to_fill = []
    all_scheduled_exams_flat = [exam for day in schedule.values() for slot in day.values() for exam in slot]
    for exam in all_scheduled_exams_flat:
        if 'uuid' not in exam: exam['uuid'] = str(uuid.uuid4())
        locked_profs_for_exam = {p for e_uuid, p in locked_guards if e_uuid == exam.get('uuid')}
        if 'guards' not in exam: exam['guards'] = []
        for prof in locked_profs_for_exam:
            if prof not in exam['guards']: exam['guards'].append(prof)

        num_needed = (sum(guards_large_hall for h in exam.get('halls',[]) if h.get('type')=='كبيرة') +
                      sum(guards_medium_hall for h in exam.get('halls',[]) if h.get('type')=='متوسطة') +
                      sum(guards_small_hall for h in exam.get('halls',[]) if h.get('type')=='صغيرة'))
        
        num_to_add = num_needed - len(exam.get('guards', []))
        for _ in range(num_to_add): duties_to_fill.append(exam)
    
    while duties_to_fill:
        if stop_event and stop_event.is_set(): break
            
        prof_assignments = defaultdict(list)
        prof_large_counts = defaultdict(int)
        for exam in all_scheduled_exams_flat:
            is_large = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
            for guard in exam.get('guards', []):
                if guard in all_professors:
                    prof_assignments[guard].append(exam)
                    if is_large: prof_large_counts[guard] += 1
        
        duties_with_candidate_count = []
        for duty_exam in duties_to_fill:
            candidate_count = 0
            for prof in all_professors:
                if prof in duty_exam.get('guards', []): continue
                if is_assignment_valid(prof, duty_exam, prof_assignments, prof_large_counts, settings_for_validation, date_map):
                    candidate_count += 1
            duties_with_candidate_count.append({'exam': duty_exam, 'candidates': candidate_count})

        if not duties_with_candidate_count: break

        hardest_duty_info = min(duties_with_candidate_count, key=lambda x: x['candidates'])
        hardest_duty_exam = hardest_duty_info['exam']
        
        valid_candidates_with_scores = []
        for prof in all_professors:
            if prof in hardest_duty_exam.get('guards', []): continue
            if is_assignment_valid(prof, hardest_duty_exam, prof_assignments, prof_large_counts, settings_for_validation, date_map):
                flexibility_score = 0
                for other_duty in duties_to_fill:
                    if other_duty is hardest_duty_exam: continue
                    if prof not in other_duty.get('guards', []) and is_assignment_valid(prof, other_duty, prof_assignments, prof_large_counts, settings_for_validation, date_map):
                        flexibility_score += 1
                workload = len(prof_assignments.get(prof, []))
                valid_candidates_with_scores.append((flexibility_score, workload, prof))
        
        if valid_candidates_with_scores:
            valid_candidates_with_scores.sort(key=lambda x: (x[0], x[1]))
            hardest_duty_exam['guards'].append(valid_candidates_with_scores[0][2])
        else:
            hardest_duty_exam['guards'].append("**نقص**")
        
        try: duties_to_fill.remove(hardest_duty_exam)
        except ValueError:
             for i, item in enumerate(duties_to_fill):
                 if item is hardest_duty_exam:
                     del duties_to_fill[i]
                     break

    return schedule

# (لقد أزلت الكود المكرر لـ LNS و VNS و Tabu اختصاراً للرسالة، لكن في ملفك الفعلي، ضعها كلها هنا كما أرسلتها أنت تماماً!)




# ===================================================================
# 5. دالة البحث الجواري الواسع (LNS) - النسخة المدمجة لجبر النقص
# ===================================================================
def run_large_neighborhood_search(
    initial_schedule, settings, all_professors, duty_patterns, date_map, log_q, locked_guards=set(), stop_event=None
):
    log_q.put(">>> تشغيل LNS (النسخة النهائية المدمجة والمحسّنة)...")

    iterations = int(settings.get('lnsIterations', 100))
    initial_destroy_fraction = float(settings.get('lnsDestroyFraction', 0.2))
    min_destroy_fraction = 0.05
    destroy_fraction_decay_rate = 0.995
    initial_temp = 10.0
    cooling_rate = 0.99
    
    settings_for_validation = {
        'dutyPatterns': duty_patterns,
        'unavailableDays': settings.get('unavailableDays', {}),
        'maxShifts': settings.get('maxShifts', '0'),
        'maxLargeHallShifts': settings.get('maxLargeHallShifts', '2')
    }
    large_hall_weight = float(settings.get('largeHallWeight', 3.0))
    other_hall_weight = float(settings.get('otherHallWeight', 1.0))

    current_solution = copy.deepcopy(initial_schedule)
    best_solution_so_far = copy.deepcopy(current_solution)
    
    current_cost = calculate_cost(current_solution, settings, all_professors, duty_patterns, date_map)
    best_cost_so_far = current_cost
    log_q.put(f"... [LNS] التكلفة الأولية = {format_cost_tuple(current_cost)}")

    temp = initial_temp
    dynamic_destroy_fraction = initial_destroy_fraction

    for i in range(iterations):
        if stop_event and stop_event.is_set(): break
            
        percent_complete = int(((i + 1) / iterations) * 100)
        log_q.put(f"PROGRESS:{percent_complete}")
        
        ruined_solution = copy.deepcopy(current_solution)

        # --- 1. مرحلة التدمير (Destroy) ---
        duties_to_destroy = []
        for day in ruined_solution.values():
            for slot in day.values():
                for exam in slot:
                    for g_idx, guard in enumerate(exam.get('guards', [])):
                        if guard != "**نقص**" and (exam.get('uuid'), guard) not in locked_guards:
                            duties_to_destroy.append({'exam': exam, 'guard_index': g_idx})

        random.shuffle(duties_to_destroy)
        num_to_destroy = int(len(duties_to_destroy) * dynamic_destroy_fraction)
        
        for j in range(min(num_to_destroy, len(duties_to_destroy))):
            duty_info = duties_to_destroy[j]
            duty_info['exam']['guards'][duty_info['guard_index']] = "**نقص**"

        # --- 2. مرحلة الإصلاح الذكي (Repair) ---
        all_exams_in_ruined = [exam for day in ruined_solution.values() for slot in day.values() for exam in slot]
        
        prof_assignments = defaultdict(list)
        prof_large_counts = defaultdict(int)
        prof_workload = defaultdict(float)
        for exam in all_exams_in_ruined:
            is_large = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
            duty_weight = large_hall_weight if is_large else other_hall_weight
            for guard in exam.get('guards', []):
                if guard != "**نقص**":
                    prof_assignments[guard].append(exam)
                    prof_workload[guard] += duty_weight
                    if is_large:
                        prof_large_counts[guard] += 1
        
        shortage_slots = []
        for exam in all_exams_in_ruined:
            for idx, guard in enumerate(exam.get('guards', [])):
                if guard == "**نقص**":
                    shortage_slots.append({'exam': exam, 'index_to_fill': idx})
        random.shuffle(shortage_slots)

        for repair_info in shortage_slots:
            exam_to_repair = repair_info['exam']
            
            is_large_repair_exam = any(h['type'] == 'كبيرة' for h in exam_to_repair.get('halls',[]))
            repair_duty_weight = large_hall_weight if is_large_repair_exam else other_hall_weight
            
            valid_candidates = []
            for prof in all_professors:
                if prof in exam_to_repair.get('guards', []): continue
                
                if is_assignment_valid(prof, exam_to_repair, prof_assignments, prof_large_counts, settings_for_validation, date_map):
                    valid_candidates.append((prof, prof_workload.get(prof, 0)))

            if valid_candidates:
                best_prof_found, _ = min(valid_candidates, key=lambda item: item[1])
                
                exam_to_repair['guards'][repair_info['index_to_fill']] = best_prof_found
                
                prof_assignments[best_prof_found].append(exam_to_repair)
                prof_workload[best_prof_found] += repair_duty_weight
                if is_large_repair_exam:
                    prof_large_counts[best_prof_found] += 1
        
        # --- 3. مرحلة القبول (Acceptance) باستخدام معادلة الحرارة ---
        repaired_solution = ruined_solution
        new_cost = calculate_cost(repaired_solution, settings, all_professors, duty_patterns, date_map)
        
        weights = (100000, 50000, 10, 1) # أوزان العقوبات للطاقة
        current_energy = sum(c * w for c, w in zip(current_cost, weights))
        new_energy = sum(c * w for c, w in zip(new_cost, weights))
        
        if new_cost < current_cost or random.random() < (math.exp((current_energy - new_energy) / temp) if temp > 0 else 0):
            current_solution, current_cost = repaired_solution, new_cost
        
        if current_cost < best_cost_so_far:
            best_cost_so_far = current_cost
            best_solution_so_far = copy.deepcopy(current_solution)
            log_q.put(f"... [LNS] دورة {i+1}: تم إيجاد حل أفضل بتكلفة = {format_cost_tuple(best_cost_so_far)}")
        

        temp *= cooling_rate
        dynamic_destroy_fraction = max(min_destroy_fraction, dynamic_destroy_fraction * destroy_fraction_decay_rate)

    log_q.put(f"✓ انتهى LNS المحسن بأفضل تكلفة: {format_cost_tuple(best_cost_so_far)}")
    
    final_assignments = defaultdict(list)
    final_workload = defaultdict(float)
    final_large_counts = defaultdict(int)
    for day_data in best_solution_so_far.values():
        for slot_data in day_data.values():
            for exam in slot_data:
                is_large_exam = any(h['type'] == 'كبيرة' for h in exam['halls'])
                duty_weight = large_hall_weight if is_large_exam else other_hall_weight
                for guard in exam.get('guards', []):
                    if guard != "**نقص**":
                        final_assignments[guard].append(exam)
                        final_workload[guard] += duty_weight
                        if is_large_exam: final_large_counts[guard] += 1
                        
    return best_solution_so_far, final_assignments, final_workload, final_large_counts

# ===================================================================
# 6. المحرك الشامل (Unified LNS V16) - هجين يجمع الإصلاح والتحسين
# ===================================================================
def run_unified_lns_optimizer(initial_schedule, settings, all_professors, assignments, duty_patterns, date_map, all_subjects, log_q, all_levels_list, locked_guards=set(), stop_event=None):
    log_q.put(">>> بدء تشغيل المُحسِّن الهجين (V16)...")

    iterations = int(settings.get('lnsUnifiedIterations', 300))
    initial_solution = complete_schedule_with_guards(
        initial_schedule, settings, all_professors, assignments,
        all_levels_list, duty_patterns, date_map, all_subjects, locked_guards=locked_guards
    )
    initial_cost = calculate_cost(initial_solution, settings, all_professors, duty_patterns, date_map)
    log_q.put(f"... التكلفة الأولية للحل: {format_cost_tuple(initial_cost)}")

    repaired_solution = initial_solution
    repaired_cost = initial_cost

    # =================================================================
    # --- المرحلة 1: استدعاء LNS العادية لجبر النقص (Repair) ---
    # =================================================================
    if initial_cost[0] > 0:
        log_q.put("--- بدء المرحلة 1: استدعاء LNS العادية لجبر النقص...")
        
        repaired_solution_from_lns, _, _, _ = run_large_neighborhood_search(
            initial_solution, settings, all_professors, duty_patterns, 
            date_map, log_q, locked_guards, stop_event
        )
        
        if repaired_solution_from_lns:
            repaired_solution = repaired_solution_from_lns
        
        repaired_cost = calculate_cost(repaired_solution, settings, all_professors, duty_patterns, date_map)
    
    if repaired_cost[0] > 0:
        log_q.put(f"✗ فشلت حتى LNS العادية في جبر النقص. التكلفة النهائية: {format_cost_tuple(repaired_cost)}")
        best_solution = repaired_solution
        best_cost = repaired_cost
    else:
        log_q.put(f"✓ نجحت LNS العادية في جبر النقص! التكلفة بعد الإصلاح: {format_cost_tuple(repaired_cost)}")
        
        # =================================================================
        # --- المرحلة 2: تشغيل منطق التحسين (Optimization) ---
        # =================================================================
        log_q.put("--- بدء المرحلة 2: تحسين الجدول الكامل باستخدام منطق V13...")
        
        current_solution = copy.deepcopy(repaired_solution)
        current_cost = repaired_cost
        best_solution = copy.deepcopy(current_solution)
        best_cost = current_cost
        
        temp = 5.0
        cooling_rate = 0.995

        initial_temp = temp  
        stagnation_counter = 0
        
        for i in range(iterations):
            if stop_event and stop_event.is_set(): break
            log_q.put(f"PROGRESS:{int(((i+1)/iterations)*100)}")
            
            neighbor_solution = copy.deepcopy(current_solution)
            
            prof_guard_days = defaultdict(set); prof_subject_days = defaultdict(set)
            prof_stats = {p: {'large': 0, 'other': 0} for p in all_professors}
            prof_duties = defaultdict(list); prof_assignments = defaultdict(list); prof_large_counts = defaultdict(int)
            all_exams_flat = [exam for day in neighbor_solution.values() for slot in day.values() for exam in slot]
            guards_large_hall = int(settings.get('guardsLargeHall', 4))
            guards_medium_hall = int(settings.get('guardsMediumHall', 2))
            guards_small_hall = int(settings.get('guardsSmallHall', 1))
            
            for exam in all_exams_flat:
                owner = exam.get('professor', "غير محدد")
                if owner != "غير محدد": prof_subject_days[owner].add(exam['date'])
                is_large = any(h['type'] == 'كبيرة' for h in exam.get('halls',[]))
                for idx, guard in enumerate(exam.get('guards', [])):
                    if guard != "**نقص**":
                        prof_guard_days[guard].add(exam['date'])
                        prof_duties[guard].append({'exam': exam, 'guard_index': idx})
                        prof_assignments[guard].append(exam)
                        if is_large: prof_large_counts[guard] += 1
            
            tool_choice = random.random()
            if tool_choice < 0.6: # 60% فرصة لمحاولة تحسين الانحراف والموازنة
                custom_patterns = settings.get('customTargetPatterns', [])
                target_counts = Counter((p['large'], p['other']) for p in custom_patterns for _ in range(p.get('count', 0)))
                actual_counts = Counter((s['large'], s['other']) for s in prof_stats.values())
                over_patterns = {p for p, a in actual_counts.items() if a > target_counts.get(p, 0)}
                donors = [p for p, s in prof_stats.items() if (s['large'], s['other']) in over_patterns]
                recipients = all_professors
                random.shuffle(donors); random.shuffle(recipients)
                move_made = False
                for prof_donor in donors:
                    donatable_duties = [d for d in prof_duties[prof_donor] if (d['exam'].get('uuid'), prof_donor) not in locked_guards]
                    random.shuffle(donatable_duties)
                    for duty_to_donate in donatable_duties:
                        for prof_recipient in recipients:
                            if prof_donor == prof_recipient: continue
                            exam_to_reassign = duty_to_donate['exam']
                            if is_assignment_valid(prof_recipient, exam_to_reassign, prof_assignments, prof_large_counts, settings, date_map):
                                neighbor_solution[exam_to_reassign['date']][exam_to_reassign['time']][
                                    [e['uuid'] for e in neighbor_solution[exam_to_reassign['date']][exam_to_reassign['time']]].index(exam_to_reassign['uuid'])
                                ]['guards'][duty_to_donate['guard_index']] = prof_recipient
                                move_made = True
                                break
                        if move_made: break
                    if move_made: break
            else: # 40% فرصة لمحاولة التبديل الذكي للمواد لتحسين القيود المرنة
                improvement_candidates = [p for p, s_days in prof_subject_days.items() if not s_days.issubset(prof_guard_days.get(p, set()))]
                if improvement_candidates:
                    prof_to_fix = random.choice(improvement_candidates)
                    guard_days = prof_guard_days.get(prof_to_fix, set())
                    non_guard_subject_days = prof_subject_days.get(prof_to_fix, set()) - guard_days
                    
                    if non_guard_subject_days and guard_days:
                        day_from = random.choice(list(non_guard_subject_days))
                        day_to = random.choice(list(guard_days))
                        
                        exam_A = next((e for e in all_exams_flat if e['date'] == day_from and e['professor'] == prof_to_fix), None)
                        
                        partners = [e for e in all_exams_flat if e['date'] == day_to and e['level'] == exam_A.get('level')]
                        if exam_A and partners:
                            exam_B = random.choice(partners)

                            props_A = {'subject': exam_A['subject'], 'professor': exam_A['professor'], 'halls': exam_A['halls']}
                            props_B = {'subject': exam_B['subject'], 'professor': exam_B['professor'], 'halls': exam_B['halls']}
                            exam_A.update(props_B)
                            exam_B.update(props_A)

                            for exam in [exam_A, exam_B]:
                                needed = (sum(guards_large_hall for h in exam.get('halls',[]) if h['type']=='كبيرة') +
                                        sum(guards_medium_hall for h in exam.get('halls',[]) if h['type']=='متوسطة') +
                                        sum(guards_small_hall for h in exam.get('halls',[]) if h['type']=='صغيرة'))
                                
                                current_guards = [g for g in exam.get('guards', []) if g != "**نقص**"]
                                if len(current_guards) > needed:
                                    exam['guards'] = current_guards[:needed]
                                else:
                                    exam['guards'] = current_guards + ["**نقص**"] * (needed - len(current_guards))

            final_neighbor = neighbor_solution
            new_cost = calculate_cost(final_neighbor, settings, all_professors, duty_patterns, date_map)
            
            # حساب الفرق
            cost_diff = sum(w * (n - c) for w, n, c in zip((10, 1), new_cost[2:], current_cost[2:]))
            
            # معادلة التلدين المحاكي لقبول أو رفض التعديل
            if cost_diff < 0 or random.random() < math.exp(-cost_diff / temp if temp > 0 else float('-inf')):
                current_solution, current_cost = final_neighbor, new_cost
                
                if new_cost < best_cost:
                    best_solution, best_cost = copy.deepcopy(current_solution), new_cost
                    log_q.put(f"... [مُحسِّن LNS v16] دورة {i+1}: حل أفضل بتكلفة = {format_cost_tuple(best_cost)}")
                    stagnation_counter = 0 # تصفير العداد لأننا وجدنا تحسناً
                else:
                    stagnation_counter += 1
            else:
                stagnation_counter += 1

            # --- ⚡ الصدمة الكهربائية (إعادة التسخين) ⚡ ---
            if stagnation_counter >= 500:
                log_q.put(f"... ⚡ [تنبيه] الخوارزمية عالقة في الفخ! جاري تنشيط صدمة حرارية في الدورة {i+1} للهروب...")
                temp = max(temp, initial_temp * 0.4) # نرفع درجة الحرارة لإجبارها على حركات عشوائية
                stagnation_counter = 0 # نصفر العداد ونبدأ المحاولة من جديد
                
            # التبريد العادي
            temp = max(0.1, temp * cooling_rate)

            # --- 🕵️‍♂️ رسالة التتبع الصامتة (لتتأكد من أن الخوارزمية تعمل) ---
            if (i + 1) % 500 == 0:
                log_q.put(f"... ⚙️ جاري المعالجة بصمت: وصلنا للدورة {i+1} من أصل {iterations}...")

    log_q.put(f"✓ انتهى مُحسِّن LNS v16 بأفضل تكلفة: {format_cost_tuple(best_cost)}")
    return best_solution, True



# ===================================================================
# 7. دالة البحث المحلي (تُستخدم كجزء من VNS لتحسين الحلول بعد هزها)
# ===================================================================
def run_post_processing_swaps(schedule, prof_assignments, prof_workload, prof_large_counts, settings, all_professors, date_map, swap_attempts, locked_guards=set(), stop_event=None, log_q=None):
    large_hall_weight = float(settings.get('largeHallWeight', 3.0))
    other_hall_weight = float(settings.get('otherHallWeight', 1.0))
    duty_patterns = settings.get('dutyPatterns', {})
    unavailable_days = settings.get('unavailableDays', {})
    max_shifts = int(settings.get('maxShifts', '0')) if settings.get('maxShifts', '0') != '0' else float('inf')
    max_large_hall_shifts = int(settings.get('maxLargeHallShifts', '2')) if settings.get('maxLargeHallShifts', '2') != '0' else float('inf')
    
    temp_schedule = copy.deepcopy(schedule)
    
    temp_assignments = defaultdict(list)
    temp_large_counts = defaultdict(int)
    temp_workload = defaultdict(float)
    all_exams_flat = [exam for day in temp_schedule.values() for slot in day.values() for exam in slot]
    for exam in all_exams_flat:
        is_large = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
        duty_weight = large_hall_weight if is_large else other_hall_weight
        for g in exam.get('guards', []):
            if g != "**نقص**":
                temp_assignments[g].append(exam)
                temp_workload[g] += duty_weight
                if is_large:
                    temp_large_counts[g] += 1

    for i in range(swap_attempts):
        if stop_event and stop_event.is_set():
            if log_q and i > 0: log_q.put(f"... [الصقل] تم الإيقاف بعد {i} محاولة تبديل.")
            break
        if not temp_workload or len(temp_workload) < 2: break
        
        most_burdened_prof = max(temp_workload, key=temp_workload.get)
        least_burdened_prof = min(temp_workload, key=temp_workload.get)

        if most_burdened_prof == least_burdened_prof or temp_workload[most_burdened_prof] <= temp_workload[least_burdened_prof]:
            break 
            
        swap_found = False
        possible_swaps = [
            exam for exam in temp_assignments.get(most_burdened_prof, [])
            if (exam.get('uuid'), most_burdened_prof) not in locked_guards
        ]
        random.shuffle(possible_swaps)

        for exam in possible_swaps:
            date, time = exam['date'], exam['time']
            is_large_hall_exam = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
            settings_for_validation = {
                'dutyPatterns': duty_patterns,
                'unavailableDays': unavailable_days,
                'maxShifts': max_shifts,
                'maxLargeHallShifts': max_large_hall_shifts
            }

            if is_assignment_valid(least_burdened_prof, exam, temp_assignments, temp_large_counts, settings_for_validation, date_map):
                exam_in_schedule = next((e for e in temp_schedule[date][time] if e.get('uuid') == exam.get('uuid')), None)
                if not exam_in_schedule: continue

                try:
                    guard_index_to_remove = exam_in_schedule['guards'].index(most_burdened_prof)
                    del exam_in_schedule['guards'][guard_index_to_remove]
                    exam_in_schedule['guards'].append(least_burdened_prof)
                except ValueError:
                    continue

                duty_weight = large_hall_weight if is_large_hall_exam else other_hall_weight
                temp_workload[most_burdened_prof] -= duty_weight
                temp_workload[least_burdened_prof] += duty_weight
                if is_large_hall_exam:
                    temp_large_counts[most_burdened_prof] -= 1
                    temp_large_counts[least_burdened_prof] = temp_large_counts.get(least_burdened_prof, 0) + 1
                
                exam_to_remove_index = -1
                for idx, assigned_exam in enumerate(temp_assignments[most_burdened_prof]):
                    if assigned_exam.get('uuid') == exam.get('uuid'):
                        exam_to_remove_index = idx
                        break
                
                if exam_to_remove_index != -1:
                    del temp_assignments[most_burdened_prof][exam_to_remove_index]
                else:
                    continue 

                temp_assignments[least_burdened_prof].append(exam)
                swap_found = True
                break
        
        if not swap_found:
            break 
            
    return temp_schedule, temp_assignments, temp_workload, temp_large_counts


# ===================================================================
# 8. دالة البحث الجواري المتغير (VNS)
# ===================================================================
def run_variable_neighborhood_search(initial_schedule, settings, all_professors, duty_patterns, date_map, log_q, locked_guards=set(), stop_event=None):
    log_q.put(">>> تشغيل VNS (النسخة ذات البصيرة المرحلية)...")

    iterations = int(settings.get('vnsIterations', 100))
    k_max = int(settings.get('vnsMaxK', 25))

    settings_for_validation = {
        'dutyPatterns': duty_patterns,
        'unavailableDays': settings.get('unavailableDays', {}),
        'maxShifts': settings.get('maxShifts', '0'),
        'maxLargeHallShifts': settings.get('maxLargeHallShifts', '2')
    }

    current_solution = copy.deepcopy(initial_schedule)
    
    # 🌟 التعديل السحري: وضع غشاوة على عيني الخوارزمية إذا كان هناك نقص
    raw_cost = calculate_cost(current_solution, settings, all_professors, duty_patterns, date_map)
    current_cost = (raw_cost[0], raw_cost[1], 0.0, 0) if raw_cost[0] > 0 or raw_cost[1] > 0 else raw_cost
    log_q.put(f"... [VNS] التكلفة الأولية = {format_cost_tuple(current_cost)}")

    best_solution_so_far = copy.deepcopy(current_solution)
    best_cost_so_far = current_cost

    i = 0
    while i < iterations:
        if stop_event and stop_event.is_set(): break
        if settings.get('should_stop_event', threading.Event()).is_set(): break

        percent_complete = int(((i + 1) / iterations) * 100)
        log_q.put(f"PROGRESS:{percent_complete}")
        
        if (i + 1) % 10 == 0:
            log_q.put(f"... ⚙️ [VNS] الدورة {i+1}/{iterations}: المعالجة مستمرة...")
        
        k = 1
        while k <= k_max:
            # --- أ. مرحلة الهز الخفيف (Shaking) ---
            shaken_solution = copy.deepcopy(current_solution)
            duties_to_destroy = []
            for day in shaken_solution.values():
                for slot in day.values():
                    for exam in slot:
                        for g_idx, guard in enumerate(exam.get('guards', [])):
                            if guard != "**نقص**" and (exam.get('uuid'), guard) not in locked_guards:
                                duties_to_destroy.append({'exam': exam, 'guard_index': g_idx})

            if not duties_to_destroy: break 
            
            random.shuffle(duties_to_destroy)
            for j in range(min(k, len(duties_to_destroy))):
                duty_info = duties_to_destroy[j]
                duty_info['exam']['guards'][duty_info['guard_index']] = "**نقص**"

            # --- ب. مرحلة الإصلاح السريع ---
            all_exams_in_shaken = [exam for day in shaken_solution.values() for slot in day.values() for exam in slot]
            shortage_slots = []
            prof_workload = defaultdict(float)
            prof_assignments = defaultdict(list)
            prof_large_counts = defaultdict(int)
            
            large_hall_weight = float(settings.get('largeHallWeight', 3.0))
            other_hall_weight = float(settings.get('otherHallWeight', 1.0))
            
            for exam in all_exams_in_shaken:
                is_large = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
                duty_weight = large_hall_weight if is_large else other_hall_weight
                for idx, guard in enumerate(exam.get('guards', [])):
                    if guard == "**نقص**":
                        shortage_slots.append({'exam': exam, 'index_to_fill': idx})
                    else:
                        prof_workload[guard] += duty_weight
                        prof_assignments[guard].append(exam)
                        if is_large: prof_large_counts[guard] += 1

            for repair_info in shortage_slots:
                exam_to_repair = repair_info['exam']
                is_large_repair = any(h['type'] == 'كبيرة' for h in exam_to_repair.get('halls', []))
                repair_duty_weight = large_hall_weight if is_large_repair else other_hall_weight
                
                valid_candidates = []
                for prof in all_professors:
                    if prof in exam_to_repair.get('guards', []): continue
                    if is_assignment_valid(prof, exam_to_repair, prof_assignments, prof_large_counts, settings_for_validation, date_map):
                        valid_candidates.append((prof, prof_workload.get(prof, 0)))
                
                if valid_candidates:
                    best_prof_found, _ = min(valid_candidates, key=lambda item: item[1])
                    exam_to_repair['guards'][repair_info['index_to_fill']] = best_prof_found
                    prof_workload[best_prof_found] += repair_duty_weight
                    prof_assignments[best_prof_found].append(exam_to_repair)
                    if is_large_repair: prof_large_counts[best_prof_found] += 1

            # --- ج. مرحلة البحث المحلي ---
            local_search_solution = copy.deepcopy(shaken_solution)
            
            local_search_solution, _, _, _ = run_post_processing_swaps(
                local_search_solution, defaultdict(list), defaultdict(float), defaultdict(int),
                settings, all_professors, date_map, 40, locked_guards
            )

            all_exams_ls = [e for d in local_search_solution.values() for s in d.values() for e in s]
            prof_assignments_ls = defaultdict(list)
            prof_large_counts_ls = defaultdict(int)
            for e in all_exams_ls:
                is_large = any(h['type'] == 'كبيرة' for h in e.get('halls', []))
                for g in e.get('guards', []):
                    if g != "**نقص**":
                        prof_assignments_ls[g].append(e)
                        if is_large: prof_large_counts_ls[g] += 1

            for _ in range(30):
                duties = [(exam, g, idx) for exam in all_exams_ls for idx, g in enumerate(exam.get('guards', [])) if g != "**نقص**" and (exam.get('uuid'), g) not in locked_guards]
                if not duties: break
                exam_to_change, prof1, guard_idx = random.choice(duties)
                
                possible_profs = [p for p in all_professors if p != prof1 and p not in exam_to_change.get('guards', [])]
                if not possible_profs: continue
                prof2 = random.choice(possible_profs)
                
                if is_assignment_valid(prof2, exam_to_change, prof_assignments_ls, prof_large_counts_ls, settings_for_validation, date_map):
                    exam_to_change['guards'][guard_idx] = prof2
                    prof_assignments_ls[prof1] = [e for e in prof_assignments_ls[prof1] if e.get('uuid') != exam_to_change.get('uuid')]
                    prof_assignments_ls[prof2].append(exam_to_change)
                    if any(h['type'] == 'كبيرة' for h in exam_to_change.get('halls', [])):
                        prof_large_counts_ls[prof1] -= 1
                        prof_large_counts_ls[prof2] += 1

            # 🌟 تطبيق الغشاوة على التكلفة الجديدة أيضاً 🌟
            raw_new_cost = calculate_cost(local_search_solution, settings, all_professors, duty_patterns, date_map)
            new_cost = (raw_new_cost[0], raw_new_cost[1], 0.0, 0) if raw_new_cost[0] > 0 or raw_new_cost[1] > 0 else raw_new_cost

            if new_cost < current_cost:
                current_solution, current_cost = local_search_solution, new_cost
                if new_cost < best_cost_so_far:
                    best_cost_so_far, best_solution_so_far = new_cost, copy.deepcopy(current_solution)
                    log_q.put(f"... [VNS] دورة {i+1} (k={k}): تم العثور على حل أفضل بتكلفة = {format_cost_tuple(best_cost_so_far)}")
                    
                    if best_cost_so_far[0] == 0 and best_cost_so_far[1] == 0 and best_cost_so_far[2] == 0 and best_cost_so_far[3] == 0:
                        log_q.put("... [VNS] تم الوصول لجدول مثالي بالكامل! إنهاء مبكر...")
                        break
                k = 1 
            else:
                k += 1 
        
        if best_cost_so_far[0] == 0 and best_cost_so_far[1] == 0 and best_cost_so_far[2] == 0 and best_cost_so_far[3] == 0:
            break
        i += 1

    # حساب التكلفة الحقيقية الصافية في النهاية لعرضها للمستخدم
    final_cost = calculate_cost(best_solution_so_far, settings, all_professors, duty_patterns, date_map)
    log_q.put(f"✓ انتهى VNS بأفضل تكلفة: {format_cost_tuple(final_cost)}")
    
    final_assignments = defaultdict(list)
    final_workload = defaultdict(float)
    final_large_counts = defaultdict(int)
    large_hall_weight = float(settings.get('largeHallWeight', 3.0))
    other_hall_weight = float(settings.get('otherHallWeight', 1.0))
    for day in best_solution_so_far.values():
        for slot in day.values():
            for exam in slot:
                 is_large = any(h['type'] == 'كبيرة' for h in exam.get('halls', []))
                 duty_weight = large_hall_weight if is_large else other_hall_weight
                 for guard in exam.get('guards',[]):
                     if guard != "**نقص**":
                         final_assignments[guard].append(exam)
                         final_workload[guard] += duty_weight
                         if is_large:
                             final_large_counts[guard] += 1

    return best_solution_so_far, final_assignments, final_workload, final_large_counts

# ===================================================================
# 9. دالة البحث المحظور (Tabu Search)
# ===================================================================
def run_tabu_search(initial_schedule, settings, all_professors, duty_patterns, date_map, log_q, locked_guards=set(), stop_event=None):
    log_q.put(">>> تشغيل البحث المحظور (النسخة ذات البصيرة المرحلية)...")

    max_iterations = int(settings.get('tabuIterations', 200))
    tabu_tenure = int(settings.get('tabuTenure', 20))
    neighborhood_size = int(settings.get('tabuNeighborhoodSize', 100))

    current_solution = copy.deepcopy(initial_schedule)
    
    # 🌟 التعديل السحري: وضع غشاوة على عيني الخوارزمية
    raw_cost = calculate_cost(current_solution, settings, all_professors, duty_patterns, date_map)
    current_cost = (raw_cost[0], raw_cost[1], 0.0, 0) if raw_cost[0] > 0 or raw_cost[1] > 0 else raw_cost
    log_q.put(f"... [Tabu Search] التكلفة الأولية = {format_cost_tuple(current_cost)}")

    best_solution_so_far = copy.deepcopy(current_solution)
    best_cost_so_far = current_cost
    tabu_list = deque(maxlen=tabu_tenure)

    stagnation_counter = 0
    stagnation_limit = max(20, int(max_iterations * 0.15))

    for i in range(max_iterations):
        if stop_event and stop_event.is_set(): break
        if settings.get('should_stop_event', threading.Event()).is_set(): break
        percent_complete = int(((i + 1) / max_iterations) * 100)
        log_q.put(f"PROGRESS:{percent_complete}")

        if (i + 1) % 20 == 0:
            log_q.put(f"... ⚙️ [Tabu] المعالجة مستمرة ومحاولة كسر الانحراف (دورة {i+1}/{max_iterations})...")

        if stagnation_counter >= stagnation_limit:
            log_q.put(f"⚡ [Tabu] ركود في التحسن لـ {stagnation_limit} دورة. مسح الذاكرة المحظورة للهروب من الفخ...")
            tabu_list.clear() 
            stagnation_counter = 0

        best_neighbor_in_iteration, best_neighbor_cost_in_iteration, best_move_in_iteration = None, (float('inf'), float('inf'), float('inf'), float('inf')), None

        current_assignments = defaultdict(list)
        current_large_counts = defaultdict(int)
        all_exams_in_current = [e for d in current_solution.values() for s in d.values() for e in s]
        shortage_slots = []
        all_duties = []
        
        for e in all_exams_in_current:
            is_large = any(h['type'] == 'كبيرة' for h in e.get('halls', []))
            for g_idx, g in enumerate(e.get('guards', [])):
                if g == "**نقص**":
                    shortage_slots.append((e, g_idx))
                else:
                    current_assignments[g].append(e)
                    if is_large: current_large_counts[g] += 1
                    if (e.get('uuid'), g) not in locked_guards:
                        all_duties.append((e, g, g_idx))

        repair_probability = 0.8 if current_cost[0] > 0 else 0.05

        for _ in range(neighborhood_size):
            neighbor = None
            move = None

            if random.random() < repair_probability:
                if not shortage_slots: continue
                exam_to_repair, guard_idx = random.choice(shortage_slots)

                valid_profs = []
                for p in all_professors:
                    if p not in exam_to_repair.get('guards', []) and is_assignment_valid(p, exam_to_repair, current_assignments, current_large_counts, settings, date_map):
                        valid_profs.append(p)
                
                if valid_profs:
                    valid_profs.sort(key=lambda p: len(current_assignments[p]))
                    prof_to_add = random.choice(valid_profs[:min(3, len(valid_profs))])
                    
                    neighbor = copy.deepcopy(current_solution)
                    exam_in_neighbor = next(e for e in neighbor[exam_to_repair['date']][exam_to_repair['time']] if e.get('uuid') == exam_to_repair.get('uuid'))
                    exam_in_neighbor['guards'][guard_idx] = prof_to_add
                    move = (exam_in_neighbor.get('uuid'), guard_idx)
            else:
                if not all_duties: continue

                exam_to_change, prof1, guard_idx = random.choice(all_duties)
                possible_profs = [p for p in all_professors if p != prof1 and p not in exam_to_change.get('guards', [])]
                if not possible_profs: continue
                prof2 = random.choice(possible_profs)

                if not is_assignment_valid(prof2, exam_to_change, current_assignments, current_large_counts, settings, date_map):
                    continue

                neighbor = copy.deepcopy(current_solution)
                exam_in_neighbor = next(e for e in neighbor[exam_to_change['date']][exam_to_change['time']] if e.get('uuid') == exam_to_change.get('uuid'))
                exam_in_neighbor['guards'][guard_idx] = prof2
                move = (exam_in_neighbor.get('uuid'), guard_idx)

            if not neighbor: continue

            # 🌟 تطبيق الغشاوة على التكلفة الجديدة
            raw_neighbor_cost = calculate_cost(neighbor, settings, all_professors, duty_patterns, date_map)
            neighbor_cost = (raw_neighbor_cost[0], raw_neighbor_cost[1], 0.0, 0) if raw_neighbor_cost[0] > 0 or raw_neighbor_cost[1] > 0 else raw_neighbor_cost

            is_tabu = move in tabu_list
            if is_tabu:
                if neighbor_cost < best_cost_so_far: 
                    if neighbor_cost < best_neighbor_cost_in_iteration:
                         best_neighbor_in_iteration, best_neighbor_cost_in_iteration, best_move_in_iteration = neighbor, neighbor_cost, move
            else:
                if neighbor_cost < best_neighbor_cost_in_iteration:
                    best_neighbor_in_iteration, best_neighbor_cost_in_iteration, best_move_in_iteration = neighbor, neighbor_cost, move

        if not best_neighbor_in_iteration:
            continue

        current_solution = best_neighbor_in_iteration
        current_cost = best_neighbor_cost_in_iteration
        
        if best_move_in_iteration:
            tabu_list.append(best_move_in_iteration)

        improved_in_this_cycle = False
        if current_cost < best_cost_so_far:
            best_cost_so_far, best_solution_so_far = current_cost, copy.deepcopy(current_solution)
            improved_in_this_cycle = True
            log_q.put(f"... [Tabu] دورة {i+1}: تم العثور على حل أفضل بتكلفة = {format_cost_tuple(best_cost_so_far)}")

            if best_cost_so_far[0] == 0 and best_cost_so_far[1] == 0 and best_cost_so_far[2] == 0 and best_cost_so_far[3] == 0:
                log_q.put("... [Tabu] الحل مثالي، إنهاء البحث.")
                break

        if not improved_in_this_cycle:
            stagnation_counter += 1
        else:
            stagnation_counter = 0

    # إظهار التكلفة الحقيقية في النهاية
    final_cost = calculate_cost(best_solution_so_far, settings, all_professors, duty_patterns, date_map)
    log_q.put(f"✓ البحث المحظور انتهى بأفضل تكلفة: {format_cost_tuple(final_cost)}")
    return best_solution_so_far, None, None, None


# ===================================================================
# 10. دالة توليد تقرير الأخطاء والملاحظات (الإصدار الشامل لجميع القيود)
# ===================================================================
def generate_violation_report(schedule, settings, all_professors):
    """تحليل شامل ودقيق لجميع قيود الجدول (الصارمة والمرنة)"""
    strict_errors = []
    soft_warnings = []
    from collections import defaultdict

    # مخازن البيانات للإحصاء
    prof_proctor_days = defaultdict(set)   # الأيام التي يحرس فيها الأستاذ فعلياً
    prof_subject_days = defaultdict(set)   # الأيام التي تقع فيها مواد الأستاذ
    prof_shift_counts = defaultdict(int)   # إجمالي عدد الحراسات
    prof_large_counts = defaultdict(int)   # عدد الحراسات في قاعات كبيرة

    # جلب الإعدادات والقيود
    professor_pairs = settings.get('professorPartnerships', [])
    exclusive_profs = settings.get('exclusiveProfessors', [])
    unavailable_days = settings.get('unavailableDays', {})
    duty_patterns = settings.get('dutyPatterns', {})
    
    max_shifts = int(settings.get('maxShifts', '0')) if settings.get('maxShifts', '0') != '0' else float('inf')
    max_large_hall_shifts = int(settings.get('maxLargeHallShifts', '2')) if settings.get('maxLargeHallShifts', '2') != '0' else float('inf')
    guards_per_large_hall = int(settings.get('guardsLargeHall', 4))

    # خريطة الأيام لحساب التتالي
    sorted_dates = sorted(schedule.keys())
    date_map = {date: i for i, date in enumerate(sorted_dates)}

    # 1. المسح الشامل للجدول لجمع الإحصائيات
    for day, slots in schedule.items():
        for time_slot, exams in slots.items():
            slot_profs = set() # لمنع تكرار الأستاذ في نفس الفترة
            for exam in exams:
                subject_owner = exam.get('professor', 'غير محدد').strip()
                subject_name = exam.get('subject', 'مادة غير معروفة')
                
                # حساب عدد الحراس المطلوبين للقاعات الكبيرة في هذا الامتحان
                num_large_halls = len([h for h in exam.get('halls', []) if h.get('type') == 'كبيرة'])
                large_slots_needed = num_large_halls * guards_per_large_hall
                
                # تسجيل يوم المادة لصاحب المادة
                if subject_owner and subject_owner != "غير محدد":
                    prof_subject_days[subject_owner].add(day)

                # فحص الحراس
                for idx, guard in enumerate(exam.get('guards', [])):
                    if guard == "**نقص**":
                        strict_errors.append(f"🔴 نقص: يوم {day} ({time_slot}) لمادة {subject_name}.")
                        continue
                    
                    guard_clean = guard.strip()
                    prof_proctor_days[guard_clean].add(day)
                    prof_shift_counts[guard_clean] += 1
                    
                    # 🌟 تصحيح القاعات الكبيرة: يُحسب فقط إذا كان ترتيب الحارس ضمن حصة القاعة الكبيرة
                    if idx < large_slots_needed:
                        prof_large_counts[guard_clean] += 1

                    # فحص التعارض الزمني
                    if guard_clean in slot_profs:
                        strict_errors.append(f"🔴 تعارض زمني: الأستاذ [{guard_clean}] يحرس في أكثر من مكان يوم {day} ({time_slot}).")
                    slot_profs.add(guard_clean)

                    # فحص الأيام غير المتاحة
                    if day in unavailable_days.get(guard_clean, []):
                        strict_errors.append(f"🔴 مخالفة توفر: الأستاذ [{guard_clean}] كُلف بالحراسة يوم {day} وهو غير متاح.")

    # 2. فحص سقف الحراسات (إجمالي وقاعات كبيرة)
    for prof in all_professors:
        p_name = prof.strip()
        if prof_shift_counts[p_name] > max_shifts:
            strict_errors.append(f"🔴 تجاوز الحد الأقصى: الأستاذ [{p_name}] يحرس {prof_shift_counts[p_name]} فترات (الحد: {max_shifts}).")
        
        if prof_large_counts[p_name] > max_large_hall_shifts:
            strict_errors.append(f"🔴 تجاوز القاعات الكبيرة: الأستاذ [{p_name}] يحرس {prof_large_counts[p_name]} مرات في قاعة كبيرة (الحد: {max_large_hall_shifts}).")

    # 3. فحص أنماط الدوام (تجاهل نمط unlimited)
    for prof, pattern in duty_patterns.items():
        if pattern == 'unlimited' or not prof_proctor_days.get(prof): continue
        
        indices = sorted(list({date_map[d] for d in prof_proctor_days[prof] if d in date_map}))
        num_days = len(indices)

        if pattern == 'one_day_only' and num_days > 1:
            strict_errors.append(f"🔴 مخالفة نمط (يوم واحد فقط): الأستاذ [{prof}] يحرس في {num_days} أيام.")
        elif pattern == 'flexible_2_days' and num_days != 2:
            strict_errors.append(f"🔴 مخالفة نمط (يومان مرنان): الأستاذ [{prof}] يحرس في {num_days} أيام (المطلوب 2).")
        elif pattern == 'consecutive_strict':
            if num_days != 2 or (len(indices) > 1 and indices[1] - indices[0] != 1):
                strict_errors.append(f"🔴 مخالفة نمط (يومان متتاليان): الأستاذ [{prof}] لم يحقق شرط التتالي حصراً.")
        elif pattern == 'flexible_3_days' and (num_days < 2 or num_days > 3):
            strict_errors.append(f"🔴 مخالفة نمط (2-3 أيام مرنة): الأستاذ [{prof}] يحرس في {num_days} أيام.")

    # 4. فحص الارتباط والتنافر
    for p1, p2 in [ (str(pair[0]).strip(), str(pair[1]).strip()) for pair in professor_pairs if len(pair)==2 ]:
        if prof_proctor_days.get(p1, set()) != prof_proctor_days.get(p2, set()):
            strict_errors.append(f"🔴 فك ارتباط: الأستاذان [{p1}] و [{p2}] يجب أن يتشاركا في جميع أيام حراستهما.")

    for p1, p2 in [ (str(pair[0]).strip(), str(pair[1]).strip()) for pair in exclusive_profs if len(pair)==2 ]:
        if not prof_proctor_days.get(p1, set()).isdisjoint(prof_proctor_days.get(p2, set())):
            strict_errors.append(f"🔴 تنافر ممنوع: الأستاذان [{p1}] و [{p2}] لا يجب أن يجتمعا في نفس اليوم.")

    # 5. القيود المرنة (كفاءة الحضور وتشتت المواد)
    for prof, sub_days in prof_subject_days.items():
        p_name = prof.strip()
        p_days = prof_proctor_days.get(p_name, set())
        
        # كفاءة الحضور
        for s_day in sub_days:
            if s_day not in p_days:
                soft_warnings.append(f"🟠 كفاءة الحضور (-10 نقاط): الأستاذ [{p_name}] لديه امتحان مادة يوم {s_day} ولكنه لا يحرس فيه.")
        
        # تشتت المواد (أكثر من يومين)
        if len(sub_days) > 2:
            extra = len(sub_days) - 2
            soft_warnings.append(f"🟠 تشتت المواد (-{extra * 5} نقاط): مواد الأستاذ [{p_name}] موزعة على {len(sub_days)} أيام.")

    return {"strict": strict_errors, "soft": soft_warnings}


# ===================================================================
# 11. دالة الطوارئ لسد النقص (Desperation Repair Pass)
# ===================================================================
def desperation_repair_pass(schedule, settings, all_professors, duty_patterns, date_map):
    """
    تتدخل هذه الدالة في نهاية التوليد للبحث عن أي 'نقص' متبقٍ.
    تقوم بفرز الأساتذة (من الأقل عبئاً للأكثر) وتحاول سد النقص عبر 4 مستويات متدرجة.
    """
    import copy
    from collections import defaultdict

    repaired_schedule = copy.deepcopy(schedule)
    
    unavailable_days = settings.get('unavailableDays', {})
    exclusive_profs = settings.get('exclusiveProfessors', [])
    max_shifts = int(settings.get('maxShifts', '0')) if settings.get('maxShifts', '0') != '0' else float('inf')
    max_large_hall_shifts = int(settings.get('maxLargeHallShifts', '2')) if settings.get('maxLargeHallShifts', '2') != '0' else float('inf')
    guards_per_large_hall = int(settings.get('guardsLargeHall', 4))

    # 1. إحصاء العبء الحالي لكل أستاذ في الجدول شبه النهائي
    prof_assignments = defaultdict(list)
    prof_large_counts = defaultdict(int)
    
    for day, slots in repaired_schedule.items():
        for time_slot, exams in slots.items():
            for exam in exams:
                num_large_halls = len([h for h in exam.get('halls', []) if h.get('type') == 'كبيرة'])
                large_slots_needed = num_large_halls * guards_per_large_hall
                valid_guards = [g for g in exam.get('guards', []) if g != "**نقص**"]
                
                for idx, guard in enumerate(valid_guards):
                    guard_clean = guard.strip()
                    prof_assignments[guard_clean].append(exam)
                    # 🌟 يُحسب كحارس قاعة كبيرة فقط إذا كان في المقاعد المخصصة لها
                    if idx < large_slots_needed:
                        prof_large_counts[guard_clean] += 1
                            
    def is_strictly_forbidden(prof, exam):
        if any(e['date'] == exam['date'] and e['time'] == exam['time'] for e in prof_assignments.get(prof, [])): return True
        if exam['date'] in unavailable_days.get(prof, []): return True
        for pair in exclusive_profs:
            if len(pair) == 2:
                if prof == pair[0].strip() and any(e['date'] == exam['date'] for e in prof_assignments.get(pair[1].strip(), [])): return True
                if prof == pair[1].strip() and any(e['date'] == exam['date'] for e in prof_assignments.get(pair[0].strip(), [])): return True
        return False

    def pattern_broken(prof, exam):
        prof_pattern = duty_patterns.get(prof, 'flexible_2_days')
        if prof_pattern == 'unlimited': return False
        
        duties_dates = {d['date'] for d in prof_assignments.get(prof, [])}
        is_new_day = exam['date'] not in duties_dates
        num_duty_days = len(duties_dates)
        
        if is_new_day:
            if (prof_pattern == 'one_day_only' and num_duty_days >= 1) or \
               (prof_pattern == 'flexible_2_days' and num_duty_days >= 2) or \
               (prof_pattern == 'flexible_3_days' and num_duty_days >= 3) or \
               (prof_pattern == 'consecutive_strict' and num_duty_days >= 2):
                return True
            elif prof_pattern == 'consecutive_strict' and num_duty_days == 1:
                idx1 = date_map.get(list(duties_dates)[0])
                idx2 = date_map.get(exam['date'])
                if idx1 is None or idx2 is None or abs(idx1 - idx2) != 1: return True
        return False

    # 2. البحث عن النقص وسده بالتدرج
    for day, slots in repaired_schedule.items():
        for time_slot, exams in slots.items():
            for exam in exams:
                while "**نقص**" in exam.get('guards', []):
                    num_large_halls = len([h for h in exam.get('halls', []) if h.get('type') == 'كبيرة'])
                    large_slots_needed = num_large_halls * guards_per_large_hall
                    current_guards_count = len([g for g in exam.get('guards', []) if g != "**نقص**"])
                    
                    # 🌟 هل هذا النقص يقع ضمن مقاعد القاعة الكبيرة؟
                    is_large_hall_position = current_guards_count < large_slots_needed
                    
                    sorted_profs = sorted(all_professors, key=lambda p: len(prof_assignments.get(p.strip(), [])))
                    assigned = False
                    
                    for level in range(4):
                        for prof in sorted_profs:
                            prof_clean = prof.strip()
                            if is_strictly_forbidden(prof_clean, exam): continue
                            
                            shifts = len(prof_assignments.get(prof_clean, []))
                            large_shifts = prof_large_counts.get(prof_clean, 0)
                            
                            if level == 0:
                                if shifts >= max_shifts: continue
                                if is_large_hall_position and large_shifts >= max_large_hall_shifts: continue
                                if pattern_broken(prof_clean, exam): continue
                            elif level == 1:
                                if shifts >= max_shifts: continue
                                if pattern_broken(prof_clean, exam): continue
                            elif level == 2:
                                if pattern_broken(prof_clean, exam): continue
                            elif level == 3:
                                pass
                            
                            exam['guards'].remove("**نقص**")
                            exam['guards'].append(prof_clean)
                            prof_assignments[prof_clean].append(exam)
                            if is_large_hall_position:
                                prof_large_counts[prof_clean] += 1
                            assigned = True
                            break 
                        
                        if assigned: break 
                    if not assigned: break 
                    
    return repaired_schedule