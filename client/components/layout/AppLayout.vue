<template>
  <div class="memesluna-app-layout">
    <main class="notion-content">
      <AppHeader />
      <MenuSwitcher v-if="!currentCollection" />
      <Toast />
      <LoadingSpinner v-if="loading" />

      <div v-else class="content-body-wrapper">
        <CollectionsView v-if="activeMenu === 'resources'" />
        <EndpointsView v-else-if="activeMenu === 'distribution'" />
        <StagingView v-else-if="activeMenu === 'staging'" />
        <PreviewView v-else-if="activeMenu === 'settings'" />
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../composables/dashboardContext'
import AppHeader from './AppHeader.vue'
import MenuSwitcher from './MenuSwitcher.vue'
import Toast from '../shared/Toast.vue'
import LoadingSpinner from '../shared/LoadingSpinner.vue'
import CollectionsView from '../views/collections/CollectionsView.vue'
import EndpointsView from '../views/endpoints/EndpointsView.vue'
import StagingView from '../views/staging/StagingView.vue'
import PreviewView from '../views/preview/PreviewView.vue'

export default defineComponent({
  name: 'AppLayout',
  components: {
    AppHeader,
    MenuSwitcher,
    Toast,
    LoadingSpinner,
    CollectionsView,
    EndpointsView,
    StagingView,
    PreviewView,
  },
  setup() {
    return useDashboardContext()
  },
})
</script>
