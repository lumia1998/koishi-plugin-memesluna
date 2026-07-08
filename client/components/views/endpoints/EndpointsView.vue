<template>
        <div class="distribution-router-view">
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
                  <span class="field-hint">支持中文、字母、数字、下划线和连字符，不能与表情包重名</span>
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
                            {{ getRouteDisplayPath(item.name) }}
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
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'EndpointsView',
  setup() {
    return useDashboardContext()
  },
})
</script>
