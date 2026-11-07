/* おまけ4コマ：本のように読む
   - 1ページ＝1本。表紙 → その1 → … → 最新 → おわり。新しい4コマは後ろに増える。
   - 右から左へめくる（次＝左）。左側タップ／右へスワイプ／← キーで次。
   - PC の横長画面では見開き（右ページが先）。
   - 読んだ位置と「どこまで読んだか」をこの端末に保存。次に開いたとき、増えた4コマから読める。 */
(function () {
  'use strict';
  var root = document.querySelector('[data-ykb]');
  if (!root) return;
  var data = JSON.parse(root.querySelector('[data-ykb-data]').textContent);
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var KEY = 'ninamel:v1:yonkoma:book';
  var load = function () { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  var save = function (o) { try { localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* 保存できなくても読める */ } };
  var saved = load();
  // known＝前に開いたときにあった、いちばん新しい番号。これより大きい番号が「増えた4コマ」
  var seenAtOpen = Number(saved.known) || 0;

  // ページの並び
  var pages = [{ type: 'cover' }].concat(data.strips.map(function (s) { return { type: 'strip', s: s }; }), [{ type: 'end' }]);
  var stage = root.querySelector('[data-stage]');
  var viewEl = root.querySelector('[data-view]');
  var nowEl = root.querySelector('[data-now]');
  var countEl = root.querySelector('[data-count]');
  var range = root.querySelector('[data-range]');
  var commentEl = root.querySelector('[data-comment]');
  var toast = root.querySelector('[data-toast]');
  var esc = function (t) { return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var label = function (p) { return p.type === 'cover' ? '表紙' : p.type === 'end' ? 'おわり' : 'その' + p.s.n + (p.s.title ? '　' + p.s.title : ''); };
  var isNew = function (p) { return p.type === 'strip' && seenAtOpen > 0 && p.s.n > seenAtOpen; };

  // 見開きかどうか（横長で広い画面）
  var spread = false;
  var views = [];
  function buildViews() {
    spread = window.innerWidth >= 1000 && window.innerWidth > window.innerHeight * 1.15;
    views = [];
    if (!spread) { pages.forEach(function (_, i) { views.push([i]); }); return; }
    views.push([0]); // 表紙は1枚で
    for (var i = 1; i < pages.length; i += 2) views.push(i + 1 < pages.length ? [i, i + 1] : [i]);
  }
  function viewOf(pageIndex) { for (var v = 0; v < views.length; v++) if (views[v].indexOf(pageIndex) > -1) return v; return 0; }

  function pageHtml(i) {
    var p = pages[i];
    if (p.type === 'cover') return '<figure class="ykb-page ykb-page--cover"><img src="' + esc(data.cover.src) + '" width="' + data.cover.width + '" height="' + data.cover.height + '" alt="' + esc(data.cover.alt) + '"></figure>';
    if (p.type === 'end') {
      return '<div class="ykb-page ykb-page--end"><div class="ykb-end">' +
        '<img src="' + esc(data.endImg) + '" width="323" height="307" alt="">' +
        '<p class="ykb-end__big">ここまで全部読みました！</p>' +
        '<p class="ykb-end__small">新しい4コマは、この本の後ろに増えていきます。<br>次に開いたとき、増えたところから読めます。</p>' +
        '<div class="ykb-end__btns"><button class="btn btn--secondary" type="button" data-jump="1">最初から読む</button>' +
        '<a class="btn btn--ghost" href="' + esc(data.links.list) + '">一覧で見る</a>' +
        '<a class="btn btn--primary" href="' + esc(data.links.novel) + '">小説も読む</a></div></div></div>';
    }
    var s = p.s;
    return '<figure class="ykb-page ykb-page--strip" aria-label="' + esc(label(p)) + '">' +
      '<figcaption class="ykb-page__title"><span class="ykb-page__no">その' + s.n + '</span>' + esc(s.title) + (isNew(p) ? '<span class="ykb-new">NEW</span>' : '') + '</figcaption>' +
      '<div class="ykb-strip' + (s.panels.length > 1 ? ' ykb-strip--multi' : '') + '">' +
      s.panels.map(function (im) { return '<span class="ykb-cell"><img src="' + esc(im.src) + '" width="' + im.width + '" height="' + im.height + '" alt="' + esc(im.alt) + '" decoding="async"></span>'; }).join('') +
      '</div></figure>';
  }

  var cur = 0; // いまの見開き（views の番号）
  function render(dir) {
    var idx = views[cur];
    // 右から左へ：見開きでは若いページが右
    var html = idx.slice().reverse().map(pageHtml).join('');
    viewEl.className = 'ykb-view' + (idx.length === 2 ? ' is-spread' : '') + (dir && !reduced ? ' is-turn-' + dir : '');
    viewEl.innerHTML = html;
    var first = pages[idx[0]], last = pages[idx[idx.length - 1]];
    nowEl.textContent = idx.length === 2 ? label(first) + '／' + label(last) : label(first);
    var pn = idx[0] + 1;
    countEl.textContent = (idx.length === 2 ? pn + '–' + (pn + 1) : pn) + ' / ' + pages.length;
    range.max = pages.length; range.value = pn;
    root.querySelector('[data-go="prev"]').disabled = cur === 0;
    root.querySelector('[data-go="next"]').disabled = cur === views.length - 1;
    // 作者のひとこと
    var cms = idx.map(function (i) { return pages[i]; }).filter(function (p) { return p.type === 'strip' && p.s.comment; });
    commentEl.hidden = !cms.length;
    commentEl.innerHTML = cms.map(function (p) {
      return '<p class="ykb-comment__row"><span class="ykb-comment__faces">' + p.s.faces.map(function (f) { return '<img src="' + esc(f) + '" width="240" height="240" alt="">'; }).join('') + '</span>' +
        '<span class="ykb-comment__bubble"><span class="sr-only">作者より：</span>' + esc(p.s.comment) + '</span></p>';
    }).join('');
    // 先読み
    [cur - 1, cur + 1, cur + 2].forEach(function (v) { if (!views[v]) return; views[v].forEach(function (i) { var p = pages[i]; if (p.type === 'strip') p.s.panels.forEach(function (im) { var x = new Image(); x.src = im.src; }); }); });
    // 位置の保存とアドレス（共有しやすいように #y-009）
    var strip = idx.map(function (i) { return pages[i]; }).filter(function (p) { return p.type === 'strip'; });
    var st = load();
    st.at = strip.length ? strip[0].s.n : (pages[idx[0]].type === 'end' ? -1 : 0);
    st.known = lastN();
    save(st);
    if (history.replaceState) history.replaceState(null, '', strip.length ? '#y-' + strip[0].s.slug : location.pathname + location.search);
  }
  function lastN() { return data.strips.reduce(function (m, s) { return Math.max(m, s.n); }, 0); }
  function go(v, dir) { if (v < 0 || v >= views.length || v === cur) return; cur = v; render(dir); }
  function next() { go(cur + 1, 'next'); }
  function prev() { go(cur - 1, 'prev'); }
  function showToast(t) {
    toast.textContent = t; toast.hidden = false; toast.classList.add('is-show');
    clearTimeout(showToast.t); showToast.t = setTimeout(function () { toast.classList.remove('is-show'); setTimeout(function () { toast.hidden = true; }, 300); }, 3600);
  }

  // 操作
  root.querySelector('[data-go="next"]').addEventListener('click', next);
  root.querySelector('[data-go="prev"]').addEventListener('click', prev);
  root.querySelectorAll('[data-tap]').forEach(function (b) { b.addEventListener('click', function () { if (b.getAttribute('data-tap') === 'next') next(); else prev(); }); });
  range.addEventListener('input', function () { go(viewOf(Number(range.value) - 1)); });
  viewEl.addEventListener('click', function (e) { var j = e.target.closest('[data-jump]'); if (j) go(viewOf(Number(j.getAttribute('data-jump')) - 1), 'next'); });
  var sx = null, sy = 0;
  stage.addEventListener('touchstart', function (e) { if (e.touches.length !== 1) { sx = null; return; } sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  stage.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var t = e.changedTouches[0], dx = t.clientX - sx, dy = t.clientY - sy; sx = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) { if (dx > 0) next(); else prev(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.altKey || e.ctrlKey || e.metaKey || document.querySelector('dialog[open]')) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName) && document.activeElement !== range) return;
    if (e.key === 'ArrowLeft' || e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey)) { e.preventDefault(); next(); }
    else if (e.key === 'ArrowRight' || e.key === 'PageUp' || (e.key === ' ' && e.shiftKey)) { e.preventDefault(); prev(); }
  });
  var rz = null;
  window.addEventListener('resize', function () {
    clearTimeout(rz);
    rz = setTimeout(function () { var keep = views[cur] ? views[cur][0] : 0; var was = spread; buildViews(); if (was !== spread) { cur = viewOf(keep); render(); } }, 150);
  });

  // 目次
  var toc = root.querySelector('[data-toc]');
  root.querySelector('[data-toc-open]').addEventListener('click', function () {
    var list = root.querySelector('[data-toc-list]');
    var here = views[cur];
    list.innerHTML = pages.map(function (p, i) {
      if (p.type === 'end') return '';
      return '<li><button type="button" data-toc-go="' + i + '"' + (here.indexOf(i) > -1 ? ' aria-current="page"' : '') + '><span class="ykb-toc__no">' + (p.type === 'cover' ? '表紙' : 'その' + p.s.n) + '</span><span>' + (p.type === 'cover' ? 'おまけ4コマ' : esc(p.s.title)) + '</span>' + (isNew(p) ? '<span class="ykb-new">NEW</span>' : '') + '</button></li>';
    }).join('');
    if (toc.showModal) toc.showModal(); else toc.setAttribute('open', '');
    var c = list.querySelector('[aria-current]'); if (c) c.scrollIntoView({ block: 'center' });
  });
  toc.addEventListener('click', function (e) {
    var b = e.target.closest('[data-toc-go]');
    if (b) { toc.close(); go(viewOf(Number(b.getAttribute('data-toc-go'))), 'next'); return; }
    if (e.target.closest('[data-toc-close]') || e.target === toc) toc.close();
  });

  // 開いたときの位置：#y-009 → その本。増えていれば増えたところから。前回の続き。はじめては表紙
  buildViews();
  var startPage = 0;
  var m = location.hash.match(/^#y-(.+)$/);
  var bySlug = function (slug) { for (var i = 0; i < pages.length; i++) if (pages[i].type === 'strip' && pages[i].s.slug === slug) return i; return -1; };
  var newCount = data.strips.filter(function (s) { return seenAtOpen > 0 && s.n > seenAtOpen; }).length;
  if (m && bySlug(m[1]) > -1) startPage = bySlug(m[1]);
  else if (newCount) {
    for (var i = 0; i < pages.length; i++) if (pages[i].type === 'strip' && pages[i].s.n > seenAtOpen) { startPage = i; break; }
    showToast('新しい4コマが ' + newCount + ' 本増えました！');
  } else if (Number(saved.at) > 0) {
    for (var k = 0; k < pages.length; k++) if (pages[k].type === 'strip' && pages[k].s.n === Number(saved.at)) { startPage = k; break; }
    if (startPage) showToast('前回の続き（その' + saved.at + '）から');
  }
  cur = viewOf(startPage);
  render();
  root.classList.add('is-ready');
})();
