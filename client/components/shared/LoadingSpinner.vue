<template>
  <div class="loading-container">
    <div class="spinner"></div>
    <p>{{ message }}</p>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'LoadingSpinner',
  props: {
    message: {
      type: String,
      default: '正在同步数据...',
    },
  },
})
</script>
