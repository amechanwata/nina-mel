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
  // 最後の節（灰色の地の手紙）：見え始めたら、一行ずつやさしく
  var wake = document.querySelector('[data-wake]');
  if (wake) {
    if (!hasIO || reduced) wake.classList.add('is-lit');
    else {
      var wo = new IntersectionObserver(function (en) { en.forEach(function (x) { if (x.isIntersecting) { wake.classList.add('is-lit'); wo.disconnect(); } }); }, { threshold: 0.25 });
      wo.observe(wake);
    }
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

/* 下に行くほど乱れる：「聖女様」の節（data-noise-start）から最後の節（data-wake）へ、深さ 0→1
   1) ざらつき 2) まれな乱れ（見出し・一行が一瞬ずれる） 3) 歴代の名前が一瞬ノイズに 4) 叫びのかけらが透ける
   点滅は 1 秒に 3 回より少なく。動きを減らす設定では、薄いざらつきだけ（止めたまま）。 */
(function () {
  'use strict';
  var start = document.querySelector('[data-noise-start]');
  var end = document.querySelector('[data-wake]');
  var layer = document.querySelector('[data-fnoise]');
  var criesBox = document.querySelector('[data-fcries]');
  var dataEl = document.querySelector('[data-noise-data]');
  if (!start || !end || !layer) return;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cries = [];
  try { cries = JSON.parse(dataEl.textContent).cries || []; } catch (e) { cries = []; }

  // ざらつきの模様を一度だけ作る
  function tex(size, alpha, min) {
    var c = document.createElement('canvas'); c.width = c.height = size;
    var x = c.getContext('2d'); var im = x.createImageData(size, size);
    min = min || 0;
    for (var i = 0; i < im.data.length; i += 4) { var v = Math.random() * 255 | 0; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = min + Math.random() * (alpha - min) | 0; }
    x.putImageData(im, 0, 0); return c.toDataURL();
  }
  var grain = tex(220, 255);
  layer.style.backgroundImage = 'url(' + grain + ')';
  var maskTex = tex(160, 255, 90);
  document.documentElement.style.setProperty('--fn-mask', 'url(' + maskTex + ')');
  document.documentElement.style.setProperty('--fn-tex', 'url(' + tex(120, 255) + ')');

  var depth = 0, calm = false;
  function measure() {
    var s = start.getBoundingClientRect().top + window.scrollY;
    var e = end.getBoundingClientRect().top + window.scrollY;
    var y = window.scrollY + window.innerHeight * 0.5;
    depth = Math.max(0, Math.min(1, (y - s) / Math.max(1, e - s)));
    // 最後の節に入ってからも、少しずつ強く
    if (y > e) depth = 1;
    // 暗い地用の重ね方は、黒い夜（data-maw）の中だけ
    var dark = false;
    var op = reduced ? depth * 0.07 : Math.pow(depth, 1.4) * (dark ? 0.3 : 0.24);
    layer.style.opacity = op.toFixed(3);
    // 色が抜けていく（変に明るい地 → 古い紙の灰色）
    document.documentElement.style.setProperty('--drain', Math.pow(depth, 1.3).toFixed(3));
    layer.classList.toggle('is-dark', dark);
    if (criesBox) criesBox.classList.toggle('is-dark', dark);
    var bandEl = document.querySelector('.fband'); if (bandEl) bandEl.classList.toggle('is-dark', dark);
    // 献上祭の夜（黒）では暗い重ね方、結び（白）に入ったら、ノイズも叫びもすっと消える
    var maw = document.querySelector('[data-maw]'), blessed = document.querySelector('[data-blessed]');
    if (maw) {
      var mr = maw.getBoundingClientRect();
      var inMaw = mr.top < window.innerHeight * 0.5 && mr.bottom > window.innerHeight * 0.5;
      document.body.classList.toggle('fest-after', mr.top < window.innerHeight * 0.8);
      if (inMaw) { layer.classList.add('is-dark'); if (criesBox) criesBox.classList.add('is-quiet'); }
      else if (criesBox) criesBox.classList.remove('is-quiet');
    }
    // 叫びのあとの真っ黒な余白（data-silence）に入ったら、ざらつきも含めて全部止める（無音）
    var silence = document.querySelector('[data-silence]');
    calm = !!(blessed && blessed.getBoundingClientRect().top < window.innerHeight * 0.9) || !!(silence && silence.getBoundingClientRect().top < window.innerHeight * 0.55);
    if (calm) {
      layer.style.opacity = '0';
      if (criesBox) { criesBox.classList.add('is-quiet'); criesBox.textContent = ''; }
      var bd = document.querySelector('.fband'); if (bd) bd.classList.remove('is-on');
    }
  }
  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);
  measure();
  if (reduced) return;

  // 1) ざらつきを、ほんの少し揺らす（毎秒 6 回まで・深いところだけ）
  setInterval(function () {
    if (depth < 0.05 || calm || document.hidden) return;
    layer.style.transform = 'translate(' + (Math.random() * 220 | 0) + 'px,' + (Math.random() * 220 | 0) + 'px)';
  }, 170);

  var inView = function (el) { var r = el.getBoundingClientRect(); return r.bottom > 60 && r.top < window.innerHeight - 40 && r.width > 0; };
  var pick = function (list) { return list[Math.floor(Math.random() * list.length)]; };

  // 2) まれな乱れ：深いほど間隔が短い（40秒 → 12秒）
  function glitchLoop() {
    var wait = 20000 - depth * 14000 + Math.random() * 4000;
    setTimeout(function () {
      if (depth > 0.08 && !calm && !document.hidden) {
        var els = Array.prototype.filter.call(document.querySelectorAll('.fest h2, .fest h3, .fest p'), inView);
        var el = els.length && pick(els);
        if (el) {
          // 深いところでは、ときどきビリっと赤くなる
          var red = Math.random() < 0.15 + depth * 0.35;
          el.classList.remove('is-glitch', 'is-red'); void el.offsetWidth; el.classList.add('is-glitch'); if (red) el.classList.add('is-red');
          setTimeout(function () { el.classList.remove('is-glitch', 'is-red'); }, 200);
        }
      }
      glitchLoop();
    }, wait);
  }
  glitchLoop();

  // 3) 歴代の聖女様の名前が、一瞬ノイズに（深さ 0.7 以上・たまに）
  var names = document.querySelectorAll('.past__name');
  function nameLoop() {
    setTimeout(function () {
      if (depth > 0.55 && !calm && !document.hidden) {
        var vis = Array.prototype.filter.call(names, inView);
        var n = vis.length && pick(vis);
        if (n) {
          var keep = n.textContent;
          n.setAttribute('data-static', keep.replace(/./g, '　'));
          n.classList.add('is-static');
          setTimeout(function () { n.classList.remove('is-static'); n.removeAttribute('data-static'); }, 260);
        }
      }
      nameLoop();
    }, 5000 + Math.random() * 5000);
  }
  if (names.length) nameLoop();

  // 4) 叫びのかけら：深さ 0.35 から。深いほど読める字が増え、少し濃く、少し頻繁に
  function cryLoop() {
    var wait = 9000 - depth * 5500 + Math.random() * 2500;
    setTimeout(function () {
      if (depth > 0.25 && !calm && !document.hidden && cries.length && criesBox) {
        var stage = depth > 0.85 ? 2 : depth > 0.6 ? 1 : 0;
        var words = cries[Math.min(stage, cries.length - 1)] || [];
        if (words.length) {
          var el = document.createElement('span');
          el.className = 'fcry' + (depth > 0.45 && Math.random() < 0.12 ? ' is-red' : '');
          el.textContent = pick(words);
          // 本文に重ならないよう、左右の端に寄せる
          var side = Math.random() < 0.5;
          if (depth > 0.8 && Math.random() < 0.3) { el.style.left = (30 + Math.random() * 40) + '%'; el.style.setProperty('--fc-op', '0.28'); }
          else el.style[side ? 'left' : 'right'] = (2 + Math.random() * 10) + '%';
          el.style.top = (12 + Math.random() * 55) + '%';
          el.style.setProperty('--fc-op', (0.3 + depth * 0.4).toFixed(2));
          el.style.fontSize = (1 + depth * 0.5).toFixed(2) + 'em';
          criesBox.appendChild(el);
          requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-on'); }); });
          setTimeout(function () { el.classList.remove('is-on'); }, 2200 + depth * 1400);
          setTimeout(function () { el.remove(); }, 4600 + depth * 1400);
        }
      }
      cryLoop();
    }, wait);
  }
  cryLoop();
  // 深いところでは、もう一つ別の間隔でも（重なって聞こえるように）
  setTimeout(cryLoop, 4000);

  // 5) 信号の裂け目：深さ 0.5 から、横一本の帯だけノイズが濃くなって流れる（0.35秒・8〜16秒おき）
  var band = document.createElement('div');
  band.className = 'fband'; band.setAttribute('aria-hidden', 'true');
  band.style.backgroundImage = 'url(' + grain + ')';
  document.body.appendChild(band);
  function bandLoop() {
    setTimeout(function () {
      if (depth > 0.5 && !calm && !document.hidden) {
        band.style.top = (10 + Math.random() * 75) + '%';
        band.style.height = (6 + Math.random() * 30 * depth) + 'px';
        band.classList.remove('is-on'); void band.offsetWidth; band.classList.add('is-on');
      }
      bandLoop();
    }, 16000 - depth * 8000 + Math.random() * 4000);
  }
  bandLoop();
})();


/* 献上祭の夜：黒い地に神様の口元がうっすら浮かび、近づき、叫びが流れる（だんだん速く・濃く）。白い結びに入ると止む。
   文字は小さく、短く、ばらばらに（画面全体が光る点滅にはしない）。動きを減らす設定では、絵を薄く置くだけ。 */
(function () {
  'use strict';
  var maw = document.querySelector('[data-maw]');
  if (!maw) return;
  var img = maw.querySelector('.maw__img');
  var box = maw.querySelector('[data-maw-cries]');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;
  var words = []; var redWords = [];
  try {
    var nd = JSON.parse(document.querySelector('[data-noise-data]').textContent);
    (nd.cries || []).forEach(function (st) { words = words.concat(st); });
    // 夜だけの、より読める叫び。多めに混ぜる
    (nd.maw || []).forEach(function (w) { words.push(w, w); });
    // 痛みや命乞いがはっきりわかる叫びは、赤い叫びにだけ
    redWords = (nd.mawRed || []).slice();
  } catch (e) { /* なし */ }
  if (!words.length) words = ['……'];
  var p = 0;
  function measure() {
    var r = maw.getBoundingClientRect();
    var total = Math.max(1, r.height - window.innerHeight);
    p = Math.max(0, Math.min(1, -r.top / total));
    var shown = r.top < window.innerHeight && r.bottom > 0;
    // 絵：不透明のまま、最初はほとんど闇（ん？）。スクロールで浮かび上がり、最後は口の奥へ寄る
    if (img) {
    var b = 0.12 + 0.88 * Math.min(1, Math.max(0, (p - 0.02) / 0.42));
    img.style.setProperty('--maw-b', b.toFixed(3));
    img.style.setProperty('--maw-s', (1 + Math.pow(Math.max(0, p - 0.35) / 0.65, 2) * 2.6).toFixed(3));
    }
    maw.style.setProperty('--maw-p', p.toFixed(3));
  }
  window.addEventListener('scroll', measure, { passive: true });
  window.addEventListener('resize', measure);
  measure();
  // 叫び：忙しなく、ばばばと。小さな文字が短く現れては消える（画面全体は光らせない）
  function spawn() {
    var r = maw.getBoundingClientRect();
    var live = r.top < window.innerHeight * 0.4 && r.bottom > window.innerHeight * 0.6 && p > 0.08 && p < 0.97 && !document.hidden;
    var visTop = Math.max(0, -r.top), visH = Math.max(1, Math.min(window.innerHeight, r.bottom) - Math.max(0, r.top));
    var quiet = document.querySelector('[data-silence]') || document.querySelector('[data-blessed]');
    if (quiet && quiet.getBoundingClientRect().top < window.innerHeight) { box.textContent = ''; live = false; }
    // スクロールに合わせて、なめらかに増える：ぽつぽつ → ばばば → 積み重なって埋め尽くす。赤もだんだん増え、最後は赤一色
    var q = Math.max(0, Math.min(1, (p - 0.08) / 0.8));
    var burst = q > 0.55;
    if (live && box.childElementCount < 60 + q * 420) {
      var n = Math.max(1, Math.round(1 + 32 * Math.pow(q, 2.2) + Math.random() * 2));
      var keep = 180 + 1700 * Math.pow(q, 2.4);
      var redP = 0.05 + 0.95 * Math.pow(Math.max(0, Math.min(1, (q - 0.4) / 0.5)), 1.6);
      for (var k = 0; k < n; k++) {
        var el = document.createElement('span');
        // ところどころ赤や、不快な色（錆・濁った黄緑・血の気の引いた肌色）が混ざる
        var rest = 1 - redP, tint = Math.random(), tc = '';
        if (tint < redP) tc = ' is-red'; else if (tint < redP + rest * 0.07) tc = ' is-rust'; else if (tint < redP + rest * 0.12) tc = ' is-bile'; else if (tint < redP + rest * 0.15) tc = ' is-flesh';
        el.className = 'mcry' + (Math.random() < 0.55 ? ' is-v' : '') + (burst ? ' is-burst' : '') + tc;
        var pool = burst && tc === ' is-red' && redWords.length && Math.random() < 0.45 ? redWords : words;
        el.textContent = pool[Math.floor(Math.random() * pool.length)];
        el.style.left = (-4 + Math.random() * 96) + '%';
        // いま画面に見えている範囲（黒い夜の中での位置）に置く。スクロールすると上へ流れていく
        el.style.top = Math.round(visTop + visH * (1 - Math.pow(Math.random(), 1.5)) * 0.97 - visH * 0.02) + 'px';
        el.style.fontSize = (0.8 + Math.random() * (0.8 + q * 2.2)).toFixed(2) + 'rem';
        el.style.setProperty('--mc-op', (0.3 + Math.random() * (0.25 + q * 0.35)).toFixed(2));
        box.appendChild(el);
        (function (el, keep) {
          requestAnimationFrame(function () { requestAnimationFrame(function () { el.classList.add('is-on'); }); });
          setTimeout(function () { el.classList.remove('is-on'); }, keep + Math.random() * 380);
          setTimeout(function () { el.remove(); }, keep + 600 + Math.random() * 300);
        })(el, keep * (0.7 + Math.random() * 0.6));
      }
    }
    setTimeout(spawn, 300 - 230 * q + Math.random() * 50);
  }
  spawn();
})();

// ポスター：普段は普通。数秒〜十数秒に一度、0.3〜0.5秒だけ水面のようにぐにゃっと波打って戻る（画面に見えているときだけ）
(function () {
  var fig = document.querySelector('[data-poster]');
  if (!fig || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var img = fig.querySelector('img');
  var map = fig.querySelector('feDisplacementMap');
  var turb = fig.querySelector('feTurbulence');
  if (!img || !map || !turb) return;
  var seen = false;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { seen = es[0].isIntersecting; }, { threshold: 0.35 }).observe(fig);
  function warp() {
    var dur = 300 + Math.random() * 200, peak = 14 + Math.random() * 12, t0 = null;
    turb.setAttribute('seed', String(Math.floor(Math.random() * 100)));
    img.classList.add('is-warp');
    function step(t) {
      if (t0 === null) t0 = t;
      var k = Math.min(1, (t - t0) / dur);
      map.setAttribute('scale', (Math.sin(k * Math.PI) * peak).toFixed(1));
      turb.setAttribute('baseFrequency', (0.008 + k * 0.004).toFixed(4) + ' ' + (0.03 - k * 0.01).toFixed(4));
      if (k < 1) requestAnimationFrame(step); else { map.setAttribute('scale', '0'); img.classList.remove('is-warp'); }
    }
    requestAnimationFrame(step);
  }
  function loop() {
    setTimeout(function () { if (seen && !document.hidden) warp(); loop(); }, 4000 + Math.random() * 10000);
  }
  loop();
})();
