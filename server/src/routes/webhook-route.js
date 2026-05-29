'use strict';

/**
 * Webhook do WhatsApp Cloud API — rota pública (sem autenticação JWT).
 * GET  /webhook/whatsapp — handshake de verificação do Meta
 * POST /webhook/whatsapp — recebimento de mensagens e status
 *
 * Segurança crítica:
 * - Assinatura HMAC-SHA256 validada com crypto.timingSafeEqual antes de qualquer processamento.
 * - empresa_id sempre inferido do phone_number_id via banco — nunca aceito do payload.
 * - PII (telefone, nome, corpo) jamais aparece em logs.
 * - Download de mídia em setImmediate para não bloquear o 200.
 */

const express = require('express');
const crypto = require('crypto');

const router = express.Router();

const configRepository = require('../whatsapp/repositories/configRepository');
const conversationRepository = require('../whatsapp/repositories/conversationRepository');
const messageRepository = require('../whatsapp/repositories/messageRepository');
const cloudApiClient = require('../whatsapp/cloudApiClient');
const { mirrorWebhook } = require('../whatsapp/webhookMirror');
const log = require('../whatsapp/logger');
const dbQuery = require('../utils/dbHelper');
const { emitToEmpresa } = require('../socket');

// ─────────────────────────────────────────────
// Funções auxiliares
// ─────────────────────────────────────────────

/**
 * Extrai o corpo textual de uma mensagem inbound.
 * Suporta text, image, document, video, audio e sticker com legenda.
 * @param {Object} msg - objeto de mensagem do payload Meta
 * @returns {string}
 */
function extrairBody(msg) {
  if (!msg) return '';

  if (msg.type === 'text') {
    return (msg.text && msg.text.body) || '';
  }

  // Tipos de mídia com legenda opcional
  const tiposComCaption = ['image', 'document', 'video'];
  if (tiposComCaption.includes(msg.type)) {
    return (msg[msg.type] && msg[msg.type].caption) || '';
  }

  return '';
}

/**
 * Rótulos amigáveis (com emoji) por tipo de mensagem sem texto, usados no
 * preview da lista de conversas. Evita os antigos "[audio]"/"[reaction]".
 */
const PREVIEW_LABELS = {
  image: '📷 Foto',
  video: '🎥 Vídeo',
  audio: '🎤 Mensagem de voz',
  sticker: '🌟 Figurinha',
  location: '📍 Localização',
  contacts: '👤 Contato',
  document: '📄 Documento',
};

/**
 * Extrai preview resumido (máximo 100 caracteres) para last_message_preview.
 * Para tipos com legenda, usa a legenda; para tipos sem texto, usa um rótulo
 * amigável (ex.: "🎤 Mensagem de voz"); documentos mostram o nome do arquivo.
 * @param {Object} msg
 * @returns {string}
 */
function extrairPreview(msg) {
  if (!msg) return '';

  const truncar = (s) => (s.length > 100 ? s.substring(0, 97) + '...' : s);

  if (msg.type === 'text') {
    return truncar((msg.text && msg.text.body) || '');
  }

  const tiposComCaption = ['image', 'document', 'video'];
  if (tiposComCaption.includes(msg.type)) {
    const caption = (msg[msg.type] && msg[msg.type].caption) || '';
    if (caption) return truncar(caption);
  }

  // Documento sem legenda: mostra o nome do arquivo, se houver.
  if (msg.type === 'document') {
    const nome = (msg.document && msg.document.filename) || '';
    return nome ? truncar(`📄 ${nome}`) : PREVIEW_LABELS.document;
  }

  return PREVIEW_LABELS[msg.type] || 'Mensagem';
}

/**
 * Extrai o media_id do objeto de mensagem conforme o tipo.
 * @param {Object} msg
 * @returns {string|null}
 */
function extrairMediaId(msg) {
  const tiposMidia = ['image', 'document', 'video', 'audio', 'sticker'];
  if (tiposMidia.includes(msg.type) && msg[msg.type] && msg[msg.type].id) {
    return msg[msg.type].id;
  }
  return null;
}

/**
 * Extrai o objeto `referral` de uma mensagem inbound vinda de um anúncio
 * Click-to-WhatsApp ("iniciar conversa no WhatsApp"). Só está presente na(s)
 * primeira(s) mensagem(ns) originadas do clique no anúncio.
 *
 * Campos possíveis (guardados BRUTOS para não perder nada que a Meta envie):
 *  - source_url   : link do anúncio/post
 *  - source_id    : ID do anúncio ou post no Meta
 *  - source_type  : "ad" | "post"
 *  - headline     : título do criativo
 *  - body         : texto do criativo
 *  - media_type   : "image" | "video"
 *  - image_url / video_url / thumbnail_url
 *  - ctwa_clid    : Click ID p/ a Conversions API (atribuição de volta à Meta)
 * @param {Object} msg
 * @returns {Object|null}
 */
function extrairReferral(msg) {
  if (msg && msg.referral && typeof msg.referral === 'object') {
    return msg.referral;
  }
  return null;
}

/**
 * Extrai `context.referred_product` — presente quando o cliente inicia a conversa
 * a partir de uma mensagem de produto do catálogo (Multi/Single Product Message).
 * @param {Object} msg
 * @returns {Object|null} { catalog_id, product_retailer_id } ou null
 */
function extrairReferredProduct(msg) {
  if (msg && msg.context && msg.context.referred_product) {
    return msg.context.referred_product;
  }
  return null;
}

// ─────────────────────────────────────────────
// GET /whatsapp — handshake de verificação do Meta
// ─────────────────────────────────────────────

/**
 * O Meta envia: ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
 * Responde com hub.challenge em texto puro se verify_token bater com empresa ativa.
 */
router.get('/whatsapp', async (req, res) => {
  log('webhook.GET.recebido', { mode: req.query['hub.mode'], hasToken: !!req.query['hub.verify_token'] });
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode !== 'subscribe' || !token) {
      log.warn('webhook.GET.rejeitado', { motivo: 'mode/token ausente' });
      return res.status(403).send('Forbidden');
    }

    const config = await configRepository.getByVerifyToken(token);
    if (!config) {
      log.warn('webhook.GET.rejeitado', { motivo: 'verify_token sem config ativa' });
      return res.status(403).send('Forbidden');
    }

    log('webhook.GET.aceito', { empresa_id: config.empresa_id });
    // Responder com o challenge em texto puro — o Meta valida que é exatamente o valor enviado
    return res.status(200).send(String(challenge));
  } catch (err) {
    log.err('webhook.GET.erro', { msg: err.message, stack: err.stack });
    return res.status(500).send('Internal Server Error');
  }
});

// ─────────────────────────────────────────────
// POST /whatsapp — recebimento de eventos do Meta
// ─────────────────────────────────────────────

router.post('/whatsapp', async (req, res) => {
  log('webhook.POST.recebido', {
    headers: { 'content-type': req.headers['content-type'], 'x-hub-signature-256': req.headers['x-hub-signature-256'] },
    rawBodySize: Buffer.isBuffer(req.rawBody) ? req.rawBody.length : null,
    payload: req.body,
  });

  // ── 1. Extrair phone_number_id do payload (falha segura: 200 sem processar) ──
  let phoneNumberId;
  try {
    phoneNumberId = req.body.entry[0].changes[0].value.metadata.phone_number_id;
    if (!phoneNumberId) throw new Error('phone_number_id ausente');
  } catch (_) {
    // Payload malformado ou campo ausente — responder 200 para evitar reenvio do Meta
    log.warn('webhook.POST.payload_malformado', { temBody: !!req.body });
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── 2. Resolver empresa pelo phone_number_id ──
  let config;
  try {
    config = await configRepository.getByPhoneNumberId(phoneNumberId);
  } catch (err) {
    log.err('webhook.POST.erro_buscar_config', { msg: err.message, phoneNumberId });
    return res.status(200).send('EVENT_RECEIVED');
  }

  if (!config) {
    log.warn('webhook.POST.sem_config', { phoneNumberId });
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── 3. Validar assinatura HMAC-SHA256 ──
  if (!Buffer.isBuffer(req.rawBody)) {
    log.warn('webhook.POST.sem_rawBody', { empresa_id: config.empresa_id });
    return res.status(400).send('Bad Request');
  }

  const headerSig = req.headers['x-hub-signature-256'] || '';

  try {
    const hmacEsperado = crypto
      .createHmac('sha256', config.app_secret)
      .update(req.rawBody)
      .digest();

    const hexRecebido = headerSig.replace('sha256=', '');
    const hmacRecebido = Buffer.from(hexRecebido, 'hex');

    // timingSafeEqual lança se os Buffers têm tamanhos diferentes
    const valida = crypto.timingSafeEqual(hmacEsperado, hmacRecebido);

    if (!valida) {
      log.warn('webhook.POST.assinatura_invalida', { empresa_id: config.empresa_id });
      return res.status(401).send('invalid signature');
    }
  } catch (e) {
    log.warn('webhook.POST.assinatura_excecao', { msg: e.message });
    return res.status(401).send('invalid signature');
  }

  log('webhook.POST.assinatura_ok', { empresa_id: config.empresa_id });

  // ── 3b. Espelhar para o ambiente de desenvolvimento (migração) ──
  // Só ocorre em produção (WEBHOOK_MIRROR_URL definido) e nunca quando a
  // própria requisição já é um espelho — assim o dev grava no seu banco sem
  // reencaminhar de volta. Fire-and-forget: não bloqueia o 200 ao Meta.
  mirrorWebhook(req);

  // ── 4. Processar payload (responder 200 mesmo se houver erro interno) ──
  // Resposta antecipada NÃO é feita aqui; respondemos ao final após processar
  // de forma síncrona as operações críticas. O download de mídia é em setImmediate.

  try {
    const empresaId = config.empresa_id;
    const entries = req.body.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const metadata = value.metadata || {};
        const pid = metadata.phone_number_id || phoneNumberId;
        const contacts = value.contacts || [];
        const messages = value.messages || [];
        const statuses = value.statuses || [];

        // Processar mensagens inbound
        for (const msg of messages) {
          try {
            const contactName = (contacts[0] && contacts[0].profile && contacts[0].profile.name) || null;
            const referral = extrairReferral(msg);
            const referredProduct = extrairReferredProduct(msg);
            log('webhook.msg.inbound', {
              empresa_id: empresaId, wamid: msg.id, type: msg.type, from: msg.from,
              hasMedia: !!extrairMediaId(msg), hasContext: !!msg.context,
              // PII-safe: apenas a origem/ids do anúncio, sem corpo da mensagem
              hasReferral: !!referral,
              referralSource: referral ? { source_type: referral.source_type, source_id: referral.source_id, ctwa_clid: referral.ctwa_clid } : null,
              hasReferredProduct: !!referredProduct,
            });

            // Reação: NÃO é uma mensagem nova — aplica o emoji à mensagem-alvo
            // (identificada por reaction.message_id) e atualiza o frontend.
            // Emoji vazio significa remoção da reação.
            if (msg.type === 'reaction') {
              const targetWamid = msg.reaction && msg.reaction.message_id;
              const emoji = (msg.reaction && msg.reaction.emoji) || null;
              if (targetWamid) {
                try {
                  const afetadas = await messageRepository.setReactionByWamid(targetWamid, emoji, empresaId);
                  log('webhook.reaction.aplicada', { targetWamid, emoji, afetadas });
                  if (afetadas > 0) {
                    emitToEmpresa(empresaId, 'update-mensagem', { wamid: targetWamid, reaction: emoji || null });
                  }
                } catch (reErr) {
                  log.err('webhook.reaction.falhou', { msg: reErr.message, targetWamid });
                }
              }
              // Reação não cria mensagem, não mexe na conversa nem no unread.
              continue;
            }

            // 4a. Upsert da conversa
            const conversationId = await conversationRepository.upsertConversation({
              empresa_id: empresaId,
              phone_number_id: pid,
              contact_wa_id: msg.from,
              contact_name: contactName,
              last_inbound_at: new Date(),
              last_message_at: new Date(),
              last_message_preview: extrairPreview(msg),
              // unread incrementado só depois, apenas se a mensagem for nova
              // (evita inflar o contador em reentregas do Meta)
              unread_count: 0,
              // Promove a origem do anúncio ao nível da conversa (se houver)
              referral,
            });

            // 4b. Inserir mensagem (idempotente via wamid UNIQUE)
            const msgId = await messageRepository.insertMessage({
              empresa_id: empresaId,
              conversation_id: conversationId,
              wamid: msg.id,
              direction: 'inbound',
              type: msg.type,
              body: extrairBody(msg),
              reply_to_wamid: (msg.context && msg.context.message_id) || null,
              sender_name: contactName,
              timestamp_ms: parseInt(msg.timestamp, 10) * 1000,
              status: 'delivered',
              // Origem da mensagem (anúncio CTWA / produto do catálogo)
              referral,
              referred_product: referredProduct,
            });

            // wamid duplicado — não emitir socket duplicado nem incrementar unread
            if (msgId === null) {
              log('webhook.msg.duplicada', { wamid: msg.id });
              continue;
            }

            log('webhook.msg.persistida', { msgId, wamid: msg.id, conversationId });

            // Mensagem nova confirmada — incrementa o contador de não lidas
            try {
              await conversationRepository.incrementUnread(conversationId, empresaId);
            } catch (unreadErr) {
              console.error('[webhook] Erro ao incrementar unread:', unreadErr.message);
            }

            // 4c. Emitir socket para o frontend
            try {
              emitToEmpresa(empresaId, 'nova-mensagem', {
                conversation_id: conversationId,
                message: {
                  id: msgId,
                  wamid: msg.id,
                  direction: 'inbound',
                  type: msg.type,
                  body: extrairBody(msg),
                  sender_name: contactName,
                  timestamp_ms: parseInt(msg.timestamp, 10) * 1000,
                  status: 'delivered',
                  // Origem do anúncio/catálogo já vai para o frontend em tempo real
                  referral: referral || null,
                  referred_product: referredProduct || null,
                },
              });
            } catch (socketErr) {
              console.error('[webhook] Erro ao emitir socket nova-mensagem:', socketErr.message);
            }

            // 4d. Download de mídia em background (não bloqueia o 200)
            const mediaId = extrairMediaId(msg);
            if (mediaId) {
              setImmediate(async () => {
                try {
                  log('webhook.midia.download.inicio', { msgId, mediaId });
                  const mediaInfo = await cloudApiClient.getMediaUrl(config, mediaId);
                  log('webhook.midia.url_obtida', { msgId, mediaId, mime: mediaInfo.mime_type, size: mediaInfo.file_size });
                  const mediaPath = await cloudApiClient.downloadMedia(
                    config,
                    mediaInfo.url,
                    mediaInfo.mime_type,
                    empresaId
                  );
                  await messageRepository.updateMediaPath(msgId, mediaPath, mediaInfo.mime_type);
                  log('webhook.midia.download.ok', { msgId, mediaPath, mime: mediaInfo.mime_type });
                  try {
                    emitToEmpresa(empresaId, 'update-mensagem', {
                      id: msgId,
                      media_path: mediaPath,
                      media_url: `/uploads/${mediaPath}`,
                      media_mime: mediaInfo.mime_type,
                    });
                  } catch (_) { /* socket não pode derrubar o processo */ }
                } catch (e) {
                  log.err('webhook.midia.download.falhou', { msgId, mediaId, msg: e.message, metaCode: e.metaCode, details: e.metaDetails });
                }
              });
            }

            // 4e. Atualizar cli_ultima_msg_cliente_data no CLIENTES (query parametrizada)
            try {
              await dbQuery(
                `UPDATE CLIENTES
                 SET cli_ultima_msg_cliente_data = NOW()
                 WHERE empresa_id = ?
                   AND RIGHT(REGEXP_REPLACE(COALESCE(cli_celular, ''), '[^0-9]', ''), 8) = RIGHT(?, 8)`,
                [empresaId, msg.from]
              );
            } catch (dbErr) {
              console.error('[webhook] Erro ao atualizar CLIENTES:', dbErr.message);
            }
          } catch (msgErr) {
            log.err('webhook.msg.processar_falhou', { msg: msgErr.message, stack: msgErr.stack });
          }
        }

        // Processar atualizações de status (sent/delivered/read/failed)
        for (const status of statuses) {
          try {
            log('webhook.status.recebido', {
              wamid: status.id, status: status.status, recipient: status.recipient_id,
              errors: status.errors || null, conversation: status.conversation || null,
            });
            await messageRepository.updateMessageStatusByWamid(
              status.id,
              status.status,
              status.errors || null,
              empresaId
            );
            try {
              emitToEmpresa(empresaId, 'update-mensagem', {
                wamid: status.id,
                status: status.status,
              });
            } catch (_) { /* socket não pode derrubar o processo */ }
          } catch (statusErr) {
            log.err('webhook.status.falhou', { msg: statusErr.message });
          }
        }
      }
    }
  } catch (err) {
    log.err('webhook.POST.erro_geral', { msg: err.message, stack: err.stack });
  }

  return res.status(200).send('EVENT_RECEIVED');
});

module.exports = router;
