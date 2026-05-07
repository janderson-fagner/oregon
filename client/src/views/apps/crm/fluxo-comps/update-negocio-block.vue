<template>
  <VRow>
    <!-- Título e Descrição -->
    <VCol cols="12">
      <VAlert
        color="info"
        variant="tonal"
        icon="tabler-briefcase"
        class="mb-4"
      >
        <span class="text-subtitle-2 font-weight-bold">Atualizar Negócio</span>
        <div class="text-body-2">
          Use este bloco para atualizar informações de um negócio no funil de vendas.
          Configure quais campos deseja atualizar.
        </div>
      </VAlert>
    </VCol>

    <!-- Identificação do Negócio -->
    <VCol cols="12">
      <VCard>
        <VCardText>
          <div class="mb-3">
            <label class="v-label text-body-2 text-high-emphasis d-block mb-2">
              Identificação do Negócio
            </label>
            <p class="text-caption text-medium-emphasis mb-3">
              Como identificar o negócio que será atualizado?
            </p>
          </div>

          <AppSelect
            v-model="localConfig.identificationType"
            :items="identificationTypes"
            item-title="title"
            item-value="value"
            label="Tipo de Identificação"
            class="mb-3"
          />

          <AppTextField
            v-if="localConfig.identificationType === 'id'"
            v-model="localConfig.negocioId"
            label="ID do Negócio"
            placeholder="Ex: 123 ou {{negocio_id}}"
            hint="Informe o ID do negócio ou use uma variável"
            persistent-hint
          >
            <template #append-inner>
              <VMenu location="bottom" :close-on-content-click="false">
                <template #activator="{ props: menuProps }">
                  <VBtn
                    icon
                    size="x-small"
                    variant="text"
                    v-bind="menuProps"
                  >
                    <VIcon icon="tabler-braces" size="20" color="primary" />
                  </VBtn>
                </template>
                
                <VCard max-width="300" max-height="400" class="overflow-auto">
                  <VCardText>
                    <div class="text-caption mb-2 font-weight-bold">Variáveis Disponíveis</div>
                    <div class="d-flex flex-column gap-1">
                      <VChip
                        v-for="variable in variaveisDisponiveis"
                        :key="variable.value"
                        size="small"
                        :color="variable.type === 'dinamica' ? 'success' : variable.type === 'sistema' ? 'info' : 'primary'"
                        variant="tonal"
                        class="cursor-pointer"
                        @click="localConfig.negocioId = (localConfig.negocioId || '') + `{{${variable.value}}}`"
                      >
                        <VIcon icon="tabler-plus" size="small" class="me-1" />
                        {{ variable.title }}
                      </VChip>
                    </div>
                  </VCardText>
                </VCard>
              </VMenu>
            </template>
          </AppTextField>

          <VAlert
            v-else-if="localConfig.identificationType === 'context'"
            color="success"
            variant="tonal"
            class="mb-0"
          >
            <VIcon icon="tabler-link" class="me-2" />
            O negócio vinculado ao cliente no contexto do fluxo será atualizado automaticamente
          </VAlert>

          <VAlert
            v-else-if="localConfig.identificationType === 'ultimo'"
            color="success"
            variant="tonal"
            class="mb-0"
          >
            <VIcon icon="tabler-clock" class="me-2" />
            O último negócio criado/modificado do cliente será atualizado
          </VAlert>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Lista de Ações -->
    <VCol cols="12">
      <VDivider class="my-4" />
      
      <div class="d-flex align-center justify-space-between mb-3">
        <div>
          <label class="v-label text-body-2 text-high-emphasis d-block">
            Atualizações a Realizar
          </label>
          <p class="text-caption text-medium-emphasis mb-0">
            Adicione as informações que deseja atualizar
          </p>
        </div>
      </div>

      <!-- Ações -->
      <div
        v-for="(action, index) in localConfig.actions"
        :key="action.id"
        class="mb-4"
      >
        <VCard>
          <VCardText>
            <div class="d-flex align-center justify-space-between mb-3">
              <span class="text-sm font-weight-medium">Atualização #{{ index + 1 }}</span>
              <VBtn
                icon
                size="x-small"
                color="error"
                variant="text"
                @click="removeAction(index)"
              >
                <VIcon icon="tabler-trash" size="18" />
              </VBtn>
            </div>

            <!-- Tipo de Ação -->
            <AppSelect
              v-model="action.type"
              label="O que deseja atualizar?"
              :items="actionTypes"
              item-title="title"
              item-value="value"
              placeholder="Selecione uma opção"
              class="mb-3"
            />

            <!-- Campo de valor (texto simples) -->
            <div v-if="action.type && needsTextField(action.type)">
              <AppTextField
                v-model="action.value"
                :label="getFieldLabel(action.type)"
                :placeholder="getFieldPlaceholder(action.type)"
                :hint="getFieldHint(action.type)"
                persistent-hint
              >
                <template #append-inner>
                  <VMenu location="bottom" :close-on-content-click="false">
                    <template #activator="{ props: menuProps }">
                      <VBtn
                        icon
                        size="x-small"
                        variant="text"
                        v-bind="menuProps"
                      >
                        <VIcon icon="tabler-braces" size="20" color="primary" />
                      </VBtn>
                    </template>
                    
                    <VCard max-width="300" max-height="400" class="overflow-auto">
                      <VCardText>
                        <div class="text-caption mb-2 font-weight-bold">Variáveis Disponíveis</div>
                        <div class="d-flex flex-column gap-1">
                          <VChip
                            v-for="variable in variaveisDisponiveis"
                            :key="variable.value"
                            size="small"
                            :color="variable.type === 'dinamica' ? 'success' : variable.type === 'sistema' ? 'info' : 'primary'"
                            variant="tonal"
                            class="cursor-pointer"
                            @click="insertVariableInInput(action, 'value', variable.value)"
                          >
                            <VIcon icon="tabler-plus" size="small" class="me-1" />
                            {{ variable.title }}
                          </VChip>
                        </div>
                      </VCardText>
                    </VCard>
                  </VMenu>
                </template>
              </AppTextField>
            </div>

            <!-- Campo de valor (numérico - dinheiro) -->
            <div v-if="action.type === 'update_valor'">
              <Dinheiro
                v-model.number="action.value"
                :label="getFieldLabel(action.type)"
              />
            </div>

            <!-- Select de Status -->
            <div v-if="action.type === 'update_status'">
              <AppSelect
                v-model="action.value"
                label="Status do Negócio"
                :items="statusOptions"
                item-title="title"
                item-value="value"
                placeholder="Selecione o status"
              />
            </div>

            <!-- Select de Etapa do Funil -->
            <div v-if="action.type === 'update_etapa'">
              <AppSelect
                v-model="action.value"
                label="Etapa do Funil"
                :items="etapas"
                item-title="title"
                item-value="value"
                placeholder="Selecione a etapa"
                :loading="loadingEtapas"
              />
            </div>

            <!-- Campo de Data -->
            <div v-if="needsDateField(action.type)">
              <AppTextField
                v-model="action.value"
                :label="getFieldLabel(action.type)"
                type="date"
                :placeholder="getFieldPlaceholder(action.type)"
              />
            </div>

            <!-- Campos para marcar como perdido -->
            <div v-if="action.type === 'mark_lost'">
              <AppTextField
                v-model="action.motivo"
                label="Motivo da Perda"
                placeholder="Ex: Preço alto, Comprou concorrente"
                class="mb-3"
              />
              
              <AppTextarea
                v-model="action.observacao"
                label="Observações (opcional)"
                placeholder="Detalhes adicionais sobre a perda..."
                rows="3"
              />
            </div>

            <!-- Campo de Tags -->
            <div v-if="action.type === 'update_tags'">
              <AppSelect
                v-model="action.value"
                :items="tags"
                label="Tags"
                multiple
                chips
                closable-chips
                placeholder="Selecione as tags"
              />
            </div>

            <!-- Vincular a Agendamento -->
            <div v-if="action.type === 'vincular_agendamento'">
              <AppTextField
                v-model="action.value"
                label="ID do Agendamento"
                placeholder="Ex: 123 ou {{agendamento_id}}"
                hint="Informe o ID do agendamento para vincular ao negócio"
                persistent-hint
              >
                <template #append-inner>
                  <VMenu location="bottom" :close-on-content-click="false">
                    <template #activator="{ props: menuProps }">
                      <VBtn
                        icon
                        size="x-small"
                        variant="text"
                        v-bind="menuProps"
                      >
                        <VIcon icon="tabler-braces" size="20" color="primary" />
                      </VBtn>
                    </template>
                    
                    <VCard max-width="300" max-height="400" class="overflow-auto">
                      <VCardText>
                        <div class="text-caption mb-2 font-weight-bold">Variáveis Disponíveis</div>
                        <div class="d-flex flex-column gap-1">
                          <VChip
                            v-for="variable in variaveisDisponiveis"
                            :key="variable.value"
                            size="small"
                            :color="variable.type === 'dinamica' ? 'success' : variable.type === 'sistema' ? 'info' : 'primary'"
                            variant="tonal"
                            class="cursor-pointer"
                            @click="insertVariableInInput(action, 'value', variable.value)"
                          >
                            <VIcon icon="tabler-plus" size="small" class="me-1" />
                            {{ variable.title }}
                          </VChip>
                        </div>
                      </VCardText>
                    </VCard>
                  </VMenu>
                </template>
              </AppTextField>
            </div>

          </VCardText>
        </VCard>
      </div>

      <VBtn
        size="small"
        color="primary"
        variant="tonal"
        prepend-icon="tabler-plus"
        @click="addAction"
        block
      >
        Adicionar Atualização
      </VBtn>
    </VCol>

    <VCol cols="12">
      <VariablesSection :flow-variables="props.flowVariables" />

      <BlockInfoSection
        :items="[
          { icon: 'tabler-briefcase', color: 'info', text: 'Atualiza informações de um negócio no funil de vendas' },
          { icon: 'tabler-arrows-exchange', color: 'primary', text: 'Pode mover negócio entre etapas do funil' },
          { icon: 'tabler-variable', color: 'success', text: 'Suporta variáveis dinâmicas em todos os campos' }
        ]"
        hint="Campos vazios não serão atualizados. Ao marcar como perdido, é obrigatório informar o motivo."
      />
    </VCol>
  </VRow>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { getAllVariables } from '@/utils/dynamicVariables';
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
  identificationType: props.config.identificationType || 'context',
  negocioId: props.config.negocioId || '',
  actions: props.config.actions || []
});

// Tipos de identificação
const identificationTypes = [
  { title: 'Negócio do Contexto', value: 'context' },
  { title: 'Por ID do Negócio', value: 'id' },
  { title: 'Último Negócio do Cliente', value: 'ultimo' }
];

// Tipos de ações disponíveis
const actionTypes = [
  { title: 'Atualizar Título', value: 'update_title' },
  { title: 'Atualizar Valor', value: 'update_valor' },
  { title: 'Atualizar Origem', value: 'update_origem' },
  { title: 'Mover para Etapa', value: 'update_etapa' },
  { title: 'Atualizar Status', value: 'update_status' },
  { title: 'Marcar como Ganho', value: 'mark_won' },
  { title: 'Marcar como Perdido', value: 'mark_lost' },
  { title: 'Data de Fechamento Esperada', value: 'update_data_fechamento_esperada' },
  { title: 'Vincular Agendamento', value: 'vincular_agendamento' },
  { title: 'Atualizar Tags', value: 'update_tags' }
];

const statusOptions = [
  { title: 'Pendente', value: 'Pendente' },
  { title: 'Em Andamento', value: 'Em Andamento' },
  { title: 'Aguardando Cliente', value: 'Aguardando Cliente' },
  { title: 'Ganho', value: 'Ganho' },
  { title: 'Perdido', value: 'Perdido' }
];

const variaveisDisponiveis = ref([]);
const etapas = ref([]);
const tags = ref([]);
const loadingEtapas = ref(false);

// Adicionar nova ação
const addAction = () => {
  localConfig.value.actions.push({
    id: Date.now(),
    type: '',
    value: '',
    motivo: '',
    observacao: ''
  });
};

// Remover ação
const removeAction = (index) => {
  localConfig.value.actions.splice(index, 1);
};

// Verificar se ação precisa de campo de texto
const needsTextField = (type) => {
  return ['update_title', 'update_origem'].includes(type);
};

// Verificar se ação precisa de campo de data
const needsDateField = (type) => {
  return type === 'update_data_fechamento_esperada';
};

// Inserir variável no input
const insertVariableInInput = (action, field, variable) => {
  const currentValue = action[field] || '';
  action[field] = currentValue + `{{${variable}}}`;
};

// Carregar etapas do funil
const loadEtapas = async () => {
  loadingEtapas.value = true;
  try {
    const res = await $api('/crm/list/funil', { method: 'GET' });
    if (res) {
      etapas.value = res.map(f => ({
        title: f.nome,
        value: f.id
      }));
    }
  } catch (error) {
    console.error('Erro ao carregar etapas:', error);
  } finally {
    loadingEtapas.value = false;
  }
};

// Carregar tags
const loadTags = async () => {
  try {
    const res = await $api('/crm/list/tags', { method: 'GET' });
    if (res?.tags) {
      tags.value = res.tags.map(tag => ({
        title: tag.name,
        value: tag.id
      }));
    }
  } catch (error) {
    console.error('Erro ao carregar tags:', error);
  }
};

// Labels e placeholders dos campos
const getFieldLabel = (type) => {
  const labels = {
    'update_title': 'Título do Negócio',
    'update_valor': 'Valor do Negócio',
    'update_origem': 'Origem do Negócio',
    'update_data_fechamento_esperada': 'Data de Fechamento Esperada'
  };
  return labels[type] || 'Valor';
};

const getFieldPlaceholder = (type) => {
  const placeholders = {
    'update_title': 'Ex: Venda de Produto X ou {{titulo_negocio}}',
    'update_origem': 'Ex: WhatsApp, Site, Indicação ou {{origem}}',
    'update_data_fechamento_esperada': 'Selecione a data'
  };
  return placeholders[type] || '';
};

const getFieldHint = (type) => {
  const hints = {
    'update_title': 'Título que identifica o negócio',
    'update_valor': 'Valor estimado do negócio em R$',
    'update_origem': 'Canal ou origem do negócio'
  };
  return hints[type] || '';
};

// Watch para emitir mudanças
watch(localConfig, (newVal) => {
  emit('update:config', { ...newVal });
}, { deep: true });

onMounted(async () => {
  const allVars = await getAllVariables();
  variaveisDisponiveis.value = [...allVars, ...props.flowVariables] || [];
  
  await loadEtapas();
  await loadTags();
  
  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      identificationType: props.config.identificationType || 'context',
      negocioId: props.config.negocioId || '',
      actions: props.config.actions || []
    };
  }
});
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>

