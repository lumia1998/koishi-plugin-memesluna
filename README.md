# koishi-plugin-memesluna

MemesLuna 是一个用于 Koishi 的表情图片路由与管理插件。它可以把本地表情包、外部图片端点和 ChatLuna 提示词变量连接起来，让机器人按固定路由发送表情图。

## 功能概览

- 表情包合集管理：支持本地图片、外链图片、描述、移动、删除和批量上传。
- 端点转发：将自定义路由 302 重定向到外部图片 API。
- Console 管理页：在 Koishi 控制台中管理合集、图片、端点、暂缓区、标签和别名。
- ChatLuna 变量注入：注入 `{endpoint}`、`{tag_routes}` 和 `{memesluna}`，让模型知道可用图片路由。
- 情感标签路由：可选开启 `/memesluna/标签名` 跨合集随机返图。
- 合集内检索：支持 `/memesluna/合集名?q=关键词`，按别名、标签或文件名检索指定合集。
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
- `enableEmotionTags`：是否启用情感标签路由和 `{tag_routes}` 注入，默认关闭。

本地表情合集固定保存在 Koishi 数据目录下的 `data/memesluna`。不再提供单独的存储目录配置项。

## Console 用法

启用插件后，Koishi 控制台会出现 `MemesLuna` 页面。

常见流程：

1. 在“表情包管理”中新建合集。
2. 进入合集详情，上传本地图片或导入外链。
3. 在“分发管理”中新建端点，将路由转发到外部图片 API。
4. 在“预览”中查看当前可注入给 ChatLuna 的路由清单和提示词。
5. 在“暂缓区”中复核自动收集或被过滤的候选图片，再归档到指定合集。

图片卡片菜单中可以打开“编辑标签”，手动维护：

- `tags`：图片的路由标签，通常是一个情绪或内容主标签。
- `aliases`：图片的检索别名，用于 `?q=关键词` 合集搜索。

也可以选中多张图片后使用“设置标签”进行批量编辑。

## 路由说明

假设 `backendPath` 为默认值 `/memesluna`：

- `/memesluna/`：跳转到 Console 页面。
- `/memesluna/admin`：兼容管理入口，会跳转到 Console 页面。
- `/memesluna/:name`：访问合集、端点或标签路由。
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

### 合集搜索

```text
/memesluna/合集名?q=关键词
```

合集搜索会在指定合集内按 `aliases`、`tags` 和文件名打分匹配。它不是向量检索，而是基于已维护标注的关键词检索。

当前评分规则：

- 完整短语命中 `aliases`：`+12`
- 完整短语命中 `tags`：`+8`
- 完整短语命中文件名：`+4`
- 分词或同义词命中 `aliases`：`+6`
- 分词或同义词命中 `tags`：`+4`
- 分词或同义词命中文件名：`+2`
- 命中词数不少于 2 个：额外 `+2`
- 命中词数不少于 3 个：再额外 `+2`

只有分数达到 `6` 的图片才会进入候选。没有匹配候选时，会退回合集随机返图。

## 情感标签路由

情感标签路由默认关闭，需要在“情感标签配置”中开启 `enableEmotionTags`。

开启后，插件才会启用：

```text
/memesluna/开心
/memesluna/无语
/memesluna/生气
```

这类跨合集标签路由。标签路由会在所有合集里查找带有对应 `tags` 的图片，并随机返回一张。

重要规则：

- 仅在 `enableEmotionTags` 开启后，标签路由才会生效。
- 仅配置了同义词组但没有任何图片实际使用这些标签时，不会向 ChatLuna 注入对应路径。
- `{tag_routes}` 只会列出已有图片实际使用过的标签组，避免模型看到不存在的路径。
- 合集名和标签名重名时，合集优先匹配。

注入格式示例：

```text
【情绪/标签】（每行为同一组，组内任意词均可作为路由）
  幸福 / 开心 / 高兴 / 快乐 / 治愈 / 满足
  委屈 / 难过 / 伤心 / 沮丧 / 流泪 / 大哭
  生气 / 愤怒 / 炸毛 / 不爽 / 恼火 / 气愤
  标签路由格式：/memesluna/标签名
```

## ChatLuna 变量注入

开启 `injectVariables` 后，插件会向 ChatLuna 注入：

- `{endpoint}`：合集和端点路由清单。
- `{tag_routes}`：情感标签路由清单，仅在 `enableEmotionTags` 开启且存在真实标签时有内容。
- `{memesluna}`：完整的 MemesLuna 使用说明，由 `injectVariablesPrompt` 模板渲染得到。

默认模板支持这些占位符：

- `{endpoint}`：合集和端点路由。
- `{base_url}`：服务公开地址。
- `{tag_routes}`：情感标签路由块。
- `{tags}`：当前可用标签词。

## AI 标注

如果在配置中选择了 ChatLuna 模型，可以开启 `autoAnnotate`。上传或归档本地图片后，插件会异步生成：

- `tags`：一个候选情感标签。
- `aliases`：多个检索短语，用于合集搜索。

相关配置：

- `model`：用于标注的 ChatLuna 模型。
- `autoAnnotate`：上传图片后自动标注。
- `annotatePrompt`：标注提示词。
- `synonymGroups`：允许使用的标签候选词和同义词组。
- `aiConcurrency`：AI 标注并发数。
- `aiBatchDelay`：批量标注间隔。
- `aiMaxAttempts`：失败重试次数。
- `aiBackoffBase`：重试退避基数。

命令：

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

### `memesluna.add`

创建表情包合集：

```text
memesluna.add doro Doro 表情包
```

别名：

```text
memesluna.create
memesluna.creat
```

### `memesluna.stole`

引用一条包含图片的消息后，将图片保存到指定合集：

```text
memesluna.stole doro
```

如果合集不存在会自动创建。重复上传同一张图片时，会覆盖旧图片，但保留旧图片的 `tags` 和 `aliases`。

## 开发

```bash
npm install
npm run typecheck
npx yakumo build
```

发布包包含 `lib/**/*.js`、`lib/**/*.d.ts` 和 `dist`。源码中的 `client` 会由 Yakumo 构建为 Console 前端产物。

## License

MIT
