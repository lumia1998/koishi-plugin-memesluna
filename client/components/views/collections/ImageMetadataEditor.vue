<template>
              <div v-if="tagEditorVisible" class="tag-editor-overlay" @click.self="closeTagEditor">
                <div class="tag-editor-dialog">
                  <div class="tag-editor-header">
                    <div>
                      <div class="tag-editor-title">编辑语义标注</div>
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
                        <span>语义标签 (Tags)</span>
                        <span style="font-size: 11px; font-weight: normal; color: var(--k-text-muted, #888); margin-left: 4px;">用于跨合集关键词检索</span>
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
                          placeholder="输入情绪、动作、场景或元素标签"
                          @keyup.enter="addTagFromEditor"
                          :disabled="tagEditorSaving || aiAnnotating"
                          style="flex-grow: 1;"
                        />
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
                        <span style="font-size: 11px; font-weight: normal; color: var(--k-text-muted, #888); margin-left: 4px;">用于 q=关键词 自然语言检索</span>
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
                          placeholder="输入自然语言检索短语，回车添加"
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
