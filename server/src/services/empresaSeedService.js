/**
 * Serviço de seed de dados iniciais para novas empresas
 * Popula roles, status, tipos, serviços, clientes de exemplo, etc.
 */

const dbQuery = require('../database');

/**
 * Popula todos os dados iniciais para uma nova empresa
 * @param {number} empresaId - ID da empresa recém-criada
 * @param {number} userId - ID do usuário admin recém-criado
 */
async function seedEmpresaData(empresaId, userId) {
  try {
    console.log(`[Seed] Iniciando seed de dados para empresa ${empresaId}...`);

    // Executa todos os seeds em paralelo quando possível
    const [roles, statusIds] = await Promise.all([
      seedRoles(empresaId),
      seedAgendamentoStatus(empresaId),
    ]);

    // Seeds que não dependem dos anteriores
    await Promise.all([
      seedAgendamentoTipos(empresaId),
      seedOptions(empresaId),
      seedFormasPagamento(empresaId),
    ]);

    // Seeds que geram IDs necessários depois
    const servicosIds = await seedServicos(empresaId);
    const clientesIds = await seedClientes(empresaId);

    // Seeds que dependem de serviços/clientes/status
    await Promise.all([
      seedAgendamentos(empresaId, userId, statusIds, servicosIds, clientesIds),
      seedFunilCRM(empresaId, userId, clientesIds),
      seedFluxos(empresaId),
    ]);

    console.log(`[Seed] Seed de dados concluído para empresa ${empresaId}`);
    return true;
  } catch (error) {
    console.error(`[Seed] Erro no seed da empresa ${empresaId}:`, error);
    // Não propaga o erro para não bloquear o cadastro
    return false;
  }
}

/**
 * Cria 3 roles padrão: Gestor, Atendente, Técnico
 */
async function seedRoles(empresaId) {
  const roles = [
    {
      role_name: 'Gestor',
      role_ability: JSON.stringify([
        { action: 'read', subject: 'all' },
        { action: 'manage', subject: 'agendamento' },
        { action: 'manage', subject: 'cliente' },
        { action: 'manage', subject: 'financeiro' },
        { action: 'manage', subject: 'servico' },
        { action: 'manage', subject: 'estoque' },
        { action: 'manage', subject: 'crm' },
        { action: 'manage', subject: 'relatorio' },
        { action: 'manage', subject: 'config' },
        { action: 'manage', subject: 'calculadora' },
      ]),
    },
    {
      role_name: 'Atendente',
      role_ability: JSON.stringify([
        { action: 'read', subject: 'all' },
        { action: 'create', subject: 'agendamento' },
        { action: 'edit', subject: 'agendamento' },
        { action: 'view-all', subject: 'agendamento' },
        { action: 'atender', subject: 'agendamento' },
        { action: 'confirmar', subject: 'agendamento' },
        { action: 'remarcar', subject: 'agendamento' },
        { action: 'historico', subject: 'agendamento' },
        { action: 'create', subject: 'cliente' },
        { action: 'edit', subject: 'cliente' },
        { action: 'view', subject: 'cliente' },
        { action: 'view', subject: 'crm_chat' },
        { action: 'view', subject: 'crm_funil_vendas' },
        { action: 'view', subject: 'financeiro_recebimento' },
        { action: 'create', subject: 'financeiro_recebimento' },
      ]),
    },
    {
      role_name: 'Técnico',
      role_ability: JSON.stringify([
        { action: 'read', subject: 'all' },
        { action: 'view', subject: 'agendamento' },
        { action: 'atender', subject: 'agendamento' },
        { action: 'confirmar', subject: 'agendamento' },
        { action: 'historico', subject: 'agendamento' },
        { action: 'ordem_servico', subject: 'agendamento' },
        { action: 'view', subject: 'cliente' },
        { action: 'view', subject: 'servico' },
        { action: 'view', subject: 'estoque' },
        { action: 'view', subject: 'financeiro_comissao' },
      ]),
    },
  ];

  const ids = {};
  for (const role of roles) {
    const result = await dbQuery(
      'INSERT INTO Roles (role_name, role_ability, empresa_id) VALUES (?, ?, ?)',
      [role.role_name, role.role_ability, empresaId]
    );
    ids[role.role_name] = result.insertId;
  }

  console.log(`[Seed] Roles criadas para empresa ${empresaId}`);
  return ids;
}

/**
 * Cria 4 status de agendamento padrão
 * Retorna objeto com nome -> id
 */
async function seedAgendamentoStatus(empresaId) {
  const statusList = ['Agendado', 'Atendido', 'Cancelado', 'Remarcado'];
  const ids = {};

  for (const status of statusList) {
    const result = await dbQuery(
      'INSERT INTO AGENDAMENTO_STATUS (ast_descricao, empresa_id) VALUES (?, ?)',
      [status, empresaId]
    );
    ids[status] = result.insertId;
  }

  console.log(`[Seed] Status de agendamento criados para empresa ${empresaId}`);
  return ids;
}

/**
 * Cria 3 tipos de agendamento padrão
 */
async function seedAgendamentoTipos(empresaId) {
  const tipos = [
    { name: 'Serviço', icon: '📋' },
    { name: 'Consulta', icon: '💬' },
    { name: 'Retorno', icon: '🔄' },
  ];

  for (const tipo of tipos) {
    await dbQuery(
      'INSERT INTO AGENDAMENTO_TIPOS (name, icon, empresa_id) VALUES (?, ?, ?)',
      [tipo.name, tipo.icon, empresaId]
    );
  }

  console.log(`[Seed] Tipos de agendamento criados para empresa ${empresaId}`);
}

/**
 * Cria opções padrão: cores de status, fontes de cliente, formas pgto saída, tipos despesa
 */
async function seedOptions(empresaId) {
  const options = [
    // Cores de status
    { type: 'cor_atendido', value: '#2dce89' },
    { type: 'cor_cancelado', value: '#f5365c' },
    { type: 'cor_remarcado', value: '#fb6340' },
    { type: 'cor_bloqueio', value: '#000000' },
    // Fontes de cliente
    { type: 'fonte_cliente', value: 'WhatsApp' },
    { type: 'fonte_cliente', value: 'Instagram' },
    { type: 'fonte_cliente', value: 'Indicação' },
    // Formas de pagamento de saída
    { type: 'fpt_saida', value: 'Dinheiro' },
    { type: 'fpt_saida', value: 'Pix' },
    { type: 'fpt_saida', value: 'Transferência Bancária' },
    // Tipos de despesa
    { type: 'tipo_despesa', value: 'Material' },
    { type: 'tipo_despesa', value: 'Aluguel' },
    { type: 'tipo_despesa', value: 'Transporte' },
  ];

  for (const opt of options) {
    await dbQuery(
      'INSERT INTO Options (type, value, empresa_id) VALUES (?, ?, ?)',
      [opt.type, opt.value, empresaId]
    );
  }

  console.log(`[Seed] Options criadas para empresa ${empresaId}`);
}

/**
 * Cria 3 formas de pagamento de entrada
 */
async function seedFormasPagamento(empresaId) {
  const formas = ['Dinheiro', 'Pix', 'Cartão de Crédito'];

  for (const forma of formas) {
    await dbQuery(
      'INSERT INTO FORMAS_PAGAMENTO (fpg_descricao, fpg_ativo, empresa_id) VALUES (?, 1, ?)',
      [forma, empresaId]
    );
  }

  console.log(`[Seed] Formas de pagamento criadas para empresa ${empresaId}`);
}

/**
 * Cria 3 serviços de exemplo com subserviços
 * Retorna objeto com nome -> { ser_id, subs: [] }
 */
async function seedServicos(empresaId) {
  const servicos = [
    {
      nome: 'Consulta',
      valor: 120,
      comissao_type: 'percentual',
      comissao: 30,
      subs: [
        { nome: 'Consulta Presencial', valor: 120, comissao_type: 'percentual', comissao: 30 },
        { nome: 'Consulta Online', valor: 80, comissao_type: 'percentual', comissao: 30 },
      ],
    },
    {
      nome: 'Serviço Padrão',
      valor: 80,
      comissao_type: 'percentual',
      comissao: 25,
      subs: [],
    },
    {
      nome: 'Manutenção',
      valor: 150,
      comissao_type: 'percentual',
      comissao: 30,
      subs: [],
    },
  ];

  const ids = {};

  for (const servico of servicos) {
    const result = await dbQuery(
      `INSERT INTO SERVICOS_NEW (ser_nome, ser_valor, ser_comissao_type, ser_comissao, empresa_id)
       VALUES (?, ?, ?, ?, ?)`,
      [servico.nome, servico.valor, servico.comissao_type, servico.comissao, empresaId]
    );

    const serId = result.insertId;
    const subIds = [];

    for (const sub of servico.subs) {
      const subResult = await dbQuery(
        `INSERT INTO SERVICOS_SUBS (ser_pai, ser_nome, ser_valor, ser_comissao_type, ser_comissao, empresa_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [serId, sub.nome, sub.valor, sub.comissao_type, sub.comissao, empresaId]
      );
      subIds.push(subResult.insertId);
    }

    ids[servico.nome] = { ser_id: serId, subs: subIds };
  }

  console.log(`[Seed] Serviços criados para empresa ${empresaId}`);
  return ids;
}

/**
 * Cria 3 clientes fictícios de exemplo
 * Retorna array de { cli_Id, cli_nome }
 */
async function seedClientes(empresaId) {
  const clientes = [
    { nome: 'Maria Silva', celular: '41999990001', email: 'maria.silva@exemplo.com' },
    { nome: 'João Santos', celular: '41999990002', email: 'joao.santos@exemplo.com' },
    { nome: 'Ana Oliveira', celular: '41999990003', email: 'ana.oliveira@exemplo.com' },
  ];

  const ids = [];

  for (const cliente of clientes) {
    const result = await dbQuery(
      `INSERT INTO CLIENTES (cli_nome, cli_celular, cli_email, cli_ativo, empresa_id)
       VALUES (?, ?, ?, 1, ?)`,
      [cliente.nome, cliente.celular, cliente.email, empresaId]
    );
    ids.push({ cli_Id: result.insertId, cli_nome: cliente.nome });
  }

  console.log(`[Seed] Clientes de exemplo criados para empresa ${empresaId}`);
  return ids;
}

/**
 * Cria 2 agendamentos de exemplo para o dia seguinte
 */
async function seedAgendamentos(empresaId, userId, statusIds, servicosIds, clientesIds) {
  // Data = amanhã
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const dataStr = amanha.toISOString().split('T')[0];

  const statusAgendado = statusIds['Agendado'];

  // Agendamento 1: Maria Silva - Consulta - 10:00-11:00
  const age1 = await dbQuery(
    `INSERT INTO AGENDAMENTO (ast_id, age_data, age_horaInicio, age_horaFim, cli_id, fun_id, age_ativo, age_type, age_valor, empresa_id)
     VALUES (?, ?, '10:00:00', '11:00:00', ?, ?, 1, 'servico', 120, ?)`,
    [statusAgendado, dataStr, clientesIds[0].cli_Id, userId, empresaId]
  );

  // Vincular serviço Consulta ao agendamento 1
  if (servicosIds['Consulta']) {
    await dbQuery(
      `INSERT INTO AXS (age_id, ser_id, ser_quantity, ser_valor, empresa_id) VALUES (?, ?, 1, 120, ?)`,
      [age1.insertId, servicosIds['Consulta'].ser_id, empresaId]
    );
  }

  // Agendamento 2: João Santos - Manutenção - 14:00-15:00
  const age2 = await dbQuery(
    `INSERT INTO AGENDAMENTO (ast_id, age_data, age_horaInicio, age_horaFim, cli_id, fun_id, age_ativo, age_type, age_valor, empresa_id)
     VALUES (?, ?, '14:00:00', '15:00:00', ?, ?, 1, 'servico', 150, ?)`,
    [statusAgendado, dataStr, clientesIds[1].cli_Id, userId, empresaId]
  );

  // Vincular serviço Manutenção ao agendamento 2
  if (servicosIds['Manutenção']) {
    await dbQuery(
      `INSERT INTO AXS (age_id, ser_id, ser_quantity, ser_valor, empresa_id) VALUES (?, ?, 1, 150, ?)`,
      [age2.insertId, servicosIds['Manutenção'].ser_id, empresaId]
    );
  }

  console.log(`[Seed] Agendamentos de exemplo criados para empresa ${empresaId}`);
}

/**
 * Cria funil CRM com 3 etapas e 3 negócios de exemplo
 */
async function seedFunilCRM(empresaId, userId, clientesIds) {
  // Criar etapas do funil
  const etapas = [
    { nome: 'Novo Lead', probabilidade: 10, ordem: 1 },
    { nome: 'Em Negociação', probabilidade: 50, ordem: 2 },
    { nome: 'Proposta Enviada', probabilidade: 80, ordem: 3 },
  ];

  const etapaIds = [];
  for (const etapa of etapas) {
    const result = await dbQuery(
      `INSERT INTO Funis (nome, probabilidade, ordem, empresa_id) VALUES (?, ?, ?, ?)`,
      [etapa.nome, etapa.probabilidade, etapa.ordem, empresaId]
    );
    etapaIds.push(result.insertId);
  }

  // Criar negócios vinculados aos clientes e etapas
  const negocios = [
    { title: 'Contrato mensal', cliIndex: 0, etapaIndex: 0, valor: 500 },
    { title: 'Pacote serviços', cliIndex: 1, etapaIndex: 1, valor: 800 },
    { title: 'Plano completo', cliIndex: 2, etapaIndex: 2, valor: 1200 },
  ];

  for (const negocio of negocios) {
    await dbQuery(
      `INSERT INTO Negocios (cli_Id, title, status, valor, etapaId, created_by, empresa_id)
       VALUES (?, ?, 'Pendente', ?, ?, ?, ?)`,
      [
        clientesIds[negocio.cliIndex].cli_Id,
        negocio.title,
        negocio.valor,
        etapaIds[negocio.etapaIndex],
        String(userId),
        empresaId,
      ]
    );
  }

  console.log(`[Seed] Funil CRM criado para empresa ${empresaId}`);
}

/**
 * Cria 3 fluxos de atendimento inativos como template
 */
async function seedFluxos(empresaId) {
  const fluxos = [
    {
      name: 'Boas-vindas',
      description: 'Fluxo de boas-vindas para primeiro contato',
      trigger_type: 'first_contact',
      trigger_conditions: null,
      message: 'Olá! Bem-vindo(a)! Como posso ajudar?',
    },
    {
      name: 'Agendamento',
      description: 'Fluxo para agendamento de serviços',
      trigger_type: 'keyword',
      trigger_conditions: JSON.stringify({ keywords: ['agendar', 'horário', 'marcar'] }),
      message: 'Vou te ajudar a agendar! Qual serviço você deseja?',
    },
    {
      name: 'Informações',
      description: 'Fluxo de informações sobre serviços e preços',
      trigger_type: 'keyword',
      trigger_conditions: JSON.stringify({ keywords: ['preço', 'valor', 'serviço'] }),
      message: 'Temos os seguintes serviços disponíveis...',
    },
  ];

  for (const fluxo of fluxos) {
    // Criar fluxo inativo
    const flowResult = await dbQuery(
      `INSERT INTO Flows (name, description, status, trigger_type, ativo, trigger_conditions, empresa_id)
       VALUES (?, ?, 'inativo', ?, 0, ?, ?)`,
      [fluxo.name, fluxo.description, fluxo.trigger_type, fluxo.trigger_conditions, empresaId]
    );

    const flowId = flowResult.insertId;

    // Criar nó start
    const startNode = await dbQuery(
      `INSERT INTO FlowNodes (flow_id, type, label, config, position_x, position_y, empresa_id)
       VALUES (?, 'start', 'Início', '{}', 100, 100, ?)`,
      [flowId, empresaId]
    );

    // Criar nó send_message
    const msgNode = await dbQuery(
      `INSERT INTO FlowNodes (flow_id, type, label, config, position_x, position_y, empresa_id)
       VALUES (?, 'send_message', 'Mensagem', ?, 300, 200, ?)`,
      [flowId, JSON.stringify({ message: fluxo.message }), empresaId]
    );

    // Criar edge do start para send_message
    await dbQuery(
      `INSERT INTO FlowEdges (flow_id, source_node_id, target_node_id, empresa_id)
       VALUES (?, ?, ?, ?)`,
      [flowId, startNode.insertId, msgNode.insertId, empresaId]
    );
  }

  console.log(`[Seed] Fluxos de exemplo criados para empresa ${empresaId}`);
}

module.exports = {
  seedEmpresaData,
};
