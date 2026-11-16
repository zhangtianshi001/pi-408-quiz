# -*- coding: utf-8 -*-
"""题库勘误工具集：拆分题块给人工精读、合并回写、结构校验。

用法：
  python tools/errata_tool.py split <sid>      导出该科分块文本（便于逐段精读）
  python tools/errata_tool.py validate         校验全部 JSON 结构与 APP 兼容性
  python tools/errata_tool.py diff <sid>       对比勘误前后差异统计
"""
import json
import os
import sys
import re
import io

BASE = 'android/app/src/main/assets/web/data'
SIDS = ['ds', 'os', 'co', 'cn']


def load(sid):
    with open(os.path.join(BASE, sid + '.json'), encoding='utf-8') as f:
        return json.load(f)


def save(sid, data):
    p = os.path.join(BASE, sid + '.json')
    with open(p, 'w', encoding='utf-8', newline='\n') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))


def dump_block(data, out_path):
    """按章节导出可读文本，供逐题精读与改写。"""
    lines = []
    lines.append('# %s（%s）' % (data['name'], data['id']))
    for sec in data['sections']:
        lines.append('')
        lines.append('=' * 60)
        lines.append('## 章节 %s %s' % (sec['id'], sec['title']))
        for q in sec['xzt']:
            num, ans, stem, expl, opts, img = q
            lines.append('')
            lines.append('### [%s.%s] 答案:%s%s' % (sec['id'], num, ans, ('  图:' + img) if img else ''))
            lines.append('题干: ' + (stem or ''))
            for o in (opts or []):
                lines.append('  ' + o)
            lines.append('解析: ' + (expl or ''))
        for b in sec['bigq']:
            num, stem, ans, hints, qimg, aimg = b
            lines.append('')
            lines.append('### 大题[%s.%s]%s%s' % (sec['id'], num,
                                                  ('  题图:' + qimg) if qimg else '',
                                                  ('  解图:' + aimg) if aimg else ''))
            lines.append('题干: ' + (stem or ''))
            lines.append('解答: ' + (ans or ''))
            hs = '; '.join('%s|%s' % (h[0], h[1]) for h in (hints or []))
            lines.append('提示: ' + hs)
    with open(out_path, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    return len(lines)


def validate():
    """严格校验：结构、必填、APP 读取兼容性。"""
    ok = True
    total_q = 0
    for sid in SIDS:
        d = load(sid)
        assert isinstance(d.get('id'), str) and d['id'] == sid, sid + ' id 错误'
        assert isinstance(d.get('name'), str) and d['name'], sid + ' name 错误'
        assert isinstance(d.get('sections'), list) and d['sections'], sid + ' sections 空'
        for sec in d['sections']:
            assert set(['id', 'title', 'xzt', 'bigq']) <= set(sec.keys()), sid + ' 章节字段缺失'
            assert isinstance(sec['xzt'], list) and isinstance(sec['bigq'], list)
            for q in sec['xzt']:
                assert isinstance(q, list) and len(q) == 6, '%s %s 选择题长度非6' % (sid, sec['id'])
                num, ans, stem, expl, opts, img = q
                assert isinstance(num, int), '%s %s 题号非整数' % (sid, sec['id'])
                assert isinstance(ans, str) and re.fullmatch(r'[A-H]{1,8}', ans), \
                    '%s %s#%s 答案非法: %r' % (sid, sec['id'], num, ans)
                assert isinstance(stem, str) and stem.strip(), '%s %s#%s 题干空' % (sid, sec['id'], num)
                assert isinstance(opts, list), '%s %s#%s 选项非数组' % (sid, sec['id'], num)
                if opts:
                    labels = [str(o).strip()[:1] for o in opts]
                    want = [chr(65 + i) for i in range(len(opts))]
                    if labels != want:
                        print('[WARN] %s %s#%s 选项标号异常 %r' % (sid, sec['id'], num, labels))
                    for ch in ans:
                        if ch not in 'ABCDEFGH'[:len(opts)]:
                            print('[ERR ] %s %s#%s 答案 %s 超出选项范围(%d项)' % (sid, sec['id'], num, ans, len(opts)))
                            ok = False
                assert isinstance(expl, str), '%s %s#%s 解析非字符串' % (sid, sec['id'], num)
                assert img is None or isinstance(img, str), '%s %s#%s 图字段非法' % (sid, sec['id'], num)
                total_q += 1
            for b in sec['bigq']:
                assert isinstance(b, list) and len(b) == 6, '%s %s 大题长度非6' % (sid, sec['id'])
                num, stem, ans, hints, qimg, aimg = b
                assert isinstance(num, int)
                assert isinstance(stem, str) and stem.strip(), '%s %s 大题#%s 题干空' % (sid, sec['id'], num)
                assert isinstance(ans, str), '%s %s 大题#%s 解答非字符串' % (sid, sec['id'], num)
                assert isinstance(hints, list), '%s %s 大题#%s 提示非数组' % (sid, sec['id'], num)
                total_q += 1
    print('校验完成：共 %d 题，结构%s' % (total_q, 'OK' if ok else '有问题'))
    return ok


if __name__ == '__main__':
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'validate'
    if cmd == 'split':
        for sid in (sys.argv[2:] or SIDS):
            d = load(sid)
            out = os.path.join('.build/audit', sid + '.md')
            n = dump_block(d, out)
            print('%s -> %s (%d 行)' % (sid, out, n))
    elif cmd == 'validate':
        sys.exit(0 if validate() else 1)
    elif cmd == 'diff':
        pass
