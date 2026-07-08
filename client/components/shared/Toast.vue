<template>
      <Transition name="fade">
        <div v-if="toast.show" :class="['toast-banner', toast.type]">
          <svg v-if="toast.type === 'success'" class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <svg v-else-if="toast.type === 'error'" class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <svg v-else class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          <span>{{ toast.message }}</span>
        </div>
      </Transition>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../composables/dashboardContext'

export default defineComponent({
  name: 'MemesLunaToast',
  setup() {
    return useDashboardContext()
  },
})
</script>
