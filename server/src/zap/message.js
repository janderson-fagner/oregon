/**
 * Gerenciamento de mensagens do WhatsApp
 * Funções para enviar, mapear e manipular mensagens
 */

const fs = require('fs');
const path = require('path');
const moment = require('moment');
const mime = require('mime-types');
const { MessageMedia } = require('whatsapp-web.js');
const { exec } = require('child_process');

const dbQuery = require('../utils/dbHelper');
const { getClientById, isClientConnected } = require('./client');
const {
    formatarMensagemHTML,
    cleanNumber,
    formatPhoneNumber,
    resolveChatId
} = require('./utils');

/**
 * Processa e salva mídia recebida
 * @param {Object} midia - Objeto de mídia do wwebjs
 * @param {string} numero - Número do remetente
 * @returns {Promise<Object>} Informações da mídia salva
 */
async function handleMidia(midia, numero) {
    if (!midia) return null;

    let mimeType = midia.mimetype;
    let base64 = midia.data;
    let fileName = midia.filename;
    let filesize = midia.filesize;
    let ext = mimeType.split('/')[1];
    let type = mimeType.split('/')[0];
    
    if (ext.includes(';')) {
        ext = ext.split(';')[0];
    }
    
    if (!fileName) {
        const numberAleatorio = Math.floor(Math.random() * 1000000);
        fileName = `${numero}-${moment().format('YYYYMMDDHHmmss')}-${numberAleatorio}.${ext}`;
    }

    let caminhoBase = path.join(__dirname, `../uploads/midias/${numero}`);

    if (!fs.existsSync(caminhoBase)) {
        fs.mkdirSync(caminhoBase, { recursive: true });
    }

    let caminhoFile = path.join(caminhoBase, fileName);
    fs.writeFileSync(caminhoFile, base64, 'base64');

    return {
        caminho: caminhoFile,
        url: `/uploads/midias/${numero}/${fileName}`,
        mime: mimeType,
        filename: fileName,
        filesize: filesize,
        ext: ext,
        type: type
    };
}

/**
 * Mapeia mensagem do wwebjs para formato do sistema
 * @param {Object} msg - Mensagem do wwebjs
 * @param {boolean} save - Se deve salvar mídias
 * @returns {Promise<Object>} Mensagem mapeada
 */
async function mapearMsg(msg, save = true) {
    if (!msg) return null;

    let midia = null;

    if (msg.hasMedia) {
        try {
            let dmidia = await msg.downloadMedia();

            if (dmidia) {
                if (save) {
                    midia = await handleMidia(dmidia, msg.from);

                    if (dmidia.mimetype?.includes('audio')) {
                        midia.duration = msg.duration;
                    }
                } else {
                    midia = {
                        url: '',
                        mime: dmidia.mimetype,
                        filename: dmidia.filename,
                        filesize: dmidia.filesize,
                    }

                    if (dmidia.mimetype?.includes('audio')) {
                        midia.duration = msg.duration;
                    }
                }
            }
        } catch (error) {
            console.error('Erro ao baixar mídia:', error);
        }
    }

    let resposta;
    if (msg.hasQuotedMsg) {
        let msgResposta = await msg.getQuotedMessage();
        resposta = await mapearMsg(msgResposta, true);
    }

    let mensagem = {
        id: msg.id._serialized,
        tipo: msg.type,
        texto: formatarMensagemHTML(msg.body),
        data: msg.timestamp ? moment.unix(msg.timestamp).format('DD/MM/YYYY HH:mm:ss') : null,
        lida: msg._data.viewed ? true : false,
        fromMe: msg.fromMe,
        hasMedia: msg.hasMedia,
        media: midia,
        senderName: msg._data.notifyName,
        ack: msg._data.ack,
        hasResposta: msg.hasQuotedMsg,
        resposta: resposta,
        raw: msg
    };

    return mensagem;
}

/**
 * Converte arquivo WebM para OGG (para áudios)
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @returns {Promise<string>} Caminho do arquivo convertido
 */
function convertWebmToOgg(inputPath) {
    const outputPath = inputPath.replace(/\.webm$/i, '.ogg');

    //Antes de converter, verifica se o arquivo existe, se já existe, retorna o caminho do arquivo existente
    if (fs.existsSync(outputPath)) {
        return outputPath;
    }

    return new Promise((resolve, reject) => {
        exec(
            `ffmpeg -i "${inputPath}" -vn -c:a libopus -b:a 64k -vbr on "${outputPath}"`,
            (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                resolve(outputPath);
            }
        );
    });
}

/**
 * Converte arquivo WAV para OGG (para áudios do TTS)
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @returns {Promise<string>} Caminho do arquivo convertido
 */
function convertWavToOgg(inputPath) {
    const outputPath = inputPath.replace(/\.wav$/i, '.ogg');

    //Antes de converter, verifica se o arquivo existe, se já existe, retorna o caminho do arquivo existente
    if (fs.existsSync(outputPath)) {
        return outputPath;
    }

    return new Promise((resolve, reject) => {
        exec(
            `ffmpeg -i "${inputPath}" -vn -c:a libopus -b:a 64k -vbr on "${outputPath}"`,
            (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                resolve(outputPath);
            }
        );
    });
}

/**
 * Converte arquivo MP3 para OGG (para áudios do TTS)
 * @param {string} inputPath - Caminho do arquivo de entrada
 * @returns {Promise<string>} Caminho do arquivo convertido
 */
function convertMp3ToOgg(inputPath) {
    const outputPath = inputPath.replace(/\.mp3$/i, '.ogg');

    //Antes de converter, verifica se o arquivo existe, se já existe, retorna o caminho do arquivo existente
    if (fs.existsSync(outputPath)) {
        return outputPath;
    }

    return new Promise((resolve, reject) => {
        exec(
            `ffmpeg -i "${inputPath}" -vn -c:a libopus -b:a 64k -vbr on "${outputPath}"`,
            (err, stdout, stderr) => {
                if (err) return reject(new Error(stderr || err.message));
                resolve(outputPath);
            }
        );
    });
}

/**
 * Verifica modo de desenvolvimento e redireciona mensagens
 * @param {string} clientId - ID do client
 * @param {string} originalNumber - Número original do destinatário
 * @param {Function} sendFunction - Função de envio a ser executada
 * @param {number|null} empresa_id - ID da empresa (opcional)
 * @returns {Promise<boolean>} True se enviado com sucesso
 */
async function checkDevModeAndSend(clientId, originalNumber, sendFunction, empresa_id = null) {
    try {
        let optionsQuery = 'SELECT * FROM Options';
        let optionsParams = [];
        if (empresa_id) {
            optionsQuery += ' WHERE empresa_id = ?';
            optionsParams.push(empresa_id);
        }
        const options = await dbQuery(optionsQuery, optionsParams);

        if (options.length > 0) {
            let devMode = options.filter(option => option.type == 'modo_dev')[0]?.value;

            if (devMode == "true") {
                let numerosDev = options.filter(option => option.type == 'numeros_dev')[0]?.value;

                if (numerosDev && typeof numerosDev == 'string') {
                    numerosDev = JSON.parse(numerosDev);
                }

                if (numerosDev && numerosDev.length > 0) {
                    let numeros = numerosDev.map((number) => cleanNumber(number));

                    if (!numeros.includes(cleanNumber(originalNumber))) {
                        console.log('Modo dev ativo: enviando para números de desenvolvimento');

                        for (let i = 0; i < numeros.length; i++) {
                            let numero = numeros[i];
                            
                            await sendFunction(numero);

                            // Aguarda 5 segundos entre os envios
                            if (i < numeros.length - 1) {
                                await new Promise(resolve => setTimeout(resolve, 5000));
                            }
                        }

                        return true;
                    }
                } else {
                    console.log('Nenhum número de dev encontrado!');
                    return false;
                }
            }
        }

        // Se não está em modo dev, envia normalmente
        await sendFunction(originalNumber);
        return true;
    } catch (error) {
        console.error('Erro no checkDevModeAndSend:', error);
        return false;
    }
}

/**
 * Envia mensagem de texto para um número
 * @param {string} clientId - ID do client
 * @param {string} number - Número do destinatário
 * @param {string} message - Mensagem a ser enviada
 * @returns {Promise<boolean>} True se enviado com sucesso
 */
async function sendZapMessage(clientId, number, message) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return false;
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.error(`Client ${clientId} não está conectado`);
            return false;
        }

        // Função de envio real
        const sendToNumber = async (targetNumber) => {
            const rawNumber = formatPhoneNumber(targetNumber);
            const chatId = await resolveChatId(client, rawNumber);

            try {
                await client.sendMessage(chatId, message);
                console.log(`✅ Mensagem enviada com sucesso para ${targetNumber}`);
            } catch (error) {
                console.error('Erro ao enviar mensagem (catch):', error);
                throw error;
            }
        };

        // Verifica modo dev e envia
        return await checkDevModeAndSend(clientId, number, sendToNumber);
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);

        const errMsg = error?.message || '';
        if (errMsg.includes('Session closed') || errMsg.includes('Most likely the page has been closed')) {
            console.error('⚠️ Sessão fechada, pode ser necessário reconectar o client');
        }

        return false;
    }
}

/**
 * Envia mensagem com imagem
 * @param {string} clientId - ID do client
 * @param {string} number - Número do destinatário
 * @param {string} message - Mensagem (caption)
 * @param {string} imagePath - Caminho da imagem
 * @returns {Promise<boolean>} True se enviado com sucesso
 */
async function sendZapMessageImage(clientId, number, message, imagePath) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return false;
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.error(`Client ${clientId} não está conectado`);
            return false;
        }

        // Função de envio real
        const sendToNumber = async (targetNumber) => {
            const rawNumber = formatPhoneNumber(targetNumber);
            const chatId = await resolveChatId(client, rawNumber);

            // Carrega a imagem e determina seu tipo MIME
            const image = fs.readFileSync(imagePath);

            if (!image) {
                console.error('Imagem não encontrada:', imagePath);
                return;
            }

            const filename = imagePath.split('/').pop();
            const mimeType = mime.lookup(imagePath);
            const media = new MessageMedia(mimeType, image.toString('base64'), filename);

            try {
                await client.sendMessage(chatId, media, { caption: message });
                console.log(`✅ Mensagem com imagem enviada para ${targetNumber}`);
            } catch (error) {
                console.error('Erro ao enviar mensagem com imagem (catch):', error);
                throw error;
            }
        };

        // Verifica modo dev e envia
        return await checkDevModeAndSend(clientId, number, sendToNumber);
    } catch (error) {
        console.error('Erro ao enviar mensagem com imagem:', error);

        const errMsg = error?.message || '';
        if (errMsg.includes('Session closed') || errMsg.includes('Most likely the page has been closed')) {
            console.error('⚠️ Sessão fechada, pode ser necessário reconectar o client');
        }

        return false;
    }
}

/**
 * Envia mensagem em um chat específico (com suporte a mídia e resposta)
 * @param {string} clientId - ID do client
 * @param {string} chatId - ID do chat
 * @param {string} message - Mensagem
 * @param {string} idReply - ID da mensagem a ser respondida
 * @param {string|Array} midiaPath - Caminho(s) da(s) mídia(s)
 * @returns {Promise<boolean>} True se enviado com sucesso
 */
async function sendMessageChat(clientId, chatId, message, idReply = null, midiaPath = null) {
    try {
        const client = getClientById(clientId);
        
        if (!client) {
            console.error(`Client ${clientId} não encontrado`);
            return false;
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            console.error(`Client ${clientId} não está conectado`);
            return false;
        }

        if (!chatId || (!message && !midiaPath)) {
            console.log('Chat ID ou mensagem não fornecidos!');
            return false;
        }

        if (midiaPath && !message) {
            message = '';
        }

        // Envia a mensagem
        if (!midiaPath) {
            if (!idReply) {
                try {
                    await client.sendMessage(chatId, message);
                } catch (error) {
                    console.error('Erro ao enviar mensagem (catch):', error);
                }
            } else {
                const messageReplay = await client.getMessageById(idReply);

                if (!messageReplay) {
                    console.log('Mensagem não encontrada para resposta:', idReply);
                    return false;
                }

                await messageReplay.reply(message);
            }
        } else {
            // Para array de attachments
            const paths = Array.isArray(midiaPath) ? midiaPath : [midiaPath];

            console.log('Enviando múltiplas mídias:', paths);

            for (let p of paths) {
                let filePath = p;
                const mimeTypeInit = mime.lookup(filePath) || '';

                // Se for webm ou wav, primeiro converte para ogg/opus
                if (mimeTypeInit === 'audio/webm' || /\.webm$/i.test(filePath)) {
                    console.log('Convertendo arquivo webm para ogg:', filePath);
                    filePath = await convertWebmToOgg(filePath);
                } else if (mimeTypeInit === 'audio/wav' || /\.wav$/i.test(filePath)) {
                    console.log('Convertendo arquivo wav para ogg:', filePath);
                    filePath = await convertWavToOgg(filePath);
                }

                console.log('Arquivo convertido:', filePath);

                // Lê o buffer e converte para base64
                const buffer = fs.readFileSync(filePath);
                const base64 = buffer.toString('base64');
                const filename = path.basename(filePath);
                const mimeType = mime.lookup(filePath) || 'application/octet-stream';

                const media = new MessageMedia(mimeType, base64, filename);

                // Envia como voz se for ogg
                if (mimeType === 'audio/ogg') {
                    if (!idReply) {
                        console.log('Enviando mensagem com áudio como voz:', filePath);

                        try {
                            await client.sendMessage(chatId, media, { sendAudioAsVoice: true, caption: message });
                        } catch (error) {
                            console.error('Erro ao enviar mensagem (catch):', error);
                        }
                    } else {
                        const messageReplay = await client.getMessageById(idReply);

                        if (!messageReplay) {
                            console.log('Mensagem não encontrada para resposta:', idReply);
                            return false;
                        }

                        try {
                            await client.sendMessage(chatId, media, {
                                sendAudioAsVoice: true,
                                quotedMessageId: messageReplay.id._serialized
                            });
                        } catch (error) {
                            console.error('Erro ao enviar mensagem (catch):', error);
                        }
                    }
                } else {
                    console.log('Enviando mensagem com mídia:', filePath);

                    if (!idReply) {
                        try {
                            await client.sendMessage(chatId, media, { caption: message });
                        } catch (error) {
                            console.error('Erro ao enviar mensagem (catch):', error);
                        }
                    } else {
                        const messageReplay = await client.getMessageById(idReply);

                        if (!messageReplay) {
                            console.log('Mensagem não encontrada para resposta:', idReply);
                            return false;
                        }

                        try {
                            await client.sendMessage(chatId, media, {
                                caption: message,
                                quotedMessageId: messageReplay.id._serialized
                            });
                        } catch (error) {
                            console.error('Erro ao enviar mensagem (catch):', error);
                        }
                    }
                }

                // Aguarda 2s entre envios
                await new Promise(res => setTimeout(res, 2000));
            }
        }

        console.log('✅ Mensagem enviada com sucesso para', chatId);
        return true;
    } catch (error) {
        console.error('Erro ao enviar mensagem:', error);
        return false;
    }
}

/**
 * Executa ações em mensagens
 * @param {string} clientId - ID do client
 * @param {string} messageId - ID da mensagem
 * @param {string} action - Ação a executar (deleteMe, deleteTodos, edit)
 * @param {Object} dados - Dados adicionais
 * @returns {Promise<boolean>} True se executado com sucesso
 */
async function actionsMsg(clientId, messageId, action, dados = null) {
    try {
        const client = getClientById(clientId);
        
        if (!client || !messageId || !action) {
            return false;
        }

        const connected = await isClientConnected(clientId);
        if (!connected) {
            return false;
        }

        const message = await client.getMessageById(messageId);

        if (!message) {
            console.log('Mensagem não encontrada:', messageId);
            return false;
        }

        switch (action) {
            case 'deleteMe':
                await message.delete();
                console.log('Mensagem excluída:', messageId);
                break;
            case 'deleteTodos':
                await message.delete(true);
                console.log('Mensagem excluída para todos:', messageId);
                break;
            case 'edit':
                if (!dados || !dados.conteudo || message.hasMedia) {
                    console.log('Conteúdo não fornecido para edição da mensagem:', messageId);
                    return false;
                }

                let editar = await message.edit(dados.conteudo);
                console.log('Edição da mensagem:', editar);
                break;
            default:
                console.log('Ação inválida:', action);
                return false;
        }

        return true;
    } catch (error) {
        console.error('Erro ao executar ação na mensagem:', error);
        return false;
    }
}

module.exports = {
    handleMidia,
    mapearMsg,
    sendZapMessage,
    sendZapMessageImage,
    sendMessageChat,
    actionsMsg,
    convertMp3ToOgg,
    convertWavToOgg,
    convertWebmToOgg
};

