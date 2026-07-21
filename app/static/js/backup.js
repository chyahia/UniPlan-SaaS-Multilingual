// ================= إدارة الإعدادات المحفوظة (Profiles) والخوارزميات =================

// 1. زر حفظ الإعدادات
const btnSaveSettings = document.getElementById('btn-save-settings');
if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
        if(typeof saveStructure === 'function' && scheduleStructure && scheduleStructure.length > 0) saveStructure();
        if(typeof saveAllConditions === 'function') saveAllConditions();
        saveAlgorithmSettings();
        // ✨ تغليف نص النجاح
        alert(_t("تم حفظ إعدادات المراحل (الهيكل، القيود، الخوارزميات) كإعدادات افتراضية."));
    });
}

// دالة حفظ إعدادات المرحلة 6
function saveAlgorithmSettings() {
    const selectedAlgorithms = Array.from(document.querySelectorAll('.algo-chk:checked')).map(cb => cb.value);

    const algoSettings = {
        selected_algorithms: selectedAlgorithms,
        lns_iterations: document.getElementById('lns_iter')?.value || 500,
        lns_ruin_factor: document.getElementById('lns_ruin')?.value || 20,
        lns_stagnation_threshold: document.getElementById('lns_stagnation')?.value || 15,
        vns_iterations: document.getElementById('vns_iter')?.value || 300,
        vns_k_max: document.getElementById('vns_k')?.value || 5,
        vns_stagnation_threshold: document.getElementById('vns_stagnation')?.value || 15,
        strict_hierarchy: document.getElementById('strict-hierarchy-chk')?.checked || false
    };

    fetch('/api/algorithm-settings', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(algoSettings)
    });
}

// استرجاع إعدادات الخوارزميات عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/algorithm-settings')
    .then(res => res.json())
    .then(data => {
        if (Object.keys(data).length > 0) {
            if (data.selected_algorithms) {
                document.querySelectorAll('.algo-chk').forEach(chk => {
                    chk.checked = data.selected_algorithms.includes(chk.value);
                    chk.dispatchEvent(new Event('change')); 
                });
            }

            if(data.lns_iterations && document.getElementById('lns_iter')) document.getElementById('lns_iter').value = data.lns_iterations;
            if(data.lns_ruin_factor && document.getElementById('lns_ruin')) document.getElementById('lns_ruin').value = data.lns_ruin_factor;
            if(data.lns_stagnation_threshold && document.getElementById('lns_stagnation')) document.getElementById('lns_stagnation').value = data.lns_stagnation_threshold;
            if(data.vns_iterations && document.getElementById('vns_iter')) document.getElementById('vns_iter').value = data.vns_iterations;
            if(data.vns_k_max && document.getElementById('vns_k')) document.getElementById('vns_k').value = data.vns_k_max;
            if(data.vns_stagnation_threshold && document.getElementById('vns_stagnation')) document.getElementById('vns_stagnation').value = data.vns_stagnation_threshold;
            if(data.strict_hierarchy !== undefined && document.getElementById('strict-hierarchy-chk')) {
                document.getElementById('strict-hierarchy-chk').checked = data.strict_hierarchy;
            }
        }
    });
});

// ================= نظام "حفظ باسم" و "استعادة" السحابي (SaaS) =================

// 2. زر "حفظ باسم" (يحفظ في قاعدة البيانات السحابية المعزولة)
const btnSaveAs = document.getElementById('btn-save-as');
if (btnSaveAs) {
    btnSaveAs.addEventListener('click', async () => {
        // ✨ تغليف نص المطالبة
        const profileName = prompt(_t("أدخل اسماً لهذه الإعدادات (مثال: إعدادات الفصل الأول):"));
        if (!profileName) return;

        try {
            const structRes = await fetch('/api/structure');
            const structure = await structRes.json();
            
            const condRes = await fetch('/api/conditions');
            const conditions = await condRes.json();
            
            const algoRes = await fetch('/api/algorithm-settings');
            const algorithms = await algoRes.json();

            const snapshot = {
                structure: structure,
                conditions: conditions,
                algorithms: algorithms
            };
            
            const res = await fetch('/api/profiles', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: profileName, data: snapshot })
            });

            if (res.ok) {
                // ✨ تقسيم السلسلة لترجمتها مع المتغيرات
                alert(_t("☁️ تم حفظ الإعدادات باسم:") + ` "${profileName}" ` + _t("بنجاح في السحابة! يمكنك الوصول إليها من أي جهاز."));
            }
        } catch (e) {
            alert(_t("حدث خطأ أثناء الحفظ في السحابة: ") + e);
        }
    });
}

// 3. زر "استعادة" (يجلب النماذج من السحابة ثم يطبقها)
const btnRestore = document.getElementById('btn-restore');
if (btnRestore) {
    btnRestore.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/profiles');
            const profiles = await res.json();
            const profileNames = Object.keys(profiles);
            
            if (profileNames.length === 0) {
                alert(_t("لا توجد إعدادات محفوظة مسبقاً لاستعادتها في حسابك."));
                return;
            }

            let message = _t("اختر رقم الإعدادات التي تريد استعادتها:\n\n");
            profileNames.forEach((name, index) => {
                message += `${index + 1}. ${name}\n`;
            });

            const choice = prompt(message);
            if(!choice) return; 
            const selectedIndex = parseInt(choice) - 1;

            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < profileNames.length) {
                const selectedName = profileNames[selectedIndex];
                const data = profiles[selectedName];
                
                if(data.structure) await fetch('/api/structure', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data.structure)});
                if(data.conditions) await fetch('/api/conditions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data.conditions)});
                if(data.algorithms) await fetch('/api/algorithm-settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data.algorithms)});
                
                // ✨ ترجمة متداخلة
                alert(`✅ ${_t("تمت استعادة إعدادات")} "${selectedName}" ${_t("بنجاح! سيتم تحديث الصفحة لتطبيقها.")}`);
                window.location.reload(); 
            } else {
                alert(_t("رقم غير صحيح، تم إلغاء الاستعادة."));
            }
        } catch(e) {
            alert(_t("حدث خطأ أثناء الاتصال بالسحابة لجلب الإعدادات: ") + e);
        }
    });
}

// 4. زر "حذف إعدادات" (يحذفها نهائياً من السحابة)
const btnDeleteProfile = document.getElementById('btn-delete-profile');
if (btnDeleteProfile) {
    btnDeleteProfile.addEventListener('click', async () => {
        try {
            const res = await fetch('/api/profiles');
            const profiles = await res.json();
            const profileNames = Object.keys(profiles);
            
            if (profileNames.length === 0) {
                alert(_t("لا توجد إعدادات محفوظة مسبقاً لحذفها."));
                return;
            }

            let message = _t("اختر رقم الإعدادات التي تريد حذفها نهائياً:\n\n");
            profileNames.forEach((name, index) => {
                message += `${index + 1}. ${name}\n`;
            });

            const choice = prompt(message);
            if(!choice) return; 
            
            const selectedIndex = parseInt(choice) - 1;

            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < profileNames.length) {
                const selectedName = profileNames[selectedIndex];
                
                // ✨ تقسيم التأكيد ليتم ترجمة ما قبل المتغير وما بعده
                if(confirm(`${_t("هل أنت متأكد جداً من أنك تريد حذف إعدادات")} "${selectedName}" ${_t("نهائياً من السحابة؟ لا يمكن التراجع عن هذا الإجراء.")}`)) {
                    
                    await fetch('/api/profiles', {
                        method: 'DELETE',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ name: selectedName })
                    });
                    
                    alert(`🗑️ ${_t("تم حذف إعدادات")} "${selectedName}" ${_t("بنجاح!")}`);
                }
            } else {
                alert(_t("رقم غير صحيح، تم إلغاء الحذف."));
            }
        } catch(e) {
            alert(_t("حدث خطأ في الاتصال بالسحابة: ") + e);
        }
    });
}

// دالة رفع واستعادة قاعدة البيانات بالكامل
function restoreBackup() {
    const fileInput = document.getElementById('backup-file');
    if (!fileInput || !fileInput.files.length || !fileInput.files[0].name.endsWith('.json')) {
        return alert(_t("الرجاء اختيار ملف النسخة الاحتياطية (.json) أولاً!"));
    }
    
    if (!confirm(_t("⚠️ تحذير: استعادة النسخة الاحتياطية ستمسح بيانات القسم الحالية بالكامل وتحل محلها بالبيانات الموجودة في الملف. (لن تتأثر الأقسام الأخرى). هل أنت متأكد من المتابعة؟"))) {
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    const btn = event.target;
    const originalText = btn.innerHTML;
    // ✨ تغليف مع الحفاظ على الأيقونة
    btn.innerHTML = "⏳ " + _t("جاري الرفع والاستعادة...");
    btn.disabled = true;

    fetch('/api/backup/import', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        
        if (data.success) {
            // (رسالة data.message عادة تأتي من الباك إند ويجب ترجمتها هناك)
            alert("✅ " + data.message);
            window.location.reload(); 
        } else {
            // ✨ استخدام الترجمة للكلمة الثابتة
            alert("❌ " + _t("خطأ: ") + data.error);
        }
    })
    .catch(err => {
        btn.innerHTML = originalText;
        btn.disabled = false;
        alert(_t("حدث خطأ في الاتصال أثناء رفع الملف."));
    });
}