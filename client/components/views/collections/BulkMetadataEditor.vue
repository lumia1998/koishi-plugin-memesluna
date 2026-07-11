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
                  <div class="tag-editor-body">
                    <!-- Operation Mode Toggle -->
                    <div class="tag-editor-mode-row">
                      <span>操作模式</span>
                      <div class="view-toggle-pill">
                        <button
                          :class="['pill-btn', bulkTagOperationMode === 'add' ? 'active' : '']"
                          @click="bulkTagOperationMode = 'add'"
                        >
                          追加标注
                        </button>
                        <button
                          :class="['pill-btn', bulkTagOperationMode === 'replace' ? 'active' : '']"
                          @click="bulkTagOperationMode = 'replace'"
                        >
                          覆盖标注
                        </button>
                      </div>
                    </div>

                    <!-- Tags Section -->
                    <div class="tag-section-wrapper">
                      <div class="tag-section-label">
                        <span>🏷️</span>
                        <span>批量添加语义标签 (Tags)</span>
                      </div>
                      <div class="tag-editor-list">
                        <span
                          v-for="tag in bulkTagEditorTags"
                          :key="tag"
                          class="tag-editor-tag"
                        >
                          {{ tag }}
                          <button @click="removeTagFromBulkEditor(tag)" class="tag-remove-btn" :disabled="bulkTagEditorSaving">×</button>
                        </span>
                        <span v-if="!bulkTagEditorTags.length" class="tag-editor-empty">等待添加标签</span>
                      </div>
                      <div class="tag-editor-input-row">
                        <input
                          v-model="bulkTagEditorInput"
                          class="flat-input tag-editor-input"
                          list="allowed-tags-list"
                          placeholder="输入情绪、动作、场景或元素标签"
                          @keyup.enter="addTagToBulkEditor"
                          :disabled="bulkTagEditorSaving"
                        />
                        <button @click="addTagToBulkEditor" class="btn btn-secondary btn-small" :disabled="!bulkTagEditorInput.trim() || bulkTagEditorSaving">
                          添加
                        </button>
                      </div>
                    </div>

                    <!-- Aliases Section -->
                    <div class="tag-section-wrapper">
                      <div class="tag-section-label">
                        <span>🔍</span>
                        <span>批量添加检索别名 (Aliases)</span>
                      </div>
                      <div class="tag-editor-list">
                        <span
                          v-for="alias in bulkTagEditorAliases"
                          :key="alias"
                          class="tag-editor-tag is-alias"
                        >
                          {{ alias }}
                          <button @click="removeAliasFromBulkEditor(alias)" class="tag-remove-btn" :disabled="bulkTagEditorSaving">×</button>
                        </span>
                        <span v-if="!bulkTagEditorAliases.length" class="tag-editor-empty">等待添加别名</span>
                      </div>
                      <div class="tag-editor-input-row">
                        <input
                          v-model="bulkAliasEditorInput"
                          class="flat-input tag-editor-input"
                          placeholder="输入自然语言检索短语，回车添加"
                          @keyup.enter="addAliasToBulkEditor"
                          :disabled="bulkTagEditorSaving"
                        />
                        <button @click="addAliasToBulkEditor" class="btn btn-secondary btn-small" :disabled="!bulkAliasEditorInput.trim() || bulkTagEditorSaving">
                          添加
                        </button>
                      </div>
                    </div>
                  </div>
                  <div class="tag-editor-footer">
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
