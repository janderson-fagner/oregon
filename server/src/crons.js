const cron = require('node-cron');
const { emitToEmpresa } = require('./socket');
const moment = require('moment-timezone');

const { sendMailAndNotificationUserBase } = require('./utils/notifications');
const dbQuery = require('./utils/dbHelper');
const { checkScheduledFlows, checkTimeouts, checkWaitTimeouts } = require('./flows/core/flowEngine');
const { sendZapMessage } = require('./zap/message');
const { getAllClients } = require('./zap/client');

/**
 * Calcula a próxima data de disparo com base no tipo de repetição.
 * @param {string} repeatType - Tipo de repetição (day, week, month, etc.)
 * @param {Date|string} currentDate - Data base para o cálculo
 * @returns {string} - Data formatada YYYY-MM-DD HH:mm:ss
 */
const calcNextRun = (repeatType, currentDate) => {
  const base = moment(currentDate);
  const increments = {
    'day': [1, 'days'],
    'week': [7, 'days'],
    'month': [1, 'months'],
    'bi-month': [2, 'months'],
    'tri-month': [3, 'months'],
    'quadri-month': [4, 'months'],
    'semester': [6, 'months'],
    'year': [1, 'years']
  };

  const inc = increments[repeatType];
  if (!inc) return null;

  return base.add(inc[0], inc[1]).format('YYYY-MM-DD HH:mm:ss');
};

// Função para converter data para o fuso horário de Brasília
const convertToBrasiliaTime = (date) => {
  return moment.tz(date, 'America/Sao_Paulo');
};

/**
 * Resolve os destinatários de um lembrete.
 * Se destinatarios_usuarios ou destinatarios_funcoes estão definidos, busca os usuários correspondentes.
 * Caso contrário, faz fallback para admin e gerente (comportamento legado).
 * Retorna array de usuários deduplificados com pelo menos id e email.
 */
const resolveDestinatarios = async (lembrete) => {
  const temUsuarios = lembrete.destinatarios_usuarios && lembrete.destinatarios_usuarios.length > 0;
  const temFuncoes = lembrete.destinatarios_funcoes && lembrete.destinatarios_funcoes.length > 0;

  // Parse JSON se necessário
  let userIds = temUsuarios
    ? (typeof lembrete.destinatarios_usuarios === 'string' ? JSON.parse(lembrete.destinatarios_usuarios) : lembrete.destinatarios_usuarios)
    : [];
  let funcoes = temFuncoes
    ? (typeof lembrete.destinatarios_funcoes === 'string' ? JSON.parse(lembrete.destinatarios_funcoes) : lembrete.destinatarios_funcoes)
    : [];

  // Fallback legado: admin e gerente
  if (!temUsuarios && !temFuncoes) {
    return await dbQuery('SELECT * FROM User WHERE (role = "admin" OR role = "gerente") AND ativo = 1 AND empresa_id = ?', [lembrete.empresa_id]);
  }

  const usersMap = new Map();

  // Buscar por IDs de usuários
  if (userIds.length > 0) {
    const placeholders = userIds.map(() => '?').join(',');
    const byId = await dbQuery(`SELECT * FROM User WHERE id IN (${placeholders}) AND ativo = 1 AND empresa_id = ?`, [...userIds, lembrete.empresa_id]);
    for (const u of byId) usersMap.set(u.id, u);
  }

  // Buscar por funções/roles
  if (funcoes.length > 0) {
    const placeholders = funcoes.map(() => '?').join(',');
    const byRole = await dbQuery(`SELECT * FROM User WHERE role IN (${placeholders}) AND ativo = 1 AND empresa_id = ?`, [...funcoes, lembrete.empresa_id]);
    for (const u of byRole) usersMap.set(u.id, u);
  }

  return Array.from(usersMap.values());
};

/**
 * Envia notificação via WhatsApp para os usuários que possuem telefone cadastrado.
 * Busca o primeiro client conectado da empresa para enviar.
 */
const sendWhatsAppToUsers = async (users, lembrete) => {
  try {
    // Buscar um client conectado da empresa
    const empresaClients = await getAllClients(lembrete.empresa_id);
    const connectedClient = empresaClients.find(c => c.status === 'connected');

    if (!connectedClient) {
      console.log('[Lembrete WhatsApp] Nenhum client WhatsApp conectado para empresa', lembrete.empresa_id);
      return;
    }

    const mensagem = `*Lembrete: ${lembrete.title}*\n\n${lembrete.subtitle}`;

    for (const user of users) {
      if (user.phone) {
        try {
          console.log(`[Lembrete WhatsApp] Enviando para ${user.fullName} (${user.phone})`);
          // TODO [ASSUMPTION-AUTOPILOT]: fluxo/disparo via wwebjs desativado — pendente migração Cloud API
          await sendZapMessage(connectedClient.id, user.phone, mensagem);
        } catch (err) {
          console.error(`[Lembrete WhatsApp] Erro ao enviar para ${user.phone}:`, err.message);
        }
      }
    }
  } catch (error) {
    console.error('[Lembrete WhatsApp] Erro geral:', error.message);
  }
};

/**
 * Processa lembretes pendentes a cada minuto.
 * Consulta o banco por lembretes com next_run_at <= NOW() e não concluídos.
 * Dados sempre frescos do banco - sem closures stale.
 */
const processLembretes = async () => {
  try {
    const lembretes = await dbQuery(
      'SELECT * FROM Lembretes WHERE concluido = 0 AND next_run_at IS NOT NULL AND next_run_at <= NOW()'
    );

    if (lembretes.length === 0) return;

    console.log(`[Lembretes] Processando ${lembretes.length} lembrete(s)...`);

    for (const lembrete of lembretes) {
      try {
        // Buscar destinatários (dados frescos do banco)
        const sendUsers = await resolveDestinatarios(lembrete);
        const emailsSend = await dbQuery('SELECT * FROM Options WHERE type = "email_notify" AND empresa_id = ?', [lembrete.empresa_id]);

        const dataNoti = {
          notificationTitle: lembrete.title,
          notificationSubtitle: lembrete.subtitle,
          mailTitle: 'Lembrete: ' + lembrete.title,
          params: lembrete.params,
          message: lembrete.subtitle,
          linkAction: lembrete.params ? lembrete.params : 'https://daviot.com.br/',
          textAction: 'Ver Lembrete'
        };

        // Enviar notificação in-app + email para cada destinatário
        for (const user of sendUsers) {
          console.log('[Lembretes] Enviando notificação para:', user.email);
          await sendMailAndNotificationUserBase(true, true, user.email, dataNoti, lembrete.empresa_id);
        }

        // Enviar emails extras configurados
        if (lembrete.notify_email == 1) {
          for (const email of emailsSend) {
            await sendMailAndNotificationUserBase(true, false, email.value, dataNoti, lembrete.empresa_id);
          }
        }

        // Enviar WhatsApp
        if (lembrete.notify_zap == 1) {
          await sendWhatsAppToUsers(sendUsers, lembrete);
        }

        // Notificação via WebSocket (isolada por empresa)
        emitToEmpresa(lembrete.empresa_id, 'newNotification', lembrete);

        // Atualizar estado do lembrete
        if (lembrete.repeat_type === 'none') {
          // Lembrete único: concluir
          await dbQuery(
            'UPDATE Lembretes SET concluido = 1, repeat_success = 1, next_run_at = NULL WHERE id = ? AND empresa_id = ?',
            [lembrete.id, lembrete.empresa_id]
          );
          console.log('[Lembretes] Lembrete único concluído:', lembrete.title);
        } else {
          // Repetitivo: re-ler repeat_success do banco para evitar race condition
          const [fresh] = await dbQuery('SELECT repeat_success FROM Lembretes WHERE id = ? AND empresa_id = ?', [lembrete.id, lembrete.empresa_id]);
          const newSuccess = (fresh.repeat_success || 0) + 1;

          if (lembrete.repeat_times > 0 && newSuccess >= lembrete.repeat_times) {
            // Atingiu limite de repetições: concluir
            await dbQuery(
              'UPDATE Lembretes SET concluido = 1, repeat_success = ?, next_run_at = NULL WHERE id = ? AND empresa_id = ?',
              [newSuccess, lembrete.id, lembrete.empresa_id]
            );
            console.log('[Lembretes] Lembrete repetitivo concluído (limite atingido):', lembrete.title);
          } else {
            // Agendar próxima execução
            const nextRun = calcNextRun(lembrete.repeat_type, lembrete.next_run_at);
            await dbQuery(
              'UPDATE Lembretes SET repeat_success = ?, next_run_at = ? WHERE id = ? AND empresa_id = ?',
              [newSuccess, nextRun, lembrete.id, lembrete.empresa_id]
            );
            console.log('[Lembretes] Próximo disparo de', lembrete.title, 'em', nextRun);
          }
        }
      } catch (error) {
        console.error('[Lembretes] Erro ao processar lembrete:', lembrete.id, lembrete.title, error);
      }
    }
  } catch (error) {
    console.error('[Lembretes] Erro geral ao processar lembretes:', error);
  }
};

// Compatibilidade: exportar setupCronJobs como no-op
const setupCronJobs = () => {
  console.log('[Lembretes] setupCronJobs é no-op. Lembretes são processados pelo cron único.');
};


/**
 * Cron diário de verificação de assinaturas em atraso.
 * Busca todas as assinaturas ativas/trial com integração Asaas,
 * verifica se possuem faturas OVERDUE e cancela imediatamente.
 */
const checkAssinaturasOverdue = async () => {
  console.log('[SaaS Cron] Iniciando verificação de assinaturas em atraso...');

  try {
    const asaasService = require('./services/asaasService');

    // Buscar assinaturas ativas/trial que tenham integração com Asaas
    const assinaturas = await dbQuery(`
      SELECT a.*, e.nome as empresa_nome
      FROM Assinaturas a
      LEFT JOIN Empresas e ON a.empresa_id = e.id
      WHERE a.status IN ('ativa', 'trial', 'pendente')
        AND a.asaas_subscription_id IS NOT NULL
    `);

    if (assinaturas.length === 0) {
      console.log('[SaaS Cron] Nenhuma assinatura ativa com Asaas encontrada.');
      return;
    }

    console.log(`[SaaS Cron] Verificando ${assinaturas.length} assinatura(s)...`);

    let canceladas = 0;

    for (const assinatura of assinaturas) {
      try {
        // Buscar pagamentos da assinatura no Asaas
        const pagamentosRes = await asaasService.getSubscriptionPayments(assinatura.asaas_subscription_id);
        const pagamentos = pagamentosRes?.data || [];

        // Verificar se existe alguma fatura OVERDUE com 3+ dias de atraso
        const hoje = new Date();
        const temOverdue3Dias = pagamentos.some(p => {
          if (p.status !== 'OVERDUE' || !p.dueDate) return false;
          const vencimento = new Date(p.dueDate);
          const diffMs = hoje.getTime() - vencimento.getTime();
          const diffDias = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          return diffDias >= 3;
        });

        if (temOverdue3Dias) {
          console.log(`[SaaS Cron] Assinatura #${assinatura.id} (${assinatura.empresa_nome}) possui fatura OVERDUE com 3+ dias de atraso. Cancelando...`);

          // Cancelar no Asaas
          try {
            await asaasService.cancelSubscription(assinatura.asaas_subscription_id);
            console.log(`[SaaS Cron] Assinatura cancelada no Asaas: ${assinatura.asaas_subscription_id}`);
          } catch (asaasError) {
            console.error(`[SaaS Cron] Erro ao cancelar assinatura ${assinatura.id} no Asaas:`, asaasError.message);
          }

          // Cancelar no banco local
          await dbQuery(`
            UPDATE Assinaturas SET
              status = 'cancelada',
              data_cancelamento = NOW(),
              motivo_cancelamento = 'Cancelamento automático por fatura em atraso (OVERDUE)'
            WHERE id = ?
          `, [assinatura.id]);

          // Inativar a empresa
          await dbQuery('UPDATE Empresas SET status = "inativa" WHERE id = ?', [assinatura.empresa_id]);

          canceladas++;
          console.log(`[SaaS Cron] Assinatura #${assinatura.id} cancelada e empresa #${assinatura.empresa_id} inativada.`);
        }
      } catch (error) {
        console.error(`[SaaS Cron] Erro ao verificar assinatura #${assinatura.id}:`, error.message);
      }
    }

    console.log(`[SaaS Cron] Verificação concluída. ${canceladas} assinatura(s) cancelada(s) por atraso.`);
  } catch (error) {
    console.error('[SaaS Cron] Erro geral na verificação de assinaturas:', error);
  }
};

const initCronJobs = () => {
  console.log('Iniciando cron jobs');

  if(process.env.NODE_ENV === 'dev'){
    return;
  }

  // Cron único para processar lembretes a cada minuto
  cron.schedule('* * * * *', processLembretes);

  //Cron para a cada 1 hora verificar se o usuário está ativo
  cron.schedule('0 * * * *', async () => {
    console.log('Iniciando check de usuários');
    const users = await dbQuery('SELECT * FROM User');

    for (let user of users) {
      let dataAgora = moment().tz('America/Sao_Paulo');

      if (dataAgora.isAfter(user.expIni) && dataAgora.isBefore(user.expFim) && user.ativo == 0) {
        await dbQuery('UPDATE User SET ativo = 0 WHERE id = ? AND empresa_id = ?', [user.id, user.empresa_id]);
      } else if (dataAgora.isAfter(user.expFim)) {
        await dbQuery('UPDATE User SET ativo = 0 WHERE id = ? AND empresa_id = ?', [user.id, user.empresa_id]);
      }
    }
  });

  //Cron para verificar fluxos agendados
  cron.schedule('* * * * *', async () => {
    console.log('Iniciando check de fluxos agendados');
    await checkScheduledFlows();
    await checkTimeouts();
    await checkWaitTimeouts();
  });

  //Cron para processar ações agendadas pela IA
  cron.schedule('* * * * *', async () => {
    console.log('Verificando ações agendadas pela IA...');
    try {
      // Buscar ações prontas para executar
      const acoesAgendadas = await dbQuery(`
        SELECT * FROM FlowScheduledActions 
        WHERE executado = FALSE 
        AND executarEm <= NOW()
        ORDER BY executarEm ASC
        LIMIT 50
      `);

      if (acoesAgendadas.length === 0) {
        return;
      }

      console.log(`📋 ${acoesAgendadas.length} ação(ões) agendada(s) pronta(s) para executar`);

      for (const acao of acoesAgendadas) {
        try {
          console.log(`⚙️ Executando ação: ${acao.acao} para cliente ${acao.clientId}`);

          const parametros = typeof acao.parametros === 'string' ? JSON.parse(acao.parametros) : acao.parametros;

          // Montar contexto básico
          const context = {
            clientId: acao.clientId,
            phone: acao.phone,
            runId: acao.flowRunId
          };

          // Executar ação conforme o tipo
          switch (acao.acao) {
            case 'enviar_mensagem':
            case 'followup':
            case 'lembrete': {
              // Todos esses tipos enviam a mensagem armazenada nos parâmetros
              const { sendWhatsAppMessage } = require('./flows/actions/messageActions');
              await sendWhatsAppMessage({
                message: parametros.mensagem || parametros.message
              }, context);
              console.log(`✅ ${acao.acao}: Mensagem enviada para ${acao.phone}`);
              break;
            }

            case 'verificar_resposta': {
              // Verifica se o cliente respondeu desde o agendamento da ação
              // Usa wwebjs (getChatMessages) pois não há tabela de mensagens no banco
              let clienteRespondeu = false;
              try {
                const { getChatMessages } = require('./zap/chats');
                const chatId = `${acao.phone}@c.us`;
                const mensagens = await getChatMessages(acao.clientId, chatId, 10);
                const momentoAcao = moment(acao.created_at);

                // Verificar se alguma mensagem do cliente (from_me = 0) é posterior à criação da ação
                clienteRespondeu = mensagens.some(msg => {
                  if (msg.from_me) return false;
                  const msgTime = msg.timestamp ? moment(msg.timestamp, ['DD/MM/YYYY HH:mm:ss', 'YYYY-MM-DD HH:mm:ss']) : null;
                  return msgTime && msgTime.isAfter(momentoAcao);
                });
              } catch (err) {
                console.error(`⚠️ verificar_resposta: Erro ao buscar mensagens via wwebjs: ${err.message}`);
                // Em caso de erro (cliente desconectado etc), não enviar follow-up
                clienteRespondeu = true;
              }

              if (!clienteRespondeu) {
                const { sendWhatsAppMessage: sendMsg } = require('./flows/actions/messageActions');
                await sendMsg({
                  message: parametros.mensagem || 'Olá! Notamos que você não respondeu. Posso ajudar em algo?'
                }, context);
                console.log(`✅ verificar_resposta: Cliente não respondeu, mensagem enviada para ${acao.phone}`);
              } else {
                console.log(`ℹ️ verificar_resposta: Cliente já respondeu, ação ignorada para ${acao.phone}`);
              }
              break;
            }

            case 'atualizar_cliente':
              const { updateCliente } = require('./flows/actions/clienteActions');
              await updateCliente(parametros, context);
              console.log(`✅ Cliente ${acao.clientId} atualizado`);
              break;

            case 'criar_negocio':
              const { createNegocio } = require('./flows/actions/negocioActions');
              await createNegocio(parametros, context);
              console.log(`✅ Negócio criado para cliente ${acao.clientId}`);
              break;

            case 'reativar_fluxo':
              // Verificar se é para retomar fluxo pausado ou iniciar novo
              if (acao.flowRunId && parametros.resumeFrom === 'current') {
                // Retomar fluxo pausado
                const { advance } = require('./flows/core/flowEngine');

                // Atualizar status do fluxo para running
                await dbQuery(
                  'UPDATE FlowRuns SET status = ?, next_run_at = NULL WHERE id = ? AND empresa_id = ?',
                  ['running', acao.flowRunId, acao.empresa_id]
                );

                // Continuar execução
                await advance(acao.flowRunId);
                console.log(`✅ Fluxo ${acao.flowRunId} retomado`);
              } else {
                // Iniciar novo fluxo
                const { startFlow } = require('./flows/core/flowEngine');
                await startFlow({
                  flowId: parametros.flowId,
                  phone: acao.phone,
                  clientId: acao.clientId
                });
                console.log(`✅ Fluxo ${parametros.flowId} iniciado`);
              }
              break;

            default:
              console.log(`⚠️ Tipo de ação desconhecido: ${acao.acao}`);
          }

          // Marcar como executado
          await dbQuery('UPDATE FlowScheduledActions SET executado = TRUE WHERE id = ? AND empresa_id = ?', [acao.id, acao.empresa_id]);

        } catch (error) {
          console.error(`❌ Erro ao executar ação ${acao.id}:`, error);
          // Não marcar como executado para tentar novamente
        }
      }
    } catch (error) {
      console.error('❌ Erro ao processar ações agendadas:', error);
    }
  });

  // Cron diário: verificar assinaturas com faturas em atraso (todo dia às 06:00 horário de Brasília)
  cron.schedule('0 6 * * *', async () => {
    await checkAssinaturasOverdue();
  }, { timezone: 'America/Sao_Paulo' });
};

module.exports = { initCronJobs, setupCronJobs };
