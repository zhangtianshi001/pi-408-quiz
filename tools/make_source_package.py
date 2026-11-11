# -*- coding: utf-8 -*-
"""把仓库整理成可开源的分发目录 + zip 包。

排除：.build/（SDK 与中间产物）、node_modules/、截图临时目录、
      keystore、已有 APK 等。
保留：可直接构建所需的全部内容（含题库与转换后的安卓资源）。
"""
import os
import shutil
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, 'dist')
NAME = 'pai408-android-src'
STAGE = os.path.join(DIST, NAME)
ZIP = os.path.join(DIST, NAME + '.zip')

SKIP_DIRS = {
    '.build', 'node_modules', 'shots', '__pycache__', '.git',
    '.venv', 'venv', '.idea', '.vscode', 'package-lock.json',
}
SKIP_FILES = {
    '.gitignore.bak', 'package.json',
}
SKIP_EXT = ('.keystore', '.jks', '.apk', '.idsig', '.pyc', '.log', '.tmp', '.blend1')
SKIP_NAMES_PREFIX = ('tmp_',)


def keep(path, name):
    if name in SKIP_DIRS:
        return False
    if name in SKIP_FILES:
        return False
    if any(name.startswith(p) for p in SKIP_NAMES_PREFIX):
        return False
    if name.lower().endswith(SKIP_EXT):
        return False
    return True


def main():
    if os.path.exists(STAGE):
        shutil.rmtree(STAGE)
    os.makedirs(STAGE, exist_ok=True)

    total = 0
    count = 0
    for r, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if keep(r, d)]
        # 不要把 dist 自身的产物拷进去
        if os.path.abspath(r).startswith(os.path.abspath(DIST)):
            continue
        rel_dir = os.path.relpath(r, ROOT)
        out_dir = STAGE if rel_dir == '.' else os.path.join(STAGE, rel_dir)
        os.makedirs(out_dir, exist_ok=True)
        for f in files:
            if not keep(r, f):
                continue
            src = os.path.join(r, f)
            dst = os.path.join(out_dir, f)
            shutil.copy2(src, dst)
            total += os.path.getsize(src)
            count += 1

    # 打包
    if os.path.exists(ZIP):
        os.remove(ZIP)
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for r, _, files in os.walk(STAGE):
            for f in files:
                full = os.path.join(r, f)
                arc = os.path.join(NAME, os.path.relpath(full, STAGE)).replace('\\', '/')
                z.write(full, arc)

    print('源文件 %d 个，原始大小 %.1f MB' % (count, total / 1048576))
    print('目录:', STAGE)
    print('压缩包: %s  (%.1f MB)' % (ZIP, os.path.getsize(ZIP) / 1048576))


if __name__ == '__main__':
    main()
