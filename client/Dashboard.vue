<template>
  <div class="memesluna-dashboard">
    
    <!-- Top Header -->
    <header class="dashboard-header">
      <div class="header-left">
        <div class="logo-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2"></rect>
            <circle cx="9" cy="9" r="2"></circle>
            <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"></path>
          </svg>
        </div>
        <div class="header-text">
          <h1>MemesLuna 控制台</h1>
          <p>表情包分发与 302 重定向端点管理面板</p>
        </div>
      </div>
      
      <!-- Nav Tabs (Only show if not in collection detail view) -->
      <div v-if="!currentCollection" class="tabs-container">
        <button 
          @click="currentTab = 'endpoints'"
          :class="['tab-btn', currentTab === 'endpoints' ? 'active' : '']"
        >
          🌐 接口端点
        </button>
        <button 
          @click="currentTab = 'collections'"
          :class="['tab-btn', currentTab === 'collections' ? 'active' : '']"
        >
          📷 表情合集
        </button>
      </div>
    </header>

    <!-- Global Toast Alert Banner -->
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

    <!-- Loading Cover -->
    <div v-if="loading" class="loading-container">
      <div class="spinner"></div>
      <p>正在同步数据...</p>
    </div>

    <!-- MAIN VIEWS (If not loading) -->
    <main v-else class="dashboard-main">
      
      <!-- VIEW: ENDPOINTS TAB -->
      <div v-if="currentTab === 'endpoints' && !currentCollection" class="dashboard-grid">
        
        <!-- Endpoint Form Panel -->
        <div class="flat-card form-panel">
          <h2 class="card-title">
            {{ editingEndpoint ? '📝 编辑端点' : '➕ 添加新端点' }}
          </h2>
          
          <div class="form-fields">
            <div class="form-group">
              <label>端点名称 *</label>
              <input 
                v-model="endpointForm.name" 
                :disabled="!!editingEndpoint" 
                class="flat-input"
                placeholder="例如: avatar" 
              />
              <span class="field-hint">创建后不可修改，将作为访问路径后缀</span>
            </div>

            <div class="form-group">
              <label>目标重定向 URL *</label>
              <input 
                v-model="endpointForm.url" 
                class="flat-input"
                placeholder="例如: https://api.multiavatar.com" 
              />
            </div>

            <div class="form-group">
              <label>分组名称</label>
              <input 
                v-model="endpointForm.group" 
                class="flat-input"
                placeholder="默认: 默认分组" 
              />
            </div>

            <div class="form-group">
              <label>描述</label>
              <input 
                v-model="endpointForm.description" 
                class="flat-input"
                placeholder="例如: 随机动漫头像生成" 
              />
            </div>

            <div class="form-row">
              <div class="form-group flex-1">
                <label>重定向方法</label>
                <select v-model="endpointForm.method" class="flat-select">
                  <option value="redirect">302 重定向</option>
                  <option value="proxy">反向代理</option>
                </select>
              </div>

              <div class="form-group flex-1">
                <label>URL 拼接模式</label>
                <select v-model="endpointForm.urlConstruction" class="flat-select">
                  <option value="normal">标准参数</option>
                  <option value="path">路径追加</option>
                </select>
              </div>
            </div>

            <div class="form-actions">
              <button @click="saveEndpoint" class="btn btn-primary flex-grow">
                {{ editingEndpoint ? '更新端点' : '创建端点' }}
              </button>
              <button @click="resetEndpointForm" class="btn btn-secondary">
                取消
              </button>
            </div>
          </div>
        </div>

        <!-- Endpoints List -->
        <div class="flat-card list-panel">
          <h2 class="card-title">302 跳转及代理端点列表</h2>
          <p class="section-desc">通过本地地址 <code class="code-url">{{ getBaseRedirectUrl('{端点名称}') }}</code> 进行访问，系统将自动进行 302 重定向或反代理到目标服务。</p>

          <div class="table-container">
            <table class="flat-table">
              <thead>
                <tr>
                  <th style="width: 25%">名称 / 分组</th>
                  <th style="width: 25%">描述</th>
                  <th style="width: 35%">访问路径 & 目标 URL</th>
                  <th style="width: 15%; text-align: right">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!endpoints.length">
                  <td colspan="4" class="empty-cell">暂无已配置的端点</td>
                </tr>
                <tr v-for="item in endpoints" :key="item.name">
                  <td>
                    <div class="endpoint-name">{{ item.name }}</div>
                    <span class="group-badge">{{ item.group || '默认分组' }}</span>
                  </td>
                  <td class="cell-desc" :title="item.description">
                    {{ item.description || '-' }}
                  </td>
                  <td class="font-mono">
                    <div class="url-line">
                      <span class="method-tag">{{ item.method || 'redirect' }}</span>
                      <span class="link-text" @click="copyToClipboard(getBaseRedirectUrl(item.name))">
                        /{{ item.name }}
                      </span>
                      <button @click="copyToClipboard(getBaseRedirectUrl(item.name))" class="icon-btn-inline" title="复制链接">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      </button>
                    </div>
                    <div class="target-url truncate" :title="item.url">
                      → {{ item.url }}
                    </div>
                  </td>
                  <td style="text-align: right">
                    <div class="action-buttons">
                      <a :href="getBaseRedirectUrl(item.name)" target="_blank" class="icon-btn hover-bg" title="在新窗口访问">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                          <polyline points="15 3 21 3 21 9"></polyline>
                          <line x1="10" y1="14" x2="21" y2="3"></line>
                        </svg>
                      </a>
                      <button @click="editEndpoint(item)" class="icon-btn hover-bg" title="编辑">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                          <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                      </button>
                      <button @click="deleteEndpoint(item.name)" class="icon-btn hover-danger" title="删除">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <polyline points="3 6 5 6 21 6"></polyline>
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>

      <!-- VIEW: COLLECTIONS TAB (LIST VIEW) -->
      <div v-else-if="currentTab === 'collections' && !currentCollection" class="collections-tab">
        
        <!-- Collection Creator Bar -->
        <div class="flat-card creator-bar">
          <div class="creator-title">
            <h2 class="card-title" style="margin-bottom: 4px">表情合集管理</h2>
            <p class="section-desc" style="margin: 0">创建并管理本地表情包文件和外链，支持随机路由分发与 ChatLuna 变量对接。</p>
          </div>
          
          <div class="creator-form">
            <input 
              v-model="newCollectionName"
              class="flat-input"
              style="width: 240px; margin: 0"
              placeholder="新表情合集名称 (字母/拼音)" 
              @keyup.enter="createCollection"
            />
            <button @click="createCollection" class="btn btn-primary">
              新建合集
            </button>
          </div>
        </div>

        <!-- Collection Folders Grid -->
        <div class="folders-grid">
          <div 
            v-for="item in collections" 
            :key="item.name"
            class="folder-card"
            @click="enterCollectionDetail(item)"
          >
            <!-- Folder Icon Header -->
            <div class="folder-header">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            
            <!-- Info body -->
            <div class="folder-body">
              <div>
                <div class="folder-name">{{ item.name }}</div>
                <div class="folder-desc" :title="item.description">
                  {{ item.description || '暂无描述信息' }}
                </div>
              </div>
              
              <div class="folder-footer">
                <span class="folder-meta">本地: {{ item.localCount }} · 外链: {{ item.linkCount }}</span>
                <span class="folder-manage-link">
                  管理 <svg class="chevron-right" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>
                </span>
              </div>
            </div>
          </div>
        </div>

      </div>

      <!-- VIEW: COLLECTION DETAIL VIEW -->
      <div v-else-if="currentCollection" class="collection-detail-layout">
        
        <!-- Left Sidebar: Controls -->
        <aside class="detail-sidebar">
          
          <!-- Card 1: 合集操作 -->
          <div class="flat-card sidebar-section">
            <h3 class="sidebar-sec-title">合集操作</h3>
            <div class="sidebar-actions">
              <button @click="currentCollection = null" class="btn btn-secondary w-full text-center py-2 flex items-center justify-center gap-2" style="font-size: 0.75rem; height: auto;">
                <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 14px; height: 14px;">
                  <line x1="19" y1="12" x2="5" y2="12"></line>
                  <polyline points="12 19 5 12 12 5"></polyline>
                </svg>
                返回管理面板
              </button>
              <button @click="confirmDeleteCollection(currentCollection.name)" class="btn btn-danger w-full text-center py-2" style="font-size: 0.75rem; height: auto; margin-top: 8px;">
                删除此合集
              </button>
            </div>
          </div>

          <!-- Card 2: 合集描述 -->
          <div class="flat-card sidebar-section" style="margin-top: 16px;">
            <h3 class="sidebar-sec-title">合集描述</h3>
            <p class="sidebar-sec-desc">可被 ChatLuna 动态变量感应并描述属性</p>
            <div class="sidebar-desc-form">
              <textarea 
                v-model="newDescription" 
                class="flat-textarea w-full" 
                rows="2"
                placeholder="例如：丛雨的可爱大表情包包，适用于千恋万花角色聊天背景" 
              ></textarea>
              <button @click="saveCollectionDescription" class="btn btn-primary w-full mt-2" style="font-size: 0.75rem; height: 32px;">
                保存描述
              </button>
            </div>
          </div>

          <!-- Card 3: 上传图片 -->
          <div class="flat-card sidebar-section" style="margin-top: 16px;">
            <h3 class="sidebar-sec-title">上传图片</h3>
            
            <div 
              class="sidebar-drop-zone"
              :class="{ 'drag-over': dragOver }"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="onDrop"
              @click="triggerFileInput"
            >
              <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              <p class="drop-text">拖放图片文件到此处或</p>
              <button class="btn-select-file" @click.stop="triggerFileInput">选择文件</button>
              
              <input 
                ref="fileInput"
                type="file" 
                multiple 
                accept="image/*" 
                class="hidden-file-input" 
                @change="onFileSelected"
              />
            </div>
            <button @click="triggerFileInput" class="btn btn-primary w-full mt-2" style="font-size: 0.75rem; height: 32px;">
              上传图片
            </button>
            <p class="sidebar-hint mt-2">支持jpg、png、gif、psd、tif、bmp、webp格式，最大20MB/张</p>
          </div>

          <!-- Card 4: 添加外链 -->
          <div class="flat-card sidebar-section" style="margin-top: 16px;">
            <h3 class="sidebar-sec-title">添加外链</h3>
            <p class="sidebar-sec-desc">图片外链地址</p>
            <div class="links-form">
              <textarea 
                v-model="externalLinksText"
                rows="3"
                class="flat-textarea w-full"
                placeholder="每行一个链接，以http://或https://开头"
              ></textarea>
              
              <button @click="addExternalLinks" class="btn btn-primary w-full mt-2" style="font-size: 0.75rem; height: 32px;">
                添加外链
              </button>
            </div>
          </div>

        </aside>

        <!-- Right Main Panel -->
        <main class="detail-main-content">
          
          <!-- Card 1: 顶部头部 -->
          <div class="flat-card detail-main-header">
            <div class="detail-header-left">
              <h2 class="detail-title">
                管理合集: {{ currentCollection.name }}
              </h2>
              <p class="detail-route">
                随机获取图片：<code class="code-url">{{ getBaseRedirectUrl(currentCollection.name) }}</code>
                <a :href="getBaseRedirectUrl(currentCollection.name)" target="_blank" class="btn btn-secondary btn-sm ml-2" style="font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; height: 24px; padding: 2px 8px; vertical-align: middle;">
                  测试
                </a>
              </p>
            </div>
            
            <div class="detail-header-actions">
              <button @click="refreshCollectionResources" class="btn btn-secondary py-1.5 px-3" style="font-size: 0.75rem; height: 32px;">
                刷新缓存
              </button>
            </div>
          </div>

          <!-- Card 2: 本地存储图片 (Grid) -->
          <div class="flat-card detail-main-section" style="margin-top: 16px;">
            <h3 class="gallery-title">本地图片 ({{ detailResources.images.length }}张)</h3>

            <div v-if="!detailResources.images.length" class="empty-gallery">
              合集中暂无本地存储的图片
            </div>
            
            <div v-else class="image-grid-flat">
              <div 
                v-for="img in detailResources.images" 
                :key="img"
                class="image-card-flat"
              >
                <!-- Image Container -->
                <div class="img-container">
                  <img 
                    :src="getLocalImageApiUrl(currentCollection.name, img)" 
                    class="image-thumbnail" 
                    loading="lazy" 
                  />
                </div>
                
                <!-- Footer bar with filename and buttons -->
                <div class="image-card-footer">
                  <span class="image-filename truncate" :title="img">{{ img }}</span>
                  <div class="image-actions-row">
                    <button 
                      @click.stop="openImage(getLocalImageApiUrl(currentCollection.name, img))"
                      class="btn-action-small btn-view"
                    >
                      查看
                    </button>
                    
                    <div class="move-dropdown-container">
                      <button class="btn-action-small btn-move" title="移动至其他合集">
                        移动
                      </button>
                      <!-- Move Menu -->
                      <div class="move-dropdown-menu">
                        <div class="dropdown-header">移动至:</div>
                        <template v-for="targetCol in collections">
                          <button 
                            v-if="targetCol.name !== currentCollection.name"
                            :key="targetCol.name"
                            @click.stop="moveImage(currentCollection.name, targetCol.name, img)"
                            class="dropdown-item"
                          >
                            {{ targetCol.name }}
                          </button>
                        </template>
                      </div>
                    </div>

                    <button 
                      @click.stop="confirmDeleteImage(currentCollection.name, img)" 
                      class="btn-action-small btn-delete"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Card 3: 外链图片列表 -->
          <div class="flat-card detail-main-section" style="margin-top: 16px;">
            <h3 class="gallery-title">🔗 外链图片列表 ({{ detailResources.links.length }})</h3>

            <div v-if="!detailResources.links.length" class="empty-gallery">
              合集中暂无配置的外链图片
            </div>

            <div v-else class="links-list-container">
              <div 
                v-for="link in detailResources.links" 
                :key="link"
                class="link-item-row"
              >
                <div class="link-url-wrapper">
                  <span class="bullet">•</span>
                  <span class="link-url-text truncate" @click="copyToClipboard(link)">
                    {{ link }}
                  </span>
                </div>
                <div class="link-actions">
                  <button 
                    @click="copyToClipboard(link)"
                    class="icon-btn hover-bg"
                    title="复制链接"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                  </button>
                  <button 
                    @click="deleteExternalLink(currentCollection.name, link)"
                    class="icon-btn hover-danger"
                    title="删除外链"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

        </main>
      </div>

    </main>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { send } from '@koishijs/client'

// Data state
const loading = ref(true)
const currentTab = ref<'endpoints' | 'collections'>('endpoints')
const backendPath = ref('/memesluna')
const baseUrl = ref('http://localhost:5140')

// Lists
const endpoints = ref<any[]>([])
const collections = ref<any[]>([])

// Endpoint Form State
const editingEndpoint = ref<any | null>(null)
const endpointForm = reactive({
  name: '',
  group: '',
  description: '',
  url: '',
  method: 'redirect',
  urlConstruction: 'normal'
})

// Collection States
const newCollectionName = ref('')
const currentCollection = ref<any | null>(null)
const newDescription = ref('')
const externalLinksText = ref('')
const detailResources = reactive({
  images: [] as string[],
  links: [] as string[]
})

// Drag over state
const dragOver = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

// Toast Alert state
const toast = reactive({
  show: false,
  message: '',
  type: 'info' as 'info' | 'success' | 'error'
})
let toastTimer: any = null

// Show toast helper
function showToast(message: string, type: 'info' | 'success' | 'error' = 'info') {
  if (toastTimer) clearTimeout(toastTimer)
  toast.message = message
  toast.type = type
  toast.show = true
  toastTimer = setTimeout(() => {
    toast.show = false
  }, 2500)
}

// Format Absolute redirects
function getBaseRedirectUrl(suffix: string): string {
  const cleanBase = baseUrl.value.endsWith('/') ? baseUrl.value.slice(0, -1) : baseUrl.value
  const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
  const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
  return `${cleanBase}${formattedPath}/${suffix}`
}

function getLocalImageApiUrl(collection: string, filename: string): string {
  const cleanBase = baseUrl.value.endsWith('/') ? baseUrl.value.slice(0, -1) : baseUrl.value
  const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
  const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
  return `${cleanBase}${formattedPath}/api/admin/collections/${encodeURIComponent(collection)}/images/${encodeURIComponent(filename)}`
}

// Fetch general state
async function fetchState() {
  try {
    const rawBaseUrl = await send('memesluna/getBaseUrl')
    if (rawBaseUrl) {
      const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
      const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
      if (rawBaseUrl.endsWith(formattedPath)) {
        baseUrl.value = rawBaseUrl.slice(0, -rawBaseUrl.length)
      } else {
        baseUrl.value = rawBaseUrl
      }
    }

    const state = await send('memesluna/getState')
    if (state) {
      if (state.backendPath) backendPath.value = state.backendPath
      endpoints.value = Array.isArray(state.endpoints) ? state.endpoints : []
      collections.value = Array.isArray(state.collections) ? state.collections : []
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '获取状态失败', 'error')
  }
}

// Lifecycle
onMounted(async () => {
  loading.value = true
  await fetchState()
  loading.value = false
})

// Endpoint Actions
function resetEndpointForm() {
  editingEndpoint.value = null
  endpointForm.name = ''
  endpointForm.group = ''
  endpointForm.description = ''
  endpointForm.url = ''
  endpointForm.method = 'redirect'
  endpointForm.urlConstruction = 'normal'
}

function editEndpoint(item: any) {
  editingEndpoint.value = item
  endpointForm.name = item.name || ''
  endpointForm.group = item.group || ''
  endpointForm.description = item.description || ''
  endpointForm.url = item.url || ''
  endpointForm.method = item.method || 'redirect'
  endpointForm.urlConstruction = item.urlConstruction || 'normal'
}

async function saveEndpoint() {
  const name = endpointForm.name.trim()
  const url = endpointForm.url.trim()

  if (!name || !url) {
    showToast('名称和目标 URL 必填', 'error')
    return
  }

  const payload = {
    name,
    group: endpointForm.group.trim() || '默认分组',
    description: endpointForm.description.trim(),
    url,
    method: endpointForm.method,
    urlConstruction: endpointForm.urlConstruction,
    queryParams: [],
    proxySettings: { fallbackAction: 'returnJson' }
  }

  try {
    loading.value = true
    if (editingEndpoint.value) {
      await send('memesluna/updateEndpoint', editingEndpoint.value.name, payload)
      showToast('端点更新成功', 'success')
    } else {
      await send('memesluna/createEndpoint', payload)
      showToast('端点创建成功', 'success')
    }
    await fetchState()
    resetEndpointForm()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '保存端点失败', 'error')
  } finally {
    loading.value = false
  }
}

async function deleteEndpoint(name: string) {
  if (!confirm(`确认删除端点 "${name}" 吗？`)) return

  try {
    loading.value = true
    await send('memesluna/deleteEndpoint', name)
    showToast('端点已成功删除', 'success')
    await fetchState()
    if (editingEndpoint.value && editingEndpoint.value.name === name) {
      resetEndpointForm()
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除端点失败', 'error')
  } finally {
    loading.value = false
  }
}

// Copy URL Clipboard helper
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    showToast('成功复制链接到剪贴板', 'success')
  } catch (err) {
    showToast('复制失败', 'error')
  }
}

// Collection Actions
async function createCollection() {
  const name = newCollectionName.value.trim()
  if (!name) {
    showToast('合集名称不能为空', 'error')
    return
  }

  try {
    loading.value = true
    const success = await send('memesluna/createCollection', name)
    if (!success) {
      showToast('合集已存在', 'error')
      return
    }
    showToast('合集创建成功', 'success')
    newCollectionName.value = ''
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '创建失败', 'error')
  } finally {
    loading.value = false
  }
}

async function confirmDeleteCollection(name: string) {
  if (!confirm(`⚠️ 危险操作：确认彻底删除表情合集 "${name}" 及其所有存储的图片文件吗？`)) return

  try {
    loading.value = true
    await send('memesluna/deleteCollection', name)
    showToast('合集删除成功', 'success')
    currentCollection.value = null
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除失败', 'error')
  } finally {
    loading.value = false
  }
}

// Enter collection details view
async function enterCollectionDetail(item: any) {
  currentCollection.value = item
  newDescription.value = item.description || ''
  externalLinksText.value = ''
  await loadCollectionResources(item.name)
}

async function loadCollectionResources(name: string) {
  try {
    const cleanBase = baseUrl.value.endsWith('/') ? baseUrl.value.slice(0, -1) : baseUrl.value
    const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
    const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
    const response = await fetch(`${cleanBase}${formattedPath}/api/collections/${encodeURIComponent(name)}/resources`)
    if (response.ok) {
      const data = await response.json()
      detailResources.images = Array.isArray(data.images) ? data.images : []
      detailResources.links = Array.isArray(data.links) ? data.links : []
    }
  } catch (err) {
    showToast('加载合集内资源失败', 'error')
  }
}

async function refreshCollectionResources() {
  if (!currentCollection.value) return
  loading.value = true
  await loadCollectionResources(currentCollection.value.name)
  await fetchState()
  const match = collections.value.find(c => c.name === currentCollection.value.name)
  if (match) currentCollection.value = match
  loading.value = false
  showToast('合集缓存刷新成功', 'success')
}

async function saveCollectionDescription() {
  if (!currentCollection.value) return

  try {
    loading.value = true
    await send('memesluna/setCollectionDescription', currentCollection.value.name, newDescription.value.trim())
    showToast('合集描述更新成功', 'success')
    await fetchState()
    const match = collections.value.find(c => c.name === currentCollection.value.name)
    if (match) currentCollection.value = match
  } catch (err) {
    showToast(err instanceof Error ? err.message : '保存描述失败', 'error')
  } finally {
    loading.value = false
  }
}

// Upload & Drag-Drop triggers
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

  const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
  if (!imageFiles.length) {
    showToast('请选择有效的图片文件', 'error')
    return
  }

  showToast(`开始上传 ${imageFiles.length} 张图片...`, 'info')
  let uploadedCount = 0

  for (const file of imageFiles) {
    try {
      const base64 = await fileToBase64(file)
      await send('memesluna/uploadLocalImage', currentCollection.value.name, base64, file.name)
      uploadedCount++
    } catch (err) {
      showToast(`图片 "${file.name}" 上传失败: ${err instanceof Error ? err.message : '错误'}`, 'error')
    }
  }

  if (uploadedCount > 0) {
    showToast(`成功上传 ${uploadedCount} 张图片`, 'success')
    await loadCollectionResources(currentCollection.value.name)
    await fetchState()
  }
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

// Link actions
async function addExternalLinks() {
  if (!currentCollection.value) return
  const text = externalLinksText.value.trim()
  if (!text) {
    showToast('外链内容不能为空', 'error')
    return
  }

  try {
    loading.value = true
    const count = await send('memesluna/addLinks', currentCollection.value.name, text)
    showToast(`成功添加 ${count} 条图片外链`, 'success')
    externalLinksText.value = ''
    await loadCollectionResources(currentCollection.value.name)
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '添加外链失败', 'error')
  } finally {
    loading.value = false
  }
}

async function deleteExternalLink(collectionName: string, link: string) {
  if (!confirm('确认删除该图片外链吗？')) return

  try {
    loading.value = true
    await send('memesluna/deleteLink', collectionName, link)
    showToast('外链已删除', 'success')
    await loadCollectionResources(collectionName)
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除外链失败', 'error')
  } finally {
    loading.value = false
  }
}

// Image delete & move actions
async function confirmDeleteImage(collectionName: string, filename: string) {
  if (!confirm(`确认永久删除本地图片 "${filename}" 吗？`)) return

  try {
    loading.value = true
    await send('memesluna/deleteLocalImage', collectionName, filename)
    showToast('本地图片已删除', 'success')
    await loadCollectionResources(collectionName)
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除图片失败', 'error')
  } finally {
    loading.value = false
  }
}

async function moveImage(source: string, target: string, filename: string) {
  try {
    loading.value = true
    const newFilename = await send('memesluna/moveLocalImage', source, target, filename)
    if (newFilename) {
      showToast(`已将图片移动至合集 "${target}"`, 'success')
      await loadCollectionResources(source)
      await fetchState()
    } else {
      showToast('图片移动失败', 'error')
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '移动图片失败', 'error')
  } finally {
    loading.value = false
  }
}

function openImage(url: string) {
  window.open(url, '_blank')
}
</script>

<style scoped>
/* memesluna-dashboard main panel using native console styles */
.memesluna-dashboard {
  box-sizing: border-box;
  padding: 24px 24px 24px 88px; /* 88px = 64px sidebar + 24px padding */
  font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
  background-color: var(--bg0, #f8fafc);
  color: var(--fg0, #0f172a);
  min-height: 100vh;
}

/* Header style aligning with native sidebar height */
.dashboard-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-b-width: 1px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-box {
  background-color: var(--fg0, #0f172a);
  color: var(--bg0, #ffffff);
  padding: 8px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-box svg {
  width: 24px;
  height: 24px;
}

.header-text h1 {
  font-size: 1.25rem;
  font-weight: 700;
  margin: 0;
  color: var(--fg0, #0f172a);
  line-height: 1.2;
}

.header-text p {
  font-size: 0.75rem;
  color: var(--fg1, #64748b);
  margin: 4px 0 0 0;
}

/* Navigation tabs matching shadcn styling */
.tabs-container {
  display: flex;
  background-color: var(--bg2, #f1f5f9);
  padding: 4px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
}

.tab-btn {
  border: none;
  background: transparent;
  padding: 6px 12px;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 6px;
  color: var(--fg1, #64748b);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--fg0, #0f172a);
}

.tab-btn.active {
  background-color: var(--bg1, #ffffff);
  color: var(--fg0, #0f172a);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* Loading state */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border, #e2e8f0);
  border-top-color: var(--primary, #3b82f6);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 16px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container p {
  font-size: 0.85rem;
  color: var(--fg1, #64748b);
  margin: 0;
}

/* Responsive Grid layout for endpoints */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}

@media (min-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 340px 1fr;
  }
}

/* Generic flat card matching shadcn/ui */
.flat-card {
  background-color: var(--bg1, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
}

.card-title {
  font-size: 0.9rem;
  font-weight: 700;
  margin: 0 0 16px 0;
  color: var(--fg0, #0f172a);
}

.section-desc {
  font-size: 0.75rem;
  color: var(--fg1, #64748b);
  margin: 0 0 16px 0;
  line-height: 1.4;
}

/* Form Styles */
.form-fields {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-group {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--fg0, #0f172a);
  margin-bottom: 6px;
}

.flat-input,
.flat-select,
.flat-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 12px;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background-color: var(--bg0, #f8fafc);
  color: var(--fg0, #0f172a);
  font-size: 0.8rem;
  font-family: inherit;
  transition: border-color 0.2s ease;
  outline: none;
}

.flat-input:focus,
.flat-select:focus,
.flat-textarea:focus {
  border-color: var(--primary, #3b82f6);
}

.flat-input:disabled {
  background-color: var(--bg2, #f1f5f9);
  color: var(--fg2, #94a3b8);
  cursor: not-allowed;
}

.field-hint {
  font-size: 0.65rem;
  color: var(--fg2, #94a3b8);
  margin-top: 4px;
}

.form-row {
  display: flex;
  gap: 12px;
}

.flex-1 {
  flex: 1;
}

.flex-grow {
  flex-grow: 1;
}

/* Button styles */
.btn {
  box-sizing: border-box;
  padding: 8px 16px;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 6px;
  cursor: pointer;
  transition: background-color 0.2s ease, border-color 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 36px;
  border: none;
}

.btn-primary {
  background-color: var(--primary, #3b82f6);
  color: #ffffff;
}

.btn-primary:hover {
  filter: brightness(0.92);
}

.btn-secondary {
  background-color: var(--bg2, #f1f5f9);
  color: var(--fg0, #0f172a);
  border: 1px solid var(--border, #e2e8f0);
}

.btn-secondary:hover {
  background-color: var(--border, #e2e8f0);
}

.btn-danger {
  background-color: #ef4444;
  color: #ffffff;
}

.btn-danger:hover {
  background-color: #dc2626;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

/* Table styling aligning beautifully with sidebars */
.table-container {
  overflow-x: auto;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  background-color: var(--bg1, #ffffff);
}

.flat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
  text-align: left;
}

.flat-table th {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background-color: var(--bg0, #f8fafc);
  color: var(--fg1, #64748b);
  font-weight: 600;
}

.flat-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  color: var(--fg0, #0f172a);
  vertical-align: middle;
}

.flat-table tr:last-child td {
  border-bottom: none;
}

.empty-cell {
  text-align: center;
  padding: 32px !important;
  color: var(--fg2, #94a3b8);
  font-weight: 550;
}

.endpoint-name {
  font-weight: 700;
  color: var(--fg0, #0f172a);
}

.group-badge {
  display: inline-block;
  background-color: var(--bg2, #f1f5f9);
  color: var(--fg1, #64748b);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.65rem;
  font-weight: 600;
  margin-top: 4px;
}

.cell-desc {
  color: var(--fg1, #64748b);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.url-line {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
  flex-wrap: wrap;
}

.method-tag {
  background-color: #eff6ff;
  color: #2563eb;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 1px 4px;
  border-radius: 3px;
  text-transform: uppercase;
}

.link-text {
  font-weight: 600;
  color: var(--fg0, #0f172a);
  cursor: pointer;
}

.link-text:hover {
  text-decoration: underline;
}

.target-url {
  font-size: 0.7rem;
  color: var(--fg2, #94a3b8);
  max-width: 260px;
}

/* Action buttons */
.action-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--fg1, #64748b);
  transition: all 0.2s ease;
}

.icon-btn svg {
  width: 14px;
  height: 14px;
}

.icon-btn.hover-bg:hover {
  background-color: var(--bg2, #f1f5f9);
  color: var(--fg0, #0f172a);
}

.icon-btn.hover-danger:hover {
  background-color: #fee2e2;
  border-color: #fca5a5;
  color: #dc2626;
}

.icon-btn-inline {
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--fg2, #94a3b8);
  display: inline-flex;
  align-items: center;
}

.icon-btn-inline:hover {
  color: var(--fg1, #64748b);
}

.icon-btn-inline svg {
  width: 12px;
  height: 12px;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Collection List Styles */
.collections-tab {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.creator-bar {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.creator-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.folders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.folder-card {
  background-color: var(--bg1, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.folder-card:hover {
  transform: translateY(-2px);
  border-color: var(--fg2, #94a3b8);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.05);
}

.folder-header {
  height: 96px;
  background-color: var(--bg0, #f8fafc);
  border-bottom: 1px solid var(--border, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #6366f1;
}

.folder-header svg {
  width: 40px;
  height: 40px;
}

.folder-body {
  padding: 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
}

.folder-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--fg0, #0f172a);
  margin-bottom: 4px;
}

.folder-desc {
  font-size: 0.72rem;
  color: var(--fg1, #64748b);
  line-height: 1.4;
  height: 36px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.folder-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--bg2, #f1f5f9);
}

.folder-meta {
  font-size: 0.65rem;
  color: var(--fg2, #94a3b8);
  font-weight: 600;
}

.folder-manage-link {
  font-size: 0.72rem;
  color: var(--primary, #3b82f6);
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 2px;
}

.chevron-right {
  width: 10px;
  height: 10px;
}

/* Detail View Styles */
.detail-view {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.detail-header-row {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid var(--border, #e2e8f0);
  padding-bottom: 14px;
  gap: 16px;
  flex-wrap: wrap;
}

.detail-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.back-btn {
  padding: 6px;
}

.detail-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
  color: var(--fg0, #0f172a);
  display: flex;
  align-items: center;
  gap: 6px;
}

.detail-subtitle {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--fg2, #94a3b8);
}

.detail-route {
  font-size: 0.7rem;
  margin: 2px 0 0 0;
  color: var(--fg2, #94a3b8);
}

.detail-header-actions {
  display: flex;
  gap: 8px;
}

/* Description Editor Section */
.description-bar {
  display: flex;
  align-items: flex-end;
  gap: 12px;
  background-color: var(--bg0, #f8fafc);
  padding: 14px;
  border-radius: 8px;
  border: 1px solid var(--border, #e2e8f0);
  flex-wrap: wrap;
}

.desc-label {
  display: block;
  font-size: 0.7rem;
  font-weight: 600;
  color: var(--fg1, #64748b);
  margin-bottom: 6px;
}

/* Action panel grid (Upload & Links) */
.action-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 20px;
}

@media (min-width: 768px) {
  .action-grid {
    grid-template-columns: 1fr 1fr;
  }
}

.action-panel {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.panel-header h3 {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--fg0, #0f172a);
  margin: 0 0 4px 0;
}

.panel-header p {
  font-size: 0.68rem;
  color: var(--fg2, #94a3b8);
  margin: 0 0 12px 0;
}

/* Upload zone */
.drop-zone {
  border: 2px dashed var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 24px;
  text-align: center;
  cursor: pointer;
  background-color: var(--bg0, #f8fafc);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--primary, #3b82f6);
  background-color: var(--bg2, #f1f5f9);
}

.drop-icon {
  width: 28px;
  height: 28px;
  color: var(--fg2, #94a3b8);
  margin-bottom: 8px;
}

.drop-text {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--fg1, #64748b);
  margin: 0;
}

.drop-hint {
  font-size: 0.65rem;
  color: var(--fg2, #94a3b8);
  margin: 4px 0 0 0;
}

.hidden-file-input {
  display: none;
}

/* Links Form */
.links-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.flat-textarea {
  resize: vertical;
}

.w-full {
  width: 100%;
}

/* Gallery styles */
.gallery-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.gallery-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--fg0, #0f172a);
  margin: 0;
}

.empty-gallery {
  padding: 30px;
  text-align: center;
  color: var(--fg2, #94a3b8);
  background-color: var(--bg0, #f8fafc);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 550;
}

.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 14px;
}

.image-card {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--bg0, #f8fafc);
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.image-card:hover .image-thumbnail {
  transform: scale(1.04);
}

/* Image Hover overlays */
.image-overlay {
  position: absolute;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.6);
  opacity: 0;
  transition: opacity 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 8px;
  box-sizing: border-box;
}

.image-card:hover .image-overlay {
  opacity: 1;
}

.overlay-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
}

.image-name-badge {
  background-color: rgba(0, 0, 0, 0.65);
  color: #ffffff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.6rem;
  font-family: monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 72px;
}

.icon-btn-danger-small {
  background: #ef4444;
  color: #ffffff;
  border: none;
  border-radius: 4px;
  padding: 3px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.icon-btn-danger-small svg {
  width: 10px;
  height: 10px;
}

.overlay-footer {
  display: flex;
  gap: 4px;
}

.btn-copy-small {
  flex: 1;
  background-color: #ffffff;
  color: #1e293b;
  border: none;
  border-radius: 4px;
  padding: 4px;
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
}

.btn-copy-small:hover {
  background-color: #f1f5f9;
}

.btn-move-trigger {
  background-color: #ffffff;
  color: #1e293b;
  border: none;
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
}

.btn-move-trigger svg {
  width: 10px;
  height: 10px;
}

/* Moving Dropdown Menu */
.move-dropdown-container {
  position: relative;
}

.move-dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background-color: var(--bg1, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: none;
  z-index: 50;
  width: 110px;
  max-height: 140px;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 4px 0;
}

.move-dropdown-container:hover .move-dropdown-menu {
  display: block;
}

.dropdown-header {
  font-size: 0.6rem;
  font-weight: 700;
  color: var(--fg2, #94a3b8);
  padding: 4px 8px;
  border-bottom: 1px solid var(--border, #e2e8f0);
}

.dropdown-item {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 8px;
  font-size: 0.7rem;
  color: var(--fg0, #0f172a);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dropdown-item:hover {
  background-color: var(--bg2, #f1f5f9);
}

/* Links List Container inside Collection details */
.links-list-container {
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  overflow: hidden;
}

.link-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #e2e8f0);
  background-color: var(--bg1, #ffffff);
}

.link-item-row:last-child {
  border-bottom: none;
}

.link-item-row:hover {
  background-color: var(--bg0, #f8fafc);
}

.link-url-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
  margin-right: 16px;
}

.bullet {
  color: var(--fg2, #94a3b8);
}

.link-url-text {
  color: var(--fg1, #64748b);
  cursor: pointer;
  font-family: monospace;
}

.link-url-text:hover {
  text-decoration: underline;
  color: var(--fg0, #0f172a);
}

.link-actions {
  display: flex;
  gap: 6px;
}

.border-t {
  border-top: 1px solid var(--border, #e2e8f0);
}

/* Toast alert transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toast-banner {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  font-size: 0.75rem;
  font-weight: 600;
  background-color: var(--bg1, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
}

.toast-banner.success {
  background-color: #ecfdf5;
  border-color: #a7f3d0;
  color: #065f46;
}

.toast-banner.error {
  background-color: #fef2f2;
  border-color: #fca5a5;
  color: #991b1b;
}

.toast-icon {
  width: 14px;
  height: 14px;
}

/* Side-by-side vertical split layout */
.collection-detail-layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  align-items: start;
}

@media (max-width: 1024px) {
  .collection-detail-layout {
    grid-template-columns: 1fr;
  }
}

.detail-sidebar {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sidebar-section {
  padding: 16px !important;
}

.sidebar-sec-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--fg0, #0f172a);
  margin: 0 0 8px 0;
}

.sidebar-sec-desc {
  font-size: 0.68rem;
  color: var(--fg2, #94a3b8);
  margin: 0 0 10px 0;
  line-height: 1.3;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-drop-zone {
  border: 2px dashed var(--border, #e2e8f0);
  border-radius: 8px;
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  background-color: var(--bg0, #f8fafc);
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.sidebar-drop-zone:hover,
.sidebar-drop-zone.drag-over {
  border-color: var(--primary, #3b82f6);
  background-color: var(--bg2, #f1f5f9);
}

.sidebar-drop-zone .drop-icon {
  width: 24px;
  height: 24px;
  color: var(--fg2, #94a3b8);
  margin-bottom: 6px;
}

.sidebar-drop-zone .drop-text {
  font-size: 0.72rem;
  color: var(--fg1, #64748b);
  margin: 0;
}

.btn-select-file {
  background-color: transparent;
  color: var(--primary, #3b82f6);
  border: none;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 2px 4px;
  margin-top: 4px;
}

.btn-select-file:hover {
  text-decoration: underline;
}

.sidebar-hint {
  font-size: 0.6rem;
  color: var(--fg2, #94a3b8);
  margin: 4px 0 0 0;
  line-height: 1.3;
}

.detail-main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0; /* Prevents overflow in flex items */
}

.detail-main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px !important;
}

.detail-main-section {
  padding: 20px !important;
}

/* Image Card Flat (Always Visible Actions) */
.image-grid-flat {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 16px;
}

.image-card-flat {
  background-color: var(--bg1, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  transition: all 0.2s ease;
  position: relative;
}

.image-card-flat:hover {
  border-color: var(--fg2, #94a3b8);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.image-card-flat .img-container {
  width: 100%;
  aspect-ratio: 1.4;
  background-color: var(--bg0, #f8fafc);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.image-card-flat .image-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.2s ease;
}

.image-card-flat:hover .image-thumbnail {
  transform: scale(1.03);
}

.image-card-flat .image-card-footer {
  padding: 8px 10px;
  border-top: 1px solid var(--border, #e2e8f0);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  background-color: var(--bg1, #ffffff);
}

.image-card-flat .image-filename {
  font-size: 0.68rem;
  color: var(--fg1, #64748b);
  max-width: 60px;
  font-weight: 550;
}

.image-card-flat .image-actions-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.btn-action-small {
  border: none;
  border-radius: 4px;
  padding: 3px 8px;
  font-size: 0.65rem;
  font-weight: 700;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  text-decoration: none;
  height: 22px;
  box-sizing: border-box;
}

.btn-action-small.btn-view {
  background-color: #e0f2fe;
  color: #0369a1;
}

.btn-action-small.btn-view:hover {
  background-color: #0284c7;
  color: #ffffff;
}

.btn-action-small.btn-move {
  background-color: #f1f5f9;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-action-small.btn-move:hover {
  background-color: #e2e8f0;
  color: #0f172a;
}

.btn-action-small.btn-delete {
  background-color: #fee2e2;
  color: #b91c1c;
}

.btn-action-small.btn-delete:hover {
  background-color: #ef4444;
  color: #ffffff;
}

/* Moving Dropdown Menu positioning for Flat Image Card */
.image-card-flat .move-dropdown-container {
  position: relative;
}

.image-card-flat .move-dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 6px;
  background-color: var(--bg1, #ffffff);
  border: 1px solid var(--border, #e2e8f0);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: none;
  z-index: 50;
  width: 110px;
  max-height: 140px;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 4px 0;
}

.image-card-flat .move-dropdown-container:hover .move-dropdown-menu {
  display: block;
}
</style>
