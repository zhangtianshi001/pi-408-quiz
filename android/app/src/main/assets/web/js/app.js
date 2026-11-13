'use strict';
/* 派立方408 — 移动端刷题（全本地数据，无网络请求） */
(function () {
  const SUBJECTS = [
    { id: 'ds', name: '数据结构', short: '数据结构', hue: 235 },
    { id: 'os', name: '操作系统', short: '操作系统', hue: 158 },
    { id: 'co', name: '计算机组成原理', short: '组成原理', hue: 24 },
    { id: 'cn', name: '计算机网络', short: '计算机网络', hue: 278 }
  ];
  const LS = {
    pos: 'p408.pos.v1', wrong: 'p408.wrong.v1', fav: 'p408.fav.v1',
    set: 'p408.set.v1', eula: 'p408.eula.v1', plans: 'p408.plans.v1', study: 'p408.study.v1', library: 'p408.library.eula.v1'
  };
  const MODE_VIEW = 'view', MODE_DO = 'do';

  /* ---------------- 存储 ---------------- */
  function read(k, dflt) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; }
    catch (e) { return dflt; }
  }
  function write(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { toast('存储空间不足，写入失败'); return false; }
  }
  const store = {
    get pos() { return read(LS.pos, {}); },
    set pos(v) { write(LS.pos, v); },
    get wrong() { return read(LS.wrong, []); },
    set wrong(v) { write(LS.wrong, v); },
    get fav() { return read(LS.fav, { folders: [{ id: 'default', name: '默认收藏夹', ts: 0 }], items: {} }); },
    set fav(v) { write(LS.fav, v); },
    get set() { return read(LS.set, { theme: 'auto', font: 'normal', lastMode: MODE_DO }); },
    set set(v) { write(LS.set, v); }
  };
  function setSetting(k, v) { const s = store.set; s[k] = v; store.set = s; }

  /* ---------------- 配图自适应 ----------------
     扫描件里的「一行公式/一带下划线」常是 1400×41 这类极扁图，
     按宽度缩放后会矮到看不清，这里按可读高度缩放并允许横向滑动。 */
  window.__figFit = function (img) {
    if (!img || !img.naturalWidth) return;
    var w = img.naturalWidth, h = img.naturalHeight;
    var ratio = w / h;
    var box = img.parentNode ? img.parentNode.clientWidth - 16 : 320;
    if (ratio > 7) {
      // 极扁：按高度撑到可读，横向滑动
      var targetH = 58;
      var scale = targetH / h;
      var cw = Math.round(w * scale);
      img.style.width = cw + 'px';
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

  /* ---------------- 工具 ---------------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function norm(s) {
    return String(s || '')
      .replace(/[①②③④⑤⑥]/g, c => ({ '①': '1', '②': '2', '③': '3', '④': '4', '⑤': '5', '⑥': '6' }[c]))
      .replace(/[\s、,，。.．·（）()【】\[\]"“”'’]/g, '').toUpperCase();
  }
  function qid(it) { return it.s + '|' + it.c + '|' + it.k + '|' + it.n; }
  function subjName(id) { const s = SUBJECTS.find(x => x.id === id); return s ? s.name : id; }
  function subjShort(id) { const s = SUBJECTS.find(x => x.id === id); return s ? s.short : id; }
  function kindName(k) { return k === 'b' ? '综合应用题' : '选择题'; }
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 1700);
  }
  function haptic() { if (navigator.vibrate) { try { navigator.vibrate(8); } catch (e) {} } }

  /* ---------------- 数据 ---------------- */
  const D = {};        // subj -> {id,name,sections:[{id,title,xzt:[],bigq:[]}]}
  const IDX = {};      // subj -> {sec: {x:{n:q}, b:{n:q}}}
  const loading = {};
  function load(id) {
    if (D[id]) return Promise.resolve(D[id]);
    if (loading[id]) return loading[id];
    loading[id] = fetch('data/' + id + '.json')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => {
        D[id] = d;
        const m = {};
        d.sections.forEach(s => {
          const x = {}, b = {};
          s.xzt.forEach(q => { x[q[0]] = q; });
          s.bigq.forEach(q => { b[q[0]] = q; });
          m[s.id] = { x: x, b: b };
        });
        IDX[id] = m;
        return d;
      })
      .catch(e => { delete loading[id]; throw e; });
    return loading[id];
  }
  function secOf(s, c) {
    const d = D[s]; if (!d) return null;
    return d.sections.find(x => x.id === c) || null;
  }
  function getQ(it) {
    const m = IDX[it.s]; if (!m || !m[it.c]) return null;
    return (it.k === 'b' ? m[it.c].b : m[it.c].x)[it.n] || null;
  }
  function totalOf(subj, kind) {
    const d = D[subj]; if (!d) return 0;
    return d.sections.reduce((a, s) => a + (kind === 'b' ? s.bigq.length : s.xzt.length), 0);
  }
  function secOfKind(dir, kind) { return kind === 'b' ? dir.bigq : dir.xzt; }

  /* ---------------- 进度 ---------------- */
  function posGet(s, c, k, n) {
    const p = store.pos;
    return p[s] && p[s][c] && p[s][c][k] ? p[s][c][k][n] : null;
  }
  function posSet(s, c, k, n, ok, mine) {
    const p = store.pos;
    p[s] = p[s] || {}; p[s][c] = p[s][c] || {}; p[s][c][k] = p[s][c][k] || {};
    const old = p[s][c][k][n];
    p[s][c][k][n] = { ok: ok ? 1 : 0, mine: mine == null ? '' : mine, ts: Date.now(), at: old ? old.at : Date.now() };
    store.pos = p;
  }
  function subjStat(subj) {
    const p = store.pos[subj] || {};
    let done = 0, ok = 0;
    for (const c in p) for (const k in p[c]) for (const n in p[c][k]) { done++; if (p[c][k][n].ok) ok++; }
    return { done: done, ok: ok, tot: totalOf(subj, 'x') + totalOf(subj, 'b'), rate: done ? Math.round(ok / done * 100) : 0 };
  }
  function secStat(subj, sec, kind) {
    const p = (store.pos[subj] || {})[sec] || {};
    const m = p[kind] || {};
    let ok = 0; const n = Object.keys(m).length;
    for (const k in m) if (m[k].ok) ok++;
    return { done: n, ok: ok };
  }

  /* ---------------- 错题 ---------------- */
  function wrongList() { return store.wrong; }
  function wrongAdd(it, mine, right) {
    const list = store.wrong; const id = qid(it);
    const f = list.find(x => x.id === id);
    if (f) { f.cnt = (f.cnt || 1) + 1; f.ts = Date.now(); f.mine = mine; f.right = right; }
    else list.push({ id: id, s: it.s, c: it.c, k: it.k, n: it.n, mine: mine, right: right, ts: Date.now(), cnt: 1 });
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
    const l = store.wrong;
    return subj ? l.filter(x => x.s === subj).length : l.length;
  }

  /* ---------------- 收藏 ---------------- */
  function favFolders() { return store.fav.folders; }
  function favItems() { return store.fav.items; }
  function favFoldersOf(it) { return store.fav.items[qid(it)] || []; }
  function favLinked(it) { return favFoldersOf(it).length > 0; }
  function favTotal(folderId) {
    const items = store.fav.items;
    let n = 0;
    for (const k in items) {
      if (!folderId) { if (items[k].length) n++; }
      else if (items[k].indexOf(folderId) >= 0) n++;
    }
    return n;
  }
  function parseQid(id) {
    const p = id.split('|');
    return { s: p[0], c: p[1], k: p[2], n: Number(p[3]) };
  }
  function favToggleFolder(it, folderId) {
    const fav = store.fav; const id = qid(it);
    const cur = fav.items[id] ? fav.items[id].slice() : [];
    const i = cur.indexOf(folderId);
    if (i >= 0) cur.splice(i, 1); else cur.push(folderId);
    if (cur.length) fav.items[id] = cur; else delete fav.items[id];
    store.fav = fav;
    return cur.length > 0;
  }
  function favAddDefault(it) {
    const fav = store.fav; const id = qid(it);
    const cur = fav.items[id] ? fav.items[id].slice() : [];
    if (cur.indexOf('default') < 0) cur.push('default');
    fav.items[id] = cur; store.fav = fav;
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
    for (const k in fav.items) {
      fav.items[k] = fav.items[k].filter(x => x !== id);
      if (!fav.items[k].length) delete fav.items[k];
    }
    store.fav = fav;
    return true;
  }
  function favRenameFolder(id, name) {
    const fav = store.fav;
    const f = fav.folders.find(x => x.id === id);
    if (!f) return;
    f.name = name; store.fav = fav;
  }

  /* ---------------- 导航 ---------------- */
  const nav = { stack: [{ v: 'home', p: {} }], animating: false };

  function cur() { return nav.stack[nav.stack.length - 1]; }
  function go(v, p, replace) {
    const top = cur();
    if (!replace && top.v === v && JSON.stringify(top.p) === JSON.stringify(p || {})) return;
    if (replace) nav.stack[nav.stack.length - 1] = { v: v, p: p || {}, sc: 0 };
    else nav.stack.push({ v: v, p: p || {}, sc: 0 });
    render(true);
  }
  function back() {
    if (nav.stack.length > 1) { if(cur().v==='quiz') recordStudyTime(); nav.stack.pop(); render(false); return true; }
    return false;
  }
  function goTab(tab) {
    nav.stack = [{ v: tab, p: {} , sc: 0}];
    render(true);
  }

  const TITLES = { home: '派立方408', library: '资料库', fav: '收藏', wrong: '错题', me: '我的' };

  /* ---------------- 渲染 ---------------- */
  function render(forward) {
    const st = cur();
    const app = $('#app');
    const prevScroll = nav.prevScroll || 0;
    app.innerHTML = '<div class="page" id="page"></div>';
    const page = $('#page');
    page.style.animationName = forward === false ? 'pageInBack' : 'pageIn';
    const view = VIEWS[st.v] || VIEWS.home;
    const hdr = $('#hdr');
    const isTabRoot = ['home', 'library', 'wrong', 'me'].indexOf(st.v) >= 0 && nav.stack.length === 1;
    hdr.classList.toggle('sub', !isTabRoot);
    hdr.dataset.view=isTabRoot?st.v:'sub';
    const heading=esc(st.title || TITLES[st.v] || '派立方408');
    const labels={home:'PAI CUBE · 408',library:'STUDY LIBRARY',wrong:'REVIEW NOTES',me:'YOUR STUDY SPACE'};
    const art={
      home:'<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><path d="M12 13h16M15 13l7 15m7-15-7 15"/><circle cx="20" cy="20" r="2" class="fill"/></svg>',
      library:'<svg viewBox="0 0 40 40"><path d="M7 11c5-2 9-1 13 2v19c-4-3-8-4-13-2zM33 11c-5-2-9-1-13 2v19c4-3 8-4 13-2z"/><path d="M11 16c2 0 4 .3 6 1m12-1c-2 0-4 .3-6 1M11 21c2 0 4 .3 6 1m12-1c-2 0-4 .3-6 1"/></svg>',
      wrong:'<svg viewBox="0 0 40 40"><rect x="9" y="8" width="22" height="25" rx="5"/><path d="M15 15h10m-10 6h4m8 0-5 6m0-6 5 6"/></svg>',
      me:'<svg viewBox="0 0 40 40"><circle cx="20" cy="14" r="6"/><path d="M8 32c1-7 5-10 12-10s11 3 12 10"/><path d="m29 8 1.5 3 3.5.5-2.5 2.5.6 3.5-3.1-1.7-3.1 1.7.6-3.5-2.5-2.5 3.5-.5z"/></svg>'
    };
    $('#hdr-title').innerHTML=isTabRoot?'<span class="hdr-art" aria-hidden="true">'+art[st.v]+'</span><span class="hdr-copy"><small>'+labels[st.v]+'</small><strong>'+heading+'</strong></span><span class="hdr-rule"></span>':'<span class="hdr-submark" aria-hidden="true"></span><span class="hdr-copy"><strong>'+heading+'</strong></span>';
    $('#hdr-right').innerHTML = '';
    $('#tabbar').classList.toggle('hide', !isTabRoot);
    app.classList.toggle('no-tab', !isTabRoot);
    $$('#tabbar .tab').forEach(b => b.classList.toggle('on', b.dataset.tab === st.v));
    cleanupFloating();
    Promise.resolve(view(page, st.p, st)).then(() => {
      if (cur() !== st || $('#page') !== page) return;
      if (st.keepScroll) window.scrollTo(0, st.sc || 0);
      else window.scrollTo(0, 0);
      if (st.v === 'home' && nav.stack.length === 1) finishStartup();
    }).catch(e => {
      if (cur() !== st || $('#page') !== page) return;
      page.innerHTML = '<div class="empty"><div class="ico">!</div>题库暂时无法加载<br><button class="btn-primary" id="retry-load" style="margin-top:16px">重试</button></div>';
      const retry = $('#retry-load');
      if (retry) retry.onclick = () => {
        SUBJECTS.forEach(s => { delete loading[s.id]; delete D[s.id]; delete IDX[s.id]; });
        render(false);
      };
      if (st.v === 'home' && nav.stack.length === 1) finishStartup();
    });
  }

  function cleanupFloating() {
    const ab = $('.actionbar'); if (ab) ab.remove();
    const qb = $('#quizbar'); if (qb) qb.remove();
    const app = $('#app'); if (app) app.classList.remove('has-ab');
  }

  /* ---------------- 视图：首页 ---------------- */
  const VIEWS = {};
  VIEWS.home = function (page) {
    return Promise.all(SUBJECTS.map(s => load(s.id))).then(() => {
      let tot = 0, done = 0, ok = 0;
      SUBJECTS.forEach(s => { const st = subjStat(s.id); tot += st.tot; done += st.done; ok += st.ok; });
      const rate = done ? Math.round(ok / done * 100) : 0;
      let html = '<div class="hero">' +
        '<h2>派立方408</h2>' +
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

      const plans = read(LS.plans, []);
      const active = plans.filter(x => !x.done), complete = plans.filter(x => x.done);
      html += '<div class="sec-title">学习计划 <button class="more" id="plan-add">＋ 添加计划</button></div><div class="list" id="plan-list">';
      active.concat(complete).forEach(p => { html += '<div class="li plan-card' + (p.done ? ' completed' : '') + '" draggable="true" data-plan="' + p.id + '"><button class="plan-check" data-check="' + p.id + '">' + (p.done ? '✓' : '') + '</button><span class="li-main"><span class="li-t">' + esc(p.title) + '</span><span class="li-s">' + esc(p.date || '未设日期') + (p.detail ? ' · ' + esc(p.detail) : '') + '</span></span></div>'; });
      if (!plans.length) html += '<div class="empty compact">添加日期与目标，让复习计划更清晰</div>';
      html += '</div>';
      page.innerHTML = html;

      $$('[data-subj]', page).forEach(b => b.onclick = () => { haptic(); go('subject', { subj: b.dataset.subj, kind: 'x' }); });

      const hs = $('#home-shuffle');
      if (hs) hs.onclick = () => {
        haptic();
        const items = buildAllShuffleItems('x');
        if (!items.length) return toast('暂无可练习题目');
        chooseMode('', '', '', items.length, function (mode) {
          startQuiz(items, mode, { shuffle: true, all: true });
        }, '全库乱序刷题');
      };
      $('#plan-add').onclick = addPlan;
      bindPlanInteractions($('#plan-list'));
    });
  };

  function storePlans(v) { write(LS.plans, v); }
  function planActions(p){openSheet('已完成计划', [{t:'恢复计划',v:'restore'},{t:'删除计划',v:'delete'}], v => { const list=read(LS.plans,[]);if(v==='delete')storePlans(list.filter(x=>x.id!==p.id));else{const x=list.find(y=>y.id===p.id);if(x)x.done=false;storePlans(list);}refreshPlanList(true); });}
  function planCard(p){return '<div class="li plan-card'+(p.done?' completed':'')+'" draggable="true" data-plan="'+esc(p.id)+'"><button class="plan-check" data-check="'+esc(p.id)+'" aria-label="完成计划">'+(p.done?'✓':'')+'</button><span class="li-main"><span class="li-t">'+esc(p.title)+'</span><span class="li-s">'+esc(p.date||'未设日期')+(p.detail?' · '+esc(p.detail):'')+'</span></span><span class="plan-grip" aria-hidden="true">⠿</span></div>';}
  function refreshPlanList(animate){const box=$('#plan-list');if(!box)return;const plans=read(LS.plans,[]),ordered=plans.filter(x=>!x.done).concat(plans.filter(x=>x.done));box.innerHTML=ordered.length?ordered.map(planCard).join(''):'<div class="empty compact">添加日期与目标，让复习计划更清晰</div>';if(animate)$$('.plan-card',box).forEach((el,i)=>{el.style.animationDelay=Math.min(i*24,180)+'ms';el.classList.add('plan-enter')});}
  function bindPlanInteractions(box){if(!box)return;let hold=null,drag=null,placeholder=null,offset=0,startY=0;
    box.addEventListener('dragstart',e=>{const card=e.target.closest('[data-plan]');if(!card)return;drag=card;e.dataTransfer.setData('text/plain',card.dataset.plan);e.dataTransfer.effectAllowed='move';});
    box.addEventListener('dragover',e=>{e.preventDefault();const target=e.target.closest('[data-plan]');if(!drag||!target||target===drag)return;const plans=read(LS.plans,[]),a=plans.find(x=>x.id===drag.dataset.plan),b=plans.find(x=>x.id===target.dataset.plan);if(!a||!b||a.done!==b.done)return;const r=target.getBoundingClientRect();animatePlanLayout(box,()=>box.insertBefore(drag,e.clientY<r.top+r.height/2?target:target.nextSibling));});
    box.addEventListener('drop',e=>{e.preventDefault();if(!drag)return;const ids=Array.from(box.querySelectorAll('[data-plan]')).map(x=>x.dataset.plan),list=read(LS.plans,[]),map={};list.forEach(x=>map[x.id]=x);storePlans(ids.map(id=>map[id]).filter(Boolean));drag=null;});
    box.addEventListener('dragend',()=>{if(drag){const ids=Array.from(box.querySelectorAll('[data-plan]')).map(x=>x.dataset.plan),list=read(LS.plans,[]),map={};list.forEach(x=>map[x.id]=x);storePlans(ids.map(id=>map[id]).filter(Boolean));}drag=null;});
    box.addEventListener('click',e=>{const check=e.target.closest('[data-check]');const card=e.target.closest('[data-plan]');if(!card)return;const plans=read(LS.plans,[]),p=plans.find(x=>x.id===card.dataset.plan);if(!p)return;if(check){if(p.done){planActions(p);return;}p.done=true;storePlans(plans);refreshPlanList(true);return;}if(p.done)planActions(p);});
    box.addEventListener('touchstart',e=>{const card=e.target.closest('[data-plan]');if(!card||e.target.closest('button'))return;const t=e.touches[0];startY=t.clientY;hold=setTimeout(()=>{drag=card;const r=card.getBoundingClientRect();offset=startY-r.top;placeholder=document.createElement('div');placeholder.className='plan-placeholder';placeholder.style.height=r.height+'px';card.parentNode.insertBefore(placeholder,card.nextSibling);card.classList.add('dragging');card.style.position='fixed';card.style.left=r.left+'px';card.style.top=r.top+'px';card.style.width=r.width+'px';card.style.zIndex='90';card.style.pointerEvents='none';haptic();},360);},{passive:true});
    box.addEventListener('touchmove',e=>{if(!drag)return;e.preventDefault();const t=e.touches[0];drag.style.top=(t.clientY-offset)+'px';const under=document.elementFromPoint(t.clientX,t.clientY),target=under&&under.closest('[data-plan]');if(target&&target!==drag&&target.parentNode===box){const d=read(LS.plans,[]),a=d.find(x=>x.id===drag.dataset.plan),b=d.find(x=>x.id===target.dataset.plan);if(a&&b&&a.done===b.done){const r=target.getBoundingClientRect(),before=t.clientY<r.top+r.height/2?target:target.nextSibling;if(before!==placeholder&&before!==drag)animatePlanLayout(box,()=>box.insertBefore(placeholder,before));}}},{passive:false});
    box.addEventListener('touchend',()=>{clearTimeout(hold);if(!drag)return;animatePlanLayout(box,()=>{box.insertBefore(drag,placeholder);placeholder.remove();});drag.removeAttribute('style');drag.classList.remove('dragging');const list=Array.from(box.querySelectorAll('[data-plan]')).map(el=>el.dataset.plan),old=read(LS.plans,[]),map={};old.forEach(p=>map[p.id]=p);storePlans(list.map(id=>map[id]).filter(Boolean));drag=null;placeholder=null;});
    box.addEventListener('touchcancel',()=>{clearTimeout(hold);if(drag){placeholder.remove();drag.removeAttribute('style');drag.classList.remove('dragging');drag=null;refreshPlanList(false);}});
  }
  function animatePlanLayout(box,mutate){const nodes=Array.from(box.querySelectorAll('.plan-card:not(.dragging)')),first=new Map(nodes.map(x=>[x,x.getBoundingClientRect().top]));mutate();nodes.forEach(el=>{const delta=first.get(el)-el.getBoundingClientRect().top;if(!delta)return;el.style.transition='none';el.style.transform='translateY('+delta+'px)';requestAnimationFrame(()=>{el.style.transition='transform 220ms cubic-bezier(.22,.61,.36,1)';el.style.transform='';});});}
  function addPlan() {
    openSheet('添加学习计划', [], null, body => {
      body.innerHTML='<div class="form-pad"><input class="inp" id="pl-title" placeholder="计划题目 / 目标" maxlength="60"><div class="date-field"><span class="date-placeholder">选择计划日期</span><input class="inp date-inp" id="pl-date" type="date" aria-label="选择计划日期"></div><textarea class="inp" id="pl-detail" placeholder="细则（选填）" maxlength="140"></textarea><button class="btn-primary" id="pl-save">保存计划</button></div>';
      const dateField=$('.date-field',body),dateInput=$('#pl-date',body);
      dateInput.addEventListener('change',()=>dateField.classList.toggle('has-value',!!dateInput.value));
      $('#pl-save').onclick=()=>{const title=$('#pl-title').value.trim();if(!title)return toast('请填写计划题目');const list=read(LS.plans,[]);list.push({id:Date.now().toString(36),title,date:$('#pl-date').value,detail:$('#pl-detail').value.trim(),done:false});storePlans(list);closeSheet();refreshPlanList(true);};
    });
  }

  /* ---------------- 视图：科目 ---------------- */
  VIEWS.subject = function (page, p) {
    const subj = p.subj;
    const kind = p.kind || 'x';
    const meta = SUBJECTS.find(s => s.id === subj);
    return load(subj).then(d => {
      cur().title = meta.short;
      $('#hdr-title').textContent = meta.short;
      const st = subjStat(subj);
      let html = '';
      // 题型切换
      const nX = totalOf(subj, 'x'), nB = totalOf(subj, 'b');
      html += '<div class="chips" style="margin-bottom:14px">' +
        '<button class="chip ' + (kind === 'x' ? 'on' : '') + '" data-kind="x">选择题<span class="n">' + nX + '</span></button>' +
        '<button class="chip ' + (kind === 'b' ? 'on' : '') + '" data-kind="b">综合应用题<span class="n">' + nB + '</span></button>' +
        '</div>';
      html += '<div class="stat-grid" style="margin-bottom:16px">' +
        '<div class="stat-cell"><b>' + st.done + '</b><span>已练习</span></div>' +
        '<div class="stat-cell ok"><b>' + st.rate + '%</b><span>正确率</span></div>' +
        '<div class="stat-cell bad"><b>' + wrongCountBy(subj) + '</b><span>本科错题</span></div>' +
        '</div>';

      const wCount = wrongCountBy(subj);
      const allN = kind === 'x' ? nX : nB;

      // 快捷练习：乱序 / 错题重刷
      html += '<div class="sec-title">练习模式</div><div class="quick">';
      html += '<button class="qbtn" id="go-shuffle">' +
        '<span class="qbtn-ico sh">⇄</span>' +
        '<span class="qbtn-tx"><b>乱序刷题</b><i>全部章节随机混合 · ' + allN + ' 题</i></span>' +
        '</button>';
      html += '<button class="qbtn" id="re-wrong"' + (wCount ? '' : ' disabled') + '>' +
        '<span class="qbtn-ico rw">✕</span>' +
        '<span class="qbtn-tx"><b>错题重刷</b><i>' +
        (wCount ? '本科错题 ' + wCount + ' 道' : '暂无错题，先刷几轮吧') + '</i></span>' +
        '</button>';
      html += '</div>';

      html += '<div class="sec-title">章节<span class="more">' + (kind === 'x' ? '选择题' : '综合应用题') + '</span></div>';
      html += '<div class="list">';
      d.sections.forEach((sec, i) => {
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
      html += '</div>';
      page.innerHTML = html;

      $$('[data-kind]', page).forEach(b => b.onclick = () => go('subject', { subj: subj, kind: b.dataset.kind }, true));
      $$('[data-sec]', page).forEach(b => b.onclick = () => {
        haptic();
        const secId = b.dataset.sec;
        const sec = d.sections.find(x => x.id === secId);
        const arr = secOfKind(sec, kind);
        chooseMode(subj, secId, kind, arr.length, function (mode) {
          startQuiz(buildItems(subj, secId, kind), mode, { s: subj, c: secId, k: kind });
        });
      });
      const sh = $('#go-shuffle');
      if (sh) sh.onclick = () => {
        haptic();
        const items = buildShuffleItems(subj, kind);
        if (!items.length) return toast('本科暂无可练习题目');
        chooseMode(subj, '', kind, items.length, function (mode) {
          startQuiz(items, mode, { shuffle: true, s: subj, k: kind });
        }, '乱序刷题');
      };

      const rw = $('#re-wrong'); if (rw) rw.onclick = () => {
        haptic();
        const items = store.wrong.filter(x => x.s === subj).map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
        if (!items.length) return toast('本科暂无错题');
        chooseMode(subj, '', 'x', items.length, function (mode) {
          startQuiz(items, mode, { wrong: true, s: subj });
        }, '错题重刷');
      };
    });
  };

  /* ---- 乱序刷题 ----
     把本科某题型下所有章节的题目汇总后整体洗牌，
     每次进入都重新洗（Fisher-Yates + 时间/随机源），保证顺序不重复。 */
  function buildShuffleItems(subj, kind) {
    const d = D[subj];
    if (!d) return [];
    const all = [];
    d.sections.forEach(sec => {
      secOfKind(sec, kind).forEach(q => {
        all.push({ s: subj, c: sec.id, k: kind, n: q[0] });
      });
    });
    return shuffle(all);
  }

  function buildAllShuffleItems(kind) {
    const all = [];
    SUBJECTS.forEach(sd => {
      const d = D[sd.id];
      if (!d) return;
      d.sections.forEach(sec => {
        secOfKind(sec, kind).forEach(q => {
          all.push({ s: sd.id, c: sec.id, k: kind, n: q[0] });
        });
      });
    });
    return shuffle(all);
  }

  function shuffle(arr) {
    const a = arr.slice();
    let seed = (Date.now() % 2147483647) ^ Math.floor(Math.random() * 2147483647);
    function rnd() {
      // xorshift32，避免直接依赖 Math.random 分布
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
    const arr = secOfKind(sec, kind);
    return arr.map(q => ({ s: subj, c: secId, k: kind, n: q[0] }));
  }

  function chooseMode(subj, secId, kind, count, cb, titleText) {
    const last = store.set.lastMode || MODE_DO;
    openSheet((titleText || '选择练习方式') + ' · ' + count + ' 题', [
      { t: '做题模式', d: '先作答，提交后显示答案与解析', v: MODE_DO, mark: last === MODE_DO },
      { t: '看题模式', d: '直接显示答案与解析，快速过题', v: MODE_VIEW, mark: last === MODE_VIEW }
    ], function (v) {
      setSetting('lastMode', v);
      cb(v);
    });
  }

  /* ---------------- 视图：刷题 ---------------- */
  let Q = null; // 当前做题会话

  function startQuiz(items, mode, ctx) {
    if (!items.length) return toast('没有可选题目');
    Q = { items: items, i: 0, mode: mode, ctx: ctx || {}, done: {}, marked: {}, startedAt: Date.now() };
    go('quiz', {});
  }

  VIEWS.quiz = function (page) {
    if (!Q) { page.innerHTML = '<div class="empty">会话已结束</div>'; return; }
    page.innerHTML = '<div id="quizbar" class="quizbar"></div><div id="qwrap"></div>';
    renderQ(true);
  };

  function quizTop() {
    if (!Q) return;
    const st = cur();
    const it = Q.items[Q.i];
    const sub = Q.ctx.wrong ? (subjShort(it.s) + ' · 错题重刷')
      : Q.ctx.all ? '全库乱序刷题'
      : Q.ctx.shuffle ? (subjShort(it.s) + ' · 乱序刷题')
        : Q.ctx.fav ? '我的收藏'
          : (subjShort(it.s) + ' · ' + it.c);
    st.title = sub;
    $('#hdr-title').textContent = sub;
    $('#hdr-right').innerHTML = '<button class="hdr-btn" id="btn-star">★</button>';
    const b = $('#btn-star');
    if (b) {
      b.classList.toggle('on', favLinked(it));
      b.onclick = () => starTap(it);
    }
  }

  function renderQ() {
    if (!Q) return;
    accrueActiveStudy();
    // 结果页的固定操作条挂在 #app 下，重绘下一题时需先清除，
    // 否则它会覆盖新题的「看答案 / 提交」按钮。
    const oldActionbar = $('.actionbar', $('#app'));
    if (oldActionbar) oldActionbar.remove();
    const it = Q.items[Q.i];
    Q.activeSubject=it.s; Q.activeSince=Date.now();
    const q = getQ(it);
    const wrap = $('#qwrap');
    if (!wrap) return;
    if (!q) { wrap.innerHTML = '<div class="empty">题目数据缺失</div>'; return; }
    const sec = secOf(it.s, it.c);
    const isBig = it.k === 'b';
    const mode = Q.mode;
    const rec = Q.done[qid(it)];
    quizTop();

    const bar = $('#quizbar');
    if (bar) {
      const prog = Math.round((Q.i + 1) / Q.items.length * 100);
      bar.innerHTML = '<span>' + (Q.i + 1) + '/' + Q.items.length + '</span>' +
        '<span class="track"><i style="width:' + prog + '%"></i></span>' +
        '<span>' + (mode === MODE_VIEW ? '看题' : '做题') + '</span>';
    }

    let head = '<div class="qcard">' +
      '<div class="qmeta">' +
      '<span>' + esc(subjShort(it.s)) + ' · ' + esc(it.c) + '</span>' +
      (sec ? '<span class="pfx">' + esc(sec.title) + '</span>' : '') +
      '<span class="pill' + (isBig ? ' multi' : '') + '">' + kindName(it.k) + ' 第' + it.n + '题</span>' +
      (wrongHas(it) ? '<span class="pill" style="background:var(--bad-soft);color:var(--bad)">错题</span>' : '') +
      '</div>' +
      '<div class="qstem">' + esc(isBig ? q[1] : q[2]) + '</div>' +
      (function () { var im = isBig ? q[4] : q[5]; return im ? '<div class="figwrap"><img class="qfig" src="' + esc(im) + '" alt="配图" onload="window.__figFit&&window.__figFit(this)"></div>' : ''; })() +
      '</div>';

    wrap.innerHTML = head;
    $('#app').classList.add('has-ab');

    if (!isBig) renderXzt(wrap, it, q, mode, rec);
    else renderBig(wrap, it, q, mode, rec);
  }

  /* ---- 选择题 ---- */
  function renderXzt(wrap, it, q, mode, rec) {
    const ans = String(q[1] || '');
    const opts = q[4] || [];
    const multi = ans.length > 1;
    const revealed = mode === MODE_VIEW || !!rec;

    let h = '<div class="qcard" style="margin-top:12px"><div class="opts" id="opts">';
    if (opts.length) {
      opts.forEach(txt => {
        const L = String(txt).trim().charAt(0);
        const body = String(txt).replace(/^[A-Da-d]\s*[.、．):：]?\s*/, '');
        h += '<button class="opt" data-l="' + esc(L) + '">' +
          '<span class="k">' + esc(L) + '</span><span>' + esc(body) + '</span></button>';
      });
    } else {
      ['A', 'B', 'C', 'D'].forEach(L => {
        h += '<button class="opt" data-l="' + L + '"><span class="k">' + L + '</span><span>' + L + '</span></button>';
      });
    }
    h += '</div></div>';
    wrap.insertAdjacentHTML('beforeend', h);

    const optsEl = $('#opts');
    const sel = new Set(rec && rec.mine ? String(rec.mine).split('') : []);

    function paint() {
      $$('.opt', optsEl).forEach(o => {
        o.classList.remove('sel', 'right', 'wrong', 'dim');
        if (!revealed) { if (sel.has(o.dataset.l)) o.classList.add('sel'); return; }
        if (ans.indexOf(o.dataset.l) >= 0) o.classList.add('right');
        else if (sel.has(o.dataset.l)) o.classList.add('wrong');
        else o.classList.add('dim');
      });
    }

    $$('.opt', optsEl).forEach(o => o.onclick = () => {
      if (revealed) return;
      haptic();
      if (!multi) sel.clear();
      if (sel.has(o.dataset.l)) sel.delete(o.dataset.l); else sel.add(o.dataset.l);
      paint(); syncSubmit();
    });
    paint();

    if (revealed) {
      if (mode === MODE_VIEW) {
        wrap.insertAdjacentHTML('beforeend', ansBlock(ans, q[3]));
      } else if (rec.peek) {
        wrap.insertAdjacentHTML('beforeend', ansBlock(ans, q[3]));
      } else {
        wrap.insertAdjacentHTML('beforeend',
          resBlock(!!rec.ok, ans, rec.mine || '', q[3]));
      }
      attachActions(wrap, it);
      return;
    }

    wrap.insertAdjacentHTML('beforeend',
      '<div class="actionbar in" id="ab">' +
      '<button class="btn-ghost" id="btn-peek">看答案</button>' +
      '<button class="btn-primary" id="btn-submit" disabled>提交</button>' +
      '</div>');

    const submitBtn = $('#btn-submit');
    function syncSubmit() { submitBtn.disabled = sel.size === 0; }
    syncSubmit();

    submitBtn.onclick = () => {
      const mine = Array.from(sel).sort().join('');
      if (!mine) return toast('请先选择答案');
      submitAnswer(it, mine, mine === ans, ans);
    };
    $('#btn-peek').onclick = () => {
      const rec2 = { ok: 0, mine: '', peek: 1 };
      Q.done[qid(it)] = rec2;
      haptic();
      renderQ();
    };
  }

  /* ---- 综合应用题 ---- */
  function renderBig(wrap, it, q, mode, rec) {
    const hints = (q[3] || []).map(h => (h && h[1] ? (h[0] ? h[0] + '　' : '') + h[1] : '')).filter(Boolean);
    const hintHtml = hints.length ? hints.join('\n') : '先列出已知条件，按章节思路逐步推演。';
    const ansText = q[2] || '（教材无文字解答）';
    const showAll = mode === MODE_VIEW || !!rec;

    if (showAll) {
      wrap.insertAdjacentHTML('beforeend',
        '<div class="bigq-hint"><b>思路引导</b>' + esc(hintHtml) + '</div>' +
        '<div class="answer-box">' + esc(ansText) + '</div>' +
        (q[5] ? '<img class="qfig" src="' + esc(q[5]) + '" alt="解答图" loading="lazy">' : '') +
        (mode === MODE_VIEW ? '' : resBlock(!!rec.ok, '自评', rec.ok ? '做对了' : '做错了', '')));
      attachActions(wrap, it);
      return;
    }

    wrap.insertAdjacentHTML('beforeend',
      '<div class="bigq-hint hidden" id="hintbox"><b>思路引导</b>' + esc(hintHtml) + '</div>' +
      '<div class="answer-box hidden" id="ansbox">' + esc(ansText) + '</div>' +
      (q[5] ? '<img class="qfig hidden" id="ansimg" src="' + esc(q[5]) + '" alt="解答图" loading="lazy">' : '') +
      '<div class="actionbar in" id="ab">' +
      '<button class="btn-ghost" id="btn-hint">思路提示</button>' +
      '<button class="btn-primary" id="btn-ans">显示解答</button>' +
      '</div>');

    $('#btn-hint').onclick = () => {
      haptic();
      $('#hintbox').classList.remove('hidden');
      $('#btn-hint').classList.add('on');
    };
    $('#btn-ans').onclick = () => {
      haptic();
      $('#hintbox').classList.remove('hidden');
      $('#ansbox').classList.remove('hidden');
      const ai = $('#ansimg'); if (ai) ai.classList.remove('hidden');
      $('#ab').innerHTML =
        '<button class="btn-ghost" id="btn-wrong">我做错了</button>' +
        '<button class="btn-primary" id="btn-right">我做对了</button>';
      $('#btn-wrong').onclick = () => markBig(it, false);
      $('#btn-right').onclick = () => markBig(it, true);
    };
  }

  function attachActions(wrap, it) {
    const old = $('.actionbar'); if (old) old.remove();
    const bar = document.createElement('div');
    bar.className = 'actionbar in';
    bar.innerHTML =
      '<button class="btn-ghost" id="btn-prev"' + (Q.i === 0 ? ' disabled' : '') + '>上一题</button>' +
      '<button class="btn-primary" id="btn-next">' + (Q.i === Q.items.length - 1 ? '完成' : '下一题') + '</button>';
    $('#app').appendChild(bar);
    $('#btn-prev').onclick = () => { if (Q.i > 0) { Q.i--; renderQ(); } };
    $('#btn-next').onclick = () => {
      if (Q.i < Q.items.length - 1) { Q.i++; renderQ(); }
      else finishQuiz();
    };
  }

  function ansBlock(ans, expl) {
    return '<div class="res" style="background:var(--acc-soft);margin-bottom:8px">' +
      '<div class="res-t" style="color:var(--acc)">正确答案：' + esc(ans) + '</div>' +
      '<div class="res-expl">' + esc(expl || '（教材无文字解析）') + '</div>' +
      '</div>';
  }

  function resBlock(ok, ans, mine, expl) {
    return '<div class="res ' + (ok ? 'ok' : 'bad') + '" style="margin-bottom:8px">' +
      '<div class="res-t">' + (ok ? '✓ 回答正确' : '✕ 回答错误') + '</div>' +
      '<div class="res-ans">正确答案：<b>' + esc(ans) + '</b>' +
      (!ok && mine ? '　你的答案：' + esc(mine) : '') + '</div>' +
      (expl ? '<div class="res-expl">' + esc(expl) + '</div>' : '') +
      '</div>';
  }

  function submitAnswer(it, mine, ok, ans) {
    Q.done[qid(it)] = { ok: ok ? 1 : 0, mine: mine };
    posSet(it.s, it.c, it.k, it.n, ok, mine);
    if (ok) {
      if (wrongRemove(it)) toast('答对了，已移出错题本');
    } else {
      wrongAdd(it, mine, ans);
    }
    haptic();
    renderQ();
    setTimeout(() => { const b = $('#btn-next'); if (b && Q.i < Q.items.length - 1) { /* 保持 */ } }, 0);
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
    openSheet('本轮完成', [], null, function (body) {
      body.innerHTML = '<div style="padding:2px 18px 18px">' +
        '<div class="stat-grid" style="margin-bottom:16px">' +
        '<div class="stat-cell"><b>' + total + '</b><span>题量</span></div>' +
        '<div class="stat-cell ok"><b>' + ok + '</b><span>答对</span></div>' +
        '<div class="stat-cell bad"><b>' + bad + '</b><span>答错</span></div>' +
        '</div>' +
        (skipped ? '<div style="font-size:12.5px;color:var(--ink3);text-align:center;margin-bottom:14px">未作答 ' + skipped + ' 题</div>' : '') +
        '<div class="btn-row" style="margin-top:0"><button class="btn-ghost" id="f-back">返回</button>' +
        '<button class="btn-primary" id="f-again">再来一次</button></div></div>';
      $('#f-back').onclick = () => { closeSheet(); setTimeout(() => { back(); }, 260); };
      $('#f-again').onclick = () => {
        closeSheet();
        setTimeout(() => {
          // 乱序模式：重新洗牌，保证与上一轮顺序不同
          if (Q.ctx.all) {
            const fresh = buildAllShuffleItems(Q.ctx.k || 'x');
            const same = fresh.length > 1 &&
              fresh.every((x, idx) => qid(x) === qid(Q.items[idx]));
            Q.items = same ? shuffle(fresh) : fresh;
          } else if (Q.ctx.shuffle) {
            const fresh = buildShuffleItems(Q.ctx.s, Q.ctx.k);
            const same = fresh.length > 1 &&
              fresh.every((x, idx) => qid(x) === qid(Q.items[idx]));
            Q.items = same ? shuffle(fresh) : fresh;
          }
          Q.i = 0; Q.done = {};
          renderQ();
        }, 120);
      };
    });
  }

  function recordStudyTime() {
    accrueActiveStudy(); if(Q) Q.startedAt=null;
  }
  function accrueActiveStudy(){if(!Q||!Q.activeSince||!Q.activeSubject)return;const secs=Math.floor((Date.now()-Q.activeSince)/1000);Q.activeSince=Date.now();if(secs<=0)return;const d=new Date(),key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),data=read(LS.study,{});data[key]=data[key]||{};data[key][Q.activeSubject]=(data[key][Q.activeSubject]||0)+secs;write(LS.study,data);}

  /* ---------------- 收藏交互 ---------------- */
  function starTap(it) {
    haptic();
    openFavSheet(it);
  }

  function openFavSheet(it) {
    const cur2 = favFoldersOf(it);
    const folders = favFolders();
    openSheet('收藏到', [], null, function (body) {
      let h = '<div class="sheet-body">';
      folders.forEach(f => {
        const on = cur2.indexOf(f.id) >= 0;
        h += '<button class="sheet-opt" data-f="' + f.id + '">' +
          '<span class="ti">' + esc(f.name) + '<span class="desc">' + favTotal(f.id) + ' 道题</span></span>' +
          '<span class="' + (on ? 'sw on' : 'sw') + '" style="pointer-events:none"></span></button>';
      });
      h += '<div class="sheet-sep"></div>';
      h += '<button class="sheet-opt" data-new="1"><span class="ti" style="color:var(--acc)">＋ 新建收藏夹</span></button>';
      h += '</div>';
      body.innerHTML = h;
      $$('[data-f]', body).forEach(b => b.onclick = () => {
        favToggleFolder(it, b.dataset.f);
        haptic();
        openFavSheet(it); quizTop();
        renderQ(false);
      });
      $('[data-new]', body).onclick = () => askName('新建收藏夹', '', function (name) {
        const id = favNewFolder(name);
        favToggleFolder(it, id);
        toast('已创建并收藏');
        openFavSheet(it); quizTop();
      });
    });
  }

  /* ---------------- 视图：收藏 ---------------- */
  let favFilter = null;
  VIEWS.fav = function (page) {
    const fav = store.fav;
    const folders = fav.folders;
    const items = fav.items;
    let html = '<div class="sec-title">收藏夹 <button class="more" id="fav-new-folder">＋ 新建收藏夹</button></div><div class="chips" id="favchips">' +
      '<button class="chip ' + (favFilter === null ? 'on' : '') + '" data-fd="__all">全部<span class="n">' + favTotal() + '</span></button>';
    folders.forEach(f => {
      const n = favTotal(f.id);
      html += '<button class="chip ' + (favFilter === f.id ? 'on' : '') + '" data-fd="' + f.id + '">' +
        esc(f.name) + '<span class="n">' + n + '</span></button>';
    });
    html += '</div>';

    const ids = Object.keys(items).filter(k => favFilter === null ? items[k].length : items[k].indexOf(favFilter) >= 0);
    const raw = ids.map(parseQid);

    if (!raw.length) {
      page.innerHTML = html + '<div class="empty"><div class="ico">★</div>' +
        (favTotal() === 0 ? '还没有收藏题目<br>刷题时点右上角 ★ 即可收藏' : '这个收藏夹还是空的') + '</div>';
      bindChips(page);
      $('#fav-new-folder').onclick=()=>askName('新建收藏夹','',name=>{favNewFolder(name);render(true);toast('收藏夹已创建')});
      return Promise.resolve();
    }

    // 需要加载对应科目数据
    const need = Array.from(new Set(raw.map(x => x.s))).filter(s => !D[s]);
    return Promise.all(need.map(load)).then(() => {
      const list = raw.filter(it => getQCached(it));
      let h = html;
      h += '<div class="sec-title">共 ' + list.length + ' 题' +
        (favFilter !== null && favFilter !== 'default' ? '<button class="more" id="fd-del">删除此夹</button>' :
          (favFilter !== null ? '' : '')) + '</div>';
      h += '<div class="quick" style="margin-bottom:14px">' +
        '<button class="qbtn" id="fav-start"><span class="qbtn-ico sh">⇄</span>' +
        '<span class="qbtn-tx"><b>乱序刷收藏</b><i>打乱顺序 · ' + list.length + ' 题</i></span></button>' +
        '<button class="qbtn" id="fav-order"><span class="qbtn-ico rw" style="background:var(--acc-soft);color:var(--acc)">≡</span>' +
        '<span class="qbtn-tx"><b>按顺序刷</b><i>保持收藏顺序 · ' + list.length + ' 题</i></span></button>' +
        '</div>';
      h += '<div class="list">';
      list.forEach(it => {
        const q = getQCached(it);
        if (!q) return;
        const st = posGet(it.s, it.c, it.k, it.n);
        const t = it.k === 'b' ? q[1] : q[2];
        h += '<button class="li" data-q="' + esc(qid(it)) + '">' +
          '<span class="dot ' + (st ? (st.ok ? 'ok' : 'bad') : '') + '"></span>' +
          '<span class="li-main"><span class="li-t">' + esc(String(t).slice(0, 60)) + '</span>' +
          '<span class="li-s">' + esc(subjShort(it.s)) + ' · ' + esc(it.c) + ' · ' + kindName(it.k) + ' · 第' + it.n + '题</span></span>' +
          '<span class="li-r"><i class="chev"></i></span></button>';
      });
      h += '</div>';
      page.innerHTML = h;
      bindChips(page);
      $('#fav-new-folder').onclick=()=>askName('新建收藏夹','',name=>{favNewFolder(name);render(true);toast('收藏夹已创建')});
      const favItems = () => list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
      $('#fav-start').onclick = () => {
        chooseMode('', '', '', list.length, function (mode) {
          startQuiz(shuffle(favItems()), mode, { fav: true, shuffle: true });
        }, '乱序刷收藏');
      };
      $('#fav-order').onclick = () => {
        chooseMode('', '', '', list.length, function (mode) {
          startQuiz(favItems(), mode, { fav: true });
        }, '刷收藏');
      };
      $$('[data-q]', page).forEach(b => b.onclick = () => {
        const it = parseQid(b.dataset.q);
        const arr = list.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
        const idx = arr.findIndex(x => qid(x) === b.dataset.q);
        startQuiz(arr, MODE_VIEW, { fav: true });
        Q.i = Math.max(0, idx);
      });
      const del = $('#fd-del'); if (del) del.onclick = () => {
        if (favFilter === 'default') return;
        confirmSheet('删除收藏夹「' + folderName(favFilter) + '」？夹内题目可重新收藏。', function () {
          favDelFolder(favFilter); favFilter = null; render(true);
        });
      };
    });
  };

  const LIBRARY = [
    ['2009–2026 计算机408统考真题','https://pan.quark.cn/s/f127962f318c'],
    ['2027 王道 8 套卷＋解析','https://pan.quark.cn/s/61d432b7806f'],
    ['26 王道计算机408真题分类做题本','https://pan.quark.cn/s/8b2d2ba1007c'],
    ['26 王道计算机408《高分笔记》','https://pan.quark.cn/s/689b51ba61bf'],
    ['操作系统基础考点讲解','https://pan.quark.cn/s/f51a25e314c6'],
    ['计算机网络基础考点讲解','https://pan.quark.cn/s/3490eeeefbe4'],
    ['数据结构基础考点讲解','https://pan.quark.cn/s/232068c0d92a'],
    ['组成原理基础考点讲解','https://pan.quark.cn/s/b1c6047ef3f0'],
    ['27 王道课后习题做题本','https://pan.quark.cn/s/8bc1c262534b']
  ];
  VIEWS.library = function(page) {
    page.innerHTML='<div class="hero"><h2>资料库</h2><p>整理的 408 学习资料，点击后使用夸克网盘打开</p></div><div class="list">'+LIBRARY.map((x,i)=>'<button class="li" data-lib="'+i+'"><span class="li-num">↗</span><span class="li-main"><span class="li-t">'+esc(x[0])+'</span><span class="li-s">夸克网盘 · 学习资料</span></span><span class="li-r"><i class="chev"></i></span></button>').join('')+'</div><p class="li-s" style="padding:12px">资料仅供学习交流，请尊重版权，不要二次贩卖。</p>';
    $$('[data-lib]',page).forEach(b=>b.onclick=()=>{const goLink=()=>{try{if(window.AndroidBridge&&AndroidBridge.openUrl)AndroidBridge.openUrl(LIBRARY[+b.dataset.lib][1]);else location.href=LIBRARY[+b.dataset.lib][1]}catch(e){toast('无法打开链接')}};let ok=false;try{ok=localStorage.getItem(LS.library)==='1'}catch(e){}if(ok)return goLink();confirmSheet('资料仅限个人学习交流，请遵守版权要求，禁止二次贩卖。是否继续？',()=>{try{localStorage.setItem(LS.library,'1')}catch(e){}goLink()});});
  };

  VIEWS.study = function(page) {
    const data=read(LS.study,{}), now=new Date(), year=now.getFullYear(), month=now.getMonth();
    const first=new Date(year,month,1).getDay(), days=new Date(year,month+1,0).getDate();
    let h='<div class="hero"><h2>学习时间</h2><p>'+year+'年 '+(month+1)+'月 · 每天持续一点点</p></div><div class="calendar">'+['日','一','二','三','四','五','六'].map(x=>'<b>'+x+'</b>').join('');
    for(let i=0;i<first;i++)h+='<i></i>';
    for(let d=1;d<=days;d++){const key=year+'-'+String(month+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');const sec=Object.values(data[key]||{}).reduce((a,x)=>a+x,0);h+='<i class="day '+(sec>=3600?'deep':sec>0?'light':'')+'">'+d+'</i>';}
    h+='</div><div class="legend">□ 未学习　<span>■</span> 已学习　<strong>■</strong> 超过 1 小时</div><div class="list">';
    SUBJECTS.forEach(s=>{const total=Object.values(data).reduce((a,day)=>a+(day[s.id]||0),0);h+='<div class="li"><span class="li-num">◷</span><span class="li-main"><span class="li-t">'+esc(s.name)+'</span><span class="li-s">累计 '+formatDuration(total)+'</span></span></div>';});
    h+='</div>';page.innerHTML=h;
  };
  function studyPreview(data){let h='<span class="heat-preview" aria-hidden="true">';for(let i=27;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const key=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');const sec=Object.values(data[key]||{}).reduce((a,x)=>a+x,0);h+='<i class="heat-cell '+(sec>=3600?'strong':sec>0?'active':'')+'"></i>'; }return h+'</span><span class="study-pi">π</span>';}
  function formatDuration(sec){const m=Math.floor(sec/60);return m<60?m+' 分钟':Math.floor(m/60)+' 小时 '+m%60+' 分钟';}
  function folderName(id) { const f = favFolders().find(x => x.id === id); return f ? f.name : ''; }
  function getQCached(it) { const m = IDX[it.s]; if (!m || !m[it.c]) return null; return (it.k === 'b' ? m[it.c].b : m[it.c].x)[it.n] || null; }
  function bindChips(page) {
    $$('[data-fd]', page).forEach(b => b.onclick = () => {
      const v = b.dataset.fd;
      favFilter = v === '__all' ? null : v;
      render(true);
    });
  }

  /* ---------------- 视图：错题 ---------------- */
  let wrongFilter = null;
  VIEWS.wrong = function (page) {
    const all = store.wrong.slice().sort((a, b) => b.ts - a.ts);
    let html = '<div class="chips" id="wchips">' +
      '<button class="chip ' + (wrongFilter === null ? 'on' : '') + '" data-ws="__all">全部<span class="n">' + all.length + '</span></button>' +
      SUBJECTS.map(s => '<button class="chip ' + (wrongFilter === s.id ? 'on' : '') + '" data-ws="' + s.id + '">' +
        subjShort(s.id) + '<span class="n">' + all.filter(x => x.s === s.id).length + '</span></button>').join('') +
      '</div>';

    const list = wrongFilter ? all.filter(x => x.s === wrongFilter) : all;
    if (!list.length) {
      page.innerHTML = html + '<div class="empty"><div class="ico">✕</div>' +
        '太棒了，这里空空如也<br>做题时答错的题目会自动收进来</div>';
      bindWChips(page);
      return Promise.resolve();
    }
    const need = Array.from(new Set(list.map(x => x.s))).filter(s => !D[s]);
    return Promise.all(need.map(load)).then(() => {
      const L = list.filter(x => getQCached(x));
      let h = html;
      h += '<div class="quick" style="margin-bottom:14px">' +
        '<button class="qbtn" id="w-shuffle"><span class="qbtn-ico sh">⇄</span>' +
        '<span class="qbtn-tx"><b>乱序重刷错题</b><i>全部打乱 · ' + L.length + ' 题</i></span></button>' +
        '</div>';
      h += '<div class="sec-title">按板块重刷</div>';
      h += '<div class="list" style="margin-bottom:14px">';
      // 按 科目-章节 聚合
      const groups = {};
      L.forEach(x => { const k = x.s + '|' + x.c + '|' + x.k; (groups[k] = groups[k] || []).push(x); });
      const keys = Object.keys(groups).sort();
      keys.forEach(k => {
        const arr = groups[k];
        const p = k.split('|');
        const sec = secOf(p[0], p[1]);
        h += '<button class="li" data-g="' + esc(k) + '">' +
          '<span class="li-num" style="background:var(--bad-soft);color:var(--bad)">' + arr.length + '</span>' +
          '<span class="li-main"><span class="li-t">' + esc(sec ? sec.title : p[1]) + '</span>' +
          '<span class="li-s">' + esc(subjShort(p[0])) + ' · ' + p[1] + ' · ' + kindName(p[2]) + '</span></span>' +
          '<span class="li-r"><i class="chev"></i></span></button>';
      });
      h += '</div>';

      h += '<div class="sec-title">错题明细<span class="more">' + L.length + '</span></div><div class="list">';
      L.forEach(x => {
        const q = getQCached(x);
        if (!q) return;
        const t = x.k === 'b' ? q[1] : q[2];
        h += '<button class="li" data-q="' + esc(x.id) + '">' +
          '<span class="li-main"><span class="li-t">' + esc(String(t).slice(0, 56)) + '</span>' +
          '<span class="li-s">' + esc(subjShort(x.s)) + ' · ' + esc(x.c) + ' · 第' + x.n + '题' +
          (x.cnt > 1 ? ' · 错 ' + x.cnt + ' 次' : '') + '</span></span>' +
          '<span class="li-r"><i class="chev"></i></span></button>';
      });
      h += '</div>';
      page.innerHTML = h;
      bindWChips(page);
      const ws = $('#w-shuffle');
      if (ws) ws.onclick = () => {
        haptic();
        const arr = shuffle(L.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n })));
        chooseMode('', '', '', arr.length, function (mode) {
          startQuiz(arr, mode, { wrong: true, shuffle: true });
        }, '乱序重刷错题');
      };
      $$('[data-g]', page).forEach(b => b.onclick = () => {
        const arr = groups[b.dataset.g].map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
        chooseMode('', '', '', arr.length, function (mode) {
          startQuiz(arr, mode, { wrong: true });
        }, '重刷本题组');
      });
      $$('[data-q]', page).forEach(b => b.onclick = () => {
        const arr = L.map(x => ({ s: x.s, c: x.c, k: x.k, n: x.n }));
        const idx = arr.findIndex(x => qid(x) === b.dataset.q);
        startQuiz(arr, MODE_VIEW, { wrong: true });
        Q.i = Math.max(0, idx);
      });
    });
  };
  function bindWChips(page) {
    $$('[data-ws]', page).forEach(b => b.onclick = () => {
      wrongFilter = b.dataset.ws === '__all' ? null : b.dataset.ws;
      render(true);
    });
  }

  /* ---------------- 视图：我的 ---------------- */
  VIEWS.me = function (page) {
    return Promise.all(SUBJECTS.map(s => load(s.id))).then(() => {
      const st = store.set;
      let tot = 0, done = 0, ok = 0;
      SUBJECTS.forEach(s => { const x = subjStat(s.id); tot += x.tot; done += x.done; ok += x.ok; });
      const rate = done ? Math.round(ok / done * 100) : 0;

      const studyData=read(LS.study,{}),studyTotal=Object.values(studyData).reduce((sum,day)=>sum+Object.values(day).reduce((a,x)=>a+x,0),0);
      let h = '<button class="study-card" id="open-study"><span class="study-copy"><b>学习打卡热力图</b><small>记录每科投入 · 累计 '+formatDuration(studyTotal)+'</small></span>'+studyPreview(studyData)+'<span class="study-pi">π</span></button>'+
        '<div class="stat-grid" style="margin-bottom:16px">' +
        '<div class="stat-cell"><b>' + done + '</b><span>已练习</span></div>' +
        '<div class="stat-cell ok"><b>' + rate + '%</b><span>正确率</span></div>' +
        '<div class="stat-cell bad"><b>' + wrongCountBy() + '</b><span>错题</span></div>' +
        '</div>';


      h += '<div class="sec-title">我的收藏</div><div class="list">' +
        '<button class="li" id="open-fav"><span class="li-num">★</span><span class="li-main"><span class="li-t">收藏夹</span><span class="li-s">'+favFolders().length+' 个收藏夹 · '+favTotal()+' 道题</span></span><span class="li-r"><i class="chev"></i></span></button></div>';

      h += '<div class="sec-title">偏好设置</div><div class="list">';
      h += '<div class="li"><span class="li-main"><span class="li-t">主题</span></span>' +
        '<span class="li-r"><button class="btn-sm" id="set-theme">' +
        (st.theme === 'dark' ? '深色' : st.theme === 'light' ? '浅色' : '跟随系统') + '</button></span></div>';
      h += '</div>';

      h += '<div class="sec-title">数据与关于</div><div class="list">' +
        '<button class="li" id="act-update"><span class="li-main"><span class="li-t">更新说明</span><span class="li-s">V2.0 正式版</span></span><span class="li-r"><i class="chev"></i></span></button>' +
        '<button class="li" id="act-eula"><span class="li-main"><span class="li-t">使用协议与致谢</span>' +
        '<span class="li-s">开源项目说明</span></span><span class="li-r"><i class="chev"></i></span></button>' +
        '<button class="li" id="act-export"><span class="li-main"><span class="li-t">导出学习数据</span>' +
        '<span class="li-s">选择错题或收藏，复制纯文本</span></span><span class="li-r"><i class="chev"></i></span></button>' +
        '<button class="li" id="act-donate"><span class="li-num">☕</span><span class="li-main"><span class="li-t">请作者喝咖啡</span><span class="li-s">感谢支持独立开发</span></span><span class="li-r"><i class="chev"></i></span></button>' +
        '<button class="li" id="act-contact"><span class="li-main"><span class="li-t">联系开发者</span><span class="li-s">GitHub 提 Issue · 小红书 1895737550</span></span><span class="li-r"><i class="chev"></i></span></button>' +
        '<button class="li" id="act-clear"><span class="li-main"><span class="li-t" style="color:var(--bad)">清空所有学习数据</span>' +
        '<span class="li-s">不可恢复</span></span><span class="li-r"><i class="chev"></i></span></button>' +
        '</div>';

      h += '<div style="text-align:center;color:var(--ink3);font-size:11.5px;margin:22px 0 6px;line-height:1.9">' +
        '派立方408 · V2.0 正式版<br>题库来源：王道 2027 考研复习指导<br>原 Web 应用作者 zsc5725216-hub · 安卓版 tianshi</div>';
      page.innerHTML = h;

      $('#set-theme').onclick = () => {
        const order = ['auto', 'light', 'dark'];
        const nx = order[(order.indexOf(store.set.theme) + 1) % 3];
        setSetting('theme', nx); applyTheme(); render(true);
      };
      $('#open-fav').onclick=()=>go('fav',{});
      $('#open-study').onclick=()=>go('study',{});
      $('#act-update').onclick=()=>openSheet('V2.0 正式版更新说明',[],null,b=>b.innerHTML='<div class="form-pad">学习计划触屏拖拽排序；收藏夹管理可新建收藏夹；学习时间卡片与月历热力图；资料库与学习免责声明；收藏/错题纯文本导出；本地记录支持覆盖升级。</div>');
      $('#act-donate').onclick=()=>openSheet('感谢支持',[],null,b=>b.innerHTML='<img src="img/donate.png" alt="微信收款码" style="display:block;width:min(88%,360px);margin:8px auto;border-radius:16px"><p style="text-align:center;color:var(--ink2)">微信扫码支持作者</p>');
      $('#act-contact').onclick=()=>openSheet('联系开发者',[],null,b=>b.innerHTML='<div class="form-pad">GitHub：在项目页面提交 Issue<br><br>小红书：1895737550<br><br>相关帖子评论区留言</div>');
      $('#act-eula').onclick = () => showEula(false);
      $('#act-export').onclick = exportData;
      $('#act-clear').onclick = () => confirmSheet('确定清空所有学习数据？进度、错题、收藏都会被删除，此操作不可恢复。', function () {
        [LS.pos, LS.wrong, LS.fav, LS.plans, LS.study].forEach(k => { try { localStorage.removeItem(k); } catch (e) {} });
        favFilter = null; wrongFilter = null;
        toast('已清空');
        render(true);
      }, true);
    });
  };

  function exportData() {
    openSheet('选择导出内容',[],null,body=>{body.innerHTML='<div class="form-pad"><label><input type="checkbox" id="ex-wrong" checked> 错题（'+wrongCountBy()+'）</label><br><label><input type="checkbox" id="ex-fav" checked> 收藏（'+favTotal()+'）</label><button class="btn-primary" id="ex-copy" style="width:100%;margin-top:18px">导出并复制纯文本</button></div>';$('#ex-copy').onclick=async()=>{const wantWrong=$('#ex-wrong').checked,wantFav=$('#ex-fav').checked;if(!wantWrong&&!wantFav)return toast('请至少选择一项');await Promise.all(SUBJECTS.map(s=>load(s.id)));let entries=[];if(wantWrong)entries=entries.concat(store.wrong);if(wantFav)entries=entries.concat(Object.keys(store.fav.items).map(parseQid));const seen={};let out=[];entries.forEach(it=>{const id=qid(it);if(seen[id])return;seen[id]=1;const q=getQ(it);if(!q)return;let text=it.k==='b'?'题目：'+q[1]+'\n参考答案：'+q[2]:'题目：'+q[2]+'\n'+(q[4]||[]).join('\n')+'\n答案：'+q[1]+'\n解析：'+q[3];out.push('【'+subjShort(it.s)+' '+it.c+' 第'+it.n+'题】\n'+text)});const txt=out.join('\n\n');try{if(window.AndroidBridge&&AndroidBridge.copyText){AndroidBridge.copyText(txt);const dest=AndroidBridge.saveText('派立方408-导出.txt',txt);closeSheet();toast(dest==='保存失败'?'已复制；文件保存失败':('已复制并保存到'+dest));}else{await navigator.clipboard.writeText(txt);closeSheet();toast('已复制 '+out.length+' 道题，可直接粘贴');}}catch(e){toast('导出或复制失败，请重试')}};});
  }

  /* ---------------- 主题 / 字号 ---------------- */
  function applyTheme() {
    const t = store.set.theme;
    const root = document.documentElement;
    root.removeAttribute('data-theme');
    let dark = false;
    if (t === 'dark') { root.setAttribute('data-theme', 'dark'); dark = true; }
    else if (t === 'light') { root.setAttribute('data-theme', 'light'); }
    else dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const meta = document.querySelector('meta[name=theme-color]');
    if (meta) meta.setAttribute('content', dark ? '#0f1219' : '#f6f7fb');
    if (window.AndroidBridge && window.AndroidBridge.setTheme) {
      try { window.AndroidBridge.setTheme(dark ? 'dark' : 'light'); } catch (e) {}
    }
  }
  function applyFont() {
    const f = store.set.font;
    const root = document.documentElement;
    root.classList.remove('font-small', 'font-large');
    if (f === 'small') root.classList.add('font-small');
    else if (f === 'large') root.classList.add('font-large');
  }

  /* ---------------- Sheet / Dialog ---------------- */
  let sheetCb = null;
  function openSheet(title, opts, onPick, custom) {
    const wrap = $('#sheet'), body = $('#sheet-body');
    $('#sheet').classList.remove('hidden');
    $('#sheet').classList.remove('out');
    let html = '<div class="sheet-grab"></div>';
    if (title) html += '<div class="sheet-h">' + esc(title) + '</div>';
    body.innerHTML = html + '<div class="sheet-body" id="sbody"></div>';
    const sb = $('#sbody');
    if (custom) { custom(sb); }
    else {
      let h = '';
      opts.forEach((o, i) => {
        h += '<button class="sheet-opt" data-i="' + i + '">' +
          '<span class="ti">' + esc(o.t) + (o.d ? '<span class="desc">' + esc(o.d) + '</span>' : '') + '</span>' +
          (o.mark ? '<span style="color:var(--acc);font-weight:700">✓</span>' : '<i class="chev"></i>') +
          '</button>';
      });
      sb.innerHTML = h;
      $$('[data-i]', sb).forEach(b => b.onclick = () => {
        const o = opts[Number(b.dataset.i)];
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
    openSheet(title, [], null, function (body) {
      body.innerHTML = '<div style="padding:4px 18px 16px">' +
        '<input class="inp" id="name-inp" maxlength="14" placeholder="给收藏夹起个名字">' +
        '<div class="btn-row"><button class="btn-ghost" id="nm-cancel">取消</button>' +
        '<button class="btn-primary" id="nm-ok">确定</button></div></div>';
      const inp = $('#name-inp');
      inp.value = dflt || '';
      setTimeout(() => inp.focus(), 220);
      $('#nm-cancel').onclick = closeSheet;
      $('#nm-ok').onclick = () => {
        const v = inp.value.trim();
        if (!v) { toast('请输入名称'); return; }
        closeSheet();
        setTimeout(() => cb(v), 120);
      };
    });
  }
  function confirmSheet(msg, onOk, danger) {
    openSheet('', [], null, function (body) {
      body.innerHTML = '<div class="sheet-grab"></div>' +
        '<div style="padding:4px 20px 18px">' +
        '<div style="font-size:15px;font-weight:650;margin-bottom:8px">请确认</div>' +
        '<div style="font-size:13.5px;color:var(--ink2);line-height:1.8;margin-bottom:18px">' + esc(msg) + '</div>' +
        '<div class="btn-row" style="margin-top:0">' +
        '<button class="btn-ghost" id="cf-no">取消</button>' +
        '<button class="btn-primary" id="cf-yes"' + (danger ? ' style="background:var(--bad)"' : '') + '>确定</button>' +
        '</div></div>';
      $('#cf-no').onclick = closeSheet;
      $('#cf-yes').onclick = () => { closeSheet(); setTimeout(onOk, 280); };
    });
  }

  /* ---------------- 协议 ---------------- */
  const EULA_KEY = LS.eula;
  function eulaHtml() {
    return '' +
      '<p>欢迎使用 <span class="hi">派立方408</span>。</p>' +
      '<p>本应用是一个<b>完全离线</b>的计算机考研 408 刷题工具，所有题目、图片、学习记录都保存在你的手机本地，不联网、不上传、不需要注册账号，安装即用。</p>' +
      '<p><span class="hi">关于来源</span><br>题库内容整理自王道 2027 考研复习指导，原 Web 应用由 <span class="hi">zsc5725216-hub</span> 开发维护：<br>' +
      '<a href="#" id="repo-link">github.com/zsc5725216-hub/408-quiz</a></p>' +
      '<p><span class="hi">关于安卓版</span><br>安卓版本由 <span class="hi">tianshi</span> 在原作者开源项目基础上移植制作，重新设计了适合手机的界面与交互。在此向原作者的无私分享表示诚挚感谢。</p>' +
      '<p><span class="hi">使用约定</span><br>' +
      '· 本应用完全免费，<b>任何人不得以任何形式售卖</b>，也不得用于任何付费课程、付费题库或商业引流；<br>' +
      '· 请勿用于商业用途，请勿去除原作者与移植者的署名信息；<br>' +
      '· 题库内容版权归原作者及出版方所有，仅供个人学习使用。</p>' +
      '<p>继续使用即表示你已理解并同意以上约定。祝你 408 顺利上岸。</p>';
  }
  function showEula(first) {
    const el = $('#eula');
    el.classList.remove('hidden');
    const body = $('#eula-body');
    if (!body.innerHTML.trim()) body.innerHTML = eulaHtml();
    const link = $('#repo-link');
    if (link) link.onclick = (e) => { e.preventDefault(); toast('github.com/zsc5725216-hub/408-quiz'); };
    const chk = $('#eula-ok'), btn = $('#eula-agree');
    if (!first) { chk.checked = true; btn.disabled = false; btn.textContent = '关闭'; }
    chk.onchange = () => { btn.disabled = !chk.checked; };
    btn.onclick = () => {
      if (first) {
        try { localStorage.setItem(EULA_KEY, '1'); } catch (e) {}
      }
      el.style.transition = 'opacity .32s ease';
      el.style.opacity = '0';
      setTimeout(() => { el.classList.add('hidden'); el.style.opacity = ''; el.style.transition = ''; }, 320);
    };
  }

  /* ---------------- 启动 ---------------- */
  function boot() {
    applyTheme();
    applyFont();
    const agreed = (function () { try { return localStorage.getItem(EULA_KEY) === '1'; } catch (e) { return false; } })();
    startupAt = Date.now();
    if (!agreed) showEula(true);
    initNav();
  }
  let startupAt = 0, startupFinished = false;
  function finishStartup() {
    if (startupFinished) return;
    startupFinished = true;
    const elapsed = Date.now() - startupAt;
    const wait = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ? 0 : Math.max(0, 520 - elapsed);
    setTimeout(() => {
      const sp = $('#splash');
      if (!sp) return;
      sp.classList.add('out');
      setTimeout(() => sp.remove(), 280);
    }, wait);
  }
  function showEulaIfNeeded() { /* 已同意则不显示 */ }

  function initNav() {
    $('#hdr-back').onclick = () => { back(); };
    $$('#tabbar .tab').forEach(b => b.onclick = () => {
      haptic();
      const t = b.dataset.tab;
      favFilter = null; wrongFilter = null;
      nav.stack = [{ v: t === 'library' ? 'library' : t, p: {}, sc: 0 }];
      render(true);
    });
    window.addEventListener('scroll', function () {
      const h = $('#hdr');
      if (h) h.classList.toggle('scrolled', window.scrollY > 6);
      const st = cur(); if (st) st.sc = window.scrollY;
    }, { passive: true });
    render(true);
  }

  // Android 返回键
  window.AppBack = function () {
    const sheetEl = $('#sheet');
    if (sheetEl && !sheetEl.classList.contains('hidden')) { closeSheet(); return true; }
    const el = $('#eula');
    if (el && !el.classList.contains('hidden')) {
      if (el.querySelector('#eula-agree').textContent === '关闭') { $('#eula-agree').click(); return true; }
      return true;
    }
    return back();
  };
  window.AppResume = function () { /* 预留 */ };

  document.addEventListener('DOMContentLoaded', boot);
})();
