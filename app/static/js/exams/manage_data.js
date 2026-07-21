document.addEventListener('DOMContentLoaded', () => {
    // تحديث الجداول فور تحميل الصفحة
    refreshAllManageTables();
});

function refreshAllManageTables() {
    loadManageProfessors();
    loadManageHalls();
    loadManageLevels();
    loadManageSubjects();
}

// ==========================================
// 📥 دوال جلب ورسم البيانات في الجداول
// ==========================================
function loadManageProfessors() {
    fetch('/exams/api/get-professors').then(res => res.json()).then(data => {
        document.getElementById('title-manage-profs').innerText = `${_t('👨‍🏫 قائمة الأساتذة')} (${data.length})`;
        const tbody = document.getElementById('manage-professors-tbody');
        tbody.innerHTML = '';
        data.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td style="text-align: center;">
                        <button class="btn-edit" onclick="editEntity('professor', ${item.id}, '${item.name}')">${_t('تعديل')}</button>
                        <button class="btn-delete" onclick="deleteEntity('professor', ${item.id})">${_t('حذف')}</button>
                    </td>
                </tr>`;
        });
    });
}

function loadManageHalls() {
    fetch('/exams/api/get-halls').then(res => res.json()).then(data => {
        document.getElementById('title-manage-halls').innerText = `${_t('🏫 قائمة القاعات')} (${data.length})`;
        const tbody = document.getElementById('manage-halls-tbody');
        tbody.innerHTML = '';
        data.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td><span style="background: #e9ecef; padding: 3px 8px; border-radius: 10px; font-size: 12px;">${_t(item.type)}</span></td>
                    <td style="text-align: center;">
                        <button class="btn-edit" onclick="editHall(${item.id}, '${item.name}', '${item.type}')">${_t('تعديل')}</button>
                        <button class="btn-delete" onclick="deleteEntity('hall', ${item.id})">${_t('حذف')}</button>
                    </td>
                </tr>`;
        });
    });
}

function loadManageLevels() {
    fetch('/exams/api/get-levels').then(res => res.json()).then(data => {
        document.getElementById('title-manage-levels').innerText = `${_t('🏗️ قائمة المستويات الدراسية')} (${data.length})`;
        const tbody = document.getElementById('manage-levels-tbody');
        tbody.innerHTML = '';
        data.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td style="text-align: center;">
                        <button class="btn-edit" onclick="editEntity('level', ${item.id}, '${item.name}')">${_t('تعديل')}</button>
                        <button class="btn-delete" onclick="deleteEntity('level', ${item.id})">${_t('حذف')}</button>
                    </td>
                </tr>`;
        });
    });
}

function loadManageSubjects() {
    fetch('/exams/api/get-subjects').then(res => res.json()).then(data => {
        document.getElementById('title-manage-subjects').innerText = `${_t('📚 قائمة المواد')} (${data.length})`;
        const tbody = document.getElementById('manage-subjects-tbody');
        tbody.innerHTML = '';
        data.forEach(item => {
            tbody.innerHTML += `
                <tr>
                    <td>${item.name}</td>
                    <td>${item.level_name}</td>
                    <td style="text-align: center;">
                        <button class="btn-edit" onclick="editEntity('subject', ${item.id}, '${item.name}')">${_t('تعديل')}</button>
                        <button class="btn-delete" onclick="deleteEntity('subject', ${item.id})">${_t('حذف')}</button>
                    </td>
                </tr>`;
        });
    });
}

// ==========================================
// 🗑️ دالة الحذف الشاملة
// ==========================================
function deleteEntity(entityType, id) {
    if (!confirm(_t('هل أنت متأكد من حذف هذا العنصر؟ (قد يؤدي هذا لحذف البيانات المرتبطة به)'))) return;

    fetch(`/exams/api/delete-${entityType}/${id}`, { method: 'DELETE' })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(_t('تم الحذف بنجاح'), 'success');
            // تحديث جداول المرحلة 2
            refreshAllManageTables();
            
            // 🔄 التزامن السحري: تحديث قوائم المعاينة في المرحلة 1 فوراً
            if(entityType === 'professor' && typeof refreshProfessorPreview === 'function') refreshProfessorPreview();
            if(entityType === 'hall' && typeof refreshHallPreview === 'function') refreshHallPreview();
            if(entityType === 'level' && typeof refreshLevelPreview === 'function') { refreshLevelPreview(); refreshSubjectPreview(); }
            if(entityType === 'subject' && typeof refreshSubjectPreview === 'function') refreshSubjectPreview();
        } else {
            showNotification(_t('فشل الحذف: ') + data.message, 'error');
        }
    }).catch(err => showNotification(_t('خطأ في الاتصال بالخادم'), 'error'));
}

// ==========================================
// ✏️ دوال التعديل
// ==========================================
function editEntity(entityType, id, oldName) {
    const newName = prompt(_t('أدخل الاسم الجديد:'), oldName);
    if (!newName || newName === oldName || newName.trim() === '') return;

    fetch(`/exams/api/edit-${entityType}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(_t('تم التعديل بنجاح'), 'success');
            refreshAllManageTables();
            
            // 🔄 تزامن مع المرحلة 1
            if(entityType === 'professor') refreshProfessorPreview();
            if(entityType === 'level') { refreshLevelPreview(); refreshSubjectPreview(); }
            if(entityType === 'subject') refreshSubjectPreview();
        } else {
            showNotification(data.message, 'error');
        }
    });
}

// القاعات لها دالة خاصة لأنها تحتوي على "النوع" بالإضافة للاسم
function editHall(id, oldName, oldType) {
    const newName = prompt(_t('أدخل الاسم الجديد للقاعة:'), oldName);
    if (!newName || newName.trim() === '') return;
    
    const newType = prompt(_t('أدخل نوع القاعة (صغيرة، متوسطة، كبيرة):'), oldType);
    if (!['صغيرة', 'متوسطة', 'كبيرة'].includes(newType)) {
        return alert(_t('نوع القاعة غير صالح! يجب أن يكون: صغيرة أو متوسطة أو كبيرة'));
    }

    if (newName === oldName && newType === oldType) return;

    fetch(`/exams/api/edit-hall/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), type: newType })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(_t('تم تعديل القاعة بنجاح'), 'success');
            refreshAllManageTables();
            if(typeof refreshHallPreview === 'function') refreshHallPreview();
        } else {
            showNotification(data.message, 'error');
        }
    });
}

// ==========================================
// 🔄 دالة التحديث اليدوي مع التأثيرات البصرية
// ==========================================
function manualRefreshData(btnElement) {
    // 1. تغيير شكل الزر لإشعار المستخدم ببدء العملية
    const originalText = btnElement.innerHTML;
    btnElement.innerHTML = _t("⏳ جاري التحديث...");
    btnElement.disabled = true;
    btnElement.style.opacity = "0.7";
    
    // 2. استدعاء الدالة الأصلية لجلب البيانات ورسم الجداول
    refreshAllManageTables();
    
    // 3. تأخير شكلي (نصف ثانية) لتوضيح حدوث عملية اتصال، ثم إرجاع الزر لحالته وإظهار إشعار
    setTimeout(() => {
        btnElement.innerHTML = originalText;
        btnElement.disabled = false;
        btnElement.style.opacity = "1";
        
        if (typeof showNotification === 'function') {
            showNotification(_t('✅ تم تحديث الجداول وجلب أحدث البيانات!'), 'success');
        }
    }, 500);
}