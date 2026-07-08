<template>
        <div class="settings-router-view">
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
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'PreviewView',
  setup() {
    return useDashboardContext()
  },
})
</script>
