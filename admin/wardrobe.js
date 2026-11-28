/* 投稿スタジオ:花の村の「衣装」タブ
   - 衣装(ニナ/メル)の追加・名前・解放条件・全身立ち絵・カード画像・相手の感想
   - ペア衣装の専用の掛け合い
   保存すると public/village/data/game.json(outfits)と wardrobe.json、画像を1回のコミットで書き換える。
   ゲーム側のほかの設定(会話中の表情差し替え faces、初回会話 firstScene など)はそのまま残す。 */
const GAME = 'public/village/data/game.json';
const WARD = 'public/village/data/wardrobe.json';
const IMG_DIR = 'public/village/img/outfits/';
const WHO = ['ニナ', 'メル'];
const FACE_JA = { normal: 'ふつう', eat: 'もぐもぐ', tired: 'だるそう', annoyed: 'むっ', chin: 'ほおづえ', side: 'よそ見', sleep: '寝てる', huh: 'は?', eh: 'え?', think: '考えごと', deadpan: '真顔', excited: 'わくわく', heaven: '昇天', bed: 'ベッド', please: 'おねだり', shock: 'ショック', smile: 'にこにこ', point: 'ゆびさし', love: 'ラブ', heal: 'いやし' };
const OTHER = { 'ニナ': 'メル', 'メル': 'ニナ' };
const BASE_IDS = { 'ニナ': 'casual', 'メル': 'dress' }; // 最初から着ている服(消せない)
const CONDS = [
  ['', '最初から着られる'], ['work', '勤務態度が○以上'], ['slack', 'サボり力が○以上'], ['bond', '親密度が○以上'], ['odd', '違和感が○以上'],
  ['album', '会話アルバムを○個'], ['day', '○日目になったら'], ['recipes', 'お酒のレシピを○個'], ['title', '称号を手に入れたら'], ['custom', 'そのほか(式で書く)'],
];

export function setupWardrobe(A) {
  const { $, $$, esc, raw, commit, convert, toB64, R, gh, thumbTag, watchDeploy, S } = A;
  let W = null; // { game, wd, out: {ニナ:[...], メル:[...]}, pairs: [...], files: Map, open: '' }
  const faces = (who) => Object.keys(((W.scenes || {}).chars || {})[who]?.face || { normal: 1 });

  const parseCond = (c) => {
    if (!c) return { k: '', n: '', raw: '' };
    if (c.startsWith('title:')) return { k: 'title', n: c.slice(6), raw: c };
    const m = c.match(/^(work|slack|bond|odd|album|day|recipes)>=(\d+)$/);
    return m ? { k: m[1], n: m[2], raw: c } : { k: 'custom', n: '', raw: c };
  };
  const buildCond = (o) => o._k === '' ? '' : o._k === 'custom' ? (o._raw || '').trim() : o._k === 'title' ? 'title:' + (o._n || '') : `${o._k}>=${Number(o._n) || 0}`;

  async function load() {
    const [game, wd, scenes] = await Promise.all([raw(GAME).then(JSON.parse), raw(WARD).then(JSON.parse).catch(() => ({ reactions: {}, pairs: [] })), raw('public/village/data/scenes.json').then(JSON.parse).catch(() => ({}))]);
    const out = {};
    for (const who of WHO) out[who] = (game.outfits[who] || []).map((o) => {
      const c = parseCond(o.cond); const re = ((wd.reactions || {})[who] || {})[o.id] || [];
      return { ...JSON.parse(JSON.stringify(o)), _k: c.k, _n: c.n, _raw: c.raw, _re: re.map((r) => ({ ...r })) };
    });
    W = { game, wd, scenes, out, pairs: JSON.parse(JSON.stringify(wd.pairs || [])), files: new Map(), open: '' };
  }

  // ---- 画面
  async function open() {
    S.cur = null; A.show('list');
    $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === 'outfits')));
    $('[data-top-title]').textContent = '投稿スタジオ';
    A.ensureFab();
    const body = $('[data-list-body]');
    if (!W) { body.innerHTML = '<p class="loading">読み込み中…</p>'; try { await load(); } catch (e) { body.innerHTML = `<p class="msg is-ng">${esc(e.message)}</p>`; return; } }
    if (S.tab !== 'outfits') return;
    render();
  }
  const imgUrl = (who, o, field) => { const f = W.files.get(`${who}|${o.id}|${field}`); if (f) return { url: f.url, local: true }; const p = o[field]; return p ? { path: 'village/' + p } : null; };
  const pic = (x, cls) => !x ? `<span class="${cls} wd-none">まだなし</span>` : x.local ? `<img class="${cls}" src="${esc(x.url)}" alt="">` : thumbTag(x.path, cls);
  function render() {
    const body = $('[data-list-body]');
    const titles = W.game.titles || [];
    let h = '<p class="muted">花の村の着せ替えに出る服です。立ち絵は<b>背景が透明なPNG</b>がおすすめ(縦長・ポーズ自由。全身が自動で収まります)。最後に「衣装を保存する」を押すとサイトに反映されます。</p>';
    for (const who of WHO) {
      h += `<section class="sec"><h3>${who}の衣装</h3>`;
      W.out[who].forEach((o, i) => {
        const key = who + '|' + i, isOpen = W.open === key, full = imgUrl(who, o, 'full');
        const cl = CONDS.find((c) => c[0] === o._k);
        h += `<div class="wd-item${isOpen ? ' is-open' : ''}"><button type="button" class="wd-head" data-wd-open="${key}">${pic(full, 'wd-thumb')}<span><b>${esc(o.name || '(名前なし)')}</b><small>${o._k ? esc((cl ? cl[1] : '').replace('○', o._n || '○')) : '最初から着られる'}</small></span><span class="item__chev">${isOpen ? '︿' : '›'}</span></button>`;
        if (isOpen) h += editor(who, o, i, titles);
        h += '</div>';
      });
      h += `<div class="imgtools"><button class="mini" type="button" data-wd-add="${who}">＋ ${who}の衣装を足す</button></div></section>`;
    }
    // ペア
    h += '<section class="sec"><h3>ふたりのペア衣装</h3><p class="muted">ふたりがこの組み合わせになると、着せ替え画面で専用の掛け合いが流れます。</p>';
    W.pairs.forEach((p, i) => {
      const opt = (who, sel) => W.out[who].map((o) => `<option value="${esc(o.id)}"${o.id === sel ? ' selected' : ''}>${esc(o.name)}</option>`).join('');
      h += `<div class="wd-pair" data-wd-pair="${i}"><div class="row2"><label class="f">ニナ<select data-p="nina">${opt('ニナ', p.nina)}</select></label><label class="f">メル<select data-p="mel">${opt('メル', p.mel)}</select></label></div>
        <label class="f">ペアの名前<input type="text" data-p="name" value="${esc(p.name || '')}" placeholder="例:おそろいのおでかけ"></label>
        <div class="f">掛け合い(上から順に流れます)</div>${(p.lines || []).map((l, j) => lineRow(l, j, true)).join('')}
        <div class="imgtools"><button class="mini" type="button" data-wd-pline="${i}">＋ セリフを足す</button><button class="mini wd-del" type="button" data-wd-pdel="${i}">このペアを消す</button></div></div>`;
    });
    h += '<div class="imgtools"><button class="mini" type="button" data-wd-padd>＋ ペアを足す</button></div></section>';
    h += '<button class="btn btn--main" type="button" data-wd-save style="width:100%">衣装を保存する</button><p class="msg" data-wd-msg></p>';
    body.innerHTML = h;
  }
  function lineRow(l, j, withWho) {
    const who = l.who || 'メル';
    return `<div class="wd-line${withWho ? ' is-pair' : ''}" data-l="${j}">${withWho ? `<select data-lf="who">${WHO.map((w) => `<option${w === who ? ' selected' : ''}>${w}</option>`).join('')}</select>` : ''}<select data-lf="face" aria-label="表情">${faces(who).map((f) => `<option value="${f}"${f === l.face ? ' selected' : ''}>${FACE_JA[f] || f}</option>`).join('')}</select><input type="text" data-lf="text" value="${esc(l.text || '')}" placeholder="セリフ"><button type="button" data-ldel="${j}" aria-label="消す">✕</button></div>`;
  }
  function editor(who, o, i, titles) {
    const full = imgUrl(who, o, 'full'), card = imgUrl(who, o, 'card');
    return `<div class="wd-edit" data-wd-o="${who}|${i}">
      <label class="f">服の名前<input type="text" data-of="name" value="${esc(o.name || '')}"></label>
      <div class="f">全身の立ち絵<small>背景が透明なPNGだと、村の背景になじみます</small></div>
      <div class="single">${pic(full, 'wd-full')}<label class="mini wd-file">画像をえらぶ<input type="file" accept="image/png,image/webp,image/gif,image/jpeg" data-file="full" hidden></label></div>
      <div class="f">カード用の絵(なくてもOK)<small>なければ立ち絵を小さく使います</small></div>
      <div class="single">${card ? pic(card, 'wd-card') : (o.img ? '<span class="muted">4コマの切り抜きを使用中</span>' : '<span class="muted">立ち絵を使用</span>')}<label class="mini wd-file">画像をえらぶ<input type="file" accept="image/*" data-file="card" hidden></label>${o.card ? '<button type="button" class="mini" data-card-clear>カードの絵をはずす</button>' : ''}</div>
      <label class="f">着られるようになる条件<select data-of="_k" ${BASE_IDS[who] === o.id ? 'disabled' : ''}>${CONDS.map((c) => `<option value="${c[0]}"${c[0] === o._k ? ' selected' : ''}>${c[1]}</option>`).join('')}</select></label>
      ${o._k && o._k !== 'custom' && o._k !== 'title' ? `<label class="f">○の数<input type="number" min="0" data-of="_n" value="${esc(o._n)}"></label>` : ''}
      ${o._k === 'title' ? `<label class="f">称号<select data-of="_n">${titles.map((t) => `<option value="${esc(t.id)}"${t.id === o._n ? ' selected' : ''}>${esc(t.name)}</option>`).join('')}</select></label>` : ''}
      ${o._k === 'custom' ? `<label class="f">条件の式<input type="text" data-of="_raw" value="${esc(o._raw)}" placeholder="例: bond>=50"></label>` : ''}
      ${o._k ? `<label class="f">まだ着られないときのヒント<input type="text" data-of="hint" value="${esc(o.hint || '')}" placeholder="例:親密度を50まで上げる"></label>` : ''}
      <div class="f">${OTHER[who]}の感想<small>${who}がこの服に着替えたとき、${OTHER[who]}が言うセリフ(いくつか書くとランダム)</small></div>
      ${o._re.map((l, j) => lineRow({ ...l, who: OTHER[who] }, j, false)).join('')}
      <div class="imgtools"><button class="mini" type="button" data-re-add>＋ 感想を足す</button>${BASE_IDS[who] === o.id ? '' : '<button class="mini wd-del" type="button" data-o-del>この衣装を消す</button>'}</div>
    </div>`;
  }

  // ---- 操作
  const body = () => $('[data-list-body]');
  const oOf = (el) => { const e = el.closest('[data-wd-o]'); if (!e) return null; const [who, i] = e.getAttribute('data-wd-o').split('|'); return { who, i: +i, o: W.out[who][+i] }; };
  const pOf = (el) => { const e = el.closest('[data-wd-pair]'); return e ? { i: +e.getAttribute('data-wd-pair'), p: W.pairs[+e.getAttribute('data-wd-pair')] } : null; };
  document.addEventListener('input', (e) => {
    if (!W || S.tab !== 'outfits' || !body().contains(e.target)) return;
    const t = e.target, x = oOf(t), y = pOf(t), ln = t.closest('[data-l]');
    if (x && t.dataset.of && t.tagName !== 'SELECT') { x.o[t.dataset.of] = t.value; S.dirty = true; }
    if (x && ln && t.dataset.lf === 'text') { x.o._re[+ln.dataset.l].text = t.value; S.dirty = true; }
    if (y && ln && t.dataset.lf === 'text') { y.p.lines[+ln.dataset.l].text = t.value; S.dirty = true; }
    if (y && t.dataset.p === 'name') { y.p.name = t.value; S.dirty = true; }
  });
  document.addEventListener('change', (e) => {
    if (!W || S.tab !== 'outfits' || !body().contains(e.target)) return;
    const t = e.target, x = oOf(t), y = pOf(t), ln = t.closest('[data-l]');
    S.dirty = true;
    if (t.dataset.file && x && t.files[0]) {
      const f = t.files[0]; if (!/^image\//.test(f.type)) return;
      const k = `${x.who}|${x.o.id}|${t.dataset.file}`; const old = W.files.get(k); if (old) URL.revokeObjectURL(old.url);
      W.files.set(k, { file: f, url: URL.createObjectURL(f) }); return render();
    }
    if (x && t.dataset.of && t.tagName === 'SELECT') { x.o[t.dataset.of] = t.value; if (t.dataset.of === '_k') { x.o._n = t.value === 'title' ? ((W.game.titles || [])[0] || {}).id || '' : x.o._n; } return render(); }
    if (x && ln && t.dataset.lf === 'face') { x.o._re[+ln.dataset.l].face = t.value; return; }
    if (y && t.dataset.p && t.tagName === 'SELECT') { y.p[t.dataset.p] = t.value; return; }
    if (y && ln && t.dataset.lf) { y.p.lines[+ln.dataset.l][t.dataset.lf] = t.value; if (t.dataset.lf === 'who') render(); }
  });
  document.addEventListener('click', (e) => {
    if (!W || S.tab !== 'outfits' || !body().contains(e.target)) return;
    const t = e.target.closest('button'); if (!t) return;
    const x = oOf(t), y = pOf(t);
    if (t.dataset.wdOpen != null) { W.open = W.open === t.dataset.wdOpen ? '' : t.dataset.wdOpen; return render(); }
    if (t.dataset.wdAdd) {
      const who = t.dataset.wdAdd, id = 'o' + Date.now().toString(36);
      W.out[who].push({ id, name: '新しい服', cond: '', hint: '', _k: 'bond', _n: '30', _raw: '', _re: [{ face: 'normal', text: '' }] });
      W.open = who + '|' + (W.out[who].length - 1); S.dirty = true; return render();
    }
    if (t.hasAttribute('data-re-add') && x) { x.o._re.push({ face: 'normal', text: '' }); S.dirty = true; return render(); }
    if (t.dataset.ldel != null && x) { x.o._re.splice(+t.dataset.ldel, 1); S.dirty = true; return render(); }
    if (t.dataset.ldel != null && y) { y.p.lines.splice(+t.dataset.ldel, 1); S.dirty = true; return render(); }
    if (t.hasAttribute('data-card-clear') && x) { delete x.o.card; W.files.delete(`${x.who}|${x.o.id}|card`); S.dirty = true; return render(); }
    if (t.hasAttribute('data-o-del') && x) {
      if (!confirm(`「${x.o.name}」を消しますか?(保存するまではサイトは変わりません)`)) return;
      W.out[x.who].splice(x.i, 1); const f = x.who === 'ニナ' ? 'nina' : 'mel'; W.pairs = W.pairs.filter((p) => p[f] !== x.o.id); W.open = ''; S.dirty = true; return render();
    }
    if (t.hasAttribute('data-wd-padd')) { W.pairs.push({ nina: W.out['ニナ'][0].id, mel: W.out['メル'][0].id, name: '', lines: [{ who: 'メル', face: 'normal', text: '' }] }); S.dirty = true; return render(); }
    if (t.dataset.wdPline != null) { W.pairs[+t.dataset.wdPline].lines.push({ who: 'ニナ', face: 'normal', text: '' }); S.dirty = true; return render(); }
    if (t.dataset.wdPdel != null) { if (!confirm('このペアを消しますか?')) return; W.pairs.splice(+t.dataset.wdPdel, 1); S.dirty = true; return render(); }
    if (t.hasAttribute('data-wd-save')) return save();
  });

  // ---- 保存
  function validate() {
    const errs = []; const texts = [];
    for (const who of WHO) for (const o of W.out[who]) {
      if (!o.name.trim()) errs.push(`${who}の服に、名前がないものがあります。`);
      if (!o.full && !W.files.has(`${who}|${o.id}|full`) && !o.img) errs.push(`${who}の「${o.name}」に、立ち絵がありません。`);
      if (o._k && o._k !== 'custom' && o._k !== 'title' && !(Number(o._n) >= 0 && String(o._n).trim() !== '')) errs.push(`${who}の「${o.name}」の条件の数を入れてください。`);
      if (o._k === 'custom' && !/^(\w+)(>=|<=|>|<|=|!=)(.+)$|^(flag|note|title|recipe):.+$/.test((o._raw || '').trim())) errs.push(`${who}の「${o.name}」の条件の式が読めません(例: bond>=50)。`);
      texts.push(o.name, o.hint || '', ...o._re.map((r) => r.text));
    }
    const seen = new Set();
    for (const p of W.pairs) {
      const k = p.nina + '+' + p.mel; if (seen.has(k)) errs.push('同じ組み合わせのペアが2つあります。'); seen.add(k);
      if (!(p.lines || []).some((l) => (l.text || '').trim())) errs.push('セリフがないペアがあります。');
      texts.push(p.name || '', ...(p.lines || []).map((l) => l.text || ''));
    }
    const hit = (S.banned || []).find((w) => texts.join('\n').includes(w));
    if (hit) errs.push(`サイトでは出さない決まりの言葉「${hit}」が入っています。`);
    return errs;
  }
  async function save() {
    const msg = $('[data-wd-msg]'); const btn = $('[data-wd-save]');
    const errs = validate(); if (errs.length) { msg.textContent = errs[0]; msg.className = 'msg is-ng'; return; }
    btn.disabled = true; msg.className = 'msg';
    try {
      const items = []; const stamp = Date.now().toString(36);
      const jobs = [...W.files.entries()];
      for (const [n, [k, f]] of jobs.entries()) {
        msg.textContent = `画像をアップロードしています… ${n + 1} / ${jobs.length}`;
        const [who, id, field] = k.split('|');
        const outImg = await convert(f.file, { alpha: true, maxSide: field === 'full' ? 1400 : 900 });
        const blob = await gh('POST', R('/git/blobs'), { content: await toB64(outImg.blob), encoding: 'base64' });
        const name = `${who === 'ニナ' ? 'nina' : 'mel'}_${id}_${field}-${stamp}.${outImg.ext}`;
        items.push({ path: IMG_DIR + name, mode: '100644', type: 'blob', sha: blob.sha });
        const o = W.out[who].find((x) => x.id === id); if (o) o[field] = 'img/outfits/' + name;
      }
      msg.textContent = '保存しています…';
      // 最新の game.json / wardrobe.json に、衣装まわりだけ書き戻す(ほかの設定は触らない)
      const game = JSON.parse(await raw(GAME)); const wd = await raw(WARD).then(JSON.parse).catch(() => ({ reactions: {}, pairs: [] }));
      wd.reactions = wd.reactions || {};
      for (const who of WHO) {
        const prev = wd.reactions[who] || {}; const re = {}; if (prev._default) re._default = prev._default;
        game.outfits[who] = W.out[who].map((o) => {
          const c = { ...o }; for (const k of Object.keys(c)) if (k.startsWith('_')) delete c[k];
          c.cond = BASE_IDS[who] === o.id ? '' : buildCond(o); if (!c.cond) c.hint = c.hint || '';
          const lines = o._re.filter((r) => (r.text || '').trim()).map((r) => ({ face: r.face || 'normal', text: r.text.trim() }));
          if (lines.length) re[o.id] = lines;
          return c;
        });
        wd.reactions[who] = re;
      }
      wd.pairs = W.pairs.map((p) => ({ nina: p.nina, mel: p.mel, ...(p.name ? { name: p.name.trim() } : {}), lines: (p.lines || []).filter((l) => (l.text || '').trim()).map((l) => ({ who: l.who || 'メル', face: l.face || 'normal', text: l.text.trim() })) }));
      // ゲーム側のペア(夜の専用会話)が、消した服を指していたら外す
      game.pairs = (game.pairs || []).filter((p) => game.outfits['ニナ'].some((o) => o.id === p.nina) && game.outfits['メル'].some((o) => o.id === p.mel));
      items.push({ path: GAME, mode: '100644', type: 'blob', content: JSON.stringify(game, null, 1) + '\n' });
      items.push({ path: WARD, mode: '100644', type: 'blob', content: JSON.stringify(wd, null, 1) + '\n' });
      const sha = await commit(items, '花の村の衣装を更新（投稿スタジオ）');
      W.files.clear(); W.game = game; W.wd = wd; S.dirty = false;
      msg.textContent = '保存しました。'; watchDeploy(sha, S.cfg.site + 'village/', '衣装の変更');
      render(); $('[data-wd-msg]').textContent = '保存しました。サイトに反映しています…';
    } catch (e) { msg.textContent = e.message; msg.className = 'msg is-ng'; }
    finally { const b = $('[data-wd-save]'); if (b) b.disabled = false; }
  }
  return { open };
}
