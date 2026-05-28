'use strict';

/**
 * Serviço de configuração WhatsApp Cloud API.
 * Camada de validação e mascaramento entre as rotas REST e o repositório.
 * access_token e app_secret NUNCA são expostos (write-only). O verify_token É
 * retornado: não é credencial de acesso, é a string do handshake do webhook que
 * o usuário precisa visualizar para cadastrar no painel do Meta.
 */

const configRepository = require('./repositories/configRepository');
const cloudApiClient = require('./cloudApiClient');

/**
 * URL do webhook — deve refletir o DOMÍNIO pelo qual o usuário está acessando.
 * O sistema roda na mesma base de código em mais de um domínio (ex: a instância
 * própria em app.oregonservicos.com.br e o SaaS em daviot.com.br). Por isso a URL
 * é derivada do host da requisição (passada pela rota); o valor abaixo é apenas
 * fallback quando não há request (ou via override WHATSAPP_WEBHOOK_URL).
 */
const API_BASE_FALLBACK = (process.env.API_URL || 'https://app.oregonservicos.com.br/api').replace(/\/+$/, '');
const WEBHOOK_URL_FALLBACK = process.env.WHATSAPP_WEBHOOK_URL || `${API_BASE_FALLBACK}/webhook/whatsapp`;

/** Regex para validar o formato da versão da Graph API (ex: v23.0) */
const REGEX_API_VERSION = /^v\d+\.\d+$/;

/**
 * Busca a configuração WhatsApp Cloud da empresa, mascarando campos sensíveis.
 * Retorna apenas metadados públicos e booleanos indicando se os secrets foram configurados.
 * @param {number} empresaId - ID da empresa (vem do JWT)
 * @param {string} [webhookUrl] - URL do webhook derivada do host da requisição (multi-domínio)
 * @returns {Promise<Object>} Configuração pública da empresa
 */
async function getConfig(empresaId, webhookUrl) {
  const config = await configRepository.getByEmpresa(empresaId);

  webhookUrl = webhookUrl || WEBHOOK_URL_FALLBACK;

  if (!config) {
    return {
      configured: false,
      phone_number_id: null,
      waba_id: null,
      display_phone_number: null,
      graph_api_version: null,
      ativo: null,
      webhook_url: webhookUrl,
      verify_token: null,
      has_access_token: false,
      has_app_secret: false,
      has_verify_token: false,
    };
  }

  return {
    configured: true,
    phone_number_id: config.phone_number_id,
    waba_id: config.waba_id,
    display_phone_number: config.display_phone_number,
    graph_api_version: config.graph_api_version,
    ativo: config.ativo,
    webhook_url: webhookUrl,
    verify_token: config.verify_token || null,
    has_access_token: !!(config.access_token && config.access_token.trim()),
    has_app_secret: !!(config.app_secret && config.app_secret.trim()),
    has_verify_token: !!(config.verify_token && config.verify_token.trim()),
  };
}

/**
 * Salva (insere ou atualiza) a configuração WhatsApp Cloud da empresa.
 * Na primeira configuração, phone_number_id, waba_id, access_token, app_secret
 * e verify_token são obrigatórios. Em edições subsequentes, os campos sensíveis
 * podem ser omitidos — os valores existentes no banco são preservados.
 * @param {number} empresaId - ID da empresa (vem do JWT)
 * @param {Object} dados - Dados enviados pelo frontend
 * @throws {Error} Erro com mensagem em PT-BR se validação falhar
 * @returns {Promise<void>}
 */
async function saveConfig(empresaId, dados) {
  // Verifica se é primeira configuração (sem registro no banco)
  const existente = await configRepository.getByEmpresa(empresaId);
  const isPrimeiraConfig = !existente;

  // Campos públicos só são obrigatórios na primeira configuração. Em edições, o
  // frontend pode enviar apenas o(s) campo(s) alterado(s) — o upsert preserva os
  // demais (fallback para os valores existentes no banco).
  if (isPrimeiraConfig) {
    if (!dados.phone_number_id || !String(dados.phone_number_id).trim()) {
      throw Object.assign(new Error('O campo Phone Number ID é obrigatório.'), { status: 400 });
    }
    if (!dados.waba_id || !String(dados.waba_id).trim()) {
      throw Object.assign(new Error('O campo WABA ID é obrigatório.'), { status: 400 });
    }
    if (!dados.access_token || !String(dados.access_token).trim()) {
      throw Object.assign(new Error('O Access Token é obrigatório na primeira configuração.'), { status: 400 });
    }
    if (!dados.app_secret || !String(dados.app_secret).trim()) {
      throw Object.assign(new Error('O App Secret é obrigatório na primeira configuração.'), { status: 400 });
    }
    if (!dados.verify_token || !String(dados.verify_token).trim()) {
      throw Object.assign(new Error('O Verify Token é obrigatório na primeira configuração.'), { status: 400 });
    }
  }

  // Valida formato da versão da Graph API, se fornecida
  if (dados.graph_api_version && !REGEX_API_VERSION.test(String(dados.graph_api_version).trim())) {
    throw Object.assign(
      new Error('Formato inválido para graph_api_version. Use o formato vX.Y (ex: v23.0).'),
      { status: 400 }
    );
  }

  await configRepository.upsert(empresaId, dados);
}

/**
 * Remove (soft delete) a configuração WhatsApp Cloud da empresa.
 * Marca ativo = 0 no banco, sem apagar os dados.
 * @param {number} empresaId - ID da empresa (vem do JWT)
 * @returns {Promise<void>}
 */
async function deleteConfig(empresaId) {
  await configRepository.remove(empresaId);
}

/**
 * Verifica AO VIVO se as credenciais da empresa estão conectadas na Meta.
 * Faz uma chamada à Graph API (GET /{phone_number_id}) e, em sucesso, persiste
 * o número formatado (display_phone_number) como cache. NUNCA lança em erro de
 * Meta — sempre resolve com um objeto descrevendo o estado, para a UI exibir o
 * motivo sem derrubar a rota.
 * @param {number} empresaId - ID da empresa (vem do JWT)
 * @returns {Promise<Object>} { connected, reason?, message?, metaCode?, ...info }
 */
async function checkConnection(empresaId) {
  const config = await configRepository.getByEmpresa(empresaId);

  if (!config || !config.ativo) {
    return { connected: false, reason: 'not_configured' };
  }
  if (!config.access_token || !String(config.access_token).trim()) {
    return { connected: false, reason: 'no_token' };
  }

  try {
    const info = await cloudApiClient.getPhoneNumberInfo(config);

    // Cacheia o número conectado para exibição imediata em cargas futuras.
    if (info.display_phone_number) {
      await configRepository.updateDisplayPhone(empresaId, info.display_phone_number);
    }

    return {
      connected: true,
      verified_name: info.verified_name,
      display_phone_number: info.display_phone_number,
      quality_rating: info.quality_rating,
      code_verification_status: info.code_verification_status,
      platform_type: info.platform_type,
    };
  } catch (err) {
    // err.message já vem em PT-BR (mapeado pelo cloudApiClient); metaCode quando houver.
    return {
      connected: false,
      reason: 'error',
      message: err.message || 'Falha ao verificar conexão com a Meta.',
      metaCode: err.metaCode || null,
    };
  }
}

module.exports = { getConfig, saveConfig, deleteConfig, checkConnection };
