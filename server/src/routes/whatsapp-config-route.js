'use strict';

/**
 * Rotas REST para gerenciamento de credenciais WhatsApp Cloud API por empresa.
 * Montadas em /whatsapp (prefixo definido no index.js).
 * Todas as rotas exigem autenticação via middleware getUserLoggedUser (empresa_id do JWT).
 */

const express = require('express');
const router = express.Router();

const configService = require('../whatsapp/configService');
const configRepository = require('../whatsapp/repositories/configRepository');
const cloudApiClient = require('../whatsapp/cloudApiClient');
const messageService = require('../whatsapp/messageService');
const { emitToEmpresa } = require('../socket');

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

/**
 * GET /whatsapp/templates
 * Lista templates aprovados da conta WABA da empresa.
 * Retorna: { templates: [...] }
 * 400 se config não encontrada ou inativa; 502 se erro na API Meta.
 */
router.get('/templates', async (req, res) => {
  try {
    const empresaId = req.user.empresa_id;
    const config = await configRepository.getByEmpresa(empresaId);

    if (!config || !config.ativo) {
      return res.status(400).json({ error: 'WhatsApp Cloud não configurado para esta empresa.' });
    }

    try {
      const templates = await cloudApiClient.listTemplates(config);
      return res.json({ templates });
    } catch (errMeta) {
      return res.status(502).json({ error: errMeta.message || 'Erro ao comunicar com a API do WhatsApp.' });
    }
  } catch (err) {
    console.error('Erro ao listar templates:', err.message);
    return res.status(500).json({ error: 'Erro interno ao listar templates.' });
  }
});

/**
 * POST /whatsapp/templates/send
 * Envia template para uma conversa (não requer janela 24h aberta).
 * Body: { conversationId, templateName, languageCode, components? }
 * Retorna: { success: true, message }
 * 400 se dados inválidos ou erro de negócio; 502 se erro Meta.
 */
router.post('/templates/send', async (req, res) => {
  try {
    const { conversationId, templateName, languageCode, components = [] } = req.body;
    const empresaId = req.user.empresa_id;
    const senderName = req.user.fullName || req.user.nome || req.user.name || 'Atendente';

    // Validações obrigatórias
    if (!conversationId || !templateName || !languageCode) {
      return res.status(400).json({ error: 'conversationId, templateName e languageCode são obrigatórios.' });
    }

    // Anti-injeção: templateName só letras minúsculas, números e underscore
    if (!/^[a-z0-9_]+$/.test(templateName)) {
      return res.status(400).json({ error: 'templateName inválido: use apenas letras minúsculas, números e underscore.' });
    }

    // Validação formato languageCode: pt_BR, en, en_US, etc.
    if (!/^[a-z]{2}(_[A-Z]{2})?$/.test(languageCode)) {
      return res.status(400).json({ error: 'languageCode inválido: use formato "pt_BR" ou "en".' });
    }

    // components deve ser array e no máximo 10 itens
    if (!Array.isArray(components)) {
      return res.status(400).json({ error: 'components deve ser um array.' });
    }
    if (components.length > 10) {
      return res.status(400).json({ error: 'components não pode ter mais de 10 itens.' });
    }

    const convId = parseInt(conversationId);
    if (!convId || convId <= 0) {
      return res.status(400).json({ error: 'conversationId inválido.' });
    }

    let resultado;
    try {
      resultado = await messageService.sendTemplateMessage(
        empresaId,
        convId,
        templateName,
        languageCode,
        components,
        senderName
      );
    } catch (errMeta) {
      return res.status(502).json({ error: errMeta.message || 'Erro ao comunicar com a API do WhatsApp.' });
    }

    if (resultado.error) {
      return res.status(400).json(resultado);
    }

    emitToEmpresa(empresaId, 'nova-mensagem', {
      conversation_id: convId,
      message: resultado,
    });

    return res.json({ success: true, message: resultado });
  } catch (err) {
    console.error('Erro ao enviar template:', err.message);
    return res.status(500).json({ error: 'Erro interno ao enviar template.' });
  }
});

module.exports = router;
