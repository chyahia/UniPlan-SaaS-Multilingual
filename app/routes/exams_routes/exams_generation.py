from flask import Blueprint, request, jsonify, Response, session
import json
import uuid
import random
from collections import defaultdict
from flask_babel import _

# استدعاء نماذج قاعدة البيانات السحابية الخاصة بالامتحانات
from app.database import db, ExamSetting, ExamTeacher, ExamSubject, ExamLevel, ExamRoom, ExamDay

# 🌟 استدعاء خوارزميات الامتحانات
from app.services.exams_algorithms import (
    _run_initial_subject_placement, run_subject_optimization_phase, clean_string_for_matching,
    complete_schedule_with_guards, run_unified_lns_optimizer,
    run_large_neighborhood_search, run_variable_neighborhood_search,
    desperation_repair_pass, calculate_cost, format_cost_tuple, generate_violation_report
)

# 🌟 استدعاء أدوات السحابة (Celery و Redis)
# 🌟 استدعاء أدوات السحابة (Celery)
from app.celery_setup import celery_app
import threading

exams_generation_bp = Blueprint('exams_generation', __name__)

# ✨ الدالة الذكية (المحوّل) لاختيار مسار الذاكرة أو مسار السحابة
def get_log_queue(tenant_id):
    from flask import current_app
    if current_app.config.get('APP_MODE') == 'desktop':
        from app.memory_logger import MemoryLogQueue
        return MemoryLogQueue(tenant_id)
    else:
        from app.redis_logger import RedisLogQueue
        return RedisLogQueue(tenant_id)

# ==============================================================
# 🛠️ دوال مساعدة لحساب التوازن (تبقى كما هي لأنها دوال رياضية)
# ==============================================================
def calculate_balanced_distribution(total_large, total_other, num_profs, w_large, w_other):
    if num_profs == 0: return []
    total_workload = (total_large * w_large) + (total_other * w_other)
    target_workload = total_workload / num_profs
    
    distribution = []
    base_large = total_large // num_profs
    remainder_large = total_large % num_profs
    
    for i in range(num_profs):
        large_count = base_large + 1 if i < remainder_large else base_large
        rem_workload = target_workload - (large_count * w_large)
        other_count = max(0, round(rem_workload / w_other))
        distribution.append({
            'large': large_count, 
            'other': other_count, 
            'total_workload': (large_count * w_large) + (other_count * w_other)
        })
    return distribution

def generate_balance_report(prof_stats, prof_targets):
    patterns = defaultdict(int)
    for stats in prof_stats.values():
        patterns[(stats['large'], stats['other'])] += 1
        
    target_patterns = defaultdict(int)
    if prof_targets:
        for target in prof_targets.values():
            target_patterns[(target['large'], target['other'])] += 1

    report_details = []
    all_keys = sorted(list(set(patterns.keys()) | set(target_patterns.keys())))
    total_deviation = 0
    
    for key in all_keys:
        actual = patterns.get(key, 0)
        target = target_patterns.get(key, 0)
        deviation = actual - target
        total_deviation += abs(deviation)
        report_details.append({
            'large_count': key[0], 
            'other_count': key[1], 
            'target_count': target, 
            'actual_count': actual, 
            'deviation': deviation
        })

    balance_score = max(0, 100 - (total_deviation * 2))
    return {'details': report_details, 'balance_score': round(balance_score)}

# ==============================================================
# 🌟 كائن ذكي يحاكي (stop_event) للخوارزميات لتقرأ الإيقاف من السحابة
# ==============================================================
class StopEventProxy:
    def __init__(self, tenant_id):
        self.log_q = get_log_queue(tenant_id)
    def is_set(self):
        return self.log_q.should_stop()
    def set(self):
        self.log_q.set_stop_flag(True)
    def clear(self):
        self.log_q.set_stop_flag(False)

# ==============================================================
# 🌐 مسارات الواجهة الأمامية (API) الخاصة بتوليد الامتحانات
# ==============================================================

from flask import Response, stream_with_context

@exams_generation_bp.route('/exams/api/stream-logs')
def stream_logs():
    tenant_id = session.get('tenant_id')
    log_q = get_log_queue(tenant_id)
    
    def generate():
        last_idx = 0
        import time
        while True:
            logs = log_q.get_logs(start_index=last_idx)
            
            if logs:
                # إذا كانت هناك سجلات جديدة، أرسلها
                for msg in logs:
                    yield f"data: {msg}\n\n"
                last_idx += len(logs)
            else:
                # 🚀 نبضة الحياة (Heartbeat): 
                # إرسال تعليق فارغ لا يظهر في الواجهة لكنه يمنع المتصفح من قطع الاتصال (Timeout)
                yield ": heartbeat\n\n"
            
            # 🛡️ التعديل الدقيق: التحقق من انتهاء الخوارزمية وانتهاء الرسائل للخروج من الحلقة
            if not log_q.is_running() and not logs:
                break
                
            time.sleep(0.5)
            
    # 🛡️ التعديل الدقيق: إضافة stream_with_context لحماية الاتصال
    return Response(stream_with_context(generate()), mimetype='text/event-stream', headers={
        'X-Accel-Buffering': 'no', 
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive' 
    })

@exams_generation_bp.route('/exams/api/stop-generation', methods=['POST'])
def stop_algorithm():
    tenant_id = session.get('tenant_id')
    log_q = get_log_queue(tenant_id)
    log_q.set_stop_flag(True)
    log_q.put(_("... تم إرسال إشارة إيقاف الخوارزمية، جاري إنهاء العمليات ..."))
    return jsonify({'success': True})

@exams_generation_bp.route('/exams/api/generate-schedule', methods=['POST'])
def generate_schedule():
    tenant_id = session.get('tenant_id')
    lang_code = session.get('lang', 'ar')  # 👈 1. قراءة لغة المستخدم من الجلسة
    
    if not tenant_id: return jsonify({'error': _('غير مصرح')}), 403

    log_q = get_log_queue(tenant_id)
    if log_q.is_running():
        return jsonify({"success": False, "error": _("عملية التوزيع تعمل حالياً في قسمك.")}), 400

    data = request.json
    algorithm_choices = data.get('algorithms', ['lns']) 
    algo_params = data.get('params', {})
    
    log_q.clear_logs()
    log_q.set_running(True)
    log_q.set_stop_flag(False)
        
    from flask import current_app
    mode = current_app.config.get('APP_MODE')
    if mode == 'desktop':
        app_obj = current_app._get_current_object()
        def run_thread():
            with app_obj.app_context():
                # 👈 2. إرسال اللغة إلى المهمة الخلفية
                background_exam_generation_task(tenant_id, algorithm_choices, algo_params, lang_code)
        threading.Thread(target=run_thread).start()
    else:
        # 👈 3. إرسال اللغة إلى مهمة السحابة (Celery)
        background_exam_generation_task.delay(tenant_id, algorithm_choices, algo_params, lang_code)
    
    return jsonify({'success': True, 'message': _('بدأت عملية التوليد في الخلفية.')})

# ==============================================================
# 📢 مسار نشر جدول الحراسة لحسابات الأساتذة
# ==============================================================
@exams_generation_bp.route('/exams/api/publish', methods=['POST'])
def publish_exam_schedule():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({'error': _('غير مصرح')}), 403

    schedule_data = request.json
    if not schedule_data: return jsonify({'error': _('لا توجد بيانات لجدول الامتحانات')}), 400

    try:
        # حفظ الجدول النهائي كجدول معتمد
        setting_sched = ExamSetting.query.filter_by(key='published_exam_schedule', tenant_id=tenant_id).first()
        value_str = json.dumps(schedule_data)
        if setting_sched:
            setting_sched.value = value_str
        else:
            db.session.add(ExamSetting(key='published_exam_schedule', value=value_str, tenant_id=tenant_id))

        # رفع راية "تم النشر"
        setting_pub = ExamSetting.query.filter_by(key='is_exam_published', tenant_id=tenant_id).first()
        if setting_pub:
            setting_pub.value = '1'
        else:
            db.session.add(ExamSetting(key='is_exam_published', value='1', tenant_id=tenant_id))

        db.session.commit()
        return jsonify({'success': True, 'message': _('📢 تم نشر جدول الامتحانات في حسابات الأساتذة بنجاح!')})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)})

# ==============================================================
# 🚫 مسار سحب / إلغاء نشر جدول الحراسة من حسابات الأساتذة
# ==============================================================
@exams_generation_bp.route('/exams/api/unpublish', methods=['POST'])
def unpublish_exam_schedule():
    tenant_id = session.get('tenant_id')
    if not tenant_id: return jsonify({'error': _('غير مصرح')}), 403

    try:
        # إطفاء راية "تم النشر" بجعل قيمتها 0
        setting_pub = ExamSetting.query.filter_by(key='is_exam_published', tenant_id=tenant_id).first()
        if setting_pub:
            setting_pub.value = '0'
        else:
            db.session.add(ExamSetting(key='is_exam_published', value='0', tenant_id=tenant_id))

        db.session.commit()
        return jsonify({'success': True, 'message': _('🚫 تم سحب الجداول، ولن تظهر في حسابات الأساتذة بعد الآن.')})
    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)})

# ==============================================================
# ⚙️ مهمة الخلفية الثقيلة (Celery Task)
# ==============================================================

# 👈 4. استقبال المتغير الجديد (lang_code)
@celery_app.task
def background_exam_generation_task(tenant_id, algorithm_choices, algo_params, lang_code='ar'):
    
    # 👈 5. استيراد أداة الترجمة المستقلة وتفعيل اللغة قبل بدء أي شيء!
    from app.services.exams_algorithms import set_exam_algorithm_language, _
    set_exam_algorithm_language(lang_code)

    log_queue = get_log_queue(tenant_id)
    stop_event = StopEventProxy(tenant_id)
    from flask import current_app as app 
    
    try:
        log_queue.put(_("جاري جلب البيانات من قاعدة البيانات السحابية المعزولة..."))
        
        with app.app_context():
            # 1. جلب الإعدادات
            row_main = ExamSetting.query.filter_by(key='main_settings', tenant_id=tenant_id).first()
            main_settings = json.loads(row_main.value) if row_main and row_main.value else {}

            if algo_params:
                main_settings['lnsUnifiedIterations'] = int(algo_params.get('unifiedIter', 300))
                main_settings['lnsUnifiedDestroyFraction'] = float(algo_params.get('unifiedDestroy', 0.2))
                main_settings['lnsIterations'] = int(algo_params.get('lnsIter', 100))
                main_settings['lnsDestroyFraction'] = float(algo_params.get('lnsDestroy', 0.2))
                main_settings['vnsIterations'] = int(algo_params.get('vnsIter', 100))
                main_settings['vnsMaxK'] = int(algo_params.get('vnsK', 25))
                
            
            row_sched = ExamSetting.query.filter_by(key='exam_schedule', tenant_id=tenant_id).first()
            exam_schedule = json.loads(row_sched.value) if row_sched and row_sched.value else {}
            
            if not exam_schedule:
                log_queue.put("DONE:{\"success\": false, \"message\": \"" + _("الرجاء إعداد جدول الامتحانات في المرحلة 4 أولاً.") + "\"}")
                return

            all_professors = [p.name for p in ExamTeacher.query.filter_by(tenant_id=tenant_id).all()]
            all_levels_list = [l.name for l in ExamLevel.query.filter_by(tenant_id=tenant_id).all()]
            all_halls_list = [{'id': h.id, 'name': h.name, 'type': h.type} for h in ExamRoom.query.filter_by(tenant_id=tenant_id).all()]
            
            # ✨ التعديل 1: جلب المواد ومستوياتها كقائمة وتنسيق الاسم المدمج
            all_subjects_list = []
            assignments = defaultdict(list)
            for p in ExamTeacher.query.filter_by(tenant_id=tenant_id).all():
                for s in p.subjects:
                    levels_list = sorted([l.name for l in s.levels]) if hasattr(s, 'levels') and s.levels else []
                    combined_level = " + ".join(levels_list) if levels_list else 'غير محدد'
                    assignments[p.name].append({'subj_name': s.name, 'levels': levels_list, 'level_name': combined_level})
            
            for s in ExamSubject.query.filter_by(tenant_id=tenant_id).all():
                levels_list = sorted([l.name for l in s.levels]) if hasattr(s, 'levels') and s.levels else []
                combined_level = " + ".join(levels_list) if levels_list else 'غير محدد'
                all_subjects_list.append({'subj_id': s.id, 'subj_name': s.name, 'levels': levels_list, 'level_name': combined_level})
                
            level_halls = []
            for l in ExamLevel.query.filter_by(tenant_id=tenant_id).all():
                for r in l.rooms:
                    level_halls.append({'level_name': l.name, 'hall_id': r.id})

            pinned_row = ExamSetting.query.filter_by(key='pinned_subject_schedule', tenant_id=tenant_id).first()
            pinned_value = pinned_row.value if pinned_row else None

# ==============================================================
        # 🛠️ تنسيق البيانات لتطابق الخوارزميات الأصلية
        # ==============================================================
        
        settings_for_placement = dict(main_settings)
        settings_for_placement['examSchedule'] = exam_schedule
        
        halls_map = {h['id']: h['name'] for h in all_halls_list}
        level_hall_assignments = defaultdict(list)
        for lh in level_halls:
            if lh['hall_id'] in halls_map:
                level_hall_assignments[lh['level_name']].append(halls_map[lh['hall_id']])
        settings_for_placement['levelHallAssignments'] = dict(level_hall_assignments)
        
        # ✨ التعديل 2: إرسال مصفوفة المستويات للخوارزمية
        formatted_subjects = [{'name': s['subj_name'], 'levels': s['levels']} for s in all_subjects_list]
        
        subject_owners = {}
        for prof, subjs in assignments.items():
            for subj in subjs:
                # ✨ التعديل 3: بناء مفتاح المادة باستخدام (Tuple) للمستويات ليطابق الخوارزمية تماماً
                levels_tuple = tuple(sorted([clean_string_for_matching(l) for l in subj['levels']]))
                subject_owners[(clean_string_for_matching(subj['subj_name']), levels_tuple)] = prof
                
        formatted_halls = [{'name': h['name'], 'type': h['type']} for h in all_halls_list]

        # ==============================================================
        # 🚀 تشغيل مرحلة التوزيع الأولي للمواد 
        # ==============================================================

        if pinned_value:
            log_queue.put(_("--- 📌 تم العثور على مخطط مواد يدوي (مُثبت)، سيتم اعتماده كلياً وتخطي التوزيع التلقائي للمواد ---"))
            subject_schedule = json.loads(pinned_value)
            group_mappings = {} 
        else:
            log_queue.put(_(">>> بناء جدول المواد المبدئي وتوزيع القاعات (تلقائياً)..."))
            subject_schedule, group_mappings = _run_initial_subject_placement(
                settings_for_placement, formatted_subjects, all_levels_list, subject_owners, formatted_halls
            )
            
            if main_settings.get('groupSubjects', False):
                subject_schedule = run_subject_optimization_phase(
                    subject_schedule, assignments, all_levels_list, subject_owners, 
                    settings_for_placement, log_queue, group_mappings, stop_event=stop_event
                )

        locked_guards = set()
        sorted_dates = sorted(exam_schedule.keys())
        date_map = {date: i for i, date in enumerate(sorted_dates)}
        duty_patterns = main_settings.get('dutyPatterns', {})

        for day in subject_schedule.values():
            for slot in day.values():
                for exam in slot:
                    if 'uuid' not in exam:
                        exam['uuid'] = str(uuid.uuid4())

        if main_settings.get('assignOwnerAsGuard', False):
            prof_last_exam = {}
            for day in subject_schedule.values():
                for slot in day.values():
                    for exam in slot:
                        owner = exam.get('professor')
                        if owner and owner != 'غير محدد':
                            exam_date_time_str = f"{exam['date']} {exam['time'].split('-')[0]}"
                            if owner not in prof_last_exam or exam_date_time_str > prof_last_exam[owner]['datetime_str']:
                                prof_last_exam[owner] = {'exam': exam, 'datetime_str': exam_date_time_str}
            
            unavailable_days = main_settings.get('unavailableDays', {})
            for owner, data in prof_last_exam.items():
                exam_to_lock = data['exam']
                if exam_to_lock['date'] not in unavailable_days.get(owner, []):
                    locked_guards.add((exam_to_lock['uuid'], owner))

        # ==============================================================
        # ⚙️ تشغيل سلسلة الخوارزميات (Pipeline)
        # ==============================================================
        
        current_schedule = complete_schedule_with_guards(
            subject_schedule, main_settings, all_professors, assignments, 
            all_levels_list, duty_patterns, date_map, all_subjects_list, locked_guards, stop_event, log_queue
        )
        
        best_schedule = current_schedule
        
        for algo in algorithm_choices:
            if stop_event.is_set(): break
            
            log_queue.put(f"\n==========================================")
            log_queue.put(_("🚀 بدء تشغيل مرحلة: {algo}").format(algo=algo.upper()))
            log_queue.put(f"==========================================")
            
            if algo == 'unified':
                best_schedule, _dummy = run_unified_lns_optimizer(best_schedule, main_settings, all_professors, assignments, duty_patterns, date_map, all_subjects_list, log_queue, all_levels_list, locked_guards, stop_event)
            elif algo == 'lns':
                best_schedule, _d1, _d2, _d3 = run_large_neighborhood_search(best_schedule, main_settings, all_professors, duty_patterns, date_map, log_q=log_queue, locked_guards=locked_guards, stop_event=stop_event)
            elif algo == 'vns':
                best_schedule, _d1, _d2, _d3 = run_variable_neighborhood_search(best_schedule, main_settings, all_professors, duty_patterns, date_map, log_q=log_queue, locked_guards=locked_guards, stop_event=stop_event)
            

        if best_schedule and not stop_event.is_set():
            log_queue.put(_("\n✓ انتهت سلسلة الخوارزميات بالكامل. جاري حساب الإحصائيات النهائية..."))

            log_queue.put(_(">>> جاري تفعيل فريق الطوارئ (جبر النقص الأخير)..."))
            best_schedule = desperation_repair_pass(best_schedule, main_settings, all_professors, duty_patterns, date_map)
            final_cost = calculate_cost(best_schedule, main_settings, all_professors, duty_patterns, date_map)
            log_queue.put(_("✓ اكتمل جبر النقص. النتيجة النهائية: {cost}").format(cost=format_cost_tuple(final_cost)))
            
            # --- حساب الإحصائيات للوحة المعلومات ---
            all_exams_flat = [exam for day in best_schedule.values() for slot in day.values() for exam in slot]
            prof_stats = {p: {'large': 0, 'other': 0} for p in all_professors}
            shortage_reports = []
            duties_per_day = defaultdict(int)
            
            guards_large_hall = int(main_settings.get('guardsLargeHall', 4))
            for exam in all_exams_flat:
                for guard in exam.get('guards', []):
                    if guard == '**نقص**':
                        shortage_reports.append(f"{exam['subject']} ({exam['level']})")
                    else:
                        duties_per_day[exam['date']] += 1
                
                guards_copy = [g for g in exam.get('guards', []) if g != '**نقص**']
                large_guards_needed = sum(guards_large_hall for h in exam.get('halls', []) if h.get('type') == 'كبيرة')
                
                for guard in guards_copy[:large_guards_needed]:
                    if guard in prof_stats: prof_stats[guard]['large'] += 1
                for guard in guards_copy[large_guards_needed:]:
                    if guard in prof_stats: prof_stats[guard]['other'] += 1

            total_large = sum(s['large'] for s in prof_stats.values())
            total_other = sum(s['other'] for s in prof_stats.values())
            total_duties = total_large + total_other
            num_profs = len(all_professors)
            
            large_weight = float(main_settings.get('largeHallWeight', 3.0))
            other_weight = float(main_settings.get('otherHallWeight', 1.0))
            prof_workload = {p: (s['large'] * large_weight) + (s['other'] * other_weight) for p, s in prof_stats.items() if (s['large']+s['other']) > 0}
            sorted_profs = sorted(prof_workload.items(), key=lambda item: item[1])

            busiest_day_date = max(duties_per_day, key=duties_per_day.get) if duties_per_day else 'N/A'
            busiest_day_duties = duties_per_day[busiest_day_date] if duties_per_day else 0

            enable_custom_targets = main_settings.get('enableCustomTargets', False)
            custom_target_patterns = main_settings.get('customTargetPatterns', [])
            prof_targets_map = {}
            
            if num_profs > 0:
                if enable_custom_targets and custom_target_patterns:
                    prof_targets_list = []
                    for pattern in custom_target_patterns:
                        count = int(pattern.get('count', 0))
                        for _dummy in range(count): 
                            prof_targets_list.append({'large': int(pattern.get('large', 0)), 'other': int(pattern.get('other', 0))})
                    
                    num_to_fill = num_profs - len(prof_targets_list)
                    if num_to_fill > 0:
                        rem_large = total_large - sum(p['large'] for p in prof_targets_list)
                        rem_other = total_other - sum(p['other'] for p in prof_targets_list)
                        if rem_large >= 0 and rem_other >= 0:
                            prof_targets_list.extend(calculate_balanced_distribution(rem_large, rem_other, num_to_fill, large_weight, other_weight))
                    
                    shuffled_profs = list(all_professors) 
                    random.shuffle(shuffled_profs)
                    prof_targets_map = {prof: prof_targets_list[i] for i, prof in enumerate(shuffled_profs) if i < len(prof_targets_list)}
                else:
                    prof_targets_list = calculate_balanced_distribution(total_large, total_other, num_profs, large_weight, other_weight)
                    if prof_targets_list: 
                        prof_targets_map = {prof: prof_targets_list[i % len(prof_targets_list)] for i, prof in enumerate(sorted(all_professors))}

            balance_report_data = generate_balance_report(prof_stats, prof_targets_map)

            # ✨ التعديل 4: فحص المواد غير المبرمجة بالاعتماد على الاسم المدمج
            scheduled_subject_keys = {(exam['subject'], exam['level']) for day in best_schedule.values() for slot in day.values() for exam in slot}
            unscheduled_subjects = []
            for subj in all_subjects_list:
                if (subj['subj_name'], subj['level_name']) not in scheduled_subject_keys:
                    unscheduled_subjects.append(f"{subj['subj_name']} ({subj['level_name']})")

            chart_data = {
                'labels': [],
                'datasets': [
                    {'label': _('حصص القاعات الأخرى'), 'data': [], 'backgroundColor': 'rgba(54, 162, 235, 0.7)'},
                    {'label': _('حصص القاعة الكبيرة'), 'data': [], 'backgroundColor': 'rgba(255, 99, 132, 0.7)'}
                ]
            }
            for prof_name in sorted(prof_stats.keys()):
                chart_data['labels'].append(prof_name)
                chart_data['datasets'][0]['data'].append(prof_stats[prof_name]['other'])
                chart_data['datasets'][1]['data'].append(prof_stats[prof_name]['large'])

            stats_dashboard = {
                'total_large_duties': total_large,
                'total_other_duties': total_other,
                'total_duties': total_duties,
                'avg_duties_per_prof': total_duties / num_profs if num_profs > 0 else 0,
                'busiest_day': {'date': busiest_day_date, 'duties': busiest_day_duties},
                'least_burdened_profs': [{'name': p[0], 'workload': round(p[1], 2)} for p in sorted_profs[:3]],
                'most_burdened_profs': [{'name': p[0], 'workload': round(p[1], 2)} for p in sorted_profs[-3:]][::-1],
                'shortage_reports': shortage_reports,
                'unscheduled_subjects_report': unscheduled_subjects,
                'chart_data': chart_data,
                'balance_report_data': balance_report_data 
            }

            violations_report = generate_violation_report(best_schedule, main_settings, all_professors)

            result_json = json.dumps({
                "success": True, 
                "schedule": best_schedule, 
                "stats": stats_dashboard,
                "violations": violations_report 
            })
            log_queue.put(f"DONE:{result_json}")
        else:
            log_queue.put("DONE:{\"success\": false, \"message\": \"" + _("فشل إيجاد حل أو تم الإيقاف بواسطة المستخدم.") + "\"}")

    except Exception as e:
        import traceback
        log_queue.put(_("خطأ فادح: {error}").format(error=str(e)))
        log_queue.put(traceback.format_exc())
        log_queue.put("DONE:{\"success\": false, \"message\": \"" + _("حدث خطأ داخلي في الخادم السحابي.") + "\"}")
    finally:
        log_queue.set_running(False)