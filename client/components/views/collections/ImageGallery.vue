<template>
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
                    <button @click="openBulkTagEditor" class="toolbar-btn compact">设置标注</button>
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
                      <div class="gallery-card-title" :title="item.label">{{ item.label }}</div>
                      <div class="gallery-card-footer-row">
                        <div v-if="item.type === 'local'" class="gallery-card-tags">
                          <span
                            v-for="tag in getVisibleImageTags(item.value)"
                            :key="tag"
                            class="gallery-card-tag-badge"
                            :style="{ backgroundColor: tagColor(tag) + '12', color: tagColor(tag), borderColor: tagColor(tag) + '22' }"
                          >{{ tag }}</span>
                          <span
                            v-if="getHiddenImageTagsCount(item.value)"
                            class="gallery-card-tag-badge gallery-card-tag-more"
                            :title="getImageTags(item.value).join('、')"
                          >+{{ getHiddenImageTagsCount(item.value) }}</span>
                          <span v-if="!getImageTags(item.value).length" class="gallery-card-tag-empty">暂无标签</span>
                        </div>
                        <div v-else class="gallery-card-tags-placeholder"></div>

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
                              <button @click="openTagEditor(currentCollection.name, item.value); closeCardMenu()">编辑标注</button>
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
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'ImageGallery',
  setup() {
    return useDashboardContext()
  },
})
</script>
