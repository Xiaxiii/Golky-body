// 收纳球、魔棒菜单编排、悬浮胶囊拖动上限的端到端测试。环境与 e2e.cjs 相同（见 tests/README.md），不需要网易云替身的数据。
const { chromium, devices } = require(process.env.PLAYWRIGHT || 'playwright');
const B = process.env.ST_URL || 'http://127.0.0.1:8123';
const OUT = process.env.OUT_DIR || __dirname;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

// 模拟别的扩展的悬浮球：z-index 很高，点一下开关它自己的面板，点外面关掉面板
const FAKE_BALL = () => {
  const ball = document.createElement('div');
  ball.className = 'mcd-ball floating';
  ball.style.cssText = 'position:fixed;right:10px;top:300px;width:56px;height:56px;border-radius:50%;background:#fff;display:grid;place-items:center;z-index:9999';
  ball.innerHTML = '<i class="fa-solid fa-scissors"></i>';
  document.body.appendChild(ball);
  const pop = document.createElement('div');
  pop.id = 'mcd-pop';
  pop.style.cssText = 'position:fixed;left:20px;top:200px;width:200px;height:100px;background:#c33;display:none;z-index:9999';
  document.body.appendChild(pop);
  window.__ballClicks = 0;
  ball.addEventListener('click', () => { window.__ballClicks++; pop.style.display = pop.style.display === 'none' ? 'block' : 'none'; });
  document.addEventListener('click', (e) => { if (!ball.contains(e.target) && !pop.contains(e.target)) pop.style.display = 'none'; });
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => { if (!/Internal S/.test(e.message)) errors.push(e.message); });

  await page.goto(B + '/login');
  await page.evaluate(async () => {
    const t = (await (await fetch('/csrf-token')).json()).token;
    await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify({ handle: 'default-user' }) });
  });
  const load = async () => {
    await page.goto(B + '/');
    await page.waitForSelector('#kfc-handle', { timeout: 60000 });
    await sleep(2500);
    for (let k = 0; k < 5 && await page.$('dialog.popup[open]'); k++) {
      const btn = await page.$('dialog.popup[open] .popup-button-cancel:visible, dialog.popup[open] .popup-button-ok:visible, dialog.popup[open] .popup-button-close:visible');
      if (btn) await btn.click(); else await page.keyboard.press('Escape');
      await sleep(800);
    }
    await page.evaluate(FAKE_BALL);
  };
  await load();
  await page.evaluate(() => localStorage.removeItem('kfc:v1:dock'));
  await load();
  const state = () => page.evaluate(() => JSON.parse(localStorage.getItem('kfc:v1:dock') || '{}'));
  const topLine = () => page.$eval('#top-settings-holder', e => e.getBoundingClientRect().bottom);

  // ---------- 悬浮胶囊拖动上限 ----------
  const c = await page.$eval('#nep-float .nep-info', e => { const r = e.getBoundingClientRect(); return [r.left + 10, r.top + r.height / 2]; });
  await page.mouse.move(c[0], c[1]);
  await page.mouse.down();
  await page.mouse.move(c[0], 300, { steps: 5 });
  await page.mouse.move(c[0] - 40, 0, { steps: 8 });
  await page.mouse.up();
  await sleep(300);
  const capTop = await page.$eval('#nep-float', e => e.getBoundingClientRect().top);
  check(capTop >= await topLine(), `胶囊拖不到顶栏上面: 胶囊顶 ${capTop}，顶栏下沿 ${await topLine()}`);
  await page.addStyleTag({ content: '#top-settings-holder{height:90px!important}' });
  await page.setViewportSize({ width: 390, height: 660 });
  await sleep(400);
  const capTop2 = await page.$eval('#nep-float', e => e.getBoundingClientRect().top);
  check(capTop2 >= await topLine(), `主题加高顶栏后按新的下沿重算: 胶囊顶 ${capTop2}，顶栏下沿 ${await topLine()}`);

  // ---------- 魔棒菜单 ----------
  await page.tap('#extensionsMenuButton');
  await sleep(400);
  const menu = await page.$eval('#extensionsMenu', m => ({ layout: m.dataset.kfcLayout, display: getComputedStyle(m).display, items: m.querySelectorAll('.kfc-item').length }));
  check(menu.layout === 'list' && menu.display === 'flex' && menu.items > 3, `魔棒菜单保持单列: ${JSON.stringify(menu)}`);
  await page.tap('#extensionsMenu .kfc-ctrl-edit');
  await sleep(200);
  check(await page.$eval('#extensionsMenu', m => m.hasAttribute('data-kfc-edit') && m.style.display !== 'none'), '点「编排」进入编排状态，菜单不关');
  await page.tap('#nep-menu-item');
  await sleep(200);
  const firstKey = await page.$eval('#extensionsMenu .kfc-item:not(#nep-menu-item)', e => e.dataset.kfcKey);
  await page.tap(`#extensionsMenu .kfc-item[data-kfc-key="${firstKey}"]`);
  await page.tap(`#extensionsMenu .kfc-item[data-kfc-key="${firstKey}"]`);
  await sleep(200);
  const panelOpened = await page.$eval('#nep-panel', p => !p.hidden).catch(() => false);
  check(!panelOpened, '编排状态下点菜单项不执行原功能');
  check(JSON.stringify((await state()).menuStates) === JSON.stringify({ '#nep-menu-item': 'pin', [firstKey]: 'hide' }), `点一次置顶、点两次折叠: ${JSON.stringify((await state()).menuStates)}`);
  await page.tap('#extensionsMenu .kfc-ctrl-edit');
  await sleep(200);
  const order = await page.$eval('#extensionsMenu', m => {
    const vis = [...m.querySelectorAll('.kfc-item')].filter(e => getComputedStyle(e).display !== 'none');
    vis.sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top || a.getBoundingClientRect().left - b.getBoundingClientRect().left);
    return { first: vis[0]?.id, more: m.querySelector('.kfc-ctrl-more span').textContent };
  });
  check(order.first === 'nep-menu-item' && order.more === '更多（1）', `置顶项排第一，折叠项进「更多」: ${JSON.stringify(order)}`);
  await page.tap('#extensionsMenu .kfc-ctrl-more');
  await sleep(200);
  check(await page.$eval(`#extensionsMenu .kfc-item[data-kfc-key="${firstKey}"]`, e => getComputedStyle(e).display !== 'none'), '点「更多」显示折叠项');
  await page.screenshot({ path: OUT + '/dock-1-menu.png' });
  const mr = await page.$eval('#extensionsMenu', m => m.getBoundingClientRect().toJSON());
  const vw = page.viewportSize().width;
  await page.touchscreen.tap(mr.right + 10 < vw ? Math.round((mr.right + vw) / 2) : Math.round(vw / 2), mr.top > 120 ? Math.round(mr.top - 30) : Math.round(mr.bottom + 20));
  await sleep(600);
  check(await page.$eval('#extensionsMenu', m => getComputedStyle(m).display === 'none'), '点外面照常关菜单');
  await page.tap('#extensionsMenuButton');
  await sleep(400);
  await page.tap('#nep-menu-item');
  await page.waitForSelector('#nep-panel:not([hidden])', { timeout: 15000 }).catch(() => {});
  check(await page.$eval('#nep-panel', p => !p.hidden).catch(() => false), '退出编排后点菜单项照常执行原功能');
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('#nep-panel [data-act=close], #nep-panel .nep-close')?.click());
  await sleep(600);

  // ---------- 收纳球：点选收纳 ----------
  await page.tap('#kfc-handle');
  await sleep(200);
  await page.tap('#kfc-panel [data-act=pick]');
  await sleep(200);
  const ball = await page.$eval('.mcd-ball', b => { const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.tap('#kfc-pick', { position: ball });
  await sleep(200);
  await page.fill('#kfc-pick-bar input', '剪刀');
  await page.tap('#kfc-pick-bar [data-k=ok]');
  await sleep(300);
  const items = (await state()).items || [];
  check(items.length === 1 && items[0].name === '剪刀' && items[0].sel === 'body > div.mcd-ball.floating', `点选后收纳: ${JSON.stringify(items)}`);
  check(await page.$eval('.mcd-ball', b => getComputedStyle(b).visibility === 'hidden'), '收纳后原悬浮球隐去');
  await page.screenshot({ path: OUT + '/dock-2-panel.png' });
  await page.tap('#kfc-panel .kfc-cell');
  await sleep(300);
  const used = await page.evaluate(() => ({ clicks: window.__ballClicks, pop: document.getElementById('mcd-pop').style.display }));
  check(used.clicks === 1 && used.pop === 'block', `点收纳面板里的图标触发原悬浮球，弹出的面板不被关掉: ${JSON.stringify(used)}`);

  // 唤出模式
  await page.tap('#kfc-handle');
  await sleep(200);
  await page.tap('#kfc-panel [data-act=manage]');
  await sleep(200);
  await page.tap('#kfc-panel [data-mode="0"]');
  await page.tap('#kfc-panel [data-act=back]');
  await page.tap('#kfc-panel .kfc-cell');
  await sleep(200);
  check(await page.$eval('.mcd-ball', b => getComputedStyle(b).visibility === 'visible'), '「唤出」：点图标后原悬浮球原位浮现');
  await page.tap('#chat', { position: { x: 100, y: 450 } });
  await sleep(200);
  check(await page.$eval('.mcd-ball', b => getComputedStyle(b).visibility === 'hidden'), '「唤出」：点别处后自动隐去');

  // ---------- 收纳播放胶囊 ----------
  await page.tap('#kfc-handle');
  await sleep(200);
  await page.tap('#kfc-panel [data-act=manage]');
  await sleep(300);
  const nepIdx = await page.$$eval('#kfc-panel [data-add]', bs => bs.findIndex(b => b.closest('.kfc-row').textContent.includes('网易云')));
  await page.tap(`#kfc-panel [data-add="${nepIdx}"]`);
  await sleep(200);
  check(await page.$eval('#nep-float', e => getComputedStyle(e).visibility === 'hidden'), '播放胶囊收纳后隐去');
  await page.tap('#kfc-panel [data-act=back]');
  await page.tap('#kfc-panel .kfc-cell:nth-child(2)');
  await sleep(700);
  const card = await page.$eval('#nep-float', e => ({ vis: getComputedStyle(e).visibility, state: e.dataset.state }));
  check(card.vis === 'visible' && card.state === 'mid', `点收纳里的网易云，原地展开播放卡片: ${JSON.stringify(card)}`);
  await page.tap('#chat', { position: { x: 200, y: 560 } });
  await sleep(900);
  const back = await page.$eval('#nep-float', e => ({ vis: getComputedStyle(e).visibility, state: e.dataset.state }));
  check(back.vis === 'hidden' && back.state === 'compact', `卡片收回后胶囊随之隐去: ${JSON.stringify(back)}`);

  // ---------- 把手拖动 ----------
  const h = await page.$eval('#kfc-handle', b => { const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.move(h[0], h[1]);
  await page.mouse.down();
  await page.mouse.move(150, 200, { steps: 5 });
  await page.mouse.move(30, 0, { steps: 5 });
  await page.mouse.up();
  await sleep(400);
  const hr = await page.$eval('#kfc-handle', b => ({ left: b.getBoundingClientRect().left, top: b.getBoundingClientRect().top, side: b.dataset.side }));
  check(hr.side === 'left' && hr.left === 0 && hr.top >= await topLine(), `把手松手后贴左侧，不高过顶栏下沿: ${JSON.stringify(hr)}`);

  // ---------- 刷新后保持；关闭后恢复原样 ----------
  await load();
  check(await page.$eval('.mcd-ball', b => getComputedStyle(b).visibility === 'hidden'), '刷新后悬浮球仍隐去');
  check(await page.$eval('#kfc-handle', b => b.dataset.side) === 'left', '刷新后把手仍在左侧');
  await page.evaluate(() => {
    document.querySelector('#kfc-settings [data-opt=dock]').click();
    document.querySelector('#kfc-settings [data-opt=menu]').click();
  });
  await sleep(300);
  const off = await page.evaluate(() => ({
    ball: getComputedStyle(document.querySelector('.mcd-ball')).visibility,
    handle: document.getElementById('kfc-handle').hidden,
    layout: document.getElementById('extensionsMenu').dataset.kfcLayout || null,
    ctrls: document.querySelectorAll('#extensionsMenu .kfc-ctrl').length,
  }));
  check(off.ball === 'visible' && off.handle && !off.layout && !off.ctrls, `扩展设置里关掉两项后页面恢复原样: ${JSON.stringify(off)}`);
  check(errors.length === 0, `页面没有报错 ${JSON.stringify(errors)}`);

  await browser.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
