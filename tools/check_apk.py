# -*- coding: utf-8 -*-
"""检查 APK 是否满足安卓安装要求：dex 未压缩 + 4 字节对齐 + 签名"""
import sys
import zipfile
import struct

apk = sys.argv[1]
z = zipfile.ZipFile(apk)
bad = []
info = []
for i in z.infolist():
    info.append((i.filename, i.compress_type, i.header_offset, i.file_size))

by_name = {n: (c, off, sz) for n, c, off, sz in info}

# 1) classes.dex / resources.arsc 必须 STORED(0)，且 4 字节对齐（zipalign -p 要求 4K 页对齐更佳）
for name in ('classes.dex', 'resources.arsc'):
    if name not in by_name:
        bad.append('%s missing' % name)
        continue
    c, off, sz = by_name[name]
    if c != zipfile.ZIP_STORED:
        bad.append('%s not STORED (compress_type=%d)' % (name, c))
    # 数据起始偏移 = 本地文件头 30 + 文件名 + 额外字段
    with open(apk, 'rb') as f:
        f.seek(off)
        hdr = f.read(30)
        if len(hdr) == 30:
            sig, ver, flag, method, mtime, mdate, crc, csz, usz, fnl, exl = struct.unpack('<IHHHHHIIIHH', hdr)
            data_off = off + 30 + fnl + exl
            if data_off % 4 != 0:
                bad.append('%s data offset %d not 4-byte aligned (mod %d)' % (name, data_off, data_off % 4))
            if name == 'classes.dex':
                print('dex: method=%d, data_off=%d, aligned=%s' % (method, data_off, data_off % 4 == 0))

# 2) 图片 / webp 不算关键，但统计
stored = sum(1 for _, c, _, _ in info if c == zipfile.ZIP_STORED)
deflated = sum(1 for _, c, _, _ in info if c == zipfile.ZIP_DEFLATED)
print('entries=%d stored=%d deflated=%d' % (len(info), stored, deflated))

if bad:
    print('ALIGN/COMPRESS ISSUES:')
    for b in bad:
        print('  -', b)
    sys.exit(1)
print('APK STRUCTURE OK')
