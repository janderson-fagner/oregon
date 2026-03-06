<script setup>
import { ref, computed } from "vue"
import { Icon } from "@iconify/vue"
import tablerIcons from "@iconify-json/tabler/icons.json"

const props = defineProps({
  modelValue: {
    type: String,
    default: null,
  },
})

const emit = defineEmits(["update:modelValue"])

// lista de ícones vem do JSON do Iconify
const iconNames = Object.keys(tablerIcons.icons)

const search = ref("")
const page = ref(1)
const itemsPerPage = ref(60)

const filteredIcons = computed(() =>
  iconNames
    .filter(name => name.toLowerCase().includes(search.value.toLowerCase()))
    .slice(
      (page.value - 1) * itemsPerPage.value,
      page.value * itemsPerPage.value,
    ),
)

function selectIcon(name) {
  emit("update:modelValue", name)
}

const viewDialogIcon = ref(false)
</script>

<template>
  <div class="d-flex flex-row gap-2 align-center mt-4">
    <p class="mb-0 text-sm">
      Ícone do menu
    </p>

    <VCard
      variant="outlined"
      class="pa-2"
      @click="viewDialogIcon = true"
    >
      <VIcon
        v-if="props.modelValue"
        :icon="`tabler-${props.modelValue}`"
      />
    </VCard>
  </div>
  <VDialog
    v-model="viewDialogIcon"
    max-width="600"
  >
    <VCard>
      <VCardText>
        <div class="d-flex flex-row justify-space-between align-center mb-4">
          <h3 class="text-h6 mb-0">
            Selecione um ícone
          </h3>

          <VIcon
            icon="tabler-x"
            @click="viewDialogIcon = false"
          />
        </div>

        <VTextField
          v-model="search"
          placeholder="Pesquisar ícone..."
          class="mb-4"
        />

        <div class="d-flex flex-wrap gap-3">
          <VCard
            v-for="name in filteredIcons"
            :key="name"
            variant="outlined"
            class="pa-2"
            :color="modelValue === name ? 'primary' : ''"
            @click="selectIcon(name)"
          >
            <VIcon
              :icon="`tabler-${name}`"
              size="20"
            />
          </VCard>
        </div>

        <div class="d-flex justify-center mt-4">
          <VPagination
            v-model="page"
            :length="Math.ceil(iconNames.length / itemsPerPage)"
            :total-visible="7"
          />
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
