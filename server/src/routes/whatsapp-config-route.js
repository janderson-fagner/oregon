'use strict';

/**
 * Rotas REST para gerenciamento de credenciais WhatsApp Cloud API por empresa.
 * Montadas em /whatsapp (prefixo definido no index.js).
 * Todas as rotas exigem autenticação via middleware getUserLoggedUser (empresa_id do JWT).
 */

const express = require('express');
const router = express.Router();

const configService = require('../whatsapp/configService');

/**
 * GET /whatsapp/config
 * Retorna a configuração pública da empresa (sem campos sensíveis).
 * Campos access_token, app_secret e verify_token NUNCA são retornados —
 * apenas os booleanos has_access_token, has_app_secret e has_verify_token.
 */
router.get('/config', async (req, res) => {
  try {
    const config = await configService.getConfig(req.user.empresa_id);
    return res.json(config);
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao buscar configuração WhatsApp.' });
  }
});

/**
 * POST /whatsapp/config
 * Salva (insere ou atualiza) as credenciais Meta da empresa.
 * Campos obrigatórios na primeira configuração: phone_number_id, waba_id,
 * access_token, app_secret, verify_token.
 * Em edições, campos sensíveis podem ser omitidos (os valores existentes são preservados).
 */
router.post('/config', async (req, res) => {
  try {
    await configService.saveConfig(req.user.empresa_id, req.body);
    return res.json({ success: true });
  } catch (err) {
    // Mensagem de validação (400) é segura para o cliente; erros 500 retornam texto genérico
    // para não vazar detalhes internos (ex: erro de SQL).
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    return res.status(500).json({ error: 'Erro ao salvar configuração WhatsApp.' });
  }
});

/**
 * DELETE /whatsapp/config
 * Desativa (soft delete) a configuração WhatsApp Cloud da empresa.
 * Os dados não são apagados fisicamente — apenas marcados como ativo = 0.
 */
router.delete('/config', async (req, res) => {
  try {
    await configService.deleteConfig(req.user.empresa_id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao remover configuração WhatsApp.' });
  }
});

module.exports = router;
