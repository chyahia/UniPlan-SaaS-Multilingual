# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
import json
from flask import session
from sqlalchemy.orm.attributes import flag_modified
from app.database import db, ResitExamData  # تأكد من مسار الاستيراد الصحيح
from flask_babel import _

# ==========================================
# دوال استدعاء وحفظ الحالة الشاملة للقسم (SaaS)
# ==========================================
def get_tenant_state(tenant_id_override=None):
    """جلب أو إنشاء صندوق البيانات الخاص بالقسم الحالي"""
    # نستخدم الرقم الممرر من السيليري، أو نأخذه من الجلسة للمستخدم العادي
    tenant_id = tenant_id_override or session.get('tenant_id')
    if not tenant_id:
        raise Exception(_("حدث خطأ: لا يوجد قسم مسجل في الجلسة الحالية."))
    
    state = ResitExamData.query.filter_by(tenant_id=tenant_id).first()
    if not state:
        defaults = {"teachers": [], "rooms": {}, "levels": [], "subjects": [], "teacher_subjects": {}, "level_rooms": {}, "schedule": {}, "constraints": {"invigilators_per_room": {_("قاعة كبيرة"): 3, _("قاعة متوسطة"): 2, _("قاعة صغيرة"): 1},"max_shifts_per_day": 0,"max_large_hall_shifts": 0,"teacher_patterns": {},"incompatible_levels": [],"prioritized_teachers": [],"carpool_pairs": [],"conflict_pairs": [],"no_first_slot_teachers": []}}
        state = ResitExamData(tenant_id=tenant_id, db_dict=defaults)
        db.session.add(state)
        db.session.commit()
    return state

def load_full_db(tenant_id_override=None):
    return get_tenant_state(tenant_id_override).db_dict

def save_full_db(db_dict, tenant_id_override=None):
    state = get_tenant_state(tenant_id_override)
    state.db_dict = db_dict
    flag_modified(state, "db_dict")
    db.session.commit()



# ==========================================
# دوال التعديل المباشر (تستخدمها الواجهات)
# ==========================================

# --- إدارة الأساتذة ---
def add_teacher(name):
    db_dict = load_full_db()
    if name not in db_dict['teachers']:
        db_dict['teachers'].append(name)
        save_full_db(db_dict)

def remove_teacher(name):
    db_dict = load_full_db()
    if name in db_dict['teachers']:
        db_dict['teachers'].remove(name)
        save_full_db(db_dict)

def edit_teacher_name(old_name, new_name):
    db_dict = load_full_db()
    if old_name in db_dict['teachers']:
        idx = db_dict['teachers'].index(old_name)
        db_dict['teachers'][idx] = new_name
        save_full_db(db_dict)

# --- إدارة القاعات ---
def add_room(name, r_type):
    db_dict = load_full_db()
    db_dict['rooms'][name] = r_type
    save_full_db(db_dict)

def remove_room(name):
    db_dict = load_full_db()
    if name in db_dict['rooms']:
        del db_dict['rooms'][name]
        save_full_db(db_dict)

def edit_room_name(old_name, new_name):
    db_dict = load_full_db()
    if old_name in db_dict['rooms']:
        r_type = db_dict['rooms'].pop(old_name)
        db_dict['rooms'][new_name] = r_type
        save_full_db(db_dict)

# --- إدارة المستويات ---
def add_level(name):
    db_dict = load_full_db()
    if name not in db_dict['levels']:
        db_dict['levels'].append(name)
        save_full_db(db_dict)

def remove_level(name):
    db_dict = load_full_db()
    if name in db_dict['levels']:
        db_dict['levels'].remove(name)
        save_full_db(db_dict)

def edit_level_name(old_name, new_name):
    db_dict = load_full_db()
    if old_name in db_dict['levels']:
        idx = db_dict['levels'].index(old_name)
        db_dict['levels'][idx] = new_name
        # تحديث أسماء المستويات داخل المواد المرتبطة بها
        for s in db_dict['subjects']:
            if s['level'] == old_name:
                s['level'] = new_name
        save_full_db(db_dict)

# --- إدارة المواد ---
def add_subject(name, level):
    db_dict = load_full_db()
    exists = any(s['name'] == name and s['level'] == level for s in db_dict['subjects'])
    if not exists:
        db_dict['subjects'].append({"name": name, "level": level})
        save_full_db(db_dict)

def remove_subject(name, level):
    db_dict = load_full_db()
    db_dict['subjects'] = [s for s in db_dict['subjects'] if not (s['name'] == name and s['level'] == level)]
    save_full_db(db_dict)

def edit_subject_name(old_name, level_name, new_name):
    db_dict = load_full_db()
    for s in db_dict['subjects']:
        if s['name'] == old_name and s['level'] == level_name:
            s['name'] = new_name
    save_full_db(db_dict)

# --- إدارة البيانات المعقدة ---
def update_complex_state(key, data_dict, tenant_id_override=None):
    db_dict = load_full_db(tenant_id_override)
    db_dict[key] = data_dict
    save_full_db(db_dict, tenant_id_override)