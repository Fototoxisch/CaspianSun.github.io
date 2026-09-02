// =========================================================
// 🌐 ПОДКЛЮЧЕНИЕ К БАЗЕ ДАННЫХ SUPABASE (API)
// =========================================================
const SUPABASE_URL = 'https://khlmhyzhzpbpirmudbxg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_RVxWpPNclnP2ATXQBUQlPQ_6NcmHMCa';
const HEADERS = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
};

// Локальное хранилище данных (заполняется при загрузке)
let dbProducts = [];
let dbServices = [];
let dbPortfolio = [];
let dbSettings = { tg_token: '', tg_chat_ids: [], contacts: ['+7 (800) 000-00-00', '', ''] };

// Функции работы с базой данных
async function fetchDB(table) {
    try { const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&order=id.asc`, { headers: HEADERS }); return await res.json(); } 
    catch (e) { console.error('Ошибка загрузки', e); return []; }
}
async function insertDB(table, data) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(data) });
}
async function updateDB(table, id, data) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'PATCH', headers: HEADERS, body: JSON.stringify(data) });
}
async function deleteDB(table, id) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, { method: 'DELETE', headers: HEADERS });
}

// Инициализация сайта (загрузка данных с сервера)
async function initApp() {
    const [p, s, port, set] = await Promise.all([ fetchDB('products'), fetchDB('services'), fetchDB('portfolio'), fetchDB('settings') ]);
    dbProducts = p || []; dbServices = s || []; dbPortfolio = port || [];
    
    if (set && set.length > 0) {
        dbSettings = set[0];
        if(typeof dbSettings.tg_chat_ids === 'string') dbSettings.tg_chat_ids = JSON.parse(dbSettings.tg_chat_ids);
        if(typeof dbSettings.contacts === 'string') dbSettings.contacts = JSON.parse(dbSettings.contacts);
    }

    renderContacts();
    if (document.getElementById('catalog-grid')) { renderCatalog(); applyAdvancedFilters(); }
    if (document.getElementById('services-grid')) renderServices();
    if (document.getElementById('portfolio-grid')) renderPortfolio();
    if (document.getElementById('admin-products-list')) { renderAdminLists(); initAdminSettings(); }
}
document.addEventListener('DOMContentLoaded', initApp);

// =========================================================
// 📸 ЗАГРУЗКА ФОТО (DRAG & DROP - Конвертация)
// =========================================================
function setupImageUploader(zoneId, inputId, previewId, hiddenInputId, textId) {
    const dropZone = document.getElementById(zoneId); const fileInput = document.getElementById(inputId);
    if (!dropZone || !fileInput) return;
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
    dropZone.addEventListener('drop', (e) => { e.preventDefault(); dropZone.classList.remove('dragover'); if (e.dataTransfer.files.length) processImage(e.dataTransfer.files[0], previewId, hiddenInputId, textId); });
    fileInput.addEventListener('change', (e) => { if (e.target.files.length) processImage(e.target.files[0], previewId, hiddenInputId, textId); });
}

function processImage(file, previewId, hiddenInputId, textId) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader(); reader.readAsDataURL(file);
    reader.onload = (e) => {
        const img = new Image(); img.src = e.target.result;
        img.onload = () => {
            const canvas = document.createElement('canvas'); const scaleSize = 800 / img.width;
            canvas.width = 800; canvas.height = img.height * scaleSize;
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const b64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById(previewId).src = b64; document.getElementById(previewId).style.display = 'block';
            document.getElementById(hiddenInputId).value = b64; document.getElementById(textId).style.display = 'none';
        };
    };
}
if (document.getElementById('admin-product-form')) { setupImageUploader('product-drop-zone', 'product-file-input', 'product-preview', 'admin-image', 'product-drop-text'); setupImageUploader('port-drop-zone', 'port-file-input', 'port-preview', 'port-image', 'port-drop-text'); }

// =========================================================
// ⚙️ СЕЛЕКТЫ И ФИЛЬТРЫ
// =========================================================
document.querySelectorAll(".custom-select").forEach(sel => {
  const selected = sel.querySelector(".select-selected"); const items = sel.querySelector(".select-items");
  selected.addEventListener("click", function(e) {
      e.stopPropagation(); document.querySelectorAll(".select-items").forEach(el => { if(el !== items) el.classList.add("select-hide"); });
      document.querySelectorAll(".select-selected").forEach(el => { if(el !== selected) el.classList.remove("select-arrow-active"); });
      items.classList.toggle("select-hide"); this.classList.toggle("select-arrow-active");
  });
  items.querySelectorAll("div").forEach(opt => {
      opt.addEventListener("click", function(e) {
          selected.innerHTML = this.innerHTML; sel.setAttribute('data-value', this.getAttribute('data-val'));
          items.querySelectorAll(".same-as-selected").forEach(el => el.classList.remove("same-as-selected")); this.classList.add("same-as-selected");
          selected.click(); handleFilterChange(sel);
      });
  });
});
document.addEventListener("click", () => {
  document.querySelectorAll(".select-items").forEach(el => el.classList.add("select-hide"));
  document.querySelectorAll(".select-selected").forEach(el => el.classList.remove("select-arrow-active"));
});

function handleFilterChange(sel) {
    if (sel.id === 'custom-category' && document.getElementById('catalog-grid')) {
        const val = sel.getAttribute('data-value');
        document.querySelectorAll('.specific-filter').forEach(group => { group.style.display = 'none'; group.querySelector('.custom-select').setAttribute('data-value', 'all'); });
        if (val === 'panels') { document.getElementById('filter-group-power').style.display='flex'; document.getElementById('filter-group-cell').style.display='flex'; document.getElementById('filter-group-efficiency').style.display='flex'; document.getElementById('filter-group-frame').style.display='flex'; }
        else if (val === 'inverters') { document.getElementById('filter-group-phase').style.display='flex'; document.getElementById('filter-group-voltage').style.display='flex'; }
        else if (val === 'batteries') { document.getElementById('filter-group-capacity').style.display='flex'; document.getElementById('filter-group-voltage').style.display='flex'; }
        const newUrl = window.location.pathname + '?category=' + val; window.history.pushState({path:newUrl}, '', newUrl); applyAdvancedFilters();
    } 
    else if (sel.id.startsWith('custom-') && document.getElementById('catalog-grid')) applyAdvancedFilters();
    else if (sel.id === 'admin-category') {
        const val = sel.getAttribute('data-value');
        document.querySelectorAll('.panels-only').forEach(el => el.style.display = (val === 'panels') ? 'flex' : 'none');
        document.querySelectorAll('.inv-bat-only').forEach(el => el.style.display = (val === 'inverters' || val === 'batteries') ? 'flex' : 'none');
        document.querySelectorAll('.inv-only').forEach(el => el.style.display = (val === 'inverters') ? 'flex' : 'none');
        document.querySelectorAll('.bat-only').forEach(el => el.style.display = (val === 'batteries') ? 'flex' : 'none');
    }
}

function setCustomSelectValue(selectId, value) {
  const sel = document.getElementById(selectId); if (!sel) return;
  sel.setAttribute('data-value', value);
  sel.querySelectorAll('.select-items div').forEach(opt => {
      opt.classList.remove('same-as-selected');
      if (opt.getAttribute('data-val') === value) { opt.classList.add('same-as-selected'); sel.querySelector('.select-selected').innerHTML = opt.innerHTML; }
  });
  handleFilterChange(sel);
}

// =========================================================
// ⚙️ АДМИНКА И ВЗАИМОДЕЙСТВИЕ С SUPABASE
// =========================================================
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.admin-tab-content').forEach(f => f.style.display = 'none');
        e.target.classList.add('active'); document.getElementById(e.target.dataset.target).style.display = 'block';
    });
});
function showAdminSuccess() { const m = document.getElementById('admin-success'); if(m) { m.style.display='block'; setTimeout(()=>m.style.display='none',3000); } }
function resetImg(pId, hId, tId) { const p = document.getElementById(pId), h = document.getElementById(hId), t = document.getElementById(tId); if(p){p.src=''; p.style.display='none';} if(h)h.value=''; if(t)t.style.display='block'; }
function loadImg(b64, pId, hId, tId) { if(b64 && b64.trim()!=='') { document.getElementById(pId).src=b64; document.getElementById(pId).style.display='block'; document.getElementById(hId).value=b64; document.getElementById(tId).style.display='none'; } else resetImg(pId, hId, tId); }

let editProductId=null, editServiceId=null, editPortId=null;

function renderAdminLists() {
  const prodList = document.getElementById('admin-products-list');
  if (prodList) {
    prodList.innerHTML = ''; dbProducts.forEach((p, idx) => {
      let specs = ''; if(p.specs_card) p.specs_card.forEach(s => specs+=`<div><span>${s.label}</span> <strong>${s.value}</strong></div>`);
      prodList.innerHTML += `<div class="tech-card" data-id="${idx}">${p.image?`<img src="${p.image}" class="product-image-rendered">`:''}<h3>${p.title}</h3><p class="card-sub">${p.subtitle}</p><div class="card-specs">${specs}</div><div class="card-footer" style="flex-wrap:wrap;gap:8px;"><span class="price">${p.price}</span><div style="display:flex;gap:6px;width:100%;margin-top:10px;"><button type="button" class="btn btn-sm btn-drawer" style="flex:1">👀 Вид</button><button type="button" class="btn btn-sm btn-edit" onclick="editProduct(${idx})" style="flex:1">Ред.</button><button type="button" class="btn btn-sm btn-delete" onclick="deleteProduct(${idx})" style="flex:1">Удал.</button></div></div></div>`;
    });
  }
  const servList = document.getElementById('admin-services-list');
  if (servList) {
    servList.innerHTML = ''; dbServices.forEach((s, idx) => {
      servList.innerHTML += `<div class="service-card"><h3 class="service-title">${s.title}</h3><div class="service-price">${s.price}</div><p class="service-desc">${s.desc_text}</p><div style="display:flex;gap:8px;margin-top:auto;"><button type="button" class="btn btn-sm btn-edit" onclick="editService(${idx})" style="flex:1">Редактировать</button><button type="button" class="btn btn-sm btn-delete" onclick="deleteService(${idx})" style="flex:1">Удал.</button></div></div>`;
    });
  }
  const portList = document.getElementById('admin-portfolio-list');
  if (portList) {
    portList.innerHTML = ''; dbPortfolio.forEach((p, idx) => {
      let img = p.images?`<img src="${p.images}" style="width:100%;height:200px;object-fit:cover;border-radius:8px 8px 0 0;">`:`<div class="mock-img" style="height:200px;display:flex;align-items:center;justify-content:center;background:var(--bg-card);border-radius:8px 8px 0 0;">📸</div>`;
      portList.innerHTML += `<div class="portfolio-card" data-id="${idx}" style="background:var(--bg-card);border:1px solid var(--bg-card-border);border-radius:12px;display:flex;flex-direction:column;">${img}<div style="padding:24px;display:flex;flex-direction:column;flex:1;"><h3 style="font-size:20px;color:var(--accent-neon);margin-bottom:8px;">${p.title}</h3><p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;flex-grow:1;">${p.desc_text}</p><div style="display:flex;gap:6px;margin-top:auto;"><button type="button" class="btn btn-sm btn-drawer-port" style="flex:1">👀 Вид</button><button type="button" class="btn btn-sm btn-edit" onclick="editPortfolio(${idx})" style="flex:1">Ред.</button><button type="button" class="btn btn-sm btn-delete" onclick="deletePortfolio(${idx})" style="flex:1">Удал.</button></div></div></div>`;
    });
  }
}

window.deleteProduct = async function(i) { if(confirm("Удалить?")) { await deleteDB('products', dbProducts[i].id); await initApp(); } }
window.deleteService = async function(i) { if(confirm("Удалить?")) { await deleteDB('services', dbServices[i].id); await initApp(); } }
window.deletePortfolio = async function(i) { if(confirm("Удалить?")) { await deleteDB('portfolio', dbPortfolio[i].id); await initApp(); } }

window.editProduct = function(i) {
  const p = dbProducts[i]; editProductId = p.id;
  document.getElementById('admin-title').value = p.title; document.getElementById('admin-price').value = p.price;
  document.getElementById('admin-subtitle').value = p.subtitle || ''; document.getElementById('admin-desc').value = p.desc_text || '';
  document.getElementById('admin-quantity').value = parseInt(p.specs_card?.[0]?.value) || 0; 
  loadImg(p.image,'product-preview','admin-image','product-drop-text');
  ['category','stock','brand','power','efficiency','frame','phase','voltage','capacity'].forEach(k=>setCustomSelectValue('admin-'+k, p[k]||'all'));
  setCustomSelectValue('admin-cell-type', p.cell||'all');
  document.getElementById('btn-submit-product').innerText='Сохранить изменения'; document.getElementById('btn-cancel-product').style.display='inline-block'; window.scrollTo(0,0);
}
if(document.getElementById('btn-cancel-product')) document.getElementById('btn-cancel-product').onclick = () => {editProductId=null;document.getElementById('admin-product-form').reset();resetImg('product-preview','admin-image','product-drop-text');document.getElementById('btn-submit-product').innerText='+ Сохранить';document.getElementById('btn-cancel-product').style.display='none';}

window.editService = function(i) {
  const s = dbServices[i]; editServiceId = s.id; 
  document.getElementById('service-title').value = s.title; document.getElementById('service-price').value = s.price; document.getElementById('service-desc').value = s.desc_text;
  document.getElementById('btn-submit-service').innerText='Сохранить изменения'; document.getElementById('btn-cancel-service').style.display='inline-block'; window.scrollTo(0,0);
}
if(document.getElementById('btn-cancel-service')) document.getElementById('btn-cancel-service').onclick = () => {editServiceId=null;document.getElementById('admin-service-form').reset();document.getElementById('btn-submit-service').innerText='+ Сохранить';document.getElementById('btn-cancel-service').style.display='none';}

window.editPortfolio = function(i) {
  const p = dbPortfolio[i]; editPortId = p.id;
  document.getElementById('port-title').value = p.title; document.getElementById('port-savings').value = p.savings || '';
  document.getElementById('port-price').value = p.price || ''; document.getElementById('port-equipment').value = p.equipment || '';
  document.getElementById('port-desc').value = p.desc_text || ''; loadImg(p.images,'port-preview','port-image','port-drop-text');
  document.getElementById('btn-submit-portfolio').innerText='Сохранить изменения'; document.getElementById('btn-cancel-portfolio').style.display='inline-block'; window.scrollTo(0,0);
}
if(document.getElementById('btn-cancel-portfolio')) document.getElementById('btn-cancel-portfolio').onclick = () => {editPortId=null;document.getElementById('admin-portfolio-form').reset();resetImg('port-preview','port-image','port-drop-text');document.getElementById('btn-submit-portfolio').innerText='+ Опубликовать';document.getElementById('btn-cancel-portfolio').style.display='none';}

if (document.getElementById('admin-product-form')) {
    document.getElementById('admin-product-form').onsubmit = async (e) => {
        e.preventDefault(); const getV = id => document.getElementById(id).getAttribute('data-value'); const cat = getV('admin-category');
        const newP = {
          title: document.getElementById('admin-title').value, subtitle: document.getElementById('admin-subtitle').value||'', desc_text: document.getElementById('admin-desc').value||'', price: document.getElementById('admin-price').value, image: document.getElementById('admin-image').value, category: cat, stock: getV('admin-stock'), brand: getV('admin-brand'),
          power: cat==='panels'?getV('admin-power'):'all', cell: cat==='panels'?getV('admin-cell-type'):'all', efficiency: cat==='panels'?getV('admin-efficiency'):'all', frame: cat==='panels'?getV('admin-frame'):'all', phase: cat==='inverters'?getV('admin-phase'):'all', voltage: (cat==='inverters'||cat==='batteries')?getV('admin-voltage'):'all', capacity: cat==='batteries'?getV('admin-capacity'):'all',
          specs_card: [{label:"Доступно:",value:document.getElementById('admin-quantity').value+" шт."}], specs_full: [{label:"В наличии:",value:document.getElementById('admin-quantity').value+" шт."}]
        };
        const btn = document.getElementById('btn-submit-product'); btn.innerText = "Отправка в базу...";
        if(editProductId !== null) { await updateDB('products', editProductId, newP); editProductId=null; } else { await insertDB('products', newP); }
        showAdminSuccess(); e.target.reset(); resetImg('product-preview','admin-image','product-drop-text'); await initApp(); btn.innerText='+ Сохранить'; document.getElementById('btn-cancel-product').style.display='none';
    };
}

if (document.getElementById('admin-service-form')) {
    document.getElementById('admin-service-form').onsubmit = async (e) => {
        e.preventDefault(); const newS = {title: document.getElementById('service-title').value, price: document.getElementById('service-price').value, desc_text: document.getElementById('service-desc').value};
        const btn = document.getElementById('btn-submit-service'); btn.innerText = "Отправка в базу...";
        if(editServiceId !== null){ await updateDB('services', editServiceId, newS); editServiceId=null; } else { await insertDB('services', newS); }
        showAdminSuccess(); e.target.reset(); await initApp(); btn.innerText='+ Сохранить'; document.getElementById('btn-cancel-service').style.display='none';
    };
}

if (document.getElementById('admin-portfolio-form')) {
    document.getElementById('admin-portfolio-form').onsubmit = async (e) => {
        e.preventDefault(); const newP = {title: document.getElementById('port-title').value, savings: document.getElementById('port-savings').value, price: document.getElementById('port-price').value, equipment: document.getElementById('port-equipment').value, images: document.getElementById('port-image').value, desc_text: document.getElementById('port-desc').value};
        const btn = document.getElementById('btn-submit-portfolio'); btn.innerText = "Отправка в базу...";
        if(editPortId !== null){ await updateDB('portfolio', editPortId, newP); editPortId=null; } else { await insertDB('portfolio', newP); }
        showAdminSuccess(); e.target.reset(); resetImg('port-preview','port-image','port-drop-text'); await initApp(); btn.innerText='+ Опубликовать'; document.getElementById('btn-cancel-portfolio').style.display='none';
    };
}

function initAdminSettings() {
    if (document.getElementById('admin-contacts-form')) {
        const c = dbSettings.contacts || [];
        document.getElementById('contact-1').value = c[0]||''; document.getElementById('contact-2').value = c[1]||''; document.getElementById('contact-3').value = c[2]||'';
        document.getElementById('admin-contacts-form').onsubmit = async (e) => {
            e.preventDefault(); const newC = [document.getElementById('contact-1').value.trim(), document.getElementById('contact-2').value.trim(), document.getElementById('contact-3').value.trim()];
            await updateDB('settings', 1, { contacts: JSON.stringify(newC) }); showAdminSuccess(); await initApp();
        };
    }
    if (document.getElementById('admin-telegram-form')) {
        document.getElementById('tg-token-input').value = dbSettings.tg_token || '';
        const cList = document.getElementById('tg-chatids-list');
        cList.innerHTML = (dbSettings.tg_chat_ids && dbSettings.tg_chat_ids.length) ? dbSettings.tg_chat_ids.map((chat,i)=>`<div style="display:flex;justify-content:space-between;background:rgba(255,255,255,0.05);padding:8px;border-radius:4px"><div><strong style="color:var(--accent-neon);font-size:14px">${chat.label}</strong><br><span style="font-size:12px;color:var(--text-muted)">${chat.id}</span></div><button type="button" class="btn btn-sm btn-delete" onclick="deleteTgChat(${i})">Удалить</button></div>`).join('') : '<span style="color:gray;font-size:13px">Пусто</span>';
        
        document.getElementById('tg-add-btn').onclick = async () => { 
            const l=document.getElementById('tg-new-label').value.trim()||'Без имени', i=document.getElementById('tg-new-chatid').value.trim(); if(!i)return; 
            const chatIds = [...(dbSettings.tg_chat_ids||[])];
            if(!chatIds.find(c=>c.id===i)){ chatIds.push({id:i,label:l}); await updateDB('settings', 1, { tg_chat_ids: JSON.stringify(chatIds) }); document.getElementById('tg-new-label').value=''; document.getElementById('tg-new-chatid').value=''; await initApp(); } 
        };
        document.getElementById('admin-telegram-form').onsubmit = async (e) => { 
            e.preventDefault(); await updateDB('settings', 1, { tg_token: document.getElementById('tg-token-input').value.trim() }); showAdminSuccess(); await initApp(); 
        };
    }
}
window.deleteTgChat = async function(idx) {
    const chatIds = [...(dbSettings.tg_chat_ids||[])]; chatIds.splice(idx, 1);
    await updateDB('settings', 1, { tg_chat_ids: JSON.stringify(chatIds) }); await initApp();
}

function renderContacts() {
    const contacts = dbSettings.contacts || [];
    const headerList = document.getElementById('header-contacts-list');
    if (headerList) {
        headerList.innerHTML = '';
        contacts.forEach(phone => { if (phone.trim() !== '') headerList.innerHTML += `<li><a href="tel:${phone.replace(/[^\d+]/g, '')}">${phone}</a></li>`; });
        if (headerList.innerHTML === '') headerList.innerHTML = '<li><a href="#">Нет номеров</a></li>';
    }
    const footerPhone = document.getElementById('footer-phone');
    if (footerPhone) {
        if (contacts[0] && contacts[0].trim() !== '') {
            footerPhone.innerText = contacts[0]; footerPhone.href = `tel:${contacts[0].replace(/[^\d+]/g, '')}`; footerPhone.style.display = 'block';
        } else { footerPhone.style.display = 'none'; }
    }
}

// =========================================================
// 🛒 КАТАЛОГ И ПОРТФОЛИО РЕНДЕР
// =========================================================
function renderCatalog() {
  const g = document.getElementById('catalog-grid'); if(!g) return; g.innerHTML='';
  dbProducts.forEach((p,i) => {
    let s=''; if(p.specs_card) p.specs_card.forEach(sc=>s+=`<div><span>${sc.label}</span> <strong>${sc.value}</strong></div>`);
    g.innerHTML += `<div class="tech-card" data-id="${i}" data-category="${p.category}" data-stock="${p.stock}" data-brand="${p.brand||'all'}" data-power="${p.power}" data-cell="${p.cell}" data-efficiency="${p.efficiency||'all'}" data-frame="${p.frame||'all'}" data-phase="${p.phase}" data-voltage="${p.voltage||'all'}" data-capacity="${p.capacity}">${p.image?`<img src="${p.image}" class="product-image-rendered">`:''}<h3>${p.title}</h3><p class="card-sub">${p.subtitle}</p><div class="card-specs">${s}</div><div class="card-footer"><span class="price">${p.price}</span><button class="btn btn-sm btn-drawer">Посмотреть</button></div></div>`;
  });
}

function applyAdvancedFilters() {
    const cards = document.querySelectorAll('.tech-card'); if(!cards.length) return;
    const gV = id => document.getElementById(id)?document.getElementById(id).getAttribute('data-value'):'all';
    const c=gV('custom-category'), s=gV('custom-stock'), b=gV('custom-brand'), pw=gV('custom-power'), cl=gV('custom-cell'), ef=gV('custom-efficiency'), fr=gV('custom-frame'), cp=gV('custom-capacity'), ph=gV('custom-phase'), v=gV('custom-voltage');
    cards.forEach(card => {
        let ok = (c==='all'||card.dataset.category===c) && (s==='all'||card.dataset.stock===s) && (b==='all'||card.dataset.brand===b);
        if(c==='panels') ok = ok && (pw==='all'||card.dataset.power===pw) && (cl==='all'||card.dataset.cell===cl) && (ef==='all'||card.dataset.efficiency===ef) && (fr==='all'||card.dataset.frame===fr);
        else if(c==='batteries') ok = ok && (cp==='all'||card.dataset.capacity===cp) && (v==='all'||card.dataset.voltage===v);
        else if(c==='inverters') ok = ok && (ph==='all'||card.dataset.phase===ph) && (v==='all'||card.dataset.voltage===v);
        card.style.display = ok ? 'flex' : 'none'; if(ok) card.style.animation='fadeInSlide 0.4s ease-out';
    });
}

function renderServices() {
  const sGrid = document.getElementById('services-grid'); if (!sGrid) return; sGrid.innerHTML = '';
  dbServices.forEach(service => {
    sGrid.insertAdjacentHTML('beforeend', `<div class="service-card"><h3 class="service-title">${service.title}</h3><div class="service-price">${service.price}</div><p class="service-desc">${service.desc_text}</p><button class="btn btn-sm btn-full mt-auto btn-lead" data-service="${service.title}">Оставить заявку</button></div>`);
  });
}

function renderPortfolio() {
  const pg = document.getElementById('portfolio-grid'); if(!pg) return; pg.innerHTML='';
  dbPortfolio.forEach((p,i) => {
    let img = p.images?`<img src="${p.images}" style="width:100%;height:200px;object-fit:cover;border-radius:8px 8px 0 0;">`:`<div class="mock-img" style="height:200px;display:flex;align-items:center;justify-content:center;background:var(--bg-card);border-radius:8px 8px 0 0;">📸</div>`;
    pg.innerHTML += `<div class="portfolio-card" data-id="${i}" style="background:var(--bg-card);border:1px solid var(--bg-card-border);border-radius:12px;display:flex;flex-direction:column;">${img}<div style="padding:24px;display:flex;flex-direction:column;flex:1;"><h3 style="font-size:20px;color:var(--accent-neon);margin-bottom:8px;">${p.title}</h3><p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;flex-grow:1;">${p.desc_text}</p><button class="btn btn-sm btn-drawer-port mt-auto" style="width:100%">Посмотреть детали</button></div></div>`;
  });
}

// =========================================================
// 🚀 ИНТЕРАКТИВ И ШТОРКИ + УСЛУГИ (ЗАЯВКА)
// =========================================================
document.addEventListener('click', (e) => {
  const btnLead = e.target.closest('.btn-lead');
  if (btnLead) {
    document.getElementById('lead-hidden-service').value = btnLead.getAttribute('data-service');
    document.getElementById('lead-service-name').innerText = `Услуга: ${btnLead.getAttribute('data-service')}`;
    const modal = document.getElementById('lead-modal'); if (modal) modal.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  if (e.target.closest('.btn-drawer')) {
    const card = e.target.closest('.tech-card'); if (!card) return; const p = dbProducts[card.dataset.id];
    if(p) {
      document.getElementById('drawer-title').innerText=p.title; document.getElementById('drawer-desc').innerText=p.desc_text; document.getElementById('drawer-price').innerText=p.price;
      const ic = document.getElementById('drawer-img-container'); if(ic) ic.innerHTML = p.image?`<img src="${p.image}" style="width:100%;height:100%;object-fit:cover;">`:'📸';
      document.getElementById('drawer-specs-list').innerHTML = p.specs_full?p.specs_full.map(s=>`<li><strong>${s.label}</strong> ${s.value}</li>`).join(''):'';
      document.getElementById('drawer-overlay')?.classList.add('active'); document.getElementById('product-drawer')?.classList.add('active'); document.body.style.overflow='hidden';
    }
  }
  
  if (e.target.closest('.btn-drawer-port')) {
    const card = e.target.closest('.portfolio-card'); if (!card) return; const p = dbPortfolio[card.dataset.id];
    if(p) {
      document.getElementById('port-drawer-title').innerText=p.title; document.getElementById('port-drawer-desc').innerText=p.desc_text; document.getElementById('port-drawer-price').innerText=p.price||'-';
      const ic = document.getElementById('port-drawer-img-container'); if(ic) ic.innerHTML = p.images?`<img src="${p.images}" style="width:100%;height:100%;object-fit:cover;">`:'📸';
      let sHtml=''; if(p.equipment) sHtml+=`<li><strong>Оборудование:</strong> ${p.equipment}</li>`; if(p.savings) sHtml+=`<li><strong>Экономия:</strong> ${p.savings}</li>`;
      document.getElementById('port-drawer-specs-list').innerHTML=sHtml;
      document.getElementById('port-drawer-overlay')?.classList.add('active'); document.getElementById('port-drawer')?.classList.add('active'); document.body.style.overflow='hidden';
    }
  }
});

const closeDrawers = () => { document.querySelectorAll('.drawer-overlay, .drawer-panel').forEach(e=>e.classList.remove('active')); document.body.style.overflow=''; };
['close-drawer','close-drawer-btn2','drawer-overlay','close-port-drawer','close-port-drawer-btn2','port-drawer-overlay'].forEach(id=>{ if(document.getElementById(id)) document.getElementById(id).addEventListener('click', closeDrawers); });

const closeLead = document.getElementById('close-lead-modal');
if (closeLead) closeLead.addEventListener('click', () => { document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; });
const leadModalEl = document.getElementById('lead-modal');
if (leadModalEl) leadModalEl.addEventListener('click', (e) => { if(e.target === leadModalEl) { leadModalEl.classList.remove('active'); document.body.style.overflow = ''; } });

const tgForm = document.getElementById('telegram-form');
if (tgForm) {
  tgForm.addEventListener('submit', function(e) {
    e.preventDefault();
    const token = dbSettings.tg_token; const chatIds = dbSettings.tg_chat_ids || [];
    if (!token || chatIds.length === 0) { alert("Настройте токен и Chat ID в панели администратора!"); return; }

    const btn = document.getElementById('lead-submit-btn'); btn.innerText = "Отправка..."; btn.disabled = true;
    const name = document.getElementById('lead-name').value; const phone = document.getElementById('lead-phone').value; const service = document.getElementById('lead-hidden-service').value; const comment = document.getElementById('lead-comment').value;
    const text = `🔔 *Новая заявка с сайта Caspian Solar*\n\n👤 *Имя:* ${name}\n📞 *Телефон:* ${phone}\n💼 *Услуга:* ${service}\n💬 *Комментарий:* ${comment ? comment : 'Без комментария'}`;

    let requests = chatIds.map(chat => fetch(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chat.id}&text=${encodeURIComponent(text)}&parse_mode=Markdown`));

    Promise.all(requests).then(responses => {
        if(responses.every(res => res.ok)) {
            document.getElementById('lead-success').style.display = 'block'; tgForm.reset();
            setTimeout(() => { document.getElementById('lead-modal').classList.remove('active'); document.body.style.overflow = ''; document.getElementById('lead-success').style.display = 'none'; btn.innerText = "Отправить заявку"; btn.disabled = false; }, 2500);
        } else { alert("Ошибка при отправке сообщений. Проверьте настройки в админке."); btn.innerText = "Отправить заявку"; btn.disabled = false; }
      }).catch(error => { alert("Сетевая ошибка при отправке."); btn.innerText = "Отправить заявку"; btn.disabled = false; });
  });
}

const rs=document.getElementById('roofArea'), rn=document.getElementById('roofAreaNum'), bs=document.getElementById('monthlyBill'), bn=document.getElementById('monthlyBillNum');
function calc(){ const r=Number(rs.value), b=Number(bs.value); if(rn)rn.value=r; if(bn)bn.value=b; const m=(r*0.16).toFixed(1); if(document.getElementById('powerRes'))document.getElementById('powerRes').innerText=`${m} кВт`; const s=Math.round(b*12*0.8); if(document.getElementById('savingsRes'))document.getElementById('savingsRes').innerText=`~${s.toLocaleString('ru-RU')} ₽`; if(document.getElementById('paybackRes'))document.getElementById('paybackRes').innerText=`~${((m*85000)/s).toFixed(1)} года`; }
if(rs){ rs.oninput=calc; bs.oninput=calc; rn.oninput=e=>{rs.value=e.target.value;calc()}; bn.oninput=e=>{bs.value=e.target.value;calc()}; calc(); }