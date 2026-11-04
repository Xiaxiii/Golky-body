// 网易云播放器 —— 启动时只运行这个文件：注册菜单项、监听生成事件、
// 显示常驻入口（灵动岛或迷你播放条）、在扩展设置面板里加一个条目。不发任何网络请求。
// 播放逻辑（engine.js）和界面（panel.js）在用户点开后才加载。

const API_BASE = '/api/plugins/netease-player/';
const KEYS = {
    now: 'nep:v1:now',
    queue: 'nep:v1:queue',
    settings: 'nep:v1:settings',
    log: 'nep:v1:log',
    silent: 'nep:v1:silent',
    floatPos: 'nep:v1:float-pos',
};
const DEFAULT_SETTINGS = {
    skipTrial: true,
    statusMinutes: 3,
    autoResume: true,
    level: 'standard',
    entry: 'float', // float 灵动岛 | bar 输入框上方的迷你播放条 | off 只从魔法棒菜单打开
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
    collapseIsland();
    try {
        const panel = await loadPanel();
        panelModule = panel;
        panel.open();
        miniBar.setAway(true);
    } catch (error) {
        reportLoadError(error);
    }
}

// ---------- 常驻入口：灵动岛 / 迷你播放条 ----------

// 灵动岛和展开面板共用的配色：不跟酒馆主题走，始终是纯黑底白字。
// 不用 backdrop-filter：iPhone 上固定在聊天记录上方的毛玻璃，每滑一帧都要重新模糊，整页会卡。
export const TOKENS = `--nep-ground:#000;--nep-raise:#1c1c1e;--nep-raise-2:#2c2c2e;--nep-raise-3:#3a3a3c;
--nep-ink:#fff;--nep-ink-2:rgba(235,235,245,.6);--nep-accent:#ff4d5e;--nep-ok:#30d158;--nep-busy:#ff9f0a;
--nep-spring:cubic-bezier(.32,1.28,.48,1);
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
-webkit-font-smoothing:antialiased`;

const CSS = `
#nep-float,#nep-bar{${TOKENS}}
#nep-bar[hidden],#nep-float[hidden]{display:none}
#nep-bar{display:flex;align-items:center;gap:6px;width:100%;box-sizing:border-box;margin:0 0 4px;padding:3px 4px 3px 6px;
border-radius:22px;background:var(--nep-ground);color:var(--nep-ink);font-size:14px;white-space:nowrap}
#nep-bar .nep-art{width:30px;height:30px;border-radius:8px}
#nep-bar .nep-info{flex:1;min-width:0;overflow:hidden;line-height:1.25;cursor:pointer}
#nep-bar .nep-title,#nep-bar .nep-sub{overflow:hidden;text-overflow:ellipsis}
#nep-bar .nep-title{font-weight:600}
#nep-bar .nep-sub{color:var(--nep-ink-2);font-size:12px}
#nep-bar button{flex:none;width:36px;height:36px;border:0;border-radius:50%;background:transparent;color:inherit;
font-size:15px;cursor:pointer;-webkit-tap-highlight-color:transparent}
#nep-bar button:active{background:var(--nep-raise-2)}
#nep-bar .nep-resume{width:auto;padding:0 14px;border-radius:18px;background:var(--nep-raise-2);font:600 13px/1 inherit}
.nep-art{flex:none;display:grid;place-items:center;overflow:hidden;background:var(--nep-raise-2);color:var(--nep-ink-2)}
.nep-art img{display:none;width:100%;height:100%;object-fit:cover}
.nep-art.nep-has-img img{display:block}
.nep-art.nep-has-img i{display:none}
[data-nep-tone=gen]{color:var(--nep-busy)!important}
[data-nep-tone=done]{color:var(--nep-ok)!important}
[data-nep-tone=gen]::before,[data-nep-tone=done]::before{content:"";display:inline-block;width:6px;height:6px;margin:0 6px 1px 0;
border-radius:50%;background:currentColor;vertical-align:middle}
[data-nep-tone=gen]::before{animation:nep-pulse 1.2s ease-in-out infinite}
@keyframes nep-pulse{50%{opacity:.25}}

#nep-float{position:fixed;z-index:2910;left:0;top:0;box-sizing:border-box;width:200px;height:36px;border-radius:18px;
background:var(--nep-ground);color:var(--nep-ink);box-shadow:0 10px 30px rgba(0,0,0,.3);overflow:hidden;
font-size:14px;line-height:1.2;white-space:nowrap;will-change:transform;contain:layout style paint;
transition:transform .5s var(--nep-spring),width .5s var(--nep-spring),height .5s var(--nep-spring),border-radius .5s var(--nep-spring),opacity .25s ease;
touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#nep-float.nep-still{transition:none}
#nep-float.nep-away{opacity:0;pointer-events:none}
#nep-float[data-state=expanded]{border-radius:34px;touch-action:manipulation}
#nep-float button{border:0;padding:0;background:transparent;color:inherit;cursor:pointer;display:grid;place-items:center;
-webkit-tap-highlight-color:transparent}
#nep-float button:active{background:var(--nep-raise-2)}
#nep-float button:focus-visible,#nep-float .nep-info:focus-visible{outline:2px solid var(--nep-accent);outline-offset:-2px}
.nep-compact,.nep-expanded{position:absolute;left:0;top:0;box-sizing:border-box;
transition:opacity .18s ease,transform .45s var(--nep-spring)}
.nep-compact{right:0;bottom:0;display:flex;align-items:center;gap:8px;padding:0 3px 0 6px}
.nep-expanded{width:var(--nep-xw,352px);height:var(--nep-xh,166px);padding:18px 18px 10px;opacity:0;
transform:scale(.9);transform-origin:50% 0;pointer-events:none}
#nep-float[data-state=expanded] .nep-compact{opacity:0;transform:scale(.85);pointer-events:none}
#nep-float[data-state=expanded] .nep-expanded{opacity:1;transform:none;pointer-events:auto;transition-delay:.06s}
#nep-float .nep-info{flex:1;min-width:0;display:flex;align-items:center;gap:8px;height:100%;cursor:pointer;outline:0}
#nep-float .nep-compact .nep-art{width:24px;height:24px;border-radius:7px;font-size:11px}
.nep-line{position:relative;flex:1;min-width:0;height:18px;overflow:hidden}
.nep-line>span{position:absolute;inset:0;overflow:hidden;text-overflow:ellipsis;line-height:18px;
transition:transform .4s var(--nep-spring),opacity .2s ease}
#nep-float .nep-title{font-weight:600}
#nep-float .nep-sub{font-weight:600;color:var(--nep-ink-2);transform:translateY(100%);opacity:0}
#nep-float[data-line=sub] .nep-title{transform:translateY(-100%);opacity:0}
#nep-float[data-line=sub] .nep-sub{transform:none;opacity:1}
#nep-float .nep-play{flex:none;width:30px;height:30px;border-radius:50%;font-size:13px}
.nep-wave{display:none;align-items:center;gap:2px;height:14px}
.nep-wave i{width:3px;height:14px;border-radius:2px;background:var(--nep-accent);transform:scaleY(.35);
animation:nep-wave .9s ease-in-out infinite alternate}
.nep-wave i:nth-child(2){animation-duration:.62s;animation-delay:-.2s}
.nep-wave i:nth-child(3){animation-duration:.78s;animation-delay:-.45s}
.nep-wave i:nth-child(4){animation-duration:.55s;animation-delay:-.1s}
@keyframes nep-wave{to{transform:scaleY(1)}}
#nep-float[data-playing] .nep-play .nep-wave{display:flex}
#nep-float[data-playing] .nep-play .nep-glyph{display:none}
#nep-float:not([data-playing]) .nep-x-head .nep-wave i{animation:none}
.nep-x-head{display:flex;align-items:center;gap:12px}
.nep-x-head .nep-art{width:54px;height:54px;border-radius:14px;font-size:20px;cursor:pointer}
.nep-x-text{flex:1;min-width:0;cursor:pointer}
.nep-x-title,.nep-x-sub{overflow:hidden;text-overflow:ellipsis}
.nep-x-title{font-size:17px;font-weight:600;line-height:1.25}
.nep-x-sub{margin-top:3px;font-size:14px;color:var(--nep-ink-2)}
.nep-x-head .nep-wave{display:flex;align-self:flex-start;margin-top:6px}
.nep-x-progress{display:flex;align-items:center;gap:10px;margin-top:16px;font-size:11px;font-weight:600;
color:var(--nep-ink-2);font-variant-numeric:tabular-nums}
.nep-x-progress span{width:34px}
.nep-x-progress span:last-child{text-align:right}
.nep-x-track{flex:1;height:5px;border-radius:3px;background:var(--nep-raise-3);overflow:hidden}
.nep-x-fill{width:100%;height:100%;border-radius:3px;background:var(--nep-ink);transform-origin:0 50%;transform:scaleX(0)}
.nep-x-controls{display:flex;align-items:center;justify-content:space-between;margin-top:4px}
#nep-float .nep-x-controls button{width:46px;height:46px;border-radius:50%;font-size:21px}
#nep-float .nep-x-controls .nep-x-play{width:56px;height:56px;font-size:28px}
#nep-float .nep-x-controls .nep-x-side{font-size:16px;color:var(--nep-ink-2)}
#nep-float[data-silent] .nep-x-silent{color:var(--nep-accent)}
@media (prefers-reduced-motion:reduce){
#nep-float,.nep-compact,.nep-expanded,.nep-line>span{transition-duration:.01s!important}
.nep-wave i,[data-nep-tone=gen]::before{animation:none!important}.nep-wave i{transform:scaleY(.7)}}
`;

// 灵动岛的尺寸：收起时固定大小（换歌不跳动），展开后固定大小（内容不在动画里重排）
const ISLAND_MARGIN = 8;
const compactSize = () => ({ w: Math.round(Math.min(212, window.innerWidth * 0.62)), h: 36 });
const expandedSize = () => ({ w: Math.round(Math.min(360, window.innerWidth - ISLAND_MARGIN * 2)), h: 166 });
// 默认在顶栏下方居中；y 为 null 表示「贴着顶栏」，按顶栏实际高度算
const FLOAT_DEFAULT_POS = { x: 0.5, y: null };
const WAVE = '<span class="nep-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
const ART = '<span class="nep-art"><img alt=""><i class="fa-solid fa-music"></i></span>';

const fmtTime = (sec) => {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
};

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

function createBar() {
    injectStyle();
    const el = document.createElement('div');
    el.id = 'nep-bar';
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
    injectStyle();
    const el = document.createElement('div');
    el.id = 'nep-float';
    el.hidden = true;
    el.dataset.state = 'compact';
    el.innerHTML = `
        <div class="nep-compact">
            <div class="nep-info" role="button" tabindex="0" aria-label="展开灵动岛（按住可拖动）">
                ${ART}<span class="nep-line"><span class="nep-title"></span><span class="nep-sub"></span></span>
            </div>
            <button type="button" class="nep-play" aria-label="播放/暂停">${WAVE}<i class="nep-glyph fa-solid fa-play"></i></button>
        </div>
        <div class="nep-expanded" aria-hidden="true">
            <div class="nep-x-head">${ART}
                <div class="nep-x-text" role="button" tabindex="0" aria-label="打开搜索与歌单">
                    <div class="nep-x-title"></div><div class="nep-x-sub"></div></div>
                ${WAVE}
            </div>
            <div class="nep-x-progress"><span class="nep-x-cur">0:00</span>
                <div class="nep-x-track"><div class="nep-x-fill"></div></div><span class="nep-x-dur">0:00</span></div>
            <div class="nep-x-controls">
                <button type="button" class="nep-x-side nep-x-list" aria-label="搜索与歌单"><i class="fa-solid fa-list-ul"></i></button>
                <button type="button" class="nep-x-prev" aria-label="上一首"><i class="fa-solid fa-backward"></i></button>
                <button type="button" class="nep-x-play" aria-label="播放/暂停"><i class="nep-glyph fa-solid fa-play"></i></button>
                <button type="button" class="nep-x-next" aria-label="下一首"><i class="fa-solid fa-forward"></i></button>
                <button type="button" class="nep-x-side nep-x-silent" aria-label="静音播放"><i class="fa-solid fa-volume-xmark"></i></button>
            </div>
        </div>`;
    document.body.appendChild(el);
    const on = (sel, fn) => el.querySelector(sel).addEventListener('click', fn);
    on('.nep-play', withEngine(e => e.toggle()));
    // 键盘触发（detail 为 0）时把焦点移进展开的灵动岛
    on('.nep-info', (e) => expandIsland(e.detail === 0));
    on('.nep-x-play', withEngine(e => e.toggle()));
    on('.nep-x-prev', withEngine(e => e.prev()));
    on('.nep-x-next', withEngine(e => e.next()));
    on('.nep-x-silent', withEngine((e) => {
        if (e.isSilentMode()) e.stopSilent();
        else e.startSilent();
        miniBar.render();
    }));
    for (const sel of ['.nep-x-list', '.nep-x-text', '.nep-x-head .nep-art']) on(sel, () => openPanel());
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') collapseIsland();
        if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
            e.preventDefault();
            e.target.click();
        }
    });
    bindDrag(el);
    // iOS 滑动时地址栏收起也会触发 resize，合并到下一帧只算一次
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            if (el.dataset.state === 'expanded') layoutExpanded(el, true);
            else placeFloat(el, savedFloatPos(), true);
        });
    });
    return el;
}

let floatPos = null;
let islandRect = null; // 收起时的位置和大小，展开时以它为锚点

function savedFloatPos() {
    floatPos ??= store.get(KEYS.floatPos) || FLOAT_DEFAULT_POS;
    return floatPos;
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** 不带过渡地摆放一次（拖动、窗口变化时），否则会拖出残影。 */
function still(el, fn) {
    el.classList.add('nep-still');
    fn();
    void el.offsetWidth;
    el.classList.remove('nep-still');
}

/**
 * 位置按「可移动范围里的比例」保存，转屏或窗口变化后还在同一侧。
 * 用 transform 移动：不触发页面重排，灵动岛自己一个图层。
 */
function placeFloat(el, pos = savedFloatPos(), instant = false) {
    if (el.hidden) return;
    const { w, h } = compactSize();
    const maxX = Math.max(0, window.innerWidth - w - ISLAND_MARGIN * 2);
    const maxY = Math.max(0, window.innerHeight - h - ISLAND_MARGIN * 2);
    const x = Math.round(ISLAND_MARGIN + clamp01(pos.x) * maxX);
    let y;
    if (pos.y == null) {
        const bar = document.getElementById('top-bar')?.getBoundingClientRect();
        const top = (bar && bar.height ? bar.bottom : 50) + 6;
        y = Math.round(Math.min(ISLAND_MARGIN + maxY, Math.max(ISLAND_MARGIN, top)));
    } else {
        y = Math.round(ISLAND_MARGIN + clamp01(pos.y) * maxY);
    }
    islandRect = { x, y, w, h };
    const apply = () => {
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    if (instant || !el.style.transform) still(el, apply);
    else apply();
}

function moveFloat(el, left, top) {
    const { w, h } = compactSize();
    const maxX = Math.max(0, window.innerWidth - w - ISLAND_MARGIN * 2);
    const maxY = Math.max(0, window.innerHeight - h - ISLAND_MARGIN * 2);
    const x = maxX ? clamp01((left - ISLAND_MARGIN) / maxX) : 0;
    const y = maxY ? clamp01((top - ISLAND_MARGIN) / maxY) : 0;
    placeFloat(el, { x, y }, true);
    return { x, y };
}

export function resetFloatPosition() {
    store.remove(KEYS.floatPos);
    floatPos = null;
    if (miniBar.float) placeFloat(miniBar.float);
}

/** 展开：以收起时的中心为准横向展开，上半屏往下长、下半屏往上长，不出屏幕。 */
function layoutExpanded(el, instant = false) {
    const c = islandRect || { x: ISLAND_MARGIN, y: ISLAND_MARGIN, ...compactSize() };
    const { w, h } = expandedSize();
    const maxX = window.innerWidth - w - ISLAND_MARGIN;
    const maxY = window.innerHeight - h - ISLAND_MARGIN;
    const x = Math.round(Math.max(ISLAND_MARGIN, Math.min(maxX, c.x + c.w / 2 - w / 2)));
    const down = c.y + c.h / 2 < window.innerHeight / 2;
    const y = Math.round(Math.max(ISLAND_MARGIN, Math.min(maxY, down ? c.y : c.y + c.h - h)));
    const apply = () => {
        el.style.setProperty('--nep-xw', `${w}px`);
        el.style.setProperty('--nep-xh', `${h}px`);
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transform = `translate3d(${x}px,${y}px,0)`;
    };
    if (instant) still(el, apply);
    else apply();
}

let progressTimer = 0;

function onOutsidePointer(e) {
    if (miniBar.float && !miniBar.float.contains(e.target)) collapseIsland();
}

export function expandIsland(focus = false) {
    const el = miniBar.float;
    if (!el || el.hidden || el.dataset.state === 'expanded') return;
    el.dataset.state = 'expanded';
    el.querySelector('.nep-expanded').setAttribute('aria-hidden', 'false');
    layoutExpanded(el);
    miniBar.render();
    renderIslandProgress();
    clearInterval(progressTimer);
    progressTimer = setInterval(renderIslandProgress, 1000);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    if (focus) el.querySelector('.nep-x-play').focus({ preventScroll: true });
}

export function collapseIsland() {
    const el = miniBar.float;
    if (!el || el.dataset.state !== 'expanded') return;
    el.dataset.state = 'compact';
    el.querySelector('.nep-expanded').setAttribute('aria-hidden', 'true');
    clearInterval(progressTimer);
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    placeFloat(el);
}

function renderIslandProgress() {
    const el = miniBar.float;
    if (!el || el.dataset.state !== 'expanded') return;
    const s = engineModule?.getState();
    const dur = s ? (s.duration || (s.track?.dt || 0) / 1000) : 0;
    const cur = s ? s.currentTime : 0;
    el.querySelector('.nep-x-cur').textContent = fmtTime(cur);
    el.querySelector('.nep-x-dur').textContent = dur ? fmtTime(dur) : '–:––';
    el.querySelector('.nep-x-fill').style.transform = `scaleX(${dur ? Math.min(1, cur / dur) : 0})`;
}

/**
 * 按住移动超过几像素算拖动；拖动结束后吞掉随之而来的那次点击。
 * 移动和抬起在 window 上监听：手指移出灵动岛后它本身收不到事件。
 * 不用 setPointerCapture，否则点击会落到外层而不是播放键上。展开时不能拖。
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
        if (el.dataset.state === 'expanded') return;
        start = { id: e.pointerId, x: e.clientX, y: e.clientY, left: islandRect?.x ?? 0, top: islandRect?.y ?? 0 };
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
    const src = pic ? `${pic}?param=120y120` : '';
    for (const art of root.querySelectorAll('.nep-art')) {
        const img = art.querySelector('img');
        if (img.dataset.src === src) continue;
        img.dataset.src = src;
        if (src) img.src = src;
        else img.removeAttribute('src');
        art.classList.toggle('nep-has-img', !!src);
    }
}

function toneOf(label) {
    if (!label) return '';
    if (gen.state === 'generating') return 'gen';
    return label.includes('已完成') ? 'done' : '';
}

const setText = (node, text) => {
    if (node.textContent !== text) node.textContent = text;
};

const setTone = (node, tone) => {
    if (tone) node.dataset.nepTone = tone;
    else delete node.dataset.nepTone;
};

/**
 * 迷你播放条和灵动岛共用一份状态（engine.js 只调 set/show/hide）。
 * - entry=float：一直显示灵动岛，不显示迷你播放条
 * - entry=bar：一直显示迷你播放条
 * - entry=off：和最早一样，打开过播放器或有播放记录时才显示迷你播放条
 */
export const miniBar = {
    bar: null,
    float: null,
    active: false,
    away: false, // 展开面板开着时灵动岛让位
    title: '',
    artist: '',
    pic: '',
    playing: false,
    needTap: false,
    note: '',

    show() {
        this.active = true;
        this.apply();
    },

    hide() {
        this.active = false;
        this.apply();
    },

    setAway(away) {
        this.away = away;
        if (away) collapseIsland();
        this.float?.classList.toggle('nep-away', away);
    },

    /** 按设置决定显示哪个入口；改了设置后也调用这个。 */
    apply() {
        const showBar = settings.entry === 'bar' || (settings.entry === 'off' && this.active);
        const showFloat = settings.entry === 'float';
        if (showBar && !this.bar) this.bar = createBar();
        if (showFloat && !this.float) this.float = createFloat();
        if (this.bar) this.bar.hidden = !showBar;
        if (this.float) {
            if (!showFloat) collapseIsland();
            this.float.hidden = !showFloat;
            this.float.classList.toggle('nep-away', this.away);
            if (showFloat) placeFloat(this.float);
        }
        const select = document.getElementById('nep-settings-entry');
        if (select) select.value = settings.entry;
        this.render();
    },

    set(patch) {
        Object.assign(this, patch);
        this.render();
    },

    render() {
        const label = gen.label;
        const tone = toneOf(label);
        const title = this.title || '网易云音乐';
        const playing = !!this.playing;

        const bar = this.bar;
        if (bar && !bar.hidden) {
            setText(bar.querySelector('.nep-title'), title);
            const sub = bar.querySelector('.nep-sub');
            setText(sub, label || this.note || this.artist || '点歌名展开');
            setTone(sub, tone);
            setArt(bar, this.pic);
            const glyph = bar.querySelector('.nep-play .nep-glyph');
            glyph.classList.toggle('fa-play', !playing);
            glyph.classList.toggle('fa-pause', playing);
            bar.querySelector('.nep-resume').hidden = !this.needTap;
        }

        const el = this.float;
        if (!el || el.hidden) return;
        // 收起时只有一行：平时是歌名；有生成状态或提示时换成提示，歌名滚上去
        const short = label ? label.replace(/^酒馆 · /, '') : '';
        const notice = short || (this.needTap ? '轻点 ▶ 继续播放' : this.note);
        setText(el.querySelector('.nep-title'), title);
        const sub = el.querySelector('.nep-sub');
        setText(sub, notice);
        setTone(sub, tone);
        el.dataset.line = notice ? 'sub' : 'title';
        el.toggleAttribute('data-playing', playing);
        el.toggleAttribute('data-silent', !!engineModule?.isSilentMode());
        setArt(el, this.pic);
        setText(el.querySelector('.nep-x-title'), title);
        const xsub = el.querySelector('.nep-x-sub');
        setText(xsub, label || this.note || this.artist || '轻点打开搜索与歌单');
        setTone(xsub, tone);
        for (const glyph of el.querySelectorAll('.nep-play .nep-glyph,.nep-x-play .nep-glyph')) {
            glyph.classList.toggle('fa-play', !playing);
            glyph.classList.toggle('fa-pause', playing);
        }
    },
};

// ---------- 扩展设置面板里的条目 ----------

function addSettingsDrawer() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host || document.getElementById('nep-settings')) return;
    const options = [['float', '灵动岛（可拖动）'], ['bar', '输入框上方的迷你播放条'], ['off', '关闭']];
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
                <div class="menu_button menu_button_icon" data-act="reset"><i class="fa-solid fa-arrows-to-dot"></i><span>灵动岛回到顶部居中</span></div>
            </div>
            <label for="nep-settings-entry">常驻入口</label>
            <select id="nep-settings-entry" class="text_pole">${options
                .map(([v, text]) => `<option value="${v}">${text}</option>`).join('')}</select>
            <small>搜歌、歌单、扫码登录和其他设置在播放器的「账号/设置」里。</small>
        </div>`;
    host.appendChild(el);
    const select = el.querySelector('select');
    select.value = settings.entry;
    select.addEventListener('change', () => {
        settings.entry = select.value;
        saveSettings();
        miniBar.apply();
    });
    el.querySelector('[data-act=open]').addEventListener('click', () => openPanel());
    el.querySelector('[data-act=reset]').addEventListener('click', () => resetFloatPosition());
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
        miniBar.show();
        return;
    }
    const now = store.get(KEYS.now);
    if (!now || !now.title) return;
    log('页面加载', `上次保存于 ${Math.round((Date.now() - (now.savedAt || 0)) / 60000)} 分钟前`);
    miniBar.set({ title: now.title, artist: now.artist || '', needTap: true, note: '点「继续播放」接着听' });
    miniBar.show();
}

// 手动装过一份、又用「安装扩展」装了一份时，只让先加载的那份运行
if (globalThis.__neteasePlayerLoaded) {
    console.warn('[netease-player] 检测到重复安装，这一份不启动');
    globalThis.toastr?.warning('网易云播放器装了两份，请在扩展管理里删掉其中一份', '', { timeOut: 10000 });
} else {
    globalThis.__neteasePlayerLoaded = true;
    addMenuItem();
    addSettingsDrawer();
    bindGenerationEvents();
    restoreMiniBar();
    miniBar.apply();
}
