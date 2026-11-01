// ВАЖНО: Скрипт загружает данные из локального JSON файла
const GOOGLE_SHEET_API_URL = 'products/catalog.json';

let globalProducts = [];
const PAGE_LOAD_TIMESTAMP = Date.now();

// ==========================================================================
// 1. ИНИЦИАЛИЗАЦИЯ EMAILJS
// ==========================================================================
(function() {
  if (typeof emailjs !== 'undefined') {
    emailjs.init("lg-BVIl2gO1_gmeHs");
  }
})();

// ==========================================================================
// 2. АВТОМАТИЧЕСКОЕ ИСПРАВЛЕНИЕ БАГА ДАТ И ФОРМАТИРОВАНИЕ ЦЕН
// ==========================================================================
function fixCorruptedDateValue(val) {
  if (typeof val !== 'string') return val;
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  if (!isoRegex.test(val.trim())) return val;

  const dateObj = new Date(val);
  if (isNaN(dateObj.getTime())) return val;

  const mskTime = new Date(dateObj.getTime() + 3 * 3600 * 1000);
  const day = mskTime.getUTCDate();
  const month = mskTime.getUTCMonth() + 1;
  return `${day}.${month}`;
}

function sanitizeProductItem(item) {
  const cleaned = {};
  for (const key in item) {
    cleaned[key] = fixCorruptedDateValue(item[key]);
  }
  return cleaned;
}

function sanitizeStaticPdpSpecs() {
  const specValues = document.querySelectorAll('.pdp-spec-value');
  specValues.forEach(el => {
    const fixed = fixCorruptedDateValue(el.textContent.trim());
    if (fixed !== el.textContent.trim()) {
      el.textContent = fixed;
    }
  });
}

function formatPriceStr(val) {
  const num = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
  if (isNaN(num)) return '0';
  return new Intl.NumberFormat('ru-RU').format(num);
}

function inferCategoryFromSku(sku, allProducts) {
  const cleanSku = String(sku || '').trim();
  if (allProducts && allProducts.length) {
    const found = allProducts.find(p => String(p['Артикул']).trim() === cleanSku);
    if (found && found['Категория']) {
      return String(found['Категория']).toLowerCase().trim();
    }
  }
  if (cleanSku.startsWith('PAN-')) return 'panels';
  if (cleanSku.startsWith('INV-')) return 'inverters';
  if (cleanSku.startsWith('BAT-')) return 'batteries';
  if (cleanSku.startsWith('SH-')) return 'shields';
  return 'other';
}

function buildKitCollageHtml(components, basePath = '') {
  if (!components || components.length === 0) {
    return `<img src="${basePath}img/catalog/placeholder.webp" alt="Комплект">`;
  }

  const orderWeight = { panels: 1, inverters: 2, batteries: 3 };
  const sorted = [...components]
    .filter(c => c.category === 'panels' || c.category === 'inverters' || c.category === 'batteries')
    .sort((a, b) => (orderWeight[a.category] || 9) - (orderWeight[b.category] || 9))
    .slice(0, 4);

  if (sorted.length === 0) {
    return `<img src="${basePath}img/catalog/placeholder.webp" alt="Комплект">`;
  }

  const count = sorted.length;
  const cellsHtml = sorted.map(comp => {
    const qtyBadge = comp.qty > 1 ? `<span class="kit-collage__qty">&times;${comp.qty}</span>` : '';
    const safeTitle = String(comp.title || comp.sku).replace(/"/g, '&quot;');
    return `
      <div class="kit-collage__cell" title="${safeTitle}">
        <img src="${basePath}img/catalog/${comp.category}/${comp.sku}/main.webp" alt="${safeTitle}" onerror="this.onerror=null; this.src='${basePath}img/catalog/placeholder.webp'">
        ${qtyBadge}
      </div>
    `;
  }).join('');

  return `<div class="kit-collage kit-collage--${count}">${cellsHtml}</div>`;
}

// ==========================================================================
// 3. ЛОГИКА КОРЗИНЫ И ЗАЩИТА ФОРМ ОТ СПАМА (HONEYPOT)
// ==========================================================================
function ensureHoneypotField(form) {
  if (!form) return null;
  let hpInput = form.querySelector('input[name="company_website"]');
  if (!hpInput) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'position: absolute; left: -9999px; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none;';
    wrapper.setAttribute('aria-hidden', 'true');
    wrapper.innerHTML = `
      <label>Ваш сайт (не заполнять)</label>
      <input type="text" name="company_website" tabindex="-1" autocomplete="off">
    `;
    form.prepend(wrapper);
    hpInput = wrapper.querySelector('input[name="company_website"]');
  }
  return hpInput;
}

function isSpamSubmission(form) {
  const hpInput = form.querySelector('input[name="company_website"]');
  if (hpInput && hpInput.value.trim() !== '') {
    console.warn('Заблокирована спам-отправка (сработала Honeypot-ловушка).');
    return true;
  }
  const elapsedMs = Date.now() - PAGE_LOAD_TIMESTAMP;
  if (elapsedMs < 1500) {
    console.warn('Заблокирована спам-отправка (слишком быстрая отправка после загрузки).');
    return true;
  }
  return false;
}

function getCart() {
  try {
    return JSON.parse(localStorage.getItem('caspian_cart')) || [];
  } catch (e) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem('caspian_cart', JSON.stringify(cart));
  updateHeaderCartBadge();
}

function addToCart(item) {
  const cart = getCart();
  const existingItem = cart.find(i => i.sku === item.sku);
  if (existingItem) {
    existingItem.qty += item.qty;
  } else {
    cart.push(item);
  }
  saveCart(cart);
}

function updateHeaderCartBadge() {
  const cart = getCart();
  const totalCount = cart.reduce((acc, item) => acc + (parseInt(item.qty, 10) || 1), 0);
  const badges = document.querySelectorAll('.header-cart-badge');
  badges.forEach(badge => {
    badge.textContent = totalCount;
    badge.style.display = totalCount > 0 ? 'inline-flex' : 'none';
  });
}

function injectHeaderCartLink() {
  const isSubFolder = window.location.pathname.includes('/products/');
  const cartHref = isSubFolder ? '../cart.html' : 'cart.html';

  const spacer = document.querySelector('.header__spacer');
  if (spacer && !spacer.querySelector('.header-cart-link')) {
    spacer.innerHTML = `
      <a href="${cartHref}" class="header-cart-link" aria-label="Корзина">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span>КОРЗИНА</span>
        <span class="header-cart-badge" style="display:none;">0</span>
      </a>
    `;
  }

  const navList = document.querySelector('.header__nav-list');
  if (navList && !navList.querySelector('.header-cart-mobile-item')) {
    const li = document.createElement('li');
    li.className = 'header__nav-item header-cart-mobile-item';
    li.innerHTML = `
      <a href="${cartHref}" class="header__nav-link">
        КОРЗИНА <span class="header-cart-badge" style="display:none;">0</span>
      </a>
    `;
    navList.appendChild(li);
  }

  updateHeaderCartBadge();
}

function initAddToCartButtons() {
  const isSubFolder = window.location.pathname.includes('/products/');
  const cartUrl = isSubFolder ? '../cart.html' : 'cart.html';

  const pdpBtn = document.querySelector('.pdp-add-to-cart');
  if (pdpBtn && !pdpBtn.dataset.cartBound) {
    pdpBtn.dataset.cartBound = 'true';
    pdpBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const sku = pdpBtn.dataset.sku || 'N/A';
      const title = document.querySelector('.pdp-info__title')?.innerText.trim() || 'Оборудование';
      const priceRaw = document.querySelector('.pdp-price')?.innerText || '0';
      const price = parseFloat(priceRaw.replace(/[^\d.]/g, '')) || 0;
      const qtyEl = document.querySelector('.pdp-purchase .qty-val');
      const qty = parseInt(qtyEl ? qtyEl.innerText : '1', 10) || 1;
      const imgEl = document.querySelector('.pdp-gallery__main img');
      const img = imgEl ? imgEl.getAttribute('src').replace('../', '') : 'img/catalog/placeholder.webp';

      addToCart({ sku, title, price, qty, img });
      window.location.href = cartUrl;
    });
  }

  const drawerBtn = document.querySelector('.add-to-cart-btn');
  if (drawerBtn && !drawerBtn.dataset.cartBound) {
    drawerBtn.dataset.cartBound = 'true';
    drawerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const sku = drawerBtn.dataset.sku || 'N/A';
      const title = document.querySelector('.product-drawer__title')?.innerText.trim() || 'Оборудование';
      const priceRaw = document.querySelector('.product-drawer__price')?.innerText || '0';
      const price = parseFloat(priceRaw.replace(/[^\d.]/g, '')) || 0;
      const qtyEl = document.querySelector('.product-drawer .qty-val');
      const qty = parseInt(qtyEl ? qtyEl.innerText : '1', 10) || 1;
      const imgEl = document.querySelector('.product-drawer__gallery img');
      const img = imgEl ? imgEl.getAttribute('src') : 'img/catalog/placeholder.webp';
      const kitComposition = drawerBtn.dataset.kitComposition || '';

      addToCart({ sku, title, price, qty, img, kitComposition });
      window.location.href = cartUrl;
    });
  }
}

function animateCartValue(wrapper, newText, direction, extraClass = '') {
  if (!wrapper) return;
  wrapper.querySelectorAll('.cart-slide-val--leaving').forEach(el => el.remove());

  const oldSpan = wrapper.querySelector('.cart-slide-val');
  const classNames = `cart-slide-val ${extraClass}`.trim();

  if (!oldSpan) {
    wrapper.innerHTML = `<span class="${classNames}">${newText}</span>`;
    return;
  }

  if (oldSpan.textContent.trim() === String(newText).trim()) return;

  const newSpan = document.createElement('span');
  newSpan.className = classNames;
  newSpan.textContent = newText;

  newSpan.style.transition = 'none';
  newSpan.style.transform = direction === 'plus' ? 'translateY(-100%)' : 'translateY(100%)';
  newSpan.style.opacity = '0';

  oldSpan.classList.add('cart-slide-val--leaving');
  wrapper.appendChild(newSpan);
  void newSpan.offsetWidth;

  const transitionStyle = 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.38s ease';
  oldSpan.style.transition = transitionStyle;
  newSpan.style.transition = transitionStyle;

  oldSpan.style.transform = direction === 'plus' ? 'translateY(100%)' : 'translateY(-100%)';
  oldSpan.style.opacity = '0';

  newSpan.style.transform = 'translateY(0)';
  newSpan.style.opacity = '1';

  setTimeout(() => {
    if (oldSpan && oldSpan.parentNode) {
      oldSpan.remove();
    }
  }, 390);
}

function renderCartPage() {
  const container = document.getElementById('cart-container');
  const totalPriceEl = document.getElementById('cart-total-price');
  const totalCountEl = document.getElementById('cart-total-count');
  const clearBtn = document.getElementById('clearCartBtn');

  if (!container || !totalPriceEl) return;

  const cart = getCart();
  container.innerHTML = '';
  let totalSum = 0;
  let totalItems = 0;

  if (clearBtn && !clearBtn.dataset.bound) {
    clearBtn.dataset.bound = 'true';
    clearBtn.addEventListener('click', () => {
      localStorage.removeItem('caspian_cart');
      updateHeaderCartBadge();
      renderCartPage();
    });
  }

  if (cart.length === 0) {
    if (clearBtn) clearBtn.style.display = 'none';
    container.innerHTML = `
      <div class="cart-empty-box">
        <p class="cart-empty-msg">В вашей корзине пока нет оборудования.</p>
        <a href="products.html" class="btn btn--teal">Перейти в каталог оборудования &rarr;</a>
      </div>
    `;
    totalPriceEl.innerHTML = '<span class="cart-slide-val">0 ₽</span>';
    if (totalCountEl) totalCountEl.innerHTML = '<span class="cart-slide-val">0 шт.</span>';
    return;
  }

  if (clearBtn) clearBtn.style.display = 'inline-block';

  cart.forEach(item => {
    const qty = parseInt(item.qty, 10) || 1;
    const price = parseFloat(item.price) || 0;
    const itemTotal = price * qty;
    totalSum += itemTotal;
    totalItems += qty;

    const kitDetailsHtml = item.kitComposition
      ? `<div class="cart-item__kit-list">Состав комплекта: ${item.kitComposition}</div>`
      : '';

    const formattedItemTotal = `${formatPriceStr(itemTotal)} ₽`;

    const html = `
      <div class="cart-item" data-sku="${item.sku}">
        <div class="cart-item__img">
          <img src="${item.img}" alt="${item.title}" onerror="this.onerror=null; this.src='img/catalog/placeholder.webp'">
        </div>
        <div class="cart-item__info">
          <span class="cart-item__sku">АРТ: ${item.sku}</span>
          <h3 class="cart-item__title">${item.title}</h3>
          ${kitDetailsHtml}
          <div class="cart-item__price-row">
            <span class="cart-item__price cart-slide-wrapper">
              <span class="cart-slide-val">${formattedItemTotal}</span>
            </span>
            <span class="cart-item__unit-price" style="${qty > 1 ? '' : 'display: none;'}">(${formatPriceStr(price)} ₽ / шт.)</span>
          </div>
        </div>
        <div class="cart-item__actions">
          <div class="cart-qty-picker">
            <button type="button" class="cart-qty-btn" onclick="updateCartItem('${item.sku}', -1)" aria-label="Уменьшить">&minus;</button>
            <div class="cart-qty-val-wrapper cart-slide-wrapper">
              <span class="cart-qty-val cart-slide-val">${qty}</span>
            </div>
            <button type="button" class="cart-qty-btn" onclick="updateCartItem('${item.sku}', 1)" aria-label="Увеличить">&plus;</button>
          </div>
          <button type="button" class="cart-item__remove" onclick="removeCartItem('${item.sku}')">Удалить</button>
        </div>
      </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
  });

  totalPriceEl.innerHTML = `<span class="cart-slide-val">${formatPriceStr(totalSum)} ₽</span>`;
  if (totalCountEl) totalCountEl.innerHTML = `<span class="cart-slide-val">${totalItems} шт.</span>`;
}

window.updateCartItem = function(sku, delta) {
  const cart = getCart();
  const item = cart.find(i => i.sku === sku);
  if (!item) return;

  const currentQty = parseInt(item.qty, 10) || 1;
  const newQty = currentQty + delta;
  if (newQty < 1 || newQty > 99) return;

  item.qty = newQty;
  saveCart(cart);

  const direction = delta > 0 ? 'plus' : 'minus';
  const itemRow = Array.from(document.querySelectorAll('.cart-item')).find(el => el.dataset.sku === String(sku));

  if (!itemRow) {
    renderCartPage();
    return;
  }

  const price = parseFloat(item.price) || 0;
  const newItemTotal = `${formatPriceStr(price * newQty)} ₽`;

  const qtyWrapper = itemRow.querySelector('.cart-qty-val-wrapper');
  animateCartValue(qtyWrapper, String(newQty), direction, 'cart-qty-val');

  const priceWrapper = itemRow.querySelector('.cart-item__price');
  animateCartValue(priceWrapper, newItemTotal, direction);

  const unitPriceEl = itemRow.querySelector('.cart-item__unit-price');
  if (unitPriceEl) {
    unitPriceEl.style.display = newQty > 1 ? '' : 'none';
  }

  let totalSum = 0;
  let totalItems = 0;
  cart.forEach(cItem => {
    const q = parseInt(cItem.qty, 10) || 1;
    const p = parseFloat(cItem.price) || 0;
    totalSum += p * q;
    totalItems += q;
  });

  const totalCountEl = document.getElementById('cart-total-count');
  const totalPriceEl = document.getElementById('cart-total-price');

  animateCartValue(totalCountEl, `${totalItems} шт.`, direction);
  animateCartValue(totalPriceEl, `${formatPriceStr(totalSum)} ₽`, direction);
};

window.removeCartItem = function(sku) {
  let cart = getCart();
  cart = cart.filter(i => i.sku !== sku);
  saveCart(cart);
  renderCartPage();
};

function initCheckoutForm() {
  const form = document.getElementById('checkout-form');
  if (!form) return;

  ensureHoneypotField(form);

  form.addEventListener('submit', function(e) {
    e.preventDefault();
    const cart = getCart();
    if (cart.length === 0) {
      alert('Ваша корзина пуста. Добавьте оборудование из каталога.');
      return;
    }

    const userName = document.getElementById('calc-name').value.trim();
    const userPhone = document.getElementById('calc-phone').value.trim();

    // Проверка на спам-бота (Honeypot + время на странице)
    if (isSpamSubmission(form)) {
      form.innerHTML = `
        <div class="success-msg">
          <h3>Заявка успешно отправлена!</h3>
          <p style="font-size: 0.85rem; color: #55575A; line-height: 1.5;">
            Спасибо, <strong>${userName || 'клиент'}</strong>! Мы свяжемся с вами в ближайшее время.
          </p>
        </div>
      `;
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Отправка заявки...</span>';

    let cartText = '';
    let total = 0;
    cart.forEach((item, idx) => {
      const sub = (parseFloat(item.price) || 0) * (parseInt(item.qty, 10) || 1);
      total += sub;
      const kitNote = item.kitComposition ? ` [Состав: ${item.kitComposition}]` : '';
      cartText += `${idx + 1}. ${item.title} (Арт: ${item.sku})${kitNote} — ${item.qty} шт. × ${formatPriceStr(item.price)} ₽ = ${formatPriceStr(sub)} ₽\n`;
    });

    const userEmail = document.getElementById('calc-email').value.trim() || 'Не указан';
    const userMsg = document.getElementById('calc-msg').value.trim() || 'Без комментария';
    const formattedTotal = `${formatPriceStr(total)} ₽`;

    const templateParams = {
      user_name: userName,
      name: userName,
      user_phone: userPhone,
      user_email: userEmail,
      email: userEmail,
      message: userMsg,
      cart_items: cartText,
      total_price: formattedTotal
    };

    emailjs.send("service_gn15ngc", "template_3pwehbv", templateParams)
      .then(function() {
        localStorage.removeItem('caspian_cart');
        updateHeaderCartBadge();
        form.innerHTML = `
          <div class="success-msg">
            <h3>Заявка успешно отправлена!</h3>
            <p style="font-size: 0.85rem; color: #55575A; line-height: 1.5;">
              Спасибо, <strong>${userName}</strong>! Инженер Caspian Sun получил вашу спецификацию на сумму <strong>${formattedTotal}</strong> и свяжется с вами по номеру <strong>${userPhone}</strong>.
            </p>
          </div>
        `;
        renderCartPage();
      }, function(error) {
        console.error('Ошибка отправки EmailJS:', error);
        alert('Не удалось отправить заявку автоматически. Пожалуйста, свяжитесь с нами по телефону +7 (963) 373-72-74.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
      });
  });
}

function initContactsPageForm() {
  const form = document.getElementById('contacts-page-form');
  if (!form) return;

  ensureHoneypotField(form);

  form.addEventListener('submit', function(e) {
    e.preventDefault();

    const userName = document.getElementById('contact-name').value.trim();
    const userPhone = document.getElementById('contact-phone').value.trim();

    // Проверка на спам-бота (Honeypot + время на странице)
    if (isSpamSubmission(form)) {
      form.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-light);">
          <h3 style="color: var(--accent-gold); margin-bottom: 0.75rem; font-weight: 400; text-transform: uppercase;">Заявка отправлена!</h3>
          <p style="font-size: 0.9rem; color: var(--text-muted);">Спасибо, ${userName || 'клиент'}! Мы свяжемся с вами в ближайшее время.</p>
        </div>
      `;
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Отправка...</span>';

    const userEmail = document.getElementById('contact-email').value.trim() || 'Не указан';
    const serviceType = document.getElementById('contact-service').value;
    const userMsg = document.getElementById('contact-message').value.trim() || 'Без сообщения';

    const templateParams = {
      user_name: userName,
      name: userName,
      user_phone: userPhone,
      user_email: userEmail,
      email: userEmail,
      message: `Услуга: ${serviceType} | Сообщение: ${userMsg}`,
      cart_items: 'Заявка со страницы «Контакты» (без товаров в корзине)',
      total_price: 'Индивидуальный расчет'
    };

    emailjs.send("service_gn15ngc", "template_3pwehbv", templateParams)
      .then(function() {
        form.innerHTML = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-light);">
            <h3 style="color: var(--accent-gold); margin-bottom: 0.75rem; font-weight: 400; text-transform: uppercase;">Заявка отправлена!</h3>
            <p style="font-size: 0.9rem; color: var(--text-muted);">Спасибо, ${userName}! Мы свяжемся с вами по номеру ${userPhone} в ближайшее время.</p>
          </div>
        `;
      }, function(error) {
        console.error('Ошибка отправки формы контактов:', error);
        alert('Не удалось отправить заявку. Позвоните нам: +7 (963) 373-72-74');
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalHtml;
      });
  });
}

// ==========================================================================
// 4. ШАПКА И НАВИГАЦИЯ
// ==========================================================================
function initHeaderEvents() {
  const burgerBtn = document.getElementById('burgerBtn');
  const mainNav = document.getElementById('mainNav');
  const dropdown = document.querySelector('.header__dropdown');
  const dropdownBtn = document.getElementById('dropdownBtn');

  if (burgerBtn && mainNav) {
    burgerBtn.addEventListener('click', () => {
      mainNav.classList.toggle('header__nav--open');
      const isOpen = mainNav.classList.contains('header__nav--open');
      burgerBtn.setAttribute('aria-expanded', isOpen);
    });
  }

  if (dropdownBtn && dropdown) {
    dropdownBtn.addEventListener('click', (e) => {
      if (window.innerWidth < 1024) {
        e.preventDefault();
        dropdown.classList.toggle('header__dropdown--open');
        const isOpen = dropdown.classList.contains('header__dropdown--open');
        dropdownBtn.setAttribute('aria-expanded', isOpen);
      }
    });
  }
}

function setActiveMenuLink() {
  let path = window.location.pathname.split('/').pop();
  if (!path || path === '') path = 'index.html'; 
  
  if (path.includes('product.html') || path.includes('product-template.html') || path.includes('PAN-') || path.includes('INV-') || path.includes('BAT-') || path.includes('KIT-') || path.includes('SH-')) {
    path = 'products.html';
  }

  const links = document.querySelectorAll('.header__nav-link, .header__dropdown-link');

  links.forEach(link => {
    link.classList.remove('header__nav-link--active');
    link.classList.remove('header__dropdown-link--active');
    
    const href = link.getAttribute('href');
    if (href && href.replace('../', '') === path) {
      link.classList.add('header__nav-link--active');
      if (link.classList.contains('header__dropdown-link')) {
        link.classList.add('header__dropdown-link--active');
        const parentBtn = link.closest('.header__dropdown')?.querySelector('.header__dropdown-btn');
        if (parentBtn) parentBtn.classList.add('header__nav-link--active');
      }
    }
  });
}

// ==========================================================================
// 5. ЗАГРУЗКА КАТАЛОГА, КОМПЛЕКТОВ, КОЛЛАЖЕЙ, ПОЛЗУНКА, ПОИСКА И СОРТИРОВКИ
// ==========================================================================
function extractItemAttributes(item) {
  const category = (item['Категория'] || 'other').toLowerCase().trim();
  const brand = item['Бренд'] ? String(item['Бренд']).toLowerCase().trim() : 'caspian sun';
  const sku = item['Артикул'] ? String(item['Артикул']).trim() : 'N/A';
  const model = String(item['Модель'] || item['Название комплекта'] || item['Модель / Наименование'] || '').trim();

  let power = 0;
  if (item['Мощность (кВт)']) {
    power = parseFloat(String(item['Мощность (кВт)']).replace(',', '.')) || 0;
  } else if (item['Мощность инвертора (кВт)']) {
    power = parseFloat(String(item['Мощность инвертора (кВт)']).replace(',', '.')) || 0;
  } else if (item['Мощность (Вт)']) {
    power = (parseFloat(String(item['Мощность (Вт)']).replace(',', '.')) || 0) / 1000;
  }

  const capacity = parseFloat(String(item['Емкость (кВт·ч)'] || '0').replace(',', '.')) || 0;

  let panelType = '';
  const rawPanelType = `${item['Исполнение'] || ''} ${item['Тип панели'] || ''} ${item['Тип ячейки'] || ''} ${item['Теги (для ИИ)'] || ''} ${item['Описание (для ИИ)'] || ''}`.toLowerCase();
  if (category === 'panels') {
    if (rawPanelType.includes('двусторон') || rawPanelType.includes('двухсторон') || rawPanelType.includes('doubleglass') || rawPanelType.includes('bifacial') || rawPanelType.includes('dual glass')) {
      panelType = 'bifacial';
    } else {
      panelType = 'monofacial';
    }
  }

  const phases = item['Кол-во фаз'] ? String(item['Кол-во фаз']).trim() : '';
  const mpptRaw = item['Кол-во MPPT'] || item['MPPT'] || '';
  const mppt = mpptRaw !== '' ? String(mpptRaw).trim() : '';

  let inverterType = '';
  if (category === 'inverters') {
    const rawInvType = `${item['Тип инвертора'] || ''} ${item['Теги (для ИИ)'] || ''} ${item['Описание (для ИИ)'] || ''}`.toLowerCase();
    if (rawInvType.includes('гибрид')) inverterType = 'hybrid';
    else if (rawInvType.includes('автоном') || rawInvType.includes('off-grid') || rawInvType.includes('spf')) inverterType = 'offgrid';
    else inverterType = 'ongrid';
  }

  return { category, brand, sku, model, power, capacity, panelType, phases, mppt, inverterType };
}

function resolveKitData(item, allProducts) {
  const components = [];
  const extractSku = (str) => {
    const m = String(str || '').match(/\[([^\]]+)\]/);
    return m ? m[1].trim() : String(str || '').trim();
  };
  const cleanName = (str) => String(str || '').replace(/^\[[^\]]+\]\s*/, '').trim();

  if (item['Инвертор'] || item['Солнечная панель'] || item['Аккумулятор (АКБ)']) {
    const parts = [];

    if (item['Солнечная панель'] && Number(item['Кол-во панелей (шт.)']) > 0) {
      const sku = extractSku(item['Солнечная панель']);
      const qty = parseInt(item['Кол-во панелей (шт.)'], 10) || 1;
      const title = cleanName(item['Солнечная панель']);
      parts.push(`${title} × ${qty} шт.`);
      components.push({ sku, category: inferCategoryFromSku(sku, allProducts), qty, title });
    }
    if (item['Инвертор'] && Number(item['Кол-во инверторов (шт.)']) > 0) {
      const sku = extractSku(item['Инвертор']);
      const qty = parseInt(item['Кол-во инверторов (шт.)'], 10) || 1;
      const title = cleanName(item['Инвертор']);
      parts.push(`${title} × ${qty} шт.`);
      components.push({ sku, category: inferCategoryFromSku(sku, allProducts), qty, title });
    }
    if (item['Аккумулятор (АКБ)'] && Number(item['Кол-во АКБ (шт.)']) > 0) {
      const sku = extractSku(item['Аккумулятор (АКБ)']);
      const qty = parseInt(item['Кол-во АКБ (шт.)'], 10) || 1;
      const title = cleanName(item['Аккумулятор (АКБ)']);
      parts.push(`${title} × ${qty} шт.`);
      components.push({ sku, category: inferCategoryFromSku(sku, allProducts), qty, title });
    }
    if (item['Распределительный щиток'] && Number(item['Кол-во щитков (шт.)']) > 0) {
      const qty = parseInt(item['Кол-во щитков (шт.)'], 10) || 1;
      const title = cleanName(item['Распределительный щиток']);
      parts.push(`${title} × ${qty} шт.`);
    }

    const price = item['Итоговая цена ($)'] || item['Сумма по прайсу ($)'] || item['Цена'] || 0;
    return { price, summary: parts.join(', '), components };
  }

  const rawComp = item['Состав комплекта'] || '';
  const defaultPrice = item['Цена'] || item['Итоговая цена ($)'] || '0';
  if (!rawComp) return { price: defaultPrice, summary: '', components: [] };

  let calculatedPrice = 0;
  const parts = String(rawComp).split(',').map(s => s.trim()).filter(Boolean);
  const readableParts = [];

  parts.forEach(part => {
    const [compSku, qtyRaw] = part.split(':').map(s => s.trim());
    const qty = parseInt(qtyRaw, 10) || 1;
    const found = allProducts.find(p => String(p['Артикул']).trim() === compSku);
    const cat = inferCategoryFromSku(compSku, allProducts);
    if (found) {
      const unitPrice = parseFloat(found['Цена']) || 0;
      calculatedPrice += unitPrice * qty;
      readableParts.push(`${found['Модель']} × ${qty} шт.`);
      if (cat !== 'shields') {
        components.push({ sku: compSku, category: cat, qty, title: found['Модель'] });
      }
    } else {
      readableParts.push(`${compSku} × ${qty} шт.`);
      if (cat !== 'shields') {
        components.push({ sku: compSku, category: cat, qty, title: compSku });
      }
    }
  });

  const finalPrice = item['Цена'] ? item['Цена'] : Number(calculatedPrice.toFixed(2));
  return { price: finalPrice, summary: readableParts.join(', '), components };
}

function initSidebarUI() {
  const filterContainer = document.getElementById('catalogFilters');
  if (!filterContainer) return;

  filterContainer.querySelectorAll('.filter-group__header').forEach(header => {
    if (header.dataset.bound) return;
    header.dataset.bound = 'true';
    header.addEventListener('click', () => {
      header.closest('.filter-group').classList.toggle('filter-group--open');
    });
  });

  initPowerSlider();
}

function initPowerSlider() {
  const minInput = document.getElementById('powerMin');
  const maxInput = document.getElementById('powerMax');
  const track = document.getElementById('powerTrack');
  const trackContainer = document.getElementById('powerTrackContainer');
  const minOut = document.getElementById('powerMinOut');
  const maxOut = document.getElementById('powerMaxOut');
  
  if (!minInput || !maxInput || !track) return;
  if (minInput.dataset.bound) return;
  minInput.dataset.bound = 'true';

  const maxVal = parseFloat(minInput.max) || 50;

  function updateTrack() {
    const min = parseFloat(minInput.value) || 0;
    const max = parseFloat(maxInput.value) ?? maxVal;
    
    const percent1 = (min / maxVal) * 100;
    const percent2 = (max / maxVal) * 100;
    
    track.style.left = `${percent1}%`;
    track.style.width = `${Math.max(0, percent2 - percent1)}%`;
    
    if (minOut) minOut.textContent = min;
    if (maxOut) maxOut.textContent = max;
    
    if (min >= maxVal - 2) {
      minInput.style.zIndex = "5";
      maxInput.style.zIndex = "4";
    } else {
      minInput.style.zIndex = "4";
      maxInput.style.zIndex = "5";
    }
  }

  minInput.addEventListener('input', function() {
    if (parseFloat(minInput.value) > parseFloat(maxInput.value)) {
      minInput.value = maxInput.value;
    }
    updateTrack();
    window.dispatchEvent(new Event('catalogFiltersChanged'));
  });

  maxInput.addEventListener('input', function() {
    if (parseFloat(maxInput.value) < parseFloat(minInput.value)) {
      maxInput.value = minInput.value;
    }
    updateTrack();
    window.dispatchEvent(new Event('catalogFiltersChanged'));
  });

  if (trackContainer) {
    trackContainer.addEventListener('pointerdown', function(e) {
      if (e.target === minInput || e.target === maxInput) return;
      const rect = trackContainer.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
      const clickVal = Math.round(ratio * maxVal);
      const curMin = parseFloat(minInput.value) || 0;
      const curMax = parseFloat(maxInput.value) || maxVal;

      if (Math.abs(clickVal - curMin) <= Math.abs(clickVal - curMax)) {
        minInput.value = Math.min(clickVal, curMax);
      } else {
        maxInput.value = Math.max(clickVal, curMin);
      }
      updateTrack();
      window.dispatchEvent(new Event('catalogFiltersChanged'));
    });
  }

  updateTrack();
}

async function loadCatalog() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  initSidebarUI();
  grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-dark-muted); padding: 4rem 0;">Загрузка оборудования...</p>';

  try {
    const isSubFolder = window.location.pathname.includes('/products/');
    const dataPath = isSubFolder ? '../products/catalog.json' : 'products/catalog.json';
    
    const response = await fetch(dataPath);
    if (!response.ok) throw new Error('Network response was not ok');
    
    const rawProducts = await response.json();
    globalProducts = rawProducts
      .map(sanitizeProductItem)
      .map(item => {
        if (!item['Модель'] && item['Название комплекта']) item['Модель'] = item['Название комплекта'];
        if (!item['Модель'] && item['Модель / Наименование']) item['Модель'] = item['Модель / Наименование'];
        return item;
      })
      .filter(item => item['Модель'] && String(item['Модель']).trim() !== '' && item['Артикул'] && String(item['Артикул']).trim() !== '');

    grid.innerHTML = ''; 

    globalProducts.forEach((item, index) => {
      const attrs = extractItemAttributes(item);
      const kitInfo = resolveKitData(item, globalProducts);
      const priceNum = parseFloat(String(kitInfo.price).replace(',', '.')) || 0;
      const specText = item['Теги (для ИИ)'] || kitInfo.summary || ''; 
      const searchText = `${attrs.model} ${attrs.brand} ${attrs.sku} ${specText}`.toLowerCase();

      let categoryLabel = 'ОБОРУДОВАНИЕ';
      if (attrs.category === 'inverters') categoryLabel = `ИНВЕРТОР • ${attrs.brand.toUpperCase()}`;
      else if (attrs.category === 'batteries') categoryLabel = `АККУМУЛЯТОР • ${attrs.brand.toUpperCase()}`;
      else if (attrs.category === 'panels') categoryLabel = `СОЛНЕЧНАЯ ПАНЕЛЬ • ${attrs.brand.toUpperCase()}`;
      else if (attrs.category === 'kits') categoryLabel = `ГОТОВЫЙ КОМПЛЕКТ • CASPIAN SUN`;

      const isKitCollage = attrs.category === 'kits' && kitInfo.components && kitInfo.components.length > 0;
      const imgBoxClass = isKitCollage ? 'product-card__img-box product-card__img-box--collage' : 'product-card__img-box';
      const imgContentHtml = isKitCollage
        ? buildKitCollageHtml(kitInfo.components, '')
        : `<img src="img/catalog/${attrs.category}/${attrs.sku}/main.webp" alt="${attrs.model}" onerror="this.onerror=null; this.src='img/catalog/placeholder.webp'">`;

      const cardHtml = `
        <article class="product-card" 
          data-index="${index}" 
          data-sku="${attrs.sku}" 
          data-category="${attrs.category}" 
          data-brand="${attrs.brand}" 
          data-price="${priceNum}"
          data-power="${attrs.power}"
          data-capacity="${attrs.capacity}"
          data-panel-type="${attrs.panelType}"
          data-inverter-type="${attrs.inverterType}"
          data-phases="${attrs.phases}"
          data-mppt="${attrs.mppt}"
          data-search="${searchText.replace(/"/g, '&quot;')}">
          <div class="${imgBoxClass}">
            ${imgContentHtml}
          </div>
          <div class="product-card__info">
            <span class="product-card__category">${categoryLabel}</span>
            <h3 class="product-card__title">${attrs.model}</h3>
            <p class="product-card__specs">${specText}</p>
            <div class="product-card__footer">
              <span class="product-card__price">${formatPriceStr(kitInfo.price)} ₽</span>
              <a href="products/${attrs.sku}.html" class="product-card__details-link" aria-label="Смотреть товар">
                ПОДРОБНЕЕ
                <svg viewBox="0 0 16 16"><line x1="2" y1="8" x2="14" y2="8"></line><polyline points="10 4 14 8 10 12"></polyline></svg>
              </a>
            </div>
          </div>
        </article>
      `;
      grid.insertAdjacentHTML('beforeend', cardHtml);
    });

    const urlParams = new URLSearchParams(window.location.search);
    const initialCat = urlParams.get('category');
    if (initialCat) {
      const catCheckbox = document.querySelector(`input[data-filter-type="category"][value="${initialCat}"]`);
      if (catCheckbox) catCheckbox.checked = true;
    }

    initCatalogFilters();
    initProductDrawer();
  } catch (error) {
    console.error(error);
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ff5555; padding: 4rem 0;">Не удалось загрузить каталог.</p>';
  }
}

function initCatalogFilters() {
  const filterContainer = document.getElementById('catalogFilters');
  const grid = document.getElementById('productGrid');
  const catalogCount = document.getElementById('catalogCount');
  const resetBtn = document.getElementById('resetFiltersBtn');
  const searchInput = document.getElementById('catalogSearchInput');
  const searchClear = document.getElementById('catalogSearchClear');
  const sortSelect = document.getElementById('catalogSortSelect');

  if (!filterContainer || !grid) return;

  const productCards = Array.from(grid.querySelectorAll('.product-card'));
  const filterCheckboxes = filterContainer.querySelectorAll('input[type="checkbox"]');

  function syncDynamicFilterVisibility(activeCategories) {
    const dynamicGroups = filterContainer.querySelectorAll('.filter-group--dynamic');
    dynamicGroups.forEach(group => {
      const targetCat = group.getAttribute('data-for-category');
      
      if (activeCategories.length === 0 || activeCategories.includes(targetCat)) {
        group.classList.remove('is-hidden');
      } else {
        group.classList.add('is-hidden');
        group.classList.remove('filter-group--open');
        group.querySelectorAll('input[type="checkbox"]:checked').forEach(inp => { inp.checked = false; });
        
        if (targetCat === 'inverters') {
          const pMin = document.getElementById('powerMin');
          const pMax = document.getElementById('powerMax');
          if (pMin && pMax && (pMin.value !== pMin.min || pMax.value !== pMax.max)) {
            pMin.value = pMin.min;
            pMax.value = pMax.max;
            pMin.dispatchEvent(new Event('input'));
          }
        }
      }
    });
  }

  function sortCards(mode) {
    const sorted = [...productCards].sort((a, b) => {
      if (mode === 'price-asc') {
        return (parseFloat(a.dataset.price) || 0) - (parseFloat(b.dataset.price) || 0);
      }
      if (mode === 'price-desc') {
        return (parseFloat(b.dataset.price) || 0) - (parseFloat(a.dataset.price) || 0);
      }
      if (mode === 'power-desc') {
        const valA = Math.max(parseFloat(a.dataset.power) || 0, parseFloat(a.dataset.capacity) || 0);
        const valB = Math.max(parseFloat(b.dataset.power) || 0, parseFloat(b.dataset.capacity) || 0);
        return valB - valA;
      }
      return (parseInt(a.dataset.index, 10) || 0) - (parseInt(b.dataset.index, 10) || 0);
    });

    sorted.forEach(card => grid.appendChild(card));
  }

  function updateCatalog() {
    const activeCategories = Array.from(filterContainer.querySelectorAll('input[data-filter-type="category"]:checked')).map(cb => cb.value);
    syncDynamicFilterVisibility(activeCategories);

    const activeBrands = Array.from(filterContainer.querySelectorAll('input[data-filter-type="brand"]:checked')).map(cb => cb.value);
    const activePanelTypes = Array.from(filterContainer.querySelectorAll('input[data-filter-type="panel-type"]:checked')).map(cb => cb.value);
    const activeInvTypes = Array.from(filterContainer.querySelectorAll('input[data-filter-type="inverter-type"]:checked')).map(cb => cb.value);
    const activePhases = Array.from(filterContainer.querySelectorAll('input[data-filter-type="phases"]:checked')).map(cb => cb.value);
    const activeMppt = Array.from(filterContainer.querySelectorAll('input[data-filter-type="mppt"]:checked')).map(cb => cb.value);

    const pMinEl = document.getElementById('powerMin');
    const pMaxEl = document.getElementById('powerMax');
    const pMin = parseFloat(pMinEl?.value || 0);
    const pMax = parseFloat(pMaxEl?.value ?? 50);
    const isPowerFiltered = pMin > 0 || pMax < parseFloat(pMaxEl?.max || 50);

    const hasInverterSpecificFilter = isPowerFiltered || activeInvTypes.length > 0 || activePhases.length > 0 || activeMppt.length > 0;
    const hasPanelSpecificFilter = activePanelTypes.length > 0;

    const searchQuery = searchInput ? searchInput.value.trim().toLowerCase() : '';
    if (searchClear) {
      searchClear.style.display = searchQuery.length > 0 ? 'inline-flex' : 'none';
    }

    let visibleCount = 0;

    productCards.forEach(card => {
      const cardCat = card.getAttribute('data-category');
      const cardBrand = card.getAttribute('data-brand');
      const cardPower = parseFloat(card.getAttribute('data-power')) || 0;
      const cardPanelType = card.getAttribute('data-panel-type');
      const cardInvType = card.getAttribute('data-inverter-type');
      const cardPhases = card.getAttribute('data-phases');
      const cardMppt = card.getAttribute('data-mppt');
      const cardSearch = card.getAttribute('data-search') || '';

      let matchCat = activeCategories.length === 0 || activeCategories.includes(cardCat);

      if (activeCategories.length === 0 && (hasInverterSpecificFilter || hasPanelSpecificFilter)) {
        const allowedImplicitCats = [];
        if (hasInverterSpecificFilter) allowedImplicitCats.push('inverters');
        if (hasPanelSpecificFilter) allowedImplicitCats.push('panels');
        matchCat = allowedImplicitCats.includes(cardCat);
      }

      const matchBrand = activeBrands.length === 0 || activeBrands.includes(cardBrand);
      const matchSearch = !searchQuery || cardSearch.includes(searchQuery);

      let matchPanelType = true;
      if (cardCat === 'panels' && activePanelTypes.length > 0) {
        matchPanelType = activePanelTypes.includes(cardPanelType);
      }

      let matchPower = true;
      let matchInvType = true;
      let matchPhases = true;
      let matchMppt = true;

      if (cardCat === 'inverters') {
        if (isPowerFiltered) {
          matchPower = cardPower >= pMin && cardPower <= pMax;
        }
        if (activeInvTypes.length > 0) {
          matchInvType = activeInvTypes.includes(cardInvType);
        }
        if (activePhases.length > 0) {
          matchPhases = activePhases.includes(cardPhases);
        }
        if (activeMppt.length > 0) {
          matchMppt = cardMppt ? activeMppt.some(val => val === '3+' ? parseInt(cardMppt, 10) >= 3 : cardMppt === val) : false;
        }
      }

      if (matchCat && matchBrand && matchSearch && matchPower && matchPanelType && matchInvType && matchPhases && matchMppt) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (catalogCount) {
      catalogCount.textContent = `Найдено: ${visibleCount}`;
    }
  }

  filterCheckboxes.forEach(input => {
    input.addEventListener('change', updateCatalog);
  });

  window.addEventListener('catalogFiltersChanged', updateCatalog);

  if (searchInput) {
    searchInput.addEventListener('input', updateCatalog);
  }

  if (searchClear && searchInput) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      updateCatalog();
      searchInput.focus();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener('change', () => {
      sortCards(sortSelect.value);
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      filterCheckboxes.forEach(input => { input.checked = false; });

      if (searchInput) searchInput.value = '';
      if (sortSelect) {
        sortSelect.value = 'default';
        sortCards('default');
      }

      const pMin = document.getElementById('powerMin');
      const pMax = document.getElementById('powerMax');
      if (pMin && pMax) {
        pMin.value = pMin.min;
        pMax.value = pMax.max;
        pMin.dispatchEvent(new Event('input'));
      }

      updateCatalog();
    });
  }

  updateCatalog();
}

function initProductDrawer() {
  const grid = document.getElementById('productGrid');
  const drawer = document.querySelector('.product-drawer');
  if (!grid || !drawer) return;

  const closeBtn = drawer.querySelector('.product-drawer__close');
  const backdrop = drawer.querySelector('.product-drawer__backdrop');
  const addToCartBtn = drawer.querySelector('.add-to-cart-btn');

  function openDrawer(index) {
    const item = globalProducts[index];
    if (!item) return;

    const category = (item['Категория'] || 'other').toLowerCase().trim();
    const brand = item['Бренд'] ? String(item['Бренд']).toUpperCase() : 'CASPIAN SUN';
    const sku = item['Артикул'] || 'N/A';
    const modelName = item['Модель'] || item['Название комплекта'] || 'Без названия';
    const kitInfo = resolveKitData(item, globalProducts);

    drawer.querySelector('.product-drawer__category').textContent = `${category.toUpperCase()} • ${brand} • АРТ: ${sku}`;
    drawer.querySelector('.product-drawer__title').textContent = modelName;
    drawer.querySelector('.product-drawer__specs-bar').textContent = item['Теги (для ИИ)'] || kitInfo.summary || '';
    drawer.querySelector('.product-drawer__desc').textContent = item['Описание (для ИИ)'] || '';
    drawer.querySelector('.product-drawer__price').textContent = `${formatPriceStr(kitInfo.price)} ₽`;

    if (addToCartBtn) {
      addToCartBtn.dataset.sku = sku;
      addToCartBtn.dataset.kitComposition = kitInfo.summary || '';
    }

    const qtySpan = drawer.querySelector('.qty-val');
    if (qtySpan) qtySpan.textContent = '1';

    const galleryBox = drawer.querySelector('.product-drawer__gallery');
    if (category === 'kits' && kitInfo.components && kitInfo.components.length > 0) {
      galleryBox.classList.add('product-drawer__gallery--collage');
      galleryBox.innerHTML = buildKitCollageHtml(kitInfo.components, '');
    } else {
      galleryBox.classList.remove('product-drawer__gallery--collage');
      galleryBox.innerHTML = `<img class="gallery-main" src="img/catalog/${category}/${sku}/main.webp" alt="${modelName}" onerror="this.onerror=null; this.src='img/catalog/placeholder.webp'">`;
    }

    const featuresList = drawer.querySelector('.product-drawer__features');
    featuresList.innerHTML = '';
    if (item['Преимущества (для ИИ)']) {
      const features = String(item['Преимущества (для ИИ)']).split('\n').map(f => f.replace(/^- /, '').trim()).filter(Boolean);
      features.forEach(f => {
        featuresList.insertAdjacentHTML('beforeend', `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>${f}</li>`);
      });
    }

    const specsContainer = document.getElementById('drawerSpecs');
    specsContainer.innerHTML = '';
    const skipKeys = [
      'Бренд', 'Модель', 'Название комплекта', 'Модель / Наименование',
      'Цена', 'Сумма по прайсу ($)', 'Итоговая цена ($)', 'Изображение',
      'Теги (для ИИ)', 'Описание (для ИИ)', 'Преимущества (для ИИ)',
      'Категория', 'Артикул', 'Количество доп фото', 'Позиция для комплекта',
      'SEO Заголовок', 'SEO Описание', 'Состав комплекта',
      'Себестоимость ($)', 'Себестоимость (₽)', 'Цена +20% (₽)', 'Цена +25% (₽)', 
      'Цена +30% (₽)', 'Цена +40% (₽)', 'Цена +50% (₽)', 'Цена +60% (₽)', 
      'Цена +70% (₽)', 'Цена +80% (₽)', 'Цена +90% (₽)', 'Цена +100% (₽)', 
      'Цена +110% (₽)', 'Цена +120% (₽)', 'Цена +130% (₽)'
    ];
    
    if (kitInfo.summary) {
      specsContainer.insertAdjacentHTML('beforeend', `<div class="spec-row"><span>Состав комплекта</span><span>${kitInfo.summary}</span></div>`);
    }

    for (const key in item) {
      if (!skipKeys.includes(key) && item[key] !== '' && item[key] !== null && item[key] !== undefined && item[key] !== 'Количество доп фото') {
        specsContainer.insertAdjacentHTML('beforeend', `<div class="spec-row"><span>${key}</span><span>${item[key]}</span></div>`);
      }
    }

    drawer.classList.add('product-drawer--open');
  }

  function closeDrawer() {
    drawer.classList.remove('product-drawer--open');
  }

  grid.addEventListener('click', (e) => {
    if (e.target.closest('.product-card__details-link')) return;
    const card = e.target.closest('.product-card');
    if (card) {
      e.preventDefault();
      openDrawer(card.getAttribute('data-index'));
    }
  });

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);
}

// ==========================================================================
// 6. ГАЛЕРЕЯ ТОВАРА И ПОХОЖИЕ ТОВАРЫ (НА СТРАНИЦЕ PDP)
// ==========================================================================
function initProductGallery() {
  const thumbs = document.querySelectorAll('.pdp-gallery__thumb');
  const mainContainer = document.querySelector('.pdp-gallery__main');
  const originalImage = document.getElementById('pdpMainImage');

  if (!thumbs.length || !originalImage || !mainContainer) return;

  let currentIndex = 0;
  let isAnimating = false;

  originalImage.classList.add('pdp-gallery__layer');
  originalImage.style.transform = 'translateX(0)';

  const secondLayer = document.createElement('img');
  secondLayer.className = 'pdp-gallery__layer';
  secondLayer.style.display = 'none';
  mainContainer.insertBefore(secondLayer, originalImage.nextSibling);

  let activeLayer = originalImage;
  let bufferLayer = secondLayer;

  const getVisibleThumbs = () => Array.from(thumbs).filter(t => getComputedStyle(t).display !== 'none');

  const slideTo = async (newIndex, direction) => {
    const visibleThumbs = getVisibleThumbs();
    if (newIndex === currentIndex || isAnimating || !visibleThumbs[newIndex]) return;

    isAnimating = true;
    const newSrc = visibleThumbs[newIndex].src;

    bufferLayer.src = newSrc;
    bufferLayer.style.transition = 'none';
    bufferLayer.style.display = 'block';
    
    if (direction === 'next') bufferLayer.style.transform = 'translateX(100%)';
    else bufferLayer.style.transform = 'translateX(-100%)';

    try { await bufferLayer.decode(); } catch (e) {}
    void bufferLayer.offsetWidth;

    const transitionStyle = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
    bufferLayer.style.transition = transitionStyle;
    activeLayer.style.transition = transitionStyle;

    bufferLayer.style.transform = 'translateX(0)';
    if (direction === 'next') activeLayer.style.transform = 'translateX(-100%)';
    else activeLayer.style.transform = 'translateX(100%)';

    currentIndex = newIndex;

    thumbs.forEach(t => t.classList.remove('pdp-gallery__thumb--active'));
    visibleThumbs[currentIndex].classList.add('pdp-gallery__thumb--active');

    setTimeout(() => {
      activeLayer.style.display = 'none';
      let temp = activeLayer;
      activeLayer = bufferLayer;
      bufferLayer = temp;
      isAnimating = false;
    }, 400); 
  };

  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const visibleThumbs = getVisibleThumbs();
      const newIndex = visibleThumbs.indexOf(thumb);
      if (newIndex > -1) {
        slideTo(newIndex, newIndex > currentIndex ? 'next' : 'prev');
      }
    });
  });
}

async function initRelatedProducts() {
  const relatedGrid = document.getElementById('relatedProductsGrid');
  if (!relatedGrid) return;

  const category = relatedGrid.getAttribute('data-category');
  const currentSku = relatedGrid.getAttribute('data-sku');

  try {
    const response = await fetch('../products/catalog.json');
    if (!response.ok) return;
    const allItems = (await response.json()).map(sanitizeProductItem);

    // Если мы находимся на странице комплекта (KIT-...), и там еще нет коллажа — отрисовываем его
    if (category === 'kits') {
      const currentKit = allItems.find(i => String(i['Артикул']).trim() === currentSku);
      const mainGallery = document.querySelector('.pdp-gallery__main');
      const thumbsBox = document.getElementById('pdpThumbs');
      if (currentKit && mainGallery && !mainGallery.querySelector('.kit-collage')) {
        const currentKitInfo = resolveKitData(currentKit, allItems);
        if (currentKitInfo.components && currentKitInfo.components.length > 0) {
          mainGallery.innerHTML = buildKitCollageHtml(currentKitInfo.components, '../');
          if (thumbsBox) thumbsBox.style.display = 'none';
        }
      }
    }

    const items = allItems
      .filter(i => (i['Модель'] || i['Название комплекта']) && i['Категория'] === category && String(i['Артикул']).trim() !== currentSku)
      .slice(0, 3);

    relatedGrid.innerHTML = '';
    items.forEach(item => {
      const sku = String(item['Артикул']).trim();
      const model = item['Модель'] || item['Название комплекта'];
      const brand = item['Бренд'] ? String(item['Бренд']).toUpperCase() : 'CASPIAN SUN';
      const kitInfo = resolveKitData(item, allItems);
      const price = item['Цена'] || item['Итоговая цена ($)'] || kitInfo.price || 0;

      const isKitCollage = category === 'kits' && kitInfo.components && kitInfo.components.length > 0;
      const imgBoxClass = isKitCollage ? 'product-card__img-box product-card__img-box--collage' : 'product-card__img-box';
      const imgContentHtml = isKitCollage
        ? buildKitCollageHtml(kitInfo.components, '../')
        : `<img src="../img/catalog/${category}/${sku}/main.webp" alt="${model}" onerror="this.onerror=null; this.src='../img/catalog/placeholder.webp'">`;

      relatedGrid.insertAdjacentHTML('beforeend', `
        <article class="product-card">
          <div class="${imgBoxClass}">
            ${imgContentHtml}
          </div>
          <div class="product-card__info">
            <span class="product-card__category">${brand}</span>
            <h3 class="product-card__title">${model}</h3>
            <p class="product-card__specs">${item['Теги (для ИИ)'] || kitInfo.summary || ''}</p>
            <div class="product-card__footer">
              <span class="product-card__price">${formatPriceStr(price)} ₽</span>
              <a href="${sku}.html" class="product-card__details-link">ПОДРОБНЕЕ &rarr;</a>
            </div>
          </div>
        </article>
      `);
    });
  } catch (e) {
    console.error(e);
  }
}

function initQuantityPicker() {
  const pickers = document.querySelectorAll('.quantity-picker');
  pickers.forEach(picker => {
    const btnMinus = picker.querySelector('.qty-btn--minus');
    const btnPlus = picker.querySelector('.qty-btn--plus');
    const wrapper = picker.querySelector('.qty-val-wrapper');

    if (!btnMinus || !btnPlus) return;
    if (picker.dataset.initialized) return;
    picker.dataset.initialized = 'true';

    if (!wrapper) {
      const valSpan = picker.querySelector('.qty-val');
      if (!valSpan) return;
      btnMinus.addEventListener('click', () => {
        let v = parseInt(valSpan.textContent, 10) || 1;
        if (v > 1) valSpan.textContent = v - 1;
      });
      btnPlus.addEventListener('click', () => {
        let v = parseInt(valSpan.textContent, 10) || 1;
        if (v < 99) valSpan.textContent = v + 1;
      });
      return;
    }

    let isAnimating = false;

    const animateValue = (direction) => {
      if (isAnimating) return;
      const oldSpan = wrapper.querySelector('.qty-val');
      if (!oldSpan) return;

      let currentVal = parseInt(oldSpan.textContent, 10) || 1;
      let newVal = currentVal;

      if (direction === 'plus' && currentVal < 99) newVal++;
      if (direction === 'minus' && currentVal > 1) newVal--;
      if (currentVal === newVal) return;

      isAnimating = true;
      const newSpan = document.createElement('span');
      newSpan.className = 'qty-val';
      newSpan.textContent = newVal;
      
      newSpan.style.transform = direction === 'plus' ? 'translateY(-100%)' : 'translateY(100%)';
      newSpan.style.opacity = '0';
      wrapper.appendChild(newSpan);
      void newSpan.offsetWidth;

      oldSpan.style.transform = direction === 'plus' ? 'translateY(100%)' : 'translateY(-100%)';
      oldSpan.style.opacity = '0';
      newSpan.style.transform = 'translateY(0)';
      newSpan.style.opacity = '1';

      setTimeout(() => {
        if (oldSpan && oldSpan.parentNode) oldSpan.remove();
        isAnimating = false;
      }, 250);
    };

    btnMinus.addEventListener('click', (e) => { e.preventDefault(); animateValue('minus'); });
    btnPlus.addEventListener('click', (e) => { e.preventDefault(); animateValue('plus'); });
  });
}

function initScrollSpy() {
  const links = document.querySelectorAll('.ses-sidebar__link[href^="#"]');
  if (!links.length) return;

  const sections = Array.from(links).map(link => {
    return document.querySelector(link.getAttribute('href'));
  }).filter(section => section !== null);

  if (!sections.length) return;

  window.addEventListener('scroll', () => {
    let current = '';
    const scrollY = window.pageYOffset;

    sections.forEach(section => {
      const sectionTop = section.offsetTop - 160; 
      if (scrollY >= sectionTop) {
        current = section.getAttribute('id');
      }
    });

    if (current) {
      links.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${current}`) {
          link.classList.add('active');
        }
      });
    }
  });
}

// ==========================================================================
// 8. ЗАГРУЗКА МОДУЛЕЙ ШАПКИ И ПОДВАЛА
// ==========================================================================
async function loadLayoutModules() {
  const isSubFolder = window.location.pathname.includes('/products/');
  const headerPath = isSubFolder ? '../header.html' : 'header.html';
  const footerPath = isSubFolder ? '../footer.html' : 'footer.html';

  const headerPlaceholder = document.getElementById('header-placeholder');
  if (headerPlaceholder) {
    try {
      const response = await fetch(headerPath);
      if (response.ok) {
        let html = await response.text();
        if (isSubFolder) html = html.replace(/href="([^"]*\.html)"/g, 'href="../$1"');
        headerPlaceholder.outerHTML = html;
      }
    } catch (error) {
      console.error('Ошибка при загрузке шапки:', error);
    }
  }

  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (footerPlaceholder) {
    try {
      const response = await fetch(footerPath);
      if (response.ok) {
        let html = await response.text();
        if (isSubFolder) html = html.replace(/href="([^"]*\.html)"/g, 'href="../$1"');
        footerPlaceholder.outerHTML = html;
      }
    } catch (error) {
      console.error('Ошибка при загрузке подвала:', error);
    }
  }

  initHeaderEvents();
  setActiveMenuLink();
  injectHeaderCartLink();
  sanitizeStaticPdpSpecs();
  if (document.getElementById('productGrid')) loadCatalog();
  initProductGallery(); 
  initRelatedProducts();
  initQuantityPicker();
  initScrollSpy();
  initAddToCartButtons();
  renderCartPage();
  initCheckoutForm();
  initContactsPageForm();
}

document.addEventListener('DOMContentLoaded', loadLayoutModules);