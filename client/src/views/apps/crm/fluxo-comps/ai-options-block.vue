<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <h6 class="text-h6 mb-0">Opções com Decisão IA</h6>
        <p class="text-caption mb-0 text-medium-emphasis">
          Configure as opções que serão analisadas pela IA para decidir qual seguir
        </p>
      </div>
      <VBtn
        @click="addOption"
        variant="tonal"
        color="primary"
        size="small"
        style="height: 30px"
      >
        <VIcon class="me-1" icon="tabler-plus" />
        Opção
      </VBtn>
    </div>

    <!-- Lista de Opções -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">
        Opções do Menu ({{ localConfig.options.length }})
      </h6>

      <draggable
        v-model="localConfig.options"
        item-key="id"
        handle=".drag-handle"
        ghost-class="ghost"
        @end="onDragEnd"
      >
        <template #item="{ element, index }">
          <VCard class="mb-3 py-3" variant="outlined" :class="'cursor-move'">
            <VRow class="align-center" dense>
              <!-- Drag Handle -->
              <VCol
                cols="1"
                class="drag-handle cursor-move d-flex align-center justify-center"
              >
                <VIcon icon="tabler-grip-vertical" size="20" color="grey" />
              </VCol>

              <!-- Número da opção -->
              <VCol cols="1" class="d-flex align-center justify-center">
                <VChip color="primary" size="small" variant="tonal">
                  {{ index + 1 }}
                </VChip>
              </VCol>

              <!-- Input da opção -->
              <VCol cols="8">
                <VTextField
                  v-model="element.label"
                  :label="`Opção ${index + 1}`"
                  placeholder="Ex: Agendar consulta"
                  required
                  density="compact"
                  hide-details
                >
                  <template #prepend-inner>
                    <VIcon icon="tabler-menu-2" size="small" />
                  </template>
                </VTextField>
              </VCol>

              <!-- Botão Remover -->
              <VCol cols="2" class="d-flex justify-center">
                <IconBtn
                  @click="removeOption(index)"
                  color="error"
                  variant="tonal"
                  size="small"
                >
                  <VIcon icon="tabler-trash" size="20" />
                </IconBtn>
              </VCol>
            </VRow>
          </VCard>
        </template>
      </draggable>

      <!-- Estado Vazio -->
      <VCard
        v-if="localConfig.options.length === 0"
        variant="outlined"
        class="pa-6 text-center"
      >
        <VIcon icon="tabler-list-check" size="48" color="grey" class="mb-2" />
        <p class="text-body-2 text-medium-emphasis mb-0">
          Nenhuma opção cadastrada
        </p>
        <p class="text-caption text-medium-emphasis">
          Clique em "+ Opção" para adicionar
        </p>
      </VCard>
    </div>

    <VDivider class="my-4" />

    <!-- Instruções para a IA -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Instruções para a IA</h6>
      <p class="text-caption text-medium-emphasis mb-3">
        Dê instruções claras para a IA decidir qual opção seguir baseado nas últimas 50 mensagens do cliente.
      </p>

      <!-- Editor Quill para instruções -->
      <div class="inputQP">
        <div id="toolbar-ai-instructions">
          <button class="ql-bold"></button>
          <button class="ql-italic"></button>
          <button class="ql-strike"></button>

          <AppSelect
            v-model="variavel"
            :items="variaveisItens"
            @update:modelValue="insertVariable"
            item-title="title"
            item-value="value"
            placeholder="Inserir variável"
            class="select-var"
          />
        </div>
        <QuillEditor
          v-model:content="localConfig.instructions"
          :options="instructionsEditorOptions"
          class="inputQP mb-3"
          contentType="html"
          ref="refInstructionsEditor"
        />
      </div>
    </div>

    <VDivider class="my-4" />

    <!-- Configurações de Validação -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Configurações de Validação</h6>

      <VRow>
        <VCol cols="12" md="6">
          <AppTextField
            v-model.number="localConfig.maxAttempts"
            label="Máximo de Tentativas"
            type="number"
            min="1"
            max="10"
            hint="Número máximo de tentativas para opção inválida (0 = ilimitado)"
            persistent-hint
          >
            <template #prepend-inner>
              <VIcon icon="tabler-number" size="small" />
            </template>
          </AppTextField>
        </VCol>
      </VRow>
    </div>

    <!-- Variáveis Disponíveis -->
    <VariablesSection :flow-variables="props.flowVariables" />

    <!-- Informações -->
    <BlockInfoSection
      title="Como funciona"
      :items="[
        { icon: 'tabler-check', color: 'success', text: 'A IA analisa as últimas 50 mensagens do cliente' },
        { icon: 'tabler-check', color: 'success', text: 'Baseado nas instruções, a IA decide qual opção seguir' },
        { icon: 'tabler-check', color: 'success', text: 'Cada opção terá um ponto de saída no bloco para conectar ao próximo passo' },
        { icon: 'tabler-check', color: 'success', text: 'Você pode reordenar as opções arrastando o bloco pela alça' },
      ]"
      hint="Use as instruções para guiar a IA na escolha da opção correta baseada no contexto da conversa."
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import draggable from "vuedraggable";
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({
      options: [],
      instructions: "",
    }),
  },
  flowVariables: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:config"]);

const localConfig = ref({
  options: props.config.options || [],
  instructions: props.config.instructions || "",
  maxAttempts: props.config.maxAttempts || 3,
});

const variaveisItens = ref([]);
const variavel = ref(null);
const refInstructionsEditor = ref(null);

// Configurações do editor Quill para instruções
const instructionsEditorOptions = {
  theme: "snow",
  placeholder: "Ex: Se o cliente demonstrou interesse em agendar, escolha a opção 1. Se está reclamando, escolha a opção 2...",
  modules: {
    toolbar: "#toolbar-ai-instructions",
  },
};

// Função para adicionar opção
const addOption = () => {
  localConfig.value.options.push({
    id: Date.now(),
    label: "",
    order: localConfig.value.options.length,
  });

  emitUpdate();
};

// Função para remover opção
const removeOption = (index) => {
  if (confirm("Deseja remover esta opção?")) {
    localConfig.value.options.splice(index, 1);

    // Reordenar
    localConfig.value.options.forEach((option, idx) => {
      option.order = idx;
    });

    emitUpdate();
  }
};

// Função chamada ao finalizar o drag
const onDragEnd = () => {
  // Atualizar a ordem
  localConfig.value.options.forEach((option, index) => {
    option.order = index;
  });

  emitUpdate();
};

// Função para inserir variável no editor
const insertVariableInline = (quill, value) => {
  if (!value) return;

  quill.focus();
  let range = quill.getSelection(true);

  const insertAt = range ? range.index : Math.max(0, quill.getLength() - 1);
  const token = `{{${value}}}`;

  if (range && range.length > 0) {
    quill.deleteText(insertAt, range.length, "user");
  }

  quill.insertText(insertAt, token, "user");
  quill.setSelection(insertAt + token.length, 0, "silent");
};

const insertVariable = () => {
  let value = variavel.value;
  if (!value) return;

  let quill = refInstructionsEditor.value?.getQuill();
  if (!quill) return;

  insertVariableInline(quill, value);
  variavel.value = null;
};

// Carregar variáveis
const getVariaveis = async () => {
  let varsD = props.flowVariables || [];

  console.log("varsD", varsD);
  
  try {
    const res = await $api("/disparos/variaveis", {
      method: "GET",
    });

    if (!res) return;

    // Combinar variáveis da API com variáveis do fluxo
    const allVariables = [...res, ...varsD];
    variaveisItens.value = allVariables;
  } catch (error) {
    console.error("Error fetching variables", error);
    // Se houver erro na API, usar apenas variáveis do fluxo
    variaveisItens.value = varsD;
  }
};

// Emitir atualização
const emitUpdate = () => {
  emit("update:config", {
    ...localConfig.value,
  });
};

// Watch para mudanças no localConfig
watch(
  localConfig,
  () => {
    emitUpdate();
  },
  { deep: true }
);

// Carregar variáveis ao montar
onMounted(async () => {
  await getVariaveis();

  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      options: props.config.options || [],
      instructions: props.config.instructions || "",
      maxAttempts: props.config.maxAttempts || 3,
    };
  }
});
</script>

<style scoped>
.drag-handle {
  cursor: move;
}

.ghost {
  opacity: 0.5;
  background: rgba(var(--v-theme-primary), 0.1);
}

.cursor-move {
  cursor: move;
}

.html-content {
  word-break: break-word;
}
</style>
