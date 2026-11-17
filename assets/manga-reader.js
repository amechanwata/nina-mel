/* 漫画リーダー：右開きページ送り・見開き・縦スクロール・拡大・再読み込み・続きから */
(function () {
  'use strict';
  var R = document.querySelector('[data-manga-reader]');
  var dataEl = R && R.querySelector('[data-manga-data]');
  if (!R || !dataEl || !window.NinaMel) return;
  var store = window.NinaMel.store;
  var D;
  try { D = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var pages = D.pages;
  var N = pages.length;
  var rtl = D.direction !== 'ltr';

  var viewer = R.querySelector('[data-viewer]');
  var stage = R.querySelector('[data-stage]');
  var holder = R.querySelector('[data-stage-pages]');
  var countEl = R.querySelector('[data-count]');
  var range = R.querySelector('[data-range]');
  var modeSwitch = R.querySelector('[data-mode-switch]');
  var scrollList = R.querySelector('[data-scroll-list]');
  var endEl = R.querySelector('[data-manga-end]');
  var toastEl = R.querySelector('[data-toast]');
  var btnLeft = R.querySelector('[data-go="left"]');
  var btnRight = R.querySelector('[data-go="right"]');

  viewer.hidden = false;
  modeSwitch.hidden = false;

  // ---- 表示モード --------------------------------------------------------
  var wide = window.matchMedia('(min-width: 1024px) and (min-aspect-ratio: 4/3)');
  var canSpread = function () { return window.matchMedia('(min-width: 768px)').matches; };
  var saved = store.get('manga:settings', {}) || {};
  var mode = saved.mode || (wide.matches ? 'spread' : 'single');
  if (mode === 'spread' && !canSpread()) mode = 'single';
  var spreadOpt = R.querySelector('[data-spread-option]');

  // 見開きのまとまり：表紙（1ページ目）を単独にするかどうか
  function groupsFor(m) {
    var g = [];
    if (m !== 'spread') { for (var i = 0; i < N; i++) g.push([i]); return g; }
    var start = 0;
    if (D.spreadFirstPageSingle) { g.push([0]); start = 1; }
    for (var j = start; j < N; j += 2) g.push(j + 1 < N ? [j, j + 1] : [j]);
    return g;
  }
  var groups = groupsFor(mode);
  var gi = 0; // 現在のまとまり

  // ---- 進捗 -------------------------------------------------------------
  var prog = store.get('manga:progress', {}) || {};
  var mine = prog[D.slug] || {};
  function save(extra) {
    prog = store.get('manga:progress', {}) || {};
    var cur = prog[D.slug] || {};
    cur.page = currentPage() + 1;
    cur.at = Date.now();
    if (cur.page >= N) cur.done = true;
    Object.assign(cur, extra || {});
    prog[D.slug] = cur;
    store.set('manga:progress', prog);
    var l = { kind: 'manga', route: D.route, title: '漫画 ' + D.title, at: Date.now() };
    store.set('last', l);
    store.set('manga:last', l);
  }
  function currentPage() {
    if (mode === 'scroll') return scrollIndex;
    return groups[gi] ? groups[gi][0] : 0;
  }
  function groupOfPage(p) {
    for (var i = 0; i < groups.length; i++) if (groups[i].indexOf(p) >= 0) return i;
    return 0;
  }

  // ---- ページ描画 ---------------------------------------------------------
  var cache = {};
  function pageEl(i) {
    var p = pages[i];
    var wrap = document.createElement('div');
    wrap.className = 'mpage';
    wrap.style.setProperty('--ar', p.width + ' / ' + p.height);
    wrap.setAttribute('data-page', String(i + 1));
    var img = new Image();
    img.decoding = 'async';
    img.width = p.width; img.height = p.height;
    img.alt = p.alt || ((i + 1) + 'ページ目');
    img.draggable = false;
    if (p.srcset) { img.srcset = p.srcset; img.sizes = mode === 'spread' ? '50vw' : '100vw'; }
    img.onload = function () { wrap.classList.add('is-loaded'); };
    img.onerror = function () { showError(wrap, img, p); };
    img.src = p.src;
    if (img.complete && img.naturalWidth) wrap.classList.add('is-loaded');
    wrap.appendChild(img);
    return wrap;
  }
  function showError(wrap, img, p) {
    wrap.classList.add('is-error');
    if (wrap.querySelector('.mpage__error')) return;
    var box = document.createElement('div');
    box.className = 'mpage__error';
    box.innerHTML = '<p>画像を読み込めませんでした。</p>';
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn btn--secondary'; b.textContent = 'もう一度読み込む';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      box.remove(); wrap.classList.remove('is-error');
      img.src = p.src + (p.src.indexOf('?') < 0 ? '?' : '&') + 'retry=' + Date.now();
    });
    box.appendChild(b);
    wrap.appendChild(box);
  }
  function preload(g) {
    (groups[g] || []).forEach(function (i) {
      if (cache[i]) return;
      var im = new Image(); im.decoding = 'async'; im.src = pages[i].src; cache[i] = im;
    });
  }
  var atEnd = false;
  function render() {
    holder.innerHTML = '';
    var g = groups[gi];
    holder.classList.toggle('is-spread', mode === 'spread');
    holder.classList.toggle('is-single-in-spread', mode === 'spread' && g.length === 1);
    g.forEach(function (i) { holder.appendChild(pageEl(i)); });
    var first = g[0] + 1, lastP = g[g.length - 1] + 1;
    var label = first === lastP ? first + ' / ' + N : first + '–' + lastP + ' / ' + N;
    countEl.textContent = label;
    range.value = String(first);
    stage.setAttribute('aria-label', D.title + '　' + label + 'ページ');
    updateButtons();
    preload(gi + 1); preload(gi + 2); preload(gi - 1);
    save();
  }
  function updateButtons() {
    var atFirst = gi === 0, atLast = gi === groups.length - 1;
    // 右開き：左ボタン＝次、右ボタン＝前
    btnLeft.disabled = rtl ? false : atFirst;
    btnRight.disabled = rtl ? atFirst : false;
    if (rtl) btnLeft.setAttribute('aria-label', atLast ? '最後のページ。話の終わりへ' : '次のページ');
    else btnRight.setAttribute('aria-label', atLast ? '最後のページ。話の終わりへ' : '次のページ');
  }
  function next() {
    if (gi < groups.length - 1) { gi++; render(); }
    else { save({ done: true }); endEl.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'start' }); }
  }
  function prev() { if (gi > 0) { gi--; render(); } }
  function goLeft() { rtl ? next() : prev(); }
  function goRight() { rtl ? prev() : next(); }
  function reduced() { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

  btnLeft.addEventListener('click', goLeft);
  btnRight.addEventListener('click', goRight);
  range.addEventListener('input', function () { gi = groupOfPage(Number(range.value) - 1); render(); });

  // タップ（左右の端でページ送り、中央は何もしない）
  R.querySelector('[data-tap="left"]').addEventListener('click', function () { if (!zoomedByPinch()) goLeft(); });
  R.querySelector('[data-tap="right"]').addEventListener('click', function () { if (!zoomedByPinch()) goRight(); });

  // キーボード（ビューアが画面に見えているときのみ）
  document.addEventListener('keydown', function (e) {
    if (mode === 'scroll' || e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test((e.target.tagName || '')) && e.target !== range) return;
    if (document.querySelector('dialog[open]')) return;
    var r = stage.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return;
    if (e.key === 'ArrowLeft') { e.preventDefault(); goLeft(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); goRight(); }
    else if (e.key === ' ' && e.target === document.body) { e.preventDefault(); e.shiftKey ? prev() : next(); }
  });

  // スワイプ：右開きは指を右へ動かすと次のページ
  var sx = 0, sy = 0, st = 0, multi = false;
  function zoomedByPinch() { return window.visualViewport && window.visualViewport.scale > 1.05; }
  stage.addEventListener('touchstart', function (e) {
    multi = e.touches.length > 1;
    if (multi) return;
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; st = Date.now();
  }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (multi || zoomedByPinch()) return;
    var t = e.changedTouches[0];
    var dx = t.clientX - sx, dy = t.clientY - sy;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5 && Date.now() - st < 800) {
      if (dx > 0) { rtl ? next() : prev(); } else { rtl ? prev() : next(); }
    }
  }, { passive: true });

  // ---- 縦スクロールモード -------------------------------------------------
  var scrollIndex = 0;
  var io = null;
  function watchScroll() {
    if (!('IntersectionObserver' in window)) return;
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          scrollIndex = Number(en.target.getAttribute('data-index'));
          countEl.textContent = (scrollIndex + 1) + ' / ' + N;
          save();
        }
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    scrollList.querySelectorAll('[data-index]').forEach(function (li) { io.observe(li); });
  }
  // 縦スクロールの画像読み込み失敗にも再読み込みボタン
  scrollList.querySelectorAll('img').forEach(function (img, i) {
    img.addEventListener('error', function () {
      var li = img.parentNode;
      if (li.querySelector('.mpage__error')) return;
      var box = document.createElement('div'); box.className = 'mpage__error';
      box.innerHTML = '<p>画像を読み込めませんでした。</p>';
      var b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn--secondary'; b.textContent = 'もう一度読み込む';
      b.addEventListener('click', function () { box.remove(); img.src = pages[i].src + '?retry=' + Date.now(); });
      box.appendChild(b); li.style.position = 'relative'; li.appendChild(box);
    });
  });

  // ---- モード切替 --------------------------------------------------------
  function setMode(m, keepPage) {
    var p = keepPage != null ? keepPage : currentPage();
    mode = m;
    R.setAttribute('data-mode', m);
    var input = modeSwitch.querySelector('input[value="' + m + '"]');
    if (input) input.checked = true;
    groups = groupsFor(m === 'scroll' ? 'single' : m);
    if (m === 'scroll') {
      if (!io) watchScroll();
      scrollIndex = p;
      var li = scrollList.querySelector('[data-index="' + p + '"]');
      if (li && p > 0) li.scrollIntoView({ block: 'start' });
      countEl.textContent = (p + 1) + ' / ' + N;
    } else {
      gi = groupOfPage(p);
      render();
    }
  }
  modeSwitch.addEventListener('change', function (e) {
    if (e.target.name !== 'manga-mode') return;
    store.set('manga:settings', { mode: e.target.value });
    setMode(e.target.value);
  });
  function syncSpreadAvailability() {
    var ok = canSpread();
    spreadOpt.hidden = !ok;
    if (!ok && mode === 'spread') setMode('single');
  }
  window.addEventListener('resize', syncSpreadAvailability);

  // ---- 拡大表示 ----------------------------------------------------------
  var zd = R.querySelector('[data-zoom-dialog]');
  var zb = R.querySelector('[data-zoom-body]');
  var zl = R.querySelector('[data-zoom-label]');
  var zoomBtn = R.querySelector('[data-zoom-btn]');
  function openZoom() {
    if (!zd || typeof zd.showModal !== 'function') { window.open(pages[currentPage()].src, '_blank', 'noopener'); return; }
    var i = currentPage();
    zb.innerHTML = ''; zb.classList.remove('is-2x');
    var img = new Image(); img.src = pages[i].src; img.alt = pages[i].alt || ''; img.width = pages[i].width; img.height = pages[i].height;
    img.addEventListener('click', function () { zb.classList.toggle('is-2x'); });
    zb.appendChild(img);
    zl.textContent = (i + 1) + 'ページ目　画像をタップで2倍／ピンチで拡大';
    zd.showModal();
  }
  zoomBtn.addEventListener('click', openZoom);
  R.querySelector('[data-zoom-close]').addEventListener('click', function () { zd.close(); });
  zd.addEventListener('close', function () { zoomBtn.focus(); });
  // 中央タップでも拡大
  R.querySelector('[data-tap="center"]').addEventListener('dblclick', openZoom);

  // ---- トースト -----------------------------------------------------------
  function toast(msg, actions) {
    toastEl.innerHTML = '';
    var p = document.createElement('p'); p.textContent = msg; toastEl.appendChild(p);
    if (actions) {
      var row = document.createElement('div'); row.className = 'toast__actions';
      actions.forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = a.label;
        if (a.primary) b.className = 'is-primary';
        b.addEventListener('click', function () { toastEl.hidden = true; a.fn(); });
        row.appendChild(b);
      });
      toastEl.appendChild(row);
    }
    toastEl.hidden = false;
    setTimeout(function () { toastEl.hidden = true; }, 8000);
  }

  // ---- 開始 -------------------------------------------------------------
  syncSpreadAvailability();
  var resumePage = mine.page && mine.page > 1 && mine.page < N && !mine.done ? mine.page - 1 : 0;
  setMode(mode, resumePage);
  if (resumePage > 0) {
    toast('前回の続き（' + (resumePage + 1) + 'ページ）から表示しています。', [
      { label: '最初から読む', fn: function () { setMode(mode, 0); if (mode === 'scroll') window.scrollTo(0, 0); } }
    ]);
  }
})();
