// 网易云播放器 —— 启动时只运行这个文件：注册菜单项、监听生成事件、
// 显示常驻入口（悬浮胶囊或迷你播放条）、在扩展设置面板里加一个条目。不发任何网络请求。
// 播放逻辑（engine.js）和界面（panel.js）在用户点开后才加载。

const API_BASE = '/api/plugins/netease-player/';
const KEYS = {
    now: 'nep:v1:now',
    queue: 'nep:v1:queue',
    settings: 'nep:v1:settings',
    log: 'nep:v1:log',
    silent: 'nep:v1:silent',
    floatPos: 'nep:v1:float-pos',
    dismissed: 'nep:v1:dismissed',
};
const DEFAULT_SETTINGS = {
    skipTrial: true,
    statusMinutes: 3,
    autoResume: true,
    level: 'standard',
    entry: 'float', // float 悬浮胶囊 | bar 输入框上方的迷你播放条 | off 只从魔法棒菜单或扩展设置打开
    glass: 'auto', // auto 跟随主题 | light 浅色玻璃 | dark 深色玻璃
};

// ---------- localStorage（读写都可能抛错） ----------

export const store = {
    get(key, fallback = null) {
        try {
            const raw = localStorage.getItem(key);
            return raw == null ? fallback : JSON.parse(raw);
        } catch {
            return fallback;
        }
    },
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
        } catch {
            // 存储不可用时只是记不住状态
        }
    },
    remove(key) {
        try {
            localStorage.removeItem(key);
        } catch {
            // 同上
        }
    },
};

export const settings = { ...DEFAULT_SETTINGS, ...(store.get(KEYS.settings) || {}) };

export function saveSettings() {
    store.set(KEYS.settings, settings);
}

// ---------- 事件日志（用来在 iPhone 上确认事件到底有没有触发） ----------

// 只留最近 10 条
const LOG_LIMIT = 10;
const logEntries = (store.get(KEYS.log, []) || []).slice(-LOG_LIMIT);
let logSaveTimer = null;

export function log(name, detail = '') {
    logEntries.push({ t: Date.now(), name, detail: String(detail || '') });
    if (logEntries.length > LOG_LIMIT) {
        logEntries.splice(0, logEntries.length - LOG_LIMIT);
    }
    if (!logSaveTimer) {
        logSaveTimer = setTimeout(() => {
            logSaveTimer = null;
            store.set(KEYS.log, logEntries);
        }, 2000);
    }
}

export function getLog() {
    return logEntries.slice();
}

export function clearLog() {
    logEntries.length = 0;
    store.remove(KEYS.log);
}

// ---------- 请求服务端插件 ----------

export async function api(path, body = {}) {
    const { getRequestHeaders } = SillyTavern.getContext();
    let res;
    try {
        res = await fetch(API_BASE + path, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(body),
        });
    } catch (error) {
        throw new Error(`连不上酒馆服务器：${error?.message || error}`);
    }
    if (res.status === 404) throw new Error('服务端插件没有加载（404），请检查安装');
    if (res.status === 403 || res.status === 401) throw new Error('酒馆登录已失效，请刷新页面');
    if (!res.ok) throw new Error(`请求失败（HTTP ${res.status}）`);
    const data = await res.json();
    if (!data.ok) {
        const error = new Error(data.error || '请求失败');
        error.needLogin = !!data.needLogin;
        throw error;
    }
    return data;
}

// ---------- 唯一的 <audio> 元素 ----------

let audio = null;
let silenceUrl = null;
let unlocked = false;

export function getAudio() {
    if (!audio) {
        audio = document.createElement('audio');
        audio.id = 'nep-audio';
        audio.preload = 'auto';
        audio.setAttribute('playsinline', '');
        audio.setAttribute('webkit-playsinline', '');
        document.body.appendChild(audio);
    }
    return audio;
}

// 1 秒的静音 WAV，在本地生成，不用请求文件
function getSilenceUrl() {
    if (!silenceUrl) {
        const rate = 8000;
        const n = rate;
        const buf = new ArrayBuffer(44 + n);
        const v = new DataView(buf);
        const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE');
        w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
        w(36, 'data'); v.setUint32(40, n, true);
        new Uint8Array(buf, 44).fill(128);
        silenceUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    }
    return silenceUrl;
}

export function isSilence() {
    return !!audio && audio.dataset.silent === '1';
}

/** 播放静音：切歌取地址的空档里、或者开着「静音播放」时，保持页面不被挂起。 */
export function playSilence() {
    const a = getAudio();
    if (isSilence() && !a.paused) return;
    a.dataset.silent = '1';
    a.loop = true;
    a.src = getSilenceUrl();
    a.play().catch(() => { });
}

/**
 * 必须在用户点击的同步流程里调用：iOS 只允许用户手势触发第一次播放，
 * 之后同一个元素换 src 再 play() 就不用手势了。
 */
export function unlock() {
    if (unlocked) return;
    unlocked = true;
    playSilence();
}

export function isUnlocked() {
    return unlocked;
}

// ---------- 生成状态（显示在锁屏的副标题上） ----------

export const gen = {
    state: 'idle',
    label: null,
    lastEventAt: 0,
    listeners: new Set(),
};

let genGotMessage = false;
let genEndTimer = null;
let genRevertTimer = null;

function notifyGen() {
    for (const fn of gen.listeners) {
        try {
            fn();
        } catch (error) {
            console.error('[netease-player]', error);
        }
    }
    miniBar.render();
}

function setGenLabel(label, revertMs = 0) {
    gen.label = label;
    clearTimeout(genRevertTimer);
    if (label && revertMs > 0) {
        genRevertTimer = setTimeout(() => setGenLabel(null), revertMs);
    }
    notifyGen();
}

function genStart(source) {
    gen.lastEventAt = Date.now();
    clearTimeout(genEndTimer);
    if (gen.state === 'generating') return;
    gen.state = 'generating';
    genGotMessage = false;
    log('开始生成', source);
    setGenLabel('酒馆 · 正在生成…');
}

function genFinish(kind) {
    gen.lastEventAt = Date.now();
    clearTimeout(genEndTimer);
    if (gen.state === 'idle') return;
    gen.state = 'idle';
    const labels = {
        done: '酒馆 · 回复已完成',
        stopped: '酒馆 · 已停止生成',
        ended: '酒馆 · 生成已结束',
    };
    const visible = document.visibilityState === 'visible';
    const revertMs = visible ? 8000 : Math.max(1, Number(settings.statusMinutes) || 3) * 60 * 1000;
    log('生成结束', kind);
    setGenLabel(labels[kind] || labels.ended, revertMs);
}

/** 最近一段时间内有没有生成相关的动静（用于判断音乐是不是被提示音打断）。 */
export function genRecentlyActive(ms) {
    return gen.state === 'generating' || Date.now() - gen.lastEventAt < ms;
}

function bindGenerationEvents() {
    const { eventSource, eventTypes } = SillyTavern.getContext();
    const ignoredTypes = new Set(['quiet']);

    eventSource.on(eventTypes.GENERATION_STARTED, (type, _options, dryRun) => {
        if (dryRun || ignoredTypes.has(type)) return;
        genStart(`事件 ${type || 'normal'}`);
    });

    let tokenLogged = false;
    eventSource.on(eventTypes.STREAM_TOKEN_RECEIVED, () => {
        gen.lastEventAt = Date.now();
        if (gen.state !== 'generating') {
            tokenLogged = false;
            return;
        }
        if (!tokenLogged) {
            tokenLogged = true;
            log('收到流式 token');
        }
    });

    eventSource.on(eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
        if (type === 'impersonate' || type === 'first_message') return;
        log('新消息', `#${messageId} ${type || ''}`);
        tokenLogged = false;
        if (gen.state === 'generating' || Date.now() - gen.lastEventAt < 5000) {
            genGotMessage = true;
            gen.state = 'generating';
            genFinish('done');
        }
    });

    eventSource.on(eventTypes.GENERATION_ENDED, () => {
        log('事件 generation_ended');
        if (gen.state !== 'generating') return;
        // 流式生成时 ENDED 会早于 MESSAGE_RECEIVED，稍等一下再判断
        clearTimeout(genEndTimer);
        genEndTimer = setTimeout(() => {
            if (gen.state === 'generating') genFinish(genGotMessage ? 'done' : 'ended');
        }, 2000);
    });

    eventSource.on(eventTypes.GENERATION_STOPPED, () => {
        log('事件 generation_stopped');
        genFinish('stopped');
    });

    // 备用信号：酒馆在生成期间会给 body 加 data-generating
    new MutationObserver(() => {
        const generating = document.body.dataset.generating === 'true';
        if (generating && gen.state === 'idle') {
            genStart('界面状态');
        } else if (!generating && gen.state === 'generating') {
            clearTimeout(genEndTimer);
            genEndTimer = setTimeout(() => {
                if (gen.state === 'generating' && document.body.dataset.generating !== 'true') {
                    genFinish(genGotMessage ? 'done' : 'ended');
                }
            }, 4000);
        }
    }).observe(document.body, { attributes: true, attributeFilter: ['data-generating'] });

    document.addEventListener('visibilitychange', () => {
        log(document.visibilityState === 'visible' ? '回到页面' : '离开页面');
        if (document.visibilityState === 'visible' && gen.label && gen.state === 'idle') {
            setGenLabel(gen.label, 3000);
        }
    });
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) log('页面从缓存恢复');
    });
}

// ---------- 懒加载 ----------

let enginePromise = null;
let panelPromise = null;
let engineModule = null;

export function loadEngine() {
    if (!enginePromise) {
        enginePromise = import('./engine.js').then((m) => {
            m.init();
            engineModule = m;
            return m;
        });
        enginePromise.catch(() => {
            enginePromise = null;
        });
    }
    return enginePromise;
}

export function loadPanel() {
    if (!panelPromise) {
        panelPromise = Promise.all([loadEngine(), import('./panel.js')]).then(([, m]) => m);
        panelPromise.catch(() => {
            panelPromise = null;
        });
    }
    return panelPromise;
}

function reportLoadError(error) {
    console.error('[netease-player]', error);
    globalThis.toastr?.error(`播放器加载失败：${error?.message || error}`);
}

let panelModule = null;

export async function openPanel() {
    miniBar.show();
    try {
        const panel = await loadPanel();
        panelModule = panel;
        panel.open();
        miniBar.setAway(true);
    } catch (error) {
        reportLoadError(error);
    }
}

// ---------- 液态玻璃配色 ----------

// 悬浮胶囊、迷你播放条和展开面板共用。不跟主题的透明底色走（透明主题下看不清字），
// 按主题文字颜色判断深浅：文字深 → 浅色玻璃，文字浅 → 深色玻璃；设置里可以手动指定。
// 不用 backdrop-filter：iPhone 上固定在聊天记录上方的毛玻璃，每滑一帧都要重新模糊，整页会卡。
// 底色接近不透明，玻璃感来自顶部高光、边缘反光和投影。
const CSS = `
#nep-float,#nep-bar,#nep-panel{
--nep-glass:rgba(250,250,252,.96);--nep-sheen:rgba(255,255,255,.85);--nep-rim:rgba(255,255,255,1);--nep-rim-2:rgba(255,255,255,.35);
--nep-ink:#1d1d1f;--nep-ink-2:rgba(60,60,67,.66);--nep-raise:rgba(118,118,128,.12);--nep-raise-2:rgba(118,118,128,.2);
--nep-raise-3:rgba(118,118,128,.3);--nep-seg:#fff;--nep-paper:#fff;--nep-accent:#d33a31;--nep-on-accent:#fff;
--nep-tint:#fbe9e7;--nep-tint-2:#f6d3cf;--nep-tint-ink:#8a1f19;--nep-ok:#1d8a3a;--nep-busy:#b35c00;
--nep-shadow:0 12px 32px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.08);--nep-spring:cubic-bezier(.32,1.28,.48,1);
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
-webkit-font-smoothing:antialiased}
:root[data-nep-glass=dark] #nep-float,:root[data-nep-glass=dark] #nep-bar,:root[data-nep-glass=dark] #nep-panel{
--nep-glass:rgba(34,34,36,.96);--nep-sheen:rgba(255,255,255,.13);--nep-rim:rgba(255,255,255,.42);--nep-rim-2:rgba(255,255,255,.08);
--nep-ink:#fff;--nep-ink-2:rgba(235,235,245,.62);--nep-raise:rgba(118,118,128,.24);--nep-raise-2:rgba(118,118,128,.34);
--nep-raise-3:rgba(118,118,128,.46);--nep-seg:rgba(99,99,102,.95);--nep-paper:#2c2c2e;--nep-accent:#ff5c52;--nep-on-accent:#fff;
--nep-tint:rgba(255,92,82,.14);--nep-tint-2:rgba(255,92,82,.24);--nep-tint-ink:#ffb4ae;--nep-ok:#30d158;--nep-busy:#ff9f0a;
--nep-shadow:0 12px 32px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.25)}
/* 液态玻璃的顶部高光与边缘反光是用户指定的样式 */
.nep-glass{color:var(--nep-ink);/* taste-skill-ignore: 玻璃高光 */background:linear-gradient(180deg,var(--nep-sheen),rgba(255,255,255,0) 60%),var(--nep-glass);
box-shadow:inset 0 1px 0 var(--nep-rim),inset 0 -1px 0 var(--nep-rim-2),var(--nep-shadow)}
.nep-glass::before{content:"";position:absolute;inset:0;z-index:0;padding:1px;border-radius:inherit;pointer-events:none;
/* taste-skill-ignore: 玻璃边缘反光 */background:linear-gradient(135deg,var(--nep-rim),var(--nep-rim-2) 32%,rgba(255,255,255,0) 50%,var(--nep-rim-2) 70%,var(--nep-rim));
/* taste-skill-ignore: 玻璃边缘反光 */-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
/* taste-skill-ignore: 玻璃边缘反光 */mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
#nep-panel{--nep-glass:#f7f7f9}
:root[data-nep-glass=dark] #nep-panel{--nep-glass:#222224}
#nep-bar[hidden],#nep-float[hidden]{display:none!important}
.nep-art{flex:none;position:relative;display:grid;place-items:center;overflow:hidden;background:var(--nep-raise-2);color:var(--nep-ink-2)}
.nep-art img{display:none;width:100%;height:100%;object-fit:cover}
.nep-art.nep-has-img img{display:block}
.nep-art.nep-has-img i{display:none}
[data-nep-tone=gen]{color:var(--nep-busy)!important}
[data-nep-tone=done]{color:var(--nep-ok)!important}
[data-nep-tone]::before{content:"";display:inline-block;width:6px;height:6px;margin:0 5px 1px 0;border-radius:50%;
background:currentColor;vertical-align:middle}
[data-nep-tone=gen]::before{animation:nep-pulse 1.2s ease-in-out infinite}
@keyframes nep-pulse{50%{opacity:.25}}

#nep-float{position:fixed;z-index:2910;left:0;top:0;display:flex;align-items:center;gap:8px;max-width:min(230px,66vw);
box-sizing:border-box;padding:4px 4px 4px 5px;border-radius:24px;font-size:13px;line-height:1.25;white-space:nowrap;
will-change:transform;contain:layout style;transition:opacity .25s ease;
touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#nep-float.nep-away{opacity:0;pointer-events:none}
#nep-float.nep-dragging{opacity:.8}
#nep-float>*{position:relative;z-index:1}
#nep-float .nep-info{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer;outline:0}
#nep-float .nep-art{width:30px;height:30px;border-radius:50%;font-size:12px}
#nep-float .nep-text{min-width:0;max-width:10.5em}
#nep-float .nep-title,#nep-float .nep-sub{overflow:hidden;text-overflow:ellipsis}
#nep-float .nep-title{font-weight:600}
#nep-float .nep-sub{font-size:11.5px;color:var(--nep-ink-2)}
#nep-float button{flex:none;width:34px;height:34px;border:0;border-radius:50%;padding:0;background:transparent;color:inherit;
font-size:14px;cursor:pointer;display:grid;place-items:center;-webkit-tap-highlight-color:transparent}
#nep-float button:active{background:var(--nep-raise-2)}
#nep-float button:focus-visible,#nep-float .nep-info:focus-visible{outline:2px solid var(--nep-accent);outline-offset:1px;border-radius:17px}

#nep-bar{position:relative;display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin:0 0 4px;
padding:3px 4px 3px 5px;border-radius:22px;font-size:14px;white-space:nowrap}
#nep-bar>*{position:relative;z-index:1}
#nep-bar .nep-art{width:30px;height:30px;border-radius:50%;font-size:12px}
#nep-bar .nep-info{flex:1;min-width:0;overflow:hidden;line-height:1.25;cursor:pointer}
#nep-bar .nep-title,#nep-bar .nep-sub{overflow:hidden;text-overflow:ellipsis}
#nep-bar .nep-title{font-weight:600}
#nep-bar .nep-sub{color:var(--nep-ink-2);font-size:12px}
#nep-bar button{flex:none;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;
font-size:15px;cursor:pointer;-webkit-tap-highlight-color:transparent}
#nep-bar button:active{background:var(--nep-raise-2)}
#nep-bar .nep-resume{width:auto;padding:0 14px;border-radius:18px;background:var(--nep-raise-2);font:600 13px/1 inherit}
@media (prefers-reduced-motion:reduce){[data-nep-tone=gen]::before{animation:none}}
`;

// 默认在顶栏下方居中；y 为 null 表示「贴着顶栏」，按顶栏实际高度算
const FLOAT_MARGIN = 6;
const FLOAT_DEFAULT_POS = { x: 0.5, y: null };
const ART = '<span class="nep-art"><img alt=""><i class="fa-solid fa-music"></i></span>';

// 播放类按钮：播放逻辑已加载就同步调用（保持在用户手势里）；
// 没加载时先同步解锁音频，再去加载
const withEngine = (fn) => () => {
    if (engineModule) {
        fn(engineModule);
        return;
    }
    unlock();
    loadEngine().then(fn).catch(reportLoadError);
};

function injectStyle() {
    if (document.getElementById('nep-style')) return;
    const style = document.createElement('style');
    style.id = 'nep-style';
    style.textContent = CSS;
    document.head.appendChild(style);
}

/** 主题文字颜色的亮度（0 暗 ~ 1 亮）；取不到时按深色主题处理。 */
function themeInkLuminance() {
    const probe = document.createElement('span');
    probe.style.cssText = 'position:absolute;visibility:hidden;color:var(--SmartThemeBodyColor)';
    document.body.appendChild(probe);
    const m = getComputedStyle(probe).color.match(/[\d.]+/g);
    probe.remove();
    if (!m || m.length < 3) return 1;
    const [r, g, b] = m.slice(0, 3).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** 按设置或主题决定浅色 / 深色玻璃，写在 <html data-nep-glass>。 */
export function applyGlass() {
    const mode = settings.glass === 'light' || settings.glass === 'dark'
        ? settings.glass
        : (themeInkLuminance() < 0.5 ? 'light' : 'dark');
    if (document.documentElement.dataset.nepGlass !== mode) document.documentElement.dataset.nepGlass = mode;
}

function watchTheme() {
    // 酒馆换主题时改的是 <html> / <body> 上的样式变量和 class，合并到下一帧只判断一次
    let frame = 0;
    const recheck = () => {
        if (frame || (settings.glass && settings.glass !== 'auto')) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            applyGlass();
        });
    };
    const observer = new MutationObserver(recheck);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
    observer.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
}

function createBar() {
    const el = document.createElement('div');
    el.id = 'nep-bar';
    el.className = 'nep-glass';
    el.hidden = true;
    el.innerHTML = `${ART}
        <div class="nep-info" title="展开播放器"><div class="nep-title"></div><div class="nep-sub"></div></div>
        <button type="button" class="nep-resume" hidden>继续播放</button>
        <button type="button" class="nep-play" aria-label="播放/暂停"><i class="nep-glyph fa-solid fa-play"></i></button>
        <button type="button" class="nep-next" aria-label="下一首"><i class="fa-solid fa-forward-step"></i></button>
        <button type="button" class="nep-open" aria-label="展开播放器"><i class="fa-solid fa-chevron-up"></i></button>`;
    const form = document.getElementById('send_form');
    if (form?.parentElement) {
        form.parentElement.insertBefore(el, form);
    } else {
        document.body.appendChild(el);
    }
    el.querySelector('.nep-play').addEventListener('click', withEngine(e => e.toggle()));
    el.querySelector('.nep-resume').addEventListener('click', withEngine(e => e.resume()));
    el.querySelector('.nep-next').addEventListener('click', withEngine(e => e.next()));
    el.querySelector('.nep-open').addEventListener('click', () => openPanel());
    el.querySelector('.nep-info').addEventListener('click', () => openPanel());
    return el;
}

function createFloat() {
    const el = document.createElement('div');
    el.id = 'nep-float';
    el.className = 'nep-glass';
    el.hidden = true;
    el.innerHTML = `
        <div class="nep-info" role="button" tabindex="0" aria-label="打开播放器（按住可拖动）">
            ${ART}<div class="nep-text"><div class="nep-title"></div><div class="nep-sub"></div></div>
        </div>
        <button type="button" class="nep-play" aria-label="播放/暂停"><i class="nep-glyph fa-solid fa-play"></i></button>`;
    document.body.appendChild(el);
    el.querySelector('.nep-play').addEventListener('click', withEngine(e => e.toggle()));
    const info = el.querySelector('.nep-info');
    info.addEventListener('click', () => openPanel());
    info.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        openPanel();
    });
    bindDrag(el);
    // iOS 滑动时地址栏收起也会触发 resize，合并到下一帧只算一次
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            placeFloat(el);
        });
    });
    return el;
}

let floatPos = null;

function savedFloatPos() {
    floatPos ??= store.get(KEYS.floatPos) || FLOAT_DEFAULT_POS;
    return floatPos;
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/**
 * 位置按「可移动范围里的比例」保存，转屏或窗口变化后还在同一侧。
 * 用 transform 移动：不触发页面重排，胶囊自己一个图层。
 */
function placeFloat(el, pos = savedFloatPos()) {
    if (el.hidden) return;
    const maxX = Math.max(0, window.innerWidth - el.offsetWidth - FLOAT_MARGIN * 2);
    const maxY = Math.max(0, window.innerHeight - el.offsetHeight - FLOAT_MARGIN * 2);
    const x = Math.round(FLOAT_MARGIN + clamp01(pos.x) * maxX);
    let y;
    if (pos.y == null) {
        const bar = document.getElementById('top-bar')?.getBoundingClientRect();
        const top = (bar && bar.height ? bar.bottom : 50) + 6;
        y = Math.round(Math.min(FLOAT_MARGIN + maxY, Math.max(FLOAT_MARGIN, top)));
    } else {
        y = Math.round(FLOAT_MARGIN + clamp01(pos.y) * maxY);
    }
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
}

function moveFloat(el, left, top) {
    const maxX = Math.max(0, window.innerWidth - el.offsetWidth - FLOAT_MARGIN * 2);
    const maxY = Math.max(0, window.innerHeight - el.offsetHeight - FLOAT_MARGIN * 2);
    const x = maxX ? clamp01((left - FLOAT_MARGIN) / maxX) : 0;
    const y = maxY ? clamp01((top - FLOAT_MARGIN) / maxY) : 0;
    placeFloat(el, { x, y });
    return { x, y };
}

export function resetFloatPosition() {
    store.remove(KEYS.floatPos);
    floatPos = null;
    if (miniBar.float) placeFloat(miniBar.float);
}

/**
 * 按住移动超过几像素算拖动；拖动结束后吞掉随之而来的那次点击。
 * 移动和抬起在 window 上监听：手指移出胶囊后它本身收不到事件。
 * 不用 setPointerCapture，否则点击会落到外层而不是播放键上。
 */
function bindDrag(el) {
    let start = null;
    let dragged = false;
    let pos = null;
    const onMove = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!dragged) {
            if (Math.hypot(dx, dy) < 8) return;
            dragged = true;
            el.classList.add('nep-dragging');
        }
        e.preventDefault();
        pos = moveFloat(el, start.left + dx, start.top + dy);
    };
    const onEnd = (e) => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (dragged) {
            el.classList.remove('nep-dragging');
            if (pos) {
                floatPos = pos;
                store.set(KEYS.floatPos, pos);
            }
        }
    };
    el.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const r = el.getBoundingClientRect();
        start = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top };
        dragged = false;
        pos = null;
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
    });
    el.addEventListener('click', (e) => {
        if (!dragged) return;
        dragged = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);
}

function setArt(root, pic) {
    const art = root.querySelector('.nep-art');
    const img = art.querySelector('img');
    const src = pic ? `${pic}?param=80y80` : '';
    if (img.dataset.src === src) return;
    img.dataset.src = src;
    if (src) img.src = src;
    else img.removeAttribute('src');
    art.classList.toggle('nep-has-img', !!src);
}

function toneOf(label) {
    if (!label) return '';
    if (gen.state === 'generating') return 'gen';
    return label.includes('已完成') ? 'done' : '';
}

/**
 * 迷你播放条和悬浮胶囊共用一份状态（engine.js 只调 set/show/hide）。
 * - entry=float：显示悬浮胶囊
 * - entry=bar：显示输入框上方的迷你播放条
 * - entry=off：都不显示，只从魔法棒菜单或扩展设置打开
 * 「停止并关闭」（hide）把常驻入口一起收起，记在本地；下次从菜单打开播放器（show）再出现。
 */
export const miniBar = {
    bar: null,
    float: null,
    dismissed: !!store.get(KEYS.dismissed),
    away: false, // 展开面板开着时胶囊让位
    title: '',
    artist: '',
    pic: '',
    playing: false,
    needTap: false,
    note: '',

    show() {
        if (this.dismissed) {
            this.dismissed = false;
            store.remove(KEYS.dismissed);
        }
        this.apply();
    },

    hide() {
        this.dismissed = true;
        store.set(KEYS.dismissed, true);
        this.apply();
    },

    setAway(away) {
        this.away = away;
        this.float?.classList.toggle('nep-away', away);
    },

    /** 按设置决定显示哪个入口；改了设置后也调用这个。 */
    apply() {
        const showBar = settings.entry === 'bar' && !this.dismissed;
        const showFloat = settings.entry === 'float' && !this.dismissed;
        if (showBar && !this.bar) this.bar = createBar();
        if (showFloat && !this.float) this.float = createFloat();
        if (this.bar) this.bar.hidden = !showBar;
        if (this.float) {
            this.float.hidden = !showFloat;
            this.float.classList.toggle('nep-away', this.away);
        }
        const select = document.getElementById('nep-settings-entry');
        if (select) select.value = settings.entry;
        this.render();
        if (showFloat) placeFloat(this.float);
    },

    set(patch) {
        Object.assign(this, patch);
        this.render();
    },

    render() {
        const label = gen.label;
        const tone = toneOf(label);
        let floatResized = false;
        for (const el of [this.bar, this.float]) {
            if (!el || el.hidden) continue;
            const isFloat = el === this.float;
            const title = this.title || '网易云音乐';
            const note = isFloat && this.needTap ? '轻点 ▶ 继续播放' : this.note;
            const subText = label || note || this.artist || '点歌名打开播放器';
            const titleEl = el.querySelector('.nep-title');
            const sub = el.querySelector('.nep-sub');
            // 文字没变就不碰 DOM
            if (titleEl.textContent !== title || sub.textContent !== subText) {
                titleEl.textContent = title;
                sub.textContent = subText;
                if (isFloat) floatResized = true;
            }
            if (tone) sub.dataset.nepTone = tone;
            else delete sub.dataset.nepTone;
            setArt(el, this.pic);
            const glyph = el.querySelector('.nep-play .nep-glyph');
            glyph.classList.toggle('fa-play', !this.playing);
            glyph.classList.toggle('fa-pause', !!this.playing);
            const resume = el.querySelector('.nep-resume');
            if (resume) resume.hidden = !this.needTap;
        }
        // 文字变了宽度会变，重新贴边，免得超出屏幕；刚显示出来时也要摆一次
        const float = this.float;
        if (float && !float.hidden && (floatResized || !float.style.transform) && !float.classList.contains('nep-dragging')) {
            placeFloat(float);
        }
    },
};

// ---------- 扩展设置面板里的条目 ----------

export const ENTRY_OPTIONS = [['float', '悬浮胶囊（可拖动）'], ['bar', '输入框上方的迷你播放条'], ['off', '关闭']];
export const GLASS_OPTIONS = [['auto', '跟随主题'], ['light', '浅色'], ['dark', '深色']];

function addSettingsDrawer() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host || document.getElementById('nep-settings')) return;
    const select = (id, options) => `<select id="${id}" class="text_pole">${options
        .map(([v, text]) => `<option value="${v}">${text}</option>`).join('')}</select>`;
    const el = document.createElement('div');
    el.id = 'nep-settings';
    el.className = 'inline-drawer';
    el.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>网易云播放器</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <div class="flex-container">
                <div class="menu_button menu_button_icon" data-act="open"><i class="fa-solid fa-music"></i><span>打开播放器</span></div>
                <div class="menu_button menu_button_icon" data-act="reset"><i class="fa-solid fa-arrows-to-dot"></i><span>悬浮胶囊回到顶部居中</span></div>
            </div>
            <label for="nep-settings-entry">常驻入口</label>${select('nep-settings-entry', ENTRY_OPTIONS)}
            <label for="nep-settings-glass">玻璃颜色</label>${select('nep-settings-glass', GLASS_OPTIONS)}
            <small>搜歌、歌单、扫码登录和其他设置在播放器右上角的「账号与设置」里。</small>
        </div>`;
    host.appendChild(el);
    const entry = el.querySelector('#nep-settings-entry');
    entry.value = settings.entry;
    entry.addEventListener('change', () => setEntry(entry.value));
    const glass = el.querySelector('#nep-settings-glass');
    glass.value = settings.glass;
    glass.addEventListener('change', () => setGlass(glass.value));
    el.querySelector('[data-act=open]').addEventListener('click', () => openPanel());
    el.querySelector('[data-act=reset]').addEventListener('click', () => resetFloatPosition());
}

/** 换常驻入口。主动选了一个入口，就撤销「停止并关闭」的收起。 */
export function setEntry(value) {
    settings.entry = value;
    saveSettings();
    if (value === 'off') miniBar.apply();
    else miniBar.show();
}

export function setGlass(value) {
    settings.glass = value;
    saveSettings();
    applyGlass();
    const select = document.getElementById('nep-settings-glass');
    if (select) select.value = value;
}

export { KEYS };

// ---------- 启动 ----------

function addMenuItem() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu || document.getElementById('nep-menu-item')) return;
    const item = document.createElement('div');
    item.id = 'nep-menu-item';
    item.className = 'list-group-item flex-container flexGap5 interactable';
    item.tabIndex = 0;
    item.innerHTML = '<div class="fa-solid fa-music extensionsMenuExtensionButton"></div><span>网易云音乐</span>';
    item.addEventListener('click', () => openPanel());
    menu.appendChild(item);
}

function restoreMiniBar() {
    if (store.get(KEYS.silent)) {
        log('页面加载', '上次在静音播放');
        miniBar.set({ title: '静音播放', artist: '', needTap: true, note: '点「继续播放」接着静音播放' });
        return;
    }
    const now = store.get(KEYS.now);
    if (!now || !now.title) return;
    log('页面加载', `上次保存于 ${Math.round((Date.now() - (now.savedAt || 0)) / 60000)} 分钟前`);
    miniBar.set({ title: now.title, artist: now.artist || '', needTap: true, note: '点「继续播放」接着听' });
}

// 手动装过一份、又用「安装扩展」装了一份时，只让先加载的那份运行
if (globalThis.__neteasePlayerLoaded) {
    console.warn('[netease-player] 检测到重复安装，这一份不启动');
    globalThis.toastr?.warning('网易云播放器装了两份，请在扩展管理里删掉其中一份', '', { timeOut: 10000 });
} else {
    globalThis.__neteasePlayerLoaded = true;
    injectStyle();
    applyGlass();
    watchTheme();
    addMenuItem();
    addSettingsDrawer();
    bindGenerationEvents();
    restoreMiniBar();
    miniBar.apply();
}
