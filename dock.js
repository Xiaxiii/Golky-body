// 收纳 —— 两项功能，各自可在扩展设置里关闭：
// 1. 收纳球：贴在屏幕边上的小把手。别的扩展的悬浮球（以及本扩展的播放胶囊）收进来后从屏幕上隐去，
//    点把手展开小面板，再点图标即可使用原来的功能。隐去只用样式，不移动、不删除原元素，原扩展照常运行。
// 2. 魔棒菜单编排：保持原有的单列样式，可把常用项置顶、少用项折叠进「更多」。
//    只改顺序和显隐，不动菜单项本身和它们的点击处理。

import { store, onTap, topLine, resetTopLine, miniBar, expandFloat, openPanel } from './index.js';

const KEY = 'kfc:v1:dock';
const DEFAULTS = {
    dock: true, // 收纳球
    menu: true, // 魔棒菜单编排
    pos: { side: 'right', y: 0.42 },
    items: [], // { sel, name, icon, path, mode: 'click' | 'peek', on }
    menuStates: {}, // 菜单项 → 'pin' 置顶 | 'hide' 折叠进「更多」
};

const prefs = { ...DEFAULTS, ...(store.get(KEY) || {}) };
const save = () => store.set(KEY, prefs);

const NEP_SEL = '#nep-float';
const EDGE = 6;
const HANDLE_W = 20;
const HANDLE_H = 48;

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const STYLE = `
#kfc-handle{position:fixed;z-index:99990;left:0;top:0;width:${HANDLE_W}px;height:${HANDLE_H}px;box-sizing:border-box;
display:grid;place-items:center;padding:0;border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.4));
background:var(--SmartThemeBlurTintColor,rgba(40,40,44,.6));color:var(--SmartThemeBodyColor,#ddd);opacity:.55;cursor:pointer;
box-shadow:0 2px 10px rgba(0,0,0,.18);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;
-webkit-tap-highlight-color:transparent;transition:opacity .2s ease,transform .28s cubic-bezier(.2,.9,.3,1.15),border-radius .2s ease}
@supports ((-webkit-backdrop-filter:blur(1px)) or (backdrop-filter:blur(1px))){
#kfc-handle,#kfc-panel{-webkit-backdrop-filter:blur(var(--SmartThemeBlurStrength,10px));backdrop-filter:blur(var(--SmartThemeBlurStrength,10px))}}
#kfc-handle[data-side=right]{border-right:0;border-radius:12px 0 0 12px}
#kfc-handle[data-side=left]{border-left:0;border-radius:0 12px 12px 0}
#kfc-handle.kfc-drag{transition:opacity .2s ease;border-radius:12px;border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.4));opacity:1}
#kfc-handle.kfc-open,#kfc-handle:active{opacity:1}
#kfc-handle i{font-size:13px;pointer-events:none}
#kfc-handle[hidden],#kfc-panel[hidden]{display:none!important}
#kfc-handle:focus-visible,#kfc-panel button:focus-visible{outline:2px solid var(--SmartThemeQuoteColor,#e18a24);outline-offset:1px}

#kfc-panel{position:fixed;z-index:99999;left:0;top:0;box-sizing:border-box;width:min(276px,calc(100vw - ${HANDLE_W + EDGE * 3}px));
max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);overflow-y:auto;overscroll-behavior:contain;padding:8px;
border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.4));border-radius:14px;
background:var(--SmartThemeBlurTintColor,rgba(40,40,44,.92));color:var(--SmartThemeBodyColor,#ddd);
box-shadow:0 10px 30px rgba(0,0,0,.28);font-size:13px;line-height:1.3;text-align:left;text-shadow:none;font-style:normal;letter-spacing:0}
#kfc-panel button{font:inherit;color:inherit;background:none;border:0;padding:0;cursor:pointer;-webkit-tap-highlight-color:transparent}
.kfc-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px}
.kfc-cell{display:flex;flex-direction:column;align-items:center;gap:5px;min-width:0;padding:8px 2px 6px!important;border-radius:10px}
.kfc-cell:active{background:var(--SmartThemeBorderColor,rgba(128,128,128,.25))}
.kfc-ico{position:relative;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;flex:none;overflow:hidden;
background:var(--SmartThemeBorderColor,rgba(128,128,128,.25));font-size:15px}
.kfc-ico img{width:100%;height:100%;object-fit:cover}
.kfc-ico .kfc-letter{font-size:14px;font-weight:600}
.kfc-cell[data-off] .kfc-ico{opacity:.45}
.kfc-name{max-width:100%;font-size:11px;line-height:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kfc-empty{grid-column:1/-1;padding:6px 4px 8px;font-size:12px;opacity:.7}
.kfc-foot{display:flex;justify-content:space-between;gap:6px;margin-top:6px;padding-top:6px;border-top:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.3))}
.kfc-foot button,.kfc-btn{display:inline-flex!important;align-items:center;gap:5px;padding:6px 8px!important;border-radius:8px;font-size:12px}
.kfc-foot button:active,.kfc-btn:active{background:var(--SmartThemeBorderColor,rgba(128,128,128,.25))}
.kfc-head{display:flex;align-items:center;gap:6px;margin:-2px 0 6px}
.kfc-head b{flex:1;font-size:13px}
.kfc-sec{margin:8px 2px 4px;font-size:11px;opacity:.65}
.kfc-row{display:flex;align-items:center;gap:6px;padding:5px 2px;border-radius:8px}
.kfc-row .kfc-ico{width:26px;height:26px;font-size:13px}
.kfc-row input[type=text]{flex:1;min-width:0;box-sizing:border-box;height:28px;margin:0;padding:0 6px;font-size:12px;color:inherit;
background:transparent;border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.35));border-radius:6px}
.kfc-row .kfc-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px}
.kfc-row .kfc-mini{flex:none;display:grid!important;place-items:center;min-width:28px;height:28px;padding:0 6px!important;border-radius:6px;font-size:11px;
border:1px solid var(--SmartThemeBorderColor,rgba(128,128,128,.35))!important}
.kfc-row .kfc-mini[aria-pressed=true]{background:var(--SmartThemeBorderColor,rgba(128,128,128,.3))}
.kfc-note{margin:6px 2px 0;font-size:11px;line-height:1.45;opacity:.65}
.kfc-terms{display:grid;grid-template-columns:auto 1fr;gap:3px 8px;margin:8px 2px 0;font-size:11px;line-height:1.45;opacity:.7}
.kfc-terms dt{font-weight:600}
.kfc-terms dd{margin:0}

/* 拾取层放进浏览器顶层（popover），任何 z-index 都盖不过；不支持 popover 时退回最大 z-index 并挂在 <html> 下 */
#kfc-pick,#kfc-pick-box,#kfc-pick-bar{position:fixed;margin:0;border:0;padding:0;overflow:visible;color:inherit;z-index:2147483647}
#kfc-pick{inset:auto;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,.08);cursor:pointer;touch-action:none;
-webkit-tap-highlight-color:transparent}
#kfc-pick-box{inset:auto;pointer-events:none;background:transparent;border:2px solid #e18a24;border-radius:8px;
box-shadow:0 0 0 9999px rgba(0,0,0,.25);transition:all .15s ease}
#kfc-pick-box:not(.kfc-on){display:none}
#kfc-pick-bar{inset:auto;left:50%;top:calc(100vh - 16px);top:calc(100dvh - 16px - env(safe-area-inset-bottom));transform:translate(-50%,-100%);
display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:6px;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;
padding:8px 10px;border-radius:12px;background:rgba(28,28,30,.94);color:#fff;font-size:13px;line-height:1.3;box-shadow:0 8px 24px rgba(0,0,0,.35)}
#kfc-pick-bar button{font:inherit;color:#fff;background:rgba(255,255,255,.14);border:0;border-radius:8px;padding:6px 10px;cursor:pointer}
#kfc-pick-bar button.kfc-primary{background:#e18a24}
#kfc-pick-bar input{width:9em;height:30px;box-sizing:border-box;padding:0 8px;border-radius:8px;border:0;font-size:13px;color:#000;background:#fff}
#kfc-pick-bar span{max-width:16em}

/* 唤出：隐匿的元素原位浮现，外加一圈提示 */
.kfc-peek{outline:2px solid #e18a24!important;outline-offset:2px}
#nep-float.kfc-peek{outline:0!important}

/* ---------- 魔棒菜单编排：保持酒馆原有的单列样式，只调顺序和显隐 ---------- */
/* 只在菜单显示时生效：酒馆关菜单是把行内样式设为 display:none，这里不能盖过它 */
#extensionsMenu[data-kfc-layout]:not([style*="display: none"]){display:flex!important;flex-direction:column}
#extensionsMenu[data-kfc-layout] .kfc-wrap:not([style*="display: none"]){display:contents!important}
#extensionsMenu[data-kfc-layout] .kfc-item{position:relative}
#extensionsMenu[data-kfc-layout] .kfc-item[data-kfc-state=pin]{order:-1}
#extensionsMenu[data-kfc-layout] .kfc-item[data-kfc-state=hide]{order:5}
#extensionsMenu[data-kfc-layout]:not([data-kfc-more]):not([data-kfc-edit]) .kfc-item[data-kfc-state=hide]{display:none!important}
#extensionsMenu[data-kfc-layout] .kfc-hint{order:-2}
#extensionsMenu[data-kfc-layout] .kfc-ctrl-more{order:4}
#extensionsMenu[data-kfc-layout] .kfc-ctrl-edit{order:6}
#extensionsMenu[data-kfc-layout] .kfc-ctrl[hidden],#extensionsMenu[data-kfc-layout]:not([data-kfc-edit]) .kfc-hint{display:none!important}
#extensionsMenu[data-kfc-layout] .kfc-ctrl{display:flex;align-items:baseline;column-gap:10px;padding:5px}
#extensionsMenu[data-kfc-layout] .kfc-ctrl>i{width:20px;display:flex;justify-content:center}
#extensionsMenu[data-kfc-layout] .kfc-hint{display:flex;align-items:center;gap:8px;padding:6px 5px;font-size:calc(var(--mainFontSize) * .85);line-height:1.4;opacity:.85;cursor:default}
#extensionsMenu[data-kfc-layout] .kfc-hint span{flex:1}
#extensionsMenu[data-kfc-layout] .kfc-hint b{flex:none;padding:2px 10px;border-radius:6px;border:1px solid var(--SmartThemeBorderColor);cursor:pointer;font-weight:600}
#extensionsMenu[data-kfc-layout][data-kfc-more] .kfc-item[data-kfc-state=hide]{opacity:.35}
#extensionsMenu[data-kfc-edit] .kfc-item{opacity:.9;padding-right:44px}
#extensionsMenu[data-kfc-edit] .kfc-item[data-kfc-state=hide]{opacity:.4}
#extensionsMenu[data-kfc-edit] .kfc-item[data-kfc-state]::after{position:absolute;top:50%;right:6px;transform:translateY(-50%);padding:0 5px;border-radius:4px;
font-size:11px;line-height:17px;background:var(--SmartThemeQuoteColor,#e18a24);color:#fff;opacity:1}
#extensionsMenu[data-kfc-edit] .kfc-item[data-kfc-state=pin]::after{content:"置顶"}
#extensionsMenu[data-kfc-edit] .kfc-item[data-kfc-state=hide]::after{content:"折叠";background:#8e8e93}
`;

function injectStyle() {
    if (document.getElementById('kfc-style')) return;
    const style = document.createElement('style');
    style.id = 'kfc-style';
    style.textContent = STYLE;
    document.head.appendChild(style);
}

// ---------- 隐去收纳的元素 ----------

function validSelector(sel) {
    try {
        document.querySelector(sel);
        return true;
    } catch {
        return false;
    }
}

/**
 * 用一段样式规则隐去：原扩展把元素删掉重建也照样生效，不需要盯着页面变化。
 * 只隐去、不改布局（visibility + 裁切），原扩展读位置和尺寸不受影响。
 */
function applyStow() {
    let style = document.getElementById('kfc-stow');
    if (!style) {
        style = document.createElement('style');
        style.id = 'kfc-stow';
        document.head.appendChild(style);
    }
    const rule = '{visibility:hidden!important;opacity:0!important;pointer-events:none!important;clip-path:inset(50%)!important}';
    style.textContent = prefs.dock
        ? prefs.items.filter(it => it.on && validSelector(it.sel)).map(it => `${it.sel}:not(.kfc-peek)${rule}`).join('\n')
        : '';
}

// ---------- 识别悬浮元素 ----------

const STATE_CLASS = /^(active|show|shown|open|opened|hide|hidden|hover|focus|focused|drag|dragging|moving|visible|collapsed|expanded|on|off|selected|disabled|is-.+|has-.+|kfc-.+|nep-(away|dragging|card|morph|busy|noart))$/i;
const RANDOM_TOKEN = /\d{4,}|[0-9a-f]{8,}|^[a-z0-9]{10,}$/i;
const CORE_IDS = new Set(['top-bar', 'top-settings-holder', 'sheld', 'form_sheld', 'send_form', 'chat', 'extensionsMenu', 'movingDivs',
    'toast-container', 'bg1', 'bg_custom', 'kfc-handle', 'kfc-panel', 'kfc-pick', 'kfc-pick-box', 'kfc-pick-bar', 'nep-panel', 'nep-bar']);

function partFor(el) {
    if (el.id && !RANDOM_TOKEN.test(el.id) && document.querySelectorAll(`#${CSS.escape(el.id)}`).length === 1) return `#${CSS.escape(el.id)}`;
    const classes = [...el.classList].filter(c => !STATE_CLASS.test(c) && !RANDOM_TOKEN.test(c)).slice(0, 3);
    let part = el.tagName.toLowerCase() + classes.map(c => `.${CSS.escape(c)}`).join('');
    for (const attr of ['data-id', 'data-name', 'title', 'aria-label']) {
        const v = el.getAttribute(attr);
        if (v && v.length < 40 && !RANDOM_TOKEN.test(v)) {
            part += `[${attr}="${CSS.escape(v)}"]`;
            break;
        }
    }
    return part;
}

/** 给元素生成一个尽量稳定、且只匹配它一个的选择器；做不到唯一时返回 null。 */
export function selectorFor(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
        const part = partFor(node);
        parts.unshift(part);
        // 有的悬浮球直接挂在 <html> 下，不在 body 里
        const parent = node.parentElement;
        const atRoot = parent === document.body || parent === document.documentElement;
        const prefix = part.startsWith('#') ? '' : parent === document.body ? 'body > ' : parent === document.documentElement ? 'html > ' : '';
        const sel = prefix + parts.join(' > ');
        if (part.startsWith('#') || atRoot) {
            try {
                if (document.querySelectorAll(sel).length === 1) return sel;
            } catch { /* 拼出了无效选择器，继续往上 */ }
            if (part.startsWith('#')) return null;
        }
        node = node.parentElement;
    }
    return null;
}

/** 从点中的元素往外找悬浮的那一层：最外层的 position:fixed 祖先；没有时取 body 下的那一层。 */
function floatingRoot(hit) {
    let fixed = null;
    let top = null;
    for (let n = hit; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
        const pos = getComputedStyle(n).position;
        if (pos === 'fixed' || pos === 'sticky') fixed = n;
        top = n;
    }
    return fixed || top || hit;
}

function tooBig(el) {
    const r = el.getBoundingClientRect();
    return r.width * r.height > window.innerWidth * window.innerHeight * 0.3 || r.width > window.innerWidth * 0.9;
}

function pathTo(root, node) {
    const path = [];
    for (let n = node; n && n !== root; n = n.parentElement) {
        const parent = n.parentElement;
        if (!parent) return [];
        path.unshift([...parent.children].indexOf(n));
    }
    return path.length > 6 ? [] : path;
}

function guessName(el) {
    const own = el.getAttribute('title') || el.getAttribute('aria-label');
    if (own) return own.trim().slice(0, 12);
    const inner = el.querySelector('[title],[aria-label]');
    const innerName = inner?.getAttribute('title') || inner?.getAttribute('aria-label');
    if (innerName) return innerName.trim().slice(0, 12);
    const text = (el.textContent || '').trim().replace(/\s+/g, ' ');
    if (text && text.length <= 12) return text;
    if (el.id) return el.id.replace(/[-_]+/g, ' ').slice(0, 12);
    return '悬浮元素';
}

/** 图标快照：Font Awesome 图标只留 fa-* 类名；图片和 SVG 一律转成 <img>，不带脚本和事件属性。 */
function iconOf(el) {
    const fa = el.matches('[class*="fa-"]') ? el : el.querySelector('[class*="fa-"]');
    if (fa) {
        const cls = [...fa.classList].filter(c => /^fa-[\w-]+$/.test(c) || c === 'fa').join(' ');
        if (cls) return `<i class="${esc(cls)}"></i>`;
    }
    const img = el.matches('img') ? el : el.querySelector('img');
    const src = img?.currentSrc || img?.getAttribute('src');
    if (src && src.length < 60000 && /^(https?:|data:image\/|\/|\.)/i.test(src)) return `<img src="${esc(src)}" alt="">`;
    const svg = el.matches('svg') ? el : el.querySelector('svg');
    if (svg) {
        const clone = svg.cloneNode(true);
        clone.querySelectorAll('script,foreignObject').forEach(n => n.remove());
        if (!clone.getAttribute('xmlns')) clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const color = getComputedStyle(svg).color;
        const text = new XMLSerializer().serializeToString(clone).replace(/currentColor/g, color);
        if (text.length < 20000) return `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}" alt="">`;
    }
    return '';
}

function iconHtml(item) {
    return item.icon || `<span class="kfc-letter">${esc((item.name || '?').trim().charAt(0) || '?')}</span>`;
}

/** 页面上现有的小型悬浮元素（body 和 html 下两层以内），供「管理」里一键收纳。 */
function scanCandidates() {
    const found = [];
    const known = new Set(prefs.items.map(it => it.sel));
    const nep = document.querySelector(NEP_SEL);
    if (nep && !known.has(NEP_SEL)) found.push({ sel: NEP_SEL, name: '网易云', icon: '<i class="fa-solid fa-music"></i>', el: nep });
    const seen = new Set();
    for (const el of document.querySelectorAll('body > *, body > * > *, html > :not(head, body), html > :not(head, body) > *')) {
        if (el.id === 'nep-float' || CORE_IDS.has(el.id) || seen.has(el)) continue;
        if (/^(SCRIPT|STYLE|LINK|TEMPLATE|DIALOG|AUDIO|VIDEO|CANVAS|IFRAME)$/.test(el.tagName)) continue;
        if (el.closest('#sheld,#top-settings-holder,#extensionsMenu,#movingDivs,.drawer-content,#toast-container')) continue;
        const cs = getComputedStyle(el);
        if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 16 || r.height < 16 || r.width > 200 || r.height > 200) continue;
        seen.add(el);
        const sel = selectorFor(el);
        if (!sel || known.has(sel)) continue;
        found.push({ sel, name: guessName(el), icon: iconOf(el), el });
        if (found.length >= 12) break;
    }
    return found;
}

// ---------- 使用收纳的元素 ----------

let peekEl = null;
let peekCleanup = null;

function unpeek() {
    peekCleanup?.();
    peekCleanup = null;
    peekEl?.classList.remove('kfc-peek');
    peekEl = null;
}

/** 唤出：元素原位浮现，点它外面的地方后再隐去。 */
function peek(el) {
    unpeek();
    peekEl = el;
    el.classList.add('kfc-peek');
    const onDown = (e) => {
        if (el.contains(e.target) || e.target.closest?.('#kfc-handle,#kfc-panel')) return;
        unpeek();
    };
    setTimeout(() => document.addEventListener('pointerdown', onDown, true), 0);
    peekCleanup = () => document.removeEventListener('pointerdown', onDown, true);
}

/** 播放胶囊：唤出后原地展开成播放卡片，卡片收回胶囊时一并隐去。 */
function useNep() {
    const el = miniBar.float;
    if (!el || el.hidden) {
        openPanel();
        return;
    }
    unpeek();
    peekEl = el;
    el.classList.add('kfc-peek');
    const observer = new MutationObserver(() => {
        if (el.dataset.state === 'compact' && !el.classList.contains('nep-card')) unpeek();
    });
    observer.observe(el, { attributes: true, attributeFilter: ['class', 'data-state'] });
    peekCleanup = () => observer.disconnect();
    expandFloat();
    if (el.dataset.state !== 'mid') unpeek(); // 没能展开（比如完整面板开着）
}

/** 直达：在元素中心依次派发按下、抬起、点击，等同于手指点了它一下。 */
function tapElement(root, item) {
    let target = root;
    for (const i of item.path || []) {
        const next = target.children[i];
        if (!next) {
            target = root;
            break;
        }
        target = next;
    }
    const r = root.getBoundingClientRect();
    const init = { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    const pointer = { ...init, pointerId: 41, pointerType: 'mouse', isPrimary: true, width: 1, height: 1 };
    const fire = (Ctor, type, extra) => {
        try {
            target.dispatchEvent(new Ctor(type, { ...extra }));
        } catch (err) {
            console.warn('[收纳] 派发事件出错', type, err);
        }
    };
    if ('PointerEvent' in window) fire(PointerEvent, 'pointerdown', { ...pointer, buttons: 1 });
    fire(MouseEvent, 'mousedown', { ...init, buttons: 1, detail: 1 });
    if ('PointerEvent' in window) fire(PointerEvent, 'pointerup', { ...pointer, buttons: 0 });
    fire(MouseEvent, 'mouseup', { ...init, buttons: 0, detail: 1 });
    fire(MouseEvent, 'click', { ...init, buttons: 0, detail: 1 });
}

function useItem(item) {
    closePanel();
    // 等这次点按的 click 冒泡完再派发，免得原扩展「点外面就关」的处理把刚打开的东西又关上
    setTimeout(() => {
        if (item.sel === NEP_SEL) return useNep();
        const el = document.querySelector(item.sel);
        if (!el) {
            globalThis.toastr?.info(`「${item.name}」当前不在页面上，所属扩展可能未启用或未加载`);
            return;
        }
        if (item.mode === 'peek') peek(el);
        else tapElement(el, item);
    }, 40);
}

// ---------- 把手 ----------

let handle = null;
let panel = null;
let panelView = 'grid';

function handleYRange() {
    const minY = Math.max(EDGE, topLine() + EDGE);
    const maxY = Math.max(minY, window.innerHeight - HANDLE_H - EDGE - 64);
    return { minY, maxY };
}

function placeHandle() {
    if (!handle) return;
    const { minY, maxY } = handleYRange();
    const side = prefs.pos.side === 'left' ? 'left' : 'right';
    const y = Math.round(minY + Math.min(1, Math.max(0, Number(prefs.pos.y) || 0)) * (maxY - minY));
    const x = side === 'left' ? 0 : window.innerWidth - HANDLE_W;
    handle.dataset.side = side;
    handle.style.transform = `translate3d(${x}px,${y}px,0)`;
    handle._y = y;
}

function createHandle() {
    handle = document.createElement('button');
    handle.type = 'button';
    handle.id = 'kfc-handle';
    handle.setAttribute('aria-label', '收纳（按住可拖动）');
    handle.setAttribute('aria-haspopup', 'dialog');
    handle.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
    document.body.appendChild(handle);
    placeHandle();
    bindHandleDrag();
    let resizeFrame = 0;
    window.addEventListener('resize', () => {
        if (resizeFrame) return;
        resizeFrame = requestAnimationFrame(() => {
            resizeFrame = 0;
            resetTopLine();
            placeHandle();
            if (panel && !panel.hidden) placePanel();
        });
    });
}

/** 按住拖动，松手后贴到较近的一侧；只是轻点则开关面板。 */
function bindHandleDrag() {
    let start = null;
    let dragged = false;
    const onMove = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (!dragged) {
            if (Math.hypot(dx, dy) < 8) return;
            dragged = true;
            handle.classList.add('kfc-drag');
            closePanel();
        }
        e.preventDefault();
        const { minY, maxY } = handleYRange();
        const x = Math.max(0, Math.min(window.innerWidth - HANDLE_W, start.left + dx));
        const y = Math.max(minY, Math.min(maxY, start.top + dy));
        handle.style.transform = `translate3d(${x}px,${y}px,0)`;
        start.last = { x, y };
    };
    const onEnd = (e) => {
        if (!start || e.pointerId !== start.id) return;
        const s = start;
        start = null;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (!dragged) {
            if (e.type === 'pointerup') togglePanel();
            return;
        }
        handle.classList.remove('kfc-drag');
        if (s.last) {
            const { minY, maxY } = handleYRange();
            prefs.pos = {
                side: s.last.x + HANDLE_W / 2 < window.innerWidth / 2 ? 'left' : 'right',
                y: maxY > minY ? (s.last.y - minY) / (maxY - minY) : 0,
            };
            save();
        }
        placeHandle();
    };
    handle.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        resetTopLine();
        const r = handle.getBoundingClientRect();
        start = { id: e.pointerId, x: e.clientX, y: e.clientY, left: r.left, top: r.top };
        dragged = false;
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onEnd);
        window.addEventListener('pointercancel', onEnd);
    });
    // 开关面板已在 pointerup 处理，键盘的 Enter / 空格走这里
    handle.addEventListener('click', (e) => {
        e.preventDefault();
        if (e.detail === 0) togglePanel();
    });
}

// ---------- 面板 ----------

function onOutside(e) {
    if (panel && !panel.contains(e.target) && !handle.contains(e.target)) closePanel();
}

function onKey(e) {
    if (e.key === 'Escape') {
        closePanel();
        handle.focus({ preventScroll: true });
    }
}

function togglePanel() {
    if (panel && !panel.hidden) closePanel();
    else openDockPanel();
}

function openDockPanel(view = 'grid') {
    if (!panel) {
        panel = document.createElement('div');
        panel.id = 'kfc-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-label', '收纳');
        document.body.appendChild(panel);
        onTap(panel, onPanelTap);
        panel.addEventListener('change', onPanelChange);
    }
    panelView = view;
    renderPanel();
    panel.hidden = false;
    handle.classList.add('kfc-open');
    handle.setAttribute('aria-expanded', 'true');
    placePanel();
    document.addEventListener('pointerdown', onOutside, true);
    document.addEventListener('keydown', onKey);
}

function closePanel() {
    if (!panel || panel.hidden) return;
    panel.hidden = true;
    handle?.classList.remove('kfc-open');
    handle?.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', onOutside, true);
    document.removeEventListener('keydown', onKey);
}

function placePanel() {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const side = prefs.pos.side === 'left' ? 'left' : 'right';
    const x = side === 'left' ? HANDLE_W + EDGE : window.innerWidth - HANDLE_W - EDGE - w;
    const minY = Math.max(EDGE, topLine() + EDGE);
    const want = (handle._y ?? minY) + HANDLE_H / 2 - h / 2;
    const y = Math.max(Math.min(minY, window.innerHeight - h - EDGE), Math.min(window.innerHeight - h - EDGE, want));
    panel.style.transform = `translate3d(${Math.max(EDGE, x)}px,${Math.round(y)}px,0)`;
}

function cellHtml(item, i) {
    return `<button type="button" class="kfc-cell" data-use="${i}" ${item.on ? '' : 'data-off'} title="${esc(item.name)}">
        <span class="kfc-ico">${iconHtml(item)}</span><span class="kfc-name">${esc(item.name)}</span></button>`;
}

function renderPanel() {
    if (panelView === 'manage') return renderManage();
    const cells = prefs.items.map(cellHtml).join('');
    panel.innerHTML = `
        <div class="kfc-grid">${cells || '<div class="kfc-empty">尚无收纳。点「拾取」后点按屏幕上的悬浮球，或在「管理」中选取。</div>'}</div>
        <div class="kfc-foot">
            <button type="button" data-act="pick"><i class="fa-solid fa-crosshairs"></i>拾取</button>
            <button type="button" data-act="manage"><i class="fa-solid fa-sliders"></i>管理</button>
        </div>`;
}

function renderManage() {
    const rows = prefs.items.map((it, i) => `
        <div class="kfc-row">
            <span class="kfc-ico">${iconHtml(it)}</span>
            <input type="text" data-name="${i}" value="${esc(it.name)}" aria-label="名称">
            ${it.sel === NEP_SEL ? '' : `<button type="button" class="kfc-mini" data-mode="${i}" title="直达：点图标即触发；唤出：原元素原位浮现">${it.mode === 'peek' ? '唤出' : '直达'}</button>`}
            <button type="button" class="kfc-mini" data-on="${i}" aria-pressed="${it.on}" title="隐匿：平时不在屏幕上；常驻：平时照常显示">${it.on ? '隐匿' : '常驻'}</button>
            <button type="button" class="kfc-mini" data-del="${i}" aria-label="移除" title="移除"><i class="fa-solid fa-xmark"></i></button>
        </div>`).join('');
    const found = scanCandidates();
    candidates = found;
    const foundRows = found.map((c, i) => `
        <div class="kfc-row">
            <span class="kfc-ico">${iconHtml(c)}</span><span class="kfc-label" title="${esc(c.sel)}">${esc(c.name)}</span>
            <button type="button" class="kfc-mini" data-add="${i}">收纳</button>
        </div>`).join('');
    panel.innerHTML = `
        <div class="kfc-head"><button type="button" class="kfc-btn" data-act="back" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button><b>收纳管理</b></div>
        <div class="kfc-sec">已收纳</div>
        ${rows || '<div class="kfc-note">尚无收纳。</div>'}
        <div class="kfc-sec">可收纳</div>
        ${foundRows || '<div class="kfc-note">未发现。可点「拾取」直接点按屏幕上的元素。</div>'}
        <div class="kfc-foot"><button type="button" data-act="pick"><i class="fa-solid fa-crosshairs"></i>拾取</button></div>
        <dl class="kfc-terms">
            <dt>直达</dt><dd>点图标即触发原元素</dd>
            <dt>唤出</dt><dd>点图标后原元素原位浮现，点别处自动隐去；用于直达无响应的悬浮球</dd>
            <dt>隐匿</dt><dd>平时不在屏幕上显示</dd>
            <dt>常驻</dt><dd>平时照常显示，收纳中同样可调用</dd>
        </dl>`;
}

let candidates = [];

function onPanelTap(e) {
    const btn = e.target.closest('button');
    if (!btn || !panel.contains(btn)) return;
    const d = btn.dataset;
    if (d.use != null) return useItem(prefs.items[Number(d.use)]);
    if (d.act === 'pick') return startPick();
    if (d.act === 'manage') return openDockPanel('manage');
    if (d.act === 'back') return openDockPanel('grid');
    if (d.add != null) {
        const c = candidates[Number(d.add)];
        if (c) addItem({ sel: c.sel, name: c.name, icon: c.icon, path: [] });
        return openDockPanel('manage');
    }
    const i = Number(d.mode ?? d.on ?? d.del);
    const item = prefs.items[i];
    if (!item) return;
    if (d.mode != null) item.mode = item.mode === 'peek' ? 'click' : 'peek';
    else if (d.on != null) item.on = !item.on;
    else prefs.items.splice(i, 1);
    save();
    applyStow();
    openDockPanel('manage');
}

function onPanelChange(e) {
    const input = e.target.closest('input[data-name]');
    if (!input) return;
    const item = prefs.items[Number(input.dataset.name)];
    if (!item) return;
    item.name = input.value.trim().slice(0, 12) || item.name;
    save();
}

function addItem(item) {
    if (prefs.items.some(it => it.sel === item.sel)) return;
    prefs.items.push({ mode: 'click', on: true, ...item });
    save();
    applyStow();
}

// ---------- 点选 ----------

/**
 * 盖一层透明遮罩接住点按，用 elementsFromPoint 找遮罩下面的元素：点选期间页面上任何元素都收不到事件，
 * 不会误触发原扩展的功能。
 */
function startPick() {
    closePanel();
    unpeek();
    const overlay = document.createElement('div');
    overlay.id = 'kfc-pick';
    const box = document.createElement('div');
    box.id = 'kfc-pick-box';
    const bar = document.createElement('div');
    bar.id = 'kfc-pick-bar';
    // 顶层按打开顺序叠放：遮罩在下，提示条在上
    const topLayer = typeof overlay.showPopover === 'function';
    for (const el of [overlay, box, bar]) {
        if (topLayer) {
            el.popover = 'manual';
            document.body.appendChild(el);
            try {
                el.showPopover();
            } catch { /* 个别浏览器拒绝时仍靠最大 z-index */ }
        } else {
            document.documentElement.appendChild(el);
        }
    }
    let chosen = null;
    let hit = null;
    let down = null;
    const tip = (text) => {
        bar.innerHTML = `<span>${esc(text)}</span><button type="button" data-k="cancel">取消</button>`;
    };
    const inBar = (e) => bar.contains(e.target);
    /**
     * 拾取期间在 window 捕获阶段拦下提示条以外的所有按压事件：页面上的悬浮球收不到按下、抬起和点击，不会被打开。
     * 判定点中了谁也在这里做（抬手时），不依赖浏览器是否补发 click。
     */
    const block = (e) => {
        if (inBar(e)) return;
        e.stopImmediatePropagation();
        if (e.type === 'click' || e.type === 'mousedown' || e.type === 'mouseup') e.preventDefault();
        if (e.type === 'pointerdown') down = { id: e.pointerId, x: e.clientX, y: e.clientY };
        if (e.type === 'pointerup' && down && e.pointerId === down.id) {
            const d = down;
            down = null;
            if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 12) pickAt(e.clientX, e.clientY);
        }
    };
    const TYPES = ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'touchstart', 'touchend', 'contextmenu'];
    for (const t of TYPES) window.addEventListener(t, block, { capture: true, passive: false });
    const finish = () => {
        for (const t of TYPES) window.removeEventListener(t, block, { capture: true, passive: false });
        document.removeEventListener('keydown', onKey2, true);
        overlay.remove();
        box.remove();
        bar.remove();
    };
    const onKey2 = (e) => {
        if (e.key === 'Escape') finish();
    };
    const show = (el) => {
        chosen = el;
        const r = el.getBoundingClientRect();
        Object.assign(box.style, { left: `${r.left - 3}px`, top: `${r.top - 3}px`, width: `${r.width + 6}px`, height: `${r.height + 6}px` });
        box.classList.add('kfc-on');
        if (tooBig(el)) {
            bar.innerHTML = '<span>范围过大，不属悬浮元素。请重新点按。</span><button type="button" data-k="cancel">取消</button>';
            return;
        }
        const canUp = el.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement && !tooBig(el.parentElement);
        bar.innerHTML = `<input type="text" value="${esc(guessName(el))}" aria-label="名称" maxlength="12">
            <button type="button" class="kfc-primary" data-k="ok">收纳</button>
            ${canUp ? '<button type="button" data-k="up">扩至外层</button>' : ''}
            <button type="button" data-k="cancel">取消</button>`;
    };
    const pickAt = (x, y) => {
        const under = document.elementsFromPoint(x, y)
            .find(n => n !== overlay && n !== box && !bar.contains(n) && n !== document.documentElement && n !== document.body);
        if (!under || under.closest('#kfc-handle,#kfc-panel')) return tip('未选中元素，请重新点按');
        hit = under;
        const root = floatingRoot(under);
        if (CORE_IDS.has(root.id) || root.closest('#sheld,#top-settings-holder')) return tip('酒馆自身界面不可收纳');
        show(root);
    };
    tip('请点按要收纳的悬浮元素');
    document.addEventListener('keydown', onKey2, true);
    bar.addEventListener('click', (e) => {
        const k = e.target.closest('button')?.dataset.k;
        if (k === 'cancel') return finish();
        if (k === 'up' && chosen?.parentElement) return show(chosen.parentElement);
        if (k !== 'ok' || !chosen) return;
        const sel = chosen.id === 'nep-float' ? NEP_SEL : selectorFor(chosen);
        if (!sel) {
            tip('无法稳定定位该元素，请「扩至外层」');
            return;
        }
        const name = (bar.querySelector('input')?.value || '').trim().slice(0, 12) || guessName(chosen);
        addItem({ sel, name, icon: sel === NEP_SEL ? '<i class="fa-solid fa-music"></i>' : iconOf(chosen), path: hit && chosen.contains(hit) ? pathTo(chosen, hit) : [] });
        finish();
        globalThis.toastr?.success(`已收纳「${name}」`);
        openDockPanel('grid');
    });
}

// ---------- 魔棒菜单编排 ----------

let menuObserver = null;
let menuFrame = 0;

const menuLabel = (el) => (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
const menuKey = (el) => (el.id && !RANDOM_TOKEN.test(el.id) ? `#${el.id}` : menuLabel(el));

function isWrap(child) {
    if (child.classList.contains('extension_container')) return true;
    if (child.children.length < 2 || child.querySelector(':scope > .extensionsMenuExtensionButton')) return false;
    return [...child.children].every(c => c.querySelector(':scope > .extensionsMenuExtensionButton, :scope > [class*="fa-"]'));
}

function tagMenu() {
    menuFrame = 0;
    const menu = document.getElementById('extensionsMenu');
    if (!menu || !prefs.menu) return;
    let hidden = 0;
    const tag = (el) => {
        if (el.classList.contains('kfc-ctrl') || el.classList.contains('kfc-hint')) return;
        el.classList.add('kfc-item');
        const key = menuKey(el);
        if (!key) return;
        if (el.dataset.kfcKey !== key) el.dataset.kfcKey = key;
        const state = prefs.menuStates[key];
        if (state) {
            if (el.dataset.kfcState !== state) el.dataset.kfcState = state;
            if (state === 'hide' && el.style.display !== 'none') hidden++;
        } else if (el.dataset.kfcState) {
            delete el.dataset.kfcState;
        }
    };
    for (const child of menu.children) {
        if (child.classList.contains('kfc-ctrl') || child.classList.contains('kfc-hint')) continue;
        if (isWrap(child)) {
            child.classList.add('kfc-wrap');
            for (const it of child.children) tag(it);
        } else {
            child.classList.remove('kfc-wrap');
            tag(child);
        }
    }
    ensureMenuControls(menu);
    const more = menu.querySelector('.kfc-ctrl-more');
    const open = menu.hasAttribute('data-kfc-more');
    more.hidden = !hidden && !open;
    more.querySelector('span').textContent = open ? '收起折叠项' : `更多（${hidden}）`;
    more.querySelector('i').className = `fa-solid ${open ? 'fa-chevron-up' : 'fa-ellipsis'}`;
}

function scheduleTag() {
    if (!menuFrame) menuFrame = requestAnimationFrame(tagMenu);
}

function ensureMenuControls(menu) {
    if (menu.querySelector('.kfc-ctrl-edit')) return;
    const hint = document.createElement('div');
    hint.className = 'kfc-hint';
    hint.innerHTML = '<span>点按条目依次切换：置顶 → 折叠 → 还原</span><b role="button" tabindex="0">完成</b>';
    const more = document.createElement('div');
    more.className = 'kfc-ctrl kfc-ctrl-more list-group-item interactable';
    more.tabIndex = 0;
    more.innerHTML = '<i class="fa-solid fa-ellipsis"></i><span>更多</span>';
    const edit = document.createElement('div');
    edit.className = 'kfc-ctrl kfc-ctrl-edit list-group-item interactable';
    edit.tabIndex = 0;
    edit.innerHTML = '<i class="fa-solid fa-sliders"></i><span>编排</span>';
    menu.append(hint, more, edit);
    // 这几格只在菜单内部切换状态：拦下冒泡，酒馆「点任意处关菜单」的处理就不会把菜单关掉
    more.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.toggleAttribute('data-kfc-more');
        tagMenu();
    });
    edit.addEventListener('click', (e) => {
        e.stopPropagation();
        setMenuEdit(menu, !menu.hasAttribute('data-kfc-edit'));
    });
    hint.addEventListener('click', (e) => {
        e.stopPropagation();
        if (e.target.closest('b')) setMenuEdit(menu, false);
    });
}

function setMenuEdit(menu, on) {
    menu.toggleAttribute('data-kfc-edit', on);
    const edit = menu.querySelector('.kfc-ctrl-edit span');
    if (edit) edit.textContent = on ? '完成编排' : '编排';
    tagMenu();
}

/** 编排状态下点菜单项只切换它的分组，不执行原功能、不关菜单。 */
function onMenuEditClick(e) {
    const menu = e.currentTarget;
    if (!menu.hasAttribute('data-kfc-edit')) return;
    const item = e.target.closest('.kfc-item');
    if (!item || !menu.contains(item)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const key = item.dataset.kfcKey;
    if (!key) return;
    const next = { undefined: 'pin', pin: 'hide', hide: undefined }[prefs.menuStates[key]];
    if (next) prefs.menuStates[key] = next;
    else delete prefs.menuStates[key];
    save();
    tagMenu();
}

function applyMenu() {
    const menu = document.getElementById('extensionsMenu');
    if (!menu) return false;
    if (!prefs.menu) {
        menuObserver?.disconnect();
        menuObserver = null;
        menu.removeAttribute('data-kfc-layout');
        menu.removeAttribute('data-kfc-edit');
        menu.removeAttribute('data-kfc-more');
        menu.querySelectorAll('.kfc-ctrl,.kfc-hint').forEach(n => n.remove());
        return true;
    }
    menu.dataset.kfcLayout = 'list';
    if (!menuObserver) {
        // 别的扩展陆续往菜单里加项；菜单关上（display:none）时退出编排和「更多」
        menuObserver = new MutationObserver((records) => {
            if (records.some(r => r.type === 'attributes') && menu.style.display === 'none'
                && (menu.hasAttribute('data-kfc-edit') || menu.hasAttribute('data-kfc-more'))) {
                menu.removeAttribute('data-kfc-more');
                setMenuEdit(menu, false);
            }
            if (records.some(r => r.type === 'childList')) scheduleTag();
        });
        menuObserver.observe(menu, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] });
        if (!menu.dataset.kfcBound) {
            menu.dataset.kfcBound = '1';
            menu.addEventListener('click', onMenuEditClick, true);
        }
    }
    tagMenu();
    return true;
}

function waitForMenu(tries = 0) {
    if (applyMenu() || tries > 20) return;
    setTimeout(() => waitForMenu(tries + 1), 500);
}

// ---------- 开关 ----------

function applyDock() {
    applyStow();
    if (prefs.dock && !handle) createHandle();
    if (handle) handle.hidden = !prefs.dock;
    if (!prefs.dock) {
        closePanel();
        unpeek();
    }
}

export function getDockPrefs() {
    return prefs;
}

export function setDockOption(name, value) {
    prefs[name] = value;
    save();
    if (name === 'dock') applyDock();
    else applyMenu();
}

export function resetHandle() {
    prefs.pos = { ...DEFAULTS.pos };
    save();
    resetTopLine();
    placeHandle();
}

function addSettingsDrawer() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host || document.getElementById('kfc-settings')) return;
    const el = document.createElement('div');
    el.id = 'kfc-settings';
    el.className = 'inline-drawer';
    el.innerHTML = `
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>收纳</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label"><input type="checkbox" data-opt="dock"><span>收纳球：贴边把手，收纳悬浮球与播放胶囊</span></label>
            <label class="checkbox_label"><input type="checkbox" data-opt="menu"><span>魔棒菜单编排：常用项置顶，少用项折叠</span></label>
            <div class="flex-container">
                <div class="menu_button menu_button_icon" data-act="reset"><i class="fa-solid fa-arrows-to-dot"></i><span>收纳球归位</span></div>
            </div>
            <small>收纳：点收纳球 →「拾取」→ 点按屏幕上的悬浮球。编排：打开魔棒菜单 →「编排」→ 点按条目切换置顶或折叠。</small>
        </div>`;
    host.appendChild(el);
    for (const box of el.querySelectorAll('[data-opt]')) {
        box.checked = !!prefs[box.dataset.opt];
        box.addEventListener('change', () => setDockOption(box.dataset.opt, box.checked));
    }
    el.querySelector('[data-act=reset]').addEventListener('click', () => resetHandle());
}

export function initDock() {
    if (globalThis.__kfcDockLoaded) return;
    globalThis.__kfcDockLoaded = true;
    injectStyle();
    applyDock();
    waitForMenu();
    addSettingsDrawer();
}
