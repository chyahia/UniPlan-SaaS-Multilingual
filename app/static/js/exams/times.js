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

// دالة مساعدة لمعرفة اسم اليوم باللغة المحددة
function getArabicDayName(dateString) {
    if (!dateString) return _t("يوم جديد");
    const date = new Date(dateString);
    if (isNaN(date)) return _t("يوم غير محدد");
    
    // استخدام لغة الصفحة الحالية لتوليد اسم اليوم بشكل ديناميكي
    const currentLang = document.documentElement.lang || 'ar';
    return date.toLocaleDateString(currentLang, { weekday: 'long' });
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
    tabBtn.innerText = _t('يوم جديد');
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
                <label style="font-weight: bold; color: #3f51b5;">${_t('التاريخ:')}</label>
                <input type="date" class="exam-date-input" required style="border: 2px solid #3f51b5; padding: 8px; border-radius: 4px; font-weight:bold;">
            </div>
            <div>
                <button class="duplicate-day-btn" title="${_t('تكرار هذا اليوم مع فتراته')}">🔄</button>
                <button class="remove-day-btn" title="${_t('حذف هذا اليوم')}">&times;</button>
            </div>
        </div>
        <div class="time-slots-container"></div>
        <button class="add-timeslot-button" style="width: 100%; padding: 8px; background-color: #6c757d; color: white; border: none; border-radius: 4px; margin-top: 10px; cursor: pointer;">${_t('+ إضافة فترة زمنية')}</button>
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
// إضافة دالة التزامن (جدار الحماية) عالمياً
window.syncCheckboxesJS = function(changedId, otherId) {
    const changed = document.getElementById(changedId);
    const other = document.getElementById(otherId);
    if (changed && other) {
        if (changed.checked) {
            other.checked = false;
            other.disabled = true;
        } else {
            other.disabled = false;
        }
    }
};

function addTimeSlotUI(container) {
    const slotDiv = document.createElement('div');
    slotDiv.className = 'time-slot'; 
    // ✨ الحل هنا: إجبار الحاوية على أن تكون "عمودية" وتأخذ "العرض كاملاً" لترتيب العناصر فوق بعضها
    slotDiv.style.cssText = 'display: flex; flex-direction: column; width: 100%; border: 1px solid #34495e; margin-bottom: 15px; border-radius: 5px; overflow: hidden; background: #fff; box-sizing: border-box;';
    
    // إنشاء معرّف فريد لهذه الفترة لضمان عمل التزامن (جدار الحماية) بشكل صحيح
    const uniqueId = Math.random().toString(36).substr(2, 9);

    let primaryLevelsHtml = '';
    let reserveLevelsHtml = '';

    availableLevelsForTimes.forEach((level, idx) => {
        const priId = `pri_${uniqueId}_${idx}`;
        const resId = `res_${uniqueId}_${idx}`;

        primaryLevelsHtml += `
            <label style="display:inline-flex; align-items:center; margin-left:10px; margin-bottom:5px; background:#e8f5e9; padding:4px 10px; border-radius:4px; border:1px solid #c8e6c9; cursor:pointer; font-size:14px;">
                <input type="checkbox" class="pri-check" value="${level}" id="${priId}" onchange="syncCheckboxesJS('${priId}', '${resId}')" style="margin-left:5px;"> ${level}
            </label>`;

        reserveLevelsHtml += `
            <label style="display:inline-flex; align-items:center; margin-left:10px; margin-bottom:5px; background:#fff; padding:4px 10px; border-radius:4px; border:1px solid #ffeeba; cursor:pointer; font-size:14px;">
                <input type="checkbox" class="res-check" value="${level}" id="${resId}" onchange="syncCheckboxesJS('${resId}', '${priId}')" style="margin-left:5px;"> ${level}
            </label>`;
    });

    // 1. الشريط العلوي (الأوقات وزر الحذف)
    const headerDiv = document.createElement('div');
    headerDiv.style.cssText = "display: flex; flex-direction: row; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 15px; background: #34495e; padding: 10px 15px; width: 100%; box-sizing: border-box;";
    
    headerDiv.innerHTML = `
        <div style="display: flex; align-items: center; gap: 5px;">
            <span style="color: white; font-weight: bold; white-space: nowrap;">${_t('من:')}</span>
            <input type="time" class="time-start" required value="09:00" style="padding: 6px; border-radius: 4px; border: none; outline: none; width: auto;">
        </div>
        
        <div style="display: flex; align-items: center; gap: 5px;">
            <span style="color: white; font-weight: bold; white-space: nowrap;">${_t('إلى:')}</span>
            <input type="time" class="time-end" required value="10:30" style="padding: 6px; border-radius: 4px; border: none; outline: none; width: auto;">
        </div>
        
        <div style="flex-grow: 1;"></div> 
        
        <button type="button" class="remove-timeslot-btn" title="${_t('حذف الفترة')}" style="background: #e74c3c; color: white; border: none; border-radius: 4px; padding: 6px 15px; cursor: pointer; font-weight: bold; white-space: nowrap; font-size: 14px;">${_t('❌ حذف')}</button>
    `;

    // 2. المحتوى السفلي (المستويات والطي)
    const bodyDiv = document.createElement('div');
    bodyDiv.style.cssText = "padding: 15px; background: #f9f9f9; width: 100%; box-sizing: border-box;";
    
    bodyDiv.innerHTML = `
        <div style="margin-bottom: 15px; padding: 12px; border: 1px solid #c8e6c9; border-radius: 5px; background: #fff;">
            <strong style="color: #2e7d32; display: block; margin-bottom: 10px; font-size: 15px;">${_t('🎯 مستويات معنية كفترة أساسية:')}</strong>
            <div>${primaryLevelsHtml}</div>
        </div>
        
        <details style="padding: 12px; border: 1px solid #ffeeba; border-radius: 5px; background: #fffdf5; cursor: pointer; transition: 0.3s;">
            <summary style="color: #856404; font-weight: bold; outline: none; user-select: none; font-size: 15px;">${_t('🔽 عرض المستويات الاحتياطية (انقر للفتح أو الطي)')}</summary>
            <div style="margin-top: 15px; cursor: default; padding-top: 12px; border-top: 1px dashed #ffeeba;">
                <strong style="color: #856404; display: block; margin-bottom: 10px; font-size: 14px;">${_t('⏳ حدد المستويات الاحتياطية:')}</strong>
                <div>${reserveLevelsHtml}</div>
            </div>
        </details>
    `;

    slotDiv.appendChild(headerDiv);
    slotDiv.appendChild(bodyDiv);
    
    // تفعيل زر الحذف
    headerDiv.querySelector('.remove-timeslot-btn').addEventListener('click', (e) => {
        if(confirm(_t('هل أنت متأكد من حذف هذه الفترة؟'))) {
            e.currentTarget.closest('.time-slot').remove();
        }
    });

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
        
        // نسخ التأشيرات الأساسية
        const sourcePriChecked = Array.from(sourceSlot.querySelectorAll('.pri-check:checked')).map(cb => cb.value);
        Array.from(newSlotDiv.querySelectorAll('.pri-check')).forEach(cb => {
            if (sourcePriChecked.includes(cb.value)) {
                cb.checked = true;
                // تفعيل جدار الحماية للمربع الاحتياطي المقابل
                const resCheckbox = Array.from(newSlotDiv.querySelectorAll('.res-check')).find(rcb => rcb.value === cb.value);
                if (resCheckbox) resCheckbox.disabled = true;
            }
        });

        // نسخ التأشيرات الاحتياطية
        const sourceResChecked = Array.from(sourceSlot.querySelectorAll('.res-check:checked')).map(cb => cb.value);
        Array.from(newSlotDiv.querySelectorAll('.res-check')).forEach(cb => {
            if (sourceResChecked.includes(cb.value)) {
                cb.checked = true;
                // تفعيل جدار الحماية للمربع الأساسي المقابل
                const priCheckbox = Array.from(newSlotDiv.querySelectorAll('.pri-check')).find(pcb => pcb.value === cb.value);
                if (priCheckbox) priCheckbox.disabled = true;
            }
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
            
            // قراءة المجموعتين بدلاً من مجموعة واحدة ونوع واحد
            const primaryLevels = Array.from(slotDiv.querySelectorAll('.pri-check:checked')).map(cb => cb.value);
            const reserveLevels = Array.from(slotDiv.querySelectorAll('.res-check:checked')).map(cb => cb.value);

            if (start && end && (primaryLevels.length > 0 || reserveLevels.length > 0)) {
                examSchedule[date].push({ 
                    time: `${start}-${end}`, 
                    primary_levels: primaryLevels,
                    reserve_levels: reserveLevels
                });
            }
        });
    });

    if (hasErrors) {
        return showNotification(_t('يوجد أيام بدون تاريخ! يرجى تحديد التاريخ لكل يوم.'), 'error');
    }

    if (Object.keys(examSchedule).length === 0) {
        return showNotification(_t('لا يوجد بيانات لحفظها. أضف يوماً وفترة واحدة ومستوى واحداً على الأقل.'), 'error');
    }

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

            // التوافقية العكسية: دعم الجداول القديمة (التي كانت تحتوي على type و levels)
            const priList = slotData.primary_levels || (slotData.type === 'primary' ? slotData.levels : []);
            const resList = slotData.reserve_levels || (slotData.type === 'reserve' ? slotData.levels : []);

            priList.forEach(levelName => {
                const checkbox = Array.from(slotDiv.querySelectorAll('.pri-check')).find(cb => cb.value === levelName);
                if (checkbox) {
                    checkbox.checked = true;
                    const resCheckbox = Array.from(slotDiv.querySelectorAll('.res-check')).find(cb => cb.value === levelName);
                    if (resCheckbox) resCheckbox.disabled = true; // تفعيل جدار الحماية فوراً
                }
            });

            resList.forEach(levelName => {
                const checkbox = Array.from(slotDiv.querySelectorAll('.res-check')).find(cb => cb.value === levelName);
                if (checkbox) {
                    checkbox.checked = true;
                    const priCheckbox = Array.from(slotDiv.querySelectorAll('.pri-check')).find(cb => cb.value === levelName);
                    if (priCheckbox) priCheckbox.disabled = true; // تفعيل جدار الحماية فوراً
                }
            });
        });
    }

    if (examDayCounter > 0) {
        activateDayTab('exam-day-1');
    }
}