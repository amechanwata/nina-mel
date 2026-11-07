/* 『ニナとメル』共通スクリプト
   - 保存はこのブラウザの localStorage のみ。保存できない環境でも閲覧・読書は可能。 */
(function () {
  'use strict';
  var KEY = 'ninamel:v1:';
  var store = {
    get: function (k, fallback) {
      try { var v = window.localStorage.getItem(KEY + k); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
    },
    set: function (k, v) {
      try { window.localStorage.setItem(KEY + k, JSON.stringify(v)); return true; } catch (e) { return false; }
    },
    clear: function () {
      try {
        var ls = window.localStorage, ks = [];
        for (var i = 0; i < ls.length; i++) { var key = ls.key(i); if (key && key.indexOf(KEY) === 0) ks.push(key); }
        ks.forEach(function (key) { ls.removeItem(key); });
        return true;
      } catch (e) { return false; }
    }
  };
  var html = document.documentElement;
  var root = html.getAttribute('data-root') || './';
  var fileStyle = html.getAttribute('data-linkstyle') === 'file';
  function href(route) {
    route = route || '';
    if (fileStyle && (route === '' || /\/$/.test(route))) route += 'index.html';
    return root + route;
  }
  function today() {
    var d = new Date(Date.now() + 9 * 3600e3); // 日本時間
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) { return Math.round((Date.parse(b) - Date.parse(a)) / 864e5); }
  window.NinaMel = { store: store, href: href, today: today };

  // 進捗の読み取り
  function progress(kind) { return store.get(kind + ':progress', {}) || {}; }
  function last() { return store.get('last', null); }

  // ---- 続きから読む -------------------------------------------------------
  var lastRead = last();
  var pill = document.querySelector('[data-continue]');
  if (pill && lastRead && lastRead.route) {
    pill.setAttribute('href', href(lastRead.route));
    var lbl = pill.querySelector('[data-continue-label]');
    if (lbl) lbl.textContent = '続きから読む';
    pill.setAttribute('aria-label', '続きから読む：' + (lastRead.kind === 'manga' ? '漫画 ' : '小説 ') + (lastRead.title || ''));
    pill.title = lastRead.title || '';
  }
  // 一覧ページの「続きから」パネル
  document.querySelectorAll('[data-resume-panel]').forEach(function (panel) {
    var kind = panel.getAttribute('data-resume-panel');
    var l = store.get(kind + ':last', null);
    var btn = panel.querySelector('[data-resume-btn]');
    if (!btn || !l || !l.route) return;
    btn.setAttribute('href', href(l.route));
    var t = btn.querySelector('[data-resume-label]');
    if (t) t.textContent = '続きから読む：' + (l.title || '');
    var first = document.createElement('a');
    first.className = 'btn btn--ghost';
    first.textContent = '第1話から読む';
    var firstLink = document.querySelector('[data-ep-kind="' + kind + '"]');
    if (firstLink) { first.setAttribute('href', firstLink.getAttribute('href')); panel.appendChild(first); }
  });
  // トップのCTA
  var nl = store.get('novel:last', null);
  var cn = document.querySelector('[data-cta-novel] span');
  if (nl && cn) { cn.textContent = '小説の続きを読む'; cn.parentNode.setAttribute('href', href(nl.route)); }
  var ml = store.get('manga:last', null);
  var cm = document.querySelector('[data-cta-manga] span');
  if (ml && cm) { cm.textContent = '漫画の続きを読む'; cm.parentNode.setAttribute('href', href(ml.route)); }

  // ---- NEW / 既読 / 読みかけ ---------------------------------------------
  var newDays = 14;
  var t = today();
  var prog = { novel: progress('novel'), manga: progress('manga') };
  document.querySelectorAll('[data-ep-slug]').forEach(function (el) {
    var kind = el.getAttribute('data-ep-kind');
    var slug = el.getAttribute('data-ep-slug');
    var pub = el.getAttribute('data-published');
    var p = (prog[kind] || {})[slug];
    var badges = el.querySelector('[data-badges]');
    if (!badges) return;
    function badge(cls, text) { var b = document.createElement('span'); b.className = 'badge ' + cls; b.textContent = text; badges.appendChild(b); }
    if (p && p.done) { badge('badge--read', '既読'); el.setAttribute('data-ep-state', 'read'); }
    else if (p && (p.ratio > 0.02 || p.page > 1)) { badge('badge--reading', '読みかけ'); el.setAttribute('data-ep-state', 'reading'); }
    else if (pub && daysBetween(pub, t) <= newDays && daysBetween(pub, t) >= 0) badge('badge--new', 'NEW');
  });

  // ---- モバイルメニュー --------------------------------------------------
  var menuBtn = document.querySelector('[data-menu-btn]');
  var menu = document.getElementById('mobile-menu');
  if (menuBtn && menu) {
    var setOpen = function (open) {
      menu.hidden = !open;
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.querySelector('.sr-only').textContent = open ? 'メニューを閉じる' : 'メニューを開く';
    };
    menuBtn.addEventListener('click', function () { setOpen(menu.hidden); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !menu.hidden) { setOpen(false); menuBtn.focus(); } });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
  }

  // ---- ギャラリー --------------------------------------------------------
  var filter = document.querySelector('[data-gallery-filter]');
  if (filter) {
    filter.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-filter]');
      if (!b) return;
      var f = b.getAttribute('data-filter');
      filter.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      document.querySelectorAll('[data-group]').forEach(function (g) { g.hidden = f !== 'all' && g.getAttribute('data-group') !== f; });
    });
  }
  var lb = document.querySelector('[data-lightbox-dialog]');
  if (lb && typeof lb.showModal === 'function') {
    var lbImg = lb.querySelector('[data-lightbox-img]');
    var opener = null;
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-lightbox]');
      if (!b) return;
      opener = b;
      lbImg.src = b.getAttribute('data-src');
      lbImg.width = +b.getAttribute('data-w'); lbImg.height = +b.getAttribute('data-h');
      lbImg.alt = b.getAttribute('data-alt') || '';
      lb.querySelector('[data-lightbox-title]').textContent = b.getAttribute('data-title') || '';
      lb.querySelector('[data-lightbox-credit]').textContent = b.getAttribute('data-credit') || '';
      lb.querySelector('[data-lightbox-caption]').textContent = b.getAttribute('data-caption') || '';
      lb.showModal();
    });
    lb.querySelector('[data-lightbox-close]').addEventListener('click', function () { lb.close(); });
    lb.addEventListener('click', function (e) { if (e.target === lb) lb.close(); });
    lb.addEventListener('close', function () { if (opener) opener.focus(); });
  }

  // ---- 読書記録の消去 -----------------------------------------------------
  var clr = document.querySelector('[data-clear-storage]');
  if (clr) clr.addEventListener('click', function () {
    var ok = store.clear();
    var out = document.querySelector('[data-clear-result]');
    if (out) out.textContent = ok ? '消去しました。' : 'このブラウザでは保存領域を利用できないため、記録はありません。';
  });
})();
