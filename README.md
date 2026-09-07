# @guojing6/dsh-deepseek-chat

DeepSeek Harness 标题下拉菜单插件，版本 **1.0.0**。

点击侧边栏顶部 **DeepSeek Harness** 标题，下方显示圆角菜单：

| 选项 | 描述 | 行为 |
| --- | --- | --- |
| DeepSeek Chat | 创建、学习和探索 | 当前页面跳转到 https://chat.deepseek.com/ |
| DeepSeek Harness ✓ | 构建、调试和发布 | 关闭菜单，保持当前会话与草稿 |

再次点击标题也可关闭菜单。菜单采用固定浅色样式。

## 安装

需要已安装 DeepSeek Harness，并使用 web profile。以下方式无需手动生成或安装 tgz 文件。

### 1. 使用 dsh 插件命令

```sh
dsh plugin --profile web add @guojing6/dsh-deepseek-chat
```

### 2. 使用 npm 安装

在需要引入此插件的项目目录执行：

```sh
npm install @guojing6/dsh-deepseek-chat
```

此命令只添加 npm 依赖，不会自动完成 Harness web profile 的插件注册。在 Harness 中启用插件，优先使用上面的 dsh 命令；手动维护 profile 时，还需要将包名加入该 profile 的 package.json 中的 `dsh.profile.bundles` 数组，保留已有条目。

以上按包名安装的方式需要目标版本已发布到 npm；修改仓库版本号不会自动发布。需要明确安装 1.0.0 时，可在包名后追加 `@1.0.0`。

### 3. 从源码安装

```sh
git clone https://github.com/Guojing6/dsh-deepseek-chat.git
cd dsh-deepseek-chat
dsh plugin --profile web add .
```

源码直接使用 lib 中的 JavaScript，无需编译或打包。请确认检出的源码版本为 1.0.0。

安装或升级后重启 Harness 并刷新网页。包名和插件 ID 保持不变。

## 使用方法

1. 展开侧边栏，点击顶部 **DeepSeek Harness** 标题打开菜单。
2. 点击 **DeepSeek Chat**，当前页面跳转到 DeepSeek 官网；登录与聊天由官网提供。
3. 点击 **DeepSeek Harness** 或再次点击标题关闭菜单。

点击 DeepSeek Chat 会离开当前 Harness 页面，插件不负责保存未发送的输入。

## 实现与排查

- lib/client.js：定位 `span.hHd-Xa_brandIdentity` 所属按钮，拦截标题原有新建会话动作，显示菜单；独立新会话按钮不受影响。
- lib/index.js：标准插件所需的空服务端入口。
- cordis.patch.yml：注册 `chat-entry` 插件。
- 仅等待标题首次出现并绑定一次，随后停止监听 DOM 重建。侧边栏重建后需要刷新页面才能重新绑定。
- 不提供自定义键盘选择、外部点击关闭或宿主主题适配。
- 通过 ctx.effect 在停用时清理菜单、样式、监听器和观察器，并恢复标题属性。
- 点击标题没有菜单时，确认品牌元素类名与上述选择器一致；宿主修改该结构后需要同步适配。
- 无设置开关、桌面桥接、额外侧边栏按钮或生产依赖；历史设置不读取、不删除。

## 开发检查

```sh
npm run check
```

直接维护分发 JavaScript，无构建步骤。当前工作区没有测试文件，npm test 不会执行功能测试。真实宿主中的交互效果需要在 Harness 中验证。
