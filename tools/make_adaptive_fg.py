# -*- coding: utf-8 -*-
"""自适应图标前景：透明底，只有白色 π 与 408，限制在安全区内"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')

SERIF = [r'C:\Windows\Fonts\times.ttf', r'C:\Windows\Fonts\georgia.ttf', r'C:\Windows\Fonts\cambria.ttc']
SANS = [r'C:\Windows\Fonts\seguisb.ttf', r'C:\Windows\Fonts\segoeuib.ttf', r'C:\Windows\Fonts\msyhbd.ttc']

def font(cands, size):
    for c in cands:
        if os.path.exists(c):
            try: return ImageFont.truetype(c, size)
            except Exception: pass
    return ImageFont.load_default()

for d, px in {'mdpi':108,'hdpi':162,'xhdpi':216,'xxhdpi':324,'xxxhdpi':432}.items():
    S = px * 4
    img = Image.new('RGBA', (S, S), (0,0,0,0))
    dr = ImageDraw.Draw(img)
    # 内容区 = 中央 72%（安全区）
    inner = int(S * 0.66)
    off = (S - inner)//2
    # π
    pf = font(SERIF, int(inner * 0.92))
    bb = dr.textbbox((0,0), 'π', font=pf)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    tx = off + (inner - tw)/2 - bb[0]
    ty = off + inner*0.40 - th/2 - bb[1]
    dr.text((tx, ty), 'π', font=pf, fill=(255,255,255,255))
    # 408 右下
    sf = font(SANS, int(inner * 0.235))
    st = '408'
    sb = dr.textbbox((0,0), st, font=sf)
    sw, sh = sb[2]-sb[0], sb[3]-sb[1]
    sx = off + inner - sw - sb[0] - inner*0.05
    sy = off + inner - sh - sb[1] - inner*0.06
    dr.text((sx, sy), st, font=sf, fill=(255,255,255,250))
    out = img.resize((px, px), Image.LANCZOS)
    folder = os.path.join(RES, 'mipmap-' + d)
    os.makedirs(folder, exist_ok=True)
    out.save(os.path.join(folder, 'ic_launcher_foreground.png'))
print('adaptive foreground ok')
