// =========================================================
// 🌐 SUPABASE API
// =========================================================
const SUPABASE_URL = 'https://khlmhyzhzpbpirmudbxg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RVxWpPNclnP2ATXQBUQlPQ_6NcmHMCa';

function getHeaders() { const t = sessionStorage.getItem('supabase_admin_token'); return { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${t || SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' }; }
let dbProducts = [], dbServices = [], dbPortfolio = [], dbSettings = { tg_token: '', tg_chat_ids: [], contacts: ['+7 (800) 000-00-00', '', ''] };

async function fetchDB(table) { try { const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, { headers: getHeaders() }); return await res.json(); } catch (e) { return []; } }
async function mutateDB(table, method, bodyData, id = null) {
    const url = id ? `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}` : `${SUPABASE_URL}/rest/v1/${table}`;
    const opts = { method, headers: getHeaders() }; if (bodyData) opts.body = JSON.stringify(bodyData);
    const res = await fetch(url, opts); if (!res.ok) throw new Error('Ошибка БД');
}

async function initApp() {
    const [p, s, port, set] = await Promise.all([fetchDB('products'), fetchDB('services'), fetchDB('portfolio'), fetchDB('settings')]);
    dbProducts = p || []; dbServices = s || []; dbPortfolio = port || [];
    if (set?.length) { dbSettings = set[0]; if(typeof dbSettings.tg_chat_ids === 'string') dbSettings.tg_chat_ids = JSON.parse(dbSettings.tg_chat_ids); if(typeof dbSettings.contacts === 'string') dbSettings.contacts = JSON.parse(dbSettings.contacts); }
    renderContacts();
    if (document.getElementById('catalog-grid')) { renderCatalog(); const catParam = new URLSearchParams(window.location.search).get('category'); if (catParam) { setCustomSelectValue('custom-category', catParam); } else { applyAdvancedFilters(); } }
    if (document.getElementById('services-grid')) renderServices();
    if (document.getElementById('portfolio-grid')) renderPortfolio();
    if (document.getElementById('admin-login-screen') && sessionStorage.getItem('supabase_admin_token')) { document.getElementById('admin-login-screen').classList.add('hidden'); document.getElementById('admin-workspace').classList.remove('hidden'); document.getElementById('btn-logout').classList.remove('hidden'); renderAdminLists(); initAdminSettings(); }
}
document.addEventListener('DOMContentLoaded', initApp);

// =========================================================
// 🔒 AUTH
// =========================================================
const authForm = document.getElementById('auth-form');
if (authForm) {
    authForm.addEventListener('submit', async (e) => {
        e.preventDefault(); const em = document.getElementById('auth-email').value.trim(); const pw = document.getElementById('auth-password').value.trim(); const btn = document.getElementById('auth-submit-btn'); const err = document.getElementById('auth-error');
        btn.innerText = 'Вход...'; err.classList.add('hidden');
        try {
            const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ email:em, password:pw }) });
            const data = await res.json();
            if (res.ok && data.access_token) { sessionStorage.setItem('supabase_admin_token', data.access_token); window.location.reload(); } else { err.innerText = (res.status === 400) ? 'Неверно' : (data.error_description || 'Ошибка'); err.classList.remove('hidden'); }
        } catch (error) { err.innerText = 'Сетевая ошибка'; err.classList.remove('hidden'); }
        btn.innerText = 'Войти';
    });
}
if (document.getElementById('btn-logout')) document.getElementById('btn-logout').addEventListener('click', () => { sessionStorage.removeItem('supabase_admin_token'); window.location.reload(); });

// =========================================================
// 📸 DRAG DROP
// =========================================================
function setupImageUploader(zoneId, inputId, previewId, hiddenInputId, textId) {
    const dropZone = document.getElementById(zoneId); const fileInput = document.getElementById(inputId); if (!dropZone || !fileInput) return;
    dropZone.addEventListener('click', () => fileInput.click()); dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); }); dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover')); dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) processImage(e.dataTransfer.files[0], previewId, hiddenInputId, textId); }); fileInput.addEventListener('change', (e) => { if (e.target.files.length) processImage(e.target.files[0], previewId, hiddenInputId, textId); });
}
function processImage(file, previewId, hiddenInputId, textId) {
    if (!file.type.startsWith('image/')) return; const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (e) => { const img = new Image(); img.src = e.target.result; img.onload = () => { const canvas = document.createElement('canvas'); const scaleSize = 800 / img.width; canvas.width = 800; canvas.height = img.height * scaleSize; canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height); const b64 = canvas.toDataURL('image/jpeg', 0.7); document.getElementById(previewId).src = b64; document.getElementById(previewId).classList.remove('hidden'); document.getElementById(hiddenInputId).value = b64; document.getElementById(textId).classList.add('hidden'); }; };
}
if (document.getElementById('admin-product-form')) { setupImageUploader('product-drop-zone', 'product-file-input', 'product-preview', 'admin-image', 'product-drop-text'); setupImageUploader('port-drop-zone', 'port-file-input', 'port-preview', 'port-image', 'port-drop-text'); }

// =========================================================
// ⚙️ SELECTS
// =========================================================
document.querySelectorAll(".custom-select").forEach(sel => {
  const selected = sel.querySelector(".select-selected"); const items = sel.querySelector(".select-items");
  selected.addEventListener("click", function(e) { e.stopPropagation(); document.querySelectorAll(".select-items").forEach(el => { if(el !== items) el.classList.add("select-hide"); }); document.querySelectorAll(".select-selected").forEach(el => { if(el !== selected) el.classList.remove("select-arrow-active"); }); items.classList.toggle("select-hide"); this.classList.toggle("select-arrow-active"); });
  items.querySelectorAll("div").forEach(opt => { opt.addEventListener("click", function(e) { selected.innerHTML = this.innerHTML; sel.setAttribute('data-value', this.getAttribute('data-val')); items.querySelectorAll(".same-as-selected").forEach(el => el.classList.remove("same-as-selected")); this.classList.add("same-as-selected"); selected.click(); handleFilterChange(sel); }); });
});
document.addEventListener("click", () => { document.querySelectorAll(".select-items").forEach(el => el.classList.add("select-hide")); document.querySelectorAll(".select-selected").forEach(el => el.classList.remove("select-arrow-active")); });
function handleFilterChange(sel) {
    if (sel.id === 'custom-category' && document.getElementById('catalog-grid')) {
        const val = sel.getAttribute('data-value'); document.querySelectorAll('.specific-filter').forEach(group => { group.classList.add('hidden'); group.querySelector('.custom-select').setAttribute('data-value', 'all'); });
        if (val === 'panels') { ['power','cell','efficiency','frame'].forEach(id => document.getElementById(`filter-group-${id}`).classList.remove('hidden')); } else if (val === 'inverters') { ['phase','voltage'].forEach(id => document.getElementById(`filter-group-${id}`).classList.remove('hidden')); } else if (val === 'batteries') { ['capacity','voltage'].forEach(id => document.getElementById(`filter-group-${id}`).classList.remove('hidden')); }
        const newUrl = window.location.pathname + (val === 'all' ? '' : '?category=' + val); window.history.replaceState({path:newUrl}, '', newUrl); applyAdvancedFilters();
    } else if (sel.id.startsWith('custom-') && document.getElementById('catalog-grid')) applyAdvancedFilters();
    else if (sel.id === 'admin-category') {
        const val = sel.getAttribute('data-value'); document.querySelectorAll('.panels-only').forEach(el => { if(val === 'panels') el.classList.remove('hidden'); else el.classList.add('hidden'); }); document.querySelectorAll('.inv-bat-only').forEach(el => { if(val === 'inverters' || val === 'batteries') el.classList.remove('hidden'); else el.classList.add('hidden'); }); document.querySelectorAll('.inv-only').forEach(el => { if(val === 'inverters') el.classList.remove('hidden'); else el.classList.add('hidden'); }); document.querySelectorAll('.bat-only').forEach(el => { if(val === 'batteries') el.classList.remove('hidden'); else el.classList.add('hidden'); });
    }
}
function setCustomSelectValue(selectId, value) {
  const sel = document.getElementById(selectId); if (!sel) return; sel.setAttribute('data-value', value); sel.querySelectorAll('.select-items div').forEach(opt => { opt.classList.remove('same-as-selected'); if (opt.getAttribute('data-val') === value) { opt.classList.add('same-as-selected'); sel.querySelector('.select-selected').innerHTML = opt.innerHTML; } }); handleFilterChange(sel);
}

// =========================================================
// ⚙️ ADMIN
// =========================================================
document.querySelectorAll('.tab-btn').forEach(btn => { btn.addEventListener('click', (e) => { document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active')); document.querySelectorAll('.admin-tab-content').forEach(f => f.classList.add('hidden')); e.target.classList.add('active'); document.getElementById(e.target.dataset.target).classList.remove('hidden'); }); });
function showAdminSuccess() { const m = document.getElementById('admin-success'); if(m) { m.classList.remove('hidden'); setTimeout(()=>m.classList.add('hidden'),3000); } }
function resetImg(pId, hId, tId) { const p = document.getElementById(pId), h = document.getElementById(hId), t = document.getElementById(tId); if(p){p.src=''; p.classList.add('hidden');} if(h)h.value=''; if(t)t.classList.remove('hidden'); }
function loadImg(b64, pId, hId, tId) { if(b64 && b64.trim()!=='') { const p = document.getElementById(pId); p.src=b64; p.classList.remove('hidden'); document.getElementById(hId).value=b64; document.getElementById(tId).classList.add('hidden'); } else resetImg(pId, hId, tId); }

let editIds = { products: null, services: null, portfolio: null };
function renderAdminLists() {
  const prodList = document.getElementById('admin-products-list');
  if (prodList) { prodList.innerHTML = dbProducts.map((p, idx) => { let specs = p.specs_card ? p.specs_card.map(s => `<div><span>${s.label}</span> <strong>${s.value}</strong></div>`).join('') : ''; return `<div class="tech-card card-base card-item" data-id="${idx}">${p.image?`<img src="${p.image}" class="product-image-rendered" loading="lazy">`:''}<h3>${p.title}</h3><p class="card-sub">${p.subtitle}</p><div class="card-specs">${specs}</div><div class="card-footer"><span class="price">${p.price}</span><div class="card-actions"><button type="button" class="btn btn-sm btn-drawer flex-2">👀 Вид</button><button type="button" class="btn btn-sm btn-edit flex-2" onclick="editItem('products',${idx})">Ред.</button><button type="button" class="btn btn-sm btn-delete flex-2" onclick="deleteItem('products',${idx})">Удал.</button></div></div></div>`; }).join(''); }
  const servList = document.getElementById('admin-services-list');
  if (servList) { servList.innerHTML = dbServices.map((s, idx) => `<div class="service-card card-base card-item card-item-center"><h3 class="service-title">${s.title}</h3><div class="service-price">${s.price}</div><p class="service-desc">${s.desc_text}</p><div class="card-actions"><button type="button" class="btn btn-sm btn-edit flex-2" onclick="editItem('services',${idx})">Ред.</button><button type="button" class="btn btn-sm btn-delete flex-2" onclick="deleteItem('services',${idx})">Удал.</button></div></div>`).join(''); }
  const portList = document.getElementById('admin-portfolio-list');
  if (portList) { portList.innerHTML = dbPortfolio.map((p, idx) => { let img = p.images?`<img src="${p.images}" class="port-img" loading="lazy">`:`<div class="mock-img port-img">📸</div>`; return `<div class="portfolio-card card-base card-item" data-id="${idx}">${img}<div class="port-content"><h3 class="port-title">${p.title}</h3><p class="port-desc">${p.desc_text}</p><div class="card-actions"><button type="button" class="btn btn-sm btn-drawer-port flex-2">👀 Вид</button><button type="button" class="btn btn-sm btn-edit flex-2" onclick="editItem('portfolio',${idx})">Ред.</button><button type="button" class="btn btn-sm btn-delete flex-2" onclick="deleteItem('portfolio',${idx})">Удал.</button></div></div></div>`; }).join(''); }
}
window.deleteItem = async function(table, idx) { const dataArray = table === 'products' ? dbProducts : (table === 'services' ? dbServices : dbPortfolio); if(confirm("Удалить запись?")) { try { await mutateDB(table, 'DELETE', null, dataArray[idx].id); await initApp(); } catch(err) { alert(err.message); } } }
window.editItem = function(table, i) {
    const item = (table === 'products' ? dbProducts : (table === 'services' ? dbServices : dbPortfolio))[i]; editIds[table] = item.id;
    if (table === 'products') { document.getElementById('admin-title').value = item.title; document.getElementById('admin-price').value = item.price; document.getElementById('admin-subtitle').value = item.subtitle || ''; document.getElementById('admin-desc').value = item.desc_text || ''; document.getElementById('admin-quantity').value = parseInt(item.specs_card?.[0]?.value) || 0; loadImg(item.image,'product-preview','admin-image','product-drop-text'); ['category','stock','brand','power','efficiency','frame','phase','voltage','capacity'].forEach(k=>setCustomSelectValue('admin-'+k, item[k]||'all')); setCustomSelectValue('admin-cell-type', item.cell||'all'); } else if (table === 'services') { document.getElementById('service-title').value = item.title; document.getElementById('service-price').value = item.price; document.getElementById('service-desc').value = item.desc_text; } else if (table === 'portfolio') { document.getElementById('port-title').value = item.title; document.getElementById('port-savings').value = item.savings || ''; document.getElementById('port-price').value = item.price || ''; document.getElementById('port-equipment').value = item.equipment || ''; document.getElementById('port-desc').value = item.desc_text || ''; loadImg(item.images,'port-preview','port-image','port-drop-text'); }
    document.getElementById(`btn-submit-${table}`).innerText = 'Сохранить изменения'; document.getElementById(`btn-cancel-${table}`).classList.remove('hidden'); window.scrollTo(0,0);
}
const cancelEdit = (table) => { editIds[table] = null; document.getElementById(`admin-${table === 'products' ? 'product' : table}-form`).reset(); if(table === 'products') resetImg('product-preview','admin-image','product-drop-text'); if(table === 'portfolio') resetImg('port-preview','port-image','port-drop-text'); document.getElementById(`btn-submit-${table}`).innerText = table === 'portfolio' ? '+ Опубликовать' : '+ Сохранить'; document.getElementById(`btn-cancel-${table}`).classList.add('hidden'); }
['products', 'services', 'portfolio'].forEach(t => { const btn = document.getElementById(`btn-cancel-${t}`); if(btn) btn.onclick = () => cancelEdit(t); });
async function handleAdminSubmit(e, table, getPayload) { e.preventDefault(); const btn = document.getElementById(`btn-submit-${table}`); const origText = btn.innerText; btn.innerText = "Отправка..."; try { const payload = getPayload(); if(editIds[table] !== null) { await mutateDB(table, 'PATCH', payload, editIds[table]); editIds[table] = null; } else { await mutateDB(table, 'POST', payload); } showAdminSuccess(); cancelEdit(table); await initApp(); } catch (err) { alert("Ошибка при сохранении: " + err.message); } btn.innerText = origText; }
if (document.getElementById('admin-product-form')) {
    document.getElementById('admin-product-form').onsubmit = (e) => handleAdminSubmit(e, 'products', () => { const getV = id => document.getElementById(id)?.getAttribute('data-value') || 'all'; const cat = getV('admin-category'); const qty = parseInt(document.getElementById('admin-quantity').value) || 0; return { title: document.getElementById('admin-title').value, subtitle: document.getElementById('admin-subtitle').value||'', desc_text: document.getElementById('admin-desc').value||'', price: document.getElementById('admin-price').value, image: document.getElementById('admin-image').value, category: cat, stock: getV('admin-stock'), brand: getV('admin-brand'), power: cat==='panels'?getV('admin-power'):'all', cell: cat==='panels'?getV('admin-cell-type'):'all', efficiency: cat==='panels'?getV('admin-efficiency'):'all', frame: cat==='panels'?getV('admin-frame'):'all', phase: cat==='inverters'?getV('admin-phase'):'all', voltage: (cat==='inverters'||cat==='batteries')?getV('admin-voltage'):'all', capacity: cat==='batteries'?getV('admin-capacity'):'all', specs_card: [{label:"Доступно:",value: qty + " шт."}], specs_full: [{label:"В наличии:",value: qty + " шт."}] }; });
    document.getElementById('admin-service-form').onsubmit = (e) => handleAdminSubmit(e, 'services', () => ({title: document.getElementById('service-title').value, price: document.getElementById('service-price').value, desc_text: document.getElementById('service-desc').value}));
    document.getElementById('admin-portfolio-form').onsubmit = (e) => handleAdminSubmit(e, 'portfolio', () => ({title: document.getElementById('port-title').value, savings: document.getElementById('port-savings').value, price: document.getElementById('port-price').value, equipment: document.getElementById('port-equipment').value, images: document.getElementById('port-image').value, desc_text: document.getElementById('port-desc').value}));
}
function initAdminSettings() {
    if (document.getElementById('admin-contacts-form')) { const c = dbSettings.contacts || []; document.getElementById('contact-1').value = c[0]||''; document.getElementById('contact-2').value = c[1]||''; document.getElementById('contact-3').value = c[2]||''; document.getElementById('admin-contacts-form').onsubmit = async (e) => { e.preventDefault(); try { const newC = [document.getElementById('contact-1').value.trim(), document.getElementById('contact-2').value.trim(), document.getElementById('contact-3').value.trim()]; await mutateDB('settings', 'PATCH', { contacts: JSON.stringify(newC) }, 1); showAdminSuccess(); await initApp(); } catch (err) { alert(err.message); } }; }
    if (document.getElementById('admin-telegram-form')) {
        document.getElementById('tg-token-input').value = dbSettings.tg_token || ''; const cList = document.getElementById('tg-chatids-list'); cList.innerHTML = (dbSettings.tg_chat_ids?.length) ? dbSettings.tg_chat_ids.map((chat,i)=>`<div style="display:flex;justify-content:space-between;background:rgba(255,255,255,0.05);padding:8px;border-radius:4px"><div><strong style="color:var(--accent-neon);font-size:14px">${chat.label}</strong><br><span style="font-size:12px;color:var(--text-muted)">${chat.id}</span></div><button type="button" class="btn btn-sm btn-delete" onclick="deleteTgChat(${i})">Удалить</button></div>`).join('') : '<span style="color:gray;font-size:13px">Пусто</span>';
        document.getElementById('tg-add-btn').onclick = async () => { const l=document.getElementById('tg-new-label').value.trim()||'Без имени', i=document.getElementById('tg-new-chatid').value.trim(); if(!i)return; const chatIds = [...(dbSettings.tg_chat_ids||[])]; if(!chatIds.find(c=>c.id===i)){ try { chatIds.push({id:i,label:l}); await mutateDB('settings', 'PATCH', { tg_chat_ids: JSON.stringify(chatIds) }, 1); document.getElementById('tg-new-label').value=''; document.getElementById('tg-new-chatid').value=''; await initApp(); } catch (err) { alert(err.message); } } };
        document.getElementById('admin-telegram-form').onsubmit = async (e) => { e.preventDefault(); try { await mutateDB('settings', 'PATCH', { tg_token: document.getElementById('tg-token-input').value.trim() }, 1); showAdminSuccess(); await initApp(); } catch (err) { alert(err.message); } };
    }
}
window.deleteTgChat = async function(idx) { const chatIds = [...(dbSettings.tg_chat_ids||[])]; chatIds.splice(idx, 1); try { await mutateDB('settings', 'PATCH', { tg_chat_ids: JSON.stringify(chatIds) }, 1); await initApp(); } catch (err) { alert(err.message); } }
function renderContacts() {
    const contacts = dbSettings.contacts || []; const headerList = document.getElementById('header-contacts-list');
    if (headerList) headerList.innerHTML = contacts.map(phone => phone.trim() ? `<li><a href="tel:${phone.replace(/[^\d+]/g, '')}">${phone}</a></li>` : '').join('') || '<li><a href="#">Нет номеров</a></li>';
    const footerPhone = document.getElementById('footer-phone'); if (footerPhone) { if (contacts[0]?.trim()) { footerPhone.innerText = contacts[0]; footerPhone.href = `tel:${contacts[0].replace(/[^\d+]/g, '')}`; footerPhone.style.display = 'block'; } else { footerPhone.style.display = 'none'; } }
}

// =========================================================
// 🛒 UI AND CATALOG
// =========================================================
function renderCatalog() {
  const g = document.getElementById('catalog-grid'); if(!g) return; g.innerHTML='';
  g.innerHTML = dbProducts.map((p,i) => { let s = p.specs_card ? p.specs_card.map(sc => `<div><span>${sc.label}</span> <strong>${sc.value}</strong></div>`).join('') : ''; return `<div class="tech-card card-base card-item" data-id="${i}" data-category="${p.category}" data-stock="${p.stock}" data-brand="${p.brand||'all'}" data-power="${p.power}" data-cell="${p.cell}" data-efficiency="${p.efficiency||'all'}" data-frame="${p.frame||'all'}" data-phase="${p.phase}" data-voltage="${p.voltage||'all'}" data-capacity="${p.capacity}">${p.image?`<img src="${p.image}" class="product-image-rendered" loading="lazy">`:''}<h3>${p.title}</h3><p class="card-sub">${p.subtitle}</p><div class="card-specs">${s}</div><div class="card-footer"><span class="price">${p.price}</span><button class="btn btn-sm btn-drawer">Посмотреть</button></div></div>`; }).join('');
}
function applyAdvancedFilters() {
    const cards = document.querySelectorAll('.tech-card'); if(!cards.length) return;
    const gV = id => document.getElementById(id)?.getAttribute('data-value') || 'all';
    const f = { c:gV('custom-category'), s:gV('custom-stock'), b:gV('custom-brand'), pw:gV('custom-power'), cl:gV('custom-cell'), ef:gV('custom-efficiency'), fr:gV('custom-frame'), cp:gV('custom-capacity'), ph:gV('custom-phase'), v:gV('custom-voltage') };
    cards.forEach(card => { const d = card.dataset; let ok = (f.c==='all'||d.category===f.c) && (f.s==='all'||d.stock===f.s) && (f.b==='all'||d.brand===f.b); if(f.c==='panels') ok = ok && (f.pw==='all'||d.power===f.pw) && (f.cl==='all'||d.cell===f.cl) && (f.ef==='all'||d.efficiency===f.ef) && (f.fr==='all'||d.frame===f.fr); else if(f.c==='batteries') ok = ok && (f.cp==='all'||d.capacity===f.cp) && (f.v==='all'||d.voltage===f.v); else if(f.c==='inverters') ok = ok && (f.ph==='all'||d.phase===f.ph) && (f.v==='all'||d.voltage===f.v); card.style.display = ok ? 'flex' : 'none'; if(ok) card.style.animation='fadeInSlide 0.4s ease-out'; });
}
function renderServices() { const sGrid = document.getElementById('services-grid'); if (!sGrid) return; sGrid.innerHTML = dbServices.map(s => `<div class="service-card card-base card-item card-item-center"><h3 class="service-title">${s.title}</h3><div class="service-price">${s.price}</div><p class="service-desc">${s.desc_text}</p><button class="btn btn-sm btn-full mt-auto btn-lead" data-service="${s.title}">Оставить заявку</button></div>`).join(''); }
function renderPortfolio() { const pg = document.getElementById('portfolio-grid'); if(!pg) return; pg.innerHTML = dbPortfolio.map((p,i) => { let img = p.images?`<img src="${p.images}" class="port-img" loading="lazy">`:`<div class="mock-img port-img">📸</div>`; return `<div class="portfolio-card card-base card-item" data-id="${i}">${img}<div class="port-content"><h3 class="port-title">${p.title}</h3><p class="port-desc">${p.desc_text}</p><button class="btn btn-sm btn-drawer-port mt-auto btn-full">Посмотреть детали</button></div></div>`; }).join(''); }
function openDrawer(title, desc, price, imgHtml, specsHtml) { document.getElementById('u-title').innerText = title; document.getElementById('u-desc').innerText = desc; document.getElementById('u-price').innerText = price; document.getElementById('u-img').innerHTML = imgHtml; document.getElementById('u-specs').innerHTML = specsHtml; document.getElementById('u-drawer-overlay')?.classList.add('active'); document.getElementById('u-drawer')?.classList.add('active'); document.body.style.overflow='hidden'; }
document.addEventListener('click', (e) => {
  const btnLead = e.target.closest('.btn-lead'); if (btnLead) { document.getElementById('lead-hidden-service').value = btnLead.getAttribute('data-service'); document.getElementById('lead-service-name').innerText = `Услуга: ${btnLead.getAttribute('data-service')}`; document.getElementById('lead-modal')?.classList.add('active'); document.body.style.overflow = 'hidden'; }
  if (e.target.closest('.btn-drawer')) { const p = dbProducts[e.target.closest('.tech-card').dataset.id]; if(p) { const img = p.image ? `<img src="${p.image}" loading="lazy">` : '📸'; const specs = p.specs_full ? p.specs_full.map(s=>`<li><strong>${s.label}</strong> ${s.value}</li>`).join('') : ''; openDrawer(p.title, p.desc_text, p.price, img, specs); } }
  if (e.target.closest('.btn-drawer-port')) { const p = dbPortfolio[e.target.closest('.portfolio-card').dataset.id]; if(p) { const img = p.images ? `<img src="${p.images}" loading="lazy">` : '📸'; let sHtml = ''; if(p.equipment) sHtml+=`<li><strong>Оборудование:</strong> ${p.equipment}</li>`; if(p.savings) sHtml+=`<li><strong>Экономия:</strong> ${p.savings}</li>`; openDrawer(p.title, p.desc_text, p.price || '-', img, sHtml); } }
});
const closeDrawers = () => { document.querySelectorAll('.drawer-overlay, .drawer-panel').forEach(e=>e.classList.remove('active')); document.body.style.overflow=''; };
['u-close','u-close-btn2','u-drawer-overlay'].forEach(id=>{ document.getElementById(id)?.addEventListener('click', closeDrawers); });
document.getElementById('close-lead-modal')?.addEventListener('click', () => { document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; }); document.getElementById('lead-modal')?.addEventListener('click', (e) => { if(e.target === e.currentTarget) { e.target.classList.remove('active'); document.body.style.overflow = ''; } });
const tgForm = document.getElementById('telegram-form');
if (tgForm) {
  tgForm.addEventListener('submit', function(e) {
    e.preventDefault(); const token = dbSettings.tg_token; const chatIds = dbSettings.tg_chat_ids || []; if (!token || chatIds.length === 0) { alert("Настройте токен и Chat ID в панели администратора!"); return; }
    const btn = document.getElementById('lead-submit-btn'); btn.innerText = "Отправка..."; btn.disabled = true; const name = document.getElementById('lead-name').value; const phone = document.getElementById('lead-phone').value; const service = document.getElementById('lead-hidden-service').value; const comment = document.getElementById('lead-comment').value; const text = `🔔 *Новая заявка с сайта CASPIAN SUN*\n\n👤 *Имя:* ${name}\n📞 *Телефон:* ${phone}\n💼 *Услуга:* ${service}\n💬 *Комментарий:* ${comment ? comment : 'Без комментария'}`;
    let requests = chatIds.map(chat => fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat.id}&text=${encodeURIComponent(text)}&parse_mode=Markdown`));
    Promise.all(requests).then(responses => { if(responses.every(res => res.ok)) { document.getElementById('lead-success').classList.remove('hidden'); tgForm.reset(); setTimeout(() => { document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; document.getElementById('lead-success').classList.add('hidden'); btn.innerText = "Отправить заявку"; btn.disabled = false; }, 2500); } else { alert("Ошибка отправки."); btn.innerText = "Отправить заявку"; btn.disabled = false; } }).catch(() => { alert("Сетевая ошибка."); btn.innerText = "Отправить заявку"; btn.disabled = false; });
  });
}
const rs = document.getElementById('roofArea'), rn = document.getElementById('roofAreaNum'), bs = document.getElementById('monthlyBill'), bn = document.getElementById('monthlyBillNum'), pRes = document.getElementById('powerRes'), sRes = document.getElementById('savingsRes'), pbRes = document.getElementById('paybackRes');
function calc() { if(!rs || !bs) return; const r = Number(rs.value), b = Number(bs.value); if(rn) rn.value = r; if(bn) bn.value = b; const m = (r * 0.16).toFixed(1); const s = Math.round(b * 12 * 0.8); if(pRes) pRes.innerText = `${m} кВт`; if(sRes) sRes.innerText = `~${s.toLocaleString('ru-RU')} ₽`; if(pbRes) pbRes.innerText = `~${((m * 85000) / s).toFixed(1)} года`; }
if(rs) { rs.oninput=calc; bs.oninput=calc; rn.oninput=e=>{rs.value=e.target.value;calc()}; bn.oninput=e=>{bs.value=e.target.value;calc()}; calc(); }
const burgerBtn = document.getElementById('burger-btn'); const navMenu = document.querySelector('.nav');
if (burgerBtn && navMenu) { burgerBtn.addEventListener('click', () => { navMenu.classList.toggle('active'); if(navMenu.classList.contains('active')){ burgerBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-neon)" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'; } else { burgerBtn.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent-neon)" stroke-width="2"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>'; } }); }
document.querySelectorAll('.dropdown-toggle').forEach(drop => { drop.addEventListener('click', (e) => { if (window.innerWidth <= 768) { e.preventDefault(); e.target.closest('.dropdown').classList.toggle('mobile-open'); } }); });
document.querySelectorAll('.faq-question').forEach(btn => { btn.addEventListener('click', () => { const isActive = btn.classList.contains('active'); document.querySelectorAll('.faq-question').forEach(b => b.classList.remove('active')); if (!isActive) btn.classList.add('active'); }); });