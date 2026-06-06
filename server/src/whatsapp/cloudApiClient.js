'use strict';

/**
 * Cliente HTTP para a Graph API do Meta (WhatsApp Cloud API).
 * Encapsula todos os endpoints de mensagens, mídia e templates.
 * NUNCA loga access_token ou dados sensíveis.
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');
const log = require('./logger');

// Pasta base de mídia (relativa ao __dirname deste arquivo: src/whatsapp/)
const PASTA_MIDIAS_BASE = path.join(__dirname, '../uploads/midias');

// Extensões permitidas (lista branca) — evita salvar arquivos com extensão arbitrária
const MIME_PARA_EXTENSAO = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/ogg': 'ogg',
  'audio/ogg; codecs=opus': 'oga',
  'audio/opus': 'oga',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/**
 * Retorna a versão da Graph API a usar.
 * @param {Object} config - configuração da empresa
 * @returns {string}
 */
function obterVersaoApi(config) {
  return config.graph_api_version || process.env.GRAPH_API_VERSION || 'v25.0';
}

/**
 * Mapeia código de erro da Cloud API para mensagem PT-BR.
 * @param {number|string} errorCode - código de erro retornado pelo Meta
 * @returns {string} mensagem legível
 */
function mapearErroMeta(errorCode) {
  const codigo = Number(errorCode);
  switch (codigo) {
    case 131047:
      return 'Janela de 24h encerrada. Envie um template para reabrir o contato.';
    case 131026:
      return 'Mensagem não entregável: número inválido ou bloqueou o contato.';
    case 131056:
      return 'Limite de mensagens por par atingido. Tente novamente em instantes.';
    case 190:
      return 'Token de acesso Meta inválido ou expirado. Renove as credenciais.';
    case 132001:
      return 'Template inexistente ou não aprovado. Atualize a lista de templates.';
    case 132000:
      return 'Número incorreto de parâmetros no template.';
    case 100:
      return 'Parâmetro inválido (verifique phone_number_id e waba_id nas configurações).';
    case 80007:
      return 'Limite geral de requisições atingido. Aguarde e tente novamente.';
    default:
      return `Erro na API do WhatsApp (código ${errorCode}).`;
  }
}

/**
 * Determina se o código de erro pode ser retentado com backoff.
 * Apenas 131056 e 80007 são elegíveis.
 * @param {number} errorCode
 * @returns {boolean}
 */
function podeTentar(errorCode) {
  return errorCode === 131056 || errorCode === 80007;
}

/**
 * Executa uma chamada axios com retry exponencial para erros elegíveis.
 * Atrasos: 1s, 2s, 4s (máximo 3 tentativas após a inicial).
 * @param {Function} fn - função que retorna a promise axios
 * @returns {Promise<any>}
 */
async function comRetry(fn) {
  const delays = [1000, 2000, 4000];
  let ultimoErro;

  for (let tentativa = 0; tentativa <= delays.length; tentativa++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      const codigoMeta = err.response && err.response.data && err.response.data.error
        ? Number(err.response.data.error.code)
        : null;

      log.err('cloudApi.requisicao.falhou', {
        tentativa, codigoMeta,
        httpStatus: err.response && err.response.status,
        respBody: err.response && err.response.data,
        url: err.config && err.config.url,
        method: err.config && err.config.method,
        msg: err.message,
      });

      // Só tenta novamente em erros específicos e se ainda há tentativas restantes
      if (codigoMeta && podeTentar(codigoMeta) && tentativa < delays.length) {
        log('cloudApi.requisicao.retry', { tentativa, delay: delays[tentativa] });
        await new Promise(resolve => setTimeout(resolve, delays[tentativa]));
        continue;
      }
      break;
    }
  }

  // axios lança em respostas não-2xx; mapeia o erro do Meta para mensagem PT-BR
  // antes de propagar, preservando metaCode para a lógica do chamador (ex: janela fechada).
  const codigoFinal = ultimoErro && ultimoErro.response && ultimoErro.response.data
    && ultimoErro.response.data.error
    ? ultimoErro.response.data.error.code
    : null;

  if (codigoFinal != null) {
    const erro = new Error(mapearErroMeta(codigoFinal));
    erro.metaCode = Number(codigoFinal);
    erro.metaDetails = ultimoErro.response.data.error;
    throw erro;
  }

  throw ultimoErro;
}

/**
 * Lança um erro formatado com a mensagem PT-BR quando a API retorna falha.
 * @param {Object} resposta - resposta axios
 */
function verificarErroResposta(resposta) {
  const data = resposta.data || {};
  if (data.error) {
    const codigo = data.error.code;
    const mensagem = mapearErroMeta(codigo);
    const erro = new Error(mensagem);
    erro.metaCode = codigo;
    erro.metaDetails = data.error;
    throw erro;
  }
}

/**
 * Extrai o wamid do retorno da API de envio de mensagem.
 * @param {Object} data - corpo da resposta
 * @returns {string|null}
 */
function extrairWamid(data) {
  if (data && data.messages && data.messages[0] && data.messages[0].id) {
    return data.messages[0].id;
  }
  return null;
}

/**
 * Envia mensagem de texto simples.
 * @param {Object} config - credenciais da empresa
 * @param {string} to - número E.164 sem '+' (ex: 5541999999999)
 * @param {string} text - corpo da mensagem
 * @param {string} [replyToWamid] - wamid da mensagem a ser citada (opcional)
 * @returns {Promise<{wamid: string}>}
 */
async function sendText(config, to, text, replyToWamid = null) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: {
      body: text,
      preview_url: false,
    },
  };

  if (replyToWamid) {
    body.context = { message_id: replyToWamid };
  }

  log('cloudApi.sendText.req', { url, to, replyToWamid, textLen: (text || '').length });

  const resposta = await comRetry(() =>
    axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  );

  verificarErroResposta(resposta);
  const wamid = extrairWamid(resposta.data);
  log('cloudApi.sendText.ok', { wamid, respBody: resposta.data });
  return { wamid };
}

/**
 * Envia (ou remove) uma reação a uma mensagem existente.
 * O WhatsApp Cloud API aceita type:'reaction' com o wamid da mensagem alvo.
 * Para REMOVER a reação, envie emoji vazio ('').
 * @param {Object} config
 * @param {string} to - wa_id do destinatário (contato da conversa)
 * @param {string} messageWamid - wamid da mensagem que receberá a reação
 * @param {string} emoji - emoji da reação, ou '' para remover
 * @returns {Promise<{wamid: string}>}
 */
async function sendReaction(config, to, messageWamid, emoji) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'reaction',
    reaction: {
      message_id: messageWamid,
      emoji: emoji || '',
    },
  };

  log('cloudApi.sendReaction.req', { url, to, messageWamid, hasEmoji: !!emoji });

  const resposta = await comRetry(() =>
    axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  );

  verificarErroResposta(resposta);
  const wamid = extrairWamid(resposta.data);
  log('cloudApi.sendReaction.ok', { wamid, respBody: resposta.data });
  return { wamid };
}

/**
 * Envia mensagem de mídia (image/document/audio/video).
 * Aceita envio por mediaId (upload prévio) ou link direto.
 * @param {Object} config
 * @param {string} to
 * @param {'image'|'document'|'audio'|'video'} mediaType
 * @param {Object} mediaParams - { id?, link?, caption?, filename? }
 * @param {string} [replyToWamid]
 * @returns {Promise<{wamid: string}>}
 */
async function sendMedia(config, to, mediaType, mediaParams, replyToWamid = null) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}/messages`;

  const objetoMidia = {};
  if (mediaParams.id) {
    objetoMidia.id = mediaParams.id;
  } else if (mediaParams.link) {
    objetoMidia.link = mediaParams.link;
  }
  // voice: true marca o áudio como NOTA DE VOZ (ícone de microfone, foto de
  // perfil, download automático e transcrição). Sem isso vira "áudio básico".
  // Exige arquivo OGG/OPUS mono — que é o que o backend gera no save-anexo.
  if (mediaType === 'audio') {
    objetoMidia.voice = true;
  }
  // caption: válido para image/video/document (NÃO para audio — Meta retorna erro 100)
  if (mediaParams.caption && mediaType !== 'audio') {
    objetoMidia.caption = mediaParams.caption;
  }
  // filename: APENAS para document. Em image/video/audio, Meta rejeita com erro 100
  // ("Parâmetro inválido"). Foi esta combinação que quebrou o envio de imagem antes.
  if (mediaParams.filename && mediaType === 'document') {
    objetoMidia.filename = mediaParams.filename;
  }

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: mediaType,
    [mediaType]: objetoMidia,
  };

  if (replyToWamid) {
    body.context = { message_id: replyToWamid };
  }

  log('cloudApi.sendMedia.req', { url, to, mediaType, body });

  const resposta = await comRetry(() =>
    axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  );

  verificarErroResposta(resposta);
  const wamid = extrairWamid(resposta.data);
  log('cloudApi.sendMedia.ok', { wamid, mediaType, respBody: resposta.data });
  return { wamid };
}

/**
 * Envia template aprovado (fora da janela de 24h).
 * @param {Object} config
 * @param {string} to
 * @param {string} templateName
 * @param {string} languageCode - ex: 'pt_BR'
 * @param {Array} components - array de componentes com parâmetros
 * @returns {Promise<{wamid: string}>}
 */
async function sendTemplate(config, to, templateName, languageCode, components) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'template',
    template: {
      name: templateName,
      language: { code: languageCode },
      components: components || [],
    },
  };

  const resposta = await comRetry(() =>
    axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  );

  verificarErroResposta(resposta);
  return { wamid: extrairWamid(resposta.data) };
}

/**
 * Marca mensagem como lida (envia status:read para a Cloud API).
 * @param {Object} config
 * @param {string} wamid - ID da mensagem a marcar
 * @returns {Promise<void>}
 */
async function markAsRead(config, wamid) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: wamid,
  };

  const resposta = await comRetry(() =>
    axios.post(url, body, {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    })
  );

  verificarErroResposta(resposta);
}

/**
 * Faz upload de mídia para a Cloud API e retorna o media_id.
 * @param {Object} config
 * @param {Buffer} fileBuffer - conteúdo do arquivo
 * @param {string} mimeType - ex: 'image/jpeg'
 * @param {string} filename
 * @returns {Promise<string>} media_id retornado pelo Meta
 */
async function uploadMedia(config, fileBuffer, mimeType, filename) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}/media`;

  const form = new FormData();
  form.append('messaging_product', 'whatsapp');
  form.append('type', mimeType);
  form.append('file', fileBuffer, {
    filename,
    contentType: mimeType,
  });

  log('cloudApi.uploadMedia.req', {
    url, mimeType, filename, bufferSize: fileBuffer && fileBuffer.length,
  });

  const resposta = await comRetry(() =>
    axios.post(url, form, {
      headers: {
        Authorization: `Bearer ${config.access_token}`,
        ...form.getHeaders(),
      },
      timeout: 60000,
    })
  );

  verificarErroResposta(resposta);

  const mediaId = resposta.data && resposta.data.id;
  if (!mediaId) {
    log.err('cloudApi.uploadMedia.sem_id', { respBody: resposta.data });
    throw new Error('Upload de mídia não retornou media_id.');
  }
  log('cloudApi.uploadMedia.ok', { mediaId, respBody: resposta.data });
  return mediaId;
}

/**
 * Busca a URL temporária de download de uma mídia pelo media_id.
 * @param {Object} config
 * @param {string} mediaId
 * @returns {Promise<{url: string, mime_type: string, file_size: number}>}
 */
async function getMediaUrl(config, mediaId) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${mediaId}`;

  const resposta = await axios.get(url, {
    headers: {
      Authorization: `Bearer ${config.access_token}`,
    },
    timeout: 30000,
  });

  verificarErroResposta(resposta);
  return {
    url: resposta.data.url,
    mime_type: resposta.data.mime_type,
    file_size: resposta.data.file_size,
  };
}

/**
 * Baixa o arquivo de mídia a partir da URL temporária e salva em /uploads/midias/{empresaId}/.
 * A URL expira em minutos — chamar imediatamente após getMediaUrl.
 * @param {Object} config
 * @param {string} mediaUrl - URL temporária retornada pelo Meta
 * @param {string} mimeType
 * @param {number} empresaId - usado para organizar subpasta
 * @returns {Promise<string>} path relativo servível (ex: midias/1/uuid.jpg)
 */
async function downloadMedia(config, mediaUrl, mimeType, empresaId) {
  // Valida empresaId como inteiro para evitar path traversal
  const idEmpresa = parseInt(empresaId, 10);
  if (!idEmpresa || idEmpresa <= 0) {
    throw new Error('empresaId inválido para download de mídia.');
  }

  // Infere extensão pela lista branca; fallback seguro para .bin
  const mimeBase = (mimeType || '').split(';')[0].trim().toLowerCase();
  const extensao = MIME_PARA_EXTENSAO[mimeBase] || 'bin';

  // Gera nome de arquivo via UUID local — não usa nada vindo do Meta
  const nomeArquivo = `${crypto.randomUUID()}.${extensao}`;

  // Cria pasta da empresa se não existir
  const pastaEmpresa = path.join(PASTA_MIDIAS_BASE, String(idEmpresa));
  fs.mkdirSync(pastaEmpresa, { recursive: true });

  const caminhoCompleto = path.join(pastaEmpresa, nomeArquivo);

  log('cloudApi.downloadMedia.inicio', { mimeType, empresaId, caminhoCompleto });

  // Baixa o arquivo com timeout estendido (arquivo pode ser grande)
  const resposta = await axios.get(mediaUrl, {
    headers: {
      Authorization: `Bearer ${config.access_token}`,
    },
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  fs.writeFileSync(caminhoCompleto, Buffer.from(resposta.data));

  log('cloudApi.downloadMedia.ok', {
    caminhoCompleto, bytes: resposta.data && resposta.data.byteLength,
  });

  // Retorna path relativo servível pelo endpoint /uploads
  return `midias/${idEmpresa}/${nomeArquivo}`;
}

/**
 * Busca informações do número conectado na Meta (valida credenciais ao vivo).
 * Faz GET /{phone_number_id} na Graph API com o access_token salvo. Em caso de
 * token inválido/expirado ou phone_number_id incorreto, axios lança e comRetry
 * mapeia o erro do Meta para mensagem PT-BR (com erro.metaCode preservado).
 * @param {Object} config - credenciais da empresa
 * @returns {Promise<{verified_name, display_phone_number, quality_rating, code_verification_status, platform_type}>}
 */
async function getPhoneNumberInfo(config) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.phone_number_id}`;

  const resposta = await comRetry(() =>
    axios.get(url, {
      params: {
        fields: 'verified_name,display_phone_number,quality_rating,code_verification_status,platform_type',
      },
      headers: {
        Authorization: `Bearer ${config.access_token}`,
      },
      timeout: 15000,
    })
  );

  verificarErroResposta(resposta);

  return {
    verified_name: resposta.data.verified_name || null,
    display_phone_number: resposta.data.display_phone_number || null,
    quality_rating: resposta.data.quality_rating || null,
    code_verification_status: resposta.data.code_verification_status || null,
    platform_type: resposta.data.platform_type || null,
  };
}

/**
 * Lista templates aprovados da conta WABA.
 * Filtra apenas status=APPROVED.
 * @param {Object} config
 * @returns {Promise<Array>} lista de templates com name, status, category, language, components
 */
async function listTemplates(config) {
  const versao = obterVersaoApi(config);
  const url = `https://graph.facebook.com/${versao}/${config.waba_id}/message_templates`;

  const resposta = await axios.get(url, {
    params: {
      fields: 'name,status,category,language,components',
      limit: 100,
    },
    headers: {
      Authorization: `Bearer ${config.access_token}`,
    },
    timeout: 30000,
  });

  verificarErroResposta(resposta);

  const templates = (resposta.data && resposta.data.data) || [];
  return templates.filter(t => t.status === 'APPROVED');
}

module.exports = {
  sendText,
  sendReaction,
  sendMedia,
  sendTemplate,
  markAsRead,
  uploadMedia,
  getMediaUrl,
  downloadMedia,
  listTemplates,
  getPhoneNumberInfo,
  mapearErroMeta,
};
