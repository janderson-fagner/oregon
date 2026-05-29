// useAppVersion.js
//
// Detecta quando um novo build do frontend foi publicado e sinaliza ao usuário
// que ele deve atualizar a página.
//
// Como funciona:
//  - No build, o Vite embute `__APP_BUILD_ID__` no bundle e grava o mesmo valor
//    em /version.json (ver vite.config.js).
//  - Em runtime, fazemos polling do /version.json (sem cache) e comparamos o
//    buildId remoto com o embutido. Se forem diferentes, há uma versão nova.
//  - Não recarregamos automaticamente (o usuário pode estar digitando); apenas
//    expomos `updateAvailable` para a UI mostrar um aviso com botão "Atualizar".

import { ref } from 'vue'

// Valor embutido em build. Fora do build (ex.: testes), cai em 'dev'.
const CURRENT_BUILD_ID =
  typeof __APP_BUILD_ID__ !== 'undefined' ? __APP_BUILD_ID__ : 'dev'

// Intervalo de verificação (ms). 5 min é suficiente para avisar sem custo.
const POLL_INTERVAL = 5 * 60 * 1000

// Estado compartilhado (singleton entre todos os componentes)
const updateAvailable = ref(false)
const novoBuildId = ref(null)

let iniciado = false
let timer = null

/**
 * Busca o /version.json publicado, sem cache, e devolve o buildId remoto.
 * @returns {Promise<string|null>}
 */
async function buscarVersaoRemota() {
  try {
    const base = import.meta.env.BASE_URL || '/'
    const url = `${base}version.json?t=${Date.now()}`
    const res = await fetch(url, { cache: 'no-store' })
    if (!res.ok) return null
    const data = await res.json()
    return data && data.buildId ? String(data.buildId) : null
  } catch {
    // Falha de rede/arquivo ausente não deve quebrar nada — apenas ignora.
    return null
  }
}

/**
 * Compara a versão remota com a embutida e atualiza o estado.
 */
async function verificar() {
  if (updateAvailable.value) return // já sinalizado; não precisa repetir
  const remoto = await buscarVersaoRemota()
  if (remoto && remoto !== CURRENT_BUILD_ID) {
    novoBuildId.value = remoto
    updateAvailable.value = true
    pararPolling()
  }
}

function pararPolling() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/**
 * Recarrega a aplicação para carregar o novo build.
 */
function reloadApp() {
  // location.reload() já busca o index.html novo; os assets têm hash próprio.
  window.location.reload()
}

/**
 * Inicia o monitoramento (idempotente). Só roda em produção — em dev o build
 * muda a cada hot-reload e o aviso seria ruído.
 */
function iniciarMonitoramento() {
  if (iniciado) return
  iniciado = true

  // `import.meta.hot` só existe no servidor de dev (vite). Em qualquer artefato
  // buildado ele é undefined — então o monitor roda em todo build publicado,
  // mas nunca durante o desenvolvimento com HMR (onde seria ruído).
  if (import.meta.hot) return

  // Checagem inicial + polling periódico
  verificar()
  timer = setInterval(verificar, POLL_INTERVAL)

  // Verifica também quando o usuário volta à aba (uso típico: deixou aberto)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verificar()
  })
  window.addEventListener('focus', verificar)
}

export function useAppVersion() {
  return {
    updateAvailable,
    novoBuildId,
    currentBuildId: CURRENT_BUILD_ID,
    iniciarMonitoramento,
    reloadApp,
  }
}
