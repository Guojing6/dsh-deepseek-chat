# @guojing6/dsh-deepseek-chat

DeepSeek Harness 客户端插件（web 与 desktop profile），把侧边栏顶部的 **DeepSeek Harness** 标题由「新建会话」改为 DeepSeek Chat 的切换开关，仿 Codex 客户端 ChatGPT/Codex 的切换方式：

| 点哪里 | 结果 |
| --- | --- |
| DSH 侧边栏顶部的标题 | Desktop：在**应用内**切换到 chat.deepseek.com（窗口内嵌视图）；Web：当前页跳转 |
| 视图右下角的圆形返回按钮 | 切回 DSH（Desktop） |

没有菜单——点一下就切换，两个方向读起来一致。独立的「新会话」按钮不受影响；展开侧边栏后点顶部标题即可使用。

## 安装

包尚未发布到 npm，目前仅支持源码安装（需要 pnpm）。Web 与 Desktop 使用各自独立的 profile（`$DSH_HOME/profiles/web` 与 `$DSH_HOME/profiles/desktop`），互不共享插件，需分别安装：

```sh
git clone https://github.com/Guojing6/dsh-deepseek-chat.git
cd dsh-deepseek-chat

# Web
dsh plugin --profile web add .

# Desktop：先启动一次 Desktop 初始化其 profile，完全退出后再执行
dsh plugin --profile desktop add .
```

Web 安装后重启 Harness 并刷新网页；Desktop 安装后重新打开应用。Desktop 也可用其自带的 `resources/runtime/cli/bin/dsh` 执行同样的命令。

## Desktop：应用内切换

Desktop 下选择 DeepSeek Chat **不会跳到浏览器**，而是在同一个窗口内把**右侧内容区**换成 chat.deepseek.com：顶栏（「应用」「编辑」菜单与窗口控制按钮）和左侧边栏（logo、会话列表、工作区、费用、账户）都原样保留。

返回有两个入口：**右下角的圆形返回图标按钮**（位于输入框右侧上方，不遮挡发送按钮；图标取自「返回-圆形填充」，内联后改用 `currentColor` 与 DSH 的主题变量，深浅色都能跟），或**点侧边栏顶部的标题**。切回后再点标题会回到同一视图（不重新加载，保留视图内状态）。

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

- **视图定位。** `readFrameInsets()` 从品牌元素向上找到 `#root` 的直接子元素（即 `.frame`），读它的 `--dsh-windows-sidebar-width` 与 `--dsh-windows-content-radius`；顶栏高度取自 `<html>` 上的 `--dsh-windows-titlebar-height`。前两个变量定义在 `.frame` 上而非 `<html>`，CSS 继承读不到，只能从 DOM 取。**若 DSH 在 `#root` 下新增包装层，取值会落空**，表现为 `left` 退化为 0、视图重新盖住侧边栏。
- **品牌定位。** `span[class*="brandIdentity"]` 匹配的是 CSS Module 的稳定局部名（已不依赖构建哈希），但 DSH 若重命名这个局部名，选择器即失效——症状是**点标题毫无反应且不报错**。
- **悬停高亮的留白。** 宿主的品牌是 `flex:1` 的整行按钮（`.brand`），直接把背景画在触发器上会从 logo 一直铺到行尾；插件改成给 `brandIdentity` 加内边距、再配等量负外边距抵消位移，让高亮只包住 logo 与文字。左右各留 4px 是按宿主 `.brand` 自身的左内边距取的，DSH 若改这个值，高亮会被行的 `overflow:hidden` 削掉一角。
- **只绑定一次。** 首次找到标题后 `MutationObserver` 即断开，宿主重建侧边栏后需刷新页面才会重绑。

### 三、本实现自身的取舍

- **侧边栏折叠时没有返回入口。** 折叠状态下品牌元素不渲染（`SidebarRoot` 里是 `{wide && …}`），此时需先点顶栏的折叠按钮展开侧边栏，再点标题切回。
- **Web 端行为随之改变。** 同一份代码在 web 下走另一条路径：点标题直接 `location.assign(chat.deepseek.com)`，不再弹菜单。若希望 Web 保留菜单式交互，需要按 `IS_DESKTOP` 分成两条路径。
- **macOS 分支未实测。** 品牌在 macOS Desktop 下是窗口拖拽行里的 `span`（不是 button），代码按 `closest("button") ?? parentElement` 回退并补 `role="button"` / `tabindex="0"`，依据是 `SidebarRoot.tsx` 与 `base.css` 的规则推导，未在真机验证。
- **按钮位置是按截图估算的。** `right: 24px; bottom: 150px` 由截图缩放比例换算而来，未做像素级校准。
- **登录态镜像多存了一份明文 token。** 快照存在 `dsh-app://app` 源的 localStorage 里（键 `dsh-deepseek-chat:chat-session`），同应用内的其他插件都能读到；它和浏览器里保存的是同一类凭证，但确实多了一个副本，且卸载插件不会自动清掉这份快照。
- **镜像只在页面确实持有 `userToken` 时才覆盖。** 好处是某次加载异常不会把还能用的 token 冲掉；代价是正常登出后旧快照会留到下次启动、被恢复一次再由服务端判定失效——结果正确，只是多一次无效恢复。
- **有快照时多一次同源导航。** 启动路径是 `about:blank → /robots.txt → 首页`，多一个极小的静态请求；种子页加载失败就直接进首页，本次不恢复、快照保留待下次。
- **这套镜像逻辑未在真机验证。** 快照/恢复两段 guest 脚本用 Node + 桩 DOM 做过往返测试（含超长键裁剪、版本与来源校验），但「DeepSeek 登录后确实只靠 localStorage 恢复」这一点只能在桌面端实测确认。

## 实现

- `lib/client.js`：以 `span[class*="brandIdentity"]` 定位宿主品牌元素。该类名带构建期 CSS Module 哈希，Web 与 Desktop 构建各不相同（实测 Web 为 `hHd-Xa_brandIdentity`、Desktop 为 `_2H3hWW_brandIdentity`），因此匹配稳定的局部名而非某个哈希。触发器取 `closest("button")`：Web 与 Windows/Linux Desktop 的品牌是「新建会话」按钮，macOS Desktop 则是窗口拖拽行里的 `span`，此时回退到该元素并补上 `role="button"` 与 `tabindex="0"`，既脱离宿主拖拽规则又可聚焦。在捕获阶段拦截点击（宿主 React 委托到根节点，捕获拦截有效），改为切换 DeepSeek Chat 视图。
- Desktop 视图：经 `window.dshDesktop.browser.acquire()` 取得租约与分区，创建 `src="about:blank#<lease>"` 的 `<webview>`；`dom-ready` 后先 `setUserAgent()` 换成标准 Chromium UA，再按「bootstrap → 种子页 → 首页」推进（guest 默认继承带 Electron 与产品标识的 UA，DeepSeek Chat 会据此弹出「使用环境异常」警告；`setUserAgent` 直接改 guest 的 webContents，不受壳清空 webPreferences 的影响）。视图内要求新窗口的链接通过 `onOpenRequested` 在同一视图打开。**对 guest 只做存储读写、不改页面**：`dom-ready` 与每 15 秒各读一次 guest 的 localStorage（超长非关键键会按 200 KB 上限裁掉，`userToken` 与 `__appKit_userInfo` 永不裁），仅在读到 `userToken` 时写入宿主快照；下次启动先加载 `/robots.txt`（同源、31 字节、不启动应用），把快照写回后再进首页。隐藏时保留 guest 以便即时切回并顺手快照一次，插件停用时清除定时器、释放租约并移除元素。
- `lib/index.js`：空服务端入口；`cordis.patch.yml`：向 web roster 注册 `chat-entry`。
- 开关只绑定一次，宿主重建侧边栏后需刷新页面重绑。
- 停用时通过 `ctx.effect` 完整清理：恢复标题属性、移除监听器/观察器、释放桌面视图、删除样式。

## 检查

```sh
npm run check   # 语法检查（node --check lib/*.js）
npm test        # 会话镜像的往返测试（node --test，无外部依赖）
```

`test/session.test.mjs` 用桩 DOM 加载插件本体，覆盖快照裁剪、恢复写入、失败上报，以及宿主侧快照的版本与来源校验。它不需要 `jsdom`；若 `node --test` 因沙箱禁止子进程而报 `spawn EPERM`，改用 `node --test --test-isolation=none` 或直接 `node test/session.test.mjs`。
