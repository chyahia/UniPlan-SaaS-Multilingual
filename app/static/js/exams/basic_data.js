document.addEventListener('DOMContentLoaded', () => {
    // 🔗 ربط صناديق الإرسال بالواجهة
    const profForm = document.getElementById('add-professors-form');
    const subjForm = document.getElementById('add-subjects-form');
    const levelForm = document.getElementById('add-levels-form');
    const hallForm = document.getElementById('add-halls-form');

    // ⚡ إضافة المستمعين لحدث الإرسال (Submit)
    if (profForm) profForm.addEventListener('submit', handleAddProfessors);
    if (subjForm) subjForm.addEventListener('submit', handleAddSubjects);
    if (levelForm) levelForm.addEventListener('submit', handleAddLevels);
    if (hallForm) hallForm.addEventListener('submit', handleAddHalls);

    
    // 🚀 تهيئة المعاينة (جلب البيانات الحالية) عند تحميل الصفحة
    refreshProfessorPreview();
    refreshHallPreview();
    refreshLevelPreview(); // هذا سيقوم أيضاً بملء القائمة المنسدلة للمواد
    refreshSubjectPreview(); // هذا سيمسح القائمة المنسدلة لأن المستوى فارغ في البداية
});

// ==========================================
// دالة مساعدة لرسم القوائم للمعاينة (تستخدمها كل الصناديق)
// ==========================================
function renderPreviewList(elementId, items, displayField, typeField = null) {
    const listDiv = document.getElementById(elementId);
    listDiv.innerHTML = ''; // مسح المحتوى القديم
    
    if (items.length === 0) {
        listDiv.innerHTML = '<p style="font-style: italic; color: #777; text-align: center;">القائمة فارغة</p>';
        return;
    }
    
    const ul = document.createElement('ul');
    ul.style.listStyle = 'none';
    ul.style.margin = '0';
    ul.style.padding = '0';
    
    items.forEach((item, index) => {
        const li = document.createElement('li');
        li.style.padding = '8px';
        li.style.borderBottom = (index === items.length - 1) ? 'none' : '1px solid #eee';
        
        // بناء النص المراد عرضه
        let text = item[displayField];
        if (typeField && item[typeField]) {
            text += ` (${item[typeField]})`; // إضافة نوع القاعة مثلاً
        }
        
        li.textContent = text;
        ul.appendChild(li);
    });
    
    listDiv.appendChild(ul);
}

// ==========================================
// دوال المعاينة وجلب البيانات (Get Data & Refresh Preview)
// ==========================================

function refreshProfessorPreview() {
    fetch('/exams/api/get-professors')
        .then(res => res.json())
        .then(professors => {
            renderPreviewList('professors-preview-list', professors, 'name');
        }).catch(err => console.error(err));
}

function refreshHallPreview() {
    fetch('/exams/api/get-halls')
        .then(res => res.json())
        .then(halls => {
            renderPreviewList('halls-preview-list', halls, 'name', 'type');
        }).catch(err => console.error(err));
}

function refreshLevelPreview() {
    fetch('/exams/api/get-levels')
    .then(res => res.json())
    .then(data => {
        // تحديث القائمة الجانبية للمعاينة
        if (typeof renderPreviewList === 'function') {
            renderPreviewList('levels-preview-list', data, 'name');
        }
        
        // 🌟 توليد مربعات التأشير بدلاً من الخيارات القديمة
        const checkboxContainer = document.getElementById('subject-levels-checkboxes');
        if (checkboxContainer) {
            checkboxContainer.innerHTML = ''; // مسح المحتوى القديم
            
            if (data.length === 0) {
                checkboxContainer.innerHTML = '<span style="color: #999; font-size: 13px;">لا توجد مستويات، أضف مستويات أولاً.</span>';
            } else {
                data.forEach(lvl => {
                    checkboxContainer.innerHTML += `
                        <label style="display: flex; align-items: center; cursor: pointer; padding: 6px 10px; background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; transition: 0.2s;">
                            <input type="checkbox" class="level-cb-input" value="${lvl.id}" style="margin-left: 10px; transform: scale(1.2); cursor: pointer;">
                            <span style="font-size: 15px; font-weight: bold; color: #2c3e50;">${lvl.name}</span>
                        </label>`;
                });
            }
        }
    }).catch(err => console.error("Error fetching levels:", err));
}

// جلب وعرض المواد مجمعة حسب المستويات
function refreshSubjectPreview() {
    // جلب كل المواد بدون تحديد مستوى معين
    fetch(`/exams/api/get-subjects`)
        .then(res => res.json())
        .then(subjects => {
            renderGroupedSubjects(subjects);
        }).catch(err => console.error(err));
}

// دالة جديدة مخصصة لرسم المواد مجمعة
function renderGroupedSubjects(subjects) {
    const listDiv = document.getElementById('subjects-preview-list');
    listDiv.innerHTML = ''; // مسح القديم
    
    if (subjects.length === 0) {
        listDiv.innerHTML = '<p style="font-style: italic; color: #777; text-align: center;">لا توجد مواد مدخلة بعد</p>';
        return;
    }

    // 1. تجميع المواد في كائن (Object) حسب اسم المستوى
    const grouped = {};
    subjects.forEach(sub => {
        if (!grouped[sub.level_name]) {
            grouped[sub.level_name] = [];
        }
        grouped[sub.level_name].push(sub);
    });

    // 2. رسم العناصر في الواجهة
    for (const [levelName, subs] of Object.entries(grouped)) {
        // إنشاء عنوان المستوى
        const levelHeading = document.createElement('h4');
        levelHeading.style.color = '#3f51b5';
        levelHeading.style.margin = '15px 0 5px 0';
        levelHeading.style.borderBottom = '1px dashed #ccc';
        levelHeading.style.paddingBottom = '5px';
        levelHeading.textContent = `📌 ${levelName}`;
        listDiv.appendChild(levelHeading);

        // إنشاء قائمة المواد التابعة لهذا المستوى
        const ul = document.createElement('ul');
        ul.style.listStyleType = 'square';
        ul.style.margin = '0 20px 10px 0'; // إزاحة لليمين قليلاً (RTL)
        ul.style.padding = '0';
        
        subs.forEach(sub => {
            const li = document.createElement('li');
            li.style.padding = '4px 0';
            li.style.color = '#333';
            li.textContent = sub.name;
            ul.appendChild(li);
        });
        
        listDiv.appendChild(ul);
    }
}

// ==========================================
// دوال معالجة حدث إرسال النماذج (Handle Form Submit)
// ==========================================

function handleAddProfessors(e) {
    e.preventDefault();
    const text = document.getElementById('professors-input').value;
    const names = text.split('\n').map(n => n.trim()).filter(n => n !== '');
    if (names.length === 0) return showNotification('الرجاء إدخال اسم واحد على الأقل.', 'error');

    fetch('/exams/api/add-professors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professors: names }) // تم التعديل لتتطابق مع البايثون
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`تم الإضافة بنجاح! مضاف: ${data.added}، مكرر: ${data.duplicates}`, 'success');
            document.getElementById('professors-input').value = ''; // مسح المدخلات
            refreshProfessorPreview(); // 🔄 تحديث المعاينة فورياً
        }
    }).catch(err => showNotification('حدث خطأ في الاتصال بالخادم', 'error'));
}

function handleAddLevels(e) {
    e.preventDefault();
    const text = document.getElementById('levels-input').value;
    const levels = text.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (levels.length === 0) return showNotification('الرجاء إدخال اسم واحد على الأقل للمستوى.', 'error');

    fetch('/exams/api/add-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levels })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`تم الإضافة بنجاح! مضاف: ${data.added}، مكرر: ${data.duplicates}`, 'success');
            document.getElementById('levels-input').value = ''; // مسح المدخلات
            refreshLevelPreview(); // 🔄 تحديث المعاينة فورياً (وتحديث قائمة المواد)
        }
    }).catch(err => showNotification('حدث خطأ في الاتصال بالخادم', 'error'));
}

function handleAddSubjects(e) {
    e.preventDefault();
    
    // 🌟 سحب أرقام المستويات من مربعات التأشير المحددة فقط
    const checkboxes = document.querySelectorAll('.level-cb-input:checked');
    const levelIds = Array.from(checkboxes).map(cb => cb.value);
    
    if (levelIds.length === 0) return showNotification('الرجاء اختيار مستوى واحد على الأقل.', 'error');
    
    const text = document.getElementById('subjects-input').value;
    const subjects = text.split('\n').map(s => s.trim()).filter(s => s !== '');
    if (subjects.length === 0) return showNotification('الرجاء إدخال مادة واحدة على الأقل.', 'error');

    fetch('/exams/api/add-subjects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level_ids: levelIds, subjects: subjects })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`تم الإضافة بنجاح! مضاف: ${data.added}، مكرر: ${data.duplicates}`, 'success');
            document.getElementById('subjects-input').value = ''; 
            
            // 🧹 إزالة التأشير عن المربعات بعد النجاح لتجهيز الإدخال القادم
            checkboxes.forEach(cb => cb.checked = false);
            
            refreshSubjectPreview(); 
        } else {
             showNotification(data.message || 'حدث خطأ أثناء الإضافة', 'error');
        }
    }).catch(err => showNotification('حدث خطأ في الاتصال بالخادم', 'error'));
}

function handleAddHalls(e) {
    e.preventDefault();
    const type = document.getElementById('hall-type-select').value;
    const text = document.getElementById('halls-input').value;
    const halls = text.split('\n').map(h => h.trim()).filter(h => h !== '');
    if (halls.length === 0) return showNotification('الرجاء إدخال قاعة واحدة على الأقل.', 'error');

    fetch('/exams/api/add-halls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, halls })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(`تم الإضافة بنجاح! مضاف: ${data.added}، مكرر: ${data.duplicates}`, 'success');
            document.getElementById('halls-input').value = ''; // مسح المدخلات
            refreshHallPreview(); // 🔄 تحديث المعاينة فورياً
        }
    }).catch(err => showNotification('حدث خطأ في الاتصال بالخادم', 'error'));
}