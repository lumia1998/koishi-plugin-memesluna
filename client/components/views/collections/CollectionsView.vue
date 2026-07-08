<template>
  <div class="resources-router-view">
    <CollectionList v-if="!currentCollection" />
    <CollectionDetail v-if="currentCollection" />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import { useDashboardContext } from '../../../composables/dashboardContext'
import CollectionList from './CollectionList.vue'
import CollectionDetail from './CollectionDetail.vue'

export default defineComponent({
  name: 'CollectionsView',
  components: {
    CollectionList,
    CollectionDetail,
  },
  setup() {
    return useDashboardContext()
  },
})
</script>
