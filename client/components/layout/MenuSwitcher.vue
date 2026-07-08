<template>
      <div v-if="!currentCollection" class="notion-view-switcher">
        <button
          @click="switchMainMenu('resources')"
          :class="['switcher-btn', activeMenu === 'resources' ? 'active' : '']"
        >
          <span class="switcher-icon">📦</span>
          <span class="switcher-label">表情包管理</span>
        </button>
        <button
          @click="switchMainMenu('distribution')"
          :class="['switcher-btn', activeMenu === 'distribution' ? 'active' : '']"
        >
          <span class="switcher-icon">🌐</span>
          <span class="switcher-label">分发管理</span>
        </button>
        <button
          @click="switchMainMenu('staging')"
          :class="['switcher-btn', activeMenu === 'staging' ? 'active' : '']"
        >
          <span class="switcher-icon">🕓</span>
          <span class="switcher-label">暂缓区</span>
        </button>
        <button
          @click="switchMainMenu('settings')"
          :class="['switcher-btn', activeMenu === 'settings' ? 'active' : '']"
        >
          <span class="switcher-icon">👁️</span>
          <span class="switcher-label">预览</span>
        </button>
      </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../composables/dashboardContext'

export default defineComponent({
  name: 'MenuSwitcher',
  setup() {
    return useDashboardContext()
  },
})
</script>
