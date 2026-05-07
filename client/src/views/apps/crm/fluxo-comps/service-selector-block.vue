<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <h6 class="text-h6 mb-0">Seleção de Serviços</h6>
        <p class="text-caption mb-0 text-medium-emphasis">
          Configure como os serviços serão apresentados ao cliente
        </p>
      </div>
    </div>

    <!-- Tipo de Seleção -->
    <VRow dense class="mb-4">
      <VCol cols="12">
        <AppSelect
          v-model="localConfig.selectionType"
          :items="selectionTypes"
          label="Tipo de Seleção"
          item-title="title"
          item-value="value"
          hint="Como os serviços serão apresentados"
          persistent-hint
        />
      </VCol>
    </VRow>

    <!-- Configurações de Filtro -->
    <VCard variant="outlined" class="mb-4">
      <VCardText>
        <h6 class="text-subtitle-1 mb-3">Filtros de Serviços</h6>
        
        <VRow dense>
          <!-- Serviço Pai (opcional) -->
          <VCol cols="12" md="6">
            <AppAutocomplete
              v-model="localConfig.parentServiceId"
              :items="servicos"
              label="Serviço Pai (Opcional)"
              item-title="ser_nome"
              item-value="ser_id"
              placeholder="Selecione para filtrar subserviços"
              clearable
              hint="Deixe vazio para mostrar todos os serviços principais"
              persistent-hint
            />
          </VCol>

          <!-- Limite de Opções -->
          <VCol cols="12" md="6">
            <AppTextField
              v-model.number="localConfig.maxOptions"
              label="Máximo de Opções"
              type="number"
              min="1"
              max="20"
              hint="Quantos serviços exibir por vez"
              persistent-hint
            >
              <template #prepend-inner>
                <VIcon icon="tabler-list" size="small" />
              </template>
            </AppTextField>
          </VCol>

          <!-- Permitir Pesquisa -->
          <VCol cols="12" md="6">
            <VCheckbox
              v-model="localConfig.allowSearch"
              label="Permitir Pesquisa por Nome"
              hint="Cliente pode digitar o nome do serviço"
              persistent-hint
              color="primary"
            />
          </VCol>

          <!-- Mostrar Preços -->
          <VCol cols="12" md="6">
            <VCheckbox
              v-model="localConfig.showPrices"
              label="Mostrar Preços"
              hint="Exibir valores dos serviços"
              persistent-hint
              color="primary"
            />
          </VCol>

          <!-- Ordenação -->
          <VCol cols="12" md="6">
            <AppSelect
              v-model="localConfig.orderBy"
              :items="orderOptions"
              label="Ordenar Por"
              item-title="title"
              item-value="value"
            />
          </VCol>

          <!-- Direção da Ordenação -->
          <VCol cols="12" md="6">
            <AppSelect
              v-model="localConfig.orderDirection"
              :items="[
                { title: 'Crescente', value: 'ASC' },
                { title: 'Decrescente', value: 'DESC' }
              ]"
              label="Direção"
              item-title="title"
              item-value="value"
            />
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <!-- Mensagem do Menu -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Mensagem do Menu</h6>
      <p class="text-caption text-medium-emphasis mb-3">
        Mensagem exibida antes da lista de serviços
      </p>

      <!-- Editor Quill -->
      <div class="inputQP">
        <div id="toolbar-service-message">
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

    <!-- Configurações de Validação -->
    <div class="mb-4">
      <h6 class="text-subtitle-1 mb-3">Configurações de Validação</h6>

      <VRow dense>
        <VCol cols="12" md="6">
          <AppTextField
            v-model.number="localConfig.maxAttempts"
            label="Máximo de Tentativas"
            type="number"
            min="0"
            max="10"
            hint="0 = ilimitado"
            persistent-hint
          >
            <template #prepend-inner>
              <VIcon icon="tabler-number" size="small" />
            </template>
          </AppTextField>
        </VCol>

        <VCol cols="12">
          <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
            Mensagem de Serviço Inválido
          </label>
          <p class="text-caption text-medium-emphasis mb-2">
            Mensagem quando o cliente seleciona um serviço inválido
          </p>

          <div class="inputQP">
            <div id="toolbar-invalid">
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
        </VCol>
      </VRow>
    </div>

    <!-- Ações Após Seleção -->
    <VCard variant="outlined" class="mb-4">
      <VCardText>
        <h6 class="text-subtitle-1 mb-3">Ações Após Seleção</h6>
        
        <VCheckbox
          v-model="localConfig.saveToContext"
          label="Salvar no Contexto do Fluxo"
          hint="Serviço selecionado ficará disponível como variável"
          persistent-hint
          color="primary"
        />

        <AppTextField
          v-if="localConfig.saveToContext"
          v-model="localConfig.contextVariableName"
          label="Nome da Variável"
          placeholder="servico_selecionado"
          hint="Nome para usar como {{servico_selecionado}}"
          persistent-hint
          class="mt-3"
        />
      </VCardText>
    </VCard>

    <!-- Preview dos Serviços -->
    <VCard variant="outlined" class="pa-4">
      <h6 class="text-subtitle-2 mb-3">
        <VIcon icon="tabler-eye" class="me-1" />
        Preview de Serviços
      </h6>
      
      <VProgressLinear v-if="loadingServicos" indeterminate color="primary" />
      
      <div v-else>
        <p class="text-caption text-medium-emphasis mb-2">
          Mostrando até {{ localConfig.maxOptions }} serviços
        </p>
        
        <VList density="compact" class="pa-0">
          <VListItem
            v-for="(servico, index) in previewServicos"
            :key="servico.ser_id"
            class="px-0"
          >
            <template #prepend>
              <VChip size="small" color="primary" variant="tonal">
                {{ index + 1 }}
              </VChip>
            </template>
            
            <VListItemTitle class="text-body-2">
              {{ servico.ser_nome }}
            </VListItemTitle>
            
            <VListItemSubtitle v-if="servico.ser_descricao" class="text-caption">
              {{ servico.ser_descricao }}
            </VListItemSubtitle>
            
            <template #append v-if="localConfig.showPrices && servico.ser_valor">
              <VChip size="small" color="success" variant="tonal">
                R$ {{ parseFloat(servico.ser_valor).toFixed(2) }}
              </VChip>
            </template>
          </VListItem>
        </VList>

        <div v-if="previewServicos.length === 0" class="text-center pa-4">
          <VIcon icon="tabler-package-off" size="48" color="grey" class="mb-2" />
          <p class="text-body-2 text-medium-emphasis mb-0">
            Nenhum serviço encontrado
          </p>
        </div>
      </div>
    </VCard>

    <VariablesSection :flow-variables="props.flowVariables" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-check', color: 'success', text: 'Os serviços serão listados automaticamente do banco de dados' },
        { icon: 'tabler-check', color: 'success', text: 'Cliente pode responder com o número ou nome do serviço' },
        { icon: 'tabler-check', color: 'success', text: 'Serviço selecionado fica disponível como variável no fluxo' },
        { icon: 'tabler-check', color: 'success', text: 'Suporta paginação automática para muitos serviços' },
      ]"
      hint="Configure filtros e ordenação para controlar quais serviços são exibidos."
    />
  </div>
</template>

<script setup>
import { ref, watch, onMounted, computed } from 'vue';
import { QuillEditor } from '@vueup/vue-quill';
import '@vueup/vue-quill/dist/vue-quill.snow.css';
import { getAllVariables, copyVariableToClipboard as copyVarUtil } from '@/utils/dynamicVariables.js';
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({
      selectionType: 'menu',
      parentServiceId: null,
      maxOptions: 10,
      allowSearch: true,
      showPrices: true,
      orderBy: 'ser_nome',
      orderDirection: 'ASC',
      message: '<p>Selecione o serviço desejado:</p>',
      maxAttempts: 3,
      invalidMessage: '<p>Serviço inválido. Por favor, escolha um serviço da lista.</p>',
      saveToContext: true,
      contextVariableName: 'servico_selecionado'
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
  selectionType: props.config.selectionType || 'menu',
  parentServiceId: props.config.parentServiceId || null,
  maxOptions: props.config.maxOptions || 10,
  allowSearch: props.config.allowSearch !== false,
  showPrices: props.config.showPrices !== false,
  orderBy: props.config.orderBy || 'ser_nome',
  orderDirection: props.config.orderDirection || 'ASC',
  message: props.config.message || '<p>Selecione o serviço desejado:</p>',
  maxAttempts: props.config.maxAttempts || 3,
  invalidMessage: props.config.invalidMessage || '<p>Serviço inválido. Por favor, escolha um serviço da lista.</p>',
  saveToContext: props.config.saveToContext !== false,
  contextVariableName: props.config.contextVariableName || 'servico_selecionado'
});

const selectionTypes = ref([
  { title: 'Menu Numerado', value: 'menu' },
  { title: 'Lista com Pesquisa', value: 'search' },
  { title: 'Autocompletar', value: 'autocomplete' }
]);

const orderOptions = ref([
  { title: 'Nome', value: 'ser_nome' },
  { title: 'Valor', value: 'ser_valor' },
  { title: 'Data de Criação', value: 'created_at' }
]);

const servicos = ref([]);
const previewServicos = ref([]);
const loadingServicos = ref(false);
const variaveisItens = ref([]);
const variavel = ref(null);
const refQuillEditor = ref(null);

// Configurações dos editores Quill
const editorOptions = {
  theme: 'snow',
  placeholder: 'Escreva a mensagem...',
  modules: {
    toolbar: '#toolbar-service-message'
  }
};

const invalidEditorOptions = {
  theme: 'snow',
  placeholder: 'Serviço inválido...',
  modules: {
    toolbar: '#toolbar-invalid'
  }
};

// Carregar serviços
const carregarServicos = async () => {
  loadingServicos.value = true;
  try {
    const res = await $api('/servicos/list', {
      method: 'GET',
      query: {
        orderBy: localConfig.value.orderBy,
        orderDirection: localConfig.value.orderDirection,
        limit: 100 // Carregar mais para preview
      }
    });
    
    if (res && res.servicos) {
      servicos.value = res.servicos;
      updatePreview();
    }
  } catch (error) {
    console.error('Erro ao carregar serviços:', error);
    setAlert('Erro ao carregar serviços', 'error', 'tabler-alert-circle');
  } finally {
    loadingServicos.value = false;
  }
};

// Atualizar preview
const updatePreview = () => {
  let filtered = servicos.value;
  
  // Filtrar por serviço pai se selecionado
  if (localConfig.value.parentServiceId) {
    filtered = filtered.filter(s => s.ser_pai === localConfig.value.parentServiceId);
  } else {
    // Mostrar apenas serviços principais (sem pai)
    filtered = filtered.filter(s => !s.ser_pai);
  }
  
  // Aplicar limite
  previewServicos.value = filtered.slice(0, localConfig.value.maxOptions);
};

// Inserir variável no editor
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

const insertVariable = () => {
  let value = variavel.value;
  if (!value) return;

  let quill = refQuillEditor.value?.getQuill();
  if (!quill) return;

  insertVariableInline(quill, value);
  variavel.value = null;
};

// Copiar variável
const copyVariableToClipboard = (variableValue) => {
  copyVarUtil(variableValue, setAlert);
};

// Emitir atualização
const emitUpdate = () => {
  emit('update:config', {
    ...localConfig.value
  });
};

// Carregar variáveis
const getVariaveis = async () => {
  try {
    const res = await $api('/disparos/variaveis', {
      method: 'GET'
    });

    if (!res) return;
    variaveisItens.value = res;
  } catch (error) {
    console.error('Error fetching variables', error);
  }
};

// Watch para mudanças
watch(localConfig, () => {
  emitUpdate();
  updatePreview();
}, { deep: true });

// Carregar dados ao montar
onMounted(async () => {
  await Promise.all([
    getVariaveis(),
    carregarServicos()
  ]);
});
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>

