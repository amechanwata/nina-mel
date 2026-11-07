/* 聖女と献上祭：ゆっくりしたフェードインと、神様の「おとずれ」
   - 見出しが一瞬すべて同じ言葉になる（お約束を読み終えたとき）
   - 神様が画面の下から、ごく薄くせり上がる
   1回の訪問で一度だけ。音なし。動きを減らす設定では動かさない。 */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasIO = 'IntersectionObserver' in window;

  // ---- フェードイン ------------------------------------------------------
  if (hasIO && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    document.querySelectorAll('[data-reveal]').forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in'); else io.observe(el);
    });
    document.documentElement.classList.add('reveal-ready');
  }
  if (!hasIO) return;

  var seen = {};
  try { seen = JSON.parse(sessionStorage.getItem('ninamel:fest') || '{}'); } catch (e) { seen = {}; }
  function mark(k) { seen[k] = 1; try { sessionStorage.setItem('ninamel:fest', JSON.stringify(seen)); } catch (e) {} }

  // ---- 見出しが一瞬すべて同じ言葉に -------------------------------------
  var closing = document.querySelector('.rules__closing');
  var refrainText = (document.querySelector('.refrain') || {}).textContent || 'すべての幸福は、神様から。';
  function swapHeadings() {
    if (seen.swap) return;
    mark('swap');
    var hs = document.querySelectorAll('.fest h1, .fest h2, .fest h3');
    var saved = [];
    hs.forEach(function (h) { saved.push(h.innerHTML); h.setAttribute('aria-hidden', 'true'); h.textContent = refrainText.trim(); h.classList.add('is-swapped'); });
    setTimeout(function () {
      hs.forEach(function (h, i) { h.innerHTML = saved[i]; h.removeAttribute('aria-hidden'); h.classList.remove('is-swapped'); });
    }, 1100);
  }
  if (closing) {
    var o = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { o.disconnect(); setTimeout(swapHeadings, 700); } });
    }, { threshold: 1, rootMargin: '0px 0px -20% 0px' });
    o.observe(closing);
  }

  // ---- 下からせり上がる神様（読むのを邪魔しない薄さ） --------------------
  var rise = document.querySelector('[data-godrise]');
  var prayer = document.querySelector('.fest-prayer');
  if (!rise || !prayer || reduced) return;
  function onScroll() {
    var stop = prayer.offsetTop - window.innerHeight;
    var p = Math.max(0, Math.min(1, (window.scrollY - window.innerHeight * 0.8) / Math.max(1, stop - window.innerHeight * 0.8)));
    rise.style.setProperty('--rise', p.toFixed(3));
    rise.style.opacity = p > 0.02 ? '' : '0';
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
