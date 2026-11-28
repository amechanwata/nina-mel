/* おまけ4コマ：ふわっと出てくる／ランダムに1本 */
(function () {
  'use strict';
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.yk [data-reveal]').forEach(function (el) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('is-in'); else io.observe(el);
    });
    document.documentElement.classList.add('yk-reveal');
  }
  var btn = document.querySelector('[data-yk-random]');
  var strips = Array.prototype.slice.call(document.querySelectorAll('.yk-strip'));
  var last = -1;
  if (btn && strips.length > 1) btn.addEventListener('click', function () {
    var i;
    do { i = Math.floor(Math.random() * strips.length); } while (i === last);
    last = i;
    var el = strips[i];
    el.classList.add('is-in');
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('is-picked'); void el.offsetWidth; el.classList.add('is-picked');
    if (history.replaceState) history.replaceState(null, '', '#' + el.id);
  });
})();

/* 「本のように読む」ボタン：前に読んでいたら「続きから」、増えていたら本数も */
(function () {
  'use strict';
  var a = document.querySelector('[data-yk-book]');
  var label = document.querySelector('[data-yk-book-label]');
  if (!a || !label) return;
  var st = {};
  try { st = JSON.parse(localStorage.getItem('ninamel:v1:yonkoma:book') || 'null') || {}; } catch (e) { st = {}; }
  var nums = Array.prototype.map.call(document.querySelectorAll('.yk-strip'), function (el) { return Number((el.id.match(/\d+/) || [0])[0]); });
  var known = Number(st.known) || 0;
  var added = known ? nums.filter(function (n) { return n > known; }).length : 0;
  if (added) label.textContent = '新しい4コマ ' + added + ' 本から読む';
  else if (Number(st.at) > 0) label.textContent = '続き（その' + st.at + '）から読む';
  else if (Number(st.at) === -1) label.textContent = '最初から読み直す';
})();
