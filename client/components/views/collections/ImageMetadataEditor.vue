<template>
              <div v-if="tagEditorVisible" class="tag-editor-overlay" @click.self="closeTagEditor">
                <div class="tag-editor-dialog">
                  <div class="tag-editor-header">
                    <div>
                      <div class="tag-editor-title">编辑语义标注</div>
                      <div class="tag-editor-subtitle">{{ tagEditorCollection }} / {{ tagEditorImage }}</div>
                    </div>
                    <div class="tag-editor-header-actions">
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
                  <div class="tag-editor-body">
                    <!-- Tags Section -->
                    <div class="tag-section-wrapper">
                      <div class="tag-section-label">
                        <span>🏷️</span>
                        <span>语义标签 (Tags)</span>
                        <span class="tag-section-hint">用于跨合集关键词检索</span>
                      </div>
                      <div class="tag-editor-list">
                        <span
                          v-for="tag in tagEditorTags"
                          :key="tag"
                          class="tag-editor-tag"
                        >
                          {{ tag }}
                          <button @click="removeTagFromEditor(tag)" class="tag-remove-btn" :disabled="tagEditorSaving || aiAnnotating">×</button>
                        </span>
                        <span v-if="!tagEditorTags.length" class="tag-editor-empty">暂无标签</span>
                      </div>
                      <div class="tag-editor-input-row">
                        <input
                          v-model="tagEditorInput"
                          class="flat-input tag-editor-input"
                          list="allowed-tags-list"
                          placeholder="输入情绪、动作、场景或元素标签"
                          @keyup.enter="addTagFromEditor"
                          :disabled="tagEditorSaving || aiAnnotating"
                        />
                        <button @click="addTagFromEditor" class="btn btn-secondary btn-small" :disabled="!tagEditorInput.trim() || tagEditorSaving || aiAnnotating">
                          添加
                        </button>
                      </div>
                    </div>

                    <!-- Aliases Section -->
                    <div class="tag-section-wrapper">
                      <div class="tag-section-label">
                        <span>🔍</span>
                        <span>检索别名 (Aliases)</span>
                        <span class="tag-section-hint">用于 q=关键词 自然语言检索</span>
                      </div>
                      <div class="tag-editor-list">
                        <span
                          v-for="alias in tagEditorAliases"
                          :key="alias"
                          class="tag-editor-tag is-alias"
                        >
                          {{ alias }}
                          <button @click="removeAliasFromEditor(alias)" class="tag-remove-btn" :disabled="tagEditorSaving || aiAnnotating">×</button>
                        </span>
                        <span v-if="!tagEditorAliases.length" class="tag-editor-empty">暂无别名</span>
                      </div>
                      <div class="tag-editor-input-row">
                        <input
                          v-model="aliasEditorInput"
                          class="flat-input tag-editor-input"
                          placeholder="输入自然语言检索短语，回车添加"
                          @keyup.enter="addAliasFromEditor"
                          :disabled="tagEditorSaving || aiAnnotating"
                        />
                        <button @click="addAliasFromEditor" class="btn btn-secondary btn-small" :disabled="!aliasEditorInput.trim() || tagEditorSaving || aiAnnotating">
                          添加
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'

export default defineComponent({
  name: 'ImageMetadataEditor',
  setup() {
    return useDashboardContext()
  },
})
</script>
