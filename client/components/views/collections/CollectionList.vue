<template>
          <div v-if="!currentCollection" class="collections-folder-view">
            <!-- Creator bar in Notion Style -->
            <div class="notion-db-header page-section-header collection-list-header">
              <div>
                <h1 class="notion-main-title">表情包管理</h1>
                <p class="section-desc compact">管理表情包合集与图片素材</p>
              </div>
              <div class="notion-db-actions collection-toolbar">
                <!-- View toggle: collection / tag -->
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
            <div v-if="!collections.length" class="empty-placeholder-card">
              <div class="empty-icon">📁</div>
              <h3>尚未创建任何表情包</h3>
              <p>点击右上角按钮即可快速创建一个新的表情包合集。</p>
            </div>

            <div v-else-if="!filteredCollections.length" class="empty-placeholder-card">
              <div class="empty-icon">🔎</div>
              <h3>没有匹配的表情包合集</h3>
              <p>换个关键词或筛选条件再试试。</p>
            </div>

            <div v-else class="folders-grid">
              <div
                v-for="item in filteredCollections"
                :key="item.name"
                class="folder-card"
                :class="{ 'folder-card-active-menu': activeCollectionMenu === item.name }"
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
          <!-- END: collections-folder-view -->
          </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'CollectionList',
  setup() {
    return useDashboardContext()
  },
})
</script>
