# 前端组件拆分实施计划

> 项目：koishi-plugin-memesluna
> 目标版本：v0.7.0
> 预计工作量：8-12 小时
> 风险等级：中等

---

## 📋 目录

1. [当前问题分析](#当前问题分析)
2. [拆分目标](#拆分目标)
3. [技术方案](#技术方案)
4. [实施步骤](#实施步骤)
5. [风险评估与缓解](#风险评估与缓解)
6. [测试计划](#测试计划)
7. [时间安排](#时间安排)
8. [验收标准](#验收标准)

---

## 当前问题分析

### 现状

**文件结构**：
```
client/
├── Dashboard.vue (68KB, 1800+ 行) ⚠️
├── composables/
├── styles/
└── index.ts
```

### 存在的问题

1. **可维护性差**
   - 单文件过大，难以理解和修改
   - 逻辑混杂，职责不清晰
   - 难以进行单元测试

2. **性能问题**
   - 整个页面作为一个组件，初始加载慢
   - 无法按需加载子功能
   - 状态管理混乱，容易触发不必要的重渲染

3. **协作困难**
   - 多人同时修改容易冲突
   - 代码审查困难
   - 难以增加新功能

---

## 拆分目标

### 主要目标

1. **提升可维护性**
   - 单个组件不超过 300 行
   - 职责单一，逻辑清晰
   - 便于单元测试

2. **优化性能**
   - 支持路由级懒加载
   - 减少不必要的重渲染
   - 优化状态管理

3. **改善开发体验**
   - 组件复用性强
   - 清晰的数据流
   - 便于新功能扩展

### 非目标

- ❌ 不改变现有功能逻辑
- ❌ 不修改 API 接口
- ❌ 不调整 UI 视觉设计

---

## 技术方案

### 组件层级设计

```
App (Dashboard.vue)
├── Layout
│   ├── Header
│   │   └── Breadcrumbs
│   ├── Navigation
│   │   └── MenuSwitcher
│   └── Toast
│
├── Views (路由页面)
│   ├── CollectionsView
│   │   ├── CollectionList
│   │   │   ├── CollectionCard
│   │   │   └── CreateCollectionDialog
│   │   └── CollectionDetail
│   │       ├── CollectionHeader
│   │       ├── ImageGrid
│   │       │   ├── ImageCard
│   │       │   └── ImageBatchActions
│   │       ├── LinksManager
│   │       └── ImageMetadataEditor
│   │
│   ├── EndpointsView
│   │   ├── EndpointList
│   │   │   └── EndpointCard
│   │   └── EndpointEditor
│   │
│   ├── StagingView
│   │   ├── StagedImageList
│   │   │   └── StagedImageCard
│   │   └── SimilarImagesGrouper
│   │
│   └── PreviewView
│       ├── RouteInventory
│       └── PromptPreview
│
└── Shared Components
    ├── ImageUploader
    ├── ConfirmDialog
    ├── LoadingSpinner
    └── EmptyState
```

### 状态管理方案

**选择：Pinia**

**理由**：
- Vue 3 官方推荐
- TypeScript 支持好
- API 简洁直观
- 支持模块化

**Store 设计**：

```typescript
stores/
├── collections.ts    // 合集管理
├── endpoints.ts      // 端点管理
├── staging.ts        // 暂缓区
├── ui.ts             // UI 状态（toast、loading）
└── config.ts         // 配置信息
```

### 路由方案

使用 Vue Router（如果 Koishi Console 支持）或简单的条件渲染。

---

## 实施步骤

### 阶段 0：准备工作（1 小时）

**任务**：
- [ ] 创建特性分支 `feature/refactor-frontend`
- [ ] 备份当前 `Dashboard.vue`
- [ ] 安装依赖（Pinia）
- [ ] 设置项目结构

**产出**：
```
client/
├── components/
│   ├── layout/
│   ├── views/
│   └── shared/
├── composables/
├── stores/
├── types/
├── utils/
└── styles/
```

---

### 阶段 1：提取共享组件（2 小时）

**优先级**：高
**依赖**：无

#### 1.1 基础组件

**任务**：
- [ ] 提取 `Toast.vue` - 全局通知
- [ ] 提取 `ConfirmDialog.vue` - 确认对话框
- [ ] 提取 `LoadingSpinner.vue` - 加载动画
- [ ] 提取 `EmptyState.vue` - 空状态占位

**位置**：`client/components/shared/`

**示例**：
```vue
<!-- Toast.vue -->
<script setup lang="ts">
import { useUIStore } from '@/stores/ui'

const uiStore = useUIStore()
</script>

<template>
  <Transition name="fade">
    <div
      v-if="uiStore.toast.show"
      :class="['toast-banner', uiStore.toast.type]"
    >
      <span>{{ uiStore.toast.message }}</span>
    </div>
  </Transition>
</template>
```

#### 1.2 业务组件

**任务**：
- [ ] 提取 `ImageUploader.vue` - 图片上传器
- [ ] 提取 `ImageCard.vue` - 图片卡片
- [ ] 提取 `ImageMetadataEditor.vue` - 标签编辑器

**位置**：`client/components/shared/`

---

### 阶段 2：状态管理迁移（2 小时）

**优先级**：高
**依赖**：阶段 1

#### 2.1 安装 Pinia

```bash
npm install pinia
```

#### 2.2 创建 Stores

**任务**：
- [ ] `stores/collections.ts` - 合集状态
- [ ] `stores/endpoints.ts` - 端点状态
- [ ] `stores/staging.ts` - 暂缓区状态
- [ ] `stores/ui.ts` - UI 状态
- [ ] `stores/config.ts` - 配置状态

**示例**：
```typescript
// stores/collections.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { rpc } from '@/api'

export const useCollectionsStore = defineStore('collections', () => {
  // State
  const collections = ref<Collection[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const collectionCount = computed(() => collections.value.length)
  const hasCollections = computed(() => collectionCount.value > 0)

  // Actions
  async function fetchCollections() {
    loading.value = true
    error.value = null
    try {
      const data = await rpc.call('memesluna/getState')
      collections.value = data.collections
    } catch (e) {
      error.value = (e as Error).message
    } finally {
      loading.value = false
    }
  }

  async function createCollection(name: string) {
    await rpc.call('memesluna/createCollection', name)
    await fetchCollections()
  }

  async function deleteCollection(name: string) {
    await rpc.call('memesluna/deleteCollection', name)
    await fetchCollections()
  }

  return {
    // State
    collections,
    loading,
    error,
    // Getters
    collectionCount,
    hasCollections,
    // Actions
    fetchCollections,
    createCollection,
    deleteCollection,
  }
})
```

#### 2.3 迁移现有逻辑

**任务**：
- [ ] 识别 Dashboard.vue 中的状态
- [ ] 迁移到对应的 Store
- [ ] 更新组件引用

---

### 阶段 3：拆分视图组件（3 小时）

**优先级**：高
**依赖**：阶段 2

#### 3.1 合集管理视图

**任务**：
- [ ] `CollectionsView.vue` - 主视图
- [ ] `CollectionList.vue` - 合集列表
- [ ] `CollectionCard.vue` - 合集卡片
- [ ] `CollectionDetail.vue` - 合集详情
- [ ] `ImageGrid.vue` - 图片网格

**位置**：`client/components/views/collections/`

**示例**：
```vue
<!-- CollectionList.vue -->
<script setup lang="ts">
import { useCollectionsStore } from '@/stores/collections'
import CollectionCard from './CollectionCard.vue'

const store = useCollectionsStore()

const handleCreate = async (name: string) => {
  await store.createCollection(name)
}
</script>

<template>
  <div class="collection-list">
    <div class="list-header">
      <h2>表情包合集</h2>
      <button @click="showCreateDialog">新建合集</button>
    </div>

    <div v-if="store.loading" class="loading">
      <LoadingSpinner />
    </div>

    <div v-else-if="store.hasCollections" class="grid">
      <CollectionCard
        v-for="collection in store.collections"
        :key="collection.name"
        :collection="collection"
      />
    </div>

    <EmptyState v-else message="暂无合集" />
  </div>
</template>
```

#### 3.2 端点管理视图

**任务**：
- [ ] `EndpointsView.vue` - 主视图
- [ ] `EndpointList.vue` - 端点列表
- [ ] `EndpointCard.vue` - 端点卡片
- [ ] `EndpointEditor.vue` - 端点编辑器

**位置**：`client/components/views/endpoints/`

#### 3.3 暂缓区视图

**任务**：
- [ ] `StagingView.vue` - 主视图
- [ ] `StagedImageList.vue` - 暂存图片列表
- [ ] `StagedImageCard.vue` - 暂存图片卡片
- [ ] `SimilarImagesGrouper.vue` - 相似图片分组

**位置**：`client/components/views/staging/`

#### 3.4 预览视图

**任务**：
- [ ] `PreviewView.vue` - 主视图
- [ ] `RouteInventory.vue` - 路由清单
- [ ] `PromptPreview.vue` - 提示词预览

**位置**：`client/components/views/preview/`

---

### 阶段 4：布局和导航（1 小时）

**优先级**：中
**依赖**：阶段 3

#### 4.1 布局组件

**任务**：
- [ ] `AppLayout.vue` - 主布局
- [ ] `AppHeader.vue` - 页头
- [ ] `Breadcrumbs.vue` - 面包屑
- [ ] `MenuSwitcher.vue` - 视图切换器

**位置**：`client/components/layout/`

#### 4.2 路由逻辑

**任务**：
- [ ] 提取路由状态到 `stores/ui.ts`
- [ ] 实现视图切换逻辑
- [ ] 保持 URL 同步（如果需要）

---

### 阶段 5：整合和优化（1.5 小时）

**优先级**：中
**依赖**：阶段 4

#### 5.1 整合组件

**任务**：
- [ ] 更新 `Dashboard.vue` 为主入口
- [ ] 连接所有子组件
- [ ] 验证数据流

**示例**：
```vue
<!-- Dashboard.vue (重构后) -->
<script setup lang="ts">
import { onMounted } from 'vue'
import { useCollectionsStore } from '@/stores/collections'
import { useEndpointsStore } from '@/stores/endpoints'
import { useStagingStore } from '@/stores/staging'
import { useUIStore } from '@/stores/ui'

import AppLayout from '@/components/layout/AppLayout.vue'
import CollectionsView from '@/components/views/collections/CollectionsView.vue'
import EndpointsView from '@/components/views/endpoints/EndpointsView.vue'
import StagingView from '@/components/views/staging/StagingView.vue'
import PreviewView from '@/components/views/preview/PreviewView.vue'

const collectionsStore = useCollectionsStore()
const endpointsStore = useEndpointsStore()
const stagingStore = useStagingStore()
const uiStore = useUIStore()

onMounted(async () => {
  await Promise.all([
    collectionsStore.fetchCollections(),
    endpointsStore.fetchEndpoints(),
    stagingStore.fetchStagedImages(),
  ])
})
</script>

<template>
  <AppLayout>
    <CollectionsView v-if="uiStore.currentView === 'collections'" />
    <EndpointsView v-else-if="uiStore.currentView === 'endpoints'" />
    <StagingView v-else-if="uiStore.currentView === 'staging'" />
    <PreviewView v-else-if="uiStore.currentView === 'preview'" />
  </AppLayout>
</template>
```

#### 5.2 性能优化

**任务**：
- [ ] 添加组件懒加载
- [ ] 优化重渲染（使用 `computed`、`memo`）
- [ ] 虚拟滚动（如果图片列表很长）
- [ ] 图片懒加载

**示例**：
```typescript
// 懒加载视图
const CollectionsView = defineAsyncComponent(() =>
  import('@/components/views/collections/CollectionsView.vue')
)
```

---

### 阶段 6：测试（1.5 小时）

**优先级**：高
**依赖**：阶段 5

#### 6.1 单元测试

**任务**：
- [ ] 测试 Stores（Pinia）
- [ ] 测试共享组件
- [ ] 测试工具函数

**工具**：Vitest + Vue Test Utils

**示例**：
```typescript
// stores/collections.test.ts
import { setActivePinia, createPinia } from 'pinia'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useCollectionsStore } from '@/stores/collections'

describe('Collections Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('should fetch collections', async () => {
    const store = useCollectionsStore()

    // Mock RPC
    vi.mock('@/api', () => ({
      rpc: {
        call: vi.fn().mockResolvedValue({
          collections: [
            { name: 'test', totalCount: 5 }
          ]
        })
      }
    }))

    await store.fetchCollections()

    expect(store.collections).toHaveLength(1)
    expect(store.collections[0].name).toBe('test')
  })
})
```

#### 6.2 集成测试

**任务**：
- [ ] 测试完整用户流程
  - 创建合集
  - 上传图片
  - 编辑标签
  - 删除合集
- [ ] 测试错误处理
- [ ] 测试边界情况

#### 6.3 手动测试

**任务**：
- [ ] 在本地 Koishi 环境中测试
- [ ] 验证所有功能
- [ ] 检查 UI 响应性
- [ ] 测试不同浏览器

---

### 阶段 7：文档和发布（1 小时）

**优先级**：中
**依赖**：阶段 6

#### 7.1 代码文档

**任务**：
- [ ] 为复杂组件添加注释
- [ ] 编写组件使用文档
- [ ] 更新 README

#### 7.2 变更日志

**任务**：
- [ ] 更新 CHANGELOG.md
- [ ] 记录破坏性变更（如果有）
- [ ] 记录新增功能

#### 7.3 发布准备

**任务**：
- [ ] 合并到主分支
- [ ] 更新版本号（v0.7.0）
- [ ] 创建 Git Tag
- [ ] 发布到 npm

---

## 风险评估与缓解

### 风险矩阵

| 风险 | 概率 | 影响 | 等级 | 缓解措施 |
|------|------|------|------|----------|
| 功能回退 | 中 | 高 | 🔴 高 | 充分测试，保留原文件备份 |
| 性能下降 | 低 | 中 | 🟡 中 | 性能监控，懒加载优化 |
| 状态管理 bug | 中 | 中 | 🟡 中 | 单元测试，渐进式迁移 |
| 用户体验变差 | 低 | 高 | 🟡 中 | UI 保持不变，用户测试 |
| 工期延误 | 中 | 低 | 🟢 低 | 分阶段实施，可独立交付 |

### 缓解策略

1. **功能回退**
   - ✅ 备份原始文件
   - ✅ 在特性分支开发
   - ✅ 充分的测试覆盖
   - ✅ Beta 测试阶段

2. **性能下降**
   - ✅ 性能基准测试
   - ✅ 懒加载和代码分割
   - ✅ 虚拟滚动（长列表）
   - ✅ 监控和持续优化

3. **状态管理 bug**
   - ✅ Store 单元测试
   - ✅ 严格的 TypeScript 类型
   - ✅ 渐进式迁移
   - ✅ 代码审查

4. **用户体验变差**
   - ✅ 保持 UI 不变
   - ✅ 用户测试反馈
   - ✅ 快速响应问题

---

## 测试计划

### 测试策略

```
金字塔测试模型：

     E2E 测试 (5%)
    ┌─────────┐
    │  手动   │
    └─────────┘
   集成测试 (25%)
  ┌─────────────┐
  │  用户流程   │
  └─────────────┘
 单元测试 (70%)
┌─────────────────┐
│ Stores + 组件   │
└─────────────────┘
```

### 测试清单

#### 单元测试（Vitest）

**Stores**：
- [ ] Collections Store
  - [ ] fetchCollections
  - [ ] createCollection
  - [ ] deleteCollection
  - [ ] updateCollection
- [ ] Endpoints Store
  - [ ] fetchEndpoints
  - [ ] createEndpoint
  - [ ] updateEndpoint
  - [ ] deleteEndpoint
- [ ] Staging Store
  - [ ] fetchStagedImages
  - [ ] promoteStagedImage
  - [ ] deleteStagedImage
- [ ] UI Store
  - [ ] showToast
  - [ ] switchView
  - [ ] showDialog

**组件**：
- [ ] ImageCard
- [ ] ImageUploader
- [ ] Toast
- [ ] ConfirmDialog

#### 集成测试

**用户流程**：
- [ ] 创建合集 → 上传图片 → 查看图片
- [ ] 编辑标签 → 保存 → 验证
- [ ] 删除图片 → 确认对话框 → 验证
- [ ] 创建端点 → 编辑 → 删除
- [ ] 暂缓区 → 归档到合集 → 验证

#### 手动测试

**功能测试**：
- [ ] 所有按钮可点击
- [ ] 所有表单可提交
- [ ] 所有对话框可打开/关闭
- [ ] 图片上传正常
- [ ] 图片预览正常
- [ ] 路由切换正常

**兼容性测试**：
- [ ] Chrome (最新版)
- [ ] Firefox (最新版)
- [ ] Safari (最新版)
- [ ] Edge (最新版)

**性能测试**：
- [ ] 初始加载时间 < 2s
- [ ] 视图切换流畅（< 300ms）
- [ ] 图片列表滚动流畅（60fps）
- [ ] 批量操作不卡顿

---

## 时间安排

### 甘特图

```
阶段 0: 准备工作          [█████░░░░░░░░░░░░░░░] 1h
阶段 1: 共享组件          [░░░░█████████░░░░░░░] 2h
阶段 2: 状态管理          [░░░░░░░░░████████░░░] 2h
阶段 3: 视图组件          [░░░░░░░░░░░░░█████░░] 3h
阶段 4: 布局导航          [░░░░░░░░░░░░░░░███░░] 1h
阶段 5: 整合优化          [░░░░░░░░░░░░░░░░░███] 1.5h
阶段 6: 测试              [░░░░░░░░░░░░░░░░░░░█] 1.5h
阶段 7: 文档发布          [░░░░░░░░░░░░░░░░░░░█] 1h

总计: 12 小时
```

### 里程碑

| 里程碑 | 完成标志 | 目标时间 |
|--------|----------|----------|
| M1: 基础设施就绪 | Pinia + 共享组件 | Day 1 |
| M2: 核心视图完成 | 合集管理可用 | Day 2 |
| M3: 功能完整 | 所有视图可用 | Day 3 |
| M4: 测试通过 | 测试覆盖 > 70% | Day 4 |
| M5: 发布就绪 | 文档完整，可发布 | Day 5 |

---

## 验收标准

### 功能验收

- [ ] 所有原有功能正常工作
- [ ] 无功能回退或缺失
- [ ] 新增功能（如有）按预期工作
- [ ] 错误处理正确

### 代码质量

- [ ] 单个组件不超过 300 行
- [ ] TypeScript 无 error
- [ ] ESLint 无 error
- [ ] 代码审查通过

### 性能验收

- [ ] 初始加载时间不超过 2 秒
- [ ] 视图切换响应时间 < 300ms
- [ ] 列表滚动流畅（60fps）
- [ ] 内存占用无明显增加

### 测试验收

- [ ] 单元测试覆盖率 > 70%
- [ ] 所有集成测试通过
- [ ] 手动测试清单完成
- [ ] 无已知 bug

### 文档验收

- [ ] 组件文档完整
- [ ] CHANGELOG 更新
- [ ] README 更新
- [ ] 迁移指南（如有破坏性变更）

---

## 回滚计划

### 触发条件

以下情况需要考虑回滚：
- 严重 bug 无法快速修复
- 性能下降超过 50%
- 用户反馈强烈负面
- 测试覆盖率低于 50%

### 回滚步骤

1. **恢复原始文件**
   ```bash
   git checkout main -- client/Dashboard.vue
   ```

2. **移除新增依赖**
   ```bash
   npm uninstall pinia
   ```

3. **清理新增文件**
   ```bash
   rm -rf client/components/views
   rm -rf client/stores
   ```

4. **验证功能**
   - 运行所有测试
   - 手动验证核心功能

5. **通知用户**
   - 发布回滚公告
   - 说明原因和后续计划

---

## 后续优化

### v0.7.1（修复版本）

- 收集用户反馈
- 修复发现的 bug
- 小幅性能优化

### v0.8.0（增强版本）

- 添加组件文档站点（Storybook）
- 实现组件主题化
- 添加更多动画效果
- 支持自定义布局

### v1.0.0（稳定版本）

- 完整的测试覆盖（> 90%）
- 性能基准测试
- 国际化支持
- 无障碍支持（WCAG AA）

---

## 附录

### A. 技术栈

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue | 3.x | 前端框架 |
| Pinia | 2.x | 状态管理 |
| TypeScript | 5.x | 类型系统 |
| Vitest | 1.x | 单元测试 |
| Vue Test Utils | 2.x | 组件测试 |

### B. 命名规范

**组件命名**：
- 视图组件：`XxxView.vue`（如 `CollectionsView.vue`）
- 布局组件：`AppXxx.vue`（如 `AppHeader.vue`）
- 业务组件：`XxxYyy.vue`（如 `ImageCard.vue`）
- 共享组件：`XxxYyy.vue`（如 `LoadingSpinner.vue`）

**Store 命名**：
- 文件名：复数（`collections.ts`）
- Store 名：复数（`useCollectionsStore`）

**类型命名**：
- 接口：`PascalCase`（如 `Collection`）
- 类型：`PascalCase`（如 `ToastType`）

### C. 参考资源

- [Vue 3 文档](https://vuejs.org/)
- [Pinia 文档](https://pinia.vuejs.org/)
- [Vitest 文档](https://vitest.dev/)
- [Vue 组件最佳实践](https://vuejs.org/guide/best-practices/)

---

## 签署

| 角色 | 姓名 | 签署日期 | 签名 |
|------|------|----------|------|
| 项目负责人 | Lumia | 2026-07-07 | ✓ |
| 技术审查 | - | - | - |
| 质量保证 | - | - | - |

---

**文档版本**：v1.0
**最后更新**：2026-07-07
**下次审查**：开始实施前
