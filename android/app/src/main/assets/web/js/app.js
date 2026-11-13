'use strict';
/*
 * 派立方408 — 移动端刷题（全本地数据，无网络请求）
 *
 * 架构约定（v2.1.2 维护版）：
 *   - paint()     页面级导航渲染：async，重建骨架 / 头部 / 底栏，带 viewSeq 竞态保护。
 *   - refresh()   同页数据变更：async，仅替换 #page 节点内容，保留头部 / 底栏 / 滚动位置。
 *   - 高频交互（主题、题型、筛选、收藏星标、清空）走局部 DOM 更新，不整页刷新。
 *   - 事件统一用 delegate() 委托到容器；page / actionbar 每次重建为全新节点，避免监听累积。
 *   - 版本单一来源：window.PAI408_VERSION（由 tools/build_apk.py 从根目录 VERSION 注入）。
 */
(function () {
  'use strict';

  const APP_VERSION = (window.PAI408_VERSION && window.PAI408_VERSION.name) || '2.1.2';

  const SUBJECTS = [
    { id: 'ds', name: '数据结构', short: '数据结构', hue: 235 },
    { id: 'os', name: '操作系统', short: '操作系统', hue: 158 },
    { id: 'co', name: '计算机组成原理', short: '组成原理', hue: 24 },
    { id: 'cn', name: '计算机网络', short: '计算机网络', hue: 278 }
  ];

  const LS = {
    pos: 'p408.pos.v1',
    wrong: 'p408.wrong.v1',
    fav: 'p408.fav.v1',
    set: 'p408.set.v1',
    eula: 'p408.eula.v2.1',
    plans: 'p408.plans.v1',
    study: 'p408.study.v1',
    library: 'p408.library.eula.v1'
  };

  const MODE_VIEW = 'view';
  const MODE_DO = 'do';
  const TAB_ROOTS = ['home', 'library', 'wrong', 'me'];
  const TITLES = { home: '派立方408', library: '资料库', fav: '收藏', wrong: '错题', me: '我的', study: '学习时间', subject: '科目', quiz: '练习' };
  const HDR_LABELS = { home: 'PAI CUBE · 408', library: 'STUDY LIBRARY', wrong: 'REVIEW NOTES', me: 'YOUR STUDY SPACE' };
  const HDR_ART = {
    home: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><path d="M12 13h16M15 13l7 15m7-15-7 15"/><circle cx="20" cy="20" r="2" class="fill"/></svg>',
    library: '<svg viewBox="0 0 40 40"><path d="M7 11c5-2 9-1 13 2v19c-4-3-8-4-13-2zM33 11c-5-2-9-1-13 2v19c4-3 8-4 13-2z"/><path d="M11 16c2 0 4 .3 6 1m12-1c-2 0-4 .3-6 1M11 21c2 0 4 .3 6 1m12-1c-2 0-4 .3-6 1"/></svg>',
    wrong: '<svg viewBox="0 0 40 40"><rect x="9" y="8" width="22" height="25" rx="5"/><path d="M15 15h10m-10 6h4m8 0-5 6m0-6 5 6"/></svg>',
    me: '<svg viewBox="0 0 40 40"><circle cx="20" cy="14" r="6"/><path d="M8 32c1-7 5-10 12-10s11 3 12 10"/><path d="m29 8 1.5 3 3.5.5-2.5 2.5.6 3.5-3.1-1.7-3.1 1.7.6-3.5-2.5-2.5 3.5-.5z"/></svg>'
  };

  /* ================= 通用工具 ================= */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function qsMatch(el, sel) {
    if (!el || el.nodeType !== 1) return false;
    const fn = el.matches || el.webkitMatchesSelector || el.msMatchesSelector || el.mozMatchesSelector;
    return fn ? fn.call(el, sel) : false;
  }

  function closestEl(el, sel) {
    while (el && el.nodeType === 1) {
      if (qsMatch(el, sel)) return el;
      el = el.parentElement;
    }
    return null;
  }

  /** 事件委托：兼容不支持 Element.closest 的旧 WebView */
  function delegate(root, type, sel, handler) {
    if (!root) return;
    root.addEventListener(type, e => {
      const el = closestEl(e.target, sel);
      if (el && root.contains(el)) handler(e, el);
    });
  }

  function qid(it) { return it.s + '|' + it.c + '|' + it.k + '|' + it.n; }
  function parseQid(id) {
    const p = String(id).split('|');
    return { s: p[0], c: p[1], k: p[2], n: Number(p[3]) };
  }
  function subjShort(id) {
    const s = SUBJECTS.find(x => x.id === id);
    return s ? s.short : id;
  }
  function kindName(k) { return k === 'b' ? '综合应用题' : '选择题'; }
  function secOfKind(sec, kind) { return kind === 'b' ? sec.bigq : sec.xzt; }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 1700);
  }
  function haptic() {
    if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) { /* 忽略 */ } }
  }

  /* 配图自适应：扫描件里 1400×41 这类极扁图按可读高度渲染并允许横向滑动 */
  window.__figFit = function (img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (w / h > 7) {
      const targetH = 58;
      img.style.width = Math.round(w * targetH / h) + 'px';
      img.style.height = targetH + 'px';
      img.style.margin = '0';
      if (img.parentNode) img.parentNode.style.textAlign = 'left';
    } else {
      img.style.width = '';
      img.style.height = '';
      img.style.margin = '0 auto';
      img.style.maxWidth = '100%';
    }
  };

  /* ================= 存储 ================= */
  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { toast('存储空间不足，写入失败'); return false; }
  }

  const DEFAULT_FAV = { folders: [{ id: 'default', name: '默认收藏夹', ts: 0 }], items: {} };
  const DEFAULT_SET = { theme: 'auto', lastMode: MODE_DO };

  const store = {
    get pos() { return read(LS.pos, {}); },
    set pos(v) { write(LS.pos, v); },
    get wrong() { return read(LS.wrong, []); },
    set wrong(v) { write(LS.wrong, v); },
    get fav() { return read(LS.fav, DEFAULT_FAV); },
    set fav(v) { write(LS.fav, v); },
    get set() { return read(LS.set, DEFAULT_SET); },
    set set(v) { write(LS.set, v); }
  };
  function setSetting(key, value) {
    const s = store.set;
    s[key] = value;
    store.set = s;
  }

  /* ================= 题库数据（异步加载，带缓存与竞态保护） ================= */
  const D = {};      // subj -> {id,name,sections:[...]}
  const IDX = {};    // subj -> {secId: {x:{num:q}, b:{num:q}}}
  const loading = {};

  function load(id) {
    if (D[id]) return Promise.resolve(D[id]);
    if (loading[id]) return loading[id];
    loading[id] = fetch('data/' + id + '.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        D[id] = d;
        const map = {};
        d.sections.forEach(sec => {
          const x = {}, b = {};
          sec.xzt.forEach(q => { x[q[0]] = q; });
          sec.bigq.forEach(q => { b[q[0]] = q; });
          map[sec.id] = { x: x, b: b };
        });
        IDX[id] = map;
        delete loading[id];
        return d;
      })
      .catch(e => { delete loading[id]; throw e; });
    return loading[id];
  }

  function secOf(subj, secId) {
    const d = D[subj];
    return d ? (d.sections.find(s => s.id === secId) || null) : null;
  }
  function getQ(it) {
    const m = IDX[it.s];
    if (!m || !m[it.c]) return null;
    return (it.k === 'b' ? m[it.c].b : m[it.c].x)[it.n] || null;
  }
  const getQCached = getQ;
  function totalOf(subj, kind) {
    const d = D[subj];
    if (!d) return 0;
    return d.sections.reduce((a, s) => a + secOfKind(s, kind).length, 0);
  }

  async function ensureData(ids) {
    const need = Array.from(new Set(ids)).filter(id => !D[id]);
    if (need.length) await Promise.all(need.map(load));
  }

  /* ================= 进度 / 统计 ================= */
  function posGet(s, c, k, n) {
    const p = store.pos;
    return (p[s] && p[s][c] && p[s][c][k]) ? p[s][c][k][n] : null;
  }
  function posSet(s, c, k, n, ok, mine) {
    const p = store.pos;
    p[s] = p[s] || {};
    p[s][c] = p[s][c] || {};
    p[s][c][k] = p[s][c][k] || {};
    const old = p[s][c][k][n];
    p[s][c][k][n] = {
      ok: ok ? 1 : 0,
      mine: mine == null ? '' : mine,
      ts: Date.now(),
      at: old ? old.at : Date.now()
    };
    store.pos = p;
  }
  function subjStat(subj) {
    const p = store.pos[subj] || {};
    let done = 0, ok = 0;
    for (const c in p) for (const k in p[c]) for (const n in p[c][k]) {
      done++;
      if (p[c][k][n].ok) ok++;
    }
    return {
      done: done, ok: ok,
      tot: totalOf(subj, 'x') + totalOf(subj, 'b'),
      rate: done ? Math.round(ok / done * 100) : 0
    };
  }
  function secStat(subj, sec, kind) {
    const p = (store.pos[subj] || {})[sec] || {};
    const m = p[kind] || {};
    let ok = 0;
    for (const k in m) if (m[k].ok) ok++;
    return { done: Object.keys(m).length, ok: ok };
  }

  /* ================= 错题 ================= */
  function wrongAdd(it, mine, right) {
    const list = store.wrong;
    const id = qid(it);
    const found = list.find(x => x.id === id);
    if (found) {
      found.cnt = (found.cnt || 1) + 1;
      found.ts = Date.now();
      found.mine = mine;
      found.right = right;
    } else {
      list.push({ id: id, s: it.s, c: it.c, k: it.k, n: it.n, mine: mine, right: right, ts: Date.now(), cnt: 1 });
    }
    store.wrong = list;
  }
  function wrongRemove(it) {
    const id = qid(it);
    const list = store.wrong.filter(x => x.id !== id);
    if (list.length !== store.wrong.length) { store.wrong = list; return true; }
    return false;
  }
  function wrongHas(it) { return store.wrong.some(x => x.id === qid(it)); }
  function wrongCountBy(subj) {
    const list = store.wrong;
    return subj ? list.filter(x => x.s === subj).length : list.length;
  }

  /* ================= 收藏夹 ================= */
  function favFolders() { return store.fav.folders; }
  function favFoldersOf(it) { return store.fav.items[qid(it)] || []; }
  function favLinked(it) { return favFoldersOf(it).length > 0; }
  function favTotal(folderId) {
    const items = store.fav.items;
    let n = 0;
    for (const key in items) {
      if (!folderId) { if (items[key].length) n++; }
      else if (items[key].indexOf(folderId) >= 0) n++;
    }
    return n;
  }
  function favToggleFolder(it, folderId) {
    const fav = store.fav;
    const id = qid(it);
    const curList = fav.items[id] ? fav.items[id].slice() : [];
    const i = curList.indexOf(folderId);
    if (i >= 0) curList.splice(i, 1); else curList.push(folderId);
    if (curList.length) fav.items[id] = curList; else delete fav.items[id];
    store.fav = fav;
  }
  function favNewFolder(name) {
    const fav = store.fav;
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    fav.folders.push({ id: id, name: name, ts: Date.now() });
    store.fav = fav;
    return id;
  }
  function favDelFolder(id) {
    if (id === 'default') return false;
    const fav = store.fav;
    fav.folders = fav.folders.filter(f => f.id !== id);
    for (const key in fav.items) {
      fav.items[key] = fav.items[key].filter(x => x !== id);
      if (!fav.items[key].length) delete fav.items[key];
    }
    store.fav = fav;
    return true;
  }
  function folderName(id) {
    const f = favFolders().find(x => x.id === id);
    return f ? f.name : '';
  }

  /* ================= 学习计划 ================= */
  function readPlans() { return read(LS.plans, []); }
  function storePlans(v) { write(LS.plans, v); }

  function planCard(p) {
    return '<div class="li plan-card' + (p.done ? ' completed' : '') + '" draggable="true" data-plan="' + esc(p.id) + '">' +
      '<button class="plan-check" data-check="' + esc(p.id) + '" aria-label="完成计划">' + (p.done ? '✓' : '') + '</button>' +
      '<span class="li-main"><span class="li-t">' + esc(p.title) + '</span>' +
      '<span class="li-s">' + esc(p.date || '未设日期') + (p.detail ? ' · ' + esc(p.detail) : '') + '</span></span>' +
      '<span class="plan-grip" aria-hidden="true">⠿</span></div>';
  }
  function orderedPlans() {
    const plans = readPlans();
    return plans.filter(x => !x.done).concat(plans.filter(x => x.done));
  }
  function refreshPlanList(animate) {
    const box = $('#plan-list');
    if (!box) return;
    const ordered = orderedPlans();
    box.innerHTML = ordered.length
      ? ordered.map(planCard).join('')
      : '<div class="empty compact">添加日期与目标，让复习计划更清晰</div>';
    if (animate) {
      $$('.plan-card', box).forEach((el, i) => {
        el.style.animationDelay = Math.min(i * 24, 180) + 'ms';
        el.classList.add('plan-enter');
      });
    }
  }
  function animatePlanLayout(box, mutate) {
    const nodes = Array.from(box.querySelectorAll('.plan-card:not(.dragging)'));
    const first = new Map(nodes.map(x => [x, x.getBoundingClientRect().top]));
    mutate();
    nodes.forEach(el => {
      const delta = first.get(el) - el.getBoundingClientRect().top;
      if (!delta) return;
      el.style.transition = 'none';
      el.style.transform = 'translateY(' + delta + 'px)';
      requestAnimationFrame(() => {
        el.style.transition = 'transform 220ms cubic-bezier(.22,.61,.36,1)';
        el.style.transform = '';
      });
    });
  }
  function planActions(p) {
    openSheet('已完成计划', [
      { t: '恢复计划', v: 'restore' },
      { t: '删除计划', v: 'delete' }
    ], v => {
      const list = readPlans();
      if (v === 'delete') storePlans(list.filter(x => x.id !== p.id));
      else { const x = list.find(y => y.id === p.id); if (x) x.done = false; storePlans(list); }
      refreshPlanList(true);
    });
  }
  function bindPlanInteractions(box) {
    if (!box) return;
    let hold = null, drag = null, placeholder = null, offset = 0, startY = 0;

    box.addEventListener('dragstart', e => {
      const card = closestEl(e.target, '[data-plan]');
      if (!card) return;
      drag = card;
      e.dataTransfer.setData('text/plain', card.dataset.plan);
      e.dataTransfer.effectAllowed = 'move';
    });
    box.addEventListener('dragover', e => {
      e.preventDefault();
      const target = closestEl(e.target, '[data-plan]');
      if (!drag || !target || target === drag) return;
      const plans = readPlans();
      const a = plans.find(x => x.id === drag.dataset.plan);
      const b = plans.find(x => x.id === target.dataset.plan);
      if (!a || !b || a.done !== b.done) return;
      const r = target.getBoundingClientRect();
      animatePlanLayout(box, () => box.insertBefore(drag, e.clientY < r.top + r.height / 2 ? target : target.nextSibling));
    });
    const persistOrder = () => {
      const ids = Array.from(box.querySelectorAll('[data-plan]')).map(x => x.dataset.plan);
      const list = readPlans();
      const map = {};
      list.forEach(x => { map[x.id] = x; });
      storePlans(ids.map(id => map[id]).filter(Boolean));
      drag = null;
    };
    box.addEventListener('drop', e => { e.preventDefault(); if (drag) persistOrder(); });
    box.addEventListener('dragend', () => { if (drag) persistOrder(); });

    delegate(box, 'click', '[data-plan]', (e, card) => {
      const check = closestEl(e.target, '[data-check]');
      const plans = readPlans();
      const p = plans.find(x => x.id === card.dataset.plan);
      if (!p) return;
      if (check) {
        if (p.done) { planActions(p); return; }
        p.done = true;
        storePlans(plans);
        refreshPlanList(true);
        return;
      }
      if (p.done) planActions(p);
    });

    box.addEventListener('touchstart', e => {
      const card = closestEl(e.target, '[data-plan]');
      if (!card || closestEl(e.target, 'button') || e.touches.length !== 1) return;
      const t = e.touches[0];
      startY = t.clientY;
      hold = setTimeout(() => {
        drag = card;
        const r = card.getBoundingClientRect();
        offset = startY - r.top;
        placeholder = document.createElement('div');
        placeholder.className = 'plan-placeholder';
        placeholder.style.height = r.height + 'px';
        card.parentNode.insertBefore(placeholder, card.nextSibling);
        card.classList.add('dragging');
        card.style.position = 'fixed';
        card.style.left = r.left + 'px';
        card.style.top = r.top + 'px';
        card.style.width = r.width + 'px';
        card.style.zIndex = '90';
        card.style.pointerEvents = 'none';
        haptic();
      }, 360);
    }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (!drag) return;
      e.preventDefault();
      const t = e.touches[0];
      drag.style.top = (t.clientY - offset) + 'px';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      const target = under && closestEl(under, '[data-plan]');
      if (target && target !== drag && target.parentNode === box) {
        const d = readPlans();
        const a = d.find(x => x.id === drag.dataset.plan);
        const b = d.find(x => x.id === target.dataset.plan);
        if (a && b && a.done === b.done) {
          const r = target.getBoundingClientRect();
          const before = t.clientY < r.top + r.height / 2 ? target : target.nextSibling;
          if (before !== placeholder && before !== drag) animatePlanLayout(box, () => box.insertBefore(placeholder, before));
        }
      }
    }, { passive: false });
    box.addEventListener('touchend', () => {
      clearTimeout(hold);
      if (!drag) return;
      animatePlanLayout(box, () => { box.insertBefore(drag, placeholder); placeholder.remove(); });
      drag.removeAttribute('style');
      drag.classList.remove('dragging');
      const list = Array.from(box.querySelectorAll('[data-plan]')).map(el => el.dataset.plan);
      const old = readPlans();
      const map = {};
      old.forEach(p => { map[p.id] = p; });
      storePlans(list.map(id => map[id]).filter(Boolean));
      drag = null;
      placeholder = null;
    });
    box.addEventListener('touchcancel', () => {
      clearTimeout(hold);
      if (drag) {
        placeholder.remove();
        drag.removeAttribute('style');
        drag.classList.remove('dragging');
        drag = null;
        refreshPlanList(false);
      }
    });
  }
  function addPlan() {
    openSheet('添加学习计划', [], null, body => {
      body.innerHTML = '<div class="form-pad">' +
        '<input class="inp" id="pl-title" placeholder="计划题目 / 目标" maxlength="60">' +
        '<div class="date-field"><span class="date-placeholder">选择计划日期</span>' +
        '<input class="inp date-inp" id="pl-date" type="date" aria-label="选择计划日期"></div>' +
        '<textarea class="inp" id="pl-detail" placeholder="细则（选填）" maxlength="140"></textarea>' +
        '<button class="btn-primary" id="pl-save">保存计划</button></div>';
      const dateField = $('.date-field', body);
      const dateInput = $('#pl-date', body);
      dateInput.addEventListener('change', () => dateField.classList.toggle('has-value', !!dateInput.value));
      $('#pl-save').onclick = () => {
        const title = $('#pl-title').value.trim();
        if (!title) return toast('请填写计划题目');
        const list = readPlans();
        list.push({
          id: Date.now().toString(36),
          title: title,
          date: $('#pl-date').value,
          detail: $('#pl-detail').value.trim(),
          done: false
        });
        storePlans(list);
        closeSheet();
        refreshPlanList(true);
      };
    });
  }

  /* ================= 学习计时 ================= */
  function accrueActiveStudy() {
    if (!Q || !Q.activeSince || !Q.activeSubject) return;
    const secs = Math.floor((Date.now() - Q.activeSince) / 1000);
    Q.activeSince = Date.now();
    if (secs <= 0) return;
    const d = new Date();
    const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const data = read(LS.study, {});
    data[key] = data[key] || {};
    data[key][Q.activeSubject] = (data[key][Q.activeSubject] || 0) + secs;
    write(LS.study, data);
  }
  function recordStudyTime() { accrueActiveStudy(); }

  function formatDuration(sec) {
    const m = Math.floor(sec / 60);
    return m < 60 ? m + ' 分钟' : Math.floor(m / 60) + ' 小时 ' + m % 60 + ' 分钟';
  }
  function studyPreview(data) {
    let h = '<span class="heat-preview" aria-hidden="true">';
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const sec = Object.values(data[key] || {}).reduce((a, x) => a + x, 0);
      h += '<i class="heat-cell ' + (sec >= 3600 ? 'strong' : sec > 0 ? 'active' : '') + '"></i>';
    }
    return h + '</span><span class="study-pi">π</span>';
  }

  /* ================= 导航状态 ================= */
  const nav = { stack: [{ v: 'home', p: {}, sc: 0 }] };
  function cur() { return nav.stack[nav.stack.length - 1]; }

  function go(view, params, replace) {
    const top = cur();
    const next = params || {};
    if (!replace && top.v === view && JSON.stringify(top.p) === JSON.stringify(next)) return;
    top.sc = window.scrollY;
    if (replace) nav.stack[nav.stack.length - 1] = { v: view, p: next, sc: 0 };
    else nav.stack.push({ v: view, p: next, sc: 0 });
    paint(true);
  }
  function back() {
    if (nav.stack.length <= 1) return false;
    if (cur().v === 'quiz') recordStudyTime();
    nav.stack.pop();
    cur().keepScroll = true;
    paint(false);
    return true;
  }

  /* ================= 渲染管线 ================= */
  let viewSeq = 0;
  let startupAt = 0;
  let startupFinished = false;

  function headerHtml(st, isTabRoot) {
    const heading = esc(st.title || TITLES[st.v] || '派立方408');
    if (isTabRoot) {
      return '<span class="hdr-art" aria-hidden="true">' + (HDR_ART[st.v] || '') + '</span>' +
        '<span class="hdr-copy"><small>' + (HDR_LABELS[st.v] || '') + '</small><strong>' + heading + '</strong></span>' +
        '<span class="hdr-rule"></span>';
    }
    return '<span class="hdr-submark" aria-hidden="true"></span>' +
      '<span class="hdr-copy"><strong>' + heading + '</strong></span>';
  }

  function freshPage(forward) {
    const app = $('#app');
    const old = $('#page');
    const page = document.createElement('div');
    page.className = 'page';
    page.id = 'page';
    page.style.animationName = forward === false ? 'pageInBack' : 'pageIn';
    if (old) old.replaceWith(page); else app.appendChild(page);
    return page;
  }

  /** 完整渲染：重建骨架 / 头部 / 底栏（页面导航用） */
  async function paint(forward) {
    const seq = ++viewSeq;
    const st = cur();
    const isTabRoot = TAB_ROOTS.indexOf(st.v) >= 0 && nav.stack.length === 1;

    const hdr = $('#hdr');
    hdr.classList.toggle('sub', !isTabRoot);
    hdr.dataset.view = isTabRoot ? st.v : 'sub';
    $('#hdr-title').innerHTML = headerHtml(st, isTabRoot);
    $('#hdr-right').innerHTML = st.v === 'quiz'
      ? '<button class="hdr-btn" id="btn-star">★</button>' : '';
    $('#tabbar').classList.toggle('hide', !isTabRoot);
    $('#app').classList.toggle('no-tab', !isTabRoot);
    $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.v));

    clearActionBar();
    const page = freshPage(forward);
    await runView(seq, st, page);
  }

  /** 同页刷新：只替换 #page 内容，保留头部 / 底栏 / 滚动位置（数据变更用） */
  async function refresh() {
    const seq = ++viewSeq;
    const st = cur();
    const y = window.scrollY;
    clearActionBar();
    const page = freshPage(true);
    await runView(seq, st, page);
    if (seq === viewSeq) window.scrollTo(0, y);
  }

  /**
   * 仅重建页面内某个内容容器，保留其余 DOM（尤其是横向筛选栏 #wchips / #favchips）。
   * 与 refresh() 的区别：不调用 freshPage()、不触碰 window.scrollTo，
   * 因此 chips 的 scrollLeft 与用户手动拖动的纵向位置都原样保留。
   * render(container, filterValue) 可为 async；完成后把结果写入 container.innerHTML。
   */
  async function refreshRegion(containerId, render) {
    const box = $('#' + containerId);
    if (!box) return;
    const html = await render();
    const live = $('#' + containerId);
    if (live) live.innerHTML = html;
  }

  async function runView(seq, st, page) {
    const view = VIEWS[st.v] || VIEWS.home;
    try {
      await view(page, st.p, st);
    } catch (e) {
      if (seq !== viewSeq) return;
      page.innerHTML = '<div class="empty"><div class="ico">!</div>题库暂时无法加载<br>' +
        '<button class="btn-primary" id="retry-load" style="margin-top:16px">重试</button></div>';
      const retry = $('#retry-load', page);
      if (retry) retry.onclick = () => {
        SUBJECTS.forEach(s => { delete loading[s.id]; delete D[s.id]; delete IDX[s.id]; });
        paint(false);
      };
    }
    if (seq !== viewSeq) return;
    if (st.keepScroll) { window.scrollTo(0, st.sc || 0); st.keepScroll = false; }
    else window.scrollTo(0, 0);
    if (st.v === 'home' && nav.stack.length === 1) finishStartup();
    if (st.v === 'quiz') updateStar();
  }

  /* ================= 悬浮操作条 ================= */
  function clearActionBar() {
    const bar = $('.actionbar');
    if (bar) bar.remove();
    const app = $('#app');
    if (app) app.classList.remove('has-ab');
  }
  function setActionBar(html, bind) {
    clearActionBar();
    const bar = document.createElement('div');
    bar.className = 'actionbar in';
    bar.innerHTML = html;
    $('#app').appendChild(bar);
    $('#app').classList.add('has-ab');
    if (bind) bind(bar);
    return bar;
  }

  /* ================= 视图 ================= */
  const VIEWS = {};

  /* ---------- 首页 ---------- */
  VIEWS.home = async function (page) {
    await ensureData(SUBJECTS.map(s => s.id));

    let tot = 0, done = 0, ok = 0;
    SUBJECTS.forEach(s => {
      const st = subjStat(s.id);
      tot += st.tot; done += st.done; ok += st.ok;
    });
    const rate = done ? Math.round(ok / done * 100) : 0;

    let html = '<div class="hero"><h2>派立方408</h2>' +
      '<p>数据结构 · 组成原理 · 操作系统 · 计算机网络</p>' +
      '<div class="hero-row">' +
      '<div class="hero-kpi"><b>' + tot + '</b><span>题目总数</span></div>' +
      '<div class="hero-kpi"><b>' + done + '</b><span>已练习</span></div>' +
      '<div class="hero-kpi"><b>' + rate + '%</b><span>正确率</span></div>' +
      '</div></div>';

    html += '<div class="sec-title">选择板块</div><div class="subj-grid">';
    SUBJECTS.forEach(s => {
      const st = subjStat(s.id);
      const pct = st.tot ? Math.round(st.done / st.tot * 100) : 0;
      html += '<button class="subj" data-subj="' + s.id + '">' +
        '<h3>' + esc(s.short) + '</h3>' +
        '<div class="subj-meta"><span>已做 ' + st.done + '/' + st.tot + '</span><span>' + st.rate + '%</span></div>' +
        '<div class="subj-bar"><i style="width:' + pct + '%;background:hsl(' + s.hue + ' 78% 60%)"></i></div>' +
        '</button>';
    });
    html += '</div>';

    html += '<div class="sec-title">练习模式</div><div class="quick">' +
      '<button class="qbtn" id="home-shuffle"><span class="qbtn-ico sh">⇄</span>' +
      '<span class="qbtn-tx"><b>全库乱序刷题</b><i>四科混合随机 · ' + tot + ' 题</i></span></button>' +
      '</div>';

    html += '<div class="sec-title">学习计划 <button class="more" id="plan-add">＋ 添加计划</button></div>' +
      '<div class="list" id="plan-list">' +
      (orderedPlans().length ? orderedPlans().map(planCard).join('') : '<div class="empty compact">添加日期与目标，让复习计划更清晰</div>') +
      '</div>';
    page.innerHTML = html;

    delegate(page, 'click', '[data-subj]', (e, el) => {
      haptic();
      go('subject', { subj: el.dataset.subj, kind: 'x' });
    });
    delegate(page, 'click', '#home-shuffle', () => {
      haptic();
      const items = buildAllShuffleItems('x');
      if (!items.length) return toast('暂无可练习题目');
      chooseMode('', '', '', items.length, mode => startQuiz(items, mode, { shuffle: true, all: true }), '全库乱序刷题');
    });
    delegate(page, 'click', '#plan-add', () => addPlan());
    bindPlanInteractions($('#plan-list', page));
  };

  /* ---------- 科目 ---------- */
  function subjectQuickHtml(subj, kind) {
    const allN = totalOf(subj, kind);
    const wCount = wrongCountBy(subj);
    return '<button class="qbtn" id="go-shuffle"><span class="qbtn-ico sh">⇄</span>' +
      '<span class="qbtn-tx"><b>乱序刷题</b><i>全部章节随机混合 · ' + allN + ' 题</i></span></button>' +
      '<button class="qbtn" id="re-wrong"' + (wCount ? '' : ' disabled') + '><span class="qbtn-ico rw">✕</span>' +
      '<span class="qbtn-tx"><b>错题重刷</b><i>' +
      (wCount ? '本科错题 ' + wCount + ' 道' : '暂无错题，先刷几轮吧') + '</i></span></button>';
  }
  function subjectSectionHtml(subj, kind) {
    const d = D[subj];
    let html = '';
    d.sections.forEach(sec => {
      const arr = secOfKind(sec, kind);
      if (!arr.length) return;
      const sst = secStat(subj, sec.id, kind);
      const pct = arr.length ? Math.round(sst.done / arr.length * 100) : 0;
      const wn = store.wrong.filter(x => x.s === subj && x.c === sec.id && x.k === kind).length;
      html += '<button class="li" data-sec="' + esc(sec.id) + '">' +
        '<span class="li-num">' + esc(sec.id) + '</span>' +
        '<span class="li-main"><span class="li-t">' + esc(sec.title) + '</span>' +
        '<span class="li-s">' + sst.done + '/' + arr.length + ' 题' + (wn ? ' · 错 ' + wn : '') + '</span>' +
        '<span class="prog"><i style="width:' + pct + '%"></i></span></span>' +
        '<span class="li-r"><i class="chev"></i></span></button>';
    });
    return html || '<div class="empty compact">该题型暂无题目</div>';
  }

  VIEWS.subject = async function (page, p) {
    const subj = p.subj;
    const kind = p.kind || 'x';
    const meta = SUBJECTS.find(s => s.id === subj);
    await load(subj);
    cur().title = meta.short;

    const st = subjStat(subj);
    const nX = totalOf(subj, 'x');
    const nB = totalOf(subj, 'b');
    let html = '<div class="chips" style="margin-bottom:14px">' +
      '<button class="chip ' + (kind === 'x' ? 'on' : '') + '" data-kind="x">选择题<span class="n">' + nX + '</span></button>' +
      '<button class="chip ' + (kind === 'b' ? 'on' : '') + '" data-kind="b">综合应用题<span class="n">' + nB + '</span></button>' +
      '</div>' +
      '<div class="stat-grid" style="margin-bottom:16px">' +
      '<div class="stat-cell"><b>' + st.done + '</b><span>已练习</span></div>' +
      '<div class="stat-cell ok"><b>' + st.rate + '%</b><span>正确率</span></div>' +
      '<div class="stat-cell bad"><b>' + wrongCountBy(subj) + '</b><span>本科错题</span></div>' +
      '</div>' +
      '<div class="sec-title">练习模式</div><div class="quick" id="subj-quick">' + subjectQuickHtml(subj, kind) + '</div>' +
      '<div class="sec-title">章节<span class="more" id="sec-kind-label">' + (kind === 'x' ? '选择题' : '综合应用题') + '</span></div>' +
      '<div class="list" id="sec-list">' + subjectSectionHtml(subj, kind) + '</div>';
    page.innerHTML = html;

    delegate(page, 'click', '[data-kind]', (e, el) => {
      const next = el.dataset.kind;
      if (next === cur().p.kind) return;
      cur().p.kind = next;
      $$('[data-kind]', page).forEach(b => b.classList.toggle('on', b.dataset.kind === next));
      const label = $('#sec-kind-label', page);
      if (label) label.textContent = next === 'x' ? '选择题' : '综合应用题';
      const quick = $('#subj-quick', page);
      if (quick) quick.innerHTML = subjectQuickHtml(subj, next);
      const list = $('#sec-list', page);
      if (list) list.innerHTML = subjectSectionHtml(subj, next);
    });
    delegate(page, 'click', '[data-sec]', (e, el) => {
      haptic();
      const sec = secOf(subj, el.dataset.sec);
      if (!sec) return;
      const kindNow = cur().p.kind || 'x';
      const arr = secOfKind(sec, kindNow);
      chooseMode(subj, sec.id, kindNow, arr.length, mode => {
        startQuiz(buildItems(subj, sec.id, kindNow), mode, { s: subj, c: sec.id, k: kindNow });
      });
    });
    delegate(page, 'click', '#go-shuffle', () => {
      haptic();
      const kindNow = cur().p.kind || 'x';
      const items = buildShuffleItems(subj, kindNow);
      if (!items.length) return toast('本科暂无可练习题目');
      chooseMode(subj, '', kindNow, items.length, mode => {
        startQuiz(items, mode, { shuffle: true, s: subj, k: kindNow });
      }, '乱序刷题');
    });
    delegate(page, 'click', '#re-wrong', () => {
      haptic();
      const items = store.wrong.filter(x => x.s === subj).map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      if (!items.length) return toast('本科暂无错题');
      chooseMode(subj, '', 'x', items.length, mode => startQuiz(items, mode, { wrong: true, s: subj }), '错题重刷');
    });
  };

  /* ---------- 乱序构建 ---------- */
  function buildShuffleItems(subj, kind) {
    const d = D[subj];
    if (!d) return [];
    const all = [];
    d.sections.forEach(sec => {
      secOfKind(sec, kind).forEach(q => all.push({ s: subj, c: sec.id, k: kind, n: q[0] }));
    });
    return shuffle(all);
  }
  function buildAllShuffleItems(kind) {
    const all = [];
    SUBJECTS.forEach(sd => {
      const d = D[sd.id];
      if (!d) return;
      d.sections.forEach(sec => {
        secOfKind(sec, kind).forEach(q => all.push({ s: sd.id, c: sec.id, k: kind, n: q[0] }));
      });
    });
    return shuffle(all);
  }
  function shuffle(arr) {
    const a = arr.slice();
    let seed = (Date.now() % 2147483647) ^ Math.floor(Math.random() * 2147483647);
    function rnd() {
      seed ^= seed << 13; seed >>>= 0;
      seed ^= seed >>> 17;
      seed ^= seed << 5; seed >>>= 0;
      return seed / 4294967296;
    }
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function buildItems(subj, secId, kind) {
    const sec = secOf(subj, secId);
    return secOfKind(sec, kind).map(q => ({ s: subj, c: secId, k: kind, n: q[0] }));
  }

  function chooseMode(subj, secId, kind, count, cb, titleText) {
    const last = store.set.lastMode || MODE_DO;
    openSheet((titleText || '选择练习方式') + ' · ' + count + ' 题', [
      { t: '做题模式', d: '先作答，提交后显示答案与解析', v: MODE_DO, mark: last === MODE_DO },
      { t: '看题模式', d: '直接显示答案与解析，快速过题', v: MODE_VIEW, mark: last === MODE_VIEW }
    ], v => { setSetting('lastMode', v); cb(v); });
  }

  /* ---------- 刷题会话 ---------- */
  let Q = null;

  function startQuiz(items, mode, ctx) {
    if (!items.length) return toast('没有可选题目');
    Q = {
      items: items, i: 0, mode: mode, ctx: ctx || {}, done: {},
      sel: new Set(), activeSince: 0, activeSubject: ''
    };
    go('quiz', {});
  }

  VIEWS.quiz = async function (page) {
    if (!Q) { page.innerHTML = '<div class="empty">会话已结束</div>'; return; }
    page.innerHTML = '<div id="quizbar" class="quizbar"></div><div id="qwrap"></div>';

    // 选项委托：绑在 qwrap（会话期间节点不变），状态动态从 Q 读取，避免重复绑定
    delegate($('#qwrap', page), 'click', '.opt', (e, el) => onOptionClick(el.dataset.l));
    renderQ();
  };

  function quizTitle() {
    if (!Q || cur().v !== 'quiz') return;
    const it = Q.items[Q.i];
    let sub;
    if (Q.ctx.wrong) sub = subjShort(it.s) + ' · 错题重刷';
    else if (Q.ctx.all) sub = '全库乱序刷题';
    else if (Q.ctx.shuffle) sub = subjShort(it.s) + ' · 乱序刷题';
    else if (Q.ctx.fav) sub = '我的收藏';
    else sub = subjShort(it.s) + ' · ' + it.c;
    cur().title = sub;
    $('#hdr-title').textContent = sub;
  }
  function updateStar() {
    const b = $('#btn-star');
    if (b && Q && cur().v === 'quiz') b.classList.toggle('on', favLinked(Q.items[Q.i]));
  }

  function isRevealed() {
    if (!Q) return false;
    return Q.mode === MODE_VIEW || !!Q.done[qid(Q.items[Q.i])];
  }

  function onOptionClick(letter) {
    if (!Q || cur().v !== 'quiz' || isRevealed() || Q.isBig) return;
    haptic();
    if (!Q.multi) Q.sel.clear();
    if (Q.sel.has(letter)) Q.sel.delete(letter); else Q.sel.add(letter);
    paintOpts();
    const sub = $('#btn-submit');
    if (sub) sub.disabled = Q.sel.size === 0;
  }

  function paintOpts() {
    const optsEl = $('#opts');
    if (!optsEl || !Q) return;
    const revealed = isRevealed();
    $$('.opt', optsEl).forEach(o => {
      o.classList.remove('sel', 'right', 'wrong', 'dim');
      const L = o.dataset.l;
      if (!revealed) { if (Q.sel.has(L)) o.classList.add('sel'); return; }
      if (Q.ans.indexOf(L) >= 0) o.classList.add('right');
      else if (Q.sel.has(L)) o.classList.add('wrong');
      else o.classList.add('dim');
    });
  }

  function renderQ() {
    if (!Q) return;
    accrueActiveStudy();
    clearActionBar();

    const page = $('#page');
    const wrap = page ? $('#qwrap', page) : $('#qwrap');
    const bar = page ? $('#quizbar', page) : $('#quizbar');
    if (!wrap) return;

    const it = Q.items[Q.i];
    Q.activeSubject = it.s;
    Q.activeSince = Date.now();
    const q = getQ(it);
    quizTitle();
    // 换题时必须同步刷新星标：它挂在 header（位于 #page 之外），
    // 不会随 qwrap 重绘，若不更新会保留上一题的收藏状态。
    updateStar();
    if (!q) { wrap.innerHTML = '<div class="empty">题目数据缺失</div>'; return; }

    const sec = secOf(it.s, it.c);
    Q.isBig = it.k === 'b';
    const rec = Q.done[qid(it)];

    if (bar) {
      const prog = Math.round((Q.i + 1) / Q.items.length * 100);
      bar.innerHTML = '<span>' + (Q.i + 1) + '/' + Q.items.length + '</span>' +
        '<span class="track"><i style="width:' + prog + '%"></i></span>' +
        '<span>' + (Q.mode === MODE_VIEW ? '看题' : '做题') + '</span>';
    }

    const stem = Q.isBig ? q[1] : q[2];
    const img = Q.isBig ? q[4] : q[5];
    wrap.innerHTML = '<div class="qcard">' +
      '<div class="qmeta">' +
      '<span>' + esc(subjShort(it.s)) + ' · ' + esc(it.c) + '</span>' +
      (sec ? '<span class="pfx">' + esc(sec.title) + '</span>' : '') +
      '<span class="pill' + (Q.isBig ? ' multi' : '') + '">' + kindName(it.k) + ' 第' + it.n + '题</span>' +
      (wrongHas(it) ? '<span class="pill" style="background:var(--bad-soft);color:var(--bad)">错题</span>' : '') +
      '</div>' +
      '<div class="qstem">' + esc(stem) + '</div>' +
      (img ? '<div class="figwrap"><img class="qfig" src="' + esc(img) + '" alt="配图" onload="window.__figFit&&window.__figFit(this)"></div>' : '') +
      '</div>';

    if (!Q.isBig) renderXzt(wrap, it, q, rec);
    else renderBig(wrap, it, q, rec);
  }

  function renderXzt(wrap, it, q, rec) {
    Q.ans = String(q[1] || '');
    Q.multi = Q.ans.length > 1;
    Q.sel = new Set(rec && rec.mine ? String(rec.mine).split('') : []);
    const opts = q[4] || [];

    let h = '<div class="qcard" style="margin-top:12px"><div class="opts" id="opts">';
    if (opts.length) {
      opts.forEach(txt => {
        const L = String(txt).trim().charAt(0);
        const body = String(txt).replace(/^[A-Da-d]\s*[.、．):：]?\s*/, '');
        h += '<button class="opt" data-l="' + esc(L) + '"><span class="k">' + esc(L) + '</span><span>' + esc(body) + '</span></button>';
      });
    } else {
      ['A', 'B', 'C', 'D'].forEach(L => {
        h += '<button class="opt" data-l="' + L + '"><span class="k">' + L + '</span><span>' + L + '</span></button>';
      });
    }
    h += '</div></div>';
    wrap.insertAdjacentHTML('beforeend', h);
    paintOpts();

    const revealed = isRevealed();
    if (revealed) {
      if (Q.mode === MODE_VIEW || (rec && rec.peek)) {
        wrap.insertAdjacentHTML('beforeend', ansBlock(Q.ans, q[3]));
      } else {
        wrap.insertAdjacentHTML('beforeend', resBlock(!!rec.ok, Q.ans, rec.mine || '', q[3]));
      }
      attachActions();
      return;
    }

    setActionBar(
      '<button class="btn-ghost" id="btn-peek">看答案</button>' +
      '<button class="btn-primary" id="btn-submit" disabled>提交</button>',
      barRoot => {
        $('#btn-peek', barRoot).onclick = () => {
          Q.done[qid(it)] = { ok: 0, mine: '', peek: 1 };
          haptic();
          renderQ();
        };
        $('#btn-submit', barRoot).onclick = () => {
          const mine = Array.from(Q.sel).sort().join('');
          if (!mine) return toast('请先选择答案');
          submitAnswer(it, mine, mine === Q.ans, Q.ans);
        };
      }
    );
  }

  function renderBig(wrap, it, q, rec) {
    const hints = (q[3] || [])
      .map(h => (h && h[1] ? (h[0] ? h[0] + '　' : '') + h[1] : ''))
      .filter(Boolean);
    const hintHtml = hints.length ? hints.join('\n') : '先列出已知条件，按章节思路逐步推演。';
    const ansText = q[2] || '（教材无文字解答）';

    if (isRevealed()) {
      wrap.insertAdjacentHTML('beforeend',
        '<div class="bigq-hint"><b>思路引导</b>' + esc(hintHtml) + '</div>' +
        '<div class="answer-box">' + esc(ansText) + '</div>' +
        (q[5] ? '<img class="qfig" src="' + esc(q[5]) + '" alt="解答图" loading="lazy">' : '') +
        (Q.mode === MODE_VIEW ? '' : resBlock(!!rec.ok, '自评', rec.ok ? '做对了' : '做错了', '')));
      attachActions();
      return;
    }

    wrap.insertAdjacentHTML('beforeend',
      '<div class="bigq-hint hidden" id="hintbox"><b>思路引导</b>' + esc(hintHtml) + '</div>' +
      '<div class="answer-box hidden" id="ansbox">' + esc(ansText) + '</div>' +
      (q[5] ? '<img class="qfig hidden" id="ansimg" src="' + esc(q[5]) + '" alt="解答图" loading="lazy">' : ''));

    setActionBar(
      '<button class="btn-ghost" id="btn-hint">思路提示</button>' +
      '<button class="btn-primary" id="btn-ans">显示解答</button>',
      barRoot => {
        $('#btn-hint', barRoot).onclick = () => {
          haptic();
          const box = $('#hintbox');
          if (box) box.classList.remove('hidden');
          $('#btn-hint', barRoot).classList.add('on');
        };
        $('#btn-ans', barRoot).onclick = () => {
          haptic();
          const hint = $('#hintbox'), ans = $('#ansbox'), ai = $('#ansimg');
          if (hint) hint.classList.remove('hidden');
          if (ans) ans.classList.remove('hidden');
          if (ai) ai.classList.remove('hidden');
          setActionBar(
            '<button class="btn-ghost" id="btn-wrong">我做错了</button>' +
            '<button class="btn-primary" id="btn-right">我做对了</button>',
            b2 => {
              $('#btn-wrong', b2).onclick = () => markBig(it, false);
              $('#btn-right', b2).onclick = () => markBig(it, true);
            }
          );
        };
      }
    );
  }

  function attachActions() {
    setActionBar(
      '<button class="btn-ghost" id="btn-prev"' + (Q.i === 0 ? ' disabled' : '') + '>上一题</button>' +
      '<button class="btn-primary" id="btn-next">' + (Q.i === Q.items.length - 1 ? '完成' : '下一题') + '</button>',
      barRoot => {
        $('#btn-prev', barRoot).onclick = () => { if (Q.i > 0) { Q.i--; renderQ(); } };
        $('#btn-next', barRoot).onclick = () => {
          if (Q.i < Q.items.length - 1) { Q.i++; renderQ(); }
          else finishQuiz();
        };
      }
    );
  }

  function ansBlock(ans, expl) {
    return '<div class="res" style="background:var(--acc-soft);margin-bottom:8px">' +
      '<div class="res-t" style="color:var(--acc)">正确答案：' + esc(ans) + '</div>' +
      '<div class="res-expl">' + esc(expl || '（教材无文字解析）') + '</div></div>';
  }
  function resBlock(ok, ans, mine, expl) {
    return '<div class="res ' + (ok ? 'ok' : 'bad') + '" style="margin-bottom:8px">' +
      '<div class="res-t">' + (ok ? '✓ 回答正确' : '✕ 回答错误') + '</div>' +
      '<div class="res-ans">正确答案：<b>' + esc(ans) + '</b>' +
      (!ok && mine ? '　你的答案：' + esc(mine) : '') + '</div>' +
      (expl ? '<div class="res-expl">' + esc(expl) + '</div>' : '') + '</div>';
  }

  function submitAnswer(it, mine, ok, ans) {
    Q.done[qid(it)] = { ok: ok ? 1 : 0, mine: mine };
    posSet(it.s, it.c, it.k, it.n, ok, mine);
    if (ok) { if (wrongRemove(it)) toast('答对了，已移出错题本'); }
    else wrongAdd(it, mine, ans);
    haptic();
    renderQ();
  }
  function markBig(it, ok) {
    Q.done[qid(it)] = { ok: ok ? 1 : 0, mine: ok ? '做对' : '做错' };
    posSet(it.s, it.c, it.k, it.n, ok, ok ? '做对' : '做错');
    if (ok) { if (wrongRemove(it)) toast('已移出错题本'); }
    else { wrongAdd(it, '做错', '（自评做错）'); toast('已加入错题本'); }
    haptic();
    renderQ();
  }

  function finishQuiz() {
    recordStudyTime();
    const items = Q.items;
    let ok = 0, bad = 0, skipped = 0;
    items.forEach(it => {
      const r = Q.done[qid(it)];
      if (!r) { skipped++; return; }
      if (r.ok) ok++; else bad++;
    });
    const total = items.length;
    openSheet('本轮完成', [], null, body => {
      body.innerHTML = '<div style="padding:2px 18px 18px">' +
        '<div class="stat-grid" style="margin-bottom:16px">' +
        '<div class="stat-cell"><b>' + total + '</b><span>题量</span></div>' +
        '<div class="stat-cell ok"><b>' + ok + '</b><span>答对</span></div>' +
        '<div class="stat-cell bad"><b>' + bad + '</b><span>答错</span></div></div>' +
        (skipped ? '<div style="font-size:12.5px;color:var(--ink3);text-align:center;margin-bottom:14px">未作答 ' + skipped + ' 题</div>' : '') +
        '<div class="btn-row" style="margin-top:0"><button class="btn-ghost" id="f-back">返回</button>' +
        '<button class="btn-primary" id="f-again">再来一次</button></div></div>';
      $('#f-back').onclick = () => { closeSheet(); setTimeout(() => back(), 260); };
      $('#f-again').onclick = () => {
        closeSheet();
        setTimeout(() => {
          if (Q.ctx.all) {
            const fresh = buildAllShuffleItems(Q.ctx.k || 'x');
            const same = fresh.length > 1 && fresh.every((x, idx) => qid(x) === qid(Q.items[idx]));
            Q.items = same ? shuffle(fresh) : fresh;
          } else if (Q.ctx.shuffle) {
            const fresh = buildShuffleItems(Q.ctx.s, Q.ctx.k);
            const same = fresh.length > 1 && fresh.every((x, idx) => qid(x) === qid(Q.items[idx]));
            Q.items = same ? shuffle(fresh) : fresh;
          }
          Q.i = 0;
          Q.done = {};
          Q.sel = new Set();
          renderQ();
        }, 120);
      };
    });
  }

  /* ---------- 收藏交互 ---------- */
  function starTap(it) {
    haptic();
    openFavSheet(it);
  }
  function openFavSheet(it) {
    const selected = favFoldersOf(it);
    openSheet('收藏到', [], null, body => {
      let h = '<div class="sheet-body">';
      favFolders().forEach(f => {
        const on = selected.indexOf(f.id) >= 0;
        h += '<button class="sheet-opt" data-f="' + f.id + '">' +
          '<span class="ti">' + esc(f.name) + '<span class="desc">' + favTotal(f.id) + ' 道题</span></span>' +
          '<span class="' + (on ? 'sw on' : 'sw') + '" style="pointer-events:none"></span></button>';
      });
      h += '<div class="sheet-sep"></div>' +
        '<button class="sheet-opt" data-new="1"><span class="ti" style="color:var(--acc)">＋ 新建收藏夹</span></button></div>';
      body.innerHTML = h;
      delegate(body, 'click', '[data-f]', (e, el) => {
        favToggleFolder(it, el.dataset.f);
        haptic();
        openFavSheet(it);
        updateStar();
      });
      delegate(body, 'click', '[data-new]', () => {
        askName('新建收藏夹', '', name => {
          const id = favNewFolder(name);
          favToggleFolder(it, id);
          toast('已创建并收藏');
          openFavSheet(it);
          updateStar();
        });
      });
    });
  }

  /* ---------- 收藏页 ---------- */
  let favFilter = null;
  let suppressFavChipClick = false;

  function favChipsInnerHtml() {
    let html = '<button class="chip ' + (favFilter === null ? 'on' : '') + '" data-fd="__all">全部<span class="n">' + favTotal() + '</span></button>';
    favFolders().forEach(f => {
      html += '<button class="chip ' + (favFilter === f.id ? 'on' : '') + '" data-fd="' + esc(f.id) + '">' +
        esc(f.name) + '<span class="n">' + favTotal(f.id) + '</span></button>';
    });
    return html;
  }
  function favChipsHtml() {
    return '<div class="sec-title">收藏夹 <button class="more" id="fav-new-folder">＋ 新建收藏夹</button></div>' +
      '<div class="chips" id="favchips">' + favChipsInnerHtml() + '</div>';
  }

  /** 按当前筛选重算收藏题目列表（每次都实时读 store，避免闭包缓存） */
  async function favBodyData() {
    const items = store.fav.items;
    const ids = Object.keys(items).filter(k => favFilter === null ? items[k].length : items[k].indexOf(favFilter) >= 0);
    const raw = ids.map(parseQid);
    if (!raw.length) return { list: [] };
    await ensureData(raw.map(x => x.s));
    return { list: raw.filter(it => getQCached(it)) };
  }

  function favBodyHtml(data) {
    const list = data.list;
    if (!list.length) {
      return '<div class="empty"><div class="ico">★</div>' +
        (favTotal() === 0 ? '还没有收藏题目<br>刷题时点右上角 ★ 即可收藏' : '这个收藏夹还是空的') + '</div>';
    }
    let html = '<div class="sec-title">共 ' + list.length + ' 题' +
      (favFilter !== null && favFilter !== 'default' ? '<button class="more" id="fd-del">删除此夹</button>' : '') + '</div>' +
      '<div class="quick" style="margin-bottom:14px">' +
      '<button class="qbtn" id="fav-start"><span class="qbtn-ico sh">⇄</span>' +
      '<span class="qbtn-tx"><b>乱序刷收藏</b><i>打乱顺序 · ' + list.length + ' 题</i></span></button>' +
      '<button class="qbtn" id="fav-order"><span class="qbtn-ico rw" style="background:var(--acc-soft);color:var(--acc)">≡</span>' +
      '<span class="qbtn-tx"><b>按顺序刷</b><i>保持收藏顺序 · ' + list.length + ' 题</i></span></button></div>' +
      '<div class="list">';
    list.forEach(it => {
      const q = getQCached(it);
      const st = posGet(it.s, it.c, it.k, it.n);
      const t = it.k === 'b' ? q[1] : q[2];
      html += '<button class="li" data-q="' + esc(qid(it)) + '">' +
        '<span class="dot ' + (st ? (st.ok ? 'ok' : 'bad') : '') + '"></span>' +
        '<span class="li-main"><span class="li-t">' + esc(String(t).slice(0, 60)) + '</span>' +
        '<span class="li-s">' + esc(subjShort(it.s)) + ' · ' + esc(it.c) + ' · ' + kindName(it.k) + ' · 第' + it.n + '题</span></span>' +
        '<span class="li-r"><i class="chev"></i></span></button>';
    });
    return html + '</div>';
  }

  /** 只重绘 #fbody；chips 节点、横向滚动位置与页面滚动位置全部保持不变 */
  async function refreshFavBody() {
    const data = await favBodyData();
    const box = $('#fbody');
    if (box) box.innerHTML = favBodyHtml(data);
  }

  /** 收藏夹数量变化（新建/删除）时才重建 chips 内部，但保留 scrollLeft */
  function refreshFavChips() {
    const chips = $('#favchips');
    if (!chips) return;
    const left = chips.scrollLeft;
    chips.innerHTML = favChipsInnerHtml();
    chips.scrollLeft = left;
  }

  function confirmDeleteFolder(id) {
    if (!id || id === 'default') return;
    confirmSheet('删除收藏夹「' + folderName(id) + '」？夹内题目可重新收藏。', () => {
      favDelFolder(id);
      if (favFilter === id) favFilter = null;
      // 只更新 chips 与列表两块，不重建整页
      refreshFavChips();
      refreshFavBody();
      toast('收藏夹已删除');
    }, true);
  }

  function bindFavChips(box) {
    if (!box) return;
    delegate(box, 'click', '[data-fd]', (e, el) => {
      if (suppressFavChipClick) { suppressFavChipClick = false; return; }
      const v = el.dataset.fd;
      const next = v === '__all' ? null : v;
      if (next === favFilter) return;
      favFilter = next;
      // 只切换 chip 高亮，不重建容器 → 横向拖动位置保留
      $$('[data-fd]', box).forEach(b => b.classList.toggle('on', b.dataset.fd === v));
      refreshFavBody();
    });

    // 收藏夹长按可删除（默认夹与「全部」不可删）
    let timer = null, startX = 0, startY = 0;
    const clear = () => { clearTimeout(timer); timer = null; };
    box.addEventListener('touchstart', e => {
      const chip = closestEl(e.target, '[data-fd]');
      if (!chip || !e.touches.length) return;
      const id = chip.dataset.fd;
      if (id === '__all' || id === 'default') return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      timer = setTimeout(() => {
        timer = null;
        suppressFavChipClick = true;
        haptic();
        confirmDeleteFolder(id);
      }, 550);
    }, { passive: true });
    box.addEventListener('touchmove', e => {
      if (!timer || !e.touches.length) return;
      if (Math.abs(e.touches[0].clientX - startX) > 8 || Math.abs(e.touches[0].clientY - startY) > 8) clear();
    }, { passive: true });
    box.addEventListener('touchend', clear);
    box.addEventListener('touchcancel', clear);
    box.addEventListener('contextmenu', e => {
      const chip = closestEl(e.target, '[data-fd]');
      if (!chip || chip.dataset.fd === '__all' || chip.dataset.fd === 'default') return;
      e.preventDefault();
      suppressFavChipClick = true;
      confirmDeleteFolder(chip.dataset.fd);
    });
  }

  VIEWS.fav = async function (page) {
    const data = await favBodyData();
    // chips 与列表分离：chips 常驻，列表放进 #fbody 单独更新
    page.innerHTML = favChipsHtml() + '<div id="fbody">' + favBodyHtml(data) + '</div>';

    // 委托到常驻 page 节点；筛选会重绘 #fbody，回调内实时重算数据
    bindFavChips($('#favchips', page));
    delegate(page, 'click', '#fav-new-folder', () => {
      askName('新建收藏夹', '', name => {
        favNewFolder(name);
        refreshFavChips();
        refreshFavBody();
        toast('收藏夹已创建');
      });
    });
    delegate(page, 'click', '#fd-del', () => confirmDeleteFolder(favFilter));
    delegate(page, 'click', '#fav-start', async () => {
      const cur = await favBodyData();
      const arr = cur.list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      chooseMode('', '', '', arr.length, mode => startQuiz(shuffle(arr), mode, { fav: true, shuffle: true }), '乱序刷收藏');
    });
    delegate(page, 'click', '#fav-order', async () => {
      const cur = await favBodyData();
      const arr = cur.list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      chooseMode('', '', '', arr.length, mode => startQuiz(arr, mode, { fav: true }), '刷收藏');
    });
    delegate(page, 'click', '[data-q]', async (e, el) => {
      const cur = await favBodyData();
      const arr = cur.list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      const idx = arr.findIndex(x => qid(x) === el.dataset.q);
      startQuiz(arr, MODE_VIEW, { fav: true });
      Q.i = Math.max(0, idx);
    });
  };

  /* ---------- 资料库 ---------- */
  const LIBRARY = [
    ['2009–2026 计算机408统考真题', 'https://pan.quark.cn/s/f127962f318c'],
    ['2027 王道 8 套卷＋解析', 'https://pan.quark.cn/s/61d432b7806f'],
    ['26 王道计算机408真题分类做题本', 'https://pan.quark.cn/s/8b2d2ba1007c'],
    ['26 王道计算机408《高分笔记》', 'https://pan.quark.cn/s/689b51ba61bf'],
    ['操作系统基础考点讲解', 'https://pan.quark.cn/s/f51a25e314c6'],
    ['计算机网络基础考点讲解', 'https://pan.quark.cn/s/3490eeeefbe4'],
    ['数据结构基础考点讲解', 'https://pan.quark.cn/s/232068c0d92a'],
    ['组成原理基础考点讲解', 'https://pan.quark.cn/s/b1c6047ef3f0'],
    ['27 王道课后习题做题本', 'https://pan.quark.cn/s/8bc1c262534b']
  ];
  VIEWS.library = async function (page) {
    page.innerHTML = '<div class="hero"><h2>资料库</h2>' +
      '<p>整理的 408 学习资料，点击后使用夸克网盘打开</p></div>' +
      '<div class="list">' + LIBRARY.map((x, i) =>
        '<button class="li" data-lib="' + i + '"><span class="li-num">↗</span>' +
        '<span class="li-main"><span class="li-t">' + esc(x[0]) + '</span>' +
        '<span class="li-s">夸克网盘 · 学习资料</span></span>' +
        '<span class="li-r"><i class="chev"></i></span></button>').join('') + '</div>' +
      '<p class="li-s" style="padding:12px">资料仅供学习交流，请尊重版权，不要二次贩卖。</p>';
    delegate(page, 'click', '[data-lib]', (e, el) => {
      const url = LIBRARY[Number(el.dataset.lib)][1];
      const openLink = () => {
        try {
          if (window.AndroidBridge && AndroidBridge.openUrl) AndroidBridge.openUrl(url);
          else location.href = url;
        } catch (err) { toast('无法打开链接'); }
      };
      let agreed = false;
      try { agreed = localStorage.getItem(LS.library) === '1'; } catch (err) { /* 忽略 */ }
      if (agreed) return openLink();
      confirmSheet('资料仅限个人学习交流，请遵守版权要求，禁止二次贩卖。是否继续？', () => {
        try { localStorage.setItem(LS.library, '1'); } catch (err) { /* 忽略 */ }
        openLink();
      });
    });
  };

  /* ---------- 学习时间日历 ---------- */
  VIEWS.study = async function (page) {
    const data = read(LS.study, {});
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const first = new Date(year, month, 1).getDay();
    const days = new Date(year, month + 1, 0).getDate();
    let h = '<div class="hero"><h2>学习时间</h2><p>' + year + '年 ' + (month + 1) + '月 · 每天持续一点点</p></div>' +
      '<div class="calendar">' + ['日', '一', '二', '三', '四', '五', '六'].map(x => '<b>' + x + '</b>').join('');
    for (let i = 0; i < first; i++) h += '<i></i>';
    for (let d = 1; d <= days; d++) {
      const key = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      const sec = Object.values(data[key] || {}).reduce((a, x) => a + x, 0);
      h += '<i class="day ' + (sec >= 3600 ? 'deep' : sec > 0 ? 'light' : '') + '">' + d + '</i>';
    }
    h += '</div><div class="legend">□ 未学习　<span>■</span> 已学习　<strong>■</strong> 超过 1 小时</div><div class="list">';
    SUBJECTS.forEach(s => {
      const total = Object.values(data).reduce((a, day) => a + (day[s.id] || 0), 0);
      h += '<div class="li"><span class="li-num">◷</span><span class="li-main">' +
        '<span class="li-t">' + esc(s.name) + '</span><span class="li-s">累计 ' + formatDuration(total) + '</span>' +
        '</span></div>';
    });
    page.innerHTML = h + '</div>';
  };

  /* ---------- 错题 ---------- */
  let wrongFilter = null;

  function wrongChipsHtml(all) {
    let html = '<div class="chips" id="wchips">' +
      '<button class="chip ' + (wrongFilter === null ? 'on' : '') + '" data-ws="__all">全部<span class="n">' + all.length + '</span></button>' +
      SUBJECTS.map(s => '<button class="chip ' + (wrongFilter === s.id ? 'on' : '') + '" data-ws="' + s.id + '">' +
        subjShort(s.id) + '<span class="n">' + all.filter(x => x.s === s.id).length + '</span></button>').join('') + '</div>';
    return html;
  }

  /** 按当前筛选重算列表数据（每次点击都实时读取，避免闭包缓存旧列表） */
  async function wrongBodyData() {
    const all = store.wrong.slice().sort((a, b) => b.ts - a.ts);
    const list = wrongFilter ? all.filter(x => x.s === wrongFilter) : all;
    if (!list.length) return { list: [], groups: {} };
    await ensureData(list.map(x => x.s));
    const L = list.filter(x => getQCached(x));
    const groups = {};
    L.forEach(x => {
      const k = x.s + '|' + x.c + '|' + x.k;
      (groups[k] = groups[k] || []).push(x);
    });
    return { list: L, groups: groups };
  }

  function wrongBodyHtml(data) {
    const L = data.list;
    if (!L.length) {
      return '<div class="empty"><div class="ico">✕</div>太棒了，这里空空如也<br>做题时答错的题目会自动收进来</div>';
    }
    let html = '<div class="quick" style="margin-bottom:14px">' +
      '<button class="qbtn" id="w-shuffle"><span class="qbtn-ico sh">⇄</span>' +
      '<span class="qbtn-tx"><b>乱序重刷错题</b><i>全部打乱 · ' + L.length + ' 题</i></span></button></div>' +
      '<div class="sec-title">按板块重刷</div><div class="list" style="margin-bottom:14px">';
    Object.keys(data.groups).sort().forEach(k => {
      const arr = data.groups[k];
      const p = k.split('|');
      const sec = secOf(p[0], p[1]);
      html += '<button class="li" data-g="' + esc(k) + '">' +
        '<span class="li-num" style="background:var(--bad-soft);color:var(--bad)">' + arr.length + '</span>' +
        '<span class="li-main"><span class="li-t">' + esc(sec ? sec.title : p[1]) + '</span>' +
        '<span class="li-s">' + esc(subjShort(p[0])) + ' · ' + p[1] + ' · ' + kindName(p[2]) + '</span></span>' +
        '<span class="li-r"><i class="chev"></i></span></button>';
    });
    html += '</div><div class="sec-title">错题明细<span class="more">' + L.length + '</span></div><div class="list">';
    L.forEach(x => {
      const q = getQCached(x);
      const t = x.k === 'b' ? q[1] : q[2];
      html += '<button class="li" data-q="' + esc(x.id) + '">' +
        '<span class="li-main"><span class="li-t">' + esc(String(t).slice(0, 56)) + '</span>' +
        '<span class="li-s">' + esc(subjShort(x.s)) + ' · ' + esc(x.c) + ' · 第' + x.n + '题' +
        (x.cnt > 1 ? ' · 错 ' + x.cnt + ' 次' : '') + '</span></span>' +
        '<span class="li-r"><i class="chev"></i></span></button>';
    });
    return html + '</div>';
  }

  /** 只重绘 #wbody；chips 节点、横向位置与页面纵向滚动位置保持不变。
   *  列表变短时浏览器会把 scrollY 夹到顶端，因此这里显式恢复。 */
  async function refreshWrongBody() {
    const y = window.scrollY;
    const chips = $('#wchips');
    const x = chips ? chips.scrollLeft : 0;
    const data = await wrongBodyData();
    const box = $('#wbody');
    if (box) box.innerHTML = wrongBodyHtml(data);
    if (chips) chips.scrollLeft = x;
    window.scrollTo(0, y);
  }

  function bindWrongChips(box) {
    delegate(box, 'click', '[data-ws]', (e, el) => {
      const next = el.dataset.ws === '__all' ? null : el.dataset.ws;
      if (next === wrongFilter) return;
      wrongFilter = next;
      // 只切换 chip 高亮，不重建 chips 容器 → 横向拖动位置保留
      $$('[data-ws]', box).forEach(b => b.classList.toggle('on', b.dataset.ws === el.dataset.ws));
      refreshWrongBody();
    });
  }

  VIEWS.wrong = async function (page) {
    const all = store.wrong.slice().sort((a, b) => b.ts - a.ts);
    const data = await wrongBodyData();
    // chips 与列表分离：chips 常驻，列表放进 #wbody 单独更新
    page.innerHTML = wrongChipsHtml(all) + '<div id="wbody">' + wrongBodyHtml(data) + '</div>';

    bindWrongChips($('#wchips', page));
    // 列表内的交互统一委托到常驻的 page 节点；筛选会重绘 #wbody，
    // 因此每个回调都实时重算数据，不能使用上面那个初始 data 的闭包。
    delegate(page, 'click', '#w-shuffle', async () => {
      const curData = await wrongBodyData();
      haptic();
      const arr = shuffle(curData.list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n })));
      chooseMode('', '', '', arr.length, mode => startQuiz(arr, mode, { wrong: true, shuffle: true }), '乱序重刷错题');
    });
    delegate(page, 'click', '[data-g]', async (e, el) => {
      const curData = await wrongBodyData();
      const arr = (curData.groups[el.dataset.g] || []).map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      if (!arr.length) return;
      chooseMode('', '', '', arr.length, mode => startQuiz(arr, mode, { wrong: true }), '重刷本题组');
    });
    delegate(page, 'click', '[data-q]', async (e, el) => {
      const curData = await wrongBodyData();
      const arr = curData.list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      const idx = arr.findIndex(x => qid(x) === el.dataset.q);
      startQuiz(arr, MODE_VIEW, { wrong: true });
      Q.i = Math.max(0, idx);
    });
  };

  /* ---------- 我的 ---------- */
  VIEWS.me = async function (page) {
    await ensureData(SUBJECTS.map(s => s.id));
    const st = store.set;
    let tot = 0, done = 0, ok = 0;
    SUBJECTS.forEach(s => { const x = subjStat(s.id); tot += x.tot; done += x.done; ok += x.ok; });
    const rate = done ? Math.round(ok / done * 100) : 0;
    const studyData = read(LS.study, {});
    const studyTotal = Object.values(studyData).reduce((sum, day) => sum + Object.values(day).reduce((a, x) => a + x, 0), 0);

    let html = '<button class="study-card" id="open-study"><span class="study-copy">' +
      '<b>学习打卡热力图</b><small>记录每科投入 · 累计 ' + formatDuration(studyTotal) + '</small></span>' +
      studyPreview(studyData) + '<span class="study-pi">π</span></button>' +
      '<div class="stat-grid" style="margin-bottom:16px">' +
      '<div class="stat-cell"><b>' + done + '</b><span>已练习</span></div>' +
      '<div class="stat-cell ok"><b>' + rate + '%</b><span>正确率</span></div>' +
      '<div class="stat-cell bad"><b>' + wrongCountBy() + '</b><span>错题</span></div></div>' +
      '<div class="sec-title">我的收藏</div><div class="list">' +
      '<button class="li" id="open-fav"><span class="li-num">★</span>' +
      '<span class="li-main"><span class="li-t">收藏夹</span>' +
      '<span class="li-s">' + favFolders().length + ' 个收藏夹 · ' + favTotal() + ' 道题</span></span>' +
      '<span class="li-r"><i class="chev"></i></span></button></div>' +
      '<div class="sec-title">偏好设置</div><div class="list">' +
      '<div class="li"><span class="li-main"><span class="li-t">主题</span></span>' +
      '<span class="li-r"><button class="btn-sm" id="set-theme">' +
      (st.theme === 'dark' ? '深色' : st.theme === 'light' ? '浅色' : '跟随系统') + '</button></span></div></div>' +
      '<div class="sec-title">数据与关于</div><div class="list">' +
      '<button class="li" id="act-update"><span class="li-main"><span class="li-t">更新说明</span>' +
      '<span class="li-s">V' + APP_VERSION + '</span></span><span class="li-r"><i class="chev"></i></span></button>' +
      '<button class="li" id="act-eula"><span class="li-main"><span class="li-t">使用协议与致谢</span>' +
      '<span class="li-s">开源项目说明</span></span><span class="li-r"><i class="chev"></i></span></button>' +
      '<button class="li" id="act-export"><span class="li-main"><span class="li-t">导出学习数据</span>' +
      '<span class="li-s">选择错题或收藏，复制纯文本</span></span><span class="li-r"><i class="chev"></i></span></button>' +
      '<button class="li" id="act-contact"><span class="li-main"><span class="li-t">联系开发者</span>' +
      '<span class="li-s">GitHub 提 Issue · 小红书 1895737550</span></span><span class="li-r"><i class="chev"></i></span></button>' +
      '<button class="li" id="act-release"><span class="li-main">' +
      '<span class="li-t">检查更新</span>' +
      '<span class="li-s">前往 GitHub 仓库下载最新版</span></span></button>' +
      '<button class="li" id="act-clear"><span class="li-main"><span class="li-t" style="color:var(--bad)">清空所有学习数据</span>' +
      '<span class="li-s">不可恢复</span></span><span class="li-r"><i class="chev"></i></span></button></div>' +
      '<div style="text-align:center;color:var(--ink3);font-size:11.5px;margin:22px 0 6px;line-height:1.9">' +
      '派立方408 · V' + APP_VERSION + '<br>题库来源：王道 2027 考研复习指导<br>' +
      '原 Web 应用作者 zsc5725216-hub · 安卓版 tianshi</div>';
    page.innerHTML = html;

    // 主题切换：只改根属性与按钮文案，不重绘页面
    delegate(page, 'click', '#set-theme', (e, el) => {
      const order = ['auto', 'light', 'dark'];
      const nx = order[(order.indexOf(store.set.theme) + 1) % 3];
      setSetting('theme', nx);
      applyTheme();
      el.textContent = nx === 'dark' ? '深色' : nx === 'light' ? '浅色' : '跟随系统';
    });
    delegate(page, 'click', '#open-fav', () => go('fav', {}));
    delegate(page, 'click', '#open-study', () => go('study', {}));
    delegate(page, 'click', '#act-update', () => openSheet('V' + APP_VERSION + ' 更新说明', [], null, b => {
      b.innerHTML = '<div class="form-pad">V' + APP_VERSION + ' 为问题修复版本：' +
        '答题换题时收藏星标现在跟随当前题目状态；错题本与收藏夹切换筛选改为只局部更新列表，' +
        '筛选栏横向位置与页面滚动位置保持不变；「数据与关于」新增 GitHub 发行版直达入口。' +
        '功能与题库不变。</div>';
    }));
    delegate(page, 'click', '#act-contact', () => openSheet('联系开发者', [], null, b => {
      b.innerHTML = '<div class="form-pad">GitHub：在项目页面提交 Issue<br><br>小红书：1895737550<br><br>相关帖子评论区留言</div>';
    }));
    delegate(page, 'click', '#act-release', () => {
      const url = 'https://github.com/zhangtianshi001/pi-408-quiz/releases';
      try {
        if (window.AndroidBridge && AndroidBridge.openUrl) AndroidBridge.openUrl(url);
        else location.href = url;
      } catch (e) { toast('无法打开链接'); }
    });
    delegate(page, 'click', '#act-eula', () => showEula(false));
    delegate(page, 'click', '#act-export', () => exportData());
    delegate(page, 'click', '#act-clear', () => {
      confirmSheet('确定清空所有学习数据？进度、错题、收藏都会被删除，此操作不可恢复。', () => {
        [LS.pos, LS.wrong, LS.fav, LS.plans, LS.study].forEach(k => {
          try { localStorage.removeItem(k); } catch (err) { /* 忽略 */ }
        });
        favFilter = null;
        wrongFilter = null;
        toast('已清空');
        refresh();
      }, true);
    });
  };

  /* ---------- 导出 ---------- */
  function exportData() {
    openSheet('选择导出内容', [], null, body => {
      body.innerHTML = '<div class="form-pad">' +
        '<label><input type="checkbox" id="ex-wrong" checked> 错题（' + wrongCountBy() + '）</label><br>' +
        '<label><input type="checkbox" id="ex-fav" checked> 收藏（' + favTotal() + '）</label>' +
        '<button class="btn-primary" id="ex-copy" style="width:100%;margin-top:18px">导出并复制纯文本</button></div>';
      $('#ex-copy').onclick = async () => {
        const wantWrong = $('#ex-wrong').checked;
        const wantFav = $('#ex-fav').checked;
        if (!wantWrong && !wantFav) return toast('请至少选择一项');
        await ensureData(SUBJECTS.map(s => s.id));
        let entries = [];
        if (wantWrong) entries = entries.concat(store.wrong);
        if (wantFav) entries = entries.concat(Object.keys(store.fav.items).map(parseQid));
        const seen = {};
        const out = [];
        entries.forEach(it => {
          const id = qid(it);
          if (seen[id]) return;
          seen[id] = 1;
          const q = getQ(it);
          if (!q) return;
          const text = it.k === 'b'
            ? '题目：' + q[1] + '\n参考答案：' + q[2]
            : '题目：' + q[2] + '\n' + (q[4] || []).join('\n') + '\n答案：' + q[1] + '\n解析：' + q[3];
          out.push('【' + subjShort(it.s) + ' ' + it.c + ' 第' + it.n + '题】\n' + text);
        });
        const txt = out.join('\n\n');
        try {
          if (window.AndroidBridge && AndroidBridge.copyText) {
            AndroidBridge.copyText(txt);
            const dest = AndroidBridge.saveText('派立方408-导出.txt', txt);
            closeSheet();
            toast(dest === '保存失败' ? '已复制；文件保存失败' : ('已复制并保存到' + dest));
          } else {
            await navigator.clipboard.writeText(txt);
            closeSheet();
            toast('已复制 ' + out.length + ' 道题，可直接粘贴');
          }
        } catch (e) { toast('导出或复制失败，请重试'); }
      };
    });
  }

  /* ================= 主题 ================= */
  function applyTheme() {
    const t = store.set.theme;
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    let dark = false;
    if (t === 'dark') { root.setAttribute('data-theme', 'dark'); dark = true; }
    else if (t === 'light') root.setAttribute('data-theme', 'light');
    else dark = !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', dark ? '#0f1219' : '#f6f7fb');
    if (window.AndroidBridge && window.AndroidBridge.setTheme) {
      try { window.AndroidBridge.setTheme(dark ? 'dark' : 'light'); } catch (e) { /* 忽略 */ }
    }
  }

  /* ================= Sheet / 对话框 ================= */
  function openSheet(title, opts, onPick, custom) {
    const wrap = $('#sheet');
    const body = $('#sheet-body');
    wrap.classList.remove('hidden', 'out');
    let html = '<div class="sheet-grab"></div>';
    if (title) html += '<div class="sheet-h">' + esc(title) + '</div>';
    body.innerHTML = html + '<div class="sheet-body" id="sbody"></div>';
    const sb = $('#sbody', body);
    if (custom) {
      custom(sb);
    } else {
      sb.innerHTML = opts.map((o, i) =>
        '<button class="sheet-opt" data-i="' + i + '">' +
        '<span class="ti">' + esc(o.t) + (o.d ? '<span class="desc">' + esc(o.d) + '</span>' : '') + '</span>' +
        (o.mark ? '<span style="color:var(--acc);font-weight:700">✓</span>' : '<i class="chev"></i>') + '</button>'
      ).join('');
      delegate(sb, 'click', '[data-i]', (e, el) => {
        const o = opts[Number(el.dataset.i)];
        closeSheet();
        if (onPick) setTimeout(() => onPick(o.v, o), 120);
      });
    }
    $('#sheet .sheet-mask').onclick = closeSheet;
  }
  function closeSheet() {
    const s = $('#sheet');
    if (!s || s.classList.contains('hidden')) return;
    s.classList.add('out');
    setTimeout(() => { s.classList.add('hidden'); s.classList.remove('out'); }, 260);
  }
  function askName(title, dflt, cb) {
    openSheet(title, [], null, body => {
      body.innerHTML = '<div style="padding:4px 18px 16px">' +
        '<input class="inp" id="name-inp" maxlength="14" placeholder="给收藏夹起个名字">' +
        '<div class="btn-row"><button class="btn-ghost" id="nm-cancel">取消</button>' +
        '<button class="btn-primary" id="nm-ok">确定</button></div></div>';
      const inp = $('#name-inp', body);
      inp.value = dflt || '';
      setTimeout(() => inp.focus(), 220);
      $('#nm-cancel', body).onclick = closeSheet;
      $('#nm-ok', body).onclick = () => {
        const v = inp.value.trim();
        if (!v) return toast('请输入名称');
        closeSheet();
        setTimeout(() => cb(v), 120);
      };
    });
  }
  function confirmSheet(msg, onOk, danger) {
    openSheet('', [], null, body => {
      body.innerHTML = '<div class="sheet-grab"></div>' +
        '<div style="padding:4px 20px 18px">' +
        '<div style="font-size:15px;font-weight:650;margin-bottom:8px">请确认</div>' +
        '<div style="font-size:13.5px;color:var(--ink2);line-height:1.8;margin-bottom:18px">' + esc(msg) + '</div>' +
        '<div class="btn-row" style="margin-top:0">' +
        '<button class="btn-ghost" id="cf-no">取消</button>' +
        '<button class="btn-primary" id="cf-yes"' + (danger ? ' style="background:var(--bad)"' : '') + '>确定</button></div></div>';
      $('#cf-no', body).onclick = closeSheet;
      $('#cf-yes', body).onclick = () => { closeSheet(); setTimeout(onOk, 280); };
    });
  }

  /* ================= 协议 ================= */
  const EULA_KEY = LS.eula;
  function eulaHtml() {
    return '' +
      '<p>欢迎使用 <span class="hi">派立方408</span>。</p>' +
      '<p>本应用是一款由个人开发者出于技术练手与学习交流目的开发的完全离线刷题工具。本应用完全免费，无任何商业盈利目的，请勿用于任何商业用途。</p>' +
      '<p><span class="hi">【关于版权与内容来源】</span><br><br>' +
      '1. 题库内容：本应用内整理的题库内容，其著作权及相关知识产权均归原出版方（如王道及原作者）所有。本应用仅作为技术展示，将网络公开的题目以离线形式进行排版整合，仅供个人考研复习交流使用。</p>' +
      '<p>2. 资料库声明（重点）：应用内“资料库”模块展示的网盘链接，均由互联网公开渠道搜集整理。本应用仅提供文档类（如 PDF 笔记、真题文本等）资料的分享，绝对不包含、也坚决不提供任何付费视频课程。开发者不存储、不制作任何音视频文件，所有文档版权均归原权利人所有。</p>' +
      '<p><span class="hi">【非盈利声明与支持正版】</span><br><br>' +
      '1. 本应用开发初衷是为了解决个人备考时刷题的不便，绝不包含任何诱导消费、售卖课程或商业引流。<br><br>' +
      '2. 强烈建议大家购买《王道408》正版实体书及官方正版课程。如果经济条件允许，请务必支持正版，技术工具不能替代大家对正版知识产权的支持。</p>' +
      '<p><span class="hi">【免责与侵权处理（重要）】</span><br><br>' +
      '1. 本应用为纯技术开源项目，代码部分遵循开源协议，欢迎交流学习。<br><br>' +
      '2. 若原作者、出版方（王道团队）或任何版权方认为本应用内的任何内容侵犯了您的合法权益，请通过以下邮箱与我联系：<a href="mailto:2115729051@qq.com">2115729051@qq.com</a>。<br><br>' +
      '3. 开发者承诺：在收到相关权利人的侵权通知后，将在第一时间无条件删除相关代码、题库及所有文档资源链接，并彻底关闭项目仓库。绝不逃避责任，绝不侵犯官方合法权益。</p>' +
      '<p><span class="hi">【使用约束】</span><br><br>' +
      '1. 禁止任何人将本应用（或修改后的版本）用于任何形式的售卖、付费题库、商业引流或倒卖。如发现此类倒卖行为，与原作者无关。<br><br>' +
      '2. 所有学习记录（如错题本）均保存在您的手机本地。因您个人操作（如卸载、清理缓存）导致的数据丢失，开发者不予负责。</p>' +
      '<p>继续使用即表示您已阅读、理解并同意以上约定。祝大家考研顺利，成功上岸！</p>';
  }

  function showEula(first) {
    const el = $('#eula');
    el.classList.remove('hidden');
    const body = $('#eula-body');
    if (!body.innerHTML.trim()) body.innerHTML = eulaHtml();
    const chk = $('#eula-ok');
    const btn = $('#eula-agree');
    let reachedBottom = !first;

    body.scrollTop = 0;
    chk.checked = !first;
    chk.disabled = first;
    btn.disabled = first;
    btn.textContent = first ? '进入软件' : '关闭';

    // 修复：内容不足一屏（大屏 / 超大字体）时无需滚动也应解锁勾选
    const unlock = () => {
      if (!first || reachedBottom) return;
      const fits = body.scrollHeight <= body.clientHeight + 4;
      const scrolled = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
      if (!fits && !scrolled) return;
      reachedBottom = true;
      chk.disabled = false;
      btn.disabled = !chk.checked;
      const hint = $('.eula-hint', el);
      if (hint) hint.style.display = 'none';
    };
    body.onscroll = unlock;
    chk.onchange = () => { btn.disabled = !(reachedBottom && chk.checked); };
    // 等布局稳定后再检测，避免大屏首装被永久锁住
    requestAnimationFrame(() => requestAnimationFrame(unlock));

    btn.onclick = () => {
      if (first && (!reachedBottom || !chk.checked)) return;
      if (first) { try { localStorage.setItem(EULA_KEY, '1'); } catch (e) { /* 忽略 */ } }
      el.style.transition = 'opacity .32s ease';
      el.style.opacity = '0';
      setTimeout(() => {
        el.classList.add('hidden');
        el.style.opacity = '';
        el.style.transition = '';
      }, 320);
    };
  }

  /* ================= 启动 ================= */
  function boot() {
    applyTheme();
    let agreed = false;
    try { agreed = localStorage.getItem(EULA_KEY) === '1'; } catch (e) { /* 忽略 */ }
    startupAt = Date.now();
    if (!agreed) showEula(true);
    initNav();
  }

  function finishStartup() {
    if (startupFinished) return;
    startupFinished = true;
    const elapsed = Date.now() - startupAt;
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = reduced ? 0 : Math.max(0, 520 - elapsed);
    setTimeout(() => {
      const sp = $('#splash');
      if (!sp) return;
      sp.classList.add('out');
      setTimeout(() => sp.remove(), 280);
    }, wait);
  }

  function initNav() {
    $('#hdr-back').onclick = () => back();

    // 星标按钮位于 header（page 之外），全局委托一次
    delegate($('#hdr-right'), 'click', '#btn-star', () => {
      if (Q && cur().v === 'quiz') starTap(Q.items[Q.i]);
    });

    delegate($('#tabbar'), 'click', '.tab', (e, el) => {
      haptic();
      favFilter = null;
      wrongFilter = null;
      nav.stack = [{ v: el.dataset.tab, p: {}, sc: 0 }];
      paint(true);
    });

    window.addEventListener('scroll', () => {
      const h = $('#hdr');
      if (h) h.classList.toggle('scrolled', window.scrollY > 6);
      const st = cur();
      if (st) st.sc = window.scrollY;
    }, { passive: true });

    paint(true);
  }

  /* Android 返回键 */
  window.AppBack = function () {
    const sheetEl = $('#sheet');
    if (sheetEl && !sheetEl.classList.contains('hidden')) { closeSheet(); return true; }
    const el = $('#eula');
    if (el && !el.classList.contains('hidden')) {
      if ($('#eula-agree').textContent === '关闭') $('#eula-agree').click();
      return true;
    }
    return back();
  };
  window.AppResume = function () { /* 预留 */ };

  document.addEventListener('DOMContentLoaded', boot);
})();
