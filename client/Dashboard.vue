<template>
  <div class="memesluna-app-layout">
    
    <!-- MAIN CONTENT AREA -->
    <main class="notion-content">
      
      <!-- Top Notion Breadcrumbs -->
      <header class="content-breadcrumb-header">
        <div class="breadcrumbs">
          <span class="crumb-root">MemesLuna 控制台</span>
          <span class="crumb-separator">/</span>
          <span class="crumb-parent" v-if="activeMenu === 'resources'">表情包管理</span>
          <span class="crumb-parent" v-else-if="activeMenu === 'distribution'">分发管理</span>
          <span class="crumb-parent" v-else-if="activeMenu === 'settings'">预览</span>
          
          <template v-if="activeMenu === 'resources' && currentCollection">
            <span class="crumb-separator">/</span>
            <span class="crumb-child active">表情包: {{ currentCollection.name }}</span>
          </template>
        </div>
        
        <!-- Quick Stats Banner -->
        <div class="header-quick-stats" v-if="!loading">
          <span class="stat-bubble">📂 表情包总数: {{ collections.length }}</span>
          <span class="stat-bubble">🌐 分发接口: {{ endpoints.length }}</span>
        </div>
      </header>

      <!-- NOTION-STYLE HORIZONTAL VIEW SWITCHER -->
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
          @click="switchMainMenu('settings')"
          :class="['switcher-btn', activeMenu === 'settings' ? 'active' : '']"
        >
          <span class="switcher-icon">👁️</span>
          <span class="switcher-label">预览</span>
        </button>
      </div>

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

      <!-- MAIN ROUTER BODY -->
      <div v-else class="content-body-wrapper">
        
        <!-- MENU VIEW 1: RESOURCES (📦) -->
        <div v-if="activeMenu === 'resources'" class="resources-router-view">
          
          <!-- Collection Lists (Folder view) -->
          <div v-if="!currentCollection" class="collections-folder-view">
            <!-- Creator bar in Notion Style -->
            <div class="notion-db-header">
              <h2 class="notion-db-title">📦 表情包仓库</h2>
              <div class="notion-db-actions">
                <input 
                  v-model="newCollectionName"
                  class="flat-input collection-name-input-notion"
                  placeholder="输入名称并回车创建..." 
                  @keyup.enter="createCollection"
                />
                <button @click="createCollection" class="btn btn-primary btn-notion">
                  + 新建表情包
                </button>
              </div>
            </div>
            <hr class="notion-hr" />

            <!-- Folders grid layout -->
            <div v-if="!collections.length" class="empty-placeholder-card">
              <div class="empty-icon">📁</div>
              <h3>尚未创建任何表情包</h3>
              <p>在右侧输入表情包名称即可快速创建一个新的表情包。</p>
            </div>
            
            <div v-else class="folders-grid">
              <div 
                v-for="item in collections" 
                :key="item.name"
                class="folder-card"
                @click="enterCollectionDetail(item)"
              >
                <div class="folder-header">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                  </svg>
                </div>
                
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

          <!-- Collection Details (Inside details view) -->
          <div 
            v-else 
            class="collection-detail-layout"
            @dragover.prevent="dragOver = true"
          >
            <!-- Notion Document Title Block -->
            <div class="notion-page-header">
              <div class="notion-page-header-left">
                <div class="notion-page-icon">📂</div>
                <div class="notion-page-title-wrapper">
                  <h1 class="notion-page-title">表情包: {{ currentCollection.name }}</h1>
                  <div class="notion-page-meta">
                    API 端点:
                    <code class="code-url" @click="copyToClipboard(getBaseRedirectUrl(currentCollection.name))" title="点击复制完整 URL">
                      {{ getBaseRedirectUrl(currentCollection.name) }}
                    </code>
                  </div>
                </div>
              </div>
              <div class="notion-page-header-right">
                <a :href="getBaseRedirectUrl(currentCollection.name)" target="_blank" class="btn-test-link" title="测试">
                  ⚡ 测试
                </a>
              </div>
            </div>

            <!-- Page Action Toolbar -->
            <div class="notion-page-toolbar">
              <button @click="exitCollectionDetail" class="toolbar-btn">
                ◀ 返回列表
              </button>
              <button @click="refreshCollectionResources" class="toolbar-btn">
                🔄 刷新缓存
              </button>
              <div class="toolbar-divider"></div>
              <button @click="confirmDeleteCollection(currentCollection.name)" class="toolbar-btn danger">
                🗑️ 删除表情包
              </button>
            </div>

            <!-- Notion Page Properties Block -->
            <div class="notion-properties-panel">
              <div class="property-row">
                <div class="property-label">
                  <span class="prop-icon">📝</span> 表情包描述
                </div>
                <div class="property-value">
                  <input 
                    v-model="newDescription" 
                    class="property-input-text" 
                    placeholder="回车或失去焦点即可自动保存描述（帮助 AI 理解该表情包属性）..."
                    @blur="saveCollectionDescription"
                    @keyup.enter="saveCollectionDescription"
                  />
                </div>
              </div>
            </div>

            <!-- Upload and Batch Import Area (Notion Callout style) -->
            <div class="notion-callout upload-callout mt-4">
              <div class="callout-icon">📤</div>
              <div class="callout-content">
                <div class="callout-title">上传与导入图片素材</div>
                <div class="callout-desc">拖放本地图片文件至页面任何位置，或手动选择文件进行上传。单张限制 10MB。</div>
                <div class="callout-actions">
                  <button @click="triggerFileInput" class="btn btn-secondary btn-small">
                    选择本地文件
                  </button>
                  <button @click="showImportLinks = !showImportLinks" class="btn btn-secondary btn-small">
                    {{ showImportLinks ? '收起外链导入' : '批量导入外链' }}
                  </button>
                  <input 
                    ref="fileInput"
                    type="file" 
                    multiple 
                    accept="image/*" 
                    class="hidden-file-input" 
                    @change="onFileSelected"
                  />
                </div>
              </div>
            </div>

            <!-- Drag over drop zone area -->
            <div 
              class="sidebar-drop-zone-overlay"
              v-show="dragOver"
              @dragover.prevent="dragOver = true"
              @dragleave.prevent="dragOver = false"
              @drop.prevent="onDrop"
            >
              <div class="drop-overlay-box">
                <svg class="drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="17 8 12 3 7 8"></polyline>
                  <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <p>释放图片文件以导入此表情包</p>
              </div>
            </div>

            <!-- Links Import area -->
            <div v-show="showImportLinks" class="notion-callout links-import-callout mt-3">
              <div class="callout-icon">🔗</div>
              <div class="callout-content w-full">
                <div class="callout-title">批量导入外链</div>
                <div class="callout-desc">每行输入一个以 http:// 或 https:// 开头的网络图片链接</div>
                <textarea 
                  v-model="externalLinksText"
                  rows="4"
                  class="flat-textarea w-full mt-2"
                  placeholder="每行一个以 http:// 或 https:// 开头的链接"
                ></textarea>
                <div class="callout-actions mt-2">
                  <button @click="addExternalLinks" class="btn btn-primary btn-small">确认导入</button>
                  <button @click="showImportLinks = false" class="btn btn-secondary btn-small">取消</button>
                </div>
              </div>
            </div>

            <!-- Notion database view tabs switcher -->
            <div class="gallery-view-switcher mt-4">
              <button 
                @click="currentGalleryTab = 'local'"
                :class="['gallery-tab-btn', currentGalleryTab === 'local' ? 'active' : '']"
              >
                📁 本地存储图片 ({{ detailResources.images.length }})
              </button>
              <button 
                @click="currentGalleryTab = 'external'"
                :class="['gallery-tab-btn', currentGalleryTab === 'external' ? 'active' : '']"
              >
                🔗 外部链接直链 ({{ detailResources.links.length }})
              </button>
            </div>

            <!-- Tab Content 1: Local Images Gallery -->
            <div v-show="currentGalleryTab === 'local'" class="gallery-tab-content">
              <div v-if="!detailResources.images.length" class="empty-gallery">
                表情包内尚无任何本地图片资源
              </div>
              <div v-else>
                <div class="notion-gallery-grid">
                  <div 
                    v-for="img in paginatedImages" 
                    :key="img"
                    class="notion-gallery-card"
                    :class="{ 'notion-gallery-card-active-dropdown': activeMoveDropdown === img }"
                  >
                    <div 
                      class="gallery-img-container"
                      @click="openImage(getLocalImageApiUrl(currentCollection.name, img))"
                      style="cursor: pointer;"
                      title="在新标签页中打开原图"
                    >
                      <img 
                        :src="getLocalImageApiUrl(currentCollection.name, img)" 
                        class="gallery-img" 
                        loading="lazy" 
                      />
                    </div>

                    <!-- Hover overlay on card (actions) -->
                    <div class="gallery-card-overlay">
                      <div class="overlay-actions">
                        <div 
                          class="card-action-btn move move-dropdown-container"
                          @click.stop="toggleMoveDropdown(img)"
                        >
                          <span>修改</span>
                          <div 
                            class="move-dropdown-menu"
                            v-show="activeMoveDropdown === img"
                          >
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
                          class="card-action-btn danger"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- Pagination bar -->
                <div v-if="totalPages > 1" class="pagination-container">
                  <button 
                    :disabled="currentPage === 1" 
                    @click="currentPage--"
                    class="btn btn-secondary page-btn"
                  >
                    上一页
                  </button>
                  <span class="page-indicator">第 <b>{{ currentPage }}</b> / {{ totalPages }} 页</span>
                  <button 
                    :disabled="currentPage === totalPages" 
                    @click="currentPage++"
                    class="btn btn-secondary page-btn"
                  >
                    下一页
                  </button>
                </div>
              </div>
            </div>

            <!-- Tab Content 2: External Links List -->
            <div v-show="currentGalleryTab === 'external'" class="gallery-tab-content">
              <div v-if="!detailResources.links.length" class="empty-gallery">
                表情包内尚未配置任何外部直链图片
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
                      title="复制直链链接"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                      </svg>
                    </button>
                    <button 
                      @click="deleteExternalLink(currentCollection.name, link)"
                      class="icon-btn hover-danger"
                      title="删除该外链"
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

          </div>
        </div>

        <!-- MENU VIEW 2: DISTRIBUTION (🌐) -->
        <div v-else-if="activeMenu === 'distribution'" class="distribution-router-view">
          <div class="notion-title-row">
            <h1 class="notion-main-title">🌐 接口分发与路由管理</h1>
          </div>
          <p class="section-desc">通过配置以下分发 API 端点，可以用统一的本地路由分发或代理外部直链。</p>
          <hr class="notion-hr" />

          <div class="dashboard-grid">
            
            <!-- Endpoint Editor Form Panel -->
            <div class="notion-form-panel">
              <h2 class="notion-panel-title">
                {{ editingEndpoint ? '📝 编辑分发端点' : '➕ 创建新分发端点' }}
              </h2>
              
              <div class="form-fields">
                <div class="form-group">
                  <label>端点名称 *</label>
                  <input 
                    v-model="endpointForm.name" 
                    :disabled="!!editingEndpoint" 
                    class="flat-input"
                    placeholder="例如: moe" 
                  />
                  <span class="field-hint">只能包含字母、数字、下划线和连字符</span>
                </div>

                <div class="form-group">
                  <label>描述</label>
                  <input 
                    v-model="endpointForm.description" 
                    class="flat-input"
                    placeholder="例如: 萌版横图" 
                  />
                </div>

                <div class="form-group">
                  <label>目标 URL *</label>
                  <input 
                    v-model="endpointForm.url" 
                    class="flat-input"
                    placeholder="https://example.com/api" 
                  />
                </div>

                <div class="form-actions">
                  <button @click="saveEndpoint" class="btn btn-primary flex-grow">
                    {{ editingEndpoint ? '保存修改' : '立即创建' }}
                  </button>
                  <button @click="resetEndpointForm" class="btn btn-secondary">
                    取消
                  </button>
                </div>
              </div>
            </div>

            <!-- Endpoints Table List -->
            <div class="notion-table-panel">
              <div class="table-container">
                <table class="flat-table">
                  <thead>
                    <tr>
                      <th style="width: 20%">名称</th>
                      <th style="width: 25%">描述</th>
                      <th style="width: 40%">访问路径 & 转发目标</th>
                      <th style="width: 15%; text-align: right">管理</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="!endpoints.length">
                      <td colspan="4" class="empty-cell">尚未配置任何转发 API 端点</td>
                    </tr>
                    <tr v-for="item in endpoints" :key="item.name">
                      <td>
                        <div class="endpoint-name">{{ item.name }}</div>
                      </td>
                      <td class="cell-desc" :title="item.description">
                        {{ item.description || '-' }}
                      </td>
                      <td class="font-mono">
                        <div class="url-line">
                          <span class="link-text" @click="copyToClipboard(getBaseRedirectUrl(item.name))">
                            /{{ item.name }}
                          </span>
                          <button @click="copyToClipboard(getBaseRedirectUrl(item.name))" class="icon-btn-inline" title="复制完整链接">
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
                          <a :href="getBaseRedirectUrl(item.name)" target="_blank" class="icon-btn hover-bg" title="测试该端点访问">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                              <polyline points="15 3 21 3 21 9"></polyline>
                              <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                          </a>
                          <button @click="editEndpoint(item)" class="icon-btn hover-bg" title="编辑参数">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                              <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                          </button>
                          <button @click="deleteEndpoint(item.name)" class="icon-btn hover-danger" title="彻底删除">
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
        </div>

        <!-- MENU VIEW 3: PREVIEW (👁️ 预览) -->
        <div v-else-if="activeMenu === 'settings'" class="settings-router-view">
          <div class="settings-centered-layout">

            <!-- Centered: Interactive AI Prompt Variables Preview -->
            <div class="settings-preview-panel">
              <div class="notion-title-row">
                <h1 class="notion-main-title">✨ ChatLuna AI 变量注入预览</h1>
              </div>
              <p class="section-desc">当配置为注入变量时，系统会将当前的表情仓库自动以 Notion 图库的规格变量形式拼接，以下是注入 AI 提示词上下文的真实呈现。</p>
              <hr class="notion-hr" />
              
              <div class="preview-prompt-container mt-4">
                <div class="preview-sub-title">注入变量：{endpoint} (格式化后的可用图床表情包)</div>
                <div class="preview-code-block">
                  <pre v-if="routeInventoryText">{{ routeInventoryText }}</pre>
                  <pre v-else class="text-gray-muted">- 暂无可用表情包及路由，请前往表情包管理或分发管理中创建 -</pre>
                </div>

                <div class="preview-sub-title mt-4">最终组合注入：{memesluna} (发送给 LLM 提示词全貌)</div>
                <div class="preview-code-block final-prompt">
                  <pre v-if="llmPromptPreview">{{ llmPromptPreview }}</pre>
                  <pre v-else class="text-gray-muted">- 正在获取最终提示词预览... -</pre>
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>

    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue'
import { send } from '@koishijs/client'

// Navigation states
const activeMenu = ref<'resources' | 'distribution' | 'settings'>('resources')
const loading = ref(true)

// Core state data
const backendPath = ref('/memesluna')
const baseUrl = ref('http://localhost:5140')
const endpoints = ref<any[]>([])
const collections = ref<any[]>([])
const config = ref<any>(null)

// Endpoint Forms reactivity
const editingEndpoint = ref<any | null>(null)
const endpointForm = reactive({
  name: '',
  group: '',
  description: '',
  url: '',
  method: 'redirect',
  urlConstruction: 'normal'
})

// Collection router states
const newCollectionName = ref('')
const currentCollection = ref<any | null>(null)
const newDescription = ref('')
const externalLinksText = ref('')
const detailResources = reactive({
  images: [] as string[],
  links: [] as string[]
})
const currentGalleryTab = ref<'local' | 'external'>('local')
const showImportLinks = ref(false)

const activeMoveDropdown = ref<string | null>(null)

function toggleMoveDropdown(img: string) {
  if (activeMoveDropdown.value === img) {
    activeMoveDropdown.value = null
  } else {
    activeMoveDropdown.value = img
  }
}

// Pagination reactivity for Images gallery
const currentPage = ref(1)
const pageSize = ref(24)
const totalPages = computed(() => {
  return Math.ceil(detailResources.images.length / pageSize.value)
})
const paginatedImages = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return detailResources.images.slice(start, start + pageSize.value)
})

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
let toastTimer: any = null

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
function switchMainMenu(menu: 'resources' | 'distribution' | 'settings') {
  activeMenu.value = menu
  if (menu === 'settings') {
    fetchSettingsPreview()
  }
}

// Formatting server redirect and resource APIs URLs
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

// Fetch variables from Koishi app
async function fetchState() {
  try {
    // WebUI 始终运行在 Koishi 内嵌服务器上，直接用 window.location.origin 作为 baseUrl
    // selfUrl 是机器人发图用的公网地址，不能用于 WebUI 的 HTTP 接口请求
    baseUrl.value = window.location.origin

    const state = await send('memesluna/getState')
    if (state) {
      if (state.backendPath) backendPath.value = state.backendPath
      endpoints.value = Array.isArray(state.endpoints) ? state.endpoints : []
      collections.value = Array.isArray(state.collections) ? state.collections : []
    }
  } catch (err) {
    showToast(err instanceof Error ? err.message : '获取插件状态同步失败', 'error')
  }
}

async function fetchSettingsPreview() {
  try {
    const cleanBase = baseUrl.value.endsWith('/') ? baseUrl.value.slice(0, -1) : baseUrl.value
    const cleanPath = backendPath.value.startsWith('/') ? backendPath.value : `/${backendPath.value}`
    const formattedPath = cleanPath.endsWith('/') ? cleanPath.slice(0, -1) : cleanPath
    const response = await fetch(`${cleanBase}${formattedPath}/api/homepage-data`)
    if (response.ok) {
      const data = await response.json()
      routeInventoryText.value = data.routeInventory || ''
      llmPromptPreview.value = data.llmPrompt || ''
    }
  } catch (err) {
    console.error('Failed to sync settings variables preview:', err)
  }
}

// Actions: Endpoints
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
    showToast('端点名称和目标直链 URL 均必填', 'error')
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
      showToast('端点路由参数已成功更新', 'success')
    } else {
      await send('memesluna/createEndpoint', payload)
      showToast('接口端点已成功创建', 'success')
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
  if (!confirm(`确认删除端点路由 "${name}" 吗？`)) return

  try {
    loading.value = true
    await send('memesluna/deleteEndpoint', name)
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
  const name = newCollectionName.value.trim()
  if (!name) {
    showToast('表情包名称不能为空', 'error')
    return
  }

  try {
    loading.value = true
    const success = await send('memesluna/createCollection', name)
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
  if (!confirm(`⚠️ 危险操作：确认永久且彻底删除表情包 "${name}"，及其包含的所有本地图片文件吗？此项操作不可逆！`)) return

  try {
    loading.value = true
    await send('memesluna/deleteCollection', name)
    showToast('该表情包资源已彻底销毁删除', 'success')
    currentCollection.value = null
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除失败', 'error')
  } finally {
    loading.value = false
  }
}

async function enterCollectionDetail(item: any) {
  currentCollection.value = item
  newDescription.value = item.description || ''
  externalLinksText.value = ''
  currentPage.value = 1
  await loadCollectionResources(item.name)
}

function exitCollectionDetail() {
  currentCollection.value = null
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
    showToast('加载该表情包下的图片缓存失败', 'error')
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
  showToast('本地及缓存资源数据已刷新成功', 'success')
}

async function saveCollectionDescription() {
  if (!currentCollection.value) return

  try {
    loading.value = true
    await send('memesluna/setCollectionDescription', currentCollection.value.name, newDescription.value.trim())
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

  const fileList = Array.from(files)
  const avifFiles = fileList.filter(f => f.name.toLowerCase().endsWith('.avif'))
  if (avifFiles.length > 0) {
    showToast('已自动拦截 avif 图片。QQ 机器人框架无法渲染及读取此格式。', 'error')
    return
  }

  const imageFiles = fileList.filter(f => f.type.startsWith('image/'))
  if (!imageFiles.length) {
    showToast('请拖入或选择有效的图片格式文件', 'error')
    return
  }

  if (imageFiles.length > 50) {
    showToast('单次上传表情上限为 50 张，请分批次导入', 'error')
    return
  }

  const oversizedFiles = imageFiles.filter(f => f.size > 10 * 1024 * 1024)
  if (oversizedFiles.length > 0) {
    showToast('已拦截大小超出 10MB 的单个图片素材', 'error')
    return
  }

  showToast(`正在转码并上传 ${imageFiles.length} 张表情图片...`, 'info')

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
        showToast(`成功将 ${resData.uploaded.length} 张表情入库并完成数字重命名`, 'success')
      } else {
        showToast('上传图片写入失败', 'error')
      }
    } else {
      const errData = await response.json().catch(() => ({}))
      showToast(errData.error || '上传中继失败', 'error')
    }
  } catch (err) {
    showToast(`上传网络错误: ${err instanceof Error ? err.message : '错误'}`, 'error')
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
    const count = await send('memesluna/addLinks', currentCollection.value.name, text)
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
    await send('memesluna/deleteLink', collectionName, link)
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
    await send('memesluna/deleteLocalImage', collectionName, filename)
    showToast('该本地图片已永久删除', 'success')
    await loadCollectionResources(collectionName)
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '删除失败', 'error')
  } finally {
    loading.value = false
  }
}

async function moveImage(source: string, target: string, filename: string) {
  try {
    loading.value = true
    const newFilename = await send('memesluna/moveLocalImage', source, target, filename)
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

function openImage(url: string) {
  window.open(url, '_blank')
}

const closeDropdowns = () => {
  activeMoveDropdown.value = null
}

// Lifecycle Hooks
onMounted(async () => {
  window.addEventListener('click', closeDropdowns)
  loading.value = true
  await fetchState()
  loading.value = false
})

onUnmounted(() => {
  window.removeEventListener('click', closeDropdowns)
})

// Listeners/Watchers
watch(detailResources, () => {
  // Ensure current page does not go out of bounds on resource change
  if (currentPage.value > totalPages.value && totalPages.value > 0) {
    currentPage.value = totalPages.value
  }
})
</script>

<style scoped>
/* GENERAL ROOT STYLE DESIGNED LIKE SLICK MODERN NOTION DOCUMENT */
.memesluna-app-layout {
  min-height: 100vh;
  padding-left: 64px; /* Offset Koishi's native fixed left sidebar */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Segoe UI Emoji", "Apple Color Emoji";
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-normal, #37352f);
  box-sizing: border-box;
}

.notion-content {
  padding: 24px 32px;
  box-sizing: border-box;
  max-width: 1200px;
  margin: 0 auto;
}

/* Notion Breadcrumb Header */
.content-breadcrumb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.82rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
}

.crumb-root {
  font-weight: 500;
}

.crumb-parent {
  color: var(--k-text-normal, #37352f);
  font-weight: 500;
}

.crumb-child.active {
  color: var(--k-color-primary, #2383e2);
  font-weight: 600;
}

.crumb-separator {
  color: var(--k-color-border, rgba(55, 53, 47, 0.25));
}

.header-quick-stats {
  display: flex;
  gap: 8px;
}

.stat-bubble {
  font-size: 0.72rem;
  font-weight: 500;
  background-color: var(--k-bg-panel, rgba(55, 53, 47, 0.05));
  color: var(--k-text-muted, rgba(55, 53, 47, 0.65));
  padding: 2px 8px;
  border-radius: 4px;
}

/* Notion Horizontal View Switcher */
.notion-view-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  margin-bottom: 24px;
  padding-bottom: 2px;
}

.switcher-btn {
  background: transparent;
  border: none;
  padding: 6px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 4px;
  transition: background 0.1s ease, color 0.1s ease;
  border-bottom: 2px solid transparent;
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
  margin-bottom: -1px;
}

.switcher-btn:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.04));
  color: var(--k-text-normal, #37352f);
}

.switcher-btn.active {
  color: var(--k-text-normal, #37352f);
  border-bottom: 2px solid var(--k-text-normal, #37352f);
  font-weight: 600;
  border-radius: 0;
}

.switcher-icon {
  font-size: 0.95rem;
}

/* Notion Title and Database Header */
.notion-db-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 12px;
  margin-bottom: 12px;
}

.notion-db-title {
  font-size: 1.2rem;
  font-weight: 600;
  margin: 0;
  color: var(--k-text-normal, #37352f);
}

.notion-db-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collection-name-input-notion {
  width: 200px;
  height: 28px;
  font-size: 0.78rem;
}

.btn-notion {
  height: 28px;
  padding: 0 10px;
  font-size: 0.78rem;
}

.notion-hr {
  border: none;
  border-top: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.09));
  margin: 8px 0 20px 0;
}

/* Folders Grid & Cards */
.folders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 16px;
}

.folder-card {
  background: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.09));
  border-radius: 6px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, background-color 0.15s ease;
  display: flex;
  flex-direction: column;
}

.folder-card:hover {
  border-color: var(--k-color-primary, #2383e2);
  background-color: var(--k-bg-button-hover, #fbfbfa);
}

.folder-header {
  height: 80px;
  background-color: var(--k-bg-panel, #f7f7f5);
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.06));
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.4));
}

.folder-card:hover .folder-header {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  background-color: var(--k-bg-button-hover, #f1f1ef);
}

.folder-header svg {
  width: 28px;
  height: 28px;
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
  color: var(--k-text-normal, #37352f);
  margin-bottom: 4px;
}

.folder-desc {
  font-size: 0.75rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  line-height: 1.4;
  height: 34px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.folder-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.06));
}

.folder-meta {
  font-size: 0.68rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
  font-weight: 500;
}

.folder-manage-link {
  font-size: 0.72rem;
  color: var(--k-color-primary, #2383e2);
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 2px;
}

.folder-card:hover .folder-manage-link {
  text-decoration: underline;
}

.chevron-right {
  width: 8px;
  height: 8px;
}

/* Notion Page Title & Header Block */
.notion-page-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-top: 12px;
  margin-bottom: 16px;
}

.notion-page-header-left {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.notion-page-header-right {
  display: flex;
  align-items: center;
  align-self: flex-end;
  margin-bottom: 2px;
}

.notion-page-icon {
  font-size: 2.2rem;
  user-select: none;
}

.notion-page-title-wrapper {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.notion-page-title {
  font-size: 1.6rem;
  font-weight: 700;
  margin: 0;
  color: var(--k-text-normal, #37352f);
}

.notion-page-meta {
  font-size: 0.78rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.code-url {
  background-color: var(--k-bg-panel, rgba(135, 131, 120, 0.15));
  padding: 2px 6px;
  border-radius: 3px;
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.75rem;
  color: #eb5757;
  cursor: pointer;
  transition: background 0.1s ease;
}

.code-url:hover {
  background-color: var(--k-bg-button-hover, rgba(135, 131, 120, 0.25));
}

.btn-test-link {
  font-size: 0.72rem;
  font-weight: 600;
  background-color: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.15));
  border-radius: 4px;
  padding: 1px 6px;
  color: var(--k-text-normal, #37352f);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}

.btn-test-link:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.04));
}

/* Notion Page Action Toolbar */
.notion-page-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  padding-bottom: 8px;
}

.toolbar-btn {
  background: transparent;
  border: none;
  font-size: 0.78rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.6));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: 500;
  transition: all 0.1s ease;
}

.toolbar-btn:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.04));
  color: var(--k-text-normal, #37352f);
}

.toolbar-btn.danger {
  color: #eb5757;
}

.toolbar-btn.danger:hover {
  background-color: rgba(235, 87, 87, 0.08);
}

.toolbar-divider {
  width: 1px;
  height: 14px;
  background-color: var(--k-color-border, rgba(55, 53, 47, 0.12));
}

/* Notion Properties Panel */
.notion-properties-panel {
  margin-bottom: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.property-row {
  display: flex;
  align-items: center;
  font-size: 0.82rem;
}

.property-label {
  width: 110px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
  display: flex;
  align-items: center;
  gap: 6px;
  user-select: none;
}

.prop-icon {
  font-size: 0.95rem;
}

.property-value {
  flex: 1;
}

.property-input-text {
  border: none;
  background: transparent;
  font-size: 0.82rem;
  color: var(--k-text-normal, #37352f);
  width: 100%;
  padding: 4px 8px;
  border-radius: 4px;
  box-sizing: border-box;
  font-family: inherit;
  transition: background 0.1s ease;
}

.property-input-text:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.03));
}

.property-input-text:focus {
  background-color: var(--k-bg-card, #ffffff);
  box-shadow: inset 0 0 0 1px var(--k-color-primary, #2383e2);
  outline: none;
}

/* Notion Callout Box (Upload controls) */
.notion-callout {
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 4px;
  background-color: var(--k-bg-panel, rgba(242, 241, 237, 0.45));
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
}

.callout-icon {
  font-size: 1.15rem;
  user-select: none;
}

.callout-content {
  flex: 1;
  min-width: 0;
}

.callout-title {
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--k-text-normal, #37352f);
  margin-bottom: 2px;
}

.callout-desc {
  font-size: 0.75rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
  margin-bottom: 10px;
  line-height: 1.4;
}

.callout-actions {
  display: flex;
  gap: 8px;
}

.btn-small {
  font-size: 0.75rem;
  padding: 2px 10px;
  height: 24px;
}

.hidden-file-input {
  display: none;
}

/* Drag Over Overlay */
.sidebar-drop-zone-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 9999;
  background-color: rgba(255, 255, 255, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  box-sizing: border-box;
}

.drop-overlay-box {
  border: 2px dashed var(--k-color-primary, #2383e2);
  background-color: rgba(35, 131, 226, 0.04);
  border-radius: 8px;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--k-color-primary, #2383e2);
  font-size: 1.1rem;
  font-weight: 500;
}

.drop-overlay-box .drop-icon {
  width: 48px;
  height: 48px;
  margin-bottom: 16px;
}

/* Notion database gallery switcher tabs */
.gallery-view-switcher {
  display: flex;
  gap: 16px;
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.09));
  padding-bottom: 2px;
}

.gallery-tab-btn {
  background: transparent;
  border: none;
  font-size: 0.82rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
  cursor: pointer;
  padding-bottom: 6px;
  border-bottom: 2px solid transparent;
  font-weight: 500;
  transition: all 0.1s ease;
}

.gallery-tab-btn:hover {
  color: var(--k-text-normal, #37352f);
}

.gallery-tab-btn.active {
  color: var(--k-text-normal, #37352f);
  border-bottom-color: var(--k-text-normal, #37352f);
}

.gallery-tab-content {
  margin-top: 16px;
}

/* Notion Gallery view grid & cards */
.notion-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.notion-gallery-card {
  background: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  border-radius: 4px;
  position: relative;
  aspect-ratio: 1;
  transition: border-color 0.12s ease;
  box-shadow: none;
}

.notion-gallery-card:hover {
  border-color: var(--k-color-primary, #2383e2);
}

.gallery-img-container {
  width: 100%;
  height: 100%;
  background-color: var(--k-bg-panel, #f7f7f5);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 4px;
}

.gallery-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* Hover overlay on top of square image card */
.gallery-card-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.22) 0%,
    rgba(0, 0, 0, 0) 35%,
    rgba(0, 0, 0, 0) 100%
  );
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
  z-index: 10;
}

.notion-gallery-card:hover .gallery-card-overlay,
.notion-gallery-card-active-dropdown .gallery-card-overlay {
  opacity: 1;
}

.overlay-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  pointer-events: auto;
}

.overlay-actions .card-action-btn {
  border: none;
  background-color: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(2px);
  color: var(--k-text-normal, #37352f);
  font-size: 0.65rem;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
  transition: all 0.1s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-actions .card-action-btn.move:hover {
  background: #2b8a5c;
  color: #ffffff;
}

.overlay-actions .card-action-btn.danger {
  color: #eb5757;
}

.overlay-actions .card-action-btn.danger:hover {
  background: #eb5757;
  color: #ffffff;
}

/* Notion Inputs/Select/Textarea inputs */
.flat-input,
.flat-select,
.flat-textarea {
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid var(--k-color-border, rgba(15, 15, 15, 0.12));
  border-radius: 4px;
  background: var(--k-bg-panel, rgba(242, 241, 237, 0.45));
  color: var(--k-text-normal, #37352f);
  font-size: 0.82rem;
  font-family: inherit;
  transition: background 0.1s ease, border-color 0.1s ease;
  outline: none;
}

.flat-input:focus,
.flat-select:focus,
.flat-textarea:focus {
  border-color: var(--k-color-primary, #2383e2);
  background: var(--k-bg-card, #ffffff);
  box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.15);
}

.flat-input:disabled {
  background: var(--k-bg-panel, rgba(55, 53, 47, 0.05));
  color: var(--k-text-muted, rgba(55, 53, 47, 0.4));
  cursor: not-allowed;
}

.field-hint {
  font-size: 0.7rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
  margin-top: 4px;
  display: block;
}

/* Notion Buttons styling */
.btn {
  box-sizing: border-box;
  padding: 4px 14px;
  font-size: 0.82rem;
  font-weight: 500;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.1s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 32px;
  border: none;
}

.btn-primary {
  background-color: var(--k-color-primary, #2383e2);
  color: #ffffff;
}

.btn-primary:hover {
  background-color: #1a6cb8;
}

.btn-secondary {
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-normal, #37352f);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.16));
}

.btn-secondary:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.04));
}

.btn-danger {
  background-color: #eb5757;
  color: #ffffff;
}

.btn-danger:hover {
  background-color: #d44c4c;
}

.w-full {
  width: 100%;
}

.mt-2 { margin-top: 8px; }
.mt-3 { margin-top: 12px; }
.mt-4 { margin-top: 16px; }

/* Empty state placeholders */
.empty-placeholder-card {
  padding: 60px 20px;
  text-align: center;
  border: 1px dashed var(--k-color-border, rgba(55, 53, 47, 0.2));
  border-radius: 8px;
  background-color: var(--k-bg-panel, rgba(55, 53, 47, 0.01));
}

.empty-icon {
  font-size: 2.5rem;
  margin-bottom: 12px;
}

.empty-placeholder-card h3 {
  font-size: 0.95rem;
  margin: 0 0 6px 0;
  font-weight: 600;
}

.empty-placeholder-card p {
  font-size: 0.78rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
  margin: 0;
}

.empty-gallery {
  padding: 36px;
  text-align: center;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.4));
  background-color: var(--k-bg-panel, #f7f7f5);
  border-radius: 6px;
  font-size: 0.78rem;
}

/* Move dropdown menu */
.move-dropdown-container {
  position: relative;
}

.move-dropdown-menu {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  background-color: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.15));
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(15, 15, 15, 0.15);
  z-index: 100;
  min-width: 120px;
  width: max-content;
  box-sizing: border-box;
}

.dropdown-item {
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  padding: 4px 6px;
  font-size: 0.68rem;
  cursor: pointer;
  color: var(--k-text-normal, #37352f);
}

.dropdown-item:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.04));
}

/* Pagination container styles */
.pagination-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.06));
}

.page-indicator {
  font-size: 0.78rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.6));
}

.page-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 0.75rem;
}

/* Direct link lists */
.links-list-container {
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.09));
  border-radius: 6px;
  overflow: hidden;
}

.link-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.06));
  background-color: var(--k-bg-card, #ffffff);
}

.link-item-row:last-child {
  border-bottom: none;
}

.link-item-row:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.015));
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
  color: var(--k-text-muted, rgba(55, 53, 47, 0.35));
  font-weight: 700;
}

.link-url-text {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.65));
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.75rem;
  cursor: pointer;
}

.link-url-text:hover {
  color: var(--k-color-primary, #2383e2);
  text-decoration: underline;
}

.link-actions {
  display: flex;
  gap: 6px;
}

/* VIEW 2: DISTRIBUTION / ENDPOINT GRID */
.dashboard-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 24px;
}

@media (min-width: 960px) {
  .dashboard-grid {
    grid-template-columns: 300px 1fr;
  }
}

.notion-form-panel {
  padding: 12px 0;
}

.notion-panel-title {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--k-text-normal, #37352f);
}

.form-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.65));
  margin-bottom: 4px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

/* Notion Database table view for endpoints */
.notion-table-panel {
  padding: 12px 0;
}

.table-container {
  overflow-x: auto;
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  border-radius: 6px;
  background-color: var(--k-bg-card, #ffffff);
}

.flat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.flat-table th {
  padding: 8px 12px;
  background-color: var(--k-bg-panel, #f7f7f5);
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
  text-align: left;
}

.flat-table td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.05));
  text-align: left;
}

.flat-table tr:last-child td {
  border-bottom: none;
}

.empty-cell {
  text-align: center;
  padding: 40px !important;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.35));
}

.endpoint-name {
  font-weight: 600;
}

.group-badge {
  display: inline-block;
  background-color: var(--k-bg-panel, rgba(55, 53, 47, 0.06));
  color: var(--k-text-muted, rgba(55, 53, 47, 0.6));
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 500;
  margin-top: 4px;
}

.cell-desc {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.method-tag {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
  margin-right: 6px;
}

.method-tag.redirect {
  background-color: rgba(35, 131, 226, 0.1);
  color: #2383e2;
}

.method-tag.proxy {
  background-color: rgba(43, 138, 92, 0.1);
  color: #2b8a5c;
}

.link-text {
  font-weight: 500;
  color: var(--k-color-primary, #2383e2);
  cursor: pointer;
}

.link-text:hover {
  text-decoration: underline;
}

.target-url {
  font-size: 0.72rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.4));
  max-width: 300px;
  margin-top: 2px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.icon-btn {
  background: transparent;
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.15));
  border-radius: 4px;
  padding: 3px;
  cursor: pointer;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  display: inline-flex;
}

.icon-btn svg {
  width: 12px;
  height: 12px;
}

.icon-btn.hover-bg:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.04));
  color: var(--k-text-normal, #37352f);
}

.icon-btn.hover-danger:hover {
  background-color: rgba(235, 87, 87, 0.05);
  border-color: rgba(235, 87, 87, 0.25);
  color: #eb5757;
}

.icon-btn-inline {
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.35));
  display: inline-flex;
  padding: 0;
  vertical-align: middle;
}

.icon-btn-inline:hover {
  color: var(--k-color-primary, #2383e2);
}

.icon-btn-inline svg {
  width: 10px;
  height: 10px;
}

/* VIEW 3: PREVIEW LAYOUT — single centered column */
.settings-centered-layout {
  display: flex;
  justify-content: center;
  padding: 0 16px;
}

.settings-centered-layout .settings-preview-panel {
  width: 100%;
  max-width: 720px;
}

.preview-prompt-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-sub-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
  text-transform: uppercase;
}

.preview-code-block {
  background-color: var(--k-bg-panel, #faf9f6);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  border-radius: 6px;
  padding: 12px;
  max-height: 150px;
  overflow-y: auto;
}

.preview-code-block pre {
  margin: 0;
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.72rem;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--k-text-normal, #27272a);
}

.preview-code-block.final-prompt {
  max-height: 250px;
  background-color: rgba(35, 131, 226, 0.02);
  border-color: rgba(35, 131, 226, 0.12);
}

.preview-code-block.final-prompt pre {
  color: #1e3a8a;
}

.text-gray-muted {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.35));
  font-style: italic;
}

/* Toast banner alerts */
.toast-banner {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 10000;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border-radius: 6px;
  font-size: 0.78rem;
  font-weight: 500;
  background-color: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.15));
  box-shadow: 0 4px 16px rgba(15, 15, 15, 0.1);
  color: var(--k-text-normal, #37352f);
}

.toast-banner.success {
  background-color: #f2f9f5;
  border-color: rgba(43, 138, 92, 0.25);
  color: #2b8a5c;
}

.toast-banner.error {
  background-color: #fdf2f2;
  border-color: rgba(235, 87, 87, 0.25);
  color: #eb5757;
}

.toast-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

/* Loading spin animations */
.loading-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 80px 0;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  border-top-color: var(--k-text-normal, rgba(55, 53, 47, 0.6));
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-container p {
  font-size: 0.78rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
  margin: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
