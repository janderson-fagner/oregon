const express = require('express');
const router = express.Router();
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const transporter = require('../transporter');
const fs = require('fs');
const handlebars = require('handlebars');
const moment = require('moment-timezone');

const paginateArray = (array, perPage, page) => array.slice((page - 1) * perPage, page * perPage)
const dbQuery = require('../utils/dbHelper');
const { empresaWhere } = require('../utils/dbHelper');
const { checkEmployeeLimit } = require('../utils/featureMiddleware');
const { getBrandFromHost } = require('../utils/brandHelper');
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

// Endpoint leve para autocomplete/seletores - retorna apenas dados essenciais dos usuários ativos
router.get('/list-simple', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const users = await dbQuery(
            'SELECT id, fullName, email, role, avatar FROM User WHERE ativo = 1 AND empresa_id = ? ORDER BY fullName ASC',
            [empresa_id]
        );
        res.status(200).json(users);
    } catch (error) {
        console.error('Erro ao recuperar usuários (list-simple):', error);
        res.status(500).send('Erro no servidor.');
    }
});

router.get('/list', async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        const {
            q = '',
            role,
            sortBy = '',
            itemsPerPage = 10,
            page = 1,
            orderBy = 'asc',
            status = null
        } = req.query;

        // SQL
        let baseQuery = 'FROM User WHERE 1 = 1 AND empresa_id = ?';
        let queryParams = [empresa_id];
        let r;

        // Adicione filtros condicionais
        if (q) {
            baseQuery += ` AND (fullName LIKE '%${q}%' OR email LIKE '%${q}%')`;
        }

        if (role) {
            baseQuery += ` AND role = '${role}'`;
        }

        if (status) {
            baseQuery += ` AND ativo = ${status}`;
        }

        let query = `SELECT *, (SELECT COUNT(*) ${baseQuery}) as totalUsers ${baseQuery}`;

        // Adicione ordenação
        if (sortBy) {
            if (sortBy == 'user') {
                r = 'fullName';
            } else {
                r = sortBy;
            }
            query += ` ORDER BY ${r} ${orderBy.toUpperCase()}`;
        } else {
            query += ' ORDER BY fullName ASC'; // Ordenação padrão
        }

        // Adicione paginação
        if (itemsPerPage !== '-1' && itemsPerPage !== -1)
            query += ` LIMIT ${parseInt(itemsPerPage)} OFFSET ${(page - 1) * parseInt(itemsPerPage)}`;

        // Duplicar empresa_id param para subquery COUNT and main query
        const users = await dbQuery(query, [...queryParams, ...queryParams]);

        res.status(200).json({
            users: users,
            totalUsers: users?.[0]?.totalUsers ? users[0].totalUsers : 0
        });
    } catch (error) {
        console.error('Erro ao recuperar usuários:', error);
        res.status(500).send('Erro no servidor. Erro: ' + error);
    }
});

router.post('/add-user', checkEmployeeLimit(), upload.single('avatar'), async (req, res) => {
    const empresa_id = req.user.empresa_id;
    let { fullname, email, password, role, color = null, expIni = null, expFim = null, podeAgendamento = 0, phone = null } = req.body;

    // Verificação de campos obrigatórios
    if (!fullname || !email || !password || !role) {
        return res.status(400).send('Todos os campos são obrigatórios.');
    }

    podeAgendamento = podeAgendamento == '1' || podeAgendamento == 'true' ? 1 : 0;

    fullname = fullname.trim();
    email = email.trim();
    password = password.trim();
    role = role.trim();
    color = color ? color.trim() : null;
    phone = phone ? phone.trim() : null;

    // Bloqueia roles reservadas para outras empresas
    if (empresa_id !== 1 && ['admin', 'gerente'].includes(role.toLowerCase())) {
        return res.status(403).send('A função selecionada é reservada e não pode ser atribuída.');
    }

    // Verifica se a role pertence à empresa
    if (empresa_id !== 1) {
        const roleCheck = await dbQuery('SELECT id FROM Roles WHERE role_name = ? AND empresa_id = ?', [role, empresa_id]);
        if (roleCheck.length === 0) {
            return res.status(403).send('A função selecionada não pertence à sua empresa.');
        }
    }

    try {
        // Verificar se o email já está cadastrado
        let userExists = await dbQuery('SELECT * FROM User WHERE email = ? AND empresa_id = ?', [email, empresa_id]);

        if (userExists.length > 0) {
            // Verifica se o usuário está ativo
            if (userExists[0].ativo === 0) {
                return res.status(409).send('O usuário já possui uma conta, mas está desativada. Restaure a conta para que o acesso dele retorne.');
            }
        }

        // Criptografia da senha
        const hashedPassword = await bcrypt.hash(password, 10);

        // Inicializar consulta SQL
        let query = 'INSERT INTO User (fullname, email, password, role, podeAgendamento, phone, empresa_id';
        let placeholders = '?, ?, ?, ?, ?, ?, ?'; // Para os valores que serão substituídos
        let queryParams = [fullname, email, hashedPassword, role, podeAgendamento, phone, empresa_id]; // Os valores reais

        console.log(query, placeholders, queryParams);

        // Incluir avatar na consulta se um arquivo foi carregado
        if (req.file) {
            query += ', avatar';
            placeholders += ', ?';
            const relativePath = `/uploads/fotos-perfil/${req.file.filename}`;
            queryParams.push(relativePath);
        }

        if (color) {
            query += ', color';
            placeholders += ', ?';
            queryParams.push(color);
        }

        if (expIni && expIni !== 'null') {
            query += ', expIni';
            placeholders += ', ?';
            queryParams.push(expIni);
        }

        if (expFim && expFim !== 'null') {
            query += ', expFim';
            placeholders += ', ?';
            queryParams.push(expFim);
        }

        // Checar as datas de expiração e definir ativo como 0 se necessário
        let ativo = 1;
        if (expIni && expIni !== 'null' && expFim && expFim !== 'null') {
            let dataAgora = new Date();
            if (new Date(expIni) > dataAgora || new Date(expFim) < dataAgora) {
                ativo = 0;
            }
        }

        query += ', ativo';
        placeholders += ', ?';
        queryParams.push(ativo);

        // Finalizar construção da consulta SQL
        query += `) VALUES (${placeholders})`;

        let ins = await dbQuery(query, queryParams);

        const user = { id: ins.insertId, email, role };

        // Enviar resposta
        res.status(200).send({ userData: user });

    } catch (error) {
        console.error('Erro no servidor:', error);
        res.status(500).send(error);
    }
});

router.post('/add-user-generate', checkEmployeeLimit(), upload.single('avatar'), async (req, res) => {
    const empresa_id = req.user.empresa_id;
    let { fullname, email, role, color = null, expIni = null, expFim = null, podeAgendamento = false, phone = null } = req.body;

    // Verificação de campos obrigatórios
    if (!fullname || !email || !role) {
        console.error('Todos os campos são obrigatórios:', fullname, email, role);
        return res.status(400).send('Todos os campos são obrigatórios.');
    }

    podeAgendamento = podeAgendamento == '1' || podeAgendamento == 'true' ? 1 : 0;

    fullname = fullname.trim();
    email = email.trim();
    role = role.trim();
    color = color ? color.trim() : null;
    phone = phone ? phone.trim() : null;

    // Bloqueia roles reservadas para outras empresas
    if (empresa_id !== 1 && ['admin', 'gerente'].includes(role.toLowerCase())) {
        return res.status(403).send('A função selecionada é reservada e não pode ser atribuída.');
    }

    if (empresa_id !== 1) {
        const roleCheck = await dbQuery('SELECT id FROM Roles WHERE role_name = ? AND empresa_id = ?', [role, empresa_id]);
        if (roleCheck.length === 0) {
            return res.status(403).send('A função selecionada não pertence à sua empresa.');
        }
    }

    try {

        // Verificar se o email já está cadastrado
        let userExists = await dbQuery('SELECT * FROM User WHERE email = ? AND empresa_id = ?', [email, empresa_id]);

        if (userExists.length > 0) {
            //Verifica se o usuário está ativo
            if (userExists[0].ativo === 0) {
                return res.status(409).send('O usuário já possui uma conta, mas está desativada. Entre em contato com o administrador para reativar a conta.');
            }

            return res.status(415).send('O Email informado já possui uma conta.');
        }

        // Inicializar consulta SQL
        let query = 'INSERT INTO User (fullname, email, role, podeAgendamento, phone, empresa_id';
        let placeholders = '?, ?, ?, ?, ?, ?'; // Para os valores que serão substituídos
        let queryParams = [fullname, email, role, podeAgendamento, phone, empresa_id]; // Os valores reais

        // Incluir avatar na consulta se um arquivo foi carregado
        if (req.file) {
            query += ', avatar';
            placeholders += ', ?';
            const relativePath = `/uploads/fotos-perfil/${req.file.filename}`;
            queryParams.push(relativePath);
        }

        if (color) {
            query += ', color';
            placeholders += ', ?';
            queryParams.push(color);
        }

        if (expIni) {
            if (expIni === 'null') {
                query += ', expIni = null';
            } else {
                query += ', expIni';
                placeholders += ', ?';
                queryParams.push(expIni);
            }
        }

        if (expFim) {
            if (expFim === 'null') {
                query += ', expFim = null';
            } else {
                query += ', expFim';
                placeholders += ', ?';
                queryParams.push(expFim);
            }
        }


        // Finalizar construção da consulta SQL
        query += `) VALUES (${placeholders})`;

        // Executar consulta SQL
        const results = await dbQuery(query, queryParams);

        // Geração do token JWT
        const token = jwt.sign({ id: results.insertId }, 'oregon_k_g', { expiresIn: '8h' });

        //Dados do usuário sem a senha
        const user = { id: results.insertId, email, role };

        //Gerar Token Email
        const tokenEmail = jwt.sign({ id: results.insertId, email: email }, 'oregon_k_g', { expiresIn: '1d' });

        const brand = getBrandFromHost(req.hostname);
        const link_redefinicao = `${brand.appUrl}/novaSenha?token=${tokenEmail}`;

        // Caminho para o seu template HTML
        const templatePath = path.join(__dirname, '../email-templates', 'resetar-senha.html');
        const source = fs.readFileSync(templatePath, 'utf-8');
        const template = handlebars.compile(source);
        const replacements = {
            titulo: 'Defina uma nova senha',
            descricao_curta: `Uma conta foi criada para você no sistema ${brand.appName}. Defina agora uma nova senha para acessar o sistema.`,
            nome: fullname,
            mensagem: `Seja bem-vindo ao sistema ${brand.appName}! Uma conta foi criada para você. Defina agora uma nova senha para aproveitar todos os recursos do nosso sistema.`,
            tipo: 'Definir',
            link_redefinicao: link_redefinicao,
            exp: '24 horas',
            email_contato: brand.emailContato,
            termos: brand.appUrl,
            app_name: brand.appName,
            app_url: brand.appUrl,
            app_logo_url: brand.appUrl + brand.logoUrl,
        };
        const htmlToSend = template(replacements);

        // Enviar e-mail com o link para redefinição de senha
        const mailOptions = {
            from: brand.emailFrom,
            to: email,
            subject: `Bem vindo ao ${brand.appName} - defina uma nova senha!`,
            html: htmlToSend
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.log('Erro ao enviar e-mail:', error);
                return res.status(500).send('Erro ao enviar e-mail: ' + error);
            } else {
                console.log('E-mail enviado com sucesso:', info.response);

                // Enviar resposta
                res.status(200).send({ userData: user });
            }
        }, (error, results) => {
            if (error) {
                return res.status(500).send('Erro no servidor: ' + error);
            }
        });


    } catch (error) {
        console.error('Erro no servidor:', error);
        res.status(500).send('Erro no servidor.');
    }
});

router.post('/get-user', async (req, res) => {

    try {
        const empresa_id = req.user.empresa_id;
        const { id } = req.body;

        if (!id) {
            return res.status(400).json({ message: 'O id do usuário é obrigatório' });
        }

        // Consulta ao banco de dados
        const query = 'SELECT * FROM User WHERE id = ? AND empresa_id = ?';
        const results = await dbQuery(query, [id, empresa_id]);

        if (results.length === 0) {
            return res.status(404).json({ message: 'Nenhum usuário encontrado.' });
        }

        res.status(200).json({ results });
    } catch (error) {
        console.error('Erro ao recuperar usuário:', error);
        res.status(500).send('Erro no servidor. Erro: ' + error);
    }
});

router.get('/get-user-id', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.query;

    if (!id) {
        return res.status(400).send('O id do usuário é obrigatório');
    }

    try {
        // Consulta ao banco de dados
        const query = 'SELECT * FROM User WHERE id = ? AND empresa_id = ?';
        const resultsUser = await dbQuery(query, [id, empresa_id]);

        if (resultsUser.length === 0) {
            return res.status(404).send('Nenhum usuário encontrado.');
        }

        const user = resultsUser[0];

        res.status(200).send({ user });
    } catch (error) {
        console.error('Erro ao recuperar usuário:', error);
        res.status(500).send('Erro no servidor. Erro: ' + error);
    }
});

router.post('/update-user', upload.single('avatar'), async (req, res) => {
    try {
        const empresa_id = req.user.empresa_id;
        console.log("Update user data", req.body);

        let { id, fullname, email, role, password, color, expIni = null, expFim = null, podeAgendamento = false, phone = null } = req.body;

        if (!id || !fullname || !email || !role) {
            return res.status(400).send('Todos os campos são obrigatórios');
        }

        fullname = fullname.trim();
        email = email.trim();
        role = role.trim();
        color = color ? color.trim() : null;
        phone = phone ? phone.trim() : null;
        password = password ? password.trim() : null;
        podeAgendamento = podeAgendamento == '1' || podeAgendamento == 'true' ? 1 : 0;

        // Bloqueia roles reservadas para outras empresas
        if (empresa_id !== 1 && ['admin', 'gerente'].includes(role.toLowerCase())) {
            return res.status(403).send('A função selecionada é reservada e não pode ser atribuída.');
        }

        if (empresa_id !== 1) {
            const roleCheck = await dbQuery('SELECT id FROM Roles WHERE role_name = ? AND empresa_id = ?', [role, empresa_id]);
            if (roleCheck.length === 0) {
                return res.status(403).send('A função selecionada não pertence à sua empresa.');
            }
        }

        let query = 'UPDATE User SET fullname = ?, email = ?, role = ?, podeAgendamento = ?, phone = ?';
        const queryParams = [fullname, email, role, podeAgendamento, phone];


        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query += ', password = ?';
            queryParams.push(hashedPassword);
        }

        if (req.file) {
            const relativePath = `/uploads/fotos-perfil/${req.file.filename}`;
            query += ', avatar = ?';
            queryParams.push(relativePath);

        }

        if (color) {
            query += ', color = ?';
            queryParams.push(color);
        }

        if (expIni) {
            if (expIni === 'null') {
                query += ', expIni = null';
            } else {
                query += ', expIni = ?';
                queryParams.push(expIni);
            }
        }

        if (expFim) {
            if (expFim === 'null') {
                query += ', expFim = null';
            } else {
                query += ', expFim = ?';
                queryParams.push(expFim);
            }
        }

        if (expIni && expIni !== 'null' && expFim && expFim !== 'null') {
            let dataAgora = new Date();

            //Se o prazo de expiração ainda não passou ou se a data atual é anterior a data de início ativo = 0
            if (expIni > dataAgora || expFim < dataAgora) {
                query += ', ativo = 0';
            }
        }

        query += ' WHERE id = ? AND empresa_id = ?';
        queryParams.push(id);
        queryParams.push(empresa_id);

        let results = await dbQuery(query, queryParams);

        const users = await dbQuery('SELECT * FROM User WHERE empresa_id = ?', [empresa_id]);

        for (let user of users) {
            let dataAgora = moment().tz('America/Sao_Paulo');

            if (dataAgora.isAfter(user.expIni) && dataAgora.isBefore(user.expFim) && user.ativo == 0) {
                await dbQuery('UPDATE User SET ativo = 0 WHERE id = ? AND empresa_id = ?', [user.id, empresa_id]);
            } else if (dataAgora.isAfter(user.expFim)) {
                await dbQuery('UPDATE User SET ativo = 0 WHERE id = ? AND empresa_id = ?', [user.id, empresa_id]);
            }
        }

        res.status(200).send({ results });

    } catch (error) {
        console.error('Erro ao atualizar usuário:', error);
        res.status(500).send('Erro no servidor. Erro: ' + error);
    }

});

router.post('/delete-user', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'O id do usuário é obrigatório' });
    }

    // Consulta ao banco de dados
    try {
        const query = 'UPDATE User SET ativo = 0 WHERE id = ? AND empresa_id = ?';
        await dbQuery(query, [id, empresa_id]);

        res.status(200).json({ message: 'Usuário deletado com sucesso.' });
    } catch (error) {
        console.error('Erro ao deletar usuário:', error);
        res.status(500).json({ message: 'Erro no servidor. Erro: ' + error });
    }
});

router.post('/restore-user', async (req, res) => {
    const empresa_id = req.user.empresa_id;
    const { id } = req.body;

    if (!id) {
        return res.status(400).json({ message: 'O id do usuário é obrigatório' });
    }

    // Consulta ao banco de dados
    try {
        const query = 'UPDATE User SET ativo = 1, expIni = null, expFim = null WHERE id = ? AND empresa_id = ?';
        const results = await dbQuery(query, [id, empresa_id]);

        res.status(200).json({ message: 'Usuário restaurado com sucesso.' });
    } catch (error) {
        console.error('Erro ao restaurar usuário:', error);
        res.status(500).json({ message: 'Erro no servidor. Erro: ' + error });
    }
});

module.exports = router;