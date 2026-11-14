/* 投稿スタジオ
   小説・漫画・4コマ・章を、1つの画面で「一覧 → 作る／直す → 保存」。
   - 保存は GitHub（原稿の保管庫）に1回のコミットで行う（画像＋データ）。保存すると自動でサイトが作り直される。
   - 番号は自動で付け、かぶりや書き忘れなど、サイトの公開が止まる原因は保存前に止める。
   - 保存したあとは、サイトに反映されたか（または失敗したか）を上に出す。
   設定は studio.json。本文のプレビューはサイトと同じ変換処理（markup.js）を使う。 */
import { renderNovelBody } from './markup.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const API = 'https://api.github.com';
const MAX_SIDE = 2400;
const TOKEN_KEY = 'ninamel:upload-token';
const WAIT = window.__STUDIO_TEST__ ? 300 : 1; // テストでは反映の見守りを速くする
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad3 = (n) => String(n).padStart(3, '0');
const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const imgSrc = (v) => (v == null ? '' : typeof v === 'string' ? v : v.src || v.image || '');
const clone = (o) => JSON.parse(JSON.stringify(o));
let uid = 0;

const KINDS = {
  novel: {
    label: '小説', unit: '話', dir: 'content/novel', listKey: 'illustrations', imgDir: 'public/images/novel/uploads/',
    no: (n) => `第${n}話`, newPath: (n) => `content/novel/${pad3(n)}.json`, route: (d) => `novel/${d.slug || pad3(d.number)}/`,
    thumb: (d) => imgSrc(d.cover) || imgSrc((d.illustrations || [])[0]),
  },
  manga: {
    label: '漫画', unit: '話', dir: 'content/manga', listKey: 'pages', imgDir: 'public/images/manga/uploads/',
    no: (n) => `第${n}話`, newPath: (n) => `content/manga/episode-${pad3(n)}.json`, route: (d) => `manga/${d.slug || 'episode-' + pad3(d.number)}/`,
    thumb: (d) => imgSrc(d.cover) || imgSrc((d.pages || [])[0]),
  },
  yonkoma: {
    label: '4コマ', unit: '本', dir: 'content/yonkoma', listKey: 'panels', imgDir: 'public/images/yonkoma/uploads/',
    no: (n) => `その${n}`, newPath: (n) => `content/yonkoma/${n}.json`, route: (d) => `yonkoma/#y-${pad3(d.number)}`,
    thumb: (d) => imgSrc((d.panels || [])[0]),
  },
};

const S = {
  cfg: null, token: '', banned: [],
  data: { novel: null, manga: null, yonkoma: null }, chapters: null,
  tab: 'novel', cur: null, dirty: false, busy: false,
};

// ---------------------------------------------------------------- 保存領域
const store = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { return null; } return null; };
function findToken() {
  const t = store(TOKEN_KEY);
  if (t) return t;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!/sveltia|decap|netlify-cms/i.test(k)) continue;
      const v = JSON.parse(localStorage.getItem(k) || 'null');
      if (v && typeof v.token === 'string' && v.token.length > 20) return v.token;
    }
  } catch { /* なし */ }
  return '';
}

// ---------------------------------------------------------------- GitHub
async function gh(method, path, body, accept) {
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + S.token, Accept: accept || 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  if (res.status === 401) { const e = new Error('ログインできませんでした。合言葉（トークン）が違うか、期限が切れています。'); e.status = 401; throw e; }
  if (!res.ok) {
    const e = new Error(res.status === 403 || res.status === 404 ? 'GitHub で操作できませんでした（権限が足りないか、見つかりません）。' : `GitHub との通信で問題が起きました（${res.status}）。少し待ってもう一度お試しください。`);
    e.status = res.status; e.detail = await res.text(); throw e;
  }
  if (accept === 'application/vnd.github.raw') return res.blob();
  if (accept && /raw/.test(accept)) return res.text();
  return res.status === 204 ? null : res.json();
}
const R = (p) => `/repos/${S.cfg.repo}${p}`;
const ref = () => encodeURIComponent(S.cfg.branch);
const raw = (path) => gh('GET', R(`/contents/${path}?ref=${ref()}`), null, 'application/vnd.github.raw+json');

async function loadKind(kind) {
  const list = await gh('GET', R(`/contents/${KINDS[kind].dir}?ref=${ref()}`)).catch((e) => { if (e.status === 404) return []; throw e; });
  const files = list.filter((f) => f.type === 'file' && f.name.endsWith('.json'));
  const out = await Promise.all(files.map(async (f) => { try { return { path: f.path, data: JSON.parse(await raw(f.path)) }; } catch { return null; } }));
  S.data[kind] = out.filter(Boolean).sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0));
  return S.data[kind];
}
async function loadChapters() {
  try { S.chapters = { path: 'content/chapters.json', data: JSON.parse(await raw('content/chapters.json')) }; }
  catch { S.chapters = { path: 'content/chapters.json', data: { chapters: [{ number: 1, title: '第1章' }] } }; }
  return S.chapters;
}

// ---------------------------------------------------------------- 画像
const siteUrl = (p) => S.cfg.site + String(p).replace(/^\/+/, '');
const blobCache = new Map();
// サイトにまだ出ていない画像（下書き・保存直後）は、保管庫から直接読む
function fixThumb(img) {
  const p = img.getAttribute('data-repo');
  if (!p || img.dataset.tried) return;
  img.dataset.tried = '1';
  const key = 'public' + (p.startsWith('/') ? p : '/' + p);
  (blobCache.get(key) || (blobCache.set(key, gh('GET', R(`/contents/${key}?ref=${ref()}`), null, 'application/vnd.github.raw').then((b) => URL.createObjectURL(b))), blobCache.get(key)))
    .then((u) => { img.src = u; }).catch(() => {});
}
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG' && e.target.hasAttribute('data-repo')) fixThumb(e.target); }, true);
const thumbTag = (p, cls = '', alt = '') => p ? `<img class="${cls}" src="${esc(siteUrl(p))}" data-repo="${esc(p)}" alt="${esc(alt)}" loading="lazy" decoding="async">` : '';

function convert(file) {
  const viaImg = () => new Promise((res, rej) => {
    const u = URL.createObjectURL(file); const im = new Image();
    im.onload = () => { res(im); setTimeout(() => URL.revokeObjectURL(u), 1000); };
    im.onerror = () => rej(new Error(`「${file.name}」を画像として開けませんでした。JPEG か PNG でお試しください。`));
    im.src = u;
  });
  const load = window.createImageBitmap ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file)).catch(viaImg) : viaImg();
  return load.then((bmp) => {
    const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return new Promise((r) => c.toBlob(r, 'image/webp', 0.85)).then((b) => (b && b.type === 'image/webp' ? { blob: b, ext: 'webp' } : new Promise((r) => c.toBlob(r, 'image/jpeg', 0.9)).then((b2) => ({ blob: b2, ext: 'jpg' }))));
  });
}
const toB64 = (blob) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('画像を読み込めませんでした。')); r.readAsDataURL(blob); });
const fileItem = (f) => ({ id: 'i' + (++uid), file: f, name: f.name, url: URL.createObjectURL(f) });
const pathItem = (p) => ({ id: 'i' + (++uid), path: imgSrc(p) });

// ---------------------------------------------------------------- 画面の切り替え（ハッシュで。スマホの「戻る」で一覧へ）
// 編集画面を開くたびにフォームを作り直す（前の画面のイベントが残らないように）
function freshForm() { const old = $('[data-form]'); const f = old.cloneNode(false); old.replaceWith(f); return f; }
function show(view) {
  $$('[data-view]').forEach((v) => { v.hidden = v.getAttribute('data-view') !== view; });
  $('[data-back]').hidden = view !== 'edit';
  $('[data-bar]').hidden = view !== 'edit';
  document.body.classList.toggle('has-bar', view === 'edit');
  const fab = $('.fab'); if (fab) fab.hidden = view !== 'list' || S.tab === 'chapters' || S.tab === 'likes';
}
function go(hash) { if (location.hash !== hash) location.hash = hash; else route(); }
window.addEventListener('hashchange', () => {
  if (S.leaving) { S.leaving = false; return; }
  if (S.dirty && S.editHash && location.hash !== S.editHash && !confirm('保存していない変更があります。このまま戻りますか？')) { S.leaving = true; location.hash = S.editHash; return; }
  S.dirty = false;
  route();
});
window.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
$('[data-back]').addEventListener('click', () => go('#/' + (S.cur ? S.cur.kind : S.tab)));

async function route() {
  if (!S.token) return;
  const h = location.hash.replace(/^#\/?/, '').split('/');
  const kind = h[0] in KINDS || h[0] === 'chapters' || h[0] === 'likes' ? h[0] : 'novel';
  S.tab = kind;
  if (h[1] === 'new' && KINDS[kind]) return openEditor(kind, null);
  if (h[1] === 'bulk' && kind === 'yonkoma') return openBulk();
  if (h[1] === 'order' && kind === 'yonkoma') return openOrder();
  if (h[1] === 'edit' && KINDS[kind]) {
    const path = decodeURIComponent(h.slice(2).join('/'));
    const list = S.data[kind] || (await loadKind(kind));
    const entry = list.find((x) => x.path === path);
    if (entry) return openEditor(kind, entry);
  }
  if (kind === 'chapters') return openChapters();
  if (kind === 'likes') return openLikes();
  renderList(kind);
}

// ---------------------------------------------------------------- 一覧
function statusBadge(d) {
  if (d.status !== 'published') return '<span class="badge badge--draft">下書き</span>';
  if (String(d.publishedAt || '').slice(0, 10) > today()) return `<span class="badge badge--soon">予約 ${esc(String(d.publishedAt).slice(5, 10).replace('-', '/'))}</span>`;
  return '<span class="badge badge--pub">公開中</span>';
}
async function renderList(kind) {
  S.cur = null;
  show('list');
  $('[data-top-title]').textContent = '投稿スタジオ';
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === kind)));
  const body = $('[data-list-body]');
  if (!S.data[kind]) { body.innerHTML = '<p class="loading">読み込み中…</p>'; try { await loadKind(kind); } catch (e) { body.innerHTML = `<p class="msg is-ng">${esc(e.message)}</p>`; return; } }
  if (S.tab !== kind) return;
  const K = KINDS[kind];
  const list = S.data[kind];
  const bulkBtn = kind === 'yonkoma' ? '<div class="listtools"><button class="bulkbtn" type="button" data-bulk>＋ まとめて追加</button><button class="bulkbtn bulkbtn--sub" type="button" data-order>⇅ 順番を並び替え</button></div>' : '';
  body.innerHTML = bulkBtn + (list.length ? `<ul class="items">${list.map((x) => {
    const d = x.data; const t = K.thumb(d);
    return `<li><button class="item" type="button" data-open="${esc(x.path)}">
      ${t ? thumbTag(t, 'item__thumb') : '<span class="item__thumb item__thumb--empty">画像なし</span>'}
      <span><span class="item__no">${esc(K.no(d.number))}</span><span class="item__title">${esc(d.title || (kind === 'yonkoma' ? '（タイトルなし）' : '（タイトルなし）'))}</span>${statusBadge(d)}${likeId(kind, d) ? `<span class="item__likes" data-likes-id="${esc(likeId(kind, d))}"></span>` : ''}</span>
      <span class="item__chev" aria-hidden="true">›</span></button></li>`;
  }).join('')}</ul>` : `<p class="empty">まだありません。右下の「＋ 新しく作る」からどうぞ。</p>`);
  ensureFab();
  fillLikes(kind);
}
function ensureFab() {
  if (!$('.fab')) { document.body.appendChild($('[data-tpl-fab]').content.cloneNode(true)); $('.fab').addEventListener('click', () => go(`#/${S.tab}/new`)); }
  $('.fab').hidden = S.tab === 'chapters' || S.tab === 'likes' || !$('[data-view="list"]') || $('[data-view="list"]').hidden;
}
$('[data-list-body]').addEventListener('click', (e) => { if (e.target.closest('[data-bulk]')) return go('#/yonkoma/bulk'); if (e.target.closest('[data-order]')) return go('#/yonkoma/order'); const b = e.target.closest('[data-open]'); if (b) go(`#/${S.tab}/edit/${encodeURIComponent(b.getAttribute('data-open'))}`); });
$$('[data-tab]').forEach((b) => b.addEventListener('click', () => go('#/' + b.getAttribute('data-tab'))));

// ---------------------------------------------------------------- 編集
function nextNumber(kind) { return (S.data[kind] || []).reduce((m, x) => Math.max(m, Number(x.data.number) || 0), 0) + 1; }
const lines = (a) => (a || []).join('\n');
const fromLines = (s) => String(s || '').split(/\r?\n|、|,/).map((x) => x.trim()).filter(Boolean);

async function openEditor(kind, entry) {
  if (!S.data[kind]) await loadKind(kind);
  if (kind === 'novel' && !S.chapters) await loadChapters();
  const K = KINDS[kind];
  const d = entry ? clone(entry.data) : { title: '', number: nextNumber(kind), publishedAt: today(), status: 'draft' };
  const cur = S.cur = { kind, path: entry ? entry.path : null, orig: entry ? entry.data : null, d, imgs: (d[K.listKey] || []).map(pathItem), cover: null, coverFrom: null };
  if (kind !== 'yonkoma' && d.cover) {
    const c = imgSrc(d.cover);
    const same = cur.imgs.find((it) => it.path === c);
    if (kind === 'manga' && same) cur.coverFrom = same.id; else cur.cover = pathItem(c);
  }
  show('edit');
  S.editHash = location.hash;
  $('[data-top-title]').textContent = entry ? `${K.label} ${K.no(d.number)}` : `新しい${K.label}`;
  const f = freshForm();
  f.innerHTML = basicSection(kind, d) + (kind === 'novel' ? novelSections(d) : kind === 'manga' ? mangaSections(d) : yonkomaSections(d)) +
    (entry ? `<div class="danger-zone"><button type="button" data-delete>この${K.unit}を削除する</button></div>` : '');
  renderImgs();
  renderCover();
  bindEditor();
  updateBar();
  S.dirty = false;
  setMsg(entry ? '' : `番号は自動で ${d.number} にしました。`);
  window.scrollTo(0, 0);
}

function basicSection(kind, d) {
  const ch = kind === 'novel' ? `<label class="f">章
      <select name="chapter">${(S.chapters.data.chapters || []).map((c) => `<option value="${c.number}"${Number(d.chapter || 1) === Number(c.number) ? ' selected' : ''}>第${c.number}章　${esc(c.title)}</option>`).join('')}</select>
      <small>章の名前は一覧の「章」タブで直せます。</small></label>` : '';
  return `<section class="sec"><h3>基本</h3>
    <label class="f">タイトル${kind === 'yonkoma' ? '<small>（なくても OK）</small>' : ''}<input type="text" name="title" value="${esc(d.title)}"></label>
    <div class="row2">
      <label class="f">${kind === 'yonkoma' ? '番号' : '話数'}<input type="number" name="number" min="1" inputmode="numeric" value="${esc(d.number)}"></label>
      <label class="f">公開日<input type="date" name="publishedAt" value="${esc(String(d.publishedAt || today()).slice(0, 10))}"></label>
    </div>
    ${ch}
    <p class="err" data-err="basic" hidden></p>
    <p class="hint" data-hint-date hidden></p>
  </section>`;
}
function imgSection(title, note, opts = {}) {
  return `<section class="sec"><h3>${title}</h3><p class="muted">${note}</p>
    <ul class="imgs" data-imgs aria-label="${title}（この順で入ります）"></ul>
    <div class="imgtools" data-imgtools hidden>
      <button class="mini" type="button" data-sort="name">ファイル名順</button>
      <button class="mini" type="button" data-sort="reverse">逆の順</button>
      <button class="mini" type="button" data-sort="clear">全部はずす</button>
    </div>
    <label class="pick" data-drop>＋ 画像をまとめて選ぶ<small>選んだ順に後ろへ足します。PCはドラッグでも OK</small><input type="file" accept="image/*" multiple data-files></label>
    ${opts.after || ''}
  </section>`;
}
const coverSection = (note) => `<section class="sec"><h3>表紙</h3><p class="muted">${note}</p>
  <div class="single" data-cover-view></div>
  <div class="imgtools"><label class="mini" style="display:inline-flex;align-items:center;position:relative">別の画像を選ぶ<input type="file" accept="image/*" data-cover-file style="position:absolute;inset:0;opacity:0"></label><button class="mini" type="button" data-cover-none>表紙なし</button></div>
</section>`;
function novelSections(d) {
  return `<section class="sec"><h3>本文</h3>
    <div class="tools" role="toolbar" aria-label="本文の道具">
      <button type="button" data-tool="ruby">ルビ</button><button type="button" data-tool="bouten">傍点</button>
      <button type="button" data-tool="scene">場面転換</button><button type="button" data-tool="illust">挿絵の位置</button>
      <button type="button" data-tool="preview" aria-pressed="false">プレビュー</button>
    </div>
    <textarea class="body" name="body" placeholder="ここに本文。1行＝1段落。" spellcheck="false">${esc(d.body || '')}</textarea>
    <div class="preview" data-preview hidden></div>
    <p class="count" data-count></p>
    <p class="muted">ルビ・傍点は、文字を選んでからボタン。「挿絵の位置」は、下の挿絵が上から順に入ります。</p>
    <p class="hint" data-hint-illust hidden></p>
  </section>
  ${imgSection('挿絵', '本文の［挿絵］の位置に、上から順に入ります。')}
  ${coverSection('話の最初と目次に出ます（なくても OK）。')}
  <section class="sec"><h3>そのほか</h3>
    <label class="f">あらすじ（目次や検索に出る短い紹介）<textarea name="summary" rows="3">${esc(d.summary || '')}</textarea></label>
    <label class="f">注意書き<textarea name="contentWarnings" rows="2" placeholder="例：流血の描写（1行に1つ）">${esc(lines(d.contentWarnings))}</textarea></label>
    <label class="f">この話の漫画版の話数<input type="number" name="relatedMangaNumber" min="1" inputmode="numeric" value="${esc(d.relatedMangaNumber || '')}"><small>あるときだけ。話の最後にリンクが出ます。</small></label>
  </section>`;
}
function mangaSections(d) {
  return `${imgSection('ページ', '1ページ目から順に。★で表紙にできます。')}
  ${coverSection('一覧に出る絵。何も選ばなければ1ページ目を使います。')}
  <section class="sec"><h3>そのほか</h3>
    <label class="f">あらすじ<textarea name="summary" rows="3">${esc(d.summary || '')}</textarea></label>
    <div class="f">開き方<div class="seg">
      <label><input type="radio" name="direction" value="rtl"${d.direction !== 'ltr' ? ' checked' : ''}><span>右開き（日本の漫画）</span></label>
      <label><input type="radio" name="direction" value="ltr"${d.direction === 'ltr' ? ' checked' : ''}><span>左開き</span></label></div></div>
    <label class="check"><input type="checkbox" name="spreadFirstPageSingle"${d.spreadFirstPageSingle !== false ? ' checked' : ''}>見開きのとき、1ページ目だけ1枚で見せる</label>
    <label class="f">タグ<input type="text" name="tags" value="${esc((d.tags || []).join('、'))}" placeholder="例：日常、お屋敷"></label>
    <label class="f">注意書き<textarea name="contentWarnings" rows="2">${esc(lines(d.contentWarnings))}</textarea></label>
    <label class="f">この話の小説版の話数<input type="number" name="relatedNovelNumber" min="1" inputmode="numeric" value="${esc(d.relatedNovelNumber || '')}"></label>
  </section>`;
}
function yonkomaSections(d) {
  const face = (v, label, img) => `<label><input type="radio" name="who" value="${v}"${(d.who || 'both') === v ? ' checked' : ''}><span>${img}${label}</span></label>`;
  const fimg = (n) => `<img src="../images/yonkoma/chibi/${n}.webp" alt="">`;
  return `${imgSection('コマ', '1コマ目から順に4枚。4コマを1枚にまとめた画像なら1枚でも OK。')}
  <section class="sec"><h3>作者のひとこと</h3>
    <label class="f">まんがの下に、ちびキャラの吹き出しで出ます<textarea name="comment" rows="3">${esc(d.comment || '')}</textarea></label>
    <div class="f">吹き出しの顔<div class="seg">${face('both', 'ふたり', fimg('nina-1') + fimg('mel-1'))}${face('nina', 'ニナ', fimg('nina-3'))}${face('mel', 'メル', fimg('mel-1'))}</div></div>
  </section>`;
}

// ---- 画像の並び
function renderImgs() {
  const ul = $('[data-imgs]'); if (!ul) return;
  const cur = S.cur; const n = cur.imgs.length;
  const canCover = cur.kind === 'manga';
  ul.innerHTML = cur.imgs.map((it, i) => `<li class="img${it.file ? ' is-new' : ''}${cur.coverFrom === it.id ? ' is-cover' : ''}" draggable="true" data-id="${it.id}">
    ${it.file ? `<img src="${it.url}" alt="${i + 1}枚目（新しく追加）">` : thumbTag(it.path, '', `${i + 1}枚目`)}
    <span class="img__num">${i + 1}</span>${cur.coverFrom === it.id ? '<span class="img__cover">表紙</span>' : ''}
    <div class="img__tools">
      <button type="button" data-act="prev" aria-label="${i + 1}枚目を前へ"${i === 0 ? ' disabled' : ''}>◀</button>
      <button type="button" data-act="next" aria-label="${i + 1}枚目を後ろへ"${i === n - 1 ? ' disabled' : ''}>▶</button>
      ${canCover ? `<button type="button" data-act="cover" aria-pressed="${cur.coverFrom === it.id}" aria-label="${i + 1}枚目を表紙にする">★</button>` : '<span></span>'}
      <button type="button" data-act="del" aria-label="${i + 1}枚目をはずす">✕</button>
    </div></li>`).join('');
  $('[data-imgtools]').hidden = !n;
  checkIllust();
}
function renderCover() {
  const v = $('[data-cover-view]'); if (!v) return;
  const cur = S.cur;
  const from = cur.coverFrom && cur.imgs.find((x) => x.id === cur.coverFrom);
  const it = from || cur.cover;
  if (it) v.innerHTML = (it.file ? `<img src="${it.url}" alt="">` : thumbTag(it.path)) + `<span class="muted">${from ? `${cur.imgs.indexOf(from) + 1}枚目を表紙にします` : it.file ? '新しい表紙' : '今の表紙'}</span>`;
  else v.innerHTML = `<span class="muted">${cur.kind === 'manga' && cur.imgs.length ? '表紙なし（一覧では1ページ目を使います）' : '表紙なし'}</span>`;
}

function bindEditor() {
  const f = $('[data-form]'); const cur = S.cur;
  f.addEventListener('input', (e) => {
    S.dirty = true;
    if (e.target.name === 'body') { updateCount(); checkIllust(); return; }
    validate(false); if ($('[data-bar-msg]').classList.contains('is-ng')) setMsg('');
  });
  f.addEventListener('change', () => { S.dirty = true; });
  f.addEventListener('submit', (e) => e.preventDefault());
  // 画像
  const ul = $('[data-imgs]');
  if (ul) {
    ul.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const id = b.closest('[data-id]').getAttribute('data-id'); const i = cur.imgs.findIndex((x) => x.id === id);
      const a = b.getAttribute('data-act');
      if (a === 'prev' && i > 0) cur.imgs.splice(i - 1, 0, cur.imgs.splice(i, 1)[0]);
      if (a === 'next' && i < cur.imgs.length - 1) cur.imgs.splice(i + 1, 0, cur.imgs.splice(i, 1)[0]);
      if (a === 'del') { const [x] = cur.imgs.splice(i, 1); if (cur.coverFrom === x.id) cur.coverFrom = null; }
      if (a === 'cover') { cur.coverFrom = cur.coverFrom === id ? null : id; if (cur.coverFrom) cur.cover = null; }
      S.dirty = true; renderImgs(); renderCover();
      const again = $(`[data-id="${id}"] [data-act="${a}"]`); if (again && !again.disabled) again.focus();
    });
    let drag = null;
    ul.addEventListener('dragstart', (e) => { const li = e.target.closest('[data-id]'); if (!li) return; drag = li.getAttribute('data-id'); li.classList.add('is-dragging'); try { e.dataTransfer.setData('text/plain', drag); } catch { /* */ } });
    ul.addEventListener('dragend', () => { drag = null; renderImgs(); });
    ul.addEventListener('dragover', (e) => { if (drag) e.preventDefault(); });
    ul.addEventListener('drop', (e) => {
      if (!drag) return; e.preventDefault();
      const li = e.target.closest('[data-id]'); if (!li) return;
      const from = cur.imgs.findIndex((x) => x.id === drag), to = cur.imgs.findIndex((x) => x.id === li.getAttribute('data-id'));
      if (from > -1 && to > -1 && from !== to) { cur.imgs.splice(to, 0, cur.imgs.splice(from, 1)[0]); S.dirty = true; }
      drag = null; renderImgs(); renderCover();
    });
    const add = (files) => { const fs = Array.from(files || []).filter((x) => /^image\//.test(x.type) || /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(x.name)); if (!fs.length) return; cur.imgs.push(...fs.map(fileItem)); S.dirty = true; renderImgs(); renderCover(); updateBar(); };
    $('[data-files]').addEventListener('change', (e) => { add(e.target.files); e.target.value = ''; });
    const drop = $('[data-drop]');
    ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { if (drag) return; e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
    drop.addEventListener('drop', (e) => { if (drag) return; e.preventDefault(); add(e.dataTransfer && e.dataTransfer.files); });
    $('[data-imgtools]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-sort]'); if (!b) return;
      const k = b.getAttribute('data-sort');
      const nm = (x) => x.name || x.path || '';
      if (k === 'name') cur.imgs.sort((a, c) => nm(a).localeCompare(nm(c), 'ja', { numeric: true }));
      if (k === 'reverse') cur.imgs.reverse();
      if (k === 'clear' && confirm('並んでいる画像を全部はずしますか？（保存するまでは元に戻せます）')) { cur.imgs = []; cur.coverFrom = null; }
      S.dirty = true; renderImgs(); renderCover();
    });
  }
  // 表紙
  const cf = $('[data-cover-file]');
  if (cf) {
    cf.addEventListener('change', (e) => { const x = e.target.files && e.target.files[0]; if (x) { cur.cover = fileItem(x); cur.coverFrom = null; S.dirty = true; renderImgs(); renderCover(); } e.target.value = ''; });
    $('[data-cover-none]').addEventListener('click', () => { cur.cover = null; cur.coverFrom = null; S.dirty = true; renderImgs(); renderCover(); });
  }
  // 本文の道具
  const tools = $('.tools');
  if (tools) {
    tools.addEventListener('click', (e) => {
      const b = e.target.closest('[data-tool]'); if (!b) return;
      const ta = f.elements.body; const t = b.getAttribute('data-tool');
      const s0 = ta.selectionStart, s1 = ta.selectionEnd; const sel = ta.value.slice(s0, s1);
      const put = (text, selectInner) => { ta.focus(); ta.setRangeText(text, s0, s1, selectInner ? 'select' : 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); };
      if (t === 'ruby') {
        const base = sel || prompt('ルビを付ける文字（漢字など）');
        if (!base) return;
        const yomi = prompt(`「${base}」の読みがな`);
        if (yomi) put(`｜${base}《${yomi}》`);
      } else if (t === 'bouten') {
        const base = sel || prompt('傍点を付ける文字');
        if (base) put(`《《${base}》》`);
      } else if (t === 'scene') put(`${s0 && ta.value[s0 - 1] !== '\n' ? '\n' : ''}***\n`);
      else if (t === 'illust') put(`${s0 && ta.value[s0 - 1] !== '\n' ? '\n' : ''}［挿絵］\n`);
      else if (t === 'preview') {
        const on = b.getAttribute('aria-pressed') !== 'true';
        b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '書く' : 'プレビュー';
        ta.hidden = on; $('[data-preview]').hidden = !on;
        if (on) renderPreview();
      }
    });
    updateCount();
  }
  const del = $('[data-delete]');
  if (del) del.addEventListener('click', removeEntry);
}
function renderPreview() {
  const cur = S.cur; const box = $('[data-preview]');
  const fig = (n, cap) => { const it = cur.imgs[n - 1]; if (!it) return null; const src = it.file ? it.url : siteUrl(it.path); return `<figure><img src="${esc(src)}" alt="">${cap ? `<figcaption>${esc(cap)}</figcaption>` : ''}</figure>`; };
  try { box.innerHTML = renderNovelBody($('[data-form]').elements.body.value, fig).html || '<p class="muted">本文がまだありません。</p>'; } catch (e) { box.textContent = 'プレビューを表示できませんでした。'; }
}
function updateCount() {
  const ta = $('[data-form]').elements.body; const c = $('[data-count]'); if (!ta || !c) return;
  const n = ta.value.replace(/｜|《《|》》|《[^》\n]*》|［挿絵[^］]*］|\*\*\*|\s/g, '').length;
  c.textContent = `${n.toLocaleString()} 字（読むのにおよそ ${Math.max(1, Math.round(n / 500))} 分）`;
}
function checkIllust() {
  const h = $('[data-hint-illust]'); const ta = $('[data-form]') && $('[data-form]').elements.body; if (!h || !ta) return;
  const marks = ta.value.split('\n').filter((l) => /^\s*[［\[【]\s*挿絵/.test(l)).length; const n = S.cur.imgs.length;
  h.hidden = !(marks || n);
  h.className = 'hint' + (marks === n || (!marks && n) ? ' hint--ok' : '');
  h.textContent = !marks && n ? `挿絵 ${n} 枚は、本文の最後に並びます（本文に［挿絵］を書くと、その位置に入ります）。`
    : marks > n ? `本文の［挿絵］が ${marks} か所、挿絵が ${n} 枚です。足りない分は表示されません。`
      : marks < n ? `本文の［挿絵］が ${marks} か所、挿絵が ${n} 枚です。余った ${n - marks} 枚は本文の最後に並びます。`
        : `本文の［挿絵］${marks} か所に、挿絵 ${n} 枚が入ります。`;
}

// ---- 入力を集めて確かめる（サイトの公開が止まる原因を、保存前に止める）
function collect(status) {
  const f = $('[data-form]').elements; const cur = S.cur; const K = KINDS[cur.kind];
  const d = clone(cur.d);
  d.title = f.title.value.trim();
  d.number = Number(f.number.value);
  d.publishedAt = f.publishedAt.value;
  d.status = status;
  if (cur.kind === 'novel') {
    d.chapter = Number(f.chapter.value) || 1;
    d.body = f.body.value.replace(/\r\n?/g, '\n');
    d.summary = f.summary.value.trim();
    d.contentWarnings = fromLines(f.contentWarnings.value);
    if (f.relatedMangaNumber.value) d.relatedMangaNumber = Number(f.relatedMangaNumber.value); else delete d.relatedMangaNumber;
    delete d.relatedMangaId;
  } else if (cur.kind === 'manga') {
    d.summary = f.summary.value.trim();
    d.direction = f.direction.value === 'ltr' ? 'ltr' : 'rtl';
    d.spreadFirstPageSingle = f.spreadFirstPageSingle.checked;
    d.tags = fromLines(f.tags.value);
    d.contentWarnings = fromLines(f.contentWarnings.value);
    if (f.relatedNovelNumber.value) d.relatedNovelNumber = Number(f.relatedNovelNumber.value); else delete d.relatedNovelNumber;
    delete d.relatedNovelId;
  } else {
    d.comment = f.comment.value.trim();
    d.who = f.who.value || 'both';
  }
  void K;
  return d;
}
function validate(forSave, status) {
  const cur = S.cur; const f = $('[data-form]').elements; const K = KINDS[cur.kind];
  const errs = []; const mark = (el, bad) => el && el.classList.toggle('is-invalid', !!bad);
  const title = f.title.value.trim(); const num = Number(f.number.value); const date = f.publishedAt.value;
  const needTitle = cur.kind !== 'yonkoma';
  mark(f.title, forSave && needTitle && !title); if (forSave && needTitle && !title) errs.push('タイトルを入れてください。');
  const dupe = (S.data[cur.kind] || []).find((x) => x.path !== cur.path && Number(x.data.number) === num);
  const badNum = !(Number.isInteger(num) && num >= 1) || dupe;
  mark(f.number, badNum);
  if (!(Number.isInteger(num) && num >= 1)) errs.push(`${cur.kind === 'yonkoma' ? '番号' : '話数'}は1以上の数字にしてください。`);
  else if (dupe) errs.push(`${K.no(num)}は、もう「${dupe.data.title}」が使っています。空いている番号は ${nextNumber(cur.kind)} です。`);
  const badDate = !/^\d{4}-\d{2}-\d{2}$/.test(date); mark(f.publishedAt, badDate); if (badDate) errs.push('公開日を入れてください。');
  if (forSave && status === 'published' && cur.kind !== 'novel' && !cur.imgs.length) errs.push(`公開するには、${cur.kind === 'manga' ? 'ページ' : 'コマ'}の画像が1枚以上いります。`);
  if (forSave) {
    const texts = [title, f.summary && f.summary.value, f.comment && f.comment.value, f.contentWarnings && f.contentWarnings.value, f.tags && f.tags.value].filter(Boolean).join('\n');
    const hit = S.banned.find((w) => texts.includes(w));
    if (hit) errs.push(`タイトル・あらすじ・ひとことに、サイトでは出さない決まりの言葉「${hit}」が入っています（ネタバレ防止の設定）。本文の中なら大丈夫です。`);
  }
  const be = $('[data-err="basic"]'); be.hidden = !errs.length; be.textContent = errs.join(' ');
  const hd = $('[data-hint-date]');
  const notes = [];
  if (!badDate && date > today()) notes.push(`「公開する」で保存すると、${date.slice(5).replace('-', '/')} に公開されます（予約）。`);
  if (cur.orig && cur.orig.status === 'published' && Number(cur.orig.number) !== num && cur.kind !== 'yonkoma') notes.push('公開済みの話の番号を変えると、ページのアドレスが変わります（読者のしおりがずれます）。');
  hd.hidden = !notes.length; hd.textContent = notes.join(' ');
  return errs;
}

// ---- 下のボタン
function updateBar() {
  const cur = S.cur; if (!cur) return;
  $('[data-save="draft"]').hidden = !!cur.order;
  $('.bar__btns').classList.toggle('is-single', !!cur.order);
  if (cur.order) { $('[data-save="published"]').textContent = 'この順番で保存'; return; }
  if (cur.bulk) { $('[data-save="draft"]').textContent = '下書きで保存'; $('[data-save="published"]').textContent = 'まとめて公開する'; return; }
  const pub = cur.orig && cur.orig.status === 'published';
  $('[data-save="draft"]').textContent = pub ? '下書きに戻す' : '下書きで保存';
  $('[data-save="published"]').textContent = pub ? '更新する' : '公開する';
}
function setMsg(t, ng) { const m = $('[data-bar-msg]'); m.textContent = t || ''; m.classList.toggle('is-ng', !!ng); }
function setProgress(r) { $('[data-progress]').style.width = Math.round(r * 100) + '%'; }
$$('[data-save]').forEach((b) => b.addEventListener('click', () => (S.tab === 'chapters' && !S.cur ? saveChapters() : S.cur && S.cur.order ? saveOrder() : S.cur && S.cur.bulk ? saveBulk(b.getAttribute('data-save')) : save(b.getAttribute('data-save')))));

// ---- コミット（画像＋データを1回で。ほかの保存と重なったら最新に合わせてやり直す）
async function commit(items, message) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const head = (await gh('GET', R(`/git/ref/heads/${ref()}`))).object.sha;
    const base = await gh('GET', R(`/git/commits/${head}`));
    const tree = await gh('POST', R('/git/trees'), { base_tree: base.tree.sha, tree: items });
    const c = await gh('POST', R('/git/commits'), { message, tree: tree.sha, parents: [head] });
    try { await gh('PATCH', R(`/git/refs/heads/${ref()}`), { sha: c.sha, force: false }); return c.sha; }
    catch (e) { if (!(e.status === 422 || e.status === 409)) throw e; }
  }
  throw new Error('ほかの保存と重なって、保存できませんでした。もう一度お試しください。');
}

async function save(status) {
  if (S.busy) return;
  const cur = S.cur; const K = KINDS[cur.kind];
  const errs = validate(true, status);
  if (errs.length) { setMsg(errs[0], true); $('[data-err="basic"]').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  const d = collect(status);
  S.busy = true; $$('[data-save]').forEach((b) => { b.disabled = true; });
  setProgress(0);
  try {
    const stamp = today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8);
    const jobs = cur.imgs.filter((x) => x.file).concat(cur.cover && cur.cover.file ? [cur.cover] : []);
    const items = [];
    let done = 0; const total = jobs.length * 2 + 2;
    for (const [i, it] of jobs.entries()) {
      setMsg(`画像を準備しています… ${i + 1} / ${jobs.length}`);
      const out = await convert(it.file); setProgress(++done / total);
      setMsg(`画像をアップロードしています… ${i + 1} / ${jobs.length}`);
      const blob = await gh('POST', R('/git/blobs'), { content: await toB64(out.blob), encoding: 'base64' });
      const name = `${stamp}-${it === cur.cover ? 'cover' : pad3(cur.imgs.indexOf(it) + 1)}.${out.ext}`;
      items.push({ path: K.imgDir + name, mode: '100644', type: 'blob', sha: blob.sha });
      it.path = K.imgDir.replace(/^public/, '') + name;
      setProgress(++done / total);
    }
    d[K.listKey] = cur.imgs.map((x) => x.path);
    const coverItem = (cur.coverFrom && cur.imgs.find((x) => x.id === cur.coverFrom)) || cur.cover;
    if (cur.kind !== 'yonkoma') { if (coverItem) d.cover = coverItem.path; else delete d.cover; }
    let path = cur.path;
    if (!path) {
      path = K.newPath(d.number);
      const used = new Set((S.data[cur.kind] || []).map((x) => x.path));
      for (let k = 2; used.has(path); k++) path = K.newPath(d.number).replace(/\.json$/, `-${k}.json`);
    }
    items.push({ path, mode: '100644', type: 'blob', content: JSON.stringify(d, null, 2) + '\n' });
    setMsg('保存しています…');
    const label = `${K.label} ${K.no(d.number)}「${d.title}」`;
    const sha = await commit(items, `${label}を${status === 'published' ? (cur.orig && cur.orig.status === 'published' ? '更新' : '公開') : '下書き保存'}（投稿スタジオ）`);
    setProgress(1);
    // 手元の一覧を更新
    const list = S.data[cur.kind]; const idx = list.findIndex((x) => x.path === path);
    const entry = { path, data: d };
    if (idx > -1) list[idx] = entry; else list.push(entry);
    list.sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0));
    cur.imgs.forEach((x) => { if (x.file) { x.file = null; } });
    S.dirty = false;
    watchDeploy(sha, status === 'published' && d.publishedAt <= today() ? siteUrl(K.route(d)) : null, label);
    go('#/' + cur.kind);
  } catch (e) {
    setMsg(e.message || '保存できませんでした。', true);
    if (e.status === 401) showLogin();
  } finally {
    S.busy = false; $$('[data-save]').forEach((b) => { b.disabled = false; });
  }
}

async function removeEntry() {
  const cur = S.cur; const K = KINDS[cur.kind];
  if (!confirm(`${K.label} ${K.no(cur.d.number)}「${cur.d.title}」を削除します。よろしいですか？`)) return;
  S.busy = true;
  try {
    setMsg('削除しています…');
    const sha = await commit([{ path: cur.path, mode: '100644', type: 'blob', sha: null }], `${K.label} ${K.no(cur.d.number)}「${cur.d.title}」を削除（投稿スタジオ）`);
    S.data[cur.kind] = S.data[cur.kind].filter((x) => x.path !== cur.path);
    S.dirty = false;
    watchDeploy(sha, null, `${K.label} ${K.no(cur.d.number)}の削除`);
    go('#/' + cur.kind);
  } catch (e) { setMsg(e.message, true); } finally { S.busy = false; }
}

// ---------------------------------------------------------------- 4コマをまとめて追加
// 画像をいっぺんに選ぶ → 1枚（または4枚）ごとに1本 → 番号は「次の番号」から順に → 1回で保存
async function openBulk() {
  if (!S.data.yonkoma) await loadKind('yonkoma');
  const cur = S.cur = { kind: 'yonkoma', bulk: true, path: null, orig: null, d: {}, imgs: [], per: 1, titles: {} };
  show('edit');
  S.editHash = location.hash;
  $('[data-top-title]').textContent = '4コマをまとめて追加';
  const start = nextNumber('yonkoma');
  freshForm().innerHTML = `
  <section class="sec"><h3>まとめて追加</h3>
    <p class="muted">選んだ画像が、選んだ順に <strong>その${start}</strong> から1本ずつ並びます。タイトルは入れても入れなくても OK（なければ「その◯」だけ表示）。</p>
    <div class="row2">
      <label class="f">公開日（全部同じ）<input type="date" name="publishedAt" value="${today()}"></label>
      <div class="f">1本の画像<div class="seg">
        <label><input type="radio" name="per" value="1" checked><span>1枚で1本</span></label>
        <label><input type="radio" name="per" value="4"><span>4枚で1本</span></label></div></div>
    </div>
    <p class="err" data-err="basic" hidden></p>
    <p class="hint" data-hint-date hidden></p>
  </section>
  <section class="sec"><h3>画像</h3>
    <label class="pick" data-drop>＋ 画像をまとめて選ぶ<small>何枚でも。選んだ順に後ろへ足します。PCはドラッグでも OK</small><input type="file" accept="image/*" multiple data-files></label>
    <div class="imgtools" data-imgtools hidden>
      <button class="mini" type="button" data-sort="name">ファイル名順</button>
      <button class="mini" type="button" data-sort="reverse">逆の順</button>
      <button class="mini" type="button" data-sort="clear">全部はずす</button>
    </div>
    <p class="hint" data-bulk-note hidden></p>
    <ol class="rows" data-rows></ol>
  </section>`;
  const f = $('[data-form]');
  const add = (files) => { const fs = Array.from(files || []).filter((x) => /^image\//.test(x.type) || /\.(heic|heif|jpe?g|png|webp|gif|avif)$/i.test(x.name)); if (!fs.length) return; cur.imgs.push(...fs.map(fileItem)); S.dirty = true; renderRows(); };
  $('[data-files]').addEventListener('change', (e) => { add(e.target.files); e.target.value = ''; });
  const drop = $('[data-drop]');
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, () => drop.classList.remove('is-over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); add(e.dataTransfer && e.dataTransfer.files); });
  f.addEventListener('change', (e) => { if (e.target.name === 'per') { cur.per = Number(e.target.value); renderRows(); } });
  f.addEventListener('input', (e) => {
    if (e.target.name === 'bt') { cur.titles[e.target.getAttribute('data-for')] = e.target.value; S.dirty = true; }
    if (e.target.name === 'publishedAt') bulkCheck(false);
  });
  $('[data-imgtools]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    const k = b.getAttribute('data-sort');
    if (k === 'name') cur.imgs.sort((a, c) => a.name.localeCompare(c.name, 'ja', { numeric: true }));
    if (k === 'reverse') cur.imgs.reverse();
    if (k === 'clear' && confirm('選んだ画像を全部はずしますか？')) cur.imgs = [];
    renderRows();
  });
  $('[data-rows]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const g = Number(b.closest('[data-g]').getAttribute('data-g')); const per = cur.per; const a = b.getAttribute('data-act');
    const take = (i) => cur.imgs.splice(i * per, per);
    if (a === 'up' && g > 0) { const x = take(g); cur.imgs.splice((g - 1) * per, 0, ...x); }
    if (a === 'down') { const x = take(g); cur.imgs.splice(Math.min((g + 1) * per, cur.imgs.length), 0, ...x); }
    if (a === 'del') take(g);
    S.dirty = true; renderRows();
  });
  renderRows(); updateBar(); bulkCheck(false);
  S.dirty = false; setMsg(''); window.scrollTo(0, 0);
}
function groups() { const cur = S.cur; const out = []; for (let i = 0; i < cur.imgs.length; i += cur.per) out.push(cur.imgs.slice(i, i + cur.per)); return out; }
function renderRows() {
  const cur = S.cur; const start = nextNumber('yonkoma'); const gs = groups();
  $('[data-imgtools]').hidden = !cur.imgs.length;
  $('[data-rows]').innerHTML = gs.map((g, i) => `<li class="brow" data-g="${i}">
    <span class="brow__imgs">${g.map((it) => `<img src="${it.url}" alt="">`).join('')}</span>
    <span class="brow__main"><span class="brow__no">その${start + i}${cur.per === 4 && g.length < 4 ? `<em>（${g.length}枚）</em>` : ''}</span>
      <input type="text" name="bt" data-for="${g[0].id}" value="${esc(cur.titles[g[0].id] || '')}" placeholder="タイトル（なくても OK）" aria-label="その${start + i}のタイトル"></span>
    <span class="brow__tools"><button type="button" data-act="up" aria-label="その${start + i}を前へ"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" data-act="down" aria-label="その${start + i}を後ろへ"${i === gs.length - 1 ? ' disabled' : ''}>▼</button><button type="button" data-act="del" aria-label="その${start + i}をはずす">✕</button></span>
  </li>`).join('');
  const note = $('[data-bulk-note]');
  note.hidden = !gs.length;
  note.className = 'hint' + (cur.per === 4 && cur.imgs.length % 4 ? '' : ' hint--ok');
  note.textContent = !gs.length ? '' : cur.per === 4 && cur.imgs.length % 4
    ? `画像が ${cur.imgs.length} 枚で、4枚ずつに分けると最後の1本が ${cur.imgs.length % 4} 枚になります。`
    : `${gs.length} 本（その${start}〜その${start + gs.length - 1}）を追加します。`;
  setMsg(gs.length ? `${gs.length} 本をまとめて保存します` : '画像を選んでください');
}
function bulkCheck(forSave, status) {
  const f = $('[data-form]').elements; const errs = [];
  const date = f.publishedAt.value; const bad = !/^\d{4}-\d{2}-\d{2}$/.test(date);
  f.publishedAt.classList.toggle('is-invalid', bad); if (bad) errs.push('公開日を入れてください。');
  if (forSave && !S.cur.imgs.length) errs.push('画像を選んでください。');
  if (forSave) { const t = Object.values(S.cur.titles).join('\n'); const hit = S.banned.find((w) => t.includes(w)); if (hit) errs.push(`タイトルに、サイトでは出さない決まりの言葉「${hit}」が入っています。`); }
  const be = $('[data-err="basic"]'); be.hidden = !errs.length; be.textContent = errs.join(' ');
  const hd = $('[data-hint-date]'); hd.hidden = bad || date <= today(); hd.textContent = !bad && date > today() ? `「まとめて公開する」で保存すると、${date.slice(5).replace('-', '/')} に公開されます（予約）。` : '';
  void status;
  return errs;
}
async function saveBulk(status) {
  if (S.busy) return;
  const cur = S.cur; const K = KINDS.yonkoma;
  const errs = bulkCheck(true, status);
  if (errs.length) { setMsg(errs[0], true); return; }
  S.busy = true; $$('[data-save]').forEach((b) => { b.disabled = true; }); setProgress(0);
  try {
    const date = $('[data-form]').elements.publishedAt.value;
    const gs = groups(); const start = nextNumber('yonkoma');
    const stamp = today().replace(/-/g, '') + '-' + Math.random().toString(36).slice(2, 8);
    const items = []; const entries = [];
    const used = new Set((S.data.yonkoma || []).map((x) => x.path));
    const total = cur.imgs.length * 2 + 2; let done = 0; let k = 0;
    for (const [gi, g] of gs.entries()) {
      const n = start + gi; const panels = [];
      for (const it of g) {
        k++;
        setMsg(`画像を準備しています… ${k} / ${cur.imgs.length}`);
        const out = await convert(it.file); setProgress(++done / total);
        setMsg(`アップロードしています… ${k} / ${cur.imgs.length}`);
        const blob = await gh('POST', R('/git/blobs'), { content: await toB64(out.blob), encoding: 'base64' });
        const name = `${stamp}-${n}-${g.indexOf(it) + 1}.${out.ext}`;
        items.push({ path: K.imgDir + name, mode: '100644', type: 'blob', sha: blob.sha });
        panels.push(K.imgDir.replace(/^public/, '') + name);
        setProgress(++done / total);
      }
      const d = { title: (cur.titles[g[0].id] || '').trim(), number: n, publishedAt: date, status, panels, comment: '', who: 'both' };
      let path = K.newPath(n); for (let x = 2; used.has(path); x++) path = K.newPath(n).replace(/\.json$/, `-${x}.json`);
      used.add(path);
      items.push({ path, mode: '100644', type: 'blob', content: JSON.stringify(d, null, 2) + '\n' });
      entries.push({ path, data: d });
    }
    setMsg('保存しています…');
    const range = gs.length === 1 ? `その${start}` : `その${start}〜その${start + gs.length - 1}（${gs.length}本）`;
    const sha = await commit(items, `4コマ ${range}をまとめて${status === 'published' ? '公開' : '下書き保存'}（投稿スタジオ）`);
    setProgress(1);
    S.data.yonkoma.push(...entries);
    S.data.yonkoma.sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0));
    S.dirty = false;
    watchDeploy(sha, status === 'published' && date <= today() ? siteUrl('yonkoma/book/') : null, `4コマ ${range}`);
    go('#/yonkoma');
  } catch (e) {
    setMsg(e.message || '保存できませんでした。', true);
    if (e.status === 401) showLogin();
  } finally { S.busy = false; $$('[data-save]').forEach((b) => { b.disabled = false; }); }
}

// ---------------------------------------------------------------- 4コマの順番を並び替え
// 並べた順に「その1, その2, …」と番号を付け直す（画像やファイルはそのまま。番号だけ書き換える）
async function openOrder() {
  if (!S.data.yonkoma) await loadKind('yonkoma');
  const list = [...S.data.yonkoma].sort((a, b) => (Number(a.data.number) || 0) - (Number(b.data.number) || 0));
  S.cur = { kind: 'yonkoma', order: true, path: null, orig: null, d: {}, imgs: [], rows: list.map((x) => ({ path: x.path, data: x.data })) };
  show('edit');
  S.editHash = location.hash;
  $('[data-top-title]').textContent = '4コマの順番';
  const f = freshForm();
  f.innerHTML = `<section class="sec"><h3>順番を並び替え</h3>
    <p class="muted">この並びが「本のように読む」と一覧の順番になります。保存すると、上から <strong>その1, その2, …</strong> と番号を付け直します。</p>
    <p class="muted">▲▼で1つずつ、番号の欄に数字を入れるとその位置へ一気に動きます。PCはドラッグでも動かせます。</p>
    <div class="imgtools"><button class="mini" type="button" data-oreverse>逆の順</button><button class="mini" type="button" data-oreset>元に戻す</button></div>
    <ol class="rows" data-orows></ol></section>`;
  const orig = S.cur.rows.slice();
  const ol = $('[data-orows]');
  ol.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-act]'); if (!b) return;
    const i = Number(b.closest('[data-i]').getAttribute('data-i')); const rows = S.cur.rows; const a = b.getAttribute('data-act');
    if (a === 'up' && i > 0) rows.splice(i - 1, 0, rows.splice(i, 1)[0]);
    if (a === 'down' && i < rows.length - 1) rows.splice(i + 1, 0, rows.splice(i, 1)[0]);
    S.dirty = true; renderOrder();
    const again = $(`[data-i="${a === 'up' ? i - 1 : i + 1}"] [data-act="${a}"]`); if (again && !again.disabled) again.focus();
  });
  ol.addEventListener('change', (e) => {
    if (e.target.name !== 'opos') return;
    const i = Number(e.target.closest('[data-i]').getAttribute('data-i')); const rows = S.cur.rows;
    const to = Math.max(1, Math.min(rows.length, Number(e.target.value) || i + 1)) - 1;
    rows.splice(to, 0, rows.splice(i, 1)[0]); S.dirty = true; renderOrder();
    const row = $(`[data-i="${to}"]`); if (row) { row.scrollIntoView({ block: 'center', behavior: 'smooth' }); row.classList.add('is-moved'); }
  });
  let drag = null;
  ol.addEventListener('dragstart', (e) => { const li = e.target.closest('[data-i]'); if (!li) return; drag = Number(li.getAttribute('data-i')); li.classList.add('is-dragging'); try { e.dataTransfer.setData('text/plain', String(drag)); } catch { /* */ } });
  ol.addEventListener('dragend', () => { drag = null; renderOrder(); });
  ol.addEventListener('dragover', (e) => { if (drag !== null) e.preventDefault(); });
  ol.addEventListener('drop', (e) => {
    if (drag === null) return; e.preventDefault();
    const li = e.target.closest('[data-i]'); if (!li) return;
    const to = Number(li.getAttribute('data-i')); const rows = S.cur.rows;
    rows.splice(to, 0, rows.splice(drag, 1)[0]); drag = null; S.dirty = true; renderOrder();
  });
  $('[data-oreverse]').addEventListener('click', () => { S.cur.rows.reverse(); S.dirty = true; renderOrder(); });
  $('[data-oreset]').addEventListener('click', () => { S.cur.rows = orig.slice(); S.dirty = false; renderOrder(); });
  renderOrder(); updateBar(); S.dirty = false; window.scrollTo(0, 0);
}
function renderOrder() {
  const rows = S.cur.rows; const n = rows.length;
  const changed = rows.filter((r, i) => Number(r.data.number) !== i + 1).length;
  $('[data-orows]').innerHTML = rows.map((r, i) => {
    const d = r.data; const t = KINDS.yonkoma.thumb(d); const moved = Number(d.number) !== i + 1;
    return `<li class="brow orow${moved ? ' is-changed' : ''}" data-i="${i}" data-path="${esc(r.path)}" draggable="true">
      <span class="brow__imgs">${t ? thumbTag(t) : ''}</span>
      <span class="brow__main"><span class="brow__no"><label>その<input class="opos" type="number" name="opos" min="1" max="${n}" value="${i + 1}" inputmode="numeric" aria-label="${esc(d.title || 'その' + d.number)}の位置"></label>${moved ? `<em>（いまは その${esc(d.number)}）</em>` : ''}</span>
        <span class="orow__title">${esc(d.title || '（タイトルなし）')}${d.status !== 'published' ? ' <span class="badge badge--draft">下書き</span>' : ''}</span></span>
      <span class="brow__tools"><button type="button" data-act="up" aria-label="前へ"${i === 0 ? ' disabled' : ''}>▲</button><button type="button" data-act="down" aria-label="後ろへ"${i === n - 1 ? ' disabled' : ''}>▼</button></span>
    </li>`;
  }).join('');
  setMsg(changed ? `${changed} 本の番号が変わります` : 'いまの順番のままです');
}
async function saveOrder() {
  if (S.busy) return;
  const rows = S.cur.rows;
  const changed = rows.map((r, i) => ({ r, n: i + 1 })).filter((x) => Number(x.r.data.number) !== x.n);
  if (!changed.length) { setMsg('順番は変わっていません。'); return; }
  S.busy = true; $$('[data-save]').forEach((b) => { b.disabled = true; }); setProgress(.3);
  try {
    setMsg('保存しています…');
    const items = changed.map(({ r, n }) => { const d = { ...r.data, number: n }; return { path: r.path, mode: '100644', type: 'blob', content: JSON.stringify(d, null, 2) + '\n' }; });
    const sha = await commit(items, `4コマの順番を並び替え（${changed.length}本の番号を変更・投稿スタジオ）`);
    setProgress(1);
    for (const { r, n } of changed) { const e = S.data.yonkoma.find((x) => x.path === r.path); if (e) e.data = { ...e.data, number: n }; }
    S.data.yonkoma.sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0));
    S.dirty = false;
    watchDeploy(sha, siteUrl('yonkoma/book/'), '4コマの並び替え');
    go('#/yonkoma');
  } catch (e) { setMsg(e.message || '保存できませんでした。', true); }
  finally { S.busy = false; $$('[data-save]').forEach((b) => { b.disabled = false; }); }
}

// ---------------------------------------------------------------- ♡の数（読者の応援）
// 数は Firebase（Firestore）の likes/{種類}-{話} に貯まっている。だれでも読める設定なので、ここではそのまま読むだけ
const LIKES_SEEN = 'ninamel:studio:likes-seen';
// 一覧の各話に♡の数を出す（Firestore の likes/{種類}-{話}）。1分以内なら前回の読み込みを使う
const likeId = (kind, d) => kind === 'manga' ? 'manga-' + (d.slug || 'episode-' + pad3(d.number)) : kind === 'yonkoma' ? 'yonkoma-' + (d.slug || pad3(d.number)) : '';
async function likesNow() {
  const cfg = S.likesCfg || {}; if (!cfg.projectId || !cfg.apiKey) return null;
  if (S.likesAt && Date.now() - S.likesAt < 60000) return S.likesDocs;
  S.likesDocs = await fetchLikes(cfg); S.likesAt = Date.now();
  return S.likesDocs;
}
async function fillLikes(kind) {
  if (kind !== 'manga' && kind !== 'yonkoma') return;
  let docs; try { docs = await likesNow(); } catch { return; }
  if (!docs || S.tab !== kind) return;
  const map = Object.fromEntries(docs.map((d) => [d.id, d.n]));
  const seen = likesSeen() || {};
  $$('[data-likes-id]').forEach((el) => {
    const id = el.getAttribute('data-likes-id'), n = map[id] || 0, plus = Math.max(0, n - (seen[id] || 0));
    el.innerHTML = n ? `♡ ${n}${plus ? `<em>+${plus}</em>` : ''}` : '';
  });
}
async function fetchLikes(cfg) {
  const docs = []; let token = '';
  do {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/(default)/documents/likes?pageSize=300&key=${encodeURIComponent(cfg.apiKey)}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`;
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`♡の数を読み込めませんでした（${r.status}）。Firebase の設定を確かめてください。`);
    const j = await r.json();
    (j.documents || []).forEach((d) => docs.push({ id: d.name.split('/').pop(), n: Number(d.fields && d.fields.n && d.fields.n.integerValue) || 0 }));
    token = j.nextPageToken || '';
  } while (token);
  return docs;
}
function likesSeen() { try { return JSON.parse(localStorage.getItem(LIKES_SEEN) || 'null'); } catch { return null; } }
// 投稿スタジオを開いたとき：前に「♡の数」を見たときから増えた分を、タブの印とお知らせで知らせる
async function checkLikes() {
  const cfg = S.likesCfg || {}; if (!cfg.projectId || !cfg.apiKey) return;
  let docs; try { docs = await fetchLikes(cfg); } catch { return; }
  const seen = likesSeen() || {};
  const fresh = docs.reduce((a, d) => a + Math.max(0, d.n - (seen[d.id] || 0)), 0);
  const tab = $('[data-tab="likes"]'); if (!tab) return;
  let badge = tab.querySelector('.tab-badge');
  if (!fresh) { if (badge) badge.remove(); return; }
  if (!badge) { badge = document.createElement('span'); badge.className = 'tab-badge'; tab.appendChild(badge); }
  badge.textContent = '+' + fresh;
  if (S.tab !== 'likes' && !$('.likes-toast')) {
    const t = document.createElement('button'); t.type = 'button'; t.className = 'likes-toast';
    t.innerHTML = `<span aria-hidden="true">♡</span> 新しい応援が <b>${fresh}</b> 件 届いています`;
    t.addEventListener('click', () => { t.remove(); go('#/likes'); });
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('is-in'), 30);
    setTimeout(() => { t.classList.remove('is-in'); setTimeout(() => t.remove(), 400); }, 9000);
  }
}
async function openLikes() {
  S.cur = null;
  show('list');
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === 'likes')));
  $('[data-top-title]').textContent = '投稿スタジオ';
  ensureFab();
  const body = $('[data-list-body]');
  body.innerHTML = '<p class="loading">読み込み中…</p>';
  let cfg = {};
  try { cfg = JSON.parse(await raw('content/site.json')).likes || {}; S.likesCfg = cfg; } catch { cfg = S.likesCfg || {}; }
  if (!cfg.projectId || !cfg.apiKey) {
    body.innerHTML = '<section class="sec"><h3>♡の数</h3><p class="muted">まだ数を貯める場所（Firebase）がつながっていません。設定が終わると、ここに「どの話に何個」が出ます。</p></section>';
    return;
  }
  try {
    const docs = await fetchLikes(cfg); S.likesDocs = docs; S.likesAt = Date.now();
    const [manga, yonkoma] = await Promise.all([S.data.manga || loadKind('manga'), S.data.yonkoma || loadKind('yonkoma')]);
    const name = (id) => {
      const m = id.match(/^(manga|yonkoma)-(.+)$/); if (!m) return id;
      if (m[1] === 'manga') { const x = manga.find((e) => (e.data.slug || 'episode-' + pad3(e.data.number)) === m[2]); return '物語 ' + (x ? `第${x.data.number}話　${x.data.title || ''}` : m[2]); }
      const x = yonkoma.find((e) => pad3(e.data.number) === m[2] || String(e.data.slug || '') === m[2]); return '4コマ ' + (x ? `その${x.data.number}${x.data.title ? '　' + x.data.title : ''}` : m[2]);
    };
    const sum = (k) => docs.filter((d) => d.id.startsWith(k + '-')).reduce((a, d) => a + d.n, 0);
    const seen = likesSeen() || {};
    docs.forEach((d) => { d.plus = Math.max(0, d.n - (seen[d.id] || 0)); });
    docs.sort((a, b) => b.plus - a.plus || b.n - a.n);
    body.innerHTML = `<section class="sec"><h3>♡の数</h3>
      <p class="likes-sum"><span>物語 <b>${sum('manga')}</b></span><span>4コマ <b>${sum('yonkoma')}</b></span></p>
      ${docs.length ? `<ol class="likes">${docs.map((d) => `<li${d.plus ? ' class="is-new"' : ''}><span>${esc(name(d.id))}</span><b>${d.plus ? `<em>+${d.plus}</em>` : ''}♡ ${d.n}</b></li>`).join('')}</ol>` : '<p class="muted">まだ♡はありません。</p>'}
      <p class="muted">同じ人が同じ話に押せるのは1日1回です。数はこの画面を開いたときのものです。「+」は前にこの画面を見たときから増えた分です。</p></section>`;
    try { localStorage.setItem(LIKES_SEEN, JSON.stringify(Object.fromEntries(docs.map((d) => [d.id, d.n])))); } catch { /* なし */ }
    const b = $('[data-tab="likes"] .tab-badge'); if (b) b.remove();
    const t = $('.likes-toast'); if (t) t.remove();
  } catch (e) { body.innerHTML = `<p class="msg is-ng">${esc(e.message)}</p>`; }
}

// ---------------------------------------------------------------- 章
async function openChapters() {
  S.cur = null;
  show('list');
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === 'chapters')));
  $('[data-top-title]').textContent = '投稿スタジオ';
  const body = $('[data-list-body]');
  body.innerHTML = '<p class="loading">読み込み中…</p>';
  await loadChapters();
  const rows = (S.chapters.data.chapters || []);
  body.innerHTML = `<section class="sec"><h3>小説の章</h3><p class="muted">章の番号と名前。小説の目次の見出しになります。</p>
    <div data-chaps>${rows.map((c) => chapRow(c)).join('')}</div>
    <div class="imgtools"><button class="mini" type="button" data-chap-add>＋ 章を足す</button></div>
    <button class="btn btn--main" type="button" data-chap-save style="width:100%;margin-top:14px">章を保存する</button>
    <p class="msg" data-chap-msg></p></section>`;
  ensureFab();
  body.querySelector('[data-chap-add]').addEventListener('click', () => {
    const n = $$('[data-chaps] [name="cn"]').reduce((m, i) => Math.max(m, Number(i.value) || 0), 0) + 1;
    $('[data-chaps]').insertAdjacentHTML('beforeend', chapRow({ number: n, title: '' }));
  });
  body.querySelector('[data-chaps]').addEventListener('click', (e) => { const b = e.target.closest('[data-chap-del]'); if (b) b.closest('.chap').remove(); });
  body.querySelector('[data-chap-save]').addEventListener('click', saveChapters);
}
const chapRow = (c) => `<div class="chap"><input type="number" name="cn" min="1" value="${esc(c.number)}" aria-label="章の番号"><input type="text" name="ct" value="${esc(c.title)}" aria-label="章の名前" placeholder="章の名前"><button type="button" data-chap-del aria-label="この章を消す">✕</button></div>`;
async function saveChapters() {
  const msg = $('[data-chap-msg]');
  const chapters = $$('[data-chaps] .chap').map((r) => ({ number: Number($('[name="cn"]', r).value), title: $('[name="ct"]', r).value.trim() })).filter((c) => c.number >= 1 && c.title);
  const nums = chapters.map((c) => c.number);
  if (new Set(nums).size !== nums.length) { msg.textContent = '章の番号がかぶっています。'; msg.className = 'msg is-ng'; return; }
  chapters.sort((a, b) => a.number - b.number);
  try {
    msg.textContent = '保存しています…'; msg.className = 'msg';
    const data = { ...S.chapters.data, chapters };
    const sha = await commit([{ path: S.chapters.path, mode: '100644', type: 'blob', content: JSON.stringify(data, null, 2) + '\n' }], '小説の章を更新（投稿スタジオ）');
    S.chapters.data = data;
    msg.textContent = '保存しました。'; watchDeploy(sha, null, '章の変更');
  } catch (e) { msg.textContent = e.message; msg.className = 'msg is-ng'; }
}

// ---------------------------------------------------------------- サイトへの反映を見守る
let watchTimer = null;
function deployBanner(text, state, link) {
  const d = $('[data-deploy]'); d.hidden = false;
  d.className = 'deploy' + (state === 'ok' ? ' is-ok' : state === 'ng' ? ' is-ng' : '');
  $('[data-deploy-text]').innerHTML = esc(text) + (link ? ` <a href="${esc(link.href)}" target="_blank" rel="noopener">${esc(link.label)}</a>` : '');
}
$('[data-deploy-close]').addEventListener('click', () => { $('[data-deploy]').hidden = true; });
function watchDeploy(sha, pageUrl, label) {
  clearTimeout(watchTimer);
  const short = sha.slice(0, 7); const start = Date.now();
  deployBanner(`${label}を保存しました。サイトに反映しています…（2〜4分）`);
  let canSeeRuns = true;
  const tick = async () => {
    try {
      if (canSeeRuns) {
        const r = await gh('GET', R(`/actions/runs?head_sha=${sha}&per_page=1`)).catch((e) => { if (e.status === 403 || e.status === 404) { canSeeRuns = false; return null; } throw e; });
        const run = r && r.workflow_runs && r.workflow_runs[0];
        if (run && run.status === 'completed' && run.conclusion !== 'success') {
          deployBanner(`${label}は保存できましたが、サイトへの反映に失敗しました。Claude に「反映に失敗した」と伝えてください。`, 'ng', { href: run.html_url, label: '記録を見る' });
          return;
        }
      }
      // 公開用の保管庫に届いて、GitHub Pages の公開が終わったか
      const commits = await gh('GET', `/repos/${S.cfg.pagesRepo}/commits?per_page=5`);
      const hit = commits.find((c) => (c.commit.message || '').includes(short));
      if (hit) {
        const runs = await gh('GET', `/repos/${S.cfg.pagesRepo}/actions/runs?head_sha=${hit.sha}&per_page=1`).catch(() => null);
        const run = runs && runs.workflow_runs && runs.workflow_runs[0];
        if (!run || (run.status === 'completed' && run.conclusion === 'success')) {
          deployBanner(`${label}がサイトに反映されました。`, 'ok', pageUrl ? { href: pageUrl, label: 'サイトで見る' } : { href: S.cfg.site, label: 'サイトを見る' });
          return;
        }
      }
    } catch { /* 通信の一時的な失敗は次でやり直す */ }
    if (Date.now() - start > 9 * 60e3) { deployBanner(`${label}の反映が、まだ確認できません。少し待ってサイトを見てください。直っていなければ Claude に伝えてください。`, 'ng'); return; }
    watchTimer = setTimeout(tick, WAIT === 1 ? 15000 : WAIT);
  };
  watchTimer = setTimeout(tick, WAIT === 1 ? 20000 : WAIT);
}

// ---------------------------------------------------------------- 起動
function showLogin(msg) { show('login'); if (msg) $('[data-login-msg]').textContent = msg; }
$('[data-login]').addEventListener('click', async () => {
  const t = $('[data-token]').value.trim(); if (!t) return;
  S.token = t;
  try { await gh('GET', R('')); store(TOKEN_KEY, t); start(); }
  catch (e) { S.token = ''; $('[data-login-msg]').textContent = e.message; $('[data-login-msg]').className = 'msg is-ng'; }
});
async function start() {
  try {
    const site = JSON.parse(await raw('content/site.json'));
    S.banned = site.bannedTerms || [];
    S.likesCfg = site.likes || {};
  } catch (e) { if (e.status === 401) { store(TOKEN_KEY, null); S.token = ''; return showLogin(e.message); } }
  if (!location.hash) location.replace('#/novel');
  route();
  checkLikes();
  // 開いたままでも、5分ごとに確かめる
  setInterval(() => { if (!document.hidden) checkLikes(); }, 5 * 60 * 1000);
}
(async () => {
  S.cfg = await fetch('studio.json', { cache: 'no-store' }).then((r) => r.json());
  $('[data-site-link]').href = S.cfg.site;
  S.token = findToken();
  if (S.token) start(); else showLogin();
})();
