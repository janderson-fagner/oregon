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
  return config.graph_api_version || process.env.GRAPH_API_VERSION || 'v23.0';
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

      // Só tenta novamente em erros específicos e se ainda há tentativas restantes
      if (codigoMeta && podeTentar(codigoMeta) && tentativa < delays.length) {
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
  if (mediaParams.caption) objetoMidia.caption = mediaParams.caption;
  if (mediaParams.filename) objetoMidia.filename = mediaParams.filename;

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
    throw new Error('Upload de mídia não retornou media_id.');
  }
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

  // Baixa o arquivo com timeout estendido (arquivo pode ser grande)
  const resposta = await axios.get(mediaUrl, {
    headers: {
      Authorization: `Bearer ${config.access_token}`,
    },
    responseType: 'arraybuffer',
    timeout: 60000,
  });

  fs.writeFileSync(caminhoCompleto, Buffer.from(resposta.data));

  // Retorna path relativo servível pelo endpoint /uploads
  return `midias/${idEmpresa}/${nomeArquivo}`;
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
  sendMedia,
  sendTemplate,
  markAsRead,
  uploadMedia,
  getMediaUrl,
  downloadMedia,
  listTemplates,
  mapearErroMeta,
};
