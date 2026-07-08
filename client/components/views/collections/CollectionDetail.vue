<template>
          <div
            v-if="currentCollection"
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
              <ImageMetadataEditor />
              <BulkMetadataEditor />
              <ImageGallery />
            </div>
          </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'
import ImageMetadataEditor from './ImageMetadataEditor.vue'
import BulkMetadataEditor from './BulkMetadataEditor.vue'
import ImageGallery from './ImageGallery.vue'

export default defineComponent({
  name: 'CollectionDetail',
  components: {
    ImageMetadataEditor,
    BulkMetadataEditor,
    ImageGallery,
  },
  setup() {
    return useDashboardContext()
  },
})
</script>
