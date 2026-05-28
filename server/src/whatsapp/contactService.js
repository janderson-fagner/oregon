'use strict';

/**
 * Enriquecimento de conversas da Cloud API com dados do CRM.
 *
 * O webhook do Meta entrega apenas `profile.name` + `wa_id` do contato — não há
 * foto de perfil nem vínculo com o cadastro. Este módulo resolve, por telefone
 * (match pelos últimos 8 dígitos, padrão do projeto), o CLIENTES correspondente
 * e o estado de atendimento/bloqueio dos fluxos, anexando-os ao objeto da conversa.
 *
 * Todas as consultas são isoladas por empresa_id (multi-tenant).
 */

const dbQuery = require('../utils/dbHelper');

/**
 * Parse seguro de JSON armazenado em coluna texto.
 * @param {*} value
 * @param {*} fallback
 * @returns {*}
 */
function safeJson(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

/**
 * Extrai os últimos 8 dígitos de um telefone (chave de comparação).
 * @param {string} phone
 * @returns {string}
 */
function last8(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-8);
}

/**
 * Enriquece UMA conversa (uso no chat aberto). Anexa, in-place:
 *  - conv.cliente            → linha completa de CLIENTES + endereco + campos normalizados, ou null
 *  - conv.waitingForAgent    → FlowRun ativo aguardando/em atendimento, ou null
 *  - conv.phoneFlowsBlocked  → true se o telefone está em FlowBlockedPhones
 * Falhas individuais nunca derrubam a resposta (degradação graciosa).
 * @param {Object} conv - linha de Conversations
 * @param {number} empresaId
 * @returns {Promise<Object>} a própria conversa enriquecida
 */
async function enrichConversation(conv, empresaId) {
  if (!conv) return conv;

  conv.cliente = null;
  conv.waitingForAgent = null;
  conv.phoneFlowsBlocked = false;

  const key = last8(conv.contact_wa_id);
  if (!key) return conv;

  // 1. Cliente cadastrado (cli_celular ou cli_celular2)
  try {
    const rows = await dbQuery(
      `SELECT * FROM CLIENTES
       WHERE empresa_id = ?
         AND (RIGHT(REGEXP_REPLACE(COALESCE(cli_celular, ''),  '[^0-9]', ''), 8) = ?
           OR RIGHT(REGEXP_REPLACE(COALESCE(cli_celular2, ''), '[^0-9]', ''), 8) = ?)
       LIMIT 1`,
      [empresaId, key, key]
    );

    if (rows.length > 0) {
      const c = rows[0];
      c.id = c.cli_Id;
      c.nome = c.cli_nome;
      c.email = c.cli_email;
      c.cpf = c.cli_cpf;
      c.personType = c.cli_personType;
      c.genero = c.cli_genero;
      c.contatos = safeJson(c.cli_contatos, []);
      c.tags = safeJson(c.cli_tags, []);

      try {
        c.endereco = await dbQuery(
          'SELECT * FROM ENDERECO WHERE cli_id = ? AND empresa_id = ?',
          [c.cli_Id, empresaId]
        );
      } catch (e) {
        c.endereco = [];
        console.error('[contactService] erro endereco:', e.message);
      }

      conv.cliente = c;
    }
  } catch (e) {
    console.error('[contactService] erro cliente:', e.message);
  }

  // 2. FlowRun aguardando atendente / em atendimento (match por telefone)
  try {
    const runs = await dbQuery(
      `SELECT id, flow_id, phone, status, created_at, agent_status, agent_user_id, agent_started_at
       FROM FlowRuns
       WHERE empresa_id = ?
         AND status = 'running'
         AND waiting_for_response = 1
         AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 8) = ?
       ORDER BY created_at DESC
       LIMIT 1`,
      [empresaId, key]
    );
    if (runs.length > 0) {
      const r = runs[0];
      conv.waitingForAgent = {
        runId: r.id,
        flowId: r.flow_id,
        phone: r.phone,
        status: r.status,
        createdAt: r.created_at,
        agent_status: r.agent_status || 'waiting',
        agent_user_id: r.agent_user_id || null,
        agent_started_at: r.agent_started_at || null,
      };
    }
  } catch (e) {
    console.error('[contactService] erro flowrun:', e.message);
  }

  // 3. Bloqueio de fluxos por telefone (contatos sem cadastro)
  try {
    const blk = await dbQuery(
      `SELECT id FROM FlowBlockedPhones
       WHERE empresa_id = ?
         AND RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 8) = ?
       LIMIT 1`,
      [empresaId, key]
    );
    conv.phoneFlowsBlocked = blk.length > 0;
  } catch (e) {
    console.error('[contactService] erro blockphone:', e.message);
  }

  return conv;
}

/**
 * Enriquece uma LISTA de conversas (uso na lista lateral do chat) com consultas em
 * lote — no máximo 3 queries independente do número de conversas, preservando o
 * desempenho exigido pela aplicação. Anexa por conversa, in-place:
 *  - cliente (mínimo: cli_Id, nome, flows_blocked) — suficiente para o badge e o vínculo
 *  - waitingForAgent (estado de atendimento)
 *  - phoneFlowsBlocked
 * @param {Array<Object>} convs - linhas de Conversations
 * @param {number} empresaId
 * @returns {Promise<void>}
 */
async function enrichConversationsBulk(convs, empresaId) {
  if (!Array.isArray(convs) || convs.length === 0) return;

  const keys = [...new Set(convs.map((c) => last8(c.contact_wa_id)).filter(Boolean))];

  // Inicializa defaults para todas (caso não haja chaves ou queries falhem)
  for (const c of convs) {
    c.cliente = null;
    c.waitingForAgent = null;
    c.phoneFlowsBlocked = false;
  }

  if (keys.length === 0) return;

  const placeholders = keys.map(() => '?').join(',');

  // 1. Clientes (versão mínima) indexados pelos últimos 8 dígitos de cada telefone
  const clienteMap = new Map();
  try {
    const rows = await dbQuery(
      `SELECT cli_Id, cli_nome, flows_blocked,
              RIGHT(REGEXP_REPLACE(COALESCE(cli_celular, ''),  '[^0-9]', ''), 8) AS k1,
              RIGHT(REGEXP_REPLACE(COALESCE(cli_celular2, ''), '[^0-9]', ''), 8) AS k2
       FROM CLIENTES
       WHERE empresa_id = ?
         AND (RIGHT(REGEXP_REPLACE(COALESCE(cli_celular, ''),  '[^0-9]', ''), 8) IN (${placeholders})
           OR RIGHT(REGEXP_REPLACE(COALESCE(cli_celular2, ''), '[^0-9]', ''), 8) IN (${placeholders}))`,
      [empresaId, ...keys, ...keys]
    );
    for (const r of rows) {
      const min = {
        cli_Id: r.cli_Id,
        id: r.cli_Id,
        cli_nome: r.cli_nome,
        nome: r.cli_nome,
        flows_blocked: r.flows_blocked,
      };
      if (r.k1 && !clienteMap.has(r.k1)) clienteMap.set(r.k1, min);
      if (r.k2 && !clienteMap.has(r.k2)) clienteMap.set(r.k2, min);
    }
  } catch (e) {
    console.error('[contactService] bulk cliente:', e.message);
  }

  // 2. FlowRuns aguardando/atendimento (todas da empresa; tipicamente poucas)
  const runMap = new Map();
  try {
    const rows = await dbQuery(
      `SELECT id, flow_id, phone, status, created_at, agent_status, agent_user_id, agent_started_at,
              RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 8) AS k
       FROM FlowRuns
       WHERE empresa_id = ?
         AND status = 'running'
         AND waiting_for_response = 1
       ORDER BY created_at DESC`,
      [empresaId]
    );
    for (const r of rows) {
      if (r.k && !runMap.has(r.k)) {
        runMap.set(r.k, {
          runId: r.id,
          flowId: r.flow_id,
          phone: r.phone,
          status: r.status,
          createdAt: r.created_at,
          agent_status: r.agent_status || 'waiting',
          agent_user_id: r.agent_user_id || null,
          agent_started_at: r.agent_started_at || null,
        });
      }
    }
  } catch (e) {
    console.error('[contactService] bulk flowrun:', e.message);
  }

  // 3. Telefones bloqueados (todas da empresa)
  const blockedSet = new Set();
  try {
    const rows = await dbQuery(
      `SELECT RIGHT(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), 8) AS k
       FROM FlowBlockedPhones
       WHERE empresa_id = ?`,
      [empresaId]
    );
    for (const r of rows) if (r.k) blockedSet.add(r.k);
  } catch (e) {
    console.error('[contactService] bulk block:', e.message);
  }

  for (const c of convs) {
    const k = last8(c.contact_wa_id);
    if (!k) continue;
    c.cliente = clienteMap.get(k) || null;
    c.waitingForAgent = runMap.get(k) || null;
    c.phoneFlowsBlocked = blockedSet.has(k);
  }
}

module.exports = {
  enrichConversation,
  enrichConversationsBulk,
};
