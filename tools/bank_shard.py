# -*- coding: utf-8 -*-
"""题库分片工具：把题库切成小份，供子代理逐题精读，再合并回写。

设计目标：
  - 每个分片体积小（默认每片 ~25 题），子代理可完整读完并在上下文内精修
  - 分片输出为 JSON，包含题目的**全部字段原文**与**定位键**（sid/sec/kind/num）
  - 子代理返回同结构 JSON（只含需要修改的字段），合并工具按定位键回写
  - 严格校验：题号/结构/图路径不可变，题数必须守恒

用法：
  python tools/bank_shard.py split --per 25            # 生成分片
  python tools/bank_shard.py list                       # 列出分片
  python tools/bank_shard.py merge <patches目录>        # 合并补丁回写
  python tools/bank_shard.py verify                     # 校验题库完整
"""
import json
import os
import sys
import glob

BASE = 'android/app/src/main/assets/web/data'
SHARD = '.build/shards'
SIDS = ['ds', 'os', 'co', 'cn']
KIND_NAME = {'xzt': '选择题', 'bigq': '大题'}


def load(sid):
    with open(os.path.join(BASE, sid + '.json'), encoding='utf-8') as f:
        return json.load(f)


def save(sid, data):
    with open(os.path.join(BASE, sid + '.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def cmd_split(per=25):
    os.makedirs(SHARD, exist_ok=True)
    # 清掉旧分片
    for f in glob.glob(os.path.join(SHARD, '*.json')):
        os.remove(f)
    index = []
    n_shard = 0
    for sid in SIDS:
        d = load(sid)
        items = []
        for sec in d['sections']:
            for q in sec['xzt']:
                items.append({'sid': sid, 'sec': sec['id'], 'secTitle': sec['title'],
                              'kind': 'xzt', 'num': q[0],
                              'ans': q[1], 'stem': q[2], 'expl': q[3],
                              'opts': q[4], 'img': q[5]})
            for b in sec['bigq']:
                items.append({'sid': sid, 'sec': sec['id'], 'secTitle': sec['title'],
                              'kind': 'bigq', 'num': b[0],
                              'stem': b[1], 'expl': b[2], 'hints': b[3],
                              'img': b[4], 'ansImg': b[5]})
        for i in range(0, len(items), per):
            chunk = items[i:i + per]
            n_shard += 1
            name = '%s-%03d.json' % (sid, n_shard)
            path = os.path.join(SHARD, name)
            with open(path, 'w', encoding='utf-8', newline='\n') as f:
                json.dump({'shard': name, 'count': len(chunk), 'items': chunk},
                          f, ensure_ascii=False, indent=1)
            index.append({'shard': name, 'sid': sid, 'count': len(chunk),
                          'first': '%s#%s' % (chunk[0]['sec'], chunk[0]['num']),
                          'last': '%s#%s' % (chunk[-1]['sec'], chunk[-1]['num'])})
    with open(os.path.join(SHARD, 'index.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(index, f, ensure_ascii=False, indent=1)
    print('生成 %d 个分片，每片 %d 题' % (n_shard, per))
    for x in index:
        print('  %-16s %2d 题  %s ~ %s' % (x['shard'], x['count'], x['first'], x['last']))


def cmd_merge(patch_dir):
    """合并补丁：patch 文件形如 {"shard":"ds-001.json","fixes":[{"sec","kind","num","fields":{...}}]}"""
    total = 0
    files = sorted(glob.glob(os.path.join(patch_dir, '*.json')))
    if not files:
        print('未找到补丁文件:', patch_dir)
        return
    # 按科目缓存
    cache = {sid: load(sid) for sid in SIDS}
    before_counts = {sid: (sum(len(s['xzt']) for s in cache[sid]['sections']),
                           sum(len(s['bigq']) for s in cache[sid]['sections'])) for sid in SIDS}
    for pf in files:
        if os.path.basename(pf) == 'index.json':
            continue
        with open(pf, encoding='utf-8') as f:
            patch = json.load(f)
        fixes = patch.get('fixes', [])
        for fx in fixes:
            sid = fx.get('sid')
            if sid not in cache:
                print('[跳过] 未知科目', fx)
                continue
            d = cache[sid]
            sec = next((s for s in d['sections'] if s['id'] == fx.get('sec')), None)
            if not sec:
                print('[跳过] 未找到章节 %s/%s' % (sid, fx.get('sec')))
                continue
            kind, num = fx.get('kind'), fx.get('num')
            arr = sec['xzt'] if kind == 'xzt' else sec['bigq']
            target = next((q for q in arr if q[0] == num), None)
            if target is None:
                print('[跳过] 未找到题目 %s/%s/%s#%s' % (sid, fx.get('sec'), kind, num))
                continue
            fields = fx.get('fields', {})
            # 安全校验：不允许改题号/图路径
            if 'num' in fields and fields['num'] != target[0]:
                print('[拒绝] 题号不可改 %s' % fx)
                continue
            if 'img' in fields and fields['img'] != target[5 if kind == 'xzt' else 4]:
                print('[拒绝] 图路径不可改 %s' % fx)
                continue
            if kind == 'xzt':
                if 'ans' in fields: target[1] = fields['ans']
                if 'stem' in fields: target[2] = fields['stem']
                if 'expl' in fields: target[3] = fields['expl']
                if 'opts' in fields: target[4] = fields['opts']
            else:
                if 'stem' in fields: target[1] = fields['stem']
                if 'expl' in fields: target[2] = fields['expl']
                if 'hints' in fields: target[3] = fields['hints']
            total += 1
    for sid in SIDS:
        save(sid, cache[sid])
    after = {sid: (sum(len(s['xzt']) for s in cache[sid]['sections']),
                   sum(len(s['bigq']) for s in cache[sid]['sections'])) for sid in SIDS}
    print('合并 %d 处修改' % total)
    ok = True
    for sid in SIDS:
        mark = 'OK' if before_counts[sid] == after[sid] else 'COUNT CHANGED!'
        if before_counts[sid] != after[sid]:
            ok = False
        print('  %s 题数 %s -> %s  %s' % (sid, before_counts[sid], after[sid], mark))
    return ok


def cmd_verify():
    tot = 0
    for sid in SIDS:
        d = load(sid)
        nx = sum(len(s['xzt']) for s in d['sections'])
        nb = sum(len(s['bigq']) for s in d['sections'])
        tot += nx + nb
        print('%s: 选择 %d, 大题 %d' % (sid, nx, nb))
    print('总计', tot)
    return tot == 2667


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'list'
    if cmd == 'split':
        per = 25
        if '--per' in sys.argv:
            per = int(sys.argv[sys.argv.index('--per') + 1])
        cmd_split(per)
    elif cmd == 'merge':
        cmd_merge(sys.argv[2])
    elif cmd == 'verify':
        sys.exit(0 if cmd_verify() else 1)
    elif cmd == 'list':
        idx = json.load(open(os.path.join(SHARD, 'index.json'), encoding='utf-8'))
        for x in idx:
            print('%-16s %2d 题  %s ~ %s' % (x['shard'], x['count'], x['first'], x['last']))
