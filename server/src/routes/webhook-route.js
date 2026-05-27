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
 * Extrai preview resumido (máximo 100 caracteres) para last_message_preview.
 * Para tipos sem texto, retorna o tipo entre colchetes.
 * @param {Object} msg
 * @returns {string}
 */
function extrairPreview(msg) {
  if (!msg) return '';

  if (msg.type === 'text') {
    const body = (msg.text && msg.text.body) || '';
    return body.length > 100 ? body.substring(0, 97) + '...' : body;
  }

  const tiposComCaption = ['image', 'document', 'video'];
  if (tiposComCaption.includes(msg.type)) {
    const caption = (msg[msg.type] && msg[msg.type].caption) || '';
    if (caption) {
      return caption.length > 100 ? caption.substring(0, 97) + '...' : caption;
    }
  }

  // Áudio, sticker, reaction, location, etc.
  return `[${msg.type}]`;
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

// ─────────────────────────────────────────────
// GET /whatsapp — handshake de verificação do Meta
// ─────────────────────────────────────────────

/**
 * O Meta envia: ?hub.mode=subscribe&hub.verify_token=TOKEN&hub.challenge=CHALLENGE
 * Responde com hub.challenge em texto puro se verify_token bater com empresa ativa.
 */
router.get('/whatsapp', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode !== 'subscribe' || !token) {
      return res.status(403).send('Forbidden');
    }

    const config = await configRepository.getByVerifyToken(token);
    if (!config) {
      return res.status(403).send('Forbidden');
    }

    // Responder com o challenge em texto puro — o Meta valida que é exatamente o valor enviado
    return res.status(200).send(String(challenge));
  } catch (err) {
    console.error('[webhook] Erro no handshake GET:', err.message);
    return res.status(500).send('Internal Server Error');
  }
});

// ─────────────────────────────────────────────
// POST /whatsapp — recebimento de eventos do Meta
// ─────────────────────────────────────────────

router.post('/whatsapp', async (req, res) => {
  // ── 1. Extrair phone_number_id do payload (falha segura: 200 sem processar) ──
  let phoneNumberId;
  try {
    phoneNumberId = req.body.entry[0].changes[0].value.metadata.phone_number_id;
    if (!phoneNumberId) throw new Error('phone_number_id ausente');
  } catch (_) {
    // Payload malformado ou campo ausente — responder 200 para evitar reenvio do Meta
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── 2. Resolver empresa pelo phone_number_id ──
  let config;
  try {
    config = await configRepository.getByPhoneNumberId(phoneNumberId);
  } catch (err) {
    console.error('[webhook] Erro ao buscar config:', err.message);
    return res.status(200).send('EVENT_RECEIVED');
  }

  if (!config) {
    console.warn('[webhook] phone_number_id sem config ativa');
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ── 3. Validar assinatura HMAC-SHA256 ──
  if (!Buffer.isBuffer(req.rawBody)) {
    // rawBody não foi capturado — provavelmente Content-Type diferente de application/json
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
      return res.status(401).send('invalid signature');
    }
  } catch (_) {
    // Qualquer exceção (tamanhos diferentes, hex inválido) = assinatura inválida
    return res.status(401).send('invalid signature');
  }

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
            });

            // wamid duplicado — não emitir socket duplicado nem incrementar unread
            if (msgId === null) {
              continue;
            }

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
                  const mediaInfo = await cloudApiClient.getMediaUrl(config, mediaId);
                  const mediaPath = await cloudApiClient.downloadMedia(
                    config,
                    mediaInfo.url,
                    mediaInfo.mime_type,
                    empresaId
                  );
                  await messageRepository.updateMediaPath(msgId, mediaPath, mediaInfo.mime_type);
                  try {
                    emitToEmpresa(empresaId, 'update-mensagem', {
                      id: msgId,
                      media_path: mediaPath,
                      media_url: `/uploads/${mediaPath}`,
                      media_mime: mediaInfo.mime_type,
                    });
                  } catch (_) { /* socket não pode derrubar o processo */ }
                } catch (e) {
                  console.error('[webhook] Erro ao baixar midia:', e.message);
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
            console.error('[webhook] Erro ao processar mensagem inbound:', msgErr.message);
          }
        }

        // Processar atualizações de status (sent/delivered/read/failed)
        for (const status of statuses) {
          try {
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
            console.error('[webhook] Erro ao processar status:', statusErr.message);
          }
        }
      }
    }
  } catch (err) {
    console.error('[webhook] Erro geral no processamento:', err.message);
  }

  return res.status(200).send('EVENT_RECEIVED');
});

module.exports = router;
