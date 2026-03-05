import { io } from "socket.io-client"
import { useCookie } from '@core/composable/useCookie'
import { watch } from 'vue'

/**
 * Socket.io client com autenticação JWT, reconexão robusta e isolamento por empresa.
 *
 * O token é enviado via socket.handshake.auth.token no momento da conexão.
 * Quando o token muda (login/logout), o socket reconecta automaticamente.
 */

function getSocketUrl() {
  if (import.meta.env.VITE_SOCKET_URL) {
    return import.meta.env.VITE_SOCKET_URL
  }
  const apiUrl = import.meta.env.VITE_API_BASE_URL || ''
  if (apiUrl.startsWith('http')) {
    try {
      const url = new URL(apiUrl)
      return url.origin
    } catch (e) {
      return window.location.origin
    }
  }
  return window.location.origin
}

/**
 * Retorna o token de acesso atual do cookie.
 */
function getToken() {
  try {
    const token = useCookie('accessToken').value
    return token || null
  } catch (e) {
    return null
  }
}

// Cria o socket SEM autoConnect - conectamos manualmente após ter o token
export const socket = io(getSocketUrl(), {
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 10000,
  randomizationFactor: 0.5,
  timeout: 20000,
  transports: ['polling', 'websocket'],
  upgrade: true,
  autoConnect: false,  // Conectamos manualmente quando tiver token
  auth: {
    token: getToken()
  }
})

// Contadores internos para debug
let reconnectCount = 0

/**
 * Conecta o socket com o token atual.
 * Se já estiver conectado, desconecta e reconecta com token atualizado.
 */
export function connectSocket() {
  const token = getToken()
  if (!token) {
    console.warn('[Socket] Sem token, não é possível conectar')
    if (socket.connected) {
      socket.disconnect()
    }
    return
  }

  // Atualiza o token de autenticação
  socket.auth = { token }

  if (socket.connected) {
    // Reconecta com o novo token
    socket.disconnect()
  }

  socket.connect()
}

/**
 * Desconecta o socket (ex: no logout).
 */
export function disconnectSocket() {
  if (socket.connected) {
    socket.disconnect()
  }
}

// --- Event handlers ---

socket.on('connect', () => {
  reconnectCount = 0
  console.log(`[Socket] Conectado (id: ${socket.id})`)
})

socket.on('disconnect', (reason) => {
  console.warn(`[Socket] Desconectado: ${reason}`)

  // Se o servidor fechou a conexão, tenta reconectar com token atualizado
  if (reason === 'io server disconnect') {
    const token = getToken()
    if (token) {
      socket.auth = { token }
      socket.connect()
    }
  }
  // Outros motivos (transport close, ping timeout) reconectam automaticamente
})

socket.on('reconnect', (attemptNumber) => {
  console.log(`[Socket] Reconectado após ${attemptNumber} tentativa(s)`)
})

socket.on('reconnect_attempt', (attemptNumber) => {
  reconnectCount = attemptNumber

  // Atualiza o token a cada tentativa de reconexão (pode ter sido renovado)
  const token = getToken()
  if (token) {
    socket.auth = { token }
  }

  if (attemptNumber <= 3 || attemptNumber % 10 === 0) {
    console.log(`[Socket] Tentativa de reconexão #${attemptNumber}`)
  }
})

socket.on('reconnect_error', (error) => {
  if (reconnectCount <= 3 || reconnectCount % 10 === 0) {
    console.error(`[Socket] Erro na reconexão #${reconnectCount}:`, error.message)
  }
})

socket.on('reconnect_failed', () => {
  console.error('[Socket] Todas as tentativas de reconexão falharam')
})

socket.on('connect_error', (error) => {
  if (reconnectCount <= 1) {
    console.error('[Socket] Erro de conexão:', error.message)
  }

  // Se o erro for de autenticação, não fica tentando reconectar infinitamente
  if (error.message === 'Token de autenticação não fornecido' ||
      error.message === 'Falha na autenticação' ||
      error.message === 'Usuário não encontrado ou inativo') {
    console.warn('[Socket] Parando reconexão: erro de autenticação')
    socket.disconnect()
  }
})

// Reconecta ao voltar online após perda de rede
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (!socket.connected) {
      console.log('[Socket] Rede restaurada, reconectando...')
      connectSocket()
    }
  })

  // Reconecta ao voltar de aba inativa (tab focus)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !socket.connected) {
      console.log('[Socket] Aba reativada, reconectando...')
      connectSocket()
    }
  })
}

// Conexão inicial - conecta se já tiver token (ex: página recarregada com sessão ativa)
const initialToken = getToken()
if (initialToken) {
  connectSocket()
}
