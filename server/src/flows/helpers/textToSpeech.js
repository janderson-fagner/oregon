/**
 * 🎤 TEXT-TO-SPEECH - Conversão de texto em áudio natural
 * 
 * Usa ElevenLabs API com otimizações para voz mais humanizada
 * Suporta vozes em português brasileiro com entonação natural
 */

const fs = require('fs').promises;
const path = require('path');
const dbQuery = require('../../utils/dbHelper');
const { GoogleGenAI } = require('@google/genai');

/**
 * Parse seguro de JSON
 */
function parseJSON(value) {
    if (!value) return null;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
        return value;
    }
}

/**
 * Converte número (0-59) para palavras em português
 * Usado para normalização de datas e horários para TTS
 * @param {Number} num - Número a converter
 * @returns {String} - Número por extenso
 */
function numberToWords(num) {
    const unidades = [
        'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
        'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete',
        'dezoito', 'dezenove'
    ];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta'];

    if (num < 20) return unidades[num];
    if (num < 60) {
        const d = Math.floor(num / 10);
        const u = num % 10;
        return u === 0 ? dezenas[d] : `${dezenas[d]} e ${unidades[u]}`;
    }
    return String(num);
}

/**
 * 💰 Converte valor monetário para português por extenso
 * @param {Number|String} valor - Valor numérico ou string como "306,90"
 * @returns {String} - Valor por extenso em português
 * @example valorPorExtenso(306.90) → "trezentos e seis reais e noventa centavos"
 */
function valorPorExtenso(valor) {
    // Normalizar entrada
    let num = valor;
    if (typeof valor === 'string') {
        // Remover R$, espaços e pontos de milhar, converter vírgula para ponto
        num = parseFloat(valor.replace(/[R$\s.]/g, '').replace(',', '.'));
    }

    if (isNaN(num) || num === 0) return 'zero reais';

    const unidades = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove',
        'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
    const dezenas = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const centenas = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

    function converterMenorQue1000(n) {
        if (n === 0) return '';
        if (n === 100) return 'cem';

        let resultado = '';
        if (n >= 100) {
            resultado = centenas[Math.floor(n / 100)];
            n = n % 100;
            if (n > 0) resultado += ' e ';
        }
        if (n >= 20) {
            resultado += dezenas[Math.floor(n / 10)];
            n = n % 10;
            if (n > 0) resultado += ' e ';
        }
        if (n > 0 && n < 20) {
            resultado += unidades[n];
        }
        return resultado;
    }

    function converterInteiro(n) {
        if (n === 0) return '';
        let resultado = '';

        if (n >= 1000) {
            const milhares = Math.floor(n / 1000);
            resultado = milhares === 1 ? 'mil' : converterMenorQue1000(milhares) + ' mil';
            n = n % 1000;
            if (n > 0) resultado += n < 100 ? ' e ' : ' ';
        }

        resultado += converterMenorQue1000(n);
        return resultado.trim();
    }

    const reais = Math.floor(num);
    const centavos = Math.round((num - reais) * 100);

    let resultado = '';
    if (reais > 0) {
        resultado = converterInteiro(reais) + (reais === 1 ? ' real' : ' reais');
    }
    if (centavos > 0) {
        if (reais > 0) resultado += ' e ';
        resultado += converterInteiro(centavos) + (centavos === 1 ? ' centavo' : ' centavos');
    }

    return resultado || 'zero reais';
}

/**
 * 🎤 FORMATAÇÃO DE TEXTO PARA FALA NATURAL (PT-BR)
 *
 * Converte texto para formato otimizado para TTS:
 * - Datas: DD/MM → "dia de mês"
 * - Horários: HH:MM → "X horas" ou "X e meia"
 * - Funciona como backup/complemento à normalização nativa do ElevenLabs
 *
 * @param {String} text - Texto original
 * @returns {String} - Texto formatado para fala natural
 */
function formatTextForSpeech(text) {
    if (!text) return '';

    let result = text;

    // Meses por extenso em português
    const meses = [
        'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
        'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
    ];

    // Converter datas DD/MM ou DD/MM/YYYY para "X de mês"
    result = result.replace(/(\d{1,2})\/(\d{1,2})(?:\/\d{4})?/g, (match, dia, mes) => {
        const diaNum = parseInt(dia, 10);
        const mesNum = parseInt(mes, 10);
        if (mesNum >= 1 && mesNum <= 12) {
            return `${numberToWords(diaNum)} de ${meses[mesNum - 1]}`;
        }
        return match;
    });

    // Converter horários HH:MM para "X horas" ou "X e meia"
    result = result.replace(/(\d{1,2}):(\d{2})/g, (match, hora, minuto) => {
        const h = parseInt(hora, 10);
        const m = parseInt(minuto, 10);

        if (m === 0) {
            return `${numberToWords(h)} horas`;
        } else if (m === 30) {
            return `${numberToWords(h)} e meia`;
        } else {
            return `${numberToWords(h)} e ${numberToWords(m)}`;
        }
    });

    return result;
}

/**
 * Obtém configurações de áudio do banco
 * @param {Number} empresa_id - ID da empresa (obrigatório - multi-tenant)
 */
async function getAudioConfig(empresa_id) {
    if (!empresa_id) {
        console.error('❌ getAudioConfig: empresa_id é obrigatório!');
        throw new Error('empresa_id é obrigatório para buscar configuração de áudio');
    }

    console.log('🔊 Buscando configurações de áudio... (empresa_id:', empresa_id, ')');

    const rows = await dbQuery(`SELECT * FROM Options WHERE type IN (
        "gemini_audio",
        "gemini_comportamento",
        "elevenlabs_key",
        "elevenlabs_voice_id"
    ) AND empresa_id = ?`, [parseInt(empresa_id)]);
    
    const get = (t) => {
        const r = rows.find(x => x.type === t);
        return r ? r.value : null;
    };
    
    const config = {
        audio: parseJSON(get('gemini_audio')) || {},
        comportamento: parseJSON(get('gemini_comportamento')) || {},
        apiKey: get('elevenlabs_key') || process.env.ELEVENLABS_API_KEY || null,
        customVoiceId: get('elevenlabs_voice_id') || null
    };
    
    console.log('✅ Configuração de áudio carregada:');
    console.log('   ✅ Áudio ativo:', config.audio.ativo || false);
    console.log('   🔑 API Key ElevenLabs:', config.apiKey ? '✓ Configurada' : '✗ Não encontrada');
    console.log('   🎤 Voice ID (lista):', config.audio.voiceId || 'Não selecionado');
    console.log('   🎤 Voice ID (personalizado):', config.audio.customVoiceId || 'Não definido');
    console.log('   🎤 Voice ID (banco):', config.customVoiceId || 'Não definido');

    return config;
}

/**
 * 🎤 VOZES RECOMENDADAS PARA PORTUGUÊS BRASILEIRO
 * 
 * Vozes mais naturais e com melhor entonação para PT-BR:
 * - Rachel (21m00Tcm4TlvDq8ikWAM): Voz feminina profissional, clara
 * - Charlotte (XB0fDUnXU5powFXDhCwa): Voz feminina suave, amigável
 * - Sarah (EXAVITQu4vr4xnSDxMaL): Voz feminina expressiva
 * - Antoni (ErXwobaYiN019PkySvjV): Voz masculina profissional
 * - Adam (pNInz6obpgDQGcFmaJgB): Voz masculina confiante
 * - Nicole (piTKgcLEGmPE4e6mEKli): Voz feminina brasileira natural
 */
const VOICE_PRESETS = {
    // Vozes femininas otimizadas para PT-BR
    feminino: {
        id: 'KHmfNHtEjHhLK9eER20w', // Nicole - voz brasileira natural
        backup: 'XB0fDUnXU5powFXDhCwa', // Charlotte
        name: 'Nicole (PT-BR)'
    },
    // Vozes masculinas otimizadas para PT-BR
    masculino: {
        id: 'GnDrTQvdzZ7wqAKfLzVQ', // Adam
        backup: 'ErXwobaYiN019PkySvjV', // Antoni
        name: 'Adam (Profissional)'
    },
    // Voz neutra (feminina por padrão - mais amigável para atendimento)
    neutro: {
        id: 'KHmfNHtEjHhLK9eER20w', // Nicole
        backup: 'XB0fDUnXU5powFXDhCwa',
        name: 'Nicole (PT-BR)'
    }
};

/**
 * Obtém voice ID baseado no gênero configurado
 */
function getVoiceByGender(genero, customVoiceId = null) {
    // Se tem voice ID customizado, usar ele
    if (customVoiceId) {
        return customVoiceId;
    }
    
    const preset = VOICE_PRESETS[genero] || VOICE_PRESETS.neutro;
    return preset.id;
}

/**
 * 🎯 CONFIGURAÇÕES DE VOZ NATURAL - ElevenLabs v3
 *
 * Para modelo eleven_v3, os parâmetros de voice_settings são:
 * - stability: 0.0 (Creative), 0.5 (Natural), 1.0 (Robust)
 * - similarity_boost: 0.0 a 1.0 (quanto maior, mais fiel à voz original)
 * - style: 0.0 a 1.0 (exagero de estilo - valores baixos são mais naturais)
 * - use_speaker_boost: true/false (melhora clareza)
 *
 * ⚠️ IMPORTANTE para v3: stability deve ser 0.0, 0.5 ou 1.0!
 */
const NATURAL_VOICE_SETTINGS = {
    // Padrão: Voz clara e natural (v3 Natural mode)
    natural: {
        stability: 0.5,            // Natural mode - balanceado
        similarity_boost: 0.80,    // Mantém características da voz
        style: 0.10,               // Expressividade sutil
        use_speaker_boost: true    // Clareza aprimorada
    },
    // Para mensagens mais formais/profissionais
    professional: {
        stability: 1.0,            // Robust mode - máxima estabilidade
        similarity_boost: 0.85,
        style: 0.05,               // Mínima variação
        use_speaker_boost: true
    },
    // Para mensagens amigáveis/casuais
    friendly: {
        stability: 0.5,            // Natural mode
        similarity_boost: 0.75,
        style: 0.20,               // Expressividade moderada
        use_speaker_boost: true
    },
    // Para mensagens urgentes/alertas
    urgent: {
        stability: 1.0,            // Robust mode - estável
        similarity_boost: 0.85,
        style: 0.25,               // Mais ênfase
        use_speaker_boost: true
    }
};

/**
 * Converte instrução de voz em português para audio tag do ElevenLabs v3
 * Audio tags devem ser em inglês, curtas e descritivas
 * @param {String} instrucao - Instrução em português do banco
 * @returns {String} - Audio tag formatada para ElevenLabs v3
 */
function buildAudioTagFromInstrucao(instrucao) {
    if (!instrucao) {
        return '[Santa Catarina Southern Brazilian Portuguese accent, natural warm female voice, moderate pace]';
    }

    const lower = instrucao.toLowerCase();
    const tags = [];

    // Detectar sotaque regional
    if (lower.includes('florianópolis') || lower.includes('floripa') || lower.includes('sul') || lower.includes('catarinense') || lower.includes('santa catarina')) {
        tags.push('Santa Catarina Southern Brazilian Portuguese accent');
    } else if (lower.includes('paulista') || lower.includes('são paulo')) {
        tags.push('São Paulo Brazilian Portuguese accent');
    } else if (lower.includes('carioca') || lower.includes('rio de janeiro')) {
        tags.push('Rio de Janeiro Brazilian Portuguese accent');
    } else if (lower.includes('mineiro') || lower.includes('minas')) {
        tags.push('Minas Gerais Brazilian Portuguese accent');
    } else if (lower.includes('nordest') || lower.includes('baiano') || lower.includes('recife')) {
        tags.push('Northeastern Brazilian Portuguese accent');
    } else {
        tags.push('Santa Catarina Southern Brazilian Portuguese accent');
    }

    // Detectar velocidade (checar padrões compostos ANTES dos simples)
    if (lower.includes('nem muito rápida nem muito devagar') || lower.includes('nem muito rapida nem muito devagar') || lower.includes('moderada') || lower.includes('velocidade média')) {
        tags.push('moderate pace');
    } else if (lower.includes('rápid') || lower.includes('rapida')) {
        tags.push('fast pace');
    } else if (lower.includes('devagar') || lower.includes('lent')) {
        tags.push('slow pace');
    } else {
        tags.push('moderate pace');
    }

    // Detectar estilo
    if (lower.includes('human') || lower.includes('natural')) {
        tags.push('natural warm voice');
    }
    if (lower.includes('simpátic') || lower.includes('amigável') || lower.includes('friendly')) {
        tags.push('friendly');
    }
    if (lower.includes('profissional')) {
        tags.push('professional');
    }

    return `[${tags.join(', ')}]`;
}

/**
 * Detecta o tom ideal para a mensagem
 */
function detectMessageTone(text) {
    const textLower = (text || '').toLowerCase();
    
    // Mensagens urgentes
    if (textLower.includes('urgente') || textLower.includes('importante') || 
        textLower.includes('atenção') || textLower.includes('aviso')) {
        return 'urgent';
    }
    
    // Mensagens formais
    if (textLower.includes('prezado') || textLower.includes('confirma') ||
        textLower.includes('agendamento') || textLower.includes('cancelamento')) {
        return 'professional';
    }
    
    // Mensagens casuais/amigáveis
    if (textLower.includes('oi') || textLower.includes('olá') || 
        textLower.includes('obrigad') || textLower.includes('😊') ||
        textLower.includes('bom dia') || textLower.includes('boa tarde')) {
        return 'friendly';
    }
    
    return 'natural';
}

/**
 * Gera áudio usando ElevenLabs TTS com configurações otimizadas
 * 
 * ⚠️ IMPORTANTE: Parâmetros ajustados para evitar voz sussurrada:
 * - stability ALTO (0.65-0.80) = voz clara e consistente
 * - style BAIXO (0.0-0.20) = evita distorções
 */
async function generateElevenLabsTTS(text, voiceId, apiKey, options = {}) {
    console.log('🎙️ Gerando áudio com ElevenLabs TTS...');
    console.log('   📝 Texto:', text.substring(0, 80) + (text.length > 80 ? '...' : ''));
    console.log('   🎤 Voice ID:', voiceId);
    
    try {
        const https = require('https');
        
        // Detectar tom da mensagem para ajustar configurações
        const tone = detectMessageTone(text);
        const voiceSettings = NATURAL_VOICE_SETTINGS[tone] || NATURAL_VOICE_SETTINGS.natural;
        
        console.log(`   🎯 Tom detectado: ${tone}`);
        console.log(`   ⚙️ Settings: stability=${voiceSettings.stability}, similarity=${voiceSettings.similarity_boost}, style=${voiceSettings.style}`);
        
        // Usar modelo v3 para maior expressividade e suporte a audio tags
        // v3 suporta 70+ idiomas incluindo PT-BR e é mais natural/expressivo
        const modelId = options.model_id || 'eleven_v3';
        
        // Combinar configurações padrão com opções customizadas
        // Para v3: stability deve ser 0.0, 0.5 ou 1.0
        const requestedStability = options.stability ?? voiceSettings.stability;
        // Mapear para o valor válido mais próximo do v3
        let v3Stability = 0.5; // default: Natural
        if (requestedStability <= 0.25) v3Stability = 0.0; // Creative
        else if (requestedStability >= 0.75) v3Stability = 1.0; // Robust
        else v3Stability = 0.5; // Natural

        const finalSettings = {
            stability: v3Stability,
            similarity_boost: Math.max(0.70, options.similarity_boost ?? voiceSettings.similarity_boost),
            style: Math.min(0.30, options.style ?? voiceSettings.style), // Limitar style para evitar distorções
            use_speaker_boost: options.use_speaker_boost ?? voiceSettings.use_speaker_boost
        };
        
        console.log(`   ✅ Settings finais: stability=${finalSettings.stability}, similarity=${finalSettings.similarity_boost}, style=${finalSettings.style}`);
        
        // Buscar instrução de voz customizada do banco (ex: sotaque, estilo de fala)
        const instrucaoVoz = options.instrucaoVoz || '';

        // Montar texto com audio tag de sotaque para eleven_v3
        // Audio tags controlam o sotaque e estilo de fala por request
        // IMPORTANTE: audio tags devem ser em inglês e curtas para o ElevenLabs entender
        let finalText = text;
        if (modelId === 'eleven_v3') {
            // Construir audio tag baseada na instrução do banco
            const audioTag = buildAudioTagFromInstrucao(instrucaoVoz);
            finalText = `${audioTag} ${text}`;
            console.log(`   🗣️ Audio tag: ${audioTag}`);
        }

        // Remover use_speaker_boost para eleven_v3 (não suportado)
        const settingsForApi = { ...finalSettings };
        if (modelId === 'eleven_v3') {
            delete settingsForApi.use_speaker_boost;
        }

        const postData = JSON.stringify({
            text: finalText,
            model_id: modelId,
            voice_settings: settingsForApi,
            // Forçar idioma português para consistência de sotaque
            language_code: 'pt',
            // Normalização automática de datas, horários e valores para PT-BR
            apply_text_normalization: 'on'
        });
        
        const response = await new Promise((resolve, reject) => {
            const reqOptions = {
                hostname: 'api.elevenlabs.io',
                port: 443,
                path: `/v1/text-to-speech/${voiceId}`,
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey,
                    'Content-Length': Buffer.byteLength(postData)
                }
            };
            
            const req = https.request(reqOptions, (res) => {
                const chunks = [];
                
                res.on('data', (chunk) => chunks.push(chunk));
                
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        const errorBody = Buffer.concat(chunks).toString();
                        reject(new Error(`ElevenLabs API error: ${res.statusCode} - ${errorBody}`));
                        return;
                    }
                    resolve(Buffer.concat(chunks));
                });
            });
            
            req.on('error', reject);
            req.write(postData);
            req.end();
        });
        
        console.log('✅ Áudio gerado:', response.length, 'bytes');
        return response;
        
    } catch (error) {
        console.error('❌ Erro ElevenLabs TTS:', error.message);
        throw error;
    }
}

/**
 * Salva buffer de áudio em arquivo
 */
async function saveAudioFile(audioBuffer, filename, extension = 'mp3') {
    const audioDir = path.join(__dirname, '../../uploads/audio-tts');
    
    try {
        await fs.mkdir(audioDir, { recursive: true });
    } catch (error) {
        // Diretório já existe
    }
    
    const timestamp = Date.now();
    const filePath = path.join(audioDir, `${filename}-${timestamp}.${extension}`);
    
    await fs.writeFile(filePath, audioBuffer);
    console.log('💾 Áudio salvo:', filePath);
    
    return filePath;
}

/**
 * 🧹 LIMPEZA INTELIGENTE DE TEXTO PARA TTS
 *
 * Prepara o texto para síntese de voz natural:
 * - Remove formatação de chat (negrito, itálico)
 * - Converte emojis em pausas ou remove
 * - Mantém pontuação para entonação correta
 * - Expande abreviações comuns
 */
function cleanTextForTTS(text) {
    if (!text) return '';

    // SANITIZAÇÃO ROBUSTA DE UNICODE
    // Remover unpaired surrogates e caracteres problemáticos para ElevenLabs
    let sanitized = text
        // Remover unpaired surrogates (causa "invalid Unicode" no ElevenLabs)
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
        .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
        // Remover todos os emojis compostos com ZWJ que podem conter surrogates
        .replace(/(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*/gu, '');

    // ═══════════════════════════════════════════════════════════════════
    // 🎭 PRESERVAR TAGS DE EMOÇÃO PARA ELEVENLABS v3
    // ═══════════════════════════════════════════════════════════════════
    const emotionTagPattern = /\[(warmly|cheerfully|reassuringly|whispers|giggles|laughs|laughs harder|starts laughing|sighs|sadly|excitedly|nervously|calmly|seriously|playfully|thoughtfully|urgently|gently|firmly|softly|loudly|slowly|quickly|curious|sarcastic|mischievously|crying)\]/gi;
    const emotionTags = [];
    let tagMatch;
    let tagIndex = 0;

    // Extrair tags de emoção e guardar com placeholder único
    const tempSanitized = sanitized;
    while ((tagMatch = emotionTagPattern.exec(tempSanitized)) !== null) {
        // Usar placeholder que não será afetado pela limpeza de texto
        emotionTags.push({ tag: tagMatch[0], placeholder: `EMOTIONTAG${tagIndex}PLACEHOLDER` });
        tagIndex++;
    }

    // Substituir tags por placeholders temporários
    for (const t of emotionTags) {
        sanitized = sanitized.replace(t.tag, t.placeholder);
    }

    // Remover caracteres Unicode problemáticos manualmente
    sanitized = sanitized
        // Remover unpaired surrogates (high sem low, low sem high)
        .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
        .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
        // Remover caracteres de controle e especiais inválidos
        .replace(/[\uFFFE\uFFFF\uFEFF]/g, '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
        // Remover caracteres de formatação invisíveis
        .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u206F]/g, '')
        // Remover variation selectors (usados em emojis compostos)
        .replace(/[\uFE00-\uFE0F]/g, '');
    
    // Converter caracteres especiais problemáticos para equivalentes ASCII
    sanitized = sanitized
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/[–—]/g, '-')
        .replace(/[…]/g, '...')
        .replace(/[•·]/g, '-');
    
    let cleaned = sanitized
        // Remover blockquotes markdown (> no início de linhas)
        .replace(/^>\s?/gm, '')
        // Remover timestamps no início de linhas (00:00, 00:01, 12:30, etc)
        .replace(/^\d{1,2}:\d{2}\s*/gm, '')
        // Remover formatação WhatsApp
        .replace(/\*\*([^*]+)\*\*/g, '$1') // **duplo negrito**
        .replace(/\*([^*]+)\*/g, '$1')    // *negrito*
        .replace(/_([^_]+)_/g, '$1')      // _itálico_
        .replace(/~([^~]+)~/g, '$1')      // ~riscado~
        .replace(/```[^`]*```/g, '')      // ```código```
        
        // Converter emojis comuns em pausas naturais
        .replace(/[😊😄😃🙂]/g, '.')       // Sorrisos = pausa
        .replace(/[👋🖐️]/g, '')           // Acenos = remover
        .replace(/[👍✅]/g, ', certo,')    // Confirmação
        .replace(/[❌🚫]/g, ', não,')      // Negação
        .replace(/[📅📆]/g, '')            // Calendário = remover
        .replace(/[⏰🕐]/g, '')            // Relógio = remover
        .replace(/[📍🏠]/g, '')            // Localização = remover
        .replace(/[💼📞]/g, '')            // Trabalho/telefone = remover
        
        // Remover outros emojis
        .replace(/[\u{1F600}-\u{1F64F}]/gu, '')
        .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')
        .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')
        .replace(/[\u{1F700}-\u{1F77F}]/gu, '')
        .replace(/[\u{1F780}-\u{1F7FF}]/gu, '')
        .replace(/[\u{1F800}-\u{1F8FF}]/gu, '')
        .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')
        .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')
        .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')
        .replace(/[\u{2600}-\u{26FF}]/gu, '')
        .replace(/[\u{2700}-\u{27BF}]/gu, '')
        
        // Expandir abreviações para melhor pronúncia
        .replace(/\bvc\b/gi, 'você')
        .replace(/\btbm\b/gi, 'também')
        .replace(/\bpq\b/gi, 'porque')
        .replace(/\bq\b/gi, 'que')
        .replace(/\bhj\b/gi, 'hoje')
        .replace(/\bprox\b/gi, 'próximo')
        .replace(/\bmsg\b/gi, 'mensagem')
        .replace(/\bobs\b/gi, 'observação')
        // Converter valores monetários R$ X.XXX,XX para português por extenso
        .replace(/R\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d+(?:[.,]\d{1,2})?)/gi, (match, valor) => {
            return valorPorExtenso(valor);
        })
        
        // Melhorar pausas naturais
        .replace(/\n+/g, '. ')            // Quebras de linha = pausas
        .replace(/\.{2,}/g, '...')        // Múltiplos pontos = reticências
        .replace(/!{2,}/g, '!')           // Múltiplas exclamações = uma
        .replace(/\?{2,}/g, '?')          // Múltiplas interrogações = uma
        
        // Limpar espaços
        .replace(/\s+/g, ' ')
        .trim();
    
    // Garantir que termina com pontuação para entonação correta
    if (cleaned && !/[.!?]$/.test(cleaned)) {
        cleaned += '.';
    }

    // Aplicar formatação de datas/horários para fala natural (backup à normalização nativa)
    cleaned = formatTextForSpeech(cleaned);

    // ═══════════════════════════════════════════════════════════════════
    // 🎭 RESTAURAR TAGS DE EMOÇÃO DO ELEVENLABS v3
    // ═══════════════════════════════════════════════════════════════════
    for (const t of emotionTags) {
        // Restaurar tag com espaços ao redor para melhor parsing
        cleaned = cleaned.replace(t.placeholder, ' ' + t.tag + ' ');
    }

    // Normalizar espaços ao redor das tags
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

/**
 * Remove audio tags do ElevenLabs de um texto.
 * Usado no fallback quando o TTS falha e a mensagem precisa ser enviada como texto puro.
 * Ex: "[warmly] Oi Amanda!" → "Oi Amanda!"
 */
function stripAudioTags(text) {
    if (!text) return text;
    return text
        // Tags de emoção do ElevenLabs
        .replace(/\[(warmly|cheerfully|reassuringly|whispers|giggles|laughs|laughs harder|starts laughing|sighs|sadly|excitedly|nervously|calmly|seriously|playfully|thoughtfully|urgently|gently|firmly|softly|loudly|slowly|quickly|curious|sarcastic|mischievously|crying)\]\s*/gi, '')
        // Tags genéricas entre colchetes que a IA pode gerar (ex: [audio enviado], [áudio], etc)
        .replace(/\[(?:audio|áudio)\s*[^\]]*\]\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

/**
 * 🎤 FUNÇÃO PRINCIPAL DE TTS
 * Converte texto em áudio natural usando ElevenLabs
 */
async function textToSpeech(text, options = {}, empresa_id) {
    if (!empresa_id) {
        console.error('❌ textToSpeech: empresa_id é obrigatório!');
        return { success: false, error: 'empresa_id é obrigatório para TTS' };
    }
    console.log('\n🎤 === INICIANDO TEXT-TO-SPEECH === (empresa_id:', empresa_id, ')');

    try {
        const config = await getAudioConfig(empresa_id);

        // Verificar se áudio está ativo (pode ser forçado via options.force)
        if (!config.audio.ativo && !options.force) {
            console.log('⚠️ TTS não está ativo nas configurações');
            return { success: false, error: 'TTS não está ativo' };
        }

        if (options.force) {
            console.log('🔧 TTS forçado via options.force');
        }

        // Verificar API Key
        if (!config.apiKey) {
            console.error('❌ API Key do ElevenLabs não configurada');
            return { success: false, error: 'API Key do ElevenLabs não configurada' };
        }
        
        // Limpar texto (sem chamada extra ao Gemini - o prompt principal já formata para áudio)
        const cleanText = cleanTextForTTS(text);

        if (!cleanText || cleanText.length < 3) {
            console.log('⚠️ Texto muito curto ou vazio');
            return { success: false, error: 'Texto inválido para TTS' };
        }

        console.log('📝 Texto limpo:', cleanText.substring(0, 80) + '...');

        // Determinar voice ID com ordem de prioridade:
        // 1. options.voiceId - passado diretamente como opção
        // 2. config.audio.customVoiceId - ID personalizado inserido manualmente (NOVO)
        // 3. config.audio.voiceId - voz selecionada da lista
        // 4. config.customVoiceId - campo antigo do banco (elevenlabs_voice_id)
        // 5. getVoiceByGender - baseado no gênero configurado
        const genero = config.comportamento.genero || 'neutro';
        const voiceId = options.voiceId
            || config.audio.customVoiceId  // ID personalizado tem prioridade
            || config.audio.voiceId
            || config.customVoiceId
            || getVoiceByGender(genero);

        // Identificar qual voz está sendo usada para log
        let voiceSource = 'padrão (gênero)';
        if (options.voiceId) voiceSource = 'opção direta';
        else if (config.audio.customVoiceId) voiceSource = 'ID personalizado';
        else if (config.audio.voiceId) voiceSource = 'selecionada da lista';
        else if (config.customVoiceId) voiceSource = 'banco (elevenlabs_voice_id)';

        console.log(`🎤 Voz: ${voiceId} (fonte: ${voiceSource})`);
        
        // Passar instrução de voz do banco para o gerador de áudio
        // A instrucaoVoz define sotaque e estilo de fala (ex: "sotaque de Florianópolis")
        if (config.audio.instrucaoVoz && !options.instrucaoVoz) {
            options.instrucaoVoz = config.audio.instrucaoVoz;
        }

        // Gerar áudio
        const audioBuffer = await generateElevenLabsTTS(cleanText, voiceId, config.apiKey, options);
        
        // Salvar arquivo
        const filename = options.filename || 'tts';
        const tempMp3Path = await saveAudioFile(audioBuffer, filename, 'mp3');
        
        // Converter para OGG (WhatsApp)
        let audioPath = tempMp3Path;
        
        try {
            const { convertMp3ToOgg } = require('../../zap/message');
            const oggPath = await convertMp3ToOgg(tempMp3Path);
            audioPath = oggPath;
            console.log('✅ Convertido para OGG:', oggPath);
            
            // Remover MP3 temporário
            try {
                await fs.unlink(tempMp3Path);
            } catch (e) {
                // Ignorar erro de remoção
            }
        } catch (error) {
            console.warn('⚠️ Erro na conversão OGG, usando MP3:', error.message);
        }
        
        console.log('✅ TTS concluído!');
        console.log('=====================================\n');
        
        return {
            success: true,
            audioPath,
            extension: audioPath.endsWith('.ogg') ? 'ogg' : 'mp3',
            provider: 'elevenlabs',
            voiceId: voiceId
        };
        
    } catch (error) {
        console.error('❌ Erro no TTS:', error.message);
        return { success: false, error: error.message };
    }
}

/**
 * 🔄 SISTEMA DE ALTERNÂNCIA TEXTO/ÁUDIO
 *
 * Alterna entre texto e áudio para experiência mais natural:
 * - Padrão: TEXTO → TEXTO → ÁUDIO (ciclo de 3) - menos áudio, mais natural
 * - Configurável para diferentes padrões
 */
let ttsMessageCounter = 0;
const TTS_CYCLE = 3; // A cada 3 mensagens, alterna texto/áudio (menos intrusivo)

/**
 * Verifica se a próxima mensagem deve ser áudio
 * @param {Boolean} peekOnly - Se true, apenas verifica sem incrementar o contador
 *                            Útil para determinar formato de saída ANTES de gerar a mensagem
 * @returns {Promise<Boolean>} - true se deve usar áudio
 */
async function shouldUseTTS(peekOnly = false, empresa_id) {
    if (!empresa_id) {
        console.error('❌ shouldUseTTS: empresa_id é obrigatório!');
        return false;
    }
    try {
        const config = await getAudioConfig(empresa_id);

        if (!config.audio.ativo) {
            return false;
        }

        if (peekOnly) {
            // Apenas espia o próximo valor sem incrementar
            const nextCounter = ttsMessageCounter + 1;
            const wouldBeAudio = nextCounter % TTS_CYCLE === 0;
            console.log(`👀 TTS PEEK: próxima mensagem seria ${wouldBeAudio ? 'ÁUDIO' : 'TEXTO'} (contador atual: ${ttsMessageCounter})`);
            return wouldBeAudio;
        }

        // Incrementar contador
        ttsMessageCounter++;

        // Verificar ciclo - a cada TTS_CYCLE mensagens, usa áudio
        const useAudio = ttsMessageCounter % TTS_CYCLE === 0;

        if (useAudio) {
            console.log(`🎤 TTS: ÁUDIO (mensagem ${ttsMessageCounter})`);
        } else {
            console.log(`📝 TTS: TEXTO (mensagem ${ttsMessageCounter})`);
        }

        return useAudio;

    } catch (error) {
        console.error('Erro ao verificar TTS:', error);
        return false;
    }
}

/**
 * Reseta contador TTS
 */
function resetTTSCounter() {
    ttsMessageCounter = 0;
    console.log('🔄 Contador TTS resetado');
}

/**
 * Força próxima mensagem como áudio
 */
function forceNextAsAudio() {
    ttsMessageCounter = TTS_CYCLE - 1;
    console.log('🎤 Próxima mensagem será ÁUDIO');
}

/**
 * Status atual do TTS
 */
async function getTTSStatus(empresa_id) {
    if (!empresa_id) {
        throw new Error('empresa_id é obrigatório para getTTSStatus');
    }
    const config = await getAudioConfig(empresa_id);
    return {
        enabled: config.audio.ativo || false,
        counter: ttsMessageCounter,
        cycle: TTS_CYCLE,
        nextWillBeAudio: ttsMessageCounter >= TTS_CYCLE - 1,
        voicePresets: Object.keys(VOICE_PRESETS),
        currentGenero: config.comportamento.genero || 'neutro'
    };
}

/**
 * Lista vozes disponíveis
 */
function getAvailableVoices() {
    return VOICE_PRESETS;
}

module.exports = {
    textToSpeech,
    shouldUseTTS,
    cleanTextForTTS,
    stripAudioTags,
    formatTextForSpeech,
    numberToWords,
    valorPorExtenso,
    getAudioConfig,
    getVoiceByGender,
    resetTTSCounter,
    forceNextAsAudio,
    getTTSStatus,
    getAvailableVoices,
    VOICE_PRESETS,
    NATURAL_VOICE_SETTINGS,
    detectMessageTone
};
