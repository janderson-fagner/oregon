'use strict';

/**
 * Rota pública da Política de Privacidade — sem autenticação JWT.
 *
 * Renderiza uma página HTML autossuficiente (sem depender do SPA) para que
 * crawlers externos (ex.: verificação do Meta Business / WhatsApp Cloud API)
 * consigam ler o conteúdo diretamente.
 *
 * O branding (Oregon/Daviot) é resolvido dinamicamente pelo hostname,
 * seguindo o mesmo padrão da injeção de branding no index.html.
 *
 * GET /politica-privacidade
 */

const express = require('express');
const { getBrandFromHost } = require('../utils/brandHelper');

const router = express.Router();

/**
 * Monta o HTML completo da política de privacidade já com o branding aplicado.
 * @param {{ appName: string, appUrl: string, emailContato: string }} brand
 * @returns {string} documento HTML
 */
function renderPoliticaPrivacidade(brand) {
  const { appName, appUrl, emailContato } = brand;
  const dataAtualizacao = '27 de maio de 2026';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="robots" content="index, follow" />
  <title>Política de Privacidade — ${appName}</title>
  <meta name="description" content="Política de Privacidade do sistema ${appName}: como coletamos, usamos, compartilhamos e protegemos os dados pessoais, em conformidade com a LGPD." />
  <style>
    :root {
      --primary: #7367f0;
      --text: #2f2b3d;
      --muted: #6e6b7b;
      --bg: #f8f7fa;
      --card: #ffffff;
      --border: #e6e6ef;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: 'Segoe UI', 'Public Sans', Roboto, Helvetica, Arial, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.7;
      font-size: 16px;
    }
    .wrapper { max-width: 860px; margin: 0 auto; padding: 24px 20px 80px; }
    header {
      background: var(--primary);
      color: #fff;
      padding: 40px 20px;
      text-align: center;
    }
    header h1 { margin: 0; font-size: 28px; font-weight: 600; }
    header p { margin: 8px 0 0; opacity: .9; font-size: 15px; }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 32px;
      margin-top: 24px;
      box-shadow: 0 4px 18px rgba(47, 43, 61, .06);
    }
    h2 {
      font-size: 20px;
      margin: 32px 0 12px;
      color: var(--text);
      border-left: 4px solid var(--primary);
      padding-left: 12px;
    }
    h2:first-of-type { margin-top: 0; }
    h3 { font-size: 17px; margin: 20px 0 8px; }
    p, li { color: var(--muted); }
    a { color: var(--primary); }
    ul { padding-left: 22px; }
    li { margin-bottom: 6px; }
    .updated {
      display: inline-block;
      background: rgba(115, 103, 240, .12);
      color: var(--primary);
      font-size: 14px;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 20px;
      margin-bottom: 8px;
    }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    th, td { text-align: left; padding: 10px 12px; border: 1px solid var(--border); font-size: 14px; color: var(--muted); vertical-align: top; }
    th { background: var(--bg); color: var(--text); font-weight: 600; }
    footer { text-align: center; margin-top: 40px; color: var(--muted); font-size: 14px; }
  </style>
</head>
<body>
  <header>
    <h1>Política de Privacidade</h1>
    <p>${appName}</p>
  </header>

  <div class="wrapper">
    <div class="card">
      <span class="updated">Última atualização: ${dataAtualizacao}</span>

      <p>
        Esta Política de Privacidade descreve como o <strong>${appName}</strong>
        (“nós”, “nosso” ou “Plataforma”) coleta, utiliza, armazena, compartilha e
        protege os dados pessoais tratados durante o uso do nosso sistema de agendamento de
        serviços e CRM de atendimento. Este documento foi elaborado em conformidade com a
        <strong>Lei Geral de Proteção de Dados Pessoais (Lei nº 13.709/2018 — LGPD)</strong>.
      </p>
      <p>
        Ao utilizar a Plataforma, você concorda com as práticas descritas nesta Política.
      </p>

      <h2>1. Quem somos</h2>
      <p>
        O ${appName} é uma plataforma de gestão para empresas prestadoras de serviços, oferecendo
        agendamento, cadastro de clientes, gestão de profissionais, controle de pagamentos e um
        CRM de atendimento integrado a canais de comunicação como o WhatsApp. Atuamos como
        <strong>operadores</strong> e/ou <strong>controladores</strong> de dados, conforme o contexto
        de cada tratamento descrito abaixo.
      </p>

      <h2>2. Dados que coletamos</h2>
      <p>Coletamos apenas os dados necessários para o funcionamento da Plataforma:</p>
      <table>
        <thead>
          <tr><th>Categoria</th><th>Exemplos de dados</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>Dados de cadastro de clientes</td>
            <td>Nome, telefone/WhatsApp, e-mail, CPF/CNPJ, endereço e demais dados de contato.</td>
          </tr>
          <tr>
            <td>Dados de agendamentos e serviços</td>
            <td>Serviços contratados, datas e horários, profissional responsável, histórico de atendimentos.</td>
          </tr>
          <tr>
            <td>Dados de pagamento</td>
            <td>Valores, status de pagamento e informações de cobrança (processadas por gateway de pagamento parceiro).</td>
          </tr>
          <tr>
            <td>Comunicações e mensagens</td>
            <td>Conteúdo de mensagens, mídias (imagens, documentos, áudios) e histórico de conversas trocadas via WhatsApp e demais canais.</td>
          </tr>
          <tr>
            <td>Dados de uso e técnicos</td>
            <td>Registros de acesso, endereço IP, data e hora de operações e dados de autenticação dos usuários do sistema.</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Como utilizamos os dados</h2>
      <ul>
        <li>Realizar e gerenciar agendamentos de serviços;</li>
        <li>Cadastrar e manter informações de clientes, profissionais e serviços;</li>
        <li>Processar pagamentos e emitir cobranças;</li>
        <li>Prestar atendimento ao cliente e responder solicitações, inclusive por meio de automação com inteligência artificial;</li>
        <li>Enviar mensagens transacionais, lembretes de agendamento e comunicações relacionadas ao serviço;</li>
        <li>Garantir a segurança, prevenir fraudes e cumprir obrigações legais e regulatórias.</li>
      </ul>

      <h2>4. Integração com o WhatsApp (Meta Platforms)</h2>
      <p>
        A Plataforma utiliza a <strong>WhatsApp Business Cloud API</strong>, fornecida pela
        Meta Platforms, Inc., para enviar e receber mensagens dos clientes. Nesse contexto:
      </p>
      <ul>
        <li>As mensagens, números de telefone e mídias enviadas/recebidas são processadas para viabilizar a comunicação de atendimento;</li>
        <li>O uso do WhatsApp também está sujeito à <a href="https://www.whatsapp.com/legal/privacy-policy" target="_blank" rel="noopener">Política de Privacidade do WhatsApp</a> e às políticas da Meta;</li>
        <li>Utilizamos esses dados exclusivamente para a finalidade de atendimento e comunicação com o cliente, não os comercializando.</li>
      </ul>

      <h2>5. Compartilhamento de dados com terceiros</h2>
      <p>
        Não vendemos dados pessoais. Compartilhamos dados apenas com prestadores que viabilizam
        o funcionamento da Plataforma, na medida do necessário:
      </p>
      <ul>
        <li><strong>Meta Platforms / WhatsApp:</strong> envio e recebimento de mensagens via WhatsApp Business Cloud API;</li>
        <li><strong>Provedores de inteligência artificial:</strong> processamento de mensagens para automação de atendimento;</li>
        <li><strong>Gateways de pagamento:</strong> processamento de cobranças e transações financeiras;</li>
        <li><strong>Provedores de infraestrutura e hospedagem:</strong> armazenamento e operação dos servidores;</li>
        <li><strong>Autoridades públicas:</strong> quando exigido por lei, ordem judicial ou regulação aplicável.</li>
      </ul>

      <h2>6. Armazenamento e segurança</h2>
      <p>
        Adotamos medidas técnicas e organizacionais para proteger os dados pessoais contra acesso
        não autorizado, perda, alteração ou divulgação indevida, incluindo controle de acesso,
        autenticação e transmissão criptografada (HTTPS). Os dados são mantidos pelo tempo
        necessário ao cumprimento das finalidades descritas e das obrigações legais aplicáveis.
      </p>

      <h2>7. Seus direitos (LGPD)</h2>
      <p>Como titular de dados, você pode, a qualquer momento, solicitar:</p>
      <ul>
        <li>Confirmação da existência de tratamento e acesso aos seus dados;</li>
        <li>Correção de dados incompletos, inexatos ou desatualizados;</li>
        <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade;</li>
        <li>Portabilidade dos dados;</li>
        <li>Informação sobre o compartilhamento dos seus dados;</li>
        <li>Revogação do consentimento, quando aplicável.</li>
      </ul>
      <p>
        Para exercer esses direitos, entre em contato pelo e-mail
        <a href="mailto:${emailContato}">${emailContato}</a>.
      </p>

      <h2>8. Cookies</h2>
      <p>
        Utilizamos cookies e tecnologias semelhantes estritamente necessárias para autenticação,
        manutenção de sessão e funcionamento da Plataforma. Você pode gerenciar cookies nas
        configurações do seu navegador, ciente de que isso pode afetar funcionalidades do sistema.
      </p>

      <h2>9. Alterações nesta Política</h2>
      <p>
        Esta Política pode ser atualizada periodicamente. A versão vigente estará sempre disponível
        nesta página, com a respectiva data de atualização. Recomendamos a revisão periódica deste
        documento.
      </p>

      <h2>10. Contato</h2>
      <p>
        Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento dos seus dados
        pessoais, entre em contato:
      </p>
      <ul>
        <li><strong>E-mail:</strong> <a href="mailto:${emailContato}">${emailContato}</a></li>
        <li><strong>Site:</strong> <a href="${appUrl}" target="_blank" rel="noopener">${appUrl}</a></li>
      </ul>

      <footer>
        &copy; ${new Date().getFullYear()} ${appName}. Todos os direitos reservados.
      </footer>
    </div>
  </div>
</body>
</html>`;
}

// GET /politica-privacidade — página pública
router.get('/', (req, res) => {
  const brand = getBrandFromHost(req.hostname);
  const html = renderPoliticaPrivacidade(brand);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;
