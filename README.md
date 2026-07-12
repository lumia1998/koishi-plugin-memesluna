# koishi-plugin-memesluna

MemesLuna 是 Koishi 的表情图片路由与管理插件。它把本地表情合集、外部图片端点与 ChatLuna 提示词变量连在一起，让机器人按固定 HTTP 路由发图。

[![npm](https://img.shields.io/npm/v/koishi-plugin-memesluna.svg)](https://www.npmjs.com/package/koishi-plugin-memesluna)
[![license](https://img.shields.io/npm/l/koishi-plugin-memesluna.svg)](./LICENSE)

## 功能概览

- **表情包合集**：本地图 / 外链、描述、移动、删除、批量上传
- **端点转发**：自定义路由 302 到外部图片 API
- **Console 管理页**：合集、图片、端点、暂缓区、语义标签与检索别名
- **ChatLuna 注入**：`{endpoint}` 路由清单 + `{memesluna}` 使用说明
- **关键词搜索**：`/memesluna?q=关键词`（aliases / tags / 文件名打分，非向量检索）
- **AI 标注**：用 ChatLuna 视觉模型生成 `tags` 与 `aliases`
- **暂缓区**：过滤或自动收集的候选图，人工复核后归档
- **高频自动收集**：群聊高频图片进入暂缓区（可配窗口、阈值、大小与每日上限）

## 安装

```bash
npm i koishi-plugin-memesluna
```

依赖服务：`database`、`server`、`chatluna`。Console 页面需要 `@koishijs/plugin-console`。

## 基础配置

| 配置项 | 说明 |
|--------|------|
| `backendPath` | HTTP 路由前缀，默认 `/memesluna` |
| `selfUrl` | 对外完整地址；留空则用 `server.selfUrl` |
| `injectVariables` | 是否注入 ChatLuna 变量，默认开启 |
| `variableRefreshIntervalMs` | 变量刷新间隔 |
| `injectVariablesPrompt` | `{memesluna}` 提示词模板 |

本地合集固定在 Koishi 数据目录 `data/memesluna`。合集名与端点名共用路由命名空间，不能重名。

## Console 用法

启用插件后，控制台会出现 **MemesLuna** 页面：

1. 在「表情包管理」新建合集并上传本地图或导入外链  
2. 在「分发管理」创建端点，转发到外部图源  
3. 在「预览」查看注入给 ChatLuna 的路由与提示词  
4. 在「暂缓区」复核后归档到合集  

图片可维护：

- `tags`：语义标签（情绪、动作、场景等）
- `aliases`：自然语言检索别名（用于 `?q=`）

## 路由说明

默认前缀 `/memesluna`：

| 路径 | 作用 |
|------|------|
| `/memesluna/` | 跳转 Console |
| `/memesluna/:name` | 合集随机图，或端点 302 |
| `/memesluna?q=关键词` | 跨合集关键词搜索 |
| `/memesluna/合集名?q=关键词` | 合集内搜索（无匹配时退回随机） |
| `/memesluna/:collection/:filename` | 本地图直链 |

### 搜索评分（摘要）

- 短语命中 aliases / tags / 文件名：`+12` / `+8` / `+4`
- 分词命中 aliases / tags / 文件名：`+6` / `+6` / `+2`
- 多词命中额外加分；总分 ≥ `6` 才进入候选

## ChatLuna

开启 `injectVariables` 后注入：

- `{endpoint}`：可用合集与端点清单  
- `{memesluna}`：由 `injectVariablesPrompt` 渲染的使用说明  

模板占位符：`{endpoint}`、`{base_url}`、`{backend_path}`（以及兼容用的空占位 `{tag_routes}`、`{tags}`）。

## AI 标注

配置 ChatLuna `model` 后，上传 / 偷图 / 归档本地图可异步生成 `tags` 与 `aliases`。

```text
memesluna.tagall
memesluna.tagall -f
memesluna.untagall
memesluna.untagall -c 合集名
```

## 自动收集与暂缓区

开启 `autoCollect` 后监听群聊图片；窗口内出现次数达到阈值则进入暂缓区。

主要配置：`emojiFrequencyWindowMinutes`、`emojiFrequencyThreshold`、`minEmojiSize` / `maxEmojiSize`、`groupAutoCollectLimit`、`similarityThreshold`、`stagingRetentionDays`。

暂缓区图片不参与随机路由，需在 Console 归档到合集后才生效。

## 命令

```text
memesluna.list          # 列出可用合集与端点
memesluna.stole <合集>  # 引用图片写入合集（需先创建合集）
```

## 开发

```bash
npm install
npm run typecheck
npm test
npm run build
```

发布物：`lib/**/*.js`、`lib/**/*.d.ts`、`dist`（Console 前端）。

## License

MIT
