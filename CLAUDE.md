#Sobre o projeto:

O projeto é um sistema de agendamento de serviços, com um CRM de atendimento integrado. Temos cadastros de clientes, serviços, profissionais, agendamentos, pagamentos, entre outros.

Temos sistema de comissionamento de serviços, onde o profissional pode receber comissão por cada serviço realizado. Nos serviços também temos subserviços, onde o serviço pode ser composto por subserviços, cada subserviço pode ter um valor diferente e um percentual de comissão diferente. Além de outras configurações.

Na parte do CRM, temos funis de venda, negócios, dados de cliente, um sistema de disparo de mensagens e emails e também
fluxos de atendimento integrados ao Gemini para automação de atendimento.

O projeto é composto por 2 partes:

1. Backend
2. Frontend

O backend é desenvolvido em Node.js com Express.js. Usando banco de dados MySQL.

No backend, usamos require (CommonJS) para importar os módulos. Prefira sempre essa estrutura ao invés de import (ESM). Funções devem ser bem comentadas e documentadas. Evite criações de .md e arquivos extras. Sempre focando em manter o código limpo e organizado e o máximo de modularização possível para reuso. Foque também em desempenho,
pois o sistema terá grande volume de requisições e deve ser o mais performático possível.

No frontend, usamos o tema base Vuexy, com componentes Vuetify e ícones Tabler. Sempre utilize essa estrutura para manter a consistência visual e de funcionalidades. No tema tem componentes nativos que substituem componentes do Vuetify. Exemplo:

<IconBtn> substitui <VBtn icon="tabler-plus" />.
<AppDrawerHeaderSection> substitui <VCardTitle>.

Modelo padrão de Dialogs:
<VDialog ... >
<VCard ... >
<VCardText ... >
<AppDrawerHeaderSection ... >
</VCardText>
</VCard>
</VDialog>

Nos dialogs, evite <VCardActions>, use sempre uma div convencional com <VBtn> para os botões. Exemplo: <div class="d-flex flex-row align-center justify-end"> <VBtn>Confirmar</VBtn> <VBtn>Cancelar</VBtn> </div>

#Banco de dados

O sistema utiliza o banco de dados MySQL.

Acesse o banco de dados com o acesso:
```
mysql -u root -p
```

DB_CONNECTION='mysql'
DB_HOST='191.101.78.114'
DB_PORT='3306'
DB_NAME='DEVdboregonsys'
DB_USER='dboregonsys_user'
DB_PASS='DB@OregonSys93219'

Sempre utilize o terminal para acessar o banco de dados.

SEMPRE QUE CRIAR COLUNAS/TABELAS, CRIE NULLABLE PARA NÃO CAUSAR ERROS DE COMPATIBILIDADE COM VERSÕES ANTERIORES.

#API
O projeto inteiro utiliza a API do backend Node.

A URL da API é: https://app.oregonservicos.com.br:3005. Sempre utilize essa URL para acessar a API do backend Node. Para autenticação:

Faça login:

https://app.oregonservicos.com.br:3005/conta/login
Method: POST
Body:
{
    email: a23comunicacoes@gmail.com
    password: teste
    rememberMe: false
}

O token deve ser armazenado no cookie 'accessToken' e os dados do usuário no cookie 'userData'.

Irá retornar um token de acesso. Utilize esse token para autenticar as requisições, no
header da requisição, adicione o seguinte header:
Authorization: Bearer <token de acesso>

##PM2
O projeto utiliza o PM2 para gerenciamento de processos. E está rodando na instância ID 4 com nome "oregon-node-dev".

Para ver os logs do PM2, use o comando:
pm2 logs oregon-node-dev

Para ver os processos rodando, use o comando:
pm2 list

Para ver o status do processo, use o comando:
pm2 status oregon-node-dev

O processo tem watch, após cada alteração no código, o PM2 reinicia o processo automaticamente.

#Teste de Fluxos via API

O sistema possui uma rota de teste de fluxos SEM AUTENTICAÇÃO para facilitar testes e debug.
Use sempre o telefone de teste: **+55 41 8719-8546** (formato API: `5541871978546`)

##Endpoints disponíveis:

###1. Simular mensagem de entrada (inicia ou continua fluxo):
```bash
curl -X POST https://app.oregonservicos.com.br/apidev/flow-test/simulate-message \
  -H "Content-Type: application/json" \
  -d '{"phone":"5541871978546","text":"Olá, quero agendar um horário"}'
```

###2. Responder a um fluxo em execução:
```bash
curl -X POST https://app.oregonservicos.com.br/apidev/flow-test/respond \
  -H "Content-Type: application/json" \
  -d '{"phone":"5541871978546","text":"1"}'
```

###3. Verificar status do fluxo:
```bash
curl -X GET https://app.oregonservicos.com.br/apidev/flow-test/status/5541871978546
```

###4. Listar fluxos disponíveis:
```bash
curl -X GET https://app.oregonservicos.com.br/apidev/flow-test/flows
```

###5. Iniciar um fluxo específico manualmente:
```bash
curl -X POST https://app.oregonservicos.com.br/apidev/flow-test/start-flow \
  -H "Content-Type: application/json" \
  -d '{"flowId":1,"phone":"5541871978546"}'
```

###6. Cancelar fluxo ativo:
```bash
curl -X POST https://app.oregonservicos.com.br/apidev/flow-test/cancel \
  -H "Content-Type: application/json" \
  -d '{"phone":"5541871978546"}'
```

###7. Resetar sessão de teste (limpa tudo):
```bash
curl -X POST https://app.oregonservicos.com.br/apidev/flow-test/reset \
  -H "Content-Type: application/json" \
  -d '{"phone":"5541871978546"}'
```

###8. Ver detalhes de uma execução:
```bash
curl -X GET https://app.oregonservicos.com.br/apidev/flow-test/run/123
```

##Interface visual de teste:
Acesse: https://app.oregonservicos.com.br/apidev/flow-test.html

##Observações importantes:
- As mensagens NÃO são enviadas ao WhatsApp real (modo simulação)
- Os fluxos são processados com lógica REAL
- O contexto é preservado entre requisições
- Ideal para debug e testes automatizados por LLMs
- Documentação completa dos fluxos: /var/www/public-oregon/FLOWS_DOCUMENTATION.md
- A tabela AGENDAMENTO_X_SERVICOS é legacy, não use ela para nada, a tabela correta de relação é AXS.
- A tabela SERVICOS é legacy, não use ela para nada, a tabela correta de serviços é SERVICOS_NEW e SERVICOS_SUBS.

#Asaas
Para documentação do Asaas, use o MCP do Asaas. Com o access_token: $aact_YTU5YTE0M2M2N2I4MTliNzk0YTI5N2U5MzdjNWZmNDQ6OjAwMDAwMDAwMDAwMDAwNzc5NTY6OiRhYWNoX2U5NmVkNTE3LTgxOGYtNGU0Ny05MmY2LTBlOTliZWRlZjFlNQ==