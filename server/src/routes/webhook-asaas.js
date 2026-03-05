/**
 * Webhook do Asaas - Processa eventos de pagamento e assinatura
 * Rota: POST /webhook/asaas
 */

const express = require('express');
const router = express.Router();

const dbQuery = require('../database');
const asaasService = require('../services/asaasService');

/**
 * Middleware para validar token do webhook
 */
const validateWebhook = async (req, res, next) => {
  try {
    const authToken = req.headers['asaas-access-token'];

    if (!authToken) {
      console.warn('Webhook Asaas: Token não fornecido');
      return res.status(401).json({ error: 'Token não fornecido' });
    }

    const isValid = await asaasService.validateWebhookToken(authToken);

    if (!isValid) {
      console.warn('Webhook Asaas: Token inválido');
      return res.status(401).json({ error: 'Token inválido' });
    }

    next();
  } catch (error) {
    console.error('Erro na validação do webhook:', error);
    res.status(500).json({ error: 'Erro interno' });
  }
};

/**
 * POST /webhook/asaas - Recebe eventos do Asaas
 * Eventos processados:
 * - PAYMENT_CREATED: Pagamento criado
 * - PAYMENT_RECEIVED: Pagamento recebido/confirmado
 * - PAYMENT_CONFIRMED: Pagamento confirmado
 * - PAYMENT_OVERDUE: Pagamento vencido
 * - PAYMENT_DELETED: Pagamento excluído
 * - PAYMENT_REFUNDED: Pagamento estornado
 * - SUBSCRIPTION_CREATED: Assinatura criada
 * - SUBSCRIPTION_UPDATED: Assinatura atualizada
 * - SUBSCRIPTION_INACTIVATED: Assinatura inativada
 * - SUBSCRIPTION_DELETED: Assinatura excluída
 */
router.post('/asaas', validateWebhook, async (req, res) => {
  try {
    
    res.status(200).json({ success: true });
    
    const { event, payment, subscription } = req.body;

    console.log(`[Webhook Asaas] Evento recebido: ${event}`);

    switch (event) {
      // ============================================
      // EVENTOS DE PAGAMENTO
      // ============================================
      case 'PAYMENT_CREATED':
        await handlePaymentCreated(payment);
        break;

      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        await handlePaymentReceived(payment);
        break;

      case 'PAYMENT_OVERDUE':
        await handlePaymentOverdue(payment);
        break;

      case 'PAYMENT_DELETED':
      case 'PAYMENT_REFUNDED':
        await handlePaymentDeleted(payment);
        break;

      // ============================================
      // EVENTOS DE ASSINATURA
      // ============================================
      case 'SUBSCRIPTION_CREATED':
        await handleSubscriptionCreated(subscription);
        break;

      case 'SUBSCRIPTION_UPDATED':
        await handleSubscriptionUpdated(subscription);
        break;

      case 'SUBSCRIPTION_INACTIVATED':
      case 'SUBSCRIPTION_DELETED':
        await handleSubscriptionCancelled(subscription);
        break;

      default:
        console.log(`[Webhook Asaas] Evento não tratado: ${event}`);
    }
  } catch (error) {
    console.error('[Webhook Asaas] Erro ao processar evento:', error);
    // Retorna 200 mesmo com erro para evitar reenvio do Asaas
    res.status(200).json({ success: false, error: error.message });
  }
});

// ============================================
// HANDLERS DE PAGAMENTO
// ============================================

/**
 * Processa evento de pagamento criado
 * @param {Object} payment - Dados do pagamento do Asaas
 */
async function handlePaymentCreated(payment) {
  if (!payment || !payment.subscription) {
    console.log('[Webhook] Pagamento sem assinatura vinculada');
    return;
  }

  // Verifica se pertence a CONTRATO_ASSINATURAS
  const contratoAssinatura = await dbQuery(
    'SELECT * FROM CONTRATO_ASSINATURAS WHERE asaas_subscription_id = ?',
    [payment.subscription]
  );

  if (contratoAssinatura.length > 0) {
    // Registra em CONTRATO_PAGAMENTOS
    const ca = contratoAssinatura[0];
    const existente = await dbQuery('SELECT id FROM CONTRATO_PAGAMENTOS WHERE asaas_payment_id = ?', [payment.id]);
    if (existente.length === 0) {
      await dbQuery(`
        INSERT INTO CONTRATO_PAGAMENTOS
        (contrato_id, asaas_payment_id, valor, data_vencimento, status, forma_pagamento, invoice_url, bank_slip_url, descricao, dados_json, empresa_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        ca.contrato_id,
        payment.id,
        payment.value,
        payment.dueDate,
        payment.status,
        payment.billingType,
        payment.invoiceUrl || null,
        payment.bankSlipUrl || null,
        ca.descricao || null,
        JSON.stringify(payment),
        ca.empresa_id
      ]);
    }
    console.log(`[Webhook] Pagamento ${payment.id} registrado para contrato assinatura ${ca.id}`);
    return;
  }

  // Busca a assinatura local pelo ID do Asaas
  const assinatura = await dbQuery(
    'SELECT * FROM Assinaturas WHERE asaas_subscription_id = ?',
    [payment.subscription]
  );

  if (assinatura.length === 0) {
    console.log(`[Webhook] Assinatura não encontrada: ${payment.subscription}`);
    return;
  }

  // Registra o pagamento
  await dbQuery(`
    INSERT INTO Assinatura_Pagamentos
    (assinatura_id, asaas_payment_id, valor, data_vencimento, status, forma_pagamento, dados_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    assinatura[0].id,
    payment.id,
    payment.value,
    payment.dueDate,
    payment.status,
    payment.billingType,
    JSON.stringify(payment)
  ]);

  console.log(`[Webhook] Pagamento ${payment.id} registrado para assinatura ${assinatura[0].id}`);
}

/**
 * Processa evento de pagamento recebido/confirmado
 * @param {Object} payment - Dados do pagamento do Asaas
 */
async function handlePaymentReceived(payment) {
  if (!payment) return;

  // Verifica se pertence a CONTRATO_PAGAMENTOS
  const contratoPagamento = await dbQuery(
    'SELECT * FROM CONTRATO_PAGAMENTOS WHERE asaas_payment_id = ?',
    [payment.id]
  );

  if (contratoPagamento.length > 0) {
    await dbQuery(`
      UPDATE CONTRATO_PAGAMENTOS SET
        status = ?, data_pagamento = ?, forma_pagamento = ?, dados_json = ?
      WHERE asaas_payment_id = ?
    `, [
      payment.status,
      payment.paymentDate || payment.confirmedDate || new Date().toISOString().split('T')[0],
      payment.billingType,
      JSON.stringify(payment),
      payment.id
    ]);
    console.log(`[Webhook] Pagamento de contrato ${payment.id} confirmado`);
    return;
  }

  // Atualiza pagamento existente
  const pagamentoLocal = await dbQuery(
    'SELECT * FROM Assinatura_Pagamentos WHERE asaas_payment_id = ?',
    [payment.id]
  );

  if (pagamentoLocal.length > 0) {
    await dbQuery(`
      UPDATE Assinatura_Pagamentos SET
        status = ?,
        data_pagamento = ?,
        forma_pagamento = ?,
        dados_json = ?
      WHERE asaas_payment_id = ?
    `, [
      payment.status,
      payment.paymentDate || payment.confirmedDate || new Date().toISOString().split('T')[0],
      payment.billingType,
      JSON.stringify(payment),
      payment.id
    ]);

    // Busca a assinatura vinculada
    const assinatura = await dbQuery(
      'SELECT * FROM Assinaturas WHERE id = ?',
      [pagamentoLocal[0].assinatura_id]
    );

    if (assinatura.length > 0) {
      // Ativa a assinatura se estava pendente ou vencida
      if (['pendente', 'vencida', 'trial'].includes(assinatura[0].status)) {
        await dbQuery(`
          UPDATE Assinaturas SET
            status = 'ativa',
            data_proximo_vencimento = DATE_ADD(?, INTERVAL 1 MONTH)
          WHERE id = ?
        `, [payment.dueDate, assinatura[0].id]);

        // Ativa a empresa
        await dbQuery(
          'UPDATE Empresas SET status = "ativa" WHERE id = ?',
          [assinatura[0].empresa_id]
        );

        console.log(`[Webhook] Assinatura ${assinatura[0].id} ativada após pagamento`);
      } else {
        // Apenas atualiza próximo vencimento
        await dbQuery(`
          UPDATE Assinaturas SET
            data_proximo_vencimento = DATE_ADD(?, INTERVAL 1 MONTH)
          WHERE id = ?
        `, [payment.dueDate, assinatura[0].id]);
      }
    }
  } else if (payment.subscription) {
    // Verifica se pertence a CONTRATO_ASSINATURAS
    const contratoAssinatura = await dbQuery(
      'SELECT * FROM CONTRATO_ASSINATURAS WHERE asaas_subscription_id = ?',
      [payment.subscription]
    );

    if (contratoAssinatura.length > 0) {
      // Registra/atualiza em CONTRATO_PAGAMENTOS
      const ca = contratoAssinatura[0];
      const existente = await dbQuery('SELECT id FROM CONTRATO_PAGAMENTOS WHERE asaas_payment_id = ?', [payment.id]);
      if (existente.length > 0) {
        await dbQuery(`
          UPDATE CONTRATO_PAGAMENTOS SET status = ?, data_pagamento = ?, forma_pagamento = ?, dados_json = ?
          WHERE asaas_payment_id = ?
        `, [payment.status, payment.paymentDate || payment.confirmedDate || new Date().toISOString().split('T')[0], payment.billingType, JSON.stringify(payment), payment.id]);
      } else {
        await dbQuery(`
          INSERT INTO CONTRATO_PAGAMENTOS
          (contrato_id, asaas_payment_id, valor, data_vencimento, data_pagamento, status, forma_pagamento, invoice_url, bank_slip_url, descricao, dados_json, empresa_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [ca.contrato_id, payment.id, payment.value, payment.dueDate, payment.paymentDate || null, payment.status, payment.billingType, payment.invoiceUrl || null, payment.bankSlipUrl || null, ca.descricao || null, JSON.stringify(payment), ca.empresa_id]);
      }
      console.log(`[Webhook] Pagamento contrato assinatura ${payment.id} confirmado`);
      return;
    }

    // Pagamento não existe localmente, tenta criar
    await handlePaymentCreated(payment);

    // Processa novamente como recebido
    await handlePaymentReceived(payment);
  }

  console.log(`[Webhook] Pagamento ${payment.id} confirmado`);
}

/**
 * Processa evento de pagamento vencido
 * @param {Object} payment - Dados do pagamento do Asaas
 */
async function handlePaymentOverdue(payment) {
  if (!payment) return;

  // Verifica se pertence a CONTRATO_PAGAMENTOS
  const contratoPagamento = await dbQuery(
    'SELECT * FROM CONTRATO_PAGAMENTOS WHERE asaas_payment_id = ?',
    [payment.id]
  );

  if (contratoPagamento.length > 0) {
    await dbQuery(
      'UPDATE CONTRATO_PAGAMENTOS SET status = ?, dados_json = ? WHERE asaas_payment_id = ?',
      [payment.status, JSON.stringify(payment), payment.id]
    );
    console.log(`[Webhook] Pagamento de contrato ${payment.id} vencido`);
    return;
  }

  // Verifica se pertence a CONTRATO_ASSINATURAS via subscription
  if (payment.subscription) {
    const contratoAssinatura = await dbQuery(
      'SELECT * FROM CONTRATO_ASSINATURAS WHERE asaas_subscription_id = ?',
      [payment.subscription]
    );
    if (contratoAssinatura.length > 0) {
      const ca = contratoAssinatura[0];
      const existente = await dbQuery('SELECT id FROM CONTRATO_PAGAMENTOS WHERE asaas_payment_id = ?', [payment.id]);
      if (existente.length > 0) {
        await dbQuery('UPDATE CONTRATO_PAGAMENTOS SET status = ?, dados_json = ? WHERE asaas_payment_id = ?',
          [payment.status, JSON.stringify(payment), payment.id]);
      } else {
        await dbQuery(`INSERT INTO CONTRATO_PAGAMENTOS (contrato_id, asaas_payment_id, valor, data_vencimento, status, forma_pagamento, invoice_url, bank_slip_url, dados_json, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [ca.contrato_id, payment.id, payment.value, payment.dueDate, payment.status, payment.billingType, payment.invoiceUrl || null, payment.bankSlipUrl || null, JSON.stringify(payment), ca.empresa_id]);
      }
      console.log(`[Webhook] Pagamento contrato assinatura ${payment.id} vencido`);
      return;
    }
  }

  // Atualiza status do pagamento
  await dbQuery(
    'UPDATE Assinatura_Pagamentos SET status = ?, dados_json = ? WHERE asaas_payment_id = ?',
    [payment.status, JSON.stringify(payment), payment.id]
  );

  // Busca pagamento local
  const pagamentoLocal = await dbQuery(
    'SELECT * FROM Assinatura_Pagamentos WHERE asaas_payment_id = ?',
    [payment.id]
  );

  if (pagamentoLocal.length > 0) {
    // Verifica se tem outros pagamentos pendentes mais recentes
    const outrosPagamentos = await dbQuery(`
      SELECT * FROM Assinatura_Pagamentos
      WHERE assinatura_id = ? AND status IN ('PENDING', 'CONFIRMED', 'RECEIVED')
      AND id != ?
    `, [pagamentoLocal[0].assinatura_id, pagamentoLocal[0].id]);

    // Se não tem outros pagamentos ativos, marca assinatura como vencida
    if (outrosPagamentos.length === 0) {
      await dbQuery(
        'UPDATE Assinaturas SET status = "vencida" WHERE id = ?',
        [pagamentoLocal[0].assinatura_id]
      );

      // Busca assinatura para obter empresa_id
      const assinatura = await dbQuery(
        'SELECT empresa_id FROM Assinaturas WHERE id = ?',
        [pagamentoLocal[0].assinatura_id]
      );

      if (assinatura.length > 0) {
        await dbQuery(
          'UPDATE Empresas SET status = "suspensa" WHERE id = ?',
          [assinatura[0].empresa_id]
        );
      }

      console.log(`[Webhook] Assinatura marcada como vencida`);
    }
  }

  console.log(`[Webhook] Pagamento ${payment.id} vencido`);
}

/**
 * Processa evento de pagamento excluído/estornado
 * @param {Object} payment - Dados do pagamento do Asaas
 */
async function handlePaymentDeleted(payment) {
  if (!payment) return;

  // Verifica se pertence a CONTRATO_PAGAMENTOS
  const contratoPagamento = await dbQuery(
    'SELECT * FROM CONTRATO_PAGAMENTOS WHERE asaas_payment_id = ?',
    [payment.id]
  );

  if (contratoPagamento.length > 0) {
    await dbQuery(
      'UPDATE CONTRATO_PAGAMENTOS SET status = ?, dados_json = ? WHERE asaas_payment_id = ?',
      [payment.status, JSON.stringify(payment), payment.id]
    );
    console.log(`[Webhook] Pagamento de contrato ${payment.id} excluído/estornado`);
    return;
  }

  await dbQuery(
    'UPDATE Assinatura_Pagamentos SET status = ?, dados_json = ? WHERE asaas_payment_id = ?',
    [payment.status, JSON.stringify(payment), payment.id]
  );

  console.log(`[Webhook] Pagamento ${payment.id} excluído/estornado`);
}

// ============================================
// HANDLERS DE ASSINATURA
// ============================================

/**
 * Processa evento de assinatura criada
 * @param {Object} subscription - Dados da assinatura do Asaas
 */
async function handleSubscriptionCreated(subscription) {
  if (!subscription) return;

  // Verifica se pertence a CONTRATO_ASSINATURAS
  const contratoAssinatura = await dbQuery(
    'SELECT * FROM CONTRATO_ASSINATURAS WHERE asaas_subscription_id = ?',
    [subscription.id]
  );

  if (contratoAssinatura.length > 0) {
    const statusMap = { 'ACTIVE': 'ACTIVE', 'INACTIVE': 'INACTIVE', 'EXPIRED': 'EXPIRED' };
    const status = statusMap[subscription.status] || contratoAssinatura[0].status;
    await dbQuery(
      'UPDATE CONTRATO_ASSINATURAS SET status = ?, dados_json = ? WHERE id = ?',
      [status, JSON.stringify(subscription), contratoAssinatura[0].id]
    );
    console.log(`[Webhook] Contrato assinatura ${subscription.id} criada/atualizada`);
    return;
  }

  // Verifica se a assinatura já existe localmente
  const assinaturaExistente = await dbQuery(
    'SELECT * FROM Assinaturas WHERE asaas_subscription_id = ?',
    [subscription.id]
  );

  if (assinaturaExistente.length > 0) {
    // Assinatura já existe (criada no cadastro) - ativar empresa se trial
    const assinatura = assinaturaExistente[0];

    if (assinatura.status === 'trial') {
      // Trial com cartão validado: ativa a empresa mas mantém assinatura como trial
      await dbQuery('UPDATE Empresas SET status = "ativa" WHERE id = ?', [assinatura.empresa_id]);
      console.log(`[Webhook] Empresa ${assinatura.empresa_id} ativada (trial com cartão validado)`);
    } else if (assinatura.status === 'pendente') {
      // Assinatura pendente criada no checkout: ativa empresa e assinatura
      await dbQuery('UPDATE Assinaturas SET status = "ativa" WHERE id = ?', [assinatura.id]);
      await dbQuery('UPDATE Empresas SET status = "ativa" WHERE id = ?', [assinatura.empresa_id]);
      console.log(`[Webhook] Empresa ${assinatura.empresa_id} e assinatura ${assinatura.id} ativadas`);
    }

    console.log(`[Webhook] Assinatura ${subscription.id} já existe localmente - processada`);
    return;
  }

  // Assinatura não existe localmente - criar (webhook externo)
  const empresa = await dbQuery(
    'SELECT * FROM Empresas WHERE asaas_customer_id = ?',
    [subscription.customer]
  );

  if (empresa.length === 0) {
    console.log(`[Webhook] Empresa não encontrada para customer: ${subscription.customer}`);
    return;
  }

  // Busca plano pela referência externa (se configurado)
  let planoId = null;
  if (subscription.externalReference) {
    const plano = await dbQuery('SELECT id FROM Planos WHERE id = ?', [subscription.externalReference]);
    if (plano.length > 0) {
      planoId = plano[0].id;
    }
  }

  // Se não encontrou plano, usa o primeiro ativo
  if (!planoId) {
    const planoDefault = await dbQuery('SELECT id FROM Planos WHERE ativo = 1 ORDER BY ordem LIMIT 1');
    if (planoDefault.length > 0) {
      planoId = planoDefault[0].id;
    }
  }

  if (!planoId) {
    console.log('[Webhook] Nenhum plano encontrado');
    return;
  }

  // Cria a assinatura localmente
  await dbQuery(`
    INSERT INTO Assinaturas
    (empresa_id, plano_id, asaas_subscription_id, asaas_customer_id, status, valor, ciclo, data_inicio)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    empresa[0].id,
    planoId,
    subscription.id,
    subscription.customer,
    subscription.status === 'ACTIVE' ? 'ativa' : 'pendente',
    subscription.value,
    subscription.cycle,
    subscription.dateCreated
  ]);

  // Ativa a empresa quando a subscription é criada (cartão validado)
  await dbQuery('UPDATE Empresas SET status = "ativa" WHERE id = ?', [empresa[0].id]);

  console.log(`[Webhook] Assinatura ${subscription.id} criada localmente e empresa ativada`);
}

/**
 * Processa evento de assinatura atualizada
 * @param {Object} subscription - Dados da assinatura do Asaas
 */
async function handleSubscriptionUpdated(subscription) {
  if (!subscription) return;

  // Verifica se pertence a CONTRATO_ASSINATURAS
  const contratoAssinatura = await dbQuery(
    'SELECT * FROM CONTRATO_ASSINATURAS WHERE asaas_subscription_id = ?',
    [subscription.id]
  );

  if (contratoAssinatura.length > 0) {
    await dbQuery(
      'UPDATE CONTRATO_ASSINATURAS SET status = ?, valor = ?, ciclo = ?, dados_json = ? WHERE id = ?',
      [subscription.status, subscription.value, subscription.cycle, JSON.stringify(subscription), contratoAssinatura[0].id]
    );
    console.log(`[Webhook] Contrato assinatura ${subscription.id} atualizada`);
    return;
  }

  const statusMap = {
    'ACTIVE': 'ativa',
    'INACTIVE': 'suspensa',
    'EXPIRED': 'vencida'
  };

  const status = statusMap[subscription.status] || 'pendente';

  await dbQuery(`
    UPDATE Assinaturas SET
      status = ?,
      valor = ?,
      ciclo = ?
    WHERE asaas_subscription_id = ?
  `, [status, subscription.value, subscription.cycle, subscription.id]);

  // Atualiza status da empresa
  const assinatura = await dbQuery(
    'SELECT empresa_id FROM Assinaturas WHERE asaas_subscription_id = ?',
    [subscription.id]
  );

  if (assinatura.length > 0) {
    const statusEmpresa = status === 'ativa' ? 'ativa' : status === 'suspensa' ? 'suspensa' : 'pendente';
    await dbQuery('UPDATE Empresas SET status = ? WHERE id = ?', [statusEmpresa, assinatura[0].empresa_id]);
  }

  console.log(`[Webhook] Assinatura ${subscription.id} atualizada`);
}

/**
 * Processa evento de assinatura cancelada/inativada
 * @param {Object} subscription - Dados da assinatura do Asaas
 */
async function handleSubscriptionCancelled(subscription) {
  if (!subscription) return;

  // Verifica se pertence a CONTRATO_ASSINATURAS
  const contratoAssinatura = await dbQuery(
    'SELECT * FROM CONTRATO_ASSINATURAS WHERE asaas_subscription_id = ?',
    [subscription.id]
  );

  if (contratoAssinatura.length > 0) {
    await dbQuery(
      'UPDATE CONTRATO_ASSINATURAS SET status = ?, dados_json = ? WHERE id = ?',
      ['CANCELLED', JSON.stringify(subscription), contratoAssinatura[0].id]
    );
    console.log(`[Webhook] Contrato assinatura ${subscription.id} cancelada`);
    return;
  }

  await dbQuery(`
    UPDATE Assinaturas SET
      status = 'cancelada',
      data_cancelamento = NOW(),
      motivo_cancelamento = 'Cancelado via Asaas'
    WHERE asaas_subscription_id = ?
  `, [subscription.id]);

  // Busca assinatura para obter empresa_id
  const assinatura = await dbQuery(
    'SELECT empresa_id FROM Assinaturas WHERE asaas_subscription_id = ?',
    [subscription.id]
  );

  if (assinatura.length > 0) {
    await dbQuery('UPDATE Empresas SET status = "inativa" WHERE id = ?', [assinatura[0].empresa_id]);
  }

  console.log(`[Webhook] Assinatura ${subscription.id} cancelada`);
}

module.exports = router;
