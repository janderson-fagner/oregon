/**
 * Gerenciamento de múltiplos clients do WhatsApp Web JS
 * Permite criar, conectar, desconectar e gerenciar vários clients simultaneamente
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const path = require('path');
const { execSync } = require('child_process');
const dbQuery = require('../utils/dbHelper');
const { emitToEmpresa } = require('../socket');

const SESSION_PATH = path.resolve(__dirname, '..', 'session-zap');

// Armazena as instâncias dos clients ativos
const clients = new Map();

// Armazena os status de inicialização
const clientsInitializing = new Map();

/**
 * Obtém uma instância de client pelo ID
 * @param {string} clientId - ID do client
 * @returns {Object|null} Instância do client ou null
 */
function getClientById(clientId) {
    return clients.get(clientId) || null;
}

/**
 * Verifica se um client está conectado
 * @param {string} clientId - ID do client
 * @returns {Promise<boolean>} True se conectado
 */
async function isClientConnected(clientId) {
    try {
        const clientData = await dbQuery('SELECT status FROM Clients WHERE id = ?', [clientId]);
        
        if (clientData.length === 0) {
            return false;
        }
        
        return clientData[0].status === 'connected';
    } catch (error) {
        console.error('Erro ao verificar conexão do client:', error);
        return false;
    }
}

/**
 * Atualiza o status do client no banco de dados
 * @param {string} clientId - ID do client
 * @param {string} status - Novo status
 * @param {Object} additionalData - Dados adicionais para atualizar
 */
async function updateClientStatus(clientId, status, additionalData = {}) {
    try {
        let updateFields = { status, updated_at: new Date() };
        
        if (status === 'connected') {
            updateFields.last_connected_at = new Date();
        }
        
        if (additionalData.phone) {
            updateFields.phone = additionalData.phone;
        }
        
        if (additionalData.qr_code !== undefined) {
            updateFields.qr_code = additionalData.qr_code;
        }
        
        const setClause = Object.keys(updateFields)
            .map(key => `${key} = ?`)
            .join(', ');
        
        const values = [...Object.values(updateFields), clientId];
        
        await dbQuery(`UPDATE Clients SET ${setClause} WHERE id = ?`, values);
        
        console.log(`✅ Status do client ${clientId} atualizado para: ${status}`);
    } catch (error) {
        console.error(`Erro ao atualizar status do client ${clientId}:`, error);
    }
}

/**
 * Mata processos Chrome órfãos que estejam usando o userDataDir de uma sessão
 * Isso acontece quando o PM2 reinicia ou o processo crasha sem limpar o Chrome
 * @param {string} clientId - ID do client
 */
function killOrphanChrome(clientId) {
    const sessionDir = path.join(SESSION_PATH, `session-${clientId}`);
    try {
        // Busca PIDs de processos chrome usando esse userDataDir
        const pids = execSync(
            `ps aux | grep '[c]hrome.*${sessionDir}' | awk '{print $2}'`,
            { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        if (pids) {
            const pidList = pids.split('\n').filter(Boolean);
            console.log(`🔪 Matando ${pidList.length} processo(s) Chrome órfão(s) para ${clientId}: [${pidList.join(', ')}]`);
            execSync(`kill -9 ${pidList.join(' ')}`, { timeout: 5000 });
        }
    } catch (e) {
        // Sem processos encontrados ou erro ao matar - segue normalmente
    }
}

/**
 * Inicializa um client do WhatsApp
 * @param {string} clientId - ID único do client
 * @returns {Promise<Object>} Client inicializado
 */
async function initClient(clientId) {
    // Guard de concorrencia ANTES de qualquer await - evita race onde 2 chamadas
    // simultaneas (auto-init + rota /connect, p.ex.) passam pelo check ao mesmo tempo
    if (clientsInitializing.get(clientId)) {
        console.log(`⚠️ Client ${clientId} já está sendo inicializado (race detectado, ignorando segunda chamada)`);
        return { success: false, message: 'Client já está sendo inicializado' };
    }
    clientsInitializing.set(clientId, true);
    console.log(`🔒 [initClient] Guard ativado para ${clientId}`);

    try {
        // Verifica se já existe e está funcional
        if (clients.has(clientId)) {
            const existingClient = clients.get(clientId);
            try {
                const state = await existingClient.getState();
                if (state === 'CONNECTED') {
                    console.log(`⚠️ Client ${clientId} já está inicializado e conectado`);
                    clientsInitializing.delete(clientId);
                    return { success: false, message: 'Client já está inicializado e conectado' };
                }
                // Client existe mas não está conectado - destruir e reconectar
                console.log(`🔄 Client ${clientId} existe mas estado=${state}, destruindo para reconectar...`);
                try { await existingClient.destroy(); } catch (e) { /* ignora erro ao destruir */ }
                clients.delete(clientId);
            } catch (stateErr) {
                // Não conseguiu obter estado - client travado, destruir e reconectar
                console.log(`🔄 Client ${clientId} não responde (${stateErr.message}), destruindo para reconectar...`);
                try { await existingClient.destroy(); } catch (e) { /* ignora erro ao destruir */ }
                clients.delete(clientId);
            }
        }

        // Mata processos Chrome órfãos antes de inicializar (ex: após crash ou restart do PM2)
        killOrphanChrome(clientId);

        // Verifica se o client existe no banco
        let clientData = await dbQuery('SELECT * FROM Clients WHERE id = ?', [clientId]);
        
        if (clientData.length === 0) {
            //throw new Error(`Client ${clientId} não encontrado no banco de dados`);
            //Criar o client no banco de dados
            await createClient(clientId, 'Nome do Client');
            clientData = await dbQuery('SELECT * FROM Clients WHERE id = ?', [clientId]);
        }

        await updateClientStatus(clientId, 'connecting');

        console.log(`🚀 Iniciando client ${clientId}...`);

        // Cria nova instância do client
        const client = new Client({
            authStrategy: new LocalAuth({
                clientId: clientId,
                dataPath: SESSION_PATH,
            }),
            puppeteer: {
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                executablePath: '/usr/bin/google-chrome-stable',
            }
        });

        // empresa_id do client para isolamento de socket
        const empresaId = clientData[0].empresa_id;

        // Evento: QR Code gerado
        client.on('qr', async (qr) => {
            console.log(`📱 QR Code recebido para client ${clientId}`, qr);
            await updateClientStatus(clientId, 'qr_ready', { qr_code: qr });
            emitToEmpresa(empresaId, `qr-${clientId}`, qr);
        });

        // Evento: Autenticado
        client.on('authenticated', async () => {
            console.log(`✅ Client ${clientId} autenticado`);
            await updateClientStatus(clientId, 'connected', { qr_code: null });
            emitToEmpresa(empresaId, `autentica-zap-${clientId}`, 'Autenticado com sucesso!');
        });

        // Evento: Pronto para uso
        client.once('ready', async () => {
            console.log(`✅ Client ${clientId} está pronto!`);

            // Pega informações do número
            try {
                const info = await client.info;
                if (info && info.wid && info.wid.user) {
                    await updateClientStatus(clientId, 'connected', { phone: info.wid.user });
                }
            } catch (error) {
                console.log('Não foi possível obter informações do número');
            }

            // Popular datas de última mensagem dos clientes (60s após conectar)
            if (clientId.startsWith('atendimento_')) {
                setTimeout(() => {
                    console.log(`🔄 [${clientId}] Iniciando população de última mensagem dos clientes...`);
                    const { popularUltimaMsgClientes } = require('./chats');
                    popularUltimaMsgClientes(clientId, empresaId)
                        .then(resultado => console.log(`✅ [${clientId}] População concluída:`, resultado))
                        .catch(err => console.error(`⚠️ [${clientId}] Erro na população de última mensagem:`, err.message));
                }, 60000);
            }
        });

        // Evento: Falha de autenticação
        client.on('auth_failure', async (msg) => {
            console.error(`❌ Falha de autenticação do client ${clientId}:`, msg);
            await updateClientStatus(clientId, 'disconnected', { qr_code: null });
            emitToEmpresa(empresaId, `autentica-error-zap-${clientId}`, 'Houve um erro na autenticação!');
        });

        // Evento: Desconectado
        client.on('disconnected', async (reason) => {
            console.log(`⚠️ Client ${clientId} desconectado:`, reason);
            await updateClientStatus(clientId, 'disconnected', { qr_code: null });
            clients.delete(clientId);
            emitToEmpresa(empresaId, `desconectado-zap-${clientId}`, 'WhatsApp desconectado!');
        });

        // Inicializa o client
        await client.initialize();

        // Armazena a instância
        clients.set(clientId, client);
        clientsInitializing.delete(clientId);

        console.log(`✅ Client ${clientId} inicializado com sucesso`);

        return { success: true, message: 'Client inicializado com sucesso' };
    } catch (error) {
        console.error(`❌ Erro ao iniciar client ${clientId}:`, error);
        await updateClientStatus(clientId, 'disconnected');
        clientsInitializing.delete(clientId);
        return { success: false, message: error.message };
    }
}

/**
 * Desconecta e remove um client
 * @param {string} clientId - ID do client
 * @returns {Promise<boolean>} True se desconectado com sucesso
 */
async function disconnectClient(clientId) {
    try {
        const client = clients.get(clientId);
        
        if (!client) {
            console.log(`⚠️ Client ${clientId} não está ativo`);
            return false;
        }

        console.log(`🔌 Desconectando client ${clientId}...`);
        
        await client.destroy();
        clients.delete(clientId);
        await updateClientStatus(clientId, 'disconnected', { qr_code: null });

        console.log(`✅ Client ${clientId} desconectado com sucesso`);
        return true;
    } catch (error) {
        console.error(`Erro ao desconectar client ${clientId}:`, error);
        return false;
    }
}

/**
 * Obtém todos os clients cadastrados
 * @param {number|null} empresa_id - ID da empresa para filtrar (opcional)
 * @returns {Promise<Array>} Lista de clients
 */
async function getAllClients(empresa_id = null) {
    try {
        let query = 'SELECT * FROM Clients';
        let params = [];
        if (empresa_id) {
            query += ' WHERE empresa_id = ?';
            params.push(empresa_id);
        }
        query += ' ORDER BY created_at DESC';
        const clientsList = await dbQuery(query, params);
        return clientsList;
    } catch (error) {
        console.error('Erro ao obter lista de clients:', error);
        return [];
    }
}

/**
 * Cria um novo client no banco de dados
 * @param {string} clientId - ID único do client
 * @param {string} name - Nome do client
 * @param {number|null} empresa_id - ID da empresa (opcional)
 * @returns {Promise<Object>} Resultado da criação
 */
async function createClient(clientId, name, empresa_id = null) {
    try {
        // Verifica se já existe
        const existing = await dbQuery('SELECT * FROM Clients WHERE id = ?', [clientId]);

        if (existing.length > 0) {
            return { success: false, message: 'Client já existe' };
        }

        await dbQuery(
            'INSERT INTO Clients (id, name, status, empresa_id) VALUES (?, ?, ?, ?)',
            [clientId, name, 'disconnected', empresa_id]
        );

        console.log(`✅ Client ${clientId} criado no banco de dados`);
        return { success: true, message: 'Client criado com sucesso' };
    } catch (error) {
        console.error('Erro ao criar client:', error);
        return { success: false, message: error.message };
    }
}

/**
 * Remove um client do banco de dados
 * @param {string} clientId - ID do client
 * @returns {Promise<boolean>} True se removido com sucesso
 */
async function deleteClient(clientId) {
    try {
        // Primeiro desconecta se estiver conectado
        await disconnectClient(clientId);
        
        // Remove do banco
        await dbQuery('DELETE FROM Clients WHERE id = ?', [clientId]);
        
        console.log(`✅ Client ${clientId} removido do banco de dados`);
        return true;
    } catch (error) {
        console.error('Erro ao deletar client:', error);
        return false;
    }
}

/**
 * Inicializa automaticamente clients que estavam conectados
 * Executado na inicialização do sistema
 */
async function autoInitClients() {
    try {
        console.log('🔄 Verificando clients para auto-inicialização...');
        
        const connectedClients = await dbQuery(
            'SELECT * FROM Clients WHERE status = ?',
            ['connected']
        );

        for (const clientData of connectedClients) {
            console.log(`🚀 Auto-inicializando client ${clientData.id}...`);
            await initClient(clientData.id);
        }

        console.log(`✅ Auto-inicialização concluída (${connectedClients.length} clients)`);
    } catch (error) {
        console.error('Erro na auto-inicialização:', error);
    }
}

// Exporta as funções
module.exports = {
    getClientById,
    isClientConnected,
    updateClientStatus,
    initClient,
    disconnectClient,
    getAllClients,
    createClient,
    deleteClient,
    autoInitClients
};

