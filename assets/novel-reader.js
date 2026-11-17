/* 小説リーダー：表示設定・読書位置・しおり・既読 */
(function () {
  'use strict';
  var reader = document.querySelector('[data-novel-reader]');
  if (!reader || !window.NinaMel) return;
  var store = window.NinaMel.store;
  var slug = reader.getAttribute('data-slug');
  var title = reader.getAttribute('data-title');
  var route = reader.getAttribute('data-route');
  var scroller = reader.querySelector('[data-scroller]');
  var text = reader.querySelector('[data-novel-text]');
  var bar = reader.querySelector('[data-progress-bar]');
  var endEl = reader.querySelector('[data-reader-end]');
  var toastEl = reader.querySelector('[data-toast]');

  // ---- 表示設定 -----------------------------------------------------------
  var DEFAULTS = { size: 18, lh: '2.0', theme: 'kinari', font: 'mincho', mode: 'h' };
  var settings = Object.assign({}, DEFAULTS, store.get('novel:settings', {}));
  if (window.matchMedia && window.matchMedia('(max-width: 380px)').matches && !store.get('novel:settings', null)) settings.size = 17;

  function apply() {
    reader.style.setProperty('--rs-size', settings.size + 'px');
    reader.style.setProperty('--rs-lh', settings.lh);
    reader.setAttribute('data-theme', settings.theme);
    reader.setAttribute('data-font', settings.font);
    reader.setAttribute('data-mode', settings.mode);
    var bg = getComputedStyle(reader).getPropertyValue('--r-bg');
    document.body.style.setProperty('--r-page-bg', bg);
    ['size', 'lh', 'theme', 'font', 'mode'].forEach(function (k) {
      var input = reader.querySelector('input[name="rs-' + k + '"][value="' + settings[k] + '"]');
      if (input) input.checked = true;
    });
    layoutPages();
  }

  var panel = reader.querySelector('#reader-settings');
  var sBtn = reader.querySelector('[data-settings-btn]');
  sBtn.addEventListener('click', function () {
    var open = panel.hidden;
    panel.hidden = !open;
    sBtn.setAttribute('aria-expanded', String(open));
    if (open) { var c = panel.querySelector('input:checked'); if (c) c.focus(); }
  });
  panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') { panel.hidden = true; sBtn.setAttribute('aria-expanded', 'false'); sBtn.focus(); } });
  panel.addEventListener('change', function (e) {
    var m = /^rs-(\w+)$/.exec(e.target.name || '');
    if (!m) return;
    var r = ratio();
    settings[m[1]] = m[1] === 'size' ? Number(e.target.value) : e.target.value;
    store.set('novel:settings', settings);
    apply();
    // 組み方や文字サイズを変えても、読んでいた位置を保つ
    requestAnimationFrame(function () { goTo(r); });
  });
  reader.querySelector('[data-settings-reset]').addEventListener('click', function () {
    var r = ratio();
    settings = Object.assign({}, DEFAULTS);
    store.set('novel:settings', settings);
    apply();
    requestAnimationFrame(function () { goTo(r); });
  });

  // ---- 縦書き：Kindle のようなページめくり ---------------------------------
  // 本文枠の幅を「1行の幅（文字サイズ×行間）」の倍数にして、ページの境目で行が切れないようにする。
  // 次のページ＝左へ。左側タップ／右へスワイプ／← キーで進む。
  var pager = reader.querySelector('[data-vpager]');
  var hint = reader.querySelector('[data-vpager-hint]');
  var nowEl = reader.querySelector('[data-vpage-now]');
  var totalEl = reader.querySelector('[data-vpage-total]');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var pageW = 0, pages = 1, page = 0, negScroll = null;
  function vertical() { return settings.mode === 'v'; }
  function scrollSign() {
    if (negScroll === null) {
      var before = scroller.scrollLeft;
      scroller.scrollLeft = -1;
      negScroll = scroller.scrollLeft < 0;
      scroller.scrollLeft = before;
    }
    return negScroll ? -1 : 1;
  }
  function layoutPages() {
    if (!scroller) return;
    var figs = text.querySelectorAll('.novel-illust, .body-heading');
    figs.forEach(function (f) { f.style.marginRight = ''; });
    if (!vertical()) {
      scroller.style.width = '';
      if (pager) pager.hidden = true;
      if (hint) hint.hidden = true;
      reader.style.removeProperty('--page-w');
      return;
    }
    var pitch = settings.size * Number(settings.lh);
    var avail = reader.clientWidth - 32;
    pageW = Math.max(pitch * 4, Math.floor(avail / pitch) * pitch);
    scroller.style.width = pageW + 'px';
    reader.style.setProperty('--page-w', pageW + 'px');
    // 挿絵と小見出しは、ページの頭から始まるようにずらす
    var right = text.getBoundingClientRect().right;
    figs.forEach(function (f) {
      var off = Math.round(right - f.getBoundingClientRect().right);
      if (f.classList.contains('novel-illust')) {
        var rem = ((off % pageW) + pageW) % pageW;
        if (rem) f.style.marginRight = (pageW - rem) + 'px';
      } else {
        var r2 = ((off % pitch) + pitch) % pitch;
        if (r2) f.style.marginRight = (pitch - r2) + 'px';
      }
    });
    pages = Math.max(1, Math.ceil((scroller.scrollWidth - 2) / pageW));
    if (pager) pager.hidden = false;
    if (hint) hint.hidden = false;
    totalEl.textContent = pages;
    setPage(Math.min(page, pages - 1), true, true);
  }
  function setPage(i, instant, silent) {
    page = Math.max(0, Math.min(pages - 1, i));
    scroller.scrollTo({ left: scrollSign() * page * pageW, behavior: instant || reduced ? 'auto' : 'smooth' });
    nowEl.textContent = page + 1;
    reader.querySelector('[data-vpage="next"]').disabled = false;
    reader.querySelector('[data-vpage="prev"]').disabled = page === 0;
    if (!silent) { alignView(); onScroll(); scheduleSave(); }
  }
  // ページをめくったら、本文の枠が画面にきちんと収まる位置に合わせる
  function alignView() {
    var hh = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 64;
    var r = scroller.getBoundingClientRect();
    if (r.top < hh - 2 || r.bottom > window.innerHeight + 2) window.scrollTo({ top: Math.max(0, r.top + window.scrollY - hh - 8), behavior: reduced ? 'auto' : 'smooth' });
  }
  function next() {
    if (page < pages - 1) setPage(page + 1);
    else if (endEl) { save({ done: true }); endEl.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' }); }
  }
  function prev() { if (page > 0) setPage(page - 1); }
  if (pager) {
    pager.addEventListener('click', function (e) {
      var b = e.target.closest('[data-vpage]'); if (!b) return;
      if (b.getAttribute('data-vpage') === 'next') next(); else prev();
    });
    // タップ：左 4 割で次、右 4 割で前
    scroller.addEventListener('click', function (e) {
      if (!vertical() || e.target.closest('a, button')) return;
      if (window.getSelection && String(window.getSelection())) return;
      var rect = scroller.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width;
      if (x < 0.4) next(); else if (x > 0.6) prev();
    });
    // スワイプ：右へ払うと次、左へ払うと前
    var sx = null, sy = 0;
    scroller.addEventListener('touchstart', function (e) { if (!vertical() || e.touches.length !== 1) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    scroller.addEventListener('touchend', function (e) {
      if (sx === null || !vertical()) return;
      var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy;
      sx = null;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { e.preventDefault(); if (dx > 0) next(); else prev(); }
    });
    document.addEventListener('keydown', function (e) {
      if (!vertical() || e.altKey || e.ctrlKey || e.metaKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName)) return;
      if (e.key === 'ArrowLeft' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); next(); }
      else if (e.key === 'ArrowRight' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); prev(); }
    });
    var rz = null;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(function () { if (vertical()) { var r = ratio(); layoutPages(); goTo(r); } }, 150); });
  }

  // ---- 位置の計算（横書き＝ページのスクロール、縦書き＝ページ番号） ----------
  function ratio() {
    if (vertical()) return pages > 1 ? page / (pages - 1) : 1;
    var rect = text.getBoundingClientRect();
    var total = rect.height - window.innerHeight * 0.6;
    if (total <= 0) return 1;
    return Math.max(0, Math.min(1, (-rect.top + window.innerHeight * 0.2) / total));
  }
  function goTo(r) {
    if (vertical()) {
      setPage(Math.round(r * (pages - 1)), true);
      var top = scroller.getBoundingClientRect().top + window.scrollY - 140;
      window.scrollTo(0, Math.max(0, top));
      return;
    }
    var rect = text.getBoundingClientRect();
    var total = rect.height - window.innerHeight * 0.6;
    var y = rect.top + window.scrollY + r * total - window.innerHeight * 0.2;
    window.scrollTo(0, Math.max(0, y));
  }

  apply();

  // ---- 進捗の保存 ---------------------------------------------------------
  var all = store.get('novel:progress', {}) || {};
  var mine = all[slug] || {};
  var saved = mine.bookmark != null ? mine.bookmark : mine.ratio;
  function save(extra) {
    all = store.get('novel:progress', {}) || {};
    var cur = all[slug] || {};
    var r = ratio();
    cur.ratio = Math.round(r * 1000) / 1000;
    cur.at = Date.now();
    if (r > 0.97) cur.done = true;
    Object.assign(cur, extra || {});
    all[slug] = cur;
    store.set('novel:progress', all);
    var lastEntry = { kind: 'novel', route: route, title: title, at: Date.now() };
    store.set('last', lastEntry);
    store.set('novel:last', lastEntry);
  }
  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      var r = ratio();
      if (bar) bar.style.width = (r * 100).toFixed(1) + '%';
    });
  }
  var saveTimer = null;
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
  window.addEventListener('scroll', function () { onScroll(); scheduleSave(); }, { passive: true });
  scroller.addEventListener('scroll', function () { onScroll(); scheduleSave(); }, { passive: true });
  window.addEventListener('pagehide', function () { save(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) save(); });

  // 末尾まで来たら既読
  if ('IntersectionObserver' in window && endEl) {
    new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) save({ done: true }); });
    }, { threshold: 0.2 }).observe(endEl);
  }

  // ---- しおり ---------------------------------------------------------------
  var bmBtn = reader.querySelector('[data-bookmark-btn]');
  var bmLabel = reader.querySelector('[data-bookmark-label]');
  function updateBm() {
    var has = ((store.get('novel:progress', {}) || {})[slug] || {}).bookmark != null;
    bmBtn.setAttribute('aria-pressed', String(has));
    bmLabel.textContent = has ? 'しおりを移動' : 'しおり';
  }
  bmBtn.addEventListener('click', function () {
    var ok = save({ bookmark: Math.round(ratio() * 1000) / 1000 });
    updateBm();
    var stored = ((store.get('novel:progress', {}) || {})[slug] || {}).bookmark != null;
    toast(stored ? 'この位置にしおりを挟みました。' : 'このブラウザでは保存できないため、しおりを記録できませんでした。');
  });
  updateBm();

  // ---- トースト -------------------------------------------------------------
  var toastTimer = null;
  function toast(msg, actions) {
    clearTimeout(toastTimer);
    toastEl.innerHTML = '';
    var p = document.createElement('p'); p.textContent = msg; toastEl.appendChild(p);
    if (actions && actions.length) {
      var row = document.createElement('div'); row.className = 'toast__actions';
      actions.forEach(function (a) {
        var b = document.createElement('button'); b.type = 'button'; b.textContent = a.label;
        if (a.primary) b.className = 'is-primary';
        b.addEventListener('click', function () { toastEl.hidden = true; a.fn && a.fn(); });
        row.appendChild(b);
      });
      toastEl.appendChild(row);
    }
    toastEl.hidden = false;
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, actions ? 12000 : 3000);
  }

  // ---- 前回の位置から再開 ------------------------------------------------
  // 前回の位置は保存だけしておき、初回表示は記録を書き換えない
  var lastEntry = { kind: 'novel', route: route, title: title, at: Date.now() };
  store.set('last', lastEntry);
  store.set('novel:last', lastEntry);
  if (saved != null && saved > 0.03 && saved < 0.97 && !mine.done) {
    toast('前回の続きから読みますか？（' + Math.round(saved * 100) + '%の位置）', [
      { label: '最初から', fn: function () {} },
      { label: '続きから', primary: true, fn: function () { goTo(saved); } }
    ]);
  }
  onScroll();
})();
