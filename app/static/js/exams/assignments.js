// متغيرات تخزين البيانات محلياً للبحث السريع
let allProfs = [];
let allSubjs = [];
let profAssignments = [];
let allLevels = [];
let allHalls = [];
let levelAssignments = [];

// متغيرات التحديد (التظليل)
let selectedProfId = null;
let selectedSubjIds = new Set(); // يمكن تظليل عدة مواد

document.addEventListener('DOMContentLoaded', () => {
    refreshAssignmentData();
});

function refreshAssignmentData() {
    loadAssignDataA();
    loadAssignDataB();
}

// ==========================================
// القسم أ: إسناد المواد للأساتذة (نظام الامتحانات السحابي)
// ==========================================
function loadAssignDataA() {
    Promise.all([
        fetch('/exams/api/get-professors').then(r => r.json()),
        fetch('/exams/api/get-subjects').then(r => r.json()),
        fetch('/exams/api/assignments/professors').then(r => r.json())
    ]).then(([profs, subjs, assigns]) => {
        allProfs = profs;
        allSubjs = subjs;
        profAssignments = assigns;
        
        renderProfs();
        renderSubjs();
    });
}

function renderProfs() {
    const query = document.getElementById('search-prof').value.toLowerCase();
    const container = document.getElementById('prof-list');
    container.innerHTML = '';

    allProfs.filter(p => p.name.toLowerCase().includes(query)).forEach(p => {
        // التحقق مما إذا كان الأستاذ مسنداً له مواد
        const assignment = profAssignments.find(a => a.prof_id === p.id);
        const isAssigned = assignment && assignment.subjects.length > 0;
        const isSelected = selectedProfId === p.id;

        const div = document.createElement('div');
        div.className = `list-item ${isSelected ? 'selected' : ''} ${isAssigned ? 'assigned-prof' : ''}`;
        
        // عند النقر العادي لتظليل الأستاذ
        div.onclick = () => { selectedProfId = p.id; renderProfs(); };
        
        // عند النقر المزدوج لإلغاء كل مواده
        div.ondblclick = (e) => { 
            e.stopPropagation();
            if (isAssigned) unassignAllFromProf(p.id, p.name); 
        };

        let html = `<div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                        <span>${p.name}</span>`;
        
        if (isAssigned) {
            html += `<span class="toggle-icon" onclick="toggleProfDetails(event, ${p.id})">▼</span></div>`;
            let subList = `<ul id="prof-details-${p.id}" style="display:none; margin: 5px 20px 0 0; padding: 0; list-style: square; font-size: 13px; color: #333; font-weight: normal;">`;
            assignment.subjects.forEach(s => {
                subList += `<li>${s.subj_name} (${s.level_name})</li>`;
            });
            subList += `</ul>`;
            html += subList;
        } else {
            html += `</div>`;
        }

        div.innerHTML = html;
        container.appendChild(div);
    });
}

// دالة إظهار وإخفاء القائمة المنسدلة للمواد (المثلث)
function toggleProfDetails(e, id) {
    e.stopPropagation(); // منع تظليل الأستاذ عند النقر على المثلث
    const ul = document.getElementById(`prof-details-${id}`);
    if(ul.style.display === 'none') { ul.style.display = 'block'; e.target.textContent = '▲'; }
    else { ul.style.display = 'none'; e.target.textContent = '▼'; }
}

function renderSubjs() {
    const query = document.getElementById('search-subj').value.toLowerCase();
    const container = document.getElementById('subj-list');
    container.innerHTML = '';

    allSubjs.filter(s => s.name.toLowerCase().includes(query) || s.level_name.toLowerCase().includes(query)).forEach(s => {
        const isSelected = selectedSubjIds.has(s.id);
        
        // البحث عن الأساتذة الذين يدرسون هذه المادة
        let teachingProfs = [];
        profAssignments.forEach(pa => {
            if(pa.subjects.some(sub => sub.subj_id === s.id)) teachingProfs.push(pa.prof_name);
        });
        const isAssigned = teachingProfs.length > 0;

        const div = document.createElement('div');
        div.className = `list-item ${isSelected ? 'selected' : ''} ${isAssigned ? 'assigned-subj' : ''}`;
        
        // تظليل متعدد للمواد (نقر عادي)
        div.onclick = () => { 
            if(selectedSubjIds.has(s.id)) selectedSubjIds.delete(s.id);
            else selectedSubjIds.add(s.id);
            renderSubjs(); 
        };

        // عند النقر المزدوج لإلغاء إسناد المادة
        div.ondblclick = (e) => { 
            e.stopPropagation();
            if (isAssigned) unassignSubject(s.id, s.name); 
        };

        let html = `<span>${s.name} <span style="color:#666; font-size:13px;">(${s.level_name})</span></span>`;
        
        if (isAssigned) {
            // كتابة اسم الأستاذ أمام المادة بلون أحمر
            html += `<div style="font-size: 13px; color: #d32f2f; margin-top: 5px; border-top: 1px dashed #ccc; padding-top: 3px;">الأستاذ: ${teachingProfs.join('، ')}</div>`;
        }

        div.innerHTML = html;
        container.appendChild(div);
    });
}

function assignSelected() {
    if (!selectedProfId) return showNotification('الرجاء تظليل أستاذ أولاً', 'error');
    if (selectedSubjIds.size === 0) return showNotification('الرجاء تظليل مادة واحدة على الأقل', 'error');

    // إرسال طلبات الإضافة لكل مادة محددة بشكل متوازي وسريع
    let promises = Array.from(selectedSubjIds).map(subjId => 
        fetch(`/exams/api/assignments/professors/${selectedProfId}/${subjId}`, { method: 'POST' })
    );

    Promise.all(promises).then(() => {
        showNotification('تم التخصيص بنجاح!', 'success');
        selectedSubjIds.clear(); // مسح التظليل بعد التخصيص
        loadAssignDataA(); // إعادة تحميل القوائم
    });
}

function unassignSelected() {
    if (!selectedProfId) return showNotification('الرجاء تظليل أستاذ أولاً لإلغاء إسناده', 'error');
    if (selectedSubjIds.size === 0) return showNotification('الرجاء تظليل المواد المراد إلغاء إسنادها', 'error');

    // إرسال طلبات حذف لكل مادة مظللة
    let promises = Array.from(selectedSubjIds).map(subjId => 
        fetch(`/exams/api/assignments/professors/${selectedProfId}/${subjId}`, { method: 'DELETE' })
    );

    Promise.all(promises).then(() => {
        showNotification('تم إلغاء التخصيص بنجاح!', 'success');
        selectedSubjIds.clear();
        loadAssignDataA();
    });
}

// دوال النقر المزدوج السريعة
function unassignAllFromProf(profId, profName) {
    if (!confirm(`هل أنت متأكد من إلغاء إسناد جميع المواد للأستاذ "${profName}"؟`)) return;
    
    // استخدام مسار الـ Bulk بذكاء لمسح المواد عبر إرسال مصفوفة فارغة
    const payload = {};
    payload[profId] = [];

    fetch(`/exams/api/assignments/professors/bulk`, { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('تم إلغاء إسناد جميع المواد بنجاح!', 'success');
            loadAssignDataA(); // تحديث القوائم فوراً
        }
    });
}

function unassignSubject(subjId, subjName) {
    if (!confirm(`هل أنت متأكد من إلغاء إسناد المادة "${subjName}"؟`)) return;
    
    // البحث عن كل الأساتذة المرتبطين بهذه المادة لفك ارتباطهم
    let teachingProfsIds = [];
    profAssignments.forEach(pa => {
        if(pa.subjects.some(sub => sub.subj_id === subjId)) teachingProfsIds.push(pa.prof_id);
    });

    let promises = teachingProfsIds.map(profId => 
        fetch(`/exams/api/assignments/professors/${profId}/${subjId}`, { method: 'DELETE' })
    );
    
    Promise.all(promises).then(() => {
        showNotification('تم إلغاء إسناد المادة بنجاح!', 'success');
        selectedSubjIds.delete(subjId); // إزالة التظليل إن وُجد
        loadAssignDataA(); // تحديث القوائم فوراً
    });
}

// ==========================================
// القسم ب: تحديد قاعات الامتحانات لكل مستوى (SaaS Mode)
// ==========================================
function loadAssignDataB() {
    Promise.all([
        fetch('/exams/api/get-levels').then(r => r.json()),
        fetch('/exams/api/get-halls').then(r => r.json()),
        fetch('/exams/api/assignments/levels').then(r => r.json())
    ]).then(([levels, halls, assigns]) => {
        allLevels = levels;
        allHalls = halls;
        levelAssignments = assigns;
        
        renderLevelHallsTable();
    });
}

function renderLevelHallsTable() {
    const tbody = document.getElementById('level-halls-table-body');
    tbody.innerHTML = '';

    allLevels.forEach(level => {
        // التحقق من القاعات المخصصة مسبقاً لهذا المستوى
        const assignment = levelAssignments.find(a => a.level_id === level.id);
        const assignedHallIds = assignment ? assignment.halls.map(h => h.hall_id) : [];

        // توليد مربعات الاختيار لكل قاعة
        let hallsHtml = '<div style="display: flex; flex-wrap: wrap; gap: 15px;">';
        allHalls.forEach(hall => {
            const isChecked = assignedHallIds.includes(hall.id) ? 'checked' : '';
            hallsHtml += `
                <label style="cursor: pointer; background: ${isChecked ? '#e3f2fd' : '#fff'}; padding: 5px 10px; border: 1px solid #ccc; border-radius: 4px;">
                    <input type="checkbox" class="hall-cb-${level.id}" value="${hall.id}" ${isChecked}>
                    ${hall.name} <small style="color:#888;">(${hall.type})</small>
                </label>`;
        });
        hallsHtml += '</div>';

        tbody.innerHTML += `
            <tr>
                <td style="padding: 15px; border-bottom: 1px solid #ddd; border-left: 1px solid #ddd; font-weight: bold; vertical-align: middle;">${level.name}</td>
                <td style="padding: 15px; border-bottom: 1px solid #ddd;">${hallsHtml}</td>
            </tr>`;
    });
}

function saveBulkLevelHalls() {
    const payload = {};
    allLevels.forEach(level => {
        const checkboxes = document.querySelectorAll(`.hall-cb-${level.id}:checked`);
        payload[level.id] = Array.from(checkboxes).map(cb => cb.value);
    });

    fetch('/exams/api/assignments/levels/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(res => res.json()).then(data => {
        if (data.success) {
            showNotification('تم حفظ قاعات كل المستويات بنجاح!', 'success');
            loadAssignDataB(); // لإعادة تلوين الخلفيات المحددة
        }
    });
}