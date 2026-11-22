/* 派立方408 · 算法演示渲染层 v2
 * 依赖全局 window.SV（sv-engine.js 提供）
 * 纯 ES5 语法，兼容安卓 WebView
 * 对外暴露 window.Demo：
 *   Demo.renderEntry(root, view, ctx, go)  演示入口（subject/category/list/search）
 *   Demo.openDemo(root, tpl)               演示详情（单步 + 伪代码）
 */
(function (global) {
  'use strict';

  var SV = global.SV;
  var state = { frames: [], idx: 0, tpl: null };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var SUBJ = {
    'data-structures': { name: '数据结构', icon: '🌳', color: '#4f6ef7' },
    'computer-organization': { name: '计算机组成原理', icon: '⚙️', color: '#18a058' },
    'operating-systems': { name: '操作系统', icon: '🖥️', color: '#d98324' },
    'computer-networks': { name: '计算机网络', icon: '🌐', color: '#e5484d' }
  };

  function templates() { return (SV && SV.templates) || []; }
  function subjectOf(id) { return (SV && SV.subjects || []).filter(function (s) { return s.id === id; })[0]; }
  function fuzzy(text, q) {
    if (!q) return true;
    text = String(text || '').toLowerCase();
    q = String(q || '').toLowerCase().replace(/\s+/g, '');
    if (!q) return true;
    if (text.indexOf(q) >= 0) return true;
    // 子序列
    var i = 0;
    for (var j = 0; j < text.length && i < q.length; j++) if (text[j] === q[i]) i++;
    return i === q.length;
  }

  // ---------- 演示入口：分科目 → 分分类 → 列表 + 搜索 ----------
  function renderEntry(root, view, ctx, go) {
    if (!SV) { root.innerHTML = '<div class="demo-empty">演示引擎未加载</div>'; return; }
    view = view || 'subject';
    ctx = ctx || {};
    var all = templates();

    var h = '<div class="demo-page">';
    // 顶部卡片：复用 APP 的 hero 风格（与其他页面统一）
    h += '<div class="hero demo-hero"><h2>算法演示</h2>' +
      '<p>408 核心算法 · 逐帧手动演示 · 共 ' + all.length + ' 个</p></div>';
    // 搜索框
    h += '<div class="demo-search-wrap"><div class="demo-search">' +
      '<input id="demo-q" type="search" placeholder="搜索算法，如：冒泡排序 / Dijkstra / 页面置换" value="' +
      esc(ctx.q || '') + '"></div></div>';

    var q = ctx.q || '';

    if (q) {
      // 搜索结果：全局模糊匹配
      var hits = all.filter(function (t) {
        return fuzzy(t.name, q) || fuzzy(t.nameEn, q) || fuzzy(t.description, q);
      });
      h += '<div class="demo-sec-h" style="border-left-color:var(--acc)">搜索结果<small>' + hits.length + ' 个</small></div>';
      h += demoListHtml(hits);
      if (!hits.length) h += '<div class="demo-empty">没有找到相关演示，换个关键词试试</div>';
    } else if (view === 'subject') {
      // 科目卡片
      (SV.subjects || []).forEach(function (s) {
        var n = all.filter(function (t) { return t.subject === s.id; }).length;
        var meta = SUBJ[s.id] || { icon: '📘', color: '#4f6ef7' };
        h += '<button class="demo-subj-card" data-subj-demo="' + esc(s.id) + '">' +
          '<span class="demo-subj-ico" style="background:' + meta.color + '1a;color:' + meta.color + '">' + esc(meta.icon) + '</span>' +
          '<span class="demo-subj-tx"><b>' + esc(s.name) + '</b><small>' + esc(s.description || '') + '</small></span>' +
          '<span class="demo-subj-n">' + n + '</span></button>';
      });
    } else if (view === 'category') {
      var sid = ctx.sid;
      var sub = subjectOf(sid);
      var catList = (sub && sub.categories) || [];
      h += '<button class="demo-backlink" data-demo-back="1">← 返回科目</button>';
      h += '<div class="demo-sec-h" style="border-left-color:' + ((SUBJ[sid] || {}).color || '#4f6ef7') + '">' +
        esc((sub && sub.name) || '科目') + '<small>选择分类</small></div>';
      h += '<div class="demo-cat-grid">';
      catList.forEach(function (c) {
        var n = all.filter(function (t) { return t.subject === sid && t.category === c.key; }).length;
        if (!n) return;
        h += '<button class="demo-cat-card" data-cat="' + esc(c.key) + '" data-sid="' + esc(sid) + '">' +
          '<b>' + esc(c.label) + '</b><small>' + n + ' 个演示</small></button>';
      });
      h += '</div>';
    } else if (view === 'list') {
      var sid2 = ctx.sid, cat = ctx.cat;
      var sub2 = subjectOf(sid2);
      var cc = ((sub2 && sub2.categories) || []).filter(function (c) { return c.key === cat; })[0];
      h += '<button class="demo-backlink" data-demo-back="1">← 返回分类</button>';
      h += '<div class="demo-sec-h" style="border-left-color:' + ((SUBJ[sid2] || {}).color || '#4f6ef7') + '">' +
        esc(cc ? cc.label : cat) + '<small>' + all.filter(function (t) { return t.subject === sid2 && t.category === cat; }).length + ' 个演示</small></div>';
      h += demoListHtml(all.filter(function (t) { return t.subject === sid2 && t.category === cat; }));
    }
    h += '</div>';
    root.innerHTML = h;

    // 绑定
    var input = document.getElementById('demo-q');
    if (input) {
      input.oninput = function () {
        var v = this.value;
        var box = root.querySelector('.demo-page');
        var keepScroll = window.scrollY;
        renderEntry(root, view, { sid: ctx.sid, cat: ctx.cat, q: v }, go);
        var ni = document.getElementById('demo-q');
        if (ni) { ni.focus(); try { ni.setSelectionRange(v.length, v.length); } catch (e) {} }
        window.scrollTo(0, keepScroll);
        // 搜索时避免重复触发 oninput：重新渲染后输入值已带 v
        box = null;
      };
    }
    bindClicks(root, go, ctx);
  }

  function demoListHtml(list) {
    var h = '<div class="demo-list">';
    list.forEach(function (t) {
      var meta = SUBJ[t.subject] || {};
      h += '<button class="demo-li" data-demo="' + esc(t.id) + '">' +
        '<span class="demo-li-ico" style="background:' + (meta.color || '#4f6ef7') + '1a;color:' + (meta.color || '#4f6ef7') + '">▶</span>' +
        '<span class="demo-li-tx"><b>' + esc(t.name) + '</b><small>' + esc(t.description || '') + '</small></span>' +
        '<span class="demo-li-arrow">›</span></button>';
    });
    h += '</div>';
    return h;
  }

  function bindClicks(root, go, ctx) {
    Array.prototype.forEach.call(root.querySelectorAll('[data-subj-demo]'), function (el) {
      el.onclick = function () { go('demo', { sub: 'category', sid: el.getAttribute('data-subj-demo') }); };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-cat]'), function (el) {
      el.onclick = function () {
        go('demo', { sub: 'list', sid: el.getAttribute('data-sid'), cat: el.getAttribute('data-cat') });
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-demo-back]'), function (el) {
      el.onclick = function () {
        if (ctx.sub === 'list') go('demo', { sub: 'category', sid: ctx.sid });
        else go('demo', { sub: 'subject' });
      };
    });
    Array.prototype.forEach.call(root.querySelectorAll('[data-demo]'), function (el) {
      el.onclick = function () { go('demo', { id: el.getAttribute('data-demo') }); };
    });
  }

  // ---------- 结构渲染 ----------
  function statusCls(st) {
    if (st === 'active' || st === 'highlighted' || st === 'visited') return ' hot';
    if (st === 'removed' || st === 'error') return ' bad';
    if (st === 'final' || st === 'sorted') return ' ok';
    return '';
  }

  function renderArrayItems(items, mode) {
    var h = '<div class="demo-arr' + (mode ? ' demo-' + mode : '') + '">';
    (items || []).forEach(function (it) {
      h += '<div class="demo-cell' + statusCls(it.status) + '">' + esc(it.value) + '</div>';
    });
    return h + '</div>';
  }

  function renderStructure(s) {
    if (!s) return '<div class="demo-empty">暂无数据</div>';
    if (s.type === 'array' || s.type === 'stack' || s.type === 'queue') return renderArrayItems(s.items, s.type);
    if (s.type === 'tree') return renderTreeSVG(s);
    if (s.type === 'graph') return renderGraphSVG(s);
    if (s.type === 'string') return renderString(s);
    if (s.type === 'hashtable') return renderHash(s);
    if (s.type === 'multiarray') {
      var h = '<div class="demo-multi">';
      (s.arrays || []).forEach(function (arr, i) {
        h += '<div class="demo-multi-l">' + esc((s.labels || [])[i] || ('数组' + i)) + '</div>' + renderArrayItems(arr);
      });
      return h + '</div>';
    }
    if (s.type === 'matrix') return renderMatrix(s);
    return '<div class="demo-empty">暂不支持的结构：' + esc(s.type) + '</div>';
  }

  // 树：SVG 分层布局 + 真实连线（无箭头，树边无向语义）
  function renderTreeSVG(s) {
    var nodes = s.nodes || {}, root = s.rootId;
    if (!root || !nodes[root]) return '<div class="demo-empty">空树</div>';
    var pos = {};
    var levels = [];
    function walk(id, depth, order) {
      var n = nodes[id];
      if (!n || depth > 8) return;
      if (!levels[depth]) levels[depth] = [];
      levels[depth].push({ id: id, n: n, order: order });
      if (n.left) walk(n.left, depth + 1, 0);
      if (n.right) walk(n.right, depth + 1, 1);
      if (n.children) for (var i = 0; i < n.children.length; i++) walk(n.children[i], depth + 1, i);
    }
    walk(root, 0, 0);
    var W = 640, NODEW = 40, GAPD = 58;
    var maxCount = 1;
    levels.forEach(function (lv) { if (lv && lv.length > maxCount) maxCount = lv.length; });
    var svgW = Math.max(W, maxCount * 62 + 24);
    levels.forEach(function (lv, d) {
      if (!lv) return;
      lv.forEach(function (it, i) {
        pos[it.id] = {
          x: (i + 1) * (svgW / (lv.length + 1)),
          y: 26 + d * GAPD,
          n: it.n
        };
      });
    });
    var h = '<div class="demo-svgbox"><svg viewBox="0 0 ' + svgW + ' ' + (20 + levels.length * GAPD + 30) +
      '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto">';
    // 连线（先画线，节点在上）
    for (var id in pos) {
      if (!pos.hasOwnProperty(id)) continue;
      var p = pos[id], n = p.n;
      var kids = [];
      if (n.left && pos[n.left]) kids.push(n.left);
      if (n.right && pos[n.right]) kids.push(n.right);
      if (n.children) n.children.forEach(function (c) { if (pos[c]) kids.push(c); });
      kids.forEach(function (cid) {
        var c = pos[cid];
        h += '<line x1="' + p.x + '" y1="' + (p.y + 13) + '" x2="' + c.x + '" y2="' + (c.y - 13) +
          '" stroke="var(--line)" stroke-width="2"/>';
      });
    }
    // 节点
    for (var id2 in pos) {
      if (!pos.hasOwnProperty(id2)) continue;
      var p2 = pos[id2], nn = p2.n;
      var fill = nn.color === 'red' ? '#e5484d' : (nn.color === 'black' ? '#1b2130' : 'var(--card)');
      var fg = nn.color === 'red' || nn.color === 'black' ? '#fff' : 'var(--ink)';
      var stroke = (nn.status === 'active' || nn.status === 'highlighted') ? '#4f6ef7' : 'var(--line)';
      h += '<g><circle cx="' + p2.x + '" cy="' + p2.y + '" r="15" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="' + (stroke === '#4f6ef7' ? 3 : 2) + '"/>' +
        '<text x="' + p2.x + '" y="' + (p2.y + 4) + '" text-anchor="middle" font-size="12" fill="' + fg + '">' +
        esc(nn.key) + '</text></g>';
    }
    return h + '</svg></div>';
  }

  // 图：SVG 节点 + 带箭头的边（marker-end）
  function renderGraphSVG(s) {
    var nodes = s.nodes || {}, edges = s.edges || {};
    var ids = Object.keys(nodes);
    if (!ids.length) return '<div class="demo-empty">空图</div>';
    var R = 110, cx = 160, cy = 130, svgW = 320, svgH = 260;
    var pos = {};
    ids.forEach(function (id, i) {
      var a = (Math.PI * 2 * i) / ids.length - Math.PI / 2;
      pos[id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    var h = '<div class="demo-svgbox"><svg viewBox="0 0 ' + svgW + ' ' + svgH +
      '" preserveAspectRatio="xMidYMid meet" style="width:100%;height:auto">';
    h += '<defs><marker id="demoArrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">' +
      '<path d="M0,0 L0,6 L7,3 z" fill="var(--ink3)"/></marker></defs>';
    // 边（箭头）
    for (var eid in edges) {
      if (!edges.hasOwnProperty(eid)) continue;
      var e = edges[eid], a = pos[e.source], b = pos[e.target];
      if (!a || !b) continue;
      var dx = b.x - a.x, dy = b.y - a.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var x1 = a.x + ux * 17, y1 = a.y + uy * 17;
      var x2 = b.x - ux * 20, y2 = b.y - uy * 20;
      var col = (e.status === 'active' || e.status === 'highlighted') ? '#4f6ef7' : 'var(--ink3)';
      h += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 +
        '" stroke="' + col + '" stroke-width="2" marker-end="url(#demoArrow)"/>';
      if (e.weight !== undefined) {
        h += '<text x="' + ((x1 + x2) / 2) + '" y="' + ((y1 + y2) / 2 - 4) +
          '" text-anchor="middle" font-size="10" fill="var(--ink2)">' + esc(e.weight) + '</text>';
      }
    }
    // 节点
    ids.forEach(function (id) {
      var p = pos[id], n = nodes[id];
      var hot = (n.status === 'active' || n.status === 'highlighted');
      h += '<g><circle cx="' + p.x + '" cy="' + p.y + '" r="16" fill="' + (hot ? '#4f6ef7' : 'var(--card)') +
        '" stroke="' + (hot ? '#4f6ef7' : 'var(--line)') + '" stroke-width="2"/>' +
        '<text x="' + p.x + '" y="' + (p.y + 4) + '" text-anchor="middle" font-size="11" fill="' +
        (hot ? '#fff' : 'var(--ink)') + '">' + esc(n.label != null ? n.label : id) + '</text>' +
        (n.distance !== undefined ? '<text x="' + p.x + '" y="' + (p.y + 27) +
          '" text-anchor="middle" font-size="9" fill="var(--ink3)">d=' + esc(n.distance) + '</text>' : '') +
        '</g>';
    });
    return h + '</svg></div>';
  }

  function renderString(s) {
    var h = '<div class="demo-str"><div class="demo-str-l">主串</div><div class="demo-arr demo-inline">';
    (s.textChars || []).forEach(function (c) { h += '<div class="demo-cell' + statusCls(c.status) + '">' + esc(c.char) + '</div>'; });
    h += '</div><div class="demo-str-l">模式</div><div class="demo-arr demo-inline">';
    (s.patternChars || []).forEach(function (c) { h += '<div class="demo-cell' + statusCls(c.status) + '">' + esc(c.char) + '</div>'; });
    h += '</div>';
    if (s.nextArray && s.nextArray.length) {
      h += '<div class="demo-str-l">next</div><div class="demo-arr demo-inline">';
      s.nextArray.forEach(function (v) { h += '<div class="demo-cell">' + esc(v) + '</div>'; });
      h += '</div>';
    }
    return h + '</div>';
  }

  function renderHash(s) {
    var h = '<div class="demo-hash">';
    (s.buckets || []).forEach(function (b) {
      h += '<div class="demo-hbucket' + statusCls(b.status) + '"><b>' + esc(b.index) + '</b><span>';
      var es = b.entries || [];
      if (!es.length) h += '—';
      else es.forEach(function (e) { h += esc(e.value != null ? e.value : e.key) + ' '; });
      h += '</span></div>';
    });
    return h + '</div>';
  }

  function renderMatrix(s) {
    var h = '<div class="demo-matrix">';
    var cols = s.cols || 1;
    (s.cells || []).forEach(function (c) {
      h += '<div class="demo-mcell' + statusCls(c.status) + '" style="width:' + Math.floor(100 / cols) + '%">' + esc(c.value) + '</div>';
    });
    return h + '</div>';
  }

  // ---------- 详情：演示区与控制条一体，控制条紧贴结构 ----------
  function openDemo(root, tpl) {
    if (!SV || !tpl) { root.innerHTML = '<div class="demo-empty">演示不可用</div>'; return; }
    var res;
    try { res = SV.run(tpl.code); } catch (e) {
      root.innerHTML = '<div class="demo-empty">演示运行失败：' + esc(e && e.message) + '</div>'; return;
    }
    state.frames = res.frames || [];
    state.idx = 0;
    state.tpl = tpl;
    if (!state.frames.length) {
      root.innerHTML = '<div class="demo-empty">该演示暂无可执行步骤</div>'; return;
    }
    var pseudoLines = (tpl.pseudocode || '').split('\n');

    var html = '<div class="demo-play">';
    html += '<div class="demo-play-h"><b>' + esc(tpl.name) + '</b><span>' + esc(tpl.nameEn || '') + '</span></div>';
    html += '<p class="demo-play-d">' + esc(tpl.description || '') + '</p>';
    // 演示区：事件 + 结构 + 变量 + 控制条，全部在一起
    html += '<div class="demo-stage">';
    html += '<div class="demo-event" id="demo-event"></div>';
    html += '<div class="demo-visual" id="demo-visual"></div>';
    // 控制条紧贴结构可视化区（sticky 底部，变量移到舞台外）
    html += '<div class="demo-ctrl">' +
      '<button class="demo-btn" id="demo-prev">← 上一步</button>' +
      '<span class="demo-prog" id="demo-prog"></span>' +
      '<button class="demo-btn primary" id="demo-next">下一步 →</button>' +
      '</div></div>';
    // 变量 + 伪代码放舞台下方
    html += '<div class="demo-vars" id="demo-vars"></div>';
    if (pseudoLines.length && pseudoLines[0]) {
      html += '<div class="demo-pseudo"><div class="demo-pseudo-h">伪代码（随步骤高亮）</div><div id="demo-pseudo-body"></div></div>';
    }
    html += '</div>';
    root.innerHTML = html;

    function paint() {
      var f = state.frames[state.idx];
      if (!f) return;
      var ev = f.event || {};
      var evBox = document.getElementById('demo-event');
      if (evBox) evBox.innerHTML = '<div class="demo-ev-t"><span class="demo-ev-step">' + (state.idx + 1) +
        '</span>' + esc(ev.title || ev.type || '') + '</div>' +
        '<div class="demo-ev-d">' + esc(ev.description || '') + '</div>';
      var vis = document.getElementById('demo-visual');
      if (vis) {
        var structs = (f.snapshot && f.snapshot.structures) || {};
        var vh = '';
        for (var k in structs) {
          if (!structs.hasOwnProperty(k)) continue;
          vh += '<div class="demo-struct"><div class="demo-struct-l">' + esc(k) + '</div>' +
            renderStructure(structs[k]) + '</div>';
        }
        vis.innerHTML = vh || '<div class="demo-empty">无可视化数据</div>';
      }
      var vars = document.getElementById('demo-vars');
      if (vars) {
        var vv = (f.snapshot && f.snapshot.variables) || {};
        var keys = Object.keys(vv);
        if (keys.length) {
          var vh2 = '<div class="demo-vars-h">变量</div>';
          keys.forEach(function (n) { vh2 += '<span class="demo-var"><b>' + esc(n) + '</b>=' + esc(vv[n].display) + '</span>'; });
          vars.innerHTML = vh2;
        } else vars.innerHTML = '';
      }
      var pb = document.getElementById('demo-pseudo-body');
      if (pb && pseudoLines.length) {
        var active = -1;
        if (typeof ev.pseudoLine === 'number' && ev.pseudoLine >= 0 && ev.pseudoLine < pseudoLines.length) active = ev.pseudoLine;
        else if (typeof ev.codeLine === 'number') {
          var map = tpl.pseudocodeLineMap || {};
          var m = map[ev.codeLine];
          if (typeof m === 'number' && m >= 0 && m < pseudoLines.length) active = m;
        }
        var ph = '';
        pseudoLines.forEach(function (line, i) {
          ph += '<div class="demo-pseudo-l' + (i === active ? ' on' : '') + '">' +
            '<span class="demo-pseudo-n">' + (i + 1) + '</span>' + esc(line) + '</div>';
        });
        pb.innerHTML = ph;
        var on = pb.querySelector('.demo-pseudo-l.on');
        if (on) { try { on.scrollIntoView({ block: 'nearest' }); } catch (e2) {} }
      }
      var pg = document.getElementById('demo-prog');
      if (pg) pg.textContent = (state.idx + 1) + ' / ' + state.frames.length;
      var prev = document.getElementById('demo-prev');
      var next = document.getElementById('demo-next');
      if (prev) prev.disabled = state.idx <= 0;
      if (next) next.disabled = state.idx >= state.frames.length - 1;
    }

    var prevBtn = document.getElementById('demo-prev');
    var nextBtn = document.getElementById('demo-next');
    if (prevBtn) prevBtn.onclick = function () { if (state.idx > 0) { state.idx--; paint(); } };
    if (nextBtn) nextBtn.onclick = function () { if (state.idx < state.frames.length - 1) { state.idx++; paint(); } };
    paint();
  }

  global.Demo = {
    renderEntry: renderEntry,
    openDemo: openDemo,
    renderStructure: renderStructure,
    state: state,
    esc: esc,
    SUBJ: SUBJ
  };
})(window);
