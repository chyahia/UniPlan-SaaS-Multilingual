let lastGeneratedSchedule = null;
let eventSource = null;
let workloadChartInstance = null;

function startGeneration() {
    // 🌟 التعديل: جمع الخوارزميات المؤشر عليها بالترتيب
    const selectedAlgos = [];
    if(document.getElementById('chk-unified').checked) selectedAlgos.push('unified');
    if(document.getElementById('chk-lns').checked) selectedAlgos.push('lns');
    if(document.getElementById('chk-vns').checked) selectedAlgos.push('vns');
    

    if(selectedAlgos.length === 0) {
        showNotification(_t('الرجاء اختيار خوارزمية واحدة على الأقل!'), 'error');
        return;
    }

    const logBox = document.getElementById('live-log-box');
    const btnStart = document.getElementById('btn-start-gen');
    const btnStop = document.getElementById('btn-stop-gen');
    const resultsArea = document.getElementById('generation-results-area');

    const payload = {
        algorithms: selectedAlgos,
        params: {
            unifiedIter: document.getElementById('unified-iter').value,
            unifiedDestroy: document.getElementById('unified-destroy').value,
            lnsIter: document.getElementById('lns-iter').value,
            lnsDestroy: document.getElementById('lns-destroy').value,
            vnsIter: document.getElementById('vns-iter').value,
            vnsK: document.getElementById('vns-k').value
        }
    };
    
    logBox.innerHTML = '';
    resultsArea.style.display = 'none';
    btnStart.style.display = 'none';
    btnStop.style.display = 'block';

    fetch('/exams/api/generate-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    }).then(() => {
        if (eventSource) eventSource.close();
        eventSource = new EventSource('/exams/api/stream-logs');

        eventSource.onmessage = function(event) {
            if (event.data.startsWith("PROGRESS:")) return; 
            
            if (event.data.startsWith("DONE:")) {
                eventSource.close();
                btnStart.style.display = 'block';
                btnStop.style.display = 'none';
                
                const jsonStr = event.data.substring(5);
                try {
                    const data = JSON.parse(jsonStr);
                    if (data.success) {
                        lastGeneratedSchedule = data.schedule;
                        logBox.innerHTML += `<br><span style="color:#28a745; font-weight:bold;">${_t('[System] تم استلام الجدول النهائي ورسمه بنجاح!')}</span><br>`;
                        resultsArea.style.display = 'block';
                        displayStatsDashboard(data.stats);
                        displayBalanceReport(data.stats.balance_report_data);
                        if (data.stats.chart_data) {
                            displayWorkloadChart(data.stats.chart_data);
                        }
                        renderScheduleTables(data.schedule); 
                        
                        // --- عرض تقرير الأخطاء والملاحظات ---
                        if (data.violations) {
                            const repContainer = document.getElementById('violation-report-container');
                            const strictList = document.getElementById('strict-errors-list');
                            const softList = document.getElementById('soft-warnings-list');
                            
                            if (repContainer && strictList && softList) {
                                strictList.innerHTML = '';
                                softList.innerHTML = '';

                                // تعبئة الأخطاء الصارمة
                                if (data.violations.strict.length === 0) {
                                    strictList.innerHTML = `<li>${_t('✅ ممتاز! لا توجد أي أخطاء صارمة أو نقص في الحراس. الجدول سليم أساسياً.')}</li>`;
                                } else {
                                    data.violations.strict.forEach(err => {
                                        strictList.innerHTML += `<li style="margin-bottom: 5px;">${err}</li>`;
                                    });
                                }

                                // تعبئة الملاحظات المرنة
                                if (data.violations.soft.length === 0) {
                                    softList.innerHTML = `<li>${_t('✅ رائع! جميع القيود المرنة والحدود القصوى محترمة 100%.')}</li>`;
                                } else {
                                    data.violations.soft.forEach(warn => {
                                        softList.innerHTML += `<li style="margin-bottom: 5px;">${warn}</li>`;
                                    });
                                }
                                
                                repContainer.style.display = 'block';
                            }
                        }
                    } else {
                        logBox.innerHTML += `<br><span style="color:red;">[Error] ${data.message}</span><br>`;
                    }
                } catch(e) {
                    logBox.innerHTML += `<br><span style="color:red;">${_t('فشل في قراءة البيانات النهائية.')}</span><br>`;
                }
                logBox.scrollTop = logBox.scrollHeight;
                return;
            }
            
            logBox.innerHTML += event.data + '<br>';
            logBox.scrollTop = logBox.scrollHeight;
        };

        eventSource.onerror = function() {
            logBox.innerHTML += `<br><span style="color:red;">${_t('[Network] انقطع الاتصال بمحرك التوليد.')}</span><br>`;
            eventSource.close();
            btnStart.style.display = 'block';
            btnStop.style.display = 'none';
        };
    });
}

function stopGeneration() {
    fetch('/exams/api/stop-generation', { method: 'POST' }).then(() => {
        document.getElementById('btn-stop-gen').textContent = _t("جاري الإيقاف...");
    });
}

// ==========================================
// 📊 رسم جداول الامتحانات
// ==========================================
function renderScheduleTables(schedule) {
    document.getElementById('export-schedule-word-button').onclick = exportScheduleWord;
    document.getElementById('export-prof-word-button').onclick = exportProfScheduleWord;
    document.getElementById('export-prof-anonymous-word-button').onclick = exportProfScheduleAnonymous;

    const tablesContainer = document.getElementById('schedule-tables-container');
    tablesContainer.innerHTML = '';

    try {
        let allExams = [];
        const allDates = Object.keys(schedule).sort();
        const allLevels = new Set();
        const allTimes = new Set();

        allDates.forEach(date => {
            Object.keys(schedule[date]).sort().forEach(time => {
                allTimes.add(time);
                schedule[date][time].forEach(exam => {
                    allExams.push({ ...exam, date, time });
                    allLevels.add(exam.level);
                });
            });
        });

        const sortedLevels = [...allLevels].sort();
        const sortedTimes = [...allTimes].sort();
        const dayNames = [_t("الأحد"), _t("الاثنين"), _t("الثلاثاء"), _t("الأربعاء"), _t("الخميس"), _t("الجمعة"), _t("السبت")];

        sortedLevels.forEach(level => {
            const levelExams = allExams.filter(exam => exam.level === level);
            if (levelExams.length === 0) return;

            const levelContainer = document.createElement('div');
            levelContainer.className = 'level-schedule-container';
            levelContainer.innerHTML = `<h4 class="level-schedule-title" style="background: #3f51b5; color: white; padding: 10px; border-radius: 4px 4px 0 0; margin: 0;">${_t('جدول امتحانات: ')}${level}</h4>`;

            const table = document.createElement('table');
            table.className = 'results-grid-table';
            
            const thead = table.createTHead();
            const headerRow = thead.insertRow();
            headerRow.innerHTML = `<th style="background:#f1f1f1; padding:10px; border:1px solid #ccc; width:100px;">${_t('الفترة / اليوم')}</th>`;
            allDates.forEach(dateStr => {
                const dateObj = new Date(dateStr);
                const utcDate = new Date(dateObj.valueOf() + dateObj.getTimezoneOffset() * 60000);
                const dayName = dayNames[utcDate.getDay()];
                headerRow.innerHTML += `<th style="background:#f1f1f1; padding:10px; border:1px solid #ccc;">${dayName}<br>${dateStr}</th>`;
            });

            const tbody = table.createTBody();
            sortedTimes.forEach(time => {
                const row = tbody.insertRow();
                row.insertCell().innerHTML = `<strong style="display:block; text-align:center; padding:10px; background:#f9f9f9; border:1px solid #ccc;">${time}</strong>`;

                allDates.forEach(date => {
                    const cell = row.insertCell();
                    cell.style.border = '1px solid #ccc';
                    cell.style.padding = '10px';
                    cell.style.verticalAlign = 'top';
                    cell.style.background = '#fff';

                    const exam = levelExams.find(ex => ex.date === date && ex.time === time);
                    
                    if (exam) {
                        let guardsCopy = [...exam.guards];
                        const hallsByType = { كبيرة: [], متوسطة: [], صغيرة: [] };
                        (exam.halls || []).forEach(h => {
                            if(hallsByType[h.type] !== undefined) hallsByType[h.type].push(h.name);
                        });

                        let hallHtml = '';
                        const processHalls = (type, title, guardsPerHall) => {
                            if (hallsByType[type].length > 0) {
                                const names = hallsByType[type].join(', ');
                                const count = guardsPerHall * hallsByType[type].length;
                                const hallGuards = guardsCopy.splice(0, count);

                                const styledGuards = hallGuards.map(guard => {
                                    if (guard.includes('**نقص**')) return `<span style="color:#dc3545; font-weight:bold; background:#ffeeba; padding:2px 4px; border-radius:3px;">${_t('نقص!')}</span>`;
                                    return `<span style="display:inline-block; background:#e8f5e9; border:1px solid #c8e6c9; padding:2px 5px; border-radius:3px; margin:2px 0; font-size:13px;">${guard}</span>`;
                                }).join(' ');

                                return `<div style="margin-top:8px; padding-top:8px; border-top:1px dashed #eee;">
                                    <span style="color:#666; font-size:12px; font-weight:bold;">${title}: ${names}</span>
                                    <div style="margin-top:4px;">${styledGuards}</div>
                                </div>`;
                            }
                            return '';
                        };
                        
                        hallHtml += processHalls('كبيرة', _t('كبيرة'), 4);
                        hallHtml += processHalls('متوسطة', _t('متوسطة'), 2);
                        hallHtml += processHalls('صغيرة', _t('صغيرة'), 1);

                        cell.innerHTML = `
                            <div style="font-weight:bold; color:#1976d2; font-size:15px; margin-bottom:5px;">${exam.subject}</div>
                            <div style="font-size:13px; color:#555; margin-bottom:5px;">${_t('أستاذ المادة: ')}<strong>${exam.professor}</strong></div>
                            <div>${hallHtml}</div>
                        `;
                    } else {
                        cell.innerHTML = `<div style="color:#ccc; text-align:center; padding:20px;">${_t('- فراغ -')}</div>`;
                    }
                });
            });
            
            levelContainer.appendChild(table);
            levelContainer.style.marginBottom = "40px";
            tablesContainer.appendChild(levelContainer);
        });
    } catch (e) {
        console.error("خطأ فادح في دالة renderScheduleTables:", e);
        tablesContainer.innerHTML = `<p style="color:red; font-weight:bold;">${_t('فشل عرض النتائج بسبب خطأ. راجع الـ Console.')}</p>`;
    }
}

// دوال تصدير مؤقتة لمنع توقف السكربت 
function exportSchedule() { showNotification(_t("سيتم برمجة التصدير إلى Excel قريباً!"), "success"); }
function exportProfSchedule() { showNotification(_t("سيتم برمجة تصدير جداول الأساتذة قريباً!"), "success"); }

// ==========================================
// 📊 رسم لوحة الإحصائيات
// ==========================================
function displayStatsDashboard(stats) {
    const container = document.getElementById('stats-dashboard');
    const containerWrapper = document.getElementById('stats-dashboard-container');
    if (!container || !stats) return;

    let dashboardHTML = `
        <div class="stat-card">
            <h4>${_t('إجمالي الحصص الموزعة')}</h4>
            <p>${stats.total_duties}</p>
            <div class="sub-stat">${_t('كبيرة: ')}${stats.total_large_duties}${_t(' | أخرى: ')}${stats.total_other_duties}</div>
        </div>
        <div class="stat-card">
            <h4>${_t('متوسط الحصص لكل أستاذ')}</h4>
            <p>${stats.avg_duties_per_prof.toFixed(2)}</p>
        </div>
        <div class="stat-card">
            <h4>${_t('اليوم الأكثر ازدحاماً')}</h4>
            <p>${stats.busiest_day.date}</p>
            <div class="sub-stat">${_t('بمجموع ')}${stats.busiest_day.duties}${_t(' حصص حراسة')}</div>
        </div>
        <div class="stat-card">
            <h4>${_t('أكثر 3 أساتذة عملاً 📈')}</h4>
            <ul>${stats.most_burdened_profs.map(p => `<li>${p.name}: <b>${p.workload}</b> ${_t(' نقطة')}</li>`).join('')}</ul>
        </div>
         <div class="stat-card">
            <h4>${_t('أقل 3 أساتذة عملاً 📉')}</h4>
            <ul>${stats.least_burdened_profs.map(p => `<li>${p.name}: <b>${p.workload}</b> ${_t(' نقطة')}</li>`).join('')}</ul>
        </div>
    `;

    const hasGuardShortages = stats.shortage_reports && stats.shortage_reports.length > 0;
    const hasUnscheduledSubjects = stats.unscheduled_subjects_report && stats.unscheduled_subjects_report.length > 0;

    let reportContentHTML = '';
    let reportCardClass = 'stat-card'; 

    if (hasGuardShortages || hasUnscheduledSubjects) {
        reportCardClass = 'stat-card shortage-report'; 
        
        if (hasUnscheduledSubjects) {
            const subjectItems = stats.unscheduled_subjects_report.map(item => `<li>${item}</li>`).join('');
            reportContentHTML += `
                <div style="margin-bottom: 10px;">
                    <h5 style="margin: 0 0 5px 0; color: #dc3545;">${_t('❌ مواد لم تتم جدولتها (')}${stats.unscheduled_subjects_report.length}${_t(')')}</h5>
                    <ul style="color: #dc3545; padding-right: 15px; margin: 0; text-align: right;">${subjectItems}</ul>
                </div>
            `;
        }

        if (hasGuardShortages) {
            const guardItems = stats.shortage_reports.map(item => `<li>${item}</li>`).join('');
            reportContentHTML += `
                <div>
                    <h5 style="margin: 0 0 5px 0; color: #856404;">${_t('⚠️ نقص في الحراسة (')}${stats.shortage_reports.length}${_t(')')}</h5>
                    <ul style="color: #856404; padding-right: 15px; margin: 0; text-align: right;">${guardItems}</ul>
                </div>
            `;
        }
    } else {
        reportContentHTML = `<p style="font-size:16px; margin-top:20px; color:#28a745; font-weight:bold;">${_t('✅ الجدول مكتمل ومثالي!')}</p>`;
    }

    dashboardHTML += `
        <div class="${reportCardClass}" style="${(!hasGuardShortages && !hasUnscheduledSubjects) ? 'background:#e8f5e9; border-color:#c3e6cb;' : ''}">
            <h4 style="${(!hasGuardShortages && !hasUnscheduledSubjects) ? 'color:#28a745;' : 'color:#856404;'}">${_t('تقارير الملاحظات والنقص')}</h4>
            ${reportContentHTML}
        </div>
    `;

    container.innerHTML = dashboardHTML;
    containerWrapper.style.display = 'block';
}

function displayWorkloadChart(chartData) {
    const chartContainer = document.getElementById('chart-container');
    if(chartContainer) chartContainer.style.display = 'block';

    const ctx = document.getElementById('workload-chart').getContext('2d');

    if (workloadChartInstance) {
        workloadChartInstance.destroy();
    }

    workloadChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartData.labels,
            datasets: chartData.datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, 
            scales: {
                x: { stacked: true },
                y: { 
                    stacked: true, 
                    beginAtZero: true, 
                    ticks: { stepSize: 1 } 
                }
            },
            plugins: {
                legend: { position: 'top' }
            }
        }
    });
}

// ==========================================
// 📥 دوال تصدير جداول Word الثلاثة (محدثة بدعم اللغات)
// ==========================================

async function exportScheduleWord() {
    if (!lastGeneratedSchedule) { alert(_t("يرجى إنشاء جدول أولاً قبل التصدير.")); return; }
    
    const button = document.getElementById('export-schedule-word-button');
    button.disabled = true; button.textContent = _t('جاري التصدير...');
    
    const lang = document.querySelector('input[name="export_lang"]:checked')?.value || 'ar';
    let fileName = lang === 'en' ? 'Exams_Schedule.docx' : (lang === 'fr' ? 'Emplois_Examens.docx' : 'جداول_الامتحانات.docx');

    try {
        const response = await fetch(`/exams/api/export/word/all-exams?lang=${lang}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastGeneratedSchedule)
        });
        if (!response.ok) throw new Error(_t('فشل التصدير من الخادم'));

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) { alert(_t('حدث خطأ أثناء تصدير الملف.')); console.error(err); } 
    finally { button.disabled = false; button.textContent = _t('تصدير الامتحانات (Word)'); }
}

async function exportProfScheduleWord() {
    if (!lastGeneratedSchedule) { alert(_t("يرجى إنشاء جدول أولاً قبل التصدير.")); return; }
    
    const button = document.getElementById('export-prof-word-button');
    button.disabled = true; button.textContent = _t('جاري التصدير...');

    const lang = document.querySelector('input[name="export_lang"]:checked')?.value || 'ar';
    let fileName = lang === 'en' ? 'Profs_Guarding_Schedule.docx' : (lang === 'fr' ? 'Emplois_Surveillance_Profs.docx' : 'جداول_الحراسة_للأساتذة.docx');

    try {
        const response = await fetch(`/exams/api/export/word/all-profs?lang=${lang}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastGeneratedSchedule)
        });
        if (!response.ok) throw new Error(_t('فشل التصدير من الخادم'));

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) { alert(_t('حدث خطأ أثناء تصدير الملف.')); console.error(err); } 
    finally { button.disabled = false; button.textContent = _t('تصدير الأساتذة (Word)'); }
}

async function exportProfScheduleAnonymous() {
    if (!lastGeneratedSchedule) { alert(_t("يرجى إنشاء جدول أولاً قبل التصدير.")); return; }
    
    const button = document.getElementById('export-prof-anonymous-word-button');
    button.disabled = true; button.textContent = _t('جاري التصدير...');

    const lang = document.querySelector('input[name="export_lang"]:checked')?.value || 'ar';
    let fileName = lang === 'en' ? 'Profs_Schedule_Simplified.docx' : (lang === 'fr' ? 'Emplois_Surveillance_Simplifie.docx' : 'جداول_الحراسة_المبسطة.docx');

    try {
        const response = await fetch(`/exams/api/export/word/all-profs-anonymous?lang=${lang}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(lastGeneratedSchedule)
        });
        if (!response.ok) throw new Error(_t('فشل التصدير من الخادم'));

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none'; a.href = url; a.download = fileName;
        document.body.appendChild(a); a.click();
        window.URL.revokeObjectURL(url); document.body.removeChild(a);
    } catch (err) { alert(_t('حدث خطأ أثناء تصدير الملف.')); console.error(err); } 
    finally { button.disabled = false; button.textContent = _t('تصدير الأساتذة (مُبسَّط)'); }
}

function displayBalanceReport(data) {
    const container = document.getElementById('balance-report-area');
    
    if (!data || !data.details) {
        container.innerHTML = '';
        return;
    }
    
    function generateDistributionRows(details) {
        if (!details) return '';
        return details.map(item => `
            <tr>
                <td style="padding: 10px; border: 1px solid #ccc;">${item.large_count} ${_t('كبيرة')} + ${item.other_count} ${_t(' أخرى')}</td>
                <td style="padding: 10px; border: 1px solid #ccc;">${item.target_count}</td>
                <td style="padding: 10px; border: 1px solid #ccc;">${item.actual_count}</td>
                <td style="padding: 10px; border: 1px solid #ccc; font-weight: bold; color: ${item.deviation === 0 ? '#28a745' : '#dc3545'};">
                    ${item.deviation > 0 ? '+' : ''}${item.deviation}
                </td>
            </tr>
        `).join('');
    }

    container.innerHTML = `
        <div class="target-distribution-report" style="background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); margin-bottom: 20px; margin-top: 20px;">
            <h3 style="color: #3f51b5; border-bottom: 2px solid #3f51b5; padding-bottom: 5px; margin-top: 0;">${_t('⚖️ تقرير توازن توزيع الحراسة')}</h3>
            
            <table class="distribution-table" style="width: 100%; border-collapse: collapse; text-align: center; margin-top: 15px;">
                <thead style="background-color: #f1f1f1;">
                    <tr>
                        <th style="padding: 10px; border: 1px solid #ccc;">${_t('نمط التوزيع')}</th>
                        <th style="padding: 10px; border: 1px solid #ccc;">${_t('العدد المستهدف من الأساتذة')}</th>
                        <th style="padding: 10px; border: 1px solid #ccc;">${_t('العدد الفعلي')}</th>
                        <th style="padding: 10px; border: 1px solid #ccc;">${_t('الانحراف')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${generateDistributionRows(data.details)}
                </tbody>
            </table>
            
            <div class="balance-indicator" style="margin-top: 20px; padding-top: 15px; border-top: 1px dashed #ccc;">
                <span style="font-weight: bold; font-size: 16px; display: inline-block; margin-bottom: 10px;">${_t('مؤشر التوازن (العدالة): ')}</span>
                <div class="progress-bar-container" style="background: #e9ecef; border-radius: 5px; width: 100%; height: 25px; overflow: hidden; border: 1px solid #ddd;">
                    <div class="progress" style="background-color: ${data.balance_score > 80 ? '#28a745' : (data.balance_score > 50 ? '#ffc107' : '#dc3545')}; width: ${data.balance_score}%; height: 100%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; transition: width 0.5s ease-in-out;">
                        ${data.balance_score}%
                    </div>
                </div>
                <p style="font-size: 12px; color: #666; margin-top: 5px;">${_t('* نسبة 100% تعني أن التوزيع الفعلي طابق الأهداف المرجوة تماماً.')}</p>
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    setupManualDistributionListeners();
});

function setupManualDistributionListeners() {
    const exportBtn = document.getElementById('export-manual-dist-btn');
    const importBtn = document.getElementById('import-manual-dist-btn');
    const fileInput = document.getElementById('import-manual-dist-input');
    const statusP = document.getElementById('manual-dist-status');
    const clearBtn = document.getElementById('clear-manual-dist-btn');

    if (!exportBtn) return;

    exportBtn.addEventListener('click', async () => {
        statusP.textContent = '';
        const originalText = exportBtn.textContent;
        exportBtn.textContent = _t('⏳ جاري إنشاء الملف...');
        exportBtn.disabled = true;

        try {
            const resSettings = await fetch('/exams/api/settings');
            const settings = await resSettings.json();
            
            const response = await fetch('/exams/api/export-manual-distribution-template', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(settings)
            });
            if (!response.ok) throw new Error(_t('فشل التصدير من الخادم'));

            // ✨ التعديل الجديد: دعم استخراج الأسماء باللغتين العربية (UTF-8) والإنجليزية
            let filename = _t('مخطط_توزيع_المواد.xlsx'); 
            const disposition = response.headers.get('Content-Disposition');
            
            if (disposition) {
                // البحث أولاً عن الاسم المرمز بـ UTF-8 (ليدعم اللغة العربية)
                const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
                if (utf8Match && utf8Match[1]) {
                    filename = decodeURIComponent(utf8Match[1]);
                } else {
                    // البحث عن الاسم العادي (للغة الإنجليزية)
                    const asciiMatch = disposition.match(/filename=(?:"([^"]+)"|([^;]+))/i);
                    if (asciiMatch) {
                        filename = asciiMatch[1] || asciiMatch[2];
                    }
                }
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename; // ✨ سيتم وضع الاسم الصحيح هنا سواء بالعربية أو الإنجليزية
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showNotification(_t("تم تصدير الملف بنجاح. يمكنك الآن تعديله."), "success");
        } catch (error) {
            console.error(error);
            showNotification(_t("حدث خطأ أثناء تصدير المخطط."), "error");
        } finally {
            exportBtn.textContent = originalText;
            exportBtn.disabled = false;
        }
    });

    importBtn.addEventListener('click', () => {
        statusP.textContent = '';
        fileInput.click();
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);

        fetch('/exams/api/import-manual-distribution', {
            method: 'POST',
            body: formData,
        })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showNotification(data.message, 'success');
                statusP.textContent = data.message;
                statusP.style.color = 'green';
            } else {
                showNotification(data.error || _t("فشل الاستيراد"), 'error');
                statusP.textContent = data.error || _t("فشل الاستيراد");
                statusP.style.color = 'red';
            }
        })
        .catch(error => {
            statusP.textContent = `${_t('خطأ: ')}${error.message}`;
            statusP.style.color = 'red';
        })
        .finally(() => { fileInput.value = ''; });
    });

    clearBtn.addEventListener('click', () => {
        if (!confirm(_t("هل أنت متأكد؟ سيؤدي هذا إلى حذف الجدول اليدوي الذي استوردته والعودة إلى وضع التوزيع التلقائي للمواد."))) return;

        fetch('/exams/api/clear-manual-distribution', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            showNotification(data.message, 'success');
            statusP.textContent = data.message;
            statusP.style.color = '#007bff'; 
        })
        .catch(error => {
            console.error(error);
            showNotification(_t("حدث خطأ"), 'error');
        });
    });
}

function toggleAlgoSettings(algoId) {
    const isChecked = document.getElementById(`chk-${algoId}`).checked;
    const settingsDiv = document.getElementById(`setting-${algoId}`);
    if (settingsDiv) {
        settingsDiv.style.display = isChecked ? 'block' : 'none';
    }
}

// ==========================================
// 📢 نشر جدول الحراسة لحسابات الأساتذة
// ==========================================
function publishExamSchedule() {
    if (!lastGeneratedSchedule) {
        showNotification(_t("لا يوجد جدول جاهز لنشره. الرجاء توليد الجدول أولاً."), "error");
        return;
    }
    
    if (!confirm(_t("⚠️ هل أنت متأكد من نشر هذا الجدول؟ سيظهر فوراً في حسابات جميع الأساتذة."))) return;

    const btn = document.getElementById('publish-schedule-button');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = _t('⏳ جاري النشر...');

    fetch('/exams/api/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lastGeneratedSchedule)
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification(data.error || _t('حدث خطأ أثناء النشر'), 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showNotification(_t('حدث خطأ في الاتصال'), 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = originalText;
    });
}

// ==========================================
// 🚫 سحب وإلغاء جدول الحراسة من حسابات الأساتذة
// ==========================================
function unpublishExamSchedule() {
    if (!confirm(_t("⚠️ هل أنت متأكد من سحب الجدول؟ سيختفي الجدول فوراً من حسابات جميع الأساتذة، ولن يروه حتى تقوم بنشره من جديد."))) return;

    const btn = document.getElementById('unpublish-schedule-button');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = _t('⏳ جاري السحب...');

    fetch('/exams/api/unpublish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showNotification(data.message, 'success');
        } else {
            showNotification(data.error || _t('حدث خطأ أثناء السحب'), 'error');
        }
    })
    .catch(err => {
        console.error(err);
        showNotification(_t('حدث خطأ في الاتصال بالخادم'), 'error');
    })
    .finally(() => {
        btn.disabled = false;
        btn.textContent = originalText;
    });
}