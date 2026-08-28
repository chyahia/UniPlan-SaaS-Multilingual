document.addEventListener('DOMContentLoaded', async () => {
    // --- 1. جلب إعدادات الخوارزمية وعرضها في الحقول عند تحديث الصفحة ---
    try {
        const res = await fetch('/exams/api/settings');
        if (res.ok) {
             const settings = await res.json();
             // تعبئة حقول الخوارزميات إذا كانت موجودة في قاعدة البيانات
             if (settings.algorithm) document.getElementById('algorithm-select').value = settings.algorithm;
             if (settings.unifiedIter) document.getElementById('unified-iter').value = settings.unifiedIter;
             if (settings.unifiedDestroy) document.getElementById('unified-destroy').value = settings.unifiedDestroy;
             if (settings.lnsIter) document.getElementById('lns-iter').value = settings.lnsIter;
             if (settings.lnsDestroy) document.getElementById('lns-destroy').value = settings.lnsDestroy;
             if (settings.vnsIter) document.getElementById('vns-iter').value = settings.vnsIter;
             if (settings.vnsK) document.getElementById('vns-k').value = settings.vnsK;
        }
    } catch (e) {
        console.error(_t('لم يتم العثور على إعدادات محفوظة مسبقاً للخوارزميات:'), e);
    }

    // --- 2. أزرار النسخ الاحتياطي والاستعادة ---
    const backupBtn = document.getElementById('backup-btn');
    const restoreBtn = document.getElementById('restore-btn');
    const resetBtn = document.getElementById('reset-all-btn');

    if(backupBtn) {
        backupBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/exams/api/backup');
                if (!response.ok) throw new Error(_t('فشل النسخ الاحتياطي'));
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ExamGuard_SaaS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                showNotification(_t('تم تحميل النسخة الاحتياطية بنجاح.'), 'success');
            } catch (error) { showNotification(_t('حدث خطأ أثناء تصدير النسخة.'), 'error'); }
        });
    }

    // 🌟 تفعيل الاسترجاع السحابي الآمن لبرنامج الامتحانات
    if (restoreBtn) {
        // إنشاء عنصر مخفي لاختيار الملفات برمجياً
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.json';
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        // فتح نافذة اختيار الملفات عند النقر على الزر
        restoreBtn.addEventListener('click', () => fileInput.click());
        
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (!file) return;
            
            // رسالة تأكيد تطمئن رئيس القسم
            if (!confirm(_t("⚠️ تحذير: سيتم مسح بيانات الامتحانات الحالية (فقط) واستبدالها ببيانات الملف المرفوع.\n\n(لن تتأثر الجداول الدراسية وقوائم التدريس إطلاقاً).\n\nهل أنت متأكد من الاستمرار؟"))) {
                fileInput.value = ''; 
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    fetch('/exams/api/restore', { 
                        method: 'POST', 
                        headers: { 'Content-Type': 'application/json' }, 
                        body: JSON.stringify(data) 
                    })
                    .then(res => res.json())
                    .then(res => {
                        if (res.success) { 
                            alert(res.message); 
                            location.reload(); 
                        } else {
                            showNotification(res.error, 'error'); 
                        }
                    });
                } catch (error) { 
                    showNotification(_t('ملف غير صالح.'), 'error'); 
                }
            };
            reader.readAsText(file);
        });
    }

    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm(_t("تحذير خطير! هل أنت متأكد من مسح جميع بيانات امتحانات القسم نهائياً للبدء من الصفر؟"))) {
                fetch('/exams/api/reset-all', { method: 'POST' }).then(res => res.json()).then(res => {
                    if(res.success) { alert(res.message); location.reload(); }
                    else { showNotification(res.error, 'error'); }
                });
            }
        });
    }

    // --- 3. زر حفظ الإعدادات الشامل (Global Save) ---
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async () => {
            saveSettingsBtn.textContent = _t('⏳ جاري الحفظ الشامل...');
            
            try {
                // الخطوة 1: حفظ المرحلة 5 بانتظار (await) لضمان دمجها في قاعدة البيانات أولاً
                if (typeof saveAllConditions === 'function') {
                    await saveAllConditions(false); 
                }

                // الخطوة 2: جلب قاعدة البيانات (والتي تحتوي الآن على إعدادات المرحلة 5 بأمان)
                const res = await fetch('/exams/api/settings');
                let currentSettings = await res.json();

                // الخطوة 3: دمج إعدادات الخوارزميات (المرحلة 6) معها
                currentSettings.algorithm = document.getElementById('algorithm-select')?.value;
                currentSettings.unifiedIter = document.getElementById('unified-iter')?.value;
                currentSettings.unifiedDestroy = document.getElementById('unified-destroy')?.value;
                currentSettings.lnsIter = document.getElementById('lns-iter')?.value;
                currentSettings.lnsDestroy = document.getElementById('lns-destroy')?.value;
                currentSettings.vnsIter = document.getElementById('vns-iter')?.value;
                currentSettings.vnsK = document.getElementById('vns-k')?.value;
                

                // الخطوة 4: حفظ البيانات النهائية المكتملة السحابية
                await fetch('/exams/api/settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(currentSettings)
                });

                // الخطوة 5: حفظ المرحلة 3 و 4 
                if (typeof saveBulkLevelHalls === 'function') saveBulkLevelHalls();
                if (typeof saveExamSchedule === 'function') saveExamSchedule();

                // إشعار نجاح مجمع
                setTimeout(() => {
                    showNotification(_t('تم حفظ جميع البيانات والإعدادات في كافة المراحل بنجاح! 💾'), 'success');
                }, 500);
                
            } catch (e) {
                console.error(e);
                showNotification(_t('حدث خطأ أثناء الحفظ الشامل.'), 'error');
            } finally {
                saveSettingsBtn.textContent = _t('💾 حفظ الإعدادات');
            }
        });
    }

    // ==========================================
    // --- 5. أزرار المساعدة والنافذة المنبثقة ---
    // ==========================================
    
    window.openCustomModal = function(title, contentHTML) {
        document.getElementById('modal-title').innerHTML = title;
        document.getElementById('modal-body').innerHTML = contentHTML;
        document.getElementById('custom-modal').style.display = 'flex';
    };

    window.closeCustomModal = function() {
        document.getElementById('custom-modal').style.display = 'none';
    };

    // إغلاق النافذة عند النقر خارجها (على الخلفية المظلمة)
    window.addEventListener('click', function(event) {
        const modal = document.getElementById('custom-modal');
        if (event.target === modal) {
            closeCustomModal();
        }
    });

    document.getElementById('about-button')?.addEventListener('click', () => {
        const aboutContent = `
            <div style="text-align: center; padding: 10px;">
                <h2 style="color: #3f51b5; margin-bottom: 5px; margin-top: 0;">${_t('🎓 نظام حراسة الامتحانات')}</h2>
                <p style="color: #666; margin-top: 0; font-size: 14px;">(Smart Exam Invigilation Scheduler - SaaS Edition)</p>
                <span style="display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 5px 15px; border-radius: 20px; font-weight: bold; margin: 10px 0;">${_t('الإصدار السحابي 2.0')}</span>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 16px; margin-bottom: 5px;">${_t('تم تصميم وتطوير هذا النظام السحابي المدمج بواسطة:')}</p>
                <h3 style="color: #d32f2f; margin: 0;">${_t('الدكتور شعيب يحيى')}</h3>
                <p style="color: #888; font-size: 13px; margin-top: 25px; margin-bottom: 0;">${_t('جميع الحقوق محفوظة © 2026')}</p>
            </div>
        `;
        openCustomModal(_t('ℹ️ عن البرنامج'), aboutContent);
    });

    document.getElementById('help-button')?.addEventListener('click', () => {
        const helpContent = `
            <p style="font-weight: bold; color: #3f51b5; margin-top: 0;">${_t('💡 دليل استخدام النظام - مراحل العمل:')}</p>
            <ul style="padding-right: 20px; margin-bottom: 20px; list-style-type: none;">
                <li style="margin-bottom: 12px;">${_t('<b>1️⃣ المرحلة 1 (البيانات الأساسية):</b> إدخال قوائم الأساتذة، القاعات، المستويات، والمواد.')}</li>
                <li style="margin-bottom: 12px;">${_t('<b>2️⃣ المرحلة 2 (إدارة البيانات):</b> مراجعة، تعديل، أو حذف البيانات التي تم إدخالها.')}</li>
                <li style="margin-bottom: 12px;">${_t('<b>3️⃣ المرحلة 3 (الإسناد والقاعات):</b> إسناد المواد لأساتذتها، وتحديد القاعات المخصصة لكل مستوى.')}</li>
                <li style="margin-bottom: 12px;">${_t('<b>4️⃣ المرحلة 4 (الأيام والأوقات):</b> بناء الهيكل الزمني وتحديد أيام وفترات الامتحانات.')}</li>
                <li style="margin-bottom: 12px;">${_t('<b>5️⃣ المرحلة 5 (القيود والشروط):</b> ضبط غيابات الأساتذة، أنماط العمل، التنافر، والحدود القصوى.')}</li>
                <li style="margin-bottom: 12px;">${_t('<b>6️⃣ المرحلة 6 (التوليد والتصدير):</b> تشغيل الخوارزميات الذكية لإنشاء جداول الحراسة وتصديرها.')}</li>
                <li style="margin-bottom: 12px;">${_t('<b>7️⃣ المرحلة 7 (النسخ الاحتياطي):</b> أخذ نسخة احتياطية من جميع البيانات.')}</li>
            </ul>
            <div style="background: #fff3cd; color: #856404; padding: 12px; border-radius: 5px; border: 1px solid #ffeeba; font-size: 14px;">
                ${_t('<b>⚠️ تلميح هام:</b> تأكد من حفظ إعدادات كل مرحلة (عبر زر الحفظ الأخضر) قبل الانتقال للمرحلة التي تليها!')}
            </div>
        `;
        openCustomModal(_t('❓ مساعدة ودليل الاستخدام'), helpContent);
    });
});

// =========================================================
// 🚀 أزرار المرحلة 7 (تصدير واستيراد الجدول النهائي إكسل)
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // 1. تصدير الجدول النهائي
    const exportFinalExcelBtn = document.getElementById('export-final-excel-btn');
    if (exportFinalExcelBtn) {
        exportFinalExcelBtn.addEventListener('click', () => {
            // المتغير lastGeneratedSchedule يتم تعريفه في generation.js
            if (typeof lastGeneratedSchedule === 'undefined' || !lastGeneratedSchedule) {
                showNotification(_t("لا يوجد جدول جاهز للتصدير. الرجاء توليد الجدول في المرحلة 6 أولاً."), "error");
                return;
            }
            
            const originalText = exportFinalExcelBtn.textContent;
            exportFinalExcelBtn.disabled = true;
            exportFinalExcelBtn.textContent = _t('⏳ جاري التصدير...');

            fetch('/exams/api/export-final-excel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(lastGeneratedSchedule)
            })
            .then(res => {
                if (!res.ok) throw new Error(_t("فشل التصدير"));
                
                // 🌟 التعديل الجديد: دعم استخراج الأسماء باللغتين العربية (UTF-8) والإنجليزية
                let filename = _t('الجدول_النهائي_للحراسة.xlsx'); // الاسم الافتراضي
                const disposition = res.headers.get('Content-Disposition');
                
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

                // إرجاع الكائن الثنائي (Blob) مع اسم الملف معاً للخطوة القادمة
                return res.blob().then(blob => ({ blob, filename }));
            })
            .then(({ blob, filename }) => {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename; // 🌟 استخدام الاسم الديناميكي هنا
                document.body.appendChild(a);
                a.click();
                a.remove();
                showNotification(_t("تم تصدير الجدول بنجاح"), 'success');
            })
            .catch(err => {
                console.error(err);
                showNotification(_t("حدث خطأ أثناء تصدير الجدول"), "error");
            })
            .finally(() => {
                exportFinalExcelBtn.disabled = false;
                exportFinalExcelBtn.textContent = originalText;
            });
        });
    }

    // 2. استيراد الجدول النهائي ونشره
    const importFinalExcelBtn = document.getElementById('import-final-excel-btn');
    const importFinalExcelInput = document.getElementById('import-final-excel-file');
    
    if (importFinalExcelBtn && importFinalExcelInput) {
        importFinalExcelBtn.addEventListener('click', () => {
            const file = importFinalExcelInput.files[0];
            if (!file) {
                showNotification(_t("الرجاء اختيار ملف إكسل أولاً."), "error");
                return;
            }
            
            if (!confirm(_t("هل أنت متأكد؟ سيتم استيراد هذا الجدول واعتماده ونشره فوراً للأساتذة."))) return;

            const formData = new FormData();
            formData.append('file', file);

            const originalText = importFinalExcelBtn.textContent;
            importFinalExcelBtn.disabled = true;
            importFinalExcelBtn.textContent = _t('⏳ جاري الاستيراد والنشر...');

            fetch('/exams/api/import-final-excel', {
                method: 'POST',
                body: formData
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    showNotification(data.message, 'success');
                    // تحديث الجدول في الذاكرة لتتطابق الواجهة مع ما تم رفعه
                    if (typeof lastGeneratedSchedule !== 'undefined') {
                        lastGeneratedSchedule = data.schedule; 
                    }
                } else {
                    showNotification(data.error || _t("حدث خطأ أثناء الاستيراد"), "error");
                }
            })
            .catch(err => showNotification(_t("خطأ في الاتصال بالخادم"), "error"))
            .finally(() => {
                importFinalExcelBtn.disabled = false;
                importFinalExcelBtn.textContent = originalText;
                importFinalExcelInput.value = ''; // تفريغ الحقل
            });
        });
    }
});