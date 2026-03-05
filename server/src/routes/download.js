const express = require('express');
const router = express.Router();
const path = require('path');

router.get('/docs/notas/:id/:filename', (req, res) => {
    const filename = req.params.filename;
    const id = req.params.id;
    const directoryPath = path.join(__dirname, `../uploads/notas-fiscais/${id}`);
    const filePath = path.join(directoryPath, filename);

    // Definir o cabeçalho Content-Disposition para inline
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
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
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
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
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
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
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

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
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    
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
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

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

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

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

    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    res.sendFile(filePath, (err) => {
        if (err) {
            res.status(500).send({
                message: "Não foi possível exibir o arquivo. " + err,
            });
        }
    });
});

module.exports = router;