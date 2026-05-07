<template>
  <div>
    <VRow>
      <VCol cols="12">
        <AppSelect
          v-model="localConfig.targetFlowId"
          :items="availableFlows"
          label="Fluxo de Destino"
          placeholder="Selecione o fluxo para onde redirecionar"
          required
          :rules="[requiredValidator]"
          item-title="name"
          item-value="id"
        />
      </VCol>
    </VRow>

    <VRow>
      <VCol cols="12">
        <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
          Mensagem de Redirecionamento (opcional)
        </label>
        <p class="text-caption text-medium-emphasis mb-2">
          Mensagem que será enviada antes de redirecionar o cliente
        </p>
        
        <!-- Editor Quill -->
        <div class="inputQP">
          <div id="toolbar-redirect-message">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-strike"></button>

            <AppSelect
              v-model="variavel"
              :items="variaveisDisponiveis"
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
      </VCol>
    </VRow>

    <!-- Variáveis Disponíveis -->
    <VariablesSection :flow-variables="props.flowVariables" />

    <!-- Informações -->
    <BlockInfoSection
      title="Como funciona"
      :items="[
        { icon: 'tabler-message-circle', color: 'primary', text: 'Envia mensagem opcional ao cliente' },
        { icon: 'tabler-arrow-right', color: 'info', text: 'Redireciona o cliente para o fluxo selecionado' },
        { icon: 'tabler-play', color: 'success', text: 'Inicia o novo fluxo com o contexto atual do cliente' },
        { icon: 'tabler-square', color: 'warning', text: 'Finaliza o fluxo atual (este é o ponto final)' },
      ]"
      hint="O redirecionamento mantém o contexto completo do cliente, incluindo variáveis e dados coletados."
    />

  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { getAllVariables } from '@/utils/dynamicVariables.js';
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({
      targetFlowId: null,
      message: ''
    })
  },
  flowVariables: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:config']);

const localConfig = ref({
  targetFlowId: props.config.targetFlowId || null,
  message: props.config.message || '',
});

const availableFlows = ref([]);
const variaveisDisponiveis = ref([]);
const variavel = ref(null);
const refQuillEditor = ref(null);

// Configurações do editor Quill
const editorOptions = {
  theme: "snow",
  placeholder: "Escreva a mensagem de redirecionamento...",
  modules: {
    toolbar: "#toolbar-redirect-message",
  },
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

// Carregar fluxos disponíveis
const carregarFluxos = async () => {
  try {
    const res = await $api('/flows', { 
      method: 'GET',
      query: {
        itemsPerPage: -1
      }
    });
    if (res && res.flows) {
      availableFlows.value = res.flows.map(fluxo => ({
        id: fluxo.id,
        name: fluxo.name,
        description: fluxo.description || ''
      }));
    }
  } catch (error) {
    console.error('Erro ao carregar fluxos:', error);
    availableFlows.value = [];
  }
};

// Emitir atualização
const emitUpdate = () => {
  emit('update:config', {
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

onMounted(async () => {
  await carregarFluxos();
  
  // Carregar todas as variáveis disponíveis
  const allVars = await getAllVariables();

  variaveisDisponiveis.value = allVars || [];
  
  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      targetFlowId: props.config.targetFlowId || null,
      message: props.config.message || '',
    };
  }
});
</script>
