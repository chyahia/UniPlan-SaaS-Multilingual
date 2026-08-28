let currentGenerationData = null; 
let eventSource = null;

// --- دالة مساعدة لتحديد لون شريط التقدم بناءً على النسبة ---
function getProgressBarColor(percentage) {
    percentage = parseInt(percentage);
    if (percentage < 40) {
        return '#e74c3c'; 
    } else if (percentage < 70) {
        return '#e67e22'; 
    } else {
        return '#27ae60'; 
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
        mutation_hard_intensity: parseInt(document.getElementById('mutation_hard_intensity')?.value) || 4,
        mutation_soft_probability: parseFloat(document.getElementById('mutation_soft_probability')?.value) || 0.5
    };

    if (selectedAlgorithms.length === 0) {
        alert(_t("يرجى اختيار خوارزمية مساعدة واحدة على الأقل!"));
        return;
    }

    const btnStart = document.getElementById('btn-start-gen');
    const btnStop = document.getElementById('btn-stop-gen');
    const forceMutBtn = document.getElementById('btn-force-mutation');
    if (forceMutBtn) forceMutBtn.style.display = 'inline-block';
    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    if (progressContainer && progressBar) {
        progressContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressBar.style.backgroundColor = getProgressBarColor(0); 
        progressBar.textContent = '0%';
    }

    btnStart.style.display = 'none';
    btnStop.style.display = 'block';
    // ✨ تغليف النص مع الحفاظ على الأيقونة
    btnStop.innerText = '🛑 ' + _t("إيقاف البحث");
    btnStop.disabled = false;
    resultsContainer.style.display = 'none';
    
    logContainer.style.display = 'block';
    initLiveChart();
    logOutput.textContent = _t("بدء الاتصال بالخادم وإرسال البيانات...\n");

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
            logOutput.textContent += _t("تم بدء العملية. جاري استقبال المتابعة الحية...\n");
            
            eventSource = new EventSource('/stream-logs');
            
            eventSource.onmessage = function(event) {
                const message = event.data;
                
                if (message.startsWith("DONE")) {
                    eventSource.close();
                    const jsonData = message.substring(4);
                    
                    if (jsonData.trim().length > 0) {
                        try {
                            const parsedData = JSON.parse(jsonData);
                            currentGenerationData = parsedData; 
                            
                            logOutput.textContent += '\n--- ' + _t("اكتملت عملية الجدولة بنجاح!") + ' ---\n';
                            
                            const finalFailures = parsedData.final_failures || [];
                            let hardErrorsCount = 0;
                            let softErrorsCount = 0;
                            
                            finalFailures.forEach(f => {
                                const penalty = f.penalty !== undefined ? f.penalty : 1;
                                if (penalty >= 100) {
                                    hardErrorsCount++;
                                } else {
                                    softErrorsCount++;
                                }
                            });
                            
                            let finalPercentage = 0;
                            
                            if (hardErrorsCount > 0) {
                                finalPercentage = 5; 
                            } else {
                                finalPercentage = Math.max(0, ((10 - softErrorsCount) / 10) * 100);
                                finalPercentage = Math.max(5, finalPercentage); 
                            }

                            if (progressContainer && progressBar) {
                                progressBar.style.width = finalPercentage + '%';
                                progressBar.style.backgroundColor = getProgressBarColor(finalPercentage);
                                
                                let errorText = "";
                                if (hardErrorsCount > 0) {
                                    // ✨ تدويل مركب بالمتغيرات
                                    errorText = ` (${_t("باقي")} ${hardErrorsCount} ${_t("صارم و")} ${softErrorsCount} ${_t("مرن)")}`;
                                } else if (softErrorsCount > 0) {
                                    errorText = ` (${_t("باقي")} ${softErrorsCount} ${_t("مرن)")}`;
                                }
                                
                                progressBar.textContent = finalPercentage + '%' + errorText;
                            }
                            
                            btnStop.style.display = 'none';
                            btnStart.style.display = 'block';
                            btnStart.innerText = '🔄 ' + _t("إعادة الجدولة مرة أخرى");
                            const forceMutBtn = document.getElementById('btn-force-mutation');
                            if (forceMutBtn) forceMutBtn.style.display = 'none';
                            
                            resultsContainer.style.display = 'block';
                            renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                            
                        } catch(e) {
                            console.error("Error parsing DONE JSON:", e);
                            logOutput.textContent += '\n' + _t("حدث خطأ أثناء قراءة النتيجة النهائية.") + '\n';
                        }
                    }
                } 
                else if (message.includes("PROGRESS:")) {
                    if (progressContainer && progressBar) {
                        let percentage = message.replace("PROGRESS:", "").trim();
                        progressContainer.style.display = 'block';
                        progressBar.style.width = percentage + '%';
                        progressBar.style.backgroundColor = getProgressBarColor(percentage); 
                        progressBar.textContent = percentage + '%';
                    }
                } 
                else if (message.startsWith("CHART_DATA:")) {
                    try {
                        const chartJson = message.replace("CHART_DATA:", "");
                        const parsedData = JSON.parse(chartJson);
                        updateLiveChart(parsedData.labels, parsedData.data);
                    } catch(e) {
                        console.error("خطأ في قراءة بيانات المخطط:", e);
                    }
                }
                else {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight; 
                }
            };
            
            eventSource.onerror = function() {
                logOutput.textContent += '\n--- ' + _t("انقطع الاتصال بالخادم (قد تكون العملية انتهت أو توقفت).") + ' ---\n';
                eventSource.close();
                btnStop.style.display = 'none';
                btnStart.style.display = 'block';
                btnStart.innerText = '🔄 ' + _t("بدء محاولة جديدة");
            };
            
        } else {
            alert(_t("حدث خطأ في بدء الخوارزمية:\n") + data.error);
            btnStop.style.display = 'none';
            btnStart.style.display = 'block';
        }
    }).catch(err => {
        console.error("Error:", err);
        alert(_t("حدث خطأ في الاتصال بالخادم."));
        btnStop.style.display = 'none';
        btnStart.style.display = 'block';
    });
}

function stopGeneration() {
    if(confirm(_t("هل أنت متأكد من إيقاف الخوارزمية؟ قد لا يتم حفظ النتائج الحالية."))) {
        fetch('/api/stop-generation', { method: 'POST' });
        const btnStop = document.getElementById('btn-stop-gen');
        btnStop.textContent = '⏳ ' + _t("جاري الإيقاف، يرجى الانتظار...");
        btnStop.disabled = true;
        const forceMutBtn = document.getElementById('btn-force-mutation');
        if (forceMutBtn) forceMutBtn.style.display = 'none';
    }
}

// =====================================================================
// دوال الرسم وعرض الجداول (الجزء 2)
// =====================================================================

// دالة رسم جداول المستويات (مجهزة بمحرك النقر والتبديل التفاعلي)
function renderLevelSchedules(scheduleData, days, slots) {
    const outputDiv = document.getElementById('rendered-tables');
    outputDiv.innerHTML = ''; 

    if (!scheduleData || Object.keys(scheduleData).length === 0) {
        outputDiv.innerHTML = `<h3 style="text-align:center;">${_t("لم يتم إنشاء أي جداول أو البيانات فارغة.")}</h3>`;
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
        title.textContent = _t("جدول: ") + level;
        container.appendChild(title);

        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.textAlign = 'center';

        // رأس الجدول (الأيام)
        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        headerRow.innerHTML = `<th style="padding:10px; background:#ecf0f1; border:1px solid #ccc;">${_t("الوقت")}</th>`;
        days.forEach(day => headerRow.innerHTML += `<th style="padding:10px; background:#ecf0f1; border:1px solid #ccc;">${_t(day)}</th>`);

        // محتوى الجدول (الفترات والمواد)
        const tbody = table.createTBody();
        slots.forEach((slot, slotIdx) => {
            const row = tbody.insertRow();
            // استخدام الخصائص المنطقية للاتجاهات في العرض
            row.insertCell().innerHTML = `<strong style="display:block; padding:10px; border:1px solid #ccc; background:#fafafa; direction: ltr;">${slot}</strong>`;
            
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
                            <small style="color:#e67e22; font-weight:bold;">${lec.room || _t("بدون قاعة")}</small>
                        </div>
                    `).join('');
                    
                    // التعديل الجديد: إضافة منطقة فارغة "مخفية الأطراف" للنقر والإضافة بجوار المواد الحالية
                    cellHTML += `
                        <div onclick="handleLectureClick('${level}', ${dayIdx}, ${slotIdx}, null, null, this)" 
                             style="margin-top: 5px; padding: 5px; border: 1px dashed #bdc3c7; border-radius: 4px; font-size: 11px; color: #7f8c8d; cursor: pointer; text-align: center; transition: 0.2s;"
                             onmouseover="this.style.background='#ecf0f1'" onmouseout="this.style.background='transparent'">
                            ${_t("➕ نقل إلى هنا")}
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

function exportFiles(url, defaultFileName, isProfessor = false, isFreeRoom = false) {
    if (!currentGenerationData) { alert(_t('لا توجد بيانات مصدرة. يرجى توليد الجدول أولاً.')); return; }
    
    const lang = document.querySelector('input[name="export_lang"]:checked')?.value || 'ar';

    // تحديد اسم الملف برمجياً بناءً على المسار واللغة 
    let finalFileName = defaultFileName;
    if (url.includes('all-levels')) {
        finalFileName = lang === 'en' ? 'Schedules_Levels.docx' : (lang === 'fr' ? 'Emplois_Niveaux.docx' : _t('جداول_المستويات.docx'));
    } else if (url.includes('all-professors')) {
        finalFileName = lang === 'en' ? 'Schedules_Professors.docx' : (lang === 'fr' ? 'Emplois_Professeurs.docx' : _t('جداول_الأساتذة.docx'));
    } else if (url.includes('free-rooms')) {
        finalFileName = lang === 'en' ? 'Free_Rooms.xlsx' : (lang === 'fr' ? 'Salles_Libres.xlsx' : _t('جدول_القاعات_الشاغرة.xlsx'));
    } else if (url.includes('rooms-schedule')) {
        finalFileName = lang === 'en' ? 'Schedules_Rooms.xlsx' : (lang === 'fr' ? 'Emplois_Salles.xlsx' : _t('جداول_القاعات.xlsx'));
    }

    let scheduleToSend = currentGenerationData.schedule;
    if (isProfessor) scheduleToSend = currentGenerationData.prof_schedules;
    if (isFreeRoom) scheduleToSend = currentGenerationData.free_rooms;

    const payload = {
        schedule: scheduleToSend,
        days: currentGenerationData.days,
        slots: currentGenerationData.slots,
        lang: lang 
    };

    fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(async res => {
        // ✨ التحسين: التحقق مما إذا كان السيرفر أرجع خطأ (مثل 400 أو 500)
        if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || _t("حدث خطأ غير معروف في السيرفر"));
        }
        return res.blob();
    })
    .then(blob => triggerDownload(blob, finalFileName)) 
    .catch(err => alert(_t("خطأ في التصدير: ") + err.message));
}

function exportPedagogicalLoad() {
    const lang = document.querySelector('input[name="export_lang"]:checked')?.value || 'ar';
    
    let finalFileName = lang === 'en' ? 'Teaching_Load.xlsx' : (lang === 'fr' ? 'Charge_Pedagogique.xlsx' : _t('العبء_البيداغوجي.xlsx'));
    
    fetch(`/api/export/teaching-load?lang=${lang}`)
    .then(res => res.blob())
    .then(blob => triggerDownload(blob, finalFileName))
    .catch(err => alert(_t("خطأ في تصدير العبء البيداغوجي: ") + err));
}

function exportComprehensiveList() {
    if (!currentGenerationData || !currentGenerationData.schedule) { 
        alert(_t('لا توجد بيانات مصدرة. يرجى توليد الجدول أولاً.')); 
        return; 
    }
    
    const lang = document.querySelector('input[name="export_lang"]:checked')?.value || 'ar';

    let finalFileName = lang === 'en' ? 'Comprehensive_List.xlsx' : (lang === 'fr' ? 'Liste_Globale.xlsx' : _t('القائمة_الشاملة_للجداول.xlsx'));

    const payload = {
        schedule: currentGenerationData.schedule,
        days: currentGenerationData.days,
        slots: currentGenerationData.slots,
        lang: lang 
    };

    fetch('/api/export/comprehensive-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    })
    .then(res => res.blob())
    .then(blob => triggerDownload(blob, finalFileName))
    .catch(err => alert(_t("خطأ في تصدير القائمة الشاملة: ") + err));
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
        alert(_t("لا توجد نتيجة حالية لحفظها! يرجى توليد جدول أولاً."));
        return;
    }
    
    // تحويل الجدول إلى نص وحفظه في ذاكرة المتصفح
    localStorage.setItem('savedSchedule_' + slotNumber, JSON.stringify(currentGenerationData));
    alert(_t("✅ تم حفظ النتيجة الحالية في [الذاكرة رقم ") + slotNumber + _t("] بنجاح!"));
    
    // إظهار زر الاستعادة المقابل
    document.getElementById('btn-restore-' + slotNumber).style.display = 'inline-block';
}

function restoreResult(slotNumber) {
    const savedData = localStorage.getItem('savedSchedule_' + slotNumber);
    if (savedData) {
        // استرجاع البيانات وتحويلها لجدول في الذاكرة الحية
        currentGenerationData = JSON.parse(savedData);
        
        // إظهار حاوية الجداول وأزرار التصدير المخفية
        const resultsContainer = document.getElementById('schedule-results-container');
        if (resultsContainer) {
            resultsContainer.style.display = 'block';
        }

        // إعادة رسم الجداول على الشاشة
        renderLevelSchedules(currentGenerationData.schedule, currentGenerationData.days, currentGenerationData.slots);
        alert(_t("📂 تمت استعادة [النتيجة رقم ") + slotNumber + _t("] بنجاح! يمكنك الآن مراجعتها أو تصديرها."));
    } else {
        alert(_t("لا توجد نتيجة محفوظة في هذه الذاكرة."));
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
        alert(_t("يرجى توليد جدول أولاً قبل محاولة تحسينه!"));
        return;
    }

    // 1. جلب مستوى التحسين من أزرار الراديو (Radio Buttons) في واجهتك
    const levelRadio = document.querySelector('input[name="opt_level"]:checked');
    const selectedLevel = levelRadio ? levelRadio.value : 'balanced';

    // 2. جلب الأساتذة المحددين من الحاوية الخاصة بهم
    const teacherCheckboxes = document.querySelectorAll('#optimization-teachers input[type="checkbox"]:checked');
    const selectedTeachers = Array.from(teacherCheckboxes).map(cb => cb.value);

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnRefine = document.getElementById('btn-refine');
    
    // إخفاء النتائج وإظهار الشاشة السوداء
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    
    // ترجمة اسم المستوى للغة المحددة لطباعته في الشاشة السوداء
    let levelNameAr = selectedLevel === 'simple_restricted' ? _t('بسيط (مقيد)') : 
                     (selectedLevel === 'simple' ? _t('بسيط (مفتوح)') : 
                     (selectedLevel === 'deep' ? _t('عميق (تفريغ المساء)') : 
                     (selectedLevel === 'deep_balance' ? _t('عميق (موازنة العبء)') : _t('متوازن'))));
                     
    let teachersText = selectedTeachers.length > 0 ? (_t("لعدد ") + selectedTeachers.length + _t(" أساتذة")) : _t("لجميع الأساتذة");
    
    logOutput.textContent = _t("🚀 جاري الاتصال بالخادم لضغط وتحسين أوقات الأساتذة...\n");
    logOutput.textContent += _t("⚙️ المستوى: [") + levelNameAr + _t("] | النطاق: [") + teachersText + _t("]\n\n");
    
    // إيقاف الزر مؤقتاً
    btnRefine.disabled = true;
    btnRefine.innerText = '⏳ ' + _t("جاري التحسين...");

    fetch('/api/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            schedule: currentGenerationData.schedule,
            level: selectedLevel,       
            teachers: selectedTeachers  
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
                        
                        logOutput.textContent += '\n--- ✨ ' + _t("اكتملت عملية التحسين وسد الفجوات بنجاح!") + ' ---\n';
                        
                        btnRefine.disabled = false;
                        btnRefine.innerText = _t("✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)");
                        resultsContainer.style.display = 'block';
                        
                        currentGenerationData = parsedData; // حفظ البيانات للنشر
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert(_t("✨ تم ضغط الجداول بنجاح! يمكنك الآن مراجعتها أو تصديرها."));
                        
                        // إضافة أزرار النشر ديناميكياً أعلى الجداول
                        let pubDiv = document.getElementById('publish-actions');
                        if(!pubDiv) {
                            pubDiv = document.createElement('div');
                            pubDiv.id = 'publish-actions';
                            pubDiv.style = 'margin-bottom: 25px; padding: 20px; background: #fffdf5; border: 2px solid #f39c12; border-radius: 8px; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);';
                            resultsContainer.parentNode.insertBefore(pubDiv, resultsContainer);
                        }
                        
                        // استخدام الترجمة داخل القالب الديناميكي
                        pubDiv.innerHTML = `
                            <h3 style="margin-top: 0; color: #d35400;">${_t("🚀 الخطوة الختامية: المراجعة والنشر")}</h3>
                            <p style="font-size: 14px; color: #7f8c8d; margin-bottom: 15px;">${_t("يمكنك تعديل الجداول برمجياً، أو تصديرها للإكسل وتعديلها خارجياً، ثم العودة لنشرها.")}</p>
                            
                            <div style="background: white; padding: 15px; border-radius: 6px; display: inline-block; border: 1px solid #ddd; margin-bottom: 15px;">
                                
                                <!-- 🟢 القائمة المنسدلة لاختيار لغة التصدير -->
                                <select id="quick-export-lang" style="padding: 9px; border-radius: 4px; border: 1px solid #ccc; font-weight: bold; margin-inline-end: 10px; cursor: pointer; background: #f9f9f9;">
                                    <option value="ar">العربية (Arabic)</option>
                                    <option value="en">الإنجليزية (English)</option>
                                </select>
                                
                                <button onclick="exportToExcel()" style="background: #207245; color: white; padding: 10px 15px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px; margin-inline-start: 10px;">${_t("⬇️ تصدير الجداول (Excel)")}</button>
                                
                                <input type="file" id="excel-upload" accept=".xlsx" style="display: none;" onchange="importExcelSchedule()">
                                <button onclick="document.getElementById('excel-upload').click()" style="background: #f1c40f; color: #2c3e50; padding: 10px 15px; border: none; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 14px; margin-inline-start: 10px;">${_t("⬆️ استيراد الجداول المعدلة")}</button>
                            </div>
                            <br>

                            <button id="btn-edit-mode" onclick="toggleEditMode()" style="background: #f39c12; color: white; padding: 12px 25px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px; margin-inline-start: 10px; transition: 0.3s;">${_t("✏️ تفعيل التعديل التفاعلي")}</button>
                            <button id="btn-publish" onclick="publishSchedule()" style="background: #27ae60; color: white; padding: 12px 25px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px; margin-inline-start: 10px; transition: 0.3s;">${_t("✅ إرسال الجداول للأساتذة")}</button>
                            <button onclick="unpublishSchedule()" style="background: #95a5a6; color: white; padding: 12px 25px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 16px;">${_t("🚫 سحب وإخفاء")}</button>
                        `;
                        
                    } catch(e) {
                        console.error("Error parsing DONE JSON:", e);
                    }
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
                btnRefine.innerText = _t("✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)");
                
                // إعادة إظهار الجداول إذا انقطع الاتصال
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert(_t("حدث خطأ: ") + data.error);
            btnRefine.disabled = false;
            btnRefine.innerText = _t("✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)");
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        console.error("Error:", err);
        alert(_t("حدث خطأ في الاتصال."));
        btnRefine.disabled = false;
        btnRefine.innerText = _t("✨ ضغط وتحسين جداول الأساتذة (سد الفجوات)");
        resultsContainer.style.display = 'block';
    });
}

// ==========================================
// 🟢 دالة تفعيل الدومينو (صناعة الحصص اليتيمة)
// ==========================================
function activateDominoSchedules() {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert(_t("يرجى توليد جدول أولاً!")); return;
    }
    
    if (!confirm(_t("هل أنت متأكد أنك تريد تفعيل الدومينو (صناعة حصص يتيمة) للأساتذة المؤشر عليهم؟"))) return;

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnActivate = document.getElementById('btn-activate-domino');
    
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    logOutput.textContent = _t("🟢 جاري الاتصال بالخادم لتفعيل الدومينو (صناعة الحصص اليتيمة)...\n");
    
    btnActivate.disabled = true;
    btnActivate.innerText = '⏳ ' + _t("جاري التفعيل...");

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
                        logOutput.textContent += '\n--- 🟢 ' + _t("نجحت عملية صناعة الحصص اليتيمة!") + ' ---\n';
                        btnActivate.disabled = false;
                        btnActivate.innerText = '🟢 ' + _t("تفعيل الدومينو");
                        resultsContainer.style.display = 'block';
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert(_t("🟢 تم تفعيل مسار الدومينو وصناعة الحصص اليتيمة بنجاح!"));
                    } catch(e) { console.error(e); }
                } else if (!message.includes("PROGRESS:") && !message.startsWith("CHART_DATA:")) {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight;
                }
            };
            refineEventSource.onerror = function() {
                refineEventSource.close();
                btnActivate.disabled = false;
                btnActivate.innerText = '🟢 ' + _t("تفعيل الدومينو");
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert(_t("حدث خطأ: ") + data.error);
            btnActivate.disabled = false;
            btnActivate.innerText = '🟢 ' + _t("تفعيل الدومينو");
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        alert(_t("حدث خطأ في الاتصال."));
        btnActivate.disabled = false;
        btnActivate.innerText = '🟢 ' + _t("تفعيل الدومينو");
        resultsContainer.style.display = 'block';
    });
}

// ==========================================
// 🔵 دالة تجميع الدومينو (ضغط الجداول)
// ==========================================
function compressDominoSchedules() {
    if (!currentGenerationData || !currentGenerationData.schedule) {
        alert(_t("يرجى توليد جدول أولاً!")); return;
    }
    
    if (!confirm(_t("هل أنت متأكد من تجميع الدومينو وضغط جداول الأساتذة العالقين؟"))) return;

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnCompress = document.getElementById('btn-compress-domino');
    
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    logOutput.textContent = _t("🔵 جاري الاتصال بالخادم وتجميع مسارات الدومينو لضغط الجداول...\n");
    
    btnCompress.disabled = true;
    btnCompress.innerText = '⏳ ' + _t("جاري التجميع...");

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
                        logOutput.textContent += '\n--- 🔵 ' + _t("نجحت عملية تجميع مسارات الدومينو!") + ' ---\n';
                        btnCompress.disabled = false;
                        btnCompress.innerText = '🔵 ' + _t("تجميع الدومينو");
                        resultsContainer.style.display = 'block';
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert(_t("🔵 تم تجميع الحصص اليتيمة وضغط الجداول بنجاح!"));
                    } catch(e) { console.error(e); }
                } else if (!message.includes("PROGRESS:") && !message.startsWith("CHART_DATA:")) {
                    logOutput.textContent += message + '\n';
                    logOutput.scrollTop = logOutput.scrollHeight;
                }
            };
            refineEventSource.onerror = function() {
                refineEventSource.close();
                btnCompress.disabled = false;
                btnCompress.innerText = '🔵 ' + _t("تجميع الدومينو");
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert(_t("حدث خطأ: ") + data.error);
            btnCompress.disabled = false;
            btnCompress.innerText = '🔵 ' + _t("تجميع الدومينو");
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        alert(_t("حدث خطأ في الاتصال."));
        btnCompress.disabled = false;
        btnCompress.innerText = '🔵 ' + _t("تجميع الدومينو");
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
        alert(_t("يرجى توليد جدول أولاً!")); return;
    }
    const teacherName = document.getElementById('surgical-teacher-select').value;
    const maxVictims = document.getElementById('surgical-max-victims').value;
    
    if (!teacherName) {
        alert(_t("الرجاء اختيار الأستاذ الهدف من القائمة المنسدلة.")); return;
    }
    
    // تقسيم النص لترجمة المتغيرات المدمجة
    if (!confirm(`${_t("هل أنت متأكد من تنفيذ العملية الجراحية لرفع حصص الأستاذ [")}${teacherName}${_t("] نحو الصباح؟\n(ملاحظة: سيتم إزاحة أساتذة آخرين كضحايا بحد أقصى ")}${maxVictims}${_t(").")}`)) return;

    const logContainer = document.getElementById('live-log-container');
    const logOutput = document.getElementById('log-output');
    const resultsContainer = document.getElementById('schedule-results-container');
    const btnExecute = document.getElementById('btn-execute-surgical');
    
    resultsContainer.style.display = 'none';
    logContainer.style.display = 'block';
    logOutput.textContent = `🎯 ${_t("جاري الاتصال بالخادم لتنفيذ التدخل الجراحي للأستاذ: [")}${teacherName}${_t("]...\n")}`;
    
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
                        logOutput.textContent += '\n--- 🎯 ' + _t("انتهت العملية الجراحية!") + ' ---\n';
                        btnExecute.disabled = false;
                        btnExecute.innerText = '🚀 ' + _t("تنفيذ");
                        resultsContainer.style.display = 'block';
                        renderLevelSchedules(parsedData.schedule, parsedData.days, parsedData.slots);
                        alert(_t("🎯 تمت العملية الجراحية، ويمكنك معاينة الجدول المحدث!"));
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
                btnExecute.innerText = '🚀 ' + _t("تنفيذ");
                resultsContainer.style.display = 'block'; 
            };
        } else {
            alert(_t("حدث خطأ: ") + data.error);
            btnExecute.disabled = false;
            btnExecute.innerText = '🚀 ' + _t("تنفيذ");
            resultsContainer.style.display = 'block';
        }
    })
    .catch(err => {
        alert(_t("حدث خطأ في الاتصال بالخادم."));
        btnExecute.disabled = false;
        btnExecute.innerText = '🚀 ' + _t("تنفيذ");
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
        btn.innerHTML = _t("🔴 إغلاق وضع التعديل");
        if(container) {
            container.style.border = '3px dashed #f39c12';
            container.style.padding = '10px';
        }
        alert(_t("✨ تم تفعيل الوضع اليدوي!\n1. انقر على أي مادة لتحديدها.\n2. انقر على مادة أخرى (أو فراغ) ليتبادلا الأماكن فوراً."));
    } else {
        btn.style.background = '#f39c12';
        btn.innerHTML = _t("✏️ تفعيل التعديل التفاعلي");
        if(container) {
            container.style.border = 'none';
            container.style.padding = '0';
        }
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
        alert(_t("❌ تعارض: الأستاذ (") + source.teacherName + _t(") يدرّس مستوى آخر في هذا التوقيت!"));
        clearSelection(); return;
    }
    if(target.teacherName && isTeacherBusy(target.teacherName, source.dayIndex, source.slotIndex, target.level)) {
        alert(_t("❌ تعارض: الأستاذ (") + target.teacherName + _t(") يدرّس مستوى آخر في التوقيت الأول!"));
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
            alert(_t("❌ عملية مرفوضة: لا يمكن التبديل بين قاعة كبيرة وقاعة صغيرة لاختلاف سعة الاستيعاب!"));
            clearSelection(); return;
        }
        
        const tempRoom = sourceLec.room;
        sourceLec.room = targetLec.room;
        targetLec.room = tempRoom;
    } 
    else {
        // حالة: النقل إلى فترة فارغة
        if (!freeRooms[target.dayIndex][target.slotIndex] || freeRooms[target.dayIndex][target.slotIndex].length === 0) {
            alert(_t("❌ عملية مرفوضة: لا توجد أي قاعات شاغرة في الكلية في هذا التوقيت!"));
            clearSelection(); return;
        }

        const availableRooms = freeRooms[target.dayIndex][target.slotIndex];
        let foundRoomIndex = -1;

        for(let i=0; i<availableRooms.length; i++) {
            if(isLargeRoom(availableRooms[i]) === sourceNeedsLarge) {
                foundRoomIndex = i;
                break;
            }
        }

        if(foundRoomIndex === -1) {
            let roomTypeStr = sourceNeedsLarge ? _t("كبيرة (مدرج)") : _t("صغيرة (عادية)");
            alert(_t("❌ عملية مرفوضة: توجد قاعات شاغرة في هذا الوقت، ولكن لا توجد قاعة ") + roomTypeStr + _t(" تناسب المادة!"));
            clearSelection(); return;
        }
        
        const oldRoom = sourceLec.room;
        const newRoom = availableRooms.splice(foundRoomIndex, 1)[0]; 
        sourceLec.room = newRoom;
        
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
    for(let p in profs) {
        for(let d=0; d<profs[p].length; d++) {
            for(let s=0; s<profs[p][d].length; s++) profs[p][d][s] = [];
        }
    }
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
    if(!currentGenerationData || !currentGenerationData.schedule) return alert(_t("لا يوجد جدول لتصديره."));
    
    // 🟢 قراءة اللغة من القائمة المنسدلة الجديدة بشكل مباشر وصريح
    const langSelect = document.getElementById('quick-export-lang');
    const lang = langSelect ? langSelect.value : 'ar';

    fetch('/api/export_excel', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            schedule: currentGenerationData.schedule,
            days: currentGenerationData.days,
            slots: currentGenerationData.slots,
            lang: lang 
        })
    })
    .then(res => res.blob())
    .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        // تسمية الملف بناءً على اللغة
        a.download = lang === 'en' ? 'University_Schedules.xlsx' : 'الجداول_الجامعية.xlsx';
        
        a.click();
    });
}


// =====================================================================
// نظام المخطط البياني الحي
// =====================================================================
let liveErrorChart = null;
let currentChartType = 'bar'; 

function initLiveChart() {
    const ctx = document.getElementById('liveErrorChart');
    if (!ctx) return;
    
    if (liveErrorChart) {
        liveErrorChart.destroy();
    }

    liveErrorChart = new Chart(ctx, {
        type: currentChartType,
        data: {
            labels: [], 
            datasets: [{
                label: 'Errors / الأخطاء',
                data: [], 
                backgroundColor: [
                    'rgba(231, 76, 60, 0.7)',
                    'rgba(230, 126, 34, 0.7)',
                    'rgba(241, 196, 15, 0.7)',
                    'rgba(52, 152, 219, 0.7)',
                    'rgba(46, 204, 113, 0.7)'
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
                r: { display: currentChartType === 'radar', beginAtZero: true, ticks: { stepSize: 1, precision: 0 } },
                y: { display: currentChartType === 'bar', beginAtZero: true, ticks: { stepSize: 1, precision: 0 } }
            },
            plugins: { legend: { display: false } },
            animation: { duration: 400 }
        }
    });
}

let latestChartLabels = [];
let latestChartData = [];

function updateLiveChart(labels, data) {
    latestChartLabels = labels; 
    latestChartData = data;     

    if (!liveErrorChart) initLiveChart(); 
    liveErrorChart.data.labels = labels;
    liveErrorChart.data.datasets[0].data = data;
    liveErrorChart.update();
}

document.addEventListener('DOMContentLoaded', function() {
    const toggleBtn = document.getElementById('btn-toggle-chart');
    if(toggleBtn) {
        toggleBtn.addEventListener('click', function() {
            currentChartType = (currentChartType === 'bar') ? 'radar' : 'bar';
            initLiveChart(); 

            if (latestChartLabels.length > 0) {
                liveErrorChart.data.labels = latestChartLabels;
                liveErrorChart.data.datasets[0].data = latestChartData;
                liveErrorChart.update();
            }
        });
    }
});

function triggerManualMutation() {
    const intensityVal = parseInt(document.getElementById('mutation_hard_intensity')?.value) || 4;

    fetch('/api/generate/force_mutation', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intensity: intensityVal }) 
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            const btn = document.getElementById('btn-force-mutation');
            
            btn.style.transform = "scale(0.7)"; 
            btn.style.opacity = "0.5";         
            
            setTimeout(() => {
                btn.style.transform = "scale(1)"; 
                btn.style.opacity = "1";          
            }, 150); 
            
            console.log(_t("⚡ تم إرسال صدمة بقوة ") + intensityVal);
        }
    })
    .catch(err => console.error("Error forced mutation:", err));
}

// ==================== دوال المرحلة 7 (غرفة التحكم المركزية) ====================

function importExcelSchedule() {
    const fileInput = document.getElementById('excel-import-file');
    if (!fileInput || !fileInput.files.length) {
        return alert(_t("الرجاء اختيار ملف Excel أولاً!"));
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('days', JSON.stringify(currentGenerationData?.days || []));
    formData.append('slots', JSON.stringify(currentGenerationData?.slots || []));

    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ ' + _t("جاري الاستيراد والمعالجة...");
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
            if(!currentGenerationData) currentGenerationData = {};
            currentGenerationData.schedule = data.schedule;
            currentGenerationData.prof_schedules = data.prof_schedules;
            currentGenerationData.free_rooms = data.free_rooms;
            
            alert(_t("✅ تم استيراد الجداول من الإكسل وتحديث قاعدة البيانات بنجاح!\nالآن يمكنك الضغط على 'إرسال للأساتذة' لنشرها."));
            fileInput.value = ''; 
            
            if(typeof renderLevelSchedules === 'function' && currentGenerationData.days) {
                renderLevelSchedules(data.schedule, currentGenerationData.days, currentGenerationData.slots);
            }
        } else {
            alert("❌ " + (data.error || "Error"));
        }
    })
    .catch(err => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert(_t("حدث خطأ في الاتصال أثناء رفع الملف."));
    });
}

// دالة استيراد القائمة الشاملة (المسطحة)
// ملاحظة: تأكد من إضافة id="btn-import-comp" لزر الاستيراد في الـ HTML
function importComprehensiveSchedule() {
    const fileInput = document.getElementById('comprehensive-import-file');
    if (!fileInput || !fileInput.files.length) {
        return alert(_t("الرجاء اختيار ملف 'القائمة الشاملة' أولاً!"));
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('days', JSON.stringify(currentGenerationData?.days || []));
    formData.append('slots', JSON.stringify(currentGenerationData?.slots || []));

    // جلب الزر عن طريق ID لتعطيله أثناء الرفع
    const btn = document.getElementById('btn-import-comp') || document.activeElement;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ " + _t("جاري الهندسة العكسية وبناء الجداول...");
    btn.disabled = true;

    fetch('/api/import_comprehensive_excel', {
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
            currentGenerationData.free_rooms = data.free_rooms;
            
            alert(_t("✅ تم استيراد القائمة الشاملة وتحويلها إلى جداول شبكية بنجاح!\nالآن يمكنك استخدام أزرار التصدير (المرحلة 6) لاستخراج جداول القاعات والأساتذة بصيغتها النهائية."));
            fileInput.value = '';
            
            // إعادة رسم الجداول في الواجهة
            if(typeof renderLevelSchedules === 'function' && currentGenerationData.days) {
                renderLevelSchedules(data.schedule, currentGenerationData.days, currentGenerationData.slots);
            }
        } else {
            alert("❌ " + _t("خطأ: ") + data.error);
        }
    })
    .catch(err => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert("❌ " + _t("حدث خطأ في الاتصال أثناء رفع الملف."));
    });
}

function publishSchedule() {
    if(!currentGenerationData || (!currentGenerationData.schedule && !currentGenerationData.prof_schedules)) {
        return alert(_t("⚠️ لا يوجد جدول حالي في الذاكرة! يرجى استيراد ملف الإكسل مرة أخرى ثم النقر على إرسال فوراً (دون تحديث الصفحة)."));
    }

    if(!confirm(_t("📢 هل أنت متأكد أنك تريد إرسال الجداول؟\nسيتمكن جميع الأساتذة من رؤية جداولهم في بواباتهم الشخصية."))) return;

    // ✨ نستخدم الجداول الجاهزة القادمة من الخادم (خاصة عند استيراد الإكسل)
    let finalProfSchedules = currentGenerationData.prof_schedules;

    // إذا لم تكن موجودة (مثلا قمنا بالتوليد المباشر)، نبنيها يدويا
    if (!finalProfSchedules || Object.keys(finalProfSchedules).length === 0) {
        finalProfSchedules = {};
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
                            if (!finalProfSchedules[tName]) {
                                finalProfSchedules[tName] = Array.from({length: daysCount}, () => Array.from({length: slotsCount}, () => []));
                            }
                            let lecCopy = {...lec, level: lvl};
                            finalProfSchedules[tName][d][s].push(lecCopy);
                        }
                    });
                }
            }
        }
        currentGenerationData.prof_schedules = finalProfSchedules;
    }

    // إرسال البيانات المكتملة للخادم
    fetch('/api/admin/publish_schedule', { 
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({prof_schedules: finalProfSchedules})
    })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            alert(_t("✅ تم بناء ونشر جداول الأساتذة بنجاح! يمكنهم رؤيتها الآن."));
        } else {
            alert("❌ " + (data.error || "Error"));
        }
    })
    .catch(err => alert(_t("حدث خطأ أثناء محاولة النشر.")));
}

function unpublishSchedule() {
    if(!confirm(_t("🔕 هل أنت متأكد أنك تريد سحب الجداول؟\nستختفي الجداول من بوابات الأساتذة وتعود لمرحلة إدخال الرغبات."))) return;

    fetch('/api/admin/unpublish', { method: 'POST' })
    .then(res => res.json())
    .then(data => {
        if(data.success) {
            alert(_t("✅ تم سحب الجداول بنجاح! عادت بوابات الأساتذة إلى وضعها الأولي."));
        } else {
            alert("❌ " + (data.error || "Error"));
        }
    })
    .catch(err => alert(_t("حدث خطأ أثناء محاولة سحب الجداول.")));
}

