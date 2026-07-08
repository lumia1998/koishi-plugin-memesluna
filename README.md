# koishi-plugin-memesluna

MemesLuna 是一个用于 Koishi 的表情图片路由与管理插件。它可以把本地表情包、外部图片端点和 ChatLuna 提示词变量连接起来，让机器人按固定路由发送表情图。

## 功能概览

- 表情包合集管理：支持本地图片、外链图片、描述、移动、删除和批量上传。
- 端点转发：将自定义路由 302 重定向到外部图片 API。
- Console 管理页：在 Koishi 控制台中管理合集、图片、端点、暂缓区、语义标签和检索别名。
- ChatLuna 变量注入：注入 `{endpoint}` 和 `{memesluna}`，让模型知道可用图片路由和搜索方式。
- 跨合集语义搜索：支持 `/memesluna?q=关键词`，按别名、语义标签或文件名检索所有合集。
- 合集内检索：兼容支持 `/memesluna/合集名?q=关键词`，按别名、语义标签或文件名检索指定合集。
- AI 自动标注：可使用 ChatLuna 模型为图片生成 `tags` 和 `aliases`。
- 暂缓区：可暂存被上传过滤器拦截或自动收集到的候选图片，人工复核后再归档。
- 高频图片自动收集：可监听群聊中高频出现的图片并放入暂缓区。

## 安装

```bash
npm i koishi-plugin-memesluna
```

插件依赖 Koishi 的 `database`、`server` 和 `chatluna` 服务。Console 管理页需要启用 `@koishijs/plugin-console`。

## 基础配置

- `backendPath`：HTTP 路由前缀，默认 `/memesluna`。
- `selfUrl`：对外公开访问地址。留空时使用 `server.selfUrl`；如果机器人需要把图片 URL 发到外部平台，建议配置成可被平台访问的完整地址。
- `injectVariables`：是否向 ChatLuna 注入 `{endpoint}` 和 `{memesluna}`，默认开启。
- `variableRefreshIntervalMs`：ChatLuna 变量刷新间隔。
- `injectVariablesPrompt`：注入到 `{memesluna}` 的提示词模板。

本地表情合集固定保存在 Koishi 数据目录下的 `data/memesluna`。不再提供单独的存储目录配置项。

合集名称和端点名称共享同一套路由命名空间，不能重名。名称支持中文，但在复制、预览和提示词中会自动编码为可直接访问的 URL 路径。

## Console 用法

启用插件后，Koishi 控制台会出现 `MemesLuna` 页面。

常见流程：

1. 在“表情包管理”中新建合集。
2. 进入合集详情，上传本地图片或导入外链。
3. 在“分发管理”中新建端点，将路由转发到外部图片 API。
4. 在“预览”中查看当前可注入给 ChatLuna 的路由清单和提示词。
5. 在“暂缓区”中复核自动收集或被过滤的候选图片，再归档到指定合集。

图片卡片菜单中可以打开“编辑标签”，手动维护：

- `tags`：图片的语义标签，可覆盖情绪、动作、适用场景、表达意图和画面元素。
- `aliases`：图片的自然语言检索别名，用于 `?q=关键词` 搜索。

也可以选中多张图片后使用“设置标签”进行批量编辑。

## 路由说明

假设 `backendPath` 为默认值 `/memesluna`：

- `/memesluna/`：跳转到 Console 页面。
- `/memesluna/admin`：兼容管理入口，会跳转到 Console 页面。
- `/memesluna/:name`：访问合集或端点。
- `/memesluna?q=关键词`：跨合集语义搜索。
- `/memesluna/:collection/:filename`：直接访问指定本地图片。
- `/memesluna/api/homepage-data`：获取路由清单和提示词预览数据。

### 合集路由

如果存在名为 `doro` 的合集：

```text
/memesluna/doro
```

会从该合集中随机返回一张本地图片或外链图片。

### 端点路由

如果创建名为 `ycy` 的端点，目标 URL 为 `https://t.alcy.cc/ycy`：

```text
/memesluna/ycy
```

会 302 重定向到对应外部 URL。

### 跨合集语义搜索

```text
/memesluna?q=关键词
```

跨合集语义搜索会在所有合集内按 `aliases`、`tags` 和文件名打分匹配。它不是向量检索，而是基于已维护标注的关键词检索。关键词可以是情绪、动作、适用场景、表达意图、画面元素或聊天口语短语。

仍然兼容指定合集内搜索：

```text
/memesluna/合集名?q=关键词
```

当前评分规则：

- 完整短语命中 `aliases`：`+12`
- 完整短语命中 `tags`：`+8`
- 完整短语命中文件名：`+4`
- 分词命中 `aliases`：`+6`
- 分词命中 `tags`：`+6`
- 分词命中文件名：`+2`
- 命中词数不少于 2 个：额外 `+2`
- 命中词数不少于 3 个：再额外 `+2`

只有分数达到 `6` 的图片才会进入候选。跨合集搜索没有匹配候选时会返回 404；合集内搜索没有匹配候选时会退回合集随机返图。

## ChatLuna 变量注入

开启 `injectVariables` 后，插件会向 ChatLuna 注入：

- `{endpoint}`：合集和端点路由清单。
- `{memesluna}`：完整的 MemesLuna 使用说明，由 `injectVariablesPrompt` 模板渲染得到。

默认模板支持这些占位符：

- `{endpoint}`：合集和端点路由。
- `{base_url}`：服务公开地址。
- `{backend_path}`：插件 HTTP 路由前缀。
- `{tag_routes}`：兼容旧模板的占位符，当前渲染为空。
- `{tags}`：兼容旧模板的占位符，当前渲染为空。

## AI 标注

在配置中选择 ChatLuna 模型后，上传、偷图或归档本地图片会自动异步生成：

- `tags`：多个语义标签，可覆盖情绪、动作、适用场景、表达意图和画面元素。
- `aliases`：多个自然语言检索短语，用于关键词搜索。

相关配置：

- `model`：用于标注的 ChatLuna 模型；配置后会自动标注新入库图片。
- `annotatePrompt`：标注提示词。
- `aiConcurrency`：AI 标注并发数。
- `aiBatchDelay`：批量标注间隔。
- `aiMaxAttempts`：失败重试次数。
- `aiBackoffBase`：重试退避基数。

维护命令：

```text
memesluna.tagall
memesluna.tagall -f
memesluna.untagall
memesluna.untagall -c 合集名
```

## 自动收集与暂缓区

开启 `autoCollect` 后，插件会监听群聊图片。某张图片在指定时间窗口内出现达到阈值后，会进入暂缓区等待人工复核。

相关配置：

- `autoCollect`：启用高频图片自动暂存。
- `whitelistGroups`：只监听指定群；留空表示监听所有群。
- `emojiFrequencyWindowMinutes`：统计窗口。
- `emojiFrequencyThreshold`：同一张图触发暂存所需次数。
- `minEmojiSize` / `maxEmojiSize`：自动暂存图片大小范围。
- `groupAutoCollectLimit`：每个群每日自动暂存上限。
- `similarityThreshold`：暂缓区相似图片聚合阈值。
- `stagingRetentionDays`：暂缓区自动过期天数，`0` 表示永久保留。

暂缓区图片不会参与随机路由。只有在 Console 中手动归档到某个合集后，才会成为正式表情包图片。

## 命令

### `memesluna.list`

查看当前可用合集和端点：

```text
memesluna.list
```


### `memesluna.stole`

引用一条包含图片的消息后，将图片保存到指定合集：

```text
memesluna.stole doro
```

目标合集需要先在 Console 中创建。重复上传同一张图片时，会覆盖旧图片，但保留旧图片的 `tags` 和 `aliases`。

## 开发

```bash
npm install
npm run typecheck
npx yakumo build
```

发布包包含 `lib/**/*.js`、`lib/**/*.d.ts` 和 `dist`。源码中的 `client` 会由 Yakumo 构建为 Console 前端产物。

## License

MIT
