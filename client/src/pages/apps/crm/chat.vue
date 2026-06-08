<script setup>
import { temaAtual } from "@core/stores/config"
import { socket } from "@/composables/useSocket"
import { useDisplay } from "vuetify"
import moment from "moment"
import { QuillEditor } from "@vueup/vue-quill"
import "@vueup/vue-quill/dist/vue-quill.snow.css"
import {
  formatWhatsAppText,
  stripWhatsAppMarks,
  htmlToWhatsApp,
} from "@/utils/whatsappFormat"

import DadosCliente from "@/views/apps/crm/dadosCliente.vue"
import MetaTemplateDialog from "@/pages/apps/crm/configs/MetaTemplateDialog.vue"
import notificationSound from "@/assets/notification-zap.mp3"

const { setAlert } = useAlert()

// ---- Som de notificação (toca só de 0 a 1.5s ao chegar mensagem inbound) ----
const notifAudio = new Audio(notificationSound)

notifAudio.preload = "auto"
let _notifTimer = null

const tocarNotificacao = () => {
  try {
    notifAudio.currentTime = 0

    const p = notifAudio.play()
    if (p && p.catch) p.catch(() => {}) // navegador pode bloquear sem interação prévia
    clearTimeout(_notifTimer)
    _notifTimer = setTimeout(() => {
      try {
        notifAudio.pause()
        notifAudio.currentTime = 0
      } catch (_) {}
    }, 1500)
  } catch (_) {}
}

const userData = useCookie("userData").value

const router = useRouter()
const loading = ref(false)
const loadingMessages = ref(false)

// Detecção responsiva — em mobile alternamos entre lista e conversa
const { mobile, smAndDown } = useDisplay()
const showChatPanel = ref(false) // true em mobile = mostrar conversa

const searchQuery = ref("")

const allChats = ref([])
const selectedChat = ref(null)
const loadingMoreChats = ref(false)

// Cache de timestamps Moment para evitar reparseamento em cada render.
// Limpa quando troca de chat.
const _momentCache = new Map()

const getMoment = data => {
  if (!data) return moment.invalid()
  let m = _momentCache.get(data)
  if (!m) {
    m = moment(data, "DD/MM/YYYY HH:mm:ss")
    _momentCache.set(data, m)
  }

  return m
}

// ---- Helpers de mapeamento Meta Cloud API ----
// O backend serializa datas como ISO 8601 (ex.: "2026-05-27T22:35:26.000Z"),
// mas todo o componente opera no formato canônico "DD/MM/YYYY HH:mm:ss".
// Esta função converte qualquer origem de data para esse formato.
function normalizarData(raw) {
  if (raw === null || raw === undefined || raw === "") return ""
  const m = moment(raw)

  return m.isValid() ? m.format("DD/MM/YYYY HH:mm:ss") : ""
}

// Calcula o estado da janela de 24h a partir do último inbound do contato.
// Usado na listagem (sem chamada extra à API). O cabeçalho usa o ref `janela`,
// que é atualizado via API ao selecionar/receber mensagem.
function calcJanela(lastInboundAt) {
  if (!lastInboundAt) {
    return { windowOpen: false, hoursRemaining: null, expiresAt: null }
  }
  const expiry = moment(lastInboundAt).add(24, "hours")
  const horas = expiry.diff(moment(), "minutes") / 60

  return {
    windowOpen: horas > 0,
    hoursRemaining: horas > 0 ? Math.round(horas * 10) / 10 : 0,
    expiresAt: expiry.toISOString(),
  }
}

function mapConversaToChat(c) {
  const ultima = normalizarData(c.last_message_at)
  const cliente = c.cliente || null

  return {
    id: c.id,
    nome:
      c.contact_name_custom ||
      c.contact_name ||
      cliente?.cli_nome ||
      c.contact_wa_id ||
      "Contato",
    naoLida: c.unread_count || 0,
    pinned: !!c.pinned,
    ultimaAcao: ultima,
    ultimaMensagem: { texto: c.last_message_preview || "", data: ultima },
    messagens: [],
    cliente,
    janela: calcJanela(c.last_inbound_at),

    // A Cloud API do Meta não fornece foto de perfil de contatos (apenas profile.name).
    // Sem coluna de foto em CLIENTES, o avatar fica nulo e o VAvatar exibe o ícone padrão.
    contato: {
      numero: c.contact_wa_id,

      // Exibição prioriza o nome editado manualmente; guardamos as duas origens
      // para o dialog de dados poder mostrar/editar separadamente.
      nome: c.contact_name_custom || c.contact_name,
      nomeCustom: c.contact_name_custom || null,
      nomePerfil: c.contact_name || null,
      avatar: cliente?.avatar || null,
    },
    phoneFlowsBlocked: c.phoneFlowsBlocked || false,
    waitingForAgent: c.waitingForAgent || null,

    // Origem da conversa (anúncio Click-to-WhatsApp), quando houver
    referral: c.referral || null,
    _conv: c,
  }
}

function mapMsgFront(m) {
  const out = { ...m }
  if (m.hasMedia || m.media_url || m.media_path) {
    out.media = {
      url: m.media_url || (m.media_path ? "/uploads/" + m.media_path : null),
      mime: m.media_mime,
      filename: m.media_filename,
      duration: null,
    }
    out.hasMedia = true
  }

  // Garantir campo texto
  if (!out.texto && out.body) out.texto = out.body

  // Normalizar a data para o formato canônico (prioriza timestamp_ms, depois data/created_at)
  if (m.timestamp_ms) {
    out.data = normalizarData(Number(m.timestamp_ms))
  } else {
    out.data = normalizarData(m.data || m.created_at)
  }

  // Origem da mensagem: anúncio Click-to-WhatsApp / produto do catálogo
  out.referral = m.referral || null
  out.referred_product = m.referred_product || null

  // Cartão de contato compartilhado (vCard)
  out.contacts = Array.isArray(m.contacts) ? m.contacts : null

  // Localização compartilhada (type=location): { latitude, longitude, name?, address? }
  out.location =
    m.location && m.location.latitude != null && m.location.longitude != null
      ? m.location
      : null

  return out
}

/**
 * Nome de exibição de um contato compartilhado (vCard).
 */
function nomeContato(ct) {
  if (!ct) return "Contato"

  return (
    (ct.name && (ct.name.formatted_name || ct.name.first_name)) ||
    (ct.phones && ct.phones[0] && ct.phones[0].phone) ||
    "Contato"
  )
}

/**
 * Número (apenas dígitos) do primeiro telefone de um contato, para montar o
 * link wa.me. Prioriza o wa_id (já normalizado pela Meta).
 */
function telContato(ct) {
  const ph = ct && ct.phones && ct.phones[0]
  if (!ph) return ""
  const raw = ph.wa_id || ph.phone || ""

  return String(raw).replace(/\D/g, "")
}

function ackFromStatus(status) {
  // 'played' (Meta) = mensagem de voz ouvida pelo destinatário → tratado como lido (3).
  // Sem isso, áudios ouvidos exibiam o relógio de "pendente" indefinidamente.
  return { pending: 0, sent: 1, delivered: 2, read: 3, played: 3, failed: -1 }[status] ?? 0
}

// ---- Estado da janela 24h ----
const janela = ref({ windowOpen: true, expiresAt: null, hoursRemaining: null })
const templateDialog = ref(false)

const carregarJanela = async id => {
  if (!id) return
  try {
    const res = await $api(`/zap/window-status/${id}`, { method: "GET" })
    if (res) janela.value = res
  } catch {
    // Se erro, assume janela aberta para não bloquear indevidamente
    janela.value = { windowOpen: true, expiresAt: null, hoursRemaining: null }
  }
}

const abrirTemplateDialog = () => {
  templateDialog.value = true
}

const onTemplateEnviado = async () => {
  if (!selectedChat.value?.id) return
  await carregarJanela(selectedChat.value.id)
  await getChat(
    selectedChat.value.id,
    allChats.value.findIndex(c => c.id == selectedChat.value.id),
  )
}

// ---- Nova conversa (iniciar por template) ----
const novaConversaDialog = ref(false)

// Telefone pré-preenchido ao abrir o dialog de nova conversa (ex.: vindo de um
// cartão de contato compartilhado).
const novaConversaPhone = ref("")

// Abre o dialog de nova conversa já com o telefone do contato compartilhado,
// para iniciar o atendimento dentro do próprio sistema.
const iniciarConversaContato = ct => {
  const tel = telContato(ct)
  if (!tel) return
  novaConversaPhone.value = tel
  novaConversaDialog.value = true
}

const onConversaIniciada = async res => {
  await getAllChats()

  const convId = res?.conversationId
  if (!convId) return
  const idx = allChats.value.findIndex(c => c.id == convId)
  if (idx >= 0) {
    selecionarChat(allChats.value[idx])
  }
}

// ---- Fim helpers Meta ----

const getMoreChats = async () => {
  loadingMoreChats.value = true

  try {
    const nextPage = Math.ceil(allChats.value.length / 20) + 1

    const res = await $api("/zap/allChats", {
      method: "GET",
      query: {
        page: nextPage,
        limit: 20,
        busca: searchQuery.value || undefined,
      },
    })

    if (!res) return

    const lista = res.chats || []
    if (lista.length > 0) {
      const novos = lista
        .map(mapConversaToChat)
        .filter(nc => !allChats.value.some(ec => ec.id == nc.id))

      allChats.value = [...allChats.value, ...novos]
    }
  } catch (error) {
    console.error("Error fetching more chats:", error, error.response)
  } finally {
    loadingMoreChats.value = false
  }
}

const handleScrollChats = event => {
  if (!event || !event.target || loadingMoreChats.value) return

  const scrollTop = event.target.scrollTop
  const scrollHeight = event.target.scrollHeight
  const clientHeight = event.target.clientHeight

  if (scrollTop + clientHeight >= scrollHeight - 5) {
    console.log("rolou fim")
    getMoreChats()
  } else if (scrollTop <= 0) {
    console.log("rolou inicio")
  }
}

// ---- Templates aprovados (para renderizar conteúdo real em vez de "[template: nome]") ----
const templatesCache = ref([])

const carregarTemplates = async () => {
  try {
    const res = await $api("/whatsapp/templates", { method: "GET" })

    templatesCache.value = res?.templates || []
  } catch {
    templatesCache.value = []
  }
}

// Extrai o nome do template a partir do body/texto da mensagem ("[template: nome]" ou só "nome").
const extrairNomeTemplate = msg => {
  if (!msg) return ""
  const fonte = msg.body || msg.texto || ""
  const m = String(fonte).match(/^\[template:\s*(.+?)\]\s*$/i)

  return (m ? m[1] : fonte).trim()
}

// Resolve o CONTEÚDO real de um template (texto do componente BODY) a partir do
// cache. Quando não encontra, cai num rótulo amigável "Template: nome".
const resolverConteudoTemplate = msg => {
  const nome = extrairNomeTemplate(msg)
  const tpl = templatesCache.value.find(t => t.name === nome)
  if (tpl) {
    const body = (tpl.components || []).find(
      c => String(c.type || "").toUpperCase() === "BODY",
    )

    if (body?.text) return body.text
  }

  return nome ? `Template: ${nome}` : "Template"
}

// Texto a exibir no balão: para template, mostra o conteúdo real; senão, o texto normal.
const textoExibicaoMsg = msg => {
  if (!msg) return ""
  if ((msg.tipo || msg.type) === "template")
    return resolverConteudoTemplate(msg)

  return msg.texto
}

const getAllChats = async () => {
  loading.value = true

  try {
    const res = await $api("/zap/allChats", {
      method: "GET",
      query: {
        page: 1,
        limit: 20,
        busca: searchQuery.value || undefined,
      },
    })

    if (!res) return

    allChats.value = (res.chats || []).map(mapConversaToChat)
  } catch (error) {
    console.error("Error fetching chats:", error, error.response)
    allChats.value = []
  } finally {
    loading.value = false
  }
}

getAllChats()
carregarTemplates()

const formatShortMsg = (msg, midia = true) => {
  if (!msg) return ""

  let msgText = msg.texto

  if (!msgText) {
    msgText = midia ? "--" : ""
  }

  msgText = msgText.replace(/<br>/g, " ")

  // Remove marcadores de formatação do WhatsApp (*, _, ~, `) para o preview
  // curto da lista — renderizar HTML aqui poderia cortar tags no substring.
  msgText = stripWhatsAppMarks(msgText)

  // Template (item 7): mostra o conteúdo real em vez de "[template: nome]"/nome.
  // Cobre tanto o tempo real (msg.tipo='template') quanto o reload (preview "[template: x]").
  const ehTemplate =
    (msg.tipo || msg.type) === "template" ||
    /^\[template:/i.test(msgText.trim())

  if (ehTemplate) {
    const conteudo = stripWhatsAppMarks(resolverConteudoTemplate(msg)).replace(
      /<br>/g,
      " ",
    )

    return ('<i class="tabler-file-text"></i> ' + conteudo).substring(0, 80)
  }

  // Preview de mídia vindo do backend como token (outbound só tem o token, sem
  // objeto de mídia): "[audio]", "[image]", "[video]", "[document]".
  if (!(msg.hasMedia && msg.media)) {
    const tokenMap = {
      "[audio]": '<i class="tabler-microphone"></i> Áudio',
      "[image]": '<i class="tabler-photo"></i> Imagem',
      "[video]": '<i class="tabler-video"></i> Vídeo',
      "[document]": '<i class="tabler-file-text"></i> Documento',
    }

    const low = msgText.trim().toLowerCase()
    if (tokenMap[low]) return tokenMap[low]
  }

  if (msg.hasMedia && msg.media) {
    let media = msg.media

    //console.log("media", media);

    const handleDuration = seconds => {
      if (!seconds) return "Audio"

      const minutes = Math.floor(seconds / 60)

      const remainingSeconds = seconds % 60

      return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`
    }

    if (media.mime?.includes("image")) {
      msgText = '<i class="tabler-photo"></i> ' + msgText
    } else if (media.mime?.includes("video")) {
      msgText = '<i class="tabler-video"></i> ' + msgText
    } else if (media.mime?.includes("audio")) {
      msgText =
        '<i class="tabler-microphone"></i> ' + handleDuration(media.duration)
    } else if (media.mime?.includes("document")) {
      msgText = '<i class="tabler-file-text"></i> ' + msgText
    } else {
      msgText = '<i class="tabler-paperclip"></i> ' + msgText
    }
  }

  return msgText.substring(0, 60)
}

const getChat = async (id, index = -1, up = false) => {
  try {
    const res = await $api("/zap/getChat/" + id, {
      method: "GET",
    })

    if (!res) return

    const mensagens = (res.messages || []).map(mapMsgFront)

    const chatMapeado = {
      ...mapConversaToChat(res.conversation || { id }),
      messagens: mensagens,
      loadingChat: false,
    }

    if (!up && selectedChat.value && index >= 0) {
      chatMapeado.naoLida = 0

      // Prioriza os dados frescos do backend (enriquecimento completo); cai no
      // estado local anterior apenas quando o backend não retornar o dado.
      chatMapeado.waitingForAgent =
        chatMapeado.waitingForAgent || selectedChat.value.waitingForAgent
      chatMapeado.phoneFlowsBlocked =
        chatMapeado.phoneFlowsBlocked || selectedChat.value.phoneFlowsBlocked
      chatMapeado.cliente = chatMapeado.cliente || selectedChat.value.cliente
      selectedChat.value = chatMapeado
      allChats.value[index] = { ...allChats.value[index], ...chatMapeado }

      // Reset cache + reindex para o chat recém-carregado
      _momentCache.clear()
      indexarMensagens(mensagens)

      carregarJanela(id)
      rolarFimChat(false)
    } else {
      const jaExiste = allChats.value.some(c => c.id == chatMapeado.id)
      if (!jaExiste) {
        allChats.value.unshift(chatMapeado)
      }
    }
  } catch (error) {
    console.error("Error fetching chat:", error, error.response)
  }
}

// Scroll para o fim usando rAF para coincidir com paint do Vue.
// Comportamento "smooth" só após o primeiro snap inicial (instant), evitando
// animações longas quando muitas mensagens chegam em rápida sucessão.
const _scrollPending = { instant: false, smooth: false }

const _doScroll = behavior => {
  const chatBox = document.querySelector(".mensagem-box")
  if (!chatBox) return
  chatBox.scrollTo({ top: chatBox.scrollHeight, behavior })
}

const rolarFimChat = (smooth = true) => {
  const key = smooth ? "smooth" : "instant"
  if (_scrollPending[key]) return
  _scrollPending[key] = true
  nextTick(() => {
    requestAnimationFrame(() => {
      _scrollPending[key] = false
      _doScroll(smooth ? "smooth" : "instant")
    })
  })
}

const selecionarChat = async chat => {
  let index = allChats.value.findIndex(c => c.id == chat.id)

  if (index < 0) return

  allChats.value[index].loadingChat = true
  selectedChat.value = allChats.value[index]

  // Em mobile, deslizar para o painel da conversa
  if (mobile.value) showChatPanel.value = true

  getChat(chat.id, index)

  // Marca como lida no backend (zera contador no servidor + envia recibo de
  // leitura ao contato). getChat já zera localmente, isto garante o servidor.
  if (chat.naoLida) marcarLidaBackend(chat.id)
}

const voltarParaLista = () => {
  showChatPanel.value = false
  viewDadosCliente.value = false

  // Mantém selectedChat para preservar contexto ao voltar
}

// Abre dados do cliente — em mobile precisa voltar ao painel da esquerda
// (a card de DadosCliente é renderizada no chat-list-pane).
// Reflete o nome de contato editado no dialog em todo o estado local do chat
// (cabeçalho + item da lista), sem refazer requisições.
const onContatoRenomeado = novoNome => {
  const nome = novoNome || null

  const exibicao =
    nome || selectedChat.value?.contato?.nomePerfil || selectedChat.value?.nome

  if (selectedChat.value) {
    selectedChat.value.nome = exibicao
    if (selectedChat.value.contato) {
      selectedChat.value.contato.nome = exibicao
      selectedChat.value.contato.nomeCustom = nome
    }
    const idx = allChats.value.findIndex(c => c.id == selectedChat.value.id)
    if (idx >= 0) {
      allChats.value[idx].nome = exibicao
      if (allChats.value[idx].contato) {
        allChats.value[idx].contato.nome = exibicao
        allChats.value[idx].contato.nomeCustom = nome
      }
    }
  }
}

const abrirDadosCliente = () => {
  // Abre para qualquer contato selecionado, mesmo sem cadastro de cliente.
  if (!selectedChat.value) return
  viewDadosCliente.value = !viewDadosCliente.value
  if (mobile.value && viewDadosCliente.value) {
    showChatPanel.value = false
  }
}

const _pendingChatLoads = new Set()

// Índices de IDs para dedup O(1) no chat selecionado.
// Reconstruídos sempre que `selectedChat` muda em `selecionarChat`/`getChat`.
const _msgIds = new Set()
const _msgWamids = new Set()

const indexarMensagens = mensagens => {
  _msgIds.clear()
  _msgWamids.clear()
  for (const m of mensagens) {
    if (m.id != null) _msgIds.add(m.id)
    if (m.wamid) _msgWamids.add(m.wamid)
  }
}

// Inserção mantendo a ordem cronológica.
// Em 99% dos casos a mensagem chega após a última (apenas push); só fazemos
// varredura O(n) reversa quando o timestamp vier desordenado (raro).
const inserirMensagemOrdenada = (lista, msg) => {
  const tMsg = getMoment(msg.data).valueOf()
  const ult = lista[lista.length - 1]
  if (!ult || getMoment(ult.data).valueOf() <= tMsg) {
    lista.push(msg)

    return
  }
  for (let i = lista.length - 1; i >= 0; i--) {
    if (getMoment(lista[i].data).valueOf() <= tMsg) {
      lista.splice(i + 1, 0, msg)

      return
    }
  }
  lista.unshift(msg)
}

const handleNewMessage = payload => {
  if (!payload) return

  // Suporte ao payload Meta: { conversation_id, message }
  const chatId = payload.conversation_id ?? payload.idChat
  const msg = payload.message ?? payload

  if (!chatId || !msg) return

  const msgMapeada = mapMsgFront(msg)

  // Toca o som de notificação apenas para mensagens recebidas (não as próprias).
  if (!msgMapeada.fromMe) tocarNotificacao()

  let chatIndex = allChats.value.findIndex(c => c.id == chatId)

  if (chatIndex < 0 && (!searchQuery.value || searchQuery.value == "")) {
    if (_pendingChatLoads.has(chatId)) return
    _pendingChatLoads.add(chatId)

    return getChat(chatId, -1, true).finally(() =>
      _pendingChatLoads.delete(chatId),
    )
  }

  if (chatIndex >= 0) {
    const c = allChats.value[chatIndex]

    c.ultimaMensagem = msgMapeada
    c.ultimaAcao = msgMapeada.data || msgMapeada.created_at

    // Mensagem inbound reabre/reinicia a janela de 24h
    if (!msgMapeada.fromMe) {
      c.naoLida = (c.naoLida || 0) + 1
      c.janela = calcJanela(new Date())
    }

    // Reordenar para o topo, mas respeitando conversas fixadas (que ficam acima).
    // Conversa não fixada entra logo após o bloco de fixadas; fixada vai ao topo.
    if (chatIndex > 0) {
      const chatItem = allChats.value.splice(chatIndex, 1)[0]

      const pos = chatItem.pinned
        ? 0
        : allChats.value.filter(c => c.pinned).length

      allChats.value.splice(pos, 0, chatItem)
      chatIndex = pos
    } else {
      chatIndex = 0
    }
  }

  if (selectedChat.value?.id == chatId) {
    // Dedup O(1) via Set ao invés de .some() O(n)
    const dupId = msgMapeada.id != null && _msgIds.has(msgMapeada.id)
    const dupWamid = msgMapeada.wamid && _msgWamids.has(msgMapeada.wamid)
    if (!dupId && !dupWamid) {
      if (msgMapeada.id != null) _msgIds.add(msgMapeada.id)
      if (msgMapeada.wamid) _msgWamids.add(msgMapeada.wamid)
      inserirMensagemOrdenada(selectedChat.value.messagens, msgMapeada)
      rolarFimChat()
    }
    if (chatIndex >= 0) allChats.value[chatIndex].naoLida = 0

    // Recarrega janela ao receber msg inbound e marca como lida no backend
    // (a conversa está aberta na tela; sem isso o unread_count do servidor ficaria
    // acumulando e reapareceria como não lida ao recarregar).
    if (!msgMapeada.fromMe) {
      carregarJanela(chatId)
      marcarLidaBackend(chatId)
    }
  }
}

// Marca a conversa como lida no backend (zera unread_count + recibo de leitura).
// Fire-and-forget: falha não impacta a UI.
const marcarLidaBackend = chatId => {
  if (!chatId) return
  $api(`/zap/mark-read/${chatId}`, { method: "POST" }).catch(() => {})
}

const goToImg = url => {
  if (!url) return

  window.open(url, "_blank")
}

// ---- Lightbox de imagem (zoom/pan/rotação) ----
const lightboxOpen = ref(false)
const lightboxSrc = ref("")

const abrirImagem = url => {
  if (!url) return
  lightboxSrc.value = url
  lightboxOpen.value = true
}

// ---- Helpers de localização (mensagem type=location) ----
// Link universal que abre o ponto no Google Maps.
const mapsLink = loc => {
  if (!loc) return "#"

  return `https://www.google.com/maps/search/?api=1&query=${loc.latitude},${loc.longitude}`
}

// Embed de mapa REAL e interativo (Google Maps, sem necessidade de API key).
// Alternativa 100% OpenStreetMap (caso prefira):
//   `https://www.openstreetmap.org/export/embed.html?bbox=${lng-0.006},${lat-0.0035},${lng+0.006},${lat+0.0035}&layer=mapnik&marker=${lat},${lng}`
const mapEmbedUrl = loc => {
  if (!loc) return ""

  return `https://maps.google.com/maps?q=${loc.latitude},${loc.longitude}&z=16&output=embed`
}

socket.on("nova-mensagem", payload => {
  handleNewMessage(payload)
})

// Conversa apagada em outra sessão (soft-delete) — remove da lista local.
socket.on("conversa-apagada", payload => {
  const id = payload?.conversation_id
  if (id != null) removerConversaLocal(id)
})

socket.on("update-mensagem", payload => {
  if (!payload) return

  // Mensagem apagada (soft-delete no sistema): { id, deleted: true }.
  // Removida ANTES do early-return de mensagens carregadas.
  if (payload.deleted && payload.id != null) {
    removerMensagemLocal(payload.id)

    return
  }

  if (!selectedChat.value || !selectedChat.value?.messagens?.length) return

  // Payload de reação: { wamid, reaction } (reaction pode ser null = removida)
  if (payload.wamid && "reaction" in payload && payload.status === undefined) {
    const idx = selectedChat.value.messagens.findIndex(
      m => m.wamid == payload.wamid,
    )

    if (idx >= 0)
      selectedChat.value.messagens[idx].reaction = payload.reaction || null

    return
  }

  // Payload com status: { wamid, status }
  if (payload.wamid && payload.status) {
    const idx = selectedChat.value.messagens.findIndex(
      m => m.wamid == payload.wamid,
    )

    if (idx >= 0) {
      selectedChat.value.messagens[idx].ack = ackFromStatus(payload.status)
      selectedChat.value.messagens[idx].status = payload.status
    }

    return
  }

  // Payload com mídia inbound baixada: { id, media_url, media_path, media_mime }
  if (payload.id && (payload.media_url || payload.media_path)) {
    const idx = selectedChat.value.messagens.findIndex(m => m.id == payload.id)
    if (idx >= 0) {
      selectedChat.value.messagens[idx].media = {
        url:
          payload.media_url ||
          (payload.media_path ? "/uploads/" + payload.media_path : null),
        mime:
          payload.media_mime || selectedChat.value.messagens[idx].media?.mime,
        filename:
          payload.media_filename ||
          selectedChat.value.messagens[idx].media?.filename,
        duration: null,
      }
      selectedChat.value.messagens[idx].hasMedia = true
    }

    return
  }

  // Fallback legado: { id, ack }
  if (payload.id && payload.ack !== undefined) {
    const idx = selectedChat.value.messagens.findIndex(m => m.id == payload.id)
    if (idx >= 0) selectedChat.value.messagens[idx].ack = payload.ack
  }
})

// Normaliza telefone para comparacao (ultimos 8 digitos)
const normalizePhoneKey = p => {
  if (!p) return ""

  return String(p).replace(/\D/g, "").slice(-8)
}

// Aplica uma atualizacao de estado a um chat (mutacao in-place)
const applyChatStateUpdate = (chat, state) => {
  if (!chat) return

  // Estado de bloqueio do cliente cadastrado
  if (state.flows_blocked !== undefined && chat.cliente) {
    chat.cliente.flows_blocked = state.flows_blocked ? 1 : 0
  }

  // Estado de bloqueio por telefone (contato sem cadastro)
  if (state.phone_blocked !== undefined) {
    chat.phoneFlowsBlocked = !!state.phone_blocked
  }

  // Estado de aguardando/em atendimento
  if (state.waiting_for_agent === false) {
    chat.waitingForAgent = null
  } else if (
    state.agent_status === "waiting" ||
    state.agent_status === "in_attendance"
  ) {
    chat.waitingForAgent = {
      ...(chat.waitingForAgent || {}),
      runId: state.runId ?? chat.waitingForAgent?.runId ?? null,
      agent_status: state.agent_status,
      agent_user_id:
        state.agent_user_id ?? chat.waitingForAgent?.agent_user_id ?? null,
    }
  }
}

socket.on("chat:state-update", state => {
  if (!state) return
  console.log("chat:state-update", state)

  const chatIdKey = state.chatId || null
  const phoneKey = normalizePhoneKey(state.phone)
  const clienteIdKey = state.clienteId || null

  const matchChat = c => {
    if (!c) return false
    if (chatIdKey && c.id === chatIdKey) return true
    if (clienteIdKey && c.cliente?.cli_Id === clienteIdKey) return true
    if (phoneKey) {
      const phoneA = normalizePhoneKey(
        c.contato?.numero || c.cliente?.cli_celular || c.id || "",
      )

      if (phoneA && phoneA === phoneKey) return true
    }

    return false
  }

  // Atualizar chat selecionado
  if (selectedChat.value && matchChat(selectedChat.value)) {
    applyChatStateUpdate(selectedChat.value, state)
  }

  // Atualizar na lista de chats
  for (const c of allChats.value) {
    if (matchChat(c)) applyChatStateUpdate(c, state)
  }
})

// Memoização: formatação da sidebar é chamada N vezes por render — cache
// por chave (data + short) evita reparseamento moment a cada update.
const _handleDataCache = new Map()
let _handleDataCacheDay = moment().format("YYYY-MM-DD")

const handleData = (dataChat, short = true) => {
  if (!dataChat) return ""

  // Invalida cache se o dia mudou (chat aberto madrugada adentro)
  const hoje = moment().format("YYYY-MM-DD")
  if (hoje !== _handleDataCacheDay) {
    _handleDataCache.clear()
    _handleDataCacheDay = hoje
  }
  const key = dataChat + "|" + (short ? "s" : "l")
  const hit = _handleDataCache.get(key)
  if (hit !== undefined) return hit

  const data = getMoment(dataChat)
  const now = moment()
  let out
  if (data.isSame(now, "day")) {
    // Hoje: na listagem mostra a hora; no chip da conversa mostra "Hoje"
    out = short ? data.format("HH:mm") : "Hoje"
  } else if (data.isSame(now.clone().subtract(1, "day"), "day")) {
    out = "Ontem"
  } else if (data.isSame(now.clone().subtract(2, "day"), "day")) {
    out = "Anteontem"
  } else {
    out = data.format("DD/MM/YYYY")
  }
  _handleDataCache.set(key, out)

  return out
}

// Lista de mensagens com separadores de data injetados (pills "Hoje" / "Ontem"
// / "25/05/2026"), no estilo do WhatsApp. Um separador entra sempre que o dia
// da mensagem difere do da mensagem anterior. Derivado de `messagens` apenas
// para exibição — todas as operações por índice/ID continuam no array original.
const mensagensComData = computed(() => {
  const msgs = selectedChat.value?.messagens || []
  const out = []
  let ultimoDia = null
  for (const m of msgs) {
    const mm = getMoment(m.data)
    const dia = mm.isValid() ? mm.format("YYYY-MM-DD") : null
    if (dia && dia !== ultimoDia) {
      out.push({ tipo: "data", data: handleData(m.data, false), _sep: dia })
      ultimoDia = dia
    }
    out.push(m)
  }

  return out
})

/* Status possíveis:
 * 0: A mensagem foi enviada, mas ainda não chegou ao servidor (pendente).
 * 1: A mensagem foi recebida pelo servidor do WhatsApp.
 * 2: A mensagem foi entregue ao destinatário.
 * 3: A mensagem foi lida pelo destinatário (status de "lida").
 */

const activeAudio = ref(null)

const handlePlay = id => {
  activeAudio.value = id
}

const gravando = ref(false)
const audioUrl = ref(null)
const mediaRecorder = ref(null)
const chunks = []
const timeGravando = ref(0)
const audioBlob = ref(null)
let intervalGravando = null

// Resolver de uma promise resolvida quando o MediaRecorder termina de montar o
// blob (evento onstop). Substitui o antigo setTimeout(2000) fixo: paramos de
// esperar um tempo arbitrário e seguimos assim que o áudio está realmente pronto.
let onStopResolver = null

const initTimer = () => {
  timeGravando.value = 0

  if (intervalGravando) {
    clearInterval(intervalGravando)
  }

  intervalGravando = setInterval(() => {
    timeGravando.value += 1
  }, 1000)
}

const stopTimer = () => {
  timeGravando.value = 0
  clearInterval(intervalGravando)
}

const iniciarGravacao = async () => {
  try {
    // Constraints melhoram a captação de voz: autoGainControl levanta o nível de
    // microfones fracos (ajuda no "áudio baixo"), além de reduzir ruído e eco.
    // NÃO mexer em bitrate aqui (audioBitsPerSecond zerava o áudio em alguns navegadores).
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })

    // Estratégia: Chrome MENTE com isTypeSupported("audio/mp4") (sem AAC, grava lixo
    // que a Meta rejeita como application/octet-stream). Por isso preferimos webm/opus,
    // que Chrome/Firefox produzem corretamente — o backend remuxa para ogg antes do Meta.
    // Para o mp4, exigimos o codec AAC explicitamente: só o Safari aceita de verdade.
    let mimeType
    if (MediaRecorder.isTypeSupported("audio/webm; codecs=opus")) {
      mimeType = "audio/webm; codecs=opus"
    } else if (MediaRecorder.isTypeSupported("audio/ogg; codecs=opus")) {
      mimeType = "audio/ogg; codecs=opus"
    } else if (MediaRecorder.isTypeSupported("audio/mp4; codecs=mp4a.40.2")) {
      mimeType = "audio/mp4; codecs=mp4a.40.2"
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      mimeType = "audio/webm"
    } else {
      throw new Error("Nenhum formato de gravação suportado")
    }

    // IMPORTANTE: NÃO forçar audioBitsPerSecond aqui. Em alguns navegadores,
    // limitar o bitrate do MediaRecorder produz um webm sem áudio (faixa muda).
    // A compressão para nota de voz é feita no backend (re-encode para 32k mono
    // OGG), que preserva o áudio. Mantemos o bitrate padrão do navegador.
    mediaRecorder.value = new MediaRecorder(stream, { mimeType })

    mediaRecorder.value.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data)
    }

    mediaRecorder.value.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType })

      audioBlob.value = blob // armazena o blob
      audioUrl.value = URL.createObjectURL(blob) // URL para player
      chunks.length = 0

      // Libera quem aguarda o áudio ficar pronto (ver pararGravacao).
      if (onStopResolver) {
        onStopResolver()
        onStopResolver = null
      }
    }

    mediaRecorder.value.start()
    gravando.value = true
    initTimer()
  } catch (err) {
    console.error("Erro ao gravar:", err)
    alert("Não foi possível iniciar gravação: " + err.message)
  }
}

// Para a gravação e resolve assim que o blob estiver montado (evento onstop).
// Retorna uma promise para o chamador aguardar o áudio ficar pronto sem usar
// um setTimeout fixo. Timeout de segurança de 3s evita travar caso onstop não
// dispare por algum motivo.
const pararGravacao = () => {
  return new Promise(resolve => {
    if (!(mediaRecorder.value && gravando.value)) {
      resolve()

      return
    }
    let done = false

    const finish = () => {
      if (done) return
      done = true
      clearTimeout(seguranca)
      resolve()
    }

    // onstop chama finish quando o blob estiver pronto; o timeout é só salvaguarda.
    const seguranca = setTimeout(finish, 3000)

    onStopResolver = finish
    mediaRecorder.value.stop()
    gravando.value = false
    stopTimer()
    console.log("Gravação parada.")
  })
}

const formatTime = seconds => {
  const min = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0")

  const sec = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0")

  return `${min}:${sec}`
}

const message = ref("")
const loadingSendMessage = ref(false)
const filesToSend = ref([])
const inputFiles = ref(null)

// ---- Compositor WYSIWYG (QuillEditor) ----
// O editor trabalha com HTML (negrito/itálico/riscado/mono visíveis enquanto
// digita). O `message` (marcação do WhatsApp, com *, _, ~) é derivado do HTML
// e é o que o restante do código usa para enviar e habilitar o botão.
const messageHtml = ref("") // conteúdo HTML do editor
const quillRef = ref(null) // ref do QuillEditor

// Barra de formatação compatível com o WhatsApp (sem sublinhado/cores, que o
// WhatsApp não suporta): negrito, itálico, riscado, monoespaçado e "limpar".
const composerToolbar = [["bold", "italic", "strike", "code"], ["clean"]]

// Mantém `message` (marcação WhatsApp) sincronizado com o HTML do editor.
watch(messageHtml, html => {
  message.value = htmlToWhatsApp(html)
})

// Autoformat: ao digitar o marcador de fechamento, converte a marcação do
// WhatsApp em formatação real do Quill. Ex.: "*asdasd*" -> negrito.
// O conteúdo entre marcadores não pode começar/terminar com espaço (regra do
// WhatsApp), então "2 * 3 *" não vira negrito.
const AUTOFORMAT = [
  { fmt: "bold", re: /\*(\S(?:[^*\n]*?\S)?)\*$/ },
  { fmt: "italic", re: /_(\S(?:[^_\n]*?\S)?)_$/ },
  { fmt: "strike", re: /~(\S(?:[^~\n]*?\S)?)~$/ },
  { fmt: "code", re: /`([^`\n]+?)`$/ },
]

/**
 * Liga o autoformat na instância do Quill (evento @ready do QuillEditor).
 * @param {import('quill').Quill} quill
 */
const onQuillReady = quill => {
  let formatando = false // guarda contra reentrância

  quill.on("text-change", (delta, oldDelta, source) => {
    if (source !== "user" || formatando) return

    const sel = quill.getSelection()
    if (!sel || sel.length > 0) return

    const index = sel.index
    const before = quill.getText(0, index)

    // Só age quando o último caractere digitado é um marcador de fechamento.
    if (!"*_~`".includes(before.slice(-1))) return

    const lineStart = before.lastIndexOf("\n") + 1
    const lineText = before.slice(lineStart)

    for (const { fmt, re } of AUTOFORMAT) {
      const m = lineText.match(re)
      if (!m) continue

      const inner = m[1]
      const start = lineStart + m.index

      formatando = true

      // Remove "*texto*" e reinsere "texto" já formatado.
      quill.deleteText(start, m[0].length, "user")
      quill.insertText(start, inner, { [fmt]: true }, "user")

      // Reposiciona o cursor e desliga o formato p/ não "vazar" no próximo texto.
      quill.setSelection(start + inner.length, 0, "user")
      quill.format(fmt, false, "user")
      formatando = false
      break
    }
  })
}

const limparEntrada = () => {
  message.value = ""
  messageHtml.value = ""

  // Limpa também o conteúdo interno do Quill (só atribuir "" ao v-model nem
  // sempre reflete no editor; setText('') na instância é o mais confiável).
  try {
    quillRef.value?.getQuill()?.setText("")
  } catch (_) {
    /* editor pode não estar montado ainda */
  }
  filesToSend.value = []
  if (inputFiles.value) inputFiles.value.value = null
  audioUrl.value = null
  audioBlob.value = null
  viewReply.value = false
  msgReply.value = null
}

/**
 * Envia mensagem do compositor. Três modos:
 *  - "audio": grava e envia áudio (com legenda opcional).
 *  - arquivo(s) no input: envia cada arquivo via /save-anexo;
 *    o texto digitado vira legenda do PRIMEIRO arquivo (convenção do WhatsApp).
 *  - apenas texto: envia via /send-message-chat.
 * NÃO chama /send-message-chat com texto vazio (causava 400 "text é obrigatório").
 */
const sendMessage = async (type = "default") => {
  const texto = (message.value || "").trim()

  const arquivos =
    inputFiles.value?.files?.length > 0
      ? Array.from(inputFiles.value.files)
      : []

  if (type === "default" && !texto && arquivos.length === 0) {
    setAlert("Digite uma mensagem ou anexo para enviar.", "error")

    return
  }

  // Captura a conversa-alvo AGORA. Durante o upload (que pode levar alguns
  // segundos) o atendente pode trocar de conversa; sem isso o `selectedChat`
  // mudaria e a mensagem iria para o contato errado. Tudo abaixo usa estes
  // valores fixos, não o `selectedChat.value` "vivo".
  const targetChat = selectedChat.value
  const targetConvId = targetChat?.id
  if (!targetConvId) {
    setAlert("Selecione uma conversa para enviar.", "error")

    return
  }

  const replyWamid =
    viewReply.value && msgReply.value ? msgReply.value.wamid || null : null

  loadingSendMessage.value = true

  try {
    if (type === "audio") {
      await pararGravacao() // aguarda o blob ficar pronto (sem setTimeout fixo)
      if (!audioBlob.value || audioBlob.value.size === 0) {
        setAlert("Não foi possível processar o áudio gravado.", "error")

        return
      }
      await sendAnexo("audio", texto || "", targetConvId, targetChat)
      limparEntrada()

      return
    }

    if (arquivos.length > 0) {
      // Legenda só na primeira mídia (padrão WhatsApp). Demais arquivos vão sem caption.
      for (let i = 0; i < arquivos.length; i++) {
        const caption = i === 0 ? texto : ""

        await sendAnexo(arquivos[i], caption, targetConvId, targetChat)
      }
      limparEntrada()

      return
    }

    // Apenas texto
    const res = await $api("/zap/send-message-chat", {
      method: "POST",
      body: {
        conversationId: targetConvId,
        text: texto,
        replyToWamid: replyWamid,
      },
    })

    if (!res) return

    // Janela fechada
    if (res.windowClosed) {
      janela.value = { windowOpen: false, expiresAt: null, hoursRemaining: 0 }
      setAlert(
        "A janela de 24h está fechada. Envie um template para reabrir.",
        "warning",
        "tabler-clock",
        5000,
      )

      return
    }

    limparEntrada()

    // Append otimista da mensagem retornada — sempre na conversa-alvo capturada,
    // não no selectedChat "vivo" (que pode ter mudado durante o request).
    if (res.message) {
      const msgMapeada = mapMsgFront(res.message)
      const dupId = msgMapeada.id != null && _msgIds.has(msgMapeada.id)
      const dupWamid = msgMapeada.wamid && _msgWamids.has(msgMapeada.wamid)
      if (!dupId && !dupWamid) {
        if (msgMapeada.id != null) _msgIds.add(msgMapeada.id)
        if (msgMapeada.wamid) _msgWamids.add(msgMapeada.wamid)
        inserirMensagemOrdenada(targetChat.messagens, msgMapeada)
        if (selectedChat.value?.id === targetConvId) rolarFimChat()
      }
    }
  } catch (error) {
    console.error("Error sending message:", error, error.response)

    // 422 = janela fechada
    if (
      error?.response?.status === 422 ||
      error?.response?._data?.windowClosed
    ) {
      janela.value = { windowOpen: false, expiresAt: null, hoursRemaining: 0 }
      setAlert(
        "A janela de 24h está fechada. Envie um template para reabrir.",
        "warning",
        "tabler-clock",
        5000,
      )

      return
    }

    setAlert(
      error?.response?._data?.message ||
        error?.response?._data?.error ||
        "Erro ao enviar mensagem. Tente novamente.",
      "error",
      "tabler-alert-triangle",
      5000,
    )
  } finally {
    loadingSendMessage.value = false
  }
}

// convIdOverride/targetChat: conversa-alvo capturada no início do envio. Quando
// informados, o anexo vai sempre para essa conversa mesmo que o atendente troque
// de chat durante o upload (corrige o bug de enviar áudio ao contato errado).
const sendAnexo = async (
  anexo,
  caption = "",
  convIdOverride = null,
  targetChat = null,
) => {
  if (!anexo) return

  const convId = convIdOverride ?? selectedChat.value?.id
  const chatRef = targetChat ?? selectedChat.value

  try {
    const formData = new FormData()

    if (anexo == "audio") {
      formData.append(
        "file",
        new File([audioBlob.value], "voz.webm", {
          type: audioBlob.value.type,
        }),
      )
    } else {
      formData.append("file", anexo)
    }

    formData.append("conversationId", convId)
    if (caption) formData.append("caption", caption)

    const res = await $api("/zap/save-anexo", {
      method: "POST",
      body: formData,
    })

    if (!res) return

    // Append otimista se retornar mensagem.
    // Importante: save-anexo retorna msgObj só com `wamid` (sem `id`), então
    // o dedup precisa cobrir wamid — senão duplica quando o socket
    // "nova-mensagem" chega antes da resposta HTTP.
    if (res.message) {
      const msgMapeada = mapMsgFront(res.message)
      const dupId = msgMapeada.id != null && _msgIds.has(msgMapeada.id)
      const dupWamid = msgMapeada.wamid && _msgWamids.has(msgMapeada.wamid)
      if (!dupId && !dupWamid) {
        if (msgMapeada.id != null) _msgIds.add(msgMapeada.id)
        if (msgMapeada.wamid) _msgWamids.add(msgMapeada.wamid)
        inserirMensagemOrdenada(chatRef.messagens, msgMapeada)
        if (selectedChat.value?.id === convId) rolarFimChat()
      }
    }

    return res
  } catch (error) {
    console.error("Error sending anexo:", error, error.response)

    if (
      error?.response?.status === 422 ||
      error?.response?._data?.windowClosed
    ) {
      janela.value = { windowOpen: false, expiresAt: null, hoursRemaining: 0 }
      setAlert(
        "A janela de 24h está fechada. Envie um template para reabrir.",
        "warning",
        "tabler-clock",
        5000,
      )

      return
    }

    setAlert(
      error?.response?._data?.message ||
        error?.response?._data?.error ||
        "Erro ao enviar anexo. Tente novamente.",
      "error",
      "tabler-alert-triangle",
      5000,
    )
  }
}

const resolveIconFile = type => {
  if (!type) return "tabler-file"

  type = type.toLowerCase()

  if (type.includes("pdf")) return "tabler-file-type-pdf"
  if (type.includes("doc")) return "tabler-file-word"
  if (type.includes("xls")) return "tabler-file-excel"
  if (type.includes("ppt")) return "tabler-file-type-ppt"
  if (type.includes("zip") || type.includes("rar")) return "tabler-file-zip"
  if (type.includes("jpg") || type.includes("jpeg"))
    return "tabler-file-type-jpg"
  if (type.includes("png")) return "tabler-file-type-png"
  if (type.includes("svg")) return "tabler-file-type-svg"
  if (type.includes("audio")) return "tabler-file-music"
  if (type.includes("video")) return "tabler-photo-video"

  return "tabler-file"
}

const viewMenuMsg = ref(false)
const msgMenu = ref(null)

const handleMenuMsg = (event, msg) => {
  if (!msg) return

  msgMenu.value = msg
  viewMenuMsg.value = true

  //Posiciona o menu na posição do clique
  const menu = document.querySelector(".menu-msg")
  if (menu) {
    console.log("menu", menu, event.clientX, event.clientY)
    menu.style.left = event.clientX + "px"
    menu.style.top = event.clientY + "px"
  }
}

// Ações do menu de contexto da mensagem. Montadas conforme o tipo da mensagem.
// Obs: Apagar é só no sistema (a Cloud API não apaga no WhatsApp do contato).
const actionsMsg = msg => {
  const acoes = []
  if (msg?.wamid) {
    acoes.push({
      title: "Responder",
      icon: "tabler-corner-up-left",
      action: "reply",
    })
  }
  if (textoExibicaoMsg(msg)) {
    acoes.push({ title: "Copiar", icon: "tabler-copy", action: "copy" })
  }

  // Encaminhar: texto ou mídia (templates não — não há conteúdo reenviável fiel).
  if (
    (msg?.tipo || msg?.type) !== "template" &&
    (msg?.media?.url || textoExibicaoMsg(msg))
  ) {
    acoes.push({
      title: "Encaminhar",
      icon: "tabler-arrow-forward",
      action: "forward",
    })
  }
  acoes.push({ title: "Apagar", icon: "tabler-trash", action: "delete" })

  return acoes
}

// Dispatcher das ações do menu da mensagem.
const onActionMsg = (action, msg) => {
  viewMenuMsg.value = false
  if (!msg) return
  if (action === "reply") return openReply(msg)
  if (action === "copy") return copiarMensagem(msg)
  if (action === "forward") return abrirEncaminhar(msg)
  if (action === "delete") return abrirApagarMsg(msg)
}

// Copia o texto em formato WhatsApp (a marcação já é armazenada com *, _, ~).
const copiarMensagem = async msg => {
  const texto = textoExibicaoMsg(msg) || ""
  if (!texto) return
  try {
    await navigator.clipboard.writeText(texto)
    setAlert("Mensagem copiada.", "success", "tabler-copy", 2000)
  } catch {
    setAlert("Não foi possível copiar a mensagem.", "error")
  }
}

// ---- Apagar mensagem (somente no sistema) ----
const viewApagarMsg = ref(false)
const msgApagar = ref(null)
const loadingApagarMsg = ref(false)

const abrirApagarMsg = msg => {
  msgApagar.value = msg
  viewApagarMsg.value = true
}

const confirmarApagarMsg = async () => {
  const msg = msgApagar.value
  if (!msg?.id) {
    viewApagarMsg.value = false

    return
  }
  loadingApagarMsg.value = true
  try {
    await $api(`/zap/message/${msg.id}`, { method: "DELETE" })
    removerMensagemLocal(msg.id)
    viewApagarMsg.value = false
    setAlert(
      "Mensagem apagada (somente no sistema).",
      "success",
      "tabler-trash",
      3000,
    )
  } catch {
    setAlert("Não foi possível apagar a mensagem.", "error")
  } finally {
    loadingApagarMsg.value = false
  }
}

// Remove a bolha localmente (também usado pelo socket update-mensagem deleted).
const removerMensagemLocal = msgId => {
  if (!selectedChat.value?.messagens) return
  const idx = selectedChat.value.messagens.findIndex(m => m.id == msgId)
  if (idx >= 0) {
    const m = selectedChat.value.messagens[idx]
    if (m.id != null) _msgIds.delete(m.id)
    if (m.wamid) _msgWamids.delete(m.wamid)
    selectedChat.value.messagens.splice(idx, 1)
  }
}

// ---- Encaminhar mensagem ----
const viewEncaminhar = ref(false)
const msgEncaminhar = ref(null)
const buscaEncaminhar = ref("")
const telefoneEncaminhar = ref("")
const loadingEncaminhar = ref(false)

const abrirEncaminhar = msg => {
  msgEncaminhar.value = msg
  buscaEncaminhar.value = ""
  telefoneEncaminhar.value = ""
  viewEncaminhar.value = true
}

// Conversas filtradas para o dialog de encaminhar (por nome/número).
const conversasEncaminhar = computed(() => {
  const q = (buscaEncaminhar.value || "").trim().toLowerCase()
  const lista = allChats.value || []
  if (!q) return lista.slice(0, 50)

  return lista
    .filter(
      c =>
        String(c.nome || "")
          .toLowerCase()
          .includes(q) || String(c.contato?.numero || "").includes(q),
    )
    .slice(0, 50)
})

const encaminharPara = async ({ conversationId, phone }) => {
  const msg = msgEncaminhar.value
  if (!msg?.id) return
  loadingEncaminhar.value = true
  try {
    const res = await $api("/zap/forward", {
      method: "POST",
      body: {
        messageId: msg.id,
        toConversationId: conversationId || undefined,
        toPhone: phone || undefined,
      },
    })

    if (res?.success) {
      viewEncaminhar.value = false
      setAlert("Mensagem encaminhada.", "success", "tabler-arrow-forward", 2500)
    }
  } catch (error) {
    if (error?.response?.status === 422) {
      setAlert(
        "Janela de 24h fechada nesse contato. Use um template para reabrir.",
        "warning",
        "tabler-clock",
        5000,
      )
    } else {
      setAlert(
        error?.response?._data?.error || "Não foi possível encaminhar.",
        "error",
      )
    }
  } finally {
    loadingEncaminhar.value = false
  }
}

// ===================== MENU DE CONTEXTO DO CONTATO =====================
const viewMenuContato = ref(false)
const contatoMenu = ref(null)

const handleMenuContato = (event, chat) => {
  if (!chat) return
  contatoMenu.value = chat
  viewMenuContato.value = true

  // Posiciona o menu no ponto do clique
  nextTick(() => {
    const menu = document.querySelector(".menu-contato")
    if (menu) {
      menu.style.left = event.clientX + "px"
      menu.style.top = event.clientY + "px"
    }
  })
}

// Reordena a lista mantendo conversas fixadas no topo (partição estável).
const reordenarChats = () => {
  const fixados = allChats.value.filter(c => c.pinned)
  const resto = allChats.value.filter(c => !c.pinned)

  allChats.value = [...fixados, ...resto]
}

// Fixar/desafixar conversa (somente no sistema).
const toggleFixar = async chat => {
  viewMenuContato.value = false
  if (!chat?.id) return
  const novo = !chat.pinned

  chat.pinned = novo // otimista
  reordenarChats()
  try {
    await $api(`/zap/pin/${chat.id}`, { method: "PUT", body: { pinned: novo } })
  } catch {
    chat.pinned = !novo // reverte
    reordenarChats()
    setAlert("Não foi possível fixar a conversa.", "error")
  }
}

// ---- Apagar conversa (somente no sistema) ----
const viewApagarContato = ref(false)
const contatoApagar = ref(null)
const loadingApagarContato = ref(false)

const abrirApagarContato = chat => {
  viewMenuContato.value = false
  contatoApagar.value = chat
  viewApagarContato.value = true
}

const confirmarApagarContato = async () => {
  const chat = contatoApagar.value
  if (!chat?.id) {
    viewApagarContato.value = false

    return
  }
  loadingApagarContato.value = true
  try {
    await $api(`/zap/conversation/${chat.id}`, { method: "DELETE" })
    removerConversaLocal(chat.id)
    viewApagarContato.value = false
    setAlert(
      "Conversa apagada (somente no sistema).",
      "success",
      "tabler-trash",
      3000,
    )
  } catch {
    setAlert("Não foi possível apagar a conversa.", "error")
  } finally {
    loadingApagarContato.value = false
  }
}

// Remove a conversa da lista localmente (também usado pelo socket conversa-apagada).
const removerConversaLocal = chatId => {
  const idx = allChats.value.findIndex(c => c.id == chatId)
  if (idx >= 0) allChats.value.splice(idx, 1)
  if (selectedChat.value?.id == chatId) {
    selectedChat.value = null
    showChatPanel.value = false
  }
}

// ---- Renomear contato (usa endpoint existente PUT /zap/contact-name/:id) ----
const viewRenomear = ref(false)
const contatoRenomear = ref(null)
const nomeRenomear = ref("")
const loadingRenomear = ref(false)

const abrirRenomear = chat => {
  viewMenuContato.value = false
  contatoRenomear.value = chat
  nomeRenomear.value =
    chat?.contato?.nomeCustom || chat?.contato?.nomePerfil || ""
  viewRenomear.value = true
}

const confirmarRenomear = async () => {
  const chat = contatoRenomear.value
  if (!chat?.id) {
    viewRenomear.value = false

    return
  }
  loadingRenomear.value = true
  try {
    const nome = (nomeRenomear.value || "").trim()

    await $api(`/zap/contact-name/${chat.id}`, {
      method: "PUT",
      body: { name: nome },
    })

    // Atualiza estado local (lista + cabeçalho se for a conversa aberta)
    const exibicao =
      nome || chat.contato?.nomePerfil || chat.contato?.numero || "Contato"

    chat.nome = exibicao
    if (chat.contato) {
      chat.contato.nome = exibicao
      chat.contato.nomeCustom = nome || null
    }
    if (selectedChat.value?.id == chat.id) {
      selectedChat.value.nome = exibicao
      if (selectedChat.value.contato) {
        selectedChat.value.contato.nome = exibicao
        selectedChat.value.contato.nomeCustom = nome || null
      }
    }
    viewRenomear.value = false
    setAlert("Contato renomeado.", "success", "tabler-edit", 2500)
  } catch {
    setAlert("Não foi possível renomear o contato.", "error")
  } finally {
    loadingRenomear.value = false
  }
}

// Reações rápidas disponíveis no menu da mensagem.
const reacoesRapidas = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

/**
 * Envia (ou remove, por toggle) uma reação a uma mensagem via Cloud API.
 * Atualiza otimisticamente o bubble e reverte em caso de erro.
 * @param {Object} msg - mensagem alvo (item de selectedChat.messagens)
 * @param {string} emoji
 */
const enviarReacao = async (msg, emoji) => {
  viewMenuMsg.value = false
  if (!msg || !msg.wamid || !selectedChat.value?.id) return

  // Toggle: clicar no emoji já aplicado remove a reação.
  const novoEmoji = msg.reaction === emoji ? "" : emoji
  const anterior = msg.reaction || null

  msg.reaction = novoEmoji || null // otimista

  try {
    await $api("/zap/send-reaction", {
      method: "POST",
      body: {
        conversationId: selectedChat.value.id,
        messageWamid: msg.wamid,
        emoji: novoEmoji,
      },
    })
  } catch (e) {
    msg.reaction = anterior // reverte
    setAlert("Não foi possível enviar a reação.", "error")
  }
}

const viewReply = ref(false)
const msgReply = ref(null)

const openReply = msg => {
  if (!msg) return

  const index = selectedChat.value.messagens.findIndex(c => c.id == msg.id)

  if (index < 0) return

  msgReply.value = msg
  viewReply.value = true
}

const goToResposta = id => {
  if (!id) return

  const index = selectedChat.value.messagens.findIndex(c => c.id == id)

  if (index < 0) return

  const msg = selectedChat.value.messagens[index]

  setTimeout(() => {
    const el = document.querySelector(`[data-id-msg="${msg.id}"]`)
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" })
    }
  }, 500)
}

const loadingMoreMsgs = ref(false)

const getMoreMsgs = async () => {
  if (!selectedChat.value || !selectedChat.value.id) return

  loadingMoreMsgs.value = true

  try {
    // Cursor = mensagem mais ANTIGA já carregada (topo da lista). A paginação por
    // cursor é imune a inserções em tempo real (que mudariam a contagem e causariam
    // saltos/lacunas numa paginação por página). Pula separadores de data.
    const lista = selectedChat.value.messagens || []
    const maisAntiga = lista.find(m => m && m.tipo !== "data" && m.id != null)
    if (!maisAntiga) {
      loadingMoreMsgs.value = false

      return
    }

    const beforeTs =
      maisAntiga.timestamp_ms != null
        ? Number(maisAntiga.timestamp_ms)
        : getMoment(maisAntiga.data).valueOf()

    // Preserva a posição de scroll ao prepender (evita "pulo" da viewport).
    const chatBox = document.querySelector(".mensagem-box")
    const alturaAntes = chatBox ? chatBox.scrollHeight : 0

    const res = await $api("/zap/getChat/" + selectedChat.value.id, {
      method: "GET",
      query: {
        limit: 50,
        beforeId: maisAntiga.id,
        beforeTs,
      },
    })

    if (!res) return

    const novas = (res.messages || []).map(mapMsgFront)
    if (novas.length > 0) {
      // Prepend evitando duplicatas (usa Set já mantido)
      const semDup = novas.filter(m => !_msgIds.has(m.id))
      for (const m of semDup) {
        if (m.id != null) _msgIds.add(m.id)
        if (m.wamid) _msgWamids.add(m.wamid)
      }

      // Histórico (mais antigas) vai ANTES do que já está na tela. Ordena com
      // desempate por timestamp_ms/id para manter estabilidade no mesmo segundo.
      const merged = semDup.concat(selectedChat.value.messagens)
      const chave = m =>
        m.timestamp_ms != null
          ? Number(m.timestamp_ms)
          : getMoment(m.data).valueOf()

      merged.sort((a, b) => chave(a) - chave(b) || (a.id || 0) - (b.id || 0))
      selectedChat.value.messagens = merged

      // Mantém a viewport ancorada na mesma mensagem após o prepend.
      nextTick(() => {
        const box = document.querySelector(".mensagem-box")
        if (box) box.scrollTop = box.scrollHeight - alturaAntes
      })
    }
  } catch (error) {
    console.error("Error fetching more msgs:", error, error.response)
  }

  loadingMoreMsgs.value = false
}

const handleScrollMsgs = event => {
  if (!event || !event.target || loadingMoreMsgs.value) return

  const scrollTop = event.target.scrollTop
  const scrollHeight = event.target.scrollHeight
  const clientHeight = event.target.clientHeight

  if (scrollTop + clientHeight >= scrollHeight - 5) {
    console.log("rolou fim")
  } else if (scrollTop <= 0) {
    console.log("rolou inicio")
    getMoreMsgs()
  }
}

const viewDadosCliente = ref(false)
const loadingFinalizarAtendimento = ref(false)
const loadingIniciarAtendimento = ref(false)
const loadingToggleFlows = ref(false)

// Estado do atendimento: 'waiting' (aguardando) | 'in_attendance' (em atendimento) | null
const agentStatus = computed(() => {
  return selectedChat.value?.waitingForAgent?.agent_status || null
})

const iniciarAtendimento = async () => {
  if (!selectedChat.value) return

  loadingIniciarAtendimento.value = true

  try {
    let res
    const existingRunId = selectedChat.value?.waitingForAgent?.runId

    if (existingRunId) {
      // Fluxo padrao: ja ha run em espera
      res = await $api(`/flows/run/${existingRunId}/start-attendance`, {
        method: "POST",
      })
    } else {
      // Marcacao manual: cria run virtual
      const chatId = selectedChat.value?.id || null

      const phone =
        selectedChat.value?.contato?.numero ||
        selectedChat.value?.cliente?.cli_celular ||
        (chatId ? chatId.replace("@c.us", "").replace("@lid", "") : null)

      res = await $api(`/flows/attendance/start`, {
        method: "POST",
        body: {
          chatId,
          phone,
          clienteId: selectedChat.value?.cliente?.cli_Id || null,
        },
      })
    }

    if (res && res.ok) {
      setAlert("Atendimento iniciado!", "success", "tabler-headset", 3000)

      // Atualizar status local
      selectedChat.value.waitingForAgent = {
        ...(selectedChat.value.waitingForAgent || {}),
        runId: res.runId ?? selectedChat.value?.waitingForAgent?.runId ?? null,
        agent_status: "in_attendance",
        agent_user_id: res.agent_user_id,
        agent_started_at: res.agent_started_at,
      }

      // Atualizar na lista de chats
      const chatIndex = allChats.value.findIndex(
        c => c.id === selectedChat.value.id,
      )

      if (chatIndex >= 0) {
        allChats.value[chatIndex].waitingForAgent = {
          ...(allChats.value[chatIndex].waitingForAgent || {}),
          runId:
            res.runId ??
            allChats.value[chatIndex].waitingForAgent?.runId ??
            null,
          agent_status: "in_attendance",
          agent_user_id: res.agent_user_id,
          agent_started_at: res.agent_started_at,
        }
      }
    }
  } catch (error) {
    console.error("Error iniciando atendimento:", error)
    setAlert(
      error?.response?._data?.message || "Erro ao iniciar atendimento",
      "error",
      "tabler-alert-triangle",
      5000,
    )
  } finally {
    loadingIniciarAtendimento.value = false
  }
}

const finalizarAtendimento = async () => {
  if (!selectedChat.value?.waitingForAgent?.runId) {
    setAlert("Erro ao finalizar atendimento", "error")

    return
  }

  loadingFinalizarAtendimento.value = true

  try {
    const res = await $api(
      `/flows/run/${selectedChat.value.waitingForAgent.runId}/release-agent-block`,
      {
        method: "POST",
      },
    )

    if (res && res.ok) {
      setAlert(
        "Atendimento finalizado com sucesso!",
        "success",
        "tabler-check",
        3000,
      )

      // Atualizar o chat para remover o badge
      selectedChat.value.waitingForAgent = null

      // Atualizar na lista de chats também
      const chatIndex = allChats.value.findIndex(
        c => c.id === selectedChat.value.id,
      )

      if (chatIndex >= 0) {
        allChats.value[chatIndex].waitingForAgent = null
      }
    }
  } catch (error) {
    console.error("Error finalizando atendimento:", error)
    setAlert(
      error?.response?._data?.message || "Erro ao finalizar atendimento",
      "error",
      "tabler-alert-triangle",
      5000,
    )
  } finally {
    loadingFinalizarAtendimento.value = false
  }
}

// Verifica se os fluxos estão bloqueados (cliente cadastrado OU contato sem cadastro)
const isFlowsBlocked = computed(() => {
  if (selectedChat.value?.cliente?.flows_blocked) return true
  if (selectedChat.value?.phoneFlowsBlocked) return true

  return false
})

const toggleFlowsBlock = async () => {
  const hasCliente = !!selectedChat.value?.cliente?.id
  const newStatus = !isFlowsBlocked.value
  const action = newStatus ? "bloquear" : "desbloquear"

  if (
    !confirm(`Tem certeza que deseja ${action} os fluxos para este contato?`)
  ) {
    return
  }

  loadingToggleFlows.value = true

  try {
    if (hasCliente) {
      // Cliente cadastrado: usar rota de cliente
      await $api(`/clientes/block-flows/${selectedChat.value.cliente.cli_Id}`, {
        method: "PUT",
        body: { blocked: newStatus },
      })

      // Atualizar estado local
      selectedChat.value.cliente.flows_blocked = newStatus ? 1 : 0

      const chatIndex = allChats.value.findIndex(
        c => c.id === selectedChat.value.id,
      )

      if (chatIndex >= 0 && allChats.value[chatIndex].cliente) {
        allChats.value[chatIndex].cliente.flows_blocked = newStatus ? 1 : 0
      }
    } else {
      // Contato sem cadastro: usar rota de bloqueio por telefone
      const phone =
        selectedChat.value?.contato?.numero ||
        selectedChat.value?.id?.replace("@c.us", "").replace("@lid", "") ||
        ""

      await $api(`/flows/block-phone`, {
        method: "PUT",
        body: {
          phone: phone,
          chatId: selectedChat.value?.id || null,
          blocked: newStatus,
        },
      })

      // Atualizar estado local
      selectedChat.value.phoneFlowsBlocked = newStatus

      const chatIndex = allChats.value.findIndex(
        c => c.id === selectedChat.value.id,
      )

      if (chatIndex >= 0) {
        allChats.value[chatIndex].phoneFlowsBlocked = newStatus
      }
    }

    setAlert(
      `Fluxos ${newStatus ? "bloqueados" : "desbloqueados"} com sucesso!`,
      "success",
      "tabler-check",
      3000,
    )
  } catch (error) {
    console.error("Error toggling flows block:", error)
    setAlert(
      error?.response?._data?.message || "Erro ao atualizar bloqueio de fluxos",
      "error",
      "tabler-alert-triangle",
      5000,
    )
  } finally {
    loadingToggleFlows.value = false
  }
}

// Cleanup dos listeners de socket ao desmontar o componente
onBeforeUnmount(() => {
  socket.off("nova-mensagem")
  socket.off("update-mensagem")
  socket.off("chat:state-update")
  socket.off("conversa-apagada")
})
</script>

<template>
  <div>
    <ImageLightbox
      v-model="lightboxOpen"
      :src="lightboxSrc"
    />

    <MetaTemplateDialog
      v-model="templateDialog"
      :conversation-id="selectedChat?.id"
      @sent="onTemplateEnviado"
    />

    <MetaTemplateDialog
      v-model="novaConversaDialog"
      :new-conversation="true"
      :initial-phone="novaConversaPhone"
      @started="onConversaIniciada"
    />

    <!-- Dialog: Encaminhar mensagem -->
    <VDialog
      v-model="viewEncaminhar"
      max-width="460"
      scrollable
    >
      <VCard>
        <VCardText>
          <AppDrawerHeaderSection
            title="Encaminhar mensagem"
            @cancel="viewEncaminhar = false"
          />
          <VTextField
            v-model="buscaEncaminhar"
            class="mt-3"
            density="compact"
            placeholder="Buscar contato..."
            prepend-inner-icon="tabler-search"
            clearable
            hide-details
          />

          <VList
            class="mt-2"
            max-height="280"
            style="overflow-y: auto"
          >
            <VListItem
              v-for="c in conversasEncaminhar"
              :key="c.id"
              :disabled="loadingEncaminhar"
              @click="encaminharPara({ conversationId: c.id })"
            >
              <template #prepend>
                <VAvatar
                  size="34"
                  color="primary"
                  variant="tonal"
                >
                  <VImg
                    v-if="c.contato?.avatar"
                    :src="c.contato.avatar"
                  />
                  <VIcon
                    v-else
                    icon="tabler-user-filled"
                    size="18"
                  />
                </VAvatar>
              </template>
              <VListItemTitle>{{ c.nome }}</VListItemTitle>
              <VListItemSubtitle>{{ c.contato?.numero }}</VListItemSubtitle>
            </VListItem>
            <VListItem v-if="!conversasEncaminhar.length">
              <VListItemTitle class="text-disabled">
                Nenhuma conversa encontrada.
              </VListItemTitle>
            </VListItem>
          </VList>

          <VDivider class="my-3" />
          <p class="text-caption mb-1">
            Ou encaminhar para um número novo:
          </p>
          <div class="d-flex flex-row gap-2 align-center">
            <VTextField
              v-model="telefoneEncaminhar"
              density="compact"
              placeholder="DDD + número (ex: 41999998888)"
              hide-details
            />
            <VBtn
              :loading="loadingEncaminhar"
              :disabled="!telefoneEncaminhar"
              @click="encaminharPara({ phone: telefoneEncaminhar })"
            >
              Enviar
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VDialog>

    <!-- Dialog: Apagar mensagem (somente no sistema) -->
    <VDialog
      v-model="viewApagarMsg"
      max-width="420"
    >
      <VCard>
        <VCardText>
          <AppDrawerHeaderSection
            title="Apagar mensagem"
            @cancel="viewApagarMsg = false"
          />
          <VAlert
            type="info"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            A API oficial do WhatsApp não permite apagar a mensagem no aparelho
            do contato. Ela será removida <strong>apenas do sistema</strong>.
          </VAlert>
          <p class="mt-3 mb-0">
            Deseja realmente apagar esta mensagem?
          </p>
          <div class="d-flex flex-row align-center justify-end gap-2 mt-4">
            <VBtn
              variant="tonal"
              color="secondary"
              @click="viewApagarMsg = false"
            >
              Cancelar
            </VBtn>
            <VBtn
              color="error"
              :loading="loadingApagarMsg"
              @click="confirmarApagarMsg"
            >
              Apagar
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VDialog>

    <!-- Dialog: Apagar conversa (somente no sistema) -->
    <VDialog
      v-model="viewApagarContato"
      max-width="420"
    >
      <VCard>
        <VCardText>
          <AppDrawerHeaderSection
            title="Apagar conversa"
            @cancel="viewApagarContato = false"
          />
          <VAlert
            type="info"
            variant="tonal"
            density="compact"
            class="mt-3"
          >
            A conversa será removida <strong>apenas do sistema</strong>. O
            contato no WhatsApp não é afetado e novas mensagens reabrem a
            conversa.
          </VAlert>
          <p class="mt-3 mb-0">
            Apagar a conversa com
            <strong>{{ contatoApagar?.nome }}</strong>?
          </p>
          <div class="d-flex flex-row align-center justify-end gap-2 mt-4">
            <VBtn
              variant="tonal"
              color="secondary"
              @click="viewApagarContato = false"
            >
              Cancelar
            </VBtn>
            <VBtn
              color="error"
              :loading="loadingApagarContato"
              @click="confirmarApagarContato"
            >
              Apagar
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VDialog>

    <!-- Dialog: Renomear contato -->
    <VDialog
      v-model="viewRenomear"
      max-width="420"
    >
      <VCard>
        <VCardText>
          <AppDrawerHeaderSection
            title="Renomear contato"
            @cancel="viewRenomear = false"
          />
          <VTextField
            v-model="nomeRenomear"
            class="mt-3"
            label="Nome do contato"
            placeholder="Digite o nome"
            hide-details
            @keyup.enter="confirmarRenomear"
          />
          <p class="text-caption text-disabled mt-1 mb-0">
            Deixe vazio para voltar ao nome do perfil do WhatsApp.
          </p>
          <div class="d-flex flex-row align-center justify-end gap-2 mt-4">
            <VBtn
              variant="tonal"
              color="secondary"
              @click="viewRenomear = false"
            >
              Cancelar
            </VBtn>
            <VBtn
              color="primary"
              :loading="loadingRenomear"
              @click="confirmarRenomear"
            >
              Salvar
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VDialog>

    <div class="menu-msg position-absolute">
      <VMenu
        v-model="viewMenuMsg"
        location="top"
        contained
      >
        <VList>
          <!-- Reações rápidas (toggle) -->
          <div
            v-if="msgMenu?.wamid"
            class="reaction-bar d-flex flex-row align-center px-2 py-1"
          >
            <span
              v-for="emo in reacoesRapidas"
              :key="emo"
              class="reaction-emoji"
              :class="{ 'reaction-emoji--ativa': msgMenu?.reaction === emo }"
              @click="enviarReacao(msgMenu, emo)"
            >{{ emo }}</span>
          </div>
          <VDivider
            v-if="msgMenu?.wamid"
            class="my-1"
          />

          <VListItem
            v-for="action in actionsMsg(msgMenu)"
            :key="action.title"
            class="item-action"
            @click="onActionMsg(action.action, msgMenu)"
          >
            <p
              class="mb-0"
              :class="{ 'text-error': action.action === 'delete' }"
            >
              <VIcon
                :icon="action.icon"
                class="mr-2"
              />
              {{ action.title }}
            </p>
          </VListItem>
        </VList>
      </VMenu>
    </div>

    <!-- Menu de contexto do CONTATO (clique direito na lista) -->
    <div class="menu-contato position-absolute">
      <VMenu
        v-model="viewMenuContato"
        location="top"
        contained
      >
        <VList>
          <VListItem
            class="item-action"
            @click="toggleFixar(contatoMenu)"
          >
            <p class="mb-0">
              <VIcon
                :icon="contatoMenu?.pinned ? 'tabler-pinned-off' : 'tabler-pin'"
                class="mr-2"
              />
              {{ contatoMenu?.pinned ? "Desafixar" : "Fixar" }}
            </p>
          </VListItem>
          <VListItem
            class="item-action"
            @click="abrirRenomear(contatoMenu)"
          >
            <p class="mb-0">
              <VIcon
                icon="tabler-edit"
                class="mr-2"
              />
              Renomear contato
            </p>
          </VListItem>
          <VDivider class="my-1" />
          <VListItem
            class="item-action"
            @click="abrirApagarContato(contatoMenu)"
          >
            <p class="mb-0 text-error">
              <VIcon
                icon="tabler-trash"
                class="mr-2"
              />
              Apagar conversa
            </p>
          </VListItem>
        </VList>
      </VMenu>
    </div>

    <div
      class="chat-shell"
      :class="{ 'is-mobile': mobile, 'show-chat': showChatPanel }"
    >
      <div class="chat-pane chat-list-pane">
        <VCard
          v-if="viewDadosCliente && selectedChat"
          rounded="0"
          class="h-100 dados-cliente-card"
        >
          <DadosCliente
            :dados="selectedChat"
            @close="viewDadosCliente = false"
            @rename="onContatoRenomeado"
          />
        </VCard>
        <VCard
          v-else
          rounded="0"
          class="h-100 d-flex flex-column chat-list-card"
        >
          <div class="header-messages pa-3">
            <h2 class="text-h5">
              Chat
            </h2>

            <div class="d-flex align-center gap-2 mt-4">
              <VTextField
                v-model="searchQuery"
                label="Pesquisar"
                placeholder="Pesquise uma conversa pelo nome ou número do contato"
                prepend-inner-icon="tabler-search"
                clearable
                :loading="loading"
                @update:model-value="getAllChats"
              />
              <IconBtn
                color="primary"
                variant="tonal"
                @click="novaConversaDialog = true"
              >
                <VIcon icon="tabler-message-plus" />
                <VTooltip
                  text="Iniciar nova conversa por telefone (envia template)"
                  activator="parent"
                />
              </IconBtn>
            </div>
          </div>

          <div
            v-if="loading"
            class="text-center py-3 px-2"
          >
            <VProgressLinear
              indeterminate
              color="primary"
              :height="5"
            />
          </div>

          <div
            v-else
            class="chats"
            @scroll="handleScrollChats"
          >
            <template
              v-for="(chat, index) in allChats"
              :key="index"
            >
              <div
                class="chat-item"
                :class="{
                  'chat-selected': selectedChat?.id == chat.id,
                  'chat-naoLido': chat.naoLida > 0 || chat.naoLida < 0,
                }"
                @click="selecionarChat(chat)"
                @contextmenu.prevent="handleMenuContato($event, chat)"
              >
                <VAvatar
                  :color="chat.contato?.avatar ? undefined : 'primary'"
                  :variant="chat.contato?.avatar ? undefined : 'tonal'"
                  :size="45"
                >
                  <VImg
                    v-if="chat.contato?.avatar"
                    :src="chat.contato?.avatar"
                  />
                  <VIcon
                    v-else
                    icon="tabler-user-filled"
                  />
                </VAvatar>
                <VIcon
                  v-if="chat.pinned"
                  icon="tabler-pin-filled"
                  size="14"
                  class="chat-pin-icon"
                />
                <div class="chat-item-body">
                  <div class="d-flex align-center gap-1">
                    <p class="chat-name">
                      {{ chat.nome }}
                    </p>
                    <VChip
                      v-if="
                        chat.waitingForAgent &&
                          chat.waitingForAgent.agent_status === 'in_attendance'
                      "
                      color="info"
                      size="x-small"
                      label
                      class="ml-1"
                    >
                      Em atendimento
                    </VChip>
                    <VChip
                      v-else-if="chat.waitingForAgent"
                      color="warning"
                      size="x-small"
                      label
                      class="ml-1"
                    >
                      Aguardando
                    </VChip>
                    <VChip
                      v-else-if="
                        chat.cliente?.flows_blocked || chat.phoneFlowsBlocked
                      "
                      color="error"
                      size="x-small"
                      label
                      class="ml-1"
                    >
                      Bloqueado
                    </VChip>
                    <p class="ml-auto mb-0 text-disabled text-caption">
                      {{ chat.ultimaAcao ? handleData(chat.ultimaAcao) : "" }}
                    </p>
                  </div>
                  <div class="d-flex align-center justify-space-between gap-2">
                    <div
                      class="chat-last-message"
                      v-html="formatShortMsg(chat.ultimaMensagem ?? '--')"
                    />
                    <VChip
                      v-if="chat.janela && !chat.janela.windowOpen"
                      color="warning"
                      size="x-small"
                      variant="tonal"
                      label
                    >
                      <VIcon
                        icon="tabler-clock-off"
                        size="11"
                        class="mr-1"
                      />
                      Fechada
                    </VChip>
                    <VChip
                      v-else-if="
                        chat.janela && chat.janela.hoursRemaining !== null
                      "
                      color="success"
                      size="x-small"
                      variant="tonal"
                      label
                    >
                      <VIcon
                        icon="tabler-clock"
                        size="11"
                        class="mr-1"
                      />
                      {{ chat.janela.hoursRemaining }}h
                    </VChip>
                  </div>
                </div>
                <div
                  v-if="chat.naoLida > 0 || chat.naoLida < 0"
                  class="bg-error rounded-circle circle-naoLida"
                >
                  {{ chat.naoLida < 0 ? " " : chat.naoLida }}
                </div>
              </div>

              <VProgressLinear
                v-if="chat.loadingChat"
                indeterminate
                color="primary"
                :height="2"
                style="flex-basis: 100%"
              />
            </template>

            <div
              v-if="loadingMoreChats"
              class="w-100 d-flex justify-center align-center"
              style="position: absolute; bottom: 10px; background-color: white"
            >
              <VProgressCircular
                indeterminate
                color="secondary"
                :size="20"
                :width="2"
              />
            </div>
          </div>
        </VCard>
      </div>

      <div
        v-if="selectedChat"
        class="chat-pane chat-conv-pane"
      >
        <div
          class="mensagem-box"
          @scroll="handleScrollMsgs"
        >
          <div
            v-if="selectedChat?.loadingChat"
            class="carregando"
          >
            <VProgressCircular
              indeterminate
              :size="44"
              :width="5"
            />
          </div>
          <div class="contact-header">
            <IconBtn
              variant="text"
              size="small"
              class="back-btn"
              @click="
                mobile
                  ? voltarParaLista()
                  : ((selectedChat = null), (viewDadosCliente = false))
              "
            >
              <VIcon icon="tabler-chevron-left" />
            </IconBtn>

            <div
              class="contact-box"
              :class="{ 'cursor-pointer': selectedChat }"
              @click="abrirDadosCliente"
            >
              <VAvatar
                :color="selectedChat?.contato?.avatar ? undefined : 'primary'"
                :variant="selectedChat?.contato?.avatar ? undefined : 'tonal'"
                size="40"
                class="contact-avatar"
              >
                <VImg
                  v-if="selectedChat?.contato?.avatar"
                  :src="selectedChat?.contato?.avatar"
                />
                <VIcon
                  v-else
                  icon="tabler-user-filled"
                />
              </VAvatar>
              <div class="contact-info">
                <div class="d-flex align-center gap-2 flex-wrap">
                  <p class="mb-0 contact-name">
                    {{
                      selectedChat?.contato?.nome ||
                        selectedChat?.nome ||
                        "Cliente"
                    }}
                  </p>
                  <VChip
                    v-if="!janela.windowOpen"
                    color="warning"
                    size="x-small"
                    variant="tonal"
                    label
                  >
                    <VIcon
                      icon="tabler-clock-off"
                      size="12"
                      class="mr-1"
                    />
                    Janela fechada
                  </VChip>
                  <VChip
                    v-else-if="janela.hoursRemaining !== null"
                    color="success"
                    size="x-small"
                    variant="tonal"
                    label
                  >
                    <VIcon
                      icon="tabler-clock"
                      size="12"
                      class="mr-1"
                    />
                    {{
                      smAndDown
                        ? `${janela.hoursRemaining}h`
                        : `Janela: ${janela.hoursRemaining}h`
                    }}
                  </VChip>
                </div>
                <p class="mb-0 online-msg">
                  {{
                    selectedChat && !selectedChat?.loadingChat
                      ? selectedChat?.cliente
                        ? "Clique para ver os dados do cliente"
                        : "Nenhum dado de cliente encontrado"
                      : ""
                  }}
                </p>
              </div>
            </div>

            <!-- Ações inline em desktop -->
            <div class="ml-auto contact-actions d-none d-md-flex gap-2">
              <VChip
                v-if="agentStatus === 'in_attendance'"
                color="info"
                size="small"
                label
                class="action-chip"
              >
                <VIcon
                  icon="tabler-headset"
                  class="mr-1"
                />
                Em atendimento
              </VChip>

              <VBtn
                v-else
                color="primary"
                size="small"
                variant="flat"
                :loading="loadingIniciarAtendimento"
                rounded="lg"
                class="action-btn"
                @click="iniciarAtendimento"
              >
                <VIcon
                  icon="tabler-headset"
                  class="mr-1"
                />
                Iniciar

                <VTooltip
                  :text="
                    selectedChat?.waitingForAgent
                      ? 'Iniciar atendimento'
                      : 'Marcar como em atendimento'
                  "
                  activator="parent"
                />
              </VBtn>

              <VBtn
                v-if="selectedChat?.waitingForAgent"
                color="success"
                size="small"
                variant="tonal"
                :loading="loadingFinalizarAtendimento"
                rounded="lg"
                class="action-btn"
                @click="finalizarAtendimento"
              >
                <VIcon
                  icon="tabler-check"
                  class="mr-1"
                />
                Finalizar

                <VTooltip
                  text="Finalizar atendimento"
                  activator="parent"
                />
              </VBtn>

              <VBtn
                :color="isFlowsBlocked ? 'error' : 'default'"
                size="small"
                variant="tonal"
                :loading="loadingToggleFlows"
                rounded="lg"
                class="action-btn"
                @click="toggleFlowsBlock"
              >
                <VIcon
                  :icon="isFlowsBlocked ? 'tabler-lock' : 'tabler-lock-open'"
                  class="mr-1"
                />
                {{ isFlowsBlocked ? "Desbloquear" : "Bloquear" }}

                <VTooltip
                  :text="
                    isFlowsBlocked ? 'Desbloquear fluxos' : 'Bloquear fluxos'
                  "
                  activator="parent"
                />
              </VBtn>
            </div>

            <!-- Menu compacto em mobile -->
            <div class="ml-auto d-flex d-md-none align-center gap-1">
              <VChip
                v-if="agentStatus === 'in_attendance'"
                color="info"
                size="x-small"
                label
              >
                <VIcon
                  icon="tabler-headset"
                  size="12"
                />
              </VChip>
              <IconBtn
                variant="text"
                size="small"
              >
                <VIcon icon="tabler-dots-vertical" />
                <VMenu
                  activator="parent"
                  location="bottom end"
                >
                  <VList
                    density="compact"
                    min-width="220"
                  >
                    <VListItem
                      v-if="agentStatus !== 'in_attendance'"
                      :disabled="loadingIniciarAtendimento"
                      @click="iniciarAtendimento"
                    >
                      <template #prepend>
                        <VIcon
                          icon="tabler-headset"
                          size="18"
                        />
                      </template>
                      <VListItemTitle>Iniciar atendimento</VListItemTitle>
                    </VListItem>
                    <VListItem
                      v-if="selectedChat?.waitingForAgent"
                      :disabled="loadingFinalizarAtendimento"
                      @click="finalizarAtendimento"
                    >
                      <template #prepend>
                        <VIcon
                          icon="tabler-check"
                          size="18"
                          color="success"
                        />
                      </template>
                      <VListItemTitle>Finalizar atendimento</VListItemTitle>
                    </VListItem>
                    <VListItem
                      :disabled="loadingToggleFlows"
                      @click="toggleFlowsBlock"
                    >
                      <template #prepend>
                        <VIcon
                          :icon="
                            isFlowsBlocked ? 'tabler-lock' : 'tabler-lock-open'
                          "
                          size="18"
                          :color="isFlowsBlocked ? 'error' : undefined"
                        />
                      </template>
                      <VListItemTitle>
                        {{
                          isFlowsBlocked
                            ? "Desbloquear fluxos"
                            : "Bloquear fluxos"
                        }}
                      </VListItemTitle>
                    </VListItem>
                    <VListItem
                      v-if="selectedChat"
                      @click="abrirDadosCliente"
                    >
                      <template #prepend>
                        <VIcon
                          icon="tabler-id-badge-2"
                          size="18"
                        />
                      </template>
                      <VListItemTitle>Ver dados do contato</VListItemTitle>
                    </VListItem>
                  </VList>
                </VMenu>
              </IconBtn>
            </div>
          </div>

          <div class="messages-list mt-3">
            <div
              v-if="loadingMoreMsgs"
              class="w-100 d-flex justify-center align-center load-more-msgs"
            >
              <VProgressCircular
                indeterminate
                color="secondary"
                :size="20"
                :width="2"
              />
            </div>

            <TransitionGroup
              name="msg"
              tag="div"
              class="messages-stream"
            >
              <template
                v-for="(msg, index) in mensagensComData"
                :key="
                  msg.tipo === 'data'
                    ? `sep-${msg._sep}`
                    : msg.id ?? msg.wamid ?? `idx-${index}`
                "
              >
                <div
                  v-if="
                    msg.tipo != 'data' &&
                      (msg.texto ||
                        msg.media?.url ||
                        msg.resposta ||
                        msg.contacts?.length ||
                        msg.location ||
                        msg.tipo == 'location' ||
                        msg.tipo == 'call' ||
                        msg.tipo == 'call_log' ||
                        msg.tipo == 'ciphertext')
                  "
                  class="message-item position-relative d-flex flex-column gap-2 align-start mb-4"
                  :data-id-msg="msg.id"
                  :style="
                    !msg.media?.mime?.includes('image')
                      ? ''
                      : 'padding-bottom: 20px'
                  "
                  :class="{
                    'message-cliente': !msg.fromMe,
                    'message-sistema': msg.fromMe,
                  }"
                  @contextmenu.prevent="handleMenuMsg($event, msg)"
                >
                  <!-- Origem da mensagem: anúncio Click-to-WhatsApp / publicação -->
                  <component
                    :is="msg.referral.source_url ? 'a' : 'div'"
                    v-if="msg.referral"
                    class="referral-card"
                    :class="{ 'cursor-pointer': msg.referral.source_url }"
                    :href="msg.referral.source_url || undefined"
                    :target="msg.referral.source_url ? '_blank' : undefined"
                    rel="noopener noreferrer"
                  >
                    <VImg
                      v-if="
                        msg.referral.image_url || msg.referral.thumbnail_url
                      "
                      :src="
                        msg.referral.image_url || msg.referral.thumbnail_url
                      "
                      width="46"
                      height="46"
                      cover
                      class="rounded referral-thumb"
                    />
                    <VAvatar
                      v-else
                      color="primary"
                      variant="tonal"
                      size="46"
                      class="rounded referral-thumb"
                    >
                      <VIcon
                        :icon="
                          msg.referral.media_type === 'video'
                            ? 'tabler-video'
                            : 'tabler-speakerphone'
                        "
                      />
                    </VAvatar>
                    <div class="referral-info">
                      <span class="referral-tag">
                        <VIcon
                          icon="tabler-speakerphone"
                          size="12"
                        />
                        {{
                          msg.referral.source_type === "post"
                            ? "Veio de uma publicação"
                            : "Veio de um anúncio"
                        }}
                      </span>
                      <p
                        v-if="msg.referral.headline"
                        class="referral-headline"
                      >
                        {{ msg.referral.headline }}
                      </p>
                      <p
                        v-if="msg.referral.body"
                        class="referral-body"
                      >
                        {{ msg.referral.body }}
                      </p>
                    </div>
                  </component>

                  <!-- Origem: produto do catálogo -->
                  <div
                    v-if="msg.referred_product"
                    class="referral-card"
                  >
                    <VAvatar
                      color="success"
                      variant="tonal"
                      size="46"
                      class="rounded referral-thumb"
                    >
                      <VIcon icon="tabler-package" />
                    </VAvatar>
                    <div class="referral-info">
                      <span class="referral-tag">
                        <VIcon
                          icon="tabler-package"
                          size="12"
                        />
                        Sobre um produto
                      </span>
                      <p class="referral-body">
                        {{ msg.referred_product.product_retailer_id }}
                      </p>
                    </div>
                  </div>

                  <!-- Cartão de contato compartilhado (mensagem type=contacts) -->
                  <div
                    v-if="msg.contacts?.length"
                    class="d-flex flex-column w-100 gap-2"
                  >
                    <div
                      v-for="(ct, ci) in msg.contacts"
                      :key="ci"
                      class="contact-card-wrap"
                    >
                      <div class="contact-card">
                        <VAvatar
                          color="primary"
                          variant="tonal"
                          size="46"
                          class="rounded contact-thumb"
                        >
                          <VIcon icon="tabler-user" />
                        </VAvatar>
                        <div class="contact-info">
                          <span class="contact-tag">
                            <VIcon
                              icon="tabler-address-book"
                              size="12"
                            />
                            Contato
                          </span>
                          <p class="contact-name">
                            {{ nomeContato(ct) }}
                          </p>
                          <p
                            v-for="(ph, pi) in ct.phones || []"
                            :key="pi"
                            class="contact-phone"
                          >
                            <VIcon
                              icon="tabler-phone"
                              size="11"
                            />
                            {{ ph.phone }}
                          </p>
                        </div>
                      </div>

                      <!-- Ações do contato: iniciar no sistema ou abrir no WhatsApp -->
                      <div
                        v-if="telContato(ct)"
                        class="d-flex flex-row gap-2 mt-1 contact-actions"
                      >
                        <VBtn
                          size="small"
                          variant="tonal"
                          color="primary"
                          prepend-icon="tabler-message-circle"
                          class="flex-grow-1"
                          @click.stop="iniciarConversaContato(ct)"
                        >
                          Iniciar conversa
                        </VBtn>
                        <VBtn
                          size="small"
                          variant="tonal"
                          color="success"
                          prepend-icon="tabler-brand-whatsapp"
                          class="flex-grow-1"
                          :href="`https://wa.me/${telContato(ct)}`"
                          target="_blank"
                          rel="noopener noreferrer"
                          @click.stop
                        >
                          WhatsApp
                        </VBtn>
                      </div>
                    </div>
                  </div>

                  <!-- Localização compartilhada (type=location) — mapa real interativo -->
                  <div
                    v-if="msg.location"
                    class="location-card"
                  >
                    <div class="location-map">
                      <iframe
                        class="location-iframe"
                        :src="mapEmbedUrl(msg.location)"
                        loading="lazy"
                        referrerpolicy="no-referrer-when-downgrade"
                        title="Mapa da localização"
                        allowfullscreen
                      />
                    </div>
                    <div class="location-info">
                      <div class="location-text">
                        <VIcon
                          icon="tabler-map-pin-filled"
                          color="error"
                          size="18"
                          class="flex-shrink-0"
                        />
                        <div class="location-labels">
                          <p class="location-title">
                            {{ msg.location.name || "Localização compartilhada" }}
                          </p>
                          <p
                            v-if="msg.location.address"
                            class="location-address"
                          >
                            {{ msg.location.address }}
                          </p>
                        </div>
                      </div>
                      <a
                        class="location-btn"
                        :href="mapsLink(msg.location)"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <VIcon
                          icon="tabler-external-link"
                          size="14"
                        />
                        Abrir
                      </a>
                    </div>
                  </div>

                  <!-- Localização sem coordenadas (mensagens antigas) -->
                  <div
                    v-else-if="msg.tipo == 'location'"
                    class="w-100 d-flex flex-row gap-2 align-center"
                  >
                    <VAvatar
                      size="40"
                      color="error"
                      variant="tonal"
                    >
                      <VIcon icon="tabler-map-pin" />
                    </VAvatar>
                    <p class="text-h6 mb-0">
                      Localização recebida
                    </p>
                  </div>

                  <div
                    v-if="msg.hasResposta"
                    class="div-resposta cursor-pointer"
                    :style="
                      msg.fromMe
                        ? 'background-color: #c6ddb4; border-color: green;'
                        : 'background-color: #dfdfdf; border-color: #b3b3b3;'
                    "
                    @click="goToResposta(msg.resposta.id)"
                  >
                    <div
                      v-if="
                        msg.resposta.tipo == 'call_log' ||
                          msg.resposta.tipo == 'call'
                      "
                      class="w-100 d-flex flex-row gap-2 align-center"
                    >
                      <VAvatar
                        size="40"
                        color="primary"
                        variant="tonal"
                      >
                        <VIcon icon="tabler-phone" />
                      </VAvatar>

                      <p class="text-h6 mb-0">
                        Ligação de voz
                      </p>
                    </div>

                    <div
                      v-if="msg.resposta.tipo == 'ciphertext'"
                      class="w-100 d-flex flex-row gap-2 align-center"
                    >
                      <VIcon
                        icon="tabler-info-circle"
                        color="primary"
                        size="20"
                      />
                      <p class="mb-0 text-disabled">
                        Essa mensagem não é suportada<br>
                        pelo WhatsApp Web. Abra no celular!
                      </p>
                    </div>

                    <div class="div-resposta-content">
                      <VImg
                        v-if="msg.resposta.media?.mime?.includes('image')"
                        :src="msg.resposta.media.url"
                        width="50"
                        height="50"
                        max-width="50"
                        max-height="50"
                        cover
                        class="rounded"
                      />
                      <!-- video -->
                      <video
                        v-if="msg.resposta.media?.mime?.includes('video')"
                        width="50"
                        height="50"
                        max-width="50"
                        max-height="50"
                        controls
                        class="rounded"
                      >
                        <source
                          :src="msg.resposta.media.url"
                          type="video/mp4"
                        >
                        Seu navegador não suporta o elemento de vídeo.
                      </video>
                      <!-- documento e outros -->
                      <div
                        v-if="
                          msg.resposta.media?.url &&
                            !msg.resposta.media?.mime?.includes('image') &&
                            !msg.resposta.media?.mime?.includes('video') &&
                            !msg.resposta.media?.mime?.includes('audio')
                        "
                      >
                        <div class="d-flex flex-row gap-2 align-center">
                          <VAvatar
                            color="primary"
                            variant="tonal"
                            size="30"
                            class="rounded"
                          >
                            <VIcon
                              :icon="resolveIconFile(msg.resposta.media.mime)"
                              size="18"
                            />
                          </VAvatar>
                          <p class="mb-0 text-h6">
                            {{
                              msg.resposta.media.filename ||
                                msg.resposta.media.url.split("/").pop()
                            }}
                          </p>
                        </div>
                      </div>
                      <!-- audio -->
                      <AudioPlayer
                        v-if="msg.resposta.media?.mime?.includes('audio')"
                        :src="msg.resposta.media.url"
                        :audio-id="msg.resposta.id"
                        :active-audio-id="activeAudio"
                        :avatar="
                          msg.resposta.fromMe
                            ? userData?.avatar
                            : selectedChat?.contato?.avatar
                        "
                        @play="handlePlay"
                      />
                      <p
                        class="mb-0 html-content"
                        style="line-height: 18px"
                        v-html="formatShortMsg(msg.resposta, false)"
                      />
                    </div>
                  </div>

                  <div
                    v-if="msg.tipo == 'call_log' || msg.tipo == 'call'"
                    class="w-100 d-flex flex-row gap-2 align-center"
                  >
                    <VAvatar
                      size="40"
                      color="primary"
                      variant="tonal"
                    >
                      <VIcon icon="tabler-phone" />
                    </VAvatar>

                    <p class="text-h6 mb-0">
                      Ligação de voz
                    </p>
                  </div>

                  <div
                    v-if="msg.tipo == 'ciphertext'"
                    class="w-100 d-flex flex-row gap-2 align-center"
                  >
                    <VIcon
                      icon="tabler-info-circle"
                      color="primary"
                      size="20"
                    />
                    <p class="mb-0 text-disabled">
                      Essa mensagem não é suportada<br>
                      pelo WhatsApp Web. Abra no celular!
                    </p>
                  </div>

                  <!-- imagens e gifs -->
                  <VImg
                    v-if="msg.media?.mime?.includes('image')"
                    :src="msg.media.url"
                    cover
                    class="rounded msg-media-image cursor-pointer"
                    @click="abrirImagem(msg.media.url)"
                  />

                  <!-- video -->
                  <video
                    v-if="msg.media?.mime?.includes('video')"
                    controls
                    class="rounded msg-media-video"
                  >
                    <source
                      :src="msg.media.url"
                      type="video/mp4"
                    >
                    Seu navegador não suporta o elemento de vídeo.
                  </video>

                  <!-- documento e outros -->

                  <VCard
                    v-if="
                      msg.media?.url &&
                        !msg.media?.mime?.includes('image') &&
                        !msg.media?.mime?.includes('video') &&
                        !msg.media?.mime?.includes('audio')
                    "
                    class="w-100"
                    @click="goToImg(msg.media.url)"
                  >
                    <VCardText class="pa-3 d-flex flex-row gap-2 align-center">
                      <VAvatar
                        color="primary"
                        variant="tonal"
                        size="30"
                        class="rounded"
                      >
                        <VIcon
                          :icon="resolveIconFile(msg.media.mime)"
                          size="18"
                        />
                      </VAvatar>

                      <p class="mb-0 text-h6">
                        {{
                          msg.media.filename || msg.media.url.split("/").pop()
                        }}
                      </p>
                    </VCardText>
                  </VCard>

                  <!-- audio -->
                  <AudioPlayer
                    v-if="msg.media?.mime?.includes('audio')"
                    :src="msg.media.url"
                    :audio-id="msg.id"
                    :active-audio-id="activeAudio"
                    :avatar="
                      msg.fromMe
                        ? userData?.avatar
                        : selectedChat?.contato?.avatar
                    "
                    @play="handlePlay"
                  />

                  <p
                    v-if="
                      !msg.contacts?.length &&
                        !(msg.tipo == 'location' && !msg.texto)
                    "
                    class="mb-0 html-content"
                    style="
                      line-height: 18px;
                      word-break: break-word;
                      overflow-wrap: anywhere;
                      white-space: normal;
                    "
                    :style="{ 'margin-right': msg.fromMe ? '15px' : '40px' }"
                    v-html="formatWhatsAppText(textoExibicaoMsg(msg)) || '...'"
                  />
                  <span
                    class="text-disabled text-caption position-absolute"
                    :style="
                      msg.media?.mime?.includes('image') &&
                        (!msg.texto || msg.texto == '')
                        ? 'color: #d9d9d9 !important; right: 15px; bottom: 8px'
                        : 'right: 10px; bottom: 5px'
                    "
                  >
                    {{
                      moment(msg.data, "DD/MM/YYYY HH:mm:ss").format("HH:mm")
                    }}

                    <VIcon
                      v-if="msg.fromMe"
                      :color="msg.ack == 3 ? 'primary' : 'grey'"
                      :icon="
                        msg.ack == 0
                          ? 'tabler-clock'
                          : msg.ack == 1
                            ? 'tabler-check'
                            : 'tabler-checks'
                      "
                    />
                  </span>

                  <!-- Reação do contato à mensagem (emoji flutuante na borda da bolha) -->
                  <span
                    v-if="msg.reaction"
                    class="msg-reaction"
                  >{{
                    msg.reaction
                  }}</span>
                </div>

                <div
                  v-else-if="msg.tipo == 'data'"
                  class="w-100 d-flex align-center justify-center"
                >
                  <div class="message-data">
                    {{ msg.data }}
                  </div>
                </div>
              </template>
            </TransitionGroup>
          </div>

          <!-- Banner janela 24h -->
          <div
            v-if="selectedChat && !janela.windowOpen"
            class="px-3 pt-2"
          >
            <VAlert
              type="warning"
              variant="tonal"
              density="compact"
              icon="tabler-clock"
              class="mb-2"
            >
              <div class="d-flex align-center justify-space-between">
                <span class="text-body-2">A janela de 24h está fechada. Você não pode enviar mensagens
                  avulsas.</span>
                <VBtn
                  size="small"
                  color="warning"
                  variant="flat"
                  class="ml-3"
                  @click="abrirTemplateDialog"
                >
                  <VIcon
                    icon="tabler-template"
                    class="mr-1"
                    size="16"
                  />
                  Enviar template
                </VBtn>
              </div>
            </VAlert>
          </div>

          <div class="message-send">
            <div
              class="send-files"
              :style="viewReply ? 'top: -135px !important;' : ''"
            >
              <div
                v-for="(file, index) in filesToSend"
                :key="index"
                class="file"
              >
                <VAvatar
                  color="primary"
                  variant="tonal"
                  size="30"
                >
                  <VIcon
                    :icon="resolveIconFile(file.type)"
                    size="18"
                  />
                </VAvatar>
                {{ file.name }}
                <VIcon
                  v-if="!loadingSendMessage"
                  icon="tabler-x"
                  class="cursor-pointer"
                  @click="filesToSend.splice(index, 1)"
                />
              </div>
            </div>

            <div
              v-if="viewReply && msgReply"
              class="msg-reply"
            >
              <div class="msg-reply-content">
                <div
                  v-if="msgReply.tipo == 'call_log' || msgReply.tipo == 'call'"
                  class="w-100 d-flex flex-row gap-2 align-center"
                >
                  <VAvatar
                    size="40"
                    color="primary"
                    variant="tonal"
                  >
                    <VIcon icon="tabler-phone" />
                  </VAvatar>

                  <p class="text-h6 mb-0">
                    Ligação de voz
                  </p>
                </div>

                <div
                  v-if="msgReply.tipo == 'ciphertext'"
                  class="w-100 d-flex flex-row gap-2 align-center"
                >
                  <VIcon
                    icon="tabler-info-circle"
                    color="primary"
                    size="20"
                  />
                  <p class="mb-0 text-disabled">
                    Essa mensagem não é suportada<br>
                    pelo WhatsApp Web. Abra no celular!
                  </p>
                </div>

                <VImg
                  v-if="msgReply.media?.mime?.includes('image')"
                  :src="msgReply.media.url"
                  width="50"
                  height="50"
                  max-width="50"
                  max-height="50"
                  cover
                  class="rounded"
                />
                <!-- video -->
                <video
                  v-if="msgReply.media?.mime?.includes('video')"
                  width="50"
                  height="50"
                  max-width="50"
                  max-height="50"
                  controls
                  class="rounded"
                >
                  <source
                    :src="msgReply.media.url"
                    type="video/mp4"
                  >
                  Seu navegador não suporta o elemento de vídeo.
                </video>
                <!-- documento e outros -->
                <VCard
                  v-if="
                    msgReply.media?.url &&
                      !msgReply.media?.mime?.includes('image') &&
                      !msgReply.media?.mime?.includes('video') &&
                      !msgReply.media?.mime?.includes('audio')
                  "
                >
                  <VCardText class="pa-3 d-flex flex-row gap-2 align-center">
                    <VAvatar
                      color="primary"
                      variant="tonal"
                      size="30"
                      class="rounded"
                    >
                      <VIcon
                        :icon="resolveIconFile(msgReply.media.mime)"
                        size="18"
                      />
                    </VAvatar>
                    <p class="mb-0 text-h6">
                      {{
                        msgReply.media.filename ||
                          msgReply.media.url.split("/").pop()
                      }}
                    </p>
                  </VCardText>
                </VCard>
                <!-- audio -->
                <AudioPlayer
                  v-if="msgReply.media?.mime?.includes('audio')"
                  :src="msgReply.media.url"
                  :audio-id="msgReply.id"
                  :active-audio-id="activeAudio"
                  :avatar="
                    msgReply.fromMe
                      ? userData?.avatar
                      : selectedChat?.contato?.avatar
                  "
                  @play="handlePlay"
                />
                <p
                  class="mb-0 html-content"
                  style="
                    line-height: 18px;
                    max-width: 700px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                  "
                  v-html="formatWhatsAppText(msgReply.texto) || '...'"
                />
              </div>

              <VIcon
                icon="tabler-x"
                class="cursor-pointer"
                @click="
                  () => {
                    viewReply = false
                    msgReply = null
                  }
                "
              />
            </div>

            <input
              ref="inputFiles"
              class="d-none"
              type="file"
              multiple
              @change="
                e => {
                  filesToSend = Array.from(e.target.files)
                }
              "
            >

            <IconBtn
              v-if="!gravando"
              :loading="loadingSendMessage"
              :disabled="!janela.windowOpen"
              @click="inputFiles.click()"
            >
              <VIcon icon="tabler-paperclip" />
            </IconBtn>

            <div
              class="composer"
              :class="{ 'composer--disabled': !janela.windowOpen }"
            >
              <QuillEditor
                ref="quillRef"
                v-model:content="messageHtml"
                theme="snow"
                content-type="html"
                :toolbar="composerToolbar"
                :enable="janela.windowOpen && !loadingSendMessage"
                :placeholder="
                  janela.windowOpen
                    ? 'Digite uma mensagem'
                    : 'Janela de 24h fechada — envie um template'
                "
                class="composer-quill"
                @ready="onQuillReady"
              />
            </div>

            <IconBtn
              v-if="!gravando"
              :loading="loadingSendMessage"
              :disabled="!janela.windowOpen"
              @click="
                ;(!message || message == '') &&
                (!filesToSend || filesToSend.length == 0)
                  ? iniciarGravacao()
                  : sendMessage()
              "
            >
              <VIcon
                :icon="
                  (!message || message == '') &&
                    (!filesToSend || filesToSend.length == 0)
                    ? 'tabler-microphone'
                    : 'tabler-send'
                "
              />
            </IconBtn>

            <div
              v-else
              class="d-flex flex-row gap-3 align-center"
            >
              <IconBtn
                :loading="loadingSendMessage"
                color="error"
                @click="pararGravacao"
              >
                <VIcon icon="tabler-player-stop" />
              </IconBtn>

              <p class="mb-0 text-caption">
                {{ formatTime(timeGravando) }}
              </p>

              <IconBtn
                :loading="loadingSendMessage"
                color="success"
                :disabled="!janela.windowOpen"
                @click="sendMessage('audio')"
              >
                <VIcon icon="tabler-send" />
              </IconBtn>
            </div>
          </div>
        </div>
      </div>

      <!-- Empty state em desktop quando nenhum chat está selecionado -->
      <div
        v-if="!selectedChat && !mobile"
        class="chat-empty-state"
      >
        <div class="chat-empty-inner">
          <div class="chat-empty-icon">
            <VIcon
              icon="tabler-messages"
              size="48"
            />
          </div>
          <h3 class="text-h6 mt-4 mb-1">
            Selecione uma conversa
          </h3>
          <p class="text-body-2 text-disabled mb-0">
            Escolha um contato à esquerda para começar
          </p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
/* =========================================================
     Layout shell — dvh para lidar com URL bar / teclado mobile.
     Desktop: split horizontal 4/8. Mobile: pilha 100% com
     transição entre lista e conversa.
     ========================================================= */
.chat-shell {
  display: grid;
  grid-template-columns: minmax(280px, 30%) 1fr;
  height: calc(100dvh - 70px);
  max-height: calc(100dvh - 70px);
  overflow: hidden;
  background-color: rgb(var(--v-theme-background));
  border-radius: 8px;
  position: relative;
}

.chat-pane {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.chat-list-pane {
  border-right: 1px solid rgba(var(--v-border-color), 0.12);
}

.chat-list-card {
  background-color: rgb(var(--v-theme-surface));
}

.chat-conv-pane {
  background-color: rgb(var(--v-theme-background));
  position: relative;
}

.chat-empty-state {
  grid-column: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.chat-empty-inner {
  text-align: center;
  opacity: 0.65;
}

.chat-empty-icon {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: linear-gradient(
    135deg,
    rgba(var(--v-theme-primary), 0.1),
    rgba(var(--v-theme-primary), 0.04)
  );
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  color: rgb(var(--v-theme-primary));
}

/* =========================================================
     Mobile: comportamento de painéis empilhados com slide
     ========================================================= */
.chat-shell.is-mobile {
  grid-template-columns: 1fr;
  border-radius: 0;
  height: calc(100dvh - 140px);
  max-height: calc(100dvh - 140px);
}

.chat-shell.is-mobile .chat-list-pane,
.chat-shell.is-mobile .chat-conv-pane {
  grid-column: 1;
  grid-row: 1;
  transition: transform 280ms cubic-bezier(0.32, 0.72, 0, 1);
  will-change: transform;
}

.chat-shell.is-mobile .chat-conv-pane {
  transform: translateX(100%);
  z-index: 2;
}

.chat-shell.is-mobile.show-chat .chat-list-pane {
  transform: translateX(-12%);
  pointer-events: none;
}

.chat-shell.is-mobile.show-chat .chat-conv-pane {
  transform: translateX(0);
}

/* =========================================================
     Sidebar — Header + lista de chats
     ========================================================= */
.header-messages {
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
  background-color: rgb(var(--v-theme-surface));
  position: sticky;
  top: 0;
  z-index: 4;
}

.chats {
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(var(--v-border-color), 0.25) transparent;
}

.chats::-webkit-scrollbar {
  width: 6px;
}
.chats::-webkit-scrollbar-thumb {
  background-color: rgba(var(--v-border-color), 0.25);
  border-radius: 4px;
}

.chat-item {
  display: flex;
  align-items: center;
  padding: 12px 14px;
  cursor: pointer;
  gap: 12px;
  position: relative;
  border-left: 2px solid transparent;
  transition: background-color 160ms ease, border-color 160ms ease;
}

.chat-item + .chat-item {
  border-top: 1px solid rgba(var(--v-border-color), 0.06);
}

.chat-item:hover {
  background-color: rgba(var(--v-theme-primary), 0.06);
}

.chat-item.chat-selected {
  background-color: rgba(var(--v-theme-primary), 0.1);
  border-left-color: rgb(var(--v-theme-primary));
}

.chat-item.chat-naoLido .chat-name {
  font-weight: 600;
}

.chat-item.chat-naoLido .chat-last-message {
  color: rgba(var(--v-theme-on-surface), 0.85);
  font-weight: 500;
}

.chat-item-body {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chat-name {
  font-weight: 500;
  margin: 0;
  min-width: 0;
  flex: 0 1 auto;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.94rem;
}

.chat-last-message {
  color: rgba(var(--v-theme-on-surface), 0.55);
  margin: 0;
  min-width: 0;
  flex: 1 1 auto;
  white-space: nowrap;
  text-overflow: ellipsis;
  overflow: hidden;
  font-size: 0.825rem;
  line-height: 1.3;
}

.circle-naoLida {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: #fff;
  position: absolute;
  right: 14px;
  top: 12px;
  border-radius: 999px;
  box-shadow: 0 2px 6px rgba(var(--v-theme-error), 0.35);
}

/* =========================================================
     Conversa — header + box + composer
     ========================================================= */
.mensagem-box {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  position: relative;
  background-color: rgb(var(--v-theme-background));
  /*background-image:
      radial-gradient(circle at 20% 0%, rgba(var(--v-theme-primary), 0.04), transparent 40%),
      radial-gradient(circle at 80% 100%, rgba(var(--v-theme-info), 0.03), transparent 40%);*/
}

.mensagem-box::-webkit-scrollbar {
  width: 6px;
}
.mensagem-box::-webkit-scrollbar-thumb {
  background-color: rgba(var(--v-border-color), 0.25);
  border-radius: 4px;
}

.contact-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background-color: rgb(var(--v-theme-surface));
  border: none;
  border-bottom: 1px solid rgba(var(--v-border-color), 0.1);
  position: sticky;
  top: 0;
  z-index: 5;
  min-height: 64px;
}

.back-btn {
  flex-shrink: 0;
}

.contact-box {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex: 0 1 auto;
  padding: 4px 6px;
  border-radius: 8px;
  transition: background-color 160ms ease;
  /* Sobrescreve regra global .contact-box { margin-left: 40px } legada */
  margin-left: 0 !important;
}

.contact-box.cursor-pointer:hover {
  background-color: rgba(var(--v-theme-primary), 0.06);
}

.contact-avatar {
  flex-shrink: 0;
}

.contact-info {
  min-width: 0;
  overflow: hidden;
}

.contact-name {
  font-weight: 600;
  font-size: 0.98rem;
  line-height: 1.25;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
}

.online-msg {
  font-size: 0.78rem;
  color: rgba(var(--v-theme-on-surface), 0.55);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 320px;
  line-height: 1.25;
  margin: 0;
}

.contact-actions .action-btn,
.contact-actions .action-chip {
  height: 32px;
}

/* =========================================================
     Lista de mensagens + bolhas
     ========================================================= */
.messages-list {
  flex: 1 1 auto;
  padding: 0 16px 8px;
  display: flex;
  flex-direction: column;
}

.messages-stream {
  display: flex;
  flex-direction: column;
}

.load-more-msgs {
  padding: 8px 0;
}

/* As classes .message-item / .message-cliente / .message-sistema vêm do
     SCSS global (styles.scss); aqui complementamos o comportamento. */
:deep(.message-item) {
  max-width: min(560px, 78%);
  word-break: break-word;
}

.msg-media-image,
.msg-media-video {
  width: 100%;
  max-width: 320px;
  min-width: 320px;
  aspect-ratio: 1 / 1;
  object-fit: cover;
}

.message-data {
  background-color: rgba(var(--v-theme-surface), 0.95);
  color: rgba(var(--v-theme-on-surface), 0.7);
  padding: 4px 12px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  border-radius: 999px;
  margin: 12px 0;
}

/* =========================================================
     Origem da conversa — anúncio Click-to-WhatsApp / produto
     ========================================================= */
.referral-card {
  display: flex;
  flex-direction: row;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 6px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  border-left: solid 3px rgba(var(--v-theme-primary), 0.7);
  text-decoration: none;
  color: inherit;
  margin-bottom: 4px;
}

.referral-card .referral-thumb {
  flex-shrink: 0;
}

.referral-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.referral-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: rgba(var(--v-theme-primary), 1);
}

.referral-headline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.referral-body {
  margin: 0;
  font-size: 12px;
  line-height: 15px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* =========================================================
     Cartão de contato compartilhado (mensagem type=contacts)
     ========================================================= */
.contact-card {
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
  width: 100%;
  min-width: 230px;
  padding: 8px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  border-left: solid 3px rgba(var(--v-theme-primary), 0.7);
}

.contact-card .contact-thumb {
  flex-shrink: 0;
}

.contact-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1 1 auto;
}

.contact-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: rgba(var(--v-theme-primary), 1);
}

.contact-name {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.contact-phone {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  font-size: 12px;
  line-height: 16px;
  color: rgba(var(--v-theme-on-surface), 0.7);
}

.contact-card-wrap {
  min-width: 250px;
}

.contact-card-wrap .contact-actions {
  width: 100%;
  margin-bottom: 12px;
}

/* =========================================================
     Card de localização (mensagem type=location)
     ========================================================= */
.location-card {
  width: 290px;
  max-width: 100%;
  overflow: hidden;
  border-radius: 14px;
  background-color: rgba(var(--v-theme-surface), 1);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}

.location-map {
  position: relative;
  width: 100%;
  height: 165px;
  background: linear-gradient(135deg, #cfe0d0 0%, #aac4ad 100%);
  overflow: hidden;
}

.location-iframe {
  display: block;
  width: 100%;
  height: 100%;
  border: 0;
}

.location-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 9px 11px;
}

.location-text {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  min-width: 0;
}

.location-labels {
  min-width: 0;
}

.location-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.location-address {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 15px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.location-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  padding: 5px 10px;
  font-size: 12px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  color: rgba(var(--v-theme-primary), 1);
  background: rgba(var(--v-theme-primary), 0.12);
  border-radius: 8px;
  transition: background 0.15s ease;
}

.location-btn:hover {
  background: rgba(var(--v-theme-primary), 0.22);
}

/* =========================================================
     Reply preview + arquivos pendentes
     ========================================================= */
.div-resposta {
  min-height: 50px;
  max-height: 50px;
  width: 100%;
  border-radius: 6px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  overflow: hidden;
  padding: 0 10px;
  border-left: solid 4px;
}

.msg-reply {
  position: absolute;
  top: -75px;
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  left: 10px;
  right: 10px;
  gap: 10px;
  background-color: rgb(var(--v-theme-surface-variant, var(--v-theme-surface)));
  min-height: 80px;
  max-height: 80px;
  border-radius: 12px 12px 0 0;
  align-items: center;
  padding: 0 16px;
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.12);
}

.msg-reply-content {
  background-color: rgb(var(--v-theme-surface));
  width: 100%;
  height: 100%;
  border-left: 4px solid rgb(var(--v-theme-primary));
  padding-left: 10px;
  display: flex;
  min-height: 50px;
  border-radius: 6px;
  align-items: center;
  gap: 8px;
}

.menu-msg {
  z-index: 9999;
  width: 230px;
}

.menu-contato {
  z-index: 9999;
  width: 220px;
}

/* Ícone de "fixado" no item da lista de conversas */
.chat-pin-icon {
  position: absolute;
  right: 14px;
  bottom: 12px;
  color: rgba(var(--v-theme-primary), 0.85);
}

.file {
  background-color: rgba(var(--v-theme-surface), 0.98);
  padding: 8px 14px;
  display: flex;
  gap: 10px;
  border-radius: 8px;
  align-items: center;
  flex-direction: row;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  font-size: 0.85rem;
}

.send-files {
  position: absolute;
  top: -64px;
  display: flex;
  flex-direction: row;
  overflow-x: auto;
  left: 10px;
  right: 10px;
  gap: 10px;
}

/* =========================================================
     Composer
     ========================================================= */
.message-send {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  position: sticky;
  padding: 10px 12px;
  justify-content: center;
  background-color: rgb(var(--v-theme-surface));
  border-top: 1px solid rgba(var(--v-border-color), 0.1);
  bottom: 0;
  z-index: 4;
  padding-bottom: calc(10px + env(safe-area-inset-bottom, 0px));
}

/* Compositor WYSIWYG (Quill).
     ATENÇÃO: o @vueup/vue-quill é um componente multi-root — ele renderiza só
     o <div ref="editor"> (que vira .ql-container) e o Quill insere a .ql-toolbar
     como IRMÃ desse div. Logo a classe passada (.composer-quill) cai apenas no
     container, e a toolbar é irmã. Por isso estilizamos o WRAPPER `.composer`
     (nosso div, com data-v) e seus filhos diretos .ql-toolbar / .ql-container. */
.composer {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column-reverse; /* texto em cima, toolbar embaixo */
  border: 1px solid rgba(var(--v-border-color), 0.22);
  border-radius: 12px;
  overflow: hidden;
  background-color: white;
}

.composer--disabled {
  opacity: 0.6;
  pointer-events: none;
}

.composer :deep(.ql-container) {
  border: none;
  font-family: inherit;
  font-size: 0.95rem;
}

.composer :deep(.ql-editor) {
  min-height: 22px;
  max-height: 140px;
  overflow-y: auto;
  padding: 8px 12px;
  line-height: 1.45;
  color: rgb(var(--v-theme-on-surface));
}

.composer :deep(.ql-editor.ql-blank::before) {
  font-style: normal;
  color: rgba(var(--v-theme-on-surface), 0.5);
  left: 12px;
  right: 12px;
}

/* Barra de formatação enxuta, separada por um divisor sutil. */
.composer :deep(.ql-toolbar) {
  border: none;
  border-top: 1px solid rgba(var(--v-border-color), 0.16);
  padding: 3px 6px;
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

/* Ícones da toolbar seguindo o tema; destaque no hover/ativo. 
.composer :deep(.ql-toolbar .ql-stroke) {
  stroke: rgba(var(--v-theme-on-surface), 0.7);
}
.composer :deep(.ql-toolbar .ql-fill) {
  fill: rgba(var(--v-theme-on-surface), 0.7);
}
.composer :deep(.ql-toolbar button:hover .ql-stroke),
.composer :deep(.ql-toolbar button.ql-active .ql-stroke) {
  stroke: rgb(var(--v-theme-primary));
}
.composer :deep(.ql-toolbar button:hover .ql-fill),
.composer :deep(.ql-toolbar button.ql-active .ql-fill) {
  fill: rgb(var(--v-theme-primary));
}*/

/* Reação flutuante na borda inferior da bolha (estilo WhatsApp). */
.msg-reaction {
  position: absolute;
  bottom: -12px;
  padding: 0 5px;
  font-size: 0.9rem;
  line-height: 19px;
  background-color: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-border-color), 0.18);
  border-radius: 12px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.12);
  z-index: 2;
}
.message-cliente .msg-reaction {
  left: 10px;
}
.message-sistema .msg-reaction {
  right: 10px;
}

/* Barra de reações rápidas no menu da mensagem. */
.reaction-bar {
  gap: 2px;
}
.reaction-emoji {
  font-size: 1.25rem;
  line-height: 1;
  padding: 4px 6px;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 120ms ease, transform 120ms ease;
}
.reaction-emoji:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  transform: scale(1.15);
}
.reaction-emoji--ativa {
  background-color: rgba(var(--v-theme-primary), 0.16);
}

/* Monoespaçado (``` ``` e ` `) renderizado nas bolhas e no preview. */
.html-content :deep(.wa-code) {
  font-family: "Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas,
    monospace;
  background-color: rgba(var(--v-theme-on-surface), 0.08);
  border-radius: 4px;
  padding: 0 4px;
  font-size: 0.9em;
}

.carregando {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(var(--v-theme-surface), 0.6);
  backdrop-filter: blur(4px);
  z-index: 10;
}

/* =========================================================
     Transições — mensagens entrando, painéis
     ========================================================= */
.msg-enter-active {
  transition: transform 240ms cubic-bezier(0.16, 1, 0.3, 1),
    opacity 200ms ease-out;
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.985);
}
.msg-enter-to {
  opacity: 1;
  transform: translateY(0) scale(1);
}
.msg-leave-active {
  transition: opacity 140ms ease-in;
}
.msg-leave-to {
  opacity: 0;
}
.msg-move {
  transition: transform 220ms cubic-bezier(0.32, 0.72, 0, 1);
}

/* Respeitar usuários com preferência reduce-motion */
@media (prefers-reduced-motion: reduce) {
  .msg-enter-active,
  .msg-leave-active,
  .msg-move,
  .chat-shell.is-mobile .chat-list-pane,
  .chat-shell.is-mobile .chat-conv-pane {
    transition: none !important;
  }
}

/* =========================================================
     Breakpoints
     ========================================================= */
@media (max-width: 960px) {
  .chat-shell {
    grid-template-columns: 1fr;
    border-radius: 0;
  }

  .contact-header {
    min-height: 56px;
    padding: 8px 8px 8px 4px;
  }

  .contact-name {
    max-width: 60vw;
    font-size: 0.95rem;
  }

  .online-msg {
    max-width: 60vw;
    font-size: 0.72rem;
  }

  .messages-list {
    padding: 0 10px 6px;
  }

  :deep(.message-item) {
    max-width: 86%;
  }

  .msg-media-image,
  .msg-media-video {
    max-width: 75vw;
    min-width: 75vw;
  }

  .message-send {
    padding: 8px 8px;
    gap: 6px;
  }

  .msg-reply {
    left: 4px;
    right: 4px;
  }

  .send-files {
    left: 4px;
    right: 4px;
  }

  .chat-item {
    padding: 10px 12px;
  }

  .circle-naoLida {
    right: 12px;
    top: 10px;
  }
}

@media (max-width: 480px) {
  .contact-name {
    max-width: 48vw;
  }
  .online-msg {
    max-width: 48vw;
  }
  .msg-media-image,
  .msg-media-video {
    max-width: 70vw;
    min-width: 70vw;
  }
}
</style>
