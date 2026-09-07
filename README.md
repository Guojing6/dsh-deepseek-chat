# @guojing6/dsh-deepseek-chat

DeepSeek Harness 客户端插件（web profile），把侧边栏顶部的 **DeepSeek Harness** 标题由「新建会话」改为产品切换菜单，仿 Codex 客户端 ChatGPT/Codex 的切换方式：

| 选项 | 说明 | 行为 |
| --- | --- | --- |
| DeepSeek Chat | 创建、学习和探索 | 当前页跳转 https://chat.deepseek.com/ |
| DeepSeek Harness ✓ | 构建、调试和发布 | 关闭菜单，保留当前会话与草稿 |

再次点击标题可关闭菜单；独立的「新会话」按钮不受影响。展开侧边栏后点击顶部标题即可使用。

## 安装

包尚未发布到 npm，目前仅支持源码安装（需要 pnpm 和 web profile）：

```sh
git clone https://github.com/Guojing6/dsh-deepseek-chat.git
cd dsh-deepseek-chat
dsh plugin --profile web add .
```

安装后重启 Harness 并刷新网页。发布到 npm 后可改用 `dsh plugin --profile web add @guojing6/dsh-deepseek-chat`。

## 实现

- `lib/client.js`：定位宿主标题按钮（`span.hHd-Xa_brandIdentity`），在捕获阶段拦截其「新建会话」点击（宿主 React 点击委托到根节点，捕获拦截有效），改为开关圆角菜单。
- `lib/index.js`：空服务端入口；`cordis.patch.yml`：向 web roster 注册 `chat-entry`。
- 菜单为固定浅色样式，无外部点击关闭；只绑定一次，宿主重建侧边栏后需刷新页面重绑；选择器内类名随宿主构建产物变化，宿主改版后需同步适配。
- 停用时通过 `ctx.effect` 完整清理：恢复标题属性、移除监听器/观察器、删除菜单与样式。

## 检查

```sh
npm run check   # 语法检查；暂无测试文件
```
