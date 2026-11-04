// 展开面板：首页（每日推荐、我的歌单、推荐歌单、排行榜）、歌单、搜索、播放队列、正在播放、账号与设置。
// 点开播放器时才加载。页面是一个栈：首页在底，其余页面推入，左上角返回。
import {
    api, store, settings, saveSettings, getLog, clearLog, gen, miniBar, resetFloatPosition,
    setEntry, setGlass, ENTRY_OPTIONS, GLASS_OPTIONS,
} from './index.js';
import * as engine from './engine.js';

const HISTORY_KEY = 'nep:v1:search-history';
const HISTORY_MAX = 8;

const CSS = `
#nep-panel{position:fixed;z-index:2900;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));
top:calc(var(--topBarBlockSize,50px) + env(safe-area-inset-top) + 6px);height:min(78dvh,680px);max-width:560px;margin:0 auto;
display:flex;flex-direction:column;box-sizing:border-box;border-radius:30px;font-size:15px;line-height:1.4;white-space:normal;
overflow:hidden;contain:layout style;transform-origin:50% 0;animation:nep-sheet .45s var(--nep-spring)}
@keyframes nep-sheet{from{opacity:0;transform:scale(.6,.2)}40%{opacity:1}}
#nep-panel[hidden],#nep-panel [hidden]{display:none!important}
#nep-panel *{box-sizing:border-box}
#nep-panel>.nep-top,#nep-panel>.nep-body,#nep-panel>.nep-nowbar{position:relative;z-index:1}
#nep-panel button{font:inherit;color:inherit;background:transparent;border:0;padding:0;margin:0;cursor:pointer;
-webkit-tap-highlight-color:transparent}
#nep-panel button:disabled{opacity:.5;cursor:default}
#nep-panel :is(button,input,select,[tabindex]):focus-visible{outline:2px solid var(--nep-accent);outline-offset:2px}
#nep-panel :is(h1,h2,h3){font-family:inherit;color:var(--nep-ink);text-shadow:none;letter-spacing:0}
#nep-panel .nep-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;font-size:17px;flex:none}
#nep-panel .nep-icon:active{background:var(--nep-raise-2)}
#nep-panel input[type=search],#nep-panel input[type=text],#nep-panel select{font:inherit;color:inherit;border:0;outline:0;
min-width:0;background:var(--nep-raise);border-radius:12px;padding:9px 12px}
#nep-panel input::placeholder{color:var(--nep-ink-2)}

.nep-top{flex:none;display:flex;align-items:center;gap:2px;height:56px;padding:0 10px 0 18px}
.nep-top.nep-has-back{padding-left:6px}
.nep-top h1{flex:1;min-width:0;margin:0;font-size:18px;font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-top .nep-avatar img{width:28px;height:28px;border-radius:50%;object-fit:cover;display:block}
.nep-body{flex:1;min-height:0;contain:content;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:2px 16px 20px}

.nep-sec{margin:0 0 26px}
.nep-sec-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;margin:0 0 6px}
.nep-sec-head h2{margin:0;font-size:17px;font-weight:600}
#nep-panel .nep-sec-head .nep-icon,#nep-panel .nep-actions .nep-icon{color:var(--nep-ink-2)}
.nep-text-btn{color:var(--nep-ink-2)!important;font-size:13px!important;padding:6px 2px!important}
.nep-hint{color:var(--nep-ink-2);font-size:13px;line-height:1.5;margin:6px 2px}
.nep-hint b{color:var(--nep-ink);font-weight:600}
.nep-error{color:var(--nep-accent);font-size:13px;margin:6px 2px}
.nep-bone{display:block;border-radius:6px;background:var(--nep-raise)}

.nep-daily{display:flex;align-items:center;gap:14px;padding:14px 14px 14px 12px;border-radius:22px;background:var(--nep-tint);
color:var(--nep-tint-ink);cursor:pointer}
.nep-daily:active{background:var(--nep-tint-2)}
.nep-date{flex:none;display:flex;flex-direction:column;align-items:center;justify-content:center;width:68px;height:76px;
border-radius:16px;background:var(--nep-paper);color:var(--nep-ink);line-height:1}
.nep-date small{font-size:12px;color:var(--nep-tint-ink)}
.nep-date b{font-size:34px;font-weight:700;margin:4px 0 3px;font-variant-numeric:tabular-nums;letter-spacing:-.02em}
.nep-date span{font-size:12px;color:var(--nep-ink-2)}
.nep-daily-text{flex:1;min-width:0}
.nep-daily-text h2{margin:0;font-size:17px;font-weight:600;color:var(--nep-tint-ink)}
.nep-daily-meta{font-size:13px;margin-top:2px}
.nep-daily-songs{font-size:13px;margin-top:6px;color:var(--nep-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nep-panel .nep-play-fab{display:grid;place-items:center;flex:none;width:46px;height:46px;border-radius:50%;
background:var(--nep-accent);color:var(--nep-on-accent);font-size:17px}
#nep-panel .nep-play-fab i{margin-left:2px}
#nep-panel .nep-daily .nep-btn{flex:none}

.nep-row{display:flex;align-items:center;gap:12px;min-height:62px;padding:6px 2px 6px 6px;margin:0 -6px;border-radius:14px;cursor:pointer}
.nep-row:active{background:var(--nep-raise)}
.nep-row img,.nep-row .nep-ph{width:46px;height:46px;border-radius:9px;object-fit:cover;flex:none;background:var(--nep-raise-2)}
.nep-rank{flex:none;width:30px;text-align:center;font-weight:600;font-variant-numeric:tabular-nums;color:var(--nep-ink-2)}
.nep-row-main{flex:1;min-width:0}
.nep-row-title,.nep-row-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-row-sub{margin-top:2px;color:var(--nep-ink-2);font-size:13px}
.nep-row.nep-current .nep-row-title{color:var(--nep-accent);font-weight:600}
.nep-row .nep-icon{color:var(--nep-ink-2);font-size:15px}
.nep-heart-off{color:transparent!important;-webkit-text-stroke:1.6px var(--nep-ink-2)}
.nep-heart{color:var(--nep-accent);font-size:11px;margin-left:6px;vertical-align:1px}
.nep-badge{display:inline-block;margin-left:6px;padding:1px 5px;border-radius:5px;font-size:11px;font-weight:600;vertical-align:1px;
color:var(--nep-tint-ink);background:var(--nep-tint)}
.nep-more{height:1px}

.nep-shelf{display:grid;grid-auto-flow:column;grid-auto-columns:118px;gap:12px;overflow-x:auto;margin:0 -16px;padding:2px 16px 4px;
scroll-snap-type:x mandatory;scroll-padding:0 16px;scrollbar-width:none}
.nep-shelf::-webkit-scrollbar{display:none}
.nep-tile{scroll-snap-align:start;cursor:pointer;min-width:0}
.nep-tile-art{position:relative;width:118px;height:118px;border-radius:14px;overflow:hidden;background:var(--nep-raise-2)}
.nep-tile-art img{width:100%;height:100%;object-fit:cover;display:block}
.nep-tile-art span{position:absolute;right:6px;bottom:6px;padding:2px 7px;border-radius:9px;background:rgba(0,0,0,.5);color:#fff;
font-size:11px;font-weight:600;font-variant-numeric:tabular-nums}
.nep-tile-name{margin-top:6px;font-size:13px;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.nep-chart{display:flex;gap:12px;align-items:center;padding:6px 0;cursor:pointer;border-radius:14px}
.nep-chart:active{background:var(--nep-raise)}
.nep-chart img,.nep-chart .nep-ph{width:76px;height:76px;border-radius:12px;object-fit:cover;flex:none;background:var(--nep-raise-2)}
.nep-chart-main{flex:1;min-width:0}
.nep-chart-name{font-weight:600}
.nep-chart-name small{font-weight:400;font-size:12px;color:var(--nep-ink-2);margin-left:6px}
.nep-chart ol{margin:4px 0 0;padding:0;list-style:none;font-size:13px;color:var(--nep-ink-2)}
.nep-chart li{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:1.5}
.nep-chart li b{display:inline-block;width:14px;color:var(--nep-ink);font-weight:600;font-variant-numeric:tabular-nums}

.nep-pl-head{display:flex;gap:14px;align-items:center;margin:2px 0 14px}
.nep-pl-head img,.nep-pl-head .nep-ph{width:104px;height:104px;border-radius:16px;object-fit:cover;flex:none;background:var(--nep-raise-2)}
.nep-pl-head .nep-date{width:104px;height:104px;border-radius:16px;background:var(--nep-tint)}
.nep-pl-head .nep-date b{font-size:40px}
.nep-pl-name{margin:0;font-size:19px;font-weight:600;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nep-pl-meta{margin-top:4px;font-size:13px;color:var(--nep-ink-2)}
.nep-actions{display:flex;gap:8px;align-items:center;margin:0 0 8px}
#nep-panel .nep-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:38px;padding:0 16px;border-radius:19px;
background:var(--nep-raise);font-weight:600;font-size:14px;white-space:nowrap}
#nep-panel .nep-btn:active{background:var(--nep-raise-3)}
#nep-panel .nep-btn-primary{background:var(--nep-accent);color:var(--nep-on-accent)}
#nep-panel .nep-btn-primary:active{filter:brightness(.92);background:var(--nep-accent)}
#nep-panel .nep-btn-tint{background:var(--nep-tint);color:var(--nep-tint-ink)}
#nep-panel .nep-btn-tint:active{background:var(--nep-tint-2)}
.nep-actions .nep-icon{margin-left:auto}

.nep-search{display:flex;gap:8px;margin:0 0 12px}
.nep-search input{flex:1;height:40px}
.nep-chips{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 0}
#nep-panel .nep-chip{height:32px;padding:0 13px;border-radius:16px;background:var(--nep-raise);font-size:14px;max-width:100%;
overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.nep-nowbar{flex:none;display:flex;align-items:center;gap:10px;height:62px;margin:0 8px 8px;padding:0 6px 0 9px;border-radius:22px;
background:var(--nep-raise);cursor:pointer;overflow:hidden}
.nep-nowbar[hidden]{display:none}
.nep-nowbar>img{width:44px;height:44px;border-radius:10px;object-fit:cover;flex:none;background:var(--nep-raise-2)}
.nep-nowbar-text{flex:1;min-width:0;line-height:1.3}
.nep-nowbar-title,.nep-nowbar-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-nowbar-title{font-weight:600}
.nep-nowbar-sub{font-size:13px;color:var(--nep-ink-2)}
.nep-nowbar-line{position:absolute;left:22px;right:22px;bottom:0;height:2px;border-radius:1px;background:var(--nep-raise-2);overflow:hidden}
.nep-nowbar-line i{display:block;height:100%;background:var(--nep-accent);transform-origin:0 50%;transform:scaleX(0)}
.nep-gen{color:var(--nep-busy)!important}
.nep-done{color:var(--nep-ok)!important}

.nep-np{display:flex;flex-direction:column;padding:4px 4px 8px}
.nep-np-cover{align-self:center;width:min(248px,62vw,34dvh);aspect-ratio:1;border-radius:20px;object-fit:cover;background:var(--nep-raise-2)}
.nep-np-info{display:flex;align-items:center;gap:4px;margin-top:22px}
.nep-np-text{flex:1;min-width:0}
.nep-np-title{font-size:20px;font-weight:600;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-np-sub{margin-top:2px;color:var(--nep-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nep-panel .nep-np-info .nep-icon{font-size:20px;color:var(--nep-ink-2)}
#nep-panel .nep-np-info .nep-like.nep-on{color:var(--nep-accent)}
.nep-progress{display:flex;align-items:center;gap:10px;margin-top:14px;font-size:12px;font-weight:600;color:var(--nep-ink-2);
font-variant-numeric:tabular-nums}
.nep-progress span{width:36px}
.nep-progress span:last-child{text-align:right}
.nep-progress input{flex:1;height:5px;margin:0;-webkit-appearance:none;appearance:none;border-radius:3px;
/* taste-skill-ignore: 单色进度填充，不是渐变 */background:linear-gradient(var(--nep-ink),var(--nep-ink)) 0/var(--nep-fill,0%) 100% no-repeat,var(--nep-raise-3)}
.nep-progress input::-webkit-slider-thumb{-webkit-appearance:none;width:15px;height:15px;border-radius:50%;background:var(--nep-ink);border:0}
.nep-progress input::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--nep-ink);border:0}
.nep-controls{display:flex;justify-content:space-between;align-items:center;margin-top:10px}
#nep-panel .nep-controls .nep-icon{width:48px;height:48px;font-size:22px}
#nep-panel .nep-controls .nep-side{font-size:17px;color:var(--nep-ink-2)}
#nep-panel .nep-controls .nep-side.nep-on{color:var(--nep-accent)}
#nep-panel .nep-controls .nep-np-toggle{width:66px;height:66px;background:var(--nep-accent);color:var(--nep-on-accent);font-size:26px}
#nep-panel .nep-np-queue{align-self:center;margin-top:10px}

.nep-scrim{position:absolute;inset:0;z-index:5;display:flex;align-items:flex-end;padding:8px;background:rgba(0,0,0,.28);
animation:nep-fade .2s ease}
@keyframes nep-fade{from{opacity:0}}
.nep-sheet{width:100%;max-height:86%;overflow-y:auto;overscroll-behavior:contain;padding:8px;border-radius:24px;background:var(--nep-paper);
box-shadow:0 10px 40px rgba(0,0,0,.25);animation:nep-rise .35s var(--nep-spring)}
@keyframes nep-rise{from{transform:translateY(40%);opacity:0}}
.nep-sheet-head{display:flex;align-items:center;gap:12px;padding:8px 10px 10px}
.nep-sheet-head img,.nep-sheet-head .nep-ph{width:46px;height:46px;border-radius:9px;object-fit:cover;background:var(--nep-raise-2);flex:none}
.nep-sheet-head h3{margin:0;font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-sheet-head div{min-width:0}
#nep-panel .nep-act{display:flex;align-items:center;gap:14px;width:100%;min-height:50px;padding:0 12px;border-radius:14px;
text-align:left;font-size:15px}
#nep-panel .nep-act:active{background:var(--nep-raise)}
.nep-act>i{width:20px;text-align:center;color:var(--nep-ink-2);font-size:16px}
.nep-act.nep-on>i{color:var(--nep-accent)}
.nep-act img,.nep-act .nep-ph{width:40px;height:40px;border-radius:8px;object-fit:cover;background:var(--nep-raise-2);flex:none}
.nep-act span:not(.nep-ph){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-act small{color:var(--nep-ink-2);font-size:13px}
#nep-panel .nep-sheet-cancel{width:100%;height:48px;margin-top:6px;border-radius:14px;background:var(--nep-raise);font-weight:600}

.nep-group-title{margin:18px 14px 6px;font-size:13px;color:var(--nep-ink-2)}
.nep-group-title:first-child{margin-top:4px}
.nep-group{border-radius:18px;background:var(--nep-raise);padding:4px 0}
.nep-set{display:flex;align-items:center;gap:12px;min-height:48px;padding:6px 14px}
.nep-set>span{flex:1;min-width:0}
.nep-set select{max-width:58%;text-align:right;background:transparent!important;padding:6px 0!important;color:var(--nep-ink-2)!important}
.nep-group .nep-hint{margin:0;padding:2px 14px 10px}
.nep-group .nep-row{margin:0;padding:8px 14px;cursor:default;border-radius:0}
.nep-group .nep-btn{margin:4px 14px 10px}
.nep-switch{-webkit-appearance:none;appearance:none;position:relative;flex:none;width:46px;height:28px;margin:0;border-radius:14px;
background:var(--nep-raise-3);cursor:pointer;transition:background .2s}
.nep-switch::after{content:"";position:absolute;top:2px;left:2px;width:24px;height:24px;border-radius:50%;background:#fff;
box-shadow:0 1px 3px rgba(0,0,0,.25);transition:transform .3s var(--nep-spring)}
.nep-switch:checked{background:var(--nep-ok)}
.nep-switch:checked::after{transform:translateX(18px)}
.nep-qr{display:block;width:196px;height:196px;margin:6px auto 10px;background:#fff;border-radius:16px;padding:8px}
.nep-log{margin:0 14px 8px;font-size:11px;line-height:1.55;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;
word-break:break-all;color:var(--nep-ink-2);max-height:220px;overflow:auto}
#nep-panel .nep-danger{color:var(--nep-accent)}
@media (prefers-reduced-motion:reduce){#nep-panel,.nep-sheet,.nep-scrim{animation:none}.nep-switch::after{transition:none}}
`;

// ---------- 状态 ----------

const state = {
    stack: [{ view: 'home' }],
    home: { daily: null, dailyError: '', rec: null, recError: '', top: null, topError: '', loadedAt: 0 },
    search: { keywords: '', tracks: [], hasMore: false, offset: 0, loading: false, error: '' },
    history: (store.get(HISTORY_KEY, []) || []).slice(0, HISTORY_MAX),
    playlists: null,
    playlistsError: '',
    playlistsLoading: false,
    playlist: null, // { kind: mine|rec|top|daily, meta, tracks, hasMore, loading, error }
    likes: null, // Set<number>
    likesLoading: false,
    account: null,
    accountError: '',
    qr: null,
    sheet: null, // { track, i, mode: 'actions' | 'collect' }
};

let root = null;
let top = null;
let body = null;
let nowbar = null;
let unsubscribe = null;
let qrTimer = null;
let progressTimer = null;
let seeking = false;
let playlistsCheckedAt = 0;

// 打开面板时自动检查歌单更新，短时间内反复开关只查一次；首页推荐半小时内不重复拉
const AUTO_CHECK_INTERVAL = 10 * 1000;
const HOME_TTL = 30 * 60 * 1000;

const view = () => state.stack[state.stack.length - 1];
const loggedIn = () => !!state.account?.loggedIn;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const art = (url, size = 120) => (url ? `${url}?param=${size}y${size}` : '');
const img = (url, size) => (url ? `<img loading="lazy" src="${esc(art(url, size))}" alt="">` : '<span class="nep-ph"></span>');
const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, '', { timeOut: kind === 'error' ? 4000 : 1800 });

function fmtTime(sec) {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}

function fmtPlays(n) {
    n = Number(n) || 0;
    if (n >= 1e8) return `${(n / 1e8).toFixed(1).replace(/\.0$/, '')}亿`;
    if (n >= 1e4) return `${Math.round(n / 1e4)}万`;
    return String(n);
}

function today() {
    const d = new Date();
    return { month: `${d.getMonth() + 1}月`, day: d.getDate(), week: `星期${'日一二三四五六'[d.getDay()]}` };
}

function badges(t) {
    if (t.st < 0) return '<span class="nep-badge">无版权</span>';
    if (t.fee === 1) return '<span class="nep-badge">VIP</span>';
    return '';
}

const isLiked = (id) => !!state.likes?.has(Number(id));

// ---------- 长列表分批渲染：先画 LIST_STEP 行，滑到底附近再接着画 ----------

const LIST_STEP = 60;
let list = null; // { key, items, row, shown, hasMore, loadMore }
let moreObserver = null;

/**
 * 只渲染前一批行，后面放一个占位元素，滚到附近时 showMore() 再追加。
 * 同一个 key 重新渲染（或返回到这一页）时保留已经显示的行数，避免滚动位置跳回去。
 */
function lazyList(key, items, row, { hasMore = null, loadMore = null } = {}) {
    const prevShown = list?.key === key ? list.shown : (view().listKey === key ? view().shown || 0 : 0);
    const shown = Math.min(items.length, Math.max(LIST_STEP, prevShown));
    list = { key, items, row, shown, hasMore, loadMore };
    let html = '';
    for (let i = 0; i < shown; i++) html += row(items[i], i);
    if (needMore()) html += '<div class="nep-more"></div>';
    return html;
}

function needMore() {
    return !!list && (list.shown < list.items.length || !!list.hasMore?.());
}

function watchMore() {
    const el = body.querySelector('.nep-more');
    moreObserver?.disconnect();
    if (!el) return;
    moreObserver ??= new IntersectionObserver((entries) => {
        if (entries.some(e => e.isIntersecting)) showMore();
    }, { root: body, rootMargin: '0px 0px 600px 0px' });
    moreObserver.observe(el);
}

function showMore() {
    const el = body.querySelector('.nep-more');
    if (!el || !list) return;
    if (list.shown >= list.items.length) {
        // 已经画到底：去拉下一页，拉回来后 syncMore() 再接着画
        moreObserver.unobserve(el);
        if (list.hasMore?.()) list.loadMore?.();
        else el.remove();
        return;
    }
    const from = list.shown;
    list.shown = Math.min(list.items.length, from + LIST_STEP);
    let html = '';
    for (let i = from; i < list.shown; i++) html += list.row(list.items[i], i);
    el.insertAdjacentHTML('beforebegin', html);
    moreObserver.unobserve(el);
    if (needMore()) moreObserver.observe(el);
    else el.remove();
}

/** 列表数据变多（拉到了下一页）后，补上占位元素并重新观察，不重画已有的行。 */
function syncMore() {
    const el = body.querySelector('.nep-more');
    if (needMore() && !el) {
        body.querySelector('.nep-list-foot')?.insertAdjacentHTML('beforebegin', '<div class="nep-more"></div>');
    } else if (!needMore() && el) {
        el.remove();
    }
    watchMore();
}

/** 一首歌一行：封面（排行榜用名次），歌名和歌手，行尾「更多」。 */
function trackRow(t, i, { current = false, rank = false, trailing = null } = {}) {
    const lead = rank ? `<span class="nep-rank">${i + 1}</span>` : img(t.pic, 92);
    const heart = isLiked(t.id) ? '<i class="fa-solid fa-heart nep-heart" aria-label="已红心"></i>' : '';
    const tail = trailing ?? `<button type="button" class="nep-icon" data-act="more" data-i="${i}" aria-label="更多操作：${esc(t.name)}">
        <i class="fa-solid fa-ellipsis"></i></button>`;
    return `<div class="nep-row${current ? ' nep-current' : ''}" data-i="${i}">${lead}
        <div class="nep-row-main"><div class="nep-row-title">${esc(t.name)}${heart}${badges(t)}</div>
        <div class="nep-row-sub">${esc(t.ar)}</div></div>${tail}</div>`;
}

// ---------- 面板骨架 ----------

function build() {
    const style = document.createElement('style');
    style.id = 'nep-panel-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    root = document.createElement('div');
    root.id = 'nep-panel';
    root.className = 'nep-glass';
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', '网易云音乐');
    root.innerHTML = `
        <div class="nep-top">
            <button type="button" class="nep-icon nep-back" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>
            <h1></h1>
            <button type="button" class="nep-icon" data-nav="search" aria-label="搜索"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button type="button" class="nep-icon nep-avatar" data-nav="settings" aria-label="账号与设置"><i class="fa-solid fa-circle-user"></i></button>
            <button type="button" class="nep-icon nep-close" aria-label="收起播放器"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="nep-body"></div>
        <div class="nep-nowbar" hidden role="button" tabindex="0" aria-label="打开正在播放">
            <img alt="">
            <div class="nep-nowbar-text"><div class="nep-nowbar-title"></div><div class="nep-nowbar-sub"></div></div>
            <button type="button" class="nep-icon nep-toggle" aria-label="播放/暂停"><i class="fa-solid fa-play"></i></button>
            <button type="button" class="nep-icon nep-next" aria-label="下一首"><i class="fa-solid fa-forward"></i></button>
            <button type="button" class="nep-icon" data-nav="queue" aria-label="播放队列"><i class="fa-solid fa-list-ul"></i></button>
            <div class="nep-nowbar-line"><i></i></div>
        </div>`;
    document.body.appendChild(root);
    top = root.querySelector('.nep-top');
    body = root.querySelector('.nep-body');
    nowbar = root.querySelector('.nep-nowbar');

    root.querySelector('.nep-close').addEventListener('click', close);
    root.querySelector('.nep-back').addEventListener('click', back);
    nowbar.querySelector('.nep-toggle').addEventListener('click', (e) => {
        e.stopPropagation();
        engine.toggle();
    });
    nowbar.querySelector('.nep-next').addEventListener('click', (e) => {
        e.stopPropagation();
        engine.next();
    });
    nowbar.addEventListener('click', (e) => {
        e.stopPropagation();
        const nav = e.target.closest('[data-nav]');
        go(nav ? nav.dataset.nav : 'now');
    });
    nowbar.addEventListener('keydown', (e) => {
        if (e.target === nowbar && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            go('now');
        }
    });
    top.addEventListener('click', (e) => {
        const nav = e.target.closest('[data-nav]');
        if (nav) go(nav.dataset.nav);
    });
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('[role=button][data-act]')) {
            e.preventDefault();
            e.target.click();
            return;
        }
        if (e.key !== 'Escape') return;
        e.stopPropagation();
        if (state.sheet) closeSheet();
        else if (state.stack.length > 1) back();
        else close();
    });
}

export function open() {
    if (!root) build();
    root.hidden = false;
    unsubscribe?.();
    unsubscribe = engine.onChange(() => {
        renderNow();
        if (view().view === 'queue') renderBody();
        else markCurrentRow();
    });
    gen.listeners.add(renderNow);
    clearInterval(progressTimer);
    progressTimer = setInterval(renderProgress, 1000);
    render();
    if (!state.account && !state.accountError) {
        refreshAccount();
    } else if (state.account) {
        autoCheckPlaylists();
        if (Date.now() - state.home.loadedAt > HOME_TTL) loadHome();
    }
}

export function isOpen() {
    return !!root && !root.hidden;
}

export function close() {
    if (!root) return;
    closeSheet();
    root.hidden = true;
    miniBar.setAway(false);
    unsubscribe?.();
    unsubscribe = null;
    gen.listeners.delete(renderNow);
    clearInterval(progressTimer);
}

// ---------- 页面栈 ----------

function remember() {
    const v = view();
    v.scroll = body.scrollTop;
    v.listKey = list?.key;
    v.shown = list?.shown;
}

function go(name) {
    if (name === view().view && name !== 'playlist') return;
    closeSheet();
    remember();
    // 搜索、设置、正在播放、队列、我的歌单这几页在栈里只留一份
    if (name !== 'playlist') {
        const at = state.stack.findIndex(v => v.view === name);
        if (at > 0) state.stack.splice(at);
    }
    state.stack.push({ view: name });
    list = null;
    if (name === 'playlists' && !state.playlists && !state.playlistsLoading) loadPlaylists();
    render();
    body.scrollTop = 0;
    if (name === 'search' && !state.search.tracks.length) body.querySelector('input[name=keywords]')?.focus({ preventScroll: true });
}

function back() {
    if (state.stack.length < 2) return;
    closeSheet();
    state.stack.pop();
    list = null;
    render();
    body.scrollTop = view().scroll || 0;
}

// ---------- 渲染 ----------

function render() {
    renderTop();
    renderBody();
    renderNow();
}

const TITLES = { home: '网易云音乐', search: '搜索', queue: '播放队列', settings: '账号与设置', now: '正在播放', playlists: '我的歌单' };

function renderTop() {
    const v = view().view;
    let title = TITLES[v] || '';
    if (v === 'playlist') title = { daily: '每日推荐', top: '排行榜', rec: '推荐歌单' }[state.playlist?.kind] || '歌单';
    top.querySelector('h1').textContent = title;
    const canBack = state.stack.length > 1;
    top.classList.toggle('nep-has-back', canBack);
    top.querySelector('.nep-back').hidden = !canBack;
    top.querySelector('[data-nav=search]').hidden = v === 'search';
    const avatar = top.querySelector('.nep-avatar');
    avatar.hidden = v === 'settings';
    const pic = state.account?.loggedIn && state.account.avatar ? art(state.account.avatar, 80) : '';
    if (avatar.dataset.pic !== pic) {
        avatar.dataset.pic = pic;
        avatar.innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : '<i class="fa-solid fa-circle-user"></i>';
    }
}

function renderBody() {
    if (!body) return;
    const renderers = {
        home: renderHome, search: renderSearch, playlist: renderPlaylist, playlists: renderMyPlaylists,
        queue: renderQueue, settings: renderSettings, now: renderNowView,
    };
    body.innerHTML = (renderers[view().view] || renderHome)();
    watchMore();
    if (view().view === 'now') renderNow();
}

/** 播放状态变了：只改当前行的高亮，不重画整个列表。 */
function markCurrentRow() {
    if (!body || !['playlist', 'search'].includes(view().view)) return;
    const s = engine.getState();
    const id = s.silent ? null : s.track?.id;
    for (const row of body.querySelectorAll('.nep-row[data-i]')) {
        const t = trackAt(Number(row.dataset.i));
        row.classList.toggle('nep-current', !!t && t.id === id);
    }
}

// ---------- 首页 ----------

function renderHome() {
    let html = `<section class="nep-sec">${renderDaily()}</section>`;
    if (state.account?.loggedIn !== false) html += renderMineSection();
    html += renderRecSection();
    html += renderTopSection();
    return html;
}

function dateBlock() {
    const d = today();
    return `<div class="nep-date" aria-hidden="true"><small>${d.month}</small><b>${d.day}</b><span>${d.week}</span></div>`;
}

function renderDaily() {
    const h = state.home;
    if (state.account && !state.account.loggedIn) {
        return `<div class="nep-daily" data-nav="settings">${dateBlock()}
            <div class="nep-daily-text"><h2>每日推荐</h2>
            <div class="nep-daily-meta">登录网易云后，每天 6 点按你的口味换 30 首</div></div>
            <button type="button" class="nep-btn nep-btn-primary" data-nav="settings">扫码登录</button></div>`;
    }
    if (h.dailyError) {
        return `<div class="nep-daily" data-act="reload-daily">${dateBlock()}
            <div class="nep-daily-text"><h2>每日推荐</h2><div class="nep-daily-meta">没取到：${esc(h.dailyError)}</div></div>
            <button type="button" class="nep-btn nep-btn-tint" data-act="reload-daily">重试</button></div>`;
    }
    if (!h.daily) {
        return `<div class="nep-daily" aria-busy="true">${dateBlock()}
            <div class="nep-daily-text"><h2>每日推荐</h2>
            <span class="nep-bone" style="width:70%;height:13px;margin-top:6px"></span>
            <span class="nep-bone" style="width:90%;height:13px;margin-top:8px"></span></div></div>`;
    }
    const names = h.daily.slice(0, 4).map(t => t.name).join('、');
    return `<div class="nep-daily" data-act="open-daily" role="button" tabindex="0" aria-label="打开每日推荐">${dateBlock()}
        <div class="nep-daily-text"><h2>每日推荐</h2>
        <div class="nep-daily-meta">${h.daily.length} 首，今天 6 点更新</div>
        <div class="nep-daily-songs">${esc(names)}</div></div>
        <button type="button" class="nep-play-fab" data-act="play-daily" aria-label="播放每日推荐"><i class="fa-solid fa-play"></i></button></div>`;
}

function playlistRow(p, i) {
    const note = p.liked || p.mine ? '' : '，收藏的歌单';
    const heart = p.liked ? '<i class="fa-solid fa-heart nep-heart"></i>' : '';
    return `<div class="nep-row" data-act="open-playlist" data-i="${i}">${img(p.cover, 92)}
        <div class="nep-row-main"><div class="nep-row-title">${esc(p.name)}${heart}</div>
        <div class="nep-row-sub">${p.count} 首${note}</div></div></div>`;
}

function refreshButton(act) {
    const busy = state.playlistsLoading || !!state.playlist?.loading;
    return `<button type="button" class="nep-icon" data-act="${act}" ${busy ? 'disabled' : ''} aria-label="刷新：跳过缓存，从网易云重新获取">
        <i class="fa-solid fa-rotate-right${busy ? ' fa-spin' : ''}"></i></button>`;
}

const ROW_BONE = '<div class="nep-row" aria-hidden="true"><span class="nep-ph"></span><div class="nep-row-main">'
    + '<span class="nep-bone" style="width:50%;height:14px"></span><span class="nep-bone" style="width:24%;height:12px;margin-top:7px"></span></div></div>';

function renderMineSection() {
    const html = `<section class="nep-sec"><div class="nep-sec-head"><h2>我的歌单</h2>${refreshButton('refresh-playlists')}</div>`;
    if (state.playlistsError) {
        return `${html}<div class="nep-error">${esc(state.playlistsError)}</div>
            <button type="button" class="nep-btn" data-act="reload-playlists">重试</button></section>`;
    }
    if (!state.playlists) return `${html}${ROW_BONE.repeat(3)}</section>`;
    if (!state.playlists.length) return `${html}<div class="nep-hint">网易云账号里还没有歌单。</div></section>`;
    const shown = state.playlists.slice(0, 4);
    let rows = shown.map((p, i) => playlistRow(p, i)).join('');
    if (state.playlists.length > shown.length) {
        rows += `<button type="button" class="nep-btn" data-nav="playlists" style="width:100%;margin-top:6px">全部 ${state.playlists.length} 个歌单</button>`;
    }
    return `${html}${rows}</section>`;
}

function renderMyPlaylists() {
    if (!state.playlists) return renderMineSection();
    return `<div class="nep-sec-head"><h2>${state.playlists.length} 个歌单</h2>${refreshButton('refresh-playlists')}</div>`
        + lazyList('playlists', state.playlists, playlistRow);
}

function renderRecSection() {
    const h = state.home;
    let html = '<section class="nep-sec"><div class="nep-sec-head"><h2>推荐歌单</h2></div>';
    if (h.recError) return `${html}<div class="nep-error">${esc(h.recError)}</div><button type="button" class="nep-btn" data-act="reload-home">重试</button></section>`;
    const tiles = h.rec || [null, null, null, null];
    html += '<div class="nep-shelf">';
    html += tiles.map((p, i) => (p
        ? `<div class="nep-tile" data-act="open-rec" data-i="${i}" role="button" tabindex="0">
            <div class="nep-tile-art">${p.cover ? `<img loading="lazy" src="${esc(art(p.cover, 236))}" alt="">` : ''}
            ${p.plays ? `<span><i class="fa-solid fa-play" style="font-size:8px;margin-right:4px"></i>${fmtPlays(p.plays)}</span>` : ''}</div>
            <div class="nep-tile-name">${esc(p.name)}</div></div>`
        : '<div class="nep-tile" aria-hidden="true"><div class="nep-tile-art"></div><span class="nep-bone" style="width:90%;height:12px;margin-top:8px"></span></div>')).join('');
    return `${html}</div></section>`;
}

function renderTopSection() {
    const h = state.home;
    let html = '<section class="nep-sec"><div class="nep-sec-head"><h2>排行榜</h2></div>';
    if (h.topError) return `${html}<div class="nep-error">${esc(h.topError)}</div><button type="button" class="nep-btn" data-act="reload-home">重试</button></section>`;
    if (!h.top) {
        const bone = '<div class="nep-chart" aria-hidden="true"><span class="nep-ph"></span><div class="nep-chart-main">'
            + '<span class="nep-bone" style="width:30%;height:14px"></span><span class="nep-bone" style="width:80%;height:12px;margin-top:9px"></span>'
            + '<span class="nep-bone" style="width:70%;height:12px;margin-top:7px"></span></div></div>';
        return `${html}${bone.repeat(2)}</section>`;
    }
    html += h.top.map((t, i) => `<div class="nep-chart" data-act="open-top" data-i="${i}" role="button" tabindex="0">${img(t.cover, 152)}
        <div class="nep-chart-main"><div class="nep-chart-name">${esc(t.name)}<small>${esc(t.update)}</small></div>
        <ol>${t.top.map((x, k) => `<li><b>${k + 1}</b>${esc(x.name)}，${esc(x.ar)}</li>`).join('')}</ol></div></div>`).join('');
    return `${html}</section>`;
}

// ---------- 歌单页 ----------

function renderPlaylist() {
    const pl = state.playlist;
    if (!pl) return '<div class="nep-hint">歌单已关闭。</div>';
    const m = pl.meta;
    const metaText = {
        daily: `${pl.tracks.length} 首，每天 6 点更新`,
        top: [m.update, pl.tracks.length ? `${pl.tracks.length} 首` : ''].filter(Boolean).join('，'),
        rec: `${m.count} 首${m.plays ? `，播放 ${fmtPlays(m.plays)} 次` : ''}`,
        mine: `${m.count} 首${m.liked || m.mine ? '' : '，收藏的歌单'}`,
    }[pl.kind];
    const cover = pl.kind === 'daily' ? dateBlock() : img(m.cover, 208);
    let html = `<div class="nep-pl-head">${cover}<div style="min-width:0">
        <h2 class="nep-pl-name">${esc(m.name)}</h2><div class="nep-pl-meta">${esc(metaText)}</div></div></div>
        <div class="nep-actions">
            <button type="button" class="nep-btn nep-btn-primary" data-act="play-all" ${pl.tracks.length ? '' : 'disabled'}><i class="fa-solid fa-play"></i>播放全部</button>
            <button type="button" class="nep-btn nep-btn-tint" data-act="shuffle-all" ${pl.tracks.length ? '' : 'disabled'}><i class="fa-solid fa-shuffle"></i>随机播放</button>
            ${pl.kind === 'daily' ? '' : refreshButton('refresh-playlist')}
        </div>`;
    const s = engine.getState();
    const currentId = s.silent ? null : s.track?.id;
    html += lazyList(`pl:${m.id}`, pl.tracks, (t, i) => trackRow(t, i, { current: t.id === currentId, rank: pl.kind === 'top' }), {
        // 滑到底自动拉下一页；出错后停下，等手动点「加载更多」
        hasMore: () => pl.hasMore && !pl.error,
        loadMore: () => loadPlaylistPage(),
    });
    return `${html}<div class="nep-list-foot">${playlistFoot(pl)}</div>`;
}

function playlistFoot(pl) {
    let html = pl.error ? `<div class="nep-error">${esc(pl.error)}</div>` : '';
    if (pl.loading) html += '<div class="nep-hint">加载中…</div>';
    else if (pl.hasMore) html += '<button type="button" class="nep-btn" data-act="playlist-more" style="width:100%;margin-top:8px">加载更多</button>';
    else if (!pl.tracks.length && !pl.error) html += '<div class="nep-hint">这个歌单是空的。</div>';
    return html;
}

/**
 * 歌单页的「加载中/加载更多」和新拉到的歌只做局部更新，不重画整个列表。
 * 歌单页没在显示（或换了歌单）就什么都不做，下次切过去会整体渲染。
 */
function updatePlaylistView(pl) {
    if (!pl || view().view !== 'playlist' || state.playlist !== pl || root.hidden) return;
    const foot = body.querySelector('.nep-list-foot');
    const fresh = list?.key !== `pl:${pl.meta.id}` || list.items !== pl.tracks;
    if (!foot || fresh || (pl.tracks.length && !body.querySelector('.nep-row'))) {
        const scroll = body.scrollTop;
        renderBody();
        body.scrollTop = scroll;
        return;
    }
    foot.innerHTML = playlistFoot(pl);
    const refresh = body.querySelector('[data-act=refresh-playlist]');
    if (refresh) refresh.outerHTML = refreshButton('refresh-playlist');
    for (const b of body.querySelectorAll('[data-act=play-all],[data-act=shuffle-all]')) b.disabled = !pl.tracks.length;
    const meta = body.querySelector('.nep-pl-meta');
    if (meta && pl.kind === 'top') meta.textContent = [pl.meta.update, `${pl.tracks.length} 首`].filter(Boolean).join('，');
    syncMore();
}

// ---------- 搜索 ----------

function renderSearch() {
    const s = state.search;
    let html = `<form class="nep-search" data-form="search" role="search">
        <input type="search" name="keywords" placeholder="歌名、歌手" aria-label="搜索歌名或歌手" value="${esc(s.keywords)}" enterkeyhint="search" autocomplete="off">
        <button type="submit" class="nep-btn nep-btn-primary">搜索</button></form>`;
    if (s.error) html += `<div class="nep-error">${esc(s.error)}</div>`;
    if (!s.tracks.length && !s.loading) {
        if (state.history.length) {
            html += `<div class="nep-sec-head"><h2>最近搜索</h2><button type="button" class="nep-text-btn" data-act="clear-history">清除</button></div>
                <div class="nep-chips">${state.history.map((k, i) => `<button type="button" class="nep-chip" data-act="history" data-i="${i}">${esc(k)}</button>`).join('')}</div>`;
        } else if (!s.error) {
            html += '<div class="nep-hint">点一首歌立刻播放；行尾的「⋯」可以下一首播放、加到队列、红心、收藏到歌单。</div>';
        }
        return html;
    }
    const st = engine.getState();
    const currentId = st.silent ? null : st.track?.id;
    html += lazyList('search', s.tracks, (t, i) => trackRow(t, i, { current: t.id === currentId }));
    if (s.loading) html += '<div class="nep-hint">搜索中…</div>';
    else if (s.hasMore) html += '<button type="button" class="nep-btn" data-act="search-more" style="width:100%;margin-top:8px">加载更多</button>';
    return html;
}

// ---------- 播放队列 ----------

const MODES = { loop: ['fa-repeat', '列表循环'], shuffle: ['fa-shuffle', '随机播放'], one: ['fa-1', '单曲循环'] };

function renderQueue() {
    const s = engine.getState();
    if (!s.queue.length) return '<div class="nep-hint">队列是空的。去首页打开一个歌单，或者搜一首歌。</div>';
    const [icon, label] = MODES[s.mode];
    const start = Math.max(0, s.index - 30);
    let html = `<div class="nep-sec-head"><h2>${s.queue.length} 首</h2>
        <button type="button" class="nep-btn" data-act="mode"><i class="fa-solid ${icon}"></i>${label}</button></div>`;
    if (s.source?.hasMore) html += '<div class="nep-hint">歌单剩下的歌会在快放完时自动接上。</div>';
    if (start > 0) html += `<div class="nep-hint">前面还有 ${start} 首已播放</div>`;
    html += lazyList('queue', s.queue.slice(start), (t, k) => {
        const i = start + k;
        const current = i === s.index;
        return trackRow(t, i, {
            current,
            trailing: current ? '<span class="nep-icon" aria-label="正在播放"><i class="fa-solid fa-volume-high" style="color:var(--nep-accent)"></i></span>'
                : `<button type="button" class="nep-icon" data-act="remove" data-i="${i}" aria-label="移出队列：${esc(t.name)}"><i class="fa-solid fa-xmark"></i></button>`,
        });
    });
    return html;
}

// ---------- 正在播放 ----------

function renderNowView() {
    return `<div class="nep-np">
        <img class="nep-np-cover" alt="">
        <div class="nep-np-info">
            <div class="nep-np-text"><div class="nep-np-title"></div><div class="nep-np-sub"></div></div>
            <button type="button" class="nep-icon nep-like" data-act="like-current" aria-label="红心"><i class="fa-solid fa-heart nep-heart-off"></i></button>
            <button type="button" class="nep-icon" data-act="collect-current" aria-label="收藏到歌单"><i class="fa-solid fa-folder-plus"></i></button>
        </div>
        <div class="nep-progress"><span class="nep-cur">0:00</span><input type="range" min="0" max="1000" value="0" class="nep-seek" aria-label="播放进度"><span class="nep-dur">0:00</span></div>
        <div class="nep-controls">
            <button type="button" class="nep-icon nep-side nep-mode" data-act="mode" aria-label="播放模式"></button>
            <button type="button" class="nep-icon" data-act="prev" aria-label="上一首"><i class="fa-solid fa-backward"></i></button>
            <button type="button" class="nep-icon nep-np-toggle" data-act="toggle" aria-label="播放/暂停"><i class="fa-solid fa-play"></i></button>
            <button type="button" class="nep-icon" data-act="next" aria-label="下一首"><i class="fa-solid fa-forward"></i></button>
            <button type="button" class="nep-icon nep-side nep-silent" data-act="silent" aria-label="静音播放"><i class="fa-solid fa-volume-xmark"></i></button>
        </div>
        <button type="button" class="nep-btn nep-np-queue" data-nav="queue"><i class="fa-solid fa-list-ul"></i>播放队列</button>
    </div>`;
}

function genTone() {
    if (!gen.label) return '';
    if (gen.state === 'generating') return 'nep-gen';
    return gen.label.includes('已完成') ? 'nep-done' : '';
}

function setSrc(el, src) {
    if (el.dataset.src === src) return;
    el.dataset.src = src;
    if (src) el.src = src;
    else el.removeAttribute('src');
}

function renderNow() {
    if (!root || root.hidden) return;
    const s = engine.getState();
    const t = s.silent ? null : s.track;
    const playing = s.playing || s.silentPlaying;
    const title = s.silent ? '静音播放' : (t ? t.name : '还没有播放');
    const subText = gen.label || (s.silent ? '保持页面不被挂起' : (t ? `${t.ar}${s.trial ? '（试听片段）' : ''}` : ''));
    const tone = genTone();

    // 底部常驻条：有歌或在静音播放时显示；「正在播放」页里不重复显示
    nowbar.hidden = !(t || s.silent) || view().view === 'now';
    if (!nowbar.hidden) {
        nowbar.querySelector('.nep-nowbar-title').textContent = title;
        const sub = nowbar.querySelector('.nep-nowbar-sub');
        sub.textContent = subText;
        sub.className = `nep-nowbar-sub ${tone}`;
        setSrc(nowbar.querySelector('img'), t?.pic ? art(t.pic, 120) : '');
        nowbar.querySelector('.nep-toggle i').className = `fa-solid ${playing ? 'fa-pause' : 'fa-play'}`;
    }

    const np = body?.querySelector('.nep-np');
    if (np) {
        np.querySelector('.nep-np-title').textContent = title;
        const sub = np.querySelector('.nep-np-sub');
        sub.textContent = subText || '去首页挑一个歌单';
        sub.className = `nep-np-sub ${tone}`;
        setSrc(np.querySelector('.nep-np-cover'), t?.pic ? art(t.pic, 500) : '');
        np.querySelector('.nep-np-toggle i').className = `fa-solid ${playing ? 'fa-pause' : 'fa-play'}`;
        const like = np.querySelector('.nep-like');
        const liked = !!t && isLiked(t.id);
        like.classList.toggle('nep-on', liked);
        like.querySelector('i').className = `fa-solid fa-heart${liked ? '' : ' nep-heart-off'}`;
        like.setAttribute('aria-label', liked ? '取消红心' : '红心');
        like.disabled = !t;
        np.querySelector('[data-act=collect-current]').disabled = !t;
        const silent = np.querySelector('.nep-silent');
        silent.classList.toggle('nep-on', s.silent);
        silent.setAttribute('aria-label', s.silent ? '结束静音播放' : '静音播放');
        const mode = np.querySelector('.nep-mode');
        mode.innerHTML = `<i class="fa-solid ${MODES[s.mode][0]}"></i>`;
        mode.setAttribute('aria-label', `播放模式：${MODES[s.mode][1]}`);
    }
    renderProgress();
}

function renderProgress() {
    if (!root || root.hidden || seeking) return;
    const s = engine.getState();
    const dur = s.duration || (s.track?.dt || 0) / 1000;
    const ratio = dur && !s.silent ? Math.min(1, (s.currentTime || 0) / dur) : 0;
    nowbar.querySelector('.nep-nowbar-line i').style.transform = `scaleX(${ratio})`;
    const np = body?.querySelector('.nep-np');
    if (!np) return;
    np.querySelector('.nep-cur').textContent = fmtTime(s.silent ? 0 : s.currentTime);
    np.querySelector('.nep-dur').textContent = fmtTime(s.silent ? 0 : dur);
    const seek = np.querySelector('.nep-seek');
    seek.value = Math.round(ratio * 1000);
    seek.style.setProperty('--nep-fill', `${seek.value / 10}%`);
}

// ---------- 操作单：下一首播放、加到队列、红心、收藏到歌单、从歌单删除 ----------

function trackAt(i) {
    const v = view().view;
    if (v === 'search') return state.search.tracks[i];
    if (v === 'playlist') return state.playlist?.tracks[i];
    if (v === 'queue') return engine.getState().queue[i];
    return null;
}

function openSheet(track, mode = 'actions') {
    if (!track) return;
    state.sheet = { track, mode };
    if (mode === 'collect' && loggedIn() && !state.playlists && !state.playlistsLoading) loadPlaylists();
    refreshSheet();
}

function closeSheet() {
    state.sheet = null;
    root?.querySelector('.nep-scrim')?.remove();
}

/** 操作单浮在面板上（挂在面板根节点下），不跟着列表滚动。 */
function refreshSheet() {
    root.querySelector('.nep-scrim')?.remove();
    if (!state.sheet) return;
    root.insertAdjacentHTML('beforeend', renderSheet());
    root.querySelector('.nep-scrim .nep-sheet button')?.focus({ preventScroll: true });
}

function renderSheet() {
    const sh = state.sheet;
    const t = sh.track;
    const head = `<div class="nep-sheet-head">${img(t.pic, 92)}<div><h3>${esc(t.name)}</h3>
        <div class="nep-row-sub">${esc(t.ar)}</div></div></div>`;
    const wrap = (label, inner) => `<div class="nep-scrim" data-act="sheet-close"><div class="nep-sheet" role="dialog" aria-label="${label}">${head}
        ${inner}<button type="button" class="nep-sheet-cancel" data-act="sheet-close">取消</button></div></div>`;
    if (sh.mode === 'collect') {
        const own = (state.playlists || []).filter(p => p.mine && !p.liked);
        let rows;
        if (!loggedIn()) rows = '<div class="nep-hint" style="margin:0 12px 8px">先在「账号与设置」里扫码登录网易云。</div>';
        else if (state.playlistsError && !state.playlists) rows = `<div class="nep-error" style="margin:0 12px 8px">${esc(state.playlistsError)}</div>`;
        else if (!state.playlists) rows = '<div class="nep-hint" style="margin:0 12px 8px">正在读取歌单…</div>';
        else if (!own.length) rows = '<div class="nep-hint" style="margin:0 12px 8px">还没有自己创建的歌单，可以先在网易云 App 里新建一个。</div>';
        else {
            rows = own.map(p => `<button type="button" class="nep-act" data-act="collect-to" data-pid="${p.id}">${img(p.cover, 80)}
                <span>${esc(p.name)}</span><small>${p.count} 首</small></button>`).join('');
        }
        return wrap('收藏到歌单', `<div class="nep-hint" style="margin:0 12px 6px">收藏到哪个歌单</div>${rows}`);
    }
    const liked = isLiked(t.id);
    const pl = view().view === 'playlist' ? state.playlist : null;
    const canRemove = pl?.kind === 'mine' && pl.meta.mine && !pl.meta.liked;
    const inQueue = view().view === 'queue';
    const rows = `
        ${inQueue ? '' : '<button type="button" class="nep-act" data-act="sheet-next"><i class="fa-solid fa-arrow-turn-down"></i><span>下一首播放</span></button>'}
        ${inQueue ? '' : '<button type="button" class="nep-act" data-act="sheet-enqueue"><i class="fa-solid fa-list-ul"></i><span>加到队列末尾</span></button>'}
        <button type="button" class="nep-act${liked ? ' nep-on' : ''}" data-act="sheet-like"><i class="fa-solid fa-heart${liked ? '' : ' nep-heart-off'}"></i><span>${liked ? '取消红心' : '红心'}</span></button>
        <button type="button" class="nep-act" data-act="sheet-collect"><i class="fa-solid fa-folder-plus"></i><span>收藏到歌单</span></button>
        ${canRemove ? `<button type="button" class="nep-act nep-danger" data-act="sheet-remove"><i class="fa-solid fa-trash-can"></i><span>从「${esc(pl.meta.name)}」删除</span></button>` : ''}`;
    return wrap('歌曲操作', rows);
}

async function toggleLike(track) {
    if (!loggedIn()) return void toast('warning', '先在「账号与设置」里扫码登录网易云');
    const id = Number(track.id);
    const like = !isLiked(id);
    state.likes ??= new Set();
    // 先改界面，失败再改回来
    if (like) state.likes.add(id);
    else state.likes.delete(id);
    afterLikeChange();
    try {
        await api('like', { id, like });
        toast('success', like ? `已红心：${track.name}` : `已取消红心：${track.name}`);
        markPlaylistsStale();
    } catch (error) {
        if (like) state.likes.delete(id);
        else state.likes.add(id);
        afterLikeChange();
        toast('error', error.message);
    }
}

function afterLikeChange() {
    renderNow();
    if (state.sheet) refreshSheet();
    if (['playlist', 'search', 'queue'].includes(view().view)) {
        const scroll = body.scrollTop;
        renderBody();
        body.scrollTop = scroll;
    }
}

async function collectTo(track, pid) {
    const target = state.playlists?.find(p => String(p.id) === String(pid));
    closeSheet();
    try {
        await api('playlist/add', { pid, ids: [track.id] });
        toast('success', `已收藏到「${target?.name || '歌单'}」`);
        markPlaylistsStale();
    } catch (error) {
        toast('error', error.message);
    }
}

async function removeFromPlaylist(track) {
    const pl = state.playlist;
    if (!pl) return;
    closeSheet();
    try {
        await api('playlist/remove', { pid: pl.meta.id, ids: [track.id] });
        const at = pl.tracks.findIndex(t => t.id === track.id);
        if (at >= 0) pl.tracks.splice(at, 1);
        pl.meta = { ...pl.meta, count: Math.max(0, pl.meta.count - 1) };
        toast('success', `已从「${pl.meta.name}」删除`);
        list = null;
        const scroll = body.scrollTop;
        renderBody();
        body.scrollTop = scroll;
        markPlaylistsStale();
    } catch (error) {
        toast('error', error.message);
    }
}

/** 写回网易云之后，歌单曲目数变了：在后台重新取一次歌单列表。 */
function markPlaylistsStale() {
    loadPlaylists({ fresh: true, quiet: true });
}

// ---------- 账号与设置 ----------

function renderAccount() {
    if (state.accountError) {
        return `<div class="nep-error" style="margin:8px 14px">${esc(state.accountError)}</div>
            <button type="button" class="nep-btn" data-act="refresh-account">重试</button>`;
    }
    if (!state.account) return '<div class="nep-set"><span class="nep-hint" style="margin:0;padding:0">正在查询登录状态…</span></div>';
    if (state.account.loggedIn) {
        const vip = state.account.vipType > 0 ? '，VIP' : '';
        return `<div class="nep-row">
            ${img(state.account.avatar, 92)}
            <div class="nep-row-main"><div class="nep-row-title">${esc(state.account.nickname)}</div>
            <div class="nep-row-sub">已登录网易云${vip}</div></div>
            <button type="button" class="nep-btn" data-act="logout">退出</button></div>`;
    }
    const qr = state.qr;
    let html = '<div class="nep-hint" style="padding-top:10px">未登录时只能播放免费歌曲，也没有每日推荐和红心；VIP 歌曲需要登录 VIP 账号。</div>';
    if (!qr) return `${html}<button type="button" class="nep-btn nep-btn-primary" data-act="qr-start">扫码登录</button>`;
    if (qr.error) html += `<div class="nep-error" style="margin:0 14px 8px">${esc(qr.error)}</div>`;
    if (qr.img) html += `<img class="nep-qr" src="${esc(qr.img)}" alt="登录二维码">`;
    html += `<div class="nep-hint"><b>手机自己的相机扫不到自己屏幕上的码。</b><br>
        截图这个页面 → 打开网易云 App「扫一扫」→ 右上角从相册选这张截图 → 在 App 里确认登录，再回到这里。</div>
        <div class="nep-hint nep-qr-status">状态：${esc(qr.message || '等待扫码…')}</div>
        <div style="display:flex;flex-wrap:wrap"><button type="button" class="nep-btn" data-act="qr-copy" style="margin-right:0">复制登录链接</button>
        <button type="button" class="nep-btn" data-act="qr-start">换一张</button></div>`;
    if (qr.copyFailed) {
        html += `<div class="nep-hint">自动复制失败，请长按下面的链接手动复制：</div>
            <div style="padding:0 14px 10px"><input type="text" readonly value="${esc(qr.url)}" style="width:100%"></div>`;
    }
    return html;
}

function options(key, items) {
    return `<select data-setting="${key}" data-kind="text">${items
        .map(([v, label]) => `<option value="${v}" ${settings[key] === v ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

function renderSettings() {
    const ms = 'mediaSession' in navigator ? '可用' : '不可用，锁屏不会显示歌名';
    const log = getLog().slice().reverse().map((e) => {
        const d = new Date(e.t);
        const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        return `${time} ${e.name}${e.detail ? ` ${e.detail}` : ''}`;
    }).join('\n');
    const minutes = [1, 3, 5, 10].map(n => `<option value="${n}" ${Number(settings.statusMinutes) === n ? 'selected' : ''}>${n} 分钟</option>`).join('');
    return `
        <div class="nep-group-title">网易云账号</div>
        <div class="nep-group">${renderAccount()}</div>

        <div class="nep-group-title">外观</div>
        <div class="nep-group">
            <label class="nep-set"><span>常驻入口</span>${options('entry', ENTRY_OPTIONS)}</label>
            <label class="nep-set"><span>玻璃颜色</span>${options('glass', GLASS_OPTIONS)}</label>
            ${settings.entry === 'float' ? '<button type="button" class="nep-btn" data-act="float-reset">悬浮胶囊回到顶部居中</button>' : ''}
            <div class="nep-hint">选「关闭」后不显示任何常驻入口，从魔法棒菜单或扩展设置打开播放器。</div>
        </div>

        <div class="nep-group-title">播放</div>
        <div class="nep-group">
            <label class="nep-set"><span>跳过只有试听片段的歌</span><input type="checkbox" class="nep-switch" data-setting="skipTrial" ${settings.skipTrial ? 'checked' : ''}></label>
            <label class="nep-set"><span>提示音打断音乐后自动接着放</span><input type="checkbox" class="nep-switch" data-setting="autoResume" ${settings.autoResume ? 'checked' : ''}></label>
            <div class="nep-hint">不想听歌时，在「正在播放」里点静音键：不出声，照样保持页面不被挂起，锁屏也照样显示生成状态。</div>
        </div>

        <div class="nep-group-title">锁屏生成状态</div>
        <div class="nep-group">
            <label class="nep-set"><span>「回复已完成」保留</span><select data-setting="statusMinutes">${minutes}</select></label>
            <div class="nep-hint">之后恢复显示歌手名；回到酒馆页面时也会恢复。当前：${esc(gen.label || '无')}</div>
        </div>

        <div class="nep-group-title">诊断</div>
        <div class="nep-group">
            <div class="nep-hint" style="padding-top:10px">Media Session：${ms}。事件日志只留最近 10 条，最新在上，用来确认生成事件有没有触发、音乐有没有被打断。</div>
            <div class="nep-log">${esc(log || '（空）')}</div>
            <div style="display:flex"><button type="button" class="nep-btn" data-act="log-refresh" style="margin-right:0">刷新</button>
            <button type="button" class="nep-btn" data-act="log-clear">清空</button></div>
        </div>

        <div class="nep-group-title">关闭播放器</div>
        <div class="nep-group">
            <div class="nep-hint" style="padding-top:10px">停止播放、清空队列，收起悬浮胶囊或迷你播放条。再次从魔法棒菜单或扩展设置打开播放器时恢复。登录状态保留。</div>
            <button type="button" class="nep-btn nep-danger" data-act="shutdown">停止并关闭</button>
        </div>`;
}

// ---------- 数据 ----------

async function loadHome() {
    const h = state.home;
    h.loadedAt = Date.now();
    h.recError = '';
    h.topError = '';
    const jobs = [
        api('home/playlists').then((d) => { h.rec = d.playlists; }, (e) => { if (!h.rec) h.recError = e.message; }),
        api('home/toplists').then((d) => { h.top = d.toplists; }, (e) => { if (!h.top) h.topError = e.message; }),
    ];
    if (loggedIn()) {
        h.dailyError = '';
        jobs.push(api('home/daily').then((d) => { h.daily = d.tracks; }, (e) => { if (!h.daily) h.dailyError = e.message; }));
        jobs.push(loadLikes());
        if (!state.playlists) jobs.push(loadPlaylists({ quiet: true }));
    }
    // 每一块拿到就画，不等最慢的那个
    for (const job of jobs) job.then(() => { if (view().view === 'home' && !root.hidden) renderBody(); });
    await Promise.allSettled(jobs);
}

async function loadLikes() {
    if (state.likesLoading) return;
    state.likesLoading = true;
    try {
        const data = await api('likes');
        state.likes = new Set(data.ids);
        if (['playlist', 'search'].includes(view().view)) {
            const scroll = body.scrollTop;
            renderBody();
            body.scrollTop = scroll;
        }
        renderNow();
    } catch {
        // 红心状态取不到不影响播放
    }
    state.likesLoading = false;
}

async function doSearch(more = false) {
    const s = state.search;
    if (!s.keywords || s.loading) return;
    s.loading = true;
    s.error = '';
    if (!more) {
        s.tracks = [];
        s.offset = 0;
        state.history = [s.keywords, ...state.history.filter(k => k !== s.keywords)].slice(0, HISTORY_MAX);
        store.set(HISTORY_KEY, state.history);
    }
    if (view().view === 'search') renderBody();
    try {
        const data = await api('search', { keywords: s.keywords, offset: s.offset, limit: 30 });
        s.tracks.push(...data.tracks);
        s.offset += data.tracks.length;
        s.hasMore = data.hasMore && data.tracks.length > 0;
    } catch (error) {
        s.error = error.message;
    }
    s.loading = false;
    if (view().view === 'search') renderBody();
}

/**
 * 取歌单列表。fresh：让服务端跳过缓存直接问网易云。
 * quiet：后台检查用，失败时不打扰（除非还没有歌单可显示）。
 * reloadOpen：不管有没有变化，都重新拉正打开的歌单。
 */
async function loadPlaylists({ fresh = false, quiet = false, reloadOpen = false } = {}) {
    if (state.playlistsLoading) return false;
    state.playlistsLoading = true;
    if (!quiet) state.playlistsError = '';
    const showsLists = () => ['home', 'playlists'].includes(view().view) && !root.hidden;
    if (showsLists() && !quiet) renderBody();
    let ok = false;
    try {
        const data = await api('playlists', fresh ? { fresh: true } : {});
        if (fresh) playlistsCheckedAt = Date.now();
        const unchanged = quiet && !state.playlistsError && JSON.stringify(state.playlists) === JSON.stringify(data.playlists);
        state.playlistsError = '';
        applyPlaylists(data.playlists, reloadOpen);
        ok = true;
        if (unchanged) {
            // 后台检查没发现变化：不重画，免得大歌单白白重排一遍
            state.playlistsLoading = false;
            return ok;
        }
    } catch (error) {
        if (!quiet || !state.playlists) {
            state.playlistsError = error.needLogin ? '需要先登录网易云（在「账号与设置」里扫码）' : error.message;
        }
    }
    state.playlistsLoading = false;
    if (state.sheet?.mode === 'collect') refreshSheet();
    if (showsLists()) {
        const scroll = body.scrollTop;
        renderBody();
        body.scrollTop = scroll;
    } else if (view().view === 'playlist') {
        updatePlaylistView(state.playlist);
    }
    return ok;
}

/** 换上新的歌单列表；正打开的歌单如果曲目数或更新时间变了，就重新拉它的歌。 */
function applyPlaylists(lists, reloadOpen = false) {
    state.playlists = lists;
    const pl = state.playlist;
    if (pl?.kind !== 'mine') return;
    const meta = lists.find(p => p.id === pl.meta.id);
    if (!meta) return;
    const changed = meta.count !== pl.meta.count || meta.updated !== pl.meta.updated;
    pl.meta = meta;
    if (changed || reloadOpen) reloadPlaylistTracks();
}

function autoCheckPlaylists() {
    if (!loggedIn()) return;
    if (Date.now() - playlistsCheckedAt < AUTO_CHECK_INTERVAL) return;
    playlistsCheckedAt = Date.now();
    loadPlaylists({ fresh: true, quiet: true });
}

function openPlaylist(kind, meta, tracks = null) {
    state.playlist = { kind, meta, tracks: tracks ? tracks.slice() : [], hasMore: !tracks, loading: false, error: '' };
    go('playlist');
    if (!tracks) loadPlaylistPage();
}

function reloadPlaylistTracks() {
    const pl = state.playlist;
    if (!pl || pl.kind === 'daily') return;
    state.playlist = { ...pl, tracks: [], hasMore: true, loading: false, error: '', fresh: true };
    loadPlaylistPage();
}

async function loadPlaylistPage() {
    const pl = state.playlist;
    if (!pl || pl.loading || pl.kind === 'daily') return;
    pl.loading = true;
    pl.error = '';
    updatePlaylistView(pl);
    try {
        const fresh = pl.fresh && !pl.tracks.length;
        const data = await api('playlist/tracks', { id: pl.meta.id, offset: pl.tracks.length, limit: 200, ...(fresh ? { fresh: true } : {}) });
        if (state.playlist !== pl) return;
        pl.tracks.push(...data.tracks);
        pl.hasMore = data.hasMore && data.tracks.length > 0;
    } catch (error) {
        pl.error = error.message;
    }
    pl.loading = false;
    updatePlaylistView(pl);
}

function playlistSource(pl) {
    if (pl.kind === 'daily') return null;
    return { type: 'playlist', id: pl.meta.id, name: pl.meta.name, offset: pl.tracks.length, hasMore: pl.hasMore };
}

async function refreshAccount() {
    state.accountError = '';
    try {
        state.account = await api('status');
    } catch (error) {
        state.accountError = error.message;
    }
    if (!root) return;
    renderTop();
    if (['settings', 'home'].includes(view().view)) renderBody();
    if (state.account) {
        autoCheckPlaylists();
        loadHome();
    }
}

async function startQr() {
    clearTimeout(qrTimer);
    state.qr = { message: '正在获取二维码…' };
    renderBody();
    try {
        const data = await api('qr/start');
        state.qr = { key: data.key, img: data.qrimg, url: data.qrurl, message: '等待扫码…', startedAt: Date.now() };
        pollQr(data.key);
    } catch (error) {
        state.qr = { error: error.message, message: '获取二维码失败' };
    }
    if (view().view === 'settings') renderBody();
}

function pollQr(key) {
    clearTimeout(qrTimer);
    qrTimer = setTimeout(async () => {
        const qr = state.qr;
        if (!qr || qr.key !== key) return;
        if (Date.now() - qr.startedAt > 5 * 60 * 1000) {
            qr.message = '二维码过期了，点「换一张」';
            if (view().view === 'settings') renderBody();
            return;
        }
        try {
            const data = await api('qr/check', { key });
            const messages = {
                800: '二维码过期了，点「换一张」',
                801: '等待扫码…',
                802: '已扫码，请在网易云 App 里点确认',
                803: '登录成功',
            };
            qr.message = messages[data.status] || `${data.message || '未知状态'}（${data.status}）`;
            if (data.status === 803) {
                state.qr = null;
                state.account = null;
                state.playlists = null;
                state.playlistsError = '';
                state.home = { ...state.home, daily: null, dailyError: '', loadedAt: 0 };
                toast('success', '网易云登录成功');
                await refreshAccount();
                return;
            }
            if (data.status === 800) {
                if (view().view === 'settings') renderBody();
                return;
            }
        } catch (error) {
            qr.message = `查询失败：${error.message}`;
        }
        if (view().view === 'settings' && !root.hidden) {
            const status = body.querySelector('.nep-qr-status');
            if (status) status.textContent = `状态：${qr.message}`;
        }
        pollQr(key);
    }, 2000);
}

function copyText(text) {
    const fallback = () => {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0, text.length);
        let ok = false;
        try {
            ok = document.execCommand('copy');
        } catch {
            ok = false;
        }
        ta.remove();
        return ok;
    };
    // http 页面里没有 navigator.clipboard，只能用旧办法
    if (navigator.clipboard && window.isSecureContext) {
        return navigator.clipboard.writeText(text).then(() => true, fallback);
    }
    return Promise.resolve(fallback());
}

// ---------- 交互 ----------

function onSubmit(e) {
    const form = e.target.closest('form[data-form=search]');
    if (!form) return;
    e.preventDefault();
    state.search.keywords = form.elements.keywords.value.trim();
    form.elements.keywords.blur();
    doSearch(false);
}

function onInput(e) {
    if (!e.target.classList.contains('nep-seek')) return;
    seeking = true;
    const seek = e.target;
    seek.style.setProperty('--nep-fill', `${seek.value / 10}%`);
    const s = engine.getState();
    const dur = s.duration || (s.track?.dt || 0) / 1000;
    body.querySelector('.nep-cur').textContent = fmtTime((seek.value / 1000) * dur);
}

function onChange(e) {
    if (e.target.classList.contains('nep-seek')) {
        const s = engine.getState();
        if (s.duration) engine.seek((e.target.value / 1000) * s.duration);
        seeking = false;
        return;
    }
    const key = e.target.dataset?.setting;
    if (!key) return;
    const { type, value, checked, dataset } = e.target;
    if (key === 'entry') {
        setEntry(value);
        renderBody();
        return;
    }
    if (key === 'glass') return void setGlass(value);
    settings[key] = type === 'checkbox' ? checked : (dataset.kind === 'text' ? value : Number(value));
    saveSettings();
}

function cycleMode() {
    const order = ['loop', 'shuffle', 'one'];
    engine.setMode(order[(order.indexOf(engine.getState().mode) + 1) % order.length]);
    if (view().view === 'queue') renderBody();
}

function onClick(e) {
    if (!body.contains(e.target) && !e.target.closest('.nep-scrim')) return;
    const nav = e.target.closest('[data-nav]');
    if (nav) return void go(nav.dataset.nav);
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const i = Number(actEl?.dataset.i ?? e.target.closest('.nep-row')?.dataset.i);
    const sheetTrack = state.sheet?.track;

    switch (act) {
        // 操作单
        case 'sheet-close':
            // 点到操作单本身（不是遮罩、不是取消键）不关
            if (e.target === actEl || actEl.tagName === 'BUTTON') closeSheet();
            return;
        case 'more': return void openSheet(trackAt(i));
        case 'sheet-next':
            engine.insertNext([sheetTrack]);
            toast('info', `下一首播放：${sheetTrack.name}`);
            return void closeSheet();
        case 'sheet-enqueue':
            engine.enqueue([sheetTrack]);
            toast('info', `已加到队列末尾：${sheetTrack.name}`);
            return void closeSheet();
        case 'sheet-like': return void toggleLike(sheetTrack);
        case 'sheet-collect':
            state.sheet.mode = 'collect';
            if (loggedIn() && !state.playlists && !state.playlistsLoading) loadPlaylists();
            return void refreshSheet();
        case 'collect-to': return void collectTo(sheetTrack, actEl.dataset.pid);
        case 'sheet-remove': return void removeFromPlaylist(sheetTrack);

        // 首页
        case 'open-daily': return void openPlaylist('daily', { id: 'daily', name: '每日推荐', count: state.home.daily?.length || 0 }, state.home.daily || []);
        case 'play-daily':
            e.stopPropagation();
            if (state.home.daily?.length) engine.playTracks(state.home.daily, 0, null);
            return;
        case 'reload-daily':
        case 'reload-home':
            state.home = { ...state.home, dailyError: '', recError: '', topError: '' };
            renderBody();
            return void loadHome();
        case 'open-rec': {
            const p = state.home.rec?.[i];
            if (p) openPlaylist('rec', p);
            return;
        }
        case 'open-top': {
            const t = state.home.top?.[i];
            if (t) openPlaylist('top', { ...t, count: 0 });
            return;
        }
        case 'reload-playlists':
            state.playlists = null;
            renderBody();
            return void loadPlaylists({ fresh: true });
        case 'refresh-playlists':
            loadPlaylists({ fresh: true }).then((ok) => {
                if (ok) toast('success', '歌单已刷新');
            });
            return;
        case 'open-playlist': {
            const meta = state.playlists?.[i];
            if (meta) openPlaylist('mine', meta);
            return;
        }

        // 歌单页
        case 'refresh-playlist':
            // 先刷新列表拿到最新曲目数，再从头拉这个歌单；列表刷新失败也照样重拉曲目
            if (state.playlist?.kind !== 'mine') return void reloadPlaylistTracks();
            loadPlaylists({ fresh: true, reloadOpen: true }).then((ok) => {
                if (!ok) reloadPlaylistTracks();
            });
            return;
        case 'playlist-more': return void loadPlaylistPage();
        case 'play-all':
        case 'shuffle-all': {
            const pl = state.playlist;
            if (!pl?.tracks.length) return;
            engine.setMode(act === 'shuffle-all' ? 'shuffle' : (engine.getState().mode === 'shuffle' ? 'loop' : engine.getState().mode));
            const start = act === 'shuffle-all' ? Math.floor(Math.random() * pl.tracks.length) : 0;
            engine.playTracks(pl.tracks, start, playlistSource(pl));
            return;
        }

        // 搜索
        case 'search-more': return void doSearch(true);
        case 'history':
            state.search.keywords = state.history[i] || '';
            return void doSearch(false);
        case 'clear-history':
            state.history = [];
            store.remove(HISTORY_KEY);
            return void renderBody();

        // 队列和正在播放
        case 'remove': return void engine.removeAt(i);
        case 'mode': return void cycleMode();
        case 'toggle': return void engine.toggle();
        case 'prev': return void engine.prev();
        case 'next': return void engine.next();
        case 'silent':
            if (engine.isSilentMode()) engine.stopSilent();
            else engine.startSilent();
            return;
        case 'like-current': {
            const t = engine.getState().track;
            if (t) toggleLike(t);
            return;
        }
        case 'collect-current': return void openSheet(engine.getState().track, 'collect');

        // 设置
        case 'refresh-account':
            state.account = null;
            renderBody();
            return void refreshAccount();
        case 'logout':
            api('logout').catch(() => { }).finally(() => {
                state.account = null;
                state.playlists = null;
                state.playlist = null;
                state.likes = null;
                state.home = { ...state.home, daily: null, dailyError: '', loadedAt: 0 };
                state.stack = [{ view: 'home' }, { view: 'settings' }];
                refreshAccount();
            });
            return;
        case 'qr-start': return void startQr();
        case 'qr-copy':
            if (!state.qr?.url) return;
            copyText(state.qr.url).then((ok) => {
                if (ok) {
                    toast('success', '登录链接已复制');
                } else {
                    state.qr.copyFailed = true;
                    renderBody();
                }
            });
            return;
        case 'float-reset': return void resetFloatPosition();
        case 'log-refresh': return void renderBody();
        case 'log-clear':
            clearLog();
            return void renderBody();
        case 'shutdown':
            engine.stopAndClear();
            close();
            return;
    }

    // 点歌名：播放
    const row = e.target.closest('.nep-row');
    if (!row || !body.contains(row) || !Number.isFinite(i)) return;
    const v = view().view;
    if (v === 'search') {
        const t = state.search.tracks[i];
        if (t) engine.playNow(t);
    } else if (v === 'playlist' && state.playlist) {
        engine.playTracks(state.playlist.tracks, i, playlistSource(state.playlist));
    } else if (v === 'queue') {
        if (i !== engine.getState().index) engine.playIndex(i);
    }
}
