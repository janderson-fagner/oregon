const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const e = require('express');
const util = require('util');
const transporter = require('../transporter');
const fs = require('fs');
const handlebars = require('handlebars');
const path = require('path');
const jose = require('jose-node-cjs-runtime');

const { secretKey } = require("../utils/functions");

console.log('Secret Key Loaded:', secretKey);

const createToken = async (payload, expiresIn = '8h') => {
  return await new jose.EncryptJWT(payload)
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .encrypt(secretKey);
};

const dbQuery = require('../utils/dbHelper');
const { getBrandFromHost } = require('../utils/brandHelper');

router.post('/login', async (req, res) => {
  const { email, password, rememberMe } = req.body;

  if (!email || !password) {
    return res.status(400).send('Email e senha são obrigatórios');
  }

  let expiresIn = rememberMe ? '30d' : '8h';

  try {
    // Consulta ao banco de dados para User
    let results = await dbQuery('SELECT * FROM User WHERE email = ?', [email.trim()]);

    if (results.length === 0) {
      console.log('Usuário não encontrado:', email);
      return res.status(404).send('Usuário não encontrado');
    } else if (!(await bcrypt.compare(password, results[0].password))) {
      console.log('Senha incorreta:', email);
      return res.status(401).send('Senha incorreta');
    } else {

      if (results[0].password === null || results[0].password === '') {
        console.log('Senha ainda não foi gerada:', email);
        return res.status(402).send('Senha ainda não foi gerada.');
      } else if (results[0].ativo === '0' || results[0].ativo === 0 || results[0].ativo === false) {
        console.log('Usuário desativado:', email);
        return res.status(403).send('Usuário desativado.');
      }

    }

    // Verificação de empresa e assinatura (bypass para empresa_id = 1)
    let empresaPendente = false;
    if (results[0].empresa_id && results[0].empresa_id !== 1) {
      const empresa = await dbQuery(
        'SELECT id, status, deleted_at FROM Empresas WHERE id = ? AND deleted_at IS NULL',
        [results[0].empresa_id]
      );
      if (!empresa.length) {
        return res.status(407).send('Empresa não encontrada ou foi removida.');
      }

      // Empresa pendente: permite login restrito para Gestor gerenciar assinatura
      if (empresa[0].status === 'pendente' && results[0].role === 'Gestor') {
        empresaPendente = true;
      } else if (empresa[0].status !== 'ativa') {
        return res.status(406).send('A empresa está inativa ou suspensa.');
      }

      if (!empresaPendente) {
        const assinatura = await dbQuery(
          "SELECT id, status FROM Assinaturas WHERE empresa_id = ? AND status IN ('ativa','trial') ORDER BY created_at DESC LIMIT 1",
          [results[0].empresa_id]
        );
        if (!assinatura.length) {
          return res.status(405).send('Nenhuma assinatura ativa encontrada para esta empresa.');
        }
      }
    }
    // Adicionar flag de empresa pendente ao resultado do user
    results[0].empresaPendente = empresaPendente;

    // Geração do token JWT
    const token = await createToken({ id: results[0].id }, expiresIn);

    const role = results[0].role;
    const roles = await dbQuery('SELECT role_ability FROM Roles WHERE role_name = ?', [role]);
    let userAbilityRules = roles[0].role_ability;

    //Dados do usuário sem a senha
    const user = {
      ...results[0]
    };
    delete user.password;

    const response = {
      userAbilityRules: userAbilityRules,
      accessToken: token,
      userData: user
    }

    res.status(200).send({ response });

  } catch (error) {
    console.error(error);
    res.status(500).send('Erro no servidor');
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, fullName } = req.body;

    if (!email || !password || !fullName) {
      return res.status(400).send('Email, senha e nome completo são obrigatórios');
    }

    // Verifica se o e-mail já está cadastrado
    const results = await dbQuery('SELECT * FROM User WHERE email = ?', [email.trim()]);

    if (results.length > 0) {
      return res.status(409).send('E-mail já cadastrado');
    }

    // Criptografia da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Inserir novo usuário
    const query = 'INSERT INTO User (email, password, fullName, role) VALUES (?, ?, ?, "admin")';
    let newUser = await dbQuery(query, [email.trim(), hashedPassword, fullName.trim()]);

    //Recuperar o usuário recém-criado
    newUser = await dbQuery('SELECT * FROM User WHERE id = ?', [newUser.insertId]);

    // Geração do token JWT
    const token = await createToken({ id: newUser[0].id }, '8h');

    const role = newUser[0].role;
    const roles = await dbQuery('SELECT role_ability FROM Roles WHERE role_name = ?', [role]);
    let userAbilityRules = roles[0].role_ability;

    //Dados do usuário sem a senha
    const user = newUser[0]

    delete user.password;

    const response = {
      userAbilityRules: userAbilityRules,
      accessToken: token,
      userData: user
    }

    res.status(201).send({ response });
  } catch (error) {
    console.error('Erro ao registrar usuário:', error);
    res.status(500).send(error);
  }

});

router.post('/auth-cookie', async (req, res) => {

  const { id, token, roleInit } = req.body;

  if (!id, !token) {
    return res.status(400).send('Id e token são obrigatórios');
  }

  let tokenvalid = true;

  // Decodifica o token e verifica a assinatura
  let decoded;
  try {
    const { payload, protectedHeader } = await jose.jwtDecrypt(token, secretKey);

    decoded = payload;
  } catch (error) {
    console.error('Erro ao decodificar o token:', error);
    tokenvalid = false;
    return res.status(401).send('Token inválido');
  }

  // Verifica se o token expirou
  const exp = decoded.exp;
  if (!exp || exp === '') {
    exp = '16h';
  }

  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) {
    tokenvalid = false;
    return res.status(401).send('Token expirado');
  }

  // Consulta ao banco de dados
  try {
    // Consulta ao banco de dados para User
    let results = await dbQuery('SELECT * FROM User WHERE id = ?', [id])

    if (results.length === 0) {
      return res.status(404).send('Usuário não encontrado');
    }

    if (results[0].password === null || results[0].password === '') {
      return res.status(402).send('Senha ainda não foi gerada.');
    } else if (results[0].ativo === '0' || results[0].ativo === 0 || results[0].ativo === false) {
      return res.status(403).send('Usuário desativado.');
    }

    // Verificação de empresa e assinatura (bypass para empresa_id = 1)
    let empresaPendente = false;
    if (results[0].empresa_id && results[0].empresa_id !== 1) {
      const empresa = await dbQuery(
        'SELECT id, status, deleted_at FROM Empresas WHERE id = ? AND deleted_at IS NULL',
        [results[0].empresa_id]
      );
      if (!empresa.length) {
        return res.status(407).send('Empresa não encontrada ou foi removida.');
      }

      // Empresa pendente: permite login restrito para Gestor gerenciar assinatura
      if (empresa[0].status === 'pendente' && results[0].role === 'Gestor') {
        empresaPendente = true;
      } else if (empresa[0].status !== 'ativa') {
        return res.status(406).send('A empresa está inativa ou suspensa.');
      }

      if (!empresaPendente) {
        const assinatura = await dbQuery(
          "SELECT id, status FROM Assinaturas WHERE empresa_id = ? AND status IN ('ativa','trial') ORDER BY created_at DESC LIMIT 1",
          [results[0].empresa_id]
        );
        if (!assinatura.length) {
          return res.status(405).send('Nenhuma assinatura ativa encontrada para esta empresa.');
        }
      }
    }
    // Adicionar flag de empresa pendente ao resultado do user
    results[0].empresaPendente = empresaPendente;

    // Geração do token JWT
    const token = await createToken({ id: results[0].id }, exp);

    const role = results[0].role;
    const roles = await dbQuery('SELECT role_ability FROM Roles WHERE role_name = ?', [role]);
    if (roles.length === 0) {
      console.error('Role não encontrada: ' + role + ' - Results: ' + JSON.stringify(results[0]));
      return res.status(404).send('Role não encontrada');
    }
    let userAbilityRules = roles[0].role_ability;


    //Dados do usuário sem a senha
    const user = {
      ...results[0]
    };

    delete user.password;

    const now = Math.floor(Date.now() / 1000); // Tempo atual em segundos (para comparação com `exp`)
    const maxAge = decoded.exp - now;

    const response = {
      userAbilityRules: userAbilityRules,
      accessToken: token,
      userData: user,
      maxAge: maxAge
    }

    res.status(200).send({ response });

  } catch (error) {
    console.error(error);
    res.status(500).send('Erro no servidor');
  }
});

router.post('/muda-senha', (req, res) => {

  const { id, password, newpassword, token } = req.body;

  if (!id || !password || !token) {
    return res.status(400).send('Id, senha e token são obrigatórios');
  }

  // Decodifica o token e verifica a assinatura
  const decoded = jwt.verify(token, process.env.KEY_SECRET_TOKEN);

  if (!decoded) {
    return res.status(401).send('Token inválido');
  }

  // Verifica se o token expirou
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) {
    return res.status(401).send('Token expirado');
  }

  // Consultar senha atual
  const query = 'SELECT * FROM User WHERE id = ?';
  db.query(query, [id], async (error, results) => {
    if (error) {
      return res.status(500).send('Erro no servidor');
    }

    // Verificar se a senha atual está correta
    if (!(await bcrypt.compare(password, results[0].password))) {
      return res.status(409).send('Senha atual incorreta');
    }

    // Criptografia da senha
    const hashedPassword = await bcrypt.hash(newpassword, 10);

    // Atualizar senha
    const query = 'UPDATE User SET password = ? WHERE id = ?';
    db.query(query, [hashedPassword, id], (error, results) => {
      if (error) {
        return res.status(500).send('Erro no servidor');
      }

      //Confirmação de sucesso
      res.status(200).send('Senha alterada com sucesso');
    });
  });

});

router.post('/resetar-senha', async (req, res) => {

  const { email } = req.body; // Supondo que o e-mail do usuário venha no corpo da requisição

  if (!email) {
    return res.status(400).send('E-mail é obrigatório');
  }

  // Consultar o banco de dados para verificar se o e-mail existe
  try {
    let results = await dbQuery('SELECT * FROM User WHERE email = ?', [email]);

    if (results.length === 0) {
      results = await dbQuery('SELECT * FROM Empresas WHERE email = ?', [email]);

      if (results.length === 0) {
        return res.status(404).send('E-mail não encontrado');
      }
    }

    // Gerar token para redefinição de senha
    const token = jwt.sign({ id: results[0].id, email: email }, process.env.KEY_SECRET_TOKEN, { expiresIn: '24h' });

    const brand = getBrandFromHost(req.hostname);
    const link_redefinicao = brand.appUrl + `/redefinirSenha?token=${token}`;

    // Caminho para o seu template HTML
    const templatePath = path.join(__dirname, '../email-templates', 'resetar-senha.html');
    const source = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(source);
    const dataehoraagora = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const replacements = {
      titulo: 'Redefinição de Senha',
      descricao_curta: `Altere sua senha no sistema ${brand.appName}`,
      nome: results[0].fullName,
      mensagem: `Recebemos uma solicitação para redefinir a senha da sua conta no sistema ${brand.appName}, em ${dataehoraagora}. Não foi você? Não se preocupe, pode ignorar este e-mail.`,
      tipo: 'Redefinir',
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
      subject: `${brand.appName} - Alteração de Senha`,
      html: htmlToSend
    };

    try {
      await transporter.sendMail(mailOptions);
      res.status(200).send('E-mail enviado com sucesso');
    } catch (error) {
      console.error('Erro ao enviar e-mail:', error);
      res.status(500).send('Erro ao enviar e-mail');
    }
  } catch (error) {
    console.error('Erro ao consultar e-mail:', error);
    res.status(500).send('Erro ao consultar e-mail');
  }

});

router.post('/validar-token', async (req, res) => {

  const { token } = req.body;

  if (!token) {
    return res.status(400).send('Token é obrigatório');
  }

  try {
    // Decodifica o token e verifica a assinatura
    const decoded = jwt.verify(token, process.env.KEY_SECRET_TOKEN);

    if (!decoded) {
      return res.status(404).send('Token inválido');
    }

    // Verifica se o token expirou
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) {
      return res.status(401).send('Token expirado');
    }

    res.status(200).send('Token válido');

  } catch (error) {
    console.error('Erro ao validar token:', error);
    return res.status(500).send('Erro ao validar token');
  }
});

router.post('/nova-senha', async (req, res) => {

  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).send('Token e senha são obrigatórios');
  }

  try {
    // Decodifica o token e verifica a assinatura
    const decoded = jwt.verify(token, process.env.KEY_SECRET_TOKEN);

    if (!decoded) {
      return res.status(404).send('Token inválido');
    }

    // Verifica se o token expirou
    const now = Math.floor(Date.now() / 1000);
    if (decoded.exp < now) {
      return res.status(401).send('Token expirado');
    }

    // Consultar o banco de dados para verificar se o e-mail existe
    let isUser = true;
    let results = await dbQuery('SELECT * FROM User WHERE email = ?', [decoded.email]);

    if (results.length === 0) {
      isUser = false;
      results = await dbQuery('SELECT * FROM Empresas WHERE email = ?', [decoded.email]);

      if (results.length === 0) {
        return res.status(404).send('E-mail não encontrado');
      }
    }

    // Criptografia da senha
    const hashedPassword = await bcrypt.hash(password, 10);

    // Atualizar senha
    let query = '';
    if (isUser) {
      query = 'UPDATE User SET password = ? WHERE email = ?';
    } else {
      query = 'UPDATE Empresas SET password = ? WHERE email = ?';
    }

    await dbQuery(query, [hashedPassword, decoded.email]);

    res.status(200).send('Senha alterada com sucesso');

  } catch (error) {
    console.error('Erro ao redefinir senha:', error);
    return res.status(500).send('Erro ao redefinir senha');
  }

});

module.exports = router;