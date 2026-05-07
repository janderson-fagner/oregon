<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <h6 class="text-h6 mb-0">Menu de Opções</h6>
        <p class="text-caption mb-0 text-medium-emphasis">
          Configure as opções do menu interativo
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
                  placeholder="Ex: Ver produtos"
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

    <!-- Mensagem do Menu -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Mensagem do Menu</h6>
      <p class="text-caption text-medium-emphasis mb-3">
        Escreva a mensagem que será exibida antes das opções.
      </p>

      <!-- Editor Quill -->
      <div class="inputQP">
        <div id="toolbar-menu-message">
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
          v-model:content="localConfig.message"
          :options="editorOptions"
          class="inputQP mb-3"
          contentType="html"
          ref="refQuillEditor"
        />
      </div>
    </div>

    <VDivider class="my-4" />

    <!-- Configurações de Timeout -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Tempo Limite de Resposta</h6>
      <p class="text-caption text-medium-emphasis mb-3">
        Configure quanto tempo aguardar pela resposta do usuário (0 = sem limite)
      </p>

      <VRow>
        <VCol cols="12" md="6">
          <AppTextField
            v-model.number="localConfig.timeoutValue"
            label="Valor do Timeout"
            type="number"
            min="0"
            hint="0 = aguardar indefinidamente"
            persistent-hint
          >
            <template #prepend-inner>
              <VIcon icon="tabler-clock" size="small" />
            </template>
          </AppTextField>
        </VCol>

        <VCol cols="12" md="6">
          <AppSelect
            v-model="localConfig.timeoutType"
            label="Unidade de Tempo"
            :items="[
              { title: 'Segundos', value: 'seconds' },
              { title: 'Minutos', value: 'minutes' },
              { title: 'Horas', value: 'hours' },
              { title: 'Dias', value: 'days' },
            ]"
            item-title="title"
            item-value="value"
          >
            <template #prepend-inner>
              <VIcon icon="tabler-clock-hour-4" size="small" />
            </template>
          </AppSelect>
        </VCol>
      </VRow>
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

        <VCol cols="12">
          <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
            Mensagem de Opção Inválida
          </label>
          <p class="text-caption text-medium-emphasis mb-2">
            Mensagem enviada quando o usuário seleciona uma opção inválida
          </p>

          <!-- Editor Quill para mensagem de erro -->
          <div class="inputQP">
            <div id="toolbar-invalid">
              <button class="ql-bold"></button>
              <button class="ql-italic"></button>
              <button class="ql-strike"></button>
            </div>
            <QuillEditor
              v-model:content="localConfig.invalidOptionMessage"
              :options="invalidEditorOptions"
              class="inputQP mb-3"
              contentType="html"
            />
          </div>
        </VCol>
      </VRow>
    </div>

    <VariablesSection :flow-variables="props.flowVariables" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-check', color: 'success', text: 'A mensagem será exibida seguida das opções numeradas' },
        { icon: 'tabler-check', color: 'success', text: 'O usuário pode responder com o número ou o texto da opção' },
        { icon: 'tabler-check', color: 'success', text: 'Cada opção terá um ponto de saída no bloco para conectar ao próximo passo' },
        { icon: 'tabler-check', color: 'success', text: 'Você pode reordenar as opções arrastando o bloco pela alça' },
      ]"
      hint="Configure o timeout e as tentativas máximas para controlar o comportamento do menu."
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import draggable from "vuedraggable";
import VariablesSection from "./VariablesSection.vue";
import BlockInfoSection from "./BlockInfoSection.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({
      options: [],
      message: "",
    }),
  },
  flowVariables: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:config"]);

const { setAlert } = useAlert();

const localConfig = ref({
  options: props.config.options || [],
  message: props.config.message || "",
  maxAttempts: props.config.maxAttempts || 3,
  invalidOptionMessage:
    props.config.invalidOptionMessage ||
    "<p>Opção inválida. Por favor, escolha uma das opções acima.</p>",
  timeoutValue: props.config.timeoutValue || 0,
  timeoutType: props.config.timeoutType || "minutes",
});

const variaveisItens = ref([]);
const variavel = ref(null);
const refQuillEditor = ref(null);

// Configurações do editor Quill
const editorOptions = {
  theme: "snow",
  placeholder: "Escreva a mensagem do menu...",
  modules: {
    toolbar: "#toolbar-menu-message",
  },
};

const invalidEditorOptions = {
  theme: "snow",
  placeholder: "Opção inválida. Por favor, escolha uma opção válida.",
  modules: {
    toolbar: "#toolbar-invalid",
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

  let quill = refQuillEditor.value?.getQuill();
  if (!quill) return;

  insertVariableInline(quill, value);
  variavel.value = null;
};

// Carregar variáveis
const getVariaveis = async () => {
  try {
    const res = await $api("/disparos/variaveis", {
      method: "GET",
    });

    if (!res) return;

    // Combinar variáveis da API com variáveis do fluxo
    const allVariables = [...res, ...props.flowVariables];
    variaveisItens.value = allVariables;
  } catch (error) {
    console.error("Error fetching variables", error);
    // Se houver erro na API, usar apenas variáveis do fluxo
    variaveisItens.value = props.flowVariables;
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
      message: props.config.message || "",
      maxAttempts: props.config.maxAttempts || 3,
      invalidOptionMessage:
        props.config.invalidOptionMessage ||
        "<p>Opção inválida. Por favor, escolha uma das opções acima.</p>",
      timeoutValue: props.config.timeoutValue || 0,
      timeoutType: props.config.timeoutType || "minutes",
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
