#!/usr/bin/env python3
"""
Convert a Weiss Schwarz card-sheet PDF (one row per card: number, text, images)
into data the wiki app can load.

Usage:
  python3 tools/pdf_to_cards.py SHEET.pdf --set-name "BanG Dream! 10th Anniversary Premium Booster" \
      --series "BanG Dream!" --release-date 2026-10-30

Output (default: data/imports/<set-code>/):
  cards.json     card records in the app's shape
  images/*.webp  main art + alternate art for every card
  report.txt     what was read from text vs. from the images, and anything uncertain
and updates data/imports/index.json so the app picks the pack up automatically.

Fields read from the PDF text:  number, name, level, cost, type, traits, effect, notes, triggers, rarities
Fields read from card images:   power (OCR), color (bottom-bar hue), soul icons (count), Soul trigger icon (other trigger icons are not recognised)
Japanese title:                 OCR if the tesseract 'jpn' model is installed (otherwise left null)
Fields NOT readable:            illustrator, flavor  (left null; use overrides.json)

overrides.json (optional, next to cards.json):
  { "BD/WE49-01": { "soul": 1, "nameJp": "…", "color": "Yellow" }, ... }
  Overrides are re-applied every run, so manual fixes are never lost.

Requires: pdftotext + pdfimages (poppler), pdfplumber, Pillow, pytesseract + tesseract.
"""
import argparse, colorsys, json, os, re, subprocess, sys, tempfile
from collections import Counter

import pdfplumber
import pytesseract
from PIL import Image, ImageOps

RARITY_TOKENS = ['SSP', 'BDR', 'SP', 'SR', 'RR', 'R', 'U', 'C']
NUM_RE = re.compile(r'^([A-Z0-9]+/[A-Z0-9]+-\d+[A-Za-z]*)\b')
CHAR_HDR = re.compile(r'^\((\w+)\)\s+(\d+)/(\d+)\s+(.+?)\s+\((.*)\)\s*$')
CX_HDR = re.compile(r'^\((\w+)\)\s+(.+?)\s*CX\s*$')
ABILITY = re.compile(r'^(AUTO|CONT|ACT)\b\s*-?\s*(.*)$', re.S)


def run(cmd):
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def slug(number):
    return re.sub(r'[^A-Za-z0-9]+', '-', number).strip('-')


# ───────────────────────── text ─────────────────────────
def parse_text(pdf_path):
    """Position-based parse (same algorithm as js/lib/sheet-parser.js):
    columns come from where the images sit, so text laid over an image slot ("TBA") is ignored."""
    raw = []
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            words = page.extract_words()
            imgs = sorted(page.images, key=lambda i: i['x0'])
            cols = []
            for im in imgs:
                for c in cols:
                    if abs(c['x'] - im['x0']) <= 12:
                        c['right'] = max(c['right'], im['x1']); break
                else:
                    cols.append({'x': im['x0'], 'right': im['x1']})
            main = cols[0] if cols and cols[0]['x'] < page.width * 0.4 else None
            main_right = main['right'] if main else page.width * 0.2
            alt_left = cols[1]['x'] if len(cols) > 1 else page.width * 0.6
            number_max = main['x'] - 1 if main else main_right
            nums = sorted([w for w in words if w['x0'] < number_max and re.fullmatch(r'[A-Z0-9]+/[A-Z0-9]+-\d+[A-Za-z]*', w['text'])], key=lambda w: w['top'])
            for i, n in enumerate(nums):
                lo, hi = n['top'] - 4, nums[i + 1]['top'] - 4 if i + 1 < len(nums) else float('inf')
                row = [w for w in words if lo <= w['top'] < hi]
                raw.append({'number': n['text'],
                            'text': [w for w in row if main_right - 1 <= w['x0'] < alt_left - 1],
                            'rar': [w for w in row if w['x0'] >= alt_left - 1]})

    def lines_of(ws):
        lines = []
        for w in sorted(ws, key=lambda w: (w['top'], w['x0'])):
            h = w['bottom'] - w['top']
            for l in lines:
                if abs(l['top'] - w['top']) <= max(2.5, h * 0.4):
                    l['ws'].append(w); break
            else:
                lines.append({'top': w['top'], 'ws': [w]})
        out = []
        for l in lines:
            l['ws'].sort(key=lambda w: w['x0'])
            text = ''
            for i, w in enumerate(l['ws']):
                if i:
                    prev = l['ws'][i - 1]; h = w['bottom'] - w['top']
                    if w['x0'] - prev['x1'] > max(0.6, h * 0.15):
                        text += ' '
                text += w['text']
            out.append((l['top'], re.sub(r'\s+', ' ', text).strip()))
        return out

    all_lines = [(r, lines_of(r['text'])) for r in raw]
    dys = sorted(d for _, ls in all_lines for d in (b[0] - a[0] for a, b in zip(ls, ls[1:])) if 0 < d < 12)
    pitch = dys[len(dys) // 2] if dys else 8.4
    blocks = []
    for r, ls in all_lines:
        lines, last = [], None
        for top, text in ls:
            if not text:
                continue
            if last is not None and top - last > pitch * 1.5:
                lines.append('')
            lines.append(text); last = top
        toks = ' '.join(t for _, t in lines_of(r['rar'])).replace(',', ' ').replace('&', ' ').split()
        blocks.append({'number': r['number'], 'lines': lines, 'rarities': [t for t in toks if t in RARITY_TOKENS]})
    return blocks


def parse_block(b, warnings):
    lines = b['lines']
    header = next((l for l in lines if l), '')
    paras, buf = [], []
    for l in lines[lines.index(header) + 1:] if header else []:
        if l:
            buf.append(l)
        elif buf:
            paras.append(' '.join(buf)); buf = []
    if buf:
        paras.append(' '.join(buf))

    card = {'number': b['number'], 'rarities': b['rarities'], 'effect': [], 'notes': [], 'triggers': [], 'traits': [],
            'level': None, 'cost': None, 'type': None, 'name': None, 'printTag': None}
    m = CHAR_HDR.match(header)
    if m:
        card.update(type='Character', printTag=m.group(1), level=int(m.group(2)), cost=int(m.group(3)),
                    name=m.group(4), traits=[t.strip() for t in m.group(5).split('/') if t.strip()])
    else:
        m = CX_HDR.match(header)
        if m:
            kind = m.group(2).strip()
            card.update(type='Climax', printTag=m.group(1), name=f'{kind} CX', triggers=[kind])
        else:
            warnings.append(f'{b["number"]}: unrecognised header "{header}"')
            card['name'] = header or b['number']
            card['type'] = 'Character'
    for p in paras:
        p = re.sub(r'\s+', ' ', p).strip()
        if p.lower().startswith('note:'):
            note = p[5:].strip()
            card['notes'].append(note)
            t = re.search(r'Has an? (\w+) Trigger', note, re.I)
            if t and t.group(1).title() not in card['triggers']:
                card['triggers'].append(t.group(1).title())
            continue
        a = ABILITY.match(p)
        if a:
            card['effect'].append(f'[{a.group(1)}] {a.group(2)}'.strip())
        elif card['effect']:
            card['effect'][-1] += ' ' + p  # continuation: "- AUTO …" sub-abilities, "a) … b) …" choices
        else:
            card['effect'].append(p)
    return card


# ───────────────────────── images ─────────────────────────
def image_map(pdf_path, numbers_by_page, tmp, warnings):
    """Return {number: {'main': png_path, 'alts': [png_path,…]}} using each image's position on the page."""
    run(['pdfimages', '-png', '-p', pdf_path, os.path.join(tmp, 'i')])
    files = sorted(os.listdir(tmp))
    result, idx = {}, 0
    with pdfplumber.open(pdf_path) as pdf:
        for pno, page in enumerate(pdf.pages, start=1):
            words = [w for w in page.extract_words() if NUM_RE.match(w['text']) and w['x0'] < 130]
            rows = [(w['text'], w['top']) for w in words]
            for im in page.images:
                f = files[idx]; idx += 1
                if not f.startswith(f'i-{pno:03d}-'):
                    raise SystemExit(f'image order mismatch on page {pno}: {f}')
                if not rows:
                    continue
                num = min(rows, key=lambda r: abs(r[1] - im['top']))[0]
                slot = result.setdefault(num, {'main': None, 'alts': []})
                path = os.path.join(tmp, f)
                if im['x0'] < 200 and slot['main'] is None:
                    slot['main'] = path
                else:
                    slot['alts'].append(path)
    if idx != len(files):
        warnings.append(f'{len(files) - idx} extracted images were not on any page position')
    return result


def dominant_color(img):
    """Card color = hue of the nameplate bar (left half, clear of the gold trim and anniversary badge)."""
    w, h = img.size
    box = (int(.27 * w), int(.915 * h), int(.60 * w), int(.985 * h)) if h > w else (int(.05 * w), int(.935 * h), int(.60 * w), int(.985 * h))
    c = Counter()
    for r, g, b in img.crop(box).convert('RGB').resize((120, 24)).get_flattened_data() if hasattr(Image.Image, 'get_flattened_data') else img.crop(box).convert('RGB').resize((120, 24)).getdata():
        hh, s, v = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
        if s < .45 or v < .35:
            continue
        d = hh * 360
        c[('Red' if d < 20 or d >= 335 else 'Yellow' if d < 75 else 'Green' if d < 175 else 'Blue' if d < 258 else 'Purple')] += 1
    if not c:
        return None, 0
    name, n = c.most_common(1)[0]
    return (name, n) if n >= 100 else (None, n)


POWER_VARIANTS = [((.05, .91, .25, .98), 7), ((.06, .915, .245, .975), 8), ((.05, .91, .25, .98), 13), ((.04, .905, .26, .985), 7)]


def read_power(img):
    """OCR the power box several ways and vote. Returns (value or None, agreeing_reads)."""
    w, h = img.size
    if w > h:
        return None, 0
    votes = Counter()
    for box, psm in POWER_VARIANTS:
        crop = img.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))).convert('L')
        g = ImageOps.invert(ImageOps.autocontrast(crop)).resize((crop.width * 4, crop.height * 4))
        g = ImageOps.expand(g, 30, fill=255)
        out = pytesseract.image_to_string(g, config=f'--psm {psm} -c tessedit_char_whitelist=0123456789').strip()
        if out.isdigit() and 500 <= int(out) <= 20000 and int(out) % 500 == 0:
            votes[int(out)] += 1
    if not votes:
        return None, 0
    val, n = votes.most_common(1)[0]
    return val, n


def read_soul(img):
    """Count the silver soul icons printed right of the power box .
    Returns 1-4, or None when no icon is found (Events/Climax, or an unreadable image)."""
    import numpy as np
    w, h = img.size
    if w > h:
        return None
    x0, y0 = int(.27 * w) + int(.035 * w), int(.93 * h) + int(.009 * h)
    box = img.crop((x0, y0, x0 + int(.131 * w), y0 + int(.023 * h))).convert('HSV')
    a = np.asarray(box).astype(float) / 255
    cols = ((a[..., 1] < .3) & (a[..., 2] > .25)).mean(0) > .5   # silver = unsaturated, not black
    icon, gap = .035 * w, max(2, round(.008 * w))
    runs, i = [], 0
    xs = [i for i, v in enumerate(cols) if v]
    for x in xs:   # merge silver columns separated by small gaps (icon highlights break a run)
        if runs and x - runs[-1][1] <= gap + 1:
            runs[-1][1] = x
        else:
            runs.append([x, x])
    n = sum(max(1, round((r[1] - r[0] + 1) / icon)) for r in runs if r[1] - r[0] + 1 >= .6 * icon)
    return n if 1 <= n <= 4 else None


def has_soul_trigger(img):
    """Soul trigger icon = opaque black hexagon with a silver fleur (top right of the art).
    A card with no trigger shows a faint translucent hexagon there instead. None for landscape (Climax) cards."""
    import numpy as np
    w, h = img.size
    if w > h:
        return None
    cx, cy, r = int(.895 * w), int(.083 * h), int(.045 * w)
    v = np.asarray(img.crop((cx - r, cy - r, cx + r, cy + r)).convert('HSV')).astype(float)[..., 2] / 255
    return bool((v < .22).mean() >= .08)


_JPN = None


def have_jpn():
    """True when tesseract has the Japanese model (install: apt install tesseract-ocr-jpn, or add jpn.traineddata to tessdata)."""
    global _JPN
    if _JPN is None:
        try:
            _JPN = 'jpn' in pytesseract.get_languages(config='')
        except Exception:
            _JPN = False
    return _JPN


def read_name_jp(img):
    """OCR the Japanese title printed in the colored bar (white lettering). Returns text or None.
    Needs the tesseract 'jpn' model; check the result by eye, stylised lettering is not always read exactly."""
    import numpy as np
    w, h = img.size
    if w > h or not have_jpn():
        return None
    crop = img.crop((int(.255 * w), int(.898 * h), int(.84 * w), int(.945 * h))).convert('HSV')
    a = np.asarray(crop).astype(float) / 255
    ink = (a[..., 2] > .82) & (a[..., 1] < .30)           # white letters
    g = Image.fromarray(np.where(ink, 0, 255).astype('uint8')).resize((crop.width * 4, crop.height * 4), Image.LANCZOS)
    g = ImageOps.expand(g, 30, fill=255)
    out = pytesseract.image_to_string(g, lang='jpn', config='--psm 7').strip().replace(' ', '').replace('\n', '')
    return out or None


def save_webp(src, dst, max_side=640):
    im = Image.open(src).convert('RGB')
    im.thumbnail((max_side, max_side))
    im.save(dst, 'WEBP', quality=82, method=6)


# ───────────────────────── main ─────────────────────────
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('pdf')
    ap.add_argument('--set-name', required=True)
    ap.add_argument('--series', required=True)
    ap.add_argument('--set-code', help='default: taken from the card numbers (e.g. BD/WE49)')
    ap.add_argument('--set-type', default='Booster Pack')
    ap.add_argument('--release-date', default='')
    ap.add_argument('--out', default=None, help='output directory (default data/imports/<set-code>)')
    ap.add_argument('--no-images', action='store_true')
    ap.add_argument('--no-ocr', action='store_true', help='skip power/color detection')
    ap.add_argument('--keep-sample', action='store_true', help='keep the built-in sample cards alongside imports')
    a = ap.parse_args()

    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    warnings = []
    blocks = parse_text(a.pdf)
    if not blocks:
        sys.exit('No card numbers found in the PDF text. Is it a scanned image? (OCR is not supported yet.)')
    cards = [parse_block(b, warnings) for b in blocks]
    set_code = a.set_code or cards[0]['number'].rsplit('-', 1)[0]
    out = a.out or os.path.join(root, 'data', 'imports', slug(set_code).lower())
    os.makedirs(os.path.join(out, 'images'), exist_ok=True)
    rel = os.path.relpath(out, root).replace(os.sep, '/')

    overrides = {}
    op = os.path.join(out, 'overrides.json')
    if os.path.exists(op):
        overrides = json.load(open(op, encoding='utf-8'))

    with tempfile.TemporaryDirectory() as tmp:
        imgs = {} if a.no_images else image_map(a.pdf, None, tmp, warnings)
        if not a.no_ocr and not have_jpn():
            warnings.append('Japanese titles not read: install the tesseract Japanese model (apt install tesseract-ocr-jpn) or type them in overrides.json ("nameJp").')
        for c in cards:
            s = slug(c['number'])
            slot = imgs.get(c['number'])
            c.update(nameJp=None, series=a.series, set=set_code, color=None, power=None, soul=None,
                     flavor='', illustrator='', image=None, altImages=[])
            c['rarity'] = c['rarities'][0] if c['rarities'] else ''
            if slot and slot['main']:
                main = Image.open(slot['main'])
                if not a.no_ocr:
                    c['color'], n = dominant_color(main)
                    if c['color'] is None:
                        warnings.append(f'{c["number"]}: color not detected (set it in overrides.json)')
                    if c['type'] == 'Character':
                        c['power'], agree = read_power(main)
                        if 'power' in overrides.get(c['number'], {}):
                            pass  # manually verified
                        elif c['power'] is None:
                            warnings.append(f'{c["number"]}: power not read (set it in overrides.json)')
                        elif agree < 2:
                            warnings.append(f'{c["number"]}: power {c["power"]} read only once, please verify')
                        c['soul'] = read_soul(main)
                    if c['type'] != 'Climax':
                        c['nameJp'] = read_name_jp(main)
                        if c['soul'] is None and 'soul' not in overrides.get(c['number'], {}):
                            warnings.append(f'{c["number"]}: soul icons not found (set it in overrides.json)')
                if not a.no_ocr and c['type'] != 'Climax' and has_soul_trigger(main) and 'Soul' not in c['triggers']:
                    c['triggers'].append('Soul')
                save_webp(slot['main'], os.path.join(out, 'images', f'{s}.webp'))
                c['image'] = f'{rel}/images/{s}.webp'
                for i, alt in enumerate(slot['alts'], 1):
                    save_webp(alt, os.path.join(out, 'images', f'{s}-alt{i}.webp'))
                    c['altImages'].append(f'{rel}/images/{s}-alt{i}.webp')
            elif not a.no_images:
                warnings.append(f'{c["number"]}: the PDF has no image for this card')
            c.update(overrides.get(c['number'], {}))
            if c['type'] == 'Character' and c['soul'] is None:
                pass  # soul is counted from the icons by read_soul(); overrides.json can correct it
        # stable order
    seen = set()
    for c in cards:
        if c['number'] in seen:
            warnings.append(f'duplicate card number {c["number"]}')
        seen.add(c['number'])

    pack = {
        'set': {'code': set_code, 'name': a.set_name, 'series': a.series, 'type': a.set_type,
                'releaseDate': a.release_date, 'total': len(cards),
                'description': f'{a.set_name}. Imported from a card sheet PDF.'},
        'cards': cards,
    }
    with open(os.path.join(out, 'cards.json'), 'w', encoding='utf-8') as f:
        json.dump(pack, f, ensure_ascii=False, indent=1)

    ip = os.path.join(root, 'data', 'imports', 'index.json')
    os.makedirs(os.path.dirname(ip), exist_ok=True)
    idx = json.load(open(ip)) if os.path.exists(ip) else {'includeSample': False, 'packs': []}
    idx['includeSample'] = bool(a.keep_sample)
    entry = f'{rel}/cards.json'
    if entry not in idx['packs']:
        idx['packs'].append(entry)
    json.dump(idx, open(ip, 'w'), indent=1)

    chars = [c for c in cards if c['type'] == 'Character']
    lines = [f'{len(cards)} cards ({len(chars)} characters, {len(cards) - len(chars)} climax) → {rel}/cards.json',
             f'power read: {sum(1 for c in chars if c["power"] is not None)}/{len(chars)}',
             f'color read: {sum(1 for c in cards if c["color"])}/{len(cards)}',
             f'soul filled: {sum(1 for c in chars if c["soul"] is not None)}/{len(chars)}  (counted from the icons; fix misses in overrides.json)',
             f'colors: {dict(Counter(c["color"] for c in cards))}', '', 'Warnings:'] + [f'  - {w}' for w in warnings]
    open(os.path.join(out, 'report.txt'), 'w').write('\n'.join(lines) + '\n')
    print('\n'.join(lines))


if __name__ == '__main__':
    main()
