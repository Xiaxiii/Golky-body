# 测试

不连网易云，只测本项目自己的代码：用 `fake-ncm/` 代替网易云接口包，在真实的 SillyTavern 1.19.0 里跑。

```bash
# 1. 准备 SillyTavern 1.19.0
git clone --depth 1 --branch 1.19.0 https://github.com/SillyTavern/SillyTavern.git st && cd st
npm ci --omit=dev
cp default/config.yaml config.yaml
sed -i 's/^enableServerPlugins: false/enableServerPlugins: true/; s/^enableServerPluginsAutoUpdate: true/enableServerPluginsAutoUpdate: false/; s/^enableUserAccounts: false/enableUserAccounts: true/; s/^whitelistMode: true/whitelistMode: false/; s/^port: 8000/port: 8123/' config.yaml

# 2. 装插件和扩展，用替身代替接口包
mkdir -p plugins/netease-player/node_modules/@neteasecloudmusicapienhanced
cp ../server/netease-player/* plugins/netease-player/
cp -r ../tests/fake-ncm plugins/netease-player/node_modules/@neteasecloudmusicapienhanced/api
mkdir -p public/scripts/extensions/third-party/netease-player
cp ../manifest.json ../index.js ../engine.js ../panel.js public/scripts/extensions/third-party/netease-player/
# 也可以测「安装扩展」的 Git 安装：酒馆启动后 POST /api/extensions/install {"url": "<仓库地址>"}，
# 本地仓库需要用 smart HTTP 提供（酒馆用 --depth=1 克隆，dumb HTTP 不支持）

# 3. 测试音频（3 秒正弦波），放在 8124 端口
mkdir -p /tmp/songs && (cd /tmp/songs && python3 /path/to/repo/tests/make-songs.py && python3 -m http.server 8124 &)

# 4. 启动酒馆，再跑测试。NEP_FAKE_STATE 是替身和测试共用的文件，测试往里写数字来模拟「在网易云 App 里改了歌单」
export NEP_FAKE_STATE=/tmp/nep-fake-state
node server.js &
PLAYWRIGHT=/path/to/playwright node ../tests/e2e.cjs
```

覆盖：启动阶段的请求数、面板懒加载、搜索播放、换歌（胶囊下一首键、底部条左滑、「正在播放」的列表键进播放队列点歌、推荐歌单行尾直接播放）、Media Session metadata、生成状态（事件和 `data-generating` 备用信号）、
扫码登录流程、歌单播放全部、预取下一首后无静音直接切歌、取不到地址时跳过、暂停/继续/下一首、刷新后恢复队列并「继续播放」、
悬浮胶囊（默认位置、鼠标和触摸拖动、位置保存、拖动不误触、轻点展开成播放卡片、卡片上的播放键和红心、点外面收回原位、卡片上打开完整面板、面板开着时让位）、扩展设置面板条目、常驻入口「关闭」和「停止并关闭」真正收起胶囊、首页（未登录提示登录，登录后居中的个人资料和歌单 / 推荐 / 排行榜三栏）、「正在播放」唱片页（唱臂、唱片转动、一屏放得下、顶栏静音键）、触摸事件被拦时迷你播放条仍可点、操作单红心、收藏到歌单和从歌单删除（替身按真实接口包返回多包一层的结果；含重复收藏提示和真实失败）、歌单「刷新」跳过插件缓存、打开面板自动检查歌单更新、
常驻入口三种设置的切换和保存、500 首大歌单分批渲染和滑到底自动加载。每次跑之前删掉酒馆 `plugins/netease-player/data/` 并重启酒馆（清掉上次的登录和缓存）。

iOS 后台行为（锁屏连续播放、锁屏刷新 metadata、提示音是否打断）只能在 iPhone 上实测，见根目录 README 的测试清单。
