<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <h6 class="text-h6 mb-0">Encaminhar Contato</h6>
        <p class="text-caption mb-0 text-medium-emphasis">
          Configure números para encaminhamento do contato
        </p>
      </div>
      <VBtn
        @click="addPhone"
        variant="tonal"
        color="primary"
        size="small"
        style="height: 30px"
      >
        <VIcon class="me-1" icon="tabler-plus" />
        Número
      </VBtn>
    </div>

    <!-- Tipo de Encaminhamento -->
    <VRow class="mb-4">
      <VCol cols="12">
        <AppSelect
          v-model="localConfig.forwardType"
          :items="forwardTypeOptions"
          label="Tipo de Encaminhamento"
          placeholder="Selecione o tipo"
          required
        >
          <template #prepend-inner>
            <VIcon icon="tabler-arrows-sort" />
          </template>
        </AppSelect>
        <div class="text-caption mt-1 text-medium-emphasis">
          <VIcon icon="tabler-info-circle" size="small" class="me-1" />
          {{ getForwardTypeDescription() }}
        </div>
      </VCol>
    </VRow>

    <VDivider class="my-4" />

    <!-- Lista de Números -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">
        Números Cadastrados ({{ localConfig.phones.length }})
      </h6>

      <draggable
        v-model="localConfig.phones"
        item-key="id"
        handle=".drag-handle"
        ghost-class="ghost"
        @end="onDragEnd"
        :disabled="localConfig.forwardType !== 'ordered'"
      >
        <template #item="{ element, index }">
          <VCard
            class="mb-3 py-3"
            variant="outlined"
            :class="{ 'cursor-move': localConfig.forwardType === 'ordered' }"
          >
            <VRow class="align-center" dense>
              <!-- Drag Handle -->
              <VCol
                cols="2"
                v-if="localConfig.forwardType === 'ordered'"
                class="drag-handle cursor-move d-flex align-center justify-center flex-row"
              >
                <VIcon icon="tabler-grip-vertical" size="20" color="grey" />

                <!-- Ordem -->
                <p class="mb-0 text-sm">{{ index + 1 }} - </p>
              </VCol>

              <!-- Input do número -->
              <VCol cols="8" class="d-flex flex-column gap-3">
                <VTextField
                  v-model="element.phone"
                  :label="`Número ${index + 1}`"
                  placeholder="Ex: 5511999999999"
                  required
                  density="compact"
                  hide-details
                  v-mask="'+55 (##) #####-####'"
                />
             
                <VTextField
                  v-model="element.label"
                  label="Nome/Identificação"
                  placeholder="Ex: Vendedor 1"
                  density="compact"
                  hide-details
                />
              </VCol>

              <!-- Botão Remover -->
              <VCol cols="2">
                <IconBtn
                @click="removePhone(index)"
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
        v-if="localConfig.phones.length === 0"
        variant="outlined"
        class="pa-6 text-center"
      >
        <VIcon icon="tabler-phone-off" size="48" color="grey" class="mb-2" />
        <p class="text-body-2 text-medium-emphasis mb-0">
          Nenhum número cadastrado
        </p>
        <p class="text-caption text-medium-emphasis">
          Clique em "+ Número" para adicionar
        </p>
      </VCard>
    </div>

    <VDivider class="my-4" />

    <!-- Mensagem -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Mensagem de Encaminhamento</h6>
      <p class="text-caption text-medium-emphasis mb-3">
        Escreva a mensagem que será enviada com o contato. No final, será
        adicionado automaticamente o link do WhatsApp.
      </p>

        <!-- Editor Quill -->
      <div class="inputQP">
        <div id="toolbar-forward-message">
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

    <VariablesSection :flow-variables="props.flowVariables" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-check', color: 'success', text: 'A mensagem será enviada para o(s) número(s) configurado(s)' },
        { icon: 'tabler-check', color: 'success', text: 'O número do contato no fluxo será incluído na mensagem' },
        { icon: 'tabler-check', color: 'success', text: 'Um link de contato do WhatsApp será adicionado automaticamente' },
        { icon: 'tabler-arrows-sort', color: 'primary', text: 'Ordenada: distribui contatos seguindo a ordem da lista' },
        { icon: 'tabler-dice', color: 'warning', text: 'Aleatória: encaminha para um número aleatório da lista' },
        { icon: 'tabler-users', color: 'info', text: 'Todos: envia a mensagem para todos os números cadastrados' },
      ]"
      hint="O tipo de encaminhamento define como os contatos serão distribuídos entre os números."
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
      phones: [],
      message: "",
      forwardType: "ordered",
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
  phones: props.config.phones || [],
  message: props.config.message || "",
  forwardType: props.config.forwardType || "ordered",
});

const forwardTypeOptions = [
  { value: "ordered", title: "Ordenada" },
  { value: "random", title: "Aleatória" },
  { value: "all", title: "Todos" },
];

const variaveisItens = ref([]);
const variavel = ref(null);
const refQuillEditor = ref(null);

// Configurações do editor Quill
const editorOptions = {
  theme: "snow",
  placeholder: "Escreva a mensagem de encaminhamento...",
  modules: {
    toolbar: "#toolbar-forward-message",
  },
};

// Função para adicionar número
const addPhone = () => {
  localConfig.value.phones.push({
    id: Date.now(),
    phone: "",
    label: "",
    order: localConfig.value.phones.length,
  });

  emitUpdate();
};

// Função para remover número
const removePhone = (index) => {
  if (confirm("Deseja remover este número?")) {
    localConfig.value.phones.splice(index, 1);

    // Reordenar
    localConfig.value.phones.forEach((phone, idx) => {
      phone.order = idx;
    });

    emitUpdate();
  }
};

// Função chamada ao finalizar o drag
const onDragEnd = () => {
  // Atualizar a ordem
  localConfig.value.phones.forEach((phone, index) => {
    phone.order = index;
  });

  emitUpdate();
};

// Função para obter descrição do tipo
const getForwardTypeDescription = () => {
  switch (localConfig.value.forwardType) {
    case "ordered":
      return "Os contatos serão encaminhados seguindo a ordem da lista. O próximo contato vai para o próximo número.";
    case "random":
      return "Os contatos serão encaminhados para um número aleatório da lista.";
    case "all":
      return "A mensagem será enviada para todos os números cadastrados.";
    default:
      return "";
  }
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
      phones: props.config.phones || [],
      message: props.config.message || "",
      forwardType: props.config.forwardType || "ordered",
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
