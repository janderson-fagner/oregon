<script setup>
import { ref, computed, onMounted } from 'vue'
import { getAllVariables, copyVariableToClipboard } from '@/utils/dynamicVariables.js'

const props = defineProps({
  flowVariables: {
    type: Array,
    default: () => [],
  },
  showVariables: {
    type: Boolean,
    default: true,
  },
})

const { setAlert } = useAlert()

const loadedVariables = ref([])

onMounted(async () => {
  try {
    const vars = await getAllVariables()
    loadedVariables.value = vars
  } catch (error) {
    console.error('Erro ao carregar variáveis:', error)
  }
})

const mergedVariables = computed(() => {
  const all = [...loadedVariables.value, ...props.flowVariables]
  const seen = new Set()
  const unique = []

  for (const v of all) {
    if (!seen.has(v.value)) {
      seen.add(v.value)
      unique.push(v)
    }
  }

  return unique.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt-BR'))
})

const getChipColor = (type) => {
  if (type === 'dinamica') return 'success'
  if (type === 'sistema' || type === 'mensagem') return 'info'
  return 'primary'
}

const handleCopy = (variable) => {
  copyVariableToClipboard(variable.value, setAlert)
}
</script>

<template>
  <div v-if="showVariables">
    <VDivider class="my-4" />
    <VExpansionPanels variant="accordion">
      <VExpansionPanel>
        <VExpansionPanelTitle>
          <div class="d-flex align-center gap-2">
            <VIcon icon="tabler-variable" size="20" color="primary" />
            <span class="text-sm">Variáveis Disponíveis</span>
          </div>
        </VExpansionPanelTitle>
        <VExpansionPanelText>
          <p class="text-caption text-medium-emphasis mb-3">
            Clique em uma variável para copiá-la
          </p>

          <div class="d-flex flex-wrap gap-2">
            <VChip
              v-for="variable in mergedVariables"
              :key="variable.value"
              size="small"
              variant="tonal"
              class="cursor-pointer"
              :color="getChipColor(variable.type)"
              @click="handleCopy(variable)"
            >
              <VIcon
                icon="tabler-copy"
                size="small"
                class="me-1"
              />
              {{ variable.title }}
            </VChip>
          </div>

          <div class="text-caption mt-3">
            <VIcon icon="tabler-info-circle" class="me-1" size="small" />
            <span class="text-success">Verde</span> = Dinâmicas |
            <span class="text-info">Azul</span> = Sistema |
            <span class="text-primary">Primário</span> = Cliente/Agendamento/Negócio
          </div>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
</template>
