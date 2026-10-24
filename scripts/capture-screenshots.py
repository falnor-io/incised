#!/usr/bin/env python3
"""Captures one PNG per specimen in light and dark into docs/screenshots/, plus a 1x full-page shot.
Needs the demo served (npm run demo:build && npx vite preview demo --port 5198) and agent-browser on PATH.

Each specimen is scrolled to the top of a tall viewport and cropped from it. A single full-page capture
cannot be used for this: past about 16k device pixels it is truncated, and element screenshots come back
blank in dark mode."""
import json, subprocess, sys, tempfile, time
from pathlib import Path
from PIL import Image

URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:5198/'
OUT = Path(__file__).resolve().parent.parent / 'docs' / 'screenshots'
VIEW_W, VIEW_H = 1100, 1800

def ab(*args):
    return subprocess.run(['agent-browser', *args], capture_output=True, text=True).stdout.strip()

def js(expr):
    v = json.loads(ab('eval', expr))
    return json.loads(v) if isinstance(v, str) else v

def quant(im):
    return im.convert('RGB').quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)

for mode in ('light', 'dark'):
    ab('set', 'media', mode)
    ab('set', 'viewport', str(VIEW_W), str(VIEW_H), '2')
    ab('open', URL)
    time.sleep(2.0)
    (OUT / mode).mkdir(parents=True, exist_ok=True)
    names = js('JSON.stringify([...document.querySelectorAll("figure[data-name]")].map(f=>f.dataset.name))')
    tmp = Path(tempfile.mkdtemp()) / 'v.png'
    done = 0
    for name in names:
        rect = js(f'''(()=>{{const b=document.querySelector('figure[data-name="{name}"] .spec-body');b.scrollIntoView({{block:"start"}});scrollBy(0,-6);const r=b.getBoundingClientRect();return JSON.stringify([r.left,r.top,r.width,r.height,innerWidth,innerHeight])}})()''')
        time.sleep(0.25)
        left, top, w, h, iw, ih = rect
        ab('screenshot', str(tmp))
        im = Image.open(tmp)
        s = im.width / iw
        if h + 4 > ih:
            print(f'warning: {name} is {h:.0f}px tall, taller than the {ih}px viewport')
        box = tuple(round(v * s) for v in (max(left - 2, 0), max(top - 2, 0), min(left + w + 2, iw), min(top + h + 2, ih)))
        quant(im.crop(box)).save(OUT / mode / f'{name}.png', optimize=True)
        done += 1
    ab('set', 'viewport', str(VIEW_W), '900', '1')
    ab('open', URL)
    time.sleep(1.5)
    ab('screenshot', '--full', str(tmp))
    quant(Image.open(tmp)).save(OUT / mode / '_full-page.png', optimize=True)
    print(mode, done, 'specimens')
