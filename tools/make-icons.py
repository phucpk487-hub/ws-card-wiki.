"""Makes every icon size from the master picture icons/icon-1024.png (hexagon with a fleur-de-lis, transparent outside).
Writes icons/icon-96/192/512.png (web) and android-icons/res/mipmap-*/ (Android launcher icons, copied into the app by the workflows).
Run: python3 tools/make-icons.py   (needs Pillow)"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = Image.open(os.path.join(ROOT, 'icons', 'icon-1024.png')).convert('RGBA')
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}

def on_canvas(size, fill, bg=None, round_=False):
    """The icon scaled to `fill` of a square canvas; bg is a colour or None (transparent); round_ cuts the canvas to a circle."""
    cv = Image.new('RGBA', (size, size), bg or (0, 0, 0, 0))
    k = round(size * fill); ic = SRC.resize((k, k), Image.LANCZOS)
    cv.alpha_composite(ic, ((size - k) // 2, (size - k) // 2))
    if round_:
        m = Image.new('L', (size * 4, size * 4), 0); ImageDraw.Draw(m).ellipse((0, 0, size * 4 - 1, size * 4 - 1), fill=255)
        cv.putalpha(m.resize((size, size), Image.LANCZOS))
    return cv

for s in (96, 192, 512):
    SRC.resize((s, s), Image.LANCZOS).save(os.path.join(ROOT, 'icons', f'icon-{s}.png'), optimize=True)
for name, d in DENS.items():
    out = os.path.join(ROOT, 'android-icons', 'res', f'mipmap-{name}'); os.makedirs(out, exist_ok=True)
    legacy, adaptive = round(48 * d), round(108 * d)
    white = (255, 255, 255, 255)
    on_canvas(legacy, .86, white).save(os.path.join(out, 'ic_launcher.png'))
    on_canvas(legacy, .78, white, True).save(os.path.join(out, 'ic_launcher_round.png'))
    # adaptive icon: only the middle 66% is guaranteed to show, so the picture sits inside that
    on_canvas(adaptive, .62).save(os.path.join(out, 'ic_launcher_foreground.png'))
print('icons written')
