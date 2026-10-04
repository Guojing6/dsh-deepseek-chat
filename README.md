# @guojing6/dsh-deepseek-chat

DeepSeek Harness 客户端插件（web 与 desktop profile），把侧边栏顶部的 **DeepSeek Harness** 标题由「新建会话」改为 DeepSeek Chat 的切换开关，仿 Codex 客户端 ChatGPT/Codex 的切换方式：

| 点哪里 | 结果 |
| --- | --- |
| DSH 侧边栏顶部的标题 | Desktop：在**应用内**切换到 chat.deepseek.com（窗口内嵌视图）；Web：当前页跳转 |
| 嵌入视图里网页自己的 logo | 切回 DSH（Desktop） |

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

### 一、由 DSH 壳的 guest 策略决定（插件无法解决）

- **重启 DSH 后需要重新登录。** 嵌入视图运行在独立存储分区，与 DSH 的登录态隔离。该分区既没有 `persist:` 前缀（Electron 语义下即内存会话），名字又由主进程用随机 UUID 生成（`apps/desktop/src/browser-guests.ts` 的 `acquire()`），所以登录态只在本次运行内保持。
  **绕开方式：别退出进程。** 关闭窗口只是收进托盘，进程继续跑，登录态就一直在；只有「托盘退出 / 重启应用 / 安装更新」这类真正结束进程的操作才会丢。DSH 官方的侧边栏浏览器用的是同一套 guest 机制，同样受影响。
- **权限被全部拒绝。** 通知、剪贴板、设备权限一律拒绝，**下载被禁止**，视图内也不能访问 DSH 自身的服务地址。
- **依赖 DSH 的内部桥。** 视图通过主应用文档上的 `window.dshDesktop.browser` 申请 guest 租约——DSH 只接受持有租约的 `<webview>`，`will-attach-webview` 会校验 `src`、`partition`、owner 与「单次 attach」。这是未对第三方公开的契约（`protocolVersion: 1`），升级后可能变化；不可用时插件回退到系统浏览器打开。

### 二、依赖宿主 DOM 结构（DSH 改版可能失效）

- **视图定位。** `readFrameInsets()` 从品牌元素向上找到 `#root` 的直接子元素（即 `.frame`），读它的 `--dsh-windows-sidebar-width` 与 `--dsh-windows-content-radius`；顶栏高度取自 `<html>` 上的 `--dsh-windows-titlebar-height`。前两个变量定义在 `.frame` 上而非 `<html>`，CSS 继承读不到，只能从 DOM 取。**若 DSH 在 `#root` 下新增包装层，取值会落空**，表现为 `left` 退化为 0、视图重新盖住侧边栏。
- **品牌定位。** `span[class*="brandIdentity"]` 匹配的是 CSS Module 的稳定局部名（已不依赖构建哈希），但 DSH 若重命名这个局部名，选择器即失效——症状是**点标题毫无反应且不报错**。
- **只绑定一次。** 首次找到标题后 `MutationObserver` 即断开，宿主重建侧边栏后需刷新页面才会重绑。

### 三、本实现自身的取舍

- **侧边栏折叠时没有返回入口。** 折叠状态下品牌元素不渲染（`SidebarRoot` 里是 `{wide && …}`），此时需先点顶栏的折叠按钮展开侧边栏，再点标题切回。
- **Web 端行为随之改变。** 同一份代码在 web 下走另一条路径：点标题直接 `location.assign(chat.deepseek.com)`，不再弹菜单。若希望 Web 保留菜单式交互，需要按 `IS_DESKTOP` 分成两条路径。
- **macOS 分支未实测。** 品牌在 macOS Desktop 下是窗口拖拽行里的 `span`（不是 button），代码按 `closest("button") ?? parentElement` 回退并补 `role="button"` / `tabindex="0"`，依据是 `SidebarRoot.tsx` 与 `base.css` 的规则推导，未在真机验证。
- **按钮位置是按截图估算的。** `right: 24px; bottom: 150px` 由截图缩放比例换算而来，未做像素级校准。

## 实现

- `lib/client.js`：以 `span[class*="brandIdentity"]` 定位宿主品牌元素。该类名带构建期 CSS Module 哈希，Web 与 Desktop 构建各不相同（实测 Web 为 `hHd-Xa_brandIdentity`、Desktop 为 `_2H3hWW_brandIdentity`），因此匹配稳定的局部名而非某个哈希。触发器取 `closest("button")`：Web 与 Windows/Linux Desktop 的品牌是「新建会话」按钮，macOS Desktop 则是窗口拖拽行里的 `span`，此时回退到该元素并补上 `role="button"` 与 `tabindex="0"`，既脱离宿主拖拽规则又可聚焦。在捕获阶段拦截点击（宿主 React 委托到根节点，捕获拦截有效），改为切换 DeepSeek Chat 视图。
- Desktop 视图：经 `window.dshDesktop.browser.acquire()` 取得租约与分区，创建 `src="about:blank#<lease>"` 的 `<webview>`；`dom-ready` 后先 `setUserAgent()` 换成标准 Chromium UA，再加载 chat.deepseek.com（guest 默认继承带 Electron 与产品标识的 UA，DeepSeek Chat 会据此弹出「使用环境异常」警告；`setUserAgent` 直接改 guest 的 webContents，不受壳清空 webPreferences 的影响）。视图内要求新窗口的链接通过 `onOpenRequested` 在同一视图打开。**不向 guest 注入任何脚本**：网页按浏览器里的原样运行，返回只靠插件自己的悬浮按钮与侧边栏标题。隐藏时保留 guest 以便即时切回，插件停用时释放租约并移除元素。
- `lib/index.js`：空服务端入口；`cordis.patch.yml`：向 web roster 注册 `chat-entry`。
- 开关只绑定一次，宿主重建侧边栏后需刷新页面重绑。
- 停用时通过 `ctx.effect` 完整清理：恢复标题属性、移除监听器/观察器、释放桌面视图、删除样式。

## 检查

```sh
npm run check   # 语法检查；暂无测试文件
```
