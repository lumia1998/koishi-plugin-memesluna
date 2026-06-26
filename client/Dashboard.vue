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
          <span class="crumb-parent" v-else-if="activeMenu === 'staging'">暂缓区</span>
          
          <template v-if="activeMenu === 'resources' && currentCollection">
            <span class="crumb-separator">/</span>
            <span class="crumb-child active">表情包: {{ currentCollection.name }}</span>
          </template>
        </div>
        
        <!-- Quick Stats Banner -->
        <div class="header-quick-stats" v-if="!loading">
          <span class="stat-bubble">📂 表情包总数: {{ collections.length }}</span>
          <span class="stat-bubble">🌐 分发接口: {{ endpoints.length }}</span>
          <span class="stat-bubble">🕓 暂缓候选: {{ stagedImages.length }}</span>
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
          <div v-if="!currentCollection && !currentTagView" class="collections-folder-view">
            <!-- Creator bar in Notion Style -->
            <div class="notion-db-header page-section-header collection-list-header">
              <div>
                <h1 class="notion-main-title">表情包管理</h1>
                <p class="section-desc compact">管理表情包合集与图片素材</p>
              </div>
              <div class="notion-db-actions collection-toolbar">
                <!-- View toggle: collection / tag -->
                <div class="view-toggle-pill" title="切换合集视图/标签视图">
                  <button
                    :class="['pill-btn', activeResourceView === 'collection' ? 'active' : '']"
                    @click="activeResourceView = 'collection'"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    合集
                  </button>
                  <button
                    :class="['pill-btn', activeResourceView === 'tag' ? 'active' : '']"
                    @click="switchToTagView"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                      <path d="M7 7h.01"></path>
                    </svg>
                    标签
                  </button>
                </div>
                <div class="collection-search-shell">
                  <svg class="collection-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <circle cx="11" cy="11" r="8"></circle>
                    <path d="m21 21-4.3-4.3"></path>
                  </svg>
                  <input
                    v-model="collectionSearchQuery"
                    class="flat-input collection-search-input"
                    placeholder="搜索表情包合集..."
                  />
                </div>
                <label class="collection-filter-shell">
                  <svg class="collection-toolbar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 4h18l-7 8v6l-4 2v-8z"></path>
                  </svg>
                  <select v-model="collectionFilter" class="flat-select collection-filter-select" aria-label="筛选表情包合集">
                    <option value="all">全部</option>
                    <option value="local">仅本地</option>
                    <option value="external">含外链</option>
                  </select>
                </label>
                <button @click="createCollection" class="btn btn-primary btn-notion">
                  <span class="btn-plus">+</span>
                  新建表情包
                </button>
              </div>
            </div>
            <hr class="notion-hr" />

            <!-- Folders grid layout -->
            <div v-if="!collections.length" v-show="activeResourceView === 'collection'" class="empty-placeholder-card">
              <div class="empty-icon">📁</div>
              <h3>尚未创建任何表情包</h3>
              <p>点击右上角按钮即可快速创建一个新的表情包合集。</p>
            </div>

            <div v-else-if="!filteredCollections.length" v-show="activeResourceView === 'collection'" class="empty-placeholder-card">
              <div class="empty-icon">🔎</div>
              <h3>没有匹配的表情包合集</h3>
              <p>换个关键词或筛选条件再试试。</p>
            </div>

            <div v-show="activeResourceView === 'collection'" v-else class="folders-grid">
              <div
                v-for="item in filteredCollections"
                :key="item.name"
                class="folder-card"
                @click="enterCollectionDetail(item)"
              >
                <div :class="['folder-cover', getCollectionCardPreviewImages(item.name).length ? 'has-preview' : 'empty']">
                  <template v-if="getCollectionCardPreviewImages(item.name).length">
                    <img
                      v-for="src in getCollectionCardPreviewImages(item.name)"
                      :key="src"
                      :src="src"
                      class="folder-cover-img"
                      loading="lazy"
                      :alt="`${item.name} 预览图`"
                    />
                  </template>
                  <div v-else class="folder-cover-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                  </div>
                  <span v-if="getCollectionPreviewState(item.name)?.loading" class="folder-cover-badge">同步中</span>
                </div>
                
                <div class="folder-body">
                  <div class="folder-title-row">
                    <div class="folder-name" :title="item.description || item.name">{{ item.name }}</div>
                    <button class="folder-more-btn" title="更多操作" @click.stop="toggleCollectionMenu(item.name)">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="5" cy="12" r="1"></circle>
                        <circle cx="12" cy="12" r="1"></circle>
                        <circle cx="19" cy="12" r="1"></circle>
                      </svg>
                    </button>
                    <div v-if="activeCollectionMenu === item.name" class="folder-action-menu" @click.stop>
                      <button @click="enterCollectionDetail(item)">打开详情</button>
                      <button class="danger" @click="confirmDeleteCollection(item.name)">删除表情包</button>
                    </div>
                  </div>
                  <div class="folder-info-row">
                    <div class="folder-count">{{ item.totalCount }} 张图片</div>
                    <div class="folder-meta-row">
                      <span class="folder-meta-item">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                        </svg>
                        本地 {{ item.localCount }} · 外链 {{ item.linkCount }}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tag View (alternative to collection grid) -->
            <div v-if="activeResourceView === 'tag'" class="tag-view-section">
              <div v-if="tagSummaryLoading" class="loading-container">
                <div class="spinner"></div>
                <p>加载标签数据...</p>
              </div>
              <div v-else-if="!tagSummary.length" class="empty-placeholder-card">
                <div class="empty-icon">🏷️</div>
                <h3>暂无标签</h3>
                <p>开启 AI 标注后，上传图片时会自动生成标签，也可以手动为图片添加标签。</p>
              </div>
              <div v-else class="folders-grid">
                <div
                  v-for="item in tagSummary"
                  :key="item.tag"
                  class="folder-card"
                  @click="filterByTag(item.tag)"
                >
                  <div class="folder-cover preview-count-4">
                    <template v-if="item.previewUrls.length">
                      <img
                        v-for="(src, idx) in item.previewUrls.slice(0, 4)"
                        :key="idx"
                        :src="src"
                        class="folder-cover-img"
                        loading="lazy"
                      />
                    </template>
                    <div v-else class="folder-cover-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                        <path d="M7 7h.01"></path>
                      </svg>
                    </div>
                  </div>
                  <div class="folder-body">
                    <div class="folder-title-row">
                      <div class="folder-name">{{ item.tag }}</div>
                    </div>
                    <div class="folder-info-row">
                      <div class="folder-count">{{ item.count }} 张图片</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Tag Detail View (cross-collection images by tag) -->
          <div v-if="currentTagView" class="tag-detail-view">
            <div class="detail-topbar">
              <div class="detail-breadcrumbs">
                <button @click="exitTagView" class="detail-back-btn" title="返回标签列表">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="m15 18-6-6 6-6"></path>
                  </svg>
                  返回标签列表
                </button>
                <span class="detail-separator">/</span>
                <span class="detail-crumb-current">#{{ currentTagView }}</span>
                <span class="detail-separator">/</span>
                <span class="detail-crumb-strong">{{ currentTagImages.length }} 张图片</span>
              </div>
            </div>

            <div v-if="tagImagesLoading" class="loading-container">
              <div class="spinner"></div>
              <p>加载图片...</p>
            </div>

            <div v-else-if="!currentTagImages.length" class="empty-placeholder-card">
              <div class="empty-icon">🏷️</div>
              <h3>没有找到带此标签的图片</h3>
            </div>

            <div v-else class="tag-images-grid notion-gallery-grid">
              <div
                v-for="item in currentTagImages"
                :key="item.collection + '/' + item.filename"
                class="notion-gallery-card"
              >
                <div class="gallery-img-container">
                  <img :src="item.imageUrl" class="gallery-img" loading="lazy" />
                </div>
                <div class="gallery-card-footer">
                  <div class="gallery-card-collection" :title="item.collection">{{ item.collection }}</div>
                  <div class="gallery-card-tags">
                    <span
                      v-for="tag in item.tags"
                      :key="tag"
                      :class="['mini-tag', tag === currentTagView ? 'active-tag' : '']"
                      @click.stop="filterByTag(tag)"
                    >{{ tag }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Collection Details (Inside details view) -->
          <div
            v-else-if="currentCollection"
            class="collection-detail-layout"
            @dragover.prevent="dragOver = true"
          >
            <div class="asset-detail-shell">
              <div class="detail-topbar">
                <div class="detail-breadcrumbs">
                  <button @click="exitCollectionDetail" class="detail-back-btn" title="返回列表">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="m15 18-6-6 6-6"></path>
                    </svg>
                    返回列表
                  </button>
                  <span class="detail-separator">/</span>
                  <span class="detail-crumb-current">{{ currentCollection.name }}</span>
                  <span class="detail-separator">/</span>
                  <span class="detail-crumb-strong">图片素材</span>
                </div>

                <div class="detail-top-actions">
                  <button @click="refreshCollectionResources" class="asset-btn secondary" title="刷新缓存">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path>
                      <path d="M3 21v-5h5"></path>
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path>
                      <path d="M16 8h5V3"></path>
                    </svg>
                    刷新缓存
                  </button>
                  <button @click="triggerFileInput" class="asset-btn primary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <path d="m17 8-5-5-5 5"></path>
                      <path d="M12 3v12"></path>
                    </svg>
                    上传图片
                  </button>
                  <button @click="showImportLinks = !showImportLinks" class="asset-btn secondary">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    导入外链
                  </button>
                  <button @click="confirmDeleteCollection(currentCollection.name)" class="asset-btn danger ghost" title="删除表情包">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 6h18"></path>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
                      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
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

              <section class="asset-hero-panel">
                <div class="asset-identity-card">
                  <div class="asset-avatar-frame">
                    <img v-if="currentCollectionCoverUrl" :src="currentCollectionCoverUrl" class="asset-avatar-img" :alt="`${currentCollection.name} 封面`" />
                    <div v-else class="asset-avatar-empty">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                      </svg>
                    </div>
                  </div>
                  <div class="asset-title-stack">
                    <div class="asset-title-row">
                      <h1>{{ currentCollection.name }}</h1>
                      <span class="asset-pill">本地</span>
                    </div>
                    <input
                      v-model="newDescription"
                      class="asset-description-input"
                      placeholder="添加表情包描述"
                      @blur="saveCollectionDescription"
                      @keyup.enter="saveCollectionDescription"
                    />
                    <div class="asset-meta-line">
                      <span>创建于 {{ formatDate(currentCollection.createdAt) }}</span>
                      <span>最后更新 {{ formatDate(currentCollection.updatedAt) }}</span>
                      <span>共 {{ currentCollectionTotalCount }} 张图片</span>
                    </div>
                  </div>
                </div>

                <div class="asset-api-card">
                  <div class="asset-card-label">API 调用地址</div>
                  <div class="asset-api-row">
                    <code>{{ currentCollectionApiUrl }}</code>
                    <button @click="testCurrentCollectionApi" class="asset-test-btn" :disabled="apiPreviewLoading">
                      <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z"></path>
                      </svg>
                      {{ apiPreviewLoading ? '测试中' : '测试接口' }}
                    </button>
                  </div>
                  <div class="asset-api-hint">直接访问该链接将随机返回一张表情图片</div>
                  <div v-if="apiPreviewUrl" class="api-preview-strip">
                    <img :src="apiPreviewUrl" alt="API 返回图片预览" />
                    <span>随机预览</span>
                  </div>
                </div>

              </section>

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

              <div v-show="showImportLinks" class="asset-import-panel">
                <div class="asset-import-header">
                  <div>
                    <div class="asset-import-title">导入外链图片</div>
                    <div class="asset-import-desc">每行一个以 http:// 或 https:// 开头的图片链接</div>
                  </div>
                  <button @click="showImportLinks = false" class="asset-icon-btn compact" title="关闭导入面板">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M18 6 6 18"></path>
                      <path d="m6 6 12 12"></path>
                    </svg>
                  </button>
                </div>
                <textarea 
                  v-model="externalLinksText"
                  rows="4"
                  class="asset-link-textarea"
                  placeholder="每行一个以 http:// 或 https:// 开头的链接"
                ></textarea>
                <div class="asset-import-actions">
                  <button @click="addExternalLinks" class="asset-btn primary">确认导入</button>
                  <button @click="showImportLinks = false" class="asset-btn secondary">取消</button>
                </div>
              </div>

              <!-- Tag Editor Dialog -->
              <div v-if="tagEditorVisible" class="tag-editor-overlay" @click.self="closeTagEditor">
                <div class="tag-editor-dialog">
                  <div class="tag-editor-header">
                    <div>
                      <div class="tag-editor-title">编辑标注 & 标签</div>
                      <div class="tag-editor-subtitle">{{ tagEditorCollection }} / {{ tagEditorImage }}</div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center;">
                      <button 
                        @click="triggerAIAnnotation" 
                        class="btn btn-secondary btn-small"
                        :disabled="aiAnnotating || tagEditorSaving"
                        style="display: flex; align-items: center; gap: 4px; padding: 4px 8px; font-size: 12px;"
                      >
                        <svg v-if="aiAnnotating" class="animate-spin" viewBox="0 0 24 24" fill="none" width="12" height="12" style="margin-right: 2px;">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" style="opacity: 0.25;"></circle>
                          <path d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4z" fill="currentColor"></path>
                        </svg>
                        <span v-else>✨</span>
                        {{ aiAnnotating ? '自动标注中...' : 'AI 自动标注' }}
                      </button>
                      <button @click="closeTagEditor" class="icon-btn hover-bg" :disabled="aiAnnotating || tagEditorSaving">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                          <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div class="tag-editor-body" style="display: flex; flex-direction: column; gap: 16px;">
                    <!-- Tags Section -->
                    <div class="tag-section-wrapper" style="border-bottom: 1px solid rgba(120, 120, 120, 0.15); padding-bottom: 14px;">
                      <div class="tag-section-label" style="font-weight: 600; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>🏷️</span>
                        <span>路由标签 (Tags)</span>
                        <span style="font-size: 11px; font-weight: normal; color: var(--k-text-muted, #888); margin-left: 4px;">用于跨合集路由随机返回</span>
                      </div>
                      <div class="tag-editor-list" style="margin-bottom: 8px; min-height: 36px; display: flex; flex-wrap: wrap; gap: 6px;">
                        <span
                          v-for="tag in tagEditorTags"
                          :key="tag"
                          class="tag-editor-tag"
                        >
                          {{ tag }}
                          <button @click="removeTagFromEditor(tag)" class="tag-remove-btn" :disabled="tagEditorSaving || aiAnnotating">×</button>
                        </span>
                        <span v-if="!tagEditorTags.length" class="tag-editor-empty" style="color: var(--k-text-muted, #888); font-size: 12px; font-style: italic;">暂无标签</span>
                      </div>
                      <div class="tag-editor-input-row" style="display: flex; gap: 8px;">
                        <input
                          v-model="tagEditorInput"
                          class="flat-input tag-editor-input"
                          list="allowed-tags-list"
                          placeholder="选择或输入唯一候选标签"
                          @keyup.enter="addTagFromEditor"
                          :disabled="tagEditorSaving || aiAnnotating"
                          style="flex-grow: 1;"
                        />
                        <datalist id="allowed-tags-list">
                          <option v-for="tag in allowedCandidates" :key="tag" :value="tag" />
                        </datalist>
                        <button @click="addTagFromEditor" class="btn btn-secondary btn-small" :disabled="!tagEditorInput.trim() || tagEditorSaving || aiAnnotating">
                          添加
                        </button>
                      </div>
                    </div>

                    <!-- Aliases Section -->
                    <div class="tag-section-wrapper">
                      <div class="tag-section-label" style="font-weight: 600; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>🔍</span>
                        <span>检索别名 (Aliases)</span>
                        <span style="font-size: 11px; font-weight: normal; color: var(--k-text-muted, #888); margin-left: 4px;">用于合集内 q=关键词 语义检索</span>
                      </div>
                      <div class="tag-editor-list" style="margin-bottom: 8px; min-height: 36px; display: flex; flex-wrap: wrap; gap: 6px;">
                        <span
                          v-for="alias in tagEditorAliases"
                          :key="alias"
                          class="tag-editor-tag"
                          style="background-color: var(--k-bg-panel, rgba(120, 120, 120, 0.08)); border-color: transparent;"
                        >
                          {{ alias }}
                          <button @click="removeAliasFromEditor(alias)" class="tag-remove-btn" :disabled="tagEditorSaving || aiAnnotating">×</button>
                        </span>
                        <span v-if="!tagEditorAliases.length" class="tag-editor-empty" style="color: var(--k-text-muted, #888); font-size: 12px; font-style: italic;">暂无别名</span>
                      </div>
                      <div class="tag-editor-input-row" style="display: flex; gap: 8px;">
                        <input
                          v-model="aliasEditorInput"
                          class="flat-input tag-editor-input"
                          placeholder="添加搜索短语别名，回车添加"
                          @keyup.enter="addAliasFromEditor"
                          :disabled="tagEditorSaving || aiAnnotating"
                          style="flex-grow: 1;"
                        />
                        <button @click="addAliasFromEditor" class="btn btn-secondary btn-small" :disabled="!aliasEditorInput.trim() || tagEditorSaving || aiAnnotating">
                          添加
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bulk Tag Editor Dialog -->
              <div v-if="bulkTagEditorVisible" class="tag-editor-overlay" @click.self="bulkTagEditorVisible = false">
                <div class="tag-editor-dialog">
                  <div class="tag-editor-header">
                    <div>
                      <div class="tag-editor-title">批量设置标签 & 别名</div>
                      <div class="tag-editor-subtitle">已选择 {{ selectedImages.length }} 张图片</div>
                    </div>
                    <button @click="bulkTagEditorVisible = false" class="icon-btn hover-bg" :disabled="bulkTagEditorSaving">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                        <path d="M18 6 6 18"></path><path d="m6 6 12 12"></path>
                      </svg>
                    </button>
                  </div>
                  <div class="tag-editor-body" style="display: flex; flex-direction: column; gap: 16px;">
                    <!-- Operation Mode Toggle -->
                    <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(120, 120, 120, 0.15); padding-bottom: 12px;">
                      <span style="font-size: 13px; font-weight: 600;">操作模式</span>
                      <div class="view-toggle-pill" style="margin: 0;">
                        <button
                          :class="['pill-btn', bulkTagOperationMode === 'add' ? 'active' : '']"
                          @click="bulkTagOperationMode = 'add'"
                          style="font-size: 12px; padding: 4px 8px;"
                        >
                          追加标签
                        </button>
                        <button
                          :class="['pill-btn', bulkTagOperationMode === 'replace' ? 'active' : '']"
                          @click="bulkTagOperationMode = 'replace'"
                          style="font-size: 12px; padding: 4px 8px;"
                        >
                          覆盖标签
                        </button>
                      </div>
                    </div>

                    <!-- Tags Section -->
                    <div class="tag-section-wrapper" style="border-bottom: 1px solid rgba(120, 120, 120, 0.15); padding-bottom: 14px;">
                      <div class="tag-section-label" style="font-weight: 600; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>🏷️</span>
                        <span>批量添加标签 (Tags)</span>
                      </div>
                      <div class="tag-editor-list" style="margin-bottom: 8px; min-height: 36px; display: flex; flex-wrap: wrap; gap: 6px;">
                        <span
                          v-for="tag in bulkTagEditorTags"
                          :key="tag"
                          class="tag-editor-tag"
                        >
                          {{ tag }}
                          <button @click="removeTagFromBulkEditor(tag)" class="tag-remove-btn" :disabled="bulkTagEditorSaving">×</button>
                        </span>
                        <span v-if="!bulkTagEditorTags.length" class="tag-editor-empty" style="color: var(--k-text-muted, #888); font-size: 12px; font-style: italic;">等待添加标签</span>
                      </div>
                      <div class="tag-editor-input-row" style="display: flex; gap: 8px;">
                        <input
                          v-model="bulkTagEditorInput"
                          class="flat-input tag-editor-input"
                          list="allowed-tags-list"
                          placeholder="选择或输入唯一候选标签"
                          @keyup.enter="addTagToBulkEditor"
                          :disabled="bulkTagEditorSaving"
                          style="flex-grow: 1;"
                        />
                        <button @click="addTagToBulkEditor" class="btn btn-secondary btn-small" :disabled="!bulkTagEditorInput.trim() || bulkTagEditorSaving">
                          添加
                        </button>
                      </div>
                    </div>

                    <!-- Aliases Section -->
                    <div class="tag-section-wrapper">
                      <div class="tag-section-label" style="font-weight: 600; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>🔍</span>
                        <span>批量添加别名 (Aliases)</span>
                      </div>
                      <div class="tag-editor-list" style="margin-bottom: 8px; min-height: 36px; display: flex; flex-wrap: wrap; gap: 6px;">
                        <span
                          v-for="alias in bulkTagEditorAliases"
                          :key="alias"
                          class="tag-editor-tag"
                          style="background-color: var(--k-bg-panel, rgba(120, 120, 120, 0.08)); border-color: transparent;"
                        >
                          {{ alias }}
                          <button @click="removeAliasFromBulkEditor(alias)" class="tag-remove-btn" :disabled="bulkTagEditorSaving">×</button>
                        </span>
                        <span v-if="!bulkTagEditorAliases.length" class="tag-editor-empty" style="color: var(--k-text-muted, #888); font-size: 12px; font-style: italic;">等待添加别名</span>
                      </div>
                      <div class="tag-editor-input-row" style="display: flex; gap: 8px;">
                        <input
                          v-model="bulkAliasEditorInput"
                          class="flat-input tag-editor-input"
                          placeholder="输入别名，回车添加"
                          @keyup.enter="addAliasToBulkEditor"
                          :disabled="bulkTagEditorSaving"
                          style="flex-grow: 1;"
                        />
                        <button @click="addAliasToBulkEditor" class="btn btn-secondary btn-small" :disabled="!bulkAliasEditorInput.trim() || bulkTagEditorSaving">
                          添加
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="tag-editor-footer" style="margin-top: 18px; display: flex; gap: 12px; justify-content: flex-end; border-top: 1px solid rgba(120, 120, 120, 0.15); padding-top: 12px;">
                    <button @click="bulkTagEditorVisible = false" class="btn btn-secondary" :disabled="bulkTagEditorSaving">
                      取消
                    </button>
                    <button @click="saveBulkTagEditor" class="btn btn-primary" :disabled="bulkTagEditorSaving || (!bulkTagEditorTags.length && !bulkTagEditorAliases.length)">
                      {{ bulkTagEditorSaving ? '保存中...' : '确认应用' }}
                    </button>
                  </div>
                </div>
              </div>

              <section class="asset-gallery-section">
                <div class="asset-gallery-toolbar">
                  <div class="asset-tabs">
                    <button @click="currentGalleryTab = 'all'; currentPage = 1" :class="['asset-tab', currentGalleryTab === 'all' ? 'active' : '']">
                      全部 <span>{{ currentCollectionTotalCount }}</span>
                    </button>
                    <button @click="currentGalleryTab = 'local'; currentPage = 1" :class="['asset-tab', currentGalleryTab === 'local' ? 'active' : '']">
                      本地图片 <span>{{ detailResources.images.length }}</span>
                    </button>
                    <button @click="currentGalleryTab = 'external'; currentPage = 1" :class="['asset-tab', currentGalleryTab === 'external' ? 'active' : '']">
                      外链图片 <span>{{ detailResources.links.length }}</span>
                    </button>
                  </div>

                  <div class="asset-filter-bar">
                    <div class="asset-search-box">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.3-4.3"></path>
                      </svg>
                      <input v-model="gallerySearch" placeholder="搜索图片或外链" />
                    </div>
                    <select v-model="galleryFilter" class="asset-select">
                      <option value="all">筛选: 全部</option>
                      <option value="selected">筛选: 已选</option>
                    </select>
                    <select v-model="gallerySort" class="asset-select">
                      <option value="name">排序: 文件名</option>
                      <option value="nameDesc">排序: 文件名倒序</option>
                    </select>
                    <div class="asset-view-toggle">
                      <button @click="galleryViewMode = 'grid'" :class="galleryViewMode === 'grid' ? 'active' : ''" title="网格视图">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <rect x="3" y="3" width="7" height="7" rx="1"></rect>
                          <rect x="14" y="3" width="7" height="7" rx="1"></rect>
                          <rect x="3" y="14" width="7" height="7" rx="1"></rect>
                          <rect x="14" y="14" width="7" height="7" rx="1"></rect>
                        </svg>
                      </button>
                      <button @click="galleryViewMode = 'list'" :class="galleryViewMode === 'list' ? 'active' : ''" title="列表视图">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M8 6h13"></path>
                          <path d="M8 12h13"></path>
                          <path d="M8 18h13"></path>
                          <path d="M3 6h.01"></path>
                          <path d="M3 12h.01"></path>
                          <path d="M3 18h.01"></path>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

            <div class="gallery-tab-content">
              <div v-if="!detailResources.images.length && !detailResources.links.length" class="empty-gallery">
                表情包内尚无任何图片资源
              </div>
              <div v-else-if="!filteredGalleryItems.length" class="empty-gallery">
                没有匹配当前搜索或筛选条件的图片
              </div>
              <div v-else>
                <div v-if="selectedImages.length" class="gallery-bulk-toolbar floating">
                  <div class="bulk-status">
                    <span class="bulk-title">本地素材</span>
                    <span class="bulk-meta">已选择 {{ selectedImages.length }} 张</span>
                  </div>
                  <div class="bulk-actions">
                    <button @click="toggleSelectCurrentPage" class="toolbar-btn compact">
                      {{ areAllCurrentPageImagesSelected ? '取消本页' : '选择本页' }}
                    </button>
                    <button v-if="selectedImages.length" @click="clearSelectedImages" class="toolbar-btn compact">
                      清空选择
                    </button>
                    <div v-if="selectedImages.length" class="bulk-move-group">
                      <select v-model="bulkMoveTarget" class="flat-select compact-select">
                        <option value="">移动到...</option>
                        <option
                          v-for="targetCol in collections"
                          :key="targetCol.name"
                          :value="targetCol.name"
                          :disabled="targetCol.name === currentCollection.name"
                        >
                          {{ targetCol.name }}
                        </option>
                      </select>
                      <button @click="moveSelectedImages" class="toolbar-btn compact" :disabled="!bulkMoveTarget">
                        移动
                      </button>
                    </div>
                    <button @click="openBulkTagEditor" class="toolbar-btn compact">设置标签</button>
                    <button v-if="selectedImages.length" @click="deleteSelectedImages" class="toolbar-btn compact danger">
                      批量删除
                    </button>
                  </div>
                </div>

                <div :class="['notion-gallery-grid', galleryViewMode === 'list' ? 'list-mode' : '']">
                  <div
                    v-for="item in paginatedGalleryItems"
                    :key="item.id"
                    class="notion-gallery-card"
                    :class="{
                      'notion-gallery-card-active-dropdown': activeCardMenu === item.value,
                      'selected': item.type === 'local' && isImageSelected(item.value),
                      'external': item.type === 'external'
                    }"
                  >
                    <button
                      v-if="item.type === 'local'"
                      class="gallery-select-toggle"
                      @click.stop="toggleImageSelection(item.value)"
                      :title="isImageSelected(item.value) ? '取消选择' : '选择图片'"
                    >
                      <svg v-if="isImageSelected(item.value)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                    </button>
                    <div
                      class="gallery-img-container"
                      @click="handleGalleryItemClick(item)"
                      style="cursor: pointer;"
                      :title="item.type === 'local' && selectedImages.length ? '切换选择状态' : '在新标签页中打开原图'"
                    >
                      <img
                        :src="item.src"
                        class="gallery-img"
                        loading="lazy"
                      />
                      <span class="image-format-badge" :class="item.type">{{ item.type === 'external' ? 'LINK' : getImageExtension(item.value) }}</span>
                    </div>
                    <div class="gallery-card-info">
                      <div class="gallery-card-header-row">
                        <div class="gallery-card-title" :title="item.label">{{ item.label }}</div>
                        <div class="gallery-card-menu-container">
                          <button class="gallery-card-menu-btn" @click.stop="toggleCardMenu(item.value)" title="更多操作">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                              <circle cx="12" cy="12" r="1.5"></circle>
                              <circle cx="19" cy="12" r="1.5"></circle>
                              <circle cx="5" cy="12" r="1.5"></circle>
                            </svg>
                          </button>
                          <!-- Dropdown menu -->
                          <div class="gallery-card-menu-dropdown" v-show="activeCardMenu === item.value" @click.stop>
                            <template v-if="item.type === 'local'">
                              <button @click="openTagEditor(currentCollection.name, item.value); closeCardMenu()">编辑标签</button>
                              <div v-if="collections.length > 1" class="gallery-card-submenu-trigger">
                                <span>移动至表情包</span>
                                <div class="gallery-card-submenu">
                                  <template v-for="targetCol in collections">
                                    <button v-if="targetCol.name !== currentCollection.name" :key="targetCol.name"
                                      @click="moveImage(currentCollection.name, targetCol.name, item.value); closeCardMenu()">
                                      {{ targetCol.name }}
                                    </button>
                                  </template>
                                </div>
                              </div>
                              <button class="danger" @click="confirmDeleteImage(currentCollection.name, item.value); closeCardMenu()">删除图片</button>
                            </template>
                            <template v-else>
                              <button @click="copyToClipboard(item.value); closeCardMenu()">复制链接</button>
                              <button class="danger" @click="deleteExternalLink(currentCollection.name, item.value); closeCardMenu()">删除外链</button>
                            </template>
                          </div>
                        </div>
                      </div>
                      <div v-if="item.type === 'local'" class="gallery-card-tags">
                        <span
                          v-for="tag in getImageTags(item.value)"
                          :key="tag"
                          class="gallery-card-tag-badge"
                          :style="{ backgroundColor: tagColor(tag) + '12', color: tagColor(tag), borderColor: tagColor(tag) + '22' }"
                        >{{ tag }}</span>
                        <span v-if="!getImageTags(item.value).length" class="gallery-card-tag-empty">暂无标签</span>
                      </div>
                    </div>
                  </div>
                </div>

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

              </section>
            </div>

          </div>
        </div>

        <!-- MENU VIEW 2: DISTRIBUTION (🌐) -->
        <div v-else-if="activeMenu === 'distribution'" class="distribution-router-view">
          <div class="notion-db-header page-section-header">
            <div>
              <h1 class="notion-main-title">分发管理</h1>
              <p class="section-desc compact">管理统一重定向端点与外部目标地址</p>
            </div>
            <button @click="openEndpointEditor" class="btn btn-primary btn-notion">
              + 新建端点
            </button>
          </div>
          <hr class="notion-hr" />

          <div class="endpoint-layout">
            
            <!-- Endpoint Editor Form Panel -->
            <div v-show="showEndpointEditor" class="notion-form-panel endpoint-editor-panel">
              <div class="panel-title-row">
                <h2 class="notion-panel-title">
                  {{ editingEndpoint ? '编辑分发端点' : '创建新分发端点' }}
                </h2>
                <button @click="closeEndpointEditor" class="icon-btn hover-bg" title="收起编辑器">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
              
              <div class="form-fields endpoint-form-grid">
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

                <div class="form-group span-2">
                  <label>目标 URL *</label>
                  <input 
                    v-model="endpointForm.url" 
                    class="flat-input"
                    placeholder="https://example.com/api" 
                  />
                </div>

                <div class="endpoint-preview span-2">
                  <span>访问预览</span>
                  <code @click="copyToClipboard(endpointPreviewUrl)">{{ endpointPreviewUrl || '填写端点名称后生成预览' }}</code>
                </div>

                <div class="form-actions span-2">
                  <button @click="saveEndpoint" class="btn btn-primary flex-grow">
                    {{ editingEndpoint ? '保存修改' : '立即创建' }}
                  </button>
                  <button @click="closeEndpointEditor" class="btn btn-secondary">
                    取消
                  </button>
                </div>
              </div>
            </div>

            <!-- Endpoints Table List -->
            <div class="notion-table-panel">
              <div class="table-title-row">
                <h2 class="notion-panel-title">端点列表</h2>
                <span class="table-count">{{ endpoints.length }} 条路由</span>
              </div>
              <div class="table-container">
                <table class="flat-table">
                  <thead>
                    <tr>
                      <th style="width: 18%">名称</th>
                      <th style="width: 20%">描述</th>
                      <th style="width: 17%">方式</th>
                      <th style="width: 35%">访问路径 & 转发目标</th>
                      <th style="width: 10%; text-align: right">管理</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-if="!endpoints.length">
                      <td colspan="5" class="empty-cell">尚未配置任何转发 API 端点</td>
                    </tr>
                    <tr v-for="item in endpoints" :key="item.name">
                      <td>
                        <div class="endpoint-name">{{ item.name }}</div>
                      </td>
                      <td class="cell-desc" :title="item.description">
                        {{ item.description || '-' }}
                      </td>
                      <td>
                        <span class="method-tag redirect">重定向</span>
                        <div class="target-url">302 重定向</div>
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

        <!-- MENU VIEW 3: STAGING (暂缓区) -->
        <div v-else-if="activeMenu === 'staging'" class="staging-router-view">
          <div class="notion-db-header page-section-header staging-page-header">
            <div>
              <h1 class="notion-main-title">暂缓区</h1>
              <p class="section-desc compact">复核被上传过滤器拦截或自动收集的候选图片，再手动归档到表情包分组</p>
            </div>
            <div class="staging-header-actions">
              <button
                @click="toggleSimilarStagingMode"
                :class="['btn', stagingViewMode === 'similar' ? 'btn-primary' : 'btn-secondary', 'btn-notion']"
                :disabled="similarLoading || stagedImages.length < 2"
              >
                {{ similarLoading ? '筛选中...' : (stagingViewMode === 'similar' ? '显示全部' : '筛选相似图片') }}
              </button>
              <button @click="refreshStagedImages" class="btn btn-secondary btn-notion">
                刷新列表
              </button>
              <button
                v-if="stagedImages.length"
                @click="confirmDeleteAllStagedImages"
                class="btn btn-danger btn-notion"
              >
                一键清空
              </button>
            </div>
          </div>

          <div class="staging-toolbar">
            <div class="asset-search-box staging-search-box">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <path d="m21 21-4.3-4.3"></path>
              </svg>
              <input v-model="stagingSearch" placeholder="搜索文件名、来源或原因" />
            </div>
            <div class="staging-count-pill">
              {{ stagingViewMode === 'similar' ? similarStagedImages.length : filteredStagedImages.length }} / {{ stagedImages.length }} 张候选
            </div>
          </div>

          <div v-if="!stagedImages.length" class="empty-placeholder-card staging-empty-card">
            <div class="empty-icon">🕓</div>
            <h3>暂缓区为空</h3>
            <p>上传时被过滤器拦截或自动收集命中的候选图片会先保存在这里，等待人工复核。</p>
          </div>

          <div v-else-if="stagingViewMode === 'similar'" class="similar-staging-view">
            <div v-if="similarLoading" class="empty-gallery">正在筛选相似图片...</div>
            <div v-else-if="similarMessage" class="similar-message">{{ similarMessage }}</div>
            <div v-if="!similarLoading && !filteredSimilarGroups.length" class="empty-gallery">
              暂缓区没有匹配当前条件的相似图片
            </div>
            <section v-for="group in filteredSimilarGroups" :key="group.id" class="similar-group">
              <div class="similar-group-header">
                <div>
                  <h3>相似组 {{ group.label }}</h3>
                  <p>{{ group.items.length }} 张候选，最高相似度 {{ formatPercent(group.similarity) }}</p>
                </div>
              </div>
              <div class="staging-grid">
                <article v-for="item in group.items" :key="item.id" class="staging-card">
                  <button class="staging-image-shell" @click="openImage(getStagedImageUrl(item.id))" title="打开原图">
                    <img
                      class="staging-image"
                      :src="getStagedImageUrl(item.id)"
                      :alt="item.originalName || item.filename"
                      loading="lazy"
                    />
                  </button>

                  <div class="staging-card-body">
                    <div class="staging-title-row">
                      <div class="staging-title" :title="item.originalName || item.filename">
                        {{ item.originalName || item.filename }}
                      </div>
                      <span class="staging-ext-tag">{{ getImageExtension(item.filename) }}</span>
                    </div>

                    <div class="staging-meta-grid">
                      <span :title="item.reason || '暂缓候选'">{{ item.reason || '暂缓候选' }}</span>
                      <span>{{ item.source || 'filter' }}</span>
                      <span>{{ formatSize(item.size) }}</span>
                      <span>{{ formatDate(item.createdAt) }}</span>
                    </div>

                    <select v-model="stagingTargetCollection[item.id]" class="flat-select staging-select" :disabled="!collections.length">
                      <option value="">选择目标表情包</option>
                      <option v-for="collection in collections" :key="collection.name" :value="collection.name">
                        {{ collection.name }}
                      </option>
                    </select>

                    <div class="staging-actions">
                      <button
                        @click="promoteStagedImage(item)"
                        class="btn btn-primary staging-action-btn"
                        :disabled="stagingBusyId === item.id || !stagingTargetCollection[item.id]"
                      >
                        {{ stagingBusyId === item.id ? '处理中...' : '归档到表情包' }}
                      </button>
                      <button
                        @click="deleteStagedImage(item)"
                        class="btn btn-danger staging-action-btn"
                        :disabled="stagingBusyId === item.id"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </section>
          </div>

          <div v-else-if="!filteredStagedImages.length" class="empty-gallery">
            没有匹配当前搜索条件的暂缓图片
          </div>

          <div v-else>
            <div v-if="selectedStagedIds.size" class="staging-batch-toolbar">
              <div class="bulk-status">
                <span class="bulk-title">暂缓区</span>
                <span class="bulk-meta">已选择 {{ selectedStagedIds.size }} 张</span>
              </div>
              <div class="bulk-actions">
                <button @click="toggleSelectAllStaged" class="toolbar-btn compact">
                  {{ areAllCurrentPageStagedSelected ? '取消全选' : '全选当前' }}
                </button>
                <button @click="clearSelectedStaged" class="toolbar-btn compact">
                  清空选择
                </button>
                <button @click="batchDeleteStagedImages" class="toolbar-btn compact danger">
                  批量删除
                </button>
              </div>
            </div>

            <div class="staging-grid">
              <article v-for="item in filteredStagedImages" :key="item.id" class="staging-card" :class="{ 'staging-card-selected': isStagedSelected(item.id) }">
                <button
                  class="staging-select-toggle"
                  @click.stop="toggleStagedSelection(item.id)"
                  :title="isStagedSelected(item.id) ? '取消选择' : '选择图片'"
                >
                  <svg v-if="isStagedSelected(item.id)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </button>
                <button class="staging-image-shell" @click="openImage(getStagedImageUrl(item.id))" title="打开原图">
                  <img
                    class="staging-image"
                    :src="getStagedImageUrl(item.id)"
                    :alt="item.originalName || item.filename"
                    loading="lazy"
                  />
                </button>

                <div class="staging-card-body">
                  <div class="staging-title-row">
                    <div class="staging-title" :title="item.originalName || item.filename">
                      {{ item.originalName || item.filename }}
                    </div>
                    <span class="staging-ext-tag">{{ getImageExtension(item.filename) }}</span>
                  </div>

                  <div class="staging-meta-grid">
                    <span :title="item.reason || '暂缓候选'">{{ item.reason || '暂缓候选' }}</span>
                    <span>{{ item.source || 'filter' }}</span>
                    <span>{{ formatSize(item.size) }}</span>
                    <span>{{ formatDate(item.createdAt) }}</span>
                  </div>

                  <select v-model="stagingTargetCollection[item.id]" class="flat-select staging-select" :disabled="!collections.length">
                    <option value="">选择目标表情包</option>
                    <option v-for="collection in collections" :key="collection.name" :value="collection.name">
                      {{ collection.name }}
                    </option>
                  </select>

                  <div class="staging-actions">
                    <button
                      @click="promoteStagedImage(item)"
                      class="btn btn-primary staging-action-btn"
                      :disabled="stagingBusyId === item.id || !stagingTargetCollection[item.id]"
                    >
                      {{ stagingBusyId === item.id ? '处理中...' : '归档到表情包' }}
                    </button>
                    <button
                      @click="deleteStagedImage(item)"
                      class="btn btn-danger staging-action-btn"
                      :disabled="stagingBusyId === item.id"
                    >
                      删除
                    </button>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
        <!-- MENU VIEW 4: PREVIEW (👁️ 预览) -->
        <div v-else-if="activeMenu === 'settings'" class="settings-router-view">
          <div class="settings-preview-panel">
            <div class="notion-db-header page-section-header preview-page-header">
              <div>
                <h1 class="notion-main-title">预览</h1>
                <p class="section-desc compact">实时预览路由与最终提示词效果</p>
              </div>
              <button @click="fetchSettingsPreview" class="btn btn-secondary btn-notion">
                刷新预览
              </button>
            </div>

            <div class="preview-dashboard-grid">
              <section class="preview-card route-table-card">
                <div class="preview-card-header">
                  <div>
                    <div class="preview-card-title">路由清单</div>
                    <div class="preview-card-desc">{endpoint} 中可供 ChatLuna 使用的合集与端点</div>
                  </div>
                  <button @click="copyToClipboard(routeInventoryText)" class="preview-action-btn" :disabled="!routeInventoryText" title="复制路由清单">
                    复制清单
                  </button>
                </div>

                <div v-if="previewRouteRows.length" class="preview-table-wrap">
                  <table class="preview-route-table">
                    <thead>
                      <tr>
                        <th>预览</th>
                        <th>包名</th>
                        <th>描述</th>
                        <th>路径</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="row in previewRouteRows" :key="row.id">
                        <td>
                          <div v-if="row.previewImages.length" :class="['preview-mini-cover', row.previewImages.length === 1 ? 'single' : '']">
                            <img
                              v-for="src in row.previewImages"
                              :key="src"
                              :src="src"
                              :alt="`${row.name} 预览`"
                              loading="lazy"
                              @error="handlePreviewImageError(row)"
                            />
                          </div>
                          <div v-else :class="['preview-route-icon', row.type]">
                            {{ row.type === 'collection' ? '包' : 'API' }}
                          </div>
                        </td>
                        <td>
                          <div class="preview-route-name">{{ row.name }}</div>
                          <span :class="['preview-route-type', row.type]">{{ row.typeLabel }}</span>
                        </td>
                        <td>
                          <div class="preview-route-desc" :title="row.description">{{ row.description }}</div>
                        </td>
                        <td>
                          <code class="preview-route-path" :title="row.fullUrl" @click="copyToClipboard(row.fullUrl)">{{ row.path }}</code>
                        </td>
                        <td>
                          <div class="preview-row-actions">
                            <a :href="row.fullUrl" target="_blank" class="icon-btn hover-bg" title="打开预览">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                              </svg>
                            </a>
                          </div>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div v-else class="preview-empty-state">
                  暂无可用表情包及路由，请前往表情包管理或分发管理中创建。
                </div>
              </section>

              <section class="preview-card prompt-card">
                <div class="preview-card-header">
                  <div>
                    <div class="preview-card-title">最终提示词</div>
                    <div class="preview-card-desc">{memesluna} 注入给 LLM 的完整文本</div>
                  </div>
                  <button @click="copyToClipboard(llmPromptPreview)" class="preview-action-btn" :disabled="!llmPromptPreview" title="复制最终提示词">
                    复制提示词
                  </button>
                </div>

                <div class="preview-code-block final-prompt polished">
                  <pre v-if="llmPromptPreview">{{ llmPromptPreview }}</pre>
                  <pre v-else class="text-gray-muted">- 正在获取最终提示词预览... -</pre>
                </div>
              </section>
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

interface CollectionInfo {
  name: string
  description: string
  totalCount: number
  localCount: number
  linkCount: number
  hasContent: boolean
  createdAt?: string | Date
  updatedAt?: string | Date
  apiCallCount?: number
  cover?: string
}

interface EndpointInfo {
  name: string
  group?: string
  description?: string
  url: string
  method?: 'redirect'
}

interface StagedImageInfo {
  id: string
  filename: string
  originalName: string
  source: string
  reason: string
  mime: string
  size: number
  createdAt: string | Date
  hash?: string
  perceptualHash?: string
}

interface SimilarStagedImageGroup {
  id: string
  items: StagedImageInfo[]
  similarity: number
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

// Navigation states
const activeMenu = ref<'resources' | 'distribution' | 'staging' | 'settings'>((sessionStorage.getItem('memesluna_active_menu') as any) || 'resources')
const activeResourceView = ref<'collection' | 'tag'>((sessionStorage.getItem('memesluna_active_resource_view') as any) || 'collection')

// Tag summary data
const tagSummary = ref<{ tag: string; count: number; previewUrls: string[] }[]>([])
const tagSummaryLoading = ref(false)

async function switchToTagView() {
  activeResourceView.value = 'tag'
  if (tagSummary.value.length) return
  tagSummaryLoading.value = true
  try {
    const result = await send('memesluna/getTagSummary')
    tagSummary.value = Array.isArray(result) ? result : []
  } catch (err) {
    console.error('Failed to load tag summary:', err)
    tagSummary.value = []
  } finally {
    tagSummaryLoading.value = false
  }
}

// Tag detail view
const currentTagView = ref('')
const currentTagImages = ref<{ collection: string; filename: string; tags: string[]; imageUrl: string }[]>([])
const tagImagesLoading = ref(false)

async function filterByTag(tag: string) {
  currentTagView.value = tag
  tagImagesLoading.value = true
  try {
    const result = await send('memesluna/getImagesByTag', tag)
    currentTagImages.value = Array.isArray(result?.images) ? result.images : []
  } catch (err) {
    console.error('Failed to load tag images:', err)
    currentTagImages.value = []
  } finally {
    tagImagesLoading.value = false
  }
}

function exitTagView() {
  currentTagView.value = ''
  currentTagImages.value = []
}
const loading = ref(true)

// Core state data
const backendPath = ref('/memesluna')
const baseUrl = ref('http://localhost:5140')
const endpoints = ref<EndpointInfo[]>([])
const collections = ref<CollectionInfo[]>([])
const stagedImages = ref<StagedImageInfo[]>([])
const synonymGroups = ref<string[]>([])
const allowedCandidates = computed(() => {
  return synonymGroups.value.flatMap(group => group.split(/[,，]/).map(item => item.trim()).filter(Boolean))
})
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
const endpointForm = reactive({
  name: '',
  group: '',
  description: '',
  url: '',
})
const failedEndpointPreviewIds = ref<Set<string>>(new Set())

// Collection router states
const newCollectionName = ref('')
const currentCollection = ref<any | null>(null)
const collectionSearchQuery = ref('')
const collectionFilter = ref<'all' | 'local' | 'external'>('all')
const activeCollectionMenu = ref<string | null>(null)
const newDescription = ref('')
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
  if (!allowedCandidates.value.includes(tag)) {
    showToast('标签必须是同义词组候选列表中的一个', 'error')
    return
  }
  bulkTagEditorTags.value = [tag]
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

      // Restrict to at most 1 tag
      if (finalTags.length > 1) {
        if (bulkTagEditorTags.value.length > 0) {
          finalTags = [bulkTagEditorTags.value[0]]
        } else {
          finalTags = [finalTags[0]]
        }
      }
      
      await send('memesluna/updateImageMetadata', {
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

async function loadImageTagsBatch(collection: string, filenames: string[]) {
  const results = await Promise.allSettled(
    filenames.map((fn) => send('memesluna/getImageMetadata', collection, fn))
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

const TAG_PALETTE = ['#f97316','#ec4899','#8b5cf6','#06b6d4','#22c55e','#eab308','#f43f5e','#14b8a6','#a855f7','#3b82f6']

function tagColor(tag: string): string {
  let hash = 0
  for (let i = 0; i < tag.length; i++) hash = ((hash << 5) - hash) + tag.charCodeAt(i)
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

async function openTagEditor(collection: string, filename: string) {
  tagEditorCollection.value = collection
  tagEditorImage.value = filename
  tagEditorInput.value = ''
  aliasEditorInput.value = ''
  aiAnnotating.value = false
  try {
    const result = await send('memesluna/getImageMetadata', collection, filename)
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
  if (!allowedCandidates.value.includes(tag)) {
    showToast('标签必须是同义词组候选列表中的一个', 'error')
    return
  }
  tagEditorTags.value = [tag]
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
    const result = await send('memesluna/annotateImage', tagEditorCollection.value, tagEditorImage.value)
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
    await send('memesluna/updateImageMetadata', {
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
      path: `${backendPath.value}/${item.name}`,
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
      path: `${backendPath.value}/${item.name}`,
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
    await Promise.all(ids.map((id) => send('memesluna/deleteStagedImage', id)))
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
    const deleted = await send('memesluna/deleteAllStagedImages')
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
function switchMainMenu(menu: 'resources' | 'distribution' | 'staging' | 'settings') {
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
function getBaseRedirectUrl(suffix: string): string {
  return `${getBackendBaseUrl()}/${suffix}`
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
      stagedImages.value = Array.isArray(state.stagedImages) ? state.stagedImages : []
      if (Array.isArray(state.synonymGroups)) synonymGroups.value = state.synonymGroups
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
    const list = await send('memesluna/getStagedImages')
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
    const result = await send('memesluna/getSimilarStagedImages')
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

async function promoteStagedImage(item: StagedImageInfo) {
  const target = stagingTargetCollection.value[item.id]
  if (!target) {
    showToast('请选择目标表情包', 'error')
    return
  }
  stagingBusyId.value = item.id
  try {
    const filename = await send('memesluna/promoteStagedImage', item.id, target)
    if (filename) {
      showToast(`已归档到表情包 "${target}"，新文件名 ${filename}`, 'success')
      delete stagingTargetCollection.value[item.id]
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
    const deleted = await send('memesluna/deleteStagedImage', item.id)
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
      await send('memesluna/addStagedImage', {
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

  const payload = {
    name,
    group: endpointForm.group.trim() || '默认分组',
    description: endpointForm.description.trim(),
    url,
    method: 'redirect' as const,
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
  activeCollectionMenu.value = null
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
  activeCollectionMenu.value = null
  currentCollection.value = item
  sessionStorage.setItem('memesluna_active_collection', item.name)
  newDescription.value = item.description || ''
  externalLinksText.value = ''
  gallerySearch.value = ''
  gallerySort.value = 'name'
  galleryFilter.value = 'all'
  galleryViewMode.value = 'grid'
  apiPreviewUrl.value = ''
  currentPage.value = 1
  clearSelectedImages()
  await loadCollectionResources(item.name)
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
  if (match) currentCollection.value = match
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

  if (uploadableFiles.length > 50) {
    showToast('单次上传表情上限为 50 张，请分批次导入', 'error')
    if (stagedCount) await fetchState()
    return
  }

  showToast(`正在转码并上传 ${uploadableFiles.length} 张表情图片...`, 'info')

  try {
    const payloadImages = []
    for (const file of uploadableFiles) {
      const base64 = await fileToBase64(file)
      payloadImages.push({
        base64,
        originalName: file.name
      })
    }

    const response = await fetch(`${getBackendBaseUrl()}/api/admin/collections/${encodeURIComponent(currentCollection.value.name)}/images`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ images: payloadImages })
    })

    if (response.ok) {
      const resData = await response.json()
      if (resData.ok && resData.uploaded && resData.uploaded.length > 0) {
        const stagedHint = stagedCount ? `，另有 ${stagedCount} 张进入暂缓区` : ''
        const avifHint = avifFiles.length ? `，${avifFiles.length} 张 AVIF 已直接拦截` : ''
        showToast(`成功将 ${resData.uploaded.length} 张表情入库并完成数字重命名${stagedHint}${avifHint}`, 'success')
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

async function deleteSelectedImages() {
  if (!currentCollection.value || !selectedImages.value.length) return
  const names = selectedImages.value
  if (!confirm(`确认永久删除已选择的 ${names.length} 张本地图片素材吗？此操作无法恢复！`)) return

  try {
    loading.value = true
    await Promise.all(names.map((filename) => send('memesluna/deleteLocalImage', currentCollection.value!.name, filename)))
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
    await Promise.all(names.map((filename) => send('memesluna/moveLocalImage', source, target, filename)))
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
  
  // Restore current collection detail view or tag detail view if it was active
  if (activeMenu.value === 'resources') {
    if (activeResourceView.value === 'tag') {
      await switchToTagView()
      const savedTag = sessionStorage.getItem('memesluna_active_tag_view')
      if (savedTag) {
        await filterByTag(savedTag)
      }
    } else {
      const savedCol = sessionStorage.getItem('memesluna_active_collection')
      if (savedCol) {
        const col = collections.value.find(c => c.name === savedCol)
        if (col) {
          await enterCollectionDetail(col)
        }
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

watch(activeResourceView, (newView) => {
  sessionStorage.setItem('memesluna_active_resource_view', newView)
})

watch(currentTagView, (newTag) => {
  if (newTag) {
    sessionStorage.setItem('memesluna_active_tag_view', newTag)
  } else {
    sessionStorage.removeItem('memesluna_active_tag_view')
  }
})
</script>

<style scoped>
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 1s linear infinite;
  display: inline-block;
}
/* GENERAL ROOT STYLE DESIGNED LIKE SLICK MODERN NOTION DOCUMENT */
.memesluna-app-layout {
  min-height: 100vh;
  padding-left: 64px; /* Offset Koishi's native fixed left sidebar */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Segoe UI Emoji", "Apple Color Emoji";
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-normal, #37352f);
  box-sizing: border-box;
  color-scheme: light;
  --k-bg-card: var(--k-card-bg, #ffffff);
  --k-bg-panel: var(--k-hover-bg, #f7f7f5);
  --k-bg-button-hover: var(--k-hover-bg, rgba(55, 53, 47, 0.04));
  --k-text-muted: var(--k-text-light, rgba(55, 53, 47, 0.55));
  --memesluna-drop-overlay-bg: rgba(255, 255, 255, 0.85);
  --memesluna-floating-action-bg: rgba(255, 255, 255, 0.92);
  --memesluna-floating-shadow: none;
  --memesluna-focus-ring: rgba(35, 131, 226, 0.15);
  --memesluna-primary-soft-bg: rgba(35, 131, 226, 0.1);
  --memesluna-primary-faint-bg: rgba(35, 131, 226, 0.04);
  --memesluna-success-soft-bg: rgba(43, 138, 92, 0.1);
  --memesluna-danger-soft-bg: rgba(235, 87, 87, 0.08);
  --memesluna-danger-border: rgba(235, 87, 87, 0.25);
  --memesluna-toast-success-bg: #f2f9f5;
  --memesluna-toast-error-bg: #fdf2f2;
  --memesluna-final-prompt-bg: rgba(35, 131, 226, 0.02);
  --memesluna-final-prompt-text: #1e3a8a;
  --memesluna-code-bg: #ffffff;
  --memesluna-code-text: #111827;
  --memesluna-code-border: rgba(15, 23, 42, 0.09);
  --memesluna-soft-shadow: none;
  --memesluna-card-shadow: none;
  --memesluna-popover-shadow: none;
}

:global(html.dark .memesluna-app-layout),
:global(.theme-root.dark .memesluna-app-layout) {
  color-scheme: dark;
  --k-bg-card: var(--k-card-bg, #252529);
  --k-bg-panel: var(--k-hover-bg, #303036);
  --k-bg-button-hover: var(--k-hover-bg, rgba(255, 255, 255, 0.06));
  --k-text-muted: var(--k-text-light, rgba(235, 235, 245, 0.62));
  --memesluna-drop-overlay-bg: rgba(20, 20, 24, 0.82);
  --memesluna-floating-action-bg: rgba(42, 42, 48, 0.94);
  --memesluna-floating-shadow: none;
  --memesluna-focus-ring: rgba(64, 158, 255, 0.24);
  --memesluna-primary-soft-bg: rgba(64, 158, 255, 0.16);
  --memesluna-primary-faint-bg: rgba(64, 158, 255, 0.1);
  --memesluna-success-soft-bg: rgba(103, 194, 58, 0.16);
  --memesluna-danger-soft-bg: rgba(235, 87, 87, 0.16);
  --memesluna-danger-border: rgba(235, 87, 87, 0.34);
  --memesluna-toast-success-bg: rgba(43, 138, 92, 0.16);
  --memesluna-toast-error-bg: rgba(235, 87, 87, 0.16);
  --memesluna-final-prompt-bg: rgba(64, 158, 255, 0.12);
  --memesluna-final-prompt-text: var(--k-color-primary-tint, #8ab4f8);
  --memesluna-code-bg: #000000;
  --memesluna-code-text: #f8fafc;
  --memesluna-code-border: rgba(255, 255, 255, 0.14);
  --memesluna-soft-shadow: none;
  --memesluna-card-shadow: none;
  --memesluna-popover-shadow: none;
}

.notion-content {
  padding: 80px 112px 112px;
  box-sizing: border-box;
  max-width: 1880px;
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
  color: var(--k-text-muted-light, rgba(55, 53, 47, 0.3));
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

.collection-list-header {
  gap: 20px;
  justify-content: flex-end;
}

.collection-title-group {
  display: flex;
  align-items: center;
  gap: 22px;
  min-width: 0;
}

.notion-db-title {
  font-size: 1.24rem;
  font-weight: 700;
  margin: 0;
  color: var(--k-text-normal, #37352f);
  white-space: nowrap;
}

.collection-total-count {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.82rem;
  white-space: nowrap;
}

.notion-db-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.collection-toolbar {
  flex-wrap: nowrap;
  justify-content: flex-end;
}

.collection-search-shell,
.collection-filter-shell {
  position: relative;
  display: inline-flex;
  align-items: center;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.52));
}

.collection-toolbar-icon {
  position: absolute;
  right: 11px;
  width: 15px;
  height: 15px;
  pointer-events: none;
  color: currentColor;
  z-index: 1;
}

.collection-search-shell .collection-search-input {
  width: 280px;
  height: 36px;
  padding-left: 12px;
  padding-right: 36px;
  border-radius: 6px;
  font-size: 0.82rem;
  background-color: var(--k-bg-card, #ffffff);
}

.collection-filter-shell .collection-filter-select {
  width: 128px;
  height: 36px;
  padding-left: 12px;
  padding-right: 36px;
  border-radius: 6px;
  font-size: 0.82rem;
  background-color: var(--k-bg-card, #ffffff);
  cursor: pointer;
  appearance: none;
}

.collection-name-input-notion {
  width: 200px;
  height: 28px;
  font-size: 0.78rem;
}

.btn-notion {
  height: 36px;
  padding: 0 14px;
  gap: 6px;
  border-radius: 6px;
  font-size: 0.84rem;
  font-weight: 600;
  white-space: nowrap;
}

.btn-plus {
  font-size: 1rem;
  line-height: 1;
}

.notion-hr {
  border: none;
  border-top: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.09));
  margin: 8px 0 20px 0;
}

/* Folders Grid & Cards */
.folders-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 20px 24px;
}

.folder-card {
  background: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.09));
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
  display: flex;
  flex-direction: column;
  min-width: 0;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.05);
}

.folder-card:hover {
  border-color: rgba(35, 131, 226, 0.28);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.08);
  transform: translateY(-1px);
}

.folder-cover {
  position: relative;
  aspect-ratio: 2.18 / 1;
  min-height: 132px;
  background-color: var(--k-bg-panel, #f7f7f5);
  border-bottom: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
}

.folder-cover.has-preview {
  background-color: var(--k-color-border, rgba(15, 23, 42, 0.08));
}

.folder-cover.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.4));
}

.folder-card:hover .folder-cover.empty {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  background-color: var(--k-bg-button-hover, #f1f1ef);
}

.folder-cover-empty svg {
  width: 32px;
  height: 32px;
}

.folder-cover-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: var(--k-bg-panel, #f7f7f5);
}

.folder-cover-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  padding: 1px 6px;
  border-radius: 3px;
  background-color: var(--memesluna-floating-action-bg);
  box-shadow: var(--memesluna-floating-shadow);
  color: var(--k-text-muted, rgba(55, 53, 47, 0.6));
  font-size: 0.65rem;
  font-weight: 500;
}

.folder-body {
  padding: 15px 16px 16px;
  flex: 1;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  min-height: 108px;
}

.folder-title-row {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.folder-name {
  min-width: 0;
  font-size: 0.96rem;
  font-weight: 700;
  color: var(--k-text-normal, #37352f);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.folder-more-btn {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.56));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  flex-shrink: 0;
}

.folder-more-btn:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.06));
  color: var(--k-text-normal, #37352f);
}

.folder-more-btn svg {
  width: 17px;
  height: 17px;
}

.folder-action-menu {
  position: absolute;
  right: 0;
  top: 30px;
  min-width: 112px;
  padding: 5px;
  border-radius: 6px;
  background-color: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.12));
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
  z-index: 20;
}

.folder-action-menu button {
  width: 100%;
  height: 28px;
  padding: 0 9px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--k-text-normal, #37352f);
  text-align: left;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.folder-action-menu button:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.06));
}

.folder-action-menu button.danger {
  color: var(--k-color-danger, #eb5757);
}

.folder-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 9px;
  gap: 8px;
}

.folder-count {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.62));
  font-size: 0.86rem;
  line-height: 1.4;
  white-space: nowrap;
}

.folder-meta-row {
  display: flex;
  align-items: center;
  min-width: 0;
}

.folder-meta-item {
  min-width: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.6));
  font-size: 0.8rem;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.folder-meta-item svg {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
}

/* Asset detail workspace */
.collection-detail-layout {
  margin-top: 4px;
}

.asset-detail-shell {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.detail-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 8px;
}

.detail-breadcrumbs {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.82rem;
}

.detail-back-btn {
  border: none;
  background: transparent;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  border-radius: 8px;
  cursor: pointer;
  font: inherit;
}

.detail-back-btn:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.05));
  color: var(--k-text-normal, #111827);
}

.detail-back-btn svg,
.asset-btn svg,
.asset-icon-btn svg,
.asset-test-btn svg,
.asset-view-toggle svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.detail-separator {
  color: var(--k-color-border, rgba(55, 53, 47, 0.3));
}

.detail-crumb-current,
.detail-crumb-strong {
  color: var(--k-text-normal, #111827);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-top-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.asset-btn,
.asset-icon-btn,
.asset-test-btn {
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-normal, #111827);
  border-radius: 12px;
  min-height: 36px;
  padding: 0 13px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 0.8rem;
  font-weight: 650;
  cursor: pointer;
  box-shadow: none;
  transition: border-color 0.15s ease, background-color 0.15s ease, color 0.15s ease;
}

.asset-btn:hover,
.asset-icon-btn:hover,
.asset-test-btn:hover {
  background-color: var(--k-bg-panel, #f8fafc);
}

.asset-btn.primary,
.asset-test-btn {
  border-color: transparent;
  background: #1f6feb;
  color: #ffffff;
  box-shadow: none;
}

.asset-btn.primary:hover,
.asset-test-btn:hover {
  background: #1a5fd0;
}

.asset-btn.secondary {
  background-color: var(--k-bg-card, #ffffff);
}

.asset-btn.ghost {
  width: 36px;
  padding: 0;
}

.asset-btn.danger {
  color: var(--k-color-danger, #eb5757);
}

.asset-btn.danger:hover {
  background-color: var(--memesluna-danger-soft-bg);
  border-color: var(--memesluna-danger-border);
}

.asset-hero-panel {
  display: grid;
  grid-template-columns: minmax(280px, 0.95fr) minmax(520px, 1.55fr);
  gap: 14px;
  align-items: stretch;
  padding: 18px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  border-radius: 16px;
  background: var(--k-bg-card, #ffffff);
  box-shadow: var(--memesluna-soft-shadow);
}

.asset-identity-card {
  display: flex;
  align-items: center;
  gap: 16px;
  min-width: 0;
}

.asset-avatar-frame {
  width: 96px;
  height: 96px;
  border-radius: 18px;
  overflow: hidden;
  flex: 0 0 96px;
  background: var(--k-bg-panel, #f6f8fb);
  box-shadow: inset 0 0 0 1px var(--k-color-border, rgba(15, 23, 42, 0.08));
}

.asset-avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-avatar-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.42));
}

.asset-avatar-empty svg {
  width: 34px;
  height: 34px;
}

.asset-title-stack {
  min-width: 0;
  flex: 1;
}

.asset-title-row {
  display: flex;
  align-items: center;
  gap: 9px;
}

.asset-title-row h1 {
  margin: 0;
  color: var(--k-text-normal, #0f172a);
  font-size: 1.7rem;
  line-height: 1.1;
  font-weight: 760;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-pill {
  padding: 3px 8px;
  border-radius: 999px;
  background-color: var(--memesluna-danger-soft-bg);
  color: var(--k-color-danger, #eb5757);
  font-size: 0.72rem;
  font-weight: 700;
}

.asset-description-input {
  margin-top: 9px;
  width: 100%;
  border: none;
  background: transparent;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.68));
  font-size: 0.88rem;
  line-height: 1.4;
  padding: 4px 0;
  outline: none;
  font-family: inherit;
}

.asset-description-input:focus {
  color: var(--k-text-normal, #111827);
}

.asset-meta-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 12px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.75rem;
}

.asset-api-card {
  min-width: 0;
  align-self: center;
  width: 100%;
  box-shadow: none;
}

.asset-card-label {
  color: var(--k-text-normal, #111827);
  font-size: 0.8rem;
  font-weight: 720;
  margin-bottom: 9px;
}

.asset-api-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.asset-api-row code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 9px 10px;
  border-radius: 10px;
  background-color: var(--memesluna-primary-faint-bg);
  color: var(--k-color-primary, #2563eb);
  font: 0.82rem SFMono-Regular, Consolas, monospace;
  box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.08);
}

.asset-icon-btn {
  min-height: 34px;
  padding: 0 11px;
  border-radius: 10px;
  font-size: 0.76rem;
}

.asset-icon-btn.compact {
  width: 32px;
  min-height: 32px;
  padding: 0;
}

.asset-test-btn:disabled {
  opacity: 0.68;
  cursor: wait;
}

.asset-api-hint {
  margin-top: 10px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.56));
  font-size: 0.74rem;
}

.api-preview-strip {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.6));
  font-size: 0.75rem;
}

.api-preview-strip img {
  width: 42px;
  height: 42px;
  object-fit: cover;
  border-radius: 10px;
  box-shadow: none;
}

.asset-import-panel {
  padding: 14px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  border-radius: 14px;
  background-color: var(--k-bg-card, #ffffff);
  box-shadow: none;
}

.asset-import-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.asset-import-title {
  color: var(--k-text-normal, #111827);
  font-size: 0.9rem;
  font-weight: 720;
}

.asset-import-desc {
  margin-top: 3px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.56));
  font-size: 0.75rem;
}

.asset-link-textarea {
  width: 100%;
  resize: vertical;
  min-height: 92px;
  box-sizing: border-box;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 12px;
  background-color: var(--k-bg-panel, #f8fafc);
  color: var(--k-text-normal, #111827);
  padding: 10px 12px;
  font: 0.8rem SFMono-Regular, Consolas, monospace;
  outline: none;
}

.asset-link-textarea:focus {
  border-color: var(--k-color-primary, #2563eb);
  box-shadow: 0 0 0 3px var(--memesluna-focus-ring);
  background-color: var(--k-bg-card, #ffffff);
}

.asset-import-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 10px;
}

.asset-gallery-section {
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  border-radius: 16px;
  background-color: var(--k-bg-card, #ffffff);
  box-shadow: none;
  overflow: hidden;
}

.asset-gallery-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
}

.asset-tabs,
.asset-filter-bar,
.asset-view-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
}

.asset-tabs {
  flex-wrap: wrap;
}

.asset-tab {
  border: none;
  background: transparent;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.62));
  border-radius: 999px;
  padding: 7px 11px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 0.8rem;
  font-weight: 680;
}

.asset-tab:hover,
.asset-tab.active {
  color: var(--k-color-primary, #2563eb);
  background-color: var(--memesluna-primary-soft-bg);
}

.asset-tab span {
  min-width: 20px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  border-radius: 999px;
  background-color: var(--k-bg-panel, rgba(15, 23, 42, 0.06));
  color: inherit;
  font-size: 0.7rem;
}

.asset-filter-bar {
  flex: 1;
  justify-content: flex-end;
  min-width: 0;
}

.asset-search-box {
  flex: 1;
  max-width: 320px;
  min-width: 180px;
  height: 36px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 11px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 12px;
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
}

.asset-search-box svg {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
}

.asset-search-box input {
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  color: var(--k-text-normal, #111827);
  outline: none;
  font: inherit;
  font-size: 0.8rem;
}

.asset-select {
  height: 36px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 12px;
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-normal, #111827);
  padding: 0 10px;
  font-size: 0.78rem;
  font-weight: 600;
  outline: none;
}

.asset-view-toggle {
  padding: 3px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 12px;
  background-color: var(--k-bg-panel, #f8fafc);
}

.asset-view-toggle button {
  width: 30px;
  height: 28px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}

.asset-view-toggle button.active {
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-color-primary, #2563eb);
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
  color: var(--k-color-danger, #eb5757);
}

.toolbar-btn.danger:hover {
  background-color: var(--memesluna-danger-soft-bg);
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
  background-color: var(--memesluna-drop-overlay-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  box-sizing: border-box;
}

.drop-overlay-box {
  border: 2px dashed var(--k-color-primary, #2383e2);
  background-color: var(--memesluna-primary-faint-bg);
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
  padding: 14px;
  margin-top: 0;
}

.gallery-bulk-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 0 auto 12px;
  padding: 9px 10px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 14px;
  background-color: var(--memesluna-floating-action-bg);
  backdrop-filter: blur(12px);
}

.gallery-bulk-toolbar.floating {
  position: sticky;
  top: 8px;
  z-index: 40;
  max-width: 920px;
}

.bulk-status {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.bulk-title {
  font-size: 0.82rem;
  font-weight: 720;
  color: var(--k-text-normal, #37352f);
}

.bulk-meta {
  font-size: 0.72rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.55));
}

.bulk-actions,
.bulk-move-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.toolbar-btn.compact {
  font-size: 0.74rem;
  padding: 5px 9px;
  border-radius: 10px;
}

.toolbar-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.compact-select {
  height: 30px;
  padding: 2px 9px;
  font-size: 0.74rem;
  border-radius: 10px;
}

/* Notion Gallery view grid & cards */
.notion-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(174px, 1fr));
  gap: 7px;
}

.notion-gallery-card {
  background: var(--k-bg-card, #fff);
  border: 1px solid var(--k-color-border, rgba(55,53,47,0.08));
  border-radius: 8px;
  position: relative;
  transition: opacity 0.15s ease;
  box-shadow: none;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.notion-gallery-card:hover {
  box-shadow: none;
}

.notion-gallery-card.selected {
  box-shadow: none;
}

.notion-gallery-card.selected .gallery-img-container {
  box-shadow: inset 0 0 0 2px var(--k-color-primary, #2563eb);
}

.notion-gallery-card.external .gallery-img-container {
  background-color: var(--k-bg-card, #ffffff);
}

.gallery-select-toggle {
  position: absolute;
  top: 9px;
  left: 9px;
  z-index: 12;
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 999px;
  background-color: var(--memesluna-floating-action-bg);
  box-shadow: none;
  color: var(--k-color-primary, #2383e2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease, border-color 0.12s ease;
}

.gallery-select-toggle svg {
  width: 14px;
  height: 14px;
}

.notion-gallery-card:hover .gallery-select-toggle,
.notion-gallery-card.selected .gallery-select-toggle {
  opacity: 1;
}

.gallery-img-container {
  width: 100%;
  aspect-ratio: 4 / 3;
  background-color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.08);
}

.gallery-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.image-format-badge {
  position: absolute;
  right: 8px;
  bottom: 8px;
  z-index: 12;
  padding: 2px 6px;
  border-radius: 7px;
  background: rgba(15, 23, 42, 0.62);
  color: #ffffff;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.1;
}

.image-format-badge.external {
  background: rgba(13, 148, 136, 0.82);
}

.gallery-card-info {
  padding: 10px 12px;
  background: var(--k-bg-card, #fff);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
}

.notion-gallery-grid.list-mode {
  grid-template-columns: 1fr;
  gap: 8px;
}

.notion-gallery-grid.list-mode .notion-gallery-card {
  aspect-ratio: auto;
  min-height: 76px;
  display: grid;
  grid-template-columns: 96px 1fr;
  align-items: center;
  gap: 12px;
  padding: 8px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  background-color: var(--k-bg-card, #ffffff);
}

.notion-gallery-grid.list-mode .gallery-img-container {
  height: 68px;
}

.notion-gallery-grid.list-mode .gallery-card-info {
  padding: 0;
  background: transparent;
}

.gallery-card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  position: relative;
}

.gallery-card-title {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--k-text-normal, #111827);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.gallery-card-menu-container {
  position: relative;
  display: inline-flex;
}

.gallery-card-menu-btn {
  background: transparent;
  border: none;
  cursor: pointer;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
  padding: 0;
  transition: background 0.1s ease, color 0.1s ease;
}

.gallery-card-menu-btn:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.05));
  color: var(--k-text-normal, #111827);
}

.gallery-card-menu-btn svg {
  width: 14px;
  height: 14px;
}

/* Card Dropdown Menu */
.gallery-card-menu-dropdown {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 6px;
  min-width: 130px;
  background-color: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.15));
  border-radius: 6px;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.12);
  z-index: 50;
  padding: 4px;
}

.gallery-card-menu-dropdown button {
  width: 100%;
  border: none;
  background: transparent;
  text-align: left;
  padding: 6px 10px;
  font-size: 0.76rem;
  cursor: pointer;
  color: var(--k-text-normal, #37352f);
  border-radius: 4px;
  font-weight: 500;
  transition: background 0.1s ease;
}

.gallery-card-menu-dropdown button:hover {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.05));
}

.gallery-card-menu-dropdown button.danger {
  color: var(--k-color-danger, #eb5757);
}

.gallery-card-menu-dropdown button.danger:hover {
  background-color: var(--memesluna-danger-soft-bg);
}

/* Card Submenu for moving */
.gallery-card-submenu-trigger {
  position: relative;
}

.gallery-card-submenu-trigger span {
  display: block;
  padding: 6px 10px;
  font-size: 0.76rem;
  font-weight: 500;
  color: var(--k-text-normal, #37352f);
  cursor: pointer;
  border-radius: 4px;
  transition: background 0.1s ease;
}

.gallery-card-submenu-trigger:hover > span {
  background-color: var(--k-bg-button-hover, rgba(55, 53, 47, 0.05));
}

.gallery-card-submenu {
  position: absolute;
  bottom: 0;
  right: 100%;
  margin-right: 6px;
  min-width: 120px;
  max-height: 180px;
  overflow-y: auto;
  background-color: var(--k-bg-card, #ffffff);
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.15));
  border-radius: 6px;
  box-shadow: 0 4px 15px rgba(15, 23, 42, 0.1);
  padding: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.1s ease;
}

.gallery-card-submenu-trigger:hover .gallery-card-submenu {
  opacity: 1;
  pointer-events: auto;
}

.gallery-card-submenu button {
  padding: 5px 8px;
  font-size: 0.72rem;
}

/* Tags in the card */
.gallery-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 20px;
  align-items: center;
}

.gallery-card-tag-badge {
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid transparent;
  white-space: nowrap;
}

.gallery-card-tag-empty {
  font-size: 0.68rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.35));
  font-style: italic;
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
  box-shadow: 0 0 0 2px var(--memesluna-focus-ring);
}

.flat-input::placeholder,
.flat-textarea::placeholder,
.property-input-text::placeholder {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
  opacity: 0.78;
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
  background-color: var(--k-color-primary-shade, #1a6cb8);
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
  background-color: var(--k-color-danger, #eb5757);
  color: #ffffff;
}

.btn-danger:hover {
  background-color: var(--k-color-danger-shade, #d44c4c);
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

/* VIEW 2.5: STAGING REVIEW */
.staging-router-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.staging-page-header {
  margin-bottom: 4px;
}
.staging-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.similar-staging-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.similar-message {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.78rem;
  font-weight: 650;
}

.similar-group {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
  border-top: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
}

.similar-group:first-of-type {
  padding-top: 0;
  border-top: none;
}

.similar-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.similar-group-header h3 {
  margin: 0;
  color: var(--k-text-normal, #111827);
  font-size: 0.96rem;
  font-weight: 750;
}

.similar-group-header p {
  margin: 4px 0 0;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.74rem;
}

.staging-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
  border-top: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.06));
  border-bottom: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.06));
}

.staging-search-box {
  max-width: 420px;
}

.staging-count-pill {
  height: 28px;
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  border-radius: 999px;
  background-color: var(--k-bg-panel, rgba(15, 23, 42, 0.05));
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.76rem;
  font-weight: 650;
  white-space: nowrap;
}

.staging-empty-card {
  margin-top: 8px;
}

.staging-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}

.staging-card {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.09));
  border-radius: 8px;
  background-color: var(--k-bg-card, #ffffff);
  box-shadow: none;
}

.staging-card-selected {
  border-color: var(--k-color-primary, #2383e2);
  box-shadow: 0 0 0 2px var(--memesluna-focus-ring);
}

.staging-select-toggle {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 5;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: 2px solid rgba(255, 255, 255, 0.8);
  background-color: rgba(255, 255, 255, 0.85);
  color: var(--k-color-primary, #2383e2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background-color 0.15s ease;
}

.staging-select-toggle:hover {
  background-color: rgba(255, 255, 255, 0.95);
}

.staging-select-toggle svg {
  width: 14px;
  height: 14px;
}

.staging-batch-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  margin-bottom: 14px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.09));
  border-radius: 8px;
  background-color: var(--memesluna-floating-action-bg, rgba(255, 255, 255, 0.92));
}

.staging-image-shell {
  width: 100%;
  aspect-ratio: 1 / 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-bottom: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  background-color: #ffffff;
  cursor: pointer;
}

.staging-image {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.staging-card-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.staging-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.staging-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--k-text-normal, #111827);
  font-size: 0.86rem;
  font-weight: 700;
}

.staging-ext-tag {
  flex: 0 0 auto;
  padding: 1px 5px;
  border-radius: 4px;
  background-color: var(--k-bg-panel, #f1f5f9);
  color: var(--k-text-muted, #64748b);
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
  font-size: 0.65rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.staging-meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 10px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.58));
  font-size: 0.72rem;
  line-height: 1.35;
}

.staging-meta-grid span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.staging-select {
  width: 100%;
  height: 34px;
}


.staging-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
}

.staging-action-btn {
  min-width: 0;
  width: 100%;
  white-space: nowrap;
}

/* VIEW 2: DISTRIBUTION / ENDPOINT GRID */
.page-section-header {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-top: 0;
  margin-bottom: 14px;
}

.page-section-header > div {
  min-width: 0;
}

.page-section-header .notion-main-title {
  margin: 0;
  font-size: 1.78rem;
  line-height: 1.18;
  font-weight: 700;
  color: var(--k-text-normal, #37352f);
}

.page-section-header .btn-notion {
  align-self: center;
}

.section-desc.compact {
  margin: 8px 0 0 0;
  max-width: 620px;
  line-height: 1.45;
}

.endpoint-layout {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.notion-form-panel {
  padding: 12px 0;
}

.endpoint-editor-panel {
  padding: 14px;
  border: 1px solid var(--k-color-border, rgba(55, 53, 47, 0.08));
  border-radius: 6px;
  background-color: var(--k-bg-card, #ffffff);
}

.panel-title-row,
.table-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.notion-panel-title {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 0;
  margin-bottom: 16px;
  color: var(--k-text-normal, #37352f);
}

.panel-title-row .notion-panel-title,
.table-title-row .notion-panel-title {
  margin-bottom: 0;
}

.table-count {
  font-size: 0.72rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
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

.endpoint-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.span-2 {
  grid-column: 1 / -1;
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

.flex-grow {
  flex: 1;
}

.endpoint-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 4px;
  background-color: var(--k-bg-panel, rgba(55, 53, 47, 0.04));
}

.endpoint-preview span {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.5));
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
}

.endpoint-preview code {
  color: var(--k-color-primary, #2383e2);
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.74rem;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Notion Database table view for endpoints */
.notion-table-panel {
  padding: 12px 0;
}

.table-title-row {
  margin-bottom: 8px;
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
  background-color: var(--memesluna-primary-soft-bg);
  color: var(--k-color-primary, #2383e2);
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

.url-line {
  display: flex;
  align-items: center;
  gap: 4px;
}

.font-mono {
  font-family: SFMono-Regular, Consolas, monospace;
}

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
  background-color: var(--memesluna-danger-soft-bg);
  border-color: var(--memesluna-danger-border);
  color: var(--k-color-danger, #eb5757);
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

.settings-preview-panel {
  width: 100%;
  max-width: none;
  margin: 0 auto;
}

.preview-page-header {
  margin-bottom: 12px;
}

.preview-dashboard-grid {
  display: grid;
  grid-template-columns: minmax(560px, 1fr) minmax(420px, 0.9fr);
  gap: 22px;
  align-items: start;
}

.preview-card {
  min-width: 0;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.09));
  border-radius: 14px;
  background-color: var(--k-bg-card, #ffffff);
  box-shadow: 0 10px 32px rgba(15, 23, 42, 0.06);
  overflow: hidden;
}

.preview-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.08));
}

.preview-card-title {
  color: var(--k-text-normal, #111827);
  font-size: 1rem;
  line-height: 1.25;
  font-weight: 760;
}

.preview-card-desc {
  margin-top: 5px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.56));
  font-size: 0.76rem;
  line-height: 1.45;
}

.preview-action-btn {
  height: 32px;
  padding: 0 11px;
  border: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 8px;
  background-color: var(--k-bg-card, #ffffff);
  color: var(--k-text-normal, #111827);
  font-size: 0.76rem;
  font-weight: 650;
  cursor: pointer;
  white-space: nowrap;
}

.preview-action-btn:hover:not(:disabled) {
  background-color: var(--k-bg-panel, #f8fafc);
}

.preview-action-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.preview-table-wrap {
  overflow-x: auto;
}

.preview-route-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.preview-route-table th,
.preview-route-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--k-color-border, rgba(15, 23, 42, 0.06));
  text-align: left;
  vertical-align: middle;
}

.preview-route-table th {
  background-color: var(--k-bg-panel, #f8fafc);
  color: var(--k-text-muted, rgba(55, 53, 47, 0.54));
  font-size: 0.7rem;
  font-weight: 740;
}

.preview-route-table tr:last-child td {
  border-bottom: none;
}

.preview-route-table th:nth-child(1),
.preview-route-table td:nth-child(1) {
  width: 86px;
}

.preview-route-table th:nth-child(2),
.preview-route-table td:nth-child(2) {
  width: 130px;
}

.preview-route-table th:nth-child(4),
.preview-route-table td:nth-child(4) {
  width: 186px;
}

.preview-route-table th:nth-child(5),
.preview-route-table td:nth-child(5) {
  width: 64px;
  text-align: center;
}

.preview-mini-cover {
  width: 58px;
  height: 42px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border-radius: 8px;
  background-color: var(--k-color-border, rgba(15, 23, 42, 0.08));
}

.preview-mini-cover.single {
  display: block;
}

.preview-mini-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background-color: var(--k-bg-panel, #f7f7f5);
}

.preview-route-icon {
  width: 58px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background-color: var(--memesluna-primary-faint-bg);
  color: var(--k-color-primary, #2383e2);
  font-size: 0.7rem;
  font-weight: 760;
}

.preview-route-icon.endpoint {
  background-color: var(--memesluna-success-soft-bg);
  color: var(--k-color-success, #2b8a5c);
}

.preview-route-name {
  min-width: 0;
  color: var(--k-text-normal, #111827);
  font-size: 0.84rem;
  font-weight: 730;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-route-type {
  display: inline-flex;
  align-items: center;
  margin-top: 5px;
  padding: 2px 6px;
  border-radius: 999px;
  background-color: var(--memesluna-primary-soft-bg);
  color: var(--k-color-primary, #2383e2);
  font-size: 0.66rem;
  font-weight: 700;
}

.preview-route-type.endpoint {
  background-color: var(--memesluna-success-soft-bg);
  color: var(--k-color-success, #2b8a5c);
}

.preview-route-desc {
  color: var(--k-text-muted, rgba(55, 53, 47, 0.64));
  font-size: 0.78rem;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  line-height: 1.45;
  max-height: calc(1.45em * 3);
}

.preview-route-path {
  display: block;
  max-width: 100%;
  padding: 6px 8px;
  border-radius: 7px;
  background-color: var(--memesluna-primary-faint-bg);
  color: var(--k-color-primary, #2383e2);
  font-family: SFMono-Regular, Consolas, monospace;
  font-size: 0.72rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.preview-row-actions {
  display: flex;
  align-items: center;
  justify-content: center;
}

.preview-empty-state {
  padding: 64px 20px;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.48));
  text-align: center;
  font-size: 0.82rem;
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

.preview-sub-desc {
  margin-top: 2px;
  font-size: 0.72rem;
  color: var(--k-text-muted, rgba(55, 53, 47, 0.45));
}

.preview-block-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
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
  max-height: 620px;
  background-color: var(--memesluna-final-prompt-bg);
  border-color: var(--memesluna-primary-soft-bg);
}

.preview-code-block.polished {
  margin: 16px;
  border-radius: 12px;
  background: var(--memesluna-code-bg);
  border-color: var(--memesluna-code-border);
  box-shadow: none;
}

.preview-code-block.final-prompt pre {
  color: var(--memesluna-code-text);
  font-size: 0.76rem;
  line-height: 1.7;
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
  box-shadow: var(--memesluna-card-shadow);
  color: var(--k-text-normal, #37352f);
}

.toast-banner.success {
  background-color: var(--memesluna-toast-success-bg);
  border-color: var(--memesluna-success-soft-bg);
  color: var(--k-color-success, #2b8a5c);
}

.toast-banner.error {
  background-color: var(--memesluna-toast-error-bg);
  border-color: var(--memesluna-danger-border);
  color: var(--k-color-danger, #eb5757);
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

@media (max-width: 1280px) {
  .notion-content {
    padding: 64px 80px 96px;
  }

  .preview-dashboard-grid {
    grid-template-columns: 1fr;
  }

  .staging-grid {
    grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  }
}

@media (max-width: 780px) {
  .memesluna-app-layout {
    padding-left: 0;
  }

  .notion-content {
    padding: 18px 16px;
  }

  .content-breadcrumb-header,
  .notion-db-header,
  .page-section-header,
  .notion-page-header,
  .gallery-bulk-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .notion-db-actions,
  .bulk-actions,
  .form-actions,
  .staging-header-actions {
    width: 100%;
  }

  .collection-name-input-notion,
  .notion-db-actions .btn,
  .form-actions .btn {
    width: 100%;
  }

  .endpoint-form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }

  .folders-grid {
    grid-template-columns: 1fr;
  }

  .notion-gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  }

  .preview-block-header {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-card-header {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-action-btn {
    width: 100%;
  }

  .staging-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .staging-search-box {
    max-width: none;
    width: 100%;
  }

  .preview-route-table {
    min-width: 720px;
  }
}

/* View toggle pill */
.view-toggle-pill {
  display: inline-flex;
  background: rgba(55, 53, 47, 0.06);
  border-radius: 6px;
  padding: 2px;
  margin-right: 8px;
}

.pill-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 0.78rem;
  font-weight: 500;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  color: rgba(55, 53, 47, 0.4);
  transition: all 0.15s ease;
}

.pill-btn:hover {
  color: rgba(55, 53, 47, 0.65);
  background: rgba(55, 53, 47, 0.04);
}

.pill-btn.active {
  background: #fff;
  color: #37352f;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}

/* Tag view section */
.tag-view-section {
  margin-top: 8px;
}

/* Tag detail view */
.tag-detail-view {
  padding: 0;
}

.tag-images-grid {
  margin-top: 16px;
}

.gallery-card-footer {
  padding: 8px 10px;
  font-size: 0.75rem;
}

.gallery-card-collection {
  font-weight: 500;
  color: var(--k-text-normal, #37352f);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.mini-tag {
  display: inline-block;
  font-size: 0.65rem;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(55, 53, 47, 0.06);
  color: rgba(55, 53, 47, 0.55);
  cursor: pointer;
  transition: all 0.1s ease;
  white-space: nowrap;
}

.mini-tag:hover {
  background: rgba(55, 53, 47, 0.1);
  color: rgba(55, 53, 47, 0.8);
}

.mini-tag.active-tag {
  background: rgba(35, 131, 226, 0.12);
  color: #2383e2;
  font-weight: 500;
}

/* Tag Editor Dialog */
.tag-editor-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.tag-editor-dialog {
  background: #fff;
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0,0,0,0.15);
  width: 420px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.tag-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(55,53,47,0.08);
}

.tag-editor-title {
  font-size: 1rem;
  font-weight: 600;
  color: #37352f;
}

.tag-editor-subtitle {
  font-size: 0.75rem;
  color: rgba(55,53,47,0.4);
  margin-top: 2px;
  word-break: break-all;
}

.tag-editor-body {
  padding: 16px 20px 20px;
  overflow-y: auto;
}

.tag-editor-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
  min-height: 32px;
}

.tag-editor-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 0.78rem;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(35, 131, 226, 0.1);
  color: #2383e2;
}

.tag-remove-btn {
  background: none;
  border: none;
  font-size: 1rem;
  color: inherit;
  cursor: pointer;
  opacity: 0.5;
  padding: 0 2px;
  line-height: 1;
}

.tag-remove-btn:hover { opacity: 1; }

.tag-editor-empty {
  font-size: 0.78rem;
  color: rgba(55,53,47,0.3);
}

.tag-editor-input-row {
  display: flex;
  gap: 8px;
}

.tag-editor-input {
  flex: 1;
}

@media (max-width: 1180px) {
  .asset-hero-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 980px) {
  .detail-topbar,
  .asset-gallery-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .detail-top-actions,
  .asset-filter-bar {
    justify-content: flex-start;
  }

  .asset-filter-bar {
    flex-wrap: wrap;
  }

  .asset-search-box {
    max-width: none;
    width: 100%;
  }
}

@media (max-width: 640px) {
  .asset-hero-panel {
    padding: 14px;
    border-radius: 14px;
  }

  .asset-identity-card {
    align-items: flex-start;
  }

  .asset-avatar-frame {
    width: 72px;
    height: 72px;
    flex-basis: 72px;
    border-radius: 14px;
  }

  .asset-title-row h1 {
    font-size: 1.35rem;
  }

  .asset-api-row {
    grid-template-columns: 1fr;
  }

  .asset-tabs,
  .detail-top-actions {
    width: 100%;
  }

  .asset-btn {
    flex: 1;
  }

  .notion-gallery-grid {
    grid-template-columns: repeat(auto-fill, minmax(138px, 1fr));
  }

  .staging-grid {
    grid-template-columns: 1fr;
  }

  .staging-actions {
    grid-template-columns: 1fr;
  }
}
</style>





