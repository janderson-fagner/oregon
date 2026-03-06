const { Server } = require("socket.io");
const jose = require('jose-node-cjs-runtime');
const dbQuery = require('./utils/dbHelper');

let io;

// Chave secreta para verificação de tokens JWT (mesma usada em functions.js)
const getSecretKey = () => {
    return jose.base64url.decode(process.env.KEY_SECRET_TOKEN || 'crm_oregon_k_g');
};

function setupSocket(server) {
    io = new Server(server, {
        path: '/socket.io',
        cors: {
            origin: "*",
            methods: ["GET", "POST"]
        },
        // Configurações de performance e estabilidade
        pingTimeout: 30000,
        pingInterval: 25000,
        upgradeTimeout: 15000,
        maxHttpBufferSize: 1e6, // 1MB
        transports: ['polling', 'websocket'],
        allowUpgrades: true,
    });

    console.log('[Socket] Socket.io inicializado!');

    // Middleware de autenticação - valida JWT antes de permitir conexão
    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                console.warn('[Socket] Conexão rejeitada: token ausente');
                return next(new Error('Token de autenticação não fornecido'));
            }

            // Decodifica o token JWT (mesmo método usado em getUserLoggedUser)
            const secretKey = getSecretKey();
            const { payload } = await jose.jwtDecrypt(token, secretKey);

            if (!payload || !payload.id) {
                return next(new Error('Token inválido'));
            }

            // Busca o usuário no banco
            const userQuery = await dbQuery('SELECT id, fullName, email, role, empresa_id, ativo FROM User WHERE id = ?', [payload.id]);

            if (!userQuery || !userQuery.length || !userQuery[0]?.ativo) {
                return next(new Error('Usuário não encontrado ou inativo'));
            }

            const user = userQuery[0];

            // Armazena dados do usuário no socket para uso posterior
            socket.user = {
                id: user.id,
                fullName: user.fullName,
                email: user.email,
                role: user.role,
                empresa_id: user.empresa_id
            };

            next();
        } catch (error) {
            console.error('[Socket] Erro na autenticação:', error.message);
            return next(new Error('Falha na autenticação'));
        }
    });

    io.on('connection', (socket) => {
        const { empresa_id, fullName } = socket.user;

        // Junta o socket na room da empresa - isola eventos por empresa
        const empresaRoom = `empresa_${empresa_id}`;
        socket.join(empresaRoom);

        console.log(`[Socket] ${fullName} conectado (empresa ${empresa_id}), total: ${io.engine.clientsCount}`);

        socket.on('disconnect', (reason) => {
            console.log(`[Socket] ${fullName} desconectado (${reason}), total: ${io.engine.clientsCount}`);
        });

        // Eventos que o frontend emite e precisam ser repassados para a mesma empresa
        socket.on('updateC', (id) => {
            io.to(empresaRoom).emit('updateC', id);
        });

        socket.on('updateEvent', (data) => {
            io.to(empresaRoom).emit('updateEvent', data);
        });

        // Erros do socket
        socket.on('error', (error) => {
            console.error('[Socket] Erro:', error);
        });
    });

    return io;
}

function getIO() {
    if (!io) {
        return null;
    }
    return io;
}

/**
 * Emite um evento apenas para os sockets conectados de uma empresa específica.
 * Substitui io.emit() global para isolamento multi-tenant.
 * @param {number} empresaId - ID da empresa
 * @param {string} event - Nome do evento
 * @param {*} data - Dados do evento
 */
function emitToEmpresa(empresaId, event, data) {
    if (!io) return;
    io.to(`empresa_${empresaId}`).emit(event, data);
}

module.exports = { setupSocket, getIO, emitToEmpresa };
