(function () {
const MAIN = function (TOKEN) {

    const W = (() => {
        try {
            if (window.parent && window.parent !== window && window.parent.document) return window.parent;
        } catch (e) {}
        return window;
    })();
    const D = W.document;

    // 脚本被重新运行时，先把上一次的清理干净，避免重复
    try { if (W.__cbg2 && W.__cbg2.destroy) W.__cbg2.destroy(); } catch (e) {}

    const VERSION = '2026-10-21d';
    const report = (where, err) => {
        try { console.error('[线粒体]', where, err); } catch (e) {}
        try { if (W.toastr) W.toastr.error(String((err && err.message) || err), '线粒体出错：' + where); } catch (e) {}
    };

    const NS = 'cbg2';
    const ID = {
        fill: NS + '-fill',
        bg: NS + '-bg',
        veil: NS + '-veil',
        style: NS + '-style',
        fx: NS + '-fx',
        panel: NS + '-panel',
        btn: NS + '-menu-btn',
        jumpBtn: NS + '-jump-btn',
        flash: NS + '-flash',
        ball: NS + '-ball',
        font: NS + '-font',
    };
    const KEY = 'char_bg_v2';

    const DEF = {
        enabled: true,
        source: 'card',      // card = 角色卡原图，custom = 自己上传的图
        uploadScope: 'char', // char = 只给当前角色，global = 所有角色通用
        protect: 35,         // 文字保护：遮罩浓度 %
        veilMode: 'auto',    // auto / dark / light
        shadow: true,        // 给正文加描边
        noGlass: true,       // 去掉消息的毛玻璃（毛玻璃会把背后的图磨糊）
        fit: 'auto',         // auto / cover / contain
        posY: 25,            // 铺满时的垂直位置 %，0 = 顶部
        bright: 100,
        sat: 100,
        blur: 0,
        tab: 'jump',         // 面板上次停在哪个标签页
        ball: true,          // 显示悬浮球
        ballX: -1,           // 悬浮球位置（占屏幕宽高的比例，-1 = 默认位置）
        ballY: -1,
        panelText: 'outline',// 面板文字：follow = 跟随正文，outline = 白字黑边，light = 黑字白边，none = 白字无边
        panelBlur: 3,        // 面板文字描边的模糊程度 px，0 = 硬边
        panelTint: 18,       // 面板底色浓度 %，0 = 完全透明
    };

    const cfg = Object.assign({}, DEF);
    try { Object.assign(cfg, JSON.parse(W.localStorage.getItem(KEY) || '{}')); } catch (e) {}
    const save = () => { try { W.localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

    /* ---------- 样式（面板自带配色和控件样式，不吃美化的样式） ---------- */
    const P = '#' + ID.panel;
    const style = D.createElement('style');
    style.id = ID.style;
    style.textContent = `
        #${ID.fill}, #${ID.bg}, #${ID.veil} {
            position: fixed; top: 0; left: 0; width: 100vw; height: 100dvh;
            pointer-events: none; display: none; z-index: 10;
        }
        #${ID.fill}, #${ID.bg} { background-repeat: no-repeat; background-position: center; transition: filter .3s ease; }
        /* 背景单独放一层，聊天滚动时不用跟着重画，手机上不卡 */
        #${ID.fill}, #${ID.bg}, #${ID.veil} { transform: translateZ(0); backface-visibility: hidden; contain: strict; }

        /* 悬浮球 */
        /* 悬浮球：全部加 !important，美化改不动；不用毛玻璃（部分安卓上毛玻璃会让圆球显示成方块） */
        #${ID.ball} {
            position: fixed !important; left: 0 !important; top: 0 !important; right: auto !important; bottom: auto !important;
            z-index: 1000000 !important;  /* 比面板高，面板打开时也点得到 */
            width: 44px !important; height: 44px !important; min-width: 0 !important; min-height: 0 !important;
            margin: 0 !important; padding: 0 !important; box-sizing: border-box !important;
            border-radius: 50% !important; overflow: hidden !important;
            align-items: center !important; justify-content: center !important;
            font: 20px/1 system-ui, sans-serif !important; color: #fff !important; text-shadow: none !important;
            background: rgba(40, 40, 48, .72) !important;
            border: 1px solid rgba(255, 255, 255, .35) !important;
            box-shadow: 0 4px 14px rgba(0, 0, 0, .3) !important;
            backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
            outline: none !important; pointer-events: auto !important;
            touch-action: none !important; user-select: none; -webkit-user-select: none;
            -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none;
            cursor: grab; opacity: .85; transition: opacity .2s ease;
        }
        #${ID.ball}.drag { cursor: grabbing; opacity: 1; transition: none; }
        #${ID.ball}:active { opacity: 1; }
        #${ID.ball} svg {
            display: block !important; width: 30px !important; height: 30px !important;
            margin: 0 !important; padding: 0 !important; flex: none !important;
            color: #fff !important; pointer-events: none !important;
        }
        #${ID.fill} { background-size: cover; }
        #${ID.veil} { transition: background .3s ease; }

        ${P} {
            /* 透明面板：底色只留一层很淡的暗色，字靠白字 + 黑色描边看清（和字幕一个原理，亮图暗图都能看清） */
            --cbg-fg: #fff; --cbg-bg: rgba(0, 0, 0, .18); --cbg-line: rgba(255, 255, 255, .55);
            --cbg-track: rgba(255, 255, 255, .55); --cbg-accent: #6a8fd8;
            --cbg-ts: 0 0 2px rgba(0, 0, 0, 1), 0 1px 3px rgba(0, 0, 0, .9), 0 0 8px rgba(0, 0, 0, .6);
            --cbg-box: 0 0 0 1px rgba(0, 0, 0, .35);
            position: fixed !important;
            top: calc(var(--topBarBlockSize, 50px) + 10px) !important;
            right: 10px !important; left: auto !important; bottom: auto !important;
            transform: none !important;
            width: 270px !important; max-width: calc(100vw - 20px) !important;
            max-height: calc(100dvh - var(--topBarBlockSize, 50px) - 30px) !important;
            overflow-y: auto !important; overscroll-behavior: contain;
            box-sizing: border-box !important;
            z-index: 999999 !important;
            display: none;
            margin: 0 !important; padding: 14px 15px !important;
            font-size: 13px !important; line-height: 1.5 !important;
            border-radius: 12px !important;
            background: var(--cbg-bg) !important;
            color: var(--cbg-fg) !important;
            border: 1px solid var(--cbg-line) !important;
            box-shadow: var(--cbg-box) !important;
            backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
            text-align: left !important;
        }
        /* 手机：变成贴在底部的小抽屉，最多占屏幕 45%，上面能看到背景和聊天 */
        @media (max-width: 600px) {
            ${P} {
                top: auto !important; bottom: 8px !important;
                left: 8px !important; right: 8px !important;
                width: auto !important; max-width: none !important;
                max-height: 45dvh !important;
                padding: 10px 12px 12px !important;
                border-radius: 14px !important;
            }
            ${P} .tip { display: none !important; }
            ${P} .row { margin-bottom: 8px !important; }
        }
        /* 横屏手机（屏幕很矮）：也收紧 */
        @media (max-height: 500px) {
            ${P} { max-height: 70dvh !important; }
            ${P} .tip { display: none !important; }
        }

        ${P} * { color: inherit !important; text-shadow: var(--cbg-ts) !important; box-sizing: border-box !important; }
        ${P} .h { display: flex; justify-content: space-between; align-items: center; font-weight: bold; margin-bottom: 8px; }
        ${P} .x { cursor: pointer; font-size: 20px; line-height: 1; padding: 2px 6px; }
        ${P} .row { margin-bottom: 12px; }
        ${P} .tip { font-size: 11px; opacity: .85; }
        ${P} .sec { font-size: 11px; opacity: .85; margin: 16px 0 8px; letter-spacing: 1px; }
        /* 框线外面再描一圈暗边，浅色图上也看得见按钮轮廓 */
        ${P} .seg, ${P} .b, ${P} .mini-btn, ${P} input[type=number] { box-shadow: var(--cbg-box) !important; }

        /* 分段按钮（代替下拉框，下拉框会被美化染黑） */
        ${P} .seg {
            display: flex !important; margin-top: 5px !important;
            border: 1px solid var(--cbg-line) !important; border-radius: 8px !important; overflow: hidden !important;
            background: transparent !important;
        }
        ${P} .seg span {
            flex: 1; text-align: center; padding: 7px 2px; font-size: 12px; cursor: pointer;
            opacity: 1; user-select: none; -webkit-user-select: none;
            border-radius: 0 !important; background: transparent !important;
        }
        ${P} .seg span + span { border-left: 1px solid var(--cbg-line) !important; }
        ${P} .seg span.on { background: var(--cbg-accent) !important; color: #fff !important; opacity: 1; }

        /* 开关 */
        ${P} label.sw { display: flex !important; align-items: center; gap: 8px; cursor: pointer; }
        ${P} input[type=checkbox] {
            all: revert !important;
            width: 16px !important; height: 16px !important; margin: 0 !important;
            accent-color: var(--cbg-accent) !important; cursor: pointer !important;
        }
        ${P} input::before, ${P} input::after { content: none !important; display: none !important; }

        /* 滑块：轨道和圆点都自己画，美化管不到 */
        ${P} input[type=range] {
            -webkit-appearance: none !important; appearance: none !important;
            display: block !important; width: 100% !important; height: 24px !important;
            margin: 2px 0 0 !important; padding: 0 !important;
            background: transparent !important; border: none !important; box-shadow: none !important;
            cursor: pointer !important;
        }
        ${P} input[type=range]::-webkit-slider-runnable-track {
            height: 4px !important; background: var(--cbg-track) !important;
            border: none !important; border-radius: 2px !important; box-shadow: var(--cbg-box) !important;
        }
        ${P} input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none !important; appearance: none !important;
            width: 18px !important; height: 18px !important; margin-top: -7px !important;
            border: none !important; border-radius: 50% !important;
            background: var(--cbg-accent) !important; box-shadow: 0 1px 3px rgba(0, 0, 0, .3) !important;
        }
        ${P} input[type=range]::-moz-range-track {
            height: 4px; background: var(--cbg-track); border: none; border-radius: 2px;
        }
        ${P} input[type=range]::-moz-range-thumb {
            width: 18px; height: 18px; border: none; border-radius: 50%; background: var(--cbg-accent);
        }
        ${P} input[type=file] { display: none !important; }

        ${P} .btns { display: flex; gap: 8px; margin-top: 8px; }
        ${P} .b {
            flex: 1; display: block; text-align: center; cursor: pointer; padding: 7px 0; font-size: 12px;
            border: 1px solid var(--cbg-line) !important; border-radius: 8px !important;
            background: transparent !important; user-select: none; -webkit-user-select: none;
        }
        ${P} .b:active { background: var(--cbg-track) !important; }
        /* 顶部按钮 */
        ${P} .hb { display: flex; align-items: center; gap: 4px; }
        ${P} .mini-btn {
            cursor: pointer; font-size: 12px; font-weight: normal; padding: 3px 9px;
            border: 1px solid var(--cbg-line) !important; border-radius: 999px !important;
            user-select: none; -webkit-user-select: none;
        }

        /* 标签页：一次只显示一组，面板就不会很长 */
        ${P} .tabs { margin: 0 0 10px !important; }
        ${P} .pane { display: none; }
        ${P} .pane.on { display: block; }

        /* 滑块那行：名字和数值放一行 */
        ${P} .lab { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        ${P} .lab b { font-weight: normal; opacity: .8; font-variant-numeric: tabular-nums; }

        /* 收起：只留顶上一条，点「展开」回来 */
        ${P}.mini { padding-bottom: 10px !important; }
        ${P}.mini .tabs, ${P}.mini .pane { display: none !important; }
        ${P}.mini .h { margin-bottom: 0 !important; }

        /* 拖滑块时：面板其他部分变透明，只留正在拖的那一行，能直接看到效果 */
        ${P}.peek {
            background: transparent !important; border-color: transparent !important;
            box-shadow: none !important; overflow: visible !important;
        }
        ${P}.peek .h, ${P}.peek .tabs, ${P}.peek .pane > *:not(.active),
        ${P}.peek .sec, ${P}.peek .status { visibility: hidden !important; }
        ${P}.peek .row.active {
            visibility: visible !important;
            background: var(--cbg-bg) !important;
            border: 1px solid var(--cbg-line) !important;
            border-radius: 10px !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, .25) !important;
            padding: 6px 10px !important; margin: -7px -11px 1px !important;
        }

        ${P} .status, ${P} .jstatus { font-size: 11px; opacity: .7; margin-top: 6px; min-height: 1em; }

        /* 跳转楼层 */
        ${P} .jump { display: flex; gap: 8px; align-items: center; margin-top: 6px; }
        ${P} input[type=number] {
            all: revert !important;
            flex: 1 1 auto !important; min-width: 0 !important; width: 100% !important;
            height: 34px !important; margin: 0 !important; padding: 0 10px !important;
            font-size: 15px !important; color: inherit !important;
            background: transparent !important;
            border: 1px solid var(--cbg-line) !important; border-radius: 8px !important;
            box-sizing: border-box !important; outline: none !important;
        }
        ${P} input[type=number] { box-shadow: var(--cbg-box) !important; }
        ${P} input[type=number]::placeholder { color: var(--cbg-fg) !important; opacity: .7; }
        ${P} input[type=number]:focus { border-color: var(--cbg-accent) !important; }
        ${P} .jump .b { flex: 0 0 auto; padding: 7px 14px; margin: 0; }
        ${P} .jump .b.go { background: var(--cbg-accent) !important; border-color: var(--cbg-accent) !important; color: #fff !important; }

        /* 跳到的那一楼闪一下框，告诉你是哪条 */
        #${ID.flash} {
            position: fixed; pointer-events: none; z-index: 999998;
            border: 2px solid #6a8fd8; border-radius: 12px;
            box-shadow: 0 0 0 4px rgba(106, 143, 216, .25);
            opacity: 0; transition: opacity .6s ease;
        }
    `;
    D.head.appendChild(style);

    // 随设置变化的样式（描边、去毛玻璃），只作用在聊天区
    const fx = D.createElement('style');
    fx.id = ID.fx;
    D.head.appendChild(fx);

    const mk = (id) => { const el = D.createElement('div'); el.id = id; return el; };
    const fill = mk(ID.fill);
    const bg = mk(ID.bg);
    const veil = mk(ID.veil);
    D.body.prepend(veil);
    D.body.prepend(bg);
    D.body.prepend(fill);

    /* ---------- 存上传的图（IndexedDB，图大也存得下） ---------- */
    const DB_NAME = 'cbg2_images';
    const STORE = 'img';
    let dbP = null;
    const db = () => dbP || (dbP = new Promise((res, rej) => {
        const r = W.indexedDB.open(DB_NAME, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(STORE);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    }));
    const idb = (mode, fn) => db().then((d) => new Promise((res, rej) => {
        const tx = d.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => res(req && req.result);
        tx.onerror = () => rej(tx.error);
    }));
    const idbGet = (k) => idb('readonly', (s) => s.get(k)).catch(() => null);
    const idbSet = (k, v) => idb('readwrite', (s) => s.put(v, k));
    const idbDel = (k) => idb('readwrite', (s) => s.delete(k));

    const urlCache = {};
    const customURL = async (k) => {
        if (k in urlCache) return urlCache[k];
        const blob = await idbGet(k);
        urlCache[k] = blob ? W.URL.createObjectURL(blob) : null;
        return urlCache[k];
    };
    const dropURL = (k) => {
        if (urlCache[k]) W.URL.revokeObjectURL(urlCache[k]);
        delete urlCache[k];
    };

    // 太大的图缩到长边 2560，电脑大屏也够清楚；动图原样保存
    const compress = (file) => new Promise((res) => {
        if (file.type === 'image/gif') return res(file);
        const u = W.URL.createObjectURL(file);
        const im = new W.Image();
        im.onload = () => {
            const w = im.naturalWidth, h = im.naturalHeight;
            const s = Math.min(1, 2560 / Math.max(w, h));
            if (s === 1 && file.size < 4e6) { W.URL.revokeObjectURL(u); return res(file); }
            const c = D.createElement('canvas');
            c.width = Math.round(w * s);
            c.height = Math.round(h * s);
            c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
            W.URL.revokeObjectURL(u);
            c.toBlob((b) => res(b || file), 'image/jpeg', 0.92);
        };
        im.onerror = () => { W.URL.revokeObjectURL(u); res(file); };
        im.src = u;
    });

    /* ---------- 面板字体：自动跟随美化 ---------- */
    // 面板挂在 body 外面，不会自动继承美化的字体，所以手动拿过来
    const fontEl = D.createElement('style');
    fontEl.id = ID.font;
    D.head.appendChild(fontEl);
    let lastFont = null;
    const updateFont = () => {
        let fam = 'system-ui, sans-serif';
        try { fam = W.getComputedStyle(D.querySelector('#chat .mes_text') || D.body).fontFamily || fam; } catch (e) {}
        const css = `${P}, ${P} *:not(code):not(pre):not(.fa):not([class*="fa-"]) { font-family: ${fam} !important; }\n`;
        if (css !== lastFont) { fontEl.textContent = css; lastFont = css; }
    };
    // 删掉之前上传过的字体文件，不占手机空间
    idbDel('font').catch(() => {});

    /* ---------- 面板文字样式（描边、颜色、底色） ---------- */
    const lum = (c) => {
        const m = String(c || '').match(/[\d.]+/g);
        if (!m || m.length < 3) return 255;
        return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2];
    };
    const updatePanelLook = () => {
        const p = D.getElementById(ID.panel);
        if (!p) return;
        const b = +cfg.panelBlur || 0;
        const edge = (rgb) => b <= 0
            ? `1px 0 0 rgb(${rgb}), -1px 0 0 rgb(${rgb}), 0 1px 0 rgb(${rgb}), 0 -1px 0 rgb(${rgb})`
            : `0 0 ${Math.max(1, b * 0.6).toFixed(1)}px rgba(${rgb},1), 0 1px ${b}px rgba(${rgb},.9), 0 0 ${(b * 2.5).toFixed(1)}px rgba(${rgb},.6)`;

        let fg = '#fff', ts = edge('0,0,0'), dark = false;
        if (cfg.panelText === 'light') { fg = '#1a1a1a'; ts = edge('255,255,255'); dark = true; }
        else if (cfg.panelText === 'none') { ts = 'none'; }
        else if (cfg.panelText === 'follow') {
            // 直接照抄正文最后一条消息的字色和描边
            const all = D.querySelectorAll('#chat .mes .mes_text');
            const el = all[all.length - 1];
            if (el) {
                const cs = W.getComputedStyle(el);
                fg = cs.color; ts = cs.textShadow || 'none'; dark = lum(fg) < 140;
            }
        }
        const t = (+cfg.panelTint || 0) / 100;
        const v = (k, val) => p.style.setProperty(k, val);
        v('--cbg-fg', fg);
        v('--cbg-ts', ts);
        v('--cbg-bg', dark ? `rgba(255,255,255,${t})` : `rgba(0,0,0,${t})`);
        v('--cbg-line', dark ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.55)');
        v('--cbg-track', dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.55)');
        v('--cbg-box', dark ? '0 0 0 1px rgba(255,255,255,.4)' : '0 0 0 1px rgba(0,0,0,.35)');
    };

    /* ---------- 找图 ---------- */
    // 没打开任何角色（酒馆首页、临时聊天）时不显示背景
    const inCharChat = () => {
        try {
            const ctx = W.SillyTavern.getContext();
            return ctx.characterId != null || !!ctx.groupId;
        } catch (e) {
            return true;
        }
    };

    const currentAvatarSrc = () => {
        // 只认角色卡头像，跳过酒馆自带的默认图标（就是那个 ST 标志）
        const imgs = D.querySelectorAll('#chat .mes[is_user="false"]:not([is_system="true"]) .avatar img');
        for (let i = imgs.length - 1; i >= 0; i--) {
            const s = imgs[i].getAttribute('src');
            if (s && charKeyOf(s)) return s;
        }
        // 还没有消息时，用当前角色卡
        try {
            const ST = W.SillyTavern;
            const ctx = ST && ST.getContext && ST.getContext();
            const ch = ctx && ctx.characterId != null && ctx.characters && ctx.characters[ctx.characterId];
            if (ch && ch.avatar) return '/characters/' + encodeURIComponent(ch.avatar);
        } catch (e) {}
        return null;
    };

    // 角色卡文件名，用来区分"给哪个角色上传的图"
    const charKeyOf = (src) => {
        try {
            const u = new URL(src, W.location.href);
            if (u.pathname.includes('thumbnail')) return u.searchParams.get('file');
            const m = u.pathname.match(/\/characters\/(.+)$/);
            if (m) return decodeURIComponent(m[1]);
        } catch (e) {}
        return null;
    };

    // 消息头像是压缩过的小缩略图，铺满屏幕会糊成马赛克，所以换成原图
    const toFull = (src) => {
        const f = charKeyOf(src);
        return f ? '/characters/' + encodeURIComponent(f) : src;
    };

    const dims = {};
    const probe = (url) => dims[url] || (dims[url] = new Promise((res) => {
        const im = new W.Image();
        im.onload = () => res({ ok: true, a: (im.naturalWidth / im.naturalHeight) || 1 });
        im.onerror = () => res({ ok: false, a: 1 });
        im.src = url;
    }));

    const pickImage = async () => {
        if (!inCharChat()) return null;
        const src = currentAvatarSrc();
        const ck = src ? charKeyOf(src) : null;

        if (cfg.source === 'custom') {
            if (ck) {
                const u = await customURL('char:' + ck);
                if (u) return { url: u, a: (await probe(u)).a, key: 'char:' + ck, label: '正在用：上传的图（当前角色）' };
            }
            const g = await customURL('global');
            if (g) return { url: g, a: (await probe(g)).a, key: 'global', label: '正在用：上传的图（所有角色通用）' };
        }

        if (!src) return null;
        const full = toFull(src);
        const d = await probe(full);
        if (d.ok) {
            return { url: full, a: d.a, key: null, label: cfg.source === 'custom' ? '还没上传图，先用角色卡原图' : '正在用：角色卡原图' };
        }
        return { url: src, a: (await probe(src)).a, key: null, label: '原图取不到，正在用头像缩略图' };
    };

    /* ---------- 判断美化用的是浅色字还是深色字 ---------- */
    const textIsLight = () => {
        const all = D.querySelectorAll('#chat .mes .mes_text');
        const el = all[all.length - 1];
        if (!el) return true;
        const m = W.getComputedStyle(el).color.match(/[\d.]+/g);
        if (!m || m.length < 3) return true;
        const [r, g, b] = m.map(Number);
        return 0.299 * r + 0.587 * g + 0.114 * b > 140;
    };

    /* ---------- 应用 ---------- */
    let cur = { url: '', a: 1, key: null, label: '' };
    let lastFx = '';
    let token = 0;

    const setStatus = (t) => {
        const el = D.querySelector(P + ' .status');
        if (el) el.textContent = t || '';
    };

    const styleCache = new WeakMap();
    const setStyle = (el, prop, val) => {
        let c = styleCache.get(el);
        if (!c) { c = {}; styleCache.set(el, c); }
        if (c[prop] === val) return;
        c[prop] = val;
        el.style[prop] = val;
    };

    const show = (on) => {
        const v = on ? 'block' : 'none';
        setStyle(bg, 'display', v);
        setStyle(veil, 'display', v);
        if (!on) setStyle(fill, 'display', 'none');
    };

    // 横屏配竖图（电脑、平板横放）时完整显示，两边用虚化版补齐；其余情况铺满
    const layout = () => {
        const sa = W.innerWidth / W.innerHeight;
        let fit = cfg.fit;
        if (fit === 'auto') fit = (sa > 1 && cur.a < sa / 1.6) ? 'contain' : 'cover';
        setStyle(bg, 'backgroundSize', fit);
        setStyle(bg, 'backgroundPosition', fit === 'cover' ? `center ${cfg.posY}%` : 'center center');
        setStyle(fill, 'display', fit === 'contain' && bg.style.display === 'block' ? 'block' : 'none');
    };

    const apply = async () => {
        const my = ++token;
        try { updateFont(); } catch (err) { report('字体', err); }
        try { updatePanelLook(); } catch (err) { report('面板文字', err); }

        if (!cfg.enabled) {
            show(false);
            if (lastFx) { fx.textContent = ''; lastFx = ''; }
            setStatus('已关闭');
            return;
        }

        const tone = cfg.veilMode === 'auto' ? (textIsLight() ? 'dark' : 'light') : cfg.veilMode;
        const a = cfg.protect / 100;
        setStyle(veil, 'background', tone === 'dark' ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`);

        const shadow = tone === 'dark'
            ? '0 1px 2px rgba(0,0,0,.95), 0 0 6px rgba(0,0,0,.7)'
            : '0 0 2px rgba(255,255,255,1), 0 0 6px rgba(255,255,255,.95)';

        let css = '';
        if (cfg.shadow) css += `#chat .mes_text, #chat .mes_reasoning { text-shadow: ${shadow} !important; }\n`;
        if (cfg.noGlass) css += `#chat .mes, #chat .mes_block, #chat .mes_text { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }\n`;
        if (css !== lastFx) { fx.textContent = css; lastFx = css; }

        // 模糊就是单纯模糊，不放大图片
        setStyle(bg, 'filter', cfg.blur > 0 || cfg.bright !== 100 || cfg.sat !== 100
            ? `brightness(${cfg.bright}%) saturate(${cfg.sat}%) blur(${cfg.blur}px)` : 'none');
        setStyle(fill, 'filter', `brightness(${Math.round(cfg.bright * 0.6)}%) saturate(${cfg.sat}%) blur(28px)`);

        const pick = await pickImage();
        if (my !== token) return;
        if (!pick) {
            show(false);
            setStatus(inCharChat() ? '还没找到角色图' : '没打开角色，暂不显示背景');
            return;
        }

        if (pick.url !== cur.url) {
            bg.style.backgroundImage = `url("${pick.url}")`;
            fill.style.backgroundImage = `url("${pick.url}")`;
        }
        cur = pick;
        show(true);
        layout();
        setStatus(pick.label);
    };

    let timer = null;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { apply().catch((err) => report('背景', err)); }, 250);
    };

    /* ---------- 跳转楼层 ---------- */
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const getCtx = () => { try { return W.SillyTavern.getContext(); } catch (e) { return null; } };
    const findMes = (n) => D.querySelector(`#chat .mes[mesid="${n}"]`);

    const setJump = (t) => {
        const el = D.querySelector(P + ' .jstatus');
        if (el) el.textContent = t || '';
    };

    const flashMes = (el) => {
        let f = D.getElementById(ID.flash);
        if (!f) { f = D.createElement('div'); f.id = ID.flash; D.documentElement.appendChild(f); }
        const r = el.getBoundingClientRect();
        const top = Math.max(r.top, 0);
        const bottom = Math.min(r.bottom, W.innerHeight);
        Object.assign(f.style, {
            left: r.left - 3 + 'px', top: top - 3 + 'px',
            width: r.width + 6 + 'px', height: Math.max(bottom - top, 40) + 6 + 'px',
            transition: 'none', opacity: '1',
        });
        requestAnimationFrame(() => {
            f.style.transition = 'opacity .6s ease 1s';
            f.style.opacity = '0';
        });
    };

    const lastMesId = () => {
        const ctx = getCtx();
        if (ctx && Array.isArray(ctx.chat)) return ctx.chat.length - 1;
        const all = D.querySelectorAll('#chat .mes[mesid]');
        return all.length ? +all[all.length - 1].getAttribute('mesid') : -1;
    };

    let jumping = false;
    const jumpTo = async (raw) => {
        if (jumping) return;
        const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
        if (isNaN(n)) { setJump('请输入楼层号，比如 12'); return; }
        const last = lastMesId();
        if (last < 0) { setJump('当前没有打开的聊天'); return; }
        if (n > last) { setJump(`没有这一楼，现在最新是 #${last}`); return; }

        jumping = true;
        setJump('正在找…');
        let el = findMes(n);

        // 旧楼层没加载出来：一直点「显示更多消息」往前加载，直到出现
        for (let i = 0; !el && i < 80; i++) {
            const more = D.getElementById('show_more_messages');
            if (!more) break;
            more.click();
            await sleep(250);
            el = findMes(n);
        }

        // 再不行就用酒馆自带的跳转指令
        if (!el) {
            const ctx = getCtx();
            const run = ctx && (ctx.executeSlashCommandsWithOptions || ctx.executeSlashCommands);
            if (run) {
                try { await run.call(ctx, `/chat-jump ${n}`); } catch (e) {}
                for (let i = 0; !el && i < 12; i++) { await sleep(250); el = findMes(n); }
            }
        }

        jumping = false;
        if (!el) { setJump(`没找到 #${n}，可能被隐藏或删掉了`); return; }

        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setJump(`已跳到 #${n}`);
        const p = D.getElementById(ID.panel);
        if (p) closePanel();
        await sleep(600);
        flashMes(el);
    };

    /* ---------- 设置面板 ---------- */
    const slider =(k, name, min, max, unit, tip) => `
        <div class="row">
            <div class="lab"><span>${name}${tip ? ` <span class="tip">${tip}</span>` : ''}</span><b><span data-v="${k}"></span>${unit}</b></div>
            <input type="range" data-k="${k}" min="${min}" max="${max}">
        </div>`;

    const check = (k, name, tip) => `
        <div class="row">
            <label class="sw"><input type="checkbox" data-k="${k}"><span>${name}</span></label>
            ${tip ? `<div class="tip">${tip}</div>` : ''}
        </div>`;

    const seg = (k, name, opts, tip) => `
        <div class="row">
            <div>${name}${tip ? ` <span class="tip">${tip}</span>` : ''}</div>
            <div class="seg" data-seg="${k}">${opts.map(([v, t]) => `<span data-val="${v}">${t}</span>`).join('')}</div>
        </div>`;

    const syncPanel = () => {
        const p = D.getElementById(ID.panel);
        if (!p) return;
        p.querySelectorAll('[data-k]').forEach((el) => {
            const k = el.dataset.k;
            if (el.type === 'checkbox') el.checked = !!cfg[k];
            else el.value = cfg[k];
        });
        p.querySelectorAll('[data-v]').forEach((el) => { el.textContent = cfg[el.dataset.v]; });
        p.querySelectorAll('[data-tab]').forEach((t) => t.classList.toggle('on', t.dataset.tab === cfg.tab));
        p.querySelectorAll('[data-pane]').forEach((x) => x.classList.toggle('on', x.dataset.pane === cfg.tab));
        p.querySelectorAll('[data-seg]').forEach((box) => {
            box.querySelectorAll('[data-val]').forEach((s) => {
                s.classList.toggle('on', String(cfg[box.dataset.seg]) === s.dataset.val);
            });
        });
    };

    const onFile = async (file) => {
        if (!file) return;
        const src = currentAvatarSrc();
        const ck = src ? charKeyOf(src) : null;
        const k = cfg.uploadScope === 'char' && ck ? 'char:' + ck : 'global';
        setStatus('正在处理图片…');
        const blob = await compress(file);
        try {
            await idbSet(k, blob);
        } catch (e) {
            setStatus('保存失败：浏览器不允许存图片');
            return;
        }
        dropURL(k);
        cfg.source = 'custom';
        save();
        syncPanel();
        apply();
    };

    const initPanel = () => {
        if (D.getElementById(ID.panel)) return;
        const p = D.createElement('div');
        p.id = ID.panel;
        p.innerHTML = `
            <div class="h"><span title="版本 ${VERSION}">✧ 线粒体</span><span class="hb"><span class="mini-btn" data-act="reset">还原</span><span class="mini-btn" data-act="mini">收起看效果</span><span class="x" data-act="close">×</span></span></div>

            <div class="seg tabs" data-tabs>
                <span data-tab="jump">跳转</span>
                <span data-tab="bg">背景</span>
                <span data-tab="text">文字</span>
                <span data-tab="img">图片</span>
            </div>

            <div class="pane" data-pane="jump">
                <div class="jump">
                    <input type="number" inputmode="numeric" min="0" placeholder="楼层号，如 12" data-jump>
                    <span class="b go" data-act="jump">跳转</span>
                    <span class="b" data-act="jumplast">最新</span>
                </div>
                <div class="jstatus"></div>
                ${check('ball', '显示悬浮球', '按住拖到任意位置，点一下打开这个面板')}
            </div>

            <div class="pane" data-pane="bg">
                ${check('enabled', '启用背景')}
                ${seg('source', '使用', [['card', '角色卡原图'], ['custom', '自己上传的图']])}
                ${seg('uploadScope', '上传给', [['char', '当前角色'], ['global', '所有角色']])}
                <div class="btns">
                    <label class="b">上传图片<input type="file" accept="image/*"></label>
                    <span class="b" data-act="delimg">删除上传</span>
                </div>
                <div class="status"></div>
            </div>

            <div class="pane" data-pane="text">
                ${slider('protect', '文字保护', 0, 80, '%', '越高字越清楚，图越淡')}
                ${seg('veilMode', '遮罩', [['auto', '自动'], ['dark', '压暗'], ['light', '提亮']], '自动 = 按字色判断')}
                ${check('shadow', '正文描边', '浅色字加黑影，深色字加白光')}
                ${check('noGlass', '去掉消息毛玻璃', '只去掉消息后面的模糊，美化其他效果不动')}
                <div class="sec">面板文字</div>
                ${seg('panelText', '样式', [['follow', '跟随正文'], ['outline', '白字黑边'], ['light', '黑字白边'], ['none', '白字无边']])}
                ${slider('panelBlur', '描边模糊', 0, 10, 'px', '0 = 硬边，黑边/白边时生效')}
                ${slider('panelTint', '面板背景', 0, 90, '%', '0 = 全透明，越高越不透明、字越清楚')}
            </div>

            <div class="pane" data-pane="img">
                ${seg('fit', '填充', [['auto', '自动'], ['cover', '铺满'], ['contain', '完整']], '电脑横屏用自动或完整')}
                ${slider('posY', '位置', 0, 100, '%', '铺满时生效，0 靠上')}
                ${slider('bright', '亮度', 30, 150, '%')}
                ${slider('sat', '饱和度', 0, 200, '%')}
                ${slider('blur', '模糊', 0, 20, 'px')}
                <div class="btns">
                    <span class="b" data-act="refresh">刷新图片</span>
                </div>
            </div>
        `;
        // 挂在 <html> 下而不是 <body> 里：美化给 body 加的滤镜/变形不会再把面板带歪，body 里的通用样式也管不到它
        D.documentElement.appendChild(p);
        syncPanel();

        const endPeek = () => {
            p.classList.remove('peek');
            p.querySelectorAll('.row.active').forEach((r) => r.classList.remove('active'));
        };
        p.addEventListener('pointerdown', (e) => {
            if (e.target.type !== 'range') return;
            // 调面板自己的样式时要看着面板，不隐藏
            if (e.target.dataset.k === 'panelTint' || e.target.dataset.k === 'panelBlur') return;
            const row = e.target.closest('.row');
            if (row) row.classList.add('active');
            p.classList.add('peek');
        });
        p.addEventListener('pointerup', endPeek);
        p.addEventListener('pointercancel', endPeek);
        p.addEventListener('lostpointercapture', endPeek);
        p.addEventListener('change', (e) => { if (e.target.type === 'range') endPeek(); });

        p.addEventListener('keydown', (e) => {
            if (e.target.hasAttribute && e.target.hasAttribute('data-jump') && e.key === 'Enter') {
                e.preventDefault();
                jumpTo(e.target.value);
            }
        });

        const onInput = (e) => {
            const el = e.target;
            if (el.type === 'file' || el.hasAttribute('data-jump')) return;
            const k = el.dataset && el.dataset.k;
            if (!k) return;
            cfg[k] = el.type === 'checkbox' ? el.checked : +el.value;
            syncPanel();
            save();
            if (k === 'ball') { updateBall(); return; }
            apply();
        };
        p.addEventListener('input', onInput);
        p.addEventListener('change', (e) => {
            if (e.target.type === 'file') {
                onFile(e.target.files && e.target.files[0]);
                e.target.value = '';
                return;
            }
            onInput(e);
        });

        let undoSnap = null, undoTimer = null;
        p.addEventListener('click', async (e) => {
            // 刚打开的一瞬间不响应：点球的那一下可能落到面板上（球挪开后手指下面就是面板）
            if (Date.now() - lastOpen < 400) return;
            const t = e.target;
            if (t.dataset && t.dataset.tab) {
                cfg.tab = t.dataset.tab;
                save(); syncPanel(); placePanel();
                return;
            }
            const segBox = t.closest && t.closest('[data-seg]');
            if (segBox && t.dataset.val) {
                cfg[segBox.dataset.seg] = t.dataset.val;
                save(); syncPanel(); apply();
                return;
            }
            const act = t.dataset && t.dataset.act;
            if (act === 'close') closePanel();
            if (act === 'mini') {
                const m = p.classList.toggle('mini');
                t.textContent = m ? '展开' : '收起看效果';
                placePanel();
            }
            if (act === 'jump') jumpTo(p.querySelector('[data-jump]').value);
            if (act === 'jumplast') jumpTo(lastMesId());
            if (act === 'refresh') {
                Object.keys(dims).forEach((k) => delete dims[k]);
                Object.keys(urlCache).forEach(dropURL);
                cur.url = '';
                apply();
            }
            if (act === 'reset') {
                // 点错了：4 秒内按钮变成「撤销」，再点一下就回到还原前
                if (undoSnap) {
                    Object.assign(cfg, undoSnap);
                    undoSnap = null; clearTimeout(undoTimer);
                    t.textContent = '还原';
                    save(); syncPanel(); apply();
                    return;
                }
                undoSnap = Object.assign({}, cfg);
                // 还原只管背景效果，悬浮球的开关和位置保留
                const keep = { ball: cfg.ball, ballX: cfg.ballX, ballY: cfg.ballY, tab: cfg.tab };
                Object.assign(cfg, DEF, keep); save(); syncPanel(); apply();
                t.textContent = '撤销';
                undoTimer = setTimeout(() => { undoSnap = null; t.textContent = '还原'; }, 4000);
            }
            if (act === 'delimg') {
                if (!cur.key) { setStatus('现在没在用上传的图'); return; }
                try { await idbDel(cur.key); } catch (err) {}
                dropURL(cur.key);
                cur.url = '';
                apply();
            }
        });
    };

    // 面板位置用 JS 按「屏幕上实际看到的位置」来摆：
    // 先放到 0,0 量一下实际落在屏幕哪里，再把差值补上。
    // 这样不管美化给页面加了什么滤镜/变形，面板都一定出现在屏幕里。
    const placePanel = () => {
        const p = D.getElementById(ID.panel);
        if (!p || p.style.display !== 'block') return;
        const set = (k, v) => p.style.setProperty(k, v, 'important');
        const vv = W.visualViewport;
        const vw = W.innerWidth;
        const vh = vv ? vv.height : W.innerHeight;   // 弹出键盘时只算键盘上面那块
        const vt = vv ? vv.offsetTop : 0;
        const mobile = vw <= 600;
        const topBar = parseFloat(W.getComputedStyle(D.documentElement).getPropertyValue('--topBarBlockSize')) || 50;

        const w = mobile ? vw - 16 : Math.min(270, vw - 20);
        set('transform', 'none');
        set('right', 'auto'); set('bottom', 'auto');
        set('width', w + 'px'); set('max-width', 'none');
        set('max-height', Math.max(160, Math.round(mobile ? vh * 0.45 : vh - topBar - 30)) + 'px');
        set('left', '0px'); set('top', '0px');

        const r = p.getBoundingClientRect();         // r.left / r.top = 「0,0」实际偏到了哪
        const wantX = mobile ? 8 : vw - w - 10;
        let wantY = mobile ? vt + vh - r.height - 8 : vt + topBar + 10;
        wantY = Math.max(vt + 8, wantY);
        set('left', Math.round(wantX - r.left) + 'px');
        set('top', Math.round(wantY - r.top) + 'px');
        dodgeBall();
    };

    // 悬浮球压在面板上会挡住按钮：面板打开期间把球临时挪到面板上面（或下面），关面板后回到原位
    const dodgeBall = () => {
        const p = D.getElementById(ID.panel);
        if (!cfg.ball || !p || p.style.display !== 'block') return;
        placeBall();
        const pr = p.getBoundingClientRect();
        const overlap = bx < pr.right && bx + BALL > pr.left && by < pr.bottom && by + BALL > pr.top;
        if (!overlap) return;
        const above = pr.top - BALL - 8;
        by = above >= 4 ? above : pr.bottom + 8;
        clampBall();
        paintBall();
    };
    const closePanel = () => {
        const p = D.getElementById(ID.panel);
        if (p) p.style.display = 'none';
        if (cfg.ball) placeBall();
    };

    let lastToggle = 0, lastOpen = 0, openGuard = null;
    const togglePanel = (forJump) => {
        try { togglePanelInner(forJump); lastToggle = Date.now(); }
        catch (err) { report('打开面板', err); }
    };
    const togglePanelInner = (forJump) => {
        initPanel();
        const p = D.getElementById(ID.panel);
        const open = p.style.display !== 'block';
        if (!open) { closePanel(); return; }
        p.style.display = 'block';
        lastOpen = Date.now();
        if (open) {
            syncPanel();
            setStatus(cur.label);
            setJump('');
            try { updateFont(); } catch (err) { report('字体', err); }
            try { updatePanelLook(); } catch (err) { report('面板文字', err); }
            p.classList.remove('mini', 'peek');
            const mb = p.querySelector('[data-act="mini"]');
            if (mb) mb.textContent = '收起看效果';
            p.scrollTop = 0;
            placePanel();
            const inp = p.querySelector('[data-jump]');
            if (inp) inp.value = '';
            // 只有电脑（没有触屏）才自动点进输入框；有的安卓机会谎报自己是鼠标，所以再查一次触屏
            const hasTouch = (W.navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in W;
            const finePointer = W.matchMedia && W.matchMedia('(pointer: fine)').matches;
            if (forJump === true && cfg.tab === 'jump' && finePointer && !hasTouch && inp) setTimeout(() => inp.focus(), 50);
            // 刚打开的一小会儿面板不接收点击：点球的那一下不会「穿透」到面板里的输入框上弹出键盘
            p.style.setProperty('pointer-events', 'none', 'important');
            clearTimeout(openGuard);
            openGuard = setTimeout(() => {
                p.style.removeProperty('pointer-events');
                const a = D.activeElement;
                if (hasTouch && a && p.contains(a) && a.blur) a.blur();
            }, 450);
        }
    };

    /* ---------- 悬浮球 ---------- */
    const BALL = 44;
    const ball = D.createElement('div');
    ball.id = ID.ball;
    // 画一个线粒体：椭圆外膜 + 里面弯弯曲曲的嵴（用图形画，不用文字符号，任何手机上都正好居中）
    ball.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true">
        <g transform="rotate(-30 16 16)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="16" cy="16" rx="13" ry="7.5" stroke-width="2"/>
            <path d="M6.5 16 L9.5 11 L12 21 L15 11 L17.5 21 L20.5 11 L23 21 L25.5 16" stroke-width="1.6"/>
        </g>
    </svg>`;
    ball.title = '线粒体（按住拖动）';
    D.documentElement.appendChild(ball);

    let bx = 0, by = 0, offX = 0, offY = 0;
    const clampBall = () => {
        const vw = W.innerWidth, vh = W.innerHeight;
        bx = Math.min(Math.max(bx, 4), vw - BALL - 4);
        by = Math.min(Math.max(by, 4), vh - BALL - 4);
    };
    const paintBall = () => { ball.style.setProperty('transform', `translate3d(${bx - offX}px, ${by - offY}px, 0)`, 'important'); };
    const placeBall = () => {
        const vw = W.innerWidth, vh = W.innerHeight;
        if (cfg.ballX < 0 || cfg.ballY < 0) { bx = vw - BALL - 10; by = Math.round(vh * 0.62); }
        else { bx = cfg.ballX * vw; by = cfg.ballY * vh; }
        clampBall();
        // 和面板一样：量一下 0,0 实际在哪，保证球出现在想要的位置
        offX = 0; offY = 0; paintBall();
        const r = ball.getBoundingClientRect();
        offX = r.left - bx; offY = r.top - by;
        paintBall();
    };
    const updateBall = () => {
        ball.style.setProperty('display', cfg.ball ? 'flex' : 'none', 'important');
        if (cfg.ball) placeBall();
    };

    // 拖动：手指移动超过 14px 才算拖（手指点按时本来就会抖几像素，阈值太小会把「点一下」当成「拖」）
    // 松手停在哪就在哪，不会自己弹回去
    const DRAG_PX = 14;
    let drag = null, raf = 0;
    ball.addEventListener('pointerdown', (e) => {
        if (e.button !== undefined && e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        try { ball.setPointerCapture(e.pointerId); } catch (err) {}
        drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: bx, oy: by, moved: false, t: Date.now() };
    });
    ball.addEventListener('pointermove', (e) => {
        if (!drag || e.pointerId !== drag.id) return;
        e.preventDefault();
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_PX) return;
        if (!drag.moved) { drag.moved = true; ball.classList.add('drag'); }
        bx = drag.ox + dx; by = drag.oy + dy;
        clampBall();
        if (!raf) raf = W.requestAnimationFrame(() => { raf = 0; paintBall(); });
    });
    const endDrag = (e) => {
        if (!drag || (e && e.pointerId !== drag.id)) return;
        let wasDrag = drag.moved;
        // 很快的一下，就算手抖滑了一点也当成「点」
        if (wasDrag && e && e.type === 'pointerup' && Date.now() - drag.t < 220
            && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 28) {
            wasDrag = false;
            bx = drag.ox; by = drag.oy; paintBall();
        }
        drag = null;
        ball.classList.remove('drag');
        if (wasDrag) {
            lastDragEnd = Date.now();
            cfg.ballX = bx / W.innerWidth;
            cfg.ballY = by / W.innerHeight;
            save();
        } else if (e && e.type === 'pointerup') {
            togglePanel(true);
        }
    };
    ball.addEventListener('pointerup', endDrag);
    ball.addEventListener('touchend', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    ball.addEventListener('pointercancel', endDrag);
    // 拖完松手不要触发页面上其他东西的点击；有的手机浏览器不发 pointerup，就靠这里打开
    let lastDragEnd = 0;
    ball.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (Date.now() - lastToggle < 450 || Date.now() - lastDragEnd < 450) return;
        togglePanel(true);
    });

    /* ---------- 启动 ---------- */
    const observer = new MutationObserver(schedule);
    const chatEl = D.getElementById('chat');
    if (chatEl) observer.observe(chatEl, { childList: true });
    else observer.observe(D.body, { childList: true });
    // 切换角色/聊天时酒馆会发事件，收到就刷新一次背景
    let offEvents = () => {};
    try {
        const ctx = getCtx();
        const es = ctx && ctx.eventSource, et = ctx && ctx.event_types;
        if (es && et) {
            const evs = [et.CHAT_CHANGED, et.CHARACTER_EDITED, et.MESSAGE_SWIPED].filter(Boolean);
            evs.forEach((ev) => es.on(ev, schedule));
            offEvents = () => evs.forEach((ev) => { try { (es.removeListener || es.off).call(es, ev, schedule); } catch (e) {} });
        }
    } catch (e) {}

    const mq = W.matchMedia('(prefers-color-scheme: light)');
    if (mq.addEventListener) mq.addEventListener('change', schedule);
    else if (mq.addListener) mq.addListener(schedule);

    // 转屏、拉窗口时重新判断铺满还是完整
    let rt = null;
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { layout(); if (cfg.ball) placeBall(); placePanel(); }, 150); };
    W.addEventListener('resize', onResize);
    // 手机弹出/收起键盘时可见区域会变，面板跟着挪到键盘上面
    const vvp = W.visualViewport;
    if (vvp) vvp.addEventListener('resize', onResize);

    // 点面板外面就收起
    const onOutside = (e) => {
        const p = D.getElementById(ID.panel);
        const b = D.getElementById(ID.btn);
        if (!p || p.style.display !== 'block' || p.classList.contains('mini')) return;
        if (ball.contains(e.target)) return;
        const jb = D.getElementById(ID.jumpBtn);
        if (p.contains(e.target) || (b && b.contains(e.target)) || (jb && jb.contains(e.target))) return;
        closePanel();
    };
    D.addEventListener('pointerdown', onOutside, true);

    const menuTimer = setInterval(() => {
        const menu = D.getElementById('extensionsMenu');
        if (menu && !D.getElementById(ID.btn)) {
            const btn = D.createElement('div');
            btn.id = ID.btn;
            btn.className = 'list-group-item';
            btn.textContent = '✧ 线粒体';
            btn.addEventListener('click', () => togglePanel(true));
            menu.appendChild(btn);
        }
    }, 1500);

    W.__cbg2 = {
        token: TOKEN,
        version: VERSION,
        destroy() {
            observer.disconnect();
            offEvents();
            if (raf) W.cancelAnimationFrame(raf);
            clearInterval(menuTimer);
            clearTimeout(timer);
            W.removeEventListener('resize', onResize);
            if (vvp) vvp.removeEventListener('resize', onResize);
            D.removeEventListener('pointerdown', onOutside, true);
            if (mq.removeEventListener) mq.removeEventListener('change', schedule);
            else if (mq.removeListener) mq.removeListener(schedule);
            Object.keys(urlCache).forEach(dropURL);
            Object.values(ID).forEach((id) => { const el = D.getElementById(id); if (el) el.remove(); });
        },
    };

    try { updateBall(); } catch (err) { report('悬浮球', err); }
    apply().catch((err) => report('背景', err));
};

// ---------- 把整个功能搬到酒馆页面本身去运行 ----------
// 酒馆助手的脚本跑在隐形小窗口里，小窗口一旦被酒馆助手回收，
// 绑在按钮上的点击功能就会全部失效（按钮还在、但怎么点都没反应）。
// 所以这里把代码放进酒馆页面里运行，不再跟着小窗口一起失效。
let host = window;
try { if (window.parent && window.parent !== window && window.parent.document) host = window.parent; } catch (e) {}
const token = 't' + Date.now() + Math.random().toString(36).slice(2);
let moved = false;
if (host !== window) {
    try {
        const sc = host.document.createElement('script');
        sc.textContent = '(' + MAIN.toString() + ')(' + JSON.stringify(token) + ');';
        host.document.head.appendChild(sc);
        sc.remove();
        moved = !!(host.__cbg2 && host.__cbg2.token === token);
    } catch (e) {}
}
if (!moved) MAIN(token);
})();
