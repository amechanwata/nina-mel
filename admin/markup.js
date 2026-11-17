// 小説原稿（Markdown風テキスト）の変換。
// 安全性の方針：原稿中のHTMLはすべて文字としてエスケープし、
// サイトが生成するタグ（p, ruby, rt, rp, em, hr, figure）だけを出力する。

export function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- frontmatter（YAMLの簡易サブセット） ---------------------------------
// 対応：`key: value`、`key: [a, b]`、空値（null）。数値は number/chapter のみ数値化。
export function parseFrontmatter(src, file = '') {
  const text = src.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) throw new Error(`frontmatter（--- で囲んだ情報欄）がありません: ${file}`);
  const data = {};
  for (const line of m[1].split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const i = line.indexOf(':');
    if (i < 0) throw new Error(`frontmatter の書式が不正です（${file}）: ${line}`);
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (val === '' || val === 'null' || val === '~') data[key] = null;
    else if (val.startsWith('[') && val.endsWith(']')) {
      data[key] = val.slice(1, -1).split(',').map((v) => unquote(v.trim())).filter(Boolean);
    } else data[key] = unquote(val);
  }
  return { data, body: text.slice(m[0].length) };
}
function unquote(v) {
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

// --- 本文のインライン記法 -------------------------------------------------
const KANJI = '[\\u4E00-\\u9FFF\\u3400-\\u4DBF\\uF900-\\uFAFF々〆ヵヶ〇]';
const rubyHtml = (base, rt) => `<ruby>${base}<rp>（</rp><rt>${rt}</rt><rp>）</rp></ruby>`;

export function inline(raw) {
  // 1) まず全体をエスケープ（《》｜は対象外の文字なので残る）
  let s = escapeHtml(raw);
  // 2) 傍点 《《...》》
  s = s.replace(/《《([^《》\n]+?)》》/g, '<em class="bouten">$1</em>');
  // 3) 明示ルビ ｜親文字《よみ》（半角 | も可）
  s = s.replace(/[｜|]([^｜|《》\n]+?)《([^《》\n]+?)》/g, (_, b, r) => rubyHtml(b, r));
  // 4) 漢字の直後のルビ 漢字《よみ》
  s = s.replace(new RegExp(`(${KANJI}+)《([^《》\\n]+?)》`, 'g'), (_, b, r) => rubyHtml(b, r));
  return s;
}

// --- 本文のブロック -------------------------------------------------------
// ・1行 = 1段落。行頭の全角/半角スペースは取り除き、CSSで字下げする。
// ・「『（〈《【 などで始まる行は字下げしない。
// ・空行は、その数だけ「間」を空ける。
// ・*** / ＊＊＊ / ◇ だけの行は場面転換。
// ・# で始まる行は小見出し（必要な場合のみ）。
// ・［挿絵］だけの行は、その話の挿絵を上から順に1枚ずつ入れる。［挿絵3］なら3枚目。
//   ［挿絵：キャプション］のように「：」の後ろに書くと、絵の下に小さく添える（半角 [ ] や【 】も可）。
const NO_INDENT = /^[「『（(〈《【〔―…‥"“]/;

export const ILLUST_LINE = /^\s*[［\[【]\s*挿絵\s*([0-9０-９]*)\s*(?:[:：]\s*(.*?))?\s*[］\]】]\s*$/;
const toNum = (s) => Number(String(s).replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0)));

// figure(n, caption) は挿絵 n の HTML を返す関数（なければ null）。
export function renderNovelBody(body, figure = () => null) {
  const used = new Set();
  const missing = [];
  let last = 0; // 番号なしの［挿絵］は、直前の挿絵の次の番号
  const lines = body.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n');
  const out = [];
  let blank = 0;
  let chars = 0;
  const flushBlank = () => {
    if (blank > 1) out.push(`<p class="gap" style="--gap:${Math.min(blank - 1, 4)}" aria-hidden="true"></p>`);
    blank = 0;
  };
  for (const rawLine of lines) {
    const line = rawLine.replace(/[ \t]+$/, '');
    if (line.trim() === '') { blank++; continue; }
    const il = line.match(ILLUST_LINE);
    if (il) {
      blank = 0; // 挿絵の前後には「間」を入れない（余白はCSSで取る）
      const n = il[1] ? toNum(il[1]) : last + 1;
      last = n;
      const html = figure(n, (il[2] || '').trim());
      if (html) { out.push(html); used.add(n); } else missing.push(n);
      continue;
    }
    flushBlank();
    if (/^\s*(\*\s*\*\s*\*|＊\s*＊\s*＊|◇|◆)\s*$/.test(line)) {
      out.push('<hr class="scene-break">');
      blank = 0;
      continue;
    }
    const h = line.match(/^#{1,3}\s+(.+)$/);
    if (h) { out.push(`<h2 class="body-heading">${inline(h[1])}</h2>`); continue; }
    const text = line.replace(/^[　 ]+/, '');
    const cls = NO_INDENT.test(text) ? ' class="ni"' : '';
    chars += text.replace(/《[^》]*》|[｜|]/g, '').length;
    out.push(`<p${cls}>${inline(text)}</p>`);
    blank = 0;
  }
  // 空行1つは段落の区切りなので「間」にしない（2つ以上で間を空ける）
  return { html: out.join('\n'), chars, used, missing };
}
