/**
 * MÓDULO WWEBJS REMOVIDO
 * O chat agora usa WhatsApp Cloud API oficial do Meta.
 * Ver server/src/whatsapp/ para o novo módulo.
 * @deprecated Removido na migração para Cloud API (FASE-05)
 */

const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

/**
 * Stub: mapearMsg — retorna null sem tentar acessar API do wwebjs.
 * @param {Object} msg
 * @returns {Promise<null>}
 */
async function mapearMsg(msg, save = true) {
    return null;
}

/**
 * Stub: handleMidia — não processa mídia do wwebjs.
 * @returns {Promise<null>}
 */
async function handleMidia(midia, numero) {
    return null;
}

/**
 * Converte arquivo WebM para OGG (ffmpeg — funciona independente do wwebjs).
 * @param {string} inputPath
 * @returns {Promise<string>}
 */
function convertWebmToOgg(inputPath) {
    if (!inputPath) return null;
    const outputPath = inputPath.replace(/\.webm$/i, '.ogg');
    if (fs.existsSync(outputPath)) return outputPath;
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
 * Converte arquivo WAV para OGG (ffmpeg — funciona independente do wwebjs).
 * @param {string} inputPath
 * @returns {Promise<string>}
 */
function convertWavToOgg(inputPath) {
    if (!inputPath) return null;
    const outputPath = inputPath.replace(/\.wav$/i, '.ogg');
    if (fs.existsSync(outputPath)) return outputPath;
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
 * Converte arquivo MP3 para OGG (ffmpeg — funciona independente do wwebjs).
 * @param {string} inputPath
 * @returns {Promise<string>}
 */
function convertMp3ToOgg(inputPath) {
    if (!inputPath) return null;
    const outputPath = inputPath.replace(/\.mp3$/i, '.ogg');
    if (fs.existsSync(outputPath)) return outputPath;
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
 * Stub: sendZapMessage — wwebjs removido.
 * TODO [ASSUMPTION-AUTOPILOT]: migrar para Cloud API (messageService)
 * @returns {Promise<false>}
 */
async function sendZapMessage(clientId, number, message) {
    console.warn('[zap] TODO: envio via wwebjs desativado — migrar para Cloud API (server/src/whatsapp/messageService.js)');
    return false;
}

/**
 * Stub: sendZapMessageImage — wwebjs removido.
 * TODO [ASSUMPTION-AUTOPILOT]: migrar para Cloud API (messageService)
 * @returns {Promise<false>}
 */
async function sendZapMessageImage(clientId, number, message, imagePath) {
    console.warn('[zap] TODO: envio via wwebjs desativado — migrar para Cloud API (server/src/whatsapp/messageService.js)');
    return false;
}

/**
 * Stub: sendMessageChat — wwebjs removido.
 * TODO [ASSUMPTION-AUTOPILOT]: migrar para Cloud API (messageService)
 * @returns {Promise<false>}
 */
async function sendMessageChat(clientId, chatId, message, idReply = null, midiaPath = null) {
    console.warn('[zap] TODO: envio via wwebjs desativado — migrar para Cloud API (server/src/whatsapp/messageService.js)');
    return false;
}

/**
 * Stub: actionsMsg — wwebjs removido.
 * @returns {Promise<false>}
 */
async function actionsMsg(clientId, messageId, action, dados = null) {
    console.warn('[zap] TODO: actionsMsg via wwebjs desativado — migrar para Cloud API.');
    return false;
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
