const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require('path');
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const { sanitizeInput } = require('../utils/functions');

const caminhoMidias = path.join(__dirname, '../files/templates');
const caminhoImagensEmail = path.join(__dirname, '../uploads/mail-midias');

if (!fs.existsSync(caminhoMidias)) {
    fs.mkdirSync(caminhoMidias, { recursive: true });
}

if (!fs.existsSync(caminhoImagensEmail)) {
    fs.mkdirSync(caminhoImagensEmail, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, caminhoMidias);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '_' + file.originalname);
    }
});

const storageImagens = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, caminhoImagensEmail);
    },
    filename: function (req, file, cb) {
        // Manter apenas o nome original para facilitar o acesso
        cb(null, file.originalname);
    }
});

const upload = multer({ storage: storage });
const uploadImagens = multer({ storage: storageImagens });


router.get('/', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            type = 'mensagem',
            q = '',
            sortBy = '',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'asc'
        } = req.query;

        let query = `SELECT * FROM Templates WHERE 1=1 AND type = '${sanitizeInput(type)}' AND empresa_id = ${parseInt(empresa_id)}`;

        if (q) {
            q = sanitizeInput(q);
            query += ` AND (name LIKE '%${q}%')`;
        }

        // Adicione ordenação
        if (sortBy) {
            query += ` ORDER BY ${sortBy} ${orderBy.toUpperCase()}`;
        } else {
            query += ' ORDER BY id DESC'; // Ordenação padrão
        }

        // Adicione paginação
        query += ` LIMIT ${parseInt(itemsPerPage)} OFFSET ${(page - 1) * parseInt(itemsPerPage)}`;


        const templates = await dbQuery(query);

        let totalQuery = await dbQuery('SELECT COUNT(*) as total FROM Templates WHERE type = ? AND empresa_id = ?', [type, empresa_id]);

        let totalTemplates = !q ? totalQuery[0].total : templates.length;

        for (let template of templates) {
            template.midia = template.midia ?? null;

            if (template.midia && typeof template.midia === 'string') {
                try {
                    template.midia = JSON.parse(template.midia);
                } catch (error) {
                    console.error('Erro ao fazer parse de midia:', error);
                    template.midia = null;
                }
            }

            if (template.id == 23) {
                console.log('Content do template antes:', template.content);
            }

            if (template.content && typeof template.content === 'string') {
                try {
                    template.content = JSON.parse(template.content);
                } catch (error) {
                    console.error('Erro ao fazer parse de content:', error);
                    template.content = null;
                }
            }

            if (template.id == 23) {
                console.log('Content do template:', template.content);
            }
        }

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json({
            totalTemplates,
            templates
        });
    } catch (error) {
        console.error('Error fetching templates:', error);
        res.status(500).json({ message: error.message || 'Ocorreu um erro ao obter os templates!' });
    }
});

router.get('/get/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: 'ID do template não fornecido!' });
        }

        const templateQuery = await dbQuery('SELECT * FROM Templates WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (templateQuery.length === 0) {
            return res.status(404).json({ message: 'Template não encontrado!' });
        }

        const template = templateQuery[0];

        template.midia = template.midia ? JSON.parse(template.midia) : null;
        if (template.content && typeof template.content === 'string') {
            try {
                template.content = JSON.parse(template.content);
            } catch (error) {
                console.error('Erro ao fazer parse de content:', error);
                template.content = null;
            }
        }

        console.log('Content do template:', template.content);

        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(200).json(template);
    } catch (error) {
        console.error('Error fetching template:', error);
        res.status(500).json({ message: error.message || 'Ocorreu um erro ao obter o template!' });
    }
});

router.post('/save-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).send('Arquivo inválido');
        }

        let url = `/download/templates/file/${req.file.filename}`;
        let pathFile = path.join(caminhoMidias, req.file.filename);

        let response = {
            url,
            pathFile,
            filename: req.file.filename
        };

        res.status(200).send(response);
    } catch (error) {
        console.error('Erro ao salvar arquivo:', error);
        res.status(500).send(error);
    }
});

router.post('/', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { name, content, midia = null, type } = req.body;

        if (!name || !content || !type) {
            return res.status(400).json({ message: 'Nome, conteúdo e tipo do template são obrigatórios!' });
        }

        const newTemplate = {
            name,
            type,
            content: content ? JSON.stringify(content) : null,
            midia: midia ? JSON.stringify(midia) : null,
            created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            empresa_id
        };

        const result = await dbQuery('INSERT INTO Templates SET ?', newTemplate);

        res.status(201).json({ id: result.insertId, ...newTemplate });
    } catch (error) {
        console.error('Error creating template:', error);
        res.status(500).json({ message: error.message || 'Ocorreu um erro ao criar o template!' });
    }
});

router.put('/', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id, name, content, midia = null, type } = req.body;

        if (!id || !name || !content || !type) {
            return res.status(400).json({ message: 'ID, nome, conteúdo e tipo do template são obrigatórios!' });
        }

        const updatedTemplate = {
            name,
            type,
            content: content ? JSON.stringify(content) : null,
            midia: midia ? JSON.stringify(midia) : null,

        };

        await dbQuery('UPDATE Templates SET ? WHERE id = ? AND empresa_id = ?', [updatedTemplate, id, empresa_id]);

        res.status(200).json({ ...updatedTemplate });
    } catch (error) {
        console.error('Error updating template:', error);
        res.status(500).json({ message: error.message || 'Ocorreu um erro ao atualizar o template!' });
    }
});

router.delete('/delete/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: 'ID do template não fornecido!' });
        }

        await dbQuery('DELETE FROM Templates WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Template excluído com sucesso!' });
    } catch (error) {
        console.error('Error deleting template:', error);
        res.status(500).json({ message: error.message || 'Ocorreu um erro ao excluir o template!' });
    }
});

// Rota específica para upload de imagens do GrapesJS Asset Manager
router.post('/upload-image', uploadImagens.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                error: 'Nenhum arquivo foi enviado',
                message: 'Arquivo inválido'
            });
        }

        // URL que o frontend usará para acessar a imagem
        const url = `${req.protocol}://${req.get('host')}/uploads/mail-midias/${req.file.filename}`;

        let response = {
            url,
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        };

        return res.status(200).json({
            data: [
                {
                    src: url,
                    name: req.file.originalname || req.file.filename,
                    type: 'image',          // opcional, ajuda no AM
                    size: req.file.size,    // opcional
                    mime: req.file.mimetype // opcional
                }
            ]
        });
    } catch (error) {
        console.error('Erro ao salvar imagem:', error);

        if (error.message === 'Apenas arquivos de imagem são permitidos!') {
            return res.status(400).json({
                error: 'Tipo de arquivo inválido',
                message: error.message
            });
        }

        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                error: 'Arquivo muito grande',
                message: 'O arquivo deve ter no máximo 5MB'
            });
        }

        res.status(500).json({
            error: 'Erro interno do servidor',
            message: 'Ocorreu um erro ao salvar a imagem'
        });
    }
});

module.exports = router;