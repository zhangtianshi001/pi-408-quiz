# -*- coding: utf-8 -*-
"""校验 APK 内 JSON 引用的每张配图都真实存在于 assets 中"""
import json
import sys
import zipfile

apk = sys.argv[1]
z = zipfile.ZipFile(apk)
names = set(z.namelist())
prefix = 'assets/web/'

missing = []
total_refs = 0
total_q = 0
stats = {}

for sid in ('ds', 'os', 'co', 'cn'):
    p = prefix + 'data/%s.json' % sid
    if p not in names:
        missing.append(p)
        continue
    d = json.loads(z.read(p).decode('utf-8'))
    nimg = 0
    nq = 0
    for sec in d['sections']:
        for q in sec['xzt']:
            nq += 1
            if q[5]:
                total_refs += 1
                nimg += 1
                if prefix + q[5] not in names:
                    missing.append('%s/%s/xzt#%s -> %s' % (sid, sec['id'], q[0], q[5]))
        for b in sec['bigq']:
            nq += 1
            for idx in (4, 5):
                if b[idx]:
                    total_refs += 1
                    nimg += 1
                    if prefix + b[idx] not in names:
                        missing.append('%s/%s/bigq#%s -> %s' % (sid, sec['id'], b[0], b[idx]))
    total_q += nq
    stats[sid] = (nq, nimg)

print('题目总数:', total_q)
for k, v in stats.items():
    print('  %s: %d 题, %d 张配图' % (k, v[0], v[1]))
print('配图引用总数:', total_refs)
img_files = sum(1 for n in names if n.startswith(prefix + 'img/'))
print('assets 内图片文件数:', img_files)

if missing:
    print('\n缺失 %d 项:' % len(missing))
    for m in missing[:30]:
        print('  -', m)
    sys.exit(1)

# 反向：有没有没被引用的孤儿图（不算错，仅提示）
print('\nALL IMAGES PRESENT ✓')
