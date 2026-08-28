let globalNatures = []; // لتخزين الرموز ديناميكياً

// دالة مساعدة للحصول على الرمز ديناميكياً بدلاً من النص الثابت
function getNatureSymbol(natureName, fallbackSymbol) {
    const nat = globalNatures.find(n => n.name === natureName);
    return nat ? nat.symbol : fallbackSymbol;
}

// تشغيل دالة المعاينة بمجرد تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    loadPreviews();
});

// دالة مساعدة لتحويل النص
function getLinesFromTextarea(textareaId) {
    return document.getElementById(textareaId).value.split('\n').map(l => l.trim()).filter(l => l.length > 0);
}

// دالة تحديث كافة صناديق المعاينة والقوائم المنسدلة
function loadPreviews() {
    // 1. جلب الأساتذة
    fetch('/teachers').then(res => res.json()).then(data => {
        if(document.getElementById('stat-prof-count')) document.getElementById('stat-prof-count').innerText = data.length;
        const box = document.getElementById('teachers-preview');
        if(data.length === 0) { box.innerHTML = _t('<i>لا يوجد أساتذة...</i>'); } 
        else { box.innerHTML = data.map(t => `<span class="data-tag">${t.name}</span>`).join(''); }
    });

    // 2. جلب القاعات
    fetch('/rooms').then(res => res.json()).then(data => {
        if(document.getElementById('stat-room-count')) document.getElementById('stat-room-count').innerText = data.length;
        const box = document.getElementById('rooms-preview');
        if(data.length === 0) { box.innerHTML = _t('<i>لا توجد قاعات...</i>'); } 
        else { box.innerHTML = data.map(r => `<span class="data-tag">${r.name} (${r.type})</span>`).join(''); }
    });

    // 3. جلب المستويات وتحديث (صندوق المعاينة الرئيسي + مربعات التأشير للمواد)
    fetch('/api/levels').then(res => res.json()).then(data => {
        if(document.getElementById('stat-level-count')) document.getElementById('stat-level-count').innerText = data.length;
        // [أ] تحديث صندوق المعاينة الرئيسي للمستويات
        const levelsPreviewBox = document.getElementById('levels-preview');
        if (levelsPreviewBox) {
            if (data.length === 0) {
                levelsPreviewBox.innerHTML = _t('<i>لا توجد مستويات...</i>');
            } else {
                levelsPreviewBox.innerHTML = data.map(lvl => `<span class="data-tag">${lvl}</span>`).join('');
            }
        }

        // [ب] تحديث مربعات التأشير (Checkboxes) في قسم المواد
        const container = document.getElementById('course-levels-checkboxes-container');
        if (container) {
            if (data.length === 0) {
                container.innerHTML = _t('<i style="color: #888; font-size: 13px; display:block; padding:5px;">⚠️ لا توجد مستويات مضافة بعد...</i>');
            } else {
                container.innerHTML = data.map(lvl => `
                    <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; font-size: 14px; font-weight: 500; cursor: pointer; user-select: none;">
                        <input type="checkbox" class="course-level-chk" value="${lvl}" style="transform: scale(1.15); cursor: pointer;">
                        <span>${lvl}</span>
                    </label>
                `).join('');
            }
        }
    });

    // 4. جلب المواد
    fetch('/api/courses').then(res => res.json()).then(data => {
        if(document.getElementById('stat-course-count')) document.getElementById('stat-course-count').innerText = data.length;
        const box = document.getElementById('courses-preview');
        if(data.length === 0) { box.innerHTML = _t('<i>لا توجد مواد...</i>'); } 
        else { 
            box.innerHTML = data.map(c => `
                <div class="course-tag">
                    <strong>${c.name}</strong> <br>
                    <small>${_t("المستويات: ")}${c.levels || _t('غير محدد')}${_t(" | القاعة: ")}${c.room_type}</small>
                </div>
            `).join(''); 
        }
    });

    // 5. جلب الرموز البيداغوجية وتعبئة الخانات المخفية في النافذة المنبثقة
    fetch('/api/course_natures').then(res => res.json()).then(data => {
        globalNatures = data;
        
        // ملاحظة: المقارنة باللغة العربية يجب أن تبقى هكذا إذا كانت محفوظة في قاعدة البيانات هكذا
        const lecObj = data.find(n => n.name === 'محاضرة');
        const tdObj = data.find(n => n.name === 'أعمال موجهة');
        const tpObj = data.find(n => n.name === 'أعمال تطبيقية');
        
        if(lecObj && document.getElementById('symbol-lec')) document.getElementById('symbol-lec').value = lecObj.symbol;
        if(tdObj && document.getElementById('symbol-td')) document.getElementById('symbol-td').value = tdObj.symbol;
        if(tpObj && document.getElementById('symbol-tp')) document.getElementById('symbol-tp').value = tpObj.symbol;
        
        // تحديث قائمة التعديل الجماعي في المرحلة 2
        const bulkNatureSelect = document.getElementById('bulk-nature');
        if (bulkNatureSelect) {
            bulkNatureSelect.innerHTML = `<option value="">${_t('-- بدون تغيير --')}</option>` + 
                                         data.map(n => `<option value="${n.name}">${_t(n.name)} ${n.symbol}</option>`).join('');
        }
    });
}

// إضافة الأساتذة
function addTeachers() {
    const lines = getLinesFromTextarea('teachers-input');
    if (lines.length === 0) return alert(_t('يرجى إدخال اسم أستاذ واحد على الأقل.'));
    fetch('/api/teachers', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ names: lines }) })
    .then(res => res.json()).then(data => {
        document.getElementById('teachers-input').value = ''; 
        loadPreviews(); 
    });
}

// إضافة القاعات
function addRooms() {
    const lines = getLinesFromTextarea('rooms-input');
    const type = document.getElementById('room-type-select').value;
    if (lines.length === 0) return alert(_t('يرجى إدخال اسم قاعة واحدة على الأقل.'));
    fetch('/api/rooms', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ names: lines, type: type }) })
    .then(res => res.json()).then(data => {
        document.getElementById('rooms-input').value = ''; 
        loadPreviews(); 
    });
}

// إضافة المستويات
function addLevels() {
    const lines = getLinesFromTextarea('levels-input');
    if (lines.length === 0) return alert(_t('يرجى إدخال مستوى واحد على الأقل.'));
    fetch('/api/levels', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ levels: lines }) })
    .then(res => res.json()).then(data => {
        document.getElementById('levels-input').value = ''; 
        loadPreviews(); 
    });
}

// إضافة المواد (الطريقة المباشرة المحدثة بالشعبة والتخصص والطبيعة)
function addCourses() {
    const lines = getLinesFromTextarea('courses-input');
    const roomType = document.getElementById('course-room-type-select').value;
    const courseNature = document.getElementById('course-nature-select').value; 
    
    const division = document.getElementById('course-division').value.trim();
    const specialization = document.getElementById('course-specialization').value.trim();

    const checkedBoxes = document.querySelectorAll('.course-level-chk:checked');
    const selectedLevels = Array.from(checkedBoxes).map(cb => cb.value);

    if (lines.length === 0) return alert(_t('يرجى إدخال مادة واحدة على الأقل.'));
    if (selectedLevels.length === 0) return alert(_t('يرجى تحديد مستوى واحد على الأقل عبر التأشير عليه.'));

    const coursesData = lines.map(name => {
        let finalName = name;
        
        // جلب الرمز ولكن يتم تغليف القيمة الافتراضية للترجمة
        const lecSymbol = getNatureSymbol('محاضرة', _t('[مح]'));
        const tdSymbol = getNatureSymbol('أعمال موجهة', _t('[أم]'));
        const tpSymbol = getNatureSymbol('أعمال تطبيقية', _t('[أت]'));

        if (courseNature === 'محاضرة' && !finalName.includes(lecSymbol)) finalName += ` ${lecSymbol}`;
        if (courseNature === 'أعمال موجهة' && !finalName.includes(tdSymbol)) finalName += ` ${tdSymbol}`;
        if (courseNature === 'أعمال تطبيقية' && !finalName.includes(tpSymbol)) finalName += ` ${tpSymbol}`;

        return {
            name: finalName,
            room_type: roomType,
            levels: selectedLevels,
            division: division,
            specialization: specialization,
            course_nature: courseNature 
        };
    });

    fetch('/api/students/bulk', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify(coursesData) 
    })
    .then(res => res.json()).then(data => {
        if(data.success) {
            document.getElementById('courses-input').value = '';
            loadPreviews(); 
            alert(_t("✅ تمت الإضافة المباشرة بنجاح!"));
        } else alert(_t('خطأ: ') + data.error);
    });
}

// ==================== المعالجة المرحلية للمواد (Wizard) ====================

let currentWizardLines = [];
let wizardDivisionCount = 0;

// 1. فتح نافذة الضبط
function openCourseWizard() {
    currentWizardLines = getLinesFromTextarea('courses-input');
    const checkedBoxes = document.querySelectorAll('.course-level-chk:checked');
    const selectedLevels = Array.from(checkedBoxes).map(cb => cb.value);

    if (currentWizardLines.length === 0) return alert(_t('يرجى كتابة اسم مادة واحدة على الأقل في صندوق النص.'));
    if (selectedLevels.length === 0) return alert(_t('يرجى تحديد مستوى واحد على الأقل عبر التأشير عليه.'));

    // حفظ المستويات مؤقتاً
    document.getElementById('course-wizard-modal').dataset.levels = JSON.stringify(selectedLevels);
    
    // تصفير خيارات النافذة وإعادة رسمها
    document.getElementById('wiz-is-shared').checked = false;
    document.getElementById('wiz-divisions-wrapper').innerHTML = ''; 
    document.getElementById('wiz-shared-lec-div').value = ''; 
    document.getElementById('wiz-shared-lec-spec').value = ''; 
    wizardDivisionCount = 0;
    
    toggleSharedMode(); 
    document.getElementById('course-wizard-modal').style.display = 'flex';
}

// 2. إظهار/إخفاء قسم التخصصات المشتركة
function toggleSharedMode() {
    const isShared = document.getElementById('wiz-is-shared').checked;
    document.getElementById('wiz-shared-container').style.display = isShared ? 'block' : 'none';
    
    if (isShared && wizardDivisionCount === 0) {
        addWizardDivision(); 
    }
    renderWizardTable();
}

function addWizardDivision() {
    wizardDivisionCount++;
    const wrapper = document.getElementById('wiz-divisions-wrapper');
    const divId = `wiz-div-block-${wizardDivisionCount}`;
    const html = `
        <div id="${divId}" style="background: #fff; padding: 10px; border: 1px solid #bdc3c7; border-radius: 4px; margin-bottom: 10px; position: relative;">
            <button type="button" onclick="document.getElementById('${divId}').remove(); renderWizardTable();" style="position: absolute; top: 10px; right: 10px; left: auto; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer; padding: 3px 6px;" title="${_t('حذف هذه الشعبة')}">❌</button>
            <div style="display: flex; gap: 10px; margin-bottom: 5px;">
                <input type="text" class="wiz-div-name" placeholder="${_t('اسم الشعبة (مثال: دراسات نقدية)')}" style="flex: 1; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-weight: bold; color: #2c3e50;" onkeyup="renderWizardTable()">
            </div>
            <div>
                <input type="text" class="wiz-div-specs" placeholder="${_t('التخصصات التابعة لها (مفصولة بفاصلة. مثال: نقد قديم، نقد حديث)')}" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box;" onkeyup="renderWizardTable()">
            </div>
        </div>
    `;
    wrapper.insertAdjacentHTML('beforeend', html);
    renderWizardTable();
}

function getWizardSpecs() {
    const blocks = document.querySelectorAll('#wiz-divisions-wrapper > div');
    let allSpecs = [];
    blocks.forEach(block => {
        const divName = block.querySelector('.wiz-div-name').value.trim();
        const specsStr = block.querySelector('.wiz-div-specs').value;
        const specs = specsStr.split(/[,،]/).map(s => s.trim()).filter(s => s.length > 0);
        specs.forEach(s => {
            allSpecs.push({ division: divName, spec: s });
        });
    });
    return allSpecs;
}

// 3. رسم الجدول ديناميكياً
function renderWizardTable() {
    const thead = document.querySelector('#course-wizard-table thead');
    const tbody = document.querySelector('#course-wizard-table tbody');
    const isShared = document.getElementById('wiz-is-shared').checked;
    
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const lecSymbol = getNatureSymbol('محاضرة', _t('[مح]'));
    const tdSymbol = getNatureSymbol('أعمال موجهة', _t('[أم]'));
    const tpSymbol = getNatureSymbol('أعمال تطبيقية', _t('[أت]'));

    if (!isShared) {
        // --- الوضع العادي ---
        thead.innerHTML = `
            <tr style="background: #f1f5f9; border-bottom: 1px solid #ccc;">
                <th style="padding: 10px; text-align: start;">${_t("اسم المادة")}</th>
                <th style="padding: 10px; text-align: center;">${_t("محاضرة")} ${lecSymbol}</th>
                <th style="padding: 10px; text-align: center;">${_t("أعمال موجهة")} ${tdSymbol}</th>
                <th style="padding: 10px; text-align: center; border-inline-end: 1px solid #ddd;">${_t("أعمال تطبيقية")} ${tpSymbol}</th>
            </tr>
        `;
        
        currentWizardLines.forEach((name, index) => {
            tbody.innerHTML += `
                <tr style="border-bottom: 1px solid #eee;">
                    <td style="padding: 10px; font-weight: bold; text-align: start;">${name}</td>
                    <td style="padding: 10px; text-align: center;">
                        <input type="checkbox" id="wiz-lec-${index}" checked onchange="document.getElementById('wiz-lec-room-${index}').style.visibility = this.checked ? 'visible' : 'hidden'" style="transform: scale(1.3); margin-bottom: 8px;"><br>
                        <select id="wiz-lec-room-${index}" style="font-size: 12px; padding: 4px; border-radius: 4px; border: 1px solid #bdc3c7; background: #fff; cursor: pointer; color: #2c3e50; font-family: inherit;">
                            <option value="مدرج">${_t("مدرج")}</option>
                            <option value="عادية">${_t("قاعة عادية")}</option>
                        </select>
                    </td>
                    <td style="padding: 10px; text-align: center;">
                        <input type="checkbox" id="wiz-td-${index}" onchange="toggleGroupsInput('td', ${index})" style="transform: scale(1.3);">
                        <input type="number" id="wiz-td-grp-${index}" min="1" max="20" style="width: 55px; display: none; margin-inline-end: 5px; padding: 5px; font-family: inherit;" placeholder="${_t('أفواج')}">
                    </td>
                    <td style="padding: 10px; text-align: center; border-inline-end: 1px solid #eee;">
                        <input type="checkbox" id="wiz-tp-${index}" onchange="toggleGroupsInput('tp', ${index})" style="transform: scale(1.3);">
                        <input type="number" id="wiz-tp-grp-${index}" min="1" max="20" style="width: 55px; display: none; margin-inline-end: 5px; padding: 5px; font-family: inherit;" placeholder="${_t('أفواج')}">
                    </td>
                </tr>
            `;
        });
    } else {
        // --- وضع التخصصات المتعددة (هرمي) ---
        const specsObj = getWizardSpecs();
        
        let theadHtml = `<tr style="background: #f1f5f9; border-bottom: 1px solid #ccc;">
            <th style="padding: 10px; text-align: start;">${_t("اسم المادة")}</th>
            <th style="padding: 10px; text-align: center; color: #2980b9;">${_t("محاضرة مشتركة ")}${lecSymbol}</th>`;
        
        specsObj.forEach(obj => {
            theadHtml += `<th style="padding: 10px; text-align: center; font-size: 13px; border-inline-end: 1px solid #ddd;">${_t("أفواج (")}${obj.spec})<br><small style="color: #7f8c8d; font-weight: normal;">${obj.division || _t('بدون شعبة')}</small></th>`;
        });
        theadHtml += `</tr>`;
        thead.innerHTML = theadHtml;

        currentWizardLines.forEach((baseName, index) => {
            let rowHtml = `<tr style="border-bottom: 1px solid #eee;">
                <td style="padding: 10px; font-weight: bold; text-align: start;">${baseName}</td>
                <td style="padding: 10px; text-align: center;">
                    <input type="checkbox" id="wiz-shared-lec-${index}" checked onchange="document.getElementById('wiz-shared-lec-room-${index}').style.visibility = this.checked ? 'visible' : 'hidden'" style="transform: scale(1.3); margin-bottom: 8px;"><br>
                    <select id="wiz-shared-lec-room-${index}" style="font-size: 12px; padding: 4px; border-radius: 4px; border: 1px solid #bdc3c7; background: #fff; cursor: pointer; color: #2c3e50; font-family: inherit;">
                        <option value="مدرج">${_t("مدرج")}</option>
                        <option value="عادية">${_t("قاعة عادية")}</option>
                    </select>
                </td>`;
            
            if (specsObj.length === 0) {
                rowHtml += `<td style="padding: 10px; text-align: center; color: #e74c3c; font-size: 12px;">${_t("أضف شعبة وتخصص بالأعلى...")}</td>`;
            } else {
                specsObj.forEach((obj, specIndex) => {
                    rowHtml += `<td style="padding: 10px; text-align: center; border-inline-end: 1px solid #eee; vertical-align: top;">
                        <div style="margin-bottom: 8px; display: flex; align-items: center; justify-content: center; gap: 5px;">
                            <span style="font-size: 12px; color: #555; width: 25px; font-weight: bold;">${_t("أم:")}</span>
                            <input type="number" id="wiz-spec-grp-${index}-${specIndex}" min="0" max="20" style="width: 50px; padding: 4px; font-family: inherit; font-size: 13px;" placeholder="${_t('العدد')}">
                        </div>
                        <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
                            <span style="font-size: 12px; color: #555; width: 25px; font-weight: bold;">${_t("أت:")}</span>
                            <input type="number" id="wiz-spec-tp-grp-${index}-${specIndex}" min="0" max="20" style="width: 50px; padding: 4px; font-family: inherit; font-size: 13px;" placeholder="${_t('العدد')}">
                        </div>
                    </td>`;
                });
            }
            rowHtml += `</tr>`;
            tbody.innerHTML += rowHtml;
        });
    }
}

// 4. إظهار/إخفاء حقل الأفواج
function toggleGroupsInput(type, index) {
    const chk = document.getElementById(`wiz-${type}-${index}`);
    const inp = document.getElementById(`wiz-${type}-grp-${index}`);
    if(inp && chk) {
        inp.style.display = chk.checked ? 'inline-block' : 'none';
        if(chk.checked && !inp.value) inp.value = 1;
    }
}

function closeCourseWizard() {
    document.getElementById('course-wizard-modal').style.display = 'none';
}

// 5. تأكيد التوليد وإرسال البيانات
function confirmCourseWizard() {
    const selectedLevels = JSON.parse(document.getElementById('course-wizard-modal').dataset.levels);
    const isShared = document.getElementById('wiz-is-shared').checked;
    
    // قراءة الشعبة والتخصص العامة
    const globalDivision = document.getElementById('course-division').value.trim();
    const globalSpec = document.getElementById('course-specialization').value.trim();
    
    let finalCoursesData = [];

    const lecSymbol = getNatureSymbol('محاضرة', _t('[مح]'));
    const tdSymbol = getNatureSymbol('أعمال موجهة', _t('[أم]'));
    const tpSymbol = getNatureSymbol('أعمال تطبيقية', _t('[أت]'));

    if (!isShared) {
        // --- معالجة الوضع العادي ---
        currentWizardLines.forEach((baseName, index) => {
            const hasLec = document.getElementById(`wiz-lec-${index}`)?.checked;
            const lecRoomType = document.getElementById(`wiz-lec-room-${index}`)?.value || 'مدرج';
            
            const hasTd = document.getElementById(`wiz-td-${index}`)?.checked;
            const tdGrpCount = parseInt(document.getElementById(`wiz-td-grp-${index}`)?.value) || 0;
            
            const hasTp = document.getElementById(`wiz-tp-${index}`)?.checked;
            const tpGrpCount = parseInt(document.getElementById(`wiz-tp-grp-${index}`)?.value) || 0;

            if (hasLec) {
                finalCoursesData.push({ name: `${baseName} ${lecSymbol}`, room_type: lecRoomType, levels: selectedLevels, division: globalDivision, specialization: globalSpec, course_nature: 'محاضرة' });
            }
            if (hasTd && tdGrpCount > 0) {
                if (tdGrpCount === 1) {
                    finalCoursesData.push({ name: `${baseName} ${tdSymbol}`, room_type: 'عادية', levels: selectedLevels, division: globalDivision, specialization: globalSpec, course_nature: 'أعمال موجهة' });
                } else {
                    for (let i = 1; i <= tdGrpCount; i++) {
                        // إضافة الـ _t للمسافة مع حرف الفاء لتسهيل الترجمة لاحقاً (e.g. " G")
                        finalCoursesData.push({ name: `${baseName} ${tdSymbol}${_t(" ف")}${i}`, room_type: 'عادية', levels: selectedLevels, division: globalDivision, specialization: globalSpec, course_nature: 'أعمال موجهة' });
                    }
                }
            }
            if (hasTp && tpGrpCount > 0) {
                if (tpGrpCount === 1) {
                    finalCoursesData.push({ name: `${baseName} ${tpSymbol}`, room_type: 'مخبر', levels: selectedLevels, division: globalDivision, specialization: globalSpec, course_nature: 'أعمال تطبيقية' });
                } else {
                    for (let i = 1; i <= tpGrpCount; i++) {
                        finalCoursesData.push({ name: `${baseName} ${tpSymbol}${_t(" ف")}${i}`, room_type: 'مخبر', levels: selectedLevels, division: globalDivision, specialization: globalSpec, course_nature: 'أعمال تطبيقية' });
                    }
                }
            }
        });
    } else {
        // --- معالجة وضع التخصصات المتعددة ---
        const specsObj = getWizardSpecs();
        if (specsObj.length === 0) return alert(_t("أضف شعبة وتخصص بالأعلى..."));

        const sharedLecDiv = document.getElementById('wiz-shared-lec-div').value.trim() || _t('كل الشُّعب');
        const sharedLecSpec = document.getElementById('wiz-shared-lec-spec').value.trim() || _t('كل التخصصات');

        currentWizardLines.forEach((baseName, index) => {
            const hasSharedLec = document.getElementById(`wiz-shared-lec-${index}`)?.checked;
            const sharedLecRoomType = document.getElementById(`wiz-shared-lec-room-${index}`)?.value || 'مدرج';
            
            // توليد المحاضرة المشتركة
            if (hasSharedLec) {
                finalCoursesData.push({ name: `${baseName} ${lecSymbol}`, room_type: sharedLecRoomType, levels: selectedLevels, division: sharedLecDiv, specialization: sharedLecSpec, course_nature: 'محاضرة' });
            }

            // توليد أفواج التخصصات
            specsObj.forEach((obj, specIndex) => {
                const tdGrpCount = parseInt(document.getElementById(`wiz-spec-grp-${index}-${specIndex}`)?.value) || 0;
                if (tdGrpCount > 0) {
                    if (tdGrpCount === 1) {
                        finalCoursesData.push({ name: `${baseName} (${obj.spec}) ${tdSymbol}`, room_type: 'عادية', levels: selectedLevels, division: obj.division, specialization: obj.spec, course_nature: 'أعمال موجهة' });
                    } else {
                        for (let i = 1; i <= tdGrpCount; i++) {
                            finalCoursesData.push({ name: `${baseName} (${obj.spec}) ${tdSymbol}${_t(" ف")}${i}`, room_type: 'عادية', levels: selectedLevels, division: obj.division, specialization: obj.spec, course_nature: 'أعمال موجهة' });
                        }
                    }
                }
                
                const tpGrpCount = parseInt(document.getElementById(`wiz-spec-tp-grp-${index}-${specIndex}`)?.value) || 0;
                if (tpGrpCount > 0) {
                    if (tpGrpCount === 1) {
                        finalCoursesData.push({ name: `${baseName} (${obj.spec}) ${tpSymbol}`, room_type: 'مخبر', levels: selectedLevels, division: obj.division, specialization: obj.spec, course_nature: 'أعمال تطبيقية' });
                    } else {
                        for (let i = 1; i <= tpGrpCount; i++) {
                            finalCoursesData.push({ name: `${baseName} (${obj.spec}) ${tpSymbol}${_t(" ف")}${i}`, room_type: 'مخبر', levels: selectedLevels, division: obj.division, specialization: obj.spec, course_nature: 'أعمال تطبيقية' });
                        }
                    }
                }
            });
        });
    }

    if (finalCoursesData.length === 0) {
        alert(_t('لم تقم بإدخال أي أرقام للأفواج أو تحديد محاضرات للتوليد!'));
        return;
    }

    // إرسال البيانات للخادم
    fetch('/api/students/bulk', { 
        method: 'POST', 
        headers: {'Content-Type': 'application/json'}, 
        body: JSON.stringify(finalCoursesData) 
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            document.getElementById('courses-input').value = ''; 
            closeCourseWizard();
            loadPreviews(); 
            alert(_t("✅ تم توليد وإضافة جميع المواد والأفواج بنجاح!"));
        } else {
            alert(_t('حدث خطأ: ') + data.error);
        }
    });
}

// ================= التحكم في نافذة الرموز البيداغوجية =================
function openNatureModal() {
    document.getElementById('nature-settings-modal').style.display = 'flex';
}

function closeNatureModal() {
    document.getElementById('nature-settings-modal').style.display = 'none';
}

function saveNatures() {
    const lecSymbol = document.getElementById('symbol-lec').value.trim();
    const tdSymbol = document.getElementById('symbol-td').value.trim();
    const tpSymbol = document.getElementById('symbol-tp').value.trim();
    
    if(!lecSymbol || !tdSymbol || !tpSymbol) {
        return alert(_t('يرجى عدم ترك أي خانة من خانات الرموز فارغة!'));
    }
    
    // تجهيز حزمة البيانات للتحديث - تبقى القيم العربية هنا لأن الخادم يتعرف عليها
    const updates = [
        { name: 'محاضرة', symbol: lecSymbol },
        { name: 'أعمال موجهة', symbol: tdSymbol },
        { name: 'أعمال تطبيقية', symbol: tpSymbol }
    ];
    
    let promises = updates.map(data => {
        return fetch('/api/course_natures', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(data)
        });
    });
    
    Promise.all(promises).then(() => {
        alert(_t('✅ تم حفظ الرموز وتحديثها في النظام بنجاح!'));
        closeNatureModal();
        loadPreviews(); 
    }).catch(err => {
        alert(_t("حدث خطأ أثناء الحفظ."));
    });
}