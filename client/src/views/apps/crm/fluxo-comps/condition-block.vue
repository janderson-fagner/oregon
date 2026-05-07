<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-4">
      <div>
        <h6 class="text-h6 mb-0">Condições</h6>
        <p class="text-caption mb-0 text-medium-emphasis">
          Configure as condições para direcionar o fluxo
        </p>
      </div>
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

    <VRow>
      <VCol cols="12">
        <div
          v-for="(condition, index) in config.conditions"
          :key="condition.id"
          class="v-row align-items-center mb-4"
        >
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
              :items="[
                { title: 'E', value: 'and' },
                { title: 'OU', value: 'or' },
              ]"
              label="Lógica"
              required
              placeholder="E/OU"
              v-if="config.conditions.length > 1 && index < config.conditions.length - 1"
            />
            <IconBtn @click="removeCondition(index)" variant="tonal" color="error">
              <VIcon icon="tabler-trash" />
            </IconBtn>
          </VCol>
          
          <VCol
            cols="12"
            class="pa-0 d-flex flex-row align-center justify-center"
          >
            <VDivider />
            <span class="text-caption mx-2">{{
              index === config.conditions.length - 1
                ? "-"
                : condition.logicalOperator === "or"
                ? "OU"
                : "&"
            }}</span>
            <VDivider />
          </VCol>
        </div>
      </VCol>
    </VRow>

    <VariablesSection :flow-variables="props.flowVariables" />

    <BlockInfoSection
      :items="[
        { icon: 'tabler-git-branch', color: 'primary', text: 'Avalia as condições configuradas em sequência' },
        { icon: 'tabler-check', color: 'success', text: 'Se verdadeiras, segue para SIM' },
        { icon: 'tabler-x', color: 'error', text: 'Caso contrário, segue para NÃO' }
      ]"
      hint="Se todas as condições forem verdadeiras, o fluxo seguirá para SIM, caso contrário seguirá para NÃO."
    />
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
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
  { title: "Igual a", value: "eq" },
  { title: "Diferente de", value: "neq" },
  { title: "Contém", value: "contains" },
  { title: "Não contém", value: "not_contains" },
  { title: "Maior que", value: "gt" },
  { title: "Maior ou igual a", value: "gte" },
  { title: "Menor que", value: "lt" },
  { title: "Menor ou igual a", value: "lte" },
  { title: "Está vazio", value: "empty" },
  { title: "Não está vazio", value: "not_empty" },
  { title: "Regex", value: "regex" },
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

// Operadores que precisam de valor numérico (quantidade)
const numericDateOperators = [
  'within_days', 'within_past_days', 'within_months', 'within_past_months',
  'exactly_days_ago', 'exactly_months_ago', 'exactly_years_ago',
  'exactly_days_from_now', 'exactly_months_from_now', 'exactly_years_from_now',
  'within_hours', 'within_past_hours', 'exactly_hours_ago', 'exactly_hours_from_now',
  'more_than_hours_ago', 'more_than_days_ago', 'more_than_months_ago'
];

// Operadores que precisam de valor de data
const dateValueOperators = ['date_before', 'date_after'];

// Helpers para placeholder, label e tipo do input de valor
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

// Retorna operadores baseado no campo selecionado
const getOperatorsForCondition = (condition) => {
  const field = condition?.field || '';
  const isDateField = field.includes('data') || field.includes('cadastro') || field.includes('agendamento_data') || field.includes('ultimo_agendamento');
  if (isDateField) {
    return [...dateOperators, { title: '─── Outros ───', value: '_sep_generic', disabled: true }, ...genericOperators];
  }
  return genericOperators;
};

const addCondition = () => {
  const newCondition = {
    id: new Date().getTime(),
    field: null,
    operator: null,
    logicalOperator: null,
    value: null,
    valueIsSelect: false,
    valueIsDinheiro: false,
    itensValueSelect: [],
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
  const index = props.config.conditions.findIndex((c) => c.id === condition.id);
  if (index === -1) return;

  const newConditions = [...props.config.conditions];
  
  // Limpar campos dependentes
  newConditions[index].value = null;
  newConditions[index].valueIsSelect = false;
  newConditions[index].valueIsDinheiro = false;

  if (newConditions[index].field === "variavel") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = await getAllVariables();
  }
  // Campos de gênero
  else if (newConditions[index].field === "cliente_genero" || newConditions[index].field === "genero") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = [
      { title: "Masculino", value: "masculino" },
      { title: "Feminino", value: "feminino" },
      { title: "Não informado", value: "nao_informado" },
    ];
  }
  // Campos de localização
  else if (newConditions[index].field === "estado" || newConditions[index].field === "cliente_estado") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = infos.value.estados || [];
  } else if (newConditions[index].field === "cidade" || newConditions[index].field === "cliente_cidade") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = infos.value.cidades || [];
  }
  // Campos de origem
  else if (newConditions[index].field === "origem") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = infos.value.origens || [];
  }
  // Campos monetários
  else if (newConditions[index].field === "cliente_valor_gasto" || newConditions[index].field === "agendamento_valor" || newConditions[index].field === "agendamento_valor_pago" || newConditions[index].field === "agendamento_saldo_devedor") {
    newConditions[index].valueIsDinheiro = true;
  }
  // Campos de data
  else if (newConditions[index].field === "cliente_data_cadastro" || newConditions[index].field === "cliente_ultimo_agendamento" || newConditions[index].field === "agendamento_data" || newConditions[index].field === "agendamento_data_fim") {
    newConditions[index].valueIsSelect = false;
  }
  // Campos de tags
  else if (newConditions[index].field === "tags") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = tags.value;
  }
  // Campos de status de agendamento
  else if (newConditions[index].field === "agendamento_status") {
    newConditions[index].valueIsSelect = true;
    // Status de agendamento do sistema
    newConditions[index].itensValueSelect = [
      { title: "Agendado", value: "1" },
      { title: "Confirmado", value: "2" },
      { title: "Atendido", value: "3" },
      { title: "Cancelado", value: "6" },
      { title: "Remarcado", value: "7" }
    ];
  }
  // Campos de tipo de agendamento
  else if (newConditions[index].field === "agendamento_tipo") {
    newConditions[index].valueIsSelect = true;
    newConditions[index].itensValueSelect = [
      { title: "Normal", value: "normal" },
      { title: "Bloqueio", value: "bloqueio" }
    ];
  }
  // Campos de comparação numérica
  else if (
    newConditions[index].field === "cliente_valor_gasto" ||
    newConditions[index].field === "cliente_qtd_agendamentos" ||
    newConditions[index].field === "agendamento_valor" ||
    newConditions[index].field === "agendamento_valor_pago" ||
    newConditions[index].field === "agendamento_saldo_devedor" ||
    newConditions[index].field === "contagem_mensagens"
  ) {
    newConditions[index].valueIsSelect = false;
    newConditions[index].valueIsDinheiro = false;
  }
  // Campos de texto simples
  else if (
    newConditions[index].field === "cliente_nome" ||
    newConditions[index].field === "cliente_email" ||
    newConditions[index].field === "cliente_telefone" ||
    newConditions[index].field === "cliente_endereco" ||
    newConditions[index].field === "agendamento_id" ||
    newConditions[index].field === "agendamento_observacoes" ||
    newConditions[index].field === "agendamento_endereco" ||
    newConditions[index].field === "agendamento_servicos"
  ) {
    newConditions[index].valueIsSelect = false;
  }
  // Campos de mensagens
  else if (newConditions[index].field === "ultima_mensagem" || newConditions[index].field === "ultima_mensagem_cliente" || newConditions[index].field === "ultima_mensagem_sistema") {
    newConditions[index].valueIsSelect = false;
  }
  else {
    newConditions[index].valueIsSelect = false;
  }

  emit('update:config', {
    ...props.config,
    conditions: newConditions
  });
};

const getInfos = async () => {
  try {
    const res = await $api("/disparos/seg/get-infos-users", {
      method: "GET",
    });
    if (res) {
      infos.value = res;
    }
  } catch (error) {
    console.error("Erro ao buscar infos:", error);
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
    console.error("Error tags", error);
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
if (!props.config.conditions || props.config.conditions.length === 0) {
  emit('update:config', {
    ...props.config,
    conditions: []
  });
}
</script>
