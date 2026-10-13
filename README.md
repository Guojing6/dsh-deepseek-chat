# @guojing6/dsh-deepseek-chat

DeepSeek Harness 客户端插件（web 与 desktop profile），把侧边栏顶部的 **DeepSeek Harness** 标题由「新建会话」改为 DeepSeek Chat 的切换开关，仿 Codex 客户端 ChatGPT/Codex 的切换方式：

| 点哪里 | 结果 |
| --- | --- |
| DSH 侧边栏顶部的标题 | Desktop：在**应用内**切换到 chat.deepseek.com（窗口内嵌视图）；Web：当前页跳转 |
| 视图右下角的圆形返回按钮（视图内是 chat 界面时） | 切回 DSH（Desktop） |
| 视图右下角的圆形返回按钮（视图内是从对话点开的网页时） | 回到 chat 界面（Desktop） |

没有菜单——点一下就切换，两个方向读起来一致。独立的「新会话」按钮不受影响；展开侧边栏后点顶部标题即可使用。

## 安装

本插件从源码安装。Web 与 Desktop 使用各自独立的 profile（`$DSH_HOME/profiles/web` 与 `$DSH_HOME/profiles/desktop`），互不共享插件，需分别安装：

```sh
git clone https://github.com/Guojing6/dsh-deepseek-chat.git

# Web
dsh plugin --profile web add ./dsh-deepseek-chat

# Desktop：先启动一次 Desktop 初始化其 profile，完全退出后再执行
dsh plugin --profile desktop add ./dsh-deepseek-chat
```

`dsh plugin` 会在 profile 目录里转发给 pnpm，所以 pnpm 的写法都可用——本地目录也可以直接给绝对路径（例如 `dsh plugin --profile desktop add E:/workspace/dsh-deepseek-chat`，profile 里会记成 `link:`），卸载用 `dsh plugin --profile <name> remove @guojing6/dsh-deepseek-chat`。

Web 安装后重启 Harness 并刷新网页；Desktop 安装后重新打开应用（关闭窗口只是收进托盘，需要从托盘完全退出）。Desktop 也可用其自带的 `resources/runtime/cli/bin/dsh` 执行同样的命令。

## Desktop：应用内切换

Desktop 下选择 DeepSeek Chat **不会跳到浏览器**，而是在同一个窗口内把**右侧内容区**换成 chat.deepseek.com：顶栏（「应用」「编辑」菜单与窗口控制按钮）和左侧边栏（logo、会话列表、工作区、费用、账户）都原样保留。

返回有两个入口：**右下角的圆形返回图标按钮**（位于输入框右侧上方，不遮挡发送按钮；图标取自「返回-圆形填充」，内联后改用 `currentColor` 与 DSH 的主题变量，深浅色都能跟），或**点侧边栏顶部的标题**。切回后再点标题会回到同一视图（不重新加载，保留视图内状态）。

这颗圆形按钮只有一颗，含义看 guest 当前停在哪：**视图内是从对话里点开的网页时**（回答里的链接就在这一个视图里打开，见下文 `onOpenRequested`），点它沿 guest 自己的 Chromium 历史退回那个对话——与浏览器后退同义，应用不重新加载、草稿与滚动位置都还在，鼠标提示同步写成「返回 DeepSeek Chat」；**视图内就是 chat 界面时**，它把视图收起来、回到 DSH，提示回到「返回 DeepSeek Harness」。判断依据只有地址：`chat.deepseek.com` 上的文档算 chat 界面，插件自己加载的种子页（`/robots.txt`）不算，其余 http(s) 文档都算「从对话点开的网页」。

视图的位置和圆角不是写死的：宿主的 frame 元素发布 `--dsh-windows-sidebar-width` 与 `--dsh-windows-content-radius`，顶栏高度由 Windows preload 写在 `<html>` 上；插件在每次切换时读取这三者并套用到视图上，所以侧边栏拖拽或折叠之后，视图仍与内容区严丝合缝。

这不是 Codex 那种原生产品切换——Codex 的 ChatGPT/Codex 都是 OpenAI 自家界面，而 DeepSeek Chat 是 DSH 之外的独立网站，只能用 Electron webview 嵌入。以下是当前**已知的问题与限制**，按来源分三类。

### 一、由 DSH 壳的 guest 策略决定（插件只能绕开）

- **重启 DSH 后原本必须重新登录（现已缓解）。** 嵌入视图运行在独立存储分区，与 DSH 的登录态隔离。该分区既没有 `persist:` 前缀（Electron 语义下即内存会话），名字又由主进程用随机 UUID 生成（`apps/desktop/src/browser-guests.ts` 的 `acquire()`），所以 guest 里的 cookie 与 localStorage 都不跨进程保留。
  插件改为**把 guest 的登录态镜像出来**：DeepSeek Chat 的登录凭证就存在 localStorage（`userToken` 与 `__appKit_userInfo`，见其 main bundle），插件在 guest 里读出整个 localStorage 存进主应用页自己的 localStorage——`dsh-app` 是注册为 standard + secure 的自定义协议、跑在持久的 default session 上，这份副本能跨重启；下次启动先用一个同源静态页（`/robots.txt`，不会启动应用）把凭证写回 guest，再进真正的首页。顺序不能反：应用只在启动时读一次 token。
  仍然存在的缺口：HttpOnly 的 cookie（`ds_session_id`、`HWWAFSESID` 等）JS 读不到也写不回。认证走的是 localStorage 里的 token，目前不受影响；**若 DeepSeek 改为纯 cookie 认证，这条路径会失效**。
  DSH 官方的侧边栏浏览器用的是同一套 guest 机制，没有这层镜像，仍然每次重启都要重登。
  另一条绕开方式仍然是**别退出进程**：关闭窗口只是收进托盘，进程继续跑，登录态自然一直在。
- **权限被全部拒绝。** 通知、剪贴板、设备权限一律拒绝，**下载被禁止**，视图内也不能访问 DSH 自身的服务地址。
- **依赖 DSH 的内部桥。** 视图通过主应用文档上的 `window.dshDesktop.browser` 申请 guest 租约——DSH 只接受持有租约的 `<webview>`，`will-attach-webview` 会校验 `src`、`partition`、owner 与「单次 attach」。这是未对第三方公开的契约（`protocolVersion: 1`），升级后可能变化；不可用时插件回退到系统浏览器打开。

### 二、依赖宿主 DOM 结构（DSH 改版可能失效）

- **视图定位。** `readFrameInsets()` 从品牌元素向上找到 `#root` 的直接子元素（即 `.frame`），读它的 `--dsh-windows-sidebar-width` 与 `--dsh-windows-content-radius`；顶栏高度取自 `<html>` 上的 `--dsh-windows-titlebar-height`。前两个变量定义在 `.frame` 上而非 `<html>`，CSS 继承读不到，只能从 DOM 取。视图打开时另有一个 `MutationObserver` 盯着 `.frame` 的 `style` 与 `data-sidebar-collapsed`，所以**开着视图拖侧栏或折叠，视图会跟着走**（宿主拖拽时正是把这些值重写进自己的内联样式，见 `AppFrame.tsx`）。又因为 `--dsh-windows-sidebar-width` 只在 Windows 上发布（同一处被 `data-windows-titlebar` 门控），其余平台退回解析 `.frame` 的 `grid-template-columns` 首轨——那是宿主每帧都写的列解算，于是 `left` 不再退化为 0 而盖住侧栏。**若 DSH 在 `#root` 下新增包装层，两条路径会一起落空**，表现为 `left` 退化为 0、视图重新盖住侧边栏。
- **品牌定位。** `span[class*="brandIdentity"]` 匹配的是 CSS Module 的稳定局部名（已不依赖构建哈希），但 DSH 若重命名这个局部名，选择器即失效——症状是**点标题毫无反应且不报错**。
- **悬停高亮的留白。** 宿主的品牌是 `flex:1` 的整行按钮（`.brand`），直接把背景画在触发器上会从 logo 一直铺到行尾；插件改成给 `brandIdentity` 加内边距、再配等量负外边距抵消位移，让高亮只包住 logo 与文字。左右各留 4px 是按宿主 `.brand` 自身的左内边距取的，DSH 若改这个值，高亮会被行的 `overflow:hidden` 削掉一角。高亮色取宿主的 `--dsw-alias-interactive-bg-hover`（侧边栏行悬停用的同一个 token），随浅深色主题切换。
- **只绑定一次。** 首次找到标题后 `MutationObserver` 即断开，宿主重建侧边栏后需刷新页面才会重绑。

### 三、本实现自身的取舍

- **点侧栏会收起视图。** 侧栏与标题栏留在视图之外、始终可点，所以插件在捕获阶段监听文档的 `click`：落到视图与品牌之外（会话行、设置、窗口菜单）就先收起视图，免得宿主把内容画在视图背后、看起来像「点了没反应」。品牌本身豁免——它自己的处理器就是那个开关。
- **侧边栏折叠时没有返回入口。** 折叠状态下品牌元素不渲染（`SidebarRoot` 里是 `{wide && …}`），此时需先点顶栏的折叠按钮展开侧边栏，再点标题切回。
- **「返回」走 guest 自己的历史，依赖「视图先进入 chat 再打开链接」这条路径。** guest 的 Chromium 历史里，chat 界面一定排在从对话点开的网页之前（视图先 `loadURL(首页)`，之后链接才可能打开），所以后退一步就是那个对话。若某次历史被页面自己 `replaceState` 顶掉、或 guest 报告无法后退，插件退回加载**它记录到的最后一个 chat 地址**（`did-navigate` / `did-navigate-in-page` 时记录），代价是应用重新加载一次；连跳多层外链时一次点击只退一层，与浏览器一致，需要连点。
- **视图在 guest 就绪之前就已经露出来了。** `<webview>` 自己的方法（`getURL`、`canGoBack`、`goBack`、`loadURL`、`setUserAgent`、`executeJavaScript`）在 guest attach 并发出 `dom-ready` 之前一律抛 `The WebView must be attached to the DOM and the dom-ready event emitted before this method can be called`（Electron 44 实测，日志里就是这句）。所以「读 guest」全部收在 `guestUrl()` 后面（`dom-ready` 时才置 `guestReady`），显示路径绝不碰元素，按钮也只在就绪后才按地址分流。这条踩过一次：在 `show()` 里读了一次地址，于是**每次启动后的第一次点击都抛错、走「打开系统浏览器」的兜底，第二次点击才进视图**——现在有一条专门用例守住它。
- **Web 端行为随之改变。** 同一份代码在 web 下走另一条路径：点标题直接 `location.assign(chat.deepseek.com)`，不再弹菜单。若希望 Web 保留菜单式交互，需要按 `IS_DESKTOP` 分成两条路径。
- **macOS 分支未实测。** 品牌在 macOS Desktop 下是窗口拖拽行里的 `span`（不是 button），代码按 `closest("button") ?? parentElement` 回退并补 `role="button"` / `tabindex="0"`，依据是 `SidebarRoot.tsx` 与 `base.css` 的规则推导，未在真机验证。
- **按钮位置是按截图估算的。** `right: 24px; bottom: 150px` 由截图缩放比例换算而来，未做像素级校准。
- **返回按钮的颜色刻意不跟随 DSH 主题。** 它浮在 chat.deepseek.com 的页面上，而那个页面是浅色的：改用 `--dsw-alias-label-tertiary` 的话，深色主题下会解析成 `neutral-bluish-400`（#ADB2B8），压在白底上几乎看不见；浅色主题下又变成 `neutral-bluish-600`（#81858C），比现在深得多。所以这里按「压在浅色页面上」写死 `#b0b5bd`（≈ `neutral-bluish-400`），深浅色 DSH 下都看得见。品牌悬停高亮则相反——它画在 DSH 自己的侧边栏上，所以跟着主题走。
- **登录态镜像多存了一份明文 token。** 快照存在 `dsh-app://app` 源的 localStorage 里（键 `dsh-deepseek-chat:chat-session`），同应用内的其他插件都能读到；它和浏览器里保存的是同一类凭证，但确实多了一个副本，且卸载插件不会自动清掉这份快照。
- **镜像只在页面确实持有 `userToken` 时才覆盖。** 好处是某次加载异常不会把还能用的 token 冲掉；代价是正常登出后旧快照会留到下次启动、被恢复一次再由服务端判定失效——结果正确，只是多一次无效恢复。
- **有快照时多一次同源导航。** 启动路径是 `about:blank → /robots.txt → 首页`，多一个极小的静态请求；种子页加载失败就直接进首页，本次不恢复、快照保留待下次。
- **这套镜像逻辑未在真机验证。** 快照/恢复两段 guest 脚本用 Node + 桩 DOM 做过往返测试（含超长键裁剪、版本与来源校验），但「DeepSeek 登录后确实只靠 localStorage 恢复」这一点只能在桌面端实测确认。

## 实现

- `lib/client.js`：以 `span[class*="brandIdentity"]` 定位宿主品牌元素。该类名带构建期 CSS Module 哈希，Web 与 Desktop 构建各不相同（实测 Web 为 `hHd-Xa_brandIdentity`、Desktop 为 `_2H3hWW_brandIdentity`），因此匹配稳定的局部名而非某个哈希。触发器取 `closest("button")`：Web 与 Windows/Linux Desktop 的品牌是「新建会话」按钮，macOS Desktop 则是窗口拖拽行里的 `span`，此时回退到该元素并补上 `role="button"` 与 `tabindex="0"`，既脱离宿主拖拽规则又可聚焦。在捕获阶段拦截点击（宿主 React 委托到根节点，捕获拦截有效），改为切换 DeepSeek Chat 视图。
- Desktop 视图：经 `window.dshDesktop.browser.acquire()` 取得租约与分区，创建 `src="about:blank#<lease>"` 的 `<webview>`；`dom-ready` 后先 `setUserAgent()` 换成标准 Chromium UA，再按「bootstrap → 种子页 → 首页」推进（guest 默认继承带 Electron 与产品标识的 UA，DeepSeek Chat 会据此弹出「使用环境异常」警告；`setUserAgent` 直接改 guest 的 webContents，不受壳清空 webPreferences 的影响）。视图内要求新窗口的链接通过 `onOpenRequested` 在**同一视图**打开——所以回答里的链接会把 guest 带离 chat 界面，返回按钮因此按地址分两种语义（`isChatUrl` / `isGuestPage`）：网页在眼前时 `goBack()`（guest 无法后退则 `loadURL` 到记录下来的最后一个 chat 地址），回到 chat 界面；chat 界面在眼前时收起视图。`did-navigate` 与 `did-navigate-in-page` 都会刷新按钮文案并记录 chat 地址，所以应用内部的路由跳转也算数。**读 guest 一律经过 `guestUrl()`**：`dom-ready` 之前元素的方法都会抛错，而视图在租约到手时就露出来了（见「已知问题」里那条），所以显示路径只用 `guestReady` 为真时的地址，否则当作「没有页面」。**对 guest 只做存储读写、不改页面**：`dom-ready` 与可见期间每 15 秒各读一次 guest 的 localStorage（超长非关键键会按 200 KB 上限裁掉，`userToken` 与 `__appKit_userInfo` 永不裁），仅在读到 `userToken` 时写入宿主快照；下次启动先加载 `/robots.txt`（同源、31 字节、不启动应用），把快照写回后再进首页。隐藏时保留 guest 以便即时切回，同时停掉轮询并顺手快照一次；视图只在租约到手后才显示（先显示会先露出一块白底）；构建失败会把元素与租约一起退回，插件停用时停表、断开布局观察器、释放租约并移除元素。
- `lib/index.js`：空服务端入口；`cordis.patch.yml`：向 web roster 注册 `chat-entry`。后者的 `name` 必须与 `package.json` 的 `name` 一致——安装后 patch 只按包名解析，写相对路径会加载失败。
- 开关只绑定一次，宿主重建侧边栏后需刷新页面重绑。
- 停用时通过 `ctx.effect` 完整清理：恢复标题属性、移除监听器/观察器、释放桌面视图、删除样式。

## 检查

```sh
npm run check   # 语法检查（node --check lib/*.js）
npm test        # 14 个用例（node --test，无外部依赖）
```

`test/session.test.mjs` 用桩 DOM 加载插件本体，覆盖四段：会话镜像的快照裁剪、恢复写入、失败上报与宿主侧快照的版本/来源校验；**地址判定**——chat 应用、插件自己的种子页、从对话点开的外链、非 http(s) 文档各归哪一类；以及**激活冒烟测试**——不加任何探针、直接跑真实源码的 `apply`，断言 Desktop 下不抛错、拿到可用的 teardown、品牌被绑上 `data-dsh-product-trigger` 与点击监听、卸载时属性与文档监听都被还原，并用桩 guest 打开视图，验证那颗圆按钮在「网页在眼前」时走 guest 的后退（guest 报不了后退就重载记录下来的 chat 地址）、在「chat 界面在眼前」时收起视图、文案跟着变。桩 guest 照抄 Electron 的契约：**`dom-ready` 之前任何方法都抛错**，所以「启动后第一次点击就露视图」这条回归会被用例当场抓住。激活这一段是补上来的：此前没有任何用例调用过 `apply`，所以「激活路径里引用未定义变量」这类故障能一路漏过去（故意注入一个未定义全局做变异测试，正是这两个用例报错）。它不需要 `jsdom`；若 `node --test` 因沙箱禁止子进程而报 `spawn EPERM`，改用 `node --test --test-isolation=none` 或直接 `node test/session.test.mjs`。
