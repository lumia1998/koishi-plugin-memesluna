import { ref } from 'vue'
import { sendMemesLuna } from './rpc'
import type { AnnotationStatus } from '../../src/console-rpc'

export function useAnnotationStatus(showToast: (message: string, type: 'success' | 'error' | 'info') => void) {
  const annotationStatus = ref<AnnotationStatus | null>(null)
  const annotationStatusBusy = ref(false)
  async function refreshAnnotationStatus() {
    try { annotationStatus.value = await sendMemesLuna('memesluna/getAnnotationStatus') }
    catch (error) { showToast((error as Error).message, 'error') }
  }
  async function cancelAnnotationTasks() {
    if (!confirm('取消当前及排队中的 AI 标注任务？已完成的标注会保留。')) return
    annotationStatusBusy.value = true
    try {
      await sendMemesLuna('memesluna/cancelAnnotations')
      await refreshAnnotationStatus()
      showToast('已请求取消标注任务', 'success')
    } catch (error) { showToast((error as Error).message, 'error') }
    finally { annotationStatusBusy.value = false }
  }
  return { annotationStatus, annotationStatusBusy, refreshAnnotationStatus, cancelAnnotationTasks }
}
