const SUPABASE_URL = 'https://khlmhyzhzpbpirmudbxg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RVxWpPNclnP2ATXQBUQlPQ_6NcmHMCa';

function getHeaders() { const t = sessionStorage.getItem('supabase_admin_token'); return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${t || SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }; }
let dbServices = [], dbSettings = { tg_token: '', tg_chat_ids: [], contacts: ['+7 (800) 000-00-00', '', ''] };

async function sendDatabaseAlert(botToken, chatId, errorMessage) {
    const text = `🚨 *ВНИМАНИЕ: СБОЙ БАЗЫ ДАННЫХ!*\n\nБаза данных не отвечает или упала.\nДетали ошибки: _${errorMessage}_`;
    const url = `https://api.telegram.org/bot${botToken}/sendMessage?chat_id=${chatId}&text=${encodeURIComponent(text)}&parse_mode=Markdown`;
    try {
        await fetch(url, { method: 'GET' });
    } catch (error) {
        console.error('Ошибка отправки алерта в Telegram:', error);
    }
}

function showDbError(msg) {
    if(document.getElementById('db-error-banner')) return;
    const banner = document.createElement('div'); 
    banner.id = 'db-error-banner';
    banner.style.cssText = 'position:fixed;top:0;left:0;width:100%;background:#e74c3c;color:#fff;text-align:center;padding:12px;z-index:99999;font-family:sans-serif;font-weight:600;font-size:14px;box-shadow:0 4px 10px rgba(0,0,0,0.5);';
    banner.innerHTML = `⚠️ Ошибка базы данных (${msg}). Вероятно, проект Supabase уснул или истекла сессия. <button onclick="this.parentElement.remove()" style="margin-left:15px;background:none;border:1px solid #fff;color:#fff;padding:2px 8px;cursor:pointer;border-radius:4px;">Закрыть</button>`;
    document.body.prepend(banner);

    if (dbSettings && dbSettings.tg_token && dbSettings.tg_chat_ids && dbSettings.tg_chat_ids.length > 0) {
        dbSettings.tg_chat_ids.forEach(chat => {
            sendDatabaseAlert(dbSettings.tg_token, chat.id, msg);
        });
    }
}

async function fetchDB(table) { 
    try { 
        const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, { headers: getHeaders() }); 
        if (res.status === 401 || res.status === 403) { showDbError('401 Unauthorized'); return []; }
        if (res.status === 503) { showDbError('503 Service Unavailable'); return []; }
        if (!res.ok) return []; 
        const data = await res.json(); 
        return Array.isArray(data) ? data : []; 
    } catch (e) { showDbError('Сетевая ошибка'); return []; } 
}

async function mutateDB(table, method, bodyData, id = null) { 
    const url = id ? `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}` : `${SUPABASE_URL}/rest/v1/${table}`; 
    const opts = { method, headers: getHeaders() }; 
    if (bodyData) opts.body = JSON.stringify(bodyData); 
    const res = await fetch(url, opts); 
    if (res.status === 401) { alert("Время сессии истекло. Перезайдите в админку."); sessionStorage.removeItem('supabase_admin_token'); window.location.reload(); throw new Error('Сессия истекла'); }
    if (!res.ok) throw new Error('Ошибка БД'); 
}

async function initApp() {
    const [s, set] = await Promise.all([fetchDB('services'), fetchDB('settings')]);
    dbServices = s || [];
    if (set?.length) { dbSettings = set[0]; if(typeof dbSettings.tg_chat_ids === 'string') dbSettings.tg_chat_ids = JSON.parse(dbSettings.tg_chat_ids); if(typeof dbSettings.contacts === 'string') dbSettings.contacts = JSON.parse(dbSettings.contacts); }
    
    renderContacts();
    if (document.getElementById('services-grid')) renderServices();
    if (document.getElementById('admin-login-screen') && sessionStorage.getItem('supabase_admin_token')) { 
        document.getElementById('admin-login-screen').classList.add('hidden'); 
        document.getElementById('admin-workspace').classList.remove('hidden'); 
        document.getElementById('btn-logout').classList.remove('hidden'); 
        renderAdminLists(); 
        initAdminSettings(); 
    }
}
document.addEventListener('DOMContentLoaded', initApp);

const authForm = document.getElementById('auth-form');
if (authForm) { 
    authForm.addEventListener('submit', async (e) => { 
        e.preventDefault(); 
        const em = document.getElementById('auth-email').value.trim(); 
        const pw = document.getElementById('auth-password').value.trim(); 
        const btn = document.getElementById('auth-submit-btn'); 
        const err = document.getElementById('auth-error'); 
        btn.innerText = 'Вход...'; 
        err.classList.add('hidden'); 
        try { 
            const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email:em, password:pw }) }); 
            const data = await res.json(); 
            if (res.ok && data.access_token) { 
                sessionStorage.setItem('supabase_admin_token', data.access_token); 
                window.location.reload(); 
            } else { 
                err.innerText = (res.status === 400) ? 'Неверно' : (data.error_description || 'Ошибка'); 
                err.classList.remove('hidden'); 
            } 
        } catch (error) { 
            err.innerText = 'Сетевая ошибка'; 
            err.classList.add('hidden'); 
        } 
        btn.innerText = 'Войти'; 
    }); 
}
if (document.getElementById('btn-logout')) document.getElementById('btn-logout').addEventListener('click', () => { sessionStorage.removeItem('supabase_admin_token'); window.location.reload(); });

document.querySelectorAll('.tab-btn').forEach(btn => { 
    btn.addEventListener('click', (e) => { 
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); 
        document.querySelectorAll('.admin-tab-content').forEach(f => f.classList.add('hidden')); 
        e.target.classList.add('active'); 
        document.getElementById(e.target.dataset.target).classList.remove('hidden'); 
    }); 
});
function showAdminSuccess() { const m = document.getElementById('admin-success'); if (m) { m.classList.remove('hidden'); setTimeout(() => { m.classList.add('show'); }, 10); setTimeout(() => { m.classList.remove('show'); }, 3000); } }

let editIds = { services: null };
function renderAdminLists() { 
    const servList = document.getElementById('admin-services-list'); 
    if (servList) { 
        servList.innerHTML = dbServices.map((s, idx) => `<div class="service-card card-base card-item card-item-center"><h3 class="service-title">${s.title}</h3><div class="service-price">${s.price}</div><p class="service-desc">${s.desc_text}</p><div class="card-actions"><button type="button" class="btn btn-sm btn-edit flex-2" onclick="editItem('services',${idx})">Ред.</button><button type="button" class="btn btn-sm btn-delete flex-2" onclick="deleteItem('services',${idx})">Удал.</button></div></div>`).join(''); 
    } 
}

window.deleteItem = async function(table, idx) { 
    if(confirm("Удалить запись?")) { 
        try { 
            await mutateDB(table, 'DELETE', null, dbServices[idx].id); 
            await initApp(); 
        } catch(err) { alert(err.message); } 
    } 
}

window.editItem = function(table, i) { 
    const item = dbServices[i]; 
    editIds[table] = item.id; 
    document.getElementById('service-title').value = item.title; 
    document.getElementById('service-price').value = item.price; 
    document.getElementById('service-desc').value = item.desc_text; 
    document.getElementById(`btn-submit-${table}`).innerText = 'Сохранить изменения'; 
    document.getElementById(`btn-cancel-${table}`).classList.remove('hidden'); 
    window.scrollTo(0,0); 
}

const cancelEdit = (table) => { 
    editIds[table] = null; 
    document.getElementById('admin-service-form').reset(); 
    document.getElementById(`btn-submit-${table}`).innerText = '+ Сохранить'; 
    document.getElementById(`btn-cancel-${table}`).classList.add('hidden'); 
}
const cancelBtn = document.getElementById(`btn-cancel-services`); 
if(cancelBtn) cancelBtn.onclick = () => cancelEdit('services');

async function handleAdminSubmit(e, table, getPayload) { 
    e.preventDefault(); 
    const btn = document.getElementById(`btn-submit-${table}`); 
    const origText = btn.innerText; 
    btn.innerText = "Отправка..."; 
    try { 
        const payload = getPayload(); 
        if(editIds[table] !== null) { 
            await mutateDB(table, 'PATCH', payload, editIds[table]); 
            editIds[table] = null; 
        } else { 
            await mutateDB(table, 'POST', payload); 
        } 
        showAdminSuccess(); 
        cancelEdit(table); 
        await initApp(); 
    } catch (err) { alert("Ошибка при сохранении: " + err.message); } 
    btn.innerText = origText; 
}

if (document.getElementById('admin-service-form')) { 
    document.getElementById('admin-service-form').onsubmit = (e) => handleAdminSubmit(e, 'services', () => ({
        title: document.getElementById('service-title').value, 
        price: document.getElementById('service-price').value, 
        desc_text: document.getElementById('service-desc').value
    })); 
}

function initAdminSettings() { 
    if (document.getElementById('admin-contacts-form')) { 
        const c = dbSettings.contacts || []; 
        document.getElementById('contact-1').value = c[0]||''; 
        document.getElementById('contact-2').value = c[1]||''; 
        document.getElementById('contact-3').value = c[2]||''; 
        document.getElementById('admin-contacts-form').onsubmit = async (e) => { 
            e.preventDefault(); 
            try { 
                const newC = [document.getElementById('contact-1').value.trim(), document.getElementById('contact-2').value.trim(), document.getElementById('contact-3').value.trim()]; 
                await mutateDB('settings', 'PATCH', { contacts: JSON.stringify(newC) }, 1); 
                showAdminSuccess(); 
                await initApp(); 
            } catch (err) { alert(err.message); } 
        }; 
    } 
    if (document.getElementById('admin-telegram-form')) { 
        document.getElementById('tg-token-input').value = dbSettings.tg_token || ''; 
        const cList = document.getElementById('tg-chatids-list'); 
        cList.innerHTML = (dbSettings.tg_chat_ids?.length) ? dbSettings.tg_chat_ids.map((chat,i)=>`<div style="display:flex;justify-content:space-between;background:rgba(255,255,255,0.05);padding:8px;border-radius:4px"><div><strong style="color:var(--accent-neon);font-size:14px">${chat.label}</strong><br><span style="font-size:12px;color:var(--text-muted)">${chat.id}</span></div><button type="button" class="btn btn-sm btn-delete" onclick="deleteTgChat(${i})">Удалить</button></div>`).join('') : '<span style="color:gray;font-size:13px">Пусто</span>'; 
        document.getElementById('tg-add-btn').onclick = async () => { 
            const l=document.getElementById('tg-new-label').value.trim()||'Без имени', i=document.getElementById('tg-new-chatid').value.trim(); 
            if(!i)return; 
            const chatIds = [...(dbSettings.tg_chat_ids||[])]; 
            if(!chatIds.find(c=>c.id===i)){ 
                try { 
                    chatIds.push({id:i,label:l}); 
                    await mutateDB('settings', 'PATCH', { tg_chat_ids: JSON.stringify(chatIds) }, 1); 
                    document.getElementById('tg-new-label').value=''; 
                    document.getElementById('tg-new-chatid').value=''; 
                    await initApp(); 
                } catch (err) { alert(err.message); } 
            } 
        }; 
        document.getElementById('admin-telegram-form').onsubmit = async (e) => { 
            e.preventDefault(); 
            try { 
                await mutateDB('settings', 'PATCH', { tg_token: document.getElementById('tg-token-input').value.trim() }, 1); 
                showAdminSuccess(); 
                await initApp(); 
            } catch (err) { alert(err.message); } 
        }; 
    } 
}

window.deleteTgChat = async function(idx) { 
    const chatIds = [...(dbSettings.tg_chat_ids||[])]; 
    chatIds.splice(idx, 1); 
    try { 
        await mutateDB('settings', 'PATCH', { tg_chat_ids: JSON.stringify(chatIds) }, 1); 
        await initApp(); 
    } catch (err) { alert(err.message); } 
}

function renderContacts() { 
    const contacts = dbSettings.contacts || []; 
    const headerList = document.getElementById('header-contacts-list'); 
    if (headerList) headerList.innerHTML = contacts.map(phone => phone.trim() ? `<li><a href="tel:${phone.replace(/[^\d+]/g, '')}">${phone}</a></li>` : '').join('') || '<li><a href="#">Нет номеров</a></li>'; 
    const footerPhone = document.getElementById('footer-phone'); 
    if (footerPhone) { 
        if (contacts[0]?.trim()) { 
            footerPhone.innerText = contacts[0]; 
            footerPhone.href = `tel:${contacts[0].replace(/[^\d+]/g, '')}`; 
            footerPhone.style.display = 'block'; 
        } else { footerPhone.style.display = 'none'; } 
    } 
}

function renderServices() { 
    const sGrid = document.getElementById('services-grid'); 
    if (!sGrid) return; 
    sGrid.innerHTML = dbServices.map(s => `<div class="service-card card-base card-item card-item-center"><h3 class="service-title">${s.title}</h3><div class="service-price">${s.price}</div><p class="service-desc">${s.desc_text}</p><button class="btn btn-sm btn-full mt-auto btn-lead" data-service="${s.title}">Оставить заявку</button></div>`).join(''); 
}

document.addEventListener('click', (e) => { 
    const btnLead = e.target.closest('.btn-lead'); 
    if (btnLead) { 
        document.getElementById('lead-hidden-service').value = btnLead.getAttribute('data-service'); 
        document.getElementById('lead-service-name').innerText = `Услуга: ${btnLead.getAttribute('data-service')}`; 
        document.getElementById('lead-modal')?.classList.add('active'); 
        document.body.style.overflow = 'hidden'; 
    } 
});

document.getElementById('close-lead-modal')?.addEventListener('click', () => { document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; }); 
document.getElementById('lead-modal')?.addEventListener('click', (e) => { if(e.target === e.currentTarget) { e.target.classList.remove('active'); document.body.style.overflow = ''; } });

const tgForm = document.getElementById('telegram-form'); 
if (tgForm) { 
    tgForm.addEventListener('submit', function(e) { 
        e.preventDefault(); 
        const token = dbSettings.tg_token; 
        const chatIds = dbSettings.tg_chat_ids || []; 
        if (!token || chatIds.length === 0) { alert("Настройте токен и Chat ID в панели администратора!"); return; } 
        const btn = document.getElementById('lead-submit-btn'); 
        const name = document.getElementById('lead-name').value.trim(); 
        const phone = document.getElementById('lead-phone').value.trim(); 
        const comment = document.getElementById('lead-comment') ? document.getElementById('lead-comment').value.trim() : ''; 
        const service = document.getElementById('lead-hidden-service').value; 
        
        if(name === '.' || name === '/start' || phone === '.' || phone === '/start' || comment === '.' || comment === '/start') { 
            document.getElementById('lead-success').innerText = 'Система заблокировала пустой запрос'; 
            document.getElementById('lead-success').classList.remove('hidden'); 
            setTimeout(() => {document.getElementById('lead-success').classList.add('hidden'); document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; }, 2000); 
            return; 
        } 
        btn.innerText = "Отправка..."; 
        btn.disabled = true; 
        const text = `🔔 *Новая заявка с сайта CASPIAN SUN*\n\n👤 *Имя:* ${name}\n📞 *Телефон:* ${phone}\n💼 *Услуга:* ${service}\n💬 *Комментарий:* ${comment ? comment : 'Без комментария'}`; 
        let requests = chatIds.map(chat => fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat.id}&text=${encodeURIComponent(text)}&parse_mode=Markdown`)); 
        Promise.all(requests).then(responses => { 
            if(responses.every(res => res.ok)) { 
                document.getElementById('lead-success').innerText = '✅ Заявка отправлена!'; 
                document.getElementById('lead-success').classList.remove('hidden'); 
                tgForm.reset(); 
                setTimeout(() => { document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; document.getElementById('lead-success').classList.add('hidden'); btn.innerText = "Отправить заявку"; btn.disabled = false; }, 2500); 
            } else { alert("Ошибка отправки."); btn.innerText = "Отправить заявку"; btn.disabled = false; } 
        }).catch(() => { alert("Сетевая ошибка."); btn.innerText = "Отправить заявку"; btn.disabled = false; }); 
    }); 
}

let currentTariff = 10; let currentTariffType = 'business'; let currentPricePerKw = 65000; let currentStationType = 'grid'; 
window.setOption = function(category, value, typeStr, btnElement) { 
    const container = btnElement.parentNode; 
    container.querySelectorAll('.toggle-btn').forEach(btn => btn.classList.remove('active')); 
    btnElement.classList.add('active'); 
    if (category === 'tariff') { currentTariff = value; currentTariffType = typeStr; } 
    else if (category === 'station') { currentPricePerKw = value; currentStationType = typeStr; const batBlock = document.getElementById('batteryBlock'); if(batBlock) batBlock.style.display = typeStr === 'hybrid' ? 'block' : 'none'; } 
    calculateSolar(); 
}

window.calculateSolar = function() { 
    const billInput = document.getElementById('monthlyBill'); 
    if(!billInput) return; 
    const bill = parseFloat(billInput.value); 
    const billValueEl = document.getElementById('billValue'); 
    if(billValueEl) billValueEl.innerText = bill.toLocaleString('ru-RU'); 
    let recommendedPowerKw = Math.ceil((bill / currentTariff / 30) / 4.5); 
    if(recommendedPowerKw < 3) recommendedPowerKw = 3; 
    const panelsCount = Math.ceil((recommendedPowerKw * 1000) / 620); 
    const batteriesCount = Math.ceil(recommendedPowerKw / 3.5); 
    let totalCost = recommendedPowerKw * currentPricePerKw; 
    const efficiencyRate = currentStationType === 'grid' ? 0.85 : 0.75; 
    const yearlySavings = (bill * 12) * efficiencyRate; 
    const billAfter = bill - (bill * efficiencyRate); 
    const chartBefore = document.getElementById('chartBefore'); 
    const chartAfter = document.getElementById('chartAfter'); 
    const barAfter = document.getElementById('barAfter'); 
    const visPower = document.getElementById('visPower'); 
    const visPanels = document.getElementById('visPanels'); 
    const visBatteries = document.getElementById('visBatteries'); 
    const resCost = document.getElementById('resCost'); 
    const resSavings = document.getElementById('resSavings'); 
    const labelDynamic = document.getElementById('labelDynamic'); 
    const resDynamic = document.getElementById('resDynamic'); 
    if(chartBefore) chartBefore.innerText = bill.toLocaleString('ru-RU') + ' ₽'; 
    if(chartAfter) chartAfter.innerText = Math.round(billAfter).toLocaleString('ru-RU') + ' ₽'; 
    if(barAfter) { barAfter.style.width = (100 - (efficiencyRate * 100)) + '%'; } 
    if(visPower) visPower.innerText = recommendedPowerKw + ' кВт'; 
    if(visPanels) visPanels.innerText = panelsCount + ' шт.'; 
    if(visBatteries) visBatteries.innerText = batteriesCount + ' шт.'; 
    if(resCost) resCost.innerText = 'от ' + totalCost.toLocaleString('ru-RU') + ' ₽'; 
    if(resSavings) resSavings.innerText = Math.round(yearlySavings).toLocaleString('ru-RU') + ' ₽'; 
    if(labelDynamic && resDynamic) { 
        if(currentTariffType === 'business') { 
            labelDynamic.innerText = 'Прогноз окупаемости:'; 
            resDynamic.innerText = (totalCost / yearlySavings).toFixed(1) + ' лет'; 
        } else { 
            if(currentStationType === 'grid') { 
                labelDynamic.innerText = 'Ресурс панелей:'; 
                resDynamic.innerText = '25+ лет'; 
            } else { 
                labelDynamic.innerText = 'Главное преимущество:'; 
                resDynamic.innerText = 'Защита от блэкаутов 24/7'; 
            } 
        } 
    } 
}
calculateSolar();

const burgerBtn = document.getElementById('burger-btn'); 
const navMenu = document.querySelector('.nav'); 
if (burgerBtn && navMenu) { 
    burgerBtn.addEventListener('click', () => { 
        navMenu.classList.toggle('active'); 
        if(navMenu.classList.contains('active')){ 
            burgerBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-neon)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'; 
        } else { 
            burgerBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-neon)" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>'; 
        } 
    }); 
}

document.querySelectorAll('.dropdown-toggle').forEach(drop => { 
    drop.addEventListener('click', (e) => { 
        if (window.innerWidth <= 768) { 
            e.preventDefault(); 
            e.target.closest('.dropdown').classList.toggle('mobile-open'); 
        } 
    }); 
});