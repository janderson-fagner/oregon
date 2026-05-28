'use strict';

/**
 * Espelhamento do webhook do WhatsApp Cloud API para outro ambiente.
 *
 * Durante a migração do whatsapp-web.js para a API oficial do Meta mantemos os
 * bancos de produção e desenvolvimento populados com as mesmas mensagens. O
 * processo de PRODUÇÃO (único que o Meta conhece) replica o payload bruto
 * recebido para o processo de DESENVOLVIMENTO, que o processa normalmente e
 * grava no seu próprio banco (Conversations/Messages).
 *
 * Mecanismo:
 * - Só replica quando WEBHOOK_MIRROR_URL está definido (configurado apenas no
 *   .env de produção, apontando para a porta do dev em 127.0.0.1).
 * - Reenvia o rawBody EXATO + a assinatura original (x-hub-signature-256), para
 *   que o ambiente destino valide o HMAC com o seu próprio app_secret sem
 *   nenhuma alteração de bytes.
 * - Adiciona o header de guarda MIRROR_HEADER. Requisições que já o carregam
 *   NÃO são reespelhadas — é o que impede o laço dev → prod → dev.
 * - Fire-and-forget (setImmediate): nunca bloqueia nem derruba a resposta 200
 *   ao Meta, e qualquer erro fica restrito ao log.
 */

const axios = require('axios');
const log = require('./logger');

// Header de guarda: presente => requisição é um espelho, não reespelhar.
const MIRROR_HEADER = 'x-oregon-mirror';

/**
 * Indica se a requisição atual já é um espelhamento vindo de outro ambiente.
 * @param {import('express').Request} req
 * @returns {boolean}
 */
function isMirroredRequest(req) {
  return !!(req && req.headers && req.headers[MIRROR_HEADER]);
}

/**
 * Replica o payload bruto do webhook para o ambiente espelho, se configurado.
 * Não faz nada quando:
 *  - WEBHOOK_MIRROR_URL está ausente (ex.: ambiente de desenvolvimento);
 *  - a requisição já é um espelho (guard header presente);
 *  - o rawBody não está disponível (sem ele a assinatura não pode ser repassada).
 * @param {import('express').Request} req - requisição original do webhook
 */
function mirrorWebhook(req) {
  const destino = process.env.WEBHOOK_MIRROR_URL;
  if (!destino) return;               // ambiente sem espelho (dev)
  if (isMirroredRequest(req)) return; // já é um espelho — evita laço
  if (!Buffer.isBuffer(req.rawBody)) return;

  setImmediate(async () => {
    try {
      await axios.post(destino, req.rawBody, {
        timeout: 8000,
        headers: {
          'content-type': req.headers['content-type'] || 'application/json',
          'x-hub-signature-256': req.headers['x-hub-signature-256'] || '',
          [MIRROR_HEADER]: '1',
        },
        // O rawBody já é o JSON serializado exatamente como o Meta enviou.
        // Identidade no transformRequest impede o axios de reserializar
        // (qualquer mudança de bytes invalidaria a assinatura HMAC no destino).
        transformRequest: [(data) => data],
        // Não tratar 4xx/5xx do destino como exceção fatal — só registramos.
        validateStatus: () => true,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      }).then((resp) => {
        log('webhook.mirror.enviado', { destino, status: resp.status });
      });
    } catch (e) {
      log.err('webhook.mirror.falhou', { destino, msg: e.message });
    }
  });
}

module.exports = { mirrorWebhook, isMirroredRequest, MIRROR_HEADER };
