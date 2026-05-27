const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const fs = require('fs');

const app = express();

process.on('uncaughtException', (error) => {
  if (error.code === 'ECONNRESET') {
    console.error('ECONNRESET capturado, mantendo o servidor em execução.');
  }
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promessa rejeitada não tratada:', promise, 'motivo:', reason);
});

const pathEnv = path.join(__dirname, `.env${process.env.NODE_ENV === 'dev' ? '.dev' : ''}`);
console.log('Carregando variáveis de ambiente do arquivo:', pathEnv);
require('dotenv').config({ path: pathEnv });
require('events').EventEmitter.defaultMaxListeners = 20;

app.use(express.json({
  limit: '5000mb',
  verify: (req, res, buf) => {
    // Salva o raw body para validação HMAC-SHA256 do webhook do Meta
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({ limit: '5000mb', extended: true }));
app.use(express.static(path.join(__dirname, '../../client/dist'), { index: false }));


const server = http.createServer(app);

// Serve arquivos estáticos da pasta 'uploads'
const caminhostatic = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(caminhostatic));

// Serve arquivos estáticos da pasta 'public' (para testes de fluxos)
const publicPath = path.join(__dirname, 'public');
app.use(express.static(publicPath));

//Socket.io
const { setupSocket } = require('./socket');
setupSocket(server);

//WhatsApp - Novo sistema modular
const { initDefaultClient } = require('./zap');
initDefaultClient();

//Cron
const { initCronJobs } = require('./crons');
initCronJobs();

/* const { testFlow } = require('./utils/test_flow_complete');

// Chamar após inicialização
setTimeout(async () => {
    const result = await testFlow();
    
    if (result.success) {
        console.log('✅ Teste passou!', result);
    } else {
        console.error('❌ Teste falhou:', result.error);
    }
}, 3000); */

//Rotas e Cors

app.use(cors({
  origin: ['https://app.oregonhigienizacao.com.br', 'http://app.oregonhigienizacao.com.br:5174', 'https://app.oregonhigienizacao.com.br:5174',
    'http://app.oregonhigienizacao.com.br:5173', 'https://app.oregonhigienizacao.com.br:5173', 'https://app.oregonservicos.com.br',
    'http://app.oregonservicos.com.br:5174', 'https://app.oregonservicos.com.br:5174', 'http://app.oregonservicos.com.br:5173',
    'https://app.oregonservicos.com.br:5173', 'https://dev.oregonservicos.com.br', 'http://dev.oregonservicos.com.br:5174',
    'https://dev.oregonservicos.com.br:5174', 'http://dev.oregonservicos.com.br:5173', 'https://dev.oregonservicos.com.br:5173',
    'https://daviot.com.br', 'https://app.daviot.com.br',
    'http://app.daviot.com.br:5173', 'https://app.daviot.com.br:5173',
    'http://app.daviot.com.br:5174', 'https://app.daviot.com.br:5174'
  ]
}));

const { getUserLoggedUser } = require('./utils/functions');
const { checkFeature, checkEmployeeLimit } = require('./utils/featureMiddleware');

app.use('/conta', require('./routes/auth'));
app.use('/users', getUserLoggedUser, require('./routes/users'));
app.use('/roles', getUserLoggedUser, require('./routes/roles'));
app.use('/download', require('./routes/download'));
app.use('/noti', getUserLoggedUser, require('./routes/notificacoes'));
app.use('/anexo', require('./routes/upload-files'));
app.use('/agenda', getUserLoggedUser, require('./routes/agendamentos'));
app.use('/clientes', getUserLoggedUser, require('./routes/clientes'));
app.use('/servicos', getUserLoggedUser, require('./routes/servicos'));
app.use('/config', getUserLoggedUser, require('./routes/config'));
app.use('/comissoes', getUserLoggedUser, require('./routes/comissao'));
app.use('/estoque', getUserLoggedUser, checkFeature('gerenciamentoEstoque'), require('./routes/estoque'));
app.use('/setores', getUserLoggedUser, checkFeature('gerenciamentoEstoque'), require('./routes/setores'));
app.use('/ordens-entrada', getUserLoggedUser, checkFeature('gerenciamentoEstoque'), require('./routes/ordensEntrada'));
app.use('/ordens-retirada', getUserLoggedUser, checkFeature('gerenciamentoEstoque'), require('./routes/ordensRetirada'));
app.use('/lembretes', getUserLoggedUser, require('./routes/lembretes'));
app.use('/pagamentos', getUserLoggedUser, require('./routes/pagamentos'));
app.use('/relatorios', getUserLoggedUser, require('./routes/relatorios'));
app.use('/crm', getUserLoggedUser, checkFeature('acessoCRM'), require('./routes/crm'));
app.use('/disparos', getUserLoggedUser, checkFeature('acessoCRM'), require('./routes/disparos'));
app.use('/templates', getUserLoggedUser, require('./routes/templates'));
app.use('/zap', getUserLoggedUser, checkFeature('acessoCRM'), require('./routes/zap-route'));
app.use('/whatsapp', getUserLoggedUser, require('./routes/whatsapp-config-route'));
app.use('/atendimento', require('./routes/atendimento'));
app.use('/flows', require('./flows/routes/flowsRoute'));
app.use('/ordem-servico', require('./routes/ordem-servico'));
app.use('/flow-test', require('./routes/flow-test-route')); // Rota de teste de fluxos (sem autenticação)
app.use('/calculadora', getUserLoggedUser, checkFeature('acessoCalculadora'), require('./routes/calculadora'));
app.use('/orcamento-modelos', getUserLoggedUser, require('./routes/orcamento-modelos'));

// Rotas de Contratos
app.use('/contratos', getUserLoggedUser, require('./routes/contratos'));
app.use('/contrato-modelos', getUserLoggedUser, require('./routes/contrato-modelos'));
app.use('/contrato-publico', require('./routes/contratos-publico'));

// Rotas SaaS - Sistema de Assinaturas
app.use('/saas', require('./routes/saas'));
app.use('/webhook', require('./routes/webhook-asaas'));

// Webhook do WhatsApp Cloud API — SEM autenticação JWT (Meta chama diretamente)
// DEVE estar após webhook-asaas (paths distintos: /asaas vs /whatsapp)
app.use('/webhook', require('./routes/webhook-route'));

// Centro de Ajuda
app.use('/help-center', require('./routes/help-center'));

/*-------*/

//Logar hora do servidor
console.log('Hora do servidor:', new Date().toLocaleString());
//Logar fuso horário do servidor
console.log('Fuso horário do servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);


// Injeção dinâmica de branding no index.html
const { isOregonDomain } = require('./utils/brandHelper');
const indexPath = path.join(__dirname, '../../client/dist', 'index.html');
let indexHtmlCache = null;

function getIndexHtml() {
  if (!indexHtmlCache) {
    indexHtmlCache = fs.readFileSync(indexPath, 'utf-8');
  }
  return indexHtmlCache;
}

// Invalida cache quando o arquivo muda (após rebuild)
fs.watchFile(indexPath, () => {
  indexHtmlCache = null;
  console.log('[Branding] Cache do index.html invalidado');
});

app.get('*', (req, res) => {
  let html = getIndexHtml();
  const isOregon = isOregonDomain(req.hostname);

  html = html
    .replace(/__APP_FAVICON__/g, isOregon ? '/favicon.ico' : '/daviot-icon.ico')
    .replace(/__APP_LOGO__/g, isOregon ? '/logo.png' : '/daviot-logo.png')
    .replace(/__APP_TITLE__/g, isOregon ? 'Oregon Sistema' : 'Daviot Sistema')
    .replace(/__APP_BRAND__/g, isOregon ? 'oregon' : 'daviot');

  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

const PORT = process.env.NODE_ENV == 'dev' ? 3005 : 3000;

server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});