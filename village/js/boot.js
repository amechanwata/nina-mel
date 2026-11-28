// 花の村:データを読み込んでから、村(engine.js)とゲーム(game.js)を起動する
(async () => {
  const get = async (p) => { const r = await fetch(p, { cache: 'no-cache' }); if (!r.ok) throw new Error(p + ' ' + r.status); return r.json(); };
  const load = (src) => new Promise((ok, ng) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ng(new Error(src)); document.body.appendChild(s); });
  try {
    const [scenes, game, craft, bond, wardrobe] = await Promise.all([get('data/scenes.json'), get('data/game.json').catch(() => null), get('data/craft.json').catch(() => null), get('data/bond.json').catch(() => null), get('data/wardrobe.json').catch(() => null)]);
    const dolls = {}; for (let i = 0; i < 12; i++) { dolls['m' + i] = 'img/dolls/m' + i + '.webp'; dolls['b' + i] = 'img/dolls/b' + i + '.webp'; } // 村人12種類(m=表、b=裏)
    window.VILLAGE_DATA = { scenes, game, dolls, craft, bond, wardrobe };
    await load('js/engine.js');
    if (game) await load('js/game.js');
  } catch (e) {
    console.error(e);
    const d = document.createElement('div'); d.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:#f6efe9;color:#7a5560;z-index:99;padding:30px;text-align:center';
    d.textContent = '村の読み込みに失敗しました。ページを再読み込みしてください。'; document.body.appendChild(d);
  }
})();
