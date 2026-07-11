<template>
        <div class="staging-router-view">
          <div class="notion-db-header page-section-header staging-page-header">
            <div>
              <h1 class="notion-main-title">暂缓区</h1>
              <p class="section-desc compact">复核被上传过滤器拦截或自动收集的候选图片，再手动归档到表情包分组</p>
            </div>
            <div class="staging-header-actions">
              <button
                @click="toggleSimilarStagingMode"
                :class="['asset-btn', 'secondary', { 'is-active': stagingViewMode === 'similar' }]"
                :disabled="similarLoading || stagedImages.length < 2"
              >
                {{ similarLoading ? '筛选中...' : (stagingViewMode === 'similar' ? '显示全部' : '筛选相似图片') }}
              </button>
              <button @click="refreshStagedImages" class="asset-btn secondary">
                刷新列表
              </button>
              <button
                v-if="stagedImages.length"
                @click="confirmDeleteAllStagedImages"
                class="asset-btn danger"
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
                <article
                  v-for="(item, index) in group.items"
                  :key="item.id"
                  class="staging-card"
                  :class="{
                    'staging-card-selected': isStagedSelected(item.id),
                    'notion-gallery-card-active-dropdown': activeCardMenu === stagedMenuKey(item.id),
                    'submenu-open-right': isFirstStagingColumn(index),
                  }"
                >
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
                    <div class="gallery-card-footer-row">
                      <div class="staging-title" :title="item.originalName || item.filename">
                        {{ item.originalName || item.filename }}
                      </div>
                      <div class="gallery-card-menu-container">
                        <button class="gallery-card-menu-btn" @click.stop="toggleCardMenu(stagedMenuKey(item.id))" title="更多操作">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <circle cx="12" cy="12" r="1.5"></circle>
                            <circle cx="19" cy="12" r="1.5"></circle>
                            <circle cx="5" cy="12" r="1.5"></circle>
                          </svg>
                        </button>
                        <div class="gallery-card-menu-dropdown" v-show="activeCardMenu === stagedMenuKey(item.id)" @click.stop>
                          <div v-if="collections.length" class="gallery-card-submenu-trigger">
                            <span>移动至表情包</span>
                            <div class="gallery-card-submenu">
                              <button
                                v-for="collection in collections"
                                :key="collection.name"
                                :disabled="stagingBusyId === item.id"
                                @click="promoteStagedImage(item, collection.name); closeCardMenu()"
                              >
                                {{ collection.name }}
                              </button>
                            </div>
                          </div>
                          <button
                            class="danger"
                            :disabled="stagingBusyId === item.id"
                            @click="deleteStagedImage(item); closeCardMenu()"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    </div>
                    <div class="staging-meta-grid">
                      <span :title="item.reason || '暂缓候选'">{{ item.reason || '暂缓候选' }}</span>
                      <span>{{ item.source || 'filter' }}</span>
                      <span>{{ formatSize(item.size) }}</span>
                      <span>{{ formatDate(item.createdAt) }}</span>
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

            <div ref="stagingGridEl" class="staging-grid">
              <article
                v-for="(item, index) in filteredStagedImages"
                :key="item.id"
                class="staging-card"
                :class="{
                  'staging-card-selected': isStagedSelected(item.id),
                  'notion-gallery-card-active-dropdown': activeCardMenu === stagedMenuKey(item.id),
                  'submenu-open-right': isFirstStagingColumn(index),
                }"
              >
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
                  <div class="gallery-card-footer-row">
                    <div class="staging-title" :title="item.originalName || item.filename">
                      {{ item.originalName || item.filename }}
                    </div>
                    <div class="gallery-card-menu-container">
                      <button class="gallery-card-menu-btn" @click.stop="toggleCardMenu(stagedMenuKey(item.id))" title="更多操作">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                          <circle cx="12" cy="12" r="1.5"></circle>
                          <circle cx="19" cy="12" r="1.5"></circle>
                          <circle cx="5" cy="12" r="1.5"></circle>
                        </svg>
                      </button>
                      <div class="gallery-card-menu-dropdown" v-show="activeCardMenu === stagedMenuKey(item.id)" @click.stop>
                        <div v-if="collections.length" class="gallery-card-submenu-trigger">
                          <span>移动至表情包</span>
                          <div class="gallery-card-submenu">
                            <button
                              v-for="collection in collections"
                              :key="collection.name"
                              :disabled="stagingBusyId === item.id"
                              @click="promoteStagedImage(item, collection.name); closeCardMenu()"
                            >
                              {{ collection.name }}
                            </button>
                          </div>
                        </div>
                        <button
                          class="danger"
                          :disabled="stagingBusyId === item.id"
                          @click="deleteStagedImage(item); closeCardMenu()"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="staging-meta-grid">
                    <span :title="item.reason || '暂缓候选'">{{ item.reason || '暂缓候选' }}</span>
                    <span>{{ item.source || 'filter' }}</span>
                    <span>{{ formatSize(item.size) }}</span>
                    <span>{{ formatDate(item.createdAt) }}</span>
                  </div>
                </div>
              </article>
            </div>
          </div>
        </div>
</template>
<script lang="ts">
import { defineComponent, ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'StagingView',
  setup() {
    const ctx = useDashboardContext()
    const stagingGridEl = ref<HTMLElement | null>(null)
    const stagingColumnCount = ref(1)

    function stagedMenuKey(id: string) {
      return `staged:${id}`
    }

    function updateStagingColumnCount() {
      const el = stagingGridEl.value
      if (!el) {
        stagingColumnCount.value = 1
        return
      }
      const styles = getComputedStyle(el)
      const cols = styles.gridTemplateColumns
        .split(' ')
        .map((part) => part.trim())
        .filter(Boolean)
      stagingColumnCount.value = Math.max(1, cols.length || 1)
    }

    function isFirstStagingColumn(index: number): boolean {
      return index % stagingColumnCount.value === 0
    }

    let resizeObserver: ResizeObserver | null = null

    onMounted(() => {
      nextTick(updateStagingColumnCount)
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => updateStagingColumnCount())
        if (stagingGridEl.value) resizeObserver.observe(stagingGridEl.value)
      }
      window.addEventListener('resize', updateStagingColumnCount)
    })

    onUnmounted(() => {
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updateStagingColumnCount)
    })

    watch(
      () => [ctx.filteredStagedImages.value.length, ctx.stagingViewMode.value],
      () => nextTick(updateStagingColumnCount),
    )

    return Object.assign({}, ctx, {
      stagingGridEl,
      stagedMenuKey,
      isFirstStagingColumn,
    })
  },
})
</script>
