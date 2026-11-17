// IF ページ：会話ログ（タップで次のセリフ。自動再生はしない）と、秘密の設定（開閉）
(function () {
  'use strict';
  // ショーケース型（医療IFなど）：見えたらふわっと出す。動きを減らす設定・JS なしでは最初から全部見える
  var rv = document.querySelectorAll('[data-reveal]');
  if (rv.length && 'IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('mc-js');
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (x) { if (x.isIntersecting) { x.target.classList.add('is-in'); io.unobserve(x.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    rv.forEach(function (el) { io.observe(el); });
  }
  // 会話ログ：最初の1行だけ見せて、「つづき」かカードのタップで1行ずつ。JS がなければ全部見える
  // 広い画面では最初から全部見せる
  if (!window.matchMedia('(max-width: 759px)').matches) return setupSecret();
  document.querySelectorAll('[data-talk]').forEach(function (talk) {
    var lines = talk.querySelectorAll('[data-line]');
    var more = talk.querySelector('[data-talk-more]');
    if (lines.length < 2 || !more) return;
    var shown = 1;
    talk.classList.add('is-stepping');
    lines.forEach(function (l, i) { if (i > 0) l.hidden = true; });
    more.hidden = false;
    var step = function () {
      if (shown >= lines.length) return;
      lines[shown].hidden = false; lines[shown].classList.add('is-in'); shown++;
      if (shown >= lines.length) { more.hidden = true; talk.classList.remove('is-stepping'); talk.classList.add('is-done'); }
    };
    more.addEventListener('click', function (e) { e.stopPropagation(); step(); });
    talk.addEventListener('click', function (e) { if (!e.target.closest('a,button')) step(); });
  });
  setupSecret();
  function setupSecret() {
  document.querySelectorAll('[data-secret]').forEach(function (btn) {
    var body = document.getElementById(btn.getAttribute('aria-controls'));
    if (!body) return;
    btn.addEventListener('click', function () {
      var open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      body.hidden = !open;
      btn.firstChild.textContent = open ? '秘密を閉じる' : '秘密を見る';
    });
  });
  }
})();
