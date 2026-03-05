const express = require('express');
const router = express.Router();
const multer = require("multer");
const path = require('path');
const moment = require('moment');
const axios = require('axios');
const fs = require('fs');

const { sanitizeInput } = require('../utils/functions');

const dbQuery = require('../utils/dbHelper');

const { getSegUsers, getSegTotalUsers, variaveisItens,
    formatContent } = require('../utils/crmUtils');


const caminhoMidias = path.join(__dirname, '../files/campanhas');

if (!fs.existsSync(caminhoMidias)) {
    fs.mkdirSync(caminhoMidias, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, caminhoMidias);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '_' + file.originalname);
    }
});

const upload = multer({ storage: storage });

router.get('/variaveis', async (req, res) => {
    return res.status(200).json(variaveisItens);
});

router.post('/format-content', async (req, res) => {
    try {
        const { content, agendamento = null, cliente, limparHtml = true } = req.body;

        if (!cliente) {
            return res.status(400).json({ message: 'Cliente é obrigatório' });
        }

        if (!content || content.length === 0) {
            return res.status(200).json({ formattedContent: '' });
        }

        const formattedContent = await formatContent(content, cliente, agendamento, limparHtml);

        //console.log('formattedContent', formattedContent);

        if (!formattedContent) {
            return res.status(400).json({ message: 'Conteúdo inválido' });
        }

        return res.status(200).json({ formattedContent });
    } catch (error) {
        console.error('Erro ao formatar conteúdo:', error);
        return res.status(500).json({ message: 'Erro ao formatar conteúdo' });
    }
});

router.get('/seg/list', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            q = '',
            sortBy = '',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'asc'
        } = req.query;

        // SQL
        let query = 'SELECT * FROM Segmentacoes WHERE 1 = 1 AND empresa_id = ?';
        let queryParams = [empresa_id];

        // Adicione filtros condicionais
        if (q) {
            query += ` AND (name LIKE '%${q}%')`;
        }

        // Adicione ordenação
        if (sortBy) {
            query += ` ORDER BY ${sortBy} ${orderBy.toUpperCase()}`;
        } else {
            query += ' ORDER BY created_at DESC'; // Ordenação padrão
        }

        // Adicione paginação
        query += ` LIMIT ${parseInt(itemsPerPage)} OFFSET ${(page - 1) * parseInt(itemsPerPage)}`;

        let segmentacoes = await dbQuery(query, queryParams);

        let totalQuery = await dbQuery('SELECT COUNT(*) as total FROM Segmentacoes WHERE empresa_id = ?', [empresa_id]);
        let totalSegmentacoes = !q ? totalQuery[0].total : segmentacoes.length;


        for (let seg of segmentacoes) {
            let rules = seg.rules ? JSON.parse(seg.rules) : [];
            seg.rules = rules;
        }

        let response = {
            segmentacoes,
            totalSegmentacoes
        };

        res.status(200).send(response);
    } catch (error) {
        console.error('Erro ao recuperar usuários:', error);
        res.status(500).send(error);
    }
});

router.get('/seg/gets', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { retornarUsers = false } = req.query;

        let query = 'SELECT * FROM Segmentacoes WHERE empresa_id = ?';
        let segmentacoes = await dbQuery(query, [empresa_id]);

        for (let seg of segmentacoes) {
            let rules = seg.rules ? JSON.parse(seg.rules) : [];
            seg.rules = rules;

            if (!retornarUsers) {
                seg.totalUsers = await getSegTotalUsers(rules, empresa_id);
            } else {
                let users = await getSegUsers(rules, empresa_id);
                seg.users = users;
                for (let user of users) {
                    user.address = user.address ? JSON.parse(user.address) : null;
                    user.pedidos = user.pedidos ? JSON.parse(user.pedidos) : [];
                }
                seg.totalUsers = users.length;
            }
        }

        res.status(200).send(segmentacoes);
    } catch (error) {
        console.error('Erro ao recuperar segmentações:', error);
        res.status(500).send(error);
    }
});

router.post('/seg/save', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            data
        } = req.body;

        if (!data) {
            return res.status(400).send('Dados inválidos');
        }

        let {
            name,
            description,
            rules,
            id = 0
        } = data;

        if (!name || !rules) {
            return res.status(400).send('Nome e regras são obrigatórios');
        }

        for (let rule of rules) {
            delete rule.itensValueSelect;
        }

        if (id) {
            let query = 'UPDATE Segmentacoes SET name = ?, description = ?, rules = ? WHERE id = ? AND empresa_id = ?';
            await dbQuery(query, [name, description, JSON.stringify(rules), id, empresa_id]);
        } else {
            let query = 'INSERT INTO Segmentacoes (name, description, rules, empresa_id) VALUES (?, ?, ?, ?)';
            await dbQuery(query, [name, description, JSON.stringify(rules), empresa_id]);
        }

        res.status(200).send('Segmentação criada com sucesso');
    } catch (error) {
        console.error('Erro ao criar segmentação:', error);
        res.status(500).send(error);
    }
});

router.delete('/seg/delete/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            id
        } = req.params;

        let query = 'DELETE FROM Segmentacoes WHERE id = ? AND empresa_id = ?';
        await dbQuery(query, [id, empresa_id]);

        res.status(200).send('Segmentação deletada com sucesso');
    } catch (error) {
        console.error('Erro ao deletar segmentação:', error);
        res.status(500).send(error);
    }
});

router.get('/get-seg/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            id
        } = req.params;

        let query = 'SELECT * FROM Segmentacoes WHERE id = ? AND empresa_id = ?';
        let segmentacao = await dbQuery(query, [id, empresa_id]);

        if (segmentacao.length === 0) {
            return res.status(404).send('Segmentação não encontrada');
        }

        segmentacao = segmentacao[0];
        let rules = segmentacao.rules ? JSON.parse(segmentacao.rules) : [];
        segmentacao.rules = rules;

        res.status(200).send(segmentacao);
    } catch (error) {
        console.error('Erro ao recuperar segmentação:', error);
        res.status(500).send(error);
    }
});

router.post('/seg/totalUsers', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            data
        } = req.body;

        if (!data) {
            return res.status(400).send('Dados inválidos');
        }

        let result = await getSegTotalUsers(data.rules, empresa_id);

        res.status(200).send(result);
    } catch (error) {
        console.error('Erro ao recuperar total de usuários:', error);
        res.status(500).send(error);
    }
});

router.get('/seg/get-infos-users', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        //let query = 'SELECT * FROM CLIENTES WHERE cli_celular IS NOT NULL AND cli_celular != "" AND cli_email IS NOT NULL AND cli_email != ""';

        let query = `
            SELECT
                c.*,
                COALESCE(e.enderecos, JSON_ARRAY()) AS enderecos,
                COALESCE(n.negocios , JSON_ARRAY()) AS negocios,
                COALESCE(p.pagamentos, JSON_ARRAY()) AS pagamentos,
                COALESCE(p.valorPago , 0)           AS valorPago,
                COALESCE(p.countAgendamentos, 0)    AS countAgendamentos
            FROM CLIENTES c
            LEFT JOIN (
                SELECT
                    cli_id,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'end_id', end_id,
                            'end_logradouro', end_logradouro,
                            'end_numero', end_numero,
                            'end_bairro', end_bairro,
                            'end_cidade', end_cidade,
                            'end_estado', end_estado,
                            'end_cep', end_cep
                        )
                    ) AS enderecos
                FROM ENDERECO
                GROUP BY cli_id
            ) e ON e.cli_id = c.cli_id
            LEFT JOIN (
                SELECT
                    cli_id,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'id', id,
                            'title', title,
                            'status', status,
                            'valor', valor,
                            'created_at', created_at
                        )
                    ) AS negocios
                FROM Negocios
                WHERE empresa_id = ?
                GROUP BY cli_id
            ) n ON n.cli_id = c.cli_id
            LEFT JOIN (
                SELECT
                    a.cli_id,
                    JSON_ARRAYAGG(
                        JSON_OBJECT(
                            'pgt_id', p.pgt_id,
                            'age_id', p.age_id,
                            'pgt_valor', p.pgt_valor,
                            'pgt_data', p.pgt_data
                        )
                    ) AS pagamentos,
                    SUM(COALESCE(p.pgt_valor, 0)) AS valorPago,
                    COUNT(DISTINCT a.age_id) AS countAgendamentos
                FROM AGENDAMENTO a
                LEFT JOIN PAGAMENTO p
                    ON p.age_id = a.age_id
                AND p.pgt_data IS NOT NULL
                WHERE a.empresa_id = ?
                GROUP BY a.cli_id
            ) p ON p.cli_id = c.cli_id
            WHERE (NULLIF(TRIM(c.cli_celular), '') IS NOT NULL
            OR NULLIF(TRIM(c.cli_email),   '') IS NOT NULL)
            AND c.empresa_id = ?
        `;


        let clientes = await dbQuery(query, [empresa_id, empresa_id, empresa_id]);

        console.log('clientes', clientes[0]);

        for (let cliente of clientes) {
            cliente.enderecos = cliente.enderecos ? JSON.parse(cliente.enderecos) : [];
            cliente.negocios = cliente.negocios ? JSON.parse(cliente.negocios) : [];
            cliente.pagamentos = cliente.pagamentos ? JSON.parse(cliente.pagamentos) : [];
            cliente.valorPago = cliente.valorPago ? parseFloat(cliente.valorPago) : 0;
        }

        let bairros = clientes.filter(c => c.enderecos?.length > 0).reduce((acc, cliente) => {
            let bairro = cliente.enderecos.filter(e => e.end_bairro).map(e => e.end_bairro);
            if (bairro && !acc.includes(bairro)) {
                acc.push(bairro);
            }
            return acc;
        }, []);

        let cidades = clientes.filter(c => c.enderecos?.length > 0).reduce((acc, cliente) => {
            let cidade = cliente.enderecos.filter(e => e.end_cidade).map(e => e.end_cidade);
            if (cidade && !acc.includes(cidade)) {
                acc.push(cidade);
            }
            return acc;
        }, []);

        let estados = clientes.filter(c => c.enderecos?.length > 0).reduce((acc, cliente) => {
            let estado = cliente.enderecos.filter(e => e.end_estado).map(e => e.end_estado);
            if (estado && !acc.includes(estado)) {
                acc.push(estado);
            }
            return acc;
        }, []);

        let min_money_spent = clientes.filter(c => c.valorPago > 0).reduce((acc, c) => {
            let money_spent = parseFloat(c.valorPago);
            if (money_spent < acc) {
                acc = money_spent;
            }
            return acc;
        }, Infinity);

        let max_money_spent = clientes.filter(c => c.valorPago > 0).reduce((acc, c) => {
            let money_spent = parseFloat(c.valorPago);
            if (money_spent > acc) {
                acc = money_spent;
            }
            return acc;
        }, 0);

        let min_order_count = clientes.filter(c => c.countAgendamentos > 0).reduce((acc, c) => {
            let order_count = c.countAgendamentos;
            if (order_count < acc) {
                acc = order_count;
            }
            return acc;
        }, Infinity);

        let max_order_count = clientes.filter(c => c.countAgendamentos > 0).reduce((acc, c) => {
            let order_count = c.countAgendamentos;
            if (order_count > acc) {
                acc = order_count;
            }
            return acc;
        }, 0);

        let min_negocios_count = clientes.filter(c => c.negocios && c.negocios.length > 0).reduce((acc, c) => {
            let negocios_count = c.negocios.length;
            if (negocios_count < acc) {
                acc = negocios_count;
            }
            return acc;
        }, Infinity);

        let max_negocios_count = clientes.filter(c => c.negocios && c.negocios.length > 0).reduce((acc, c) => {
            let negocios_count = c.negocios.length;
            if (negocios_count > acc) {
                acc = negocios_count;
            }
            return acc;
        }, 0);

        let response = {
            cidades,
            estados,
            bairros,
            min_money_spent,
            max_money_spent,
            min_order_count,
            max_order_count,
            min_negocios_count,
            max_negocios_count,
        };

        res.status(200).send(response);
    } catch (error) {
        console.error('Erro ao recuperar usuários:', error);
        res.status(500).send(error);
    }
});

router.get('/campanhas/list', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            dataEnvioDe = null,
            dataEnvioAte = null,
            segmentacao = null,
            i = null,
            q = '',
            sortBy = '',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'asc'
        } = req.query;

        // SQL
        let query = 'SELECT * FROM Campanhas WHERE 1 = 1 AND empresa_id = ?';
        let queryParams = [empresa_id];

        if (i) {
            query += ` AND id = ${i}`;
        }

        // Adicione filtros condicionais
        if (q) {
            query += ` AND (name LIKE '%${q}%')`;
        }

        if (dataEnvioDe) {
            query += ` AND data_envio >= '${dataEnvioDe}'`;
        }

        if (dataEnvioAte) {
            query += ` AND data_envio <= '${dataEnvioAte}'`;
        }

        if (segmentacao) {
            let nSeg = segmentacao;

            // Verifica se segmentacao é uma string e converte para número
            if (typeof segmentacao === 'string' || segmentacao instanceof String) {
                nSeg = parseInt(segmentacao);
            }

            // Se nSeg for um número, filtra campanhas por id de segmentação
            if (!isNaN(nSeg)) {
                query += ` AND segmentacao = ${nSeg}`;
            } else if (Array.isArray(segmentacao)) {
                // Se segmentacao for um array, filtra campanhas que incluem os ids no array
                query += ` AND segmentacao IN (${segmentacao.join(',')})`;
            }
            //query += ` AND segmentacao = ${segmentacao}`;
        }

        // Adicione ordenação
        if (sortBy) {
            query += ` ORDER BY ${sortBy} ${orderBy.toUpperCase()}`;
        } else {
            query += ' ORDER BY created_at DESC'; // Ordenação padrão
        }

        // Adicione paginação
        query += ` LIMIT ${parseInt(itemsPerPage)} OFFSET ${(page - 1) * parseInt(itemsPerPage)}`;

        let campanhas = await dbQuery(query, queryParams);

        let idsCampanhas = campanhas.map(c => c.id);

        for (let campanha of campanhas) {
            let content = campanha.content ? JSON.parse(campanha.content) : [];
            campanha.content = content

            let segmentacao = await dbQuery('SELECT * FROM Segmentacoes WHERE id = ? AND empresa_id = ?', [campanha.segmentacao, empresa_id]);

            if (segmentacao.length > 0) {
                campanha.segmentacao = segmentacao[0];
                campanha.segmentacao.rules = campanha.segmentacao.rules ? JSON.parse(campanha.segmentacao.rules) : [];
                campanha.segmentacao.totalUsers = await getSegTotalUsers(campanha.segmentacao.rules, empresa_id);
            }

            campanha.data_envio = moment(campanha.data_envio).format('YYYY-MM-DD');

            let dataLog = campanha.dataLog ? JSON.parse(campanha.dataLog) : null;
            campanha.dataLog = dataLog;

            if (campanha.dataLog) {
                let messages = await dbQuery('SELECT * FROM MessagesLog WHERE idCampanha = ? AND empresa_id = ?', [campanha.id, empresa_id]);
                campanha.dataLog.messagesLog = messages ?? [];
            }
        }

        let totalQuery = await dbQuery('SELECT COUNT(*) as total FROM Campanhas WHERE empresa_id = ?', [empresa_id]);
        let totalCampanhas = totalQuery[0].total;

        let allSegmentacoes = await dbQuery('SELECT * FROM Segmentacoes WHERE empresa_id = ?', [empresa_id]);

        res.status(200).send({ campanhas, totalCampanhas, allSegmentacoes });
    } catch (error) {
        console.error('Erro ao recuperar campanhas:', error);
        res.status(500).send(error);
    }
});

router.get('/adjuste-logs', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const campanhas = await dbQuery('SELECT * FROM Campanhas WHERE dataLog IS NOT NULL AND empresa_id = ?', [empresa_id]);

        const campanhasComLogs = campanhas.filter(c => {
            try {
                const log = JSON.parse(c.dataLog);
                return log?.messagesLog?.length > 0;
            } catch (e) {
                return false;
            }
        });

        console.log('Campanhas com logs:', campanhasComLogs.length);

        if (campanhasComLogs.length === 0) {
            return res.status(200).send('Nenhum log para ajustar');
        }

        for (let campanha of campanhasComLogs) {
            const dataLog = JSON.parse(campanha.dataLog);

            const values = dataLog.messagesLog.map(m => [
                campanha.id,
                m.data || null,
                m.phone || null,
                m.cliente || null,
                m.message || null,
                m.sucesso || 0,
                empresa_id
            ]);

            if (values.length === 0) continue;

            const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(', ');
            const flatValues = values.flat(); // achata o array para 1 nível

            const query = `
                INSERT INTO MessagesLog (idCampanha, data, phone, cliente, message, sucesso, empresa_id)
                VALUES ${placeholders}
            `;

            console.log(`Inserindo ${values.length} logs da campanha ${campanha.id}`);
            const result = await dbQuery(query, flatValues);
            console.log(`Logs inseridos: ${result.affectedRows}`);

            if (result.affectedRows == dataLog.messagesLog.length) {
                // Atualiza o status da campanha para "Concluída"
                const newDataLog = dataLog;
                delete newDataLog.messagesLog; // Remove o campo messagesLog

                await dbQuery('UPDATE Campanhas SET dataLog = ? WHERE id = ? AND empresa_id = ?', [JSON.stringify(newDataLog), campanha.id, empresa_id]);
                console.log(`Campanha ${campanha.id} atualizada para concluída`);
            }
        }

        return res.status(200).send('Logs de mensagens ajustados com sucesso');
    } catch (error) {
        console.error('Erro ao recuperar logs de mensagens:', error);
        res.status(500).send(error);
    }
});


router.get('/campanhas/get/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            id
        } = req.params;

        let query = 'SELECT * FROM Campanhas WHERE id = ? AND empresa_id = ?';
        let campanha = await dbQuery(query, [id, empresa_id]);

        if (campanha.length === 0) {
            return res.status(404).send('Campanha não encontrada');
        }

        campanha = campanha[0];

        campanha.data_envio = moment(campanha.data_envio).format('YYYY-MM-DD');
        campanha.types = campanha.types ? campanha.types.split(',') : [];
        /* campanha.modeloMensagem = campanha.modeloMensagem ? campanha.modeloMensagem : null;
        campanha.modeloEmail = campanha.modeloEmail ? campanha.modeloEmail : null; */

        if(campanha.modeloMensagem) {
            let modeloMensagem = await dbQuery('SELECT * FROM Templates WHERE id = ? AND empresa_id = ?', [campanha.modeloMensagem, empresa_id]);
            campanha.modeloDataZap = modeloMensagem?.length > 0 ? modeloMensagem[0] : null;
            campanha.modeloDataZap.content = campanha.modeloDataZap?.content ? JSON.parse(campanha.modeloDataZap.content) : null;
        }

        if(campanha.modeloEmail) {
            let modeloEmail = await dbQuery('SELECT * FROM Templates WHERE id = ? AND empresa_id = ?', [campanha.modeloEmail, empresa_id]);
            campanha.modeloDataEmail = modeloEmail?.length > 0 ? modeloEmail[0] : null;
            campanha.modeloDataEmail.content = campanha.modeloDataEmail?.content ? JSON.parse(campanha.modeloDataEmail.content) : null;
        }

        res.status(200).send(campanha);
    } catch (error) {
        console.error('Erro ao recuperar campanha:', error);
        res.status(500).send(error);
    }
});

router.get('/campanhas/duplicate/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            id
        } = req.params;

        let query = 'SELECT * FROM Campanhas WHERE id = ? AND empresa_id = ?';
        let campanha = await dbQuery(query, [id, empresa_id]);

        if (campanha.length === 0) {
            return res.status(404).send('Campanha não encontrada');
        }

        campanha = campanha[0];

        // Remove o ID para criar uma nova campanha
        delete campanha.id;
        delete campanha.created_at;
        delete campanha.updated_at;

        // Insere a nova campanha duplicada
        query = 'INSERT INTO Campanhas (name, description, segmentacao, content, status, empresa_id) VALUES (?, ?, ?, ?, ?, ?)';
        let inserido = await dbQuery(query, [campanha.name + ' (Cópia)', campanha.description, campanha.segmentacao, campanha.content, 'Rascunho', empresa_id]);

        if (inserido.affectedRows > 0) {
            // Recupera o ID da nova campanha inserida
            let newId = inserido.insertId;

            // Recupera a nova campanha para retornar
            campanha.id = newId;
            campanha.created_at = moment().format('YYYY-MM-DD HH:mm:ss');
            campanha.updated_at = moment().format('YYYY-MM-DD HH:mm:ss');

            res.status(200).send(campanha);
        } else {
            res.status(500).send('Erro ao duplicar campanha');
        }
    } catch (error) {
        console.error('Erro ao duplicar campanha:', error);
        res.status(500).send(error);
    }
});

router.post('/campanhas/save', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            data
        } = req.body;

        if (!data) {
            return res.status(400).send('Dados inválidos');
        }

        let {
            name,
            types,
            description,
            segmentacao,
            data_envio,
            hora_envio,
            modeloMensagem = null,
            modeloEmail = null,
            id = 0,
            intervalo = 45
        } = data;

        if (!name || !segmentacao || !data_envio || !hora_envio || !types || types.length === 0) {
            return res.status(400).json({ message: 'Nome, segmentação, data de envio, hora de envio e tipo de disparo são obrigatórios' });
        }

        if(types.includes('zap') && !modeloMensagem) {
            return res.status(400).json({ message: 'Modelo de mensagem é obrigatório' });
        }

        if(types.includes('email') && !modeloEmail) {
            return res.status(400).json({ message: 'Modelo de email é obrigatório' });
        }

        let obj = {
            name,
            description,
            segmentacao,
            data_envio,
            hora_envio,
            types: types.join(','),
            modeloMensagem,
            modeloEmail,
            status: 'Criada',
            intervalo,
            play: 1,
            empresa_id
        }

        if (id) {
            await dbQuery('UPDATE Campanhas SET ? WHERE id = ? AND empresa_id = ?', [obj, id, empresa_id]);
        } else {
            await dbQuery('INSERT INTO Campanhas SET ?', [obj]);
        }

        res.status(200).json({ message: 'Campanha salva com sucesso' });
    } catch (error) {
        console.error('Erro ao criar campanha:', error);
        res.status(500).json(error);
    }
});

router.delete('/campanhas/delete/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            id
        } = req.params;

        let query = 'DELETE FROM Campanhas WHERE id = ? AND empresa_id = ?';
        await dbQuery(query, [id, empresa_id]);

        res.status(200).send('Campanha deletada com sucesso');
    } catch (error) {
        console.error('Erro ao deletar campanha:', error);
        res.status(500).send(error);
    }
});

router.put('/campanhas/handlePlay/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            id
        } = req.params;

        let checkQuery = await dbQuery('SELECT * FROM Campanhas WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (checkQuery.length === 0) {
            return res.status(404).send('Campanha não encontrada');
        }

        let campanha = checkQuery[0];

        if (campanha.status != 'Pausada' && campanha.status != 'Realizando disparo') {
            return res.status(400).send('Campanha não está pausada ou em disparo');
        }

        if (campanha.play) {
            //pausar
            let query = 'UPDATE Campanhas SET status = ?, play = ? WHERE id = ? AND empresa_id = ?';
            await dbQuery(query, ['Pausada', 0, id, empresa_id]);
        } else {
            //retomar
            // let hora_envio = campanha.hora_envio ? campanha.hora_envio : moment().format('HH:mm:ss');
            let data_envio = campanha.data_envio ? campanha.data_envio : moment().format('YYYY-MM-DD');

            let hora_envio = moment().add(1, 'minutes').format('HH:mm:ss');

            //Se a data de envio for antes ou depois de hoje, ajusta a data de envio
            if (moment(data_envio).isBefore(moment(), 'day') || moment(data_envio).isAfter(moment(), 'day')) {
                data_envio = moment().format('YYYY-MM-DD');
            }

            await dbQuery('UPDATE Campanhas SET status = ?, play = ?, data_envio = ?, hora_envio = ? WHERE id = ? AND empresa_id = ?',
                ['Agendada', 1, moment(data_envio).format('YYYY-MM-DD'), hora_envio, id, empresa_id]
            );
        }

        res.status(200).send('Campanha atualizada com sucesso');
    } catch (error) {
        console.error('Erro ao atualizar campanha:', error);
        res.status(500).send(error);
    }
});


module.exports = router;
