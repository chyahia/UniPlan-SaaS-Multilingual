let globalLevels = []; // متغير عام لحفظ المستويات واستخدامها في تعديل المواد

// دالة لجلب البيانات وتعبئة الجداول (محدثة لدعم التعديل المباشر)
function loadManageTables() {
    // 1. جدول الأساتذة
    fetch('/teachers').then(res => res.json()).then(data => {
        document.getElementById('title-manage-profs').innerText = `👨‍🏫 قائمة الأساتذة (${data.length})`;
        const tbody = document.querySelector('#teachers-table tbody');
        tbody.innerHTML = data.map(t => `<tr><td>${t.name}</td><td>
            <button onclick="editItem('/api/teachers/${t.id}', '${t.name}')" class="btn-edit">تعديل</button>
            <button onclick="deleteItem('/api/teachers/${t.id}')" class="btn-delete">حذف</button>
            <button onclick="openAccountModal(${t.id}, '${t.name}')" style="background: #34495e; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 13px;">🔑 الحساب</button>
        </td></tr>`).join('');
    });

    // 2. جدول المستويات
    fetch('/api/levels').then(res => res.json()).then(data => {
        globalLevels = data; // حفظ المستويات
        document.getElementById('title-manage-levels').innerText = `🎓 قائمة المستويات (${data.length})`;
        const tbody = document.querySelector('#levels-table tbody');
        tbody.innerHTML = data.map(l => `<tr><td>${l}</td><td>
            <button onclick="editItem('/api/levels/${encodeURIComponent(l)}', '${l}')" class="btn-edit">تعديل</button>
            <button onclick="deleteItem('/api/levels/${encodeURIComponent(l)}')" class="btn-delete">حذف</button>
        </td></tr>`).join('');
    });

    // 3. جدول القاعات (مصحح ليعتمد "عادية")
    fetch('/rooms').then(res => res.json()).then(data => {
        document.getElementById('title-manage-rooms').innerText = `🚪 قائمة القاعات (${data.length})`;
        const tbody = document.querySelector('#rooms-table tbody');
        tbody.innerHTML = data.map(r => `<tr id="room-row-${r.id}">
            <td>${r.name}</td>
            <td>${r.type || 'عادية'}</td>
            <td>
                <button onclick="editRoomInline(${r.id}, '${r.name}', '${r.type || 'عادية'}')" class="btn-edit">تعديل</button>
                <button onclick="deleteItem('/api/rooms/${r.id}')" class="btn-delete">حذف</button>
            </td>
        </tr>`).join('');
    });

    // 4. جدول المواد 
    fetch('/api/courses').then(res => res.json()).then(data => {
        document.getElementById('title-manage-courses').innerText = `📚 قائمة المواد (${data.length})`;
        const tbody = document.querySelector('#courses-table tbody');
        tbody.innerHTML = data.map(c => `<tr id="course-row-${c.id}">
            <td style="text-align: center;">
                <input type="checkbox" class="course-select-chk" value="${c.id}" onchange="updateBulkEditBar()" style="transform: scale(1.3); cursor: pointer;">
            </td>
            <td>${c.name}</td>
            <td>${c.levels || 'غير محدد'}</td>
            <td>${c.division || ''}</td>
            <td>${c.specialization || ''}</td>
            <td>${c.course_nature || 'أعمال موجهة'}</td> <td>${c.room_type || 'عادية'}</td>
            <td>
                <button onclick="editCourseInline(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${c.levels || ''}', '${c.room_type || 'عادية'}', '${(c.division || '').replace(/'/g, "\\'")}', '${(c.specialization || '').replace(/'/g, "\\'")}', '${(c.course_nature || 'أعمال موجهة').replace(/'/g, "\\'")}')" class="btn-edit">تعديل</button>
                <button onclick="deleteItem('/api/courses/${c.id}')" class="btn-delete">حذف</button>
            </td>
        </tr>`).join('');
        
        document.getElementById('select-all-courses').checked = false;
        updateBulkEditBar();
    });
}

// ================= دوال التعديل المباشر (Inline Editing) =================

// 1. تحويل سطر القاعة إلى وضع التعديل (مصحح: عادية/مدرج)
function editRoomInline(id, oldName, oldType) {
    const tr = document.getElementById(`room-row-${id}`);
    tr.innerHTML = `
        <td><input type="text" id="edit-room-name-${id}" value="${oldName}" style="width: 90%; padding: 5px; text-align: right;"></td>
        <td>
            <select id="edit-room-type-${id}" style="padding: 5px;">
                <option value="عادية" ${oldType === 'عادية' ? 'selected' : ''}>عادية</option>
                <option value="مدرج" ${oldType === 'مدرج' ? 'selected' : ''}>مدرج</option>
                <option value="مخبر" ${oldType === 'مخبر' ? 'selected' : ''}>مخبر</option>
            </select>
        </td>
        <td>
            <button onclick="saveRoomEdit(${id})" style="background: #27ae60; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">حفظ</button>
            <button onclick="loadManageTables()" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">إلغاء</button>
        </td>
    `;
}

// حفظ تعديل القاعة
function saveRoomEdit(id) {
    const newName = document.getElementById(`edit-room-name-${id}`).value.trim();
    const newType = document.getElementById(`edit-room-type-${id}`).value;
    
    if(!newName) return alert("اسم القاعة مطلوب!");

    fetch(`/api/rooms/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ name: newName, type: newType })
    }).then(res => res.json()).then(data => {
        if(data.success) {
            loadManageTables();
            if(typeof loadPreviews === 'function') loadPreviews();
        } else alert("خطأ: " + data.error);
    });
}

// 2. تحويل سطر المادة إلى وضع التعديل (محدث بالشعبة والتخصص)
function editCourseInline(id, oldName, oldLevelsStr, oldRoomType, oldDivision, oldSpecialization, oldNature) {
    const tr = document.getElementById(`course-row-${id}`);
    const currentLevels = oldLevelsStr.split(' ، ').map(l => l.trim());

    let levelsCheckboxes = globalLevels.map(l => `
        <label style="display: inline-block; margin: 2px 5px; font-size: 13px; background: #f8f9fa; padding: 3px 6px; border-radius: 4px; border: 1px solid #ddd;">
            <input type="checkbox" value="${l}" class="edit-course-level-${id}" ${currentLevels.includes(l) ? 'checked' : ''}> ${l}
        </label>
    `).join('');

    tr.innerHTML = `
        <td style="text-align: center; color: #bdc3c7;">-</td>
        <td><input type="text" id="edit-course-name-${id}" value="${oldName}" style="width: 90%; padding: 5px; text-align: right;"></td>
        <td style="max-width: 250px; text-align: right;">${levelsCheckboxes}</td>
        <td><input type="text" id="edit-course-div-${id}" value="${oldDivision}" placeholder="الشعبة..." style="width: 90%; padding: 5px; text-align: right;"></td>
        <td><input type="text" id="edit-course-spec-${id}" value="${oldSpecialization}" placeholder="التخصص..." style="width: 90%; padding: 5px; text-align: right;"></td>
        <td>
            <select id="edit-course-nature-${id}" style="padding: 5px;">
                <option value="محاضرة" ${oldNature === 'محاضرة' ? 'selected' : ''}>محاضرة</option>
                <option value="أعمال موجهة" ${oldNature === 'أعمال موجهة' ? 'selected' : ''}>أعمال موجهة</option>
                <option value="أعمال تطبيقية" ${oldNature === 'أعمال تطبيقية' ? 'selected' : ''}>أعمال تطبيقية</option>
            </select>
        </td>
        <td>
            <select id="edit-course-rtype-${id}" style="padding: 5px;">
                <option value="عادية" ${oldRoomType === 'عادية' ? 'selected' : ''}>عادية</option>
                <option value="مدرج" ${oldRoomType === 'مدرج' ? 'selected' : ''}>مدرج</option>
                <option value="مخبر" ${oldRoomType === 'مخبر' ? 'selected' : ''}>مخبر</option>
            </select>
        </td>
        <td>
            <button onclick="saveCourseEdit(${id})" style="background: #27ae60; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">حفظ</button>
            <button onclick="loadManageTables()" style="background: #e74c3c; color: white; border: none; padding: 5px 10px; border-radius: 4px; cursor: pointer;">إلغاء</button>
        </td>
    `;
}

function saveCourseEdit(id) {
    const newName = document.getElementById(`edit-course-name-${id}`).value.trim();
    const newRoomType = document.getElementById(`edit-course-rtype-${id}`).value;
    const newDivision = document.getElementById(`edit-course-div-${id}`).value.trim();
    const newSpecialization = document.getElementById(`edit-course-spec-${id}`).value.trim();
    const newNature = document.getElementById(`edit-course-nature-${id}`).value; 
    
    const checkboxes = document.querySelectorAll(`.edit-course-level-${id}:checked`);
    const newLevels = Array.from(checkboxes).map(cb => cb.value);

    if(!newName || newLevels.length === 0) return alert("اسم المادة مطلوب ويجب اختيار مستوى واحد على الأقل!");

    fetch(`/api/courses/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ 
            name: newName, 
            room_type: newRoomType, 
            levels: newLevels,
            division: newDivision,
            specialization: newSpecialization,
            course_nature: newNature 
        })
    }).then(res => {
        // فحص حالة الخادم لمنع الصمت البرمجي
        if (!res.ok) throw new Error("حدث خطأ في الاتصال بالخادم، راجع شاشة الطرفية السوداء لمعرفة السبب.");
        return res.json();
    }).then(data => {
        if(data.success) {
            loadManageTables();
            if(typeof loadPreviews === 'function') loadPreviews();
        } else alert("خطأ: " + data.error);
    }).catch(err => {
        // إظهار رسالة الخطأ للمستخدم بوضوح
        alert("❌ تعذر الحفظ: " + err.message);
    });
}

// ================= الدوال القديمة الأساسية (بقيت كما هي) =================

function editItem(url, oldName) {
    const newName = prompt("أدخل الاسم الجديد:", oldName);
    if (newName !== null && newName.trim() !== "" && newName !== oldName) {
        fetch(url, { 
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ name: newName.trim() })
        }).then(res => res.json()).then(data => {
            if(data.success) { loadManageTables(); if(typeof loadPreviews === 'function') loadPreviews(); } 
            else alert('خطأ: ' + data.error);
        });
    }
}

function deleteItem(url) {
    if(confirm('هل أنت متأكد من حذف هذا العنصر؟ (سيتم حذف أي ارتباطات له)')) {
        fetch(url, { method: 'DELETE' }).then(res => res.json()).then(data => {
            if(data.success) { loadManageTables(); if(typeof loadPreviews === 'function') loadPreviews(); }
        });
    }
}

function openAccountModal(teacherId, teacherName) {
    document.getElementById('acc-teacher-id').value = teacherId;
    document.getElementById('account-modal-title').innerText = '🔑 حساب الأستاذ: ' + teacherName;
    document.getElementById('acc-username').value = '';
    document.getElementById('acc-password').value = '';

    fetch('/api/manage_account/' + teacherId).then(res => res.json()).then(data => {
        if(data.has_account) document.getElementById('acc-username').value = data.username;
        document.getElementById('account-modal').style.display = 'flex';
    });
}

function saveTeacherAccount() {
    const tid = document.getElementById('acc-teacher-id').value;
    const user = document.getElementById('acc-username').value;
    const pass = document.getElementById('acc-password').value;

    if(!user || !pass) return alert("يرجى إدخال اسم المستخدم وكلمة المرور.");

    fetch('/api/manage_account', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({teacher_id: tid, username: user, password: pass})
    }).then(res => res.json()).then(data => {
        if(data.success) {
            alert(data.message);
            document.getElementById('account-modal').style.display = 'none';
        } else alert("خطأ: " + data.error);
    });
}

// ================= التعديل الجماعي للمواد (Bulk Edit) =================

// دالة لتحديث حالة شريط التعديل الجماعي (إظهار/إخفاء)
function updateBulkEditBar() {
    const checkedBoxes = document.querySelectorAll('.course-select-chk:checked');
    const bulkBar = document.getElementById('bulk-edit-bar');
    const countSpan = document.getElementById('selected-courses-count');
    
    if (checkedBoxes.length > 0) {
        bulkBar.style.display = 'block';
        countSpan.innerText = checkedBoxes.length;
    } else {
        bulkBar.style.display = 'none';
        countSpan.innerText = '0';
    }
}

// دالة تحديد / إلغاء تحديد الكل
function toggleAllCourses(masterCheckbox) {
    const checkboxes = document.querySelectorAll('.course-select-chk');
    checkboxes.forEach(chk => chk.checked = masterCheckbox.checked);
    updateBulkEditBar();
}

// دالة تطبيق التعديل الجماعي وإرساله للخادم
function applyBulkEdit() {
    const checkedBoxes = document.querySelectorAll('.course-select-chk:checked');
    const courseIds = Array.from(checkedBoxes).map(chk => parseInt(chk.value));
    
    if (courseIds.length === 0) return;
    
    const newDivision = document.getElementById('bulk-division').value.trim();
    const newSpec = document.getElementById('bulk-specialization').value.trim();
    const newNature = document.getElementById('bulk-nature').value; // ✨ قراءة الطبيعة
    
    if (!newDivision && !newSpec && !newNature) {
        return alert("يرجى كتابة الشعبة، أو التخصص، أو تحديد طبيعة جديدة قبل التطبيق.");
    }
    
    if (!confirm(`هل أنت متأكد من تغيير البيانات لـ (${courseIds.length}) مواد دفعة واحدة؟`)) return;
    
    fetch('/api/courses/bulk_update', {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            course_ids: courseIds,
            division: newDivision !== "" ? newDivision : null, 
            specialization: newSpec !== "" ? newSpec : null,
            course_nature: newNature !== "" ? newNature : null // ✨ إرسالها للخادم
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById('bulk-division').value = '';
            document.getElementById('bulk-specialization').value = '';
            document.getElementById('bulk-nature').value = '';
            
            alert("✅ " + data.message);
            loadManageTables();
        } else {
            alert("❌ خطأ: " + data.error);
        }
    })
    .catch(err => {
        alert("حدث خطأ في الاتصال بالخادم.");
    });
}