// 端到端测试：需要一个装好本插件、并用 tests/fake-ncm 替换网易云接口包的 SillyTavern 1.19.0。
// 用法见 tests/README.md
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const B = process.env.ST_URL || 'http://127.0.0.1:8123';
const OUT = process.env.OUT_DIR || __dirname;
// 和服务端里替身读的是同一个文件：写 1/2/3 改变「我喜欢的音乐」的曲目数
const FAKE_STATE = process.env.NEP_FAKE_STATE;
const setPlaylistVersion = (v) => require('fs').writeFileSync(FAKE_STATE, String(v));
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${msg}`); if (!cond) failures++; };

(async () => {
  if (!FAKE_STATE) throw new Error('需要设置 NEP_FAKE_STATE（见 tests/README.md）');
  setPlaylistVersion(1);
  const browser = await chromium.launch({ args: ['--autoplay-policy=user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const pageErrors = [];
  page.on('pageerror', e => { if (!/Internal S/.test(e.message)) { pageErrors.push(e.message); console.log('PAGEERROR', e.message); } });
  page.on('console', m => { if (m.type() === 'error' && /nep|netease/i.test(m.text())) console.log('CONSOLE', m.text()); });

  await page.goto(B + '/login');
  await page.evaluate(async () => {
    const t = (await (await fetch('/csrf-token')).json()).token;
    await fetch('/api/users/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': t }, body: JSON.stringify({ handle: 'default-user' }) });
  });

  const startupReqs = [];
  const onReq = r => startupReqs.push(r.url());
  page.on('request', onReq);
  await page.goto(B + '/');
  await page.waitForSelector('#nep-menu-item', { state: 'attached', timeout: 60000 });
  await sleep(3000);
  page.off('request', onReq);
  // 扩展目录名随安装方式不同（Git 安装时是仓库名），所以按 third-party/ 匹配；测试用的酒馆里没有别的第三方扩展
  const isOurs = u => /\/third-party\/|netease-player/.test(u);
  const ours = startupReqs.filter(isOurs).map(u => u.replace(B, ''));
  console.log('startup requests for netease-player:', ours);
  check(ours.length >= 2 && ours.every(u => /manifest\.json|\/index\.js$/.test(u)), '启动阶段只请求 manifest.json 和 index.js');
  check(!ours.some(u => /api\/plugins/.test(u)), '启动阶段不调用插件接口');
  check(await page.$('#nep-bar') === null || await page.$eval('#nep-bar', el => el.hidden), '没有历史记录时不显示迷你播放条');
  const float0 = await page.evaluate(() => { const el = document.getElementById('nep-float'); const r = el?.getBoundingClientRect(); const bar = document.getElementById('top-bar')?.getBoundingClientRect(); return el && { hidden: el.hidden, title: el.querySelector('.nep-title').textContent, offCenter: Math.round(Math.abs(r.left + r.width / 2 - innerWidth / 2)), belowBar: !bar || r.top >= bar.bottom, inView: r.top >= 0 && r.bottom <= innerHeight }; });
  check(float0 && !float0.hidden && float0.title === '网易云音乐' && float0.offCenter <= 2 && float0.belowBar && float0.inView, `默认显示悬浮胶囊，在顶栏下方居中: ${JSON.stringify(float0)}`);
  check(await page.$('#nep-settings #nep-settings-entry') !== null, '扩展设置面板里有「网易云播放器」条目');

  const closePopups = async () => {
    for (let k = 0; k < 5 && await page.$('dialog.popup[open]'); k++) {
      await page.screenshot({ path: OUT + `/0-popup${k}.png` });
      const btn = await page.$('dialog.popup[open] .popup-button-cancel:visible, dialog.popup[open] .popup-button-ok:visible, dialog.popup[open] .popup-button-close:visible');
      if (btn) await btn.click(); else await page.keyboard.press('Escape');
      await sleep(800);
    }
  };
  await closePopups();
  // 打开面板
  await page.click('#extensionsMenuButton');
  await page.click('#nep-menu-item');
  await page.waitForSelector('#nep-panel:not([hidden])');
  check(true, '面板打开');
  // 面板是页面栈：首页在底，搜索、设置等页面从顶栏推入
  const nav = (name) => page.click(`#nep-panel .nep-top [data-nav=${name}]`);
  const home = async () => { while (await page.$('#nep-panel .nep-back:not([hidden])')) await page.click('#nep-panel .nep-back'); };
  await page.waitForSelector('#nep-panel [data-sec=mine] .nep-login');
  check(await page.$eval('#nep-panel [data-sec=mine]', el => el.textContent.includes('扫码登录')), '未登录时首页提示扫码登录');
  await page.screenshot({ path: OUT + '/1-panel.png' });

  // 搜索并播放
  await nav('search');
  await page.fill('#nep-panel input[name=keywords]', '晴天');
  await page.click('#nep-panel form button[type=submit]');
  await page.waitForSelector('#nep-panel .nep-row');
  await page.screenshot({ path: OUT + '/2-search.png' });
  await page.click('#nep-panel .nep-row[data-i="0"] .nep-row-main');
  await page.waitForFunction(() => { const a = document.getElementById('nep-audio'); return a && a.src.includes('song1') && !a.paused; }, null, { timeout: 10000 });
  check(true, '点歌后开始播放 song1');
  const md = await page.evaluate(() => ({ t: navigator.mediaSession.metadata?.title, a: navigator.mediaSession.metadata?.artist }));
  check(md.t === '晴天' && md.a === '歌手1', `Media Session metadata: ${JSON.stringify(md)}`);

  // 生成状态
  await page.evaluate(() => SillyTavern.getContext().eventSource.emit('generation_started', 'normal', {}, false));
  await sleep(200);
  let artist = await page.evaluate(() => navigator.mediaSession.metadata?.artist);
  check(artist === '酒馆 · 正在生成…', `生成中 artist=${artist}`);
  await page.evaluate(() => SillyTavern.getContext().eventSource.emit('generation_ended', 3));
  await sleep(100);
  await page.evaluate(() => SillyTavern.getContext().eventSource.emit('message_received', 3, 'normal'));
  await sleep(200);
  artist = await page.evaluate(() => navigator.mediaSession.metadata?.artist);
  check(artist === '酒馆 · 回复已完成', `完成后 artist=${artist}`);
  const floatSub = await page.$eval('#nep-float .nep-sub', el => el.textContent);
  check(floatSub === '酒馆 · 回复已完成', `悬浮胶囊显示 ${floatSub}`);
  // quiet 生成不算
  await page.evaluate(() => SillyTavern.getContext().eventSource.emit('generation_started', 'quiet', {}, false));
  // 备用信号：body data-generating
  await page.evaluate(() => { document.body.dataset.generating = 'true'; });
  await sleep(200);
  artist = await page.evaluate(() => navigator.mediaSession.metadata?.artist);
  check(artist === '酒馆 · 正在生成…', `data-generating 备用信号 artist=${artist}`);
  await page.evaluate(() => { delete document.body.dataset.generating; });
  await sleep(4500);
  artist = await page.evaluate(() => navigator.mediaSession.metadata?.artist);
  check(artist === '酒馆 · 生成已结束', `备用信号结束 artist=${artist}`);

  // 加入 VIP 歌（取不到地址），song1 播完后应跳过它并停在无可播
  // 登录
  await nav('settings');
  await page.click('#nep-panel [data-act=qr-start]');
  await page.waitForSelector('#nep-panel .nep-qr');
  await page.screenshot({ path: OUT + '/3-qr.png' });
  await page.waitForFunction(() => document.querySelector('#nep-panel')?.textContent.includes('测试用户'), null, { timeout: 15000 });
  check(true, '扫码登录流程完成，显示昵称');

  // 登录后首页：居中的个人资料，下面是每日推荐和自己的歌单，没有推荐歌单和排行榜
  await home();
  await page.waitForSelector('#nep-panel [data-act=play-daily]', { timeout: 10000 });
  await page.waitForSelector('#nep-panel [data-act=open-playlist]');
  check(await page.$eval('#nep-panel .nep-profile', el => getComputedStyle(el).flexDirection === 'column'), '首页个人资料居中竖排');
  check(await page.$('#nep-panel [data-sec=rec], #nep-panel [data-sec=top], #nep-panel .nep-tab') === null, '首页只有个人资料、每日推荐和我的歌单');
  await page.screenshot({ path: OUT + '/3b-home.png' });
  // 歌单行尾的播放键：不进歌单页，直接开始放
  await page.click('#nep-panel [data-act=play-mine]');
  await page.waitForFunction(() => { const a = document.getElementById('nep-audio'); return a.src.includes('song11') && !a.paused; }, null, { timeout: 10000 });
  check(await page.$eval('#nep-panel .nep-top', el => el.dataset.view === 'home'), '歌单行尾的播放键直接开始播放，停留在首页');

  // 歌单 -> 播放全部（11,12 正常，13 返回 460）
  await page.click('#nep-panel [data-act=open-playlist] .nep-row-main');
  await page.waitForSelector('#nep-panel [data-act=play-all]');
  await page.waitForFunction(() => document.querySelectorAll('#nep-panel .nep-row').length >= 3);
  await page.screenshot({ path: OUT + '/4-playlist.png' });
  await page.click('#nep-panel [data-act=play-all]');
  await page.waitForFunction(() => document.getElementById('nep-audio').src.includes('song11') && !document.getElementById('nep-audio').paused, null, { timeout: 10000 });
  check(true, '播放全部从 song11 开始');
  // 记录 song11 -> song12 切换时有没有经过静音
  await page.evaluate(() => {
    window.__srcs = [];
    const a = document.getElementById('nep-audio');
    new MutationObserver(() => window.__srcs.push(a.src.slice(-12))).observe(a, { attributes: true, attributeFilter: ['src'] });
  });
  await page.waitForFunction(() => document.getElementById('nep-audio').src.includes('song12') && !document.getElementById('nep-audio').paused, null, { timeout: 10000 });
  const srcs = await page.evaluate(() => window.__srcs);
  check(srcs.length === 1 && srcs[0].includes('song12'), `11→12 直接切换（预取生效），src 变化: ${JSON.stringify(srcs)}`);
  // 12 结束 -> 13 预取失败(460) -> 跳到 11（列表循环）
  await page.waitForFunction(() => document.getElementById('nep-audio').src.includes('song11'), null, { timeout: 15000 });
  check(true, '13 取不到地址被跳过，循环回 11');

  // 暂停 / 继续（面板开着时悬浮胶囊让位，用面板上的播放键）
  check(await page.$eval('#nep-float', el => el.classList.contains('nep-away')), '面板开着时悬浮胶囊让位');
  await page.click('#nep-panel .nep-toggle');
  await sleep(300);
  check(await page.evaluate(() => document.getElementById('nep-audio').paused), '面板播放键暂停');
  await page.click('#nep-panel .nep-toggle');
  await sleep(500);
  check(await page.evaluate(() => !document.getElementById('nep-audio').paused), '面板播放键继续');
  await page.click('#nep-panel .nep-next');
  await page.waitForFunction(() => document.getElementById('nep-audio').src.includes('song12'), null, { timeout: 10000 });
  check(true, '下一首');
  // 换歌：底部常驻条左滑切下一首，滑完不会顺带打开「正在播放」
  await page.click('#nep-panel .nep-nowbar .nep-toggle');
  await sleep(300);
  const srcBeforeSwipe = await page.evaluate(() => document.getElementById('nep-audio').src);
  const nb = await page.$eval('#nep-panel .nep-nowbar-text', el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.move(nb.x, nb.y);
  await page.mouse.down();
  for (let k = 1; k <= 8; k++) await page.mouse.move(nb.x - 14 * k, nb.y + k);
  await page.mouse.up();
  await page.waitForFunction((s) => { const a = document.getElementById('nep-audio'); return a.src !== s && a.src.includes('/song') && !a.paused; }, srcBeforeSwipe, { timeout: 10000 });
  const titleAfterSwipe = await page.$eval('#nep-panel .nep-top h1', el => el.textContent);
  check(titleAfterSwipe !== '正在播放', `底部条左滑切到下一首，没有误开「正在播放」（${titleAfterSwipe}）`);
  // 「正在播放」：只有封面、歌名、进度和五个键，不列歌单和接下来播放
  await page.click('#nep-panel [data-act=play-all]');
  await page.waitForFunction(() => document.getElementById('nep-audio').src.includes('song11'), null, { timeout: 10000 });
  await page.click('#nep-panel .nep-nowbar .nep-toggle');
  await page.click('#nep-panel .nep-nowbar .nep-nowbar-text');
  await page.waitForSelector('#nep-panel .nep-np .nep-np-art');
  const np0 = await page.evaluate(() => { const p = document.getElementById('nep-panel'); const np = p.querySelector('.nep-np');
    return { view: p.dataset.view, playing: np.classList.contains('nep-playing'), extra: !!p.querySelector('.nep-upnext, .nep-strip'),
      keys: np.querySelectorAll('.nep-controls button').length, title: np.querySelector('.nep-np-title').textContent,
      small: getComputedStyle(np.querySelector('.nep-np-art')).transform !== 'none', disc: !!np.querySelector('.nep-disc, .nep-arm'), fits: p.querySelector('.nep-body').scrollHeight <= p.querySelector('.nep-body').clientHeight + 1 }; });
  check(np0.view === 'now' && !np0.playing && np0.small && !np0.disc && !np0.extra && np0.keys === 5 && np0.title === 'A' && np0.fits, `「正在播放」只有封面和五个键，暂停时封面缩小，一屏放得下: ${JSON.stringify(np0)}`);
  await page.click('#nep-panel .nep-controls [data-act=toggle]');
  await page.waitForFunction(() => !document.getElementById('nep-audio').paused);
  await sleep(700);
  check(await page.$eval('#nep-panel .nep-np', np => np.classList.contains('nep-playing') && getComputedStyle(np.querySelector('.nep-np-art')).transform === 'none'), '播放时封面恢复原大小');
  await page.screenshot({ path: OUT + '/4b-now.png' });
  // 静音键在「正在播放」的顶栏
  check(await page.$eval('#nep-panel .nep-top .nep-silent', el => !el.hidden) && await page.$eval('#nep-panel .nep-top [data-nav=search]', el => el.hidden), '「正在播放」顶栏只留返回、静音键和收起');
  // 换歌：列表键进播放队列，点一首就换
  await page.click('#nep-panel .nep-controls [data-nav=queue]');
  await page.waitForSelector('#nep-panel .nep-row.nep-current');
  check(await page.$eval('#nep-panel .nep-top h1', el => el.textContent === '播放队列') && await page.$eval('#nep-panel .nep-top .nep-silent', el => el.hidden), '「正在播放」的列表键进入播放队列，正在播放的一行高亮');
  await page.click('#nep-panel .nep-row[data-i="1"] .nep-row-main');
  await page.waitForFunction(() => { const a = document.getElementById('nep-audio'); return a.src.includes('song12') && !a.paused; }, null, { timeout: 10000 });
  check(true, '在播放队列里点一首，立即换成这首');
  await sleep(1200);
  await page.screenshot({ path: OUT + '/5-queue.png' });
  await nav('settings');
  await page.screenshot({ path: OUT + '/6-settings.png', fullPage: false });
  const logText = await page.$eval('#nep-panel .nep-log', el => el.textContent);
  console.log('---- 事件日志 ----\n' + logText.split('\n').slice(0, 25).join('\n'));

  // 刷新页面：恢复队列，需要点继续播放
  await page.evaluate(() => document.getElementById('nep-audio').pause());
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  // 只记新页面发出的请求：旧页面在跳转前可能还有预取请求没发完
  const reloadReqs = [];
  let navigated = false;
  const onNav = f => { if (f === page.mainFrame()) navigated = true; };
  const onReq2 = r => { if (navigated) reloadReqs.push(r.url()); };
  page.on('framenavigated', onNav);
  page.on('request', onReq2);
  await page.reload();
  await page.waitForSelector('#nep-float:not([hidden])', { timeout: 60000 });
  await sleep(2000);
  await closePopups();
  page.off('request', onReq2);
  page.off('framenavigated', onNav);
  const ours2 = reloadReqs.filter(isOurs).map(u => u.replace(B, ''));
  check(ours2.every(u => /manifest\.json|\/index\.js$/.test(u)), `有历史记录时启动也只请求两个文件: ${JSON.stringify(ours2)}`);
  const fl = await page.evaluate(() => ({ title: document.querySelector('#nep-float .nep-title').textContent, sub: document.querySelector('#nep-float .nep-sub').textContent }));
  check(fl.title === 'B' && fl.sub === '轻点 ▶ 继续播放', `恢复后悬浮胶囊: ${JSON.stringify(fl)}`);
  await page.screenshot({ path: OUT + '/7-restored.png' });
  await page.click('#nep-float .nep-play');
  await page.waitForFunction(() => { const a = document.getElementById('nep-audio'); return a && a.src.includes('song12') && !a.paused; }, null, { timeout: 10000 });
  check(true, '点悬浮胶囊的播放键后接着放 song12');

  // ---------- 悬浮胶囊：拖动、点击打开面板 ----------
  const panelOpen = () => page.evaluate(() => !!document.querySelector('#nep-panel:not([hidden])'));
  const rectOf = () => page.$eval('#nep-float', el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const r0 = await rectOf();
  await page.mouse.move(r0.x + 20, r0.y + r0.h / 2);
  await page.mouse.down();
  for (let k = 1; k <= 10; k++) await page.mouse.move(r0.x + 20 - 6 * k, r0.y + r0.h / 2 + 25 * k);
  await page.mouse.up();
  await sleep(300);
  const r1 = await rectOf();
  const savedPos = await page.evaluate(() => JSON.parse(localStorage.getItem('nep:v1:float-pos')));
  check(Math.abs(r1.x - (r0.x - 60)) < 3 && Math.abs(r1.y - (r0.y + 250)) < 3, `拖动后位置 ${JSON.stringify(r0)} → ${JSON.stringify(r1)}`);
  check(savedPos && savedPos.x < 0.5 && savedPos.y > 0, `拖动后位置已保存 ${JSON.stringify(savedPos)}`);
  check(!(await panelOpen()) && await page.evaluate(() => !document.getElementById('nep-audio').paused), '拖动不会触发展开或暂停');
  // 手机上是触摸：用 CDP 发真正的触摸事件再拖一次
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  const t0 = { x: r1.x + 20, y: r1.y + r1.h / 2 };
  await touch('touchStart', t0.x, t0.y);
  for (let k = 1; k <= 8; k++) await touch('touchMove', t0.x + 10 * k, t0.y + 20 * k);
  await touch('touchEnd');
  await sleep(300);
  const r2 = await rectOf();
  check(Math.abs(r2.x - (r1.x + 80)) < 3 && Math.abs(r2.y - (r1.y + 160)) < 3, `触摸拖动 ${JSON.stringify(r1)} → ${JSON.stringify(r2)}`);
  check(!(await panelOpen()), '触摸拖动不会触发展开');
  await page.tap('#nep-float .nep-play');
  await sleep(300);
  check(await page.evaluate(() => document.getElementById('nep-audio').paused), '触摸点播放键暂停');
  await page.tap('#nep-float .nep-play');
  await sleep(500);
  check(await page.evaluate(() => !document.getElementById('nep-audio').paused), '触摸点播放键继续');
  // 胶囊上的下一首：不用展开就能切歌
  const srcBeforeNext = await page.evaluate(() => document.getElementById('nep-audio').src);
  await page.tap('#nep-float .nep-next');
  await page.waitForFunction((s) => { const a = document.getElementById('nep-audio'); return a.src !== s && a.src.includes('/song') && !a.paused; }, srcBeforeNext, { timeout: 10000 });
  check(!(await panelOpen()) && await page.$eval('#nep-float', el => el.dataset.state === 'compact'), '胶囊上的下一首键直接切歌，不展开');
  // 轻点胶囊：原地展开成播放卡片（中间态），不打开完整面板
  await page.tap('#nep-float .nep-info');
  await page.waitForSelector('#nep-float[data-state=mid]');
  await sleep(600);
  const rm = await rectOf();
  check(!(await panelOpen()) && rm.w > r2.w && rm.h > r2.h && rm.x >= 0 && rm.x + rm.w <= 390 && rm.y >= 0 && rm.y + rm.h <= 844, `轻点胶囊原地展开成灵动岛播放卡片 ${JSON.stringify(rm)}`);
  await page.screenshot({ path: OUT + '/8-float-mid.png' });
  await page.tap('#nep-float .nep-mid-play');
  await sleep(300);
  check(await page.evaluate(() => document.getElementById('nep-audio').paused), '播放卡片的播放键暂停');
  await page.tap('#nep-float .nep-mid-play');
  await sleep(500);
  check(await page.evaluate(() => !document.getElementById('nep-audio').paused), '播放卡片的播放键继续');
  // 当前这首可能本来就红过心：点一下应翻转，再点一下翻回来
  const liked0 = await page.$eval('#nep-float .nep-mid-like', el => el.classList.contains('nep-on'));
  await page.tap('#nep-float .nep-mid-like');
  await page.waitForFunction((v) => document.querySelector('#nep-float .nep-mid-like').classList.contains('nep-on') !== v, liked0, { timeout: 5000 });
  await page.tap('#nep-float .nep-mid-like');
  await page.waitForFunction((v) => document.querySelector('#nep-float .nep-mid-like').classList.contains('nep-on') === v, liked0, { timeout: 5000 });
  check(true, '播放卡片上红心、取消红心');
  await page.mouse.click(10, 800);
  await sleep(700);
  const rc = await rectOf();
  // 中途切过歌，胶囊宽度可能变了：按保存的比例位置和当前宽度算应在的 x
  const savedPos2 = await page.evaluate(() => JSON.parse(localStorage.getItem('nep:v1:float-pos')));
  const expX = 6 + savedPos2.x * Math.max(0, 390 - rc.w - 12);
  check(await page.$eval('#nep-float', el => el.dataset.state === 'compact' && !el.classList.contains('nep-card') && !el.style.clipPath) && Math.abs(rc.x - expX) < 2 && Math.abs(rc.y - r2.y) < 2 && Math.abs(rc.h - r2.h) < 2, `点卡片外面收回胶囊，回到原位 ${JSON.stringify(rc)}`);
  // 卡片上的列表键打开完整面板
  await page.tap('#nep-float .nep-info');
  await page.waitForSelector('#nep-float[data-state=mid]');
  await page.tap('#nep-float .nep-mid-full');
  await page.waitForSelector('#nep-panel:not([hidden])');
  check(await page.$eval('#nep-float', el => el.classList.contains('nep-away') && el.dataset.state === 'compact'), '播放卡片点列表键打开完整面板，面板开着时胶囊让位');
  check(await page.$eval('#nep-panel', el => el.dataset.view === 'now') && !!(await page.$('#nep-panel .nep-np .nep-np-art')), '播放卡片的列表键直接进「正在播放」');
  await page.screenshot({ path: OUT + '/8b-float-panel.png' });

  // ---------- 歌单刷新 ----------
  // 打开面板时已经后台检查过一次歌单（已登录），回到首页直接有数据
  await home();
  await page.waitForFunction(() => document.querySelector('#nep-panel [data-act=open-playlist] .nep-mine-sub')?.textContent.startsWith('3 首'), null, { timeout: 5000 });
  check(true, '歌单列表 3 首');
  const profile = await page.$eval('#nep-panel .nep-profile', el => el.textContent.replace(/\s+/g, ' ').trim());
  check(profile.includes('测试用户') && profile.includes('测试简介') && profile.includes('广东'), `首页顶部显示昵称、简介、地区: ${profile}`);
  setPlaylistVersion(2); // 在网易云 App 里加了一首
  const cached = await page.evaluate(async () => {
    const res = await fetch('/api/plugins/netease-player/playlists', { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: '{}' });
    return (await res.json()).playlists[0].count;
  });
  check(cached === 3, `不带 fresh 时走插件缓存，仍是 ${cached} 首`);
  await page.click('#nep-panel [data-act=refresh-playlists]');
  await page.waitForFunction(() => document.querySelector('#nep-panel [data-act=open-playlist] .nep-mine-sub')?.textContent.startsWith('4 首'), null, { timeout: 5000 });
  check(true, '点「刷新」跳过缓存，歌单列表变成 4 首');
  await page.click('#nep-panel [data-act=open-playlist]');
  await page.waitForFunction(() => document.querySelectorAll('#nep-panel .nep-row').length === 4, null, { timeout: 5000 });
  check(true, '刷新列表后打开歌单拿到 4 首（曲目缓存也作废了）');
  // 红心、收藏到歌单（写回网易云）
  await page.click('#nep-panel .nep-row[data-i="1"] [data-act=more]');
  await page.click('#nep-panel [data-act=sheet-like]');
  await page.waitForFunction(() => document.querySelector('#nep-panel .nep-row[data-i="1"] .nep-heart'), null, { timeout: 5000 });
  check(true, '操作单里点红心，这一行出现红心');
  await page.click('#nep-panel [data-act=sheet-collect]');
  await page.waitForFunction(() => document.querySelector('#nep-panel .nep-sheet')?.textContent.includes('还没有自己创建的歌单'), null, { timeout: 5000 });
  check(true, '收藏到歌单：只有「我喜欢的音乐」时提示先新建歌单');
  await page.click('#nep-panel .nep-sheet-cancel');
  const writeApi = (path, body) => page.evaluate(async ([path, body]) => (await (await fetch('/api/plugins/netease-player/' + path, { method: 'POST', headers: SillyTavern.getContext().getRequestHeaders(), body: JSON.stringify(body) })).json()), [path, body]);
  const dup = await writeApi('playlist/add', { pid: 500, ids: [11] });
  check(!dup.ok && dup.error === '歌单里已经有这首歌', `重复收藏给出明确提示: ${JSON.stringify(dup)}`);
  // 替身按真实接口包返回多包一层的结果，0.5.x 的服务端会把它误判为失败
  const added = await writeApi('playlist/add', { pid: 500, ids: [12] });
  check(added.ok && added.count === 1, `收藏到歌单: ${JSON.stringify(added)}`);
  const removed = await writeApi('playlist/remove', { pid: 500, ids: [12] });
  check(removed.ok && removed.count === 1, `从歌单删除: ${JSON.stringify(removed)}`);
  const missing = await writeApi('playlist/add', { pid: 404, ids: [12] });
  check(!missing.ok && missing.error === '歌单不存在', `真实的失败照常报错: ${JSON.stringify(missing)}`);
  setPlaylistVersion(3);
  await page.click('#nep-panel [data-act=refresh-playlist]');
  await page.waitForFunction(() => document.querySelectorAll('#nep-panel .nep-row').length === 5 && document.querySelector('#nep-panel .nep-pl-meta')?.textContent.startsWith('5 首'), null, { timeout: 5000 });
  check(true, '歌单里点「刷新」拿到 5 首，标题里的曲目数也更新');
  await page.screenshot({ path: OUT + '/9-playlist-refreshed.png' });
  // 收起，在 App 里又删了一首；过了检查间隔再打开面板，自动发现变化
  setPlaylistVersion(2);
  await page.click('#nep-panel .nep-close');
  await sleep(300);
  check(!(await panelOpen()) && !(await page.$eval('#nep-float', el => el.classList.contains('nep-away'))), '收起面板后悬浮胶囊回来');
  await sleep(10500);
  // 从魔法棒菜单重新打开：回到收起前的歌单页（沿用原来的 DOM），并自动检查更新
  await page.click('#extensionsMenuButton');
  await page.click('#nep-menu-item');
  await page.waitForFunction(() => document.querySelectorAll('#nep-panel .nep-row').length === 4 && document.querySelector('#nep-panel .nep-pl-meta')?.textContent.startsWith('4 首'), null, { timeout: 5000 });
  check(true, '打开面板时自动检查到歌单变化并重新加载（5 → 4 首）');

  // ---------- 常驻入口设置 ----------
  await nav('settings');
  await page.selectOption('#nep-panel select[data-setting=entry]', 'bar');
  await sleep(200);
  let vis = await page.evaluate(() => ({ bar: !!document.querySelector('#nep-bar:not([hidden])'), float: !!document.querySelector('#nep-float:not([hidden])') }));
  check(vis.bar && !vis.float, `切到迷你播放条: ${JSON.stringify(vis)}`);
  await page.screenshot({ path: OUT + '/10-entry-bar.png' });
  // 手机上别的脚本拦下触摸事件时浏览器不再合成 click：迷你播放条的按键照样要有反应
  await page.evaluate(() => { window.__noClick = (e) => e.preventDefault(); document.addEventListener('touchend', window.__noClick, { capture: true, passive: false }); });
  const pausedNow = () => page.evaluate(() => document.getElementById('nep-audio').paused);
  const barBefore = await pausedNow();
  await page.tap('#nep-bar .nep-play');
  await sleep(400);
  const barAfter = await pausedNow();
  await page.tap('#nep-bar .nep-play');
  await sleep(400);
  check(barAfter !== barBefore && await pausedNow() === barBefore, `触摸事件被拦、没有 click 时迷你播放条的播放键仍然有效: ${barBefore} → ${barAfter}`);
  await page.evaluate(() => document.removeEventListener('touchend', window.__noClick, { capture: true }));
  await page.selectOption('#nep-panel select[data-setting=entry]', 'off');
  await sleep(200);
  vis = await page.evaluate(() => ({ bar: !!document.querySelector('#nep-bar:not([hidden])'), float: !!document.querySelector('#nep-float:not([hidden])') }));
  check(!vis.float && !vis.bar, `关闭常驻入口后什么都不显示（正在播放也不显示迷你播放条）: ${JSON.stringify(vis)}`);
  await page.selectOption('#nep-panel select[data-setting=entry]', 'float');
  await sleep(200);
  vis = await page.evaluate(() => ({ bar: !!document.querySelector('#nep-bar:not([hidden])'), float: !!document.querySelector('#nep-float:not([hidden])') }));
  check(vis.float && !vis.bar, `改回悬浮胶囊: ${JSON.stringify(vis)}`);
  await page.click('#nep-panel [data-act=shutdown]');
  await sleep(300);
  vis = await page.evaluate(() => ({ bar: !!document.querySelector('#nep-bar:not([hidden])'), float: !!document.querySelector('#nep-float:not([hidden])') }));
  check(!vis.bar && !vis.float, `「停止并关闭」收起悬浮胶囊: ${JSON.stringify(vis)}`);
  await page.reload();
  await page.waitForSelector('#nep-menu-item', { state: 'attached', timeout: 60000 });
  await sleep(1500);
  vis = await page.evaluate(() => ({ bar: !!document.querySelector('#nep-bar:not([hidden])'), float: !!document.querySelector('#nep-float:not([hidden])') }));
  check(!vis.bar && !vis.float, `刷新页面后仍然收起: ${JSON.stringify(vis)}`);

  // ---------- 大歌单：分批渲染、滑到底自动加载下一页 ----------
  setPlaylistVersion(498); // 500 首
  await page.click('#extensionsMenuButton');
  await page.click('#nep-menu-item');
  await page.waitForSelector('#nep-panel:not([hidden])');
  check(await page.evaluate(() => !!document.querySelector('#nep-float:not([hidden])')), '从魔法棒菜单重新打开播放器后悬浮胶囊恢复');
  await page.waitForFunction(() => document.querySelector('#nep-panel [data-act=open-playlist] .nep-mine-sub')?.textContent.startsWith('500 首'), null, { timeout: 5000 });
  await page.click('#nep-panel [data-act=open-playlist]');
  await page.waitForFunction(() => document.querySelectorAll('#nep-panel .nep-row').length > 0 && !document.querySelector('#nep-panel .nep-list-foot').textContent.includes('加载中'), null, { timeout: 5000 });
  const firstRows = await page.$$eval('#nep-panel .nep-row', e => e.length);
  check(firstRows <= 60, `打开 500 首的歌单只先画 ${firstRows} 行`);
  for (let k = 0; k < 60; k++) {
    await page.evaluate(() => { const b = document.querySelector('#nep-panel .nep-body'); b.scrollTop = b.scrollHeight; });
    await sleep(100);
    if (await page.$$eval('#nep-panel .nep-row', e => e.length) === 500) break;
  }
  const bigEnd = await page.evaluate(() => { const r = document.querySelectorAll('#nep-panel .nep-row'); return { rows: r.length, last: r[r.length - 1].querySelector('.nep-row-title').textContent, more: !!document.querySelector('#nep-panel .nep-more'), refresh: document.querySelector('[data-act=refresh-playlist]').disabled }; });
  check(bigEnd.rows === 500 && bigEnd.last === '测试歌曲 499' && !bigEnd.more && !bigEnd.refresh, `滑到底自动加载完 500 首: ${JSON.stringify(bigEnd)}`);
  await page.click('#nep-panel .nep-row[data-i="450"] .nep-row-main');
  await page.waitForFunction(() => document.getElementById('nep-audio').src.includes('song1450'), null, { timeout: 10000 });
  check(true, '点第 451 首（后面批次里画出来的行）能播放');

  check(pageErrors.length === 0, `页面没有报错 ${JSON.stringify(pageErrors)}`);
  console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
  await browser.close();
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
