<template>
  <div>
    <VRow>
      <VCol cols="12">
        <VAlert type="warning" variant="tonal" class="mb-4">
          <template #prepend>
            <VIcon icon="tabler-shield-lock" />
          </template>
          <div class="text-sm">
            <strong>Atenção:</strong> Este bloco irá <strong>bloquear permanentemente</strong> 
            o cliente de receber TODOS os fluxos automáticos, até que seja desbloqueado manualmente.
          </div>
        </VAlert>
      </VCol>

      <VCol cols="12">
        <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
          Ação
        </label>
        <AppSelect
          v-model="localConfig.action"
          :items="[
            { title: '🔒 Bloquear Fluxos', value: 'block' },
            { title: '🔓 Desbloquear Fluxos', value: 'unblock' }
          ]"
          label="Selecione a ação"
          placeholder="Escolha bloquear ou desbloquear"
        />
      </VCol>

      <VCol cols="12">
        <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
          Mensagem de Confirmação (opcional)
        </label>
        <p class="text-caption text-medium-emphasis mb-2">
          Mensagem enviada ao cliente após {{ localConfig.action === 'block' ? 'bloquear' : 'desbloquear' }} os fluxos
        </p>
        
        <!-- Editor Quill -->
        <div class="inputQP">
          <div id="toolbar-block-flows-message">
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
    
    <BlockInfoSection
      :items="[
        { icon: 'tabler-lock', color: 'error', text: 'Bloqueia PERMANENTEMENTE todos os fluxos para este cliente' },
        { icon: 'tabler-lock-open', color: 'success', text: 'Desbloqueia e permite que o cliente receba fluxos novamente' },
        { icon: 'tabler-message-circle', color: 'primary', text: 'Envia mensagem opcional ao cliente (se configurada)' },
        { icon: 'tabler-database', color: 'info', text: 'Atualiza o campo flows_blocked no banco de dados' },
      ]"
      hint="Bloqueio é permanente e só pode ser removido manualmente ou por outro fluxo com ação de desbloqueio."
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { getAllVariables } from '@/utils/dynamicVariables.js';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({
      action: 'block',
      message: ''
    })
  }
});

const emit = defineEmits(['update:config']);

const { setAlert } = useAlert();

const localConfig = ref({
  action: props.config.action || 'block',
  message: props.config.message || '',
});

const variaveisDisponiveis = ref([]);
const variavel = ref(null);
const refQuillEditor = ref(null);

// Configurações do editor Quill
const editorOptions = {
  theme: "snow",
  placeholder: "Escreva a mensagem de confirmação...",
  modules: {
    toolbar: "#toolbar-block-flows-message",
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
      action: props.config.action || 'block',
      message: props.config.message || '',
    };
  }
});
</script>

