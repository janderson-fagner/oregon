const express = require('express');
const router = express.Router();
const path = require('path');
const db = require('../database');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const transporter = require('../transporter');
const fs = require('fs');
const handlebars = require('handlebars');
const util = require('util');

require('dotenv').config();
const paginateArray = (array, perPage, page) => array.slice((page - 1) * perPage, page * perPage)
const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const caminhoimg = path.join(__dirname, '../uploads/fotos-perfil');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, caminhoimg);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

router.get('/list', async (req, res) => {
    const {
        q = '',
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc',
        search = false
    } = req.query;

    const empresa_id = req.user.empresa_id;
    const offset = (page - 1) * itemsPerPage;

    let query = `SELECT * FROM SERVICOS_NEW WHERE empresa_id = ${parseInt(empresa_id)}`;

    if (q) {
        let idsSubs = [];

        let subsQ = await dbQuery(`SELECT * FROM SERVICOS_SUBS WHERE empresa_id = ? AND (ser_nome LIKE '%${q}%' OR ser_descricao LIKE '%${q}%' OR ser_valor LIKE '%${q}%')`, [empresa_id]);

        if (subsQ && subsQ.length > 0) {
            idsSubs = subsQ.map(s => s.ser_pai);
        }

        let basesubs = idsSubs.length > 0 ? `OR ser_id IN (${idsSubs.join(',')})` : '';

        query += ` AND (
            ser_nome LIKE '%${q}%' OR 
            ser_descricao LIKE '%${q}%' OR 
            ser_valor LIKE '%${q}%' 
            ${basesubs}
        )`;
    }

    if (sortBy) {
        query += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        query += ` ORDER BY created_at DESC`;
    }

    if (itemsPerPage !== -1 && itemsPerPage !== '-1') {
        query += ` LIMIT ${offset}, ${itemsPerPage}`;
    }

    try {
        let totalServicos = await dbQuery(`SELECT COUNT(*) AS total FROM SERVICOS_NEW WHERE empresa_id = ?`, [empresa_id]);

        const servicos = await dbQuery(query);

        for (let servico of servicos) {
            let subservicos = await dbQuery('SELECT * FROM SERVICOS_SUBS WHERE ser_pai = ? AND empresa_id = ?', [servico.ser_id, empresa_id]);
            servico.ser_subservicos = subservicos.map(sub => {
                if (sub.ser_data) {
                    sub.ser_data = JSON.parse(sub.ser_data);
                }
                return sub;
            });
        }

        //Se for search, misturar os subs com os serviços
        if (search) {
            let servicosMisturados = [];

            for (let servico of servicos) {
                servicosMisturados.push(servico);

                for (let sub of servico.ser_subservicos) {
                    let subComPai = {
                        ...sub,
                        isSub: true,
                        pai_name: servico.ser_nome
                    };

                    servicosMisturados.push(subComPai);
                }
            }

            if (q) {
                servicosMisturados = servicosMisturados.filter(s =>
                    s.ser_nome?.toLowerCase().includes(q.toLowerCase())
                    || s.ser_descricao?.toLowerCase()?.includes(q.toLowerCase()));

            }

            return res.status(200).json({
                servicos: paginateArray(servicosMisturados, itemsPerPage, page),
                totalServicos: servicosMisturados.length
            });
        }


        let data = {
            servicos,
            totalServicos: totalServicos[0].total
        };

        res.status(200).json(data);
    } catch (error) {
        console.error('Erro ao buscar serviços', error);
        res.status(500).json(error);
    }
});

router.get('/get/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        const servicoQuery = await dbQuery('SELECT * FROM SERVICOS_NEW WHERE ser_id = ? AND empresa_id = ?', [id, empresa_id]);
        if (servicoQuery.length === 0) {
            return res.status(404).json({ message: 'Serviço não encontrado' });
        }

        const servico = servicoQuery[0];

        let subservicos = await dbQuery('SELECT * FROM SERVICOS_SUBS WHERE ser_pai = ? AND empresa_id = ?', [servico.ser_id, empresa_id]);

        servico.ser_subservicos = subservicos.map(sub => {
            if (sub.ser_data) {
                sub.ser_data = JSON.parse(sub.ser_data);
            }

            return sub;
        });

        res.status(200).json(servico);
    } catch (error) {
        console.error('Erro ao buscar serviço', error);
        res.status(500).json({ error: error.message });
    }
})

router.post('/upsert', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { ser_id = null, ser_nome, ser_descricao, ser_valor, ser_comissao_type = null, ser_comissao = null, ser_subservicos = [] } = req.body;

    if (!ser_nome) {
        return res.status(400).json({ message: 'O nome do serviço é obrigatório' });
    }

    if (ser_subservicos.length > 0 && ser_subservicos.some(s => !s.ser_nome || s.ser_nome.trim() === '')) {
        return res.status(400).json({ message: 'O nome do subserviço é obrigatório' });
    }

    try {
        if (!ser_id) {
            let novoServico = await dbQuery('INSERT INTO SERVICOS_NEW (ser_nome, ser_descricao, ser_valor, ser_comissao_type, ser_comissao, empresa_id) VALUES (?, ?, ?, ?, ?, ?)',
                [ser_nome, ser_descricao, ser_valor, ser_comissao_type, ser_comissao, empresa_id]);

            const servicoId = novoServico.insertId;

            for (let subservico of ser_subservicos) {
                let objSub = {
                    ser_nome: subservico.ser_nome,
                    ser_descricao: subservico.ser_descricao || null,
                    ser_valor: subservico.ser_valor || null,
                    ser_comissao_type: subservico.ser_comissao_type || null,
                    ser_comissao: subservico.ser_comissao || null,
                    ser_pai: servicoId
                };

                if (subservico.ser_data) {
                    objSub.ser_data = JSON.stringify(subservico.ser_data);
                }

                let novoSub = await dbQuery('INSERT INTO SERVICOS_SUBS (ser_nome, ser_descricao, ser_valor, ser_pai, ser_data, ser_comissao_type, ser_comissao, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                    [objSub.ser_nome, objSub.ser_descricao, objSub.ser_valor, objSub.ser_pai, objSub.ser_data || null, objSub.ser_comissao_type || null, objSub.ser_comissao || null, empresa_id]);
            }
        } else {
            await dbQuery('UPDATE SERVICOS_NEW SET ser_nome = ?, ser_descricao = ?, ser_valor = ?, ser_comissao_type = ?, ser_comissao = ? WHERE ser_id = ? AND empresa_id = ?',
                [ser_nome, ser_descricao, ser_valor, ser_comissao_type, ser_comissao, ser_id, empresa_id]);

            const atualizados = [];
            const subsAtuais = await dbQuery('SELECT ser_id FROM SERVICOS_SUBS WHERE ser_pai = ? AND empresa_id = ?', [ser_id, empresa_id]);

            for (let subservico of ser_subservicos) {
                if (subservico.ser_id) {
                    //Atualizar
                    let objSub = {
                        ser_nome: subservico.ser_nome,
                        ser_descricao: subservico.ser_descricao || null,
                        ser_valor: subservico.ser_valor || null,
                        ser_comissao_type: subservico.ser_comissao_type || null,
                        ser_comissao: subservico.ser_comissao || null,
                    };

                    if (subservico.ser_data) {
                        objSub.ser_data = JSON.stringify(subservico.ser_data);
                    }

                    await dbQuery('UPDATE SERVICOS_SUBS SET ser_nome = ?, ser_descricao = ?, ser_valor = ?, ser_data = ?, ser_comissao_type = ?, ser_comissao = ? WHERE ser_id = ? AND empresa_id = ?',
                        [objSub.ser_nome, objSub.ser_descricao, objSub.ser_valor, objSub.ser_data || null, objSub.ser_comissao_type || null, objSub.ser_comissao || null, subservico.ser_id, empresa_id]);

                    atualizados.push(subservico.ser_id);
                } else {
                    //Criar
                    let objSub = {
                        ser_nome: subservico.ser_nome,
                        ser_descricao: subservico.ser_descricao || null,
                        ser_valor: subservico.ser_valor || null,
                        ser_comissao_type: subservico.ser_comissao_type || null,
                        ser_comissao: subservico.ser_comissao || null,
                        ser_pai: ser_id
                    };

                    if (subservico.ser_data) {
                        objSub.ser_data = JSON.stringify(subservico.ser_data);
                    }

                    let novoSub = await dbQuery('INSERT INTO SERVICOS_SUBS (ser_nome, ser_descricao, ser_valor, ser_pai, ser_data, ser_comissao_type, ser_comissao, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
                        [objSub.ser_nome, objSub.ser_descricao, objSub.ser_valor, objSub.ser_pai, objSub.ser_data || null, objSub.ser_comissao_type || null, objSub.ser_comissao || null, empresa_id]);
                }
            }

            const excluidos = subsAtuais.filter(s => !atualizados.includes(s.ser_id)).map(s => s.ser_id);

            if (excluidos.length > 0) {
                await dbQuery(`DELETE FROM SERVICOS_SUBS WHERE ser_id IN (${excluidos.join(',')}) AND empresa_id = ?`, [empresa_id]);
            }
        }

        res.status(201).json({ message: 'Serviço salvo com sucesso' });
    } catch (error) {
        console.error('Erro ao criar serviço', error);
        res.status(500).json({ error: error.message });
    }
})

router.get('/delete/:id', async (req, res) => {
    const { id } = req.params;
    const empresa_id = req.user.empresa_id;

    try {
        await dbQuery('DELETE FROM SERVICOS_NEW WHERE ser_id = ? AND empresa_id = ?', [id, empresa_id]);
        await dbQuery('DELETE FROM SERVICOS_SUBS WHERE ser_pai = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Serviço deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar serviço', error);
        res.status(500).json({ error: error.message });
    }
})

router.post('/removeOldServico', async (req, res) => {
    const { ser_id, age_id } = req.body;
    const empresa_id = req.user.empresa_id;

    if (!ser_id || !age_id) {
        return res.status(400).json({ message: 'O ID do serviço e do agendamento são obrigatórios' });
    }

    try {
        await dbQuery('DELETE FROM AGENDAMENTO_X_SERVICOS WHERE ser_id = ? AND age_id = ? AND empresa_id = ?', [ser_id, age_id, empresa_id]);
        await dbQuery('DELETE FROM SERVICOS WHERE ser_id = ? AND empresa_id = ?', [ser_id, empresa_id]);

        res.status(200).json({ message: 'Serviço removido com sucesso' });
    } catch (error) {
        console.error('Erro ao remover serviço', error);
        res.status(500).json({ error: error.message });
    }
})

router.post('/mover-subservico', async (req, res) => {
    const { ser_pai, sub_id } = req.body;
    const empresa_id = req.user.empresa_id;

    if (!ser_pai || !sub_id) {
        return res.status(400).json({ message: 'Dados inválidos' });
    }

    try {
        await dbQuery('UPDATE SERVICOS_SUBS SET ser_pai = ? WHERE ser_id = ? AND empresa_id = ?', [ser_pai, sub_id, empresa_id]);

        res.status(200).json({ message: 'Subserviço movido com sucesso' });
    } catch (error) {
        console.error('Erro ao mover subserviço', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;