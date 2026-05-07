<template>
  <div>
    <VDivider class="my-4" />
    <VExpansionPanels variant="accordion">
      <VExpansionPanel>
        <VExpansionPanelTitle>
          <div class="d-flex align-center gap-2">
            <VIcon icon="tabler-info-circle" size="20" color="info" />
            <span class="text-sm">{{ title }}</span>
          </div>
        </VExpansionPanelTitle>
        <VExpansionPanelText>
          <div
            v-for="(item, index) in items"
            :key="index"
            class="d-flex align-start gap-2 mb-2"
          >
            <VIcon :icon="item.icon" :color="item.color" size="18" class="mt-1 flex-shrink-0" />
            <span class="text-sm" style="white-space: normal; word-break: break-word;">{{ item.text }}</span>
          </div>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>

    <div v-if="hint" class="text-caption text-medium-emphasis mt-2">
      <VIcon icon="tabler-info-circle" class="me-1" />
      {{ hint }}
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: 'Como funciona' },
  items: { type: Array, default: () => [] },
  hint: { type: String, default: '' },
});
</script>
