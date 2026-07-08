<template>
      <header class="content-breadcrumb-header">
        <div class="breadcrumbs">
          <span class="crumb-root">MemesLuna 控制台</span>
          <span class="crumb-separator">/</span>
          <span class="crumb-parent" v-if="activeMenu === 'resources'">表情包管理</span>
          <span class="crumb-parent" v-else-if="activeMenu === 'distribution'">分发管理</span>
          <span class="crumb-parent" v-else-if="activeMenu === 'settings'">预览</span>
          <span class="crumb-parent" v-else-if="activeMenu === 'staging'">暂缓区</span>

          <template v-if="activeMenu === 'resources' && currentCollection">
            <span class="crumb-separator">/</span>
            <span class="crumb-child active">表情包: {{ currentCollection.name }}</span>
          </template>
        </div>

        <!-- Quick Stats Banner -->
        <div class="header-quick-stats" v-if="!loading">
          <span class="stat-bubble">📂 表情包总数: {{ collections.length }}</span>
          <span class="stat-bubble">🌐 分发接口: {{ endpoints.length }}</span>
          <span class="stat-bubble">🕓 暂缓候选: {{ stagedImages.length }}</span>
        </div>
      </header>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../composables/dashboardContext'

export default defineComponent({
  name: 'AppHeader',
  setup() {
    return useDashboardContext()
  },
})
</script>
