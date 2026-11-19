#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Caspian Sun — Генератор статических страниц товаров
Запуск: python generate-products.py (или двойной клик по generate-products.bat)
"""

import os
import re
import json
import time

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATE_PATH = os.path.join(BASE_DIR, "product-template.html")
CATALOG_PATH = os.path.join(BASE_DIR, "products", "catalog.json")
OUTPUT_DIR = os.path.join(BASE_DIR, "products")

SKIP_COLUMNS = {
    'Бренд', 'Модель', 'Название комплекта', 'Модель / Наименование',
    'Цена', 'Сумма по прайсу ($)', 'Итоговая цена ($)', 'Изображение',
    'Теги (для ИИ)', 'Описание (для ИИ)', 'Преимущества (для ИИ)',
    'Категория', 'Артикул', 'SEO Заголовок', 'SEO Описание',
    'Количество доп фото', 'Позиция для комплекта', 'Состав комплекта',
    'Себестоимость ($)', 'Себестоимость (₽)', 'Цена +20% (₽)', 'Цена +25% (₽)', 
    'Цена +30% (₽)', 'Цена +40% (₽)', 'Цена +50% (₽)', 'Цена +60% (₽)', 
    'Цена +70% (₽)', 'Цена +80% (₽)', 'Цена +90% (₽)', 'Цена +100% (₽)', 
    'Цена +110% (₽)', 'Цена +120% (₽)', 'Цена +130% (₽)'
}

CATEGORY_NAMES = {
    'inverters': 'ИНВЕРТОРЫ',
    'batteries': 'АККУМУЛЯТОРЫ',
    'panels': 'СОЛНЕЧНЫЕ ПАНЕЛИ',
    'kits': 'ГОТОВЫЕ КОМПЛЕКТЫ',
    'shields': 'РАСПРЕДЕЛИТЕЛЬНЫЕ ЩИТКИ'
}


def fix_corrupted_date(val):
    if not isinstance(val, str):
        return val
    iso_regex = r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
    if not re.match(iso_regex, val.strip()):
        return val
    try:
        # ISO timestamp fix
        from datetime import datetime, timezone, timedelta
        dt = datetime.fromisoformat(val.replace('Z', '+00:00'))
        msk = dt.astimezone(timezone(timedelta(hours=3)))
        return f"{msk.day}.{msk.month}"
    except Exception:
        return val


def format_price(val):
    try:
        num_str = re.sub(r'[^0-9.]', '', str(val or '0'))
        num = float(num_str) if num_str else 0.0
        # Format as Russian ruble: 195 000
        formatted = f"{int(round(num)):,}".replace(',', ' ')
        return formatted if formatted else "0"
    except Exception:
        return "0"


def infer_category(sku):
    s = str(sku or '').strip().upper()
    if s.startswith('PAN-'):
        return 'panels'
    if s.startswith('INV-'):
        return 'inverters'
    if s.startswith('BAT-'):
        return 'batteries'
    if s.startswith('KIT-'):
        return 'kits'
    if s.startswith('SH-'):
        return 'shields'
    return 'other'


def build_kit_collage(item):
    def extract_sku(s):
        m = re.search(r'\[([^\]]+)\]', str(s or ''))
        return m.group(1).strip() if m else str(s or '').strip()

    def clean_name(s):
        return re.sub(r'^\[[^\]]+\]\s*', '', str(s or '')).strip()

    comps = []
    if item.get('Солнечная панель') and float(item.get('Кол-во панелей (шт.)') or 0) > 0:
        sku = extract_sku(item['Солнечная панель'])
        comps.append({
            'sku': sku,
            'category': 'panels',
            'qty': int(item.get('Кол-во панелей (шт.)') or 1),
            'title': clean_name(item['Солнечная панель'])
        })

    if item.get('Инвертор') and float(item.get('Кол-во инверторов (шт.)') or 0) > 0:
        sku = extract_sku(item['Инвертор'])
        comps.append({
            'sku': sku,
            'category': 'inverters',
            'qty': int(item.get('Кол-во инверторов (шт.)') or 1),
            'title': clean_name(item['Инвертор'])
        })

    if item.get('Аккумулятор (АКБ)') and float(item.get('Кол-во АКБ (шт.)') or 0) > 0:
        sku = extract_sku(item['Аккумулятор (АКБ)'])
        comps.append({
            'sku': sku,
            'category': 'batteries',
            'qty': int(item.get('Кол-во АКБ (шт.)') or 1),
            'title': clean_name(item['Аккумулятор (АКБ)'])
        })

    if not comps and item.get('Состав комплекта'):
        parts = [p.strip() for p in str(item['Состав комплекта']).split(',') if p.strip()]
        for p in parts:
            chunks = [c.strip() for c in p.split(':')]
            sku = chunks[0]
            qty = int(chunks[1]) if len(chunks) > 1 and chunks[1].isdigit() else 1
            cat = infer_category(sku)
            if cat in ('panels', 'inverters', 'batteries'):
                comps.append({'sku': sku, 'category': cat, 'qty': qty, 'title': sku})

    if not comps:
        return '<img src="../img/catalog/placeholder.webp" alt="Комплект" id="pdpMainImage">'

    order_map = {'panels': 1, 'inverters': 2, 'batteries': 3}
    sorted_comps = sorted(comps, key=lambda c: order_map.get(c['category'], 9))[:4]

    cells = []
    for c in sorted_comps:
        badge = f'<span class="kit-collage__qty">&times;{c["qty"]}</span>' if c['qty'] > 1 else ''
        title_attr = c['title'].replace('"', '&quot;')
        cell = (
            f'<div class="kit-collage__cell" title="{title_attr}">\n'
            f'  <img src="../img/catalog/{c["category"]}/{c["sku"]}/main.webp" alt="{c["sku"]}" onerror="this.onerror=null; this.src=\'../img/catalog/placeholder.webp\'">\n'
            f'  {badge}\n'
            f'</div>'
        )
        cells.append(cell)

    count = min(4, len(sorted_comps))
    return f'<div class="kit-collage kit-collage--{count}">\n' + "\n".join(cells) + "\n</div>"


def main():
    start_time = time.time()
    print("=" * 60)
    print("  CASPIAN SUN — Генератор страниц товаров (V2)")
    print("=" * 60)

    if not os.path.exists(TEMPLATE_PATH):
        print(f"❌ Ошибка: не найден файл шаблона: {TEMPLATE_PATH}")
        return

    if not os.path.exists(CATALOG_PATH):
        print(f"❌ Ошибка: не найден каталог: {CATALOG_PATH}")
        return

    with open(TEMPLATE_PATH, "r", encoding="utf-8") as tf:
        template = tf.read()

    with open(CATALOG_PATH, "r", encoding="utf-8") as cf:
        raw_products = json.load(cf)

    print(f"📁 Загружено записей из catalog.json: {len(raw_products)}")

    valid_products = []
    for item in raw_products:
        cleaned = {}
        for k, v in item.items():
            clean_val = fix_corrupted_date(v)
            if clean_val not in (None, 'Количество доп фото'):
                cleaned[k.strip()] = clean_val

        sku = str(cleaned.get('Артикул') or '').strip()
        cat = cleaned.get('Категория') or infer_category(sku)
        cleaned['Категория'] = cat

        if not cleaned.get('Модель'):
            cleaned['Модель'] = cleaned.get('Название комплекта') or cleaned.get('Модель / Наименование') or ''

        if cat == 'kits' and not cleaned.get('Бренд'):
            cleaned['Бренд'] = 'Caspian Sun'

        if not cleaned.get('Цена') and (cleaned.get('Итоговая цена ($)') or cleaned.get('Сумма по прайсу ($)')):
            cleaned['Цена'] = cleaned.get('Итоговая цена ($)') or cleaned.get('Сумма по прайсу ($)')

        if cleaned.get('Модель') and sku and cat != 'shields':
            valid_products.append(cleaned)

    print(f"⚡ Товаров для генерации: {len(valid_products)}")

    generated_count = 0
    for item in valid_products:
        sku = str(item['Артикул']).strip()
        cat_id = item['Категория']
        brand = str(item.get('Бренд') or 'CASPIAN SUN').upper()
        model = str(item['Модель']).strip()
        cat_name = CATEGORY_NAMES.get(cat_id, 'ОБОРУДОВАНИЕ')

        seo_title = item.get('SEO Заголовок') or f"{model} — Купить в Caspian Sun"
        seo_desc = item.get('SEO Описание') or f"Заказать {model} от {brand}. Надежное оборудование для солнечных электростанций."
        short_desc = item.get('Теги (для ИИ)') or ''
        full_desc = item.get('Описание (для ИИ)') or 'Описание готовится к публикации.'
        price_rub = format_price(item.get('Цена') or '0')

        if cat_id == 'kits':
            og_image = "https://caspiansun.github.io/img/production/Production1.webp"
        else:
            og_image = f"https://caspiansun.github.io/img/catalog/{cat_id}/{sku}/main.webp"

        features_html = ""
        if item.get('Преимущества (для ИИ)'):
            lines = [re.sub(r'^- ', '', f).strip() for f in str(item['Преимущества (для ИИ)']).split('\n') if f.strip()]
            features_html = "".join([
                f'<li><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/></svg>{f}</li>'
                for f in lines
            ])

        specs_html = ""
        for k, v in item.items():
            if k not in SKIP_COLUMNS and v not in ('', None):
                specs_html += f'<div class="pdp-spec-row"><span class="pdp-spec-name">{k}</span><span class="pdp-spec-value">{v}</span></div>'

        if cat_id == 'kits':
            gallery_main_html = build_kit_collage(item)
            gallery_thumbs_html = ""
        else:
            gallery_main_html = (
                f'<img src="../img/catalog/{cat_id}/{sku}/main.webp" alt="{model}" id="pdpMainImage" '
                f'onerror="this.onerror=null; this.src=\'../img/catalog/placeholder.webp\'">'
            )
            gallery_thumbs_html = (
                f'<img src="../img/catalog/{cat_id}/{sku}/main.webp" alt="{model}" '
                f'class="pdp-gallery__thumb pdp-gallery__thumb--active" onerror="this.style.display=\'none\'">'
            )
            for i in range(1, 6):
                gallery_thumbs_html += (
                    f'<img src="../img/catalog/{cat_id}/{sku}/dop{i}.webp" alt="{model} фото {i}" '
                    f'class="pdp-gallery__thumb" onerror="this.style.display=\'none\'">'
                )

        page_html = template
        page_html = page_html.replace('{{SEO_TITLE}}', seo_title)
        page_html = page_html.replace('{{SEO_DESC}}', seo_desc)
        page_html = page_html.replace('{{OG_IMAGE}}', og_image)
        page_html = page_html.replace('{{CATEGORY_ID}}', cat_id)
        page_html = page_html.replace('{{CATEGORY_NAME}}', cat_name)
        page_html = page_html.replace('{{MODEL}}', model)
        page_html = page_html.replace('{{BRAND}}', brand)
        page_html = page_html.replace('{{SKU}}', sku)
        page_html = page_html.replace('{{SHORT_DESC}}', short_desc)
        page_html = page_html.replace('{{PRICE}}', price_rub)
        page_html = page_html.replace('{{FEATURES_LIST}}', features_html)
        page_html = page_html.replace('{{FULL_DESC}}', full_desc)
        page_html = page_html.replace('{{SPECS_TABLE}}', specs_html)
        page_html = page_html.replace('{{GALLERY_MAIN}}', gallery_main_html)
        page_html = page_html.replace('{{GALLERY_THUMBS}}', gallery_thumbs_html)

        out_file = os.path.join(OUTPUT_DIR, f"{sku}.html")
        with open(out_file, "w", encoding="utf-8") as out:
            out.write(page_html.strip() + "\n")

        generated_count += 1

    elapsed = time.time() - start_time
    print(f"✅ Успешно сгенерировано {generated_count} страниц товаров в папку products/ за {elapsed:.2f} сек.")
    print("=" * 60)


if __name__ == "__main__":
    main()
