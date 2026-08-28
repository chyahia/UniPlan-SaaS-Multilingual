# Copyright (c) 2026 Chaib Yahia. All rights reserved.
# This software is licensed under the CC BY-NC 4.0 License. Commercial use is strictly prohibited.
from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

# تهيئة كائن قاعدة البيانات
db = SQLAlchemy()

# ==========================================
# 1. جدول الكيانات/الأقسام (نواة العزل - SaaS)
# ==========================================
class Tenant(db.Model):
    __tablename__ = 'tenants'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False, unique=True) # اسم القسم (مثال: قسم اللغة العربية)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    is_active = db.Column(db.Boolean, default=True)

    # ✨ حقول الصلاحيات الجديدة
    has_teaching = db.Column(db.Boolean, default=True) # تفعيل نظام التدريس
    has_exams = db.Column(db.Boolean, default=True)    # تفعيل نظام الامتحانات

# ==========================================
# 2. جداول النظام (معزولة برقم القسم tenant_id)
# ==========================================
class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(100), nullable=False, unique=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(50), nullable=False) # الأدوار: super_admin, tenant_admin, teacher
    
    # مفاتيح الربط
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=True) # المدير العام لا يتبع لقسم (Null)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id'), nullable=True)

class Teacher(db.Model):
    __tablename__ = 'teachers'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)

    show_assigned = db.Column(db.Integer, default=0)
    
    # قيد لضمان عدم تكرار اسم الأستاذ داخل نفس القسم فقط
    __table_args__ = (db.UniqueConstraint('name', 'tenant_id', name='uq_teacher_name_tenant'),)

class Level(db.Model):
    __tablename__ = 'levels'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)

class Room(db.Model):
    __tablename__ = 'rooms'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    type = db.Column(db.String(50), nullable=False)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)

class CourseNature(db.Model):
    __tablename__ = 'course_natures'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    symbol = db.Column(db.String(20), nullable=False)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)

# جدول وسيط (ManyToMany) لربط المادة بالمستويات
course_levels = db.Table('course_levels',
    db.Column('course_id', db.Integer, db.ForeignKey('courses.id', ondelete='CASCADE'), primary_key=True),
    db.Column('level_id', db.Integer, db.ForeignKey('levels.id', ondelete='CASCADE'), primary_key=True)
)

class Course(db.Model):
    __tablename__ = 'courses'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(150), nullable=False)
    room_type = db.Column(db.String(50), nullable=False)
    division = db.Column(db.String(50), nullable=True)
    specialization = db.Column(db.String(100), nullable=True)
    course_nature = db.Column(db.String(50), nullable=True)
    
    # مفاتيح الربط
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id', ondelete='SET NULL'), nullable=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    
    # العلاقة مع المستويات
    levels = db.relationship('Level', secondary=course_levels, backref=db.backref('courses', lazy=True))

class TeacherRequest(db.Model):
    __tablename__ = 'teacher_requests'
    id = db.Column(db.Integer, primary_key=True)
    teacher_id = db.Column(db.Integer, db.ForeignKey('teachers.id', ondelete='CASCADE'), nullable=False)
    requested_courses = db.Column(db.Text, nullable=True)
    requested_days = db.Column(db.Text, nullable=True)
    status = db.Column(db.String(50), default='قيد المراجعة')
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)

class Setting(db.Model):
    __tablename__ = 'settings'
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(100), nullable=False)
    value = db.Column(db.Text, nullable=False)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    
    # ضمان عدم تكرار المفتاح للإعدادات داخل نفس القسم
    __table_args__ = (db.UniqueConstraint('key', 'tenant_id', name='uq_setting_key_tenant'),)


# ==========================================
# الجداول الخاصة بنظام حراسة الامتحانات (معزولة بـ tenant_id)
# ==========================================

# 1. جداول الربط (يجب تعريفها في الأعلى لتفادي أخطاء Pylance)
exam_teacher_subject = db.Table('exam_teacher_subject',
    db.Column('teacher_id', db.Integer, db.ForeignKey('exam_teachers.id'), primary_key=True),
    db.Column('subject_id', db.Integer, db.ForeignKey('exam_subjects.id'), primary_key=True)
)

exam_level_room = db.Table('exam_level_room',
    db.Column('level_id', db.Integer, db.ForeignKey('exam_levels.id'), primary_key=True),
    db.Column('room_id', db.Integer, db.ForeignKey('exam_rooms.id'), primary_key=True)
)

# جدول وسيط لربط المادة (ExamSubject) بعدة مستويات (ExamLevel)
exam_subject_level = db.Table('exam_subject_level',
    db.Column('subject_id', db.Integer, db.ForeignKey('exam_subjects.id'), primary_key=True),
    db.Column('level_id', db.Integer, db.ForeignKey('exam_levels.id'), primary_key=True)
)

# 2. الجداول الأساسية
class ExamTeacher(db.Model):
    __tablename__ = 'exam_teachers'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    # الآن المتغير exam_teacher_subject معروف لأنه معرّف في الأعلى
    subjects = db.relationship('ExamSubject', secondary=exam_teacher_subject, backref='teachers')

class ExamRoom(db.Model):
    __tablename__ = 'exam_rooms'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(50), nullable=False)
    type = db.Column(db.String(50), nullable=False) # صغيرة، متوسطة، كبيرة

class ExamLevel(db.Model):
    __tablename__ = 'exam_levels'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    # المتغير exam_level_room معروف أيضاً
    rooms = db.relationship('ExamRoom', secondary=exam_level_room, backref='levels')

class ExamSubject(db.Model):
    __tablename__ = 'exam_subjects'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    name = db.Column(db.String(150), nullable=False)
    
    # ✨ العلاقة الجديدة: ربط المادة بقائمة من المستويات عبر الجدول الوسيط ✨
    levels = db.relationship('ExamLevel', secondary=exam_subject_level, backref='subjects')

class ExamDay(db.Model):
    __tablename__ = 'exam_days'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    day_order = db.Column(db.Integer, nullable=False)
    date_text = db.Column(db.String(50), nullable=False)
    morning_slots = db.Column(db.Integer, default=0)
    afternoon_slots = db.Column(db.Integer, default=0)

class ExamSetting(db.Model):
    __tablename__ = 'exam_settings'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False)
    key = db.Column(db.String(50), nullable=False)
    value = db.Column(db.Text, nullable=True)

class ResitExamData(db.Model):
    __tablename__ = 'resit_exam_data'
    id = db.Column(db.Integer, primary_key=True)
    tenant_id = db.Column(db.Integer, db.ForeignKey('tenants.id'), nullable=False, unique=True)
    # هذا العمود السحري سيحفظ كل (الأساتذة، القاعات، المستويات، القيود) في حزمة واحدة!
    db_dict = db.Column(db.JSON, nullable=False)