'use strict';

/**
 * Logger dedicado do módulo WhatsApp Cloud API.
 *
 * Grava JSON-lines (uma entrada por linha) em arquivos diários:
 *   server/logs/whatsapp-YYYY-MM-DD.log
 *
 * Cada entrada inclui timestamp ISO, tag (etapa do fluxo) e o payload de
 * debug. Tokens e cabeçalhos sensíveis nunca são gravados — use o helper
 * `mascarar` se precisar incluir campos do tipo Authorization.
 *
 * Uso:
 *   const log = require('./logger');
 *   log('webhook.recebido', { from, type, wamid });
 *   log.err('cloudApi.sendText.falhou', { err: e.message });
 */

const fs = require('fs');
const path = require('path');

const PASTA_LOGS = path.join(__dirname, '../../logs');

// Garante o diretório de logs ao carregar o módulo
try {
  fs.mkdirSync(PASTA_LOGS, { recursive: true });
} catch (_) {
  // Falha de filesystem não derruba o app — apenas perde o log
}

/**
 * Caminho do arquivo do dia atual.
 * @returns {string}
 */
function caminhoArquivoHoje() {
  const hoje = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(PASTA_LOGS, `whatsapp-${hoje}.log`);
}

/**
 * Remove chaves sensíveis do payload de log (cópia rasa).
 * @param {*} obj
 * @returns {*}
 */
function sanitizar(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizar);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const lk = k.toLowerCase();
    if (lk === 'authorization' || lk === 'access_token' || lk === 'app_secret' || lk === 'verify_token') {
      out[k] = v ? `<***${String(v).slice(-4)}>` : v;
    } else if (lk === 'x-hub-signature-256') {
      out[k] = v ? '<sha256-redacted>' : v;
    } else if (v && typeof v === 'object') {
      out[k] = sanitizar(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Grava uma linha de log em formato JSON-Lines.
 * @param {string} nivel - info|warn|error
 * @param {string} tag
 * @param {*} payload
 */
function gravar(nivel, tag, payload) {
  const linha = JSON.stringify({
    ts: new Date().toISOString(),
    nivel,
    tag,
    pid: process.pid,
    ...(payload && typeof payload === 'object' ? { data: sanitizar(payload) } : { data: payload }),
  });
  try {
    fs.appendFileSync(caminhoArquivoHoje(), linha + '\n');
  } catch (e) {
    // Fallback para console se o disco falhar — não derruba o pedido
    // eslint-disable-next-line no-console
    console.error('[wpp-logger] falha ao gravar log:', e.message);
  }
}

/**
 * Logger primário: log(tag, data) → nível info.
 * @param {string} tag
 * @param {*} data
 */
function log(tag, data) {
  gravar('info', tag, data);
}

log.warn = (tag, data) => gravar('warn', tag, data);
log.err = (tag, data) => gravar('error', tag, data);
log.sanitizar = sanitizar;

module.exports = log;
