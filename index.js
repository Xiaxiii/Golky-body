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
    glassFx: 'clear', // clear 通透（背景模糊） | solid 不透明
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
    collapseFloat();
    try {
        const panel = await loadPanel();
        panelModule = panel;
        panel.open();
        miniBar.setAway(true);
    } catch (error) {
        reportLoadError(error);
    }
}

// ---------- 液态玻璃 ----------

// 悬浮胶囊、迷你播放条和展开面板共用。
// - 颜色：按主题文字颜色判断深浅（文字深 → 浅色玻璃），设置里可以手动指定。
// - 质感：默认「通透」，用背景模糊 + 提高饱和度，底色半透明；「不透明」不做模糊，底色接近实色。
//   模糊只在胶囊（很小）和面板（打开时背后的聊天基本不动）上，滑动聊天记录时每帧重算的面积很小。
// - 立体感：顶部高光点、上沿亮边、下沿暗边、内侧厚度阴影、斜向边缘反光（::before）。
const CSS = `
#nep-float,#nep-bar,#nep-panel{
--nep-glass:rgba(250,250,252,.96);--nep-sheen:rgba(255,255,255,.85);--nep-rim:rgba(255,255,255,1);--nep-rim-2:rgba(255,255,255,.35);
--nep-glint:rgba(255,255,255,.8);--nep-depth:rgba(0,0,0,.07);--nep-blur:22px;
--nep-ink:#1d1d1f;--nep-ink-2:rgba(60,60,67,.7);--nep-raise:rgba(118,118,128,.12);--nep-raise-2:rgba(118,118,128,.2);
--nep-raise-3:rgba(118,118,128,.3);--nep-seg:#fff;--nep-paper:#fff;--nep-accent:#d33a31;--nep-on-accent:#fff;
--nep-tint:#fbe9e7;--nep-tint-2:#f6d3cf;--nep-tint-ink:#8a1f19;--nep-ok:#1d8a3a;--nep-busy:#b35c00;
--nep-shadow:0 12px 32px rgba(0,0,0,.16),0 2px 6px rgba(0,0,0,.08);--nep-spring:cubic-bezier(.32,1.28,.48,1);
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif;
-webkit-font-smoothing:antialiased}
:root[data-nep-glass=dark] #nep-float,:root[data-nep-glass=dark] #nep-bar,:root[data-nep-glass=dark] #nep-panel{
--nep-glass:rgba(34,34,36,.96);--nep-sheen:rgba(255,255,255,.13);--nep-rim:rgba(255,255,255,.42);--nep-rim-2:rgba(255,255,255,.08);
--nep-glint:rgba(255,255,255,.16);--nep-depth:rgba(0,0,0,.4);
--nep-ink:#fff;--nep-ink-2:rgba(235,235,245,.66);--nep-raise:rgba(118,118,128,.24);--nep-raise-2:rgba(118,118,128,.34);
--nep-raise-3:rgba(118,118,128,.46);--nep-seg:rgba(99,99,102,.95);--nep-paper:#2c2c2e;--nep-accent:#ff5c52;--nep-on-accent:#fff;
--nep-tint:rgba(255,92,82,.14);--nep-tint-2:rgba(255,92,82,.24);--nep-tint-ink:#ffb4ae;--nep-ok:#30d158;--nep-busy:#ff9f0a;
--nep-shadow:0 12px 32px rgba(0,0,0,.4),0 2px 6px rgba(0,0,0,.25)}
#nep-panel{--nep-glass:#f7f7f9}
:root[data-nep-glass=dark] #nep-panel{--nep-glass:#222224}
/* 液态玻璃是用户指定的样式 */
.nep-glass{color:var(--nep-ink);
/* taste-skill-ignore: 玻璃高光 */background:radial-gradient(130% 100% at 18% -24%,var(--nep-glint),rgba(255,255,255,0) 52%),
/* taste-skill-ignore: 玻璃高光 */linear-gradient(180deg,var(--nep-sheen),rgba(255,255,255,0) 60%),var(--nep-glass);
box-shadow:inset 0 1px 1px var(--nep-rim),inset 0 -1px 1px var(--nep-rim-2),inset 0 14px 22px -18px var(--nep-rim),
inset 0 -14px 24px -18px var(--nep-depth),var(--nep-shadow)}
.nep-glass::before{content:"";position:absolute;inset:0;z-index:0;padding:1px;border-radius:inherit;pointer-events:none;
/* taste-skill-ignore: 玻璃边缘反光 */background:linear-gradient(135deg,var(--nep-rim),var(--nep-rim-2) 30%,rgba(255,255,255,0) 50%,var(--nep-rim-2) 70%,var(--nep-rim));
/* taste-skill-ignore: 玻璃边缘反光 */-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;
/* taste-skill-ignore: 玻璃边缘反光 */mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){
/* taste-skill-ignore: 用户指定的通透玻璃 */:root[data-nep-glassfx=clear] .nep-glass{-webkit-backdrop-filter:blur(var(--nep-blur)) saturate(1.9);backdrop-filter:blur(var(--nep-blur)) saturate(1.9)}
:root[data-nep-glassfx=clear] #nep-float,:root[data-nep-glassfx=clear] #nep-bar{--nep-glass:rgba(255,255,255,.52);--nep-sheen:rgba(255,255,255,.6)}
:root[data-nep-glassfx=clear] #nep-panel{--nep-glass:rgba(246,246,248,.74);--nep-blur:30px}
:root[data-nep-glassfx=clear][data-nep-glass=dark] #nep-float,:root[data-nep-glassfx=clear][data-nep-glass=dark] #nep-bar{
--nep-glass:rgba(40,40,44,.52);--nep-sheen:rgba(255,255,255,.1)}
:root[data-nep-glassfx=clear][data-nep-glass=dark] #nep-panel{--nep-glass:rgba(30,30,32,.74)}}
#nep-bar[hidden],#nep-float[hidden]{display:none!important}
.nep-art{flex:none;position:relative;display:grid;place-items:center;overflow:hidden;background:var(--nep-raise-2);color:var(--nep-ink-2)}
/* 没有封面时不占位 */
.nep-art:not(.nep-has-img){display:none!important}
.nep-art img{display:block;width:100%;height:100%;object-fit:cover}
[data-nep-tone=gen]{color:var(--nep-busy)!important}
[data-nep-tone=done]{color:var(--nep-ok)!important}
[data-nep-tone]::before{content:"";display:inline-block;width:6px;height:6px;margin:0 5px 1px 0;border-radius:50%;
background:currentColor;vertical-align:middle}
[data-nep-tone=gen]::before{animation:nep-pulse 1.2s ease-in-out infinite}
@keyframes nep-pulse{50%{opacity:.25}}

#nep-float{position:fixed;z-index:2910;left:0;top:0;box-sizing:border-box;border-radius:24px;overflow:hidden;
font-size:13px;line-height:1.25;white-space:nowrap;will-change:transform;contain:layout style;
transition:opacity .25s ease,scale .35s var(--nep-spring);
touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}
#nep-float.nep-morph{transition:opacity .25s ease,scale .35s var(--nep-spring),transform .5s var(--nep-spring),
width .5s var(--nep-spring),height .5s var(--nep-spring),border-radius .5s var(--nep-spring)}
#nep-float[data-state=compact]:active:not(.nep-dragging){scale:.96}
#nep-float[data-state=mid]{border-radius:32px;touch-action:manipulation}
#nep-float.nep-away{opacity:0;pointer-events:none}
#nep-float.nep-dragging{scale:1.04}
#nep-float button{flex:none;border:0;border-radius:50%;padding:0;background:transparent;color:inherit;cursor:pointer;
display:grid;place-items:center;-webkit-tap-highlight-color:transparent}
#nep-float button:active{background:var(--nep-raise-2)}
#nep-float :is(button,[role=button]):focus-visible{outline:2px solid var(--nep-accent);outline-offset:1px}
.nep-compact{position:relative;z-index:1;display:flex;align-items:center;gap:8px;width:max-content;max-width:min(230px,66vw);
box-sizing:border-box;padding:4px 4px 4px 5px;transition:opacity .2s ease}
#nep-float[data-state=mid] .nep-compact{opacity:0;pointer-events:none}
#nep-float .nep-info{display:flex;align-items:center;gap:8px;min-width:0;cursor:pointer;outline:0;border-radius:17px}
#nep-float .nep-compact .nep-art{width:30px;height:30px;border-radius:50%;font-size:12px}
#nep-float .nep-text{min-width:0;max-width:10.5em}
#nep-float .nep-title,#nep-float .nep-sub{overflow:hidden;text-overflow:ellipsis}
#nep-float .nep-title{font-weight:600}
#nep-float .nep-sub{font-size:11.5px;color:var(--nep-ink-2)}
#nep-float .nep-play{width:34px;height:34px;font-size:14px}

/* 中间态：仿灵动岛展开后的音乐卡片，始终纯黑，不跟玻璃颜色走 */
#nep-float .nep-mid{position:absolute;z-index:1;inset:0;border-radius:inherit;background:#000;color:#fff;opacity:0;pointer-events:none;
transition:opacity .22s ease}
#nep-float[data-state=mid] .nep-mid{opacity:1;pointer-events:auto}
.nep-mid-inner{position:absolute;left:0;top:0;width:var(--nep-mid-w,384px);height:var(--nep-mid-h,236px);box-sizing:border-box;
padding:14px 22px 12px;display:flex;flex-direction:column;white-space:nowrap;transform:scale(.94);transform-origin:50% 0;
transition:transform .45s var(--nep-spring)}
#nep-float[data-state=mid] .nep-mid-inner{transform:none}
.nep-mid-top{display:flex;align-items:center;justify-content:space-between;height:24px}
.nep-mid-top .nep-art{width:24px;height:24px;border-radius:6px}
.nep-wave{display:flex;align-items:center;gap:2px;height:14px;margin-left:auto}
.nep-wave i{width:3px;height:14px;border-radius:2px;background:var(--nep-art-tint,#ff6b81);transform:scaleY(.35);
animation:nep-wave .9s ease-in-out infinite alternate;animation-play-state:paused}
.nep-wave i:nth-child(2){animation-duration:.62s;animation-delay:-.2s}
.nep-wave i:nth-child(3){animation-duration:.78s;animation-delay:-.45s}
.nep-wave i:nth-child(4){animation-duration:.55s;animation-delay:-.1s}
@keyframes nep-wave{to{transform:scaleY(1)}}
#nep-float[data-playing][data-state=mid] .nep-wave i{animation-play-state:running}
.nep-mid-head{display:flex;align-items:center;gap:16px;margin-top:10px}
.nep-mid-head .nep-art{width:60px;height:60px;border-radius:12px;cursor:pointer}
.nep-mid-text{flex:1;min-width:0;cursor:pointer;outline:0;border-radius:8px}
.nep-mid-title,.nep-mid-sub{overflow:hidden;text-overflow:ellipsis}
.nep-mid-title{font-size:17px;font-weight:600;line-height:1.3;color:#fff}
.nep-mid-sub{margin-top:3px;font-size:15px;color:rgba(235,235,245,.6)}
.nep-mid-track{height:4px;margin-top:18px;border-radius:2px;background:rgba(255,255,255,.22);overflow:hidden}
.nep-mid-track i{display:block;height:100%;border-radius:2px;background:#fff;transform-origin:0 50%;transform:scaleX(0);transition:transform .9s linear}
.nep-mid-times{display:flex;justify-content:space-between;margin-top:7px;font-size:12px;color:rgba(235,235,245,.6);font-variant-numeric:tabular-nums}
.nep-mid-controls{display:flex;align-items:center;justify-content:space-between;margin:auto -8px 0}
#nep-float .nep-mid-controls button{width:50px;height:50px;font-size:22px;color:#fff}
#nep-float .nep-mid-controls button:active{background:rgba(255,255,255,.14)}
#nep-float .nep-mid-controls .nep-mid-play{width:58px;height:58px;font-size:32px}
#nep-float .nep-mid-controls .nep-mid-full{font-size:19px}
#nep-float .nep-mid-like{font-size:23px}
#nep-float .nep-mid-like.nep-on{color:#ff453a}
.nep-mid-like:not(.nep-on) i{color:transparent;-webkit-text-stroke:1.8px #fff}
#nep-float [data-nep-tone=gen]{color:#ff9f0a!important}
#nep-float [data-nep-tone=done]{color:#30d158!important}

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
@media (prefers-reduced-motion:reduce){
[data-nep-tone=gen]::before,.nep-wave i{animation:none!important}
#nep-float,#nep-float.nep-morph,.nep-compact,#nep-float .nep-mid{transition-duration:.01s!important}}
`;

// 默认在顶栏下方居中；y 为 null 表示「贴着顶栏」，按顶栏实际高度算
const FLOAT_MARGIN = 6;
const FLOAT_DEFAULT_POS = { x: 0.5, y: null };
const ART = '<span class="nep-art"><img alt=""></span>';
const WAVE = '<span class="nep-wave" aria-hidden="true"><i></i><i></i><i></i><i></i></span>';
// 中间态（播放卡片）的大小：固定，内容不在形变动画里重排
const midSize = () => ({ w: Math.round(Math.min(384, window.innerWidth - 24)), h: 236 });

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

/** 按设置或主题决定浅色 / 深色玻璃、通透 / 不透明，写在 <html data-nep-glass data-nep-glassfx>。 */
export function applyGlass() {
    const root = document.documentElement;
    const mode = settings.glass === 'light' || settings.glass === 'dark'
        ? settings.glass
        : (themeInkLuminance() < 0.5 ? 'light' : 'dark');
    if (root.dataset.nepGlass !== mode) root.dataset.nepGlass = mode;
    const fx = settings.glassFx === 'solid' ? 'solid' : 'clear';
    if (root.dataset.nepGlassfx !== fx) root.dataset.nepGlassfx = fx;
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

/**
 * 悬浮胶囊有两层：收起时的胶囊（.nep-compact），轻点后原地展开的播放卡片（.nep-mid）。
 * 卡片上点列表键、封面或歌名才打开完整面板。
 */
function createFloat() {
    const el = document.createElement('div');
    el.id = 'nep-float';
    el.className = 'nep-glass';
    el.hidden = true;
    el.dataset.state = 'compact';
    el.innerHTML = `
        <div class="nep-compact">
            <div class="nep-info" role="button" tabindex="0" aria-label="展开播放卡片（按住可拖动）">
                ${ART}<div class="nep-text"><div class="nep-title"></div><div class="nep-sub"></div></div>
            </div>
            <button type="button" class="nep-play" aria-label="播放/暂停"><i class="nep-glyph fa-solid fa-play"></i></button>
        </div>
        <div class="nep-mid" aria-hidden="true"><div class="nep-mid-inner">
            <div class="nep-mid-top">${ART}${WAVE}</div>
            <div class="nep-mid-head">${ART}
                <div class="nep-mid-text" role="button" tabindex="-1" aria-label="打开完整播放器">
                    <div class="nep-mid-title"></div><div class="nep-mid-sub"></div></div>
            </div>
            <div class="nep-mid-track"><i></i></div>
            <div class="nep-mid-times"><span class="nep-mid-cur">0:00</span><span class="nep-mid-dur">0:00</span></div>
            <div class="nep-mid-controls">
                <button type="button" class="nep-mid-full" tabindex="-1" aria-label="打开完整播放器"><i class="fa-solid fa-bars-staggered"></i></button>
                <button type="button" class="nep-mid-prev" tabindex="-1" aria-label="上一首"><i class="fa-solid fa-backward"></i></button>
                <button type="button" class="nep-mid-play" tabindex="-1" aria-label="播放/暂停"><i class="nep-glyph fa-solid fa-play"></i></button>
                <button type="button" class="nep-mid-next" tabindex="-1" aria-label="下一首"><i class="fa-solid fa-forward"></i></button>
                <button type="button" class="nep-mid-like" tabindex="-1" aria-label="红心"><i class="fa-solid fa-heart"></i></button>
            </div>
        </div></div>`;
    document.body.appendChild(el);
    const on = (sel, fn) => el.querySelector(sel).addEventListener('click', fn);
    on('.nep-play', withEngine(e => e.toggle()));
    on('.nep-info', (e) => expandFloat(e.detail === 0));
    on('.nep-mid-play', withEngine(e => e.toggle()));
    on('.nep-mid-prev', withEngine(e => e.prev()));
    on('.nep-mid-next', withEngine(e => e.next()));
    on('.nep-mid-like', () => toggleCurrentLike());
    for (const sel of ['.nep-mid-full', '.nep-mid-text', '.nep-mid-head .nep-art']) on(sel, () => openPanel());
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            collapseFloat();
            el.querySelector('.nep-info').focus({ preventScroll: true });
        } else if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[role=button]')) {
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
            if (el.dataset.state === 'mid') layoutMid(el);
            else placeFloat(el);
        });
    });
    return el;
}

let floatPos = null;
let floatRect = null; // 收起时的位置和大小，展开时以它为锚点

function savedFloatPos() {
    floatPos ??= store.get(KEYS.floatPos) || FLOAT_DEFAULT_POS;
    return floatPos;
}

const clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** 收起状态的胶囊大小：按内容算，不受展开时写在元素上的宽高影响。 */
function compactSize(el) {
    const c = el.querySelector('.nep-compact');
    return { w: c.offsetWidth, h: c.offsetHeight };
}

/**
 * 位置按「可移动范围里的比例」保存，转屏或窗口变化后还在同一侧。
 * 用 transform 移动：不触发页面重排，胶囊自己一个图层。
 */
function placeFloat(el, pos = savedFloatPos()) {
    if (el.hidden || el.dataset.state === 'mid') return;
    const { w, h } = compactSize(el);
    const maxX = Math.max(0, window.innerWidth - w - FLOAT_MARGIN * 2);
    const maxY = Math.max(0, window.innerHeight - h - FLOAT_MARGIN * 2);
    const x = Math.round(FLOAT_MARGIN + clamp01(pos.x) * maxX);
    let y;
    if (pos.y == null) {
        const bar = document.getElementById('top-bar')?.getBoundingClientRect();
        const top = (bar && bar.height ? bar.bottom : 50) + 6;
        y = Math.round(Math.min(FLOAT_MARGIN + maxY, Math.max(FLOAT_MARGIN, top)));
    } else {
        y = Math.round(FLOAT_MARGIN + clamp01(pos.y) * maxY);
    }
    floatRect = { x, y, w, h };
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
}

function moveFloat(el, left, top) {
    const { w, h } = compactSize(el);
    const maxX = Math.max(0, window.innerWidth - w - FLOAT_MARGIN * 2);
    const maxY = Math.max(0, window.innerHeight - h - FLOAT_MARGIN * 2);
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

/** 播放卡片的位置：以胶囊中心为准横向展开，上半屏往下长、下半屏往上长，不出屏幕。 */
function layoutMid(el) {
    const c = floatRect || { x: FLOAT_MARGIN, y: FLOAT_MARGIN, ...compactSize(el) };
    const { w, h } = midSize();
    const x = Math.round(Math.max(FLOAT_MARGIN, Math.min(window.innerWidth - w - FLOAT_MARGIN, c.x + c.w / 2 - w / 2)));
    const down = c.y + c.h / 2 < window.innerHeight / 2;
    const y = Math.round(Math.max(FLOAT_MARGIN, Math.min(window.innerHeight - h - FLOAT_MARGIN, down ? c.y : c.y + c.h - h)));
    el.style.setProperty('--nep-mid-w', `${w}px`);
    el.style.setProperty('--nep-mid-h', `${h}px`);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate3d(${x}px,${y}px,0)`;
}

let midTimer = 0;
let morphEnd = null;

function onOutsidePointer(e) {
    if (miniBar.float && !miniBar.float.contains(e.target)) collapseFloat();
}

function setMidFocusable(el, on) {
    el.querySelector('.nep-mid').setAttribute('aria-hidden', on ? 'false' : 'true');
    for (const b of el.querySelectorAll('.nep-mid [tabindex]')) b.tabIndex = on ? 0 : -1;
}

/** 胶囊 → 播放卡片：先把当前大小写死，下一帧再改成卡片大小，宽高和位置一起做弹簧形变。 */
export function expandFloat(focus = false) {
    const el = miniBar.float;
    if (!el || el.hidden || el.dataset.state === 'mid') return;
    clearTimeout(morphEnd);
    const { w, h } = compactSize(el);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    void el.offsetWidth;
    el.classList.add('nep-morph');
    el.dataset.state = 'mid';
    layoutMid(el);
    setMidFocusable(el, true);
    miniBar.render();
    renderMidProgress();
    clearInterval(midTimer);
    midTimer = setInterval(renderMidProgress, 1000);
    document.addEventListener('pointerdown', onOutsidePointer, true);
    if (focus) el.querySelector('.nep-mid-play').focus({ preventScroll: true });
}

/** 播放卡片 → 胶囊：形变回胶囊的大小和位置，动画结束后把宽高交还给内容。 */
export function collapseFloat() {
    const el = miniBar.float;
    if (!el || el.dataset.state !== 'mid') return;
    clearInterval(midTimer);
    document.removeEventListener('pointerdown', onOutsidePointer, true);
    setMidFocusable(el, false);
    el.dataset.state = 'compact';
    const { w, h } = compactSize(el);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    placeFloat(el);
    clearTimeout(morphEnd);
    morphEnd = setTimeout(() => {
        if (el.dataset.state !== 'compact') return;
        el.classList.remove('nep-morph');
        el.style.width = '';
        el.style.height = '';
    }, 520);
}

function renderMidProgress() {
    const el = miniBar.float;
    if (!el || el.dataset.state !== 'mid') return;
    const s = engineModule?.getState();
    const silent = !!s?.silent;
    const dur = s && !silent ? (s.duration || (s.track?.dt || 0) / 1000) : 0;
    const cur = s && !silent ? s.currentTime : 0;
    el.querySelector('.nep-mid-cur').textContent = fmtTime(cur);
    el.querySelector('.nep-mid-dur').textContent = dur ? fmtTime(dur) : '–:––';
    if (s && !silent && s.track && !likes.ids) likes.load();
    el.querySelector('.nep-mid-track i').style.transform = `scaleX(${dur ? Math.min(1, cur / dur) : 0})`;
}

/**
 * 按住移动超过几像素算拖动；拖动结束后吞掉随之而来的那次点击。
 * 移动和抬起在 window 上监听：手指移出胶囊后它本身收不到事件。
 * 不用 setPointerCapture，否则点击会落到外层而不是播放键上。展开成卡片时不能拖。
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
        if (el.dataset.state === 'mid' || el.classList.contains('nep-morph')) return;
        start = { id: e.pointerId, x: e.clientX, y: e.clientY, left: floatRect?.x ?? 0, top: floatRect?.y ?? 0 };
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

const setTone = (node, tone) => {
    if (tone) node.dataset.nepTone = tone;
    else delete node.dataset.nepTone;
};

// ---------- 红心：胶囊卡片和完整面板共用一份 ----------

export const likes = {
    ids: null, // Set<number>；没登录或还没取到时为 null
    loading: null,
    listeners: new Set(),

    has(id) {
        return !!this.ids?.has(Number(id));
    },

    failedAt: 0,

    /** 取红心列表；没登录时静默失败，5 分钟内不再自动重试。 */
    load(force = false) {
        if (this.loading) return this.loading;
        if (!force && (this.ids || Date.now() - this.failedAt < 5 * 60 * 1000)) return Promise.resolve();
        this.loading = api('likes')
            .then((data) => {
                this.ids = new Set((data.ids || []).map(Number));
                this.failedAt = 0;
                this.notify();
            })
            .catch(() => {
                this.failedAt = Date.now();
            })
            .finally(() => {
                this.loading = null;
            });
        return this.loading;
    },

    /** 红心 / 取消红心，先改界面，失败再改回来并抛出错误。 */
    async toggle(track) {
        const id = Number(track.id);
        const like = !this.has(id);
        this.ids ??= new Set();
        if (like) this.ids.add(id);
        else this.ids.delete(id);
        this.notify();
        try {
            await api('like', { id, like });
        } catch (error) {
            if (like) this.ids.delete(id);
            else this.ids.add(id);
            this.notify();
            throw error;
        }
        return like;
    },

    reset() {
        this.ids = null;
        this.failedAt = 0;
        this.notify();
    },

    notify() {
        for (const fn of this.listeners) {
            try {
                fn();
            } catch (error) {
                console.error('[netease-player]', error);
            }
        }
    },
};

async function toggleCurrentLike() {
    const id = miniBar.id;
    if (id == null) return;
    try {
        const like = await likes.toggle({ id });
        globalThis.toastr?.success(`${like ? '已红心' : '已取消红心'}：${miniBar.title}`, '', { timeOut: 1500 });
    } catch (error) {
        const text = error.needLogin ? '先在播放器的「账号与设置」里扫码登录网易云' : error.message;
        globalThis.toastr?.warning(text, '', { timeOut: 3000 });
    }
}

// 声波用封面的颜色：网易云的封面允许跨域读取时取最鲜艳的一块，读不到就用默认色
let tintPic = '';
function updateArtTint(el, pic) {
    if (!pic || pic === tintPic || el.dataset.state !== 'mid') return;
    tintPic = pic;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        try {
            const c = document.createElement('canvas');
            c.width = c.height = 12;
            const g = c.getContext('2d', { willReadFrequently: true });
            g.drawImage(img, 0, 0, 12, 12);
            const d = g.getImageData(0, 0, 12, 12).data;
            let best = null;
            for (let i = 0; i < d.length; i += 4) {
                const [h, sat, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
                const score = sat * (1 - Math.abs(l - 0.55) * 1.4);
                if (!best || score > best.score) best = { h, sat, score };
            }
            const hue = Math.round(best.h * 360);
            const s = Math.round(Math.max(0.55, best.sat) * 100);
            el.style.setProperty('--nep-art-tint', best.sat < 0.12 ? '#fff' : `hsl(${hue} ${s}% 68%)`);
        } catch {
            el.style.removeProperty('--nep-art-tint');
        }
    };
    img.onerror = () => el.style.removeProperty('--nep-art-tint');
    img.src = `${pic}?param=24y24`;
}

function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h / 6, s, l];
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
    album: '',
    id: null,
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
        if (away) collapseFloat();
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
            if (!showFloat) collapseFloat();
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
        const title = this.title || '网易云音乐';
        let floatResized = false;
        for (const el of [this.bar, this.float]) {
            if (!el || el.hidden) continue;
            const isFloat = el === this.float;
            const note = isFloat && this.needTap ? '轻点 ▶ 继续播放' : this.note;
            const subText = label || note || this.artist || (isFloat ? '轻点展开' : '点歌名打开播放器');
            const titleEl = el.querySelector('.nep-title');
            const sub = el.querySelector('.nep-sub');
            // 文字没变就不碰 DOM
            if (titleEl.textContent !== title || sub.textContent !== subText) {
                titleEl.textContent = title;
                sub.textContent = subText;
                if (isFloat) floatResized = true;
            }
            setTone(sub, tone);
            setArt(el, this.pic);
            for (const glyph of el.querySelectorAll('.nep-glyph')) {
                glyph.classList.toggle('fa-play', !this.playing);
                glyph.classList.toggle('fa-pause', !!this.playing);
            }
            const resume = el.querySelector('.nep-resume');
            if (resume) resume.hidden = !this.needTap;
        }
        const float = this.float;
        if (float && !float.hidden) {
            float.toggleAttribute('data-playing', !!this.playing);
            const midTitle = float.querySelector('.nep-mid-title');
            if (midTitle.textContent !== title) midTitle.textContent = title;
            const midSub = float.querySelector('.nep-mid-sub');
            const byline = [this.artist, this.album].filter(Boolean).join(' / ');
            const midText = label || this.note || byline || '去完整播放器里挑一个歌单';
            const like = float.querySelector('.nep-mid-like');
            const liked = this.id != null && likes.has(this.id);
            like.classList.toggle('nep-on', liked);
            like.disabled = this.id == null;
            like.setAttribute('aria-label', liked ? '取消红心' : '红心');
            updateArtTint(float, this.pic);
            if (midSub.textContent !== midText) midSub.textContent = midText;
            setTone(midSub, tone);
            // 文字变了宽度会变，重新贴边，免得超出屏幕；刚显示出来时也要摆一次
            if ((floatResized || !float.style.transform) && !float.classList.contains('nep-dragging')) placeFloat(float);
        }
    },
};

// ---------- 扩展设置面板里的条目 ----------

export const ENTRY_OPTIONS = [['float', '悬浮胶囊（可拖动）'], ['bar', '输入框上方的迷你播放条'], ['off', '关闭']];
export const GLASS_OPTIONS = [['auto', '跟随主题'], ['light', '浅色'], ['dark', '深色']];
export const GLASSFX_OPTIONS = [['clear', '通透（毛玻璃）'], ['solid', '不透明']];

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
            <label for="nep-settings-glassfx">玻璃质感</label>${select('nep-settings-glassfx', GLASSFX_OPTIONS)}
            <small>搜歌、歌单、扫码登录和其他设置在播放器右上角的「账号与设置」里。</small>
        </div>`;
    host.appendChild(el);
    const entry = el.querySelector('#nep-settings-entry');
    entry.value = settings.entry;
    entry.addEventListener('change', () => setEntry(entry.value));
    const glass = el.querySelector('#nep-settings-glass');
    glass.value = settings.glass;
    glass.addEventListener('change', () => setGlass(glass.value));
    const fx = el.querySelector('#nep-settings-glassfx');
    fx.value = settings.glassFx;
    fx.addEventListener('change', () => setGlassFx(fx.value));
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

export function setGlassFx(value) {
    settings.glassFx = value;
    saveSettings();
    applyGlass();
    const select = document.getElementById('nep-settings-glassfx');
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
    likes.listeners.add(() => miniBar.render());
    addMenuItem();
    addSettingsDrawer();
    bindGenerationEvents();
    restoreMiniBar();
    miniBar.apply();
}
