const express = require('express');
const router = express.Router();
const moment = require('moment');

const { sanitizeInput } = require('../utils/functions');
const { getAgendamentos } = require('../utils/agendaUtils');
const { variaveisItens} = require('../utils/crmUtils');

const dbQuery = require('../utils/dbHelper');

/*
* Tags
*/

router.get('/list/tags', async (req, res) => {
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
        let query = 'SELECT * FROM Tags WHERE 1 = 1 AND empresa_id = ?';
        let queryParams = [empresa_id];
        let order = ' ORDER BY name ASC';

        // Adicione filtros condicionais
        if (q) {
            q = sanitizeInput(q);
            query += ` AND name LIKE '%${q}%'`;
        }
        // Adicione ordenação
        if (sortBy) {
            //query += ` ORDER BY c.${sortBy} ${orderBy.toUpperCase()}`;
            order = ` ORDER BY ${sortBy} ${orderBy.toUpperCase()}`;
        }

        // Adicione paginação
        if (itemsPerPage != 'todos')
            query += ` LIMIT ${parseInt(itemsPerPage)} OFFSET ${(page - 1) * parseInt(itemsPerPage)}`;

        let tags = await dbQuery(query, queryParams);

        // Calcula o total de clientes com os filtros aplicados
        let totalQuery = await dbQuery(`SELECT COUNT(*) as total FROM Tags WHERE empresa_id = ?`, [empresa_id]);
        let totalTags = totalQuery[0].total;

        let response = {
            tags,
            totalTags
        };

        res.status(200).send(response);
    } catch (error) {
        console.error('Erro ao recuperar tags:', error);
        res.status(500).send(error);
    }
});

router.post('/create/tag', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { name, description = null, color = null } = req.body;

        let tag = await dbQuery('SELECT * FROM Tags WHERE name = ? AND empresa_id = ?', [name, empresa_id]);

        if (tag.length > 0) {
            return res.status(400).send('Tag já existe');
        }

        let create = await dbQuery('INSERT INTO Tags (name, description, color, empresa_id) VALUES (?, ?, ?, ?)', [name, description, color, empresa_id]);

        let result = await dbQuery('SELECT * FROM Tags WHERE id = ? AND empresa_id = ?', [create.insertId, empresa_id]);

        res.status(200).send(result[0]);
    } catch (error) {
        console.error('Erro ao criar tag:', error);
        res.status(500).send(error);
    }
});

router.get('/get/tag/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        let query = await dbQuery('SELECT * FROM Tags WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (query.length == 0) {
            return res.status(404).send('Nenhuma tag encontrada');
        }

        res.status(200).send(query[0]);
    } catch (error) {
        console.error('Erro ao obter tag:', error);
        res.status(500).send(error);
    }
});

router.post('/update/tag', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id, name, description = null, color = null } = req.body;

        // Buscar a tag antiga
        let tag = await dbQuery('SELECT * FROM Tags WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (tag.length === 0) {
            //return res.status(404).send('Tag não encontrada');

            // Se a tag não for encontrada, criar uma nova
            let create = await dbQuery('INSERT INTO Tags (name, description, empresa_id) VALUES (?, ?, ?)', [name, description, empresa_id]);

            if (create.affectedRows == 0) {
                return res.status(500).send('Erro ao criar tag');
            } else {
                return res.status(200).send('Tag criada com sucesso');
            }
        }

        const oldTagName = tag[0].name;

        // Atualizar o nome da tag na tabela Tags
        await dbQuery('UPDATE Tags SET name = ?, description = ?, color = ? WHERE id = ? AND empresa_id = ?', [name, description, color, id, empresa_id]);

        res.status(200).send('Tag atualizada com sucesso');
    } catch (error) {
        console.error('Erro ao atualizar tag:', error);
        res.status(500).send(error);
    }
});

router.delete('/delete/tag/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        // Buscar a tag antiga
        let tag = await dbQuery('SELECT * FROM Tags WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (tag.length === 0) {
            return res.status(404).send('Tag não encontrada');
        }

        // Deletar a tag
        await dbQuery('DELETE FROM Tags WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).send({ message: 'Tag atualizada com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar tag:', error);
        res.status(500).send(error);
    }
});

router.post('/save/tags', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            refId,
            refType,
            tags
        } = req.body;

        if (!refId || !refType || !Array.isArray(tags)) {
            return res.status(400).send('Parâmetros inválidos');
        }

        console.log(refId, refType, tags);

        if (refType != 'cliente' && refType != 'negocio') {
            return res.status(400).json({ message: 'Tipo de referência inválido.' });
        }

        let atividadeRes;
        let table = refType == 'cliente' ? 'CLIENTES' : refType == 'negocio' ? 'Negocios' : null;
        let valueId = refType == 'cliente' ? 'cli_Id' : refType == 'negocio' ? 'id' : null;
        let tagsCol = refType == 'cliente' ? 'cli_tags' : refType == 'negocio' ? 'tags' : null;

        let dataQuery = await dbQuery(`SELECT * FROM ${table} WHERE ${valueId} = ? AND empresa_id = ?`, [refId, empresa_id]);
        if (dataQuery.length === 0) {
            return res.status(404).json({ message: `${refType} não encontrado.` });
        }

        let update = await dbQuery(`UPDATE ${table} SET ${tagsCol} = ? WHERE ${valueId} = ? AND empresa_id = ?`, [JSON.stringify(tags), refId, empresa_id]);

        if (update.affectedRows === 0) {
            return res.status(500).json({ message: 'Erro ao atualizar tags.' });
        }

        res.status(200).send('Tags atualizadas com sucesso');
    } catch (error) {
        console.error('Erro ao salvar tags:', error);
        res.status(500).send(error);
    }
});

/*
* Atividades
*/

router.post('/upsert/atividade', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            refId,
            refType,
            id = null,
            title,
            type,
            description = null,
            date,
            hora = null,
            dateAte = null,
            horaAte = null,
            concluido = false,
            endereco = null,
            funcionario = null,
            notifyCliente = false,
            notifyFuncionario = false,
        } = req.body;

        if (!refId || !title || !date || !type || !refType) {
            return res.status(400).json({ message: 'Preencha todos os campos obrigatórios.' });
        }

        console.log(refId, refType);

        if (refType != 'cliente' && refType != 'negocio') {
            return res.status(400).json({ message: 'Tipo de referência inválido.' });
        }

        let atividadeRes;
        let table = refType == 'cliente' ? 'CLIENTES' : refType == 'negocio' ? 'Negocios' : null;
        let valueId = refType == 'cliente' ? 'cli_Id' : refType == 'negocio' ? 'id' : null;
        let atividadeCol = refType == 'cliente' ? 'cli_atividades' : refType == 'negocio' ? 'atividades' : null;
        let historicoCol = refType == 'cliente' ? 'cli_historico' : refType == 'negocio' ? 'historico' : null;

        let dataQuery = await dbQuery(`SELECT * FROM ${table} WHERE ${valueId} = ? AND empresa_id = ?`, [refId, empresa_id]);
        if (dataQuery.length === 0) {
            return res.status(404).json({ message: `${refType} não encontrado.` });
        }

        let data = dataQuery[0];

        let atividadesAtuais = data[atividadeCol] ? JSON.parse(data[atividadeCol]) : [];
        let historicoAtual = data[historicoCol] ? JSON.parse(data[historicoCol]) : [];

        if (!id) {
            let atividade = {
                id: Date.now(), // Gera um ID único baseado no timestamp atual
                title,
                type,
                description,
                date,
                hora,
                dateAte,
                horaAte,
                concluido,
                endereco,
                funcionario: funcionario ? funcionario : {
                    id: req.user.id,
                    fullName: req.user.fullName,
                    avatar: req.user.avatar ?? null
                },
                notifyCliente,
                notifyFuncionario,
                created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                created_by: {
                    id: req.user.id,
                    fullName: req.user.fullName,
                    avatar: req.user.avatar ?? null
                }
            };

            // Salvar a atividade no banco de dados
            atividadesAtuais.push(atividade);

            atividadesAtuais = atividadesAtuais.sort((a, b) => new Date(a.date) - new Date(b.date));

            atividadeRes = atividade;

            // Adicionar ao histórico
            historicoAtual.unshift({
                title: `Atividade ${title} criada`,
                description: `Atividade ${title} criada no painel`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
                color: 'info',
                icon: 'tabler-list-details'
            });
        } else {
            // Atualizar atividade existente
            let atividadeIndex = atividadesAtuais.findIndex(a => a.id === id);
            if (atividadeIndex === -1) {
                return res.status(404).json({ message: 'Atividade não encontrada.' });
            }

            atividadesAtuais[atividadeIndex] = {
                ...atividadesAtuais[atividadeIndex],
                title,
                description,
                date,
                hora,
                dateAte,
                horaAte,
                concluido,
                endereco,
                type,
                funcionario: funcionario ? funcionario : atividadesAtuais[atividadeIndex].funcionario,
                notifyCliente,
                notifyFuncionario,
                updated_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                updated_by: {
                    id: req.user.id,
                    fullName: req.user.fullName,
                    avatar: req.user.avatar ?? null
                }
            };

            atividadeRes = atividadesAtuais[atividadeIndex];

            // Adicionar ao histórico
            historicoAtual.unshift({
                title: `Atividade ${title} atualizada${concluido ? ' e concluída' : ''}`,
                description: `Atividade ${title} foi atualizada no painel${concluido ? ' e marcada como concluída' : ''}`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
                color: concluido ? 'success' : 'info',
                icon: 'tabler-list-details'
            });
        }

        await dbQuery(`UPDATE ${table} SET ${atividadeCol} = ?, ${historicoCol} = ? WHERE ${valueId} = ? AND empresa_id = ?`,
            [JSON.stringify(atividadesAtuais), JSON.stringify(historicoAtual), refId, empresa_id]);

        res.status(201).json({ message: 'Atividade criada com sucesso.', atividade: atividadeRes });
    } catch (error) {
        console.error('Erro ao criar atividade:', error);
        res.status(500).json({ message: 'Erro ao criar atividade.', error });
    }
});

router.delete('/delete/atividade', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            refId,
            refType,
            atividadeId
        } = req.body;

        let table = refType == 'cliente' ? 'CLIENTES' : refType == 'negocio' ? 'Negocios' : null;
        let valueId = refType == 'cliente' ? 'cli_Id' : refType == 'negocio' ? 'id' : null;
        let atividadeCol = refType == 'cliente' ? 'cli_atividades' : refType == 'negocio' ? 'atividades' : null;

        let dataQuery = await dbQuery(`SELECT * FROM ${table} WHERE ${valueId} = ? AND empresa_id = ?`, [refId, empresa_id]);
        if (dataQuery.length === 0) {
            return res.status(404).json({ message: `${refType} não encontrado.` });
        }

        let data = dataQuery[0];

        let atividadesAtuais = data[atividadeCol] ? JSON.parse(data[atividadeCol]) : [];
        let atividadeIndex = atividadesAtuais.findIndex(a => a.id == atividadeId);

        if (atividadeIndex === -1) {
            return res.status(404).json({ message: 'Atividade não encontrada.' });
        }

        atividadesAtuais.splice(atividadeIndex, 1);

        await dbQuery(`UPDATE ${table} SET ${atividadeCol} = ? WHERE ${valueId} = ? AND empresa_id = ?`, [JSON.stringify(atividadesAtuais), refId, empresa_id]);
        res.status(200).json({ message: 'Atividade deletada com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar atividade:', error);
        res.status(500).json({ message: 'Erro ao deletar atividade.', error });
    }
});

/*
* Anotações
*/

router.post('/upsert/anotacao', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            refId,
            refType,
            id = null,
            content,
            feitoPor = null
        } = req.body;

        if (!refId || !content || !refType) {
            return res.status(400).json({ message: 'Preencha todos os campos obrigatórios.' });
        }

        let anotacaoRes;
        let table = refType == 'cliente' ? 'CLIENTES' : refType == 'negocio' ? 'Negocios' : null;
        let valueId = refType == 'cliente' ? 'cli_Id' : refType == 'negocio' ? 'id' : null;
        let anotacaoCol = refType == 'cliente' ? 'cli_anotacoes' : refType == 'negocio' ? 'anotacoes' : null;
        let historicoCol = refType == 'cliente' ? 'cli_historico' : refType == 'negocio' ? 'historico' : null;

        let dataQuery = await dbQuery(`SELECT * FROM ${table} WHERE ${valueId} = ? AND empresa_id = ?`, [refId, empresa_id]);
        if (dataQuery.length === 0) {
            return res.status(404).json({ message: `${refType} não encontrado.` });
        }

        let data = dataQuery[0];

        let anotacoesAtuais = data[anotacaoCol] ? JSON.parse(data[anotacaoCol]) : [];
        let historicoAtual = data[historicoCol] ? JSON.parse(data[historicoCol]) : [];

        if (!id) {
            // Se não existir, cria uma nova anotação
            let newAnotacao = {
                id: moment().unix(),
                content,
                feitoPor: feitoPor && feitoPor.id ? feitoPor : {
                    id: req.user.id,
                    fullName: req.user.fullName,
                },
                created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
                updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
            };

            anotacoesAtuais.push(newAnotacao);

            anotacaoRes = newAnotacao;

            historicoAtual.unshift({
                title: `Anotação adicionada`,
                description: `Uma nova anotação foi adicionada.`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
                color: '#fff6d6',
                icon: 'tabler-note'
            });
        } else {
            let anotacaoIndex = anotacoesAtuais.findIndex(a => a.id === id);

            if (anotacaoIndex === -1) {
                return res.status(404).json({ message: 'Anotação não encontrada.' });
            }

            // Se existir, atualiza a anotação
            anotacoesAtuais[anotacaoIndex] = {
                ...anotacoesAtuais[anotacaoIndex],
                content,
                feitoPor: feitoPor && feitoPor.id ? feitoPor : {
                    id: req.user.id,
                    fullName: req.user.fullName,
                },
                updated_at: moment().format('YYYY-MM-DD HH:mm:ss')
            };

            anotacaoRes = anotacoesAtuais[anotacaoIndex];

            historicoAtual.unshift({
                title: `Anotação atualizada`,
                description: `Uma anotação foi atualizada.`,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
                color: '#fff6d6',
                icon: 'tabler-note'
            });
        }

        await dbQuery(`UPDATE ${table} SET ${anotacaoCol} = ?, ${historicoCol} = ? WHERE ${valueId} = ? AND empresa_id = ?`,
            [JSON.stringify(anotacoesAtuais), JSON.stringify(historicoAtual), refId, empresa_id]);

        res.status(201).json({ message: 'Anotação criada/atualizada com sucesso.', anotacao: anotacaoRes });
    } catch (error) {
        console.error('Erro ao criar/atualizar anotação:', error);
        res.status(500).json({ message: 'Erro ao criar/atualizar anotação.', error });
    }
});

router.delete('/delete/anotacao', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            refId,
            refType,
            anotacaoId
        } = req.body;

        let table = refType == 'cliente' ? 'CLIENTES' : refType == 'negocio' ? 'Negocios' : null;
        let valueId = refType == 'cliente' ? 'cli_Id' : refType == 'negocio' ? 'id' : null;
        let anotacaoCol = refType == 'cliente' ? 'cli_anotacoes' : refType == 'negocio' ? 'anotacoes' : null;

        let dataQuery = await dbQuery(`SELECT * FROM ${table} WHERE ${valueId} = ? AND empresa_id = ?`, [refId, empresa_id]);
        if (dataQuery.length === 0) {
            return res.status(404).json({ message: `${refType} não encontrado.` });
        }

        let data = dataQuery[0];

        let anotacoesAtuais = data[anotacaoCol] ? JSON.parse(data[anotacaoCol]) : [];
        let anotacaoIndex = anotacoesAtuais.findIndex(a => a.id == anotacaoId);

        if (anotacaoIndex === -1) {
            return res.status(404).json({ message: 'Anotação não encontrada.' });
        }

        anotacoesAtuais.splice(anotacaoIndex, 1);

        await dbQuery(`UPDATE ${table} SET ${anotacaoCol} = ? WHERE ${valueId} = ? AND empresa_id = ?`,
            [JSON.stringify(anotacoesAtuais), refId, empresa_id]);
        res.status(200).json({ message: 'Anotação deletada com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar anotação:', error);
        res.status(500).json({ message: 'Erro ao deletar anotação.', error });
    }
});

/*
* Funis
*/

router.get('/list/funil', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            negocios = false
        } = req.query;

        let funis = await dbQuery('SELECT * FROM Funis WHERE empresa_id = ? ORDER BY ordem ASC', [empresa_id]);

        if (negocios) {
            let negociosFunis = await dbQuery('SELECT cli_Id, title, id, status, etapaId FROM Negocios WHERE etapaId IN (?) AND empresa_id = ?', [funis.map(f => f.id), empresa_id]);
            if (negociosFunis.length > 0) {
                let clientes = await dbQuery(`SELECT cli_Id, cli_nome FROM CLIENTES WHERE cli_Id IN (?) AND empresa_id = ?`, [negociosFunis.map(n => n.cli_Id), empresa_id]);

                funis.forEach(funil => {
                    funil.negocios = negociosFunis.filter(n => n.etapaId === funil.id).map(n => {
                        let cliente = clientes.find(c => c.cli_Id === n.cli_Id);
                        return {
                            ...n,
                            cliente: cliente ? cliente : null
                        }
                    });
                });
            }
        }

        res.status(200).json(funis);
    } catch (error) {
        console.error('Erro ao listar funis:', error);
        res.status(500).json({ message: 'Erro ao listar funis.', error });
    }
});

router.post('/upsert/funil', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id = null, nome, probabilidade = null, ordem = 0, instrucoesIa } = req.body;

        if (!nome) {
            return res.status(400).json({ message: 'Nome do funil é obrigatório.' });
        }

        let idF;

        if (!id) {
            // Criar novo funil
            let create = await dbQuery('INSERT INTO Funis (nome, probabilidade, ordem, instrucoesIa, empresa_id) VALUES (?, ?, ?, ?, ?)', [nome, probabilidade, ordem, instrucoesIa, empresa_id]);

            if (create.affectedRows == 0) {
                return res.status(500).json({ message: 'Erro ao criar funil.' });
            }

            idF = create.insertId;
        } else {
            // Atualizar funil existente
            let funil = await dbQuery('SELECT * FROM Funis WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

            if (funil.length === 0) {
                return res.status(404).json({ message: 'Funil não encontrado.' });
            }

            await dbQuery('UPDATE Funis SET nome = ?, probabilidade = ?, ordem = ?, instrucoesIa = ? WHERE id = ? AND empresa_id = ?',
                [nome, probabilidade, ordem, instrucoesIa, id, empresa_id]);

            idF = id;
        }

        const funilQuery = await dbQuery('SELECT * FROM Funis WHERE id = ? AND empresa_id = ?', [idF, empresa_id]);
        if (funilQuery.length === 0) {
            return res.status(404).json({ message: 'Funil não encontrado após criação/atualização.' });
        }

        res.status(200).json({ message: 'Funil criado/atualizado com sucesso.', funil: funilQuery[0] });
    } catch (error) {
        console.error('Erro ao criar/atualizar funil:', error);
        res.status(500).json({ message: 'Erro ao criar/atualizar funil.', error });
    }
});

router.delete('/delete/funil/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        let funil = await dbQuery('SELECT * FROM Funis WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (funil.length === 0) {
            return res.status(404).json({ message: 'Funil não encontrado.' });
        }

        const funis = await dbQuery('SELECT * FROM Funis WHERE empresa_id = ?', [empresa_id]);
        if (funis.length <= 1) {
            return res.status(400).json({ message: 'Você deve ter ao menos um funil.' });
        }

        const negociosFunil = await dbQuery('SELECT * FROM Negocios WHERE etapaId = ? AND empresa_id = ?', [id, empresa_id]);
        if (negociosFunil.length > 0) {
            return res.status(400).json({ message: 'Existem negócios vinculados a este funil. Por favor, mova ou exclua esses negócios antes de deletar o funil.' });
        }

        await dbQuery('DELETE FROM Funis WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Funil deletado com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar funil:', error);
        res.status(500).json({ message: 'Erro ao deletar funil.', error });
    }
});

/*
* Negócios
*/

router.get('/list/negocios', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        let {
            q = '',
            sortBy = 'id',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'desc',
            cli_Id = null,
            etapaId = null,
            status = null
        } = req.query;

        itemsPerPage = parseInt(itemsPerPage);

        let offset = (page - 1) * itemsPerPage;

        if (itemsPerPage == '-1') {
            offset = 0;
            itemsPerPage = 1000000;
        }

        q = sanitizeInput(q);

        let baseQuery = 'FROM Negocios WHERE 1=1 AND empresa_id = ?';
        let queryParams = [empresa_id];

        if (cli_Id) {
            baseQuery += ` AND cli_Id = ${cli_Id}`;
        }

        if (etapaId) {
            baseQuery += ` AND etapaId = ${etapaId}`;
        }

        if (status) {
            baseQuery += ` AND status = '${status}'`;
        }

        baseQuery += ` ORDER BY ${sortBy} ${orderBy.toUpperCase()}`;

        let totalNegociosQuery = await dbQuery(`SELECT COUNT(*) as totalNegocios ${baseQuery}`, queryParams);
        let totalNegocios = totalNegociosQuery[0] ? totalNegociosQuery[0].totalNegocios : 0;

        baseQuery += ` LIMIT ${itemsPerPage} OFFSET ${offset}`;

        let itens = `
            id, cli_Id, title, etapaId, status, valor, origem, age_id, atividades, anotacoes, tags,
            data_fechamento_esperada, data_fechamento, motivoPerdido, obsPerdido, dataPerdido,
            created_at, updated_at, created_by, updated_by
        `;

        let negocios = await dbQuery(`SELECT ${itens} ${baseQuery}`, queryParams);

        for(let negocio of negocios) {
            negocio.atividades = JSON.parse(negocio.atividades || '[]');
            negocio.anotacoes = JSON.parse(negocio.anotacoes || '[]');
            negocio.tags = JSON.parse(negocio.tags || '[]');

            let etapa = await dbQuery('SELECT * FROM Funis WHERE id = ? AND empresa_id = ?', [negocio.etapaId, empresa_id]);
            negocio.etapa = etapa.length > 0 ? etapa[0] : null;
        }

        res.status(200).json({ negocios, totalNegocios });
    } catch (error) {
        console.error('Erro ao listar negócios:', error);
        res.status(500).json({ message: 'Erro ao listar negócios.', error });
    }
});

router.get('/get/negocio/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        const negocio = negocioQuery[0];

        negocio.atividades = JSON.parse(negocio.atividades || '[]');
        negocio.anotacoes = JSON.parse(negocio.anotacoes || '[]');
        negocio.historico = JSON.parse(negocio.historico || '[]');
        negocio.tags = JSON.parse(negocio.tags || '[]');

        let cliente = await dbQuery('SELECT cli_Id, cli_nome, cli_cpf, cli_celular, cli_email, cli_tags FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?', [negocio.cli_Id, empresa_id]);
        negocio.cliente = cliente.length > 0 ? cliente[0] : null;

        if (negocio.cliente) {
            negocio.cliente.tags = JSON.parse(negocio.cliente?.cli_tags || '[]');

            let enderecos = await dbQuery('SELECT * FROM ENDERECO WHERE cli_Id = ?', [negocio.cliente.cli_Id]);

            negocio.cliente.enderecos = enderecos.length > 0 ? enderecos : [];
        }

        if (negocio.age_id) {
            let query = 'SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?';
            let agendamento = await getAgendamentos(query, [negocio.age_id, empresa_id], empresa_id);
            negocio.agendamento = agendamento.length > 0 ? agendamento[0] : null;
        }

        let idade = moment().diff(moment(negocio.created_at), 'days') > 0 ?
            moment().diff(moment(negocio.created_at), 'days') + ' dia(s)' :
            moment().diff(moment(negocio.created_at), 'hours') > 0 ?
                moment().diff(moment(negocio.created_at), 'hours') + ' hora(s)' :
                moment().diff(moment(negocio.created_at), 'minutes') > 0 ?
                    moment().diff(moment(negocio.created_at), 'minutes') + ' minuto(s)' :
                    'Agora';

        let idadesEtapas = {};
        if (negocio.historico?.length > 0 &&
            negocio.historico.filter(h => h.type === 'negocio-etapa').length > 0) {
            for (let negocioEtapa of negocio.historico.filter(h => h.type === 'negocio-etapa')) {
                let dataEtapa = negocioEtapa.etapaId !== negocio.etapaId ?
                    moment(negocioEtapa.dateFim) : moment(negocioEtapa.date);

                let idadeEtapa = moment().diff(dataEtapa, 'days') > 0 ?
                    moment().diff(dataEtapa, 'days') + ' dia(s)' :
                    moment().diff(dataEtapa, 'hours') > 0 ?
                        moment().diff(dataEtapa, 'hours') + ' hora(s)' :
                        moment().diff(dataEtapa, 'minutes') > 0 ?
                            moment().diff(dataEtapa, 'minutes') + ' minuto(s)' :
                            'Agora';

                idadesEtapas[negocioEtapa.etapaId] = idadeEtapa;
            }
        }

        negocio.idadesEtapas = idadesEtapas;
        negocio.valor = !negocio.valor ? 0 : parseFloat(negocio.valor);

        res.status(200).json(negocio);
    } catch (error) {
        console.error('Erro ao obter negócio:', error);
        res.status(500).json({ message: 'Erro ao obter negócio.', error });
    }
});

// Rota para fornecer variáveis do crmUtils
router.get('/variaveis', async (req, res) => {
    try {
        res.json(variaveisItens);
    } catch (error) {
        console.error('Erro ao obter variáveis:', error);
        res.status(500).json({ message: 'Erro ao obter variáveis.' });
    }
});

router.post('/create/negocio', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            cli_Id,
            title,
            etapaId
        } = req.body;

        if (!cli_Id || !title || !etapaId) {
            return res.status(400).json({ message: 'Cliente, título e etapa são obrigatórios.' });
        }

        let cliente = await dbQuery('SELECT * FROM CLIENTES WHERE cli_Id = ? AND empresa_id = ?', [cli_Id, empresa_id]);
        if (cliente.length === 0) {
            return res.status(404).json({ message: 'Cliente não encontrado.' });
        }

        let hist = {
            title: 'Negócio criado',
            description: `Negócio ${title} criado no painel`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'success',
            icon: 'tabler-briefcase',
            type: 'negocio-criado'
        }

        let historicoCliente = cliente[0].cli_historico ? JSON.parse(cliente[0].cli_historico) : [];

        historicoCliente.unshift(hist);

        let funil = await dbQuery('SELECT * FROM Funis WHERE id = ? AND empresa_id = ?', [etapaId, empresa_id]);
        if (funil.length === 0) {
            return res.status(404).json({ message: 'Etapa do funil não encontrada.' });
        }

        let newHistorico = [
            { ...hist },
            {
                type: 'negocio-etapa',
                etapa: funil[0].nome,
                etapaId: funil[0].id,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                feitoPor: req.user ? req.user.fullName : 'N/A',
            }
        ];

        let newNegocio = {
            cli_Id,
            title,
            etapaId,
            historico: JSON.stringify(newHistorico),
            status: 'Pendente',
            created_by: req.user?.fullName || 'N/A',
            empresa_id
        }

        let newNegocioQuery = await dbQuery('INSERT INTO Negocios (cli_Id, title, etapaId, status, created_by, historico, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [newNegocio.cli_Id, newNegocio.title, newNegocio.etapaId, newNegocio.status, newNegocio.created_by, newNegocio.historico, empresa_id]);

        if (newNegocioQuery.affectedRows == 0) {
            return res.status(500).json({ message: 'Erro ao criar negócio.' });
        }

        let createdNegocio = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [newNegocioQuery.insertId, empresa_id]);

        if (createdNegocio.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado após criação.' });
        }

        await dbQuery('UPDATE CLIENTES SET cli_historico = ? WHERE cli_Id = ? AND empresa_id = ?', [JSON.stringify(historicoCliente), cli_Id, empresa_id]);
        res.status(201).json({ message: 'Negócio criado com sucesso.', negocio: createdNegocio[0] });
    } catch (error) {
        console.error('Erro ao criar negócio:', error);
        res.status(500).json({ message: 'Erro ao criar negócio.', error });
    }
});

router.put('/update/negocio/etapa', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            id,
            etapaId
        } = req.body;

        if (!id || !etapaId) {
            return res.status(400).json({ message: 'ID do negócio e etapa são obrigatórios.' });
        }

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        const negocio = negocioQuery[0];

        if (negocio.etapaId == etapaId) {
            return res.status(400).json({ message: 'Negócio já está nesta etapa.' });
        }

        let funil = await dbQuery('SELECT * FROM Funis WHERE id = ? AND empresa_id = ?', [etapaId, empresa_id]);
        if (funil.length === 0) {
            return res.status(404).json({ message: 'Etapa do funil não encontrada.' });
        }

        const historico = negocio.historico ? JSON.parse(negocio.historico) : [];

        let lastEtapaHist = historico.find(h => h.type === 'negocio-etapa' && h.etapaId === negocio.etapaId);

        if (lastEtapaHist) {
            lastEtapaHist.dateFim = moment().format('YYYY-MM-DD HH:mm:ss');
        }

        //Verificar se já existe uma etapa igual no histórico
        if (historico.find(h => h.type === 'negocio-etapa' && h.etapaId === etapaId)) {
            let histAtual = historico.find(h => h.type === 'negocio-etapa' && h.etapaId === etapaId);

            histAtual.feitoPor = req.user ? req.user.fullName : 'N/A';
            histAtual.dateFim = null;
        } else {
            historico.unshift({
                type: 'negocio-etapa',
                etapa: funil[0].nome,
                etapaId: funil[0].id,
                date: moment().format('YYYY-MM-DD HH:mm:ss'),
                dateFim: null,
                feitoPor: req.user ? req.user.fullName : 'N/A',
            });
        }

        historico.unshift({
            title: 'Etapa do negócio atualizada',
            description: `Negócio movido para a etapa ${funil[0].nome}`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'warning',
            icon: 'tabler-briefcase'
        });

        await dbQuery('UPDATE Negocios SET historico = ?, etapaId = ?, updated_by = ? WHERE id = ? AND empresa_id = ?',
            [JSON.stringify(historico), etapaId, req.user?.fullName || 'N/A', id, empresa_id]);

        res.status(200).json({ message: 'Etapa do negócio atualizada com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar etapa do negócio:', error);
        res.status(500).json({ message: 'Erro ao atualizar etapa do negócio.', error });
    }
});

router.put('/update/negocio/key', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            id,
            key,
            value
        } = req.body;

        if (!id || !key) {
            return res.status(400).json({ message: 'ID do negócio e chave são obrigatórios.' });
        }

        let allowedKeys = [
            { title: 'Título', key: 'title' },
            { title: 'Valor', key: 'valor' },
            { title: 'Origem', key: 'origem' },
            { title: 'Data de Fechamento Esperada', key: 'data_fechamento_esperada' }
        ];

        if (!allowedKeys.find(k => k.key === key)) {
            return res.status(400).json({ message: 'Chave inválida para atualização.' });
        }

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        const negocio = negocioQuery[0];

        if (negocio[key] == value) {
            return res.status(400).json({ message: `O negócio já possui este valor para ${key}.` });
        }

        const historico = negocio.historico ? JSON.parse(negocio.historico) : [];

        historico.unshift({
            title: `${allowedKeys.find(k => k.key === key).title} do negócio atualizado`,
            description: `O ${allowedKeys.find(k => k.key === key).title.toLowerCase()} do negócio foi atualizado para ${value}`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'warning',
            icon: 'tabler-edit'
        });

        await dbQuery(`UPDATE Negocios SET historico = ?, ${key} = ? WHERE id = ? AND empresa_id = ?`,
            [JSON.stringify(historico), value, id, empresa_id]);

        res.status(200).json({ message: `${allowedKeys.find(k => k.key === key).title} do negócio atualizado com sucesso.` });
    } catch (error) {
        console.error('Erro ao atualizar negócio:', error);
        res.status(500).json({ message: 'Erro ao atualizar negócio.', error });
    }
});

router.put('/update/negocio/vincularAgendamento', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id, age_id } = req.body;

        if (!id || !age_id) {
            return res.status(400).json({ message: 'ID do negócio e ID do agendamento são obrigatórios.' });
        }

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        let agendamentoQuery = await dbQuery('SELECT * FROM AGENDAMENTO WHERE age_id = ? AND empresa_id = ?', [age_id, empresa_id]);
        if (agendamentoQuery.length === 0) {
            return res.status(404).json({ message: 'Agendamento não encontrado.' });
        }

        const negocio = negocioQuery[0];
        const agendamento = agendamentoQuery[0];

        if (negocio.age_id == age_id) {
            return res.status(400).json({ message: 'Negócio já está vinculado a este agendamento.' });
        }

        const historico = negocio.historico ? JSON.parse(negocio.historico) : [];

        historico.unshift({
            title: `Agendamento vinculado ao negócio`,
            description: `O agendamento ${agendamento.title} foi vinculado ao negócio ${negocio.title}`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'info',
            icon: 'tabler-calendar-plus'
        });

        await dbQuery(`UPDATE Negocios SET historico = ?, age_id = ? WHERE id = ? AND empresa_id = ?`,
            [JSON.stringify(historico), age_id, id, empresa_id]);

        res.status(200).json({ message: `Agendamento vinculado ao negócio com sucesso.` });
    } catch (error) {
        console.error('Erro ao vincular agendamento ao negócio:', error);
        res.status(500).json({ message: 'Erro ao vincular agendamento ao negócio.', error });
    }
});

router.put('/update/negocio/ganho', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'ID do negócio é obrigatório.' });
        }

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        const negocio = negocioQuery[0];

        if (negocio.status.toLowerCase() === 'ganho') {
            return res.status(400).json({ message: 'Negócio já está marcado como ganho.' });
        }

        const historico = negocio.historico ? JSON.parse(negocio.historico) : [];

        historico.unshift({
            title: `Negócio marcado como ganho :)`,
            description: `O negócio foi marcado como ganho :)`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'success',
            icon: 'tabler-mood-happy-filled',
            type: 'negocio-status-atualizado'
        });


        await dbQuery('UPDATE Negocios SET status = ?, historico = ?, data_fechamento = ?, motivoPerdido = NULL, obsPerdido = NULL, dataPerdido = NULL WHERE id = ? AND empresa_id = ?',
            ['Ganho', JSON.stringify(historico), moment().format('YYYY-MM-DD'), id, empresa_id]);

        res.status(200).json({ message: 'Status do negócio atualizado para ganho com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar status do negócio:', error);
        res.status(500).json({ message: 'Erro ao atualizar status do negócio.', error });
    }
});

router.put('/update/negocio/perdido', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id, motivo, obs = null } = req.body;

        if (!id || !motivo) {
            return res.status(400).json({ message: 'ID do negócio e motivo são obrigatórios.' });
        }

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        const negocio = negocioQuery[0];

        if (negocio.status.toLowerCase() === 'perdido') {
            return res.status(400).json({ message: 'Negócio já está marcado como perdido.' });
        }

        const historico = negocio.historico ? JSON.parse(negocio.historico) : [];

        historico.unshift({
            title: `Negócio marcado como perdido :(`,
            description: `O negócio foi marcado como perdido :(`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'error',
            icon: 'tabler-mood-sad-filled',
            type: 'negocio-status-atualizado'
        });

        await dbQuery('UPDATE Negocios SET status = ?, historico = ?, data_fechamento = NULL, motivoPerdido = ?, obsPerdido = ?, dataPerdido = ? WHERE id = ? AND empresa_id = ?',
            ['Perdido', JSON.stringify(historico), motivo, obs, moment().format('YYYY-MM-DD HH:mm:ss'), id, empresa_id]);

        res.status(200).json({ message: 'Status do negócio atualizado para perdido com sucesso.' });
    } catch (error) {
        console.error('Erro ao atualizar status do negócio:', error);
        res.status(500).json({ message: 'Erro ao atualizar status do negócio.', error });
    }
});

router.post('/duplicate/negocio', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'ID do negócio é obrigatório.' });
        }

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        const negocio = negocioQuery[0];

        let newHistorico = negocio.historico ? JSON.parse(negocio.historico) : [];

        newHistorico.unshift({
            title: 'Negócio duplicado',
            description: `Negócio ${negocio.title} duplicado no painel`,
            date: moment().format('YYYY-MM-DD HH:mm:ss'),
            feitoPor: req.user ? req.user.fullName : 'N/A',
            color: 'info',
            icon: 'tabler-copy',
            type: 'negocio-duplicado'
        });

        delete negocio.id;
        delete negocio.created_at;
        delete negocio.updated_at;

        let newNegocio = {
            ...negocio,
            cli_Id: negocio.cli_Id,
            title: negocio.title + ' (Cópia)',
            valor: negocio.valor,
            origem: negocio.origem,
            data_fechamento_esperada: negocio.data_fechamento_esperada,
            historico: JSON.stringify(newHistorico),
            updated_by: req.user?.fullName || 'N/A',
            created_by: req.user?.fullName || 'N/A',
            created_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            updated_at: moment().format('YYYY-MM-DD HH:mm:ss'),
            etapaId: negocio.etapaId,
            status: negocio.status,
            empresa_id
        };

        let novoQuery = await dbQuery('INSERT INTO Negocios SET ?', [newNegocio]);

        res.status(200).json({ message: 'Negócio duplicado com sucesso.', id: novoQuery.insertId });
    } catch (error) {
        console.error('Erro ao duplicar negócio:', error);
        res.status(500).json({ message: 'Erro ao duplicar negócio.', error });
    }
});

router.delete('/delete/negocio/:id', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.params;

        let negocioQuery = await dbQuery('SELECT * FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);
        if (negocioQuery.length === 0) {
            return res.status(404).json({ message: 'Negócio não encontrado.' });
        }

        await dbQuery('DELETE FROM Negocios WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Negócio deletado com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar negócio:', error);
        res.status(500).json({ message: 'Erro ao deletar negócio.', error });
    }
});

/*
* Listagem Geral de Atividades
*/

router.get('/list/all-atividades', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            q = '',
            searchType = '', // cliente ou negocio
            searchRefId = '', // ID do cliente ou negócio
            typeAtividade = '', // Tipo da atividade
            dataInicio = '',
            dataFim = '',
            funcionarioId = '',
            concluido = '', // true, false ou vazio
            sortBy = 'date',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'desc'
        } = req.query;

        let allAtividades = [];

        // Buscar atividades dos clientes
        let clientesQuery = 'SELECT cli_Id, cli_nome, cli_atividades FROM CLIENTES WHERE cli_atividades IS NOT NULL AND cli_atividades != "[]" AND empresa_id = ?';
        let clientes = await dbQuery(clientesQuery, [empresa_id]);

        for (let cliente of clientes) {
            let atividades = [];
            try {
                atividades = JSON.parse(cliente.cli_atividades || '[]');
            } catch (e) {
                console.error('Erro ao parsear atividades do cliente', cliente.cli_Id, e);
                continue;
            }

            atividades.forEach(atividade => {
                allAtividades.push({
                    ...atividade,
                    refType: 'cliente',
                    refId: cliente.cli_Id,
                    refNome: cliente.cli_nome
                });
            });
        }

        // Buscar atividades dos negócios
        let negociosQuery = 'SELECT n.id, n.title, n.atividades, n.cli_Id, c.cli_nome FROM Negocios n LEFT JOIN CLIENTES c ON c.cli_Id = n.cli_Id WHERE n.atividades IS NOT NULL AND n.atividades != "[]" AND n.empresa_id = ?';
        let negocios = await dbQuery(negociosQuery, [empresa_id]);

        for (let negocio of negocios) {
            let atividades = [];
            try {
                atividades = JSON.parse(negocio.atividades || '[]');
            } catch (e) {
                console.error('Erro ao parsear atividades do negócio', negocio.id, e);
                continue;
            }

            atividades.forEach(atividade => {
                allAtividades.push({
                    ...atividade,
                    refType: 'negocio',
                    refId: negocio.id,
                    refNome: negocio.title,
                    clienteId: negocio.cli_Id,
                    clienteNome: negocio.cli_nome
                });
            });
        }

        // Aplicar filtros
        if (q) {
            const searchLower = q.toLowerCase();
            allAtividades = allAtividades.filter(a =>
                (a.title || '').toLowerCase().includes(searchLower) ||
                (a.description || '').toLowerCase().includes(searchLower) ||
                (a.refNome || '').toLowerCase().includes(searchLower) ||
                (a.clienteNome || '').toLowerCase().includes(searchLower)
            );
        }

        if (searchType) {
            allAtividades = allAtividades.filter(a => a.refType === searchType);
        }

        if (searchRefId) {
            allAtividades = allAtividades.filter(a => a.refId == searchRefId);
        }

        if (typeAtividade) {
            allAtividades = allAtividades.filter(a => a.type === typeAtividade);
        }

        if (dataInicio) {
            allAtividades = allAtividades.filter(a =>
                moment(a.date).isSameOrAfter(moment(dataInicio))
            );
        }

        if (dataFim) {
            allAtividades = allAtividades.filter(a =>
                moment(a.date).isSameOrBefore(moment(dataFim))
            );
        }

        if (funcionarioId) {
            allAtividades = allAtividades.filter(a => a.funcionario?.id == funcionarioId);
        }

        if (concluido !== '') {
            const isCompleted = concluido === 'true' || concluido === true;
            allAtividades = allAtividades.filter(a => a.concluido === isCompleted);
        }

        // Ordenar
        allAtividades.sort((a, b) => {
            if (sortBy === 'date') {
                return orderBy === 'desc' ?
                    new Date(b.date) - new Date(a.date) :
                    new Date(a.date) - new Date(b.date);
            } else if (sortBy === 'title') {
                return orderBy === 'desc' ?
                    b.title.localeCompare(a.title) :
                    a.title.localeCompare(b.title);
            }
            return 0;
        });

        const totalAtividades = allAtividades.length;

        // Paginação
        if (itemsPerPage != 'todos') {
            const start = (page - 1) * parseInt(itemsPerPage);
            const end = start + parseInt(itemsPerPage);
            allAtividades = allAtividades.slice(start, end);
        }

        res.status(200).json({
            atividades: allAtividades,
            totalAtividades
        });
    } catch (error) {
        console.error('Erro ao listar atividades:', error);
        res.status(500).json({ message: 'Erro ao listar atividades.', error });
    }
});

/*
* Listagem Geral de Anotações
*/

router.get('/list/all-anotacoes', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            q = '',
            searchType = '', // cliente ou negocio
            searchRefId = '', // ID do cliente ou negócio
            dataInicio = '',
            dataFim = '',
            funcionarioId = '',
            sortBy = 'date',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'desc'
        } = req.query;

        let allAnotacoes = [];

        // Buscar anotações dos clientes
        let clientesQuery = 'SELECT cli_Id, cli_nome, cli_anotacoes FROM CLIENTES WHERE cli_anotacoes IS NOT NULL AND cli_anotacoes != "[]" AND empresa_id = ?';
        let clientes = await dbQuery(clientesQuery, [empresa_id]);

        for (let cliente of clientes) {
            let anotacoes = [];
            try {
                anotacoes = JSON.parse(cliente.cli_anotacoes || '[]');
            } catch (e) {
                console.error('Erro ao parsear anotações do cliente', cliente.cli_Id, e);
                continue;
            }

            anotacoes.forEach(anotacao => {
                allAnotacoes.push({
                    ...anotacao,
                    refType: 'cliente',
                    refId: cliente.cli_Id,
                    refNome: cliente.cli_nome
                });
            });
        }

        // Buscar anotações dos negócios
        let negociosQuery = 'SELECT n.id, n.title, n.anotacoes, n.cli_Id, c.cli_nome FROM Negocios n LEFT JOIN CLIENTES c ON c.cli_Id = n.cli_Id WHERE n.anotacoes IS NOT NULL AND n.anotacoes != "[]" AND n.empresa_id = ?';
        let negocios = await dbQuery(negociosQuery, [empresa_id]);

        for (let negocio of negocios) {
            let anotacoes = [];
            try {
                anotacoes = JSON.parse(negocio.anotacoes || '[]');
            } catch (e) {
                console.error('Erro ao parsear anotações do negócio', negocio.id, e);
                continue;
            }

            anotacoes.forEach(anotacao => {
                allAnotacoes.push({
                    ...anotacao,
                    refType: 'negocio',
                    refId: negocio.id,
                    refNome: negocio.title,
                    clienteId: negocio.cli_Id,
                    clienteNome: negocio.cli_nome
                });
            });
        }

        // Aplicar filtros
        if (q) {
            const searchLower = q.toLowerCase();
            allAnotacoes = allAnotacoes.filter(a =>
                (a.content || '').toLowerCase().includes(searchLower) ||
                (a.refNome || '').toLowerCase().includes(searchLower) ||
                (a.clienteNome || '').toLowerCase().includes(searchLower) ||
                (a.feitoPor?.fullName || '').toLowerCase().includes(searchLower)
            );
        }

        if (searchType) {
            allAnotacoes = allAnotacoes.filter(a => a.refType === searchType);
        }

        if (searchRefId) {
            allAnotacoes = allAnotacoes.filter(a => a.refId == searchRefId);
        }

        if (dataInicio) {
            allAnotacoes = allAnotacoes.filter(a =>
                moment(a.created_at).isSameOrAfter(moment(dataInicio))
            );
        }

        if (dataFim) {
            allAnotacoes = allAnotacoes.filter(a =>
                moment(a.created_at).isSameOrBefore(moment(dataFim))
            );
        }

        if (funcionarioId) {
            allAnotacoes = allAnotacoes.filter(a => a.feitoPor?.id == funcionarioId);
        }

        // Ordenar
        allAnotacoes.sort((a, b) => {
            if (sortBy === 'date') {
                return orderBy === 'desc' ?
                    new Date(b.created_at) - new Date(a.created_at) :
                    new Date(a.created_at) - new Date(b.created_at);
            } else if (sortBy === 'content') {
                return orderBy === 'desc' ?
                    (b.content || '').localeCompare(a.content || '') :
                    (a.content || '').localeCompare(b.content || '');
            }
            return 0;
        });

        const totalAnotacoes = allAnotacoes.length;

        // Paginação
        if (itemsPerPage != 'todos') {
            const start = (page - 1) * parseInt(itemsPerPage);
            const end = start + parseInt(itemsPerPage);
            allAnotacoes = allAnotacoes.slice(start, end);
        }

        res.status(200).json({
            anotacoes: allAnotacoes,
            totalAnotacoes
        });
    } catch (error) {
        console.error('Erro ao listar anotações:', error);
        res.status(500).json({ message: 'Erro ao listar anotações.', error });
    }
});

module.exports = router;
