// دالة لفتح التبويبات
function openTab(evt, tabId) {
    // إخفاء جميع محتويات التبويبات
    var tabContents = document.getElementsByClassName("tab-content");
    for (var i = 0; i < tabContents.length; i++) {
        tabContents[i].style.display = "none";
        tabContents[i].classList.remove("active-tab");
    }

    // إزالة اللون النشط من جميع الأزرار
    var tabLinks = document.getElementsByClassName("tab-link");
    for (var i = 0; i < tabLinks.length; i++) {
        tabLinks[i].className = tabLinks[i].className.replace(" active", "");
    }

    // إظهار التبويب المطلوب وتلوين الزر
    document.getElementById(tabId).style.display = "block";
    document.getElementById(tabId).classList.add("active-tab");
    evt.currentTarget.className += " active";

    // ==========================================
    // 🔄 التزامن السحري: تحديث البيانات فور فتح التبويب
    // ==========================================
    
    // تحديث جداول المرحلة 2 عند فتحها
    if (tabId === 'tab2' && typeof refreshAllManageTables === 'function') {
        refreshAllManageTables();
    }
    
    // تحديث قوائم الإسناد في المرحلة 3 عند فتحها
    if (tabId === 'tab3' && typeof refreshAssignmentData === 'function') {
        refreshAssignmentData();
    }
    
    // تحديث بيانات الأيام والفترات في المرحلة 4 عند فتحها
    if (tabId === 'tab4' && typeof loadInitialScheduleData === 'function') {
        loadInitialScheduleData();
    }

    // تحديث القيود في المرحلة 5 عند فتحها
    if (tabId === 'tab5' && typeof loadConditionsData === 'function') {
        loadConditionsData();
    }
}

// ==========================================
// 🔔 نظام الإشعارات المنبثقة (المتوافق مع تصميمك الأصلي)
// ==========================================
function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification-area');
    
    // إذا لم يجد الحاوية، سيستخدم التنبيه العادي كإجراء احتياطي
    if (!notification) {
        alert(message);
        return;
    }

    // إعداد النص واللون (أخضر للنجاح، أحمر للخطأ)
    notification.textContent = message;
    notification.className = type; // سيضيف كلاس 'success' أو 'error'

    // إظهار الإشعار
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // إخفاء الإشعار بعد 3 ثوانٍ
    setTimeout(() => {
        notification.classList.remove('show');
    }, 3000);
}