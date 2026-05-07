<template>
  <div>
    <VRow>
      <VCol cols="12">
        <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
          Mensagem de Aguardo (opcional)
        </label>
        <p class="text-caption text-medium-emphasis mb-2">
          Mensagem enviada ao cliente antes de colocá-lo na fila de atendimento
        </p>
        
        <!-- Editor Quill -->
        <div class="inputQP">
          <div id="toolbar-wait-agent-message">
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

    <VDivider class="my-4" />

    <VRow>
      <VCol cols="12">
        <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
          Mensagem de Finalização (opcional)
        </label>
        <p class="text-caption text-medium-emphasis mb-2">
          Quando o atendente enviar esta mensagem, o cliente será automaticamente liberado do bloqueio
        </p>
        
        <!-- Editor Quill para mensagem de finalização -->
        <div class="inputQP">
          <div id="toolbar-finish-message">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-strike"></button>

            <AppSelect
              v-model="variavelFinish"
              :items="variaveisDisponiveis"
              @update:modelValue="insertVariableFinish"
              item-title="title"
              item-value="value"
              placeholder="Inserir variável"
              class="select-var"
            />
          </div>
          <QuillEditor
            v-model:content="localConfig.finishMessage"
            :options="finishEditorOptions"
            class="inputQP mb-3"
            contentType="html"
            ref="refQuillEditorFinish"
          />
        </div>
        
        <div class="text-caption text-info">
          <VIcon icon="tabler-info-circle" class="me-1" size="small" />
          Quando o atendente enviar exatamente esta mensagem, o sistema detectará e liberará o cliente automaticamente
        </div>
      </VCol>
    </VRow>
    
    <VariablesSection :flow-variables="props.flowVariables" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-message-circle', color: 'primary', text: 'Envia mensagem opcional ao cliente' },
        { icon: 'tabler-lock', color: 'warning', text: 'Bloqueia todos os fluxos automáticos para este cliente' },
        { icon: 'tabler-user-check', color: 'info', text: 'Cliente fica na fila aguardando atendimento humano' },
        { icon: 'tabler-shield-check', color: 'success', text: 'Evita loops infinitos e múltiplos disparos de fluxos' },
      ]"
      hint="Enquanto o cliente estiver neste estado, nenhum fluxo automático será disparado. Certifique-se de ter uma equipe disponível para atender."
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
      message: ''
    })
  },
  flowVariables: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(['update:config']);

const { setAlert } = useAlert();

const localConfig = ref({
  message: props.config.message || '<p>Aguarde um momento, em breve um de nossos atendentes irá te responder!</p>',
  finishMessage: props.config.finishMessage || '<p>Agradecemos a paciência, qualquer coisa estamos a disposição!</p>',
});

const variaveisDisponiveis = ref([]);
const variavel = ref(null);
const variavelFinish = ref(null);
const refQuillEditor = ref(null);
const refQuillEditorFinish = ref(null);

// Configurações do editor Quill
const editorOptions = {
  theme: "snow",
  placeholder: "Escreva a mensagem de aguardo...",
  modules: {
    toolbar: "#toolbar-wait-agent-message",
  },
};

const finishEditorOptions = {
  theme: "snow",
  placeholder: "Escreva a mensagem de finalização...",
  modules: {
    toolbar: "#toolbar-finish-message",
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

const insertVariableFinish = () => {
  let value = variavelFinish.value;
  if (!value) return;

  let quill = refQuillEditorFinish.value?.getQuill();
  if (!quill) return;

  insertVariableInline(quill, value);
  variavelFinish.value = null;
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
  // Carregar todas as variáveis disponíveis
  const allVars = await getAllVariables();
  variaveisDisponiveis.value = allVars || [];
  
  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      message: props.config.message || '<p>Aguarde um momento, em breve um de nossos atendentes irá te responder!</p>',
      finishMessage: props.config.finishMessage || '<p>Agradecemos a paciência, qualquer coisa estamos a disposição!</p>',
    };
  }
});
</script>

