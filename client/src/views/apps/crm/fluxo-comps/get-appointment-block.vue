<template>
  <VRow>
    <VCol cols="12">
      <h6 class="text-h6 mb-2">Obter Agendamento</h6>
      <p class="text-caption text-medium-emphasis mb-4">
        Solicita o ID do agendamento ao cliente e atualiza o contexto do fluxo
      </p>

      <VDivider class="my-4" />

      <!-- Configurações de Validação -->
      <div class="mb-4">
        <h6 class="text-subtitle-1 mb-3">Configurações de Validação</h6>
        
        <AppTextField
          v-model.number="localConfig.maxAttempts"
          label="Máximo de Tentativas"
          type="number"
          min="1"
          max="10"
          hint="Número máximo de tentativas para ID inválido (0 = ilimitado)"
          persistent-hint
          class="mb-4"
        >
          <template #prepend-inner>
            <VIcon icon="tabler-number" size="small" />
          </template>
        </AppTextField>
      </div>

      <VDivider class="my-4" />

      <!-- Mensagem de Solicitação -->
      <div class="mb-4">
        <h6 class="text-subtitle-1 mb-2">Mensagem de Solicitação</h6>
        <p class="text-caption text-medium-emphasis mb-3">
          Mensagem enviada para solicitar o ID do agendamento ao cliente
        </p>

        <div class="inputQP">
          <div id="toolbar-request-message">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-strike"></button>
            <AppSelect
              v-model="variavel"
              :items="variaveisDisponiveis"
              @update:modelValue="insertVariable('request')"
              item-title="title"
              item-value="value"
              placeholder="Inserir variável"
              class="select-var"
            />
          </div>
          <QuillEditor
            v-model:content="localConfig.requestMessage"
            :options="requestEditorOptions"
            class="inputQP mb-3"
            contentType="html"
            ref="refQuillEditorRequest"
          />
        </div>
      </div>

      <VDivider class="my-4" />

      <!-- Mensagem de ID Inválido -->
      <div class="mb-4">
        <h6 class="text-subtitle-1 mb-2">Mensagem de ID Inválido</h6>
        <p class="text-caption text-medium-emphasis mb-3">
          Mensagem enviada quando o ID informado não é válido ou o agendamento não foi encontrado
        </p>

        <div class="inputQP">
          <div id="toolbar-invalid-message">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-strike"></button>
          </div>
          <QuillEditor
            v-model:content="localConfig.invalidMessage"
            :options="invalidEditorOptions"
            class="inputQP mb-3"
            contentType="html"
          />
        </div>
      </div>

      <VDivider class="my-4" />

      <!-- Mensagem de Busca -->
      <div class="mb-4">
        <h6 class="text-subtitle-1 mb-2">Mensagem de Busca</h6>
        <p class="text-caption text-medium-emphasis mb-3">
          Mensagem enviada enquanto busca o agendamento (aguarda 3 segundos)
        </p>

        <div class="inputQP">
          <div id="toolbar-searching-message">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-strike"></button>
            <AppSelect
              v-model="variavel"
              :items="variaveisDisponiveis"
              @update:modelValue="insertVariable('searching')"
              item-title="title"
              item-value="value"
              placeholder="Inserir variável"
              class="select-var"
            />
          </div>
          <QuillEditor
            v-model:content="localConfig.searchingMessage"
            :options="searchingEditorOptions"
            class="inputQP mb-3"
            contentType="html"
            ref="refQuillEditorSearching"
          />
        </div>
      </div>

      <VDivider class="my-4" />

      <!-- Mensagem de Sucesso -->
      <div class="mb-4">
        <h6 class="text-subtitle-1 mb-2">Mensagem de Sucesso</h6>
        <p class="text-caption text-medium-emphasis mb-3">
          Mensagem enviada quando o agendamento é encontrado (antes de continuar o fluxo)
        </p>

        <div class="inputQP">
          <div id="toolbar-success-message">
            <button class="ql-bold"></button>
            <button class="ql-italic"></button>
            <button class="ql-strike"></button>
            <AppSelect
              v-model="variavel"
              :items="variaveisDisponiveis"
              @update:modelValue="insertVariable('success')"
              item-title="title"
              item-value="value"
              placeholder="Inserir variável"
              class="select-var"
            />
          </div>
          <QuillEditor
            v-model:content="localConfig.successMessage"
            :options="successEditorOptions"
            class="inputQP mb-3"
            contentType="html"
            ref="refQuillEditorSuccess"
          />
        </div>
      </div>

      <!-- Variáveis Disponíveis -->
      <VariablesSection :flow-variables="props.flowVariables" />

      <!-- Informações -->
      <BlockInfoSection
        title="Como funciona"
        :items="[
          { icon: 'tabler-check', color: 'success', text: 'Solicita o ID do agendamento ao cliente com mensagem personalizada' },
          { icon: 'tabler-check', color: 'success', text: 'Extrai números de textos como #123, agendamento 123 ou apenas 123' },
          { icon: 'tabler-check', color: 'success', text: 'Envia mensagem de busca e aguarda 3 segundos antes de confirmar' },
          { icon: 'tabler-check', color: 'success', text: 'Se o agendamento for encontrado, atualiza o contexto e envia mensagem de sucesso' },
          { icon: 'tabler-check', color: 'success', text: 'Se não encontrar ou exceder tentativas, segue para edge Agendamento Não Encontrado' },
        ]"
        hint="O bloco solicita o ID do agendamento, busca no banco de dados e atualiza o contexto do fluxo."
      />
    </VCol>
  </VRow>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { getAllVariables } from '@/utils/dynamicVariables';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({})
  },
  flowVariables: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:config']);

const localConfig = ref({
  requestMessage: props.config.requestMessage || '<p>Por favor, me informe o ID do seu agendamento.</p>',
  invalidMessage: props.config.invalidMessage || '<p>Agendamento não encontrado. Por favor, verifique o ID e tente novamente.</p>',
  searchingMessage: props.config.searchingMessage || '<p>🔍 Buscando informações do agendamento...</p>',
  successMessage: props.config.successMessage || '<p>✅ Agendamento encontrado! Vamos continuar.</p>',
  maxAttempts: props.config.maxAttempts || 3
});

const variaveisDisponiveis = ref([]);
const variavel = ref(null);
const refQuillEditorRequest = ref(null);
const refQuillEditorSearching = ref(null);
const refQuillEditorSuccess = ref(null);

// Configurações dos editores Quill
const requestEditorOptions = {
  theme: 'snow',
  placeholder: 'Por favor, me informe o ID do seu agendamento.',
  modules: {
    toolbar: '#toolbar-request-message'
  }
};

const invalidEditorOptions = {
  theme: 'snow',
  placeholder: 'Agendamento não encontrado...',
  modules: {
    toolbar: '#toolbar-invalid-message'
  }
};

const searchingEditorOptions = {
  theme: 'snow',
  placeholder: 'Buscando informações do agendamento...',
  modules: {
    toolbar: '#toolbar-searching-message'
  }
};

const successEditorOptions = {
  theme: 'snow',
  placeholder: 'Agendamento encontrado!',
  modules: {
    toolbar: '#toolbar-success-message'
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
    quill.deleteText(insertAt, range.length, 'user');
  }

  quill.insertText(insertAt, token, 'user');
  quill.setSelection(insertAt + token.length, 0, 'silent');
};

const insertVariable = (editorType) => {
  let value = variavel.value;
  if (!value) return;

  let quill = null;
  
  switch(editorType) {
    case 'request':
      quill = refQuillEditorRequest.value?.getQuill();
      break;
    case 'searching':
      quill = refQuillEditorSearching.value?.getQuill();
      break;
    case 'success':
      quill = refQuillEditorSuccess.value?.getQuill();
      break;
  }

  if (!quill) return;

  insertVariableInline(quill, value);
  variavel.value = null;
};

// Emitir atualização
const emitUpdate = () => {
  emit('update:config', {
    ...localConfig.value
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
  const allVars = await getAllVariables();
  // Combinar variáveis do sistema com variáveis do fluxo
  variaveisDisponiveis.value = [...allVars, ...props.flowVariables] || [];
  
  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      requestMessage: props.config.requestMessage || '<p>Por favor, me informe o ID do seu agendamento.</p>',
      invalidMessage: props.config.invalidMessage || '<p>Agendamento não encontrado. Por favor, verifique o ID e tente novamente.</p>',
      searchingMessage: props.config.searchingMessage || '<p>🔍 Buscando informações do agendamento...</p>',
      successMessage: props.config.successMessage || '<p>✅ Agendamento encontrado! Vamos continuar.</p>',
      maxAttempts: props.config.maxAttempts || 3
    };
  }
});
</script>

<script>
export default {
  name: 'GetAppointmentBlock',
};
</script>

<style scoped>
.inputQP {
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: 6px;
}

.select-var {
  width: 200px;
  display: inline-block;
}

:deep(.ql-toolbar) {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
}

:deep(.ql-container) {
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  min-height: 120px;
}

.cursor-pointer {
  cursor: pointer;
}
</style>

