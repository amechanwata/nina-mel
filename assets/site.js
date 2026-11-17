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
  // 小説を非公開にしている間は、小説の読みかけは使わない（漫画の読みかけだけ）
  var novelOff = document.documentElement.hasAttribute('data-novel-off');
  if (novelOff && lastRead && lastRead.kind !== 'manga') lastRead = store.get('manga:last', null);
  var pill = document.querySelector('[data-continue]');
  if (pill && lastRead && lastRead.route) {
    pill.setAttribute('href', href(lastRead.route));
    var lbl = pill.querySelector('[data-continue-label]');
    if (lbl) lbl.textContent = '続きから読む';
    pill.setAttribute('aria-label', '続きから読む：' + (lastRead.kind === 'manga' ? '物語 ' : '小説 ') + (lastRead.title || ''));
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
  // 文言は「小説を読む」のまま。読みかけがあれば、行き先だけ続きへ
  if (nl && cn) { cn.parentNode.setAttribute('href', href(nl.route)); cn.parentNode.setAttribute('title', '続きから'); }
  var ml = store.get('manga:last', null);
  var cm = document.querySelector('[data-cta-manga] span');
  if (ml && cm) { cm.parentNode.setAttribute('href', href(ml.route)); cm.parentNode.setAttribute('title', '続きから'); }

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

// 4コマへの導線：端っこのボタン。新しい4コマが増えていたら NEW、まだ一度も見ていない人には一度だけふきだし
(function () {
  var latest = Number(document.documentElement.getAttribute('data-yk-latest')) || 0;
  if (!latest) return;
  var KEY = 'ninamel:v1:yonkoma:seen';
  var get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても使える */ } };
  var body = document.body.classList;
  // 4コマのページを開いたら「見た」ことにする
  if (body.contains('page-yonkoma') || body.contains('page-ykbook')) { set(KEY, String(latest)); return; }
  var fab = document.querySelector('[data-yk-fab]');
  if (!fab) return;
  var seen = Number(get(KEY)) || 0;
  var book = null; try { book = JSON.parse(get('ninamel:v1:yonkoma:book') || 'null'); } catch (e) { book = null; }
  if (book && Number(book.known) > seen) seen = Number(book.known);
  var nw = fab.querySelector('[data-yk-fab-new]');
  if (seen && latest > seen && nw) { nw.hidden = false; fab.setAttribute('aria-label', '4コマ（新しい4コマがあります）'); }
  // トップでは、最初の大きな絵を過ぎてから出す
  if (fab.classList.contains('is-wait')) {
    var check = function () { if (window.scrollY > window.innerHeight * 0.6) { fab.classList.remove('is-wait'); window.removeEventListener('scroll', check); } };
    window.addEventListener('scroll', check, { passive: true }); check();
  }
  // 一度も4コマを見ていない人に、1回の訪問につき一度だけふきだし（4秒で消える）
  var bubble = fab.querySelector('[data-yk-fab-bubble]');
  var shown = false; try { shown = sessionStorage.getItem('ninamel:ykbubble') === '1'; } catch (e) { shown = true; }
  if (!seen && bubble && !shown) {
    var pop = function () {
      if (fab.classList.contains('is-wait')) return setTimeout(pop, 800);
      bubble.hidden = false; requestAnimationFrame(function () { bubble.classList.add('is-in'); });
      try { sessionStorage.setItem('ninamel:ykbubble', '1'); } catch (e) { /* なし */ }
      setTimeout(function () { bubble.classList.remove('is-in'); setTimeout(function () { bubble.hidden = true; }, 400); }, 4200);
    };
    setTimeout(pop, 2500);
  }
})();


// 今日の4コマ：日付で1本選ぶ（同じ日は同じ1本、毎日かわる）
(function () {
  var box = document.querySelector('[data-yk-today]');
  var data = document.querySelector('[data-yk-today-data]');
  if (!box || !data) return;
  var list = []; try { list = JSON.parse(data.textContent); } catch (e) { return; }
  if (!list.length) return;
  var d = new Date(), day = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5);
  var y = list[(day * 7 + 3) % list.length];
  var panels = box.querySelector('[data-yk-today-panels]');
  panels.innerHTML = '';
  y.panels.forEach(function (p) {
    var im = document.createElement('img');
    im.src = p.src; im.width = p.w; im.height = p.h; im.alt = y.label + 'の4コマ'; im.loading = 'lazy'; im.decoding = 'async';
    panels.appendChild(im);
  });
  box.querySelector('[data-yk-today-label]').textContent = y.label;
  box.querySelector('[data-yk-today-title]').textContent = y.title ? '「' + y.title + '」' : '';
})();

// 読者の応援（♡）。押すと♡が色づき「ありがとうございます」。数はアクセス解析（イベント reaction）にだけ送る。
// 同じ話は1台につき1日1回だけ数える（その日のうちは色づいたまま）
(function () {
  var bars = document.querySelectorAll('[data-react]');
  if (!bars.length) return;
  var KEY = 'ninamel:v1:react', DEF = '気に入ったら♡で応援お願いします', THX = '応援ありがとうございます';
  var today = new Date().toISOString().slice(0, 10);
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
  function save(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* 保存できなくても使える */ } }
  // ♡の数を貯める場所（Firebase の Firestore）。設定があるときだけ。ドキュメント likes/{種類}-{話} の n を 1 増やす
  var LK = (document.documentElement.getAttribute('data-likes') || '').split('|');
  function sendLike(kind, id) {
    if (!LK[0] || !LK[1] || !window.fetch) return;
    var doc = 'projects/' + LK[0] + '/databases/(default)/documents/likes/' + kind + '-' + id;
    try {
      fetch('https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(LK[0]) + '/databases/(default)/documents:commit?key=' + encodeURIComponent(LK[1]), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
        body: JSON.stringify({ writes: [{ transform: { document: doc, fieldTransforms: [{ fieldPath: 'n', increment: { integerValue: '1' } }] } }] })
      }).catch(function () { /* 届かなくても表示はそのまま */ });
    } catch (e) { /* なし */ }
  }
  function setup(bar) {
    var btn = bar.querySelector('[data-r]'), text = bar.querySelector('[data-react-text]');
    function id() { return bar.getAttribute('data-kind') + ':' + bar.getAttribute('data-id'); }
    function mark() { var on = load()[id()] === today; btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); text.textContent = on ? THX : DEF; }
    bar.addEventListener('react:reset', mark);
    mark();
    btn.addEventListener('click', function () {
      if (!bar.getAttribute('data-id')) return;
      var st = load(), k = id();
      if (st[k] !== today) {
        Object.keys(st).forEach(function (x) { if (st[x] !== today) delete st[x]; });
        st[k] = today; save(st);
        if (typeof window.gtag === 'function') window.gtag('event', 'reaction', { reaction: 'like', content_type: bar.getAttribute('data-kind'), content_id: bar.getAttribute('data-id') });
        sendLike(bar.getAttribute('data-kind'), bar.getAttribute('data-id'));
      }
      btn.classList.remove('is-pop'); void btn.offsetWidth; btn.classList.add('is-pop');
      mark();
    });
  }
  bars.forEach(setup);
})();
