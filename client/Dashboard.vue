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
                <a :href="getBaseRedirectUrl(currentCollection.name)" target="_blank" class="btn btn-secondary btn-sm ml-2" style="font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; height: 24px; padding: 2px 8px; vertical-align: middle; margin-left: 12px;">
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
    let rawBaseUrl = await send('memesluna/getBaseUrl')
    if (rawBaseUrl) {
      if (rawBaseUrl.startsWith('/')) {
        rawBaseUrl = window.location.origin + rawBaseUrl
      }
      const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
      const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
      if (rawBaseUrl.endsWith(formattedPath)) {
        baseUrl.value = rawBaseUrl.slice(0, -formattedPath.length)
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

  const fileList = Array.from(files)
  const avifFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.avif'))
  if (avifFiles.length > 0) {
    showToast('禁止上传 avif 格式图片，QQ 无法识别该格式', 'error')
    return
  }

  const imageFiles = fileList.filter(f => f.type.startsWith('image/'))
  if (!imageFiles.length) {
    showToast('请选择有效的图片文件', 'error')
    return
  }

  if (imageFiles.length > 50) {
    showToast('单次最多只能上传 50 张图片', 'error')
    return
  }

  const oversizedFiles = imageFiles.filter(f => f.size > 10 * 1024 * 1024)
  if (oversizedFiles.length > 0) {
    showToast('单个图片文件大小不能超过 10MB', 'error')
    return
  }

  showToast(`开始上传 ${imageFiles.length} 张图片...`, 'info')

  try {
    const payloadImages = []
    for (const file of imageFiles) {
      const base64 = await fileToBase64(file)
      payloadImages.push({
        base64,
        originalName: file.name
      })
    }

    const cleanBase = baseUrl.value.endsWith('/') ? baseUrl.value.slice(0, -1) : baseUrl.value
    const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
    const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath

    const response = await fetch(`${cleanBase}${formattedPath}/api/admin/collections/${encodeURIComponent(currentCollection.value.name)}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ images: payloadImages })
    })

    if (response.ok) {
      const resData = await response.json()
      if (resData.ok && resData.uploaded && resData.uploaded.length > 0) {
        showToast(`成功上传 ${resData.uploaded.length} 张图片`, 'success')
      } else {
        showToast('图片上传失败', 'error')
      }
    } else {
      const errData = await response.json().catch(() => ({}))
      showToast(errData.error || '图片上传失败', 'error')
    }
  } catch (err) {
    showToast(`图片上传失败: ${err instanceof Error ? err.message : '网络错误'}`, 'error')
  } finally {
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
/* memesluna-dashboard main panel using premium Notion document & database styles */
.memesluna-dashboard {
  box-sizing: border-box;
  padding: 36px 36px 36px 88px; /* 88px = 64px sidebar + 24px padding */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji";
  background-color: #ffffff;
  color: #37352f;
  min-height: 100vh;
  line-height: 1.5;
}

/* Header style aligning with native sidebar height */
.dashboard-header {
  display: flex;
  flex-direction: row;
  justify-content: space-between;
  align-items: flex-end;
  margin-bottom: 24px;
  padding-bottom: 16px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.09);
  gap: 16px;
  flex-wrap: wrap;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.logo-box {
  background: transparent;
  color: #37352f;
  padding: 0;
  border-radius: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: none;
}

.logo-box svg {
  width: 28px;
  height: 28px;
}

.header-text h1 {
  font-size: 1.5rem;
  font-weight: 600;
  margin: 0;
  color: #37352f;
  line-height: 1.2;
  letter-spacing: -0.02em;
}

.header-text p {
  font-size: 0.85rem;
  color: rgba(55, 53, 47, 0.6);
  margin: 4px 0 0 0;
  font-weight: 400;
}

/* Navigation tabs styled exactly like Notion's Database View Switcher */
.tabs-container {
  display: flex;
  background: transparent;
  padding: 0;
  border-radius: 0;
  border: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
  gap: 6px;
}

.tab-btn {
  border: none;
  background: transparent;
  padding: 4px 8px;
  font-size: 0.85rem;
  font-weight: 500;
  border-radius: 4px;
  color: rgba(55, 53, 47, 0.6);
  cursor: pointer;
  transition: background 0.1s ease, color 0.1s ease;
  border-bottom: 2px solid transparent;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  margin-bottom: -1px;
}

.tab-btn:hover {
  background: rgba(55, 53, 47, 0.04);
  color: #37352f;
}

.tab-btn.active {
  background: transparent;
  color: #37352f;
  border-bottom: 2px solid #37352f;
  box-shadow: none;
  border-radius: 0;
  font-weight: 600;
}

/* Loading state */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 100px 0;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid rgba(55, 53, 47, 0.08);
  border-top-color: rgba(55, 53, 47, 0.6);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container p {
  font-size: 0.85rem;
  color: rgba(55, 53, 47, 0.6);
  margin: 0;
}

/* Responsive Grid layout for endpoints */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 28px;
}

@media (min-width: 1024px) {
  .dashboard-grid {
    grid-template-columns: 320px 1fr;
  }
}

/* Generic Notion Flat Callout/Section Box */
.flat-card {
  background: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  box-shadow: none;
  padding: 20px;
  box-sizing: border-box;
  transition: border-color 0.15s ease, background 0.15s ease;
}

.flat-card:hover {
  border-color: rgba(55, 53, 47, 0.16);
  background: #ffffff;
  box-shadow: none;
  transform: none;
}

.card-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: rgba(55, 53, 47, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.section-desc {
  font-size: 0.8rem;
  color: rgba(55, 53, 47, 0.6);
  margin: 0 0 14px 0;
  line-height: 1.5;
}

/* Notion Code Style: Red-Charcoal text on soft gray-brown background */
.code-url {
  background: rgba(135, 131, 120, 0.15);
  padding: 0.15em 0.3em;
  border-radius: 3px;
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace;
  font-size: 0.78rem;
  color: #eb5757;
  border: none;
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
  font-size: 0.78rem;
  font-weight: 500;
  color: rgba(55, 53, 47, 0.8);
  margin-bottom: 6px;
}

.flat-input,
.flat-select,
.flat-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid rgba(15, 15, 15, 0.1);
  border-radius: 4px;
  background: rgba(242, 241, 237, 0.4);
  color: #37352f;
  font-size: 0.82rem;
  font-family: inherit;
  transition: background 0.1s ease, border-color 0.1s ease;
  outline: none;
}

.flat-input:focus,
.flat-select:focus,
.flat-textarea:focus {
  border-color: #2383e2;
  background: #ffffff;
  box-shadow: none;
}

.flat-input:disabled {
  background: rgba(55, 53, 47, 0.05);
  color: rgba(55, 53, 47, 0.4);
  cursor: not-allowed;
}

.field-hint {
  font-size: 0.7rem;
  color: rgba(55, 53, 47, 0.45);
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

/* Notion flat buttons */
.btn {
  box-sizing: border-box;
  padding: 4px 12px;
  font-size: 0.8rem;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.1s ease, border-color 0.1s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: none;
}

.btn-primary {
  background: #2383e2;
  color: #ffffff;
  box-shadow: none;
}

.btn-primary:hover {
  background: #1a6cb8;
  box-shadow: none;
  transform: none;
}

.btn-primary:active {
  transform: none;
}

.btn-secondary {
  background: #ffffff;
  color: #37352f;
  border: 1px solid rgba(55, 53, 47, 0.16);
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}

.btn-secondary:hover {
  background: rgba(55, 53, 47, 0.04);
  border-color: rgba(55, 53, 47, 0.25);
  color: #37352f;
  transform: none;
}

.btn-danger {
  background: #eb5757;
  color: #ffffff;
  box-shadow: none;
}

.btn-danger:hover {
  background: #d44c4c;
  box-shadow: none;
  transform: none;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

/* Table styling structured like Notion database views */
.table-container {
  overflow-x: auto;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  background: #ffffff;
  box-shadow: none;
}

.flat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8rem;
  text-align: left;
}

.flat-table th {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.09);
  background: #f7f7f5;
  color: rgba(55, 53, 47, 0.6);
  font-weight: 500;
  font-size: 0.75rem;
}

.flat-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
  color: #37352f;
  vertical-align: middle;
}

.flat-table tr:last-child td {
  border-bottom: none;
}

.empty-cell {
  text-align: center;
  padding: 30px !important;
  color: rgba(55, 53, 47, 0.4);
}

.endpoint-name {
  font-weight: 600;
  color: #37352f;
}

.group-badge {
  display: inline-block;
  background-color: rgba(135, 131, 120, 0.15);
  color: #37352f;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.68rem;
  font-weight: 500;
  margin-top: 4px;
  border: none;
}

.cell-desc {
  color: rgba(55, 53, 47, 0.6);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-mono {
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace;
}

.url-line {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 2px;
  flex-wrap: wrap;
}

.method-tag {
  background-color: rgba(35, 131, 226, 0.1);
  color: #2383e2;
  font-size: 0.68rem;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
}

.link-text {
  font-weight: 500;
  color: #2383e2;
  cursor: pointer;
}

.link-text:hover {
  color: #1a6cb8;
  text-decoration: underline;
}

.target-url {
  font-size: 0.72rem;
  color: rgba(55, 53, 47, 0.45);
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
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 4px;
  padding: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(55, 53, 47, 0.6);
  transition: background 0.1s ease, color 0.1s ease;
}

.icon-btn svg {
  width: 14px;
  height: 14px;
}

.icon-btn.hover-bg:hover {
  background-color: rgba(55, 53, 47, 0.04);
  color: #37352f;
  border-color: rgba(55, 53, 47, 0.3);
}

.icon-btn.hover-danger:hover {
  background-color: rgba(235, 87, 87, 0.08);
  border-color: rgba(235, 87, 87, 0.3);
  color: #eb5757;
}

.icon-btn-inline {
  background: transparent;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: rgba(55, 53, 47, 0.4);
  display: inline-flex;
  align-items: center;
}

.icon-btn-inline:hover {
  color: #2383e2;
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

.creator-title {
  min-width: 250px;
}

.creator-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Notion Gallery view items for collections */
.folders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.folder-card {
  background: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: none;
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
  display: flex;
  flex-direction: column;
}

.folder-card:hover {
  transform: none;
  border-color: rgba(55, 53, 47, 0.16);
  background: #fbfbfa;
  box-shadow: none;
}

.folder-header {
  height: 80px;
  background: #f7f7f5;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(55, 53, 47, 0.45);
  transition: background 0.15s ease, color 0.15s ease;
}

.folder-card:hover .folder-header {
  color: rgba(55, 53, 47, 0.6);
  background: #f1f1ef;
}

.folder-header svg {
  width: 32px;
  height: 32px;
  transition: none;
}

.folder-card:hover .folder-header svg {
  transform: none;
  filter: none;
}

.folder-body {
  padding: 12px 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  box-sizing: border-box;
}

.folder-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: #37352f;
  margin-bottom: 4px;
}

.folder-desc {
  font-size: 0.75rem;
  color: rgba(55, 53, 47, 0.6);
  line-height: 1.4;
  height: 34px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-weight: 400;
}

.folder-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(55, 53, 47, 0.06);
}

.folder-meta {
  font-size: 0.7rem;
  color: rgba(55, 53, 47, 0.45);
  font-weight: 500;
}

.folder-manage-link {
  font-size: 0.75rem;
  color: #2383e2;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 2px;
  transition: none;
}

.folder-card:hover .folder-manage-link {
  transform: none;
  text-decoration: underline;
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

.detail-title {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
  color: #37352f;
  display: flex;
  align-items: center;
  gap: 8px;
}

.detail-route {
  font-size: 0.78rem;
  margin: 6px 0 0 0;
  color: rgba(55, 53, 47, 0.6);
  font-weight: 400;
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
  background-color: #f7f7f5;
  padding: 14px;
  border-radius: 6px;
  border: 1px solid rgba(55, 53, 47, 0.09);
  flex-wrap: wrap;
}

.desc-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.6);
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
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  padding: 16px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.panel-header h3 {
  font-size: 0.85rem;
  font-weight: 600;
  color: #37352f;
  margin: 0 0 4px 0;
}

.panel-header p {
  font-size: 0.72rem;
  color: rgba(55, 53, 47, 0.5);
  margin: 0 0 10px 0;
}

/* Upload zone */
.drop-zone {
  border: 1px dashed rgba(55, 53, 47, 0.3);
  border-radius: 6px;
  padding: 20px;
  text-align: center;
  cursor: pointer;
  background-color: rgba(55, 53, 47, 0.02);
  transition: background 0.15s ease, border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: #2383e2;
  background-color: rgba(35, 131, 226, 0.04);
}

.drop-icon {
  width: 24px;
  height: 24px;
  color: rgba(55, 53, 47, 0.4);
  margin-bottom: 6px;
}

.drop-text {
  font-size: 0.78rem;
  font-weight: 500;
  color: #37352f;
  margin: 0;
}

.drop-hint {
  font-size: 0.68rem;
  color: rgba(55, 53, 47, 0.5);
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
  gap: 14px;
}

.gallery-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.6);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.empty-gallery {
  padding: 30px;
  text-align: center;
  color: rgba(55, 53, 47, 0.4);
  background-color: #f7f7f5;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  font-size: 0.78rem;
}

/* Move Dropdown Menu positioning for Flat Image Card */
.image-card-flat .move-dropdown-container {
  position: relative;
  flex: 1;
  display: flex;
}

.image-card-flat .move-dropdown-container .btn-move {
  width: 100%;
}

.image-card-flat .move-dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background-color: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(15, 15, 15, 0.1);
  display: none;
  z-index: 50;
  width: 120px;
  max-height: 150px;
  overflow-y: auto;
  box-sizing: border-box;
  padding: 4px 0;
}

.image-card-flat .move-dropdown-container:hover .move-dropdown-menu {
  display: block;
}

/* Links List Container inside Collection details */
.links-list-container {
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  overflow: hidden;
  box-shadow: none;
}

.link-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
  background-color: #ffffff;
  transition: background-color 0.1s ease;
}

.link-item-row:last-child {
  border-bottom: none;
}

.link-item-row:hover {
  background-color: rgba(55, 53, 47, 0.02);
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
  color: rgba(55, 53, 47, 0.4);
  font-weight: 700;
}

.link-url-text {
  color: rgba(55, 53, 47, 0.7);
  cursor: pointer;
  font-family: SFMono-Regular, Consolas, "Liberation Mono", Menlo, Courier, monospace;
  font-size: 0.75rem;
}

.link-url-text:hover {
  text-decoration: underline;
  color: #2383e2;
}

.link-actions {
  display: flex;
  gap: 6px;
}

.border-t {
  border-top: 1px solid rgba(55, 53, 47, 0.09);
}

/* Toast alert transitions */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

.toast-banner {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(15, 15, 15, 0.1);
  font-size: 0.8rem;
  font-weight: 500;
  background-color: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.16);
  color: #37352f;
}

.toast-banner.success {
  background-color: #f2f9f5;
  border-color: rgba(43, 138, 92, 0.3);
  color: #2b8a5c;
  box-shadow: 0 4px 12px rgba(43, 138, 92, 0.08);
}

.toast-banner.error {
  background-color: #fdf2f2;
  border-color: rgba(235, 87, 87, 0.3);
  color: #eb5757;
  box-shadow: 0 4px 12px rgba(235, 87, 87, 0.08);
}

.toast-icon {
  width: 14px;
  height: 14px;
}

/* Side-by-side vertical split layout */
.collection-detail-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 24px;
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
  font-size: 0.75rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.6);
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.sidebar-sec-desc {
  font-size: 0.72rem;
  color: rgba(55, 53, 47, 0.5);
  margin: 0 0 10px 0;
  line-height: 1.4;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sidebar-drop-zone {
  border: 1px dashed rgba(55, 53, 47, 0.3);
  border-radius: 6px;
  padding: 16px 12px;
  text-align: center;
  cursor: pointer;
  background-color: rgba(55, 53, 47, 0.02);
  transition: background 0.15s ease, border-color 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.sidebar-drop-zone:hover,
.sidebar-drop-zone.drag-over {
  border-color: #2383e2;
  background-color: rgba(35, 131, 226, 0.04);
}

.sidebar-drop-zone .drop-icon {
  width: 24px;
  height: 24px;
  color: rgba(55, 53, 47, 0.4);
  margin-bottom: 6px;
  opacity: 0.85;
}

.sidebar-drop-zone .drop-text {
  font-size: 0.75rem;
  font-weight: 500;
  color: #37352f;
  margin: 0;
}

.btn-select-file {
  background-color: transparent;
  color: #2383e2;
  border: none;
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 4px;
  margin-top: 4px;
}

.btn-select-file:hover {
  text-decoration: underline;
}

.sidebar-hint {
  font-size: 0.65rem;
  color: rgba(55, 53, 47, 0.5);
  margin: 6px 0 0 0;
  line-height: 1.4;
}

.detail-main-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-width: 0;
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

/* Image Card Flat (Always Visible Actions) - Notion Style Gallery */
.image-grid-flat {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 14px;
}

.image-card-flat {
  background: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: none;
  transition: border-color 0.15s ease, background 0.15s ease;
  position: relative;
}

.image-card-flat:hover {
  border-color: rgba(55, 53, 47, 0.16);
  transform: none;
  background: #fbfbfa;
  box-shadow: none;
}

.image-card-flat .img-container {
  width: 100%;
  aspect-ratio: 1.3;
  background-color: #f7f7f5;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
}

.image-card-flat .image-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: none;
}

.image-card-flat:hover .image-thumbnail {
  transform: none;
}

.image-card-flat .image-card-footer {
  padding: 10px;
  border-top: none;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  background: transparent;
}

.image-card-flat .image-filename {
  font-size: 0.75rem;
  color: #37352f;
  font-weight: 500;
  text-align: left;
  word-break: break-all;
}

.image-card-flat .image-actions-row {
  display: flex;
  gap: 6px;
  justify-content: center;
}

.btn-action-small {
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 0.68rem;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s ease;
  text-decoration: none;
  height: 22px;
  box-sizing: border-box;
  flex: 1;
  background: #ffffff;
  color: #37352f;
}

.btn-action-small.btn-view:hover {
  background-color: rgba(55, 53, 47, 0.04);
  color: #37352f;
  transform: none;
}

.btn-action-small.btn-move {
  background-color: #ffffff;
  color: #37352f;
}

.btn-action-small.btn-move:hover {
  background-color: rgba(55, 53, 47, 0.04);
  color: #37352f;
  transform: none;
}

.btn-action-small.btn-delete {
  background-color: #ffffff;
  color: #eb5757;
  border-color: rgba(235, 87, 87, 0.3);
}

.btn-action-small.btn-delete:hover {
  background-color: rgba(235, 87, 87, 0.06);
  color: #eb5757;
  transform: none;
}

/* Moving Dropdown Menu positioning for Flat Image Card */
.image-card-flat .move-dropdown-container {
  position: relative;
  flex: 1;
  display: flex;
}

.image-card-flat .move-dropdown-container .btn-move {
  width: 100%;
}

.image-card-flat .move-dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background-color: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.16);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(15, 15, 15, 0.1);
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

