// ВАЖНО: Скрипт загружает данные из локального JSON файла
const GOOGLE_SHEET_API_URL = 'products/catalog.json';

let globalProducts = [];

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
  
  if (path.includes('product.html') || path.includes('product-template.html')) {
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
        const parentBtn = link.closest('.header__dropdown').querySelector('.header__dropdown-btn');
        if (parentBtn) {
          parentBtn.classList.add('header__nav-link--active');
        }
      }
    }
  });
}

// ==========================================================================
// ЛОГИКА КАТАЛОГА (FETCH + РЕНДЕР)
// ==========================================================================
async function loadCatalog() {
  const grid = document.getElementById('productGrid');
  if (!grid) return;

  grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 4rem 0;">Загрузка оборудования...</p>';

  try {
    const isSubFolder = window.location.pathname.includes('/products/');
    const dataPath = isSubFolder ? '../products/catalog.json' : 'products/catalog.json';
    
    const response = await fetch(dataPath);
    if (!response.ok) throw new Error('Network response was not ok');
    
    globalProducts = await response.json();
    grid.innerHTML = ''; 

    globalProducts.forEach((item, index) => {
      if (!item['Модель']) return;

      const category = item['Категория'] || 'other';
      const brand = item['Бренд'] ? String(item['Бренд']).toLowerCase().trim() : 'other';
      const sku = item['Артикул'] || 'N/A';
      
      const powerRaw = item['Мощность (кВт)'] || item['Емкость (кВт·ч)'] || 0;
      const power = parseFloat(powerRaw) || 0;
      
      const price = item['Цена'] || '0';
      const specText = item['Теги (для ИИ)'] || ''; 

      let categoryLabel = 'ОБОРУДОВАНИЕ';
      if (category === 'inverters') categoryLabel = `ИНВЕРТОР • ${brand.toUpperCase()}`;
      if (category === 'batteries') categoryLabel = `АККУМУЛЯТОР • ${brand.toUpperCase()}`;
      if (category === 'panels') categoryLabel = `СОЛНЕЧНАЯ ПАНЕЛЬ • ${brand.toUpperCase()}`;

      const cardHtml = `
        <article class="product-card" data-index="${index}" data-sku="${sku}" data-category="${category}" data-brand="${brand}" data-power="${power}">
          <div class="product-card__img-box">
            <img src="img/catalog/${category}/${sku}/main.webp" alt="${item['Модель']}" onerror="this.onerror=null; this.src='img/catalog/placeholder.webp'">
          </div>
          <div class="product-card__info">
            <span class="product-card__category">${categoryLabel}</span>
            <h3 class="product-card__title">${item['Модель']}</h3>
            <p class="product-card__specs">${specText}</p>
            <div class="product-card__footer">
              <span class="product-card__price">${price} $</span>
              
              <a href="products/${sku}.html" class="product-card__details-link" aria-label="Смотреть товар">
                ПОДРОБНЕЕ
                <svg viewBox="0 0 16 16"><line x1="2" y1="8" x2="14" y2="8"></line><polyline points="10 4 14 8 10 12"></polyline></svg>
              </a>
              
            </div>
          </div>
        </article>
      `;
      grid.insertAdjacentHTML('beforeend', cardHtml);
    });

    initCatalogFilters();
    initProductDrawer();

  } catch (error) {
    console.error('Ошибка загрузки каталога:', error);
    grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #ff5555; padding: 4rem 0;">Не удалось загрузить каталог. Убедитесь, что вы сгенерировали файл catalog.json.</p>';
    const countEl = document.getElementById('catalogCount');
    if (countEl) countEl.textContent = 'Ошибка';
  }
}

// ==========================================================================
// ЛОГИКА ФИЛЬТРОВ
// ==========================================================================
function initCatalogFilters() {
  const filterInputs = document.querySelectorAll('#catalogFilters input');
  const productCards = document.querySelectorAll('.product-card');
  const catalogCount = document.getElementById('catalogCount');
  const resetBtn = document.getElementById('resetFiltersBtn');

  if (!filterInputs.length || !productCards.length) return;

  function updateCatalog() {
    const activeCategories = Array.from(document.querySelectorAll('input[data-filter-type="category"]:checked')).map(cb => cb.value);
    const activeBrands = Array.from(document.querySelectorAll('input[data-filter-type="brand"]:checked')).map(cb => cb.value);
    const activePower = document.querySelector('input[data-filter-type="power"]:checked')?.value;

    let visibleCount = 0;

    productCards.forEach(card => {
      const cardCategory = card.getAttribute('data-category');
      const cardBrand = card.getAttribute('data-brand');
      const cardPower = parseFloat(card.getAttribute('data-power'));

      const matchCategory = activeCategories.length === 0 || activeCategories.includes(cardCategory);
      const matchBrand = activeBrands.length === 0 || activeBrands.includes(cardBrand);
      
      let matchPower = true;
      if (activePower) {
        if (activePower === '0-5') matchPower = cardPower <= 5;
        else if (activePower === '5-10') matchPower = cardPower > 5 && cardPower <= 10;
        else if (activePower === '10-30') matchPower = cardPower > 10 && cardPower <= 30;
        else if (activePower === '30+') matchPower = cardPower > 30;
      }

      if (matchCategory && matchBrand && matchPower) {
        card.style.display = '';
        visibleCount++;
      } else {
        card.style.display = 'none';
      }
    });

    if (catalogCount) {
      catalogCount.textContent = `Найдено: ${visibleCount} товар${getNounPluralForm(visibleCount, '', 'а', 'ов')}`;
    }
  }

  function getNounPluralForm(a, str1, str2, str3) {
    if (a % 10 === 1 && a % 100 !== 11) return str1;
    if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 10 || a % 100 >= 20)) return str2;
    return str3;
  }

  filterInputs.forEach(input => input.addEventListener('change', updateCatalog));

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      filterInputs.forEach(input => {
        if (input.type === 'checkbox' || input.type === 'radio') input.checked = false;
      });
      updateCatalog();
    });
  }

  updateCatalog();
}

// ==========================================================================
// ЛОГИКА БОКОВОЙ ПАНЕЛИ (DRAWER)
// ==========================================================================
function initProductDrawer() {
  const grid = document.getElementById('productGrid');
  const drawer = document.querySelector('.product-drawer');
  if (!grid || !drawer) return;

  const closeBtn = drawer.querySelector('.product-drawer__close');
  const backdrop = drawer.querySelector('.product-drawer__backdrop');

  function openDrawer(index) {
    const item = globalProducts[index];
    if (!item) return;

    const category = item['Категория'] || 'other';
    const brand = item['Бренд'] ? String(item['Бренд']).toUpperCase() : '';
    const sku = item['Артикул'] || 'N/A';
    
    let categoryLabel = category === 'inverters' ? 'ИНВЕРТОР' : category === 'batteries' ? 'АККУМУЛЯТОР' : 'СОЛНЕЧНАЯ ПАНЕЛЬ';
    
    drawer.querySelector('.product-drawer__category').textContent = `${categoryLabel} • ${brand} • АРТ: ${sku}`;
    drawer.querySelector('.product-drawer__title').textContent = item['Модель'] || 'Без названия';
    drawer.querySelector('.product-drawer__specs-bar').textContent = item['Теги (для ИИ)'] || '';
    drawer.querySelector('.product-drawer__desc').textContent = item['Описание (для ИИ)'] || '';
    drawer.querySelector('.product-drawer__price').textContent = `${item['Цена']} $`;
    
    const valWrapper = drawer.querySelector('.qty-val-wrapper');
    if (valWrapper) {
        valWrapper.innerHTML = '<span class="qty-val">1</span>';
    }

    const galleryMain = drawer.querySelector('.gallery-main');
    galleryMain.src = `img/catalog/${category}/${sku}/main.webp`;
    galleryMain.onerror = function() {
        this.onerror = null;
        this.src = 'img/catalog/placeholder.webp';
    };

    const featuresList = drawer.querySelector('.product-drawer__features');
    featuresList.innerHTML = '';
    if (item['Преимущества (для ИИ)']) {
      const features = String(item['Преимущества (для ИИ)']).split('\n').map(f => f.replace(/^- /, '').trim()).filter(f => f);
      features.forEach(f => {
        featuresList.insertAdjacentHTML('beforeend', `<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>${f}</li>`);
      });
    }

    const specsContainer = document.getElementById('drawerSpecs');
    specsContainer.innerHTML = '';
    const skipKeys = ['Бренд', 'Модель', 'Цена', 'Изображение', 'Теги (для ИИ)', 'Описание (для ИИ)', 'Преимущества (для ИИ)', 'Категория', 'Артикул', 'SEO Заголовок', 'SEO Описание', 'Количество доп. фото'];
    
    for (const key in item) {
      if (!skipKeys.includes(key) && item[key]) {
        specsContainer.insertAdjacentHTML('beforeend', `<div class="spec-row"><span>${key}</span><span>${item[key]}</span></div>`);
      }
    }

    let detailsLink = drawer.querySelector('.pdp-link-btn');
    if(!detailsLink) {
        const purchaseActions = drawer.querySelector('.purchase-actions');
        detailsLink = document.createElement('a');
        detailsLink.className = 'btn btn--outline-light pdp-link-btn';
        detailsLink.style.marginTop = '1rem';
        detailsLink.textContent = 'ПОДРОБНЕЕ О ТОВАРЕ';
        purchaseActions.parentNode.appendChild(detailsLink);
    }
    detailsLink.href = `products/${sku}.html`;

    drawer.classList.add('product-drawer--open');
  }

  function closeDrawer() {
    drawer.classList.remove('product-drawer--open');
  }

  grid.addEventListener('click', (e) => {
    if(e.target.closest('.product-card__details-link')) {
        return;
    }

    const card = e.target.closest('.product-card');
    if (card) {
      e.preventDefault();
      const index = card.getAttribute('data-index');
      openDrawer(index);
    }
  });

  closeBtn.addEventListener('click', closeDrawer);
  backdrop.addEventListener('click', closeDrawer);
}

// ==========================================================================
// ЛОГИКА ГАЛЕРЕИ НА СТРАНИЦЕ ТОВАРА
// ==========================================================================
function initProductGallery() {
  const thumbs = document.querySelectorAll('.pdp-gallery__thumb');
  const mainContainer = document.querySelector('.pdp-gallery__main');
  const originalImage = document.getElementById('pdpMainImage');
  const btnPrev = document.querySelector('.pdp-gallery__arrow--prev');
  const btnNext = document.querySelector('.pdp-gallery__arrow--next');

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

  const updateArrowsVisibility = () => {
    const visibleThumbs = getVisibleThumbs();
    if (visibleThumbs.length <= 1) {
      if (btnPrev) btnPrev.style.display = 'none';
      if (btnNext) btnNext.style.display = 'none';
    } else {
      if (btnPrev) btnPrev.style.display = 'flex';
      if (btnNext) btnNext.style.display = 'flex';
    }
  };

  setTimeout(updateArrowsVisibility, 150);

  const slideTo = async (newIndex, direction) => {
    const visibleThumbs = getVisibleThumbs();
    if (newIndex === currentIndex || isAnimating || !visibleThumbs[newIndex]) return;

    isAnimating = true;
    const newSrc = visibleThumbs[newIndex].src;

    bufferLayer.src = newSrc;
    bufferLayer.style.transition = 'none';
    bufferLayer.style.display = 'block';
    
    if (direction === 'next') {
      bufferLayer.style.transform = 'translateX(100%)';
    } else {
      bufferLayer.style.transform = 'translateX(-100%)';
    }

    try {
      await bufferLayer.decode();
    } catch (e) {}

    void bufferLayer.offsetWidth;

    const transitionStyle = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
    bufferLayer.style.transition = transitionStyle;
    activeLayer.style.transition = transitionStyle;

    bufferLayer.style.transform = 'translateX(0)';
    if (direction === 'next') {
      activeLayer.style.transform = 'translateX(-100%)';
    } else {
      activeLayer.style.transform = 'translateX(100%)';
    }

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
        const direction = newIndex > currentIndex ? 'next' : 'prev';
        slideTo(newIndex, direction);
      }
    });
  });

  if (btnPrev && btnNext) {
    btnPrev.addEventListener('click', () => {
      const visibleThumbs = getVisibleThumbs();
      let newIndex = currentIndex - 1;
      if (newIndex < 0) newIndex = visibleThumbs.length - 1;
      slideTo(newIndex, 'prev');
    });

    btnNext.addEventListener('click', () => {
      const visibleThumbs = getVisibleThumbs();
      let newIndex = currentIndex + 1;
      if (newIndex >= visibleThumbs.length) newIndex = 0;
      slideTo(newIndex, 'next');
    });
  }
}

// ==========================================================================
// ЛОГИКА СЧЕТЧИКА
// ==========================================================================
function initQuantityPicker() {
  const pickers = document.querySelectorAll('.quantity-picker');

  pickers.forEach(picker => {
    const btnMinus = picker.querySelector('.qty-btn--minus');
    const btnPlus = picker.querySelector('.qty-btn--plus');
    const wrapper = picker.querySelector('.qty-val-wrapper');

    if (!btnMinus || !btnPlus || !wrapper) return;
    if (picker.dataset.initialized) return;
    picker.dataset.initialized = 'true';

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

    btnMinus.addEventListener('click', (e) => {
        e.preventDefault();
        animateValue('minus');
    });
    btnPlus.addEventListener('click', (e) => {
        e.preventDefault();
        animateValue('plus');
    });
  });
}

// ==========================================================================
// ЗАГРУЗКА ШАПКИ И ПОДВАЛА
// ==========================================================================
async function loadLayoutModules() {
  const isSubFolder = window.location.pathname.includes('/products/');
  const headerPath = isSubFolder ? '../header.html' : 'header.html';
  const footerPath = isSubFolder ? '../footer.html' : 'footer.html';

  // 1. Загрузка Шапки
  const headerPlaceholder = document.getElementById('header-placeholder');
  if (headerPlaceholder) {
    try {
      const response = await fetch(headerPath);
      if (response.ok) {
        let html = await response.text();
        if (isSubFolder) {
          html = html.replace(/href="([^"]*\.html)"/g, 'href="../$1"');
        }
        headerPlaceholder.outerHTML = html;
      }
    } catch (error) {
      console.error('Не удалось загрузить header.html:', error);
    }
  }

  // 2. Загрузка Подвала (добавлено)
  const footerPlaceholder = document.getElementById('footer-placeholder');
  if (footerPlaceholder) {
    try {
      const response = await fetch(footerPath);
      if (response.ok) {
        let html = await response.text();
        if (isSubFolder) {
          html = html.replace(/href="([^"]*\.html)"/g, 'href="../$1"');
        }
        footerPlaceholder.outerHTML = html;
      }
    } catch (error) {
      console.error('Не удалось загрузить footer.html:', error);
    }
  }

  // 3. Инициализация интерактивных элементов
  initHeaderEvents();
  setActiveMenuLink();
  if (document.getElementById('productGrid')) loadCatalog();
  initProductGallery(); 
  initQuantityPicker();
}

document.addEventListener('DOMContentLoaded', loadLayoutModules);