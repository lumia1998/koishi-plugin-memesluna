<template>
              <div v-if="bulkTagEditorVisible" class="tag-editor-overlay" @click.self="bulkTagEditorVisible = false">
                <div class="tag-editor-dialog">
                  <div class="tag-editor-header">
                    <div>
                      <div class="tag-editor-title">批量设置语义标注</div>
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
                          追加标注
                        </button>
                        <button
                          :class="['pill-btn', bulkTagOperationMode === 'replace' ? 'active' : '']"
                          @click="bulkTagOperationMode = 'replace'"
                          style="font-size: 12px; padding: 4px 8px;"
                        >
                          覆盖标注
                        </button>
                      </div>
                    </div>

                    <!-- Tags Section -->
                    <div class="tag-section-wrapper" style="border-bottom: 1px solid rgba(120, 120, 120, 0.15); padding-bottom: 14px;">
                      <div class="tag-section-label" style="font-weight: 600; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 6px;">
                        <span>🏷️</span>
                        <span>批量添加语义标签 (Tags)</span>
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
                          placeholder="输入情绪、动作、场景或元素标签"
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
                        <span>批量添加检索别名 (Aliases)</span>
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
                          placeholder="输入自然语言检索短语，回车添加"
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
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'BulkMetadataEditor',
  setup() {
    return useDashboardContext()
  },
})
</script>
