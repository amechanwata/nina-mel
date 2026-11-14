/* キャラクター紹介ページ：スマホの切替・割り込みふきだし・ステータス・一問一答・ひみつタブ */
(function () {
  'use strict';
  var cp = document.querySelector('[data-cp]');
  if (!cp) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var narrow = window.matchMedia('(max-width: 899px)');

  // ---- 割り込みふきだし ---------------------------------------------------
  var pop = cp.querySelector('[data-interrupt]');
  var popImg = pop.querySelector('[data-interrupt-img]');
  var popWho = pop.querySelector('[data-interrupt-who]');
  var popText = pop.querySelector('[data-interrupt-text]');
  var popTimer = null;
  function hidePop() {
    clearTimeout(popTimer);
    if (pop.hidden) return;
    pop.classList.remove('is-in');
    setTimeout(function () { pop.hidden = true; }, reduced ? 0 : 220);
  }
  function interrupt(card) {
    if (!card || !card.getAttribute('data-interrupt-text')) return;
    var by = card.getAttribute('data-interrupt-by');
    clearTimeout(popTimer);
    popImg.src = card.getAttribute('data-interrupt-face');
    popImg.style.setProperty('--focus', card.getAttribute('data-interrupt-focus') || '50% 30%');
    popWho.textContent = card.getAttribute('data-interrupt-name');
    popText.textContent = '「' + card.getAttribute('data-interrupt-text') + '」';
    pop.setAttribute('data-by', by);
    pop.hidden = false;
    // 次のフレームで表示（スライドイン）
    requestAnimationFrame(function () { requestAnimationFrame(function () { pop.classList.add('is-in'); }); });
    popTimer = setTimeout(hidePop, 4500);
    popY = window.scrollY;
  }
  // 読み進めるためにスクロールしたら、すぐ引っ込む
  var popY = 0;
  window.addEventListener('scroll', function () { if (!pop.hidden && Math.abs(window.scrollY - popY) > 240) hidePop(); }, { passive: true });
  pop.querySelector('[data-interrupt-close]').addEventListener('click', hidePop);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hidePop(); });
  cp.querySelectorAll('.pcard').forEach(function (card) {
    card.addEventListener('click', function (e) {
      // カード内のリンクや、テキスト選択中は反応しない
      if (e.target.closest('a, summary') || (window.getSelection && String(window.getSelection()).length)) return;
      interrupt(card);
    });
  });

  // ---- スマホ：ニナ／メルの切替 -------------------------------------------
  var sw = cp.querySelector('[data-cp-switch]');
  var shownOnce = {};
  function show(id, fromUser) {
    cp.setAttribute('data-show', id);
    sw.querySelectorAll('[data-show]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-show') === id)); });
    if (fromUser && narrow.matches && !shownOnce[id]) {
      shownOnce[id] = true;
      var card = cp.querySelector('.pcard[data-char="' + id + '"]');
      setTimeout(function () { interrupt(card); }, 900);
    }
    runStats();
  }
  if (sw) {
    sw.hidden = false;
    show('nina', false);
    sw.addEventListener('click', function (e) {
      var b = e.target.closest('[data-show]');
      if (!b) return;
      show(b.getAttribute('data-show'), true);
      var sec = cp.querySelector('#sec-profile');
      if (sec && sec.getBoundingClientRect().top < 0) sec.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
    });
  }
  // ヒーローの半分をタップしたら、そのキャラを表示
  cp.querySelectorAll('.cp-hero__half').forEach(function (a) {
    a.addEventListener('click', function () { var id = a.getAttribute('href').slice(1); if (sw) show(id, true); });
  });

  // ---- ステータス：画面に入ったら横棒が伸びる ---------------------------
  var statsWrap = cp.querySelector('[data-stats]');
  function countUp(el) {
    var to = Number(el.getAttribute('data-count'));
    if (reduced) { el.textContent = to; return; }
    var t0 = null;
    function step(t) {
      if (!t0) t0 = t;
      var p = Math.min(1, (t - t0) / 900);
      el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function runStats() {
    if (!statsWrap || !statsWrap.classList.contains('is-in')) return;
    statsWrap.querySelectorAll('.manual').forEach(function (m) {
      if (m.offsetParent === null || m.classList.contains('is-done')) return; // 非表示のカードは表示されたときに
      m.classList.add('is-done');
      m.querySelectorAll('[data-count]').forEach(countUp);
    });
  }
  if (statsWrap && 'IntersectionObserver' in window && !reduced) {
    cp.classList.add('cp-anim');
    statsWrap.querySelectorAll('[data-count]').forEach(function (el) { el.textContent = '0'; });
    new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (en) { if (en.isIntersecting) { statsWrap.classList.add('is-in'); runStats(); obs.disconnect(); } });
    }, { threshold: 0.2 }).observe(statsWrap);
  }

  // ---- タブ（一問一答・ひみつ）共通 ---------------------------------------
  function tabs(list, onSelect) {
    var btns = Array.prototype.slice.call(list.querySelectorAll('[role="tab"]'));
    function select(b, focus, user) {
      btns.forEach(function (x) {
        var on = x === b;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(x.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) b.focus();
      if ((focus || user) && list.scrollWidth > list.clientWidth) list.scrollTo({ left: b.offsetLeft - (list.clientWidth - b.offsetWidth) / 2, behavior: reduced ? 'auto' : 'smooth' });
      if (onSelect) onSelect(document.getElementById(b.getAttribute('aria-controls')));
    }
    list.addEventListener('click', function (e) { var b = e.target.closest('[role="tab"]'); if (b) select(b, false, true); });
    list.addEventListener('keydown', function (e) {
      var i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      var n = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = btns[(i + 1) % btns.length];
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = btns[(i - 1 + btns.length) % btns.length];
      else if (e.key === 'Home') n = btns[0];
      else if (e.key === 'End') n = btns[btns.length - 1];
      if (n) { e.preventDefault(); select(n, true); }
    });
    var cur = btns.filter(function (b) { return b.getAttribute('aria-selected') === 'true'; })[0] || btns[0];
    select(cur);
  }
  var qaList = cp.querySelector('.qa__list');
  if (qaList) tabs(qaList, function (panel) {
    if (!panel || reduced) return;
    panel.classList.remove('is-play');
    void panel.offsetWidth; // アニメーションをやり直す
    panel.classList.add('is-play');
  });
  var secretList = cp.querySelector('.secret__tabs');
  if (secretList) tabs(secretList);
})();
