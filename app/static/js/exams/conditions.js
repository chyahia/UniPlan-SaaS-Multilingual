let allExamDates = [];
let allProfsData = [];
let currentProfessorPartnerships = [];
let customTargetPatterns = [];
let currentExclusiveProfessors = [];
let currentIsolationGroups = {};

document.addEventListener('DOMContentLoaded', () => {
    // سيتم استدعاء loadConditionsData بواسطة main.js عند فتح التبويب
});

function loadConditionsData() {
    Promise.all([
        fetch('/exams/api/get-professors').then(r => r.json()),
        fetch('/exams/api/exam-schedule').then(r => r.json()),
        fetch('/exams/api/settings').then(r => r.json()),
        fetch('/exams/api/get-levels').then(r => r.json()) // ✨ جلب المستويات
    ]).then(([profs, schedule, settings, levels]) => {
        allProfsData = profs;
        allExamDates = Object.keys(schedule).sort();
        
        // ✨ تهيئة ورسم مستويات العزل
        const container = document.getElementById('isolation-levels-container');
        if (container) {
            container.innerHTML = '';
            levels.forEach(l => {
                container.innerHTML += `<label style="background: #eee; padding: 5px 10px; border-radius: 4px; cursor: pointer; white-space: nowrap;"><input type="checkbox" value="${l.name}" class="iso-lvl-chk" style="margin-left: 5px;">${l.name}</label>`;
            });
        }
        currentIsolationGroups = settings.isolation_groups || {};
        renderIsolationGroupsList();

        renderProfConstraintsTable(settings);
        populatePairDropdowns();
        
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
        
        currentProfessorPartnerships = settings.professorPartnerships || [];
        renderPairsList();

        currentExclusiveProfessors = settings.exclusiveProfessors || [];
        renderExclusivePairsList();
        populateExclusiveDropdowns();

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
    const tableBody = document.getElementById('custom-targets-tbody');
    if (!tableBody) return;
    
    tableBody.innerHTML = '';
    let totalCustomProfs = 0;

    // رسم الجدول
    customTargetPatterns.forEach((pattern, index) => {
        const row = document.createElement('tr');
        row.innerHTML = `
            <td style="padding: 10px; border: 1px solid #eee;">${pattern.count}</td>
            <td style="padding: 10px; border: 1px solid #eee;">${pattern.large} كبيرة + ${pattern.other} أخرى</td>
            <td style="padding: 10px; border: 1px solid #eee;">
                <!-- ✨ التعديل هنا: استدعاء دالتك الأصلية removeCustomTarget ✨ -->
                <button type="button" onclick="removeCustomTarget(${index})" style="background: #dc3545; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">&times;</button>
            </td>
        `;
        tableBody.appendChild(row);
        totalCustomProfs += pattern.count;
    });

    // =========================================================
    // ✨ الميزة المسترجعة: مراقبة ومقارنة عدد الأساتذة المخصصين
    // =========================================================
    const totalProfsP = document.getElementById('custom-target-prof-total');
    if (!totalProfsP) return;

    // جلب إجمالي الأساتذة الفعلي من البطاقة الإحصائية في أعلى الصفحة
    const allProfsCountElement = document.getElementById('stat-prof-count');
    const allProfsCount = allProfsCountElement ? parseInt(allProfsCountElement.innerText) : 0;

    totalProfsP.textContent = `الإجمالي: ${totalCustomProfs} أستاذًا في الأنماط المخصصة.`;

    if (totalCustomProfs > allProfsCount) {
        totalProfsP.style.color = '#dc3545'; // أحمر (خطأ)
        totalProfsP.style.borderColor = '#dc3545';
        totalProfsP.style.backgroundColor = '#f8d7da';
        totalProfsP.textContent += ` (تحذير: العدد يتجاوز إجمالي الأساتذة ${allProfsCount}!)`;
    } else if (totalCustomProfs < allProfsCount) {
        totalProfsP.style.color = '#e67e22'; // برتقالي (تنبيه)
        totalProfsP.style.borderColor = '#e67e22';
        totalProfsP.style.backgroundColor = '#fff3cd';
        totalProfsP.textContent += ` (ملاحظة: العدد أقل من إجمالي الأساتذة ${allProfsCount}. سيتم توزيع الباقي تلقائياً.)`;
    } else {
        totalProfsP.style.color = '#28a745'; // أخضر (ممتاز)
        totalProfsP.style.borderColor = '#28a745';
        totalProfsP.style.backgroundColor = '#d4edda';
        totalProfsP.textContent += ` (ممتاز: تم تحديد أنماط لجميع الأساتذة ${allProfsCount} بدقة.)`;
    }
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
        settingsData.isolation_groups = currentIsolationGroups;

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

// ==================== دوال العزل (تشفير الفترات الاحتياطية) ====================
function addIsolationGroup() {
    const nameInput = document.getElementById('isolation-group-name');
    const name = nameInput.value.trim();
    if(!name) return showNotification('الرجاء إدخال اسم للمجموعة', 'error');
    
    const selectedLvls = Array.from(document.querySelectorAll('.iso-lvl-chk:checked')).map(cb => cb.value);
    if(selectedLvls.length === 0) return showNotification('يجب اختيار مستوى واحد على الأقل', 'error');

    currentIsolationGroups[name] = selectedLvls;
    nameInput.value = '';
    document.querySelectorAll('.iso-lvl-chk').forEach(cb => cb.checked = false);
    renderIsolationGroupsList();
}

function renderIsolationGroupsList() {
    const container = document.getElementById('isolation-groups-list');
    if(!container) return;
    container.innerHTML = '';
    
    if (Object.keys(currentIsolationGroups).length === 0) {
        container.innerHTML = '<span style="color: #999; font-size: 13px;">لا توجد مجموعات مسجلة. (جميع المستويات عبارة عن "جوكر" حرة).</span>';
        return;
    }

    for (const [gName, gLevels] of Object.entries(currentIsolationGroups)) {
        container.innerHTML += `
            <div style="border: 1px solid #343a40; border-radius: 5px; overflow: hidden; min-width: 220px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                <div style="background: #343a40; color: white; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center;">
                    <strong style="font-size: 14px;">${gName}</strong>
                    <button onclick="removeIsolationGroup('${gName}')" title="حذف وفك العزل" style="background: none; border: none; color: #ff6b6b; cursor: pointer; font-size: 16px;">✖</button>
                </div>
                <div style="padding: 12px; background: #f8f9fa; font-size: 13px; line-height: 1.8;">
                    ${gLevels.map(l => `<span style="background: #e9ecef; padding: 3px 8px; border-radius: 4px; border: 1px solid #ccc; display: inline-block; margin: 2px;">${l}</span>`).join('')}
                </div>
            </div>
        `;
    }
}

function removeIsolationGroup(name) {
    delete currentIsolationGroups[name];
    renderIsolationGroupsList();
}