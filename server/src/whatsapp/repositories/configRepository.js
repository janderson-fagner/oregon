'use strict';

/**
 * Repositório de acesso ao banco para a tabela WhatsappCloudConfig.
 * Gerencia as credenciais Meta (Cloud API) por empresa.
 * NUNCA loga access_token, app_secret ou verify_token em texto claro.
 */

const dbQuery = require('../../utils/dbHelper');

/**
 * Busca a configuração WhatsApp Cloud da empresa pelo empresa_id.
 * Retorna o objeto completo (incluindo campos sensíveis) — uso interno apenas.
 * Retorna a linha mais recente da empresa (independente de ativo).
 * @param {number} empresaId - ID da empresa
 * @returns {Promise<Object|null>} Objeto de configuração ou null se não encontrado
 */
async function getByEmpresa(empresaId) {
  const rows = await dbQuery(
    'SELECT * FROM WhatsappCloudConfig WHERE empresa_id = ? ORDER BY id DESC LIMIT 1',
    [empresaId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Busca a configuração pelo verify_token (usado no handshake GET do webhook).
 * Retorna apenas registros ativos (ativo = 1). Query parametrizada.
 * @param {string} verifyToken - token de verificação configurado pela empresa
 * @returns {Promise<Object|null>} Objeto de configuração ativo ou null
 */
async function getByVerifyToken(verifyToken) {
  const rows = await dbQuery(
    'SELECT * FROM WhatsappCloudConfig WHERE verify_token = ? AND ativo = 1 LIMIT 1',
    [verifyToken]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Busca a configuração pelo phone_number_id (usado pelo webhook para resolver o tenant).
 * Retorna apenas registros ativos (ativo = 1). Lookup O(1) via índice único.
 * @param {string} phoneNumberId - Phone Number ID da Meta
 * @returns {Promise<Object|null>} Objeto de configuração ativo ou null
 */
async function getByPhoneNumberId(phoneNumberId) {
  const rows = await dbQuery(
    'SELECT * FROM WhatsappCloudConfig WHERE phone_number_id = ? AND ativo = 1 LIMIT 1',
    [phoneNumberId]
  );
  return rows.length > 0 ? rows[0] : null;
}

/**
 * Insere ou atualiza (upsert) a configuração da empresa.
 * Regra crítica de segurança: campos sensíveis (access_token, app_secret, verify_token)
 * só são atualizados se vierem preenchidos (não-vazios) em dados.
 * Campos públicos (phone_number_id, waba_id, display_phone_number, graph_api_version, ativo)
 * são sempre atualizados. Ao salvar, reativa o registro (ativo = 1).
 * @param {number} empresaId - ID da empresa
 * @param {Object} dados - Campos a persistir
 * @param {string} [dados.phone_number_id]
 * @param {string} [dados.waba_id]
 * @param {string} [dados.access_token]
 * @param {string} [dados.app_secret]
 * @param {string} [dados.verify_token]
 * @param {string} [dados.display_phone_number]
 * @param {string} [dados.graph_api_version]
 * @returns {Promise<void>}
 */
async function upsert(empresaId, dados) {
  // Verifica se já existe registro para a empresa
  const existente = await getByEmpresa(empresaId);

  if (!existente) {
    // Inserção inicial — todos os campos obrigatórios já foram validados pelo service
    await dbQuery(
      `INSERT INTO WhatsappCloudConfig
         (empresa_id, phone_number_id, waba_id, access_token, app_secret, verify_token,
          display_phone_number, graph_api_version, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [
        empresaId,
        dados.phone_number_id || null,
        dados.waba_id || null,
        dados.access_token || null,
        dados.app_secret || null,
        dados.verify_token || null,
        dados.display_phone_number || null,
        dados.graph_api_version || 'v23.0',
      ]
    );
  } else {
    // Atualização — campos sensíveis só atualizam se vierem não-vazios
    const novoAccessToken = dados.access_token && dados.access_token.trim()
      ? dados.access_token
      : existente.access_token;

    const novoAppSecret = dados.app_secret && dados.app_secret.trim()
      ? dados.app_secret
      : existente.app_secret;

    const novoVerifyToken = dados.verify_token && dados.verify_token.trim()
      ? dados.verify_token
      : existente.verify_token;

    await dbQuery(
      `UPDATE WhatsappCloudConfig
         SET phone_number_id      = ?,
             waba_id              = ?,
             access_token         = ?,
             app_secret           = ?,
             verify_token         = ?,
             display_phone_number = ?,
             graph_api_version    = ?,
             ativo                = 1
       WHERE empresa_id = ?`,
      [
        dados.phone_number_id || existente.phone_number_id,
        dados.waba_id || existente.waba_id,
        novoAccessToken,
        novoAppSecret,
        novoVerifyToken,
        dados.display_phone_number !== undefined ? dados.display_phone_number : existente.display_phone_number,
        dados.graph_api_version || existente.graph_api_version || 'v23.0',
        empresaId,
      ]
    );
  }
}

/**
 * Atualiza apenas o display_phone_number da empresa (cache do número conectado).
 * Usado após a verificação ao vivo na Meta — não toca em credenciais nem em ativo.
 * @param {number} empresaId - ID da empresa
 * @param {string|null} displayPhoneNumber - número formatado retornado pela Meta
 * @returns {Promise<void>}
 */
async function updateDisplayPhone(empresaId, displayPhoneNumber) {
  await dbQuery(
    'UPDATE WhatsappCloudConfig SET display_phone_number = ? WHERE empresa_id = ?',
    [displayPhoneNumber || null, empresaId]
  );
}

/**
 * Remove a configuração da empresa via soft delete (marca ativo = 0).
 * Os dados de credencial não são apagados fisicamente.
 * @param {number} empresaId - ID da empresa
 * @returns {Promise<void>}
 */
async function remove(empresaId) {
  await dbQuery(
    'UPDATE WhatsappCloudConfig SET ativo = 0 WHERE empresa_id = ?',
    [empresaId]
  );
}

module.exports = { getByEmpresa, getByPhoneNumberId, getByVerifyToken, upsert, updateDisplayPhone, remove };
