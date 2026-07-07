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
             if (settings.tabuIter) document.getElementById('tabu-iter').value = settings.tabuIter;
             if (settings.tabuSize) document.getElementById('tabu-size').value = settings.tabuSize;
             if (settings.tabuTenure) document.getElementById('tabu-tenure').value = settings.tabuTenure;
        }
    } catch (e) {
        console.error('لم يتم العثور على إعدادات محفوظة مسبقاً للخوارزميات:', e);
    }

    // --- 2. أزرار النسخ الاحتياطي والاستعادة ---
    const backupBtn = document.getElementById('backup-btn');
    const restoreBtn = document.getElementById('restore-btn');
    const resetBtn = document.getElementById('reset-all-btn');

    if(backupBtn) {
        backupBtn.addEventListener('click', async () => {
            try {
                const response = await fetch('/exams/api/backup');
                if (!response.ok) throw new Error('فشل النسخ الاحتياطي');
                
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `ExamGuard_SaaS_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                a.remove();
                showNotification('تم تحميل النسخة الاحتياطية بنجاح.', 'success');
            } catch (error) { showNotification('حدث خطأ أثناء تصدير النسخة.', 'error'); }
        });
    }

    // 🌟 تعديل سحابي (SaaS): تعطيل الاستيراد المباشر لحماية تداخل البيانات بين الأقسام
    if(restoreBtn) {
        restoreBtn.addEventListener('click', () => {
            alert("🔒 حماية سحابية: ميزة الاسترجاع المباشر معطلة في بيئة (SaaS) لمنع الكتابة الخاطئة فوق بيانات الكلية. يرجى التواصل مع مدير النظام أو الدعم الفني لرفع ملف الاسترجاع الخاص بك.");
        });
    }

    if(resetBtn) {
        resetBtn.addEventListener('click', () => {
            if (confirm("تحذير خطير! هل أنت متأكد من مسح جميع بيانات امتحانات القسم نهائياً للبدء من الصفر؟")) {
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
            saveSettingsBtn.textContent = '⏳ جاري الحفظ الشامل...';
            
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
                currentSettings.tabuIter = document.getElementById('tabu-iter')?.value;
                currentSettings.tabuSize = document.getElementById('tabu-size')?.value;
                currentSettings.tabuTenure = document.getElementById('tabu-tenure')?.value;

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
                    showNotification('تم حفظ جميع البيانات والإعدادات في كافة المراحل بنجاح! 💾', 'success');
                }, 500);
                
            } catch (e) {
                console.error(e);
                showNotification('حدث خطأ أثناء الحفظ الشامل.', 'error');
            } finally {
                saveSettingsBtn.textContent = '💾 حفظ الإعدادات';
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
                <h2 style="color: #3f51b5; margin-bottom: 5px; margin-top: 0;">🎓 موزع حراسة الامتحانات الذكي</h2>
                <p style="color: #666; margin-top: 0; font-size: 14px;">(Smart Exam Invigilation Scheduler - SaaS Edition)</p>
                <span style="display: inline-block; background: #e8f5e9; color: #2e7d32; padding: 5px 15px; border-radius: 20px; font-weight: bold; margin: 10px 0;">الإصدار السحابي 2.0</span>
                <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
                <p style="font-size: 16px; margin-bottom: 5px;">تم تصميم وتطوير هذا النظام السحابي المدمج بواسطة:</p>
                <h3 style="color: #d32f2f; margin: 0;">الدكتور شعيب يحيى</h3>
                <p style="color: #888; font-size: 13px; margin-top: 25px; margin-bottom: 0;">جميع الحقوق محفوظة © 2026</p>
            </div>
        `;
        openCustomModal('ℹ️ عن البرنامج', aboutContent);
    });

    document.getElementById('help-button')?.addEventListener('click', () => {
        const helpContent = `
            <p style="font-weight: bold; color: #3f51b5; margin-top: 0;">💡 دليل استخدام النظام - مراحل العمل:</p>
            <ul style="padding-right: 20px; margin-bottom: 20px; list-style-type: none;">
                <li style="margin-bottom: 12px;"><b>1️⃣ المرحلة 1 (البيانات الأساسية):</b> إدخال قوائم الأساتذة، القاعات، المستويات، والمواد.</li>
                <li style="margin-bottom: 12px;"><b>2️⃣ المرحلة 2 (إدارة البيانات):</b> مراجعة، تعديل، أو حذف البيانات التي تم إدخالها.</li>
                <li style="margin-bottom: 12px;"><b>3️⃣ المرحلة 3 (الإسناد والقاعات):</b> إسناد المواد لأساتذتها، وتحديد القاعات المخصصة لكل مستوى.</li>
                <li style="margin-bottom: 12px;"><b>4️⃣ المرحلة 4 (الأيام والأوقات):</b> بناء الهيكل الزمني وتحديد أيام وفترات الامتحانات.</li>
                <li style="margin-bottom: 12px;"><b>5️⃣ المرحلة 5 (القيود والشروط):</b> ضبط غيابات الأساتذة، أنماط العمل، التنافر، والحدود القصوى.</li>
                <li style="margin-bottom: 12px;"><b>6️⃣ المرحلة 6 (التوليد والتصدير):</b> تشغيل الخوارزميات الذكية لإنشاء جداول الحراسة وتصديرها.</li>
                <li style="margin-bottom: 12px;"><b>7️⃣ المرحلة 7 (النسخ الاحتياطي):</b> أخذ نسخة احتياطية من جميع البيانات.</li>
            </ul>
            <div style="background: #fff3cd; color: #856404; padding: 12px; border-radius: 5px; border: 1px solid #ffeeba; font-size: 14px;">
                <b>⚠️ تلميح هام:</b> تأكد من حفظ إعدادات كل مرحلة (عبر زر الحفظ الأخضر) قبل الانتقال للمرحلة التي تليها!
            </div>
        `;
        openCustomModal('❓ مساعدة ودليل الاستخدام', helpContent);
    });
});