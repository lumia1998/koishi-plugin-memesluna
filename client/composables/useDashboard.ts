import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { sendMemesLuna } from './rpc'
import type {
  ConsoleCollectionAccess,
  ConsoleCollectionAccessMode,
  ConsoleCollectionInfo as CollectionInfo,
  ConsoleEndpointInfo as EndpointInfo,
  ConsoleEndpointInput,
  ConsoleSimilarStagedImageGroup as SimilarStagedImageGroup,
  ConsoleStagedImageInfo as StagedImageInfo,
} from '../../src/console-rpc'

const DEFAULT_COLLECTION_ACCESS: ConsoleCollectionAccess = { mode: 'disabled', groups: [] }

function normalizeCollectionAccess(value: unknown): ConsoleCollectionAccess {
  if (!value || typeof value !== 'object') return { ...DEFAULT_COLLECTION_ACCESS }
  const input = value as { mode?: unknown; groups?: unknown }
  if (input.mode !== 'disabled' && input.mode !== 'whitelist' && input.mode !== 'blacklist') {
    return { ...DEFAULT_COLLECTION_ACCESS }
  }
  const groups = Array.isArray(input.groups)
    ? Array.from(new Set(input.groups.filter((group): group is string => typeof group === 'string').map((group) => group.trim()).filter(Boolean)))
    : []
  return { mode: input.mode, groups }
}

function withCollectionAccess(item: CollectionInfo): CollectionInfo {
  return {
    ...item,
    access: normalizeCollectionAccess(item.access),
  }
}

interface SimilarStagedImageGroupView extends SimilarStagedImageGroup {
  label: string
}

interface CollectionPreviewState {
  loading: boolean
  images: string[]
}

interface AssetGalleryItem {
  id: string
  type: 'local' | 'external'
  label: string
  src: string
  value: string
}

interface PreviewRouteRow {
  id: string
  type: 'collection' | 'endpoint'
  typeLabel: string
  name: string
  description: string
  path: string
  fullUrl: string
  previewImages: string[]
}

type MainMenu = 'resources' | 'distribution' | 'staging' | 'settings'
function readSessionOption<T extends string>(key: string, fallback: T, options: readonly T[]): T {
  const value = sessionStorage.getItem(key)
  return options.includes(value as T) ? value as T : fallback
}

export function useDashboard() {
  // Navigation states
  const activeMenu = ref<MainMenu>(readSessionOption('memesluna_active_menu', 'resources', ['resources', 'distribution', 'staging', 'settings']))

  const loading = ref(true)

  // Core state data
  const backendPath = ref('/memesluna')
  const baseUrl = ref('http://localhost:5140')
  const endpoints = ref<EndpointInfo[]>([])
  const collections = ref<CollectionInfo[]>([])
  const stagedImages = ref<StagedImageInfo[]>([])
  const stagingSearch = ref('')
  const stagingTargetCollection = ref<Record<string, string>>({})
  const stagingBusyId = ref('')
  const stagingViewMode = ref<'all' | 'similar'>('all')
  const similarGroups = ref<SimilarStagedImageGroup[]>([])
  const similarLoading = ref(false)
  const similarMessage = ref('')
  const selectedStagedIds = ref<Set<string>>(new Set())

  // Endpoint Forms reactivity
  const showEndpointEditor = ref(false)
  const editingEndpoint = ref<EndpointInfo | null>(null)
  const endpointForm = reactive<ConsoleEndpointInput>({
    name: '',
    group: '',
    description: '',
    url: '',
  })
  const failedEndpointPreviewIds = ref<Set<string>>(new Set())

  // Collection router states
  const newCollectionName = ref('')
  const currentCollection = ref<CollectionInfo | null>(null)
  const collectionSearchQuery = ref('')
  const collectionFilter = ref<'all' | 'local' | 'external'>('all')
  const activeCollectionMenu = ref<string | null>(null)
  const newDescription = ref('')
  const accessForm = reactive({
    mode: 'disabled' as ConsoleCollectionAccessMode,
    groupsText: '',
  })
  const accessSaving = ref(false)
  const externalLinksText = ref('')
  const detailResources = reactive({
    images: [] as string[],
    links: [] as string[]
  })
  const collectionPreviews = reactive<Record<string, CollectionPreviewState>>({})
  const currentGalleryTab = ref<'all' | 'local' | 'external'>('all')
  const showImportLinks = ref(false)
  const selectedImageSet = ref<Set<string>>(new Set())
  const bulkMoveTarget = ref('')
  const gallerySearch = ref('')
  const gallerySort = ref<'name' | 'nameDesc'>('name')
  const galleryFilter = ref<'all' | 'selected'>('all')
  const galleryViewMode = ref<'grid' | 'list'>('grid')
  const apiPreviewUrl = ref('')
  const apiPreviewLoading = ref(false)

  // Tag and Metadata editor state
  const tagEditorVisible = ref(false)
  const tagEditorImage = ref('')
  const tagEditorCollection = ref('')
  const tagEditorTags = ref<string[]>([])
  const tagEditorAliases = ref<string[]>([])
  const tagEditorInput = ref('')
  const aliasEditorInput = ref('')
  const tagEditorSaving = ref(false)
  const aiAnnotating = ref(false)
  const imageTagsCache = ref<Record<string, string[]>>({})
  const imageAliasesCache = ref<Record<string, string[]>>({})

  // Bulk Tag and Metadata editor state
  const bulkTagEditorVisible = ref(false)
  const bulkTagEditorTags = ref<string[]>([])
  const bulkTagEditorAliases = ref<string[]>([])
  const bulkTagEditorInput = ref('')
  const bulkAliasEditorInput = ref('')
  const bulkTagEditorSaving = ref(false)
  const bulkTagOperationMode = ref<'add' | 'replace'>('add')

  function openBulkTagEditor() {
    bulkTagEditorTags.value = []
    bulkTagEditorAliases.value = []
    bulkTagEditorInput.value = ''
    bulkAliasEditorInput.value = ''
    bulkTagOperationMode.value = 'add'
    bulkTagEditorVisible.value = true
  }

  function addTagToBulkEditor() {
    const tag = bulkTagEditorInput.value.trim()
    if (!tag) return
    if (bulkTagEditorTags.value.includes(tag)) return
    bulkTagEditorTags.value = [...bulkTagEditorTags.value, tag]
    bulkTagEditorInput.value = ''
  }

  function removeTagFromBulkEditor(tag: string) {
    bulkTagEditorTags.value = bulkTagEditorTags.value.filter(t => t !== tag)
  }

  function addAliasToBulkEditor() {
    const alias = bulkAliasEditorInput.value.trim()
    if (!alias || bulkTagEditorAliases.value.includes(alias)) return
    bulkTagEditorAliases.value = [...bulkTagEditorAliases.value, alias]
    bulkAliasEditorInput.value = ''
  }

  function removeAliasFromBulkEditor(alias: string) {
    bulkTagEditorAliases.value = bulkTagEditorAliases.value.filter(a => a !== alias)
  }

  async function saveBulkTagEditor() {
    if (!currentCollection.value || !selectedImages.value.length) return
    bulkTagEditorSaving.value = true

    const filenames = [...selectedImages.value]
    const collectionName = currentCollection.value.name

    try {
      await Promise.all(filenames.map(async (filename) => {
        const key = getImageCacheKey(collectionName, filename)
        let finalTags = [...bulkTagEditorTags.value]
        let finalAliases = [...bulkTagEditorAliases.value]

        if (bulkTagOperationMode.value === 'add') {
          const existingTags = imageTagsCache.value[key] || []
          const existingAliases = imageAliasesCache.value[key] || []
          finalTags = Array.from(new Set([...existingTags, ...finalTags]))
        finalAliases = Array.from(new Set([...existingAliases, ...finalAliases]))
      }

      await sendMemesLuna('memesluna/updateImageMetadata', {
          collectionName,
          filename,
          tags: finalTags,
          aliases: finalAliases,
        })

        // Update cache
        imageTagsCache.value[key] = finalTags
        imageAliasesCache.value[key] = finalAliases
      }))

      showToast(`成功应用批量修改（共 ${filenames.length} 张图片）`, 'success')
      clearSelectedImages()
      bulkTagEditorVisible.value = false
    } catch (err) {
      console.error('Failed to save bulk tags:', err)
      showToast('批量设置标签失败', 'error')
    } finally {
      bulkTagEditorSaving.value = false
    }
  }

  function getImageCacheKey(collection: string, filename: string): string {
    return `${collection}/${filename}`
  }

  function getImageTags(filename: string): string[] {
    if (!currentCollection.value) return []
    return imageTagsCache.value[getImageCacheKey(currentCollection.value.name, filename)] || []
  }

  function getVisibleImageTags(filename: string): string[] {
    return getImageTags(filename).slice(0, 6)
  }

  function getHiddenImageTagsCount(filename: string): number {
    return Math.max(0, getImageTags(filename).length - getVisibleImageTags(filename).length)
  }

  async function loadImageTagsBatch(collection: string, filenames: string[]) {
    const results = await Promise.allSettled(
      filenames.map((fn) => sendMemesLuna('memesluna/getImageMetadata', collection, fn))
    )
    for (let i = 0; i < filenames.length; i++) {
      const result = results[i]
      if (result.status === 'fulfilled' && result.value?.ok) {
        const key = getImageCacheKey(collection, filenames[i])
        imageTagsCache.value[key] = result.value.tags || []
        imageAliasesCache.value[key] = result.value.aliases || []
      }
    }
  }

  const TAG_PALETTE_LIGHT = ['#f97316','#ec4899','#8b5cf6','#06b6d4','#22c55e','#eab308','#f43f5e','#14b8a6','#a855f7','#3b82f6']
  // Brighter palette for dark backgrounds to keep badge text readable
  const TAG_PALETTE_DARK = ['#fb923c','#f472b6','#a78bfa','#22d3ee','#4ade80','#facc15','#fb7185','#2dd4bf','#c084fc','#60a5fa']

  function isDarkThemeActive(): boolean {
    if (typeof document === 'undefined') return false
    const root = document.documentElement
    const body = document.body
    if (root.classList.contains('dark') || body.classList.contains('dark')) return true
    if (root.getAttribute('data-theme') === 'dark') return true
    return !!document.querySelector('.theme-root.dark')
  }

  function tagColor(tag: string): string {
    const palette = isDarkThemeActive() ? TAG_PALETTE_DARK : TAG_PALETTE_LIGHT
    let hash = 0
    for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash) + tag.charCodeAt(i)
    return palette[Math.abs(hash) % palette.length]
  }

  async function openTagEditor(collection: string, filename: string) {
    tagEditorCollection.value = collection
    tagEditorImage.value = filename
    tagEditorInput.value = ''
    aliasEditorInput.value = ''
    aiAnnotating.value = false
    try {
      const result = await sendMemesLuna('memesluna/getImageMetadata', collection, filename)
      tagEditorTags.value = result?.ok ? (result.tags || []) : []
      tagEditorAliases.value = result?.ok ? (result.aliases || []) : []
    } catch {
      tagEditorTags.value = []
      tagEditorAliases.value = []
    }
    tagEditorVisible.value = true
  }

  async function addTagFromEditor() {
    const tag = tagEditorInput.value.trim()
    if (!tag) return
    if (tagEditorTags.value.includes(tag)) return
    tagEditorTags.value = [...tagEditorTags.value, tag]
    tagEditorInput.value = ''
    await saveTagEditor()
  }

  function removeTagFromEditor(tag: string) {
    tagEditorTags.value = tagEditorTags.value.filter((t) => t !== tag)
    saveTagEditor()
  }

  async function addAliasFromEditor() {
    const alias = aliasEditorInput.value.trim()
    if (!alias || tagEditorAliases.value.includes(alias)) return
    tagEditorAliases.value = [...tagEditorAliases.value, alias]
    aliasEditorInput.value = ''
    await saveTagEditor()
  }

  function removeAliasFromEditor(alias: string) {
    tagEditorAliases.value = tagEditorAliases.value.filter((a) => a !== alias)
    saveTagEditor()
  }

  async function triggerAIAnnotation() {
    if (aiAnnotating.value || tagEditorSaving.value) return
    aiAnnotating.value = true
    try {
      const result = await sendMemesLuna('memesluna/annotateImage', tagEditorCollection.value, tagEditorImage.value)
      if (result && result.ok) {
        tagEditorTags.value = result.tags || []
        tagEditorAliases.value = result.aliases || []
        const key = getImageCacheKey(tagEditorCollection.value, tagEditorImage.value)
        imageTagsCache.value[key] = [...tagEditorTags.value]
        imageAliasesCache.value[key] = [...tagEditorAliases.value]
        showToast('AI 语义标注已成功完成！', 'success')
      } else {
        showToast(result?.error || 'AI 标注失败，请检查配置或模型状态', 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'AI 标注接口请求出错', 'error')
    } finally {
      aiAnnotating.value = false
    }
  }

  async function saveTagEditor() {
    tagEditorSaving.value = true
    try {
      await sendMemesLuna('memesluna/updateImageMetadata', {
        collectionName: tagEditorCollection.value,
        filename: tagEditorImage.value,
        tags: tagEditorTags.value,
        aliases: tagEditorAliases.value,
      })
      const key = getImageCacheKey(tagEditorCollection.value, tagEditorImage.value)
      imageTagsCache.value[key] = [...tagEditorTags.value]
      imageTagsCache.value = { ...imageTagsCache.value }
      imageAliasesCache.value[key] = [...tagEditorAliases.value]
      imageAliasesCache.value = { ...imageAliasesCache.value }
    } catch (err) {
      console.error('Failed to save tags:', err)
    } finally {
      tagEditorSaving.value = false
    }
  }

  function closeTagEditor() {
    tagEditorVisible.value = false
    tagEditorImage.value = ''
    tagEditorTags.value = []
    tagEditorAliases.value = []
    aiAnnotating.value = false
  }

  const activeMoveDropdown = ref<string | null>(null)
  const activeCardMenu = ref<string | null>(null)

  function toggleMoveDropdown(img: string) {
    if (activeMoveDropdown.value === img) {
      activeMoveDropdown.value = null
    } else {
      activeMoveDropdown.value = img
    }
  }

  function toggleCardMenu(img: string) {
    if (activeCardMenu.value === img) {
      activeCardMenu.value = null
    } else {
      activeCardMenu.value = img
    }
  }

  function closeCardMenu() {
    activeCardMenu.value = null
  }

  function isImageSelected(img: string): boolean {
    return selectedImageSet.value.has(img)
  }

  function toggleImageSelection(img: string) {
    const next = new Set(selectedImageSet.value)
    if (next.has(img)) {
      next.delete(img)
    } else {
      next.add(img)
    }
    selectedImageSet.value = next
  }

  function clearSelectedImages() {
    selectedImageSet.value = new Set()
    bulkMoveTarget.value = ''
  }

  function toggleSelectCurrentPage() {
    const next = new Set(selectedImageSet.value)
    const localItems = paginatedGalleryItems.value.filter((item) => item.type === 'local')
    if (areAllCurrentPageImagesSelected.value) {
      localItems.forEach((item) => next.delete(item.value))
    } else {
      localItems.forEach((item) => next.add(item.value))
    }
    selectedImageSet.value = next
  }

  function handleGalleryItemClick(item: AssetGalleryItem) {
    if (item.type === 'local' && selectedImages.value.length) {
      toggleImageSelection(item.value)
      return
    }
    openImage(item.src)
  }

  // Pagination reactivity for Images gallery
  const currentPage = ref(1)
  const pageSize = ref(24)
  const galleryItems = computed<AssetGalleryItem[]>(() => {
    if (!currentCollection.value) return []

    const localItems = detailResources.images.map((filename) => ({
      id: `local:${filename}`,
      type: 'local' as const,
      label: filename,
      src: getLocalImageApiUrl(currentCollection.value.name, filename),
      value: filename
    }))
    const externalItems = detailResources.links.map((link) => ({
      id: `external:${link}`,
      type: 'external' as const,
      label: getExternalLinkLabel(link),
      src: link,
      value: link
    }))

    if (currentGalleryTab.value === 'local') return localItems
    if (currentGalleryTab.value === 'external') return externalItems
    return [...localItems, ...externalItems]
  })
  const filteredGalleryItems = computed(() => {
    const query = gallerySearch.value.trim().toLowerCase()
    let items = galleryItems.value.filter((item) => {
      if (!query) return true
      return item.label.toLowerCase().includes(query) || item.value.toLowerCase().includes(query)
    })
    if (galleryFilter.value === 'selected') {
      items = items.filter((item) => item.type === 'local' && selectedImageSet.value.has(item.value))
    }
    return [...items].sort((a, b) => gallerySort.value === 'nameDesc'
      ? b.label.localeCompare(a.label)
      : a.label.localeCompare(b.label))
  })
  const totalPages = computed(() => {
    return Math.max(1, Math.ceil(filteredGalleryItems.value.length / pageSize.value))
  })
  const paginatedGalleryItems = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value
    return filteredGalleryItems.value.slice(start, start + pageSize.value)
  })
  const selectedImages = computed(() => Array.from(selectedImageSet.value))
  const areAllCurrentPageImagesSelected = computed(() => {
    const localItems = paginatedGalleryItems.value.filter((item) => item.type === 'local')
    return localItems.length > 0 && localItems.every((item) => selectedImageSet.value.has(item.value))
  })
  const currentCollectionCoverUrl = computed(() => {
    if (!currentCollection.value) return ''
    const local = detailResources.images[0]
    if (local) return getLocalImageApiUrl(currentCollection.value.name, local)
    return detailResources.links[0] || ''
  })
  const currentCollectionApiUrl = computed(() => {
    return currentCollection.value ? getBaseRedirectUrl(currentCollection.value.name) : ''
  })
  const currentCollectionTotalCount = computed(() => {
    return currentCollection.value?.totalCount || detailResources.images.length + detailResources.links.length
  })
  const currentCollectionAccessLabel = computed(() => {
    const mode = currentCollection.value?.access?.mode || accessForm.mode
    if (mode === 'whitelist') return '白名单'
    if (mode === 'blacklist') return '黑名单'
    return '不限制'
  })
  const endpointPreviewUrl = computed(() => {
    const name = endpointForm.name.trim()
    return name ? getBaseRedirectUrl(name) : ''
  })
  const previewRouteRows = computed<PreviewRouteRow[]>(() => {
    const collectionRows = collections.value
      .filter((item) => item.hasContent)
      .map((item) => ({
        id: `collection:${item.name}`,
        type: 'collection' as const,
        typeLabel: '表情包',
        name: item.name,
        description: item.description || `${item.name} 表情包`,
        path: getRouteDisplayPath(item.name),
        fullUrl: getBaseRedirectUrl(item.name),
        previewImages: getCollectionPreviewImages(item.name).slice(0, 3)
      }))

    const endpointRows = endpoints.value.map((item) => {
      const fullUrl = getBaseRedirectUrl(item.name)
      const previewImages = failedEndpointPreviewIds.value.has(`endpoint:${item.name}`) ? [] : [fullUrl]
      return {
        id: `endpoint:${item.name}`,
        type: 'endpoint' as const,
        typeLabel: '重定向',
        name: item.name,
        description: item.description || '302 重定向',
        path: getRouteDisplayPath(item.name),
        fullUrl,
        previewImages,
      }
    })

    return [...collectionRows, ...endpointRows]
  })
  const filteredCollections = computed(() => {
    const query = collectionSearchQuery.value.trim().toLowerCase()
    return collections.value.filter((item) => {
      const matchesQuery = !query
        || item.name.toLowerCase().includes(query)
        || (item.description || '').toLowerCase().includes(query)
      const matchesFilter = collectionFilter.value === 'all'
        || (collectionFilter.value === 'local' && item.localCount > 0 && item.linkCount === 0)
        || (collectionFilter.value === 'external' && item.linkCount > 0)
      return matchesQuery && matchesFilter
    })
  })

  const filteredStagedImages = computed(() => {
    const query = stagingSearch.value.trim().toLowerCase()
    if (!query) return stagedImages.value
    return stagedImages.value.filter((item) => {
      return item.filename.toLowerCase().includes(query)
        || item.originalName.toLowerCase().includes(query)
        || item.source.toLowerCase().includes(query)
        || item.reason.toLowerCase().includes(query)
    })
  })
  const filteredSimilarGroups = computed<SimilarStagedImageGroupView[]>(() => {
    const visibleIds = new Set(filteredStagedImages.value.map((item) => item.id))
    return similarGroups.value
      .map((group, index) => ({
        ...group,
        label: String(index + 1),
        items: group.items.filter((item) => visibleIds.has(item.id)),
      }))
      .filter((group) => group.items.length > 1)
  })

  const similarStagedImages = computed(() => {
    const map = new Map<string, StagedImageInfo>()
    for (const group of filteredSimilarGroups.value) {
      for (const item of group.items) map.set(item.id, item)
    }
    return Array.from(map.values())
  })

  const selectedStagedImages = computed(() => Array.from(selectedStagedIds.value))
  const areAllCurrentPageStagedSelected = computed(() => {
    const items = filteredStagedImages.value
    return items.length > 0 && items.every((item) => selectedStagedIds.value.has(item.id))
  })

  function isStagedSelected(id: string): boolean {
    return selectedStagedIds.value.has(id)
  }

  function toggleStagedSelection(id: string) {
    const next = new Set(selectedStagedIds.value)
    if (next.has(id)) {
      next.delete(id)
    } else {
      next.add(id)
    }
    selectedStagedIds.value = next
  }

  function toggleSelectAllStaged() {
    const next = new Set(selectedStagedIds.value)
    if (areAllCurrentPageStagedSelected.value) {
      filteredStagedImages.value.forEach((item) => next.delete(item.id))
    } else {
      filteredStagedImages.value.forEach((item) => next.add(item.id))
    }
    selectedStagedIds.value = next
  }

  function clearSelectedStaged() {
    selectedStagedIds.value = new Set()
  }

  async function batchDeleteStagedImages() {
    const ids = selectedStagedImages.value
    if (!ids.length) return
    if (!confirm(`确认永久删除已选择的 ${ids.length} 张暂缓图片吗？此操作无法恢复！`)) return

    try {
      loading.value = true
      await Promise.all(ids.map((id) => sendMemesLuna('memesluna/deleteStagedImage', id)))
      showToast(`已删除 ${ids.length} 张暂缓图片`, 'success')
      clearSelectedStaged()
      await refreshStagedImages()
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '批量删除暂缓图片失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function confirmDeleteAllStagedImages() {
    if (!stagedImages.value.length) return
    if (!confirm(`⚠️ 危险操作：确认永久删除暂缓区全部 ${stagedImages.value.length} 张图片吗？此操作不可逆！`)) return

    try {
      loading.value = true
      const deleted = await sendMemesLuna('memesluna/deleteAllStagedImages')
      showToast(`已清空暂缓区，共删除 ${deleted} 张图片`, 'success')
      clearSelectedStaged()
      await refreshStagedImages()
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '清空暂缓区失败', 'error')
    } finally {
      loading.value = false
    }
  }

  // Settings preview values from backend
  const routeInventoryText = ref('')
  const llmPromptPreview = ref('')

  // Drag and drop states
  const dragOver = ref(false)
  const fileInput = ref<HTMLInputElement | null>(null)

  // Toast Alert banner state
  const toast = reactive({
    show: false,
    message: '',
    type: 'info' as 'info' | 'success' | 'error'
  })
  let toastTimer: ReturnType<typeof setTimeout> | null = null

  function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
    if (toastTimer) clearTimeout(toastTimer)
    toast.message = message
    toast.type = type
    toast.show = true
    toastTimer = setTimeout(() => {
      toast.show = false
    }, 2500)
  }

  // Switches horizontal Notion view switcher
  function switchMainMenu(menu: MainMenu) {
    activeMenu.value = menu
    sessionStorage.setItem('memesluna_active_menu', menu)
    if (menu === 'settings') {
      fetchSettingsPreview()
    }
    if (menu === 'staging') {
      refreshStagedImages()
    } else {
      clearSelectedStaged()
    }
  }

  function getBackendBaseUrl(): string {
    const cleanBase = baseUrl.value.endsWith('/') ? baseUrl.value.slice(0, -1) : baseUrl.value
    const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
    const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
    return `${cleanBase}${formattedPath}`
  }

  // Formatting server redirect and resource APIs URLs
  function getRouteDisplayPath(suffix: string): string {
    const cleanPath = backendPath.value.endsWith('/') ? backendPath.value.slice(0, -1) : backendPath.value
    return `${cleanPath}/${encodeURIComponent(suffix)}`
  }

  function getBaseRedirectUrl(suffix: string): string {
    return `${getBackendBaseUrl()}/${encodeURIComponent(suffix)}`
  }

  function getLocalImageApiUrl(collection: string, filename: string): string {
    return `${getBackendBaseUrl()}/api/admin/collections/${encodeURIComponent(collection)}/images/${encodeURIComponent(filename)}`
  }

  function getStagedImageUrl(id: string): string {
    return `${getBackendBaseUrl()}/api/admin/staged-images/${encodeURIComponent(id)}`
  }

  function handlePreviewImageError(row: PreviewRouteRow) {
    if (row.type !== 'endpoint') return
    const next = new Set(failedEndpointPreviewIds.value)
    next.add(row.id)
    failedEndpointPreviewIds.value = next
  }

  function formatDate(value?: string | Date): string {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
  }

  function formatPercent(value: number): string {
    if (!Number.isFinite(value)) return '-'
    return String(Math.round(value * 100)) + '%'
  }

  function formatSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '-'
    const units = ['B', 'KB', 'MB', 'GB']
    let value = bytes
    let unitIndex = 0
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024
      unitIndex++
    }
    return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`
  }

  function getImageExtension(filename: string): string {
    const ext = filename.split('.').pop()
    return ext ? ext.toUpperCase() : 'IMG'
  }

  function getExternalLinkLabel(link: string): string {
    try {
      const url = new URL(link)
      const filename = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname)
      return filename || url.hostname
    } catch {
      return link
    }
  }

  function getCollectionPreviewState(name: string): CollectionPreviewState | undefined {
    return collectionPreviews[name]
  }

  function getCollectionPreviewImages(name: string): string[] {
    return collectionPreviews[name]?.images || []
  }

  function getCollectionCardPreviewImages(name: string): string[] {
    return getCollectionPreviewImages(name).slice(0, 6)
  }

  function getCollectionPreviewCountClass(name: string): string {
    const count = Math.min(getCollectionPreviewImages(name).length, 9)
    return count ? `preview-count-${count}` : 'preview-count-0'
  }

  async function loadCollectionPreview(collection: CollectionInfo) {
    if (!collection.hasContent || collectionPreviews[collection.name]?.images.length) return
    collectionPreviews[collection.name] = collectionPreviews[collection.name] || { loading: true, images: [] }
    collectionPreviews[collection.name].loading = true

    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/collections/${encodeURIComponent(collection.name)}/resources`)
      if (!response.ok) return

      const data = await response.json()
      const previewLimit = 9
      const localImages = Array.isArray(data.images)
        ? data.images.slice(0, previewLimit).map((filename: string) => getLocalImageApiUrl(collection.name, filename))
        : []
      const externalImages = Array.isArray(data.links) ? data.links.slice(0, previewLimit - localImages.length) : []

      collectionPreviews[collection.name].images = [...localImages, ...externalImages]
    } catch {
      collectionPreviews[collection.name].images = []
    } finally {
      collectionPreviews[collection.name].loading = false
    }
  }

  function warmCollectionPreviews() {
    collections.value
      .filter((item) => item.hasContent)
      .slice(0, 24)
      .forEach((item) => {
        void loadCollectionPreview(item)
      })
  }

  function syncAccessForm(access?: ConsoleCollectionAccess | null) {
    const normalized = normalizeCollectionAccess(access)
    accessForm.mode = normalized.mode
    accessForm.groupsText = normalized.groups.join('\n')
  }

  function parseAccessGroupsText(text: string): string[] {
    return Array.from(new Set(
      text
        .split(/\r?\n/g)
        .map((line) => line.trim())
        .filter(Boolean),
    ))
  }

  async function loadCollectionAccess(name: string) {
    try {
      const access = await sendMemesLuna('memesluna/getCollectionAccess', name)
      syncAccessForm(access)
      if (currentCollection.value?.name === name) {
        currentCollection.value = {
          ...currentCollection.value,
          access: normalizeCollectionAccess(access),
        }
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '加载访问策略失败', 'error')
    }
  }

  async function saveCollectionAccess() {
    if (!currentCollection.value) return
    const access: ConsoleCollectionAccess = {
      mode: accessForm.mode,
      groups: parseAccessGroupsText(accessForm.groupsText),
    }

    try {
      accessSaving.value = true
      const ok = await sendMemesLuna('memesluna/setCollectionAccess', currentCollection.value.name, access)
      if (!ok) {
        showToast('保存访问策略失败：合集不存在', 'error')
        return
      }
      showToast('访问策略已保存', 'success')
      await fetchState()
      const match = collections.value.find((c) => c.name === currentCollection.value?.name)
      if (match) {
        currentCollection.value = match
        syncAccessForm(match.access)
      } else {
        syncAccessForm(access)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存访问策略失败', 'error')
    } finally {
      accessSaving.value = false
    }
  }

  // Fetch variables from Koishi app
  async function fetchState() {
    try {
      // WebUI 始终运行在 Koishi 内嵌服务器上，直接用 window.location.origin 作为 baseUrl
      // selfUrl 是机器人发图用的公网地址，不能用于 WebUI 的 HTTP 接口请求
      baseUrl.value = window.location.origin

      const state = await sendMemesLuna('memesluna/getState')
      if (state) {
        if (state.backendPath) backendPath.value = state.backendPath
        endpoints.value = Array.isArray(state.endpoints) ? state.endpoints : []
        collections.value = Array.isArray(state.collections)
          ? state.collections.map((item) => withCollectionAccess(item))
          : []
        stagedImages.value = Array.isArray(state.stagedImages) ? state.stagedImages : []
        if (currentCollection.value) {
          const match = collections.value.find((c) => c.name === currentCollection.value?.name)
          if (match) currentCollection.value = match
        }
        warmCollectionPreviews()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '获取插件状态同步失败', 'error')
    }
  }

  async function fetchSettingsPreview() {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/homepage-data`)
      if (response.ok) {
        const data = await response.json()
        routeInventoryText.value = data.routeInventory || ''
        llmPromptPreview.value = data.llmPrompt || ''
      }
    } catch (err) {
      console.error('Failed to sync settings variables preview:', err)
    }
  }

  async function refreshStagedImages() {
    try {
      const list = await sendMemesLuna('memesluna/getStagedImages')
      stagedImages.value = Array.isArray(list) ? list : []
      if (stagingViewMode.value === 'similar') {
        await loadSimilarStagedImages()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '刷新暂缓区失败', 'error')
    }
  }
  async function loadSimilarStagedImages() {
    similarLoading.value = true
    try {
      const result = await sendMemesLuna('memesluna/getSimilarStagedImages')
      similarGroups.value = Array.isArray(result?.groups) ? result.groups : []
      similarMessage.value = result?.message || ''
      if (result && result.available === false) {
        showToast(result.message || '相似图片筛选不可用', 'error')
      }
    } catch (err) {
      similarGroups.value = []
      similarMessage.value = ''
      showToast(err instanceof Error ? err.message : '筛选相似图片失败', 'error')
    } finally {
      similarLoading.value = false
    }
  }

  async function toggleSimilarStagingMode() {
    if (stagingViewMode.value === 'similar') {
      stagingViewMode.value = 'all'
      return
    }
    stagingViewMode.value = 'similar'
    await loadSimilarStagedImages()
  }

  async function promoteStagedImage(item: StagedImageInfo, targetCollection?: string) {
    const target = (targetCollection || stagingTargetCollection.value[item.id] || '').trim()
    if (!target) {
      showToast('请选择目标表情包', 'error')
      return
    }
    stagingBusyId.value = item.id
    try {
      const filename = await sendMemesLuna('memesluna/promoteStagedImage', item.id, target)
      if (filename) {
        showToast(`已归档到表情包 "${target}"，新文件名 ${filename}`, 'success')
        delete stagingTargetCollection.value[item.id]
        selectedStagedIds.value = new Set([...selectedStagedIds.value].filter((id) => id !== item.id))
      } else {
        showToast('暂缓图片不存在或已被处理', 'error')
      }
      await refreshStagedImages()
      await fetchState()
      if (currentCollection.value?.name === target) {
        await loadCollectionResources(target)
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '归档暂缓图片失败', 'error')
    } finally {
      stagingBusyId.value = ''
    }
  }

  async function deleteStagedImage(item: StagedImageInfo) {
    if (!confirm(`确认从暂缓区删除 "${item.originalName || item.filename}" 吗？`)) return

    stagingBusyId.value = item.id
    try {
      const deleted = await sendMemesLuna('memesluna/deleteStagedImage', item.id)
      if (deleted) {
        showToast('已从暂缓区删除', 'success')
        delete stagingTargetCollection.value[item.id]
      } else {
        showToast('暂缓图片不存在或已被处理', 'error')
      }
      await refreshStagedImages()
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除暂缓图片失败', 'error')
    } finally {
      stagingBusyId.value = ''
    }
  }

  async function stageFilteredFiles(items: Array<{ file: File; reason: string }>): Promise<number> {
    let saved = 0
    for (const item of items) {
      try {
        const base64 = await fileToBase64(item.file)
        await sendMemesLuna('memesluna/addStagedImage', {
          base64,
          originalName: item.file.name,
          source: currentCollection.value ? `upload:${currentCollection.value.name}` : 'upload-filter',
          reason: item.reason,
        })
        saved++
      } catch (err) {
        console.error('Failed to stage filtered image:', item.file.name, err)
      }
    }
    if (saved) {
      await refreshStagedImages()
    }
    return saved
  }

  // Actions: Endpoints
  function openEndpointEditor() {
    resetEndpointForm()
    showEndpointEditor.value = true
  }

  function closeEndpointEditor() {
    resetEndpointForm()
    showEndpointEditor.value = false
  }

  function resetEndpointForm() {
    editingEndpoint.value = null
    endpointForm.name = ''
    endpointForm.group = ''
    endpointForm.description = ''
    endpointForm.url = ''
  }

  function editEndpoint(item: EndpointInfo) {
    editingEndpoint.value = item
    showEndpointEditor.value = true
    endpointForm.name = item.name || ''
    endpointForm.group = item.group || ''
    endpointForm.description = item.description || ''
    endpointForm.url = item.url || ''
  }

  async function saveEndpoint() {
    const name = endpointForm.name.trim()
    const url = endpointForm.url.trim()

    if (!name || !url) {
      showToast('端点名称和目标直链 URL 均必填', 'error')
      return
    }

    const payload: ConsoleEndpointInput = {
      name,
      group: endpointForm.group.trim() || '默认分组',
      description: endpointForm.description.trim(),
      url,
      method: 'redirect' as const,
    }

    try {
      loading.value = true
      if (editingEndpoint.value) {
        await sendMemesLuna('memesluna/updateEndpoint', editingEndpoint.value.name, payload)
        showToast('端点路由参数已成功更新', 'success')
      } else {
        await sendMemesLuna('memesluna/createEndpoint', payload)
        showToast('接口端点已成功创建', 'success')
      }
      await fetchState()
      resetEndpointForm()
      showEndpointEditor.value = false
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存端点失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function deleteEndpoint(name: string) {
    if (!confirm(`确认删除端点路由 "${name}" 吗？`)) return

    try {
      loading.value = true
      await sendMemesLuna('memesluna/deleteEndpoint', name)
      showToast('该分发端点已彻底删除', 'success')
      await fetchState()
      if (editingEndpoint.value && editingEndpoint.value.name === name) {
        resetEndpointForm()
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除端点路由失败', 'error')
    } finally {
      loading.value = false
    }
  }

  // Copy clipboard
  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      showToast('成功复制链接到剪贴板', 'success')
    } catch (err) {
      showToast('复制失败', 'error')
    }
  }

  // Actions: Collections
  async function createCollection() {
    let name = newCollectionName.value.trim()
    if (!name) {
      name = window.prompt('请输入表情包名称')?.trim() || ''
    }
    if (!name) {
      showToast('表情包名称不能为空', 'error')
      return
    }

    try {
      loading.value = true
      const success = await sendMemesLuna('memesluna/createCollection', name)
      if (!success) {
        showToast('该名称的表情包已存在，请更换其他名称', 'error')
        return
      }
      showToast('表情包已成功创建', 'success')
      newCollectionName.value = ''
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '创建失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function confirmDeleteCollection(name: string) {
    activeCollectionMenu.value = null
    if (!confirm(`⚠️ 危险操作：确认永久且彻底删除表情包 "${name}"，及其包含的所有本地图片文件吗？此项操作不可逆！`)) return

    try {
      loading.value = true
      await sendMemesLuna('memesluna/deleteCollection', name)
      showToast('该表情包资源已彻底销毁删除', 'success')
      currentCollection.value = null
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function enterCollectionDetail(item: CollectionInfo) {
    activeCollectionMenu.value = null
    const normalized = withCollectionAccess(item)
    currentCollection.value = normalized
    sessionStorage.setItem('memesluna_active_collection', item.name)
    newDescription.value = item.description || ''
    syncAccessForm(normalized.access)
    externalLinksText.value = ''
    gallerySearch.value = ''
    gallerySort.value = 'name'
    galleryFilter.value = 'all'
    galleryViewMode.value = 'grid'
    apiPreviewUrl.value = ''
    currentPage.value = 1
    clearSelectedImages()
    await Promise.all([
      loadCollectionResources(item.name),
      loadCollectionAccess(item.name),
    ])
    // Load tags for all images in this collection
    const allFns = [...detailResources.images]
    if (allFns.length) {
      loadImageTagsBatch(item.name, allFns)
    }
  }

  function exitCollectionDetail() {
    currentCollection.value = null
    sessionStorage.removeItem('memesluna_active_collection')
    if (apiPreviewUrl.value) URL.revokeObjectURL(apiPreviewUrl.value)
    apiPreviewUrl.value = ''
    clearSelectedImages()
    syncAccessForm(DEFAULT_COLLECTION_ACCESS)
  }

  async function loadCollectionResources(name: string) {
    try {
      const response = await fetch(`${getBackendBaseUrl()}/api/collections/${encodeURIComponent(name)}/resources`)
      if (response.ok) {
        const data = await response.json()
        detailResources.images = Array.isArray(data.images) ? data.images : []
        detailResources.links = Array.isArray(data.links) ? data.links : []
        const available = new Set(detailResources.images)
        selectedImageSet.value = new Set(selectedImages.value.filter((img) => available.has(img)))
      }
    } catch (err) {
      showToast('加载该表情包下的图片缓存失败', 'error')
    }
  }

  async function refreshCollectionResources() {
    if (!currentCollection.value) return
    loading.value = true
    await loadCollectionResources(currentCollection.value.name)
    await fetchState()
    const match = collections.value.find(c => c.name === currentCollection.value.name)
    if (match) {
      currentCollection.value = match
      syncAccessForm(match.access)
    }
    loading.value = false
    showToast('本地及缓存资源数据已刷新成功', 'success')
  }

  async function testCurrentCollectionApi() {
    if (!currentCollection.value) return

    apiPreviewLoading.value = true
    try {
      const response = await fetch(currentCollectionApiUrl.value, { redirect: 'follow' })
      if (!response.ok) {
        showToast('测试接口未返回可用图片', 'error')
        return
      }

      const blob = await response.blob()
      if (!blob.type.startsWith('image/')) {
        showToast('测试接口返回的不是图片资源', 'error')
        return
      }

      if (apiPreviewUrl.value) URL.revokeObjectURL(apiPreviewUrl.value)
      apiPreviewUrl.value = URL.createObjectURL(blob)
      showToast('已获取随机图片预览', 'success')
      await fetchState()
      const match = collections.value.find(c => c.name === currentCollection.value?.name)
      if (match) currentCollection.value = match
    } catch (err) {
      showToast(err instanceof Error ? err.message : '测试接口失败', 'error')
    } finally {
      apiPreviewLoading.value = false
    }
  }

  async function saveCollectionDescription() {
    if (!currentCollection.value) return

    try {
      loading.value = true
      await sendMemesLuna('memesluna/setCollectionDescription', currentCollection.value.name, newDescription.value.trim())
      showToast('表情包描述已成功保存', 'success')
      await fetchState()
      const match = collections.value.find(c => c.name === currentCollection.value.name)
      if (match) currentCollection.value = match
    } catch (err) {
      showToast(err instanceof Error ? err.message : '保存表情包描述失败', 'error')
    } finally {
      loading.value = false
    }
  }

  // Drag & upload files actions
  function triggerFileInput() {
    if (fileInput.value) fileInput.value.click()
  }

  function onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement
    if (input.files) {
      uploadFiles(input.files)
    }
  }

  function onDrop(e: DragEvent) {
    dragOver.value = false
    if (e.dataTransfer && e.dataTransfer.files) {
      uploadFiles(e.dataTransfer.files)
    }
  }

  async function uploadFiles(files: FileList) {
    if (!currentCollection.value) return

    const maxSize = 10 * 1024 * 1024
    const fileList = Array.from(files)
    const imageFiles = fileList.filter((file) => {
      const name = file.name.toLowerCase()
      return file.type.startsWith('image/') || /\.(jpe?g|png|gif|bmp|webp|svg|tiff?|psd|avif)$/.test(name)
    })

    if (!imageFiles.length) {
      showToast('请拖入或选择有效的图片格式文件', 'error')
      return
    }

    const avifFiles = imageFiles.filter((file) => file.name.toLowerCase().endsWith('.avif'))
    const compatibleImageFiles = imageFiles.filter((file) => !file.name.toLowerCase().endsWith('.avif'))
    const stagingMap = new Map<File, string>()

    for (const file of compatibleImageFiles) {
      if (file.size > maxSize) {
        stagingMap.set(file, '文件大小超过 10MB，需人工复核后再决定是否归档')
      }
    }

    const stagingItems = Array.from(stagingMap, ([file, reason]) => ({ file, reason }))
    const uploadableFiles = compatibleImageFiles.filter((file) => !stagingMap.has(file))

    let stagedCount = 0
    if (stagingItems.length) {
      stagedCount = await stageFilteredFiles(stagingItems)
    }

    if (!uploadableFiles.length) {
      if (stagedCount > 0) {
        const avifHint = avifFiles.length ? `，${avifFiles.length} 张 AVIF 已直接拦截` : ''
        showToast(`已将 ${stagedCount} 张被过滤图片放入暂缓区${avifHint}`, 'success')
      } else if (avifFiles.length) {
        showToast('已拦截 AVIF 图片。此格式不会进入暂缓区，请先转码为 JPG/PNG/GIF/WEBP。', 'error')
      } else {
        showToast('图片已被过滤，但写入暂缓区失败', 'error')
      }
      await fetchState()
      return
    }

    if (uploadableFiles.length > 500) {
      showToast('单次选择图片上限为 500 张，请分批次导入或使用磁盘同步', 'error')
      if (stagedCount) await fetchState()
      return
    }

    showToast(`开始上传 ${uploadableFiles.length} 张表情图片...`, 'info')

    let successCount = 0
    let failedCount = 0

    for (let i = 0; i < uploadableFiles.length; i++) {
      const file = uploadableFiles[i]
      showToast(`正在上传: ${file.name} (${i + 1}/${uploadableFiles.length})...`, 'info')

      try {
        const formData = new FormData()
        formData.append('images', file)

        const response = await fetch(`${getBackendBaseUrl()}/api/admin/collections/${encodeURIComponent(currentCollection.value.name)}/images`, {
          method: 'POST',
          body: formData
        })

        if (response.ok) {
          const resData = await response.json()
          if (resData.ok && resData.uploaded && resData.uploaded.length > 0) {
            successCount++
          } else {
            failedCount++
          }
        } else {
          failedCount++
        }
      } catch (err) {
        failedCount++
      }
    }

    const stagedHint = stagedCount ? `，另有 ${stagedCount} 张进入暂缓区` : ''
    const avifHint = avifFiles.length ? `，${avifFiles.length} 张 AVIF 已直接拦截` : ''

    if (successCount > 0) {
      showToast(`成功上传 ${successCount} 张图片${failedCount ? `，失败 ${failedCount} 张` : ''}${stagedHint}${avifHint}`, 'success')
    } else {
      showToast(`图片上传失败${stagedHint}${avifHint}`, 'error')
    }

    await loadCollectionResources(currentCollection.value.name)
    await fetchState()
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = () => {
        const result = reader.result as string
        const base64Content = result.split(',')[1]
        resolve(base64Content)
      }
      reader.onerror = error => reject(error)
    })
  }

  // Link direct actions
  async function addExternalLinks() {
    if (!currentCollection.value) return
    const text = externalLinksText.value.trim()
    if (!text) {
      showToast('链接文本不能为空', 'error')
      return
    }

    try {
      loading.value = true
      const count = await sendMemesLuna('memesluna/addLinks', currentCollection.value.name, text)
      showToast(`已成功录入 ${count} 条网络图片外链`, 'success')
      externalLinksText.value = ''
      await loadCollectionResources(currentCollection.value.name)
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '添加失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function deleteExternalLink(collectionName: string, link: string) {
    if (!confirm('确认删除该图片网络外链直链吗？')) return

    try {
      loading.value = true
      await sendMemesLuna('memesluna/deleteLink', collectionName, link)
      showToast('外链直链已彻底删除', 'success')
      await loadCollectionResources(collectionName)
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除链接失败', 'error')
    } finally {
      loading.value = false
    }
  }

  // Local image delete/move action
  async function confirmDeleteImage(collectionName: string, filename: string) {
    if (!confirm(`确认永久删除该本地图片素材 "${filename}" 吗？此操作无法恢复！`)) return

    try {
      loading.value = true
      await sendMemesLuna('memesluna/deleteLocalImage', collectionName, filename)
      showToast('该本地图片已永久删除', 'success')
      await loadCollectionResources(collectionName)
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '删除失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function deleteSelectedImages() {
    if (!currentCollection.value || !selectedImages.value.length) return
    const names = selectedImages.value
    if (!confirm(`确认永久删除已选择的 ${names.length} 张本地图片素材吗？此操作无法恢复！`)) return

    try {
      loading.value = true
      await Promise.all(names.map((filename) => sendMemesLuna('memesluna/deleteLocalImage', currentCollection.value!.name, filename)))
      showToast(`已删除 ${names.length} 张本地图片`, 'success')
      clearSelectedImages()
      await loadCollectionResources(currentCollection.value.name)
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '批量删除失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function moveImage(source: string, target: string, filename: string) {
    try {
      loading.value = true
      const newFilename = await sendMemesLuna('memesluna/moveLocalImage', source, target, filename)
      if (newFilename) {
        showToast(`已将素材移动至表情包 "${target}" 并重命名`, 'success')
        await loadCollectionResources(source)
        await fetchState()
      } else {
        showToast('移动失败', 'error')
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : '移库失败', 'error')
    } finally {
      loading.value = false
    }
  }

  async function moveSelectedImages() {
    if (!currentCollection.value || !selectedImages.value.length || !bulkMoveTarget.value) return
    const source = currentCollection.value.name
    const target = bulkMoveTarget.value
    if (target === source) {
      showToast('不能移动到当前表情包', 'error')
      return
    }

    const names = selectedImages.value
    try {
      loading.value = true
      await Promise.all(names.map((filename) => sendMemesLuna('memesluna/moveLocalImage', source, target, filename)))
      showToast(`已将 ${names.length} 张素材移动至表情包 "${target}"`, 'success')
      clearSelectedImages()
      await loadCollectionResources(source)
      await fetchState()
    } catch (err) {
      showToast(err instanceof Error ? err.message : '批量移动失败', 'error')
    } finally {
      loading.value = false
    }
  }

  function openImage(url: string) {
    window.open(url, '_blank')
  }

  function toggleCollectionMenu(name: string) {
    activeCollectionMenu.value = activeCollectionMenu.value === name ? null : name
  }

  const closeDropdowns = () => {
    activeMoveDropdown.value = null
    activeCollectionMenu.value = null
    activeCardMenu.value = null
  }

  // Lifecycle Hooks
  onMounted(async () => {
    window.addEventListener('click', closeDropdowns)
    loading.value = true
    await fetchState()

    // Restore current collection detail view
    if (activeMenu.value === 'resources') {
      const savedCol = sessionStorage.getItem('memesluna_active_collection')
      if (savedCol) {
        const col = collections.value.find(c => c.name === savedCol)
        if (col) {
          await enterCollectionDetail(col)
        }
      }
    } else if (activeMenu.value === 'staging') {
      await refreshStagedImages()
    } else if (activeMenu.value === 'settings') {
      await fetchSettingsPreview()
    }

    loading.value = false
  })

  onUnmounted(() => {
    window.removeEventListener('click', closeDropdowns)
    if (apiPreviewUrl.value) URL.revokeObjectURL(apiPreviewUrl.value)
  })

  // Listeners/Watchers
  watch(detailResources, () => {
    // Ensure current page does not go out of bounds on resource change
    if (currentPage.value > totalPages.value && totalPages.value > 0) {
      currentPage.value = totalPages.value
    }
  })

  watch([gallerySearch, gallerySort, galleryFilter], () => {
    currentPage.value = 1
  })

  watch([collectionSearchQuery, collectionFilter], () => {
    activeCollectionMenu.value = null
  })

  return {
    activeMenu,
    loading,
    backendPath,
    baseUrl,
    endpoints,
    collections,
    stagedImages,
    stagingSearch,
    stagingTargetCollection,
    stagingBusyId,
    stagingViewMode,
    similarGroups,
    similarLoading,
    similarMessage,
    selectedStagedIds,
    showEndpointEditor,
    editingEndpoint,
    endpointForm,
    failedEndpointPreviewIds,
    newCollectionName,
    currentCollection,
    collectionSearchQuery,
    collectionFilter,
    activeCollectionMenu,
    newDescription,
    accessForm,
    accessSaving,
    externalLinksText,
    detailResources,
    collectionPreviews,
    currentGalleryTab,
    showImportLinks,
    selectedImageSet,
    bulkMoveTarget,
    gallerySearch,
    gallerySort,
    galleryFilter,
    galleryViewMode,
    apiPreviewUrl,
    apiPreviewLoading,
    tagEditorVisible,
    tagEditorImage,
    tagEditorCollection,
    tagEditorTags,
    tagEditorAliases,
    tagEditorInput,
    aliasEditorInput,
    tagEditorSaving,
    aiAnnotating,
    imageTagsCache,
    imageAliasesCache,
    bulkTagEditorVisible,
    bulkTagEditorTags,
    bulkTagEditorAliases,
    bulkTagEditorInput,
    bulkAliasEditorInput,
    bulkTagEditorSaving,
    bulkTagOperationMode,
    openBulkTagEditor,
    addTagToBulkEditor,
    removeTagFromBulkEditor,
    addAliasToBulkEditor,
    removeAliasFromBulkEditor,
    saveBulkTagEditor,
    getImageCacheKey,
    getImageTags,
    getVisibleImageTags,
    getHiddenImageTagsCount,
    loadImageTagsBatch,
    TAG_PALETTE: TAG_PALETTE_LIGHT,
    TAG_PALETTE_LIGHT,
    TAG_PALETTE_DARK,
    tagColor,
    openTagEditor,
    addTagFromEditor,
    removeTagFromEditor,
    addAliasFromEditor,
    removeAliasFromEditor,
    triggerAIAnnotation,
    saveTagEditor,
    closeTagEditor,
    activeMoveDropdown,
    activeCardMenu,
    toggleMoveDropdown,
    toggleCardMenu,
    closeCardMenu,
    isImageSelected,
    toggleImageSelection,
    clearSelectedImages,
    toggleSelectCurrentPage,
    handleGalleryItemClick,
    currentPage,
    pageSize,
    galleryItems,
    filteredGalleryItems,
    totalPages,
    paginatedGalleryItems,
    selectedImages,
    areAllCurrentPageImagesSelected,
    currentCollectionCoverUrl,
    currentCollectionApiUrl,
    currentCollectionTotalCount,
    currentCollectionAccessLabel,
    endpointPreviewUrl,
    previewRouteRows,
    filteredCollections,
    filteredStagedImages,
    filteredSimilarGroups,
    similarStagedImages,
    selectedStagedImages,
    areAllCurrentPageStagedSelected,
    isStagedSelected,
    toggleStagedSelection,
    toggleSelectAllStaged,
    clearSelectedStaged,
    batchDeleteStagedImages,
    confirmDeleteAllStagedImages,
    routeInventoryText,
    llmPromptPreview,
    dragOver,
    fileInput,
    toast,
    toastTimer,
    showToast,
    switchMainMenu,
    getBackendBaseUrl,
    getRouteDisplayPath,
    getBaseRedirectUrl,
    getLocalImageApiUrl,
    getStagedImageUrl,
    handlePreviewImageError,
    formatDate,
    formatPercent,
    formatSize,
    getImageExtension,
    getExternalLinkLabel,
    getCollectionPreviewState,
    getCollectionPreviewImages,
    getCollectionCardPreviewImages,
    getCollectionPreviewCountClass,
    loadCollectionPreview,
    warmCollectionPreviews,
    fetchState,
    fetchSettingsPreview,
    refreshStagedImages,
    loadSimilarStagedImages,
    toggleSimilarStagingMode,
    promoteStagedImage,
    deleteStagedImage,
    stageFilteredFiles,
    openEndpointEditor,
    closeEndpointEditor,
    resetEndpointForm,
    editEndpoint,
    saveEndpoint,
    deleteEndpoint,
    copyToClipboard,
    createCollection,
    confirmDeleteCollection,
    enterCollectionDetail,
    exitCollectionDetail,
    loadCollectionResources,
    refreshCollectionResources,
    testCurrentCollectionApi,
    saveCollectionDescription,
    loadCollectionAccess,
    saveCollectionAccess,
    syncAccessForm,
    triggerFileInput,
    onFileSelected,
    onDrop,
    uploadFiles,
    fileToBase64,
    addExternalLinks,
    deleteExternalLink,
    confirmDeleteImage,
    deleteSelectedImages,
    moveImage,
    moveSelectedImages,
    openImage,
    toggleCollectionMenu,
    closeDropdowns,
  }
}
