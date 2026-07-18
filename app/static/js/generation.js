let currentGenerationData = null; // لتخزين البيانات عند انتهاء الخوارزمية لاستخدامها في التصدير
let eventSource = null;

// (جزء من app/static/js/generation.js)

// --- دالة مساعدة لتحديد لون شريط التقدم بناءً على النسبة ---
function getProgressBarColor(percentage) {
    percentage = parseInt(percentage);
    if (percentage < 40) {
        return '#e74c3c'; // أحمر (10-30%)
    } else if (percentage < 70) {
        return '#e67e22'; // برتقالي (40-60%)
    } else {
        return '#27ae60'; // أخضر (70-100%)
    }
}

// --- الدالة المعدلة بالكامل لـ startGeneration ---
function startGeneration() {
    const selectedAlgorithms = Array.from(document.querySelectorAll('.algo-chk:checked')).map(cb => cb.value);
    const strictHierarchy = document.getElementById('strict-hierarchy-chk')?.checked || false;
    const algoSettings = {
        lns_iterations: document.getElementById('lns_iter').value,
        lns_ruin_factor: document.getElementById('lns_ruin').value,
        lns_stagnation_threshold: document.getElementById('lns_stagnation')?.value || 15,
        vns_iterations: document.getElementById('vns_iter').value,
        vns_k_max: document.getElementById('vns_k').value,
        vns_stagnation_threshold: document.getElementById('vns_stagnation')?.value || 15,
        // ✨ الإضافة الجديدة
        mutation_hard_intensity: parseInt(document.getElementById('mutation_hard_intensity')?.value) || 4,
        mutation_soft_probability: parseFloat(document.getElementById('mutation_soft_probability')?.value) || 0.5
    };

    if (selectedAlgorithms.length === 0) {
        alert("يرجى اختيار خوارزمية مساعدة واحدة على الأقل!");
        return;
    }

    const btnStart = document.getElementById('btn-start-gen');
    const btnStop = document.getElementById('btn-stop-gen');
    const forceMutBtn = document.getElementById('btn-force-mutation');
    if (forceMutBtn) forceMutBtn.style.display = 'inline-block';
    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    
    // --- تصفير شريط التقدم وإخفائه عند بدء محاولة جديدة مع لون أولي أحمر ---
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    if (progressContainer && progressBar) {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = getProgressBarColor(0); // تطبيق اللون الأولي
        progressBar.textContent = '0%';
    }

    // تجهيز الواجهة للبدء
    btnStart.style.display = 'none';
    btnStop.style.display = 'block';
    btnStop.innerText = '🛑 إيقاف البحث';
    btnStop.disabled = false;
    resultsContainer.style.display = 'none';
    
    logContainer.style.display = 'block';
    initLiveChart();
    logOutput.textContent = 'بدء الاتصال بالخادم وإرسال البيانات...\n';

    // طلب بدء الخوارزمية
    fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            strict_hierarchy: strictHierarchy,
            algorithms: selectedAlgorithms,
            settings: algoSettings
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success || data.status === 'ok') {
            logOutput.textContent += 'تم بدء العملية. جاري استقبال المتابعة الحية...\n';
            
            // فتح قناة استقبال السجل الحي (Server-Sent Events)
            eventSource = new EventSource('/stream-logs');
            
            eventSource.onmessage = function(event) {
                const message = event.data;
                
                // الكلمة المفتاحية "DONE" تعني انتهاء الخوارزمية
                if (message.startsWith("DONE")) {
                    eventSource.close();
                    const jsonData = message.substring(4);
                    
                    if (jsonData.trim().length > 0) {
                        try {
                            const parsedData = JSON.parse(jsonData);
                            currentGenerationData = parsedData; // تخزين البيانات لأزرار التصدير
                            
                            logOutput.textContent += '\n--- اكتملت عملية الجدولة بنجاح! ---\n';
                            
                            // --- حساب النسبة النهائي (مطابق تماماً لمنطق البايثون الذكي) ---
                            const finalFailures = parsedData.final_failures || [];
                            let hardErrorsCount = 0;
                            let softErrorsCount = 0;
                            
                            // فرز الأخطاء لمعرفة الصارم من المرن
                            finalFailures.forEach(f => {
                                const penalty = f.penalty !== undefined ? f.penalty : 1;
                                if (penalty >= 100) {
                                    hardErrorsCount++;
                                } else {
                                    softErrorsCount++;
                                }
                            });
                            
                            let finalPercentage = 0;
                            
                            // تطبيق نفس منطق البايثون:
                            // 1. إذا كان هناك أخطاء صارمة، التقدم هو 0 (أو 5% ليبقى الشريط ظاهراً)
                            if (hardErrorsCount > 0) {
                                finalPercentage = 5; 
                            } else {
                                // 2. إذا بقيت أخطاء مرنة فقط، نحسبها (كل خطأ يخصم 10%)
                                finalPercentage = Math.max(0, ((10 - softErrorsCount) / 10) * 100);
                                finalPercentage = Math.max(5, finalPercentage); // حد أدنى 5%
                            }

                            // تحديث الشريط باللون والنسبة الواقعية
                            if (progressContainer && progressBar) {
                                progressBar.style.width = finalPercentage + '%';
                                progressBar.style.backgroundColor = getProgressBarColor(finalPercentage);
                                
                                let errorText = "";
                                if (hardErrorsCount > 0) {
                                    errorText = ` (باقي ${hardErrorsCount} صارم و ${softErrorsCount} مرن)`;
                                } else if (softErrorsCount > 0) {
                                    errorText = ` (باقي ${softErrorsCount} مرن)`;
                                }
                                
                                progressBar.textContent = finalPercentage + '%' + errorText;
                            }
                            // ----------------------------------------------------------------
                            // ----------------------------------------------------------------------
                            
                            // إعادة الواجهة لحالة الانتهاء
                            btnStop.style.display = 'none';
                            btnStart.style.display = 'block';
                            btnStart.innerText = '🔄 إعادة الجدولة مرة أخرى';
                            const forceMutBtn = document.getElementById('btn-force-mutation');
                            if (forceMutBtn) forceMutBtn.style.display = 'none';
                            
                            // إظهار النتائج وأزرار التصدير ورسم جداول المستويات
                            resultsContainer.style.display = 'block';
                            renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                            
                        } catch(e) {
                            console.error("Error parsing DONE JSON:", e);
                            logOutput.textContent += '\nحدث خطأ أثناء قراءة النتيجة النهائية.\n';
                        }
                    }
                } 
                // --- إضافة: التقاط شريط التقدم وتحديث اللون ديناميكياً هنا ---
                else if (message.includes("PROGRESS:")) {
                    if (progressContainer && progressBar) {
                        let percentage = message.replace("PROGRESS:", "").trim();
                        progressContainer.style.display = 'block';
                        progressBar.style.width = percentage + '%';
                        progressBar.style.backgroundColor = getProgressBarColor(percentage); // تحديث اللون ديناميكياً
                        progressBar.textContent = percentage + '%';
                    }
                } 
                // ✨ الإضافة الجديدة: التقاط بيانات المخطط البياني وإرسالها للرسم ✨
                else if (message.startsWith("CHART_DATA:")) {
                    try {
                        const chartJson = message.replace("CHART_DATA:", "");
                        const parsedData = JSON.parse(chartJson);
                        updateLiveChart(parsedData.labels, parsedData.data);
                    } catch(e) {
                        console.error("خطأ في قراءة بيانات المخطط:", e);
                    }
                }
                // ------------------------------------
                else {
                    // طباعة الرسالة الحية في الشاشة السوداء إذا لم تكن DONE أو PROGRESS أو CHART_DATA
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight; // التمرير التلقائي للأسفل
                }
            };
            
            eventSource.onerror = function() {
                logOutput.textContent += '\n--- انقطع الاتصال بالخادم (قد تكون العملية انتهت أو توقفت). ---\n';
                eventSource.close();
                btnStop.style.display = 'none';
                btnStart.style.display = 'block';
                btnStart.innerText = '🔄 بدء محاولة جديدة';
            };
            
        } else {
            alert("حدث خطأ في بدء الخوارزمية:\n" + data.error);
            btnStop.style.display = 'none';
            btnStart.style.display = 'block';
        }
    }).catch(err => {
        console.error("Error:", err);
        alert("حدث خطأ في الاتصال بالخادم.");
        btnStop.style.display = 'none';
        btnStart.style.display = 'block';
    });
}
function stopGeneration() {
    if(confirm("هل أنت متأكد من إيقاف الخوارزمية؟ قد لا يتم حفظ النتائج الحالية.")) {
        fetch('/api/stop-generation', { method: 'POST' });
        const btnStop = document.getElementById('btn-stop-gen');
        btnStop.textContent = '⏳ جاري الإيقاف، يرجى الانتظار...';
        btnStop.disabled = true;
        const forceMutBtn = document.getElementById('btn-force-mutation');
        if (forceMutBtn) forceMutBtn.style.display = 'none';
    }
}

// دالة رسم جداول المستويات (مجهزة بمحرك النقر والتبديل التفاعلي)
function renderLevelSchedules(scheduleData, days, slots) {
    const outputDiv = document.getElementById('rendered-tables');
    outputDiv.innerHTML = ''; 

    if (!scheduleData || Object.keys(scheduleData).length === 0) {
        outputDiv.innerHTML = '<h3 style="text-align:center;">لم يتم إنشاء أي جداول أو البيانات فارغة.</h3>';
        return;
    }

    const sortedLevels = Object.keys(scheduleData).sort();
    
    for (const level of sortedLevels) {
        const grid = scheduleData[level];
        if (grid.length === 0) continue; 

        const container = document.createElement('div');
        container.style.marginBottom = '30px';
        container.style.border = '1px solid #34495e';
        container.style.borderRadius = '5px';
        container.style.overflow = 'hidden';

        const title = document.createElement('h3');
        title.style.backgroundColor = '#34495e';
        title.style.color = 'white';
        title.style.margin = '0';
        title.style.padding = '10px';
        title.textContent = "جدول: " + level;
        container.appendChild(title);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.textAlign = 'center';

        // رأس الجدول (الأيام)
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.innerHTML = '<th style="padding:10px; background:#ecf0f1; border:1px solid #ccc;">الوقت</th>';
        days.forEach(day => headerRow.innerHTML += `<th style="padding:10px; background:#ecf0f1; border:1px solid #ccc;">${day}</th>`);

        // محتوى الجدول (الفترات والمواد)
        const tbody = table.createTBody();
        slots.forEach((slot, slotIdx) => {
            const row = tbody.insertRow();
            row.insertCell().innerHTML = `<strong style="display:block; padding:10px; border:1px solid #ccc; background:#fafafa;">${slot}</strong>`;
            
            days.forEach((day, dayIdx) => {
                const cell = row.insertCell();
                cell.style.border = '1px solid #ccc';
                cell.style.padding = '8px';
                cell.style.verticalAlign = 'top';
                
                const lecturesInCell = grid[dayIdx] ? grid[dayIdx][slotIdx] : [];
                if (lecturesInCell && lecturesInCell.length > 0) {
                    // رسم المواد الموجودة
                    let cellHTML = lecturesInCell.map((lec, lecIdx) => `
                        <div onclick="handleLectureClick('${level}', ${dayIdx}, ${slotIdx}, ${lecIdx}, '${lec.teacher_name || ''}', this)" 
                             style="background:#e8f4f8; border:1px solid #3498db; border-radius:4px; padding:8px; margin-bottom:5px; font-size:13px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); cursor:pointer; transition:0.2s;">
                            <strong style="color:#2980b9;">${lec.name}</strong><br>
                            <span style="color:#2c3e50;">${lec.teacher_name}</span><br>
                            <small style="color:#e67e22; font-weight:bold;">${lec.room || 'بدون قاعة'}</small>
                        </div>
                    `).join('');
                    
                    // التعديل الجديد: إضافة منطقة فارغة "مخفية الأطراف" للنقر والإضافة بجوار المواد الحالية
                    cellHTML += `
                        <div onclick="handleLectureClick('${level}', ${dayIdx}, ${slotIdx}, null, null, this)" 
                             style="margin-top: 5px; padding: 5px; border: 1px dashed #bdc3c7; border-radius: 4px; font-size: 11px; color: #7f8c8d; cursor: pointer; text-align: center; transition: 0.2s;"
                             onmouseover="this.style.background='#ecf0f1'" onmouseout="this.style.background='transparent'">
                            ➕ نقل إلى هنا
                        </div>
                    `;
                    cell.innerHTML = cellHTML;
                } else {
                    // الخلية فارغة تماماً
                    cell.innerHTML = `
                        <div onclick="handleLectureClick('${level}', ${dayIdx}, ${slotIdx}, null, null, this)" 
                             style="height:100%; min-height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer; border-radius:4px; transition:0.2s;">
                            <span style="color:#bdc3c7;">-</span>
                        </div>
                    `;
                }
            });
        });
        
        container.appendChild(table);
        outputDiv.appendChild(container);
    }
}

// ================= أزرار التصدير (نفس المسارات التي في app.py) =================

function exportFiles(url, fileName, isProfessor = false, isFreeRoom = false) {
    if (!currentGenerationData) { alert('لا توجد بيانات مصدرة. يرجى توليد الجدول أولاً.'); return; }
    
    // تحديد البيانات المطلوبة بناءً على نوع التصدير
    let scheduleToSend = currentGenerationData.schedule;
    if (isProfessor) scheduleToSend = currentGenerationData.prof_schedules;
    if (isFreeRoom) scheduleToSend = currentGenerationData.free_rooms;

    const payload = {
        schedule: scheduleToSend,
        days: currentGenerationData.days,
        slots: currentGenerationData.slots
    };

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.blob())
    .then(blob => triggerDownload(blob, fileName))
    .catch(err => alert("خطأ في التصدير: " + err));
}

function exportPedagogicalLoad() {
    // العبء البيداغوجي يستخدم مسار GET لأنه يقرأ من قاعدة البيانات مباشرة (كما في مشروعك)
    fetch('/api/export/teaching-load')
    .then(res => res.blob())
    .then(blob => triggerDownload(blob, 'العبء_البيداغوجي.xlsx'))
    .catch(err => alert("خطأ في تصدير العبء البيداغوجي: " + err));
}

function exportComprehensiveList() {
    if (!currentGenerationData || !currentGenerationData.schedule) { 
        alert('لا توجد بيانات مصدرة. يرجى توليد الجدول أولاً.'); 
        return; 
    }
    
    const payload = {
        schedule: currentGenerationData.schedule,
        days: currentGenerationData.days,
        slots: currentGenerationData.slots
    };

    fetch('/api/export/comprehensive-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.blob())
    .then(blob => triggerDownload(blob, 'القائمة_الشاملة_للجداول.xlsx'))
    .catch(err => alert("خطأ في تصدير القائمة الشاملة: " + err));
}

// دالة مساعدة لعملية تنزيل الملف فعلياً في المتصفح
function triggerDownload(blob, fileName) {
    const downloadUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(downloadUrl);
    document.body.removeChild(a);
}

// ==========================================
// دوال حفظ واستعادة الجداول (الذاكرة المحلية)
// ==========================================

function saveResult(slotNumber) {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert("لا توجد نتيجة حالية لحفظها! يرجى توليد جدول أولاً.");
        return;
    }
    
    // تحويل الجدول إلى نص وحفظه في ذاكرة المتصفح
    localStorage.setItem('savedSchedule_' + slotNumber, JSON.stringify(currentGenerationData));
    alert("✅ تم حفظ النتيجة الحالية في [الذاكرة رقم " + slotNumber + "] بنجاح!");
    
    // إظهار زر الاستعادة المقابل
    document.getElementById('btn-restore-' + slotNumber).style.display = 'inline-block';
}

function restoreResult(slotNumber) {
    const savedData = localStorage.getItem('savedSchedule_' + slotNumber);
    if (savedData) {
        // استرجاع البيانات وتحويلها لجدول في الذاكرة الحية
        currentGenerationData = JSON.parse(savedData);
        
        // ✨ الإضافة الضرورية: إظهار حاوية الجداول وأزرار التصدير المخفية
        const resultsContainer = document.getElementById('schedule-results-container');
        if (resultsContainer) {
            resultsContainer.style.display = 'block';
        }

        // إعادة رسم الجداول على الشاشة
        renderLevelSchedules(currentGenerationData.schedule, currentGenerationData.days, currentGenerationData.slots);
        alert("📂 تمت استعادة [النتيجة رقم " + slotNumber + "] بنجاح! يمكنك الآن مراجعتها أو تصديرها.");
    } else {
        alert("لا توجد نتيجة محفوظة في هذه الذاكرة.");
    }
}

// فحص عند تحميل الصفحة: إذا كان هناك جداول محفوظة مسبقاً، أظهر أزرار الاستعادة
document.addEventListener('DOMContentLoaded', function() {
    if (localStorage.getItem('savedSchedule_1')) {
        const btn1 = document.getElementById('btn-restore-1');
        if(btn1) btn1.style.display = 'inline-block';
    }
    if (localStorage.getItem('savedSchedule_2')) {
        const btn2 = document.getElementById('btn-restore-2');
        if(btn2) btn2.style.display = 'inline-block';
    }
});

// ==========================================
// دالة تشغيل التحسين والضغط
// ==========================================
function refineSchedule() {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert("يرجى توليد جدول أولاً قبل محاولة تحسينه!");
        return;
    }

    // ✨ 1. جلب مستوى التحسين من أزرار الراديو (Radio Buttons) في واجهتك
    const levelRadio = document.querySelector('input[name="opt_level"]:checked');
    const selectedLevel = levelRadio ? levelRadio.value : 'balanced';

    // ✨ 2. جلب الأساتذة المحددين من الحاوية الخاصة بهم
    // نبحث عن كل مربع اختيار تم تأشيره داخل الحاوية optimization-teachers
    const teacherCheckboxes = document.querySelectorAll('#optimization-teachers input[type="checkbox"]:checked');
    const selectedTeachers = Array.from(teacherCheckboxes).map(cb => cb.value);

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnRefine = document.getElementById('btn-refine');
    
    // إخفاء النتائج وإظهار الشاشة السوداء
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    
    
   // ترجمة اسم المستوى للغة العربية لطباعته في الشاشة السوداء
    let levelNameAr = selectedLevel === 'simple_restricted' ? 'بسيط (مقيد)' : (selectedLevel === 'simple' ? 'بسيط (مفتوح)' : (selectedLevel === 'deep' ? 'عميق (تفريغ المساء)' : (selectedLevel === 'deep_balance' ? 'عميق (موازنة العبء)' : 'متوازن')));
    let teachersText = selectedTeachers.length > 0 ? `لعدد ${selectedTeachers.length} أساتذة` : 'لجميع الأساتذة';
    
    logOutput.textContent = `🚀 جاري الاتصال بالخادم لضغط وتحسين أوقات الأساتذة...\n`;
    logOutput.textContent += `⚙️ المستوى: [${levelNameAr}] | النطاق: [${teachersText}]\n\n`;
    
    // إيقاف الزر مؤقتاً
    btnRefine.disabled = true;
    btnRefine.innerText = '⏳ جاري التحسين...';

    fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            schedule: currentGenerationData.schedule,
            level: selectedLevel,       // ✨ إرسال المستوى المختار
            teachers: selectedTeachers  // ✨ إرسال الأساتذة المحددين
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const refineEventSource = new EventSource('/stream-logs');
            
            refineEventSource.onmessage = function(event) {
                const message = event.data;
                
                if (message.startsWith("DONE")) {
                    refineEventSource.close();
                    const jsonData = message.substring(4);
                    
                    try {
                        const parsedData = JSON.parse(jsonData);
                        currentGenerationData = parsedData; 
                        
                        logOutput.textContent += '\n--- ✨ اكتملت عملية التحسين وسد الفجوات بنجاح! ---\n';
                        
                        btnRefine.disabled = false;
                        btnRefine.innerText = '✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)';
                        resultsContainer.style.display = 'block';
                        
                        currentGenerationData = parsedData; // حفظ البيانات للنشر
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert("✨ تم ضغط الجداول بنجاح! يمكنك الآن مراجعتها أو تصديرها.");
                        
                        // إضافة أزرار النشر ديناميكياً أعلى الجداول
                        let pubDiv = document.getElementById('publish-actions');
                        if(!pubDiv) {
                            pubDiv = document.createElement('div');
                            pubDiv.id = 'publish-actions';
                            pubDiv.style = 'margin-bottom: 25px; padding: 20px; background: #fffdf5; border: 2px solid #f39c12; border-radius: 8px; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);';
                            resultsContainer.parentNode.insertBefore(pubDiv, resultsContainer);
                        }
                        pubDiv.innerHTML = `
                            <h3 style="margin-top: 0; color: #d35400;">🚀 الخطوة الختامية: المراجعة والنشر</h3>
                            <p style="font-size: 14px; color: #7f8c8d; margin-bottom: 15px;">يمكنك تعديل الجداول برمجياً، أو تصديرها للإكسل وتعديلها خارجياً، ثم العودة لنشرها.</p>
                            
                            <div style="background: white; padding: 15px; border-radius: 6px; display: inline-block; border: 1px solid #ddd; margin-bottom: 15px;">
                                <button onclick="exportToExcel()" style="background: #207245; color: white; padding: 10px 15px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px; margin-left: 10px;">⬇️ تصدير الجداول (Excel)</button>
                                
                                <input type="file" id="excel-upload" accept=".xlsx" style="display: none;" onchange="importFromExcel(this)">
                                <button onclick="document.getElementById('excel-upload').click()" style="background: #f1c40f; color: #2c3e50; padding: 10px 15px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px;">⬆️ استيراد الجداول المعدلة</button>
                            </div>
                            <br>

                            <button id="btn-edit-mode" onclick="toggleEditMode()" style="background: #f39c12; color: white; padding: 12px 25px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px; margin-left: 10px; transition: 0.3s;">✏️ تفعيل التعديل التفاعلي</button>
                            <button id="btn-publish" onclick="publishSchedule()" style="background: #27ae60; color: white; padding: 12px 25px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px; margin-left: 10px; transition: 0.3s;">✅ إرسال الجداول للأساتذة</button>
                            <button onclick="unpublishSchedule()" style="background: #95a5a6; color: white; padding: 12px 25px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px;">🚫 سحب وإخفاء</button>
                        `;
                        
                    } catch(e) {
                        console.error("Error parsing DONE JSON:", e);
                    }
                // ✨ الإضافة: التقاط بيانات الرسم البياني أثناء التحسين وإخفائها من الشاشة السوداء
                } else if (message.startsWith("CHART_DATA:")) {
                    try {
                        const chartJson = message.replace("CHART_DATA:", "");
                        const parsedData = JSON.parse(chartJson);
                        updateLiveChart(parsedData.labels, parsedData.data);
                    } catch(e) {
                        console.error("خطأ في قراءة بيانات المخطط:", e);
                    }
                } else if (!message.includes("PROGRESS:")) {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight;
                }
            };
            
            refineEventSource.onerror = function() {
                refineEventSource.close();
                btnRefine.disabled = false;
                btnRefine.innerText = '✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)';
                
                // ✨ السطر المنقذ: إعادة إظهار الجداول إذا انقطع الاتصال
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert("حدث خطأ: " + data.error);
            btnRefine.disabled = false;
            btnRefine.innerText = '✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)';
            resultsContainer.style.display = 'block'; // ✨ الإضافة هنا أيضاً
        }
    })
    .catch(err => {
        console.error("Error:", err);
        alert("حدث خطأ في الاتصال.");
        btnRefine.disabled = false;
        btnRefine.innerText = '✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)';
        resultsContainer.style.display = 'block'; // ✨ والإضافة هنا أيضاً
    });
}

// ==========================================
// 🟢 دالة تفعيل الدومينو (صناعة الحصص اليتيمة)
// ==========================================
function activateDominoSchedules() {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert("يرجى توليد جدول أولاً!"); return;
    }
    
    if (!confirm("هل أنت متأكد أنك تريد تفعيل الدومينو (صناعة حصص يتيمة) للأساتذة المؤشر عليهم؟")) return;

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnActivate = document.getElementById('btn-activate-domino');
    
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    logOutput.textContent = `🟢 جاري الاتصال بالخادم لتفعيل الدومينو (صناعة الحصص اليتيمة)...\n`;
    
    btnActivate.disabled = true;
    btnActivate.innerText = '⏳ جاري التفعيل...';

    fetch('/api/activate_domino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: currentGenerationData.schedule })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message) {
            const refineEventSource = new EventSource('/stream-logs');
            refineEventSource.onmessage = function(event) {
                const message = event.data;
                if (message.startsWith("DONE")) {
                    refineEventSource.close();
                    const jsonData = message.substring(4);
                    try {
                        const parsedData = JSON.parse(jsonData);
                        currentGenerationData.schedule = parsedData.schedule;
                        currentGenerationData.prof_schedules = parsedData.prof_schedules;
                        currentGenerationData.free_rooms = parsedData.free_rooms; 
                        logOutput.textContent += '\n--- 🟢 نجحت عملية صناعة الحصص اليتيمة! ---\n';
                        btnActivate.disabled = false;
                        btnActivate.innerText = '🟢 تفعيل الدومينو';
                        resultsContainer.style.display = 'block';
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert("🟢 تم تفعيل مسار الدومينو وصناعة الحصص اليتيمة بنجاح!");
                    } catch(e) { console.error(e); }
                } else if (!message.includes("PROGRESS:") && !message.startsWith("CHART_DATA:")) {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight;
                }
            };
            refineEventSource.onerror = function() {
                refineEventSource.close();
                btnActivate.disabled = false;
                btnActivate.innerText = '🟢 تفعيل الدومينو';
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert("حدث خطأ: " + data.error);
            btnActivate.disabled = false;
            btnActivate.innerText = '🟢 تفعيل الدومينو';
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        alert("حدث خطأ في الاتصال.");
        btnActivate.disabled = false;
        btnActivate.innerText = '🟢 تفعيل الدومينو';
        resultsContainer.style.display = 'block';
    });
}

// ==========================================
// 🔵 دالة تجميع الدومينو (ضغط الجداول)
// ==========================================
function compressDominoSchedules() {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert("يرجى توليد جدول أولاً!"); return;
    }
    
    if (!confirm("هل أنت متأكد من تجميع الدومينو وضغط جداول الأساتذة العالقين؟")) return;

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnCompress = document.getElementById('btn-compress-domino');
    
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    logOutput.textContent = `🔵 جاري الاتصال بالخادم وتجميع مسارات الدومينو لضغط الجداول...\n`;
    
    btnCompress.disabled = true;
    btnCompress.innerText = '⏳ جاري التجميع...';

    fetch('/api/compress_domino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schedule: currentGenerationData.schedule })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message) {
            const refineEventSource = new EventSource('/stream-logs');
            refineEventSource.onmessage = function(event) {
                const message = event.data;
                if (message.startsWith("DONE")) {
                    refineEventSource.close();
                    const jsonData = message.substring(4);
                    try {
                        const parsedData = JSON.parse(jsonData);
                        currentGenerationData.schedule = parsedData.schedule;
                        currentGenerationData.prof_schedules = parsedData.prof_schedules;
                        currentGenerationData.free_rooms = parsedData.free_rooms; 
                        logOutput.textContent += '\n--- 🔵 نجحت عملية تجميع مسارات الدومينو! ---\n';
                        btnCompress.disabled = false;
                        btnCompress.innerText = '🔵 تجميع الدومينو';
                        resultsContainer.style.display = 'block';
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert("🔵 تم تجميع الحصص اليتيمة وضغط الجداول بنجاح!");
                    } catch(e) { console.error(e); }
                } else if (!message.includes("PROGRESS:") && !message.startsWith("CHART_DATA:")) {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight;
                }
            };
            refineEventSource.onerror = function() {
                refineEventSource.close();
                btnCompress.disabled = false;
                btnCompress.innerText = '🔵 تجميع الدومينو';
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert("حدث خطأ: " + data.error);
            btnCompress.disabled = false;
            btnCompress.innerText = '🔵 تجميع الدومينو';
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        alert("حدث خطأ في الاتصال.");
        btnCompress.disabled = false;
        btnCompress.innerText = '🔵 تجميع الدومينو';
        resultsContainer.style.display = 'block';
    });
}

// ==========================================
// 🎲 دالة فتح وإغلاق شريط الدومينو المنزلق
// ==========================================
function toggleDominoSlider() {
    const slider = document.getElementById('domino-actions-wrapper');
    slider.classList.toggle('open');
}

// ==========================================
// 🎯 دوال أداة التدخل الجراحي
// ==========================================
function toggleSurgicalSlider() {
    const slider = document.getElementById('surgical-actions-wrapper');
    slider.classList.toggle('open');
    
    // جلب الأساتذة للقائمة المنسدلة تلقائياً في حال كانت فارغة
    const select = document.getElementById('surgical-teacher-select');
    if (select.options.length <= 1) {
        fetch('/teachers')
            .then(res => res.json())
            .then(data => {
                data.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.name;
                    opt.textContent = t.name;
                    select.appendChild(opt);
                });
            })
            .catch(err => console.error("Error fetching teachers:", err));
    }
}

function executeSurgicalStrike() {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert("يرجى توليد جدول أولاً!"); return;
    }
    const teacherName = document.getElementById('surgical-teacher-select').value;
    const maxVictims = document.getElementById('surgical-max-victims').value;
    
    if (!teacherName) {
        alert("الرجاء اختيار الأستاذ الهدف من القائمة المنسدلة."); return;
    }
    
    if (!confirm(`هل أنت متأكد من تنفيذ العملية الجراحية لرفع حصص الأستاذ [${teacherName}] نحو الصباح؟\n(ملاحظة: سيتم إزاحة أساتذة آخرين كضحايا بحد أقصى ${maxVictims}).`)) return;

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnExecute = document.getElementById('btn-execute-surgical');
    
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    logOutput.textContent = `🎯 جاري الاتصال بالخادم لتنفيذ التدخل الجراحي للأستاذ: [${teacherName}]...\n`;
    
    btnExecute.disabled = true;
    btnExecute.innerText = '⏳ ...';

    // نستخدم نفس المسار القوي الخاص بالتحسين (API/Refine)
    fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            schedule: currentGenerationData.schedule,
            level: 'deep_surgical',
            teachers: [teacherName], 
            max_victims: parseInt(maxVictims)
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const sseSource = new EventSource('/stream-logs');
            sseSource.onmessage = function(event) {
                const message = event.data;
                if (message.startsWith("DONE")) {
                    sseSource.close();
                    const jsonData = message.substring(4);
                    try {
                        const parsedData = JSON.parse(jsonData);
                        currentGenerationData = parsedData; 
                        logOutput.textContent += '\n--- 🎯 انتهت العملية الجراحية! ---\n';
                        btnExecute.disabled = false;
                        btnExecute.innerText = '🚀 تنفيذ';
                        resultsContainer.style.display = 'block';
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert("🎯 تمت العملية الجراحية، ويمكنك معاينة الجدول المحدث!");
                    } catch(e) { console.error(e); }
                } else if (!message.includes("PROGRESS:") && !message.startsWith("CHART_DATA:")) {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight;
                } else if (message.startsWith("CHART_DATA:")) {
                    try {
                        const chartJson = message.replace("CHART_DATA:", "");
                        const parsedData = JSON.parse(chartJson);
                        updateLiveChart(parsedData.labels, parsedData.data);
                    } catch(e) {}
                }
            };
            sseSource.onerror = function() {
                sseSource.close();
                btnExecute.disabled = false;
                btnExecute.innerText = '🚀 تنفيذ';
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert("حدث خطأ: " + data.error);
            btnExecute.disabled = false;
            btnExecute.innerText = '🚀 تنفيذ';
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        alert("حدث خطأ في الاتصال بالخادم.");
        btnExecute.disabled = false;
        btnExecute.innerText = '🚀 تنفيذ';
        resultsContainer.style.display = 'block';
    });
}


// ==================== محرك التعديل اليدوي الذكي (Interactive Swapping) ====================
let isEditMode = false;
let selectedLecture = null; 

// 1. تفعيل / إيقاف وضع التعديل
function toggleEditMode() {
    isEditMode = !isEditMode;
    const btn = document.getElementById('btn-edit-mode');
    const container = document.getElementById('results-container');
    
    if(isEditMode) {
        btn.style.background = '#e74c3c';
        btn.innerHTML = '🔴 إغلاق وضع التعديل';
        container.style.border = '3px dashed #f39c12';
        container.style.padding = '10px';
        alert("✨ تم تفعيل الوضع اليدوي!\\n1. انقر على أي مادة لتحديدها.\\n2. انقر على مادة أخرى (أو فراغ) ليتبادلا الأماكن فوراً.");
    } else {
        btn.style.background = '#f39c12';
        btn.innerHTML = '✏️ تفعيل التعديل اليدوي';
        container.style.border = 'none';
        container.style.padding = '0';
        clearSelection();
    }
}

// 2. إلغاء التحديد الحالي
function clearSelection() {
    if(selectedLecture && selectedLecture.element) {
        selectedLecture.element.style.boxShadow = 'none';
        selectedLecture.element.style.transform = 'scale(1)';
        selectedLecture.element.style.border = '1px solid #bdc3c7';
    }
    selectedLecture = null;
}

// دالة مساعدة ذكية للتمييز بين القاعات الكبيرة والصغيرة
function isLargeRoom(roomName) {
    if (!roomName) return false;
    // يعتبرها قاعة كبيرة إذا كان اسمها يحتوي على إحدى هذه الكلمات
    return roomName.includes('مدرج') || roomName.includes('كبرى') || roomName.includes('كبير');
}

// 3. معالجة النقر على الحصص (المحرك الذكي)
function handleLectureClick(level, dayIndex, slotIndex, lecIndex, teacherName, element) {
    if(!isEditMode) return;

    if(!selectedLecture) {
        if(lecIndex === null) return; 
        selectedLecture = { level, dayIndex, slotIndex, lecIndex, teacherName, element };
        element.style.boxShadow = '0 0 15px #e67e22';
        element.style.transform = 'scale(1.05)';
        element.style.border = '2px solid #e67e22';
        element.style.transition = '0.2s';
        return;
    }

    if(selectedLecture.level === level && selectedLecture.dayIndex === dayIndex && selectedLecture.slotIndex === slotIndex && selectedLecture.lecIndex === lecIndex) {
        clearSelection();
        return;
    }

    // --- بدء عملية التبديل ---
    const source = selectedLecture;
    const target = { level, dayIndex, slotIndex, lecIndex, teacherName };

    // 1. فحص تعارض الأساتذة
    if(isTeacherBusy(source.teacherName, target.dayIndex, target.slotIndex, source.level)) {
        alert(`❌ تعارض: الأستاذ (${source.teacherName}) يدرّس مستوى آخر في هذا التوقيت!`);
        clearSelection(); return;
    }
    if(target.teacherName && isTeacherBusy(target.teacherName, source.dayIndex, source.slotIndex, target.level)) {
        alert(`❌ تعارض: الأستاذ (${target.teacherName}) يدرّس مستوى آخر في التوقيت الأول!`);
        clearSelection(); return;
    }

    const sched = currentGenerationData.schedule;
    const freeRooms = currentGenerationData.free_rooms;
    
    let sourceLec = sched[source.level][source.dayIndex][source.slotIndex][source.lecIndex];
    let targetLec = target.lecIndex !== null ? sched[target.level][target.dayIndex][target.slotIndex][target.lecIndex] : null;

    // 2. فحص سعة القاعات (كبيرة / صغيرة)
    const sourceNeedsLarge = isLargeRoom(sourceLec.room);

    if (targetLec) {
        // حالة: تبديل مادة بمادة أخرى
        const isTargetLarge = isLargeRoom(targetLec.room);
        if (sourceNeedsLarge !== isTargetLarge) {
            alert("❌ عملية مرفوضة: لا يمكن التبديل بين قاعة كبيرة وقاعة صغيرة لاختلاف سعة الاستيعاب!");
            clearSelection(); return;
        }
        
        const tempRoom = sourceLec.room;
        sourceLec.room = targetLec.room;
        targetLec.room = tempRoom;
    } 
    else {
        // حالة: النقل إلى فترة فارغة (أو النقر على "نقل إلى هنا")
        if (!freeRooms[target.dayIndex][target.slotIndex] || freeRooms[target.dayIndex][target.slotIndex].length === 0) {
            alert("❌ عملية مرفوضة: لا توجد أي قاعات شاغرة في الكلية في هذا التوقيت!");
            clearSelection(); return;
        }

        const availableRooms = freeRooms[target.dayIndex][target.slotIndex];
        let foundRoomIndex = -1;

        // البحث عن قاعة شاغرة تطابق الحجم المطلوب (كبيرة أو صغيرة)
        for(let i=0; i<availableRooms.length; i++) {
            if(isLargeRoom(availableRooms[i]) === sourceNeedsLarge) {
                foundRoomIndex = i;
                break;
            }
        }

        if(foundRoomIndex === -1) {
            let roomTypeStr = sourceNeedsLarge ? "كبيرة (مدرج)" : "صغيرة (عادية)";
            alert(`❌ عملية مرفوضة: توجد قاعات شاغرة في هذا الوقت، ولكن لا توجد قاعة ${roomTypeStr} تناسب المادة!`);
            clearSelection(); return;
        }
        
        // سحب القاعة المناسبة من قائمة الشواغر
        const oldRoom = sourceLec.room;
        const newRoom = availableRooms.splice(foundRoomIndex, 1)[0]; 
        sourceLec.room = newRoom;
        
        // إعادة القاعة القديمة لتصبح شاغرة في التوقيت القديم
        if (oldRoom) {
            freeRooms[source.dayIndex][source.slotIndex].push(oldRoom);
        }
    }

    // 3. السحب والإسقاط الآمن في المصفوفة
    let sourceArray = sched[source.level][source.dayIndex][source.slotIndex];
    sourceArray.splice(sourceArray.indexOf(sourceLec), 1);
    
    if(targetLec) {
        let targetArray = sched[target.level][target.dayIndex][target.slotIndex];
        targetArray.splice(targetArray.indexOf(targetLec), 1);
        sourceArray.push(targetLec);
    }
    
    sched[target.level][target.dayIndex][target.slotIndex].push(sourceLec);

    // مزامنة جداول الأساتذة وإعادة الرسم
    syncProfSchedules();
    clearSelection();
    renderLevelSchedules(currentGenerationData.schedule, currentGenerationData.days, currentGenerationData.slots);
}

// 4. دالة التحقق من التعارض
function isTeacherBusy(teacherName, dayIdx, slotIdx, excludeLevel) {
    if(!teacherName) return false;
    const sched = currentGenerationData.schedule;
    for(const [lvl, days] of Object.entries(sched)) {
        if(lvl === excludeLevel) continue;
        const cell = days[dayIdx][slotIdx];
        if(cell && cell.some(l => l.teacher_name === teacherName)) return true;
    }
    return false;
}

// 5. مزامنة التغييرات مع جداول الأساتذة لتصلهم صحيحة
function syncProfSchedules() {
    const profs = currentGenerationData.prof_schedules;
    // تفريغ الجداول الحالية
    for(let p in profs) {
        for(let d=0; d<profs[p].length; d++) {
            for(let s=0; s<profs[p][d].length; s++) profs[p][d][s] = [];
        }
    }
    // إعادة التعبئة
    const sched = currentGenerationData.schedule;
    for(const [lvl, days] of Object.entries(sched)) {
        for(let d=0; d<days.length; d++) {
            for(let s=0; s<days[d].length; s++) {
                days[d][s].forEach(lec => {
                    if(lec.teacher_name && profs[lec.teacher_name]) {
                        let lecCopy = {...lec};
                        lecCopy.level = lvl;
                        profs[lec.teacher_name][d][s].push(lecCopy);
                    }
                });
            }
        }
    }
}

// ==================== التصدير والاستيراد عبر Excel ====================
function exportToExcel() {
    if(!currentGenerationData || !currentGenerationData.schedule) return alert("لا يوجد جدول لتصديره.");
    
    fetch('/api/export_excel', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            schedule: currentGenerationData.schedule,
            days: currentGenerationData.days,
            slots: currentGenerationData.slots
        })
    })
    .then(res => res.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'الجداول_الجامعية.xlsx';
        a.click();
    });
}




// =====================================================================
// نظام المخطط البياني الحي (المضاف حديثاً)
// =====================================================================
let liveErrorChart = null;
let currentChartType = 'bar'; // النوع الافتراضي (أعمدة)

function initLiveChart() {
    const ctx = document.getElementById('liveErrorChart');
    if (!ctx) return;
    
    // تدمير المخطط القديم إن وجد لإعادة رسمه من جديد عند التبديل
    if (liveErrorChart) {
        liveErrorChart.destroy();
    }

    liveErrorChart = new Chart(ctx, {
        type: currentChartType,
        data: {
            labels: [], // سيتم ملؤها آلياً
            datasets: [{
                label: 'عدد الأخطاء',
                data: [], // سيتم ملؤها آلياً
                backgroundColor: [
                    'rgba(231, 76, 60, 0.7)',  // أحمر (للصارم)
                    'rgba(230, 126, 34, 0.7)', // برتقالي
                    'rgba(241, 196, 15, 0.7)', // أصفر
                    'rgba(52, 152, 219, 0.7)', // أزرق
                    'rgba(46, 204, 113, 0.7)'  // أخضر
                ],
                borderColor: [
                    'rgba(192, 57, 43, 1)',
                    'rgba(211, 84, 0, 1)',
                    'rgba(243, 156, 18, 1)',
                    'rgba(41, 128, 185, 1)',
                    'rgba(39, 174, 96, 1)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: { // إعدادات الشبكة العنكبوتية (تظهر فقط إذا كان النوع radar)
                    display: currentChartType === 'radar',
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                },
                y: { // إعدادات الأعمدة (تظهر فقط إذا كان النوع bar)
                    display: currentChartType === 'bar',
                    beginAtZero: true,
                    ticks: { stepSize: 1, precision: 0 }
                }
            },
            plugins: {
                legend: { display: false } // إخفاء مفتاح الخريطة لتوفير المساحة
            },
            animation: {
                duration: 400 // حركة سريعة وناعمة عند تحديث البيانات
            }
        }
    });
}

// =====================================================================
// ✨ الإضافة: متغيرات الذاكرة لحفظ آخر حالة للبيانات
let latestChartLabels = [];
let latestChartData = [];
// =====================================================================

// دالة تحديث البيانات حياً (المعدلة)
function updateLiveChart(labels, data) {
    // تحديث الذاكرة بالبيانات الجديدة القادمة من الخوارزمية
    latestChartLabels = labels; 
    latestChartData = data;     

    if (!liveErrorChart) initLiveChart(); 
    liveErrorChart.data.labels = labels;
    liveErrorChart.data.datasets[0].data = data;
    liveErrorChart.update();
}

// تفعيل زر التبديل بين الأعمدة والشبكة العنكبوتية (المعدل)
document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('btn-toggle-chart');
    if(toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            currentChartType = (currentChartType === 'bar') ? 'radar' : 'bar';
            initLiveChart(); // إعادة رسم الهيكل بالشكل الجديد

            // ✨ الإضافة: استرجاع البيانات من الذاكرة وعرضها فوراً دون انتظار الخوارزمية
            if (latestChartLabels.length > 0) {
                liveErrorChart.data.labels = latestChartLabels;
                liveErrorChart.data.datasets[0].data = latestChartData;
                liveErrorChart.update();
            }
        });
    }
});

// دالة إرسال أمر الطفرة اليدوية للخادم (محدثة للزر الشفاف)
function triggerManualMutation() {
    const intensityVal = parseInt(document.getElementById('mutation_hard_intensity')?.value) || 4;

    fetch('/api/generate/force_mutation', { 
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ intensity: intensityVal }) 
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            const btn = document.getElementById('btn-force-mutation');
            
            // ⚡ تأثير بصري حركي شفاف (بدون ظهور المربع المحيط)
            btn.style.transform = "scale(0.7)"; // انكماش سريع
            btn.style.opacity = "0.5";         // تصبح باهتة مؤقتاً
            
            setTimeout(() => {
                btn.style.transform = "scale(1)"; // العودة للحجم الطبيعي
                btn.style.opacity = "1";          // العودة للوضوح التام
            }, 150); // نبضة سريعة جداً (0.15 ثانية)
            
            console.log(`⚡ تم إرسال صدمة بقوة ${intensityVal}`);
        }
    })
    .catch(err => console.error("خطأ في إرسال الطفرة:", err));
}

// ==================== دوال المرحلة 7 (غرفة التحكم المركزية) ====================

// دالة استيراد الجداول من الإكسل
function importExcelSchedule() {
    const fileInput = document.getElementById('excel-import-file');
    if (!fileInput || !fileInput.files.length) {
        return alert("الرجاء اختيار ملف Excel أولاً!");
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    // إرسال الهيكل الحالي مع الملف لضمان توافق الأيام والفترات
    formData.append('days', JSON.stringify(currentGenerationData?.days || []));
    formData.append('slots', JSON.stringify(currentGenerationData?.slots || []));

    // إظهار رسالة تحميل
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ جاري الاستيراد والمعالجة...";
    btn.disabled = true;

    fetch('/api/import_excel', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        if (data.success) {
            // تحديث الذاكرة الحية للنظام
            if(!currentGenerationData) currentGenerationData = {};
            currentGenerationData.schedule = data.schedule;
            currentGenerationData.prof_schedules = data.prof_schedules;
            
            alert("✅ تم استيراد الجداول من الإكسل وتحديث قاعدة البيانات بنجاح!\nالآن يمكنك الضغط على 'إرسال للأساتذة' لنشرها.");
            fileInput.value = ''; // تفريغ خانة الملف
            
            // إعادة رسم الجداول في الواجهة إن كانت ظاهرة
            if(typeof renderLevelSchedules === 'function' && currentGenerationData.days) {
                renderLevelSchedules(data.schedule, currentGenerationData.days, currentGenerationData.slots);
            }
        } else {
            alert("❌ خطأ: " + data.error);
        }
    })
    .catch(err => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert("حدث خطأ في الاتصال أثناء رفع الملف.");
    });
}

// دالة نشر الجداول للأساتذة (محدثة بمحرك إعادة البناء الذكي)
function publishSchedule() {
    // 1. التحقق من وجود بيانات في الذاكرة
    if(!currentGenerationData || !currentGenerationData.schedule) {
        return alert("⚠️ لا يوجد جدول حالي في الذاكرة! يرجى استيراد ملف الإكسل مرة أخرى ثم النقر على إرسال فوراً (دون تحديث الصفحة).");
    }

    if(!confirm("📢 هل أنت متأكد أنك تريد إرسال الجداول؟\nسيتمكن جميع الأساتذة من رؤية جداولهم في بواباتهم الشخصية.")) return;

    // 2. هندسة عكسية: بناء جداول الأساتذة من الجدول العام لضمان عدم وجود فراغ
    let newProfSchedules = {};
    const sched = currentGenerationData.schedule;
    const daysCount = currentGenerationData.days ? currentGenerationData.days.length : 6;
    const slotsCount = currentGenerationData.slots ? currentGenerationData.slots.length : 6;

    for (const lvl in sched) {
        for (let d = 0; d < daysCount; d++) {
            if(!sched[lvl][d]) continue;
            for (let s = 0; s < slotsCount; s++) {
                if(!sched[lvl][d][s]) continue;
                
                sched[lvl][d][s].forEach(lec => {
                    let tName = lec.teacher_name;
                    if (tName) {
                        if (!newProfSchedules[tName]) {
                            // إنشاء هيكل فارغ للأستاذ
                            newProfSchedules[tName] = Array.from({length: daysCount}, () => Array.from({length: slotsCount}, () => []));
                        }
                        // نسخ الحصة وإضافة اسم المستوى إليها
                        let lecCopy = {...lec, level: lvl};
                        newProfSchedules[tName][d][s].push(lecCopy);
                    }
                });
            }
        }
    }

    // 3. تحديث الذاكرة بالبيانات المضمونة
    currentGenerationData.prof_schedules = newProfSchedules;

    // 4. إرسال البيانات المضمونة للخادم
    fetch('/api/admin/publish_schedule', { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prof_schedules: newProfSchedules})
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            alert("✅ تم بناء ونشر جداول الأساتذة بنجاح! يمكنهم رؤيتها الآن.");
        } else {
            alert("❌ خطأ: " + data.error);
        }
    })
    .catch(err => alert("حدث خطأ أثناء محاولة النشر."));
}

// دالة سحب الجداول (إلغاء النشر)
function unpublishSchedule() {
    if(!confirm("🔕 هل أنت متأكد أنك تريد سحب الجداول؟\nستختفي الجداول من بوابات الأساتذة وتعود لمرحلة إدخال الرغبات.")) return;

    fetch('/api/admin/unpublish', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            alert("✅ تم سحب الجداول بنجاح! عادت بوابات الأساتذة إلى وضعها الأولي.");
        } else {
            alert("❌ خطأ: " + data.error);
        }
    })
    .catch(err => alert("حدث خطأ أثناء محاولة سحب الجداول."));
}