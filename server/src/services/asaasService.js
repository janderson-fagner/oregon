/**
 * Serviço de integração com a API do Asaas
 * Responsável por todas as operações de comunicação com o gateway de pagamento
 */

const dbQuery = require('../database');

/**
 * Busca as configurações do Asaas na tabela AdminOptions (global do sistema)
 * @returns {Object} Configurações do Asaas (api_key, api_url, webhook_token)
 */
async function getAsaasConfig() {
  try {
    const configs = await dbQuery(`
      SELECT type, value FROM AdminOptions
      WHERE type IN ('asaas_api_key', 'asaas_api_url', 'asaas_webhook_token')
    `);

    const configObj = {};
    configs.forEach(config => {
      configObj[config.type] = config.value;
    });

    return {
      apiKey: configObj.asaas_api_key || null,
      apiUrl: configObj.asaas_api_url || 'https://api.asaas.com',
      webhookToken: configObj.asaas_webhook_token || null
    };
  } catch (error) {
    console.error('Erro ao buscar configurações do Asaas:', error);
    throw error;
  }
}

/**
 * Salva ou atualiza uma configuração do Asaas
 * @param {string} type - Tipo da configuração (asaas_api_key, asaas_api_url, asaas_webhook_token)
 * @param {string} value - Valor da configuração
 */
async function saveAsaasConfig(type, value) {
  try {
    const existing = await dbQuery('SELECT id_option FROM AdminOptions WHERE type = ?', [type]);

    if (existing.length > 0) {
      await dbQuery('UPDATE AdminOptions SET value = ? WHERE type = ?', [value, type]);
    } else {
      await dbQuery('INSERT INTO AdminOptions (type, value) VALUES (?, ?)', [type, value]);
    }

    return true;
  } catch (error) {
    console.error('Erro ao salvar configuração do Asaas:', error);
    throw error;
  }
}

/**
 * Faz uma requisição para a API do Asaas
 * @param {string} endpoint - Endpoint da API (ex: /v3/customers)
 * @param {string} method - Método HTTP (GET, POST, PUT, DELETE)
 * @param {Object} body - Corpo da requisição (para POST/PUT)
 * @returns {Object} Resposta da API
 */
async function asaasRequest(endpoint, method = 'GET', body = null) {
  const config = await getAsaasConfig();

  if (!config.apiKey) {
    throw new Error('API Key do Asaas não configurada');
  }

  const url = `${config.apiUrl}${endpoint}`;

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'access_token': config.apiKey
    }
  };

  if (body && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      console.error('Erro na API Asaas:', data);
      throw new Error(data.errors?.[0]?.description || 'Erro na API do Asaas');
    }

    return data;
  } catch (error) {
    console.error('Erro ao fazer requisição para Asaas:', error);
    throw error;
  }
}

/**
 * Testa a conexão com a API do Asaas
 * @returns {Object} Dados da conta se a conexão for bem-sucedida
 */
async function testConnection() {
  try {
    const result = await asaasRequest('/v3/myAccount/accountNumber');
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Cria um cliente no Asaas a partir dos dados da empresa
 * @param {Object} empresa - Dados da empresa
 * @returns {Object} Dados do cliente criado no Asaas
 */
async function createCustomer(empresa) {
  const customerData = {
    name: empresa.nome,
    cpfCnpj: empresa.documento || empresa.cnpj || empresa.cpf,
    email: empresa.email,
    phone: empresa.telefone || null,
    address: empresa.endereco || null,
    addressNumber: empresa.numero || null,
    complement: empresa.complemento || null,
    province: empresa.bairro || null,
    postalCode: empresa.cep || null,
    externalReference: String(empresa.id),
    notificationDisabled: false
  };

  // Remove campos nulos
  Object.keys(customerData).forEach(key => {
    if (customerData[key] === null || customerData[key] === '') {
      delete customerData[key];
    }
  });

  const result = await asaasRequest('/v3/customers', 'POST', customerData);

  // Atualiza a empresa com o ID do cliente no Asaas (se já existir no banco)
  if (empresa.id) {
    await dbQuery(
      'UPDATE Empresas SET asaas_customer_id = ? WHERE id = ?',
      [result.id, empresa.id]
    );
  }

  return result;
}

/**
 * Busca um cliente no Asaas pelo ID
 * @param {string} customerId - ID do cliente no Asaas
 * @returns {Object} Dados do cliente
 */
async function getCustomer(customerId) {
  return await asaasRequest(`/v3/customers/${customerId}`);
}

/**
 * Atualiza um cliente no Asaas
 * @param {string} customerId - ID do cliente no Asaas
 * @param {Object} empresa - Dados atualizados da empresa
 * @returns {Object} Dados do cliente atualizado
 */
async function updateCustomer(customerId, empresa) {
  const customerData = {
    name: empresa.nome,
    cpfCnpj: empresa.documento || empresa.cnpj || empresa.cpf,
    email: empresa.email,
    phone: empresa.telefone || null,
    address: empresa.endereco || null,
    addressNumber: empresa.numero || null,
    complement: empresa.complemento || null,
    province: empresa.bairro || null,
    postalCode: empresa.cep || null
  };

  // Remove campos nulos
  Object.keys(customerData).forEach(key => {
    if (customerData[key] === null || customerData[key] === '') {
      delete customerData[key];
    }
  });

  return await asaasRequest(`/v3/customers/${customerId}`, 'PUT', customerData);
}

/**
 * Cria uma assinatura no Asaas
 * @param {string} customerId - ID do cliente no Asaas
 * @param {Object} plano - Dados do plano
 * @param {string} ciclo - Ciclo de cobrança (MONTHLY, YEARLY)
 * @param {string} billingType - Tipo de cobrança (BOLETO, CREDIT_CARD, PIX, UNDEFINED)
 * @param {string} callbackUrl - URL de callback após pagamento
 * @returns {Object} Dados da assinatura criada
 */
async function createSubscription(customerId, plano, ciclo = 'MONTHLY', billingType = 'UNDEFINED', callbackUrl = null) {
  // Calcula próxima data de vencimento (hoje + dias de teste ou amanhã)
  const nextDueDate = new Date();
  if (plano.dias_teste && plano.dias_teste > 0) {
    nextDueDate.setDate(nextDueDate.getDate() + plano.dias_teste);
  } else {
    nextDueDate.setDate(nextDueDate.getDate() + 1);
  }

  const valor = ciclo === 'YEARLY' ? plano.valor_mensal * 12 * 0.9 : plano.valor_mensal; // 10% desconto anual

  const subscriptionData = {
    customer: customerId,
    billingType: billingType,
    value: valor,
    nextDueDate: nextDueDate.toISOString().split('T')[0],
    cycle: ciclo,
    description: `Assinatura ${plano.nome}`,
    externalReference: String(plano.id)
  };

  if (callbackUrl) {
    subscriptionData.callback = {
      successUrl: callbackUrl,
      autoRedirect: true
    };
  }

  return await asaasRequest('/v3/subscriptions', 'POST', subscriptionData);
}

/**
 * Cria uma assinatura no Asaas com dados do cartão de crédito
 * Usa POST /v3/subscriptions/ (com trailing slash) que aceita creditCard + creditCardHolderInfo
 * @param {string} customerId - ID do cliente no Asaas
 * @param {Object} plano - Dados do plano
 * @param {string} ciclo - Ciclo de cobrança (MONTHLY, YEARLY)
 * @param {Object} creditCard - Dados do cartão { holderName, number, expiryMonth, expiryYear, ccv }
 * @param {Object} creditCardHolderInfo - Dados do titular { name, email, cpfCnpj, postalCode, addressNumber, phone }
 * @param {string} remoteIp - IP do cliente que está fazendo a compra
 * @returns {Object} Dados da assinatura criada
 */
async function createSubscriptionWithCreditCard(customerId, plano, ciclo = 'MONTHLY', creditCard, creditCardHolderInfo, remoteIp) {
  // Calcula próxima data de vencimento (hoje + dias de teste ou amanhã)
  const nextDueDate = new Date();
  if (plano.dias_teste && plano.dias_teste > 0) {
    nextDueDate.setDate(nextDueDate.getDate() + plano.dias_teste);
  } else {
    nextDueDate.setDate(nextDueDate.getDate() + 1);
  }

  const valor = ciclo === 'YEARLY' ? plano.valor_mensal * 12 * 0.9 : plano.valor_mensal;

  const subscriptionData = {
    customer: customerId,
    billingType: 'CREDIT_CARD',
    value: valor,
    nextDueDate: nextDueDate.toISOString().split('T')[0],
    cycle: ciclo,
    description: `Assinatura ${plano.nome}`,
    externalReference: String(plano.id),
    creditCard,
    creditCardHolderInfo,
    remoteIp,
  };

  // Usa /v3/subscriptions/ (trailing slash) = endpoint de criação com cartão
  return await asaasRequest('/v3/subscriptions/', 'POST', subscriptionData);
}

/**
 * Busca uma assinatura no Asaas pelo ID
 * @param {string} subscriptionId - ID da assinatura no Asaas
 * @returns {Object} Dados da assinatura
 */
async function getSubscription(subscriptionId) {
  return await asaasRequest(`/v3/subscriptions/${subscriptionId}`);
}

/**
 * Lista os pagamentos de uma assinatura
 * @param {string} subscriptionId - ID da assinatura no Asaas
 * @returns {Object} Lista de pagamentos
 */
async function getSubscriptionPayments(subscriptionId) {
  return await asaasRequest(`/v3/subscriptions/${subscriptionId}/payments`);
}

/**
 * Cancela uma assinatura no Asaas
 * @param {string} subscriptionId - ID da assinatura no Asaas
 * @returns {Object} Dados da assinatura cancelada
 */
async function cancelSubscription(subscriptionId) {
  return await asaasRequest(`/v3/subscriptions/${subscriptionId}`, 'DELETE');
}

/**
 * Cria um link de pagamento no Asaas
 * @param {Object} plano - Dados do plano
 * @param {Object} empresa - Dados da empresa (opcional)
 * @param {string} ciclo - Ciclo de cobrança (MONTHLY, YEARLY)
 * @param {string} callbackUrl - URL de callback após pagamento
 * @returns {Object} Dados do link de pagamento criado
 */
async function createPaymentLink(plano, empresa = null, ciclo = 'MONTHLY', callbackUrl = null) {
  const valor = ciclo === 'YEARLY' ? plano.valor_mensal * 12 * 0.9 : plano.valor_mensal;

  const paymentLinkData = {
    name: `Assinatura ${plano.nome}`,
    description: plano.descricao || `Plano ${plano.nome}`,
    billingType: 'UNDEFINED', // Permite todos os métodos
    chargeType: 'RECURRENT',
    subscriptionCycle: ciclo,
    value: valor,
    dueDateLimitDays: 10,
    notificationEnabled: true,
    isAddressRequired: false
  };

  if (empresa) {
    paymentLinkData.externalReference = `empresa_${empresa.id}_plano_${plano.id}`;
  }

  if (callbackUrl) {
    paymentLinkData.callback = {
      successUrl: callbackUrl,
      autoRedirect: true
    };
  }

  return await asaasRequest('/v3/paymentLinks', 'POST', paymentLinkData);
}

/**
 * Busca um pagamento no Asaas pelo ID
 * @param {string} paymentId - ID do pagamento no Asaas
 * @returns {Object} Dados do pagamento
 */
async function getPayment(paymentId) {
  return await asaasRequest(`/v3/payments/${paymentId}`);
}

/**
 * Lista pagamentos de um cliente
 * @param {string} customerId - ID do cliente no Asaas
 * @returns {Object} Lista de pagamentos
 */
async function listCustomerPayments(customerId) {
  return await asaasRequest(`/v3/payments?customer=${customerId}`);
}

/**
 * Gera QR Code PIX para um pagamento
 * @param {string} paymentId - ID do pagamento no Asaas
 * @returns {Object} Dados do QR Code PIX
 */
async function getPixQrCode(paymentId) {
  return await asaasRequest(`/v3/payments/${paymentId}/pixQrCode`);
}

/**
 * Busca informações de boleto de um pagamento
 * @param {string} paymentId - ID do pagamento no Asaas
 * @returns {Object} Informações do boleto
 */
async function getBillingInfo(paymentId) {
  return await asaasRequest(`/v3/payments/${paymentId}/billingInfo`);
}

/**
 * Valida o token do webhook
 * @param {string} token - Token recebido no header
 * @returns {boolean} Se o token é válido
 */
async function validateWebhookToken(token) {
  const config = await getAsaasConfig();
  return config.webhookToken && token === config.webhookToken;
}

/**
 * Configura automaticamente o webhook no Asaas
 * Verifica se já existe um webhook para a URL da API e cria caso não exista
 * @returns {boolean} Se o webhook foi configurado com sucesso
 */
async function handleApiAsaas() {
  try {
    console.log('[Asaas] Verificando configuração de webhooks...');

    const config = await getAsaasConfig();

    if (!config.apiKey || !config.apiUrl) {
      console.error('[Asaas] API Key ou API URL não configuradas');
      return false;
    }

    // Buscar webhooks existentes
    const responseWebhooks = await asaasRequest('/v3/webhooks?limit=100');
    const webhooks = responseWebhooks?.data || [];

    console.log(`[Asaas] Webhooks encontrados: ${webhooks.length}`);

    // URL do webhook do sistema
    const webhookUrl = `${process.env.API_URL || 'https://app.oregonservicos.com.br:3005'}/webhook/asaas`;

    // Verificar se já existe um webhook para a URL
    const webhookExistente = webhooks.find(webhook => webhook.url === webhookUrl);

    if (webhookExistente) {
      console.log(`[Asaas] Webhook já existe: ${webhookExistente.id}`, webhookExistente);

      // Salva o token do webhook existente se houver
      if (webhookExistente.authToken) {
        await saveAsaasConfig('asaas_webhook_token', webhookExistente.authToken);
      }

      // Se o webhook estiver interrompido ou desativado, reativa
      if (webhookExistente.interrupted || !webhookExistente.enabled) {
        console.log(`[Asaas] Webhook interrompido/desativado. Reativando...`);
        try {
          await asaasRequest(`/v3/webhooks/${webhookExistente.id}`, 'PUT', {
            enabled: true,
            interrupted: false
          });
          console.log('[Asaas] Webhook reativado com sucesso');
        } catch (reactivateError) {
          console.error('[Asaas] Erro ao reativar webhook:', reactivateError.message);
        }
      }

      return true;
    }

    console.log('[Asaas] Criando novo webhook...');

    // Gerar token de autenticação para o webhook
    const crypto = require('crypto');
    const webhookToken = crypto.randomBytes(32).toString('hex');

    // Eventos para monitorar
    const events = [
      // Eventos de assinatura
      "SUBSCRIPTION_CREATED",
      "SUBSCRIPTION_UPDATED",
      "SUBSCRIPTION_INACTIVATED",
      "SUBSCRIPTION_DELETED",
      "SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK",
      "SUBSCRIPTION_SPLIT_DIVERGENCE_BLOCK_FINISHED",
      "SUBSCRIPTION_SPLIT_DISABLED",
      // Eventos de pagamento
      "PAYMENT_CREATED",
      "PAYMENT_UPDATED",
      "PAYMENT_CONFIRMED",
      "PAYMENT_RECEIVED",
      "PAYMENT_ANTICIPATED",
      "PAYMENT_OVERDUE",
      "PAYMENT_DELETED",
      "PAYMENT_RESTORED",
      "PAYMENT_REFUNDED",
      "PAYMENT_REFUND_IN_PROGRESS",
      "PAYMENT_RECEIVED_IN_CASH_UNDONE",
      "PAYMENT_CHARGEBACK_REQUESTED",
      "PAYMENT_CHARGEBACK_DISPUTE",
      "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
      "PAYMENT_DUNNING_RECEIVED",
      "PAYMENT_DUNNING_REQUESTED",
      "PAYMENT_BANK_SLIP_VIEWED",
      "PAYMENT_CHECKOUT_VIEWED",
      "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
      "PAYMENT_PARTIALLY_REFUNDED",
      "PAYMENT_SPLIT_DIVERGENCE_BLOCK",
      "PAYMENT_SPLIT_CANCELLED",
      "PAYMENT_SPLIT_DIVERGENCE_BLOCK_FINISHED",
      "PAYMENT_AWAITING_RISK_ANALYSIS",
      "PAYMENT_APPROVED_BY_RISK_ANALYSIS",
      "PAYMENT_REPROVED_BY_RISK_ANALYSIS",
      "PAYMENT_AUTHORIZED",
      // Eventos de transferência
      "TRANSFER_CREATED",
      "TRANSFER_IN_BANK_PROCESSING",
      "TRANSFER_DONE",
      "TRANSFER_CANCELLED",
      "TRANSFER_PENDING",
      "TRANSFER_BLOCKED",
      "TRANSFER_FAILED"
    ];

    const bodyWebhook = {
      name: 'Oregon Webhook',
      url: webhookUrl,
      events: events,
      email: 'a23comunicacoes@gmail.com',
      enabled: true,
      interrupted: false,
      sendType: "SEQUENTIALLY",
      authToken: webhookToken
    };

    const responseWebhook = await asaasRequest('/v3/webhooks', 'POST', bodyWebhook);

    if (responseWebhook && responseWebhook.id) {
      console.log(`[Asaas] Webhook criado com sucesso: ${responseWebhook.id}`);

      // Salva o token do webhook
      await saveAsaasConfig('asaas_webhook_token', webhookToken);

      return true;
    }

    console.error('[Asaas] Erro ao criar webhook:', responseWebhook);
    return false;
  } catch (error) {
    console.error('[Asaas] Erro ao configurar webhooks:', error?.message || error);
    return false;
  }
}

/**
 * Cria um cliente no Asaas a partir dos dados da tabela CLIENTES
 * @param {Object} cliente - Dados do cliente (cli_Id, cli_nome, cli_cpf, cli_email, cli_celular)
 * @returns {Object} Dados do cliente criado no Asaas
 */
async function createCustomerForClient(cliente) {
  const customerData = {
    name: cliente.cli_nome,
    cpfCnpj: cliente.cli_cpf,
    email: cliente.cli_email || null,
    mobilePhone: cliente.cli_celular || null,
    externalReference: String(cliente.cli_Id),
    notificationDisabled: false
  };

  // Remove campos nulos
  Object.keys(customerData).forEach(key => {
    if (customerData[key] === null || customerData[key] === '') {
      delete customerData[key];
    }
  });

  const result = await asaasRequest('/v3/customers', 'POST', customerData);

  // Salva o asaas_customer_id no cliente
  await dbQuery(
    'UPDATE CLIENTES SET asaas_customer_id = ? WHERE cli_Id = ?',
    [result.id, cliente.cli_Id]
  );

  return result;
}

/**
 * Cria uma assinatura recorrente no Asaas para um contrato
 * @param {string} customerId - ID do cliente no Asaas
 * @param {Object} opts - Opções: { value, nextDueDate, cycle, billingType, description, externalReference }
 * @returns {Object} Dados da assinatura criada no Asaas
 */
async function createContractSubscription(customerId, opts = {}) {
  const subscriptionData = {
    customer: customerId,
    billingType: opts.billingType || 'UNDEFINED',
    value: opts.value,
    nextDueDate: opts.nextDueDate,
    cycle: opts.cycle || 'MONTHLY',
    description: opts.description || 'Assinatura de Contrato',
    externalReference: opts.externalReference || null,
  };

  return await asaasRequest('/v3/subscriptions', 'POST', subscriptionData);
}

/**
 * Atualiza o cartão de crédito de uma assinatura no Asaas
 * @param {string} subscriptionId - ID da assinatura no Asaas
 * @param {Object} creditCard - Dados do cartão { holderName, number, expiryMonth, expiryYear, ccv }
 * @param {Object} creditCardHolderInfo - Dados do titular { name, email, cpfCnpj, postalCode, addressNumber, phone }
 * @returns {Object} Resposta da API
 */
async function updateSubscriptionCreditCard(subscriptionId, creditCard, creditCardHolderInfo) {
  return await asaasRequest(`/v3/subscriptions/${subscriptionId}`, 'PUT', {
    billingType: 'CREDIT_CARD',
    creditCard,
    creditCardHolderInfo,
  });
}

module.exports = {
  getAsaasConfig,
  saveAsaasConfig,
  asaasRequest,
  testConnection,
  createCustomer,
  createCustomerForClient,
  getCustomer,
  updateCustomer,
  createSubscription,
  createSubscriptionWithCreditCard,
  getSubscription,
  getSubscriptionPayments,
  cancelSubscription,
  createPaymentLink,
  getPayment,
  listCustomerPayments,
  getPixQrCode,
  getBillingInfo,
  validateWebhookToken,
  handleApiAsaas,
  createContractSubscription,
  updateSubscriptionCreditCard
};
