let condTeachers = [];
let condLevels = [];
let condHalls = [];
let condDays = [];

// جلب البيانات الأساسية للقيود
function initConditionsData() {
    Promise.all([
        fetch('/teachers').then(res => res.json()),
        fetch('/api/levels').then(res => res.json()),
        fetch('/rooms').then(res => res.json()),
        fetch('/api/structure').then(res => res.json()),
        fetch('/api/conditions').then(res => res.json())
    ]).then(([teachers, levels, halls, structure, savedConds]) => {
        condTeachers = teachers;
        condLevels = levels;
        condHalls = halls;
        condDays = (structure || []).map(d => d.name);
        
        renderConditionsUI();
        if(Object.keys(savedConds).length > 0) populateSavedConditions(savedConds);
    });
}

// بناء الواجهة ديناميكياً
function renderConditionsUI() {
    // 1. المعرفات
    const idContainer = document.getElementById('identifiers-container');
    idContainer.innerHTML = condLevels.map(lvl => `
        <div style="flex: 1; min-width: 150px;">
            <strong>${lvl}</strong>
            <textarea id="ident_${lvl}" rows="3" style="width:100%; font-size:12px;" placeholder="معرف 1\nمعرف 2..."></textarea>
        </div>
    `).join('');

    // 2. الجدول الشامل للأساتذة (ديناميكي بناءً على الأيام)
    const masterHead = document.getElementById('master-teachers-header');
    let thHtml = `<th>الأستاذ</th>`;
    condDays.forEach(d => thHtml += `<th>${d}</th>`);
    thHtml += `<th>بدء ح2</th><th>بدء ح3</th><th>إنهاء بـ ح3</th><th>إنهاء بـ ح4</th><th>بدء ح2 + إنهاء ح4 (يلغي ماسبقه)</th><th>قاعدة التوزيع</th>`;
    masterHead.innerHTML = thHtml;

    const masterBody = document.querySelector('#master-teachers-table tbody');
    masterBody.innerHTML = condTeachers.map(t => {
        let tr = `<tr><td><strong>${t.name}</strong></td>`;
        // مربعات الأيام
        condDays.forEach(d => tr += `<td><input type="checkbox" class="t-day-chk" data-tid="${t.id}" data-day="${d}"></td>`);
        
        // قيود البداية والنهاية
        tr += `
            <td><input type="checkbox" class="t-lim" data-tid="${t.id}" data-type="s2"></td>
            <td><input type="checkbox" class="t-lim" data-tid="${t.id}" data-type="s3"></td>
            <td><input type="checkbox" class="t-lim" data-tid="${t.id}" data-type="e3"></td>
            <td><input type="checkbox" class="t-lim" data-tid="${t.id}" data-type="e4"></td>
            <td style="background:#e8f4f8;"><input type="checkbox" class="t-lim t-lim-master" data-tid="${t.id}" data-type="always_s2_e4" onchange="checkMasterLimit(${t.id})"></td>
            <td>
                <select id="rule_${t.id}" style="font-size:11px;">
                    <option value="unspecified">غير محدد (مرن)</option>
                    <option value="group2">تجميع في يومين</option>
                    <option value="group3">تجميع في 3 أيام</option>
                    <option value="sep2">يومان منفصلان</option>
                    <option value="sep3">3 أيام منفصلة</option>
                </select>
            </td>
        </tr>`;
        return tr;
    }).join('');

    // 3. توالي القاعات
    const consecSelect = document.getElementById('consecutive-halls-rule');
    if(consecSelect) {
        consecSelect.innerHTML = `<option value="none">لا يوجد منع (السماح بالتوالي)</option>` + 
            `<option value="all">منع التوالي في جميع المدرجات</option>` +
            condHalls.map(h => `<option value="${h.name}">منع التوالي في: ${h.name}</option>`).join('');
    }

    // 4. تخصيص المدرجات والقاعات العادية
    const amphis = condHalls.filter(h => (h.type || '').trim() === 'مدرج' || (h.type || '').trim() === 'كبيرة' || (h.name || '').includes('مدرج'));
    const smallRooms = condHalls.filter(h => !amphis.includes(h));

    window.toggleRoomDropdown = function(lvl) {
        const el = document.getElementById(`room_dropdown_${lvl}`);
        if(el.style.display === 'none') {
            document.querySelectorAll('.room-dropdown').forEach(d => d.style.display = 'none');
            el.style.display = 'block';
        } else {
            el.style.display = 'none';
        }
    };

    // === إعداد البطاقات الملونة (Tags) ===
    window.updateRoomTags = function(lvl) {
        const container = document.getElementById(`tags_container_${lvl}`);
        if(!container) return;
        const checkedBoxes = document.querySelectorAll(`.room-chk[data-room-lvl="${lvl}"]:checked`);
        let tagsHtml = '';
        
        checkedBoxes.forEach(chk => {
            const roomName = chk.getAttribute('data-name');
            tagsHtml += `<span style="background: #e8f8f5; color: #16a085; border: 1px solid #a3e4d7; padding: 4px 10px; border-radius: 15px; font-size: 12px; font-weight: bold; display: inline-flex; align-items: center; gap: 5px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
                🚪 ${roomName}
            </span>`;
        });
        
        if(checkedBoxes.length === 0) {
            tagsHtml = `<span style="color: #95a5a6; font-size: 12px; font-style: italic;">لم يتم تحديد قاعات (متاح للكل)</span>`;
        }
        
        container.innerHTML = tagsHtml;
    };

    // تعديل المزامنة لتحديث البطاقات أيضاً
    window.syncExclusiveRooms = function() {
        let exclusiveClaims = {}; 
        condLevels.forEach(lvl => {
            const isExcl = document.getElementById(`lvl_small_room_excl_${lvl}`)?.checked;
            if(isExcl) {
                document.querySelectorAll(`.room-chk[data-room-lvl="${lvl}"]:checked`).forEach(chk => exclusiveClaims[chk.value] = lvl);
            }
        });
        
        condLevels.forEach(lvl => {
            document.querySelectorAll(`.room-chk[data-room-lvl="${lvl}"]`).forEach(chk => {
                const claimedBy = exclusiveClaims[chk.value];
                if(claimedBy && claimedBy !== lvl) {
                    if(chk.checked) chk.checked = false;
                    chk.disabled = true;
                    chk.parentElement.style.opacity = '0.4';
                    chk.parentElement.style.cursor = 'not-allowed';
                    chk.parentElement.title = `مغلقة: مخصصة حصرياً لـ ${claimedBy}`;
                } else {
                    chk.disabled = false;
                    chk.parentElement.style.opacity = '1';
                    chk.parentElement.style.cursor = 'pointer';
                    chk.parentElement.title = '';
                }
            });
            updateRoomTags(lvl); // تحديث البطاقات
        });
    };

    const lvlAmphiContainer = document.getElementById('level-amphis-container');
    if(lvlAmphiContainer) {
        lvlAmphiContainer.innerHTML = `<table class="overview-table" style="font-size:12px;"><tbody>` + 
            condLevels.map(lvl => `<tr>
                <td>${lvl}</td>
                <td><select id="lvl_amphi_${lvl}" style="padding: 4px; width: 100%; border-radius: 4px; border: 1px solid #bdc3c7;"><option value="">بدون تخصيص</option>${amphis.map(h => `<option value="${h.id}">${h.name}</option>`).join('')}</select></td>
            </tr>`).join('') + `</tbody></table>`;
    }

    // بناء الجدول العريض الجديد بالبطاقات الذكية
    const lvlSmallRoomContainer = document.getElementById('full-width-small-rooms-container');
    if(lvlSmallRoomContainer) {
        let html = `<div style="display: flex; flex-direction: column; gap: 10px;">`;
        
        condLevels.forEach(lvl => {
            const roomsHtml = smallRooms.map(h => 
                `<label style="display:block; padding:8px; cursor:pointer; border-bottom:1px solid #eee; transition:0.2s;">
                    <input type="checkbox" class="room-chk" data-room-lvl="${lvl}" value="${h.id}" data-name="${h.name}" onchange="updateRoomTags('${lvl}'); syncExclusiveRooms()"> 
                    <span style="font-size: 14px;">${h.name}</span>
                </label>`
            ).join('');

            html += `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px; background: #fdfdfd; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.02);">
                <div style="width: 220px; font-weight: bold; color: #2c3e50; font-size: 14px;">🎓 ${lvl}</div>
                
                <div style="flex: 1; display: flex; align-items: center; gap: 15px;">
                    <div style="position: relative;">
                        <button onclick="toggleRoomDropdown('${lvl}')" style="padding: 8px 15px; font-size: 13px; font-weight:bold; cursor:pointer; background:#3498db; color:white; border:none; border-radius:6px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: 0.2s;">⚙️ اختر القاعات</button>
                        <div id="room_dropdown_${lvl}" class="room-dropdown" style="display:none; position: absolute; z-index: 100; top: 110%; right: 0; width: 250px; max-height: 200px; overflow-y: auto; background: #fff; border: 1px solid #bdc3c7; border-radius:6px; box-shadow: 0 5px 15px rgba(0,0,0,0.15); padding: 5px;">
                            ${roomsHtml}
                        </div>
                    </div>
                    
                    <div id="tags_container_${lvl}" style="display: flex; gap: 8px; flex-wrap: wrap; flex: 1; min-height: 28px; align-items: center;">
                        </div>
                </div>

                <div style="width: 180px; text-align: left;">
                    <label title="🔒 قاعة حصرية: تفعيل هذا الخيار يمنع المستويات الأخرى" style="background: #fdf2f2; padding: 6px 10px; border-radius: 6px; border: 1px solid #fadbd8; font-size: 12px; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; color: #c0392b;">
                        <input type="checkbox" id="lvl_small_room_excl_${lvl}" onchange="syncExclusiveRooms()" style="transform: scale(1.2);"> قفل فردي للمستوى
                    </label>
                </div>
            </div>`;
        });
        
        html += `</div>`;
        lvlSmallRoomContainer.innerHTML = html;
        
        // تحديث مبدئي للبطاقات
        condLevels.forEach(lvl => updateRoomTags(lvl));
    }

    const restrictedDaySelect = document.getElementById('restricted-day-select');
    if (restrictedDaySelect && condDays && condDays.length > 0) {
        restrictedDaySelect.innerHTML = condDays.map(day => `<option value="${day}">${day}</option>`).join('');
    }

    const specBody = document.querySelector('#special-teachers-table tbody');
    if(specBody) {
        specBody.innerHTML = condTeachers.map(t => `<tr>
            <td>${t.name}</td>
            <td style="text-align:center;"><input type="checkbox" id="sat_${t.id}"></td>
            <td>
                <select id="last_${t.id}">
                    <option value="none">لا يوجد قيد</option>
                    <option value="1">منع آخر حصة</option>
                    <option value="2">منع آخر حصتين</option>
                </select>
            </td>
        </tr>`).join('');
    }

    const optContainer = document.getElementById('optimization-teachers');
    if(optContainer) {
        optContainer.innerHTML = condTeachers.map(t => `<label style="background:#fff; padding:5px; border:1px solid #ccc; border-radius:3px;"><input type="checkbox" class="opt-chk" value="${t.id}" checked> ${t.name}</label>`).join('');
    }
}

function checkMasterLimit(tid) {
    const masterChk = document.querySelector(`.t-lim-master[data-tid="${tid}"]`);
    const s2 = document.querySelector(`.t-lim[data-tid="${tid}"][data-type="s2"]`);
    const e4 = document.querySelector(`.t-lim[data-tid="${tid}"][data-type="e4"]`);
    const s3 = document.querySelector(`.t-lim[data-tid="${tid}"][data-type="s3"]`);
    const e3 = document.querySelector(`.t-lim[data-tid="${tid}"][data-type="e3"]`);

    if(masterChk && masterChk.checked) {
        if(s2) { s2.checked = false; s2.disabled = true; }
        if(e4) { e4.checked = false; e4.disabled = true; }
        if(s3) { s3.checked = false; s3.disabled = true; }
        if(e3) { e3.checked = false; e3.disabled = true; }
    } else {
        if(s2) s2.disabled = false;
        if(e4) e4.disabled = false;
        if(s3) s3.disabled = false;
        if(e3) e3.disabled = false;
    }
}

function addPairRow(containerId, val1 = "", val2 = "") {
    const container = document.getElementById(containerId);
    if(!container) return;
    const div = document.createElement('div');
    div.style.marginBottom = "5px";
    
    let html = `<select class="pair-t1"><option value="">اختر أستاذ...</option>${condTeachers.map(t=>`<option value="${t.id}" ${t.id == val1 ? 'selected' : ''}>${t.name}</option>`).join('')}</select> مع `;
    html += `<select class="pair-t2"><option value="">اختر أستاذ...</option>${condTeachers.map(t=>`<option value="${t.id}" ${t.id == val2 ? 'selected' : ''}>${t.name}</option>`).join('')}</select> `;
    html += `<button onclick="this.parentElement.remove()" style="color:red; border:none; background:none; cursor:pointer;">❌</button>`;
    
    div.innerHTML = html;
    container.appendChild(div);
}

// ================= جمع وحفظ البيانات =================
function saveAllConditions() {
    // وضعنا حماية (?.) لكي لا يتوقف الحفظ إذا كان هناك عنصر غير موجود في الشاشة
    const data = {
        identifiers: {},
        teacher_rules: {},
        weights: {
            distribution: document.getElementById('weight_distribution')?.value || 0,
            no_share: document.getElementById('weight_no_share')?.value || 0,
            saturday: document.getElementById('weight_saturday')?.value || 0,
            restricted_day: document.getElementById('restricted-day-select')?.value || 'السبت',
            last_slot: document.getElementById('weight_last_slot')?.value || 0,
            max_daily: document.getElementById('weight_max_daily')?.value || 0,
            share_pairs: document.getElementById('weight_share_pairs')?.value || 0,
            consecutive_halls: document.getElementById('weight_consecutive_halls')?.value || 0,
            morning_pref: 0,
            start_end_time: document.getElementById('weight_start_end_time')?.value || 0,
            consecutive_lectures: document.getElementById('weight_consecutive_lectures')?.value || 0,
            max_consecutive_lectures_limit: parseInt(document.getElementById('max-consecutive-lectures-limit')?.value || 2)
        },
        global: {
            days_interpretation: document.querySelector('input[name="days_rule"]:checked')?.value || 'strict',
            max_slots: document.getElementById('max-slots-per-day')?.value || 6,
            consecutive_hall_ban: document.getElementById('consecutive-halls-rule')?.value || 'none',
            rest_tue_pm: document.getElementById('rest-tue-pm')?.checked || false,
            rest_last_day_pm: document.getElementById('rest-last-day-pm')?.checked || false,
            rest_last_day_slots: parseInt(document.getElementById('rest-last-day-slots')?.value || 2),
            global_exclusive_rooms: document.getElementById('global_exclusive_rooms')?.checked || false
        },
        level_amphis: {},
        level_small_rooms: {},
        level_exclusive_rooms: {},
        special_teachers: {},
        pairs: { share: [], noshare: [] },
        optimization: {
            level: document.querySelector('input[name="opt_level"]:checked')?.value || 'normal',
            teachers: Array.from(document.querySelectorAll('.opt-chk:checked')).map(c => c.value)
        }
    };

    condLevels.forEach(lvl => {
        const el = document.getElementById(`ident_${lvl}`);
        if(el) {
            const val = el.value.trim();
            if(val) data.identifiers[lvl] = val.split('\n').map(v=>v.trim()).filter(v=>v);
        }
    });

    condTeachers.forEach(t => {
        const days = Array.from(document.querySelectorAll(`.t-day-chk[data-tid="${t.id}"]:checked`)).map(c => c.getAttribute('data-day'));
        const limits = Array.from(document.querySelectorAll(`.t-lim[data-tid="${t.id}"]:checked`)).map(c => c.getAttribute('data-type'));
        
        data.teacher_rules[t.id] = {
            days: days,
            limits: limits,
            rule: document.getElementById(`rule_${t.id}`)?.value || 'unspecified'
        };

        data.special_teachers[t.id] = {
            allow_saturday: document.getElementById(`sat_${t.id}`)?.checked || false,
            prevent_last: document.getElementById(`last_${t.id}`)?.value || 'none'
        };
    });

    condLevels.forEach(lvl => {
        const valAmphi = document.getElementById(`lvl_amphi_${lvl}`)?.value;
        if(valAmphi) data.level_amphis[lvl] = valAmphi;

        // استخراج باستخدام data-attribute المقاوم للمسافات
        const selectedRooms = Array.from(document.querySelectorAll(`.room-chk[data-room-lvl="${lvl}"]:checked`)).map(c => c.value);
        const isExclusive = document.getElementById(`lvl_small_room_excl_${lvl}`)?.checked;
        
        if(selectedRooms.length > 0) {
            data.level_small_rooms[lvl] = selectedRooms;
            if(isExclusive) data.level_exclusive_rooms[lvl] = true;
        }
    });

    document.querySelectorAll('#share-days-container div').forEach(div => {
        const t1 = div.querySelector('.pair-t1')?.value;
        const t2 = div.querySelector('.pair-t2')?.value;
        if(t1 && t2 && t1 !== t2) data.pairs.share.push([t1, t2]);
    });
    
    document.querySelectorAll('#noshare-days-container div').forEach(div => {
        const t1 = div.querySelector('.pair-t1')?.value;
        const t2 = div.querySelector('.pair-t2')?.value;
        if(t1 && t2 && t1 !== t2) data.pairs.noshare.push([t1, t2]);
    });

    fetch('/api/conditions', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(data)
    }).then(res => res.json()).then(res => {
        if(res.success) alert("تم حفظ جميع الشروط والقيود بنجاح!");
    }).catch(err => {
        alert("حدث خطأ أثناء الاتصال بالخادم.");
    });
}

function populateSavedConditions(data) {
    if(!data || Object.keys(data).length === 0) return;

    if(data.identifiers) {
        for(const [lvl, idents] of Object.entries(data.identifiers)) {
            const el = document.getElementById(`ident_${lvl}`);
            if(el) el.value = idents.join('\n');
        }
    }

    if(data.teacher_rules) {
        for(const [tid, rules] of Object.entries(data.teacher_rules)) {
            if(rules.days) {
                rules.days.forEach(d => {
                    const chk = document.querySelector(`.t-day-chk[data-tid="${tid}"][data-day="${d}"]`);
                    if(chk) chk.checked = true;
                });
            }
            if(rules.limits) {
                document.querySelectorAll(`.t-lim[data-tid="${tid}"]`).forEach(chk => {
                    chk.checked = false;
                    chk.disabled = false; 
                });

                rules.limits.forEach(lim => {
                    const chk = document.querySelector(`.t-lim[data-tid="${tid}"][data-type="${lim}"]`);
                    if(chk) chk.checked = true;
                });
                checkMasterLimit(tid);
            }
            const ruleSelect = document.getElementById(`rule_${tid}`);
            if(ruleSelect && rules.rule) ruleSelect.value = rules.rule;
        }
    }

    if(data.weights) {
        const wMap = {
            'weight_distribution': data.weights.distribution,
            'weight_no_share': data.weights.no_share,
            'weight_saturday': data.weights.saturday,
            'weight_last_slot': data.weights.last_slot,
            'weight_max_daily': data.weights.max_daily,
            'weight_share_pairs': data.weights.share_pairs,
            'weight_consecutive_halls': data.weights.consecutive_halls,
            'weight_start_end_time': data.weights.start_end_time,
            'weight_consecutive_lectures': data.weights.consecutive_lectures
        };
        for(const [id, val] of Object.entries(wMap)) {
            const el = document.getElementById(id);
            if(el && val) el.value = val;
        }

        if (data.weights.max_consecutive_lectures_limit) {
            const limitEl = document.getElementById('max-consecutive-lectures-limit');
            if (limitEl) limitEl.value = data.weights.max_consecutive_lectures_limit;
        }
        if (data.weights.restricted_day) {
            const restrictedDayEl = document.getElementById('restricted-day-select');
            if (restrictedDayEl) restrictedDayEl.value = data.weights.restricted_day;
        }
    }

    if(data.global) {
        const daysRule = document.querySelector(`input[name="days_rule"][value="${data.global.days_interpretation}"]`);
        if(daysRule) daysRule.checked = true;
        
        const maxSlots = document.getElementById('max-slots-per-day');
        if(maxSlots && data.global.max_slots) maxSlots.value = data.global.max_slots;
        
        const consHalls = document.getElementById('consecutive-halls-rule');
        if(consHalls && data.global.consecutive_hall_ban) consHalls.value = data.global.consecutive_hall_ban;
        
        const restTue = document.getElementById('rest-tue-pm');
        if(restTue) restTue.checked = !!data.global.rest_tue_pm;
        
        const restLastDay = document.getElementById('rest-last-day-pm');
        if(restLastDay) restLastDay.checked = !!data.global.rest_last_day_pm;
        
        const restLastDaySlots = document.getElementById('rest-last-day-slots');
        if(restLastDaySlots && data.global.rest_last_day_slots) restLastDaySlots.value = data.global.rest_last_day_slots;

        // ✨ استرجاع حالة القفل الشامل
        const globalExcl = document.getElementById('global_exclusive_rooms');
        if(globalExcl && data.global.global_exclusive_rooms !== undefined) {
            globalExcl.checked = !!data.global.global_exclusive_rooms;
        }
    }

    if(data.level_amphis) {
        for(const [lvl, hid] of Object.entries(data.level_amphis)) {
            const el = document.getElementById(`lvl_amphi_${lvl}`);
            if(el) el.value = hid;
        }
    }
    
    if(data.level_small_rooms) {
        for(const [lvl, r_ids] of Object.entries(data.level_small_rooms)) {
            const arr = Array.isArray(r_ids) ? r_ids : [r_ids];
            arr.forEach(rid => {
                const chk = document.querySelector(`.room-chk[data-room-lvl="${lvl}"][value="${rid}"]`);
                if(chk) chk.checked = true;
            });
            
            const exclEl = document.getElementById(`lvl_small_room_excl_${lvl}`);
            if(exclEl && data.level_exclusive_rooms && data.level_exclusive_rooms[lvl]) {
                exclEl.checked = true;
            }
        }
        
        // 1. تفعيل المزامنة لغلق القاعات الحصرية
        if(typeof syncExclusiveRooms === 'function') syncExclusiveRooms();
        
        // 2. ✨ الإضافة الجديدة: تحديث البطاقات الملونة لتظهر فوراً بعد تحميل البيانات
        if(typeof updateRoomTags === 'function') {
            condLevels.forEach(lvl => updateRoomTags(lvl));
        }
    }

    if(data.special_teachers) {
        for(const [tid, spec] of Object.entries(data.special_teachers)) {
            const sat = document.getElementById(`sat_${tid}`);
            if(sat) sat.checked = !!spec.allow_saturday;
            
            const last = document.getElementById(`last_${tid}`);
            if(last && spec.prevent_last) last.value = spec.prevent_last;
        }
    }

    if(data.optimization) {
        const optLevel = document.querySelector(`input[name="opt_level"][value="${data.optimization.level}"]`);
        if(optLevel) optLevel.checked = true;
        
        const optChks = document.querySelectorAll('.opt-chk');
        optChks.forEach(chk => {
            chk.checked = data.optimization.teachers.includes(chk.value);
        });
    }

    if (data.pairs) {
        const shareContainer = document.getElementById('share-days-container');
        if (shareContainer) shareContainer.innerHTML = '';
        if (data.pairs.share) {
            data.pairs.share.forEach(p => addPairRow('share-days-container', p[0], p[1]));
        }

        const noshareContainer = document.getElementById('noshare-days-container');
        if (noshareContainer) noshareContainer.innerHTML = '';
        if (data.pairs.noshare) {
            data.pairs.noshare.forEach(p => addPairRow('noshare-days-container', p[0], p[1]));
        }
    }
}

// ================= أزرار التحديد الشامل في إعدادات التحسين =================
function toggleOptimizationTeachers(state) {
    const optCheckboxes = document.querySelectorAll('.opt-chk');
    optCheckboxes.forEach(chk => {
        chk.checked = state;
    });
}