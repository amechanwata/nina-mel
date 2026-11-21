// 花の村:一日のサイクル・お仕事・ステータス・セーブ・お酒クラフト・ふたりの時間
(() => {
'use strict';
const G = window.VILLAGE_DATA.game, V = window.VILLAGE;
const C = window.VILLAGE_DATA.craft || { materials: [], recipes: [], spots: [], jobs: {}, villager: [], fails: ['……'] };
const B = window.VILLAGE_DATA.bond || { amae: { label: '甘えたい度', init: 30 }, actions: [], scenes: {} };
for (const [k, v] of Object.entries(B.scenes || {})) window.VILLAGE.scripts[k] = v;
const KEY = 'ninamel_village_save', VER = 2, ALBUM_KEY = 'ninamel_village_album_v1';
for (const [k, v] of Object.entries(G.scenes)) V.scripts[k] = v;

// ---------- save data ----------
function fresh() {
  const stats = {}; for (const [k, v] of Object.entries(G.stats)) stats[k] = v.init;
  return { v: VER, day: 1, phase: 0, stats, mood: G.mood.init, flags: {}, done: {}, talkedIds: [], talks: 0, notes: [], titles: [], log: [], outfits: { 'ニナ': 'casual', 'メル': 'dress' }, wardrobe: [], once: {}, nights: 0, amae: B.amae.init, mats: {}, matSeen: [], bottles: {}, known: [], craftCount: 0, bondSeen: {} };
}
function migrate(d) {
  // 将来セーブ形式を変えたら、ここで古い形式を新しい形式に直す
  const f = fresh();
  if (!d || typeof d !== 'object') return f;
  if (!d.v) d.v = 1;
  const out = { ...f, ...d, stats: { ...f.stats, ...(d.stats || {}) } };
  for (const k of Object.keys(out.stats)) out.stats[k] = clamp(Number(out.stats[k]) || 0);
  out.mood = clamp(Number(out.mood) || 0); out.day = Math.max(1, Math.floor(Number(out.day) || 1)); out.phase = Math.min(3, Math.max(0, Math.floor(Number(out.phase) || 0)));
  for (const k of ['talkedIds', 'notes', 'titles', 'log']) if (!Array.isArray(out[k])) out[k] = [];
  if (typeof out.flags !== 'object' || !out.flags) out.flags = {}; if (typeof out.done !== 'object' || !out.done) out.done = {};
  for (const k of ['outfits', 'once']) if (typeof out[k] !== 'object' || !out[k] || Array.isArray(out[k])) out[k] = { ...f[k] };
  for (const k of ['wardrobe', 'matSeen', 'known']) if (!Array.isArray(out[k])) out[k] = [];
  for (const k of ['mats', 'bottles', 'bondSeen']) if (typeof out[k] !== 'object' || !out[k] || Array.isArray(out[k])) out[k] = {};
  out.amae = clamp(Number(out.amae ?? f.amae) || 0); out.craftCount = Math.max(0, Number(out.craftCount) || 0);
  delete out.items; delete out.placed; delete out.dishes; // 家具・料理の機能は外した(v1→v2) out.nights = Math.max(0, Number(out.nights) || 0);
  out.v = VER; return out;
}
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
let S;
function load() {
  let raw = null; try { raw = localStorage.getItem(KEY); } catch (e) { }
  if (!raw) return fresh();
  try { return migrate(JSON.parse(raw)); }
  catch (e) { try { localStorage.setItem(KEY + '_broken', raw); } catch (_) { } setTimeout(() => V.toast('セーブデータが読めなかったので、最初から始めます'), 1500); return fresh(); }
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
S = load();

// ---------- helpers ----------
const job = () => G.jobs[(S.day - 1) % G.jobs.length];
const phase = () => G.phases[S.phase];
function albumCount() { let a = []; try { a = JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]'); } catch (e) { } const ids = new Set((window.VILLAGE_DATA.scenes.hotspots || []).filter(h => !h.special).map(h => h.id)); return a.filter(x => ids.has(x)).length; }
function vars() { return { ...S.stats, mood: S.mood, day: S.day, talks: S.talks, job: job().id, notes: S.notes.length, album: albumCount(), nights: S.nights, amae: S.amae, recipes: S.known.length, nonalc: S.known.filter(id => recipe(id) && !recipe(id).alc).length, crafts: S.craftCount }; }
const OUT = G.outfits || {};
const outfit = (who, id) => (OUT[who] || []).find(o => o.id === id);
function checkOutfits() { for (const who of ['ニナ', 'メル']) for (const o of (OUT[who] || [])) { const key = who + ':' + o.id; if (!o.cond || S.wardrobe.includes(key)) continue; if (cond(o.cond)) { S.wardrobe.push(key); addLog(`衣装「${o.name}」`); floatMsg(`👗 ${who}の新しい衣装「${o.name}」`, '#c4607e'); } } }
const owned = (who, o) => !o.cond || S.wardrobe.includes(who + ':' + o.id);
function pairScene() { for (const p of (G.pairs || [])) if (S.outfits['ニナ'] === p.nina && S.outfits['メル'] === p.mel && !S.once[p.scene]) return p.scene; return null; }
function cond(expr) {
  if (!expr) return false;
  if (expr.startsWith('flag:')) return !!S.flags[expr.slice(5)];
  if (expr.startsWith('note:')) return S.notes.includes(expr.slice(5));
  if (expr.startsWith('title:')) return S.titles.includes(expr.slice(6));
  if (expr.startsWith('recipe:')) return S.known.includes(expr.slice(7));
  const m = expr.match(/^(\w+)(>=|<=|>|<|=|!=)(.+)$/); if (!m) return false;
  const v = vars()[m[1]], rhs = isNaN(Number(m[3])) ? m[3] : Number(m[3]);
  switch (m[2]) { case '>=': return v >= rhs; case '<=': return v <= rhs; case '>': return v > rhs; case '<': return v < rhs; case '=': return v == rhs; case '!=': return v != rhs; }
  return false;
}
function addLog(text) { S.log.unshift({ d: S.day, p: phase().label, t: text }); S.log = S.log.slice(0, 40); }
const floatQ = []; let floatBusy = false;
function floatMsg(text, color) { floatQ.push([text, color]); if (!floatBusy) nextFloat(); }
function nextFloat() { const it = floatQ.shift(); if (!it) { floatBusy = false; return; } floatBusy = true;
  const el = document.createElement('div'); el.className = 'g-float'; el.textContent = it[0]; el.style.color = it[1] || '#7a5560'; document.body.appendChild(el);
  setTimeout(() => el.classList.add('on'), 20); setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 400); }, 1500); setTimeout(nextFloat, 420); }
function changeStat(k, delta) {
  if (k === 'amae') { S.amae = clamp(S.amae + delta); return; }
  if (k === 'mood') { const b = S.mood; S.mood = clamp(S.mood + delta); const d = S.mood - b; if (d) { addLog(`${G.mood.label} ${d > 0 ? '+' : ''}${d}`); floatMsg(`${G.mood.label} ${d > 0 ? '+' : ''}${d}`, '#e2849e'); } return; }
  if (!(k in S.stats)) return; const b = S.stats[k]; S.stats[k] = clamp(b + delta); const d = S.stats[k] - b;
  if (d) { addLog(`${G.stats[k].label} ${d > 0 ? '+' : ''}${d}`); floatMsg(`${G.stats[k].label} ${d > 0 ? '+' : ''}${d}`, G.stats[k].color); }
}
function unlockNote(id) { if (S.notes.includes(id)) return; const n = G.notes.find(x => x.id === id); if (!n) return; S.notes.push(id); addLog(`観察ノート「${n.title}」`); floatMsg(`📝 観察ノート「${n.title}」`, '#7a5560'); changeStat('odd', 5); }
function checkTitles() { for (const t of G.titles) if (!S.titles.includes(t.id) && cond(t.cond)) { S.titles.push(t.id); addLog(`称号「${t.name}」`); floatMsg(`🏅 称号「${t.name}」を手に入れた`, '#c99a3a'); } }
function commit() { checkTitles(); checkOutfits(); save(); render(); }

// ---------- お酒クラフト ----------
const mat = (id) => C.materials.find(x => x.id === id), recipe = (id) => C.recipes.find(x => x.id === id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const recipeFor = (a, b) => C.recipes.find(r => (r.a === a && r.b === b) || (r.a === b && r.b === a));
function giveMat(id, n = 1, quiet) {
  const m = mat(id); if (!m) return; S.mats[id] = (S.mats[id] || 0) + n; const isNew = !S.matSeen.includes(id); if (isNew) S.matSeen.push(id);
  addLog(`素材「${m.name}」×${n}`); if (!quiet) floatMsg(`${m.icon} ${m.name} ×${n}${isNew ? ' NEW' : ''}`, '#7a8a3a'); homeBtn.classList.add('new');
}
// 調合:材料の順番は関係なし。初めて見つけたレシピだけ記録・報酬(二重にならない)
function craft(a, b) {
  if (!a || !b) return { ok: false, msg: '素材を2つえらんでね' };
  const need = {}; need[a] = (need[a] || 0) + 1; need[b] = (need[b] || 0) + 1;
  for (const [k, n] of Object.entries(need)) if ((S.mats[k] || 0) < n) return { ok: false, msg: '素材が足りない' };
  const r = recipeFor(a, b);
  if (!r) { if (C.failConsumes) for (const [k, n] of Object.entries(need)) S.mats[k] -= n; commit(); return { ok: false, fail: true, msg: pick(C.fails) }; }
  for (const [k, n] of Object.entries(need)) S.mats[k] -= n;
  S.bottles[r.id] = (S.bottles[r.id] || 0) + 1; S.craftCount++;
  const isNew = !S.known.includes(r.id);
  if (isNew) { S.known.push(r.id); addLog(`酒造ノート「${r.name}」`); floatMsg(`${r.icon} 新しいレシピ「${r.name}」`, '#a0663a'); }
  commit(); return { ok: true, r, isNew };
}
const drinkForMel = () => C.recipes.find(r => !r.alc && (S.bottles[r.id] || 0) > 0);
// 村の素材ひろい(場所ごとに1日1回)
function nearSpot() { const p = V.pos(); if (!p || p.inside) return null; return C.spots.find(sp => Math.hypot(p.x - sp.x, p.z - sp.z) < 5) || null; }
function gather(sp) {
  S.done['spot_' + sp.id] = true; const ids = [pick(sp.mats)]; if (Math.random() < 0.5) ids.push(pick(sp.mats));
  for (const id of ids) giveMat(id); commit();
}
function jobRewards() { const r = (C.jobs || {})[job().id] || {}; for (const id of (S.flags.job_good ? r.good : r.slack) || []) giveMat(id); }

// ---------- 夜の会話 ----------
function nightScene() {
  const ps = pairScene(); if (ps) return { id: ps, special: true };
  const N = G.nights || {};
  for (const o of (N.once || [])) if (!S.once[o.scene] && cond(o.cond)) return { id: o.scene, special: true };
  const r = N.repeat || ['night']; return { id: r[S.nights % r.length], special: false };
}
const isNight = (id) => { const N = G.nights || {}; return id === 'night' || (N.repeat || []).includes(id) || (N.once || []).some(o => o.scene === id) || (G.pairs || []).some(p => p.scene === id); };
const isOnceNight = (id) => ((G.nights || {}).once || []).some(o => o.scene === id) || (G.pairs || []).some(p => p.scene === id);

// ---------- ふたりの時間 ----------
let bondRun = null; // いま再生中の行動
function bondActions() { const ph = phase().id; return (B.actions || []).filter(a => a.phases.includes(ph)); }
function startBond(a) {
  const d = a.drinkScene ? drinkForMel() : null;
  bondRun = { a, drink: d ? d.id : null }; const sc = d ? a.drinkScene : a.scene;
  V.start(sc);
}
function endBond(id) {
  const run = bondRun; bondRun = null; if (!run || S.done.bond) return;
  const a = run.a; S.done.bond = true;
  if (run.drink && (S.bottles[run.drink] || 0) > 0) { S.bottles[run.drink]--; const r = recipe(run.drink); addLog(`メルに「${r.name}」をあげた`); }
  const first = !S.bondSeen[id]; S.bondSeen[id] = (S.bondSeen[id] || 0) + 1;
  if (first) changeStat('bond', run.drink ? (a.drinkFirstBond || a.firstBond || 0) : (a.firstBond || 0));
  changeStat('mood', run.drink ? (a.drinkMood || a.mood || 0) : (a.mood || 0));
  changeStat('amae', a.amae || 0);
}

// ---------- hooks from the village ----------
window.VILLAGE_HOOK = {
  cond,
  effect(cmd, args) {
    if (cmd === 'stat') changeStat(args[0], Number(args[1]) || 0);
    else if (cmd === 'mood') changeStat('mood', Number(args[0]) || 0);
    else if (cmd === 'flag') S.flags[args[0]] = true;
    else if (cmd === 'unflag') delete S.flags[args[0]];
    else if (cmd === 'note') unlockNote(args[0]);
    else if (cmd === 'log') addLog(args.join(' '));
    commit();
  },
  end(id) {
    if (id === 'morning') { S.done.morning = true; S.phase = 1; }
    else if (G.jobs.some(j => j.scene === id)) { if (!S.done.job) { S.done.job = true; addLog(`お仕事「${job().name}」`); jobRewards(); changeStat('amae', B.amae.perJob || 0); } }
    else if (id === 'report') { S.done.report = true; S.phase = 3; }
    else if (isNight(id)) { if (!S.done.night) { S.done.night = true; S.nights++; } if (isOnceNight(id)) S.once[id] = true; }
    else if (bondRun && (id === bondRun.a.scene || id === bondRun.a.drinkScene)) endBond(id);
    else if (id && id.startsWith('dress_')) { S.once[id] = true; }
    commit();
  },
  talk(mob) {
    if (mob.__gid === undefined) mob.__gid = Math.random().toString(36).slice(2, 8);
    S.talks++; if (!S.talkedIds.includes(mob.__gid)) S.talkedIds.push(mob.__gid);
    if (S.talkedIds.length >= 3) unlockNote('smile');
    if (!S.done.gift && S.talks >= 2 && (C.villager || []).length) { S.done.gift = true; giveMat(pick(C.villager)); V.toast('村人が、にこにこ笑って何かをくれた……'); }
    commit();
  },
  face(name, face) { const o = outfit(name, S.outfits[name]); return o && o.faces ? (o.faces[face] || null) : null; },
  place(where) { if (where === 'inside') { unlockNote('sanctuary'); commit(); } },
};

// ---------- HUD ----------
const css = `
#g-hud{position:fixed;left:12px;top:14px;z-index:6;display:none;flex-direction:column;align-items:flex-start;gap:8px;max-width:78vw}
#g-chip{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.85);color:#7a5560;font-weight:700;font-size:14px;border-radius:999px;padding:0 14px;height:40px;box-shadow:0 2px 10px rgba(120,60,90,.15);border:0;font-family:inherit;cursor:pointer;white-space:nowrap}
#g-chip small{font-weight:500;opacity:.7;font-size:12px}
#g-dress{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.85);font-size:18px;cursor:pointer;box-shadow:0 2px 10px rgba(120,60,90,.15);position:relative}
#g-home,#g-dress{width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.85);font-size:18px;cursor:pointer;box-shadow:0 2px 10px rgba(120,60,90,.15);position:relative}
#g-home.new:after,#g-dress.new:after{content:'';position:absolute;top:4px;right:4px;width:9px;height:9px;border-radius:50%;background:#ef6f93}
#g-ward{position:fixed;inset:0;z-index:11;display:none;background:linear-gradient(180deg,rgba(255,249,245,.97),rgba(250,232,238,.97));overflow-y:auto;touch-action:pan-y}
#g-ward .wrap{max-width:620px;margin:0 auto;padding:20px 18px 40px;color:#6b4553}
#g-ward .hd{display:flex;justify-content:space-between;align-items:center}
#g-ward .hd small{display:block;font-size:11px;letter-spacing:.3em;color:#b8949f}
#g-ward h2{margin:2px 0 0;font-size:22px;color:#7a5560}
#g-ward h3{font-size:15px;margin:22px 0 10px;color:#a05c75;letter-spacing:.1em}
#g-ward .x{font:inherit;font-weight:700;border:0;border-radius:999px;width:44px;height:44px;background:#fff;color:#a05c75;font-size:16px;cursor:pointer;box-shadow:0 2px 10px rgba(120,60,90,.15)}
#g-ward .row{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
#g-ward .oc{background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 14px rgba(110,60,80,.12);cursor:pointer;border:3px solid transparent;position:relative}
#g-ward .oc .im.fl{background-size:contain;background-position:50% 100%;background-repeat:no-repeat;background-color:#fff7f4}
#g-ward .oc.on{border-color:#e98aa4}
#g-ward .oc .im{aspect-ratio:3/4;background-size:cover;background-position:50% 20%}
#g-ward .oc.lock{cursor:default}
#g-ward .oc.lock .im{filter:brightness(0) opacity(.18)}
#g-ward .oc .nm{padding:8px 10px;font-size:14px;font-weight:700}
#g-ward .oc .ht{padding:0 10px 10px;font-size:12px;color:#a0838d}
#g-ward .oc .eq{position:absolute;top:8px;left:8px;background:#e98aa4;color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:999px}
#g-ward .tabs{display:flex;gap:8px;margin-top:16px;position:sticky;top:0;z-index:2;padding:6px 0;background:linear-gradient(180deg,rgba(255,249,245,.98) 70%,rgba(255,249,245,0))}
#g-ward .tab{flex:1;font:inherit;font-weight:700;font-size:16px;border:0;border-radius:999px;height:46px;cursor:pointer;background:#fff;color:#a0838d;box-shadow:0 2px 10px rgba(120,60,90,.12);position:relative}
#g-ward .tab.on{color:#fff}
#g-ward .tab.on.nina{background:#7b7f9e}
#g-ward .tab.on.mel{background:#e98aa4}
#g-ward .tab.new:after{content:'';position:absolute;top:8px;right:16px;width:9px;height:9px;border-radius:50%;background:#ef6f93}
#g-ward .ws{position:relative;height:min(56vh,460px);margin:12px 0 4px;border-radius:22px;overflow:hidden;background:radial-gradient(ellipse at 50% 85%,#fff 0,#fff6f2 45%,#fbe7ee 100%);box-shadow:0 4px 14px rgba(110,60,80,.12)}
#g-ward .wrap.nina .ws{background:radial-gradient(ellipse at 50% 85%,#fff 0,#f4f3f8 45%,#e4e5f0 100%)}
#g-ward .ws .floor{position:absolute;left:28%;right:28%;bottom:4%;height:5%;border-radius:50%;background:rgba(110,60,80,.14);filter:blur(3px)}
#g-ward .ws .sway{position:absolute;left:4%;right:4%;top:12%;bottom:5%;transform-origin:50% 100%;animation:wsway 7s ease-in-out infinite}
#g-ward .ws .hop{width:100%;height:100%;transform-origin:50% 100%}
#g-ward .ws .hop.go{animation:whop .45s cubic-bezier(.3,.7,.4,1)}
#g-ward .ws img.fig{width:100%;height:100%;object-fit:contain;object-position:50% 100%;display:block;transform-origin:50% 100%;animation:wbreathe 3.4s ease-in-out infinite;transition:opacity .2s,transform .2s;cursor:pointer;-webkit-user-drag:none;user-select:none}
#g-ward .ws img.fig.out{opacity:0;transform:scale(.96)}
@keyframes wbreathe{0%,100%{transform:translateY(0) scaleY(1)}50%{transform:translateY(-4px) scaleY(1.012)}}
@keyframes wsway{0%,100%{transform:rotate(-.7deg)}50%{transform:rotate(.7deg)}}
@keyframes whop{0%{transform:translateY(0)}35%{transform:translateY(-22px) scaleY(1.02)}70%{transform:translateY(0) scaleY(.98)}100%{transform:none}}
#g-ward .ws .sp{position:absolute;pointer-events:none;color:#f2b84b;font-size:18px;animation:wspark .9s ease-out forwards;text-shadow:0 0 6px #fff}
@keyframes wspark{0%{opacity:0;transform:scale(.2) rotate(0)}30%{opacity:1}100%{opacity:0;transform:scale(1.3) rotate(90deg) translateY(-14px)}}
#g-ward .ws .bub{position:absolute;left:10px;right:10px;top:10px;display:flex;gap:10px;align-items:center;background:#fff;border-radius:16px;padding:8px 12px 8px 8px;box-shadow:0 4px 14px rgba(110,60,80,.18);opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s;pointer-events:none;z-index:3}
#g-ward .ws .bub.on{opacity:1;transform:none;pointer-events:auto;cursor:pointer}
#g-ward .ws .bub .fc{width:44px;height:44px;border-radius:50%;background-size:cover;background-position:50% 25%;flex:none;border:2px solid #f6d3dd}
#g-ward .ws .bub small{display:block;font-size:11px;font-weight:700;color:#e2849e}
#g-ward .ws .bub small.nina{color:#6d7192}
#g-ward .ws .bub span{font-size:14px;line-height:1.5;color:#6b4553}
#g-ward .ws .mot{position:absolute;right:10px;bottom:10px;z-index:3;font:inherit;font-size:12px;font-weight:700;border:0;border-radius:999px;padding:6px 12px;background:rgba(255,255,255,.9);color:#a05c75;cursor:pointer;box-shadow:0 2px 8px rgba(120,60,90,.15)}
#g-ward .ws .kari{position:absolute;left:10px;bottom:10px;z-index:3;font-size:11px;color:#b8949f}
#g-ward .info{font-size:13px;color:#8a6f78;text-align:center;margin:8px 0 0}
#g-ward .info b{font-size:16px;color:#7a5560}
#g-ward.still .ws .sway,#g-ward.still .ws img.fig,#g-ward.still .ws .hop.go{animation:none}
#g-ward.still .ws img.fig{transition:none}
@media (prefers-reduced-motion: reduce){#g-ward .ws .bub{transition:none}}
#g-ward .wrap.nina h3{color:#6d7192}
#g-ward .wrap.nina .oc.on{border-color:#7b7f9e}
#g-ward .wrap.nina .oc .eq{background:#7b7f9e}
#g-ward .oc .nw{position:absolute;top:8px;right:8px;background:#ef6f93;color:#fff;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px}
#g-ward .pair{background:#fff;border-radius:16px;padding:12px 16px;font-size:14px;box-shadow:0 4px 14px rgba(110,60,80,.1);margin-bottom:8px}
#g-act{font:inherit;font-weight:700;font-size:15px;border:0;border-radius:999px;padding:11px 18px;background:#e98aa4;color:#fff;box-shadow:0 6px 16px rgba(233,138,164,.4);cursor:pointer;text-align:left;animation:gpulse 2.4s ease-in-out infinite}
@keyframes gpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.04)}}
.g-float{position:fixed;left:50%;top:22%;transform:translate(-50%,10px);z-index:60;background:#fff;padding:8px 16px;border-radius:999px;font-weight:700;font-size:15px;box-shadow:0 6px 18px rgba(110,60,80,.22);opacity:0;transition:opacity .35s,transform .35s;pointer-events:none;white-space:nowrap}
.g-float.on{opacity:1;transform:translate(-50%,0)}
#g-note{position:fixed;inset:0;z-index:11;display:none;background:linear-gradient(180deg,rgba(255,249,245,.97),rgba(250,232,238,.97));overflow-y:auto;touch-action:pan-y}
#g-note .wrap{max-width:620px;margin:0 auto;padding:20px 18px 40px;color:#6b4553}
#g-note .hd{display:flex;justify-content:space-between;align-items:center}
#g-note .hd small{display:block;font-size:11px;letter-spacing:.3em;color:#b8949f}
#g-note h2{margin:2px 0 0;font-size:22px;color:#7a5560}
#g-note .x{font:inherit;font-weight:700;border:0;border-radius:999px;width:44px;height:44px;background:#fff;color:#a05c75;font-size:16px;cursor:pointer;box-shadow:0 2px 10px rgba(120,60,90,.15)}
#g-note h3{font-size:15px;margin:22px 0 8px;color:#a05c75;letter-spacing:.1em}
#g-note .card{background:#fff;border-radius:16px;padding:14px 16px;box-shadow:0 4px 14px rgba(110,60,80,.1)}
#g-note .bar{display:grid;grid-template-columns:8.5em 1fr 2.5em;align-items:center;gap:10px;margin:8px 0;font-size:14px}
#g-note .bar i{display:block;height:10px;border-radius:99px;background:#f1e3e8;overflow:hidden}
#g-note .bar i b{display:block;height:100%;border-radius:99px}
#g-note .bar span{text-align:right;font-weight:700}
#g-note .item{padding:10px 0;border-bottom:1px dashed #efd6de;font-size:14px;line-height:1.7}
#g-note .item:last-child{border:0}
#g-note .item b{display:block;color:#7a5560}
#g-note .lock{color:#b8a3aa}
#g-note .log{font-size:13px;color:#8a6f78;line-height:1.9}
#g-note .reset{margin-top:26px;font:inherit;font-size:13px;border:1px solid #e3c3cd;background:#fff;color:#a05c75;border-radius:999px;padding:8px 16px;cursor:pointer}
#g-near{font:inherit;font-weight:700;font-size:14px;border:0;border-radius:999px;padding:9px 16px;background:#fff;color:#a05c75;box-shadow:0 4px 12px rgba(120,60,90,.2);cursor:pointer;display:none}
#g-room{position:fixed;inset:0;z-index:11;display:none;background:#f6ece2;overflow-y:auto;touch-action:pan-y}
#g-room .wrap{max-width:620px;margin:0 auto;padding:20px 18px 40px;color:#6b4553}
#g-room .hd{display:flex;justify-content:space-between;align-items:center}
#g-room .hd small{display:block;font-size:11px;letter-spacing:.3em;color:#b8949f}
#g-room h2{margin:2px 0 0;font-size:22px;color:#7a5560}
#g-room .x{font:inherit;font-weight:700;border:0;border-radius:999px;width:44px;height:44px;background:#fff;color:#a05c75;font-size:16px;cursor:pointer;box-shadow:0 2px 10px rgba(120,60,90,.15)}
#g-room .rm{position:relative;margin-top:16px;aspect-ratio:4/3.3;border-radius:14px;overflow:hidden;box-shadow:0 8px 24px rgba(110,60,80,.18),inset 0 0 0 3px #fff;
 background:linear-gradient(180deg,transparent 64%,#c49a72 64%,#b58b63 100%),repeating-linear-gradient(90deg,#f3dfd2 0 22px,#efd5c6 22px 44px)}
#g-room .rm:before{content:'';position:absolute;left:0;right:0;top:64%;height:6px;background:#9c7553}
#g-room .shelfboard{position:absolute;left:59%;right:2%;top:46.5%;height:7px;background:#a87f5b;border-radius:3px;box-shadow:0 3px 0 rgba(0,0,0,.08)}
#g-room .win{position:absolute;left:8%;top:9%;width:20%;height:24%;background:linear-gradient(#cfe6f2,#eaf4f8);border:6px solid #fff;border-radius:50% 50% 6px 6px;box-shadow:0 2px 6px rgba(0,0,0,.08)}
#g-room .bed{position:absolute;left:5%;bottom:6%;width:34%;height:22%;background:#fff;border-radius:12px 12px 6px 6px;box-shadow:0 4px 0 #d9c3c9}
#g-room .bed:before{content:'';position:absolute;left:8%;top:-18%;width:30%;height:40%;background:#fbe7ee;border-radius:10px}
#g-room .tip{font-size:12px;color:#a0838d;margin-top:14px;line-height:1.7}
#g-room .bottles{position:absolute;left:59%;right:2%;top:30%;height:16.5%;display:flex;align-items:flex-end;justify-content:space-around;font-size:clamp(14px,4vw,22px)}
#g-room .bottles span.no{filter:grayscale(1) opacity(.18)}
#g-room .tag{position:absolute;right:4%;top:49%;font-size:11px;color:#8a6448;background:#fff8ee;border-radius:6px;padding:1px 6px}
#g-room .tbl{margin-top:14px;background:#fff;border-radius:16px;padding:14px;box-shadow:0 4px 14px rgba(110,60,80,.1)}
#g-room .tbl h3{margin:0 0 10px;font-size:15px;color:#a05c75;letter-spacing:.1em}
#g-room .pot{display:flex;align-items:center;justify-content:center;gap:10px;font-size:20px;color:#b8949f}
#g-room .pot button{width:72px;height:72px;border-radius:16px;border:2px dashed #e3c3cd;background:#fffaf8;font-size:30px;cursor:pointer;padding:0;line-height:1.1}
#g-room .pot button.f{border:2px solid #e98aa4;background:#fff}
#g-room .pot button small{display:block;font-size:10px;color:#8a6f78}
#g-room .mats{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:12px}
#g-room .mats button{font:inherit;border:1px solid #efd6de;background:#fffaf8;border-radius:12px;padding:6px 0 4px;cursor:pointer;color:#6b4553;font-size:22px;line-height:1.1;position:relative;min-height:56px}
#g-room .mats button small{display:block;font-size:10px}
#g-room .mats button b{position:absolute;top:2px;right:5px;font-size:11px;color:#a05c75}
#g-room .mats button:disabled{opacity:.45;cursor:default}
#g-room .mats button.unk{filter:grayscale(1);opacity:.35}
#g-room .res{margin-top:12px;min-height:22px;text-align:center;font-size:14px;line-height:1.7}
#g-room .res .big{font-size:40px;display:block}
#g-room .res .new{display:inline-block;background:#ef6f93;color:#fff;font-size:11px;font-weight:700;border-radius:99px;padding:1px 8px;margin-left:4px}
#g-bmenu{position:fixed;inset:0;z-index:70;display:none;align-items:flex-end;justify-content:center;background:rgba(80,50,60,.3)}
#g-bmenu .box{background:#fff;border-radius:22px 22px 0 0;padding:20px 18px 28px;width:100%;max-width:520px;color:#6b4553}
#g-bmenu h3{margin:0 0 4px;color:#a05c75;font-size:17px}
#g-bmenu p{margin:0 0 12px;font-size:13px;color:#a0838d}
#g-bmenu .opt{display:flex;align-items:center;gap:12px;width:100%;font:inherit;font-size:15px;font-weight:700;text-align:left;border:1px solid #f1dde3;background:#fffaf8;border-radius:16px;padding:14px;margin-bottom:8px;cursor:pointer;color:#6b4553}
#g-bmenu .opt span{font-size:26px}
#g-bmenu .opt small{display:block;font-weight:500;font-size:12px;color:#a0838d}
#g-bond{font:inherit;font-weight:700;font-size:14px;border:0;border-radius:999px;padding:9px 16px;background:#fff;color:#d0607e;box-shadow:0 4px 12px rgba(120,60,90,.2);cursor:pointer;display:none}
#g-note .dg{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px}
#g-note .dc{background:#fffaf8;border:1px solid #f1dde3;border-radius:12px;padding:10px;font-size:12px;line-height:1.6}
#g-note .dc b{font-size:14px}
#g-note .dc .ic{font-size:28px}
#g-confirm{position:fixed;inset:0;z-index:70;display:none;align-items:center;justify-content:center;background:rgba(80,50,60,.35)}
#g-confirm .box{background:#fff;border-radius:18px;padding:22px;max-width:320px;text-align:center;color:#6b4553;box-shadow:0 10px 30px rgba(0,0,0,.2)}
#g-confirm button{font:inherit;font-weight:700;border:0;border-radius:999px;padding:10px 18px;margin:14px 6px 0;cursor:pointer}
`;
const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
const hud = document.createElement('div'); hud.id = 'g-hud'; hud.innerHTML = '<div style="display:flex;gap:6px"><button id="g-chip" type="button"></button><button id="g-dress" type="button" aria-label="着せ替え">👗</button><button id="g-home" type="button" aria-label="ニナの小屋">🏠</button></div><button id="g-act" type="button"></button><button id="g-bond" type="button">💗 ふたりの時間</button><button id="g-near" type="button"></button>'; document.body.appendChild(hud);
const note = document.createElement('div'); note.id = 'g-note'; note.innerHTML = '<div class="wrap"><div class="hd"><div><small>NINA\'S NOTEBOOK</small><h2>ニナの手帳</h2></div><button class="x" type="button" aria-label="閉じる">✕</button></div><div class="body"></div></div>'; document.body.appendChild(note);
const conf = document.createElement('div'); conf.id = 'g-confirm'; conf.innerHTML = '<div class="box"><p>最初の日からやり直しますか?<br><small>ステータス・観察ノート・称号・素材・酒造ノートが消えます(会話アルバムは残ります)</small></p><button type="button" class="no" style="background:#f3e6ea;color:#7a5560">やめる</button><button type="button" class="yes" style="background:#e98aa4;color:#fff">やり直す</button></div>'; document.body.appendChild(conf);
for (const el of [hud, note, conf]) el.addEventListener('pointerdown', e => e.stopPropagation());
addEventListener('pagehide', save); document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') save(); });
const chip = hud.querySelector('#g-chip'), act = hud.querySelector('#g-act'), dressBtn = hud.querySelector('#g-dress'), homeBtn = hud.querySelector('#g-home'), nearBtn = hud.querySelector('#g-near'), bondBtn = hud.querySelector('#g-bond');
const ward = document.createElement('div'); ward.id = 'g-ward'; ward.innerHTML = '<div class="wrap"><div class="hd"><div><small>WARDROBE</small><h2>着せ替え</h2></div><button class="x" type="button" aria-label="閉じる">✕</button></div><div class="body"></div></div>'; document.body.appendChild(ward);
ward.addEventListener('pointerdown', e => e.stopPropagation());
ward.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); ward.style.display = 'none'; say([]); backToBook(); });
dressBtn.addEventListener('click', e => { e.stopPropagation(); dressBtn.classList.remove('new'); const nw = S.wardrobe.find(k => !wardSeen.has(k)); if (nw) wardTab = nw.split(':')[0]; renderWard(); ward.style.display = 'block'; ward.scrollTop = 0; });
let seenWard = S.wardrobe.length, wardTab = 'ニナ';
const wardSeen = new Set(S.wardrobe); // 開いた時点で見た衣装(NEWマーク用)
const WHO = { 'ニナ': { cls: 'nina', en: 'NINA' }, 'メル': { cls: 'mel', en: 'MEL' } };
const WD = window.VILLAGE_DATA.wardrobe || { reactions: {}, pairs: [] };
const IMGS = window.VILLAGE_DATA.scenes.images || {}, CHR = window.VILLAGE_DATA.scenes.chars || {};
const faceImg = (who, face) => { const c = CHR[who]; const k = c && c.face && (c.face[face] || c.face.normal); return IMGS[k] || ''; };
const fullOf = (who, o) => (o && (o.full || IMGS[o.img])) || '';
// モーションON/OFF(端末の「視差効果を減らす」設定ならOFFから)
const MOTION_KEY = 'ninamel_village_motion';
let motionOn = (() => { try { const v = localStorage.getItem(MOTION_KEY); if (v) return v === 'on'; } catch (e) { } return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); })();
function applyMotion() { ward.classList.toggle('still', !motionOn); document.body.classList.toggle('still', !motionOn); const b = ward.querySelector('.ws .mot'); if (b) b.textContent = motionOn ? '✨ モーション ON' : 'モーション OFF'; }
// 立ち絵ステージ(着替えのたびに作り直さない)
const wbody = ward.querySelector('.body');
wbody.innerHTML = '<div class="tabs"></div><div class="ws"><div class="floor"></div><div class="sway"><div class="hop"><img class="fig" alt="" draggable="false"></div></div><div class="bub"><div class="fc"></div><div><small></small><span></span></div></div><span class="kari"></span><button type="button" class="mot"></button></div><p class="info"></p><div class="rest"></div>';
const ws = wbody.querySelector('.ws'), figImg = ws.querySelector('img.fig'), hop = ws.querySelector('.hop'), bub = ws.querySelector('.bub');
figImg.addEventListener('click', e => { e.stopPropagation(); if (!motionOn) return; hop.classList.remove('go'); void hop.offsetWidth; hop.classList.add('go'); });
hop.addEventListener('animationend', () => hop.classList.remove('go'));
ws.querySelector('.mot').addEventListener('click', e => { e.stopPropagation(); motionOn = !motionOn; try { localStorage.setItem(MOTION_KEY, motionOn ? 'on' : 'off'); } catch (_) { } applyMotion(); });
let figKey = '', figT = 0;
function showFigure(who, animate) {
  const o = outfit(who, S.outfits[who]) || (OUT[who] || [])[0]; const src = fullOf(who, o), key = who + ':' + (o && o.id);
  ws.querySelector('.kari').textContent = o && o.full && /\.svg$/.test(o.full) ? '※ 仮の立ち絵' : '';
  if (key === figKey) return; figKey = key; clearTimeout(figT);
  // 先に読み込んでから切り替える(読み込み中は今の絵を出したまま)。途中で別の服やタブに変わったら、古い読み込みは捨てる
  const pre = new Image(); let done = false;
  const go = () => {
    if (done || figKey !== key) return; done = true; clearTimeout(figT);
    if (!animate || !motionOn) { figImg.classList.remove('out'); figImg.src = src; return; }
    figImg.classList.add('out');
    figT = setTimeout(() => { if (figKey !== key) return; figImg.src = src; requestAnimationFrame(() => figImg.classList.remove('out')); sparkle(); }, 180);
  };
  pre.onload = pre.onerror = go; pre.src = src;
  if (pre.complete) go(); else figT = setTimeout(go, 4000);
}
// 着ている服の立ち絵は先に読み込んでおく
function preloadFigures() { for (const w of ['ニナ', 'メル']) for (const o of (OUT[w] || [])) if (owned(w, o)) { const im = new Image(); im.src = fullOf(w, o); } }
function sparkle() {
  for (let i = 0; i < 9; i++) { const sp = document.createElement('span'); sp.className = 'sp'; sp.textContent = i % 3 ? '✦' : '✧';
    sp.style.left = (18 + Math.random() * 64) + '%'; sp.style.top = (18 + Math.random() * 60) + '%'; sp.style.animationDelay = (i * 0.05) + 's'; sp.style.fontSize = (12 + Math.random() * 14) + 'px';
    ws.appendChild(sp); setTimeout(() => sp.remove(), 1400); }
}
// 感想・ペアの掛け合い
let bubQ = [], bubT = 0;
function say(lines) { bubQ = lines.slice(); clearTimeout(bubT); nextBub(); }
function nextBub() {
  clearTimeout(bubT); const l = bubQ.shift(); if (!l) { bub.classList.remove('on'); return; }
  bub.querySelector('.fc').style.backgroundImage = `url(${faceImg(l.who, l.face)})`;
  const nm = bub.querySelector('small'); nm.textContent = l.who; nm.className = l.who === 'ニナ' ? 'nina' : '';
  bub.querySelector('span').textContent = l.text; bub.classList.add('on');
  bubT = setTimeout(nextBub, Math.max(2600, l.text.length * 140));
}
bub.addEventListener('click', e => { e.stopPropagation(); nextBub(); });
function reactTo(who) {
  const pr = (WD.pairs || []).find(p => S.outfits['ニナ'] === p.nina && S.outfits['メル'] === p.mel);
  if (pr && pr.lines && pr.lines.length) return say(pr.lines);
  const other = who === 'ニナ' ? 'メル' : 'ニナ', R = (WD.reactions || {})[who] || {};
  const list = R[S.outfits[who]] || R._default || []; if (!list.length) return;
  const l = pick(list); say([{ who: other, face: l.face, text: l.text }]);
}
function renderWard(changed) {
  seenWard = S.wardrobe.length;
  const who = wardTab, other = who === 'ニナ' ? 'メル' : 'ニナ', list = OUT[who] || [], cur = outfit(who, S.outfits[who]) || list[0];
  const hasNew = (w) => (OUT[w] || []).some(o => o.cond && S.wardrobe.includes(w + ':' + o.id) && !wardSeen.has(w + ':' + o.id));
  ward.querySelector('.wrap').className = 'wrap ' + WHO[who].cls;
  wbody.querySelector('.tabs').innerHTML = Object.keys(WHO).map(w => `<button type="button" class="tab ${WHO[w].cls} ${w === who ? 'on' : ''} ${w !== who && hasNew(w) ? 'new' : ''}" data-w="${w}">${w}</button>`).join('');
  showFigure(who, !!changed);
  wbody.querySelector('.info').innerHTML = `<b>${cur.name}</b><br>持っている服:${list.filter(o => owned(who, o)).length} / ${list.length}・${other}は「${(outfit(other, S.outfits[other]) || {}).name || ''}」`;
  let h = `<h3>${who}の服</h3><div class="row">`;
  for (const o of list) { const key = who + ':' + o.id, ok = owned(who, o), on = S.outfits[who] === o.id, isNew = ok && o.cond && !wardSeen.has(key);
    h += `<div class="oc ${ok ? '' : 'lock'} ${on ? 'on' : ''}" data-id="${o.id}"><div class="im ${o.card || IMGS[o.img] ? '' : 'fl'}" style="background-image:url(${o.card || IMGS[o.img] || o.full || ''})"></div>${on ? '<div class="eq">着用中</div>' : ''}${isNew ? '<div class="nw">NEW</div>' : ''}<div class="nm">${ok ? o.name : '???'}</div><div class="ht">${ok ? '' : 'ヒント:' + o.hint}</div></div>`; }
  h += '</div>';
  const pairs = (G.pairs || []).map(p => ({ ...p, night: true }));
  for (const p of (WD.pairs || [])) if (!pairs.some(q => q.nina === p.nina && q.mel === p.mel)) pairs.push(p);
  const shown = pairs.filter(p => outfit('ニナ', p.nina) && outfit('メル', p.mel));
  if (shown.length) h += '<h3>ふたりの組み合わせ</h3>' + shown.map(p => { const n = outfit('ニナ', p.nina), m = outfit('メル', p.mel), known = owned('ニナ', n) && owned('メル', m);
    return `<div class="pair">${known ? `✦ ${n.name} × ${m.name}${p.night ? ` で、夜に「${p.name}」` : p.name ? `「${p.name}」` : ''}` : '✦ ???(ふたりの衣装をそろえると…)'}${p.night && S.once[p.scene] ? '(見た)' : ''}</div>`; }).join('');
  for (const o of list) if (owned(who, o)) wardSeen.add(who + ':' + o.id);
  const rest = wbody.querySelector('.rest'); rest.innerHTML = h;
  wbody.querySelectorAll('.tab').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); if (wardTab === el.dataset.w) return; wardTab = el.dataset.w; say([]); renderWard(); ward.scrollTop = 0; }));
  rest.querySelectorAll('.oc:not(.lock)').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); const id = el.dataset.id;
    if (S.outfits[who] === id) return; S.outfits[who] = id; const o = outfit(who, id); addLog(`${who}の服:${o.name}`); commit(); renderWard(true);
    if (o.firstScene && !S.once[o.firstScene] && !V.isOpen()) { S.once[o.firstScene] = true; save(); setTimeout(() => { ward.style.display = 'none'; say([]); bookReturn = false; V.start(o.firstScene); }, 900); return; }
    reactTo(who); ward.scrollTo({ top: 0, behavior: motionOn ? 'smooth' : 'auto' }); }));
}
applyMotion();

// ---------- ニナの小屋(秘密の調合台) ----------
const room = document.createElement('div'); room.id = 'g-room'; room.innerHTML = '<div class="wrap"><div class="hd"><div><small>NINA\'S HUT</small><h2>ニナの小屋</h2></div><button class="x" type="button" aria-label="閉じる">✕</button></div><div class="body"></div></div>'; document.body.appendChild(room);
room.addEventListener('pointerdown', e => e.stopPropagation());
room.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); room.style.display = 'none'; backToBook(); });
let pot = [null, null], lastRes = '';
function openRoom() { homeBtn.classList.remove('new'); pot = [null, null]; lastRes = ''; renderRoom(); room.style.display = 'block'; }
const left = (id) => (S.mats[id] || 0) - pot.filter(x => x === id).length;
function renderRoom() {
  let h = '<div class="rm"><div class="win"></div><div class="shelfboard"></div><div class="bed"></div><div class="bottles">'
    + C.recipes.map(r => `<span class="${S.known.includes(r.id) ? '' : 'no'}">${r.icon}</span>`).join('') + `</div><div class="tag">瓶棚 ${S.known.length}/${C.recipes.length}</div></div>`;
  h += '<div class="tbl"><h3>🍶 秘密の調合台</h3><div class="pot">'
    + pot.map((id, i) => { const m = mat(id); return `<button type="button" data-i="${i}" class="${m ? 'f' : ''}">${m ? m.icon + '<small>' + m.name + '</small>' : ''}</button>`; }).join('<span>+</span>')
    + '<span>→</span><button type="button" class="go f" style="width:auto;padding:0 16px;font-size:15px;font-weight:700;color:#fff;background:#e98aa4;border:0">調合する</button></div><div class="mats">'
    + C.materials.map(m => { const seen = S.matSeen.includes(m.id), n = left(m.id);
      return seen ? `<button type="button" data-m="${m.id}" ${n > 0 ? '' : 'disabled'}><b>${n}</b>${m.icon}<small>${m.name}</small></button>` : `<button type="button" class="unk" disabled title="${m.from}">❔<small>???</small></button>`; }).join('')
    + `</div><div class="res">${lastRes || '素材を2つえらんで、調合してみよう'}</div></div>`;
  h += `<div class="tip">素材は、村のあちこち(1日1回)・お仕事のごほうび・村人から手に入ります。<br>メル用の飲み物(お酒じゃないもの)を持っていると、「ふたりの時間」のお茶が特別になります。<br>※ 瓶や素材の絵は、いまは仮の絵文字です</div>`;
  const b = room.querySelector('.body'); b.innerHTML = h;
  b.querySelectorAll('.mats button[data-m]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); const i = pot.indexOf(null); if (i < 0 || left(el.dataset.m) <= 0) return; pot[i] = el.dataset.m; lastRes = ''; renderRoom(); }));
  b.querySelectorAll('.pot button[data-i]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); pot[+el.dataset.i] = null; renderRoom(); }));
  b.querySelector('.go').addEventListener('click', e => { e.stopPropagation();
    const r = craft(pot[0], pot[1]);
    if (r.ok) { lastRes = `<span class="big">${r.r.icon}</span><b>${r.r.name}</b>${r.isNew ? '<span class="new">NEW</span>' : ''}<br><span style="font-size:12px;color:#a0838d">${r.r.text}${r.r.alc ? '' : '(メル用)'}</span>`; pot = [null, null]; }
    else lastRes = r.fail ? `<span class="big">🫙</span>${r.msg}` : r.msg;
    renderRoom(); });
}
homeBtn.addEventListener('click', e => { e.stopPropagation(); openRoom(); });
// 近くにいるときのボタン(小屋・素材ひろい)
function nearAction() {
  const p = V.pos(); if (!p || p.inside) return null;
  if (Math.hypot(p.x + 52.8, p.z - 2.6) < 7) return { label: '▶ ニナの小屋に入る', run: openRoom };
  const sp = nearSpot(); if (!sp) return null;
  if (S.done['spot_' + sp.id]) return { label: '🧺 ここはきょうはもう見た', run: () => V.toast('また明日来てみよう') };
  return { label: '🧺 ' + sp.label, run: () => gather(sp) };
}
nearBtn.addEventListener('click', e => { e.stopPropagation(); if (V.isOpen()) return; const a = nearAction(); if (a) a.run(); });
// ふたりの時間メニュー
const bmenu = document.createElement('div'); bmenu.id = 'g-bmenu'; document.body.appendChild(bmenu);
bmenu.addEventListener('pointerdown', e => e.stopPropagation());
bmenu.addEventListener('click', e => { if (e.target === bmenu) bmenu.style.display = 'none'; });
function openBond() {
  const acts = bondActions(), d = drinkForMel();
  bmenu.innerHTML = `<div class="box"><h3>💗 ふたりの時間</h3><p>なにして過ごす?(1日1回)</p>` + acts.map((a, i) => {
    const sub = a.drinkScene && d ? `${d.icon} ${d.name}をメルにあげる` : (S.bondSeen[a.scene] || S.bondSeen[a.drinkScene]) ? 'もう一度' : 'はじめて';
    return `<button type="button" class="opt" data-i="${i}"><span>${a.icon}</span><div>${a.name}<small>${sub}</small></div></button>`; }).join('') + '<button type="button" class="opt cancel" style="justify-content:center;font-weight:500">やめる</button></div>';
  bmenu.querySelectorAll('.opt[data-i]').forEach(el => el.addEventListener('click', e => { e.stopPropagation(); bmenu.style.display = 'none'; if (V.isOpen() || S.done.bond) return; startBond(acts[+el.dataset.i]); }));
  bmenu.querySelector('.cancel').addEventListener('click', e => { e.stopPropagation(); bmenu.style.display = 'none'; });
  bmenu.style.display = 'flex';
}
bondBtn.addEventListener('click', e => { e.stopPropagation(); if (V.isOpen()) return; openBond(); });

function action() {
  const p = phase().id;
  if (p === 'morning') return S.done.morning ? null : { label: '▶ 朝の呼び出し(アルノ)', run: () => V.start('morning') };
  if (p === 'noon') return !S.done.job ? { label: `▶ お仕事:${job().name}`, run: () => V.start(job().scene) } : { label: '▶ 夕方にする', run: () => { S.phase = 2; commit(); } };
  if (p === 'evening') return { label: '▶ アルノに報告', run: () => V.start('report') };
  if (p === 'night') { const ns = nightScene(); return !S.done.night ? { label: ns.special ? '▶ メルの部屋へ ✦' : '▶ メルの部屋へ', run: () => V.start(ns.id) } : { label: '🌙 寝る(セーブ)', run: sleep }; }
}
function sleep() {
  S.amae = clamp(S.amae + (B.amae.perDay || 0) + (S.done.bond ? 0 : (B.amae.perSkip || 0)));
  S.day++; S.phase = 0; S.done = {}; S.flags = {};
  addLog(`${S.day}日目の朝`); commit(); floatMsg(`☀ ${S.day}日目の朝`, '#c99a3a');
}
function render() {
  const ph = phase();
  if (S.wardrobe.length > seenWard) dressBtn.classList.add('new');
  chip.innerHTML = `${ph.icon} ${S.day}日目・${ph.label}`;
  const a = action(); act.style.display = a ? 'block' : 'none'; if (a) act.textContent = a.label;
  V.setTint(ph.tint);
  if (note.style.display === 'block') renderNote();
  if (room.style.display === 'block') renderRoom();
  if (typeof renderBookBadge === 'function') { renderBookBadge(); if (book.style.display === 'block') renderBook(); }
}
act.addEventListener('click', e => { e.stopPropagation(); if (V.isOpen()) return; const a = action(); if (a) a.run(); });
chip.addEventListener('click', e => { e.stopPropagation(); openBook('today'); });
note.querySelector('.x').addEventListener('click', e => { e.stopPropagation(); note.style.display = 'none'; });
function renderNote() {
  const b = note.querySelector('.body');
  let albumN = 0; try { albumN = JSON.parse(localStorage.getItem(ALBUM_KEY) || '[]').length; } catch (e) { }
  const bars = Object.entries(G.stats).map(([k, v]) => `<div class="bar"><span style="text-align:left;font-weight:500">${v.label}</span><i><b style="width:${S.stats[k]}%;background:${v.color}"></b></i><span>${S.stats[k]}</span></div>`).join('')
    + `<div class="bar"><span style="text-align:left;font-weight:500">${B.amae.label}</span><i><b style="width:${S.amae}%;background:#f7c6d6"></b></i><span>${S.amae >= 70 ? '💞' : S.amae >= 40 ? '💗' : '🤍'}</span></div>`
    + `<div class="bar"><span style="text-align:left;font-weight:500">${G.mood.label}</span><i><b style="width:${S.mood}%;background:#f4b7c8"></b></i><span>${S.mood >= 70 ? '😊' : S.mood >= 40 ? '🙂' : '😤'}</span></div>`;
  const notes = G.notes.map(n => S.notes.includes(n.id) ? `<div class="item"><b>📝 ${n.title}</b>${n.text}</div>` : `<div class="item lock"><b>???</b>ヒント:${n.hint}</div>`).join('');
  const titles = G.titles.map(t => S.titles.includes(t.id) ? `<div class="item"><b>🏅 ${t.name}</b></div>` : `<div class="item lock"><b>???</b>ヒント:${t.hint}</div>`).join('');
  const brews = C.recipes.map(r => { const known = S.known.includes(r.id), a = mat(r.a), b2 = mat(r.b);
    return known ? `<div class="dc"><div class="ic">${r.icon}</div><b>${r.name}</b>${r.alc ? '' : ' 🎀メル用'}<br>${a.icon}${a.name} + ${b2.icon}${b2.name}<br>${r.text}<br><span style="color:#a0838d">持っている:${S.bottles[r.id] || 0}本</span></div>`
      : `<div class="dc lock"><div class="ic" style="filter:grayscale(1) opacity(.3)">🫙</div><b>???</b><br>ヒント:${S.matSeen.includes(r.a) ? a.icon + a.name + ' + ?' : '?'}</div>`; }).join('');
  const log = S.log.slice(0, 14).map(l => `<div>${l.d}日目・${l.p}:${l.t}</div>`).join('') || '<div>まだ記録はありません</div>';
  b.innerHTML = `<h3>きょう</h3><div class="card">${S.day}日目・${phase().label}/お仕事:${job().name}${S.done.job ? '(済)' : ''}<br>会話アルバム:${albumN} 件</div>
    <h3>ステータス</h3><div class="card">${bars}</div>
    <h3>観察ノート</h3><div class="card">${notes}</div>
    <h3>酒造ノート <small style="font-weight:500;color:#b8949f">${S.known.length} / ${C.recipes.length}</small></h3><div class="card"><div class="dg">${brews}</div></div>
    <h3>称号</h3><div class="card">${titles}</div>
    <h3>きろく</h3><div class="card log">${log}</div>
    <button class="reset" type="button">最初からやり直す</button>`;
  b.querySelector('.reset').addEventListener('click', e => { e.stopPropagation(); conf.style.display = 'flex'; });
}
conf.querySelector('.no').addEventListener('click', e => { e.stopPropagation(); conf.style.display = 'none'; });
conf.querySelector('.yes').addEventListener('click', e => { e.stopPropagation(); conf.style.display = 'none'; S = fresh(); save(); render(); note.style.display = 'none'; closeBook(); floatMsg('☀ 1日目の朝から', '#c99a3a'); });


// ---------- ニナの手帳(案A:付箋で切り替え) ----------
const bcss = `
#snd,#albumBtn,#mapBtn,#g-dress,#g-home,#g-bond{display:none!important}
#g-bottom{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(30px + env(safe-area-inset-bottom));z-index:6;display:none;flex-direction:column-reverse;align-items:center;gap:8px;pointer-events:none}
#g-bottom>*{pointer-events:auto}
#g-bottom #g-act{background:#b04f6e;font-size:16px;padding:13px 24px;min-height:50px;box-shadow:0 8px 20px rgba(150,60,90,.35);white-space:nowrap}
#g-bottom #g-near{white-space:nowrap}
#talk,#doorBtn{bottom:150px!important}
@media (pointer:coarse){#g-bottom{bottom:calc(178px + env(safe-area-inset-bottom))}#talk,#doorBtn{bottom:296px!important}}
#g-bookbtn{position:fixed;right:14px;bottom:calc(22px + env(safe-area-inset-bottom));z-index:7;width:74px;height:88px;border:0;padding:0;background:transparent;cursor:pointer;display:none;font-family:inherit}
#g-bookbtn .cv{position:absolute;inset:0 6px 12px 0;border-radius:8px 14px 14px 8px;background:#7b4b5c;box-shadow:0 8px 18px rgba(80,40,55,.35)}
#g-bookbtn .pg{position:absolute;left:6px;top:4px;right:12px;bottom:16px;border-radius:4px 10px 10px 4px;background:#fbf3e8 repeating-linear-gradient(180deg,transparent 0 10px,#e3cfc2 10px 12px);border-left:6px solid #e7c9a8}
#g-bookbtn .rb{position:absolute;right:18px;top:-2px;width:10px;height:34px;background:#e98aa4;clip-path:polygon(0 0,100% 0,100% 100%,50% 82%,0 100%)}
#g-bookbtn .lb{position:absolute;left:0;right:6px;bottom:0;text-align:center;font-size:13px;font-weight:900;color:#fff;text-shadow:0 1px 3px rgba(80,40,55,.7)}
#g-bookbtn .bd{position:absolute;right:0;top:6px;min-width:22px;height:22px;border-radius:999px;background:#c2365f;color:#fff;font-size:12px;font-weight:700;display:none;align-items:center;justify-content:center;border:2px solid #fff;box-sizing:border-box;padding:0 5px}
#g-bookbtn:active .cv,#g-bookbtn:active .pg{transform:translateY(2px)}
#g-book{position:fixed;inset:0;z-index:10;display:none;background:rgba(60,30,40,.38);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)}
#g-book .bk{position:absolute;left:max(10px,calc(50% - 300px));right:max(44px,calc(50% - 266px));top:calc(26px + env(safe-area-inset-top));bottom:calc(22px + env(safe-area-inset-bottom));border-radius:10px 18px 18px 10px;background:#7b4b5c;box-shadow:0 14px 34px rgba(60,30,40,.45);animation:bkin .28s ease-out}
@keyframes bkin{from{transform:translateY(16px) scale(.97);opacity:0}}
#g-book .pg{position:absolute;left:8px;top:6px;right:6px;bottom:8px;border-radius:6px 14px 14px 6px;background:#fbf4ea;border-left:10px solid #ead1b6;overflow-y:auto;touch-action:pan-y;padding:20px 18px 26px;box-sizing:border-box;color:#5a3946}
#g-book .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}
#g-book .hd small{display:block;font-size:11px;letter-spacing:.25em;color:#8a6a76;font-weight:700}
#g-book .hd h2{margin:2px 0 0;font-size:23px;color:#5a3946}
#g-book .x{flex:none;width:44px;height:44px;border-radius:999px;border:0;background:#fff;color:#8a4a62;font:inherit;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(110,60,80,.18)}
#g-book h3{font-size:14px;margin:20px 0 8px;color:#8a4a62;letter-spacing:.08em}
#g-book .card{background:#fff;border-radius:14px;padding:12px 14px;box-shadow:0 3px 10px rgba(110,60,80,.08)}
#g-book .todo{display:flex;align-items:center;gap:10px;min-height:40px;font-size:15px;border-bottom:1px dashed #eedfd2}
#g-book .todo:last-child{border:0}
#g-book .todo i{flex:none;width:18px;height:18px;border-radius:50%;border:2.4px solid #c9a3b1;box-sizing:border-box;font-style:normal;display:flex;align-items:center;justify-content:center;font-size:12px}
#g-book .todo.ok{color:#9a8a90;text-decoration:line-through}
#g-book .todo.ok i{border-color:#6f9a6a;color:#6f9a6a}
#g-book .todo.now{font-weight:700}
#g-book .todo.now i{border-color:#b04f6e;background:radial-gradient(#b04f6e 0 35%,transparent 40%)}
#g-book .todo span{flex:1}
#g-book .go{font:inherit;font-weight:700;font-size:13px;border:0;border-radius:999px;padding:0 14px;min-height:36px;background:#b04f6e;color:#fff;cursor:pointer;text-decoration:none}
#g-book .go.sub{background:#fff;color:#8a4a62;border:1.5px solid #e3c3cd}
#g-book .big{display:block;width:100%;margin-top:10px;font:inherit;font-weight:700;font-size:15px;border:0;border-radius:999px;min-height:48px;background:#b04f6e;color:#fff;cursor:pointer}
#g-book .bar{display:grid;grid-template-columns:8.5em 1fr 2.5em;align-items:center;gap:8px;margin:7px 0;font-size:13px}
#g-book .bar i{display:block;height:8px;border-radius:99px;background:#f1e3e8;overflow:hidden}
#g-book .bar i b{display:block;height:100%;border-radius:99px}
#g-book .bar span:last-child{text-align:right;font-weight:700}
#g-book .item{padding:9px 0;border-bottom:1px dashed #efd6de;font-size:14px;line-height:1.7}
#g-book .item:last-child{border:0}
#g-book .item b{display:block}
#g-book .lock{color:#a8939a}
#g-book .dg{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px}
#g-book .dc{background:#fffaf8;border:1px solid #f1dde3;border-radius:12px;padding:9px;font-size:12px;line-height:1.6}
#g-book .dc .ic{font-size:26px}
#g-book .log{font-size:13px;color:#7a6570;line-height:1.9}
#g-book .duo{display:grid;grid-template-columns:1fr 1fr;gap:10px}
#g-book .duo .fig{background:#fff;border-radius:14px;padding:8px;text-align:center;box-shadow:0 3px 10px rgba(110,60,80,.08)}
#g-book .duo .fig div{height:150px;background-size:contain;background-repeat:no-repeat;background-position:50% 100%}
#g-book .duo .fig b{display:block;font-size:13px;margin-top:4px}
#g-book .duo .fig small{display:block;font-size:11px;color:#8a6a76}
#g-book .shelf{display:flex;justify-content:space-around;font-size:24px;padding:6px 0 8px;border-bottom:6px solid #a87f5b;border-radius:2px}
#g-book .shelf span.no{filter:grayscale(1) opacity(.2)}
#g-book .mats{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;font-size:13px}
#g-book .mats span{background:#fffaf8;border:1px solid #f1dde3;border-radius:999px;padding:3px 10px}
#g-book .opt{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:52px;font-size:15px;border-bottom:1px dashed #eedfd2}
#g-book .opt:last-child{border:0}
#g-book .tabs{position:absolute;right:-40px;top:54px;display:flex;flex-direction:column;gap:6px}
#g-book .tab{width:48px;height:50px;border:0;border-radius:0 12px 12px 0;font:inherit;font-size:11px;letter-spacing:-.02em;font-weight:700;cursor:pointer;box-shadow:2px 2px 6px rgba(60,30,40,.25);padding:0 0 0 6px;text-align:left;position:relative;line-height:1.15;writing-mode:horizontal-tb}
#g-book .tab.on{width:56px;margin-left:-8px;font-weight:900;padding-left:12px}
#g-book .tab .dt{position:absolute;right:4px;top:4px;width:8px;height:8px;border-radius:50%;background:#c2365f}
#g-book .note{font-size:12px;color:#8a6a76;line-height:1.7;margin-top:12px}
`;
{ const st2 = document.createElement('style'); st2.textContent = bcss; document.head.appendChild(st2); }
const bottom = document.createElement('div'); bottom.id = 'g-bottom'; document.body.appendChild(bottom);
bottom.appendChild(act); bottom.appendChild(nearBtn);
bottom.addEventListener('pointerdown', e => e.stopPropagation());
const bookBtn = document.createElement('button'); bookBtn.id = 'g-bookbtn'; bookBtn.type = 'button'; bookBtn.setAttribute('aria-label', '手帳をひらく');
bookBtn.innerHTML = '<span class="cv"></span><span class="pg"></span><span class="rb"></span><span class="lb">手帳</span><span class="bd"></span>'; document.body.appendChild(bookBtn);
bookBtn.addEventListener('pointerdown', e => e.stopPropagation());
const book = document.createElement('div'); book.id = 'g-book'; book.innerHTML = '<div class="bk"><div class="pg"></div><nav class="tabs" aria-label="手帳のページ"></nav></div>'; document.body.appendChild(book);
book.addEventListener('pointerdown', e => e.stopPropagation());
book.addEventListener('click', e => { if (e.target === book) closeBook(); });
const TABS = [
  { id: 'today', name: 'きょう', bg: '#fbf4ea', ink: '#8a4a62' }, { id: 'two', name: 'ふたり', bg: '#f4b7c8', ink: '#5a2c3c' },
  { id: 'hut', name: '小屋', bg: '#bcd9b4', ink: '#33502e' }, { id: 'notes', name: 'ノート', bg: '#f2d39a', ink: '#5c4214' },
  { id: 'album', name: 'アルバム', bg: '#d2c4ea', ink: '#3e3060' }, { id: 'map', name: '地図', bg: '#b9d8ea', ink: '#234a60' },
  { id: 'settings', name: '設定', bg: '#ddd5d2', ink: '#4a4040' },
];
let bookTab = 'today', bookReturn = false;
const engineBtn = (id) => document.getElementById(id);
function tabDots() {
  const albumNew = engineBtn('albumBtn') && engineBtn('albumBtn').classList.contains('new');
  const wardNew = S.wardrobe.some(k => !wardSeen.has(k));
  return { two: (!S.done.bond && bondActions().length > 0) || wardNew, hut: homeBtn.classList.contains('new'), album: !!albumNew };
}
function renderBookBadge() { const d = tabDots(), n = Object.values(d).filter(Boolean).length, bd = bookBtn.querySelector('.bd'); bd.textContent = n; bd.style.display = n ? 'flex' : 'none'; }
function openBook(tab) {
  if (V.isOpen()) return;
  if (tab === 'album') { closeBook(); engineBtn('albumBtn').click(); return; }
  if (tab === 'map') { closeBook(); engineBtn('mapBtn').click(); return; }
  bookTab = tab || bookTab; renderBook(); book.style.display = 'block'; book.querySelector('.pg').scrollTop = 0;
}
function closeBook() { book.style.display = 'none'; }
function fromBook(fn) { bookReturn = true; closeBook(); fn(); }
function backToBook() { if (bookReturn) { bookReturn = false; openBook(bookTab); } }
function runLater(fn) { bookReturn = false; closeBook(); setTimeout(fn, 250); }
bookBtn.addEventListener('click', e => { e.stopPropagation(); openBook(); });

function statBars() {
  return Object.entries(G.stats).map(([k, v]) => `<div class="bar"><span>${v.label}</span><i><b style="width:${S.stats[k]}%;background:${v.color}"></b></i><span>${S.stats[k]}</span></div>`).join('')
    + `<div class="bar"><span>${B.amae.label}</span><i><b style="width:${S.amae}%;background:#f7c6d6"></b></i><span>${S.amae >= 70 ? '💞' : S.amae >= 40 ? '💗' : '🤍'}</span></div>`
    + `<div class="bar"><span>${G.mood.label}</span><i><b style="width:${S.mood}%;background:#f4b7c8"></b></i><span>${S.mood >= 70 ? '😊' : S.mood >= 40 ? '🙂' : '😤'}</span></div>`;
}
function pageToday() {
  const ph = phase().id, a = action();
  const rows = [
    { t: '朝の呼び出し', ok: S.phase > 0, now: ph === 'morning' },
    { t: `お仕事:${job().name}`, ok: !!S.done.job, now: ph === 'noon' && !S.done.job },
    { t: '夕方にする', ok: S.phase > 1, now: ph === 'noon' && !!S.done.job },
    { t: 'アルノに報告', ok: S.phase > 2, now: ph === 'evening' },
    { t: 'ふたりの時間(1日1回)', ok: !!S.done.bond, bond: !S.done.bond && bondActions().length > 0 },
    { t: '夜:メルの部屋へ', ok: !!S.done.night, now: ph === 'night' && !S.done.night },
    { t: '寝る(セーブ)', ok: false, now: ph === 'night' && !!S.done.night },
  ];
  const list = rows.map((r, i) => `<div class="todo ${r.ok ? 'ok' : ''} ${r.now ? 'now' : ''}"><i>${r.ok ? '✓' : ''}</i><span>${r.t}</span>${r.now && a ? '<button type="button" class="go" data-do="act">する</button>' : ''}${r.bond ? '<button type="button" class="go sub" data-do="bond">えらぶ</button>' : ''}</div>`).join('');
  return `<div class="hd"><div><small>TODAY</small><h2>${S.day}日目・${phase().label}</h2></div><button class="x" type="button" aria-label="手帳をとじる">✕</button></div>
    <h3>きょうの予定</h3><div class="card">${list}</div>
    <h3>ニナのようす</h3><div class="card">${statBars()}</div>
    <p class="note">右の付箋から、ほかのページへ。</p>`;
}
function pageTwo() {
  const fig = (who) => { const o = outfit(who, S.outfits[who]) || (OUT[who] || [])[0]; return `<div class="fig"><div style="background-image:url(${fullOf(who, o)})"></div><b>${who}</b><small>${o ? o.name : ''}</small></div>`; };
  const acts = bondActions(), d = drinkForMel();
  const bond = S.done.bond ? '<p style="margin:0">きょうはもう一緒に過ごしました。</p>' : !acts.length ? '<p style="margin:0">夕方と夜に、一緒に過ごせます。</p>'
    : acts.map((x, i) => `<div class="opt"><span>${x.icon} ${x.name}${x.drinkScene && d ? `<br><small style="color:#8a6a76">${d.icon} ${d.name}をあげる</small>` : ''}</span><button type="button" class="go" data-bond="${i}">する</button></div>`).join('');
  const wardNew = S.wardrobe.some(k => !wardSeen.has(k));
  return `<div class="hd"><div><small>NINA &amp; MEL</small><h2>ふたり</h2></div><button class="x" type="button" aria-label="手帳をとじる">✕</button></div>
    <h3>いまの服</h3><div class="duo">${fig('ニナ')}${fig('メル')}</div>
    <button type="button" class="big" data-do="ward">👗 着せ替えをひらく${wardNew ? '(新しい服!)' : ''}</button>
    <h3>ふたりの時間</h3><div class="card">${bond}</div>
    <h3>会話アルバム</h3><div class="card"><div class="opt"><span>4コマの会話を見返す</span><button type="button" class="go sub" data-do="album">ひらく</button></div></div>`;
}
function pageHut() {
  const shelf = C.recipes.map(r => `<span class="${S.known.includes(r.id) ? '' : 'no'}">${r.icon}</span>`).join('');
  const mats = C.materials.filter(m => (S.mats[m.id] || 0) > 0).map(m => `<span>${m.icon} ${m.name} ×${S.mats[m.id]}</span>`).join('') || '<span class="lock" style="border:0;background:none">素材はまだありません</span>';
  const drinks = C.recipes.filter(r => (S.bottles[r.id] || 0) > 0).map(r => `<span>${r.icon} ${r.name} ×${S.bottles[r.id]}</span>`).join('') || '<span class="lock" style="border:0;background:none">まだありません</span>';
  return `<div class="hd"><div><small>NINA'S HUT</small><h2>ニナの小屋</h2></div><button class="x" type="button" aria-label="手帳をとじる">✕</button></div>
    <h3>瓶棚 ${S.known.length} / ${C.recipes.length}</h3><div class="card"><div class="shelf">${shelf}</div><div class="mats">${drinks}</div></div>
    <h3>持っている素材${homeBtn.classList.contains('new') ? ' <span style="color:#c2365f">●新</span>' : ''}</h3><div class="card"><div class="mats" style="margin:0">${mats}</div></div>
    <button type="button" class="big" data-do="room">🍶 秘密の調合台をひらく</button>
    <p class="note">素材は、村のあちこち(1日1回)・お仕事のごほうび・村人から手に入ります。</p>`;
}
function pageNotes() {
  const notes = G.notes.map(n => S.notes.includes(n.id) ? `<div class="item"><b>📝 ${n.title}</b>${n.text}</div>` : `<div class="item lock"><b>???</b>ヒント:${n.hint}</div>`).join('');
  const titles = G.titles.map(t => S.titles.includes(t.id) ? `<div class="item"><b>🏅 ${t.name}</b></div>` : `<div class="item lock"><b>???</b>ヒント:${t.hint}</div>`).join('');
  const brews = C.recipes.map(r => { const known = S.known.includes(r.id), a = mat(r.a), b2 = mat(r.b);
    return known ? `<div class="dc"><div class="ic">${r.icon}</div><b>${r.name}</b>${r.alc ? '' : ' 🎀メル用'}<br>${a.icon}${a.name} + ${b2.icon}${b2.name}<br>${r.text}</div>`
      : `<div class="dc lock"><div class="ic" style="filter:grayscale(1) opacity(.3)">🫙</div><b>???</b><br>ヒント:${S.matSeen.includes(r.a) ? a.icon + a.name + ' + ?' : '?'}</div>`; }).join('');
  const log = S.log.slice(0, 14).map(l => `<div>${l.d}日目・${l.p}:${l.t}</div>`).join('') || '<div>まだ記録はありません</div>';
  return `<div class="hd"><div><small>NOTES</small><h2>ノート</h2></div><button class="x" type="button" aria-label="手帳をとじる">✕</button></div>
    <h3>観察ノート</h3><div class="card">${notes}</div>
    <h3>酒造ノート ${S.known.length} / ${C.recipes.length}</h3><div class="card"><div class="dg">${brews}</div></div>
    <h3>称号</h3><div class="card">${titles}</div>
    <h3>きろく</h3><div class="card log">${log}</div>`;
}
function pageSettings() {
  const snd = engineBtn('snd'), muted = snd && snd.textContent.trim() === '×';
  return `<div class="hd"><div><small>SETTINGS</small><h2>設定</h2></div><button class="x" type="button" aria-label="手帳をとじる">✕</button></div>
    <h3>あそびかた</h3><div class="card">
      <div class="opt"><span>音</span><button type="button" class="go ${muted ? 'sub' : ''}" data-do="snd">${muted ? 'OFF' : 'ON'}</button></div>
      <div class="opt"><span>着せ替えの動き</span><button type="button" class="go ${motionOn ? '' : 'sub'}" data-do="motion">${motionOn ? 'ON' : 'OFF'}</button></div>
    </div>
    <h3>セーブ</h3><div class="card"><div class="opt"><span>最初の日からやり直す<br><small style="color:#8a6a76">会話アルバムは残ります</small></span><button type="button" class="go sub" data-do="reset">やり直す</button></div></div>`;
}
function renderBook() {
  const pg = book.querySelector('.pg'), dots = tabDots();
  pg.innerHTML = ({ today: pageToday, two: pageTwo, hut: pageHut, notes: pageNotes, settings: pageSettings }[bookTab] || pageToday)();
  if (bookTab === 'hut') homeBtn.classList.remove('new');
  book.querySelector('.tabs').innerHTML = TABS.map(t => `<button type="button" class="tab ${t.id === bookTab ? 'on' : ''}" data-tab="${t.id}" style="background:${t.bg};color:${t.ink}">${t.name}${dots[t.id] ? '<span class="dt"></span>' : ''}</button>`).join('');
}
book.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return; e.stopPropagation();
  if (t.classList.contains('x')) return closeBook();
  if (t.dataset.tab) return openBook(t.dataset.tab);
  if (t.dataset.bond != null) { const a = bondActions()[+t.dataset.bond]; if (a && !S.done.bond) runLater(() => startBond(a)); return; }
  const d = t.dataset.do;
  if (d === 'act') { const a = action(); if (a) runLater(a.run); }
  else if (d === 'bond') runLater(openBond);
  else if (d === 'ward') fromBook(() => dressBtn.click());
  else if (d === 'room') fromBook(openRoom);
  else if (d === 'album') openBook('album');
  else if (d === 'snd') { engineBtn('snd').click(); renderBook(); }
  else if (d === 'motion') { motionOn = !motionOn; try { localStorage.setItem(MOTION_KEY, motionOn ? 'on' : 'off'); } catch (_) { } applyMotion(); renderBook(); }
  else if (d === 'reset') conf.style.display = 'flex';
});

// show HUD once the village starts
const showWhenRunning = setInterval(() => { if (V.isRunning()) { setTimeout(preloadFigures, 1500); hud.style.display = 'flex'; bottom.style.display = 'flex'; bookBtn.style.display = 'block'; clearInterval(showWhenRunning); } }, 300);
setInterval(() => { act.style.visibility = V.isOpen() ? 'hidden' : 'visible'; const n = V.isOpen() ? null : nearAction(); nearBtn.style.display = n ? 'block' : 'none'; bondBtn.style.display = 'none'; bookBtn.style.display = V.isOpen() ? 'none' : 'block'; renderBookBadge(); if (n && nearBtn.textContent !== n.label) nearBtn.textContent = n.label; }, 250);
window.__game = { get S() { return S; }, sleep, cond, nightScene, openRoom, vars, craft, giveMat, openBond, openBook };
render();
})();
