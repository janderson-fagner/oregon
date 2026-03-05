const express = require('express');
const router = express.Router();
const moment = require('moment');

const { getUserLoggedUser, sanitizeInput } = require('../utils/functions');
const { getAgendamentos } = require('../utils/agendaUtils');
const { variaveisItens } = require('../utils/crmUtils');

const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');

/**
 * GET /link-atendimento/:id - Buscar link de atendimento por ID
 */
router.get('/:id', async (req, res) => {
    //Processar link e buscar contato e fonte, antes de tudo, redirecionar para wa.me
    const { id } = req.params;
    const { getBrandFromHost } = require('../utils/brandHelper');
    const brand = getBrandFromHost(req.hostname);
    let urlRedirecionar = brand.appUrl;

    const htmlRedirecionar = (url) => `
    <html>
    <head>
    <title>Redirecionando...</title>
    <script>
    window.location.href = '${url}';
    </script>
    </head>
    <body>
    <h1>Redirecionando...</h1>
    </body>
    </html>
    `;

    try {
        const linksQuery = await dbQuery('SELECT * FROM Options WHERE type = "link_atendimento"');
        if (linksQuery.length === 0) {
            return res.send(htmlRedirecionar(urlRedirecionar));
        }

        const links = linksQuery.map(link => {
            return {
                ...(link.value && typeof link.value === 'string' ? JSON.parse(link.value) : null),
                idOption: link.id_option
            };
        });

        const link = links.find(link => link.link.replace('/atendimento/', '') == id);
        if (!link) {
            return res.send(htmlRedirecionar(urlRedirecionar));
        }

        let contato = link.contato.replace(/\D/g, '');
        urlRedirecionar = `https://wa.me/+55${contato}`;

        res.send(htmlRedirecionar(urlRedirecionar));
    } catch (err) {
        console.error('Erro ao processar link de atendimento', err);
        res.send(htmlRedirecionar(urlRedirecionar));
    }
});

/**
 * GET /links - Listar links de atendimento
 */
router.post('/links', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const links = await dbQuery('SELECT * FROM Options WHERE type = "link_atendimento" AND empresa_id = ?', [empresa_id]);

        let response = links.map(link => {
            return {
                ...(link.value && typeof link.value === 'string' ? JSON.parse(link.value) : null),
                idOption: link.id_option
            };
        });

        res.status(200).json(response.filter(link => link !== null && link !== undefined));
    } catch (err) {
        console.error('Erro ao buscar links de atendimento', err);
        res.status(500).json({ message: 'Erro ao buscar links de atendimento', err: err.message });
    }
});

/**
 * POST /save-links - Salvar links de atendimento
 */
router.post('/save-links', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { links } = req.body;

        if (!links || !Array.isArray(links)) {
            return res.status(400).json({ message: 'Links inválidos' });
        }

        for (let link of links) {
            if (!link.link || !link.fonte || !link.contato) {
                return res.status(400).json({ message: 'Links inválidos' });
            }

            if (link.idOption) {
                await dbQuery('UPDATE Options SET value = ? WHERE id_option = ? AND empresa_id = ?', [JSON.stringify(link), link.idOption, empresa_id]);
            } else {
                await dbQuery('INSERT INTO Options (type, value, empresa_id) VALUES ("link_atendimento", ?, ?)', [JSON.stringify(link), empresa_id]);
            }
        }


        res.status(200).json({ message: 'Links salvos com sucesso' });
    } catch (err) {
        console.error('Erro ao salvar links de atendimento', err);
        res.status(500).json({ message: 'Erro ao salvar links de atendimento', err: err.message });
    }
});

router.delete('/delete-link/:id', getUserLoggedUser, async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        if (!id) {
            return res.status(400).json({ message: 'ID do link é obrigatório' });
        }

        await dbQuery('DELETE FROM Options WHERE type = "link_atendimento" AND id_option = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Link deletado com sucesso' });
    } catch (err) {
        console.error('Erro ao deletar link de atendimento', err);
        res.status(500).json({ message: 'Erro ao deletar link de atendimento', err: err.message });
    }
});

module.exports = router;