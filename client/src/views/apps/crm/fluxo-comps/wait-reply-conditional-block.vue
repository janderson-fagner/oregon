<template>
  <div>
    <VRow>
      <VCol cols="12" md="6">
        <AppTextField
          v-model.number="config.timeoutValue"
          type="number"
          label="Tempo máximo"
          placeholder="0 = sem timeout"
          hint="Deixe 0 para aguardar indefinidamente"
          persistent-hint
          min="0"
        />
      </VCol>
      <VCol cols="12" md="6">
        <AppSelect
          v-model="config.timeoutType"
          :items="timeTypes"
          label="Unidade de tempo"
          placeholder="Selecione"
        />
      </VCol>
    </VRow>

    <VDivider class="my-4" />
    
    <div class="mb-4">
      <h6 class="text-h6 mb-2">Capturar Variáveis da Resposta</h6>
      <p class="text-caption text-medium-emphasis mb-4">
        Configure quais informações devem ser extraídas da resposta do usuário
      </p>
    </div>

    <!-- Configuração manual de variáveis -->
    <div>
      <VRow>
        <VCol cols="12">
          <div class="d-flex justify-space-between align-center mb-3">
            <h6 class="text-h6 mb-0">Variáveis para Capturar</h6>
            <VBtn
              @click="addVariable"
              variant="tonal"
              color="primary"
              size="small"
              style="height: 30px"
            >
              <VIcon class="me-1" icon="tabler-plus" />
              Variável
            </VBtn>
          </div>
          
          <div
            v-for="(variable, index) in config.variables"
            :key="variable.id"
            class="v-row align-items-center mb-3"
          >
            <VCol cols="12" md="5">
              <AppTextField
                v-model="variable.name"
                label="Nome da Variável"
                placeholder="Ex: nome_cliente"
                required
                :rules="[requiredValidator]"
              />
            </VCol>
            
            <VCol cols="12" md="5">
              <AppTextField
                v-model="variable.label"
                label="Rótulo (opcional)"
                placeholder="Ex: Nome do Cliente"
              />
            </VCol>
            
            <VCol cols="12" md="2" class="d-flex align-end">
              <IconBtn @click="removeVariable(index)" variant="tonal" color="error">
                <VIcon icon="tabler-trash" />
              </IconBtn>
            </VCol>
          </div>
          
          <div v-if="config.variables.length === 0" class="text-center py-4 text-medium-emphasis">
            <VIcon icon="tabler-info-circle" class="mb-2" size="48" />
            <p class="mb-0">Nenhuma variável configurada</p>
            <p class="text-caption">Adicione variáveis para capturar informações da resposta</p>
          </div>
        </VCol>
      </VRow>
    </div>

    <VDivider class="my-4" />
    
    <div class="mb-4">
      <h6 class="text-h6 mb-2">Condições da Resposta</h6>
      <p class="text-caption text-medium-emphasis mb-4">
        Configure condições que serão avaliadas com base na resposta do usuário
      </p>
      
      <div class="d-flex justify-space-between align-center mb-3">
        <h6 class="text-h6 mb-0">Condições</h6>
        <VBtn
          @click="addCondition"
          variant="tonal"
          color="primary"
          size="small"
          style="height: 30px"
        >
          <VIcon class="me-1" icon="tabler-plus" />
          Condição
        </VBtn>
      </div>

      <div v-for="(condition, index) in config.conditions" :key="condition.id" class="v-row align-items-center mb-4">
        <VCol cols="12" md="6">
          <AppSelect 
            v-model="condition.field" 
            :items="fieldItens.filter(item => condition.searchQuery ? 
            item.title?.toLowerCase()?.includes(condition.searchQuery?.toLowerCase()) : true)"
            label="Campo" 
            required 
            placeholder="Selecione o campo"
            @update:model-value="handleFieldSelect(condition)"
            >
            <template #prepend-item>
              <VTextField
                label="Pesquise"
                v-model="condition.searchQuery"
                placeholder="Pesquisar..."
                class="mb-2 mx-2"
              />
              <VDivider />
            </template>
        </AppSelect>
        </VCol>
        <VCol cols="12" md="6">
          <AppSelect
            v-model="condition.operator"
            :items="getOperatorsForCondition(condition)"
            label="Operador"
            required
            placeholder="Selecione o operador"
          />
        </VCol>
        <VCol cols="12" md="6" v-if="!noValueOperators.includes(condition.operator)">
          <AppTextField
            v-model="condition.value"
            required
            :rules="[requiredValidator]"
            :placeholder="getValuePlaceholder(condition.operator)"
            :label="getValueLabel(condition.operator)"
            :type="getValueInputType(condition.operator, condition.field)"
            v-if="!condition.valueIsSelect && !condition.valueIsDinheiro"
          />
          <AppSelect
            v-model="condition.value"
            :items="condition.itensValueSelect"
            label="Valor"
            required
            placeholder="Selecione o valor"
            v-if="condition.valueIsSelect && !condition.valueIsDinheiro"
          >
            <template #prepend-item>
              <VTextField
                label="Pesquise"
                v-model="searchQuery"
                placeholder="Pesquisar..."
                class="mb-2 mx-2"
              />
              <VDivider />
            </template>
          </AppSelect>
          <Dinheiro
            label="Valor"
            v-model="condition.value"
            required
            v-if="!condition.valueIsSelect && condition.valueIsDinheiro"
          />
        </VCol>
        <VCol cols="12" md="6" class="d-flex align-end gap-5">
          <AppSelect
            v-model="condition.logicalOperator"
            :items="[{ title: 'E', value: 'and' }, { title: 'OU', value: 'or' }]"
            label="Lógica"
            required
            placeholder="E/OU"
            v-if="config.conditions.length > 1 && index < config.conditions.length - 1"
          />
          <IconBtn @click="removeCondition(index)" variant="tonal" color="error">
            <VIcon icon="tabler-trash" />
          </IconBtn>
        </VCol>
        <VCol cols="12" class="pa-0 d-flex flex-row align-center justify-center">
          <VDivider />
          <span class="text-caption mx-2">{{ index === config.conditions.length - 1 ? "-" : condition.logicalOperator === "or" ? "OU" : "&" }}</span>
          <VDivider />
        </VCol>
      </div>
      
      <div v-if="config.conditions.length === 0" class="text-center py-4 text-medium-emphasis">
        <VIcon icon="tabler-info-circle" class="mb-2" size="48" />
        <p class="mb-0">Nenhuma condição configurada</p>
        <p class="text-caption">Adicione condições para avaliar a resposta do usuário</p>
      </div>
    </div>

    <VariablesSection :flow-variables="props.flowVariables" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-message-circle', color: 'primary', text: 'Aguarda uma resposta do usuário' },
        { icon: 'tabler-settings', color: 'info', text: 'Captura variáveis configuradas manualmente' },
        { icon: 'tabler-equal', color: 'secondary', text: 'Avalia as condições configuradas' },
        { icon: 'tabler-arrow-right', color: 'primary', text: 'Continua o fluxo baseado no resultado das condições (SIM/NÃO)' }
      ]"
      hint="As variáveis capturadas poderão ser usadas em blocos subsequentes como {{nome_cliente}}, etc."
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import { getAllVariables } from '@/utils/dynamicVariables.js';
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true
  },
  flowVariables: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:config']);

const timeTypes = [
  { title: 'Segundos', value: 'seconds' },
  { title: 'Minutos', value: 'minutes' },
  { title: 'Horas', value: 'hours' },
  { title: 'Dias', value: 'days' }
];

const fieldItens = ref([]);
const infos = ref([]);
const tags = ref([]);
const funis = ref([]);
const fontesClientes = ref([]);
const searchQuery = ref('');

// Operadores de data (relativos)
const dateOperators = [
  { title: "📅 É hoje", value: "is_today" },
  { title: "📅 É amanhã", value: "is_tomorrow" },
  { title: "📅 Foi ontem", value: "is_yesterday" },
  { title: '─── Períodos futuros ───', value: '_sep_future', disabled: true },
  { title: "📅 Nos próximos X dias", value: "within_days" },
  { title: "📅 Nos próximos X meses", value: "within_months" },
  { title: "📅 É nesta semana", value: "is_this_week" },
  { title: "📅 É na próxima semana", value: "is_next_week" },
  { title: "📅 É neste mês", value: "is_this_month" },
  { title: "📅 É no próximo mês", value: "is_next_month" },
  { title: "📅 É neste ano", value: "is_this_year" },
  { title: "📅 Daqui a exatamente X dias", value: "exactly_days_from_now" },
  { title: "📅 Daqui a exatamente X meses", value: "exactly_months_from_now" },
  { title: "📅 Daqui a exatamente X anos", value: "exactly_years_from_now" },
  { title: "📅 É data futura", value: "is_future_date" },
  { title: '─── Períodos passados ───', value: '_sep_past', disabled: true },
  { title: "📅 Nos últimos X dias", value: "within_past_days" },
  { title: "📅 Nos últimos X meses", value: "within_past_months" },
  { title: "📅 Há exatamente X dias", value: "exactly_days_ago" },
  { title: "📅 Há exatamente X meses", value: "exactly_months_ago" },
  { title: "📅 Há exatamente X anos", value: "exactly_years_ago" },
  { title: "📅 Foi na semana passada", value: "is_last_week" },
  { title: "📅 Foi no mês passado", value: "is_last_month" },
  { title: "📅 Foi no ano passado", value: "is_last_year" },
  { title: "📅 É data passada", value: "is_past_date" },
  { title: '─── Comparação de data ───', value: '_sep_compare', disabled: true },
  { title: '─── Horas ───', value: '_sep_hours', disabled: true },
  { title: "🕐 Nas próximas X horas", value: "within_hours" },
  { title: "🕐 Nas últimas X horas", value: "within_past_hours" },
  { title: "🕐 Há exatamente X horas", value: "exactly_hours_ago" },
  { title: "🕐 Daqui a exatamente X horas", value: "exactly_hours_from_now" },
  { title: '─── A mais de (tempo passado) ───', value: '_sep_morethan', disabled: true },
  { title: "🕐 A mais de X horas atrás", value: "more_than_hours_ago" },
  { title: "📅 A mais de X dias atrás", value: "more_than_days_ago" },
  { title: "📅 A mais de X meses atrás", value: "more_than_months_ago" },
  { title: '─── Comparação de data ───', value: '_sep_compare', disabled: true },
  { title: "📅 Antes da data", value: "date_before" },
  { title: "📅 Depois da data", value: "date_after" },
];

// Operadores genéricos
const genericOperators = [
  { title: 'Igual', value: 'equals' },
  { title: 'Diferente', value: 'not_equals' },
  { title: 'Contém', value: 'contains' },
  { title: 'Não contém', value: 'not_contains' },
  { title: 'Maior que', value: 'greater' },
  { title: 'Menor que', value: 'less' },
  { title: 'Maior ou igual', value: 'greater_equal' },
  { title: 'Menor ou igual', value: 'less_equal' },
  { title: 'Vazio', value: 'empty' },
  { title: 'Não vazio', value: 'not_empty' },
  { title: 'Regex', value: 'regex' }
];

// Operadores que não precisam de valor
const noValueOperators = [
  'is_today', 'is_tomorrow', 'is_yesterday',
  'is_this_week', 'is_last_week', 'is_next_week',
  'is_this_month', 'is_last_month', 'is_next_month',
  'is_this_year', 'is_last_year',
  'is_future_date', 'is_past_date',
  'empty', 'not_empty'
];

const numericDateOperators = [
  'within_days', 'within_past_days', 'within_months', 'within_past_months',
  'exactly_days_ago', 'exactly_months_ago', 'exactly_years_ago',
  'exactly_days_from_now', 'exactly_months_from_now', 'exactly_years_from_now',
  'within_hours', 'within_past_hours', 'exactly_hours_ago', 'exactly_hours_from_now',
  'more_than_hours_ago', 'more_than_days_ago', 'more_than_months_ago'
];
const dateValueOperators = ['date_before', 'date_after'];

const getValuePlaceholder = (operator) => {
  if (numericDateOperators.includes(operator)) return 'Quantidade';
  if (dateValueOperators.includes(operator)) return 'Selecione a data';
  return 'Insira o valor';
};

const getValueLabel = (operator) => {
  if (['within_hours', 'within_past_hours', 'exactly_hours_ago', 'exactly_hours_from_now', 'more_than_hours_ago'].includes(operator)) return 'Horas';
  if (['within_days', 'within_past_days', 'exactly_days_ago', 'exactly_days_from_now', 'more_than_days_ago'].includes(operator)) return 'Dias';
  if (['within_months', 'within_past_months', 'exactly_months_ago', 'exactly_months_from_now', 'more_than_months_ago'].includes(operator)) return 'Meses';
  if (['exactly_years_ago', 'exactly_years_from_now'].includes(operator)) return 'Anos';
  if (dateValueOperators.includes(operator)) return 'Data';
  return 'Valor';
};

const getValueInputType = (operator, field) => {
  if (numericDateOperators.includes(operator)) return 'number';
  if (dateValueOperators.includes(operator)) return 'date';
  if (field?.includes('data')) return 'date';
  return 'text';
};

const getOperatorsForCondition = (condition) => {
  const field = condition?.field || '';
  const isDateField = field.includes('data') || field.includes('cadastro') || field.includes('agendamento_data') || field.includes('ultimo_agendamento');
  if (isDateField) {
    return [...dateOperators, { title: '─── Outros ───', value: '_sep_generic', disabled: true }, ...genericOperators];
  }
  return genericOperators;
};

const addVariable = () => {
  const newVariable = {
    id: new Date().getTime(),
    name: '',
    label: ''
  };
  
  emit('update:config', {
    ...props.config,
    variables: [...(props.config.variables || []), newVariable]
  });
};

const removeVariable = (index) => {
  const newVariables = [...(props.config.variables || [])];
  newVariables.splice(index, 1);
  emit('update:config', {
    ...props.config,
    variables: newVariables
  });
};

const addCondition = () => {
  const newCondition = {
    id: new Date().getTime(),
    field: '',
    operator: 'equals',
    value: '',
    logicalOperator: 'and',
    valueIsSelect: false,
    valueIsDinheiro: false,
    itensValueSelect: []
  };
  
  emit('update:config', {
    ...props.config,
    conditions: [...(props.config.conditions || []), newCondition]
  });
};

const removeCondition = (index) => {
  const newConditions = [...(props.config.conditions || [])];
  newConditions.splice(index, 1);
  emit('update:config', {
    ...props.config,
    conditions: newConditions
  });
};

const handleFieldSelect = async (condition) => {
  condition.valueIsSelect = false;
  condition.valueIsDinheiro = false;
  condition.itensValueSelect = [];
  
  if (condition.field === 'variavel') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = await getAllVariables();
  }
  // Campos de gênero
  else if (condition.field === 'cliente_genero' || condition.field === 'genero') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = [
      { title: "Masculino", value: "masculino" },
      { title: "Feminino", value: "feminino" },
      { title: "Não informado", value: "nao_informado" },
    ];
  }
  // Campos de localização
  else if (condition.field === 'estado' || condition.field === 'cliente_estado') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = infos.value.estados || [];
  } else if (condition.field === 'cidade' || condition.field === 'cliente_cidade') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = infos.value.cidades || [];
  }
  // Campos de origem
  else if (condition.field === 'origem') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = infos.value.origens || [];
  }
  // Campos monetários
  else if (condition.field === 'cliente_valor_gasto' || condition.field === 'agendamento_valor' || condition.field === 'agendamento_valor_pago' || condition.field === 'agendamento_saldo_devedor') {
    condition.valueIsDinheiro = true;
  }
  // Campos de data
  else if (condition.field === 'cliente_data_cadastro' || condition.field === 'cliente_ultimo_agendamento' || condition.field === 'agendamento_data' || condition.field === 'agendamento_data_fim') {
    condition.valueIsSelect = false;
  }
  // Campos de tags
  else if (condition.field === 'tags') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = tags.value;
  }
  // Campos de status de agendamento
  else if (condition.field === 'agendamento_status') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = [
      { title: "Agendado", value: "1" },
      { title: "Confirmado", value: "2" },
      { title: "Atendido", value: "3" },
      { title: "Cancelado", value: "6" },
      { title: "Remarcado", value: "7" }
    ];
  }
  // Campos de tipo de agendamento
  else if (condition.field === 'agendamento_tipo') {
    condition.valueIsSelect = true;
    condition.itensValueSelect = [
      { title: "Normal", value: "normal" },
      { title: "Bloqueio", value: "bloqueio" }
    ];
  }
  // Campos de comparação numérica
  else if (
    condition.field === 'cliente_valor_gasto' ||
    condition.field === 'cliente_qtd_agendamentos' ||
    condition.field === 'agendamento_valor' ||
    condition.field === 'agendamento_valor_pago' ||
    condition.field === 'agendamento_saldo_devedor' ||
    condition.field === 'contagem_mensagens'
  ) {
    condition.valueIsSelect = false;
    condition.valueIsDinheiro = false;
  }
  // Campos de texto simples
  else if (
    condition.field === 'cliente_nome' ||
    condition.field === 'cliente_email' ||
    condition.field === 'cliente_telefone' ||
    condition.field === 'cliente_endereco' ||
    condition.field === 'agendamento_id' ||
    condition.field === 'agendamento_observacoes' ||
    condition.field === 'agendamento_endereco' ||
    condition.field === 'agendamento_servicos'
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de mensagens
  else if (condition.field === 'ultima_mensagem' || condition.field === 'ultima_mensagem_cliente' || condition.field === 'ultima_mensagem_sistema') {
    condition.valueIsSelect = false;
  }
  else {
    condition.valueIsSelect = false;
  }
};


// Funções para carregar dados
const getInfos = async () => {
  try {
    const res = await $api("/disparos/seg/get-infos-users", {
      method: "GET",
    });
    if (res) {
      infos.value = res;
    }
  } catch (error) {
    console.error('Erro ao obter informações:', error);
  }
};

const getTags = async () => {
  try {
    const res = await $api("/clientes/list/tags", {
      method: "GET",
    });
    if (res?.tags && Array.isArray(res.tags)) {
      tags.value = res.tags.map((tag) => ({
        title: tag.name,
        value: tag.id,
      }));
    }
  } catch (error) {
    console.error('Erro ao obter tags:', error);
  }
};


// Carregar dados iniciais
onMounted(async () => {
  await getInfos();
  await getTags();
  
  // Obter variáveis do sistema
  const systemVars = await getAllVariables();
  
  // Adicionar campos específicos de condicionais que não estão nas variáveis do sistema
  const conditionalFields = [
    { title: "Variável", value: "variavel" },
    { title: "Tags", value: "tags" },
    { title: "Origem", value: "origem" },
    { title: "Estado", value: "estado" },
    { title: "Cidade", value: "cidade" },
    { title: "Quantidade de Agendamentos", value: "cliente_qtd_agendamentos" },
    { title: "Valor Total Gasto", value: "cliente_valor_gasto" },
    { title: "Último Agendamento", value: "cliente_ultimo_agendamento" },
  ];
  
  // Combinar variáveis do sistema, do fluxo e campos específicos
  const allFields = [...systemVars, ...props.flowVariables, ...conditionalFields];
  const uniqueFields = allFields.filter((field, index, self) =>
    index === self.findIndex((f) => f.value === field.value)
  );
  
  // Ordenar alfabeticamente
  fieldItens.value = uniqueFields.sort((a, b) => {
    const titleA = a.title || '';
    const titleB = b.title || '';
    return titleA.localeCompare(titleB, "pt-BR", { sensitivity: "base" });
  });
});

// Inicializar config se estiver vazia
if (!props.config.timeoutValue && props.config.timeoutValue !== 0) {
  emit('update:config', {
    ...props.config,
    timeoutValue: 0,
    timeoutType: 'seconds',
    variables: [],
    conditions: []
  });
}

// Migrar formato antigo para novo
if (props.config.timeoutSeconds !== undefined && props.config.timeoutValue === undefined) {
  emit('update:config', {
    ...props.config,
    timeoutValue: props.config.timeoutSeconds,
    timeoutType: 'seconds',
    variables: props.config.variables || [],
    conditions: props.config.conditions || []
  });
}
</script>
