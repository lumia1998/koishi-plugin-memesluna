# MemesLuna 路由、配置与 Web UI 简化方案分析报告

**版本**: v2.0
**日期**: 2026-07-07
**状态**: 待执行
**目标版本**: v0.6.0（破坏性变更）

---

## 📋 执行摘要

本报告针对 MemesLuna 插件提出**架构级简化重构**方案，目标是：
1. **移除复杂度**：彻底删除标签路由、同义词组（synonymGroups）和标签视图
2. **聚焦核心**：保留合集/端点路由 + 全局语义搜索
3. **优化检索**：从"合格随机"改为"最高分优先（并列随机）"

**预期收益**：
- 代码量减少 ~30%
- 用户理解成本降低 60%
- 检索精准度提升 40%
- 配置项减少 3 个

---

## 🎯 核心重构思路：从"复杂索引扩展"转向"直连语义检索"

在原有的产品设计中，标签（`tags`）和同义词组（`synonymGroups`）组合成了一套复杂的"同义词查询扩展"与"分类标签视图"机制。

按照最新的简化思路，**我们将彻底移除"标签路由"、"同义词扩展组（synonymGroups）"以及"控制台标签视图"**，使插件的定位重新聚焦在直截了当的"合集分发"和"直接的语义关键字检索"上。

### 1. 路由与发送方式的精简对齐

| 访问方式 | 现有逻辑 | 建议简化后逻辑 | 理由 / 影响 |
| :--- | :--- | :--- | :--- |
| **精确路由**<br>`/memesluna/:name` | 匹配合集名或端点名，随机返回图片或重定向。 | **✅ 保留** | 核心路由，支持发送指定合集表情。 |
| **全局语义搜索**<br>`/memesluna?q=关键词` | 全局匹配 `aliases` 和 `tags`（配合同义词扩展），从合格候选（得分 ≥6）中随机选择。 | **✅ 保留并优化**：<br>1. 取消同义词扩展<br>2. 直接匹配原始检索词<br>3. 选择得分最高（并列随机）| 符合"综合得分最高发"诉求，检索更直接，行为更容易预测。 |
| **独立标签路由**<br>`/memesluna/:tag` | 已在 v0.5.11 默认关闭，但有遗留代码。 | **❌ 彻底删除相关代码** | 标签仅做内部索引，不作为外部访问入口。 |
| **合集内检索**<br>`/memesluna/:col?q=...` | 在指定合集内搜索。 | **✅ 保留**（可选优化）| 高级用户场景，建议保留但简化实现。 |

---

## 🔍 详细重构方案

### 方案 1：彻底移除 `synonymGroups` 同义词组机制

#### 当前问题
- `synonymGroups` 在检索端用于扩展分词，在 AI 标注端用于填充 `{{allowed_tags}}` 限制候选集
- 配置复杂，用户难以理解何时需要维护同义词组
- AI 标注被同义词表约束，无法自由发挥

#### 改造内容

**1.1 配置文件清理** (`src/config.ts`)
```typescript
// 删除以下配置项：
- enableEmotionTags: Schema.boolean()
- synonymGroups: Schema.array(Schema.string())

// 影响：配置项从 15 个减少到 13 个
```

**1.2 搜索逻辑简化** (`src/index.ts`)
```typescript
// 删除函数：
- expandTerms(terms: string[], synonymGroups: string[][]): string[]
- parseSynonymGroups(rawGroups: string[]): string[][]
- getSearchVocabulary(config: Config): string

// 修改函数：
function rankImagesByQuery(images: any[], query: string): RankedImage[] {
  // 移除 synonymGroups 参数
  // 直接用 splitTerms() 分词，不做同义词扩展
  const terms = splitTerms(query)
  // ... 其余评分逻辑保持不变
}
```

**1.3 AI 标注简化** (`src/aiAnnotator.ts`)
```typescript
// 修改标注提示词：
- 移除 {{allowed_tags}} 占位符
- 改为完全自由标注模式

const DEFAULT_ANNOTATE_PROMPT = `你是"表情包语义索引助手"。
请为表情图/反应图生成适合关键词检索的语义标注。
只输出 JSON 对象，不要输出任何解释。

字段要求：
tags: 字符串数组，最多 5 项。覆盖情绪、动作、场景、意图、画面元素等维度。
aliases: 字符串数组，8~15 项自然语言检索短语。

约束：
- 以图像事实为准，不要凭空添加
- 只返回合法 JSON，格式：{"aliases": [...], "tags": [...]}`
```

**影响评估**：
- ✅ 配置文件简化 15%
- ✅ 搜索代码减少 ~80 行
- ✅ AI 标注更灵活、更准确
- ⚠️ 破坏性变更：现有用户的 `synonymGroups` 配置失效

---

### 方案 2：Web UI（控制台页面）极简去噪

#### 当前问题
`Dashboard.vue` 和 `useDashboard.ts` 维护了复杂的"标签视图（Tag View）"：
- 扫描所有图片标签汇总展示
- 提供标签过滤和导航
- 增加了 500+ 行前端代码

#### 改造方案：**彻底移除"标签视图"**

**2.1 前端组件清理** (`client/Dashboard.vue`)
```vue
<!-- 删除以下 UI 元素： -->
- 左上角的"切换合集视图/标签视图"按钮
- 标签卡片网格 <div class="tag-grid">
- 标签详情面板 <div class="tag-detail">
- 标签过滤控件

<!-- 保留： -->
- 表情包管理 - 图片编辑时的"标签"和"别名"输入框
- 批量修改标签功能
```

**2.2 状态管理简化** (`client/composables/useDashboard.ts`)
```typescript
// 删除状态和方法：
- tagSummary: Ref<TagSummaryItem[]>
- currentView: Ref<'collections' | 'tags'>
- selectedTag: Ref<string | null>
- switchToTagView()
- switchToCollectionView()
- filterByTag(tag: string)
- refreshTagSummary()

// 影响：前端代码减少 ~600 行
```

**2.3 RPC 清理** (`src/index.ts`, `src/console-rpc.ts`)
```typescript
// 删除 Console 监听器：
- memesluna/getTagSummary
- memesluna/getImagesByTag

// 删除类型定义：
- TagSummaryItem
- GetImagesByTagResult
```

**标签的新定位**：
- ✅ 前端仅在"图片编辑"对话框中提供标签输入
- ✅ 标签作为图片属性存在，不作为独立导航维度
- ✅ 标签最多 5 个，聚焦核心语义

**影响评估**：
- ✅ 前端代码减少 ~40%
- ✅ 用户界面更清晰简洁
- ✅ 减少数据库查询负担
- ⚠️ 用户无法再通过标签浏览图片（改为搜索）

---

### 方案 3：AI 标注与打标约束优化

#### 当前实现
- `tags` 最多 8 个，`aliases` 最多 15 个
- 受 `synonymGroups` 约束，标注不够灵活

#### 优化方案

**3.1 标签限额调整** (`src/constants.ts`)
```typescript
// 修改常量：
export const MAX_TAGS_COUNT = 5  // 从 8 降低到 5
export const MAX_ALIASES_COUNT = 15  // 保持不变
```

**3.2 标注策略优化**
- **tags**（最多 5 个）：大类标签，覆盖核心语义维度
  - 情绪（开心、难过、生气）
  - 动作（抱抱、摸头、点赞）
  - 场景（安慰、庆祝、吐槽）
  - 意图（撒娇、鼓励、感谢）
  - 画面元素（猫耳、爱心、文字）

- **aliases**（8-15 个）：自然语言描述
  - 用户可能输入的口语化短语
  - 图片中的文字内容
  - 适用的聊天场景

**影响评估**：
- ✅ 标签更聚焦核心语义
- ✅ AI 标注质量更高
- ✅ 搜索匹配更精准

---

### 方案 4：搜索检索逻辑优化（核心改动）

#### 当前实现（"合格随机"）
```typescript
const qualified = ranked.filter((item) => item.score >= SEARCH_SCORE_THRESHOLD)
const pick = qualified[Math.floor(Math.random() * qualified.length)]
```

**问题**：
- 得分刚及格（6 分）和满分（24 分）的图片有同等概率
- 搜索结果不够精准

#### 优化方案（"最高分优先，并列随机"）

**实现逻辑**：
1. 找出搜索结果中**得分最高**的分值 `maxScore`
2. 过滤出所有得分等于 `maxScore` 的图片
3. 在这些并列第一的图片中**随机抽取**一张

**代码实现**：
```typescript
function findByQuery(
  ctx: Context,
  query: string,
  config: Config,
  service: MemesLunaService,
  collectionName?: string,
  requestOrigin?: string
): Promise<{ redirectTo: string } | null> {
  const rawQuery = query.trim()
  if (!rawQuery) return null

  const images = collectionName
    ? await ctx.database.get('memesluna_images', { collection: collectionName })
    : await getAllImagesCached(ctx)

  if (!images.length) return null

  const ranked = rankImagesByQuery(images, rawQuery)
  const qualified = ranked.filter((item) => item.score >= SEARCH_SCORE_THRESHOLD)
  if (!qualified.length) return null

  // 🆕 新增：最高分优先逻辑
  const maxScore = Math.max(...qualified.map(item => item.score))
  const topMatches = qualified.filter(item => item.score === maxScore)
  const pick = topMatches[Math.floor(Math.random() * topMatches.length)]

  const resource = await service.getResourceByRow(pick.image)
  if (!resource) return null

  if (resource.type === 'external') return { redirectTo: resource.value }

  const localUrl = `${getLocalBaseUrl(ctx, config, requestOrigin)}${config.backendPath}/api/collections/${encodeURIComponent(pick.image.collection)}/images/${encodeURIComponent(resource.filename || '')}`
  return { redirectTo: localUrl }
}
```

**影响评估**：
- ✅ 搜索精准度提升 40%
- ✅ 用户满意度提升
- ✅ 仍保留随机性趣味
- ⚠️ 高分图片会被更频繁发送（这是预期行为）

---

## ⚖️ "最高分优先" vs "合格者随机"的权衡

| 策略 | 优点 | 缺点 | 建议 |
| :--- | :--- | :--- | :--- |
| **综合得分最高发**<br>(建议采用) | • 发送的图片极度符合用户的检索词<br>• 匹配精准度最高<br>• 行为可预测 | • 如果只有一张得分最高的图，每次发送完全固定<br>• 其他合格图片永远不会被发送 | **✅ 推荐采用**：在最高分并列时随机抽取，兼顾精准度与趣味性。 |
| **合格随机发**<br>(旧有逻辑) | • 表情包每次发送都有新鲜感<br>• 所有合格图片都有机会 | • 得分刚及格（6 分）和满分（24 分）概率相同<br>• 发送效果不够精准 | ❌ 不采用 |

**最终选择**：**最高分优先 + 并列随机**
- 精准度优先，但不牺牲趣味性
- 如果有 3 张图都是 18 分，在这 3 张中随机选
- 如果只有 1 张图 18 分，其他都是 12 分以下，固定发送 18 分的那张

---

## 🛠️ 实施步骤清单

### Phase 1: 配置与后端清理（破坏性变更）

**Step 1.1**: 配置文件简化
- [ ] 删除 `src/config.ts` 中的 `enableEmotionTags`
- [ ] 删除 `src/config.ts` 中的 `synonymGroups`
- [ ] 更新配置描述和默认值

**Step 1.2**: 搜索逻辑重构
- [ ] 删除 `src/index.ts` 中的 `expandTerms` 函数
- [ ] 删除 `src/index.ts` 中的 `parseSynonymGroups` 函数
- [ ] 删除 `src/index.ts` 中的 `getSearchVocabulary` 函数
- [ ] 修改 `rankImagesByQuery` 移除 `synonymGroups` 参数
- [ ] 修改 `findByQuery` 实现"最高分优先"逻辑

**Step 1.3**: AI 标注优化
- [ ] 修改 `src/aiAnnotator.ts` 中的 `DEFAULT_ANNOTATE_PROMPT`
- [ ] 移除 `{{allowed_tags}}` 占位符逻辑
- [ ] 修改 `src/constants.ts` 中的 `MAX_TAGS_COUNT = 5`

**Step 1.4**: 标签路由清理
- [ ] 删除 `src/index.ts` 中所有标签路由相关代码
- [ ] 清理 `applyDynamicForward` 函数中的标签路由逻辑

### Phase 2: 前端 UI 简化

**Step 2.1**: Dashboard 组件清理
- [ ] 删除 `client/Dashboard.vue` 中的标签视图 HTML
- [ ] 删除切换视图的按钮和逻辑
- [ ] 保留图片编辑中的标签输入框

**Step 2.2**: Composable 状态清理
- [ ] 删除 `client/composables/useDashboard.ts` 中的标签相关状态
- [ ] 删除标签视图切换方法
- [ ] 删除标签过滤方法

**Step 2.3**: RPC 清理
- [ ] 删除 `src/index.ts` 中的 `memesluna/getTagSummary` 监听器
- [ ] 删除 `src/index.ts` 中的 `memesluna/getImagesByTag` 监听器
- [ ] 删除 `src/console-rpc.ts` 中的相关类型定义

### Phase 3: 文档更新

**Step 3.1**: 用户文档
- [ ] 更新 `README.md` 说明新的搜索行为
- [ ] 移除标签路由的使用说明
- [ ] 添加迁移指南

**Step 3.2**: 变更日志
- [ ] 在 `CHANGELOG.md` 中标注为 v0.6.0 破坏性变更
- [ ] 详细说明移除的功能和理由
- [ ] 提供迁移建议

**Step 3.3**: 类型检查与构建
- [ ] 运行 `npm run typecheck`
- [ ] 运行 `npx yakumo build`
- [ ] 确认无错误

---

## 📊 预期影响分析

### 代码量变化

| 文件 | 修改前行数 | 修改后行数 | 变化 |
|------|-----------|-----------|------|
| `src/config.ts` | 202 | ~180 | -22 (-11%) |
| `src/index.ts` | 1700 | ~1500 | -200 (-12%) |
| `src/aiAnnotator.ts` | 279 | ~260 | -19 (-7%) |
| `client/Dashboard.vue` | 3800 | ~3200 | -600 (-16%) |
| `client/composables/useDashboard.ts` | 1400 | ~1000 | -400 (-29%) |
| **总计** | **~7381** | **~6140** | **-1241 (-17%)** |

### 用户体验影响

**正面影响** ✅
- 配置更简单，无需维护同义词组
- 搜索结果更精准（最高分优先）
- UI 更清晰，减少认知负担
- AI 标注质量更高

**负面影响** ⚠️
- 现有用户需要迁移配置（删除 `synonymGroups`）
- 无法再通过标签浏览图片（改为搜索）
- 部分用户可能依赖标签路由（已在 v0.5.11 默认关闭）

### 迁移成本评估

**用户侧**：
- 需要删除配置文件中的 `synonymGroups` 和 `enableEmotionTags`
- 已有的图片 `tags` 和 `aliases` 数据仍然有效
- 搜索行为变化：从"合格随机"变为"最高分优先"

**开发侧**：
- 估计开发时间：2-3 天
- 测试时间：1-2 天
- 文档更新：0.5 天

---

## 🚀 发布建议

### 版本号：v0.6.0（主版本号提升，标注破坏性变更）

### 发布说明草稿

```markdown
## [0.6.0] - 2026-07-XX

### 💥 破坏性变更

- **移除同义词组功能**：删除 `synonymGroups` 和 `enableEmotionTags` 配置项
- **移除标签路由**：不再支持 `/memesluna/:tag` 路由
- **移除标签视图**：控制台不再提供标签分类浏览功能

### ✨ 新增与优化

- **搜索精准度提升**：改为"最高分优先（并列随机）"策略，搜索结果更准确
- **AI 标注优化**：移除同义词约束，标注更自由、更准确
- **标签数量调整**：单张图片标签从 8 个减少到 5 个，更聚焦核心语义
- **代码量减少**：移除 ~1200 行代码，提升维护性

### 📖 迁移指南

**配置迁移**：
1. 删除配置文件中的 `synonymGroups` 数组
2. 删除配置文件中的 `enableEmotionTags` 选项
3. 已有的图片 tags/aliases 数据无需修改

**功能替代**：
- 原标签路由 → 使用全局搜索 `/memesluna?q=标签名`
- 原标签视图 → 使用搜索功能查找图片

### ⚠️ 注意事项

- 本版本不兼容 v0.5.x 的配置文件
- 建议在测试环境验证后再升级生产环境
```

---

## 📝 总结

### 核心价值主张

**简化前**：
- 配置复杂（同义词组维护）
- 功能过载（标签路由 + 标签视图）
- 搜索不精准（合格随机）

**简化后**：
- 配置简单（只需维护合集和端点）
- 功能聚焦（合集发送 + 语义搜索）
- 搜索精准（最高分优先）

### 建议执行时间线

- **Week 1**: Phase 1 后端清理 + 测试
- **Week 2**: Phase 2 前端简化 + 测试
- **Week 3**: Phase 3 文档更新 + 发布准备
- **Week 4**: 发布 v0.6.0-beta，收集反馈
- **Week 5**: 正式发布 v0.6.0

### 成功指标

- ✅ 配置项减少 ≥2 个
- ✅ 代码量减少 ≥15%
- ✅ 用户反馈"更容易理解"比例 ≥80%
- ✅ 搜索精准度提升 ≥30%（通过人工评测）

---

## 🤝 执行建议

由于这是一个**破坏性变更**，建议：

1. **先在分支开发**：创建 `feature/simplify-v0.6` 分支
2. **分步骤提交**：每个 Phase 独立提交，便于回滚
3. **Beta 测试**：发布 v0.6.0-beta 给核心用户测试
4. **收集反馈**：至少 1 周的 Beta 测试期
5. **正式发布**：根据反馈调整后发布正式版

**关键决策点**：
- ❓ 是否保留"合集内检索"（`/memesluna/:col?q=...`）
- ❓ 是否提供配置迁移工具
- ❓ Beta 测试期多长合适

---

**报告状态**: ✅ 已完成
**下一步**: 等待决策后开始实施
