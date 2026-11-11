// 展开面板：首页（每日推荐、我的歌单、推荐歌单、排行榜）、歌单、搜索、播放队列、正在播放、账号与设置。
// 点开播放器时才加载。页面是一个栈：首页在底，其余页面推入，左上角返回。
import {
    api, store, settings, saveSettings, getLog, clearLog, gen, miniBar, resetFloatPosition, likes,
    setEntry, setGlass, setGlassFx, ENTRY_OPTIONS, GLASS_OPTIONS, GLASSFX_OPTIONS,
    unlock, isUnlocked, SERVER_MIN, versionLess, applyBusy,
} from './index.js';
import * as engine from './engine.js';

const HISTORY_KEY = 'nep:v1:search-history';
const HISTORY_MAX = 8;

const CSS = `
#nep-panel{--nep-ease-out:cubic-bezier(.23,1,.32,1);--nep-ease-drawer:cubic-bezier(.32,.72,0,1);
position:fixed;z-index:2900;left:max(8px,env(safe-area-inset-left));right:max(8px,env(safe-area-inset-right));
top:calc(var(--topBarBlockSize,50px) + env(safe-area-inset-top) + 6px);height:min(80dvh,700px);max-width:560px;margin:0 auto;
display:flex;flex-direction:column;box-sizing:border-box;border-radius:28px;font-size:15px;line-height:1.4;white-space:normal;
overflow:hidden;contain:layout style;transform-origin:50% 0;animation:nep-in .3s var(--nep-ease-out)}
#nep-panel.nep-closing{animation:nep-out .16s ease-out forwards;pointer-events:none}
@keyframes nep-in{from{opacity:0;transform:translateY(-12px) scale(.97)}}
@keyframes nep-out{to{opacity:0;transform:translateY(-8px) scale(.98)}}
#nep-panel[hidden],#nep-panel [hidden]{display:none!important}
#nep-panel *{box-sizing:border-box}
#nep-panel>.nep-top,#nep-panel>.nep-body,#nep-panel>.nep-nowbar{position:relative;z-index:1}
#nep-panel button{font:inherit;color:inherit;background:transparent;border:0;padding:0;margin:0;cursor:pointer;
-webkit-tap-highlight-color:transparent}
#nep-panel button:disabled{opacity:.45;cursor:default}
/* 酒馆和主题会给按钮、输入框、滑块加边框、阴影、最小高度，这里清掉 */
#nep-panel :is(button,input,select){box-shadow:none;text-shadow:none;filter:none;letter-spacing:0;text-transform:none}
#nep-panel :is(button,input,select,[tabindex]):focus-visible{outline:2px solid var(--nep-accent);outline-offset:2px}
#nep-panel :is(h1,h2,h3){font-family:inherit;color:var(--nep-ink);text-shadow:none;letter-spacing:0}
#nep-panel img{-webkit-user-drag:none;user-select:none;-webkit-user-select:none}
#nep-panel img:not([src]){visibility:hidden}
#nep-panel .nep-icon{display:grid;place-items:center;width:40px;height:40px;border-radius:50%;font-size:17px;flex:none;
transition:background-color .15s ease,transform .15s var(--nep-ease-out)}
#nep-panel .nep-icon:active{background:var(--nep-raise-2);transform:scale(.92)}
/* 16px 起 iOS 聚焦输入框时不会放大整页 */
#nep-panel input[type=search],#nep-panel input[type=text],#nep-panel select{font:inherit;font-size:16px;color:inherit;border:0;outline:0;
min-width:0;background:var(--nep-raise);border-radius:12px;padding:9px 12px}
#nep-panel input::placeholder{color:var(--nep-ink-2)}
#nep-panel :is(.nep-btn,.nep-chip){transition:transform .16s var(--nep-ease-out),background-color .16s ease}
#nep-panel :is(.nep-btn,.nep-chip):active{transform:scale(.97)}
@media (hover:hover) and (pointer:fine){
#nep-panel :is(.nep-row,.nep-act,.nep-set-btn):hover{background:var(--nep-raise)}
#nep-panel .nep-icon:hover{background:var(--nep-raise)}
#nep-panel .nep-tab:hover{color:var(--nep-ink)}}

.nep-top{flex:none;display:flex;align-items:center;gap:2px;height:58px;padding:0 8px 0 20px}
.nep-top.nep-has-back{padding-left:6px}
.nep-top h1{flex:1;min-width:0;margin:0;font-size:17px;font-weight:600;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-top .nep-avatar img{width:30px;height:30px;border-radius:50%;object-fit:cover;display:block}
.nep-body{flex:1;min-height:0;contain:content;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:2px 16px 24px}

.nep-sec{margin:0 0 28px}
.nep-sec:last-child{margin-bottom:6px}
.nep-sec-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:32px;margin:0 0 10px}
.nep-sec-head h2{flex:1;min-width:0;margin:0;font-size:19px;font-weight:700;line-height:1.25}
#nep-panel .nep-sec-head .nep-icon{width:34px;height:34px;font-size:14px;color:var(--nep-ink-2)}
#nep-panel .nep-link{display:inline-flex;align-items:center;gap:5px;height:32px;padding:0 2px 0 10px;color:var(--nep-ink-2);font-size:14px}
.nep-link i{font-size:11px}
.nep-hint{color:var(--nep-ink-2);font-size:13px;line-height:1.55;margin:6px 2px}
.nep-hint b{color:var(--nep-ink);font-weight:600}
.nep-error{color:var(--nep-accent);font-size:13px;margin:6px 2px}
.nep-bone{display:block;border-radius:6px;background:var(--nep-raise)}
.nep-ph{display:block;background:var(--nep-raise-2)}

/* 首页顶部的个人资料：头像居中，下面昵称、简介、地区；背景是放大的小尺寸头像，自带柔焦。点一下进「账号与设置」 */
.nep-sec.nep-profile-sec{position:relative;isolation:isolate;margin:0 0 6px}
.nep-profile-bg{position:absolute;z-index:-1;top:-2px;left:-16px;width:calc(100% + 32px);height:calc(100% + 2px);object-fit:cover;opacity:.3;pointer-events:none;
/* taste-skill-ignore: 头像氛围色向下淡出 */-webkit-mask-image:linear-gradient(#000,rgba(0,0,0,.6) 55%,transparent);
/* taste-skill-ignore: 同上 */mask-image:linear-gradient(#000,rgba(0,0,0,.6) 55%,transparent)}
.nep-profile{display:flex;flex-direction:column;align-items:center;padding:10px 12px 14px;border-radius:22px;text-align:center;cursor:pointer;
transition:transform .16s var(--nep-ease-out)}
.nep-profile:active{transform:scale(.98)}
.nep-profile-avatar{flex:none;display:grid;place-items:center;width:76px;height:76px;border-radius:50%;overflow:hidden;background:var(--nep-raise-2);
color:var(--nep-ink-2);font-size:28px;box-shadow:0 0 0 3px var(--nep-paper),0 8px 20px rgba(0,0,0,.16)}
.nep-profile-avatar img{display:block;width:100%;height:100%;object-fit:cover}
.nep-profile-main{min-width:0;max-width:100%;margin-top:12px}
.nep-profile-name{display:flex;align-items:center;justify-content:center;gap:8px;min-width:0;font-size:20px;font-weight:700;line-height:1.25}
.nep-profile-name>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-profile-name>.nep-bone{margin:0 auto}
.nep-vip{flex:none;padding:0 6px;border-radius:6px;font-size:10px;font-weight:700;line-height:17px;color:var(--nep-tint-ink);background:var(--nep-tint)}
.nep-profile-bio{margin:4px 0 0;font-size:13px;line-height:1.45;color:var(--nep-ink-2);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nep-profile-meta{display:flex;align-items:center;justify-content:center;gap:5px;margin-top:6px;font-size:12px;line-height:1.3;color:var(--nep-ink-2)}
.nep-profile-meta i{font-size:11px;opacity:.8}
.nep-profile-main>.nep-bone{margin-left:auto;margin-right:auto}
/* 「账号与设置」里同一块资料横着排 */
.nep-group .nep-profile{flex-direction:row;gap:16px;padding:14px 16px;border-radius:0;text-align:left;cursor:default}
.nep-group .nep-profile:active{transform:none}
.nep-group .nep-profile-avatar{width:60px;height:60px;font-size:24px;box-shadow:none}
.nep-group .nep-profile-main{flex:1;margin-top:0}
.nep-group :is(.nep-profile-name,.nep-profile-meta){justify-content:flex-start}
.nep-group .nep-profile-bio{font-size:14px}

/* 首页分栏：歌单、推荐、排行榜 */
.nep-tabs{display:flex;gap:24px;margin:0 0 4px;padding:0 2px}
#nep-panel .nep-tab{position:relative;height:42px;font-size:16px;font-weight:600;color:var(--nep-ink-2);transition:color .15s ease}
#nep-panel .nep-tab.nep-on{color:var(--nep-ink)}
.nep-tab::after{content:"";position:absolute;left:50%;bottom:4px;width:18px;height:3px;margin-left:-9px;border-radius:2px;background:var(--nep-accent);
opacity:0;transform:scaleX(.4);transition:opacity .15s ease,transform .2s var(--nep-ease-out)}
.nep-tab.nep-on::after{opacity:1;transform:none}
.nep-sub-head{min-height:30px;margin:10px 0 2px}
#nep-panel .nep-sub-head h2{font-size:13px;font-weight:600;color:var(--nep-ink-2)}
/* 歌单一行：封面、名称、曲目数，行尾直接播放 */
.nep-pl-row{min-height:68px}
.nep-pl-row .nep-lead{width:52px;height:52px;border-radius:12px}
.nep-lead.nep-day{display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;color:var(--nep-on-accent);background:var(--nep-accent)}
.nep-day b{font-size:22px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.nep-day small{margin-top:3px;font-size:9px;font-weight:600;opacity:.9}
.nep-row-sub .nep-heart{margin:0 4px 0 0;font-size:10px}
#nep-panel .nep-row .nep-row-play{width:38px;height:38px;margin-right:4px;background:var(--nep-raise);color:var(--nep-ink);font-size:12px}
.nep-row-play .fa-play{margin-left:2px}
.nep-login{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px 10px;text-align:center}
.nep-login h2{margin:0;font-size:17px;font-weight:700}
.nep-login p{margin:0 0 10px;font-size:13px;color:var(--nep-ink-2)}

.nep-row{display:flex;align-items:center;gap:12px;min-height:60px;padding:6px 2px 6px 8px;margin:0 -8px;border-radius:14px;cursor:pointer;
transition:background-color .15s ease}
.nep-row:active{background:var(--nep-raise)}
.nep-lead{position:relative;flex:none;width:46px;height:46px;border-radius:10px;overflow:hidden;background:var(--nep-raise-2)}
.nep-lead img{display:block;width:100%;height:100%;object-fit:cover}
/* taste-skill-ignore: 封面上三根静态竖条，表示正在播放 */
.nep-row.nep-current .nep-lead::after{content:"";position:absolute;inset:0;background:linear-gradient(#fff,#fff) left 16px bottom 14px/3px 12px no-repeat,
linear-gradient(#fff,#fff) left 22px bottom 14px/3px 18px no-repeat,linear-gradient(#fff,#fff) left 28px bottom 14px/3px 9px no-repeat,rgba(0,0,0,.42)}
.nep-rank{flex:none;width:46px;text-align:center;font-size:17px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--nep-ink-2)}
.nep-rank.nep-top3,.nep-row.nep-current .nep-rank{color:var(--nep-accent)}
.nep-row-main{flex:1;min-width:0}
.nep-row-title,.nep-row-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-row-sub{margin-top:2px;color:var(--nep-ink-2);font-size:13px}
.nep-row.nep-current .nep-row-title{color:var(--nep-accent);font-weight:600}
#nep-panel .nep-row .nep-icon{color:var(--nep-ink-2);font-size:15px}
.nep-heart-off{color:transparent!important;-webkit-text-stroke:1.6px var(--nep-ink-2)}
.nep-heart{color:var(--nep-accent);font-size:11px;margin-left:6px;vertical-align:1px}
.nep-badge{display:inline-block;margin-left:6px;padding:0 5px;border-radius:5px;font-size:10px;font-weight:700;line-height:16px;vertical-align:2px;
color:var(--nep-tint-ink);background:var(--nep-tint)}
.nep-more{height:1px}

.nep-pl-head{display:flex;gap:16px;align-items:center;margin:4px 0 18px}
.nep-pl-cover{flex:none;width:112px;height:112px;border-radius:18px;overflow:hidden;background:var(--nep-raise-2);box-shadow:0 8px 22px rgba(0,0,0,.18)}
.nep-pl-cover img{display:block;width:100%;height:100%;object-fit:cover}
.nep-pl-date{display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1;color:#fff;background:var(--nep-accent)}
.nep-pl-date b{font-size:44px;font-weight:700;letter-spacing:-.03em;font-variant-numeric:tabular-nums}
.nep-pl-date span{margin-top:6px;font-size:12px;font-weight:600;opacity:.9}
.nep-pl-name{margin:0;font-size:20px;font-weight:700;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.nep-pl-meta{margin-top:6px;font-size:13px;color:var(--nep-ink-2)}
.nep-actions{display:flex;gap:10px;align-items:center;margin:0 0 12px}
#nep-panel .nep-actions .nep-btn{flex:1}
#nep-panel .nep-actions .nep-icon{background:var(--nep-raise);font-size:15px;color:var(--nep-ink-2)}
#nep-panel .nep-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 16px;border-radius:20px;
background:var(--nep-raise);font-weight:600;font-size:14px;white-space:nowrap}
#nep-panel .nep-btn:active{background:var(--nep-raise-3)}
#nep-panel .nep-btn-sm{height:32px;padding:0 12px;font-size:13px}
#nep-panel .nep-btn-primary{background:var(--nep-accent);color:var(--nep-on-accent)}
#nep-panel .nep-btn-primary:active{background:var(--nep-accent);filter:brightness(.92)}
#nep-panel .nep-btn-soft{color:var(--nep-accent)}

.nep-search{position:relative;display:flex;gap:8px;margin:0 0 14px}
.nep-search-icon{position:absolute;left:13px;top:50%;transform:translateY(-50%);color:var(--nep-ink-2);font-size:14px;pointer-events:none}
#nep-panel .nep-search input{flex:1;height:40px;padding-left:38px}
.nep-chips{display:flex;flex-wrap:wrap;gap:8px}
#nep-panel .nep-chip{height:34px;padding:0 14px;border-radius:17px;background:var(--nep-raise);font-size:14px;max-width:100%;
overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* 底部常驻条：左右滑动切歌 */
.nep-nowbar{flex:none;display:flex;align-items:center;gap:2px;height:64px;margin:0 8px 8px;padding:0 4px 0 8px;border-radius:20px;
background:var(--nep-raise);cursor:pointer;overflow:hidden;touch-action:pan-y;user-select:none;-webkit-user-select:none}
.nep-nowbar-main{flex:1;min-width:0;display:flex;align-items:center;gap:10px}
.nep-nowbar .nep-lead{border-radius:50%}
.nep-nowbar-text{flex:1;min-width:0;line-height:1.3}
.nep-nowbar-title,.nep-nowbar-sub{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-nowbar-title{font-weight:600}
.nep-nowbar-sub{font-size:13px;color:var(--nep-ink-2)}
.nep-nowbar-line{position:absolute;left:20px;right:20px;bottom:0;height:2px;border-radius:1px;background:var(--nep-raise-2);overflow:hidden}
.nep-nowbar-line i{display:block;height:100%;background:var(--nep-accent);transform-origin:0 50%;transform:scaleX(0)}
.nep-gen{color:var(--nep-busy)!important}
.nep-done{color:var(--nep-ok)!important}

/* 正在播放：整块面板换成封面色的深色底，白字；中间一张唱片，唱臂在播放时落下。唱片可左右滑动切歌 */
.nep-np-bg{position:absolute;inset:0;z-index:0;border-radius:inherit;overflow:hidden;background:#2a2a2d;pointer-events:none}
.nep-np-bg img{position:absolute;top:-12%;left:-12%;width:124%;height:124%;object-fit:cover}
.nep-np-bg::after{content:"";position:absolute;inset:0;background:rgba(20,20,22,.6)}
#nep-panel[data-view=now]>:is(.nep-top,.nep-body){--nep-ink:#fff;--nep-ink-2:rgba(255,255,255,.64);--nep-raise:rgba(255,255,255,.12);
--nep-raise-2:rgba(255,255,255,.18);--nep-raise-3:rgba(255,255,255,.28);--nep-accent:#ff5c52;--nep-busy:#ff9f0a;--nep-ok:#30d158;color:var(--nep-ink)}
#nep-panel[data-view=now] .nep-top h1{text-align:center;font-size:14px;font-weight:500;color:var(--nep-ink-2)}
#nep-panel .nep-top .nep-silent.nep-on{color:var(--nep-accent)}
.nep-np{--nep-disc:min(264px,66vw,32dvh);display:flex;flex-direction:column;min-height:100%;padding:0 4px}
.nep-np-stage{flex:1 1 auto;display:grid;place-items:center;padding:4px 0 10px;touch-action:pan-y;user-select:none;-webkit-user-select:none;cursor:grab}
.nep-turntable{position:relative;padding-top:calc(var(--nep-disc)*.16)}
.nep-disc-wrap{width:var(--nep-disc);height:var(--nep-disc);border-radius:50%;box-shadow:0 0 0 8px rgba(255,255,255,.07),0 18px 40px rgba(0,0,0,.35)}
.nep-disc{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;will-change:transform;
/* taste-skill-ignore: 唱片反光和纹路 */background:conic-gradient(from 40deg,rgba(255,255,255,0) 0 18%,rgba(255,255,255,.1) 25%,rgba(255,255,255,0) 32% 68%,rgba(255,255,255,.1) 75%,rgba(255,255,255,0) 82%),
/* taste-skill-ignore: 同上 */repeating-radial-gradient(circle,#0b0b0c 0 2px,#19191b 2px 3px);
animation:nep-spin 24s linear infinite;animation-play-state:paused}
.nep-np.nep-playing .nep-disc{animation-play-state:running}
@keyframes nep-spin{to{transform:rotate(360deg)}}
.nep-disc-label,.nep-np-cover{grid-area:1/1;width:64%;height:64%;border-radius:50%}
.nep-disc-label{display:grid;place-items:center;background:var(--nep-accent);color:#fff;font-size:calc(var(--nep-disc)*.14)}
#nep-panel .nep-np-cover{display:block;object-fit:cover}
#nep-panel .nep-np-cover:not([src]){display:none}
.nep-arm{position:absolute;z-index:1;top:0;left:calc(50% - var(--nep-disc)*.055);width:calc(var(--nep-disc)*.46);height:calc(var(--nep-disc)*.46);
overflow:visible;pointer-events:none;transform-origin:12% 12%;transform:rotate(-28deg);transition:transform .5s var(--nep-ease-drawer);
filter:drop-shadow(0 3px 5px rgba(0,0,0,.35))}
.nep-np.nep-playing .nep-arm{transform:none}
.nep-np-info{display:flex;align-items:center;gap:2px;margin-top:8px}
.nep-np-text{flex:1;min-width:0}
.nep-np-title{font-size:21px;font-weight:700;line-height:1.3;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-np-sub{margin-top:2px;font-size:15px;color:var(--nep-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#nep-panel .nep-np-info .nep-icon{font-size:20px;color:var(--nep-ink-2)}
#nep-panel .nep-np-info .nep-like.nep-on{color:var(--nep-accent)}
.nep-progress{margin-top:12px}
/* 进度条：可点区域 24px 高，画出来的轨道 5px */
/* 选择器都带上 #nep-panel：酒馆给 input[type=range] 及其滑块写了全局样式，优先级低了会被盖掉 */
#nep-panel .nep-seek{display:block;width:100%;height:24px;margin:0;padding:0;-webkit-appearance:none;appearance:none;background:transparent;cursor:pointer;
border:0;border-radius:0;outline-offset:0}
/* taste-skill-ignore: 单色进度填充，不是渐变 */
#nep-panel .nep-seek::-webkit-slider-runnable-track{height:5px;border:0;border-radius:3px;box-shadow:none;
background:linear-gradient(var(--nep-ink),var(--nep-ink)) 0/var(--nep-fill,0%) 100% no-repeat,var(--nep-raise-3)}
/* taste-skill-ignore: 同上 */
#nep-panel .nep-seek::-moz-range-track{height:5px;border:0;border-radius:3px;box-shadow:none;
background:linear-gradient(var(--nep-ink),var(--nep-ink)) 0/var(--nep-fill,0%) 100% no-repeat,var(--nep-raise-3)}
#nep-panel .nep-seek::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;margin-top:-5px;border-radius:50%;
background:var(--nep-ink);border:0;box-shadow:0 1px 4px rgba(0,0,0,.25);cursor:pointer}
#nep-panel .nep-seek::-moz-range-thumb{width:15px;height:15px;border-radius:50%;background:var(--nep-ink);border:0;box-shadow:0 1px 4px rgba(0,0,0,.25)}
.nep-times{display:flex;justify-content:space-between;font-size:12px;font-weight:600;color:var(--nep-ink-2);font-variant-numeric:tabular-nums}
.nep-controls{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
#nep-panel .nep-controls .nep-icon{width:52px;height:52px;font-size:24px}
#nep-panel .nep-controls .nep-side{width:44px;height:44px;font-size:17px;color:var(--nep-ink-2)}
#nep-panel .nep-controls .nep-np-toggle{width:68px;height:68px;background:var(--nep-raise-2);font-size:26px}
/* 还没有歌：唱片位换成图标，给一个去首页的按钮，不显示红心和收藏 */
.nep-np-blank{display:none;place-items:center;width:min(200px,50vw,25dvh);aspect-ratio:1;border-radius:50%;background:var(--nep-raise);
color:var(--nep-ink-2);font-size:44px}
.nep-np.nep-empty .nep-np-blank{display:grid}
#nep-panel .nep-np.nep-empty :is(.nep-turntable,.nep-np-info .nep-icon,.nep-progress,.nep-controls){display:none}
.nep-np.nep-empty .nep-np-stage{cursor:default}
.nep-np.nep-empty .nep-np-info{margin-top:20px;text-align:center}
#nep-panel .nep-np-cta{display:none;align-self:center;margin:18px 0 24px}
#nep-panel .nep-np.nep-empty .nep-np-cta{display:inline-flex}

.nep-scrim{position:absolute;inset:0;z-index:5;display:flex;align-items:flex-end;padding:8px;background:rgba(0,0,0,.3);animation:nep-fade .2s ease}
.nep-scrim.nep-leaving{animation:nep-fade-out .16s ease forwards;pointer-events:none}
.nep-scrim.nep-leaving .nep-sheet{animation:nep-sink .16s ease-out forwards}
@keyframes nep-fade{from{opacity:0}}
@keyframes nep-fade-out{to{opacity:0}}
@keyframes nep-sink{to{transform:translateY(24px)}}
.nep-sheet{width:100%;max-height:86%;overflow-y:auto;overscroll-behavior:contain;padding:6px 8px 8px;border-radius:24px;background:var(--nep-paper);
box-shadow:0 10px 40px rgba(0,0,0,.25);animation:nep-rise .34s var(--nep-ease-drawer)}
@keyframes nep-rise{from{transform:translateY(100%)}}
.nep-sheet::before{content:"";display:block;width:36px;height:5px;margin:2px auto 6px;border-radius:3px;background:var(--nep-raise-3)}
.nep-sheet-head{display:flex;align-items:center;gap:12px;padding:4px 10px 10px}
.nep-sheet-head h3{margin:0;font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-sheet-head div{min-width:0}
#nep-panel .nep-act{display:flex;align-items:center;gap:14px;width:100%;min-height:50px;padding:0 12px;border-radius:14px;text-align:left;font-size:15px}
#nep-panel .nep-act:active{background:var(--nep-raise)}
.nep-act>i{width:20px;text-align:center;color:var(--nep-ink-2);font-size:16px}
.nep-act.nep-on>i{color:var(--nep-accent)}
.nep-act>img,.nep-act>.nep-ph{width:40px;height:40px;border-radius:8px;object-fit:cover;background:var(--nep-raise-2);flex:none}
.nep-act span:not(.nep-ph){flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.nep-act small{color:var(--nep-ink-2);font-size:13px}
#nep-panel .nep-sheet-cancel{width:100%;height:48px;margin-top:6px;border-radius:14px;background:var(--nep-raise);font-weight:600}

.nep-group-title{margin:22px 16px 8px;font-size:13px;font-weight:600;color:var(--nep-ink-2)}
.nep-group-title:first-child{margin-top:6px}
.nep-group{border-radius:18px;background:var(--nep-raise);overflow:hidden}
.nep-set{display:flex;align-items:center;gap:12px;width:100%;min-height:50px;padding:6px 16px;text-align:left}
#nep-panel :is(.nep-set,.nep-profile)+.nep-set{box-shadow:inset 0 1px 0 var(--nep-raise)}
.nep-set>span{flex:1;min-width:0}
#nep-panel .nep-set-btn{padding:6px 16px;font-size:15px;transition:background-color .15s ease}
#nep-panel .nep-set-btn:active{background:var(--nep-raise-2)}
.nep-set-btn>i{color:var(--nep-ink-2);font-size:12px}
#nep-panel .nep-set select{max-width:58%;text-align:right;background:transparent;padding:6px 0;color:var(--nep-ink-2)}
.nep-group .nep-hint{margin:0;padding:10px 16px 12px}
.nep-group .nep-row{margin:0;padding:10px 16px;cursor:default;border-radius:0}
.nep-group>.nep-btn{margin:4px 16px 12px}
.nep-btn-row{display:flex;gap:8px;padding:0 16px 12px}
.nep-switch{-webkit-appearance:none;appearance:none;position:relative;flex:none;width:50px;height:30px;margin:0;border-radius:15px;
background:var(--nep-raise-3);cursor:pointer;transition:background-color .2s ease}
.nep-switch::after{content:"";position:absolute;top:2px;left:2px;width:26px;height:26px;border-radius:50%;background:#fff;
box-shadow:0 2px 4px rgba(0,0,0,.2);transition:transform .3s var(--nep-spring)}
.nep-switch:checked{background:var(--nep-ok)}
.nep-switch:checked::after{transform:translateX(20px)}
.nep-qr{display:block;width:196px;height:196px;margin:6px auto 10px;background:#fff;border-radius:16px;padding:8px}
.nep-log{margin:0 16px 10px;font-size:11px;line-height:1.55;font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;
word-break:break-all;color:var(--nep-ink-2);max-height:220px;overflow:auto}
#nep-panel .nep-danger{color:var(--nep-accent)}
@media (prefers-reduced-motion:reduce){
#nep-panel,#nep-panel.nep-closing,.nep-sheet,.nep-scrim,.nep-scrim.nep-leaving,.nep-scrim.nep-leaving .nep-sheet{animation-duration:.01s}
.nep-switch::after,.nep-arm,.nep-tab::after{transition:none}
.nep-disc{animation:none}}
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
    account: null,
    accountError: '',
    qr: null,
    sheet: null, // { track, i, mode: 'actions' | 'collect' }
    busyPlay: '', // 首页上正在取歌、准备直接播放的歌单，形如 rec:123
    homeTab: 'mine', // 首页当前分栏：mine 歌单 | rec 推荐 | top 排行榜
};

let root = null;
let top = null;
let body = null;
let nowbar = null;
let unsubscribe = null;
let qrTimer = null;
let progressTimer = null;
let closeTimer = null;
let seeking = false;
let playlistsCheckedAt = 0;

// 打开面板时自动检查歌单更新，短时间内反复开关只查一次；首页推荐半小时内不重复拉
const AUTO_CHECK_INTERVAL = 10 * 1000;
const HOME_TTL = 30 * 60 * 1000;

const view = () => state.stack[state.stack.length - 1];
const loggedIn = () => !!state.account?.loggedIn;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const art = (url, size = 120) => (url ? `${url}?param=${size}y${size}` : '');
const imgTag = (url, size) => (url ? `<img loading="lazy" decoding="async" src="${esc(art(url, size))}" alt="">` : '');
const img = (url, size) => imgTag(url, size) || '<span class="nep-ph"></span>';
const lead = (url, size = 92) => `<span class="nep-lead">${imgTag(url, size)}</span>`;
const toast = (kind, text) => globalThis.toastr?.[kind]?.(text, '', { timeOut: kind === 'error' ? 4000 : 1800 });
const HEART = '<i class="fa-solid fa-heart nep-heart" aria-label="已红心"></i>';
const CHEVRON = '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i>';

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

const isLiked = (id) => likes.has(id);

// 网易云的地区是行政区划编码：省级取前两位；海外统一是 1000000
const PROVINCES = {
    11: '北京', 12: '天津', 13: '河北', 14: '山西', 15: '内蒙古', 21: '辽宁', 22: '吉林', 23: '黑龙江', 31: '上海', 32: '江苏', 33: '浙江',
    34: '安徽', 35: '福建', 36: '江西', 37: '山东', 41: '河南', 42: '湖北', 43: '湖南', 44: '广东', 45: '广西', 46: '海南', 50: '重庆',
    51: '四川', 52: '贵州', 53: '云南', 54: '西藏', 61: '陕西', 62: '甘肃', 63: '青海', 64: '宁夏', 65: '新疆', 71: '台湾', 81: '香港', 82: '澳门',
};

function regionName(province) {
    const code = Number(province) || 0;
    if (code === 1000000) return '海外';
    return PROVINCES[Math.floor(code / 10000)] || '';
}

/**
 * 个人资料块：头像、昵称、简介、地区。首页顶部和「账号与设置」共用。
 * extra 是接在地区后面的一句（首页放歌单数）。
 */
function profileBlock({ attrs = '', extra = '' } = {}) {
    const a = state.account;
    const wrap = (avatar, name, lines) => `<div class="nep-profile" ${attrs}><span class="nep-profile-avatar">${avatar}</span>
        <div class="nep-profile-main"><div class="nep-profile-name">${name}</div>${lines}</div></div>`;
    const icon = '<i class="fa-solid fa-user" aria-hidden="true"></i>';
    if (state.accountError && !a) return wrap(icon, '<span>连接失败</span>', `<p class="nep-profile-bio">${esc(state.accountError)}</p>`);
    if (!a) {
        return wrap('', '<span class="nep-bone" style="width:120px;height:20px"></span>',
            '<span class="nep-bone" style="width:180px;max-width:76%;height:13px;margin-top:9px"></span><span class="nep-bone" style="width:72px;height:11px;margin-top:8px"></span>');
    }
    if (!a.loggedIn) return wrap(icon, '<span>未登录</span>', '<p class="nep-profile-bio">登录后同步歌单、红心与每日推荐</p>');
    const region = regionName(a.province);
    const meta = [region ? `<i class="fa-solid fa-location-dot" aria-hidden="true"></i>${region}` : '', extra].filter(Boolean).join('<span aria-hidden="true">·</span>');
    return wrap(a.avatar ? `<img src="${esc(art(a.avatar, 216))}" alt="">` : icon,
        `<span>${esc(a.nickname || '网易云用户')}</span>${a.vipType > 0 ? '<span class="nep-vip">VIP</span>' : ''}`,
        `${a.signature ? `<p class="nep-profile-bio">${esc(a.signature)}</p>` : ''}${meta ? `<div class="nep-profile-meta">${meta}</div>` : ''}`);
}

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
function trackRow(t, i, { current = false, rank = false } = {}) {
    const head = rank ? `<span class="nep-rank${i < 3 ? ' nep-top3' : ''}">${i + 1}</span>` : lead(t.pic);
    return `<div class="nep-row${current ? ' nep-current' : ''}" data-i="${i}">${head}
        <div class="nep-row-main"><div class="nep-row-title"><span class="nep-name">${esc(t.name)}</span>${isLiked(t.id) ? HEART : ''}${badges(t)}</div>
        <div class="nep-row-sub">${esc(t.ar)}</div></div>
        <button type="button" class="nep-icon" data-act="more" data-i="${i}" aria-label="更多操作：${esc(t.name)}"><i class="fa-solid fa-ellipsis"></i></button></div>`;
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
        <div class="nep-np-bg" hidden><img alt=""></div>
        <div class="nep-top">
            <button type="button" class="nep-icon nep-back" aria-label="返回"><i class="fa-solid fa-chevron-left"></i></button>
            <h1></h1>
            <button type="button" class="nep-icon" data-nav="search" aria-label="搜索"><i class="fa-solid fa-magnifying-glass"></i></button>
            <button type="button" class="nep-icon nep-avatar" data-nav="settings" aria-label="账号与设置"><i class="fa-solid fa-circle-user"></i></button>
            <button type="button" class="nep-icon nep-silent" hidden aria-label="静音播放"><i class="fa-solid fa-volume-xmark"></i></button>
            <button type="button" class="nep-icon nep-close" aria-label="收起播放器"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="nep-body"></div>
        <div class="nep-nowbar" hidden role="button" tabindex="0" aria-label="打开正在播放（左右滑动切歌）">
            <div class="nep-nowbar-main"><span class="nep-lead"><img alt=""></span>
                <div class="nep-nowbar-text"><div class="nep-nowbar-title"></div><div class="nep-nowbar-sub"></div></div></div>
            <button type="button" class="nep-icon nep-toggle" aria-label="播放/暂停"><i class="fa-solid fa-play"></i></button>
            <button type="button" class="nep-icon nep-next" aria-label="下一首"><i class="fa-solid fa-forward"></i></button>
            <button type="button" class="nep-icon" data-nav="queue" aria-label="播放队列"><i class="fa-solid fa-list-ul"></i></button>
            <div class="nep-nowbar-line"><i></i></div>
        </div>`;
    document.body.appendChild(root);
    applyBusy();
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
    top.querySelector('.nep-silent').addEventListener('click', () => {
        if (engine.isSilentMode()) engine.stopSilent();
        else engine.startSilent();
    });
    likes.listeners.add(afterLikeChange);
    // 滑动切歌后紧跟着的那次点击不算（否则底部条会顺带打开「正在播放」）
    root.addEventListener('click', (e) => {
        if (Date.now() < swallowClickUntil && e.target.closest(SWIPE_HOSTS)) {
            swallowClickUntil = 0;
            e.stopPropagation();
            e.preventDefault();
        }
    }, true);
    root.addEventListener('pointerdown', onSwipeStart);
    root.addEventListener('click', onClick);
    root.addEventListener('submit', onSubmit);
    root.addEventListener('change', onChange);
    root.addEventListener('input', onInput);
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.matches('[role=button]:is([data-act],[data-nav])')) {
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

/** 打开面板；target 给出时直接进那一页（胶囊卡片上的列表键传 'now'）。 */
export function open(target) {
    if (!root) build();
    const wasOpen = isOpen();
    clearTimeout(closeTimer);
    root.classList.remove('nep-closing');
    root.hidden = false;
    unsubscribe?.();
    unsubscribe = engine.onChange(onEngineChange);
    gen.listeners.add(renderNow);
    clearInterval(progressTimer);
    progressTimer = setInterval(renderProgress, 1000);
    const pushed = !!target && target !== view().view;
    if (pushed) {
        pushView(target);
        render();
        body.scrollTop = 0;
        if (target === 'queue') scrollToCurrent();
    } else if (wasOpen) {
        // 面板本来就开着（比如又点了一次菜单项）：不动当前页面和滚动位置
        syncAfterReopen();
    } else {
        if (renderedView === view().view && REUSABLE.has(renderedView)) {
            // 收起时 DOM 还在：只同步收起期间变了的部分，不整页重建
            syncAfterReopen();
        } else {
            render();
        }
        // 收起前停在哪，重新打开还在哪（隐藏期间浏览器会丢掉滚动位置）
        body.scrollTop = view().scroll || 0;
    }
    if (!state.account && !state.accountError) {
        refreshAccount();
    } else if (state.account) {
        autoCheckPlaylists();
        if (Date.now() - state.home.loadedAt > HOME_TTL) loadHome();
    }
}

export function isOpen() {
    return !!root && !root.hidden && !root.classList.contains('nep-closing');
}

export function close() {
    if (!isOpen()) return;
    closeSheet(true);
    remember();
    root.classList.add('nep-closing');
    miniBar.setAway(false);
    unsubscribe?.();
    unsubscribe = null;
    gen.listeners.delete(renderNow);
    clearInterval(progressTimer);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
        root.hidden = true;
        root.classList.remove('nep-closing');
    }, 160);
}

// ---------- 页面栈 ----------

function remember() {
    const v = view();
    v.scroll = body.scrollTop;
    v.listKey = list?.key;
    v.shown = list?.shown;
}

function pushView(name) {
    remember();
    // 搜索、设置、正在播放、队列这几页在栈里只留一份
    if (name !== 'playlist') {
        const at = state.stack.findIndex(v => v.view === name);
        if (at > 0) state.stack.splice(at);
    }
    state.stack.push({ view: name });
    list = null;
}

function go(name) {
    if (name === view().view && name !== 'playlist') return;
    closeSheet();
    pushView(name);
    render();
    body.scrollTop = 0;
    if (name === 'queue') scrollToCurrent();
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

/** 播放队列页：把正在播放的那一行滚到上方三分之一处。 */
function scrollToCurrent() {
    const row = body.querySelector('.nep-row.nep-current');
    if (!row) return;
    body.scrollTop += row.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 3;
}

// ---------- 渲染 ----------

function render() {
    renderTop();
    renderBody();
    renderNow();
}

const TITLES = { home: '网易云音乐', search: '搜索', queue: '播放队列', settings: '账号与设置', now: '正在播放' };

function renderTop() {
    const v = view().view;
    let title = TITLES[v] || '';
    if (v === 'playlist') title = { daily: '每日推荐', top: '排行榜', rec: '推荐歌单' }[state.playlist?.kind] || '歌单';
    top.querySelector('h1').textContent = title;
    root.dataset.view = v;
    top.dataset.view = v;
    // 「正在播放」的顶栏只留返回、静音键和收起
    root.querySelector('.nep-np-bg').hidden = v !== 'now';
    top.querySelector('.nep-silent').hidden = v !== 'now';
    const canBack = state.stack.length > 1;
    top.classList.toggle('nep-has-back', canBack);
    top.querySelector('.nep-back').hidden = !canBack;
    top.querySelector('[data-nav=search]').hidden = v === 'search' || v === 'now';
    const avatar = top.querySelector('.nep-avatar');
    avatar.hidden = v === 'settings' || v === 'now';
    // 首页的头像在个人资料块里，右上角换成设置图标
    const pic = v !== 'home' && state.account?.loggedIn && state.account.avatar ? art(state.account.avatar, 80) : '';
    const key = pic || (v === 'home' ? 'gear' : 'user');
    if (avatar.dataset.pic !== key) {
        avatar.dataset.pic = key;
        avatar.innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : `<i class="fa-solid ${v === 'home' ? 'fa-gear' : 'fa-circle-user'}"></i>`;
    }
}

let renderedView = null;
// 重新打开时可以沿用旧 DOM 的页面（设置页里有日志，每次重画）
const REUSABLE = new Set(['home', 'now', 'queue', 'playlist', 'search']);

function renderBody() {
    if (!body) return;
    const renderers = {
        home: renderHome, search: renderSearch, playlist: renderPlaylist,
        queue: renderQueue, settings: renderSettings, now: renderNowView,
    };
    renderedView = view().view;
    body.innerHTML = (renderers[renderedView] || renderHome)();
    watchMore();
    if (renderedView === 'now') renderNow();
}

/** 面板重新打开、页面没换：播放状态、红心、歌单数据在收起期间可能变了，逐项对齐。 */
function syncAfterReopen() {
    renderTop();
    renderNow();
    const v = view().view;
    if (v === 'home') for (const key of HOME) updateHome(key);
    else if (v === 'queue') syncQueueView();
    else if (v === 'playlist') updatePlaylistView(state.playlist);
    markCurrentRow();
    syncRowHearts();
}

/** 整页重画但保持滚动位置（数据变了、页面结构跟着变的少数情况）。 */
function rerenderKeepScroll() {
    const scroll = body.scrollTop;
    renderBody();
    body.scrollTop = scroll;
}

/** 播放引擎状态变了：只做局部更新，不重画整个列表。 */
function onEngineChange() {
    renderNow();
    const v = view().view;
    if (v === 'queue') syncQueueView();
    else markCurrentRow();
}

/** 歌单、搜索结果里按歌曲 id 高亮正在播放的行。 */
function markCurrentRow() {
    if (!body || !['playlist', 'search'].includes(view().view)) return;
    const s = engine.getState();
    const id = s.silent ? null : s.track?.id;
    for (const row of body.querySelectorAll('.nep-row[data-i]')) {
        const t = trackAt(Number(row.dataset.i));
        row.classList.toggle('nep-current', !!t && t.id === id);
    }
}

/** 红心变了：只增删受影响的行尾小红心。 */
function syncRowHearts() {
    if (!body) return;
    for (const row of body.querySelectorAll('.nep-row[data-i]')) {
        const t = trackAt(Number(row.dataset.i));
        const title = row.querySelector('.nep-row-title');
        if (!t || !title) continue;
        const heart = title.querySelector('.nep-heart');
        const want = isLiked(t.id);
        if (want && !heart) title.querySelector('.nep-name')?.insertAdjacentHTML('afterend', HEART);
        else if (!want && heart) heart.remove();
    }
}

// ---------- 首页 ----------

// 首页：个人资料、分栏标签、三栏内容（歌单 / 推荐 / 排行榜，只显示当前一栏）。
// 数据各自到达时只替换对应的那一块；内容没变就不碰 DOM，免得封面重新加载闪一下
const HOME = ['profile', 'tabs', 'mine', 'rec', 'top'];
const HOME_TABS = [['mine', '歌单'], ['rec', '推荐'], ['top', '排行榜']];
const homeHtml = new Map();

function homeRenderer(key) {
    return { profile: renderProfile, tabs: renderTabs, mine: renderMineSection, rec: renderRecSection, top: renderTopSection }[key];
}

function renderHome() {
    homeHtml.clear();
    return HOME.map((key) => {
        const html = homeRenderer(key)();
        homeHtml.set(key, html);
        return html;
    }).join('');
}

function updateHome(key) {
    if (!root || root.hidden || view().view !== 'home') return;
    const html = homeRenderer(key)();
    if (homeHtml.get(key) === html) return;
    const el = body.querySelector(`[data-sec="${key}"]`);
    if (!el) return void rerenderKeepScroll();
    homeHtml.set(key, html);
    el.outerHTML = html;
}

function setHomeTab(tab) {
    if (state.homeTab === tab) return;
    state.homeTab = tab;
    for (const key of HOME) updateHome(key);
}

function renderProfile() {
    const a = state.account;
    const n = a?.loggedIn ? state.playlists?.length : 0;
    const bg = a?.loggedIn && a.avatar ? `<img class="nep-profile-bg" src="${esc(art(a.avatar, 48))}" alt="" aria-hidden="true">` : '';
    return `<section class="nep-sec nep-profile-sec" data-sec="profile">${bg}${profileBlock({
        attrs: 'data-nav="settings" role="button" tabindex="0" aria-label="账号与设置"',
        extra: n ? `${n} 个歌单` : '',
    })}</section>`;
}

function renderTabs() {
    return `<div class="nep-tabs" data-sec="tabs" role="tablist">${HOME_TABS.map(([key, text]) => `<button type="button" role="tab"
        class="nep-tab${state.homeTab === key ? ' nep-on' : ''}" data-act="home-tab" data-tab="${key}" aria-selected="${state.homeTab === key}">${text}</button>`).join('')}</div>`;
}

/** 分栏内容的外壳：不是当前分栏就藏起来。 */
const pane = (key, inner) => `<section class="nep-sec" data-sec="${key}" role="tabpanel"${state.homeTab === key ? '' : ' hidden'}>${inner}</section>`;

const playGlyph = (busy) => `<i class="fa-solid ${busy ? 'fa-circle-notch fa-spin' : 'fa-play'}"></i>`;

/** 歌单一行：点行进歌单页，点行尾的播放键直接放。 */
function listRow({ act, playAct, i = 0, cover = '', leadHtml = '', name, sub, busy = false }) {
    return `<div class="nep-row nep-pl-row" data-act="${act}" data-i="${i}" role="button" tabindex="0" aria-label="${esc(name)}">${leadHtml || lead(cover, 120)}
        <div class="nep-row-main"><div class="nep-row-title">${esc(name)}</div><div class="nep-row-sub">${sub}</div></div>
        <button type="button" class="nep-icon nep-row-play" data-act="${playAct}" data-i="${i}" aria-label="播放：${esc(name)}">${playGlyph(busy)}</button></div>`;
}

function dailyRow() {
    const h = state.home;
    const d = today();
    const tile = `<span class="nep-lead nep-day" aria-hidden="true"><b>${d.day}</b><small>${d.month}</small></span>`;
    const shell = (attrs, sub, tail) => `<div class="nep-row nep-pl-row" ${attrs}>${tile}
        <div class="nep-row-main"><div class="nep-row-title">每日推荐</div><div class="nep-row-sub">${sub}</div></div>${tail}</div>`;
    if (h.dailyError) {
        return shell('data-act="reload-daily" role="button" tabindex="0"', `没取到：${esc(h.dailyError)}`,
            '<button type="button" class="nep-btn nep-btn-sm" data-act="reload-daily">重试</button>');
    }
    if (!h.daily) return shell('aria-busy="true"', '<span class="nep-bone" style="width:70%;height:12px;margin-top:6px"></span>', '');
    const names = h.daily.slice(0, 3).map(t => t.name).join('、');
    return shell('data-act="open-daily" role="button" tabindex="0" aria-label="打开每日推荐"',
        `${esc(names)}${h.daily.length > 3 ? ` 等 ${h.daily.length} 首` : ''}`,
        `<button type="button" class="nep-icon nep-row-play" data-act="play-daily" aria-label="播放每日推荐">${playGlyph(false)}</button>`);
}

function refreshButton(act) {
    const busy = state.playlistsLoading || !!state.playlist?.loading;
    return `<button type="button" class="nep-icon" data-act="${act}" ${busy ? 'disabled' : ''} aria-label="刷新：跳过缓存，从网易云重新获取">
        <i class="fa-solid fa-rotate-right${busy ? ' fa-spin' : ''}"></i></button>`;
}

const ROW_BONE = '<div class="nep-row nep-pl-row" aria-hidden="true"><span class="nep-lead"></span><div class="nep-row-main">'
    + '<span class="nep-bone" style="width:50%;height:14px"></span><span class="nep-bone" style="width:24%;height:12px;margin-top:7px"></span></div></div>';

/** 歌单一栏：每日推荐在最上面，下面是账号里的全部歌单。 */
function renderMineSection() {
    if (state.account?.loggedIn === false) {
        return pane('mine', `<div class="nep-login"><h2>登录网易云</h2><p>登录后显示每日推荐、自己的歌单和红心</p>
            <button type="button" class="nep-btn nep-btn-primary" data-nav="settings">扫码登录</button></div>`);
    }
    const all = state.playlists;
    const head = `<div class="nep-sec-head nep-sub-head"><h2>我的歌单${all ? ` · ${all.length}` : ''}</h2>${refreshButton('refresh-playlists')}</div>`;
    let rows;
    if (state.playlistsError) {
        rows = `<div class="nep-error">${esc(state.playlistsError)}</div><button type="button" class="nep-btn" data-act="reload-playlists">重试</button>`;
    } else if (!all) {
        rows = ROW_BONE.repeat(4);
    } else if (!all.length) {
        rows = '<div class="nep-hint">网易云账号里还没有歌单。</div>';
    } else {
        rows = all.map((p, i) => listRow({
            act: 'open-playlist', playAct: 'play-mine', i, cover: p.cover, name: p.name, busy: state.busyPlay === `mine:${p.id}`,
            sub: `<span class="nep-mine-sub">${p.liked ? '<i class="fa-solid fa-heart nep-heart" aria-hidden="true"></i>' : ''}${p.count} 首${p.liked || p.mine ? '' : ' · 收藏'}</span>`,
        })).join('');
    }
    return pane('mine', `${dailyRow()}${head}${rows}`);
}

function renderRecSection() {
    const h = state.home;
    if (h.recError) return pane('rec', `<div class="nep-error">${esc(h.recError)}</div><button type="button" class="nep-btn" data-act="reload-home">重试</button>`);
    if (!h.rec) return pane('rec', ROW_BONE.repeat(5));
    if (!h.rec.length) return pane('rec', '<div class="nep-hint">暂时没有推荐歌单。</div>');
    return pane('rec', h.rec.map((p, i) => listRow({
        act: 'open-rec', playAct: 'play-rec', i, cover: p.cover, name: p.name, busy: state.busyPlay === `rec:${p.id}`,
        sub: [p.count ? `${p.count} 首` : '', p.plays ? `播放 ${fmtPlays(p.plays)} 次` : ''].filter(Boolean).join(' · '),
    })).join(''));
}

function renderTopSection() {
    const h = state.home;
    if (h.topError) return pane('top', `<div class="nep-error">${esc(h.topError)}</div><button type="button" class="nep-btn" data-act="reload-home">重试</button>`);
    if (!h.top) return pane('top', ROW_BONE.repeat(5));
    if (!h.top.length) return pane('top', '<div class="nep-hint">暂时没有排行榜。</div>');
    return pane('top', h.top.map((t, i) => listRow({
        act: 'open-top', playAct: 'play-top', i, cover: t.cover, name: t.name, busy: state.busyPlay === `top:${t.id}`,
        sub: esc([t.update, t.top[0] ? `${t.top[0].name} - ${t.top[0].ar}` : ''].filter(Boolean).join(' · ')),
    })).join(''));
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
    const d = today();
    const cover = pl.kind === 'daily'
        ? `<div class="nep-pl-cover nep-pl-date" aria-hidden="true"><b>${d.day}</b><span>${d.month} · ${d.week}</span></div>`
        : `<div class="nep-pl-cover">${imgTag(m.cover, 224)}</div>`;
    const disabled = pl.tracks.length ? '' : 'disabled';
    let html = `<div class="nep-pl-head">${cover}<div style="min-width:0">
        <h2 class="nep-pl-name">${esc(m.name)}</h2><div class="nep-pl-meta">${esc(metaText)}</div></div></div>
        <div class="nep-actions">
            <button type="button" class="nep-btn nep-btn-primary" data-act="play-all" ${disabled}><i class="fa-solid fa-play"></i>播放全部</button>
            <button type="button" class="nep-btn nep-btn-soft" data-act="shuffle-all" ${disabled}><i class="fa-solid fa-shuffle"></i>随机播放</button>
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
        rerenderKeepScroll();
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
        <i class="fa-solid fa-magnifying-glass nep-search-icon" aria-hidden="true"></i>
        <input type="search" name="keywords" placeholder="歌名、歌手" aria-label="搜索歌名或歌手" value="${esc(s.keywords)}" enterkeyhint="search" autocomplete="off">
        <button type="submit" class="nep-btn nep-btn-primary">搜索</button></form>`;
    if (s.error) html += `<div class="nep-error">${esc(s.error)}</div>`;
    if (!s.tracks.length && !s.loading) {
        if (state.history.length) {
            html += `<div class="nep-sec-head"><h2>最近搜索</h2><button type="button" class="nep-link" data-act="clear-history">清除</button></div>
                <div class="nep-chips">${state.history.map((k, i) => `<button type="button" class="nep-chip" data-act="history" data-i="${i}">${esc(k)}</button>`).join('')}</div>`;
        } else if (!s.error) {
            html += '<div class="nep-hint">点歌名立即播放；行尾「⋯」可设为下一首播放、加入队列、红心、收藏到歌单。</div>';
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
let queueView = null; // { ref, len, start }：当前画出来的是哪一份队列、从第几首开始

function renderQueue() {
    const s = engine.getState();
    const start = Math.max(0, s.index - 30);
    queueView = { ref: s.queue, len: s.queue.length, start };
    if (!s.queue.length) return '<div class="nep-hint">队列是空的。去首页挑一个歌单，或者搜一首歌。</div>';
    const [icon, label] = MODES[s.mode];
    let html = `<div class="nep-sec-head"><h2>${s.queue.length} 首</h2>
        <button type="button" class="nep-btn nep-btn-sm" data-act="mode"><i class="fa-solid ${icon}"></i>${label}</button></div>`;
    if (s.source?.hasMore) html += '<div class="nep-hint">歌单剩下的歌会在快放完时自动接上。</div>';
    if (start > 0) html += `<div class="nep-hint">前面还有 ${start} 首已播放</div>`;
    html += lazyList('queue', s.queue.slice(start), (t, k) => trackRow(t, start + k, { current: start + k === s.index }));
    return html;
}

/** 队列页：队列本身没变时只挪高亮；变了（换了歌单、增删了歌）才重画。 */
function syncQueueView() {
    const s = engine.getState();
    if (!queueView || queueView.ref !== s.queue || queueView.len !== s.queue.length || s.index < queueView.start) {
        rerenderKeepScroll();
        return;
    }
    for (const row of body.querySelectorAll('.nep-row[data-i]')) {
        row.classList.toggle('nep-current', Number(row.dataset.i) === s.index);
    }
    const mode = body.querySelector('[data-act=mode]');
    if (mode) mode.innerHTML = `<i class="fa-solid ${MODES[s.mode][0]}"></i>${MODES[s.mode][1]}`;
}

// ---------- 正在播放 ----------

function renderNowView() {
    return `<div class="nep-np">
        <div class="nep-np-stage" title="左右滑动切歌">
            <div class="nep-turntable">
                <svg class="nep-arm" viewBox="0 0 100 100" aria-hidden="true"><path d="M12 12C30 40 48 62 78 70" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
                    <rect x="72" y="63" width="22" height="14" rx="3.5" transform="rotate(15 78 70)" fill="#fff"/><circle cx="12" cy="12" r="9" fill="#fff"/><circle cx="12" cy="12" r="4" fill="#b9b9bd"/></svg>
                <div class="nep-disc-wrap"><div class="nep-disc"><span class="nep-disc-label" aria-hidden="true"><i class="fa-solid fa-music"></i></span><img class="nep-np-cover" alt=""></div></div>
            </div>
            <span class="nep-np-blank" aria-hidden="true"><i class="fa-solid fa-music"></i></span></div>
        <div class="nep-np-info">
            <div class="nep-np-text"><div class="nep-np-title"></div><div class="nep-np-sub"></div></div>
            <button type="button" class="nep-icon nep-like" data-act="like-current" aria-label="红心"><i class="fa-solid fa-heart nep-heart-off"></i></button>
            <button type="button" class="nep-icon" data-act="collect-current" aria-label="收藏到歌单"><i class="fa-solid fa-folder-plus"></i></button>
        </div>
        <div class="nep-progress"><input type="range" min="0" max="1000" value="0" class="nep-seek" aria-label="播放进度">
            <div class="nep-times"><span class="nep-cur">0:00</span><span class="nep-dur">0:00</span></div></div>
        <div class="nep-controls">
            <button type="button" class="nep-icon nep-side nep-mode" data-act="mode" aria-label="播放模式"></button>
            <button type="button" class="nep-icon" data-act="prev" aria-label="上一首"><i class="fa-solid fa-backward"></i></button>
            <button type="button" class="nep-icon nep-np-toggle" data-act="toggle" aria-label="播放/暂停"><i class="fa-solid fa-play"></i></button>
            <button type="button" class="nep-icon" data-act="next" aria-label="下一首"><i class="fa-solid fa-forward"></i></button>
            <button type="button" class="nep-icon nep-side" data-nav="queue" aria-label="播放队列"><i class="fa-solid fa-list-ul"></i></button>
        </div>
        <button type="button" class="nep-btn nep-btn-primary nep-np-cta" data-act="go-home">去首页选歌单</button>
    </div>`;
}

function genTone() {
    if (!gen.label) return '';
    if (gen.state === 'generating') return 'nep-gen';
    return gen.label.includes('已完成') ? 'nep-done' : '';
}

function setSrc(el, src) {
    if (!el || el.dataset.src === src) return;
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
        np.classList.toggle('nep-playing', !!playing);
        np.classList.toggle('nep-empty', !t && !s.silent);
        // 顶栏写正在放的歌单名；深色底用封面的小图放大铺满
        top.querySelector('h1').textContent = (!s.silent && s.source?.name) || TITLES.now;
        setSrc(root.querySelector('.nep-np-bg img'), t?.pic ? art(t.pic, 60) : '');
        np.querySelector('.nep-np-title').textContent = title;
        const sub = np.querySelector('.nep-np-sub');
        sub.textContent = subText || '选一个歌单，或者搜一首歌';
        sub.className = `nep-np-sub ${tone}`;
        setSrc(np.querySelector('.nep-np-cover'), t?.pic ? art(t.pic, 400) : '');
        np.querySelector('.nep-np-toggle i').className = `fa-solid ${playing ? 'fa-pause' : 'fa-play'}`;
        const like = np.querySelector('.nep-like');
        const liked = !!t && isLiked(t.id);
        like.classList.toggle('nep-on', liked);
        like.querySelector('i').className = `fa-solid fa-heart${liked ? '' : ' nep-heart-off'}`;
        like.setAttribute('aria-label', liked ? '取消红心' : '红心');
        like.disabled = !t;
        np.querySelector('[data-act=collect-current]').disabled = !t;
        const silent = top.querySelector('.nep-silent');
        silent.classList.toggle('nep-on', s.silent);
        silent.setAttribute('aria-label', s.silent ? '结束静音播放' : '静音播放');
        const mode = np.querySelector('.nep-mode');
        mode.innerHTML = `<i class="fa-solid ${MODES[s.mode][0]}"></i>`;
        mode.setAttribute('aria-label', `播放模式：${MODES[s.mode][1]}`);
    }
    renderProgress();
}

function renderProgress() {
    if (!root || root.hidden || seeking || document.hidden) return;
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

// ---------- 滑动切歌：底部常驻条、「正在播放」的唱片 ----------

const SWIPE_HOSTS = '.nep-nowbar, .nep-np-stage';
let swipe = null;
let swallowClickUntil = 0;

function onSwipeStart(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const host = e.target.closest(SWIPE_HOSTS);
    const s = engine.getState();
    if (!host || e.target.closest('button') || !s.track || s.silent || swipe) return;
    const target = host.querySelector(host.classList.contains('nep-nowbar') ? '.nep-nowbar-main' : '.nep-disc-wrap');
    swipe = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, active: false, target };
    window.addEventListener('pointermove', onSwipeMove, { passive: false });
    window.addEventListener('pointerup', onSwipeEnd);
    window.addEventListener('pointercancel', onSwipeEnd);
}

function stopSwipeListeners() {
    window.removeEventListener('pointermove', onSwipeMove);
    window.removeEventListener('pointerup', onSwipeEnd);
    window.removeEventListener('pointercancel', onSwipeEnd);
}

function onSwipeMove(e) {
    const s = swipe;
    if (!s || e.pointerId !== s.id) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.active) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        // 先竖着动的是在滚动页面，交还给浏览器
        if (Math.abs(dy) >= Math.abs(dx)) {
            swipe = null;
            stopSwipeListeners();
            return;
        }
        s.active = true;
        s.target.style.transition = 'none';
    }
    e.preventDefault();
    s.dx = dx;
    s.target.style.transform = `translate3d(${dx}px,0,0)`;
    s.target.style.opacity = String(Math.max(0.3, 1 - Math.abs(dx) / 260));
}

function onSwipeEnd(e) {
    const s = swipe;
    if (!s || e.pointerId !== s.id) return;
    swipe = null;
    stopSwipeListeners();
    if (!s.active) return;
    swallowClickUntil = Date.now() + 400;
    const el = s.target;
    const speed = Math.abs(s.dx) / Math.max(1, performance.now() - s.t);
    // 拖过 64px，或者快速一甩（超过 24px）都算切歌
    const commit = e.type === 'pointerup' && (Math.abs(s.dx) > 64 || (speed > 0.45 && Math.abs(s.dx) > 24));
    el.style.transition = 'transform .2s var(--nep-ease-out),opacity .2s ease';
    if (!commit) {
        el.style.transform = '';
        el.style.opacity = '';
        return;
    }
    const forward = s.dx < 0;
    unlock();
    el.style.transform = `translate3d(${forward ? -120 : 120}px,0,0)`;
    el.style.opacity = '0';
    setTimeout(() => {
        if (forward) engine.next();
        else engine.prev(false);
        // 新歌从另一侧滑进来
        el.style.transition = 'none';
        el.style.transform = `translate3d(${forward ? 60 : -60}px,0,0)`;
        void el.offsetWidth;
        el.style.transition = 'transform .28s var(--nep-ease-out),opacity .2s ease';
        el.style.transform = '';
        el.style.opacity = '';
    }, 150);
}

// ---------- 操作单：下一首播放、加到队列、红心、收藏到歌单、从歌单删除、移出队列 ----------

function trackAt(i) {
    const v = view().view;
    if (v === 'search') return state.search.tracks[i];
    if (v === 'playlist') return state.playlist?.tracks[i];
    if (v === 'queue') return engine.getState().queue[i];
    return null;
}

function openSheet(track, mode = 'actions', i = null) {
    if (!track) return;
    state.sheet = { track, mode, i };
    if (mode === 'collect' && loggedIn() && !state.playlists && !state.playlistsLoading) loadPlaylists();
    refreshSheet(true);
}

/** immediate：面板收起时直接移除，不播退场动画。 */
function closeSheet(immediate = false) {
    state.sheet = null;
    const scrim = root?.querySelector('.nep-scrim:not(.nep-leaving)');
    if (!scrim) return;
    if (immediate) {
        scrim.remove();
        return;
    }
    scrim.classList.add('nep-leaving');
    setTimeout(() => scrim.remove(), 170);
}

/**
 * 操作单浮在面板上（挂在面板根节点下），不跟着列表滚动。
 * 第一次打开时插入并播放升起动画；之后（红心、切到「收藏到歌单」、歌单列表到了）只换里面的内容。
 */
function refreshSheet(fresh = false) {
    if (!root) return;
    const scrim = root.querySelector('.nep-scrim:not(.nep-leaving)');
    if (!state.sheet) {
        scrim?.remove();
        return;
    }
    const { label, html } = renderSheet();
    if (scrim && !fresh) {
        const sheet = scrim.querySelector('.nep-sheet');
        // 换内容会删掉带焦点的按钮，焦点掉到 body 上后 Esc 就关不掉操作单：换完把焦点放回同一个操作
        const active = document.activeElement;
        const inside = sheet.contains(active);
        const focused = inside ? active.dataset.act : null;
        sheet.setAttribute('aria-label', label);
        sheet.innerHTML = html;
        if (inside || !active || active === document.body) {
            (sheet.querySelector(`[data-act="${focused}"]`) || sheet.querySelector('button'))?.focus({ preventScroll: true });
        }
        return;
    }
    scrim?.remove();
    root.insertAdjacentHTML('beforeend', `<div class="nep-scrim" data-act="sheet-close"><div class="nep-sheet" role="dialog" aria-label="${label}">${html}</div></div>`);
    root.querySelector('.nep-scrim:not(.nep-leaving) .nep-sheet button')?.focus({ preventScroll: true });
}

function renderSheet() {
    const sh = state.sheet;
    const t = sh.track;
    const head = `<div class="nep-sheet-head">${lead(t.pic)}<div><h3>${esc(t.name)}</h3>
        <div class="nep-row-sub">${esc(t.ar)}</div></div></div>`;
    const cancel = '<button type="button" class="nep-sheet-cancel" data-act="sheet-close">取消</button>';
    if (sh.mode === 'collect') {
        const own = (state.playlists || []).filter(p => p.mine && !p.liked);
        const note = (text, cls = 'nep-hint') => `<div class="${cls}" style="margin:0 12px 8px">${text}</div>`;
        let rows;
        if (!loggedIn()) rows = note('先在「账号与设置」里扫码登录网易云。');
        else if (state.playlistsError && !state.playlists) rows = note(esc(state.playlistsError), 'nep-error');
        else if (!state.playlists) rows = note('正在读取歌单…');
        else if (!own.length) rows = note('还没有自己创建的歌单，可以先在网易云 App 里新建一个。');
        else {
            rows = own.map(p => `<button type="button" class="nep-act" data-act="collect-to" data-pid="${p.id}">${img(p.cover, 80)}
                <span>${esc(p.name)}</span><small>${p.count} 首</small></button>`).join('');
        }
        return { label: '收藏到歌单', html: `${head}<div class="nep-hint" style="margin:0 12px 6px">收藏到哪个歌单</div>${rows}${cancel}` };
    }
    const liked = isLiked(t.id);
    const v = view().view;
    const pl = v === 'playlist' ? state.playlist : null;
    const canRemove = pl?.kind === 'mine' && pl.meta.mine && !pl.meta.liked;
    const inQueue = v === 'queue';
    const canDequeue = inQueue && Number.isInteger(sh.i) && sh.i !== engine.getState().index;
    const act = (name, icon, text, extra = '') => `<button type="button" class="nep-act${extra}" data-act="${name}"><i class="fa-solid ${icon}"></i><span>${text}</span></button>`;
    const rows = [
        inQueue ? '' : act('sheet-next', 'fa-arrow-turn-down', '下一首播放'),
        inQueue ? '' : act('sheet-enqueue', 'fa-list-ul', '加到队列末尾'),
        `<button type="button" class="nep-act${liked ? ' nep-on' : ''}" data-act="sheet-like"><i class="fa-solid fa-heart${liked ? '' : ' nep-heart-off'}"></i><span>${liked ? '取消红心' : '红心'}</span></button>`,
        act('sheet-collect', 'fa-folder-plus', '收藏到歌单'),
        canDequeue ? act('sheet-dequeue', 'fa-xmark', '移出播放队列') : '',
        canRemove ? act('sheet-remove', 'fa-trash-can', `从「${esc(pl.meta.name)}」删除`, ' nep-danger') : '',
    ].join('');
    return { label: '歌曲操作', html: `${head}${rows}${cancel}` };
}

async function toggleLike(track) {
    if (!loggedIn()) return void toast('warning', '先在「账号与设置」里扫码登录网易云');
    try {
        // 红心列表和胶囊卡片共用，界面先改，失败时 likes 会改回来并通知重画
        const like = await likes.toggle(track);
        toast('success', like ? `已红心：${track.name}` : `已取消红心：${track.name}`);
        markPlaylistsStale();
    } catch (error) {
        toast('error', error.message);
    }
}

/** 红心状态变了（这里点的，或胶囊卡片上点的）：只改受影响的地方。 */
function afterLikeChange() {
    if (!root || root.hidden) return;
    renderNow();
    if (state.sheet) refreshSheet();
    syncRowHearts();
}

/** 服务端插件 0.6.0 以前会把成功的歌单写操作报成失败。 */
function writeMisreported() {
    const v = state.account?.pluginVersion || '';
    return !v || versionLess(v, '0.6.0');
}

/**
 * 旧版服务端报了失败：重新向网易云取一次歌单列表，看这个歌单的曲目数有没有按预期变化。
 * 返回 true（确实成功了）、false（没变）或 null（核对不了）。
 */
async function verifyWrite(pid, delta) {
    const before = state.playlists?.find(p => String(p.id) === String(pid))?.count;
    if (!Number.isFinite(before)) return null;
    try {
        const data = await api('playlists', { fresh: true });
        const after = data.playlists.find(p => String(p.id) === String(pid))?.count;
        applyPlaylists(data.playlists);
        showPlaylistsChange();
        return Number.isFinite(after) ? after - before === delta : null;
    } catch {
        return null;
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
        if (!writeMisreported() || error.needLogin) return void toast('error', error.message);
        const ok = await verifyWrite(pid, 1);
        if (ok) toast('success', `已收藏到「${target?.name || '歌单'}」`);
        else if (ok === false) toast('warning', `没有加进「${target?.name || '歌单'}」：歌单里已有这首歌，或网易云拒绝了这次操作`);
        else toast('error', '收藏结果无法确认，请刷新歌单查看');
    }
}

async function removeFromPlaylist(track) {
    const pl = state.playlist;
    if (!pl) return;
    closeSheet();
    const removed = () => {
        toast('success', `已从「${pl.meta.name}」删除`);
        // 核对时发现曲目数变了会整个重拉这个歌单（state.playlist 换成新对象），那就不用再手动摘掉这一行
        if (state.playlist !== pl) return;
        const at = pl.tracks.findIndex(t => t.id === track.id);
        if (at >= 0) pl.tracks.splice(at, 1);
        list = null;
        if (view().view === 'playlist') rerenderKeepScroll();
    };
    try {
        await api('playlist/remove', { pid: pl.meta.id, ids: [track.id] });
        pl.meta = { ...pl.meta, count: Math.max(0, pl.meta.count - 1) };
        removed();
        markPlaylistsStale();
    } catch (error) {
        if (!writeMisreported() || error.needLogin) return void toast('error', error.message);
        const ok = await verifyWrite(pl.meta.id, -1);
        if (ok) removed();
        else toast('error', ok === false ? '没有删掉，网易云拒绝了这次操作' : '删除结果无法确认，请刷新歌单查看');
    }
}

/** 写回网易云之后，歌单曲目数变了：在后台重新取一次歌单列表。 */
function markPlaylistsStale() {
    loadPlaylists({ fresh: true, quiet: true });
}

/** 首页上推荐歌单、排行榜的播放键：不进歌单页，取到第一页就开始放。 */
async function playRemote(kind, meta) {
    if (!meta || state.busyPlay) return;
    // 必须在点击的同步流程里先解锁音频，取完歌再播放 iOS 才放行
    const unlockedHere = !isUnlocked();
    unlock();
    state.busyPlay = `${kind}:${meta.id}`;
    updateHome(kind);
    try {
        const data = await api('playlist/tracks', { id: meta.id, offset: 0, limit: 200 });
        if (!data.tracks.length) throw new Error('这个歌单是空的');
        const shuffle = engine.getState().mode === 'shuffle';
        const start = shuffle ? Math.floor(Math.random() * data.tracks.length) : 0;
        engine.playTracks(data.tracks, start, { type: 'playlist', id: meta.id, name: meta.name, offset: data.tracks.length, hasMore: !!data.hasMore });
        toast('info', `正在播放：${meta.name}`);
    } catch (error) {
        if (unlockedHere && !engine.getState().track) engine.pause();
        toast('error', error.message);
    }
    state.busyPlay = '';
    updateHome(kind);
}

// ---------- 账号与设置 ----------

function renderAccount() {
    if (state.accountError) {
        return `<div class="nep-error" style="margin:12px 16px 8px">${esc(state.accountError)}</div>
            <button type="button" class="nep-btn" data-act="refresh-account">重试</button>`;
    }
    if (!state.account) return '<div class="nep-set"><span class="nep-hint" style="margin:0;padding:0">正在查询登录状态…</span></div>';
    if (state.account.loggedIn) {
        return `${profileBlock()}
            <button type="button" class="nep-set nep-set-btn nep-danger" data-act="logout"><span>退出登录</span></button>`;
    }
    const qr = state.qr;
    let html = '<div class="nep-hint">未登录时只能播放免费歌曲，没有每日推荐和红心；VIP 歌曲需要登录 VIP 账号。</div>';
    if (!qr) return `${html}<button type="button" class="nep-btn nep-btn-primary" data-act="qr-start">扫码登录</button>`;
    if (qr.error) html += `<div class="nep-error" style="margin:0 16px 8px">${esc(qr.error)}</div>`;
    if (qr.img) html += `<img class="nep-qr" src="${esc(qr.img)}" alt="登录二维码">`;
    html += `<div class="nep-hint"><b>手机相机扫不到本机屏幕上的码。</b><br>
        截图本页 → 网易云 App「扫一扫」→ 右上角从相册选这张截图 → 在 App 里确认登录，再回到这里。</div>
        <div class="nep-hint nep-qr-status">状态：${esc(qr.message || '等待扫码…')}</div>
        <div class="nep-btn-row"><button type="button" class="nep-btn" data-act="qr-copy">复制登录链接</button>
        <button type="button" class="nep-btn" data-act="qr-start">换一张</button></div>`;
    if (qr.copyFailed) {
        html += `<div class="nep-hint">自动复制失败，请长按下面的链接手动复制：</div>
            <div style="padding:0 16px 12px"><input type="text" readonly value="${esc(qr.url)}" style="width:100%"></div>`;
    }
    return html;
}

function options(key, items) {
    return `<select data-setting="${key}" data-kind="text">${items
        .map(([v, label]) => `<option value="${v}" ${settings[key] === v ? 'selected' : ''}>${label}</option>`).join('')}</select>`;
}

function renderSettings() {
    const ms = 'mediaSession' in navigator ? '可用' : '不可用，锁屏不显示歌名';
    const log = getLog().slice().reverse().map((e) => {
        const d = new Date(e.t);
        const time = [d.getHours(), d.getMinutes(), d.getSeconds()].map(n => String(n).padStart(2, '0')).join(':');
        return `${time} ${e.name}${e.detail ? ` ${e.detail}` : ''}`;
    }).join('\n');
    const minutes = [1, 3, 5, 10].map(n => `<option value="${n}" ${Number(settings.statusMinutes) === n ? 'selected' : ''}>${n} 分钟</option>`).join('');
    const sv = state.account?.pluginVersion || '';
    const serverLine = sv
        ? `服务端插件 ${esc(sv)}${versionLess(sv, SERVER_MIN) ? `，低于 ${SERVER_MIN}，需在服务器上更新` : ''}`
        : (state.account ? `服务端插件版本未知（0.5.2 或更早），需在服务器上更新到 ${SERVER_MIN}` : '');
    return `
        <div class="nep-group-title">网易云账号</div>
        <div class="nep-group">${renderAccount()}</div>

        <div class="nep-group-title">外观</div>
        <div class="nep-group">
            <label class="nep-set"><span>常驻入口</span>${options('entry', ENTRY_OPTIONS)}</label>
            <label class="nep-set"><span>玻璃颜色</span>${options('glass', GLASS_OPTIONS)}</label>
            <label class="nep-set"><span>玻璃质感</span>${options('glassFx', GLASSFX_OPTIONS)}</label>
            ${settings.entry === 'float' ? `<button type="button" class="nep-set nep-set-btn" data-act="float-reset"><span>悬浮胶囊回到顶部居中</span>${CHEVRON}</button>` : ''}
            <div class="nep-hint">「通透」模糊背后的聊天内容，滑动聊天记录卡顿时可改为「不透明」。入口选「关闭」后，从魔法棒菜单或扩展设置打开播放器。</div>
        </div>

        <div class="nep-group-title">播放</div>
        <div class="nep-group">
            <label class="nep-set"><span>跳过只有试听片段的歌</span><input type="checkbox" class="nep-switch" data-setting="skipTrial" ${settings.skipTrial ? 'checked' : ''}></label>
            <label class="nep-set"><span>提示音打断音乐后自动接着放</span><input type="checkbox" class="nep-switch" data-setting="autoResume" ${settings.autoResume ? 'checked' : ''}></label>
            <div class="nep-hint">不想听歌时，在「正在播放」里点静音键：不出声，照样保持页面不被挂起，锁屏照样显示生成状态。</div>
        </div>

        <div class="nep-group-title">锁屏生成状态</div>
        <div class="nep-group">
            <label class="nep-set"><span>「回复已完成」保留</span><select data-setting="statusMinutes">${minutes}</select></label>
            <div class="nep-hint">到时或回到酒馆页面后，恢复显示歌手名。当前：${esc(gen.label || '无')}</div>
        </div>

        <div class="nep-group-title">诊断</div>
        <div class="nep-group">
            <div class="nep-hint">Media Session ${ms}。${serverLine ? `${serverLine}。` : ''}事件日志保留最近 10 条，最新在上。</div>
            <div class="nep-log">${esc(log || '（空）')}</div>
            <div class="nep-btn-row"><button type="button" class="nep-btn nep-btn-sm" data-act="log-refresh">刷新</button>
            <button type="button" class="nep-btn nep-btn-sm" data-act="log-clear">清空</button></div>
        </div>

        <div class="nep-group-title">关闭播放器</div>
        <div class="nep-group">
            <div class="nep-hint">停止播放、清空队列，收起悬浮胶囊或迷你播放条；登录状态保留。从魔法棒菜单或扩展设置再次打开时恢复。</div>
            <button type="button" class="nep-set nep-set-btn nep-danger" data-act="shutdown"><span>停止并关闭</span></button>
        </div>`;
}

// ---------- 数据 ----------

async function loadHome() {
    const h = state.home;
    h.loadedAt = Date.now();
    h.recError = '';
    h.topError = '';
    // 每一块拿到就只替换那一块，不等最慢的那个，也不重画别的块
    const jobs = [
        api('home/playlists').then((d) => { h.rec = d.playlists; }, (e) => { if (!h.rec) h.recError = e.message; }).then(() => updateHome('rec')),
        api('home/toplists').then((d) => { h.top = d.toplists; }, (e) => { if (!h.top) h.topError = e.message; }).then(() => updateHome('top')),
    ];
    if (loggedIn()) {
        h.dailyError = '';
        jobs.push(api('home/daily').then((d) => { h.daily = d.tracks; }, (e) => { if (!h.daily) h.dailyError = e.message; }).then(() => updateHome('mine')));
        jobs.push(likes.load(true));
        if (!state.playlists) jobs.push(loadPlaylists({ quiet: true }));
    }
    await Promise.allSettled(jobs);
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
    if (view().view === 'search') more ? rerenderKeepScroll() : renderBody();
}

/** 歌单列表变了：首页只换「我的歌单」那一块，「我的歌单」页保持滚动位置重画。 */
function showPlaylistsChange() {
    if (!root || root.hidden) return;
    const v = view().view;
    if (v !== 'home') return;
    updateHome('mine');
    updateHome('profile');
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
    if (!quiet) showPlaylistsChange();
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
    if (view().view === 'playlist') updatePlaylistView(state.playlist);
    else showPlaylistsChange();
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
    if (!root.hidden) {
        // 首页只替换内容真变了的块（登录状态到达前后，骨架屏大多一样，不用重画）
        if (view().view === 'home') for (const key of HOME) updateHome(key);
        else if (view().view === 'settings') rerenderKeepScroll();
    }
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
            qr.message = '二维码已过期，点「换一张」';
            if (view().view === 'settings') renderBody();
            return;
        }
        try {
            const data = await api('qr/check', { key });
            const messages = {
                800: '二维码已过期，点「换一张」',
                801: '等待扫码…',
                802: '已扫码，请在网易云 App 里确认',
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
        rerenderKeepScroll();
        return;
    }
    if (key === 'glass') return void setGlass(value);
    if (key === 'glassFx') return void setGlassFx(value);
    settings[key] = type === 'checkbox' ? checked : (dataset.kind === 'text' ? value : Number(value));
    saveSettings();
}

function cycleMode() {
    const order = ['loop', 'shuffle', 'one'];
    engine.setMode(order[(order.indexOf(engine.getState().mode) + 1) % order.length]);
}

function onClick(e) {
    if (!body.contains(e.target) && !e.target.closest('.nep-scrim')) return;
    const nav = e.target.closest('[data-nav]');
    if (nav) return void go(nav.dataset.nav);
    const actEl = e.target.closest('[data-act]');
    const act = actEl?.dataset.act;
    const i = Number(actEl?.dataset.i ?? e.target.closest('.nep-row')?.dataset.i);
    const sheet = state.sheet;
    const sheetTrack = sheet?.track;

    switch (act) {
        // 操作单
        case 'sheet-close':
            // 点到操作单本身（不是遮罩、不是取消键）不关
            if (e.target === actEl || actEl.tagName === 'BUTTON') closeSheet();
            return;
        case 'more': return void openSheet(trackAt(i), 'actions', i);
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
            sheet.mode = 'collect';
            if (loggedIn() && !state.playlists && !state.playlistsLoading) loadPlaylists();
            return void refreshSheet();
        case 'collect-to': return void collectTo(sheetTrack, actEl.dataset.pid);
        case 'sheet-remove': return void removeFromPlaylist(sheetTrack);
        case 'sheet-dequeue':
            if (engine.getState().queue[sheet.i]?.id === sheetTrack.id) engine.removeAt(sheet.i);
            return void closeSheet();

        // 首页
        case 'open-daily': return void openPlaylist('daily', { id: 'daily', name: '每日推荐', count: state.home.daily?.length || 0 }, state.home.daily || []);
        case 'play-daily':
            e.stopPropagation();
            if (state.home.daily?.length) engine.playTracks(state.home.daily, 0, null);
            return;
        case 'reload-daily':
        case 'reload-home':
            state.home = { ...state.home, dailyError: '', recError: '', topError: '' };
            for (const key of HOME) updateHome(key);
            return void loadHome();
        case 'open-rec': return void (state.home.rec?.[i] && openPlaylist('rec', state.home.rec[i]));
        case 'play-rec': return void playRemote('rec', state.home.rec?.[i]);
        case 'open-top': return void (state.home.top?.[i] && openPlaylist('top', { ...state.home.top[i], count: 0 }));
        case 'play-top': return void playRemote('top', state.home.top?.[i]);
        case 'reload-playlists':
            state.playlists = null;
            state.playlistsError = '';
            showPlaylistsChange();
            return void loadPlaylists({ fresh: true });
        case 'refresh-playlists':
            loadPlaylists({ fresh: true }).then((ok) => {
                if (ok) toast('success', '歌单已刷新');
            });
            return;
        case 'home-tab': return void setHomeTab(actEl.dataset.tab);
        case 'open-playlist': return void (state.playlists?.[i] && openPlaylist('mine', state.playlists[i]));
        case 'play-mine': return void playRemote('mine', state.playlists?.[i]);
        case 'go-home':
            closeSheet();
            remember();
            state.stack = [{ view: 'home' }];
            list = null;
            render();
            body.scrollTop = 0;
            return;

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
                likes.reset();
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
