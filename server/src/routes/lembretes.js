const express = require('express');
const router = express.Router();
const path = require('path');
const moment = require('moment');
const multer = require('multer');

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
    const empresa_id = req.user.empresa_id;
    const {
        p = null,
        sortBy = '',
        itemsPerPage = 10,
        page = 1,
        orderBy = 'asc'
    } = req.query;

    const offset = (page - 1) * itemsPerPage;

    let query = `SELECT * FROM Lembretes WHERE empresa_id = ${parseInt(empresa_id)}`;

    if (p) {
        query += ` AND params = '${p}'`;
    }

    if (sortBy) {
        query += ` ORDER BY ${sortBy} ${orderBy}`;
    } else {
        query += ' ORDER BY created_at DESC';
    }

    query += ` LIMIT ${offset}, ${itemsPerPage}`;

    try {
        const lembretes = await dbQuery(query);
        const totalLembrete = await dbQuery('SELECT COUNT(*) as total FROM Lembretes WHERE empresa_id = ?', [empresa_id]);

        if (lembretes.length == 0) {
            return res.status(404).json({ message: 'Nenhum lembrete encontrado' });
        }

        // Parsear campos JSON dos destinatários
        for (let l of lembretes) {
            if (l.destinatarios_usuarios && typeof l.destinatarios_usuarios === 'string') {
                try { l.destinatarios_usuarios = JSON.parse(l.destinatarios_usuarios); } catch (e) { l.destinatarios_usuarios = null; }
            }
            if (l.destinatarios_funcoes && typeof l.destinatarios_funcoes === 'string') {
                try { l.destinatarios_funcoes = JSON.parse(l.destinatarios_funcoes); } catch (e) { l.destinatarios_funcoes = null; }
            }
        }

        return res.status(200).json({
            lembretes,
            totalLembretes: totalLembrete[0].total
        });

    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Erro ao buscar lembretes' });
    }
})

router.get('/get/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        const lembrete = await dbQuery('SELECT * FROM Lembretes WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        if (lembrete.length == 0) {
            return res.status(404).json({ message: 'Lembrete não encontrado' });
        }

        // Parsear campos JSON dos destinatários
        let result = lembrete[0];
        if (result.destinatarios_usuarios && typeof result.destinatarios_usuarios === 'string') {
            try { result.destinatarios_usuarios = JSON.parse(result.destinatarios_usuarios); } catch (e) { result.destinatarios_usuarios = null; }
        }
        if (result.destinatarios_funcoes && typeof result.destinatarios_funcoes === 'string') {
            try { result.destinatarios_funcoes = JSON.parse(result.destinatarios_funcoes); } catch (e) { result.destinatarios_funcoes = null; }
        }

        return res.status(200).json(result);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Erro ao buscar lembrete' });
    }
})

router.get('/configs', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const Options = await dbQuery('SELECT * FROM Options WHERE type IN ("email_notify", "zap_notify") AND empresa_id = ?', [empresa_id]);

        const emailsOption = Options.filter(option => option.type == 'email_notify');
        const zapOption = Options.filter(option => option.type == 'zap_notify');

        return res.status(200).json({ emails: emailsOption, zap: zapOption });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Erro ao buscar emails' });
    }
})

router.post('/configs', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const {
        type, value
    } = req.body;

    if (!type || !value || (type !== 'email_notify' && type !== 'zap_notify')) {
        return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    try {
        let emailInserido = await dbQuery('INSERT INTO Options (type, value, empresa_id) VALUES (?, ?, ?)', [type, value, empresa_id]);

        let opcao = await dbQuery('SELECT * FROM Options WHERE id_option = ? AND empresa_id = ?', [emailInserido.insertId, empresa_id]);

        return res.status(200).json(opcao[0]);
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Erro ao cadastrar opção' });
    }
})

router.delete('/configs', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const {
        value,
        type
    } = req.body;

    if (!value || !type) {
        return res.status(400).json({ message: 'Parâmetros inválidos' });
    }

    try {
        await dbQuery('DELETE FROM Options WHERE type = ? AND value = ? AND empresa_id = ?', [type, value, empresa_id]);

        return res.status(200).json({ message: 'Deletado com sucesso' });
    } catch (error) {
        console.log(error);
        return res.status(500).json({ message: 'Erro ao deletar opção' });
    }
})


router.post('/create', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { lembreteData } = req.body;

    let { title,
        subtitle,
        agendado_time,
        repeat = 0,
        repeat_times = 0,
        repeat_type = 'none',
        notify_email = 0,
        notify_zap = 0,
        params = null,
        destinatarios_usuarios = null,
        destinatarios_funcoes = null
    } = lembreteData;

    if (!title || !agendado_time || !subtitle) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        agendado_time = moment(agendado_time).format('YYYY-MM-DD HH:mm:ss');

        let query = `INSERT INTO Lembretes (title, subtitle, agendado_time, next_run_at, \`repeat\`, repeat_times, repeat_type, notify_email, notify_zap, empresa_id`;
        let values = `VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;

        if (params) {
            query += `, params`;
            values += `, ?`;
        }

        // Campos de destinatários
        if (destinatarios_usuarios && destinatarios_usuarios.length > 0) {
            query += `, destinatarios_usuarios`;
            values += `, ?`;
        }
        if (destinatarios_funcoes && destinatarios_funcoes.length > 0) {
            query += `, destinatarios_funcoes`;
            values += `, ?`;
        }

        query += `) ${values})`;

        const queryParams = [title, subtitle, agendado_time, agendado_time, repeat, repeat_times, repeat_type, notify_email, notify_zap, empresa_id];
        if (params) {
            queryParams.push(params);
        }
        if (destinatarios_usuarios && destinatarios_usuarios.length > 0) {
            queryParams.push(JSON.stringify(destinatarios_usuarios));
        }
        if (destinatarios_funcoes && destinatarios_funcoes.length > 0) {
            queryParams.push(JSON.stringify(destinatarios_funcoes));
        }

        await dbQuery(query, queryParams);

        res.status(201).json({ message: 'Lembrete cadastrado com sucesso' });
    } catch (error) {
        console.error('Erro ao cadastrar lembrete', error);
        res.status(500).json({ error });
    }
});

router.post('/update/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;
    const { lembreteData } = req.body;

    let { title,
        subtitle,
        agendado_time,
        repeat = 0,
        repeat_times = 0,
        repeat_type = 'none',
        notify_email = 0,
        notify_zap = 0,
        params = null,
        destinatarios_usuarios = null,
        destinatarios_funcoes = null
    } = lembreteData;

    if (!title || !agendado_time || !subtitle) {
        return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    }

    try {
        agendado_time = moment(agendado_time).format('YYYY-MM-DD HH:mm:ss');

        let query = `UPDATE Lembretes SET title = ?, subtitle = ?, agendado_time = ?, next_run_at = ?, \`repeat\` = ?, repeat_times = ?, repeat_type = ?, notify_email = ?, notify_zap = ?, destinatarios_usuarios = ?, destinatarios_funcoes = ?, repeat_success = 0, concluido = 0`;
        let values = [
            title, subtitle, agendado_time, agendado_time, repeat, repeat_times, repeat_type, notify_email, notify_zap,
            (destinatarios_usuarios && destinatarios_usuarios.length > 0) ? JSON.stringify(destinatarios_usuarios) : null,
            (destinatarios_funcoes && destinatarios_funcoes.length > 0) ? JSON.stringify(destinatarios_funcoes) : null
        ];

        if (params) {
            query += `, params = ?`;
            values.push(params);
        }

        query += ` WHERE id = ? AND empresa_id = ?`;
        values.push(id);
        values.push(empresa_id);

        await dbQuery(query, values);

        res.status(200).json({ message: 'Lembrete atualizado com sucesso' });
    } catch (error) {
        console.error('Erro ao atualizar lembrete', error);
        res.status(500).json({ error });
    }
});

router.get('/delete/:id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.params;

    try {
        await dbQuery('DELETE FROM Lembretes WHERE id = ? AND empresa_id = ?', [id, empresa_id]);

        res.status(200).json({ message: 'Lembrete deletado com sucesso' });
    } catch (error) {
        console.error('Erro ao deletar lembrete', error);
        res.status(500).json({ error });
    }
});


module.exports = router;