const express = require('express');
const router = express.Router();
const path = require('path');

/**
 * Monta um valor seguro para o cabeçalho Content-Disposition.
 *
 * O nome do arquivo vem da URL (req.params.filename) já decodificado pelo Express
 * e pode conter acentos/caracteres não-ASCII (ex.: "certificado-joão.pdf"). Passar
 * esses caracteres direto para res.setHeader lança "ERR_INVALID_CHAR: Invalid
 * character in header content", pois cabeçalhos HTTP só aceitam bytes Latin1/token.
 *
 * Seguindo a RFC 5987/6266, enviamos:
 *   - filename="<fallback ASCII>"  → compatível com clientes antigos
 *   - filename*=UTF-8''<percent-encoded> → nome real preservado em UTF-8
 *
 * @param {string} filename - nome original do arquivo
 * @param {string} [type='inline'] - 'inline' ou 'attachment'
 * @returns {string} valor pronto para o cabeçalho Content-Disposition
 */
function contentDisposition(filename, type = 'inline') {
    const nome = String(filename == null ? '' : filename);

    // Fallback ASCII: troca qualquer caractere não-ASCII, aspas e barra invertida
    // por "_" para que o filename="..." nunca contenha bytes inválidos.
    const asciiFallback = nome
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\]/g, '_');

    // Versão RFC 5987 com o nome real em UTF-8. encodeURIComponent cobre a maior
    // parte; os caracteres ' ( ) * são codificados manualmente por não fazerem
    // parte do conjunto attr-char permitido em ext-value.
    const encoded = encodeURIComponent(nome).replace(
        /['()*]/g,
        (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()
    );

    return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

router.get('/docs/notas/:id/:filename', (req, res) => {
    const filename = req.params.filename;
    const id = req.params.id;
    const directoryPath = path.join(__dirname, `../uploads/notas-fiscais/${id}`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', contentDisposition(filename));
    
    // Enviar o arquivo para o cliente
    res.sendFile(filePath, (err) => {
        if (err) {
            // Manipular erro, arquivo não encontrado etc.
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/docs/certificados/:id/:filename', (req, res) => {
    const filename = req.params.filename;
    const id = req.params.id;
    const directoryPath = path.join(__dirname, `../files/certificados/${id}`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', contentDisposition(filename));
    
    // Enviar o arquivo para o cliente
    res.sendFile(filePath, (err) => {
        if (err) {
            // Manipular erro, arquivo não encontrado etc.
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/docs/recibos/:id/:filename', (req, res) => {
    const filename = req.params.filename;
    const id = req.params.id;
    const directoryPath = path.join(__dirname, `../files/recibos/${id}`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', contentDisposition(filename));
    
    // Enviar o arquivo para o cliente
    res.sendFile(filePath, (err) => {
        if (err) {
            // Manipular erro, arquivo não encontrado etc.
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/docs/ordens-servico/:id/:filename', (req, res) => {
    const filename = req.params.filename;
    const id = req.params.id;
    const directoryPath = path.join(__dirname, `../files/ordens-servico/${id}`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', contentDisposition(filename));

    res.sendFile(filePath, (err) => {
        if (err) {
            // Manipular erro, arquivo não encontrado etc.
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/docs/relatorios/:filename', (req, res) => {
    const filename = req.params.filename;
    const directoryPath = path.join(__dirname, `../files/relatorios`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', contentDisposition(filename));
    
    // Enviar o arquivo para o cliente
    res.sendFile(filePath, (err) => {
        if (err) {
            // Manipular erro, arquivo não encontrado etc.
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/templates/file/:filename', (req, res) => {
    const filename = req.params.filename;
    const directoryPath = path.join(__dirname, `../files/templates`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', contentDisposition(filename));

    // Enviar o arquivo para o cliente
    res.sendFile(filePath, (err) => {
        if (err) {
            // Manipular erro, arquivo não encontrado etc.
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/docs/contratos/:id/:filename', (req, res) => {
    const filename = req.params.filename;
    const id = req.params.id;
    const directoryPath = path.join(__dirname, `../files/contratos/${id}`);
    const filePath = path.join(directoryPath, filename);

    res.setHeader('Content-Disposition', contentDisposition(filename));

    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

router.get('/docs/orcamentos/:filename', (req, res) => {
    const filename = req.params.filename;
    const directoryPath = path.join(__dirname, `../files/orcamentos`);
    const filePath = path.join(directoryPath, filename);

    res.setHeader('Content-Disposition', contentDisposition(filename));

    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

module.exports = router;