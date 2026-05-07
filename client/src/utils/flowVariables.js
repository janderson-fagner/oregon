import { ref } from 'vue';

// Cache das variáveis para evitar múltiplas chamadas à API
const variaveisCache = ref(null);

// Função para carregar variáveis do crmUtils via API
export const loadVariaveisFromAPI = async () => {
  if (variaveisCache.value) {
    return variaveisCache.value;
  }

  try {
    // Buscar variáveis do crmUtils via API
    const response = await $api('/crm/variaveis');

    if (!response) {
      throw new Error('Erro ao carregar variáveis');
    }

    console.log('Variáveis:', response);

    const data = response;

    variaveisCache.value = data;
    return variaveisCache.value;
  } catch (error) {
    console.error('Erro ao carregar variáveis:', error, error.response);
    // Retornar variáveis padrão em caso de erro
    return getVariaveisPadrao();
  }
};

// Variáveis padrão como fallback
const getVariaveisPadrao = () => [
  // Variáveis do Cliente
  { 
    title: "Nome do Cliente", 
    value: "cliente_nome", 
    type: 'cliente', 
    desc: "Nome do cliente (primeira palavra do nome completo)" 
  },
  { 
    title: "Sobrenome do Cliente", 
    value: "cliente_sobrenome", 
    type: 'cliente', 
    desc: "Sobrenome do cliente (resto do nome)" 
  },
  { 
    title: "Nome Completo do Cliente", 
    value: "cliente_nomecompleto", 
    type: 'cliente', 
    desc: "Nome completo do cliente" 
  },
  { 
    title: "Email do Cliente", 
    value: "cliente_email", 
    type: 'cliente', 
    desc: "Email do cliente" 
  },
  { 
    title: "Celular do Cliente", 
    value: "cliente_celular", 
    type: 'cliente', 
    desc: "Número de celular do cliente" 
  },
  { 
    title: "Cidade do Cliente", 
    value: "cliente_cidade", 
    type: 'cliente', 
    desc: "Cidade do cliente (primeiro endereço)" 
  },
  { 
    title: "Estado do Cliente", 
    value: "cliente_estado", 
    type: 'cliente', 
    desc: "Estado do cliente (primeiro endereço)" 
  },
  { 
    title: "Bairro do Cliente", 
    value: "cliente_bairro", 
    type: 'cliente', 
    desc: "Bairro do cliente (primeiro endereço)" 
  },
  { 
    title: "Gênero do Cliente", 
    value: "cliente_genero", 
    type: 'cliente', 
    desc: "Gênero do cliente" 
  },
  { 
    title: "Valor Total Ganhos", 
    value: "cliente_valor_gasto", 
    type: 'cliente', 
    desc: "Valor total ganho do cliente em todos os agendamentos" 
  },
  { 
    title: "Quantidade de Agendamentos", 
    value: "cliente_qtd_agendamentos", 
    type: 'cliente', 
    desc: "Número total de agendamentos do cliente" 
  },
  { 
    title: "Data de Cadastro", 
    value: "cliente_data_cadastro", 
    type: 'cliente', 
    desc: "Data de cadastro do cliente" 
  },

  // Variáveis do Agendamento (quando aplicável)
  { 
    title: "Data do Agendamento", 
    value: "agendamento_data", 
    type: 'agendamento', 
    desc: "Data do agendamento" 
  },
  { 
    title: "Hora do Agendamento", 
    value: "agendamento_hora", 
    type: 'agendamento', 
    desc: "Hora do agendamento" 
  },
  { 
    title: "Data Completa do Agendamento", 
    value: "agendamento_datacompleta", 
    type: 'agendamento', 
    desc: "Data e hora do agendamento" 
  },
  { 
    title: "Número do Agendamento", 
    value: "agendamento_numero", 
    type: 'agendamento', 
    desc: "ID do agendamento" 
  },
  { 
    title: "Valor do Agendamento", 
    value: "agendamento_valor", 
    type: 'agendamento', 
    desc: "Valor do agendamento" 
  },
  { 
    title: "Profissional do Agendamento", 
    value: "agendamento_profissional", 
    type: 'agendamento', 
    desc: "Nome do profissional responsável" 
  },
  { 
    title: "Status do Agendamento", 
    value: "agendamento_status", 
    type: 'agendamento', 
    desc: "Status atual do agendamento" 
  },
  { 
    title: "Serviços do Agendamento", 
    value: "agendamento_servicos", 
    type: 'agendamento', 
    desc: "Serviços incluídos no agendamento" 
  },
  { 
    title: "Observações do Agendamento", 
    value: "agendamento_observacoes", 
    type: 'agendamento', 
    desc: "Observações do agendamento" 
  },

  // Variáveis do Sistema
  { 
    title: "Data Atual", 
    value: "data_atual", 
    type: 'sistema', 
    desc: "Data atual do sistema" 
  },
  { 
    title: "Hora Atual", 
    value: "hora_atual", 
    type: 'sistema', 
    desc: "Hora atual do sistema" 
  },
  { 
    title: "Dia da Semana", 
    value: "dia_semana", 
    type: 'sistema', 
    desc: "Dia da semana atual" 
  },
  {
    title: "Mês Atual",
    value: "mes_atual",
    type: 'sistema',
    desc: "Mês atual"
  },
  {
    title: "Ano Atual",
    value: "ano_atual",
    type: 'sistema',
    desc: "Ano atual"
  },

  // Variáveis adicionais de Cliente (missing from original fallback)
  {
    title: "Telefone do Cliente",
    value: "cliente_telefone",
    type: 'cliente',
    desc: "Telefone do cliente"
  },
  {
    title: "CPF do Cliente",
    value: "cliente_cpf",
    type: 'cliente',
    desc: "CPF do cliente"
  },
  {
    title: "Data de Nascimento",
    value: "cliente_data_nascimento",
    type: 'cliente',
    desc: "Data de nascimento do cliente"
  },
  {
    title: "Endereço do Cliente",
    value: "cliente_endereco",
    type: 'cliente',
    desc: "Endereço completo do cliente"
  },
  {
    title: "Tags do Cliente",
    value: "cliente_tags",
    type: 'cliente',
    desc: "Tags do cliente separadas por vírgula"
  },
  {
    title: "ID do Cliente",
    value: "cliente_id",
    type: 'cliente',
    desc: "ID único do cliente no sistema"
  },
  {
    title: "Último Agendamento Concluído",
    value: "cliente_ultimo_agendamento_concluido",
    type: 'cliente',
    desc: "Data do último agendamento concluído do cliente"
  },
  {
    title: "Último Agendamento Cancelado",
    value: "cliente_ultimo_agendamento_cancelado",
    type: 'cliente',
    desc: "Data do último agendamento cancelado do cliente"
  },
  {
    title: "Último Agendamento",
    value: "cliente_ultimo_agendamento",
    type: 'cliente',
    desc: "Data do último agendamento do cliente"
  },
  {
    title: "Agendamentos Concluídos",
    value: "cliente_qtd_agendamentos_concluidos",
    type: 'cliente',
    desc: "Número total de agendamentos concluídos do cliente"
  },
  {
    title: "Agendamentos Cancelados",
    value: "cliente_qtd_agendamentos_cancelados",
    type: 'cliente',
    desc: "Número total de agendamentos cancelados do cliente"
  },

  // Variáveis adicionais de Agendamento
  {
    title: "ID do Agendamento",
    value: "agendamento_id",
    type: 'agendamento',
    desc: "ID do agendamento"
  },
  {
    title: "Hora Início do Agendamento",
    value: "agendamento_hora_inicio",
    type: 'agendamento',
    desc: "Hora de início do agendamento"
  },
  {
    title: "Hora Fim do Agendamento",
    value: "agendamento_hora_fim",
    type: 'agendamento',
    desc: "Hora de término do agendamento"
  },
  {
    title: "Data Final do Agendamento",
    value: "agendamento_data_final",
    type: 'agendamento',
    desc: "Data do término do agendamento"
  },
  {
    title: "Hora Final do Agendamento",
    value: "agendamento_hora_final",
    type: 'agendamento',
    desc: "Hora do término do agendamento"
  },
  {
    title: "Serviço do Agendamento",
    value: "agendamento_servico",
    type: 'agendamento',
    desc: "Serviços do agendamento separados por vírgula"
  },
  {
    title: "Endereço do Agendamento",
    value: "agendamento_endereco",
    type: 'agendamento',
    desc: "Endereço completo do agendamento"
  },

  // Variáveis de Negócio (CRM)
  {
    title: "ID do Negócio",
    value: "negocio_id",
    type: 'negocio',
    desc: "ID do negócio no CRM"
  },
  {
    title: "Título do Negócio",
    value: "negocio_titulo",
    type: 'negocio',
    desc: "Título do negócio"
  },
  {
    title: "Valor do Negócio",
    value: "negocio_valor",
    type: 'negocio',
    desc: "Valor do negócio"
  },
  {
    title: "Status do Negócio",
    value: "negocio_status",
    type: 'negocio',
    desc: "Status atual do negócio"
  },
  {
    title: "Origem do Negócio",
    value: "negocio_origem",
    type: 'negocio',
    desc: "Origem/canal do negócio"
  },
  {
    title: "Etapa do Funil",
    value: "negocio_etapa_nome",
    type: 'negocio',
    desc: "Nome da etapa atual no funil"
  }
];

// Exportar função para obter variáveis (assíncrona)
export const getVariaveisItens = async () => {
  return await loadVariaveisFromAPI();
};

// Exportar variáveis padrão para compatibilidade
export const variaveisItens = getVariaveisPadrao();

export const getVariableByValue = (value) => {
  return variaveisItens.find(v => v.value === value);
};

export const getVariablesByType = (type) => {
  return variaveisItens.filter(v => v.type === type);
};
