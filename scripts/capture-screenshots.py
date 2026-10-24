#!/usr/bin/env python3
"""Captures one PNG per specimen in light and dark, plus a full-page shot, into docs/screenshots/.
Needs the demo served (npm run demo:build && npx vite preview demo --port 5198) and agent-browser on PATH.
Specimens are cropped out of the full-page image, because element screenshots come back blank in dark mode."""
import json, subprocess, sys, time
from pathlib import Path
from PIL import Image

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5198/'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'screenshots'
RECTS = 'JSON.stringify(Object.fromEntries([...document.querySelectorAll("figure[data-name]")].map(f=>{const r=f.querySelector(".spec-body").getBoundingClientRect();return [f.dataset.name,[r.left+scrollX,r.top+scrollY,r.width,r.height]]})))'
WIDTH = 'document.documentElement.scrollWidth'

def ab(*args):
    return subprocess.run(['agent-browser', *args], capture_output=True, text=True).stdout.strip()

def unwrap(s):
    v = json.loads(s)
    return json.loads(v) if isinstance(v, str) else v

ab('set', 'viewport', '1100', '900', '2')
for mode in ('light', 'dark'):
    ab('set', 'media', mode)
    ab('open', URL)
    time.sleep(1.5)
    (OUT / mode).mkdir(parents=True, exist_ok=True)
    rects = unwrap(ab('eval', RECTS))
    css_width = unwrap(ab('eval', WIDTH))
    full = OUT / mode / '_full-page.png'
    ab('screenshot', '--full', str(full))
    im = Image.open(full).convert('RGB')
    full_im = im
    scale = im.width / css_width
    if css_width > 1100:
        print(f'warning: page is {css_width}px wide in a 1100px viewport (horizontal overflow)')
    for name, (x, y, w, h) in rects.items():
        box = tuple(round(v * scale) for v in (x - 2, y - 2, x + w + 2, y + h + 2))
        im.crop(box).quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(OUT / mode / f'{name}.png', optimize=True)
    full_im.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(full, optimize=True)
    print(mode, len(rects), 'specimens, scale', round(scale, 2))
