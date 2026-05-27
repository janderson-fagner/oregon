'use strict';

/**
 * Serviço de configuração WhatsApp Cloud API.
 * Camada de validação e mascaramento entre as rotas REST e o repositório.
 * Nunca expõe access_token, app_secret ou verify_token nas respostas públicas.
 */

const configRepository = require('./repositories/configRepository');

/** URL do webhook — construída a partir de variável de ambiente ou valor padrão para ambiente dev */
const WEBHOOK_URL = process.env.WHATSAPP_WEBHOOK_URL || 'https://app.oregonservicos.com.br/apidev/webhook/whatsapp';

/** Regex para validar o formato da versão da Graph API (ex: v23.0) */
const REGEX_API_VERSION = /^v\d+\.\d+$/;

/**
 * Busca a configuração WhatsApp Cloud da empresa, mascarando campos sensíveis.
 * Retorna apenas metadados públicos e booleanos indicando se os secrets foram configurados.
 * @param {number} empresaId - ID da empresa (vem do JWT)
 * @returns {Promise<Object>} Configuração pública da empresa
 */
async function getConfig(empresaId) {
  const config = await configRepository.getByEmpresa(empresaId);

  const webhookUrl = WEBHOOK_URL;

  if (!config) {
    return {
      configured: false,
      phone_number_id: null,
      waba_id: null,
      display_phone_number: null,
      graph_api_version: null,
      ativo: null,
      webhook_url: webhookUrl,
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
  // Validações de campos obrigatórios sempre
  if (!dados.phone_number_id || !String(dados.phone_number_id).trim()) {
    throw Object.assign(new Error('O campo Phone Number ID é obrigatório.'), { status: 400 });
  }
  if (!dados.waba_id || !String(dados.waba_id).trim()) {
    throw Object.assign(new Error('O campo WABA ID é obrigatório.'), { status: 400 });
  }

  // Verifica se é primeira configuração (sem registro no banco)
  const existente = await configRepository.getByEmpresa(empresaId);
  const isPrimeiraConfig = !existente;

  if (isPrimeiraConfig) {
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

module.exports = { getConfig, saveConfig, deleteConfig };
