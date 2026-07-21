// ==========================================
// 🌐 محرك الترجمة المصغر لملفات الجافاسكريبت
// ==========================================
function _t(key) {
    // يتحقق مما إذا كان هناك قاموس ترجمة مرسل من واجهة HTML
    if (window.i18n_dict && window.i18n_dict[key]) {
        return window.i18n_dict[key];
    }
    return key; // يعود بالنص الأصلي إذا لم تتوفر الترجمة
}

let assig_teachers = [];
let assig_courses = [];
let selectedTeacherId = null;
let selectedCourseIds = new Set(); // نستخدم Set لمنع التكرار

// جلب البيانات من الخادم
function loadAssignmentsData() {
    fetch('/api/assignments/data')
        .then(res => res.json())
        .then(data => {
            assig_teachers = data.teachers;
            assig_courses = data.courses;
            // تصفير الاختيارات بعد كل تحديث
            selectedTeacherId = null;
            selectedCourseIds.clear();
            updateAssignButton();
            renderAssignments();
        });
}

// رسم القوائم بناءً على البحث والبيانات
function renderAssignments() {
    const teacherSearch = document.getElementById('search-teachers').value.toLowerCase();
    const courseSearch = document.getElementById('search-courses').value.toLowerCase();
    
    const teachersListEl = document.getElementById('assign-teachers-list');
    const coursesListEl = document.getElementById('assign-courses-list');
    
    teachersListEl.innerHTML = '';
    coursesListEl.innerHTML = '';

    // 1. رسم الأساتذة
    assig_teachers.forEach(teacher => {
        if(!teacher.name.toLowerCase().includes(teacherSearch)) return;
        
        // جلب المواد المسندة حالياً لهذا الأستاذ
        const teacherCourses = assig_courses.filter(c => c.teacher_id === teacher.id);
        const hasAssigned = teacherCourses.length > 0;
        
        const isSelected = teacher.id === selectedTeacherId;
        const classes = `list-item ${isSelected ? 'is-selected' : ''} ${hasAssigned ? 'is-assigned' : ''}`;
        
        const countText = hasAssigned ? ` <span style="color:#e67e22; font-size:12px;">(${teacherCourses.length})</span>` : '';
        let html = `<div class="${classes}" id="t-item-${teacher.id}">
            <div>
                <span class="toggle-btn" onclick="toggleTeacherList(${teacher.id}, event)">▶</span>
                <strong onclick="selectTeacher(${teacher.id})" ondblclick="unassignTeacher(${teacher.id})">${teacher.name}${countText}</strong>
            </div>`;
            
        // إضافة القائمة المنسدلة المخفية (المثلث)
        if(hasAssigned) {
            // ✨ استخدام الخصائص المنطقية للاتجاهات
            html += `<ul class="teacher-courses-list" id="t-list-${teacher.id}" style="text-align: start; padding-inline-start: 20px;">
                        ${teacherCourses.map(c => `<li>${c.name} <span dir="auto">(${c.levels || ''})</span></li>`).join('')}
                     </ul>`;
        }
        html += `</div>`;
        teachersListEl.innerHTML += html;
    });

    // 2. رسم المواد
    assig_courses.forEach(course => {
        if(!course.name.toLowerCase().includes(courseSearch)) return;
        
        const isSelected = selectedCourseIds.has(course.id);
        const hasAssigned = course.teacher_id !== null;
        const classes = `list-item ${isSelected ? 'is-selected' : ''} ${hasAssigned ? 'is-assigned' : ''}`;
        
        // ✨ تغليف كلمة "بدون مستوى" بدالة الترجمة
        let html = `<div class="${classes}" onclick="selectCourse(${course.id})" ondblclick="unassignCourse(${course.id}, event)">
            <strong>${course.name}</strong> <small style="color:#7f8c8d;" dir="auto">(${course.levels || _t('بدون مستوى')})</small>`;
            
        if(hasAssigned && course.teacher_name) {
            html += `<span class="teacher-badge">${course.teacher_name}</span>`;
        }
        
        html += `</div>`;
        coursesListEl.innerHTML += html;
    });

    // استدعاء تحديث رادار المواد غير المسندة
    renderUnassignedCourses();
}

// تحديد الأستاذ
function selectTeacher(id) {
    selectedTeacherId = id;
    updateAssignButton();
    renderAssignments();
}

// تحديد أو إلغاء تحديد المادة للتخصيص
function selectCourse(id) {
    if(selectedCourseIds.has(id)) {
        selectedCourseIds.delete(id);
    } else {
        selectedCourseIds.add(id);
    }
    updateAssignButton();
    renderAssignments();
}

// فتح وإغلاق قائمة مواد الأستاذ (المثلث)
function toggleTeacherList(id, event) {
    event.stopPropagation();
    const list = document.getElementById(`t-list-${id}`);
    const btn = event.target;
    if(list) {
        if(list.style.display === 'block') {
            list.style.display = 'none';
            btn.innerText = '▶';
        } else {
            list.style.display = 'block';
            btn.innerText = '▼';
        }
    }
}

// تفعيل/تعطيل زر التخصيص
function updateAssignButton() {
    const isReady = (selectedTeacherId !== null && selectedCourseIds.size > 0);
    
    const topBtn = document.getElementById('main-assign-btn');
    if (topBtn) topBtn.disabled = !isReady;
    
    const midBtn = document.getElementById('middle-assign-btn');
    if (midBtn) midBtn.disabled = !isReady;
}

// إرسال طلب التخصيص (الإسناد)
function performAssignment() {
    if(selectedTeacherId === null || selectedCourseIds.size === 0) return;
    
    fetch('/api/assignments/assign', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            teacher_id: selectedTeacherId,
            course_ids: Array.from(selectedCourseIds)
        })
    }).then(res => res.json()).then(data => {
        if(data.success) loadAssignmentsData();
    });
}

// إلغاء إسناد مادة (نقر مزدوج)
function unassignCourse(id, event) {
    event.stopPropagation(); 
    fetch(`/api/assignments/unassign_course/${id}`, { method: 'POST' })
    .then(res => res.json()).then(data => {
        if(data.success) loadAssignmentsData();
    });
}

// إلغاء إسناد كل مواد الأستاذ (نقر مزدوج)
function unassignTeacher(id) {
    // ✨ تغليف رسالة التأكيد بدالة الترجمة
    if(!confirm(_t('هل أنت متأكد من إلغاء إسناد جميع المواد لهذا الأستاذ؟'))) return;
    fetch(`/api/assignments/unassign_teacher/${id}`, { method: 'POST' })
    .then(res => res.json()).then(data => {
        if(data.success) loadAssignmentsData();
    });
}

// ==========================================
// 🔍 دالة رسم رادار المواد غير المسندة
// ==========================================
function renderUnassignedCourses() {
    const container = document.getElementById('unassigned-courses-container');
    if (!container) return;

    const unassigned = assig_courses.filter(c => c.teacher_id === null);

    if (unassigned.length === 0) {
        // ✨ تغليف رسالة النجاح بدالة الترجمة
        container.innerHTML = `
            <div style="width: 100%; text-align: center; padding: 20px; background: #e8f5e9; border: 1px dashed #27ae60; border-radius: 8px;">
                <h3 style="color: #27ae60; margin: 0;">🎉 ${_t('عمل ممتاز! جميع المواد مسندة لأساتذة.')}</h3>
            </div>`;
        return;
    }

    const groupedByLevel = {};

    unassigned.forEach(course => {
        // ✨ تغليف كلمة بدون مستوى هنا أيضاً
        const levelsStr = course.levels || _t('بدون مستوى');
        const levelsArray = levelsStr.split('،').map(l => l.trim());
        
        levelsArray.forEach(lvl => {
            if (!groupedByLevel[lvl]) {
                groupedByLevel[lvl] = [];
            }
            groupedByLevel[lvl].push(course);
        });
    });

    let html = '';
    for (const [level, courses] of Object.entries(groupedByLevel)) {
        html += `
        <div style="flex: 1; min-width: 260px; background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
            <div style="background: #34495e; color: white; padding: 10px 15px; font-weight: bold; font-size: 14px; display: flex; justify-content: space-between; align-items: center;">
                <span>🎓 ${level}</span>
                <span style="background: #e74c3c; padding: 2px 8px; border-radius: 12px; font-size: 11px;">${courses.length} ${_t('مواد')}</span>
            </div>
            <ul style="list-style: none; padding: 0; margin: 0; max-height: 250px; overflow-y: auto;">
                ${courses.map(c => `
                    <li style="padding: 10px 15px; border-bottom: 1px solid #f1f2f6; font-size: 13px; color: #2c3e50; display: flex; justify-content: space-between; align-items: center; transition: 0.2s;" onmouseover="this.style.background='#fdf2e9'" onmouseout="this.style.background='transparent'">
                        <strong style="color: #d35400;">${c.name}</strong>
                    </li>
                `).join('')}
            </ul>
        </div>
        `;
    }

    container.innerHTML = html;
}