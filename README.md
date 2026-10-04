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

这不是 Codex 那种原生产品切换——Codex 的 ChatGPT/Codex 都是 OpenAI 自家界面，而 DeepSeek Chat 是 DSH 之外的独立网站，只能用 Electron webview 嵌入。由此带来三点**由 DSH 壳的安全策略决定**的限制：

- **需要单独登录一次，且重启后失效。** 嵌入视图运行在独立存储分区，与 DSH 的登录态隔离。该分区既没有 `persist:` 前缀（Electron 语义下就是内存会话），名字又由主进程用随机 UUID 生成，因此登录态只在本次运行内保持，**重启 DSH 后需要重新登录**——分区由 DSH 的 guest 策略决定，插件无法改变。
- **权限被全部拒绝。** 通知、剪贴板、设备权限一律拒绝，**下载被禁止**，视图内也不能访问 DSH 自身的服务地址。
- **依赖 DSH 的内部桥。** 视图通过主应用文档上的 `window.dshDesktop.browser` 申请 guest 租约（DSH 只接受持有租约的 `<webview>`）。这是 DSH 的内部契约，升级后可能变化；一旦不可用，插件会回退到系统浏览器打开。

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
