# -*- coding: utf-8 -*-
"""生成派立方408 的应用图标与启动图（π + 右下角 408）"""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')


def find_font(candidates, size):
    for c in candidates:
        if os.path.exists(c):
            try:
                return ImageFont.truetype(c, size)
            except Exception:
                pass
    return ImageFont.load_default()


SERIF = [
    r'C:\Windows\Fonts\times.ttf',
    r'C:\Windows\Fonts\georgia.ttf',
    r'C:\Windows\Fonts\cambria.ttc',
    r'C:\Windows\Fonts\DejaVuSerif.ttf',
]
SANS = [
    r'C:\Windows\Fonts\seguisb.ttf',
    r'C:\Windows\Fonts\segoeuib.ttf',
    r'C:\Windows\Fonts\arialbd.ttf',
    r'C:\Windows\Fonts\msyhbd.ttc',
]


def lerp(a, b, t):
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(len(a)))


def make_icon(size, radius_ratio=0.225, bg_from=(79, 110, 247), bg_to=(140, 155, 255),
              transparent_bg=False):
    S = size * 4  # 超采样
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # 渐变底
    grad = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    gd = ImageDraw.Draw(grad)
    for y in range(S):
        t = y / (S - 1)
        gd.line([(0, y), (S, y)], fill=lerp(bg_from, bg_to, t) + (255,))
    # 对角更亮一点
    overlay = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    for i in range(S):
        t = i / (S - 1)
        od.line([(i, 0), (i, S)], fill=(255, 255, 255, int(14 * (1 - t))))
    grad = Image.alpha_composite(grad, overlay)

    if transparent_bg:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
        img.paste(grad, (0, 0), mask)
    else:
        mask = Image.new('L', (S, S), 0)
        ImageDraw.Draw(mask).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_ratio), fill=255)
        img.paste(grad, (0, 0), mask)

    # π 符号
    d = ImageDraw.Draw(img)
    pi_font = find_font(SERIF, int(S * 0.60))
    txt = 'π'
    bbox = d.textbbox((0, 0), txt, font=pi_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # π 视觉重心略偏上
    tx = (S - tw) / 2 - bbox[0]
    ty = S * 0.44 - th / 2 - bbox[1]
    # 阴影
    d.text((tx + S * 0.006, ty + S * 0.010), txt, font=pi_font, fill=(28, 42, 96, 60))
    d.text((tx, ty), txt, font=pi_font, fill=(255, 255, 255, 255))

    # 右下角 408
    small = find_font(SANS, int(S * 0.150))
    stxt = '408'
    sb = d.textbbox((0, 0), stxt, font=small)
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    margin = S * 0.098
    sx = S - margin - sw - sb[0]
    sy = S - margin - sh - sb[1] - S * 0.012
    d.text((sx, sy), stxt, font=small, fill=(255, 255, 255, 235))

    return img.resize((size, size), Image.LANCZOS)


def round_icon(size):
    """圆形图标（部分桌面用）"""
    S = size * 4
    img = make_icon(S, radius_ratio=0.5)
    return img.resize((size, size), Image.LANCZOS)


def main():
    dens = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    for d, px in dens.items():
        folder = os.path.join(RES, 'mipmap-' + d)
        os.makedirs(folder, exist_ok=True)
        make_icon(px).save(os.path.join(folder, 'ic_launcher.png'))
        round_icon(px).save(os.path.join(folder, 'ic_launcher_round.png'))

    # 自适应图标前景（108dp 画布，内容占中间 72dp）
    for d, px in {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}.items():
        folder = os.path.join(RES, 'mipmap-' + d)
        os.makedirs(folder, exist_ok=True)
        # 前景：透明底 + π/408，叠在纯色背景上
        fore = Image.new('RGBA', (px, px), (0, 0, 0, 0))
        core = make_icon(int(px * 0.72), radius_ratio=0.22)
        # 只取内容（去掉背景圆角外透明），能自然叠在 adaptive 背景色上
        fore.paste(core, (int((px - core.width) / 2), int((px - core.height) / 2)), core)
        fore.save(os.path.join(folder, 'ic_launcher_foreground.png'))

    print('icons ok ->', RES)


if __name__ == '__main__':
    main()
