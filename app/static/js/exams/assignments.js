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

    // 🛑 التعديل: إرسال البيانات مجمعة عبر المسار الصحيح
    fetch('/exams/api/assignments/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prof_id: selectedProfId,
            subj_ids: Array.from(selectedSubjIds)
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('تم التخصيص بنجاح!', 'success');
            selectedSubjIds.clear(); 
            loadAssignDataA(); 
        } else {
            showNotification(data.message || 'حدث خطأ', 'error');
        }
    });
}

function unassignSelected() {
    if (!selectedProfId) return showNotification('الرجاء تظليل أستاذ أولاً لإلغاء إسناده', 'error');
    if (selectedSubjIds.size === 0) return showNotification('الرجاء تظليل المواد المراد إلغاء إسنادها', 'error');

    fetch('/exams/api/assignments/unassign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prof_id: selectedProfId,
            subj_ids: Array.from(selectedSubjIds)
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('تم إلغاء التخصيص بنجاح!', 'success');
            selectedSubjIds.clear();
            loadAssignDataA();
        }
    });
}

function unassignAllFromProf(profId, profName) {
    if (!confirm(`هل أنت متأكد من إلغاء إسناد جميع المواد للأستاذ "${profName}"؟`)) return;
    
    const assignment = profAssignments.find(a => a.prof_id === profId);
    if (!assignment || assignment.subjects.length === 0) return;

    const allSubjIds = assignment.subjects.map(s => s.subj_id);

    fetch('/exams/api/assignments/unassign', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            prof_id: profId,
            subj_ids: allSubjIds
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification('تم إلغاء إسناد جميع المواد بنجاح!', 'success');
            loadAssignDataA(); 
        }
    });
}

function unassignSubject(subjId, subjName) {
    if (!confirm(`هل أنت متأكد من إلغاء إسناد المادة "${subjName}"؟`)) return;
    
    let teachingProfsIds = [];
    profAssignments.forEach(pa => {
        if(pa.subjects.some(sub => sub.subj_id === subjId)) teachingProfsIds.push(pa.prof_id);
    });

    let promises = teachingProfsIds.map(profId => 
        fetch('/exams/api/assignments/unassign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                prof_id: profId,
                subj_ids: [subjId]
            })
        }).then(r => r.json())
    );
    
    Promise.all(promises).then(() => {
        showNotification('تم إلغاء إسناد المادة بنجاح!', 'success');
        selectedSubjIds.delete(subjId); 
        loadAssignDataA(); 
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

    // 🛑 التعديل 1: الدخول إلى المصفوفة الصحيحة داخل الكائن القادم من الخادم
    const levelDataArray = levelAssignments.levels || [];

    allLevels.forEach(level => {
        // 🛑 التعديل 2: تصحيح أسماء المفاتيح (id و assigned_halls) لتطابق الباك إند
        const assignment = levelDataArray.find(a => a.id === level.id);
        const assignedHallIds = assignment ? assignment.assigned_halls.map(h => h.id) : [];

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