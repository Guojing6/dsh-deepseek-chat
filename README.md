# @guojing6/dsh-deepseek-chat

DeepSeek Harness 客户端插件（web 与 desktop profile），把侧边栏顶部的 **DeepSeek Harness** 标题由「新建会话」改为产品切换菜单，仿 Codex 客户端 ChatGPT/Codex 的切换方式：

| 选项 | 说明 | 行为 |
| --- | --- | --- |
| DeepSeek Chat | 创建、学习和探索 | 打开 https://chat.deepseek.com/（Web 为当前页跳转；Desktop 交由系统浏览器打开） |
| DeepSeek Harness ✓ | 构建、调试和发布 | 关闭菜单，保留当前会话与草稿 |

再次点击标题可关闭菜单；独立的「新会话」按钮不受影响。展开侧边栏后点击顶部标题即可使用。

一个包同时支持两个界面：Web 与 Desktop 共用同一套客户端插件机制（Desktop 的 profile 以 Web 模板的 bundle 列表初始化），因此不需要两个包。

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

Web 安装后重启 Harness 并刷新网页；Desktop 安装后重新打开应用。Desktop 也可用其自带的 `resources/runtime/cli/bin/dsh` 执行同样的命令。发布到 npm 后可改用 `dsh plugin --profile <web|desktop> add @guojing6/dsh-deepseek-chat`。

## 实现

- `lib/client.js`：以 `span[class*="brandIdentity"]` 定位宿主品牌元素。该类名带构建期 CSS Module 哈希，Web 与 Desktop 构建各不相同（实测 Web 为 `hHd-Xa_brandIdentity`、Desktop 为 `_2H3hWW_brandIdentity`），因此匹配稳定的局部名而非某个哈希。触发器取 `closest("button")`：Web 与 Windows/Linux Desktop 的品牌是「新建会话」按钮，macOS Desktop 则是窗口拖拽行里的 `span`，此时回退到该元素并补上 `role="button"` 与 `tabindex="0"`，既脱离宿主拖拽规则又可聚焦。在捕获阶段拦截点击（宿主 React 委托到根节点，捕获拦截有效），改为开关圆角菜单。
- 打开 DeepSeek Chat 分两条路径：Desktop（由 preload 设置的 `<html data-platform>` 判定）用 `window.open`，经主进程 `setWindowOpenHandler` → `shell.openExternal` 交给系统浏览器；Web 用 `location.assign` 当前页跳转。
- `lib/index.js`：空服务端入口；`cordis.patch.yml`：向 web roster 注册 `chat-entry`。
- 菜单为固定浅色样式，点击外部关闭；只绑定一次，宿主重建侧边栏后需刷新页面重绑。定位已不依赖构建哈希，但 `brandIdentity` 局部名或宿主 DOM 结构变化后仍需同步适配。
- 停用时通过 `ctx.effect` 完整清理：恢复标题属性、移除监听器/观察器、删除菜单与样式。

## Desktop

Desktop 是 Electron 壳，运行的是与 Web 相同的客户端组合：其 profile 以 Web 模板的 bundle 列表（含 `@deepseek-ai/dsh-web-app`）初始化，`dsh.client.platform: 'web'` 是所有客户端插件的固定值而非平台门控，因此同一份客户端 bundle 在 Desktop 下同样被扫描并注入。Desktop 的差异只有三处——品牌元素的构建哈希、macOS 下品牌不是按钮、外部链接需交由系统浏览器——都已在上面的实现中处理。

## 检查

```sh
npm run check   # 语法检查；暂无测试文件
```
