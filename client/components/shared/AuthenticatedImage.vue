<template>
  <img ref="element" :src="objectUrl || undefined" loading="lazy" />
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { adminFetch } from '../../composables/adminFetch'

const props = defineProps<{ src: string }>()
const element = ref<HTMLImageElement>()
const objectUrl = ref('')
let observer: IntersectionObserver | undefined
let controller: AbortController | undefined
let visible = false
let generation = 0

function clear() {
  generation++
  controller?.abort()
  if (objectUrl.value) URL.revokeObjectURL(objectUrl.value)
  objectUrl.value = ''
}

async function load() {
  clear()
  const current = generation
  controller = new AbortController()
  try {
    const response = await adminFetch(props.src, { signal: controller.signal })
    if (!response.ok) throw new Error('图片加载失败')
    const blob = await response.blob()
    if (current === generation) objectUrl.value = URL.createObjectURL(blob)
  } catch {
    // 页面刷新或切换时请求可能被取消，不保留过期的 blob。
  }
}

watch(() => props.src, () => { clear(); if (visible) void load() })
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) {
      visible = true
      observer?.disconnect()
      void load()
    }
  }, { rootMargin: '200px' })
  if (element.value) observer.observe(element.value)
})
onUnmounted(() => { observer?.disconnect(); clear() })
</script>
