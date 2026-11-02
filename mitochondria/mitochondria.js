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

    const VERSION = '2026-11-02b';
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
        flash: NS + '-flash',
        ball: NS + '-ball',
        font: NS + '-font',
    };
    const KEY = 'char_bg_v2';
    const TABS = ['jump', 'bg', 'text', 'img'];

    const DEF = {
        enabled: true,
        source: 'card',      // card = 角色卡原图，custom = 自己上传的图
        uploadScope: 'char', // char = 只给当前角色，global = 所有角色通用
        protect: 35,         // 文字保护：遮罩浓度 %
        veilMode: 'auto',    // auto / dark / light
        shadow: true,        // 给正文加描边
        noGlass: true,       // 去掉聊天区和消息的毛玻璃（毛玻璃会把背后的图磨糊）
        fit: 'auto',         // auto / cover / contain
        posY: 25,            // 铺满时的垂直位置 %，0 = 顶部
        bright: 100,
        sat: 100,
        blur: 0,
        tab: 'jump',         // 面板上次停在哪个标签页
        ball: true,          // 显示悬浮球
        ballX: -1,           // 悬浮球位置（占屏幕宽高的比例，-1 = 默认位置）
        ballY: -1,
    };

    const cfg = Object.assign({}, DEF);
    try { Object.assign(cfg, JSON.parse(W.localStorage.getItem(KEY) || '{}')); } catch (e) {}
    if (!TABS.includes(cfg.tab)) cfg.tab = 'jump';
    const save = () => { try { W.localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} };

    // 线粒体的图形：椭圆外膜 + 里面折来折去的嵴。悬浮球、魔棒菜单、面板标题用同一个
    const mark = (outer, inner) => `<svg viewBox="0 0 32 32" aria-hidden="true">
        <g transform="rotate(-30 16 16)" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
            <ellipse cx="16" cy="16" rx="13" ry="7.5" stroke-width="${outer}"/>
            <path d="M6.5 16 L9.5 11 L12 21 L15 11 L17.5 21 L20.5 11 L23 21 L25.5 16" stroke-width="${inner}"/>
        </g>
    </svg>`;

    /* ---------- 样式（面板自带配色和控件样式，不吃美化的样式） ---------- */
    const P = '#' + ID.panel;
    const style = D.createElement('style');
    style.id = ID.style;
    style.textContent = `
        /* 图层的样式都加 !important，会变的那些（图、模糊、亮度…）由脚本写在元素上，也带 !important：
           美化里写了 filter / display 之类的 !important 规则时，照样压得过 */
        #${ID.fill}, #${ID.bg}, #${ID.veil} {
            position: fixed !important; top: 0 !important; left: 0 !important; right: auto !important; bottom: auto !important;
            width: 100vw !important; height: 100dvh !important; margin: 0 !important; padding: 0 !important;
            pointer-events: none !important; display: none; z-index: 10 !important;
            opacity: 1 !important; visibility: visible !important;
        }
        #${ID.fill}, #${ID.bg} { background-repeat: no-repeat !important; background-position: center; transition: filter .3s ease !important; }
        /* 背景单独放一层，聊天滚动时不用跟着重画，手机上不卡 */
        #${ID.fill}, #${ID.bg}, #${ID.veil} { transform: translateZ(0) !important; backface-visibility: hidden !important; contain: strict !important; }
        /* 两边补齐用的虚化层比屏幕大一圈：模糊会把边缘变透明，放大后透明的边在屏幕外面 */
        #${ID.fill} { background-size: cover !important; top: -48px !important; left: -48px !important; width: calc(100vw + 96px) !important; height: calc(100dvh + 96px) !important; }
        #${ID.veil} { transition: background .3s ease !important; }

        /* 魔棒菜单里的入口：和别的扩展一样「图标 + 名字」，图标放进同一列 */
        #${ID.btn} .extensionsMenuExtensionButton { align-self: center; }
        #${ID.btn} .extensionsMenuExtensionButton svg { display: block; width: 18px; height: 18px; }

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

        /* ---------- 面板 ----------
           实色底：面板经常压在聊天文字上，半透明时两层字叠在一起看不清。
           想看效果时拖滑块（面板自动只剩那一行），或点「收起」。 */
        ${P} {
            --c-s0: #1c1c1e; --c-s1: #2c2c2e; --c-s2: #3a3a3c;
            --c-line: rgba(255, 255, 255, .12);
            --c-ink: #f2f2f7; --c-mute: #a1a1a8; --c-mark: #f0907a;
            position: fixed !important; left: 0; top: 0; right: auto !important; bottom: auto !important;
            transform: none !important;
            width: 300px; max-width: calc(100vw - 16px) !important;
            box-sizing: border-box !important;
            z-index: 999999 !important;
            display: none !important; flex-direction: column !important;
            overflow: hidden !important;
            margin: 0 !important; padding: 0 !important;
            font-size: 15px !important; line-height: 1.45 !important; font-weight: 400 !important;
            border-radius: 14px !important;
            background: var(--c-s0) !important;
            color: var(--c-ink) !important;
            border: 1px solid var(--c-line) !important;
            box-shadow: none !important;
            backdrop-filter: none !important; -webkit-backdrop-filter: none !important;
            text-align: left !important;
            -webkit-tap-highlight-color: transparent;
        }
        ${P}.open { display: flex !important; }
        ${P} * {
            color: inherit !important; text-shadow: none !important; box-sizing: border-box !important;
            letter-spacing: normal !important; text-transform: none !important;
        }
        ${P} [role=button], ${P} [role=tab], ${P} .seg span { cursor: pointer; user-select: none; -webkit-user-select: none; }
        ${P} [role=button]:focus-visible, ${P} [role=tab]:focus-visible, ${P} .seg span:focus-visible {
            outline: 2px solid var(--c-ink) !important; outline-offset: -2px;
        }

        /* 标题行 */
        ${P} .hd { order: 1; display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 4px 6px 4px 16px; flex: none; }
        ${P} .mk { flex: none; width: 22px; height: 22px; color: var(--c-mark) !important; }
        ${P} .mk svg { display: block; width: 22px; height: 22px; }
        ${P} .nm { font-size: 16px; font-weight: 600; }
        ${P} .sp { flex: 1; }
        ${P} .ib {
            display: flex; align-items: center; justify-content: center;
            min-width: 44px; height: 40px; padding: 0 10px; border-radius: 10px;
            font-size: 14px; color: var(--c-mute) !important;
        }
        ${P} .ib:hover { background: var(--c-s1); color: var(--c-ink) !important; }
        ${P} .ib.x { font-size: 18px; }

        /* 标签页：电脑在标题下面；手机放到最下面，切换时按钮不会跟着面板高度跳来跳去 */
        ${P} .tabs { order: 2; display: flex; flex: none; padding: 0 8px; border-bottom: 1px solid var(--c-line); }
        ${P} .tabs span { flex: 1; position: relative; text-align: center; padding: 11px 0; font-size: 15px; color: var(--c-mute) !important; }
        ${P} .tabs span.on { color: var(--c-ink) !important; font-weight: 600; }
        ${P} .tabs span.on::after {
            content: ''; position: absolute; left: 30%; right: 30%; bottom: -1px; height: 2px;
            border-radius: 1px; background: var(--c-ink);
        }

        ${P} .body { order: 3; flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 2px 16px 12px; }
        ${P} .pane { display: none; }
        ${P} .pane.on { display: block; }

        /* 一行设置 */
        ${P} .row { padding: 9px 0; }
        ${P} .row + .row { border-top: 1px solid var(--c-line); }
        ${P} .lab { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
        ${P} .val { color: var(--c-mute) !important; font-variant-numeric: tabular-nums; }
        ${P} .sub { display: block; font-size: 13px; line-height: 1.4; color: var(--c-mute) !important; margin-top: 2px; }
        ${P} .row.off { opacity: .45; pointer-events: none; }

        /* 分段按钮（代替下拉框，下拉框会被美化染黑） */
        ${P} .seg { display: flex; gap: 2px; margin-top: 8px; padding: 3px; border-radius: 11px; background: var(--c-s1); }
        ${P} .seg span {
            flex: 1; text-align: center; padding: 7px 4px; border-radius: 8px;
            font-size: 14px; color: var(--c-mute) !important;
        }
        ${P} .seg span.on { background: var(--c-s2); color: var(--c-ink) !important; }

        /* 开关：文字在左，开关在右。复选框本身藏起来，开关自己画，美化给复选框加的花样不会露出来 */
        ${P} label.sw { display: flex !important; align-items: center; justify-content: space-between; gap: 12px; cursor: pointer; margin: 0; }
        ${P} label.sw input {
            position: absolute !important; width: 1px !important; height: 1px !important;
            margin: 0 !important; padding: 0 !important; opacity: 0 !important; pointer-events: none !important;
        }
        ${P} label.sw i {
            flex: none; position: relative; width: 40px; height: 24px; border-radius: 12px;
            background: var(--c-s2); transition: background .15s ease;
        }
        ${P} label.sw i::after {
            content: ''; position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%;
            background: #aeaeb2; transition: transform .15s ease, background .15s ease;
        }
        ${P} label.sw input:checked + i { background: var(--c-ink); }
        ${P} label.sw input:checked + i::after { transform: translateX(16px); background: var(--c-s0); }
        ${P} label.sw input:focus-visible + i { outline: 2px solid var(--c-ink); outline-offset: 2px; }

        /* 滑块：轨道和圆点都自己画，美化管不到 */
        ${P} input[type=range] {
            -webkit-appearance: none !important; appearance: none !important;
            display: block !important; width: 100% !important; height: 32px !important;
            margin: 0 !important; padding: 0 !important;
            background: transparent !important; border: none !important; box-shadow: none !important;
            cursor: pointer !important; touch-action: pan-y;
        }
        ${P} input[type=range]::-webkit-slider-runnable-track {
            height: 4px !important; background: var(--c-s2) !important;
            border: none !important; border-radius: 2px !important; box-shadow: none !important;
        }
        ${P} input[type=range]::-webkit-slider-thumb {
            -webkit-appearance: none !important; appearance: none !important;
            width: 22px !important; height: 22px !important; margin-top: -9px !important;
            border: none !important; border-radius: 50% !important;
            background: var(--c-ink) !important; box-shadow: 0 1px 3px rgba(0, 0, 0, .5) !important;
        }
        ${P} input[type=range]::-moz-range-track { height: 4px; background: var(--c-s2); border: none; border-radius: 2px; }
        ${P} input[type=range]::-moz-range-thumb { width: 22px; height: 22px; border: none; border-radius: 50%; background: var(--c-ink); }
        ${P} input[type=range]:focus-visible { outline: 2px solid var(--c-ink) !important; outline-offset: 2px; }
        ${P} input[type=file] { display: none !important; }

        /* 按钮 */
        ${P} .btns { display: flex; gap: 8px; margin-top: 10px; }
        ${P} .b {
            flex: 1; display: flex !important; align-items: center; justify-content: center;
            min-height: 40px; padding: 0 14px; margin: 0; border-radius: 10px;
            font-size: 14px; background: var(--c-s1); white-space: nowrap;
        }
        ${P} .b:active { background: var(--c-s2); }
        ${P} .b.go { background: var(--c-ink); color: var(--c-s0) !important; font-weight: 600; }
        ${P} .b.go:active { opacity: .8; }

        /* 跳转楼层 */
        ${P} .jump { display: flex; gap: 8px; align-items: stretch; }
        ${P} .jump .b { flex: none; }
        ${P} input[type=number] {
            all: revert !important;
            flex: 1 1 auto !important; min-width: 0 !important; width: 100% !important;
            height: 40px !important; margin: 0 !important; padding: 0 12px !important;
            font: inherit !important; font-size: 16px !important; color: var(--c-ink) !important;
            background: var(--c-s1) !important; border: 1px solid transparent !important; border-radius: 10px !important;
            box-shadow: none !important; box-sizing: border-box !important; outline: none !important;
            -moz-appearance: textfield !important;
        }
        ${P} input[type=number]::-webkit-inner-spin-button, ${P} input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
        ${P} input[type=number]::placeholder { color: var(--c-mute) !important; opacity: 1; }
        ${P} input[type=number]:focus { border-color: var(--c-mute) !important; }
        ${P} .jstatus { font-size: 13px; color: var(--c-mute) !important; min-height: 19px; margin-top: 6px; }

        /* 现在用的是哪张图 */
        ${P} .now { display: flex; align-items: center; gap: 12px; }
        ${P} .thumb {
            flex: none; width: 48px; height: 48px; border-radius: 8px;
            background: var(--c-s1) center / cover no-repeat;
        }
        ${P} .now .t1 { font-weight: 600; }

        /* 背景被别的整屏图盖住时的提示 */
        ${P} .warn { margin: 10px 0 2px; padding: 10px 12px; border-radius: 10px; background: var(--c-s1); font-size: 13px; line-height: 1.5; }

        /* 最下面的「恢复默认」 */
        ${P} .foot { padding-top: 6px; }
        ${P} .tb { display: inline-flex; align-items: center; min-height: 36px; font-size: 14px; color: var(--c-mute) !important; }
        ${P} .tb:hover { color: var(--c-ink) !important; }

        /* 收起：只留标题行 */
        ${P}.mini .tabs, ${P}.mini .body { display: none !important; }

        /* 拖滑块时：面板只剩正在拖的那一行，能直接看到效果 */
        ${P}.peek { background: transparent !important; border-color: transparent !important; overflow: visible !important; }
        ${P}.peek .hd, ${P}.peek .tabs, ${P}.peek .pane > *:not(.active), ${P}.peek .foot { visibility: hidden !important; }
        ${P}.peek .body { overflow: visible !important; }
        ${P}.peek .row.active {
            visibility: visible !important; border-top-color: transparent !important;
            background: var(--c-s0) !important; border-radius: 12px !important;
            box-shadow: 0 4px 16px rgba(0, 0, 0, .35) !important;
            padding: 10px 12px !important; margin: 0 -12px !important;
        }

        /* 放在面板样式最后：要压过上面按钮的 display */
        ${P} [hidden] { display: none !important; }

        /* 手机：贴在底部的抽屉，最多占屏幕 45%，上面能看到背景和聊天 */
        @media (max-width: 600px) {
            ${P} { border-radius: 16px !important; }
            ${P} .tabs { order: 4; border-bottom: none; border-top: 1px solid var(--c-line); padding-bottom: env(safe-area-inset-bottom, 0px); }
            ${P} .tabs span { padding: 13px 0; }
            ${P} .tabs span.on::after { bottom: auto; top: -1px; }
            ${P} .b, ${P} input[type=number] { min-height: 44px !important; height: 44px !important; }
            ${P} .seg span { padding: 9px 4px; }
        }

        /* 跳到的那一楼闪一下框，告诉你是哪条（没有酒馆自带跳转时才用） */
        #${ID.flash} {
            position: fixed; pointer-events: none; z-index: 999998;
            border: 2px solid #f2f2f7; border-radius: 12px;
            box-shadow: 0 0 0 4px rgba(242, 242, 247, .25);
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

    // 返回要用的图，以及面板上「现在用的图」那一行显示的两行字
    const pickImage = async () => {
        if (!inCharChat()) return null;
        const src = currentAvatarSrc();
        const ck = src ? charKeyOf(src) : null;

        if (cfg.source === 'custom') {
            if (ck) {
                const u = await customURL('char:' + ck);
                if (u) return { url: u, a: (await probe(u)).a, key: 'char:' + ck, title: '上传的图', sub: '只给当前角色' };
            }
            const g = await customURL('global');
            if (g) return { url: g, a: (await probe(g)).a, key: 'global', title: '上传的图', sub: '所有角色通用' };
        }

        if (!src) return null;
        const full = toFull(src);
        const d = await probe(full);
        if (d.ok) {
            return { url: full, a: d.a, key: null, title: '角色卡原图', sub: cfg.source === 'custom' ? '还没上传图，先用这张' : (ck || '') };
        }
        return { url: src, a: (await probe(src)).a, key: null, title: '头像缩略图', sub: '原图读不到，先用缩略图' };
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
    let cur = { url: '', a: 1, key: null, title: '', sub: '' };
    let curFit = 'cover';
    let lastFx = '';
    let token = 0;

    const panelEl = () => D.getElementById(ID.panel);
    const isOpen = () => { const p = panelEl(); return !!p && p.classList.contains('open'); };

    // 「背景」页最上面那一行：缩略图 + 现在用的是哪张
    const setNow = (title, sub, url) => {
        const p = panelEl();
        if (!p) return;
        const t1 = p.querySelector('.now .t1'), t2 = p.querySelector('.now .t2'), th = p.querySelector('.now .thumb');
        if (t1) t1.textContent = title || '';
        if (t2) t2.textContent = sub || '';
        if (th) th.style.backgroundImage = url ? `url("${url}")` : 'none';
        const del = p.querySelector('[data-act="delimg"]');
        if (del) del.hidden = !cur.key;
    };

    const styleCache = new WeakMap();
    const setStyle = (el, prop, val) => {
        let c = styleCache.get(el);
        if (!c) { c = {}; styleCache.set(el, c); }
        if (c[prop] === val) return;
        c[prop] = val;
        el.style.setProperty(prop, val, 'important');
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
        curFit = fit;
        setStyle(bg, 'background-size', fit);
        setStyle(bg, 'background-position', fit === 'cover' ? `center ${cfg.posY}%` : 'center center');
        setStyle(fill, 'display', fit === 'contain' && bg.style.display === 'block' ? 'block' : 'none');
        const row = D.querySelector(P + ' [data-row="posY"]');
        if (row) row.classList.toggle('off', fit === 'contain');
    };

    // 有的角色卡美化、插件会自己铺一张整屏的图，压在线粒体这层上面：这时这里调亮度、模糊都看不出变化。
    // 在屏幕上取几个点，看线粒体这层上面有没有整屏的图片，有就在面板里说出来是哪个元素
    const describeEl = (el) => {
        if (el.id) return '#' + el.id;
        const c = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
        return el.tagName.toLowerCase() + (c ? '.' + c : '');
    };
    const paintsPicture = (el) => {
        if (/^(IMG|VIDEO|CANVAS)$/.test(el.tagName)) return true;
        const cs = W.getComputedStyle(el);
        if (+cs.opacity < 0.9 || !/url\(/.test(cs.backgroundImage)) return false;
        // 平铺的小纹理（纸纹、噪点）不算，只算铺满的大图
        return /no-repeat/.test(cs.backgroundRepeat) || /cover|contain/.test(cs.backgroundSize);
    };
    const findCover = () => {
        if (bg.style.display !== 'block') return null;
        const vw = W.innerWidth, vh = W.innerHeight;
        const p = panelEl();
        // 背景层平时不接收点击，elementsFromPoint 会跳过它；量的这一下临时打开
        bg.style.setProperty('pointer-events', 'auto', 'important');
        try {
            for (const [fx0, fy0] of [[0.3, 0.35], [0.5, 0.5], [0.3, 0.7]]) {
                const stack = D.elementsFromPoint(vw * fx0, vh * fy0);
                const i = stack.indexOf(bg);
                for (const el of (i < 0 ? stack : stack.slice(0, i))) {
                    if (el === ball || el === bg || el === veil || el === fill || (p && p.contains(el))) continue;
                    const r = el.getBoundingClientRect();
                    if (r.width * r.height < vw * vh * 0.85) continue;
                    if (paintsPicture(el)) return el;
                    if (el.tagName === 'IFRAME') {
                        try {
                            const d = el.contentDocument;
                            if (d && (paintsPicture(d.documentElement) || (d.body && paintsPicture(d.body)))) return el;
                        } catch (e) {}
                    }
                }
            }
        } finally {
            bg.style.removeProperty('pointer-events');
        }
        return null;
    };
    const showCover = () => {
        const w = D.querySelector(P + ' .warn');
        if (!w) return;
        let el = null;
        try { el = cfg.enabled && cfg.tab !== 'jump' ? findCover() : null; } catch (e) {}
        w.hidden = !el;
        if (!el) return;
        const mes = el.closest && el.closest('#chat .mes[mesid]');
        const from = mes
            ? `来自 #${mes.getAttribute('mesid')} 楼的消息，多半是角色卡美化自带的背景`
            : `来自 ${describeEl(el)}，多半是美化或别的插件放的背景`;
        w.textContent = `线粒体的背景上面还盖着一张整屏的图，${from}。这里调的是下面那层，所以看不出变化；关掉那张图就能看到效果。`;
    };
    let coverTimer = null;
    const checkCoverSoon = () => {
        if (!isOpen()) return;
        clearTimeout(coverTimer);
        coverTimer = setTimeout(showCover, 300);
    };

    const apply = async () => {
        const my = ++token;
        try { updateFont(); } catch (err) { report('字体', err); }

        if (!cfg.enabled) {
            show(false);
            if (lastFx) { fx.textContent = ''; lastFx = ''; }
            setNow('背景已关闭', '打开上面的开关就会显示', '');
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
        // 酒馆默认把模糊加在整个聊天区 #chat 上，只去掉消息上的不够，背景照样糊
        if (cfg.noGlass) css += `#chat, #chat .mes, #chat .mes_block, #chat .mes_text { backdrop-filter: none !important; -webkit-backdrop-filter: none !important; }\n`;
        if (css !== lastFx) { fx.textContent = css; lastFx = css; }

        // 模糊就是单纯模糊，不放大图片
        setStyle(bg, 'filter', cfg.blur > 0 || cfg.bright !== 100 || cfg.sat !== 100
            ? `brightness(${cfg.bright}%) saturate(${cfg.sat}%) blur(${cfg.blur}px)` : 'none');
        setStyle(fill, 'filter', `brightness(${Math.round(cfg.bright * 0.6)}%) saturate(${cfg.sat}%) blur(28px)`);

        const pick = await pickImage();
        if (my !== token) return;
        if (!pick) {
            show(false);
            cur = { url: '', a: 1, key: null, title: '', sub: '' };
            setNow('没有图', inCharChat() ? '这个聊天里还没找到角色图' : '没打开角色，暂不显示背景', '');
            return;
        }

        if (pick.url !== cur.url) {
            setStyle(bg, 'background-image', `url("${pick.url}")`);
            setStyle(fill, 'background-image', `url("${pick.url}")`);
        }
        cur = pick;
        show(true);
        layout();
        setNow(pick.title, pick.sub, pick.url);
        checkCoverSoon();
    };

    let timer = null;
    const schedule = () => {
        clearTimeout(timer);
        timer = setTimeout(() => { apply().catch((err) => report('背景', err)); }, 250);
    };
    // 拖滑块时每一帧最多重算一次
    let applyFrame = 0;
    const applySoon = () => {
        if (applyFrame) return;
        applyFrame = W.requestAnimationFrame(() => { applyFrame = 0; apply().catch((err) => report('背景', err)); });
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

    // 酒馆自带的 /chat-jump：缺几楼一次加载几楼，再滚过去并高亮
    const nativeJump = (ctx) => {
        try {
            const cmds = ctx && ctx.SlashCommandParser && ctx.SlashCommandParser.commands;
            const run = ctx && (ctx.executeSlashCommandsWithOptions || ctx.executeSlashCommands);
            return cmds && cmds['chat-jump'] && run ? (n) => run.call(ctx, `/chat-jump ${n}`) : null;
        } catch (e) { return null; }
    };

    let jumping = false;
    const jumpTo = async (raw) => {
        if (jumping) return;
        const n = parseInt(String(raw).replace(/[^\d]/g, ''), 10);
        if (isNaN(n)) { setJump('先输入楼层号，比如 12'); return; }
        const last = lastMesId();
        if (last < 0) { setJump('当前没有打开的聊天'); return; }
        if (n > last) { setJump(`没有 #${n}，最新一楼是 #${last}`); return; }

        jumping = true;
        try {
            setJump('正在找…');
            const ctx = getCtx();
            const nat = nativeJump(ctx);
            if (nat) {
                await nat(n);
                let el = findMes(n);
                for (let i = 0; !el && i < 12; i++) { await sleep(150); el = findMes(n); }
                if (!el) { setJump(`没找到 #${n}，可能被删掉了`); return; }
                setJump(`已跳到 #${n}`);
                closePanel();
                return;
            }

            // 老版本酒馆没有 /chat-jump：一直点「显示更多消息」往前加载，直到出现
            let el = findMes(n);
            for (let i = 0; !el && i < 80; i++) {
                const more = D.getElementById('show_more_messages');
                if (!more) break;
                more.click();
                await sleep(250);
                el = findMes(n);
            }
            if (!el) { setJump(`没找到 #${n}，可能被删掉了`); return; }

            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            setJump(`已跳到 #${n}`);
            closePanel();
            await sleep(600);
            flashMes(el);
        } catch (err) {
            report('跳转', err);
        } finally {
            jumping = false;
        }
    };

    /* ---------- 设置面板 ---------- */
    const slider = (k, name, min, max, unit, sub) => `
        <div class="row" data-row="${k}">
            <div class="lab"><span>${name}</span><span class="val"><span data-v="${k}"></span>${unit}</span></div>
            ${sub ? `<span class="sub">${sub}</span>` : ''}
            <input type="range" data-k="${k}" min="${min}" max="${max}" aria-label="${name}">
        </div>`;

    const check = (k, name, sub) => `
        <label class="row sw"><span>${name}${sub ? `<span class="sub">${sub}</span>` : ''}</span><input type="checkbox" data-k="${k}"><i></i></label>`;

    const seg = (k, name, opts, sub, attrs) => `
        <div class="row" ${attrs || ''}>
            <div>${name}</div>
            <div class="seg" data-seg="${k}" role="radiogroup" aria-label="${name}">${opts.map(([v, t]) => `<span data-val="${v}" role="radio" tabindex="0">${t}</span>`).join('')}</div>
            ${sub ? `<span class="sub">${sub}</span>` : ''}
        </div>`;

    const syncPanel = () => {
        const p = panelEl();
        if (!p) return;
        p.querySelectorAll('[data-k]').forEach((el) => {
            const k = el.dataset.k;
            if (el.type === 'checkbox') el.checked = !!cfg[k];
            else if (String(el.value) !== String(cfg[k])) el.value = cfg[k];
        });
        p.querySelectorAll('[data-v]').forEach((el) => { el.textContent = cfg[el.dataset.v]; });
        p.querySelectorAll('[data-tab]').forEach((t) => {
            const on = t.dataset.tab === cfg.tab;
            t.classList.toggle('on', on);
            t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        p.querySelectorAll('[data-pane]').forEach((x) => x.classList.toggle('on', x.dataset.pane === cfg.tab));
        p.querySelectorAll('[data-seg]').forEach((box) => {
            box.querySelectorAll('[data-val]').forEach((s) => {
                const on = String(cfg[box.dataset.seg]) === s.dataset.val;
                s.classList.toggle('on', on);
                s.setAttribute('aria-checked', on ? 'true' : 'false');
            });
        });
        // 只在选了「上传的图」时显示上传相关的设置
        p.querySelectorAll('[data-when-custom]').forEach((el) => { el.hidden = cfg.source !== 'custom'; });
        const foot = p.querySelector('.foot');
        if (foot) foot.hidden = cfg.tab === 'jump';
        const warn = p.querySelector('.warn');
        if (warn && cfg.tab === 'jump') warn.hidden = true;
        else if (warn) checkCoverSoon();
        const row = p.querySelector('[data-row="posY"]');
        if (row) row.classList.toggle('off', curFit === 'contain');
    };

    const onFile = async (file) => {
        if (!file) return;
        const src = currentAvatarSrc();
        const ck = src ? charKeyOf(src) : null;
        const k = cfg.uploadScope === 'char' && ck ? 'char:' + ck : 'global';
        setNow('正在处理图片…', '', '');
        const blob = await compress(file);
        try {
            await idbSet(k, blob);
        } catch (e) {
            setNow('没存上', '浏览器不允许存图片，换个浏览器或关掉无痕模式再试', '');
            return;
        }
        dropURL(k);
        cfg.source = 'custom';
        save();
        syncPanel();
        apply();
    };

    // 可以点的元素都用 role=button / tab / radio，回车和空格也能点
    const btn = (act, text, cls, extra) => `<span class="${cls}" data-act="${act}" role="button" tabindex="0"${extra || ''}>${text}</span>`;

    const initPanel = () => {
        if (panelEl()) return;
        const p = D.createElement('div');
        p.id = ID.panel;
        p.setAttribute('role', 'dialog');
        p.setAttribute('aria-label', '线粒体');
        p.innerHTML = `
            <div class="hd">
                <span class="mk">${mark(2.4, 2)}</span><span class="nm" title="版本 ${VERSION}">线粒体</span>
                <span class="sp"></span>
                ${btn('mini', '收起', 'ib')}
                ${btn('close', '✕', 'ib x', ' aria-label="关闭"')}
            </div>

            <div class="tabs" role="tablist">
                <span data-tab="jump" role="tab" tabindex="0">跳转</span>
                <span data-tab="bg" role="tab" tabindex="0">背景</span>
                <span data-tab="text" role="tab" tabindex="0">文字</span>
                <span data-tab="img" role="tab" tabindex="0">图片</span>
            </div>

            <div class="body">
                <div class="warn" role="status" hidden></div>
                <div class="pane" data-pane="jump">
                    <div class="row">
                        <div class="jump">
                            <input type="number" inputmode="numeric" min="0" placeholder="楼层号" aria-label="楼层号" data-jump>
                            ${btn('jump', '跳转', 'b go')}
                            ${btn('jumplast', '最新', 'b')}
                        </div>
                        <div class="jstatus" aria-live="polite"></div>
                    </div>
                    ${check('ball', '显示悬浮球', '按住拖到别处，点一下打开这个面板')}
                </div>

                <div class="pane" data-pane="bg">
                    ${check('enabled', '显示背景')}
                    <div class="row now"><div class="thumb"></div><div><div class="t1"></div><span class="sub t2"></span></div></div>
                    ${seg('source', '用哪张图', [['card', '角色卡原图'], ['custom', '上传的图']])}
                    ${seg('uploadScope', '上传给', [['char', '当前角色'], ['global', '所有角色']], '', 'data-when-custom')}
                    <div class="btns" data-when-custom>
                        <label class="b" role="button" tabindex="0">上传图片<input type="file" accept="image/*"></label>
                        ${btn('delimg', '删除这张', 'b', ' hidden')}
                    </div>
                </div>

                <div class="pane" data-pane="text">
                    ${slider('protect', '文字保护', 0, 80, '%')}
                    ${seg('veilMode', '遮罩颜色', [['auto', '自动'], ['dark', '压暗'], ['light', '提亮']], '自动：浅色字压暗，深色字提亮')}
                    ${check('shadow', '正文描边')}
                    ${check('noGlass', '去掉聊天毛玻璃', '不去掉的话，背景会被磨糊')}
                </div>

                <div class="pane" data-pane="img">
                    ${seg('fit', '填充', [['auto', '自动'], ['cover', '铺满'], ['contain', '完整']], '自动：横屏配竖图时完整显示，其余铺满')}
                    ${slider('posY', '上下位置', 0, 100, '%', '0 是图片顶部')}
                    ${slider('bright', '亮度', 30, 150, '%')}
                    ${slider('sat', '饱和度', 0, 200, '%')}
                    ${slider('blur', '模糊', 0, 20, 'px')}
                    <div class="btns">${btn('refresh', '重新读取图片', 'b')}</div>
                </div>

                <div class="foot">${btn('reset', '恢复默认设置', 'tb')}</div>
            </div>
        `;
        // 挂在 <html> 下而不是 <body> 里：美化给 body 加的滤镜/变形不会再把面板带歪，body 里的通用样式也管不到它
        D.documentElement.appendChild(p);
        syncPanel();

        // 酒馆点到抽屉外面会收起打开着的抽屉；在面板里点不该影响它
        ['mousedown', 'touchstart'].forEach((t) => p.addEventListener(t, (e) => e.stopPropagation()));

        const endPeek = () => {
            p.classList.remove('peek');
            p.querySelectorAll('.row.active').forEach((r) => r.classList.remove('active'));
        };
        p.addEventListener('pointerdown', (e) => {
            if (e.target.type !== 'range') return;
            const row = e.target.closest('.row');
            if (row) row.classList.add('active');
            p.classList.add('peek');
        });
        p.addEventListener('pointerup', endPeek);
        p.addEventListener('pointercancel', endPeek);
        p.addEventListener('lostpointercapture', endPeek);

        p.addEventListener('keydown', (e) => {
            const t = e.target;
            if (t.hasAttribute && t.hasAttribute('data-jump') && e.key === 'Enter') {
                e.preventDefault();
                jumpTo(t.value);
                return;
            }
            if (e.key === 'Escape') { e.preventDefault(); closePanel(); return; }
            // 键盘：回车 / 空格 = 点一下
            if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('[role=button],[role=tab],[role=radio]')) {
                e.preventDefault();
                if (t.tagName === 'LABEL') { const f = t.querySelector('input[type=file]'); if (f) f.click(); }
                else t.click();
            }
        });

        const onInput = (e) => {
            const el = e.target;
            if (el.type === 'file' || el.hasAttribute('data-jump')) return;
            const k = el.dataset && el.dataset.k;
            if (!k) return;
            cfg[k] = el.type === 'checkbox' ? el.checked : +el.value;
            save();
            if (k === 'ball') { syncPanel(); updateBall(); dodgeBall(); return; }
            if (el.type === 'range') {
                const v = p.querySelector(`[data-v="${k}"]`);
                if (v) v.textContent = cfg[k];
                applySoon();
                return;
            }
            syncPanel();
            apply();
        };
        p.addEventListener('input', onInput);
        p.addEventListener('change', (e) => {
            if (e.target.type === 'file') {
                onFile(e.target.files && e.target.files[0]);
                e.target.value = '';
                return;
            }
            if (e.target.type === 'range') { endPeek(); return; }
            onInput(e);
        });

        let undoSnap = null, undoTimer = null;
        p.addEventListener('click', async (e) => {
            // 刚打开的一瞬间不响应：点球的那一下可能落到面板上（球挪开后手指下面就是面板）
            if (Date.now() - lastOpen < 400) return;
            const t = e.target.closest ? e.target.closest('[data-tab],[data-val],[data-act]') : e.target;
            if (!t) return;
            if (t.dataset.tab) {
                cfg.tab = t.dataset.tab;
                save(); syncPanel(); placePanel();
                return;
            }
            const segBox = t.closest('[data-seg]');
            if (segBox && t.dataset.val) {
                cfg[segBox.dataset.seg] = t.dataset.val;
                save(); syncPanel(); apply();
                if (segBox.dataset.seg === 'source') placePanel();
                return;
            }
            const act = t.dataset.act;
            if (act === 'close') closePanel();
            if (act === 'mini') {
                const m = p.classList.toggle('mini');
                t.textContent = m ? '展开' : '收起';
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
                // 点错了：4 秒内再点一下就回到恢复之前
                if (undoSnap) {
                    Object.assign(cfg, undoSnap);
                    undoSnap = null; clearTimeout(undoTimer);
                    t.textContent = '恢复默认设置';
                    save(); syncPanel(); apply();
                    return;
                }
                undoSnap = Object.assign({}, cfg);
                // 只恢复背景效果；悬浮球的开关和位置、当前标签页保留
                const keep = { ball: cfg.ball, ballX: cfg.ballX, ballY: cfg.ballY, tab: cfg.tab };
                Object.assign(cfg, DEF, keep); save(); syncPanel(); apply();
                t.textContent = '已恢复默认，点这里撤销';
                undoTimer = setTimeout(() => { undoSnap = null; t.textContent = '恢复默认设置'; }, 4000);
            }
            if (act === 'delimg') {
                if (!cur.key) return;
                try { await idbDel(cur.key); } catch (err) {}
                dropURL(cur.key);
                cur.url = '';
                apply();
            }
        });
    };

    // 面板位置用 JS 按「屏幕上实际看到的位置」来摆：
    // 先放到 0,0 量一下实际落在屏幕哪里，再把差值补上。
    // 这样不管美化给页面加了什么滤镜/变形（酒馆自己就给 html 加了 transform），面板都一定出现在屏幕里。
    const placePanel = () => {
        const p = panelEl();
        if (!p || !isOpen()) return;
        const set = (k, v) => p.style.setProperty(k, v, 'important');
        const vv = W.visualViewport;
        const vw = W.innerWidth;
        const vh = vv ? vv.height : W.innerHeight;   // 弹出键盘时只算键盘上面那块
        const vt = vv ? vv.offsetTop : 0;
        const mobile = vw <= 600;
        const topBar = parseFloat(W.getComputedStyle(D.documentElement).getPropertyValue('--topBarBlockSize')) || 50;

        const w = mobile ? vw - 16 : Math.min(300, vw - 20);
        set('width', w + 'px');
        set('max-height', Math.max(180, Math.round(mobile ? vh * 0.45 : vh - topBar - 30)) + 'px');
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
        const p = panelEl();
        if (!cfg.ball || !p || !isOpen()) return;
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
        const p = panelEl();
        if (p) {
            p.classList.remove('open', 'peek');
            // 焦点还在面板里的话，手机键盘会一直开着
            const a = D.activeElement;
            if (a && p.contains(a) && a.blur) a.blur();
        }
        if (cfg.ball) placeBall();
    };

    let lastToggle = 0, lastOpen = 0, openGuard = null;
    const togglePanel = (forJump) => {
        try { togglePanelInner(forJump); lastToggle = Date.now(); }
        catch (err) { report('打开面板', err); }
    };
    const togglePanelInner = (forJump) => {
        initPanel();
        const p = panelEl();
        if (isOpen()) { closePanel(); return; }
        p.classList.add('open');
        p.classList.remove('mini', 'peek');
        lastOpen = Date.now();
        syncPanel();
        setNow(cur.title, cur.sub, cur.url);
        setJump('');
        try { updateFont(); } catch (err) { report('字体', err); }
        const mb = p.querySelector('[data-act="mini"]');
        if (mb) mb.textContent = '收起';
        const body = p.querySelector('.body');
        if (body) body.scrollTop = 0;
        placePanel();
        apply().catch((err) => report('背景', err));
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
    };

    /* ---------- 悬浮球 ---------- */
    const BALL = 44;
    const ball = D.createElement('div');
    ball.id = ID.ball;
    ball.innerHTML = mark(2, 1.6);
    ball.title = '线粒体（按住拖动）';
    ball.setAttribute('role', 'button');
    ball.setAttribute('aria-label', '打开线粒体');
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
    // 酒馆在页面上监听按下事件来收起抽屉；拖球、点球都不该让它收起
    ['mousedown', 'touchstart'].forEach((t) => ball.addEventListener(t, (e) => e.stopPropagation()));
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
    let lastDragEnd = 0;
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
        const es = ctx && ctx.eventSource, et = ctx && (ctx.eventTypes || ctx.event_types);
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

    // 点面板外面就收起（「收起」状态下不收，方便边看边对比）
    const onOutside = (e) => {
        const p = panelEl();
        const b = D.getElementById(ID.btn);
        if (!p || !isOpen() || p.classList.contains('mini')) return;
        if (ball.contains(e.target)) return;
        if (p.contains(e.target) || (b && b.contains(e.target))) return;
        closePanel();
    };
    D.addEventListener('pointerdown', onOutside, true);

    // 魔棒菜单入口：照酒馆扩展的标准写法，图标和名字分开放，才会和上面几项对齐
    const addMenuEntry = () => {
        const menu = D.getElementById('extensionsMenu');
        if (!menu || D.getElementById(ID.btn)) return;
        const box = D.createElement('div');
        box.id = ID.btn;
        box.className = 'extension_container';
        box.innerHTML = `<div class="list-group-item flex-container flexGap5 interactable" tabindex="0" role="listitem">
            <div class="extensionsMenuExtensionButton">${mark(2.6, 2.2)}</div><span>线粒体</span></div>`;
        const item = box.firstElementChild;
        item.addEventListener('click', () => togglePanel(true));
        item.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); togglePanel(true); }
        });
        menu.appendChild(box);
    };
    addMenuEntry();
    const menuTimer = setInterval(addMenuEntry, 1500);

    W.__cbg2 = {
        token: TOKEN,
        version: VERSION,
        destroy() {
            observer.disconnect();
            offEvents();
            if (raf) W.cancelAnimationFrame(raf);
            if (applyFrame) W.cancelAnimationFrame(applyFrame);
            clearInterval(menuTimer);
            clearTimeout(timer);
            clearTimeout(rt);
            clearTimeout(openGuard);
            clearTimeout(coverTimer);
            W.removeEventListener('resize', onResize);
            if (vvp) vvp.removeEventListener('resize', onResize);
            D.removeEventListener('pointerdown', onOutside, true);
            if (mq.removeEventListener) mq.removeEventListener('change', schedule);
            else if (mq.removeListener) mq.removeListener(schedule);
            Object.keys(urlCache).forEach(dropURL);
            Object.values(ID).forEach((id) => { const el = D.getElementById(id); if (el) el.remove(); });
            if (W.__cbg2 && W.__cbg2.token === TOKEN) delete W.__cbg2;
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

// 在酒馆助手里关掉这个脚本时（小窗口被卸载），把背景、悬浮球、菜单项一起收掉，不用刷新页面。
// 脚本重新运行时会先装好新的一份，旧窗口卸载时这里认出不是自己那份，就不会误删。
window.addEventListener('pagehide', () => {
    try { if (host.__cbg2 && host.__cbg2.token === token) host.__cbg2.destroy(); } catch (e) {}
});
})();
