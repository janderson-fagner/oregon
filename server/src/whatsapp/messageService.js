'use strict';

/**
 * Serviço de mensagens WhatsApp Cloud API.
 * Orquestra envio, verificação de janela de 24h, persistência e atualização de conversa.
 * NUNCA loga access_token ou dados sensíveis das credenciais.
 */

const configRepository = require('./repositories/configRepository');
const conversationRepository = require('./repositories/conversationRepository');
const messageRepository = require('./repositories/messageRepository');
const cloudApiClient = require('./cloudApiClient');

/**
 * Verifica se a janela de 24h está ativa para uma conversa.
 * Janela ativa = last_inbound_at existe E (NOW - last_inbound_at) < 24 horas.
 * @param {Object} conversation - objeto da conversa com last_inbound_at
 * @returns {boolean}
 */
function isWindowOpen(conversation) {
  if (!conversation || !conversation.last_inbound_at) {
    return false;
  }
  const agora = Date.now();
  const ultimoInbound = new Date(conversation.last_inbound_at).getTime();
  return (agora - ultimoInbound) < 24 * 3600 * 1000;
}

/**
 * Busca e valida as credenciais da empresa.
 * Lança erro se não encontradas ou inativas.
 * @param {number} empresaId
 * @returns {Promise<Object>} config da empresa
 */
async function obterConfigEmpresa(empresaId) {
  const config = await configRepository.getByEmpresa(empresaId);
  if (!config) {
    const erro = new Error('Configuração WhatsApp não encontrada para esta empresa.');
    erro.code = 'CONFIG_NOT_FOUND';
    throw erro;
  }
  return config;
}

/**
 * Envia mensagem de texto (ou reply) para um contato da empresa.
 * 1. Busca config da empresa (configRepository.getByEmpresa)
 * 2. Busca e valida a conversa (conversationRepository.getById com empresa_id)
 * 3. Verifica janela 24h — se fechada, retorna { windowClosed: true }
 * 4. Envia via cloudApiClient.sendText
 * 5. Persiste mensagem outbound (direction='outbound', status='sent', wamid do retorno)
 * 6. Atualiza conversa (last_message_at, last_message_preview)
 * 7. Retorna { success: true, wamid, conversationId }
 * @param {number} empresaId
 * @param {number} conversationId
 * @param {string} text
 * @param {string} [replyToWamid]
 * @param {string} [senderName]
 * @returns {Promise<Object>}
 */
async function sendTextMessage(empresaId, conversationId, text, replyToWamid, senderName) {
  // Validação básica do texto
  if (!text || !text.trim()) {
    return { error: 'EMPTY_TEXT', message: 'O texto da mensagem não pode ser vazio.' };
  }

  // Valida que a conversa pertence à empresa (isolamento de tenant)
  const conversa = await conversationRepository.getById(conversationId, empresaId);
  if (!conversa) {
    return { error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada ou sem permissão.' };
  }

  // Verifica janela de 24h
  if (!isWindowOpen(conversa)) {
    return {
      windowClosed: true,
      error: 'WINDOW_CLOSED',
      message: 'A janela de 24h está encerrada. Envie um template para retomar o contato.',
    };
  }

  const config = await obterConfigEmpresa(empresaId);

  // Envia via Cloud API
  const { wamid } = await cloudApiClient.sendText(
    config,
    conversa.contact_wa_id,
    text.trim(),
    replyToWamid || null
  );

  const agora = new Date();
  const preview = text.trim().substring(0, 100);

  // Persiste a mensagem outbound
  await messageRepository.insertMessage({
    empresa_id: empresaId,
    conversation_id: conversationId,
    wamid: wamid || null,
    direction: 'outbound',
    type: 'text',
    body: text.trim(),
    status: 'sent',
    reply_to_wamid: replyToWamid || null,
    sender_name: senderName || null,
    timestamp_ms: agora.getTime(),
  });

  // Atualiza a conversa (outbound não incrementa unread_count nem atualiza last_inbound_at)
  await conversationRepository.upsertConversation({
    empresa_id: empresaId,
    phone_number_id: conversa.phone_number_id,
    contact_wa_id: conversa.contact_wa_id,
    contact_name: conversa.contact_name,
    last_message_at: agora,
    last_message_preview: preview,
    last_inbound_at: null, // null = não atualiza no ON DUPLICATE KEY (COALESCE mantém valor existente)
    unread_count: 0,
  });

  return { success: true, wamid, conversationId };
}

/**
 * Envia arquivo de mídia para um contato.
 * Faz upload prévio via cloudApiClient.uploadMedia; depois sendMedia com o media_id.
 * Persiste a mensagem outbound com media_path local.
 * Em erro do upload Meta, mantém o arquivo local (disponível para retry manual).
 * @param {number} empresaId
 * @param {number} conversationId
 * @param {Buffer} fileBuffer
 * @param {string} mimeType
 * @param {string} filename
 * @param {string} [caption]
 * @param {string} [senderName]
 * @param {string} [mediaPath] - path local relativo do arquivo já salvo (ex: midias/1/x.jpg),
 *                               persistido para o chat exibir a mídia enviada
 * @returns {Promise<Object>}
 */
async function sendMediaMessage(empresaId, conversationId, fileBuffer, mimeType, filename, caption, senderName, mediaPath) {
  // Valida que a conversa pertence à empresa
  const conversa = await conversationRepository.getById(conversationId, empresaId);
  if (!conversa) {
    return { error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada ou sem permissão.' };
  }

  // Verifica janela de 24h
  if (!isWindowOpen(conversa)) {
    return {
      windowClosed: true,
      error: 'WINDOW_CLOSED',
      message: 'A janela de 24h está encerrada. Envie um template para retomar o contato.',
    };
  }

  const config = await obterConfigEmpresa(empresaId);

  // Faz upload do arquivo para a Cloud API
  const mediaId = await cloudApiClient.uploadMedia(config, fileBuffer, mimeType, filename);

  // Determina tipo de mídia a partir do mimeType
  const tipoMidia = obterTipoMidia(mimeType);

  // Envia a mídia referenciando o media_id do upload
  const { wamid } = await cloudApiClient.sendMedia(
    config,
    conversa.contact_wa_id,
    tipoMidia,
    { id: mediaId, caption: caption || null, filename },
    null
  );

  const agora = new Date();
  const preview = caption ? caption.substring(0, 100) : `[${tipoMidia}]`;

  // Persiste mensagem outbound — media_path não é salvo localmente aqui (arquivo foi para a Meta)
  await messageRepository.insertMessage({
    empresa_id: empresaId,
    conversation_id: conversationId,
    wamid: wamid || null,
    direction: 'outbound',
    type: tipoMidia,
    body: caption || null,
    media_path: mediaPath || null,
    media_mime: mimeType,
    media_filename: filename,
    status: 'sent',
    sender_name: senderName || null,
    timestamp_ms: agora.getTime(),
  });

  // Atualiza a conversa
  await conversationRepository.upsertConversation({
    empresa_id: empresaId,
    phone_number_id: conversa.phone_number_id,
    contact_wa_id: conversa.contact_wa_id,
    contact_name: conversa.contact_name,
    last_message_at: agora,
    last_message_preview: preview,
    last_inbound_at: null,
    unread_count: 0,
  });

  return { success: true, wamid, conversationId };
}

/**
 * Envia template (não verifica janela de 24h — templates são permitidos sempre,
 * inclusive para reabrir contatos com janela encerrada. Comportamento intencional da Cloud API).
 * @param {number} empresaId
 * @param {number} conversationId
 * @param {string} templateName
 * @param {string} languageCode
 * @param {Array} components
 * @param {string} [senderName]
 * @returns {Promise<Object>}
 */
async function sendTemplateMessage(empresaId, conversationId, templateName, languageCode, components, senderName) {
  // Valida que a conversa pertence à empresa
  const conversa = await conversationRepository.getById(conversationId, empresaId);
  if (!conversa) {
    return { error: 'CONVERSATION_NOT_FOUND', message: 'Conversa não encontrada ou sem permissão.' };
  }

  const config = await obterConfigEmpresa(empresaId);

  // Envia o template — sem verificação de janela (intencional: templates reabrem a janela)
  const { wamid } = await cloudApiClient.sendTemplate(
    config,
    conversa.contact_wa_id,
    templateName,
    languageCode,
    components || []
  );

  const agora = new Date();
  const preview = `[template: ${templateName}]`;

  // Persiste mensagem outbound como tipo 'template'
  await messageRepository.insertMessage({
    empresa_id: empresaId,
    conversation_id: conversationId,
    wamid: wamid || null,
    direction: 'outbound',
    type: 'template',
    body: templateName,
    status: 'sent',
    sender_name: senderName || null,
    timestamp_ms: agora.getTime(),
  });

  // Atualiza a conversa
  await conversationRepository.upsertConversation({
    empresa_id: empresaId,
    phone_number_id: conversa.phone_number_id,
    contact_wa_id: conversa.contact_wa_id,
    contact_name: conversa.contact_name,
    last_message_at: agora,
    last_message_preview: preview,
    last_inbound_at: null,
    unread_count: 0,
  });

  return { success: true, wamid, conversationId };
}

/**
 * Marca mensagem como lida e zera unread_count da conversa.
 * NÃO emite evento socket (responsabilidade das rotas/webhook handler).
 * @param {number} empresaId
 * @param {string} wamid
 * @param {number} conversationId
 * @returns {Promise<void>}
 */
async function markMessageRead(empresaId, wamid, conversationId) {
  const config = await obterConfigEmpresa(empresaId);

  // Marca como lida na Cloud API
  await cloudApiClient.markAsRead(config, wamid);

  // Zera contador de não lidas na conversa
  await conversationRepository.markConversationRead(conversationId, empresaId);
}

/**
 * Infere o tipo de mídia WhatsApp a partir do mimeType.
 * @param {string} mimeType
 * @returns {'image'|'document'|'audio'|'video'}
 */
function obterTipoMidia(mimeType) {
  const mime = (mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

module.exports = {
  isWindowOpen,
  sendTextMessage,
  sendMediaMessage,
  sendTemplateMessage,
  markMessageRead,
};
