#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
无 Gradle 的 APK 构建：javac -> d8 -> aapt2 -> zipalign -> apksigner
依赖：JDK (javac), Android SDK build-tools + platforms/android-34
"""
import os
import re
import shutil
import subprocess
import sys
import glob
import json

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BUILD = os.path.join(ROOT, '.build')
APP = os.path.join(ROOT, 'android', 'app', 'src', 'main')
OUT = os.path.join(ROOT, 'dist')

# ---- 工具链定位：环境变量优先 -> 仓库内 .build/sdk -> 系统安装 ----
SDK = (os.environ.get('ANDROID_SDK_ROOT')
       or os.environ.get('ANDROID_HOME')
       or os.path.join(BUILD, 'sdk'))
BT = os.path.join(SDK, 'build-tools', os.environ.get('BUILD_TOOLS_VERSION', '34.0.0'))
PLATFORM = os.path.join(SDK, 'platforms', 'android-34', 'android.jar')

# d8 / apksigner / keytool 需要 JDK 11+；javac 用 JDK 8 最稳（新版 javac 的泛型
# 签名会让旧版 d8 崩溃）。只设 JAVA_HOME 时二者共用同一个 JDK。
JAVA_HOME = os.environ.get('JAVA_HOME', '')
JAVAC_HOME = os.environ.get('JAVAC_HOME') or JAVA_HOME

MIN_SDK = 21
TARGET_SDK = 34

# ---- 版本单一来源：仓库根目录 VERSION 提供默认值，环境变量仍可覆盖 ----
VERSION_FILE = os.path.join(ROOT, 'VERSION')


def load_version():
    """读取 VERSION（形如 {"name":"2.1.1","code":11}），失败时给出清晰报错。"""
    try:
        with open(VERSION_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
    except OSError as e:
        raise SystemExit('VERSION 文件读取失败：%s（%s）' % (VERSION_FILE, e))
    except ValueError as e:
        raise SystemExit('VERSION 不是合法 JSON：%s（%s）；期望 {"name":"2.1.1","code":11}'
                         % (VERSION_FILE, e))
    name = data.get('name') if isinstance(data, dict) else None
    code = data.get('code') if isinstance(data, dict) else None
    if not isinstance(name, str) or not name or isinstance(code, bool) or not isinstance(code, int):
        raise SystemExit('VERSION 字段错误：%s 需要字符串 name 和整数 code，实际为 %r'
                         % (VERSION_FILE, data))
    return name, code


DEFAULT_VERSION_NAME, DEFAULT_VERSION_CODE = load_version()


def env_int(name, default):
    """环境变量整数覆盖，非法值直接给出清晰报错。"""
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        raise SystemExit('%s 必须是整数，当前值：%r' % (name, raw))


VERSION_CODE = env_int('VERSION_CODE', DEFAULT_VERSION_CODE)
VERSION_NAME = os.environ.get('VERSION_NAME', DEFAULT_VERSION_NAME)
PKG = 'com.tianshi.pai408'
APK_NAME = '\u6d3e\u7acb\u65b9408-v%s.apk' % VERSION_NAME

# ---- 跨平台可执行文件名：Windows 保留原有 .exe/.bat，其他平台用无后缀 ----
IS_WIN = os.name == 'nt'


def tool(directory, name, win_ext=''):
    """按 os.name 拼接可执行文件名。"""
    return os.path.join(directory, name + (win_ext if IS_WIN else ''))


def require_tool(label, path):
    """预检工具路径；JAVA_HOME 为空时交给 PATH 解析并给出清晰错误。"""
    if os.path.dirname(path):
        if not os.path.exists(path):
            raise SystemExit('%s 不存在：%s（请检查 ANDROID_SDK_ROOT / JAVA_HOME / JAVAC_HOME）'
                             % (label, path))
    else:
        print('[i] %s 通过 PATH 解析：%s' % (label, path))
        if shutil.which(path) is None:
            raise SystemExit('%s 不在 PATH 上：%s（请设置 JAVA_HOME/JAVAC_HOME，或把 JDK/bin 加入 PATH）'
                             % (label, path))
    return path


AAPT2 = tool(BT, 'aapt2', '.exe')
D8 = tool(BT, 'd8', '.bat')
ZIPALIGN = tool(BT, 'zipalign', '.exe')
APKSIGNER = tool(BT, 'apksigner', '.bat')
JAVAC = (tool(os.path.join(JAVAC_HOME, 'bin'), 'javac', '.exe')
         if JAVAC_HOME else 'javac' + ('.exe' if IS_WIN else ''))
KEYTOOL = (tool(os.path.join(JAVA_HOME, 'bin'), 'keytool', '.exe')
           if JAVA_HOME else 'keytool' + ('.exe' if IS_WIN else ''))

ENV = dict(os.environ)
if JAVA_HOME:
    ENV['JAVA_HOME'] = JAVA_HOME


def run(cmd, cwd=None, check=True):
    print('>', ' '.join(cmd) if isinstance(cmd, list) else cmd)
    p = subprocess.run(cmd, cwd=cwd, env=ENV, shell=isinstance(cmd, str),
                       stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    out = p.stdout.decode('utf-8', 'replace')
    if out.strip():
        try:
            print(out.strip()[:6000])
        except Exception:
            print(out.encode('ascii', 'replace').decode('ascii')[:6000])
    if check and p.returncode != 0:
        raise SystemExit('FAILED %s' % p.returncode)
    return p.returncode, out


def write_version_js(assets_dir):
    """生成前端版本文件；必须在复制 assets 到 stage 之前调用，否则不会进 APK。"""
    if any(c in VERSION_NAME for c in ("'", '\\', '\n', '\r')):
        raise SystemExit('VERSION_NAME 含非法字符（引号/反斜杠/换行）：%r' % VERSION_NAME)
    web_dir = os.path.join(assets_dir, 'web')
    os.makedirs(web_dir, exist_ok=True)
    version_js = os.path.join(web_dir, 'version.js')
    with open(version_js, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* 由 tools/build_apk.py 从 VERSION 生成，请勿手工修改 */\n')
        f.write("window.PAI408_VERSION = { name: '%s', code: %d };\n"
                % (VERSION_NAME, VERSION_CODE))
    print('[i] 已生成 %s（name=%s, code=%s）' % (version_js, VERSION_NAME, VERSION_CODE))
    sync_java_version()
    return version_js


JAVA_FILE = os.path.join(APP, 'java', 'com', 'tianshi', 'pai408', 'MainActivity.java')
JAVA_VERSION_RE = re.compile(r'(static final String APP_VERSION\s*=\s*)"[^"]*"(\s*;)')


def sync_java_version():
    """把 Bridge.APP_VERSION 同步为 VERSION_NAME，避免三处版本各自维护。"""
    if not os.path.exists(JAVA_FILE):
        raise SystemExit('MainActivity.java 不存在：%s' % JAVA_FILE)
    with open(JAVA_FILE, 'r', encoding='utf-8') as f:
        src = f.read()
    if not JAVA_VERSION_RE.search(src):
        raise SystemExit('MainActivity.java 未找到 APP_VERSION 常量定义，无法同步版本')
    out = JAVA_VERSION_RE.sub(lambda m: m.group(1) + '"' + VERSION_NAME + '"' + m.group(2), src, count=1)
    if out != src:
        with open(JAVA_FILE, 'w', encoding='utf-8', newline='\n') as f:
            f.write(out)
        print('[i] 已同步 MainActivity.java APP_VERSION = "%s"' % VERSION_NAME)


def main():
    inter = os.path.join(BUILD, 'inter')
    gen = os.path.join(inter, 'gen')
    classes = os.path.join(inter, 'classes')
    dexdir = os.path.join(inter, 'dex')
    for d in (gen, classes, dexdir):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)
    os.makedirs(OUT, exist_ok=True)

    res = os.path.join(APP, 'res')
    manifest = os.path.join(APP, 'AndroidManifest.xml')
    java_src = glob.glob(os.path.join(APP, 'java', '**', '*.java'), recursive=True)
    assets = os.path.join(APP, 'assets')

    # 1) aapt2 compile 资源
    compiled = os.path.join(inter, 'compiled.zip')
    if os.path.exists(compiled):
        os.remove(compiled)
    res_files = []
    for r, _, fs in os.walk(res):
        for f in fs:
            res_files.append(os.path.join(r, f))
    cmd = [AAPT2, 'compile', '-o', compiled] + res_files
    run(cmd)

    # 2) aapt2 link -> 基础 APK + R.java
    base_apk = os.path.join(inter, 'base.apk')
    if os.path.exists(base_apk):
        os.remove(base_apk)
    run([
        AAPT2, 'link',
        '-o', base_apk,
        '-I', PLATFORM,
        '--manifest', manifest,
        '--java', gen,
        '--min-sdk-version', str(MIN_SDK),
        '--target-sdk-version', str(TARGET_SDK),
        '--version-code', str(VERSION_CODE),
        '--version-name', VERSION_NAME,
        '--auto-add-overlay',
        compiled
    ])

    # 3) javac
    java_files = java_src + glob.glob(os.path.join(gen, '**', '*.java'), recursive=True)
    run([
        JAVAC,
        '-encoding', 'UTF-8',
        '-source', '8', '-target', '8',
        '-bootclasspath', PLATFORM,
        '-classpath', PLATFORM,
        '-d', classes,
    ] + java_files)

    # 4) d8 -> classes.dex
    class_files = glob.glob(os.path.join(classes, '**', '*.class'), recursive=True)
    run([
        D8,
        '--min-api', str(MIN_SDK),
        '--lib', PLATFORM,
        '--output', dexdir,
    ] + class_files)

    # 5) 生成前端版本文件 version.js
    #    必须早于下面「复制 assets 到 stage」，否则不会打进 APK。
    write_version_js(assets)

    # 6) 组装 APK：base.apk + assets + classes.dex
    stage = os.path.join(inter, 'stage')
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(stage)

    import zipfile
    with zipfile.ZipFile(base_apk) as z:
        z.extractall(stage)

    # dex
    shutil.copy(os.path.join(dexdir, 'classes.dex'), os.path.join(stage, 'classes.dex'))

    # assets（上面刚生成的 version.js 会被一并复制进 stage）
    ast_out = os.path.join(stage, 'assets')
    if os.path.exists(ast_out):
        shutil.rmtree(ast_out)
    shutil.copytree(assets, ast_out)

    # 7) 打包
    #    安卓要求：classes.dex 与 resources.arsc 必须 STORED（不压缩），
    #    并且数据起始偏移 4 字节对齐（下面 zipalign 会再补 -p 页对齐）。
    unsigned = os.path.join(inter, 'unsigned.apk')
    if os.path.exists(unsigned):
        os.remove(unsigned)
    stored_ext = ('.webp', '.png', '.jpg', '.jpeg', '.gif', '.mp3', '.mp4', '.ogg', '.ttf', '.otf')
    must_stored = ('classes.dex', 'resources.arsc')
    entries = []
    for r, _, fs in os.walk(stage):
        for f in fs:
            full = os.path.join(r, f)
            rel = os.path.relpath(full, stage).replace('\\', '/')
            entries.append((full, rel))
    entries.sort(key=lambda x: x[1])

    with zipfile.ZipFile(unsigned, 'w', zipfile.ZIP_DEFLATED) as z:
        for full, rel in entries:
            if rel in must_stored or rel.endswith(stored_ext):
                z.write(full, rel, zipfile.ZIP_STORED)
            else:
                z.write(full, rel, zipfile.ZIP_DEFLATED)

    # 8) zipalign
    aligned = os.path.join(inter, 'aligned.apk')
    if os.path.exists(aligned):
        os.remove(aligned)
    run([ZIPALIGN, '-f', '-p', '4', unsigned, aligned])

    # 9) 签名
    #    正式发布请自行生成密钥并设置环境变量：
    #      PA408_KEYSTORE / PA408_KS_ALIAS / PA408_KS_PASS / PA408_KEY_PASS
    #    未设置时自动创建一把本地调试密钥（不适合上架，仅用于本机安装测试）。
    ks = os.environ.get('PA408_KEYSTORE') or os.path.join(BUILD, 'debug.keystore')
    alias = os.environ.get('PA408_KS_ALIAS', 'pai408')
    ks_pass = os.environ.get('PA408_KS_PASS', 'pai408debug')
    key_pass = os.environ.get('PA408_KEY_PASS', ks_pass)
    if not os.path.exists(ks):
        os.makedirs(os.path.dirname(os.path.abspath(ks)) or '.', exist_ok=True)
        require_tool('keytool', KEYTOOL)
        run([
            KEYTOOL, '-genkeypair',
            '-keystore', ks, '-alias', alias, '-keyalg', 'RSA',
            '-keysize', '2048', '-validity', '10000',
            '-storepass', ks_pass, '-keypass', key_pass,
            '-dname', 'CN=Pai408, OU=dev, O=Pai408, L=CN, C=CN'
        ])
        print('[!] 已生成本地调试密钥：%s  —— 正式发布请换成你自己的密钥' % ks)

    signed = os.path.join(OUT, APK_NAME)
    if os.path.exists(signed):
        os.remove(signed)
    run([
        APKSIGNER, 'sign',
        '--ks', ks, '--ks-key-alias', alias,
        '--ks-pass', 'pass:' + ks_pass, '--key-pass', 'pass:' + key_pass,
        '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true',
        '--out', signed, aligned
    ])

    run([APKSIGNER, 'verify', '--verbose', signed], check=False)
    print('APK:', signed, round(os.path.getsize(signed) / 1048576, 2), 'MB')


if __name__ == '__main__':
    main()
