let examDayCounter = 0;
let availableLevelsForTimes = [];

document.addEventListener('DOMContentLoaded', () => {
    setupExamScheduleBuilder();
    loadInitialScheduleData();
});

// جلب المستويات والبيانات المحفوظة
function loadInitialScheduleData() {
    // جلب المستويات لرسم مربعات التأشير (التعديل السحابي)
    fetch('/exams/api/get-levels').then(res => res.json()).then(levels => {
        availableLevelsForTimes = levels.map(l => l.name);
        
        // بعد جلب المستويات، نجلب الجدول المحفوظ إن وجد (التعديل السحابي)
        fetch('/exams/api/exam-schedule').then(res => res.json()).then(schedule => {
            if (Object.keys(schedule).length > 0) {
                renderSavedSchedule(schedule);
            }
        });
    });
}

// دالة مساعدة لمعرفة اسم اليوم بالعربية
function getArabicDayName(dateString) {
    if (!dateString) return "يوم جديد";
    const date = new Date(dateString);
    if (isNaN(date)) return "يوم غير محدد";
    return date.toLocaleDateString('ar-EG', { weekday: 'long' });
}

function setupExamScheduleBuilder() { 
    const container = document.getElementById('exam-days-container');
    // تهيئة الحاوية لتشمل شريط تبويبات ومنطقة محتوى
    container.innerHTML = `
        <div id="days-tabs-bar" style="display: flex; gap: 8px; overflow-x: auto; margin-bottom: 15px; border-bottom: 2px solid #3f51b5; padding-bottom: 5px;"></div>
        <div id="days-content-area"></div>
    `;

    document.getElementById('add-exam-day-button').addEventListener('click', () => {
        const dayDiv = addExamDayUI();
        // تفعيل التبويب الجديد تلقائياً عند إضافته
        activateDayTab(dayDiv.id);
    });
}

// دالة لتفعيل تبويب معين وإخفاء الباقي
function activateDayTab(targetDayId) {
    document.querySelectorAll('.day-content-panel').forEach(panel => panel.style.display = 'none');
    document.querySelectorAll('.day-tab-btn').forEach(btn => {
        btn.style.background = '#e0e0e0';
        btn.style.color = '#333';
    });

    const targetPanel = document.getElementById(targetDayId);
    const targetBtn = document.getElementById(`tab-btn-${targetDayId}`);
    
    if (targetPanel && targetBtn) {
        targetPanel.style.display = 'block';
        targetBtn.style.background = '#3f51b5';
        targetBtn.style.color = '#fff';
    }
}

function addExamDayUI() {
    examDayCounter++;
    const dayId = `exam-day-${examDayCounter}`;
    const tabsBar = document.getElementById('days-tabs-bar');
    const contentArea = document.getElementById('days-content-area');

    // 1. إنشاء زر التبويب
    const tabBtn = document.createElement('button');
    tabBtn.id = `tab-btn-${dayId}`;
    tabBtn.className = 'day-tab-btn';
    tabBtn.innerText = `يوم جديد`;
    tabBtn.style.cssText = 'padding: 8px 15px; border: none; background: #e0e0e0; color: #333; cursor: pointer; border-radius: 5px 5px 0 0; font-weight: bold; white-space: nowrap;';
    tabBtn.onclick = (e) => { e.preventDefault(); activateDayTab(dayId); };
    tabsBar.appendChild(tabBtn);

    // 2. إنشاء محتوى اليوم
    const dayDiv = document.createElement('div');
    dayDiv.id = dayId;
    dayDiv.className = 'exam-day day-content-panel';
    dayDiv.style.display = 'none'; // مخفي افتراضياً حتى يتم تفعيله
    
    dayDiv.innerHTML = `
        <div class="exam-day-header">
            <div style="display: flex; align-items: center; gap: 15px;">
                <label style="font-weight: bold; color: #3f51b5;">التاريخ:</label>
                <input type="date" class="exam-date-input" required style="border: 2px solid #3f51b5; padding: 8px; border-radius: 4px; font-weight:bold;">
            </div>
            <div>
                <button class="duplicate-day-btn" title="تكرار هذا اليوم مع فتراته">🔄</button>
                <button class="remove-day-btn" title="حذف هذا اليوم">&times;</button>
            </div>
        </div>
        <div class="time-slots-container"></div>
        <button class="add-timeslot-button" style="width: 100%; padding: 8px; background-color: #6c757d; color: white; border: none; border-radius: 4px; margin-top: 10px; cursor: pointer;">+ إضافة فترة زمنية</button>
    `;
    
    // تحديث اسم التبويب عند تغيير التاريخ
    const dateInput = dayDiv.querySelector('.exam-date-input');
    dateInput.addEventListener('change', function() {
        const dayName = getArabicDayName(this.value);
        tabBtn.innerText = `${dayName} (${this.value})`;
    });

    dayDiv.querySelector('.add-timeslot-button').addEventListener('click', e => addTimeSlotUI(e.target.previousElementSibling));
    dayDiv.querySelector('.duplicate-day-btn').addEventListener('click', e => {
        const clonedDay = duplicateDay(e.currentTarget.closest('.exam-day'));
        activateDayTab(clonedDay.id); // تفعيل اليوم المكرر فوراً
    });
    
    dayDiv.querySelector('.remove-day-btn').addEventListener('click', e => {
        dayDiv.remove(); // حذف المحتوى
        tabBtn.remove(); // حذف التبويب
        // تفعيل أول تبويب متبقي إن وجد
        const remainingTabs = document.querySelectorAll('.day-tab-btn');
        if (remainingTabs.length > 0) {
            remainingTabs[0].click();
        }
    });
    
    contentArea.appendChild(dayDiv);
    return dayDiv;
}

// دالة إضافة الفترات
function addTimeSlotUI(container) {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'time-slot';

    const levelsContainer = document.createElement('div');
    levelsContainer.className = 'time-slot-levels levels-checkbox-group';
    
    availableLevelsForTimes.forEach(level => {
        const label = document.createElement('label');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = level;
        
        label.appendChild(checkbox);
        label.append(` ${level}`);
        levelsContainer.appendChild(label);
    });
    
    const slotTypeSelect = `
        <select class="slot-type-select">
            <option value="primary" selected>فترة أساسية</option>
            <option value="reserve">فترة احتياطية</option>
        </select>
    `;
    
    const inputsAndButtonDiv = document.createElement('div');
    inputsAndButtonDiv.className = 'time-slot-inputs-container';
    inputsAndButtonDiv.innerHTML = `
        <div class="time-slot-inputs">
            <input type="time" class="time-start" required value="09:00">
            <input type="time" class="time-end" required value="10:30">
            ${slotTypeSelect}
        </div>
    `;

    slotDiv.appendChild(inputsAndButtonDiv);
    slotDiv.appendChild(levelsContainer);
    
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-timeslot-btn';
    removeBtn.title = 'حذف الفترة';
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', (e) => e.currentTarget.closest('.time-slot').remove());
    
    slotDiv.appendChild(removeBtn);

    container.appendChild(slotDiv);
    return slotDiv;
}

function duplicateDay(sourceDayDiv) {
    const newDayDiv = addExamDayUI();
    const sourceTimeSlots = sourceDayDiv.querySelectorAll('.time-slot');
    const newTimeSlotsContainer = newDayDiv.querySelector('.time-slots-container');
    
    sourceTimeSlots.forEach(sourceSlot => {
        const newSlotDiv = addTimeSlotUI(newTimeSlotsContainer);
        
        newSlotDiv.querySelector('.time-start').value = sourceSlot.querySelector('.time-start').value;
        newSlotDiv.querySelector('.time-end').value = sourceSlot.querySelector('.time-end').value;
        newSlotDiv.querySelector('.slot-type-select').value = sourceSlot.querySelector('.slot-type-select').value;
        
        const sourceSelectedLevels = Array.from(sourceSlot.querySelectorAll('.levels-checkbox-group input:checked')).map(cb => cb.value);
        Array.from(newSlotDiv.querySelectorAll('.levels-checkbox-group input')).forEach(cb => {
            if (sourceSelectedLevels.includes(cb.value)) cb.checked = true;
        });
    });
    
    return newDayDiv;
}

// ==========================================
// 💾 حفظ واسترجاع البيانات
// ==========================================
function saveExamSchedule() {
    const examSchedule = {};
    let hasErrors = false;

    document.querySelectorAll('.exam-day').forEach((dayDiv) => {
        const date = dayDiv.querySelector('.exam-date-input').value;
        if (!date) {
            hasErrors = true;
            return;
        }
        
        examSchedule[date] = [];
        dayDiv.querySelectorAll('.time-slot').forEach(slotDiv => {
            const start = slotDiv.querySelector('.time-start').value;
            const end = slotDiv.querySelector('.time-end').value;
            const type = slotDiv.querySelector('.slot-type-select').value;
            const selectedLevels = Array.from(slotDiv.querySelectorAll('.levels-checkbox-group input:checked')).map(cb => cb.value);

            if (start && end && selectedLevels.length > 0) {
                examSchedule[date].push({ 
                    time: `${start}-${end}`, 
                    levels: selectedLevels,
                    type: type 
                });
            }
        });
    });

    if (hasErrors) {
        return showNotification('يوجد أيام بدون تاريخ! يرجى تحديد التاريخ لكل يوم.', 'error');
    }

    if (Object.keys(examSchedule).length === 0) {
        return showNotification('لا يوجد بيانات لحفظها. أضف يوماً وفترة واحدة على الأقل.', 'error');
    }

    // التعديل السحابي: حفظ في مسار الامتحانات
    fetch('/exams/api/exam-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(examSchedule)
    }).then(res => res.json()).then(data => {
        if (data.success) showNotification(data.message, 'success');
    });
}

function renderSavedSchedule(schedule) {
    const container = document.getElementById('exam-days-container');
    container.innerHTML = `
        <div id="days-tabs-bar" style="display: flex; gap: 8px; overflow-x: auto; margin-bottom: 15px; border-bottom: 2px solid #3f51b5; padding-bottom: 5px;"></div>
        <div id="days-content-area"></div>
    `;
    examDayCounter = 0;
    
    const sortedDates = Object.keys(schedule).sort();
    
    for (const date of sortedDates) {
        const daySlots = schedule[date];
        
        const dayDiv = addExamDayUI();
        const dateInput = dayDiv.querySelector('.exam-date-input');
        
        dateInput.value = date;
        dateInput.dispatchEvent(new Event('change'));

        const slotsContainer = dayDiv.querySelector('.time-slots-container');

        daySlots.forEach(slotData => {
            const slotDiv = addTimeSlotUI(slotsContainer);
            const [startTime, endTime] = slotData.time.split('-');
            
            slotDiv.querySelector('.time-start').value = startTime;
            slotDiv.querySelector('.time-end').value = endTime;
            slotDiv.querySelector('.slot-type-select').value = slotData.type;

            slotData.levels.forEach(levelName => {
                const checkbox = slotDiv.querySelector(`input[value="${levelName}"]`);
                if (checkbox) checkbox.checked = true;
            });
        });
    }

    if (examDayCounter > 0) {
        activateDayTab('exam-day-1');
    }
}