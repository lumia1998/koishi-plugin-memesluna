<template>
  <div class="memesluna-app-layout">
    
    <!-- MAIN CONTENT AREA (No vertical sidebar, perfectly integrated with Koishi native sidebar) -->
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
            <span class="crumb-child active">合集: {{ currentCollection.name }}</span>
          </template>
        </div>
        
        <!-- Quick Stats Banner -->
        <div class="header-quick-stats" v-if="!loading">
          <span class="stat-bubble">📂 合集总数: {{ collections.length }}</span>
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
            <!-- Creator bar card -->
            <div class="flat-card creator-bar">
              <div class="creator-title">
                <h2 class="card-title">📦 表情包合集仓库</h2>
              </div>
              
              <div class="creator-form">
                <input 
                  v-model="newCollectionName"
                  class="flat-input collection-name-input"
                  placeholder="新建合集名称 (限字母/拼音)" 
                  @keyup.enter="createCollection"
                />
                <button @click="createCollection" class="btn btn-primary">
                  新建合集
                </button>
              </div>
            </div>

            <!-- Folders grid layout -->
            <div v-if="!collections.length" class="empty-placeholder-card">
              <div class="empty-icon">📁</div>
              <h3>尚未创建任何表情合集</h3>
              <p>在上方输入合集名称即可快速创建一个新的图床合集。</p>
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

          <!-- Collection Card Details (Inside details view) -->
          <div v-else class="collection-detail-layout">
            
            <!-- Left Sidebar controls for this collection -->
            <aside class="detail-sidebar">
              
              <!-- Card 1: Main Control Actions -->
              <div class="flat-card sidebar-section">
                <h3 class="sidebar-sec-title">合集控制</h3>
                <div class="sidebar-actions">
                  <button @click="exitCollectionDetail" class="btn btn-secondary w-full py-2 flex items-center justify-center gap-2">
                    <svg class="back-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <line x1="19" y1="12" x2="5" y2="12"></line>
                      <polyline points="12 19 5 12 12 5"></polyline>
                    </svg>
                    返回合集列表
                  </button>
                  <button @click="confirmDeleteCollection(currentCollection.name)" class="btn btn-danger w-full mt-2">
                    永久删除合集
                  </button>
                </div>
              </div>

              <!-- Card 2: Collection Description -->
              <div class="flat-card sidebar-section mt-4">
                <h3 class="sidebar-sec-title">合集描述信息</h3>
                <p class="sidebar-sec-desc">该描述将注入 ChatLuna 变量 {memesluna}，帮助 AI 理解本合集的表情包属性。</p>
                <div class="sidebar-desc-form">
                  <textarea 
                    v-model="newDescription" 
                    class="flat-textarea w-full" 
                    rows="3"
                    placeholder="请输入对合集包的详细描述，例如: 丛雨的可爱表情包，常用于日常撒娇聊天等背景。" 
                  ></textarea>
                  <button @click="saveCollectionDescription" class="btn btn-primary w-full mt-2">
                    保存描述
                  </button>
                </div>
              </div>

              <!-- Card 3: Batch Upload Images -->
              <div class="flat-card sidebar-section mt-4">
                <h3 class="sidebar-sec-title">上传图片 (本地/云端)</h3>
                
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
                  <p class="drop-text">拖放图片文件至此</p>
                  <span class="btn-select-file">或手动选择文件</span>
                  
                  <input 
                    ref="fileInput"
                    type="file" 
                    multiple 
                    accept="image/*" 
                    class="hidden-file-input" 
                    @change="onFileSelected"
                  />
                </div>
                <p class="sidebar-hint mt-2">单次最多上传 50 张，单图最大限制 10MB。自动拒绝 AVIF 格式以适配 QQ 显示。</p>
              </div>

              <!-- Card 4: Add Picture Links -->
              <div class="flat-card sidebar-section mt-4">
                <h3 class="sidebar-sec-title">批量导入外链</h3>
                <p class="sidebar-sec-desc">支持导入直链作为表情素材分发</p>
                <div class="links-form">
                  <textarea 
                    v-model="externalLinksText"
                    rows="3"
                    class="flat-textarea w-full"
                    placeholder="每行一个以 http:// 或 https:// 开头的网络图片链接"
                  ></textarea>
                  
                  <button @click="addExternalLinks" class="btn btn-primary w-full mt-2">
                    确认添加外链
                  </button>
                </div>
              </div>

            </aside>

            <!-- Right content area for this collection -->
            <main class="detail-main-content">
              
              <!-- Collection header card -->
              <div class="flat-card detail-main-header">
                <div class="detail-header-left">
                  <h2 class="detail-title">
                    合集名: {{ currentCollection.name }}
                  </h2>
                  <p class="detail-route">
                    随机分发 API 端点：
                    <code class="code-url" @click="copyToClipboard(getBaseRedirectUrl(currentCollection.name))">
                      {{ getBaseRedirectUrl(currentCollection.name) }}
                    </code>
                    <a :href="getBaseRedirectUrl(currentCollection.name)" target="_blank" class="btn-test-link" title="点此在新窗口中测试抽取">
                      ⚡ 测试
                    </a>
                  </p>
                </div>
                
                <div class="detail-header-actions">
                  <button @click="refreshCollectionResources" class="btn btn-secondary">
                    🔄 刷新数据缓存
                  </button>
                </div>
              </div>

              <!-- Local Images gallery section with Virtual Pagination -->
              <div class="flat-card detail-main-section mt-4">
                <h3 class="gallery-title">📁 本地存储图片 ({{ detailResources.images.length }} 张)</h3>

                <div v-if="!detailResources.images.length" class="empty-gallery">
                  合集内尚无任何本地图片资源
                </div>
                
                <div v-else>
                  <div class="image-grid-flat">
                    <div 
                      v-for="img in paginatedImages" 
                      :key="img"
                      class="image-card-flat"
                    >
                      <div class="img-container">
                        <img 
                          :src="getLocalImageApiUrl(currentCollection.name, img)" 
                          class="image-thumbnail" 
                          loading="lazy" 
                        />
                      </div>
                      
                      <div class="image-card-footer">
                        <span class="image-filename truncate" :title="img">{{ img }}</span>
                        
                        <!-- Row 1: Move dropdown (Full Width) -->
                        <div class="move-dropdown-container">
                          <button class="btn-action-small btn-move">
                            <span>移动至</span>
                            <svg class="chevron-down" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
                          </button>
                          <!-- Move Target Dropdown menu -->
                          <div class="move-dropdown-menu">
                            <div class="dropdown-header">选择合集:</div>
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

                        <!-- Row 2: View and Delete (Side by Side) -->
                        <div class="image-actions-row">
                          <button 
                            @click.stop="openImage(getLocalImageApiUrl(currentCollection.name, img))"
                            class="btn-action-small btn-view"
                          >
                            原图
                          </button>
                          
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

              <!-- Links Direct Links gallery section -->
              <div class="flat-card detail-main-section mt-4">
                <h3 class="gallery-title">🔗 外部链接直链 ({{ detailResources.links.length }} 条)</h3>

                <div v-if="!detailResources.links.length" class="empty-gallery">
                  合集内尚未配置任何外部直链图片
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

            </main>
          </div>
        </div>

        <!-- MENU VIEW 2: DISTRIBUTION (🌐) -->
        <div v-else-if="activeMenu === 'distribution'" class="distribution-router-view">
          <div class="dashboard-grid">
            
            <!-- Endpoint Editor Form Panel -->
            <div class="flat-card form-panel">
              <h2 class="card-title">
                {{ editingEndpoint ? '📝 编辑分发端点' : '➕ 创建新分发端点' }}
              </h2>
              
              <div class="form-fields">
                <div class="form-group">
                  <label>接口端点名称 *</label>
                  <input 
                    v-model="endpointForm.name" 
                    :disabled="!!editingEndpoint" 
                    class="flat-input"
                    placeholder="例如: random_avatar" 
                  />
                  <span class="field-hint">端点建立后不可更改。此项将成为本地转发路由的基础访问后缀。</span>
                </div>

                <div class="form-group">
                  <label>目标重定向目标直链 URL *</label>
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
                    placeholder="例如: 角色表情、系统内置" 
                  />
                </div>

                <div class="form-group">
                  <label>端点功能描述</label>
                  <input 
                    v-model="endpointForm.description" 
                    class="flat-input"
                    placeholder="简述此端点的抽取内容，例如: 随机动漫头像生成" 
                  />
                </div>

                <div class="form-row">
                  <div class="form-group flex-1">
                    <label>分发转发方法</label>
                    <select v-model="endpointForm.method" class="flat-select">
                      <option value="redirect">302 重定向</option>
                      <option value="proxy">反向代理 (直接输入图片流)</option>
                    </select>
                  </div>

                  <div class="form-group flex-1">
                    <label>接口拼接模式</label>
                    <select v-model="endpointForm.urlConstruction" class="flat-select">
                      <option value="normal">标准 URL 查询参数</option>
                      <option value="special_forward">参数 URL 特殊代转</option>
                      <option value="special_pollinations">AI 绘图端点直连</option>
                    </select>
                  </div>
                </div>

                <div class="form-actions">
                  <button @click="saveEndpoint" class="btn btn-primary flex-grow">
                    {{ editingEndpoint ? '保存修改' : '立即创建' }}
                  </button>
                  <button @click="resetEndpointForm" class="btn btn-secondary">
                    重置取消
                  </button>
                </div>
              </div>
            </div>

            <!-- Endpoints Table List -->
            <div class="flat-card list-panel">
              <h2 class="card-title">已配置的跳转与分发 API 路由列表</h2>
              <p class="section-desc">客户端或机器人通过以下本地 URL 即可获取中继分发，系统将进行高性能重定向或真实数据流吐出。</p>

              <div class="table-container">
                <table class="flat-table">
                  <thead>
                    <tr>
                      <th style="width: 20%">名称 / 分组</th>
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
                        <span class="group-badge">{{ item.group || '默认分组' }}</span>
                      </td>
                      <td class="cell-desc" :title="item.description">
                        {{ item.description || '-' }}
                      </td>
                      <td class="font-mono">
                        <div class="url-line">
                          <span class="method-tag" :class="item.method">{{ item.method || 'redirect' }}</span>
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
            <div class="flat-card settings-preview-panel">
              <h2 class="card-title">✨ ChatLuna AI 变量注入预览</h2>
              <p class="section-desc">当配置为注入变量时，系统会将当前的表情仓库自动拼接为指定规格格式，以下是注入 AI 提示词上下文的真实呈现。</p>
              
              <div class="preview-prompt-container mt-4">
                <div class="preview-sub-title">注入变量：{endpoint} (格式化后的可用图床合集)</div>
                <div class="preview-code-block">
                  <pre v-if="routeInventoryText">{{ routeInventoryText }}</pre>
                  <pre v-else class="text-gray-muted">- 暂无可用合集及路由，请前往表情包管理或分发管理中创建 -</pre>
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
import { ref, reactive, computed, onMounted, watch } from 'vue'
import { send } from '@koishijs/client'

// Navigation states
const activeMenu = ref<'resources' | 'distribution' | 'settings'>('settings')
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
    showToast('表情包合集名称不能为空', 'error')
    return
  }

  try {
    loading.value = true
    const success = await send('memesluna/createCollection', name)
    if (!success) {
      showToast('该名称的合集已存在，请更换其他名称', 'error')
      return
    }
    showToast('表情包合集已成功创建', 'success')
    newCollectionName.value = ''
    await fetchState()
  } catch (err) {
    showToast(err instanceof Error ? err.message : '创建失败', 'error')
  } finally {
    loading.value = false
  }
}

async function confirmDeleteCollection(name: string) {
  if (!confirm(`⚠️ 危险操作：确认永久且彻底删除表情包合集 "${name}"，及其包含的所有本地图片文件吗？此项操作不可逆！`)) return

  try {
    loading.value = true
    await send('memesluna/deleteCollection', name)
    showToast('该合集资源已彻底销毁删除', 'success')
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
    showToast('加载该合集下的图片缓存失败', 'error')
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
    showToast('合集描述已成功保存', 'success')
    await fetchState()
    const match = collections.value.find(c => c.name === currentCollection.value.name)
    if (match) currentCollection.value = match
  } catch (err) {
    showToast(err instanceof Error ? err.message : '保存合集描述失败', 'error')
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
      showToast(`已将素材移动至合集 "${target}" 并重命名`, 'success')
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

// Lifecycle Mounted
onMounted(async () => {
  loading.value = true
  await fetchState()
  // Default tab is 'settings' (preview), so fetch preview data on mount
  await fetchSettingsPreview()
  loading.value = false
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
  padding-left: 64px; /* Offset Koishi's native fixed left sidebar to prevent overlap */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, "Apple Color Emoji", Arial, sans-serif, "Segoe UI Emoji";
  background-color: #ffffff;
  color: #37352f;
  box-sizing: border-box;
}

/* RIGHT MAIN VIEW CONTENT */
.notion-content {
  background-color: #ffffff;
  padding: 24px 32px;
  box-sizing: border-box;
}

/* Notion Premium Breadcrumb Header */
.content-breadcrumb-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.08);
}

.breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.88rem;
  color: rgba(55, 53, 47, 0.55);
}

.crumb-root {
  font-weight: 500;
}

.crumb-parent {
  color: #37352f;
  font-weight: 500;
}

.crumb-child.active {
  color: #2383e2;
  font-weight: 600;
}

.crumb-separator {
  color: rgba(55, 53, 47, 0.25);
  font-weight: 400;
}

.header-quick-stats {
  display: flex;
  gap: 8px;
}

.stat-bubble {
  font-size: 0.75rem;
  font-weight: 500;
  background-color: rgba(55, 53, 47, 0.05);
  color: rgba(55, 53, 47, 0.65);
  padding: 2px 8px;
  border-radius: 4px;
}

/* Notion-style Horizontal View Switcher */
.notion-view-switcher {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.08);
  margin-bottom: 24px;
  padding-bottom: 2px;
}

.switcher-btn {
  background: transparent;
  border: none;
  padding: 6px 16px;
  font-size: 0.85rem;
  font-weight: 500;
  color: rgba(55, 53, 47, 0.6);
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
  background-color: rgba(55, 53, 47, 0.04);
  color: #37352f;
}

.switcher-btn.active {
  color: #37352f;
  border-bottom: 2px solid #37352f;
  font-weight: 600;
  border-radius: 0;
}

.switcher-icon {
  font-size: 0.95rem;
}

/* General Layout Items */
.content-body-wrapper {
  animation: fadeIn 0.15s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* Generic Card style matching Notion simplicity */
.flat-card {
  background: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  padding: 20px;
  box-sizing: border-box;
}

.card-title {
  font-size: 0.85rem;
  font-weight: 600;
  margin: 0 0 8px 0;
  color: rgba(55, 53, 47, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.section-desc {
  font-size: 0.78rem;
  color: rgba(55, 53, 47, 0.55);
  margin: 0 0 16px 0;
  line-height: 1.55;
}

/* CREATOR BARS */
.creator-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 24px;
}

.creator-title {
  max-width: 500px;
}

.creator-form {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collection-name-input {
  width: 260px;
}

/* Notion Input/Forms elements */
.flat-input,
.flat-select,
.flat-textarea {
  box-sizing: border-box;
  padding: 6px 10px;
  border: 1px solid rgba(15, 15, 15, 0.12);
  border-radius: 4px;
  background: rgba(242, 241, 237, 0.45);
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
  box-shadow: 0 0 0 2px rgba(35, 131, 226, 0.15);
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
  display: block;
}

/* Premium Buttons */
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
  background-color: #2383e2;
  color: #ffffff;
}

.btn-primary:hover {
  background-color: #1a6cb8;
}

.btn-secondary {
  background-color: #ffffff;
  color: #37352f;
  border: 1px solid rgba(55, 53, 47, 0.16);
}

.btn-secondary:hover {
  background-color: rgba(55, 53, 47, 0.04);
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
  border: 1px dashed rgba(55, 53, 47, 0.2);
  border-radius: 8px;
  background-color: rgba(55, 53, 47, 0.01);
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
  color: rgba(55, 53, 47, 0.5);
  margin: 0;
}

/* FOLDERS GRID IN COLLECTIONS */
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
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  flex-direction: column;
}

.folder-card:hover {
  border-color: rgba(55, 53, 47, 0.16);
  background-color: #fbfbfa;
}

.folder-header {
  height: 80px;
  background-color: #f7f7f5;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(55, 53, 47, 0.4);
}

.folder-card:hover .folder-header {
  color: rgba(55, 53, 47, 0.55);
  background-color: #f1f1ef;
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
  color: #37352f;
  margin-bottom: 4px;
}

.folder-desc {
  font-size: 0.75rem;
  color: rgba(55, 53, 47, 0.55);
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
  border-top: 1px solid rgba(55, 53, 47, 0.06);
}

.folder-meta {
  font-size: 0.68rem;
  color: rgba(55, 53, 47, 0.45);
  font-weight: 500;
}

.folder-manage-link {
  font-size: 0.72rem;
  color: #2383e2;
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

/* COLLECTION DETAIL VIEWS & SPLIT LAYOUT */
.collection-detail-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 24px;
  align-items: start;
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
  color: rgba(55, 53, 47, 0.55);
  margin: 0 0 8px 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.sidebar-sec-desc {
  font-size: 0.72rem;
  color: rgba(55, 53, 47, 0.48);
  margin: 0 0 8px 0;
  line-height: 1.45;
}

.sidebar-actions {
  display: flex;
  flex-direction: column;
}

.back-icon {
  width: 12px;
  height: 12px;
}

.sidebar-drop-zone {
  border: 1px dashed rgba(55, 53, 47, 0.35);
  border-radius: 6px;
  padding: 18px 12px;
  text-align: center;
  cursor: pointer;
  background-color: rgba(55, 53, 47, 0.015);
  transition: all 0.12s ease;
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
  width: 20px;
  height: 20px;
  color: rgba(55, 53, 47, 0.35);
  margin-bottom: 6px;
}

.sidebar-drop-zone .drop-text {
  font-size: 0.75rem;
  font-weight: 500;
  margin: 0;
}

.btn-select-file {
  font-size: 0.72rem;
  color: #2383e2;
  font-weight: 500;
  margin-top: 4px;
  display: inline-block;
}

.btn-select-file:hover {
  text-decoration: underline;
}

.hidden-file-input {
  display: none;
}

.sidebar-hint {
  font-size: 0.65rem;
  color: rgba(55, 53, 47, 0.48);
  margin: 6px 0 0 0;
  line-height: 1.4;
}

/* Detail view right main container */
.detail-main-content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.detail-main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px !important;
}

.detail-title {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0;
  color: #37352f;
}

.detail-route {
  font-size: 0.78rem;
  margin: 6px 0 0 0;
  color: rgba(55, 53, 47, 0.55);
}

.code-url {
  background-color: rgba(135, 131, 120, 0.15);
  padding: 0.15em 0.35em;
  border-radius: 3px;
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.78rem;
  color: #eb5757;
  cursor: pointer;
}

.code-url:hover {
  background-color: rgba(135, 131, 120, 0.25);
}

.btn-test-link {
  font-size: 0.75rem;
  font-weight: 600;
  background-color: #f7f7f5;
  border: 1px solid rgba(55, 53, 47, 0.15);
  border-radius: 4px;
  padding: 2px 8px;
  color: #37352f;
  text-decoration: none;
  margin-left: 8px;
  display: inline-flex;
  align-items: center;
}

.btn-test-link:hover {
  background-color: rgba(55, 53, 47, 0.04);
}

.gallery-title {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.5);
  margin: 0 0 14px 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.empty-gallery {
  padding: 36px;
  text-align: center;
  color: rgba(55, 53, 47, 0.4);
  background-color: #f7f7f5;
  border-radius: 6px;
  font-size: 0.78rem;
}

/* Image gallery flat grid — fixed 5 columns */
.image-grid-flat {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 14px;
}

@media (max-width: 1100px) {
  .image-grid-flat {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 800px) {
  .image-grid-flat {
    grid-template-columns: repeat(3, 1fr);
  }
}

.image-card-flat {
  background: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.08);
  border-radius: 10px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: all 0.18s ease;
  position: relative;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.image-card-flat:hover {
  border-color: rgba(35, 131, 226, 0.25);
  box-shadow: 0 4px 12px rgba(35, 131, 226, 0.08);
  transform: translateY(-1px);
}

.img-container {
  width: 100%;
  aspect-ratio: 1;
  background-color: #f7f7f5;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  border-bottom: 1px solid rgba(55, 53, 47, 0.05);
}

.image-thumbnail {
  width: 100%;
  height: 100%;
  object-fit: contain;
  transition: transform 0.2s ease;
}

.image-card-flat:hover .image-thumbnail {
  transform: scale(1.04);
}

.image-card-footer {
  padding: 8px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: #ffffff;
}

.image-filename {
  font-size: 0.7rem;
  color: rgba(55, 53, 47, 0.7);
  font-weight: 500;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  display: block;
  letter-spacing: 0.01em;
}

/* Row 1: Move dropdown button */
.move-dropdown-container {
  position: relative;
  width: 100%;
}

.move-dropdown-container .btn-move {
  width: 100%;
}

/* Row 2: View + Delete side by side */
.image-actions-row {
  display: flex;
  gap: 5px;
}

/* Base button style */
.btn-action-small {
  border: none;
  border-radius: 6px;
  padding: 0 8px;
  font-size: 0.68rem;
  font-weight: 600;
  cursor: pointer;
  height: 24px;
  flex: 1;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  white-space: nowrap;
  transition: all 0.12s ease;
  letter-spacing: 0.01em;
}

/* View (原图) — neutral grey pill */
.btn-action-small.btn-view {
  background-color: rgba(55, 53, 47, 0.06);
  color: rgba(55, 53, 47, 0.75);
}

.btn-action-small.btn-view:hover {
  background-color: rgba(55, 53, 47, 0.11);
  color: #37352f;
}

/* Delete (删除) — soft red */
.btn-action-small.btn-delete {
  background-color: rgba(235, 87, 87, 0.08);
  color: #c0392b;
}

.btn-action-small.btn-delete:hover {
  background-color: rgba(235, 87, 87, 0.18);
  color: #eb5757;
}

/* Move (移动至) — blue accent, full width */
.btn-action-small.btn-move {
  background: linear-gradient(135deg, rgba(35, 131, 226, 0.1), rgba(35, 131, 226, 0.06));
  color: #2383e2;
  border: 1px solid rgba(35, 131, 226, 0.2);
}

.btn-action-small.btn-move:hover {
  background: linear-gradient(135deg, rgba(35, 131, 226, 0.18), rgba(35, 131, 226, 0.12));
  border-color: rgba(35, 131, 226, 0.35);
}

.chevron-down {
  width: 9px;
  height: 9px;
  flex-shrink: 0;
  opacity: 0.7;
}

.move-dropdown-menu {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 4px;
  background-color: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.15);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(15, 15, 15, 0.1);
  display: none;
  z-index: 50;
  width: 100px;
  max-height: 120px;
  overflow-y: auto;
  box-sizing: border-box;
}

.move-dropdown-container:hover .move-dropdown-menu {
  display: block;
}

.dropdown-header {
  font-size: 0.62rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.4);
  padding: 4px 6px;
  text-transform: uppercase;
}

.dropdown-item {
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  padding: 4px 6px;
  font-size: 0.68rem;
  cursor: pointer;
  color: #37352f;
}

.dropdown-item:hover {
  background-color: rgba(55, 53, 47, 0.04);
}

/* Pagination container styles */
.pagination-container {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid rgba(55, 53, 47, 0.06);
}

.page-indicator {
  font-size: 0.78rem;
  color: rgba(55, 53, 47, 0.6);
}

.page-btn {
  height: 28px;
  padding: 0 10px;
  font-size: 0.75rem;
}

/* Direct link lists */
.links-list-container {
  border: 1px solid rgba(55, 53, 47, 0.09);
  border-radius: 6px;
  overflow: hidden;
}

.link-item-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.06);
  background-color: #ffffff;
}

.link-item-row:last-child {
  border-bottom: none;
}

.link-item-row:hover {
  background-color: rgba(55, 53, 47, 0.015);
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
  color: rgba(55, 53, 47, 0.35);
  font-weight: 700;
}

.link-url-text {
  color: rgba(55, 53, 47, 0.65);
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.75rem;
  cursor: pointer;
}

.link-url-text:hover {
  color: #2383e2;
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

.form-panel {
  padding: 20px;
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
  color: rgba(55, 53, 47, 0.65);
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
.table-container {
  overflow-x: auto;
  border: 1px solid rgba(55, 53, 47, 0.08);
  border-radius: 6px;
  background-color: #ffffff;
}

.flat-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.78rem;
}

.flat-table th {
  padding: 8px 12px;
  background-color: #f7f7f5;
  border-bottom: 1px solid rgba(55, 53, 47, 0.08);
  color: rgba(55, 53, 47, 0.55);
  font-weight: 600;
  font-size: 0.72rem;
  text-transform: uppercase;
}

.flat-table td {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(55, 53, 47, 0.05);
}

.flat-table tr:last-child td {
  border-bottom: none;
}

.empty-cell {
  text-align: center;
  padding: 40px !important;
  color: rgba(55, 53, 47, 0.35);
}

.endpoint-name {
  font-weight: 600;
}

.group-badge {
  display: inline-block;
  background-color: rgba(55, 53, 47, 0.06);
  color: rgba(55, 53, 47, 0.6);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.65rem;
  font-weight: 500;
  margin-top: 4px;
}

.cell-desc {
  color: rgba(55, 53, 47, 0.55);
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
  color: #2383e2;
  cursor: pointer;
}

.link-text:hover {
  text-decoration: underline;
}

.target-url {
  font-size: 0.72rem;
  color: rgba(55, 53, 47, 0.4);
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
  border: 1px solid rgba(55, 53, 47, 0.15);
  border-radius: 4px;
  padding: 3px;
  cursor: pointer;
  color: rgba(55, 53, 47, 0.55);
  display: inline-flex;
}

.icon-btn svg {
  width: 12px;
  height: 12px;
}

.icon-btn.hover-bg:hover {
  background-color: rgba(55, 53, 47, 0.04);
  color: #37352f;
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
  color: rgba(55, 53, 47, 0.35);
  display: inline-flex;
  padding: 0;
  vertical-align: middle;
}

.icon-btn-inline:hover {
  color: #2383e2;
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

.settings-read-only-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.metric-card {
  padding: 12px 16px;
  background-color: #faf9f6;
  border: 1px solid rgba(55, 53, 47, 0.08);
  border-radius: 6px;
}

.metric-title {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.45);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.metric-value {
  font-size: 0.85rem;
  font-weight: 500;
  color: #37352f;
}

.preview-prompt-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.preview-sub-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: rgba(55, 53, 47, 0.45);
  text-transform: uppercase;
}

.preview-code-block {
  background-color: #faf9f6;
  border: 1px solid rgba(55, 53, 47, 0.08);
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
  color: #27272a;
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
  color: rgba(55, 53, 47, 0.35);
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
  background-color: #ffffff;
  border: 1px solid rgba(55, 53, 47, 0.15);
  box-shadow: 0 4px 16px rgba(15, 15, 15, 0.1);
  color: #37352f;
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
  font-size: 0.78rem;
  color: rgba(55, 53, 47, 0.5);
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
