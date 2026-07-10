let allExamDates = [];
let allProfsData = [];
let currentProfessorPartnerships = [];
let customTargetPatterns = [];
let currentExclusiveProfessors = [];

document.addEventListener('DOMContentLoaded', () => {
    // سيتم استدعاء loadConditionsData بواسطة main.js عند فتح التبويب
});

function loadConditionsData() {
    // جلب الأساتذة، أيام الامتحانات، والإعدادات المحفوظة من مسارات الامتحانات
    Promise.all([
        fetch('/exams/api/get-professors').then(r => r.json()),
        fetch('/exams/api/exam-schedule').then(r => r.json()),
        fetch('/exams/api/settings').then(r => r.json())
    ]).then(([profs, schedule, settings]) => {
        allProfsData = profs;
        allExamDates = Object.keys(schedule).sort();
        
        renderProfConstraintsTable(settings);
        populatePairDropdowns();
        
        // استرجاع الإعدادات العامة
        if(settings.assignOwnerAsGuard !== undefined) document.getElementById('assign-owner-as-guard-checkbox').checked = settings.assignOwnerAsGuard;
        if(settings.groupSubjects !== undefined) document.getElementById('group-subjects-checkbox').checked = settings.groupSubjects;
        if(settings.maxShifts !== undefined) document.getElementById('max-shifts-limit').value = settings.maxShifts;
        if(settings.maxLargeHallShifts !== undefined) document.getElementById('max-large-hall-shifts').value = settings.maxLargeHallShifts;
        if(settings.guardsLargeHall !== undefined) document.getElementById('guards-large-hall').value = settings.guardsLargeHall;
        if(settings.guardsMediumHall !== undefined) document.getElementById('guards-medium-hall').value = settings.guardsMediumHall;
        if(settings.guardsSmallHall !== undefined) document.getElementById('guards-small-hall').value = settings.guardsSmallHall;
        if(settings.lastDayRestriction !== undefined) document.getElementById('last_day_restriction').value = settings.lastDayRestriction;
        if(settings.largeHallWeight !== undefined) document.getElementById('large-hall-weight').value = settings.largeHallWeight;
        if(settings.otherHallWeight !== undefined) document.getElementById('other-hall-weight').value = settings.otherHallWeight;
        
        // الأزواج
        currentProfessorPartnerships = settings.professorPartnerships || [];
        renderPairsList();

        // التنافر 
        currentExclusiveProfessors = settings.exclusiveProfessors || [];
        renderExclusivePairsList();
        populateExclusiveDropdowns();

        // الأنماط المخصصة
        if(settings.enableCustomTargets !== undefined) {
            document.getElementById('enable-custom-targets-checkbox').checked = settings.enableCustomTargets;
            toggleCustomTargets();
        }
        customTargetPatterns = settings.customTargetPatterns || [];
        renderCustomTargetsTable();
    });
}

function renderProfConstraintsTable(settings) {
    const tbody = document.getElementById('prof-constraints-tbody');
    tbody.innerHTML = '';
    
    const savedPatterns = settings.dutyPatterns || {};
    const savedUnavailables = settings.unavailableDays || {};

    allProfsData.forEach(p => {
        let pattern = savedPatterns[p.name] || 'flexible_2_days';
        let unavailable = savedUnavailables[p.name] || [];

        // إنشاء مربعات اختيار التواريخ
        let datesHtml = allExamDates.length === 0 ? '<span style="color:#999; font-size:12px;">أضف أياماً في المرحلة 4</span>' : '';
        allExamDates.forEach(date => {
            const isChecked = unavailable.includes(date) ? 'checked' : '';
            datesHtml += `
                <label style="display:inline-block; margin-left:10px; font-size:13px; cursor:pointer; background:${isChecked ? '#ffcdd2' : '#fff'}; border:1px solid #ccc; padding:3px 6px; border-radius:3px;">
                    <input type="checkbox" class="unavail-cb-${p.id}" value="${date}" ${isChecked} onchange="this.parentElement.style.background = this.checked ? '#ffcdd2' : '#fff'"> ${date}
                </label>
            `;
        });

        tbody.innerHTML += `
            <tr data-prof-id="${p.id}" data-prof-name="${p.name}">
                <td style="padding:10px; border-bottom:1px solid #eee; font-weight:bold;">${p.name}</td>
                <td style="padding:10px; border-bottom:1px solid #eee;">
                    <select class="pattern-select" style="padding:5px; border-radius:4px; font-size:13px; font-weight:bold;">
                        <option value="one_day_only" ${pattern==='one_day_only'?'selected':''}>يوم واحد فقط</option>
                        <option value="flexible_2_days" ${pattern==='flexible_2_days'?'selected':''}>مرن (يومان)</option>
                        <option value="consecutive_strict" ${pattern==='consecutive_strict'?'selected':''}>يومان متتاليان (إلزامي)</option>
                        <option value="flexible_3_days" ${pattern==='flexible_3_days'?'selected':''}>مرن (2 أو 3 أيام)</option>
                        <option value="unlimited" ${pattern==='unlimited'?'selected':''} style="color: #28a745;">غير محدد (بدون قيود)</option>
                    </select>
                </td>
                <td style="padding:10px; border-bottom:1px solid #eee;">${datesHtml}</td>
            </tr>
        `;
    });
}

// --- اشتراك الأساتذة ---
function populatePairDropdowns() {
    const s1 = document.getElementById('prof-pair-1');
    const s2 = document.getElementById('prof-pair-2');
    s1.innerHTML = '<option value="">-- اختر الأستاذ 1 --</option>';
    s2.innerHTML = '<option value="">-- اختر الأستاذ 2 --</option>';
    
    const partnered = currentProfessorPartnerships.flat();
    allProfsData.filter(p => !partnered.includes(p.name)).forEach(p => {
        s1.innerHTML += `<option value="${p.name}">${p.name}</option>`;
        s2.innerHTML += `<option value="${p.name}">${p.name}</option>`;
    });
}

function addProfPair() {
    const p1 = document.getElementById('prof-pair-1').value;
    const p2 = document.getElementById('prof-pair-2').value;
    if(!p1 || !p2 || p1 === p2) return showNotification('اختر أستاذين مختلفين', 'error');
    currentProfessorPartnerships.push([p1, p2]);
    renderPairsList();
    populatePairDropdowns();
}

function renderPairsList() {
    const list = document.getElementById('prof-pairs-list');
    list.innerHTML = '';
    currentProfessorPartnerships.forEach((pair, idx) => {
        list.innerHTML += `
            <li style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                <span>${pair[0]} + ${pair[1]}</span>
                <button onclick="removePair(${idx})" style="background:#dc3545; color:white; border:none; border-radius:3px; cursor:pointer;">حذف</button>
            </li>`;
    });
}
function removePair(idx) {
    currentProfessorPartnerships.splice(idx, 1);
    renderPairsList();
    populatePairDropdowns();
}

// --- تنافر الأساتذة (عدم العمل في نفس اليوم) ---
function populateExclusiveDropdowns() {
    const s1 = document.getElementById('prof-exclusive-1');
    const s2 = document.getElementById('prof-exclusive-2');
    s1.innerHTML = '<option value="">-- اختر الأستاذ 1 --</option>';
    s2.innerHTML = '<option value="">-- اختر الأستاذ 2 --</option>';
    
    allProfsData.forEach(p => {
        s1.innerHTML += `<option value="${p.name}">${p.name}</option>`;
        s2.innerHTML += `<option value="${p.name}">${p.name}</option>`;
    });
}

function addExclusivePair() {
    const p1 = document.getElementById('prof-exclusive-1').value;
    const p2 = document.getElementById('prof-exclusive-2').value;
    if(!p1 || !p2 || p1 === p2) return showNotification('اختر أستاذين مختلفين', 'error');
    
    // التحقق من عدم إضافة تنافر لأساتذة مشتركين للعمل معاً (منع التضارب المنطقي)
    const isPartnered = currentProfessorPartnerships.some(pair => (pair[0] === p1 && pair[1] === p2) || (pair[0] === p2 && pair[1] === p1));
    if (isPartnered) return showNotification('تضارب منطقي! هذان الأستاذان مشتركان للعمل معاً.', 'error');

    // التحقق من التكرار
    const exists = currentExclusiveProfessors.some(pair => (pair[0] === p1 && pair[1] === p2) || (pair[0] === p2 && pair[1] === p1));
    if (exists) return showNotification('هذا التنافر مضاف مسبقاً', 'error');

    currentExclusiveProfessors.push([p1, p2]);
    renderExclusivePairsList();
    populateExclusiveDropdowns();
}

function renderExclusivePairsList() {
    const list = document.getElementById('prof-exclusive-list');
    list.innerHTML = '';
    currentExclusiveProfessors.forEach((pair, idx) => {
        list.innerHTML += `
            <li style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between; background: #fff5f5;">
                <span style="color: #dc3545; font-weight: bold;">${pair[0]} - ${pair[1]}</span>
                <button onclick="removeExclusivePair(${idx})" style="background:#6c757d; color:white; border:none; border-radius:3px; cursor:pointer; padding: 4px 10px;">حذف</button>
            </li>`;
    });
}

function removeExclusivePair(idx) {
    currentExclusiveProfessors.splice(idx, 1);
    renderExclusivePairsList();
    populateExclusiveDropdowns();
}

// --- الأنماط المخصصة ---
function toggleCustomTargets() {
    document.getElementById('custom-targets-controls').style.display = document.getElementById('enable-custom-targets-checkbox').checked ? 'block' : 'none';
}

function addCustomTarget() {
    const l = parseInt(document.getElementById('custom-target-large').value) || 0;
    const o = parseInt(document.getElementById('custom-target-other').value) || 0;
    const c = parseInt(document.getElementById('custom-target-prof-count').value);
    if(isNaN(c) || c <= 0) return showNotification('أدخل عدد أساتذة صحيح', 'error');
    
    customTargetPatterns.push({ large: l, other: o, count: c });
    renderCustomTargetsTable();
}

function renderCustomTargetsTable() {
    const tbody = document.getElementById('custom-targets-tbody');
    tbody.innerHTML = '';
    customTargetPatterns.forEach((pat, idx) => {
        tbody.innerHTML += `
            <tr>
                <td style="padding:8px; border:1px solid #eee;">${pat.large} كبيرة + ${pat.other} أخرى</td>
                <td style="padding:8px; border:1px solid #eee;">${pat.count}</td>
                <td style="padding:8px; border:1px solid #eee;"><button onclick="removeCustomTarget(${idx})" style="color:red; background:none; border:none; font-size:18px; cursor:pointer;">×</button></td>
            </tr>`;
    });
}
function removeCustomTarget(idx) {
    customTargetPatterns.splice(idx, 1);
    renderCustomTargetsTable();
}

// ==========================================
// --- الحاسبة والتخطيط (النسخة الأصلية المتطابقة) ---
// ==========================================

function autofillCalculator() {
    // 1. جلب عدد الأساتذة الإجمالي
    document.getElementById('calc-profs').value = allProfsData.length;

    // 2. جلب المواد، الفترات، والقاعات لحساب التقاطع الدقيق
    Promise.all([
        fetch('/exams/api/get-subjects').then(r => r.json()),
        fetch('/exams/api/exam-schedule').then(r => r.json()),
        fetch('/exams/api/assignments/levels').then(r => r.json())
    ]).then(([subjects, schedule, levelAssignments]) => {
        const guardsPerLarge = parseInt(document.getElementById('guards-large-hall').value) || 0;
        const guardsPerMedium = parseInt(document.getElementById('guards-medium-hall').value) || 0;
        const guardsPerSmall = parseInt(document.getElementById('guards-small-hall').value) || 0;

        // أ) خريطة القاعات المخصصة لكل مستوى فردي (بالتنسيق الجديد للباك إند)
        const levelHallsMap = {};
        const levelDataArray = levelAssignments.levels || [];
        levelDataArray.forEach(assignment => {
            levelHallsMap[assignment.name] = assignment.assigned_halls;
        });

        let totalLargeDuties = 0;
        let totalOtherDuties = 0;

        // ب) الحساب الدقيق بناءً على المواد ومستوياتها المشتركة
        subjects.forEach(subj => {
            // تخطي المواد غير المسندة لأي مستوى
            if (subj.level_name === 'بدون مستوى' || subj.level_name === 'غير محدد') return;

            // تفكيك الاسم المدمج (مثال: "الأولى + الثانية" يصبح ["الأولى", "الثانية"])
            const individualLevels = subj.level_name.split(' + ').map(l => l.trim());
            
            // جمع قاعات جميع المستويات المشتركة في هذه المادة (استخدام Map يمنع تكرار نفس القاعة)
            const uniqueHalls = new Map();
            individualLevels.forEach(lvl => {
                const assignedHalls = levelHallsMap[lvl] || [];
                assignedHalls.forEach(hall => {
                    uniqueHalls.set(hall.id, hall.type);
                });
            });

            // ج) إضافة عدد الحراس المطلوبين لهذه المادة بالتحديد
            let largeGuardsForThisSubject = 0;
            let otherGuardsForThisSubject = 0;

            uniqueHalls.forEach((type, hallId) => {
                if (type === 'كبيرة') {
                    largeGuardsForThisSubject += guardsPerLarge;
                } else if (type === 'متوسطة') {
                    otherGuardsForThisSubject += guardsPerMedium;
                } else if (type === 'صغيرة') {
                    otherGuardsForThisSubject += guardsPerSmall;
                }
            });

            totalLargeDuties += largeGuardsForThisSubject;
            totalOtherDuties += otherGuardsForThisSubject;
        });

        // د) عرض النتائج النهائية في الواجهة
        document.getElementById('calc-large').value = totalLargeDuties;
        document.getElementById('calc-other').value = totalOtherDuties;
        showNotification("تم الحساب بدقة بناءً على المواد وقاعات مستوياتها المشتركة.", 'success');
        
    }).catch(err => {
        console.error(err);
        showNotification("حدث خطأ أثناء الجلب التلقائي للبيانات.", 'error');
    });
}

function runCalculator() {
    const profs = parseInt(document.getElementById('calc-profs').value);
    const largeSlots = parseInt(document.getElementById('calc-large').value);
    const otherSlots = parseInt(document.getElementById('calc-other').value);
    const factor = parseFloat(document.getElementById('calc-factor').value);

    if (isNaN(profs) || isNaN(largeSlots) || isNaN(otherSlots) || isNaN(factor)) {
        return showNotification("الرجاء ملء جميع الحقول بأرقام صحيحة.", 'error');
    }
    if (profs <= 0) {
        return showNotification("عدد الأساتذة يجب أن يكون أكبر من صفر.", 'error');
    }

    const results = suggestFairDistribution(profs, largeSlots, otherSlots, factor);
    displayCalculationResults(results);
}

function suggestFairDistribution(totalProfs, largeHallSlots, otherHallSlots, workloadFactor) {
    if (totalProfs <= 0) return [];

    let professors = Array.from({ length: totalProfs }, (_, i) => ({
        id: i,
        large_halls: 0,
        other_halls: 0,
        workload: 0
    }));

    const findProfWithMinLoad = (profsArray) => {
        if (profsArray.length === 0) return null;
        let minProf = profsArray[0];
        for (let i = 1; i < profsArray.length; i++) {
            if (profsArray[i].workload < minProf.workload) {
                minProf = profsArray[i];
            }
        }
        return minProf;
    };

    for (let i = 0; i < largeHallSlots; i++) {
        const profToUpdate = findProfWithMinLoad(professors);
        profToUpdate.large_halls += 1;
        profToUpdate.workload += workloadFactor;
    }

    for (let i = 0; i < otherHallSlots; i++) {
        const profToUpdate = findProfWithMinLoad(professors);
        profToUpdate.other_halls += 1;
        profToUpdate.workload += 1;
    }

    const distributionSummary = new Map();
    for (const p of professors) {
        const key = `${p.large_halls}-${p.other_halls}`;
        distributionSummary.set(key, (distributionSummary.get(key) || 0) + 1);
    }
    
    const results = [];
    for (const [plan, count] of distributionSummary.entries()) {
        const [largeDuties, otherDuties] = plan.split('-').map(Number);
        const workload = (largeDuties * workloadFactor) + (otherDuties * 1);
        results.push({
            "count": count,
            "large_duties": largeDuties,
            "other_duties": otherDuties,
            "workload": workload
        });
    }

    return results.sort((a, b) => b.workload - a.workload);
}

function displayCalculationResults(results) {
    const container = document.getElementById('calculator-results');
    if (results.length === 0) {
        container.innerHTML = "<p>لا توجد نتائج لعرضها.</p>";
        return;
    }

    let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; text-align: center; background: #fff;">
            <thead style="background-color: #e9ecef;">
                <tr>
                    <th style="border: 1px solid #ccc; padding: 10px;">عدد الأساتذة</th>
                    <th style="border: 1px solid #ccc; padding: 10px;">حراسات (كبيرة)</th>
                    <th style="border: 1px solid #ccc; padding: 10px;">حراسات (أخرى)</th>
                    <th style="border: 1px solid #ccc; padding: 10px;">نقاط العبء للفرد</th>
                </tr>
            </thead>
            <tbody>
    `;

    results.forEach(row => {
        tableHTML += `
            <tr>
                <td style="border: 1px solid #ccc; padding: 10px;">${row.count}</td>
                <td style="border: 1px solid #ccc; padding: 10px;">${row.large_duties}</td>
                <td style="border: 1px solid #ccc; padding: 10px;">${row.other_duties}</td>
                <td style="border: 1px solid #ccc; padding: 10px;">${row.workload.toFixed(2)}</td>
            </tr>
        `;
    });

    tableHTML += `</tbody></table>`;
    container.innerHTML = tableHTML;
}

// ==========================================
// 💾 حفظ جميع البيانات (محدث لتجنب مسح بيانات المراحل الأخرى)
// ==========================================
async function saveAllConditions(showMsg = true) {
    const dutyPatterns = {};
    const unavailableDays = {};

    // تجميع قيود الجدول
    document.querySelectorAll('#prof-constraints-tbody tr').forEach(tr => {
        const profId = tr.dataset.profId;
        const profName = tr.dataset.profName;
        
        dutyPatterns[profName] = tr.querySelector('.pattern-select').value;
        
        const unavailables = Array.from(tr.querySelectorAll(`.unavail-cb-${profId}:checked`)).map(cb => cb.value);
        if(unavailables.length > 0) unavailableDays[profName] = unavailables;
    });

    try {
        // 1. جلب الإعدادات المحفوظة مسبقاً من مسارات الامتحانات
        const res = await fetch('/exams/api/settings');
        let settingsData = {};
        if (res.ok) {
            settingsData = await res.json();
        }

        // 2. تحديث إعدادات المرحلة 5 فقط دون المساس بالباقي
        settingsData.assignOwnerAsGuard = document.getElementById('assign-owner-as-guard-checkbox').checked;
        settingsData.groupSubjects = document.getElementById('group-subjects-checkbox').checked;
        settingsData.maxShifts = document.getElementById('max-shifts-limit').value;
        settingsData.maxLargeHallShifts = document.getElementById('max-large-hall-shifts').value;
        settingsData.guardsLargeHall = document.getElementById('guards-large-hall').value;
        settingsData.guardsMediumHall = document.getElementById('guards-medium-hall').value;
        settingsData.guardsSmallHall = document.getElementById('guards-small-hall').value;
        settingsData.lastDayRestriction = document.getElementById('last_day_restriction').value;
        settingsData.largeHallWeight = document.getElementById('large-hall-weight').value;
        settingsData.otherHallWeight = document.getElementById('other-hall-weight').value;
        settingsData.dutyPatterns = dutyPatterns;
        settingsData.unavailableDays = unavailableDays;
        settingsData.professorPartnerships = currentProfessorPartnerships;
        settingsData.exclusiveProfessors = currentExclusiveProfessors;
        settingsData.enableCustomTargets = document.getElementById('enable-custom-targets-checkbox').checked;
        settingsData.customTargetPatterns = customTargetPatterns;

        // 3. حفظ البيانات المدمجة
        const saveRes = await fetch('/exams/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settingsData)
        });
        const data = await saveRes.json();
        if(data.success && showMsg) {
            showNotification(data.message || 'تم حفظ القيود والشروط بنجاح.', 'success');
        }
    } catch (e) {
        console.error('خطأ في حفظ القيود:', e);
        if(showMsg) showNotification('حدث خطأ أثناء حفظ القيود.', 'error');
    }
}