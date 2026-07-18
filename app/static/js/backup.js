// ================= إدارة الإعدادات المحفوظة (Profiles) والخوارزميات =================

// 1. زر حفظ الإعدادات
const btnSaveSettings = document.getElementById('btn-save-settings');
if (btnSaveSettings) {
    btnSaveSettings.addEventListener('click', () => {
        if(typeof saveStructure === 'function' && scheduleStructure && scheduleStructure.length > 0) saveStructure();
        if(typeof saveAllConditions === 'function') saveAllConditions();
        saveAlgorithmSettings();
        alert("تم حفظ إعدادات المراحل (الهيكل، القيود، الخوارزميات) كإعدادات افتراضية.");
    });
}

// دالة حفظ إعدادات المرحلة 6
function saveAlgorithmSettings() {
    // التقاط الخوارزميات المؤشر عليها
    const selectedAlgorithms = Array.from(document.querySelectorAll('.algo-chk:checked')).map(cb => cb.value);

    const algoSettings = {
        selected_algorithms: selectedAlgorithms, // <-- السطر المضاف لحفظ المربعات
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
            
            // استرجاع المربعات المؤشرة (صح)
            if (data.selected_algorithms) {
                document.querySelectorAll('.algo-chk').forEach(chk => {
                    chk.checked = data.selected_algorithms.includes(chk.value);
                    // تفعيل الحدث لإظهار/إخفاء الإعدادات المنسدلة تحتها
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
        const profileName = prompt("أدخل اسماً لهذه الإعدادات (مثال: إعدادات الفصل الأول):");
        if (!profileName) return;

        try {
            // جلب البيانات من الخادم لضمان أنها كاملة ومحدثة
            const structRes = await fetch('/api/structure');
            const structure = await structRes.json();
            
            const condRes = await fetch('/api/conditions');
            const conditions = await condRes.json();
            
            const algoRes = await fetch('/api/algorithm-settings');
            const algorithms = await algoRes.json();

            // تجميع اللقطة
            const snapshot = {
                structure: structure,
                conditions: conditions,
                algorithms: algorithms
            };
            
            // إرسال اللقطة للحفظ في السحابة
            const res = await fetch('/api/profiles', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ name: profileName, data: snapshot })
            });

            if (res.ok) {
                alert(`☁️ تم حفظ الإعدادات باسم: "${profileName}" بنجاح في السحابة! يمكنك الوصول إليها من أي جهاز.`);
            }
        } catch (e) {
            alert("حدث خطأ أثناء الحفظ في السحابة: " + e);
        }
    });
}

// 3. زر "استعادة" (يجلب النماذج من السحابة ثم يطبقها)
const btnRestore = document.getElementById('btn-restore');
if (btnRestore) {
    btnRestore.addEventListener('click', async () => {
        try {
            // جلب النماذج المحفوظة من السحابة
            const res = await fetch('/api/profiles');
            const profiles = await res.json();
            const profileNames = Object.keys(profiles);
            
            if (profileNames.length === 0) {
                alert("لا توجد إعدادات محفوظة مسبقاً لاستعادتها في حسابك.");
                return;
            }

            let message = "اختر رقم الإعدادات التي تريد استعادتها:\n\n";
            profileNames.forEach((name, index) => {
                message += `${index + 1}. ${name}\n`;
            });

            const choice = prompt(message);
            if(!choice) return; 
            const selectedIndex = parseInt(choice) - 1;

            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < profileNames.length) {
                const selectedName = profileNames[selectedIndex];
                const data = profiles[selectedName];
                
                // استبدال الإعدادات الحالية في الخادم بالبيانات المسترجعة
                if(data.structure) await fetch('/api/structure', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data.structure)});
                if(data.conditions) await fetch('/api/conditions', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data.conditions)});
                if(data.algorithms) await fetch('/api/algorithm-settings', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data.algorithms)});
                
                alert(`✅ تمت استعادة إعدادات "${selectedName}" بنجاح! سيتم تحديث الصفحة لتطبيقها.`);
                window.location.reload(); 
            } else {
                alert("رقم غير صحيح، تم إلغاء الاستعادة.");
            }
        } catch(e) {
            alert("حدث خطأ أثناء الاتصال بالسحابة لجلب الإعدادات: " + e);
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
                alert("لا توجد إعدادات محفوظة مسبقاً لحذفها.");
                return;
            }

            let message = "اختر رقم الإعدادات التي تريد حذفها نهائياً:\n\n";
            profileNames.forEach((name, index) => {
                message += `${index + 1}. ${name}\n`;
            });

            const choice = prompt(message);
            if(!choice) return; 
            
            const selectedIndex = parseInt(choice) - 1;

            if (!isNaN(selectedIndex) && selectedIndex >= 0 && selectedIndex < profileNames.length) {
                const selectedName = profileNames[selectedIndex];
                
                if(confirm(`هل أنت متأكد جداً من أنك تريد حذف إعدادات "${selectedName}" نهائياً من السحابة؟ لا يمكن التراجع عن هذا الإجراء.`)) {
                    
                    // طلب الحذف من السحابة
                    await fetch('/api/profiles', {
                        method: 'DELETE',
                        headers: {'Content-Type': 'application/json'},
                        body: JSON.stringify({ name: selectedName })
                    });
                    
                    alert(`🗑️ تم حذف إعدادات "${selectedName}" بنجاح!`);
                }
            } else {
                alert("رقم غير صحيح، تم إلغاء الحذف.");
            }
        } catch(e) {
            alert("حدث خطأ في الاتصال بالسحابة: " + e);
        }
    });
}

// دالة رفع واستعادة قاعدة البيانات بالكامل
function restoreBackup() {
    const fileInput = document.getElementById('backup-file');
    if (!fileInput || !fileInput.files.length || !fileInput.files[0].name.endsWith('.json')) {
        return alert("الرجاء اختيار ملف النسخة الاحتياطية (.json) أولاً!");
    }
    
    if (!confirm("⚠️ تحذير: استعادة النسخة الاحتياطية ستمسح بيانات القسم الحالية بالكامل وتحل محلها بالبيانات الموجودة في الملف. (لن تتأثر الأقسام الأخرى). هل أنت متأكد من المتابعة؟")) {
        return;
    }

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);

    // إظهار رسالة تحميل
    const btn = event.target;
    const originalText = btn.innerHTML;
    btn.innerHTML = "⏳ جاري الرفع والاستعادة...";
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
            alert("✅ " + data.message);
            // تحديث الصفحة فوراً لتطبيق البيانات الجديدة في كل القوائم
            window.location.reload(); 
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