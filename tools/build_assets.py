# -*- coding: utf-8 -*-
"""
把原始题库（data/*.json + data/img/**）转换为安卓 App 使用的紧凑资源：
  android/app/src/main/assets/web/data/<sid>.json
  android/app/src/main/assets/web/img/<sid>/<sec>/<name>.webp

原始题目结构（每科一个 JSON）：
  { "name": "数据结构",
    "sections": { "1.1": { "title": "...",
        "qs":   [ [num, answer, stem, explain, [opt...], img|None], ... ],
        "bigq": [ [num, stem, answer_text, [[label, text]...], img|None, ansImg|None], ... ] } } }
"""
import json
import os
import sys
import shutil
import io
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DATA = os.path.join(ROOT, 'data')
OUT_WEB = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'assets', 'web')

SUBJECTS = [
    ('ds', '数据结构', '数据结构.json'),
    ('os', '操作系统', '操作系统.json'),
    ('co', '计算机组成原理', '计组.json'),
    ('cn', '计算机网络', '计网.json'),
]


def conv_img(src_rel, sid, sec):
    """img/数据结构/1.1/q_1.png -> img/ds/1.1/q_1.webp ；不存在返回 None"""
    if not src_rel:
        return None
    src = os.path.join(SRC_DATA, src_rel.replace('/', os.sep))
    if not os.path.exists(src):
        return None
    name = os.path.splitext(os.path.basename(src))[0] + '.webp'
    dst_rel = 'img/%s/%s/%s' % (sid, sec, name)
    dst = os.path.join(OUT_WEB, dst_rel.replace('/', os.sep))
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if not os.path.exists(dst):
        with Image.open(src) as im:
            if im.mode in ('RGBA', 'LA', 'P'):
                im = im.convert('RGBA')
                im.save(dst, 'WEBP', lossless=True, method=6)
            else:
                im.convert('RGB').save(dst, 'WEBP', quality=92, method=6)
    return dst_rel


def main():
    os.makedirs(os.path.join(OUT_WEB, 'data'), exist_ok=True)
    stat = []
    for sid, disp, fn in SUBJECTS:
        raw = json.load(open(os.path.join(SRC_DATA, fn), encoding='utf-8'))
        secs = []
        keys = sorted(raw['sections'].keys(),
                      key=lambda s: [int(p) if p.isdigit() else p for p in s.replace('-', '.').split('.')])
        nx = nb = nimg = 0
        for sec in keys:
            v = raw['sections'][sec]
            qs = []
            for q in v.get('qs', []):
                num, ans, stem, expl, opts, img = (list(q) + [None] * 6)[:6]
                rel = conv_img(img, sid, sec)
                if rel:
                    nimg += 1
                qs.append([num, ans, stem, expl or '', opts or [], rel])
            bq = []
            for b in v.get('bigq', []):
                num, stem, ans, hints, img, aimg = (list(b) + [None] * 6)[:6]
                r1 = conv_img(img, sid, sec)
                r2 = conv_img(aimg, sid, sec)
                if r1:
                    nimg += 1
                if r2:
                    nimg += 1
                bq.append([num, stem, ans or '', hints or [], r1, r2])
            nx += len(qs)
            nb += len(bq)
            secs.append({
                'id': sec,
                'title': v['title'],
                'xzt': qs,
                'bigq': bq,
            })
        out = {'id': sid, 'name': disp, 'sections': secs}
        p = os.path.join(OUT_WEB, 'data', sid + '.json')
        with open(p, 'w', encoding='utf-8') as f:
            json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
        stat.append((sid, disp, len(secs), nx, nb, nimg, os.path.getsize(p)))

    print('%-4s %-14s %4s %6s %6s %6s %10s' % ('id', 'name', 'sec', 'xzt', 'bigq', 'img', 'json_bytes'))
    for s in stat:
        print('%-4s %-14s %4d %6d %6d %6d %10d' % s)
    print('TOTAL xzt=%d bigq=%d' % (sum(s[3] for s in stat), sum(s[4] for s in stat)))


if __name__ == '__main__':
    main()
