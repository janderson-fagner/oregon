<script setup>
import { PerfectScrollbar } from "vue3-perfect-scrollbar";
import { useRoute, useRouter } from "vue-router";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";

const urlApi = import.meta.env.VITE_API_BASE_URL || '/api';

//Comps
import MessageZapBlock from "./fluxo-comps/message-block.vue";
import EmailBlock from "./fluxo-comps/email-block.vue";
import ConditionBlock from "./fluxo-comps/condition-block.vue";
import WaitReplyBlock from "./fluxo-comps/wait-reply-block.vue";
import WaitReplyConditionalBlock from "./fluxo-comps/wait-reply-conditional-block.vue";
import WaitReplyOptionsBlock from "./fluxo-comps/wait-reply-options-block.vue";
import WaitForAgentBlock from "./fluxo-comps/wait-for-agent-block.vue";
import RedirectFlowBlock from "./fluxo-comps/redirect-flow-block.vue";
import CreateAgendamentoBlock from "./fluxo-comps/create-agendamento-block.vue";
import UpdateAgendamentoBlock from "./fluxo-comps/update-agendamento-block.vue";
import UpdateClienteBlock from "./fluxo-comps/update-cliente-block.vue";
import CreateNegocioBlock from "./fluxo-comps/create-negocio-block.vue";
import UpdateNegocioBlock from "./fluxo-comps/update-negocio-block.vue";
import ForwardContactBlock from "./fluxo-comps/forward-contact-block.vue";
import HttpBlock from "./fluxo-comps/http-block.vue";
import BlockFlowsBlock from "./fluxo-comps/block-flows-block.vue";
import GetAppointmentBlock from "./fluxo-comps/get-appointment-block.vue";
import AiDecisionBlock from "./fluxo-comps/ai-decision-block.vue";
import AiActionsBlock from "./fluxo-comps/ai-actions-block.vue";
import AiOptionsBlock from "./fluxo-comps/ai-options-block.vue";

// Validador de configurações de IA
import { 
  verificarConfiguracoesIA, 
  mostrarErroConfiguracaoIA, 
  blocoRequerIA 
} from '@/utils/geminiConfigValidator';

const { setAlert } = useAlert();

const route = useRoute();
const router = useRouter();

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  flowData: Object,
});

const emit = defineEmits(["update:isDrawerOpen", "updateFlows", "closeDrawer"]);

// Cookie para salvar largura do painel (dura 3 meses)
const sidebarWidthCookie = useCookie("flowBuilderSidebarWidth", {
  maxAge: 60 * 60 * 24 * 90, // 90 dias em segundos
  default: () => 350,
});

const loading = ref(false);
const isNewFlow = ref(true);

// Validação de configurações de IA
const iaConfigurado = ref(false);
const verificandoIA = ref(false);
const validacaoIA = ref(null);

// Configurações do editor Quill para mensagem de saudação
const welcomeEditorOptions = {
  theme: "snow",
  placeholder: "Olá! Para continuar, por favor me informe seu nome completo:",
  modules: {
    toolbar: "#toolbar-welcome",
  },
};

const flow = ref({
  id: null,
  name: "Fluxo",
  description: "",
  status: "ativo",
  trigger_type: null,
  webhook_key: "",
  cron_time: null,
  trigger_conditions: [],
  priority: 50,
  interruptible: true,
  global_keywords: [], // Array vazio para o v-for funcionar
});
const nodes = ref([]); // {id?, type, label, position_x, position_y, config}
const edges = ref([]); // {source_node_id?, target_node_id?, label}

const palette = [
  {
    type: "send_whatsapp",
    categoria: "Ações",
    title: "Enviar Mensagem",
    icon: "tabler-brand-whatsapp",
    color: "success",
  },
  {
    type: "send_email",
    categoria: "Ações",
    title: "Enviar Email",
    icon: "tabler-mail",
    color: "info",
  },
  {
    type: "http",
    categoria: "Ações",
    title: "Requisição HTTP",
    icon: "tabler-cloud",
    color: "#0097A7",
  },
  {
    type: "create_agendamento",
    categoria: "Agendamentos",
    title: "Criar Agendamento",
    icon: "tabler-calendar-plus",
    color: "success",
  },
  {
    type: "update_agendamento",
    categoria: "Agendamentos",
    title: "Atualizar Agendamento",
    icon: "tabler-calendar-event",
    color: "primary",
  },
  {
    type: "get_appointment",
    categoria: "Agendamentos",
    title: "Obter Agendamento",
    icon: "tabler-calendar-search",
    color: "warning",
  },
  {
    type: "update_cliente",
    categoria: "Agendamentos",
    title: "Atualizar Cliente",
    icon: "tabler-user-up",
    color: "primary",
  },
  {
    type: "create_negocio",
    categoria: "CRM",
    title: "Criar Negócio",
    icon: "tabler-briefcase",
    color: "#4CAF50",
  },
  {
    type: "update_negocio",
    categoria: "CRM",
    title: "Atualizar Negócio",
    icon: "tabler-briefcase",
    color: "#FF9800",
  },
  {
    type: "condition",
    title: "Condição",
    categoria: "Lógica",
    icon: "tabler-git-branch",
    color: "#512DA8",
  },
  {
    type: "ai_decision",
    title: "Decisão IA",
    categoria: "Lógica",
    icon: "tabler-brain",
    color: "#FF6F00",
  },
  {
    type: "wait_reply_options",
    title: "Menu de Opções",
    icon: "tabler-list-numbers",
    color: "#9C27B0",
    categoria: "Lógica",
  },
      {
        type: "ai_actions",
        title: "Ações IA",
        icon: "tabler-robot",
        color: "#E91E63",
        categoria: "IA",
      },
      {
        type: "ai_options",
        title: "Opções IA",
        icon: "tabler-brain",
        color: "#9C27B0",
        categoria: "IA",
      },
  {
    type: "wait_for_agent",
    title: "Aguardar Atendimento",
    icon: "tabler-user-check",
    color: "#FF6F00",
    categoria: "Tempo",
  },
  {
    type: "delay",
    title: "Delay",
    icon: "tabler-hourglass",
    color: "#AFB42B",
    categoria: "Tempo",
  },
  {
    type: "wait_reply",
    title: "Aguardar Resposta",
    icon: "tabler-message-circle",
    color: "#00796B",
    categoria: "Tempo",
  },
  {
    type: "wait_reply_conditional",
    title: "Aguardar Resposta Condicional",
    icon: "tabler-message-circle-question",
    color: "#FF9800",
    categoria: "Tempo",
  },
  {
    type: "redirect_flow",
    title: "Redirecionar para outro Fluxo",
    icon: "tabler-arrow-right-circle",
    color: "#E91E63",
    categoria: "Ações",
  },
  {
    type: "forward_contact",
    title: "Encaminhar Contato",
    icon: "tabler-share",
    color: "#9C27B0",
    categoria: "Ações",
  },
  {
    type: "block_flows",
    title: "Bloquear/Desbloquear Fluxos",
    icon: "tabler-shield-lock",
    color: "#D32F2F",
    categoria: "Ações",
  },
];

// Drag & Drop
const canvasRef = ref(null);
const drag = reactive({ active: false, nodeId: null, offsetX: 0, offsetY: 0 });
const connecting = reactive({
  active: false,
  sourceId: null,
  targetId: null,
  mouseX: 0,
  mouseY: 0,
});

// Pan (arrastar canvas) e Zoom
const canvas = reactive({
  pan: { active: false, startX: 0, startY: 0, x: 0, y: 0 },
  zoom: 1,
  minZoom: 0.25,
  maxZoom: 2,
});

// Redimensionamento do painel lateral
const resizer = reactive({
  active: false,
  startX: 0,
  currentWidth: sidebarWidthCookie.value || 350, // largura atual em pixels (do cookie)
  initialWidth: sidebarWidthCookie.value || 350, // largura no início do drag
  minWidth: 250,
  maxWidth: 600,
});

const onResizerMouseDown = (e) => {
  e.preventDefault();
  e.stopPropagation();

  resizer.active = true;
  resizer.startX = e.clientX;
  resizer.initialWidth = resizer.currentWidth; // Salvar a largura no início do drag

  document.addEventListener("mousemove", onResizerMouseMove);
  document.addEventListener("mouseup", onResizerMouseUp);
  document.body.style.cursor = "ew-resize";
  document.body.style.userSelect = "none";
};

const onResizerMouseMove = (e) => {
  if (!resizer.active) return;

  const delta = e.clientX - resizer.startX;
  const newWidth = resizer.initialWidth + delta;

  // Aplicar limites
  if (newWidth >= resizer.minWidth && newWidth <= resizer.maxWidth) {
    resizer.currentWidth = newWidth;
  } else if (newWidth < resizer.minWidth) {
    resizer.currentWidth = resizer.minWidth;
  } else if (newWidth > resizer.maxWidth) {
    resizer.currentWidth = resizer.maxWidth;
  }
};

const onResizerMouseUp = () => {
  resizer.active = false;
  document.removeEventListener("mousemove", onResizerMouseMove);
  document.removeEventListener("mouseup", onResizerMouseUp);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";

  // Salvar largura no cookie quando soltar o mouse
  sidebarWidthCookie.value = resizer.currentWidth;
};

const NODE_WIDTH = 280;
const NODE_HEIGHT = 120;

const addNode = async (t) => {
  // Verificar se bloco requer IA e se IA está configurada
  if (blocoRequerIA(t) && !iaConfigurado.value) {
    // Verificar novamente as configurações
    await verificarConfigIA();
    
    // Se ainda não está configurado, mostrar erro e bloquear
    if (!iaConfigurado.value && validacaoIA.value) {
      mostrarErroConfiguracaoIA(validacaoIA.value, setAlert);
      return; // Bloquear adição do bloco
    }
  }

  let defaultConfig = {};

  switch (t) {
    case "send_whatsapp":
      defaultConfig = {
        content: "",
        idModelo: null,
      };
      break;
    case "send_email":
      defaultConfig = {
        content: "",
        subject: "",
        to: "",
        idModelo: null,
      };
      break;
    case "send_ai":
      defaultConfig = {
        instructions: "",
      };
      break;

      break;
    case "http":
      defaultConfig = {
        method: "GET",
        url: "",
        headers: [],
        body: "",
        bodyType: "json",
        responseVariables: [],
        timeout: 30,
      };
      break;
    case "condition":
      defaultConfig = {
        conditions: [],
      };
      break;
    case "ai_decision":
      defaultConfig = {
        instructions: "",
      };
      break;
    case "ai_actions":
      defaultConfig = {
        instructions: "",
        capabilities: {
          createAppointment: true,
          updateAppointment: true,
          cancelAppointment: true,
          createBusiness: true,
          updateBusiness: true,
          updateClient: true,
          checkAvailability: true,
          sendMessage: true,
          askQuestions: true,
          collectData: true,
          forwardToAgent: true
        },
        fallbackActions: ["transferToHuman"], // Fallback padrão: transferir para atendimento humano
        maxAttempts: 3,
        timeoutSeconds: 300,
      };
      break;
    case "ai_options":
      defaultConfig = {
        instructions: "Analise a mensagem do cliente e escolha a opção que melhor representa sua intenção.",
        options: [],
        message: "<p>Como posso ajudá-lo hoje?</p>",
        maxAttempts: 3,
        timeoutSeconds: 0,
        invalidMessage: "<p>Desculpe, não consegui entender sua resposta. Por favor, tente novamente.</p>",
      };
      break;
    case "create_agendamento":
      defaultConfig = {
        data: "",
        horaInicio: "",
        horaFim: "",
        funcionarioId: null,
        statusId: 1,
        observacoes: "",
      };
      break;
    case "update_agendamento":
      defaultConfig = {
        agendamentoId: "",
        data: "",
        horaInicio: "",
        horaFim: "",
        funcionarioId: null,
        statusId: null,
        observacoes: "",
      };
      break;
    case "update_cliente":
      defaultConfig = {
        actions: [],
      };
      break;
    case "create_negocio":
      defaultConfig = {
        titulo: "",
        etapaId: null,
        valor: null,
        origem: "",
        descricao: "",
        dataFechamentoEsperada: "",
        tags: []
      };
      break;
    case "update_negocio":
      defaultConfig = {
        identificationType: "context",
        negocioId: "",
        actions: []
      };
      break;
    case "delay":
      defaultConfig = {
        delayValue: 0,
        delayType: "seconds"
      };
      break;
    case "wait_reply":
      defaultConfig = {
        timeoutValue: 0,
        timeoutType: "seconds",
        variables: [],
      };
      break;
    case "wait_reply_conditional":
      defaultConfig = {
        timeoutValue: 0,
        timeoutType: "seconds",
        variables: [],
        conditions: [],
      };
      break;
    case "wait_reply_options":
      defaultConfig = {
        options: [],
        message: "",
        maxAttempts: 3,
        invalidOptionMessage:
          "<p>Opção inválida. Por favor, escolha uma das opções acima.</p>",
      };
      break;
    case "wait_for_agent":
      defaultConfig = {
        message:
          "<p>Aguarde um momento, em breve um de nossos atendentes irá te responder!</p>",
        finishMessage:
          "<p>Agradecemos a paciência, qualquer coisa estamos a disposição!</p>",
      };
      break;
    case "redirect_flow":
      defaultConfig = {
        targetFlowId: null,
        message: "",
      };
      break;
    case "forward_contact":
      defaultConfig = {
        phones: [],
        message: "",
        forwardType: "ordered",
      };
      break;
    case "block_flows":
      defaultConfig = {
        action: "block",
        message: "",
      };
      break;
    case "get_appointment":
      defaultConfig = {
        requestMessage: "<p>Por favor, me informe o ID do seu agendamento.</p>",
        invalidMessage:
          "<p>Agendamento não encontrado. Por favor, verifique o ID e tente novamente.</p>",
        searchingMessage: "<p>🔍 Buscando informações do agendamento...</p>",
        successMessage: "<p>✅ Agendamento encontrado! Vamos continuar.</p>",
        maxAttempts: 3,
      };
      break;
    default:
      defaultConfig = {};
      break;
  }

  const paletteItem = palette.find((p) => p.type === t);
  const newNode = {
    id: `node_${Date.now()}`,
    type: t,
    label:
      t === "start" ? "Início" : t === "end" ? "Fim" : paletteItem?.title || t,
    position_x: 100 + nodes.value.length * 50,
    position_y: 100 + nodes.value.length * 30,
    config: defaultConfig,
  };
  nodes.value.push(newNode);
};

const selected = ref(null);
const selectNode = (n) => {
  selected.value = n;
};

// Drag handlers
// Funções de Pan (arrastar canvas)
const onCanvasMouseDown = (e) => {
  // Não ativa pan se clicar em um nó ou em um ponto de conexão
  if (e.target.closest(".node-card") || e.target.closest(".connection-point")) {
    return;
  }

  // Ativa o pan para qualquer outra área (incluindo SVG)
  canvas.pan.active = true;
  canvas.pan.startX = e.clientX - canvas.pan.x;
  canvas.pan.startY = e.clientY - canvas.pan.y;
  canvasRef.value.style.cursor = "grabbing";
};

const onCanvasMouseMove = (e) => {
  if (canvas.pan.active) {
    canvas.pan.x = e.clientX - canvas.pan.startX;
    canvas.pan.y = e.clientY - canvas.pan.startY;
  }
};

const onCanvasMouseUp = () => {
  if (canvas.pan.active) {
    canvas.pan.active = false;
    canvasRef.value.style.cursor = "grab";
  }
};

// Funções de Zoom
const zoomIn = () => {
  if (canvas.zoom < canvas.maxZoom) {
    canvas.zoom = Math.min(canvas.zoom + 0.1, canvas.maxZoom);
  }
};

const zoomOut = () => {
  if (canvas.zoom > canvas.minZoom) {
    canvas.zoom = Math.max(canvas.zoom - 0.1, canvas.minZoom);
  }
};

const resetZoom = () => {
  canvas.zoom = 1;
  canvas.pan.x = 0;
  canvas.pan.y = 0;
};

// Zoom com scroll do mouse
const onCanvasWheel = (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  canvas.zoom = Math.max(
    canvas.minZoom,
    Math.min(canvas.maxZoom, canvas.zoom + delta)
  );
};

const onMouseDownNode = (e, nodeId) => {
  e.preventDefault();
  e.stopPropagation();

  const node = nodes.value.find((n) => n.id === nodeId);
  if (!node) return;

  const rect = canvasRef.value.getBoundingClientRect();
  drag.active = true;
  drag.nodeId = nodeId;
  drag.offsetX =
    (e.clientX - rect.left - canvas.pan.x) / canvas.zoom - node.position_x;
  drag.offsetY =
    (e.clientY - rect.top - canvas.pan.y) / canvas.zoom - node.position_y;

  // Adicionar classe de drag
  const nodeElement = e.currentTarget;
  nodeElement.classList.add("dragging");

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
};

const onMouseMove = (e) => {
  if (!drag.active) return;

  const rect = canvasRef.value.getBoundingClientRect();
  const node = nodes.value.find((n) => n.id === drag.nodeId);
  if (!node) return;

  node.position_x = Math.max(
    0,
    (e.clientX - rect.left - canvas.pan.x) / canvas.zoom - drag.offsetX
  );
  node.position_y = Math.max(
    0,
    (e.clientY - rect.top - canvas.pan.y) / canvas.zoom - drag.offsetY
  );
};

const onMouseUp = () => {
  // Remover classe de drag
  if (drag.nodeId) {
    const nodeElement = document.querySelector(
      `[data-node-id="${drag.nodeId}"]`
    );
    if (nodeElement) {
      nodeElement.classList.remove("dragging");
    }
  }

  drag.active = false;
  drag.nodeId = null;
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
};

// Connection handlers
const startConnection = (e, nodeId, label = null) => {
  e.preventDefault();
  e.stopPropagation();

  const rect = canvasRef.value.getBoundingClientRect();
  connecting.active = true;
  connecting.sourceId = nodeId;
  connecting.label = label;
  connecting.mouseX = (e.clientX - rect.left - canvas.pan.x) / canvas.zoom;
  connecting.mouseY = (e.clientY - rect.top - canvas.pan.y) / canvas.zoom;

  document.addEventListener("mousemove", onConnectionMove);
  document.addEventListener("mouseup", onConnectionEnd);
};

const onConnectionMove = (e) => {
  if (!connecting.active) return;

  const rect = canvasRef.value.getBoundingClientRect();
  connecting.mouseX = (e.clientX - rect.left - canvas.pan.x) / canvas.zoom;
  connecting.mouseY = (e.clientY - rect.top - canvas.pan.y) / canvas.zoom;
};

const onConnectionEnd = (e) => {
  if (!connecting.active) return;

  const rect = canvasRef.value.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left - canvas.pan.x) / canvas.zoom;
  const mouseY = (e.clientY - rect.top - canvas.pan.y) / canvas.zoom;

  // Find target node
  const targetNode = nodes.value.find((node) => {
    return (
      mouseX >= node.position_x &&
      mouseX <= node.position_x + NODE_WIDTH &&
      mouseY >= node.position_y &&
      mouseY <= node.position_y + NODE_HEIGHT &&
      node.id !== connecting.sourceId
    );
  });

  if (targetNode) {
    addEdge(connecting.sourceId, targetNode.id, connecting.label || null);
  }

  connecting.active = false;
  connecting.sourceId = null;
  document.removeEventListener("mousemove", onConnectionMove);
  document.removeEventListener("mouseup", onConnectionEnd);
};

const addEdge = (sourceId, targetId, label = null) => {
  if (sourceId === targetId) return;

  // Check if edge already exists
  const exists = edges.value.find(
    (e) =>
      e.source_node_id === sourceId &&
      e.target_node_id === targetId &&
      e.label === label
  );
  if (exists) return;

  edges.value.push({
    source_node_id: sourceId,
    target_node_id: targetId,
    label: label,
  });
};

const removeEdge = (index) => {
  edges.value.splice(index, 1);
};

const removeEdgeById = (edgeId) => {
  const index = edges.value.findIndex((e) => e.id === edgeId);
  if (index >= 0) {
    edges.value.splice(index, 1);
  }
};

const removeEdgeByConnection = (sourceId, targetId, label = null) => {
  const index = edges.value.findIndex(
    (e) =>
      e.source_node_id === sourceId &&
      e.target_node_id === targetId &&
      (label === null || e.label === label)
  );
  if (index >= 0) {
    edges.value.splice(index, 1);
  }
};

// Estado para menu de contexto de conexões
const edgeMenu = ref({
  show: false,
  x: 0,
  y: 0,
  edge: null,
  index: -1,
});

const showEdgeMenu = (event, edge, index) => {
  edgeMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    edge: edge,
    index: index,
  };
};

const hideEdgeMenu = () => {
  edgeMenu.value.show = false;
};

const confirmRemoveEdge = () => {
  if (edgeMenu.value.index >= 0) {
    removeEdge(edgeMenu.value.index);
    hideEdgeMenu();
  }
};

const resetNodeConnections = (nodeId) => {
  // Remove todas as conexões relacionadas a este nó
  edges.value = edges.value.filter(
    (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId
  );
};

const duplicateNode = (node) => {
  if (node.type === "start" || node.type === "end") {
    setAlert(
      "Não é possível duplicar blocos de Início ou Fim",
      "warning",
      "tabler-alert-circle",
      3000
    );
    return;
  }

  // Fechar o menu
  node.viewMenu = false;

  // Criar novo ID para o nó duplicado
  const newNodeId = `node_${Date.now()}`;

  // Criar cópia profunda da configuração
  const configCopy = JSON.parse(JSON.stringify(node.config || {}));

  // Criar novo nó deslocado 50px para direita e 50px para baixo
  const newNode = {
    id: newNodeId,
    type: node.type,
    label: `${node.label} (Cópia)`,
    config: configCopy,
    position_x: node.position_x + 50,
    position_y: node.position_y + 50,
    viewMenu: false,
  };

  // Adicionar às nodes
  nodes.value.push(newNode);

  // Selecionar o novo nó
  selected.value = newNode;

  setAlert(
    `Bloco "${node.label}" duplicado com sucesso`,
    "success",
    "tabler-copy",
    2000
  );

  console.log("Nó duplicado:", newNode);
};

// Variáveis para condicionais do gatilho
const fieldItens = ref([]);
const infos = ref([]);
const tags = ref([]);
const funis = ref([]);
const fontesClientes = ref([]);
const searchQuery = ref("");

// Operadores de data para gatilhos
const triggerDateOperators = [
  { title: "📅 É hoje", value: "is_today" },
  { title: "📅 É amanhã", value: "is_tomorrow" },
  { title: "📅 Foi ontem", value: "is_yesterday" },
  { title: '─── Períodos futuros ───', value: '_sep_future', disabled: true },
  { title: "📅 Nos próximos X dias", value: "within_days" },
  { title: "📅 Nos próximos X meses", value: "within_months" },
  { title: "📅 É nesta semana", value: "is_this_week" },
  { title: "📅 É na próxima semana", value: "is_next_week" },
  { title: "📅 É neste mês", value: "is_this_month" },
  { title: "📅 É no próximo mês", value: "is_next_month" },
  { title: "📅 É neste ano", value: "is_this_year" },
  { title: "📅 Daqui a exatamente X dias", value: "exactly_days_from_now" },
  { title: "📅 Daqui a exatamente X meses", value: "exactly_months_from_now" },
  { title: "📅 Daqui a exatamente X anos", value: "exactly_years_from_now" },
  { title: "📅 É data futura", value: "is_future_date" },
  { title: '─── Períodos passados ───', value: '_sep_past', disabled: true },
  { title: "📅 Nos últimos X dias", value: "within_past_days" },
  { title: "📅 Nos últimos X meses", value: "within_past_months" },
  { title: "📅 Há exatamente X dias", value: "exactly_days_ago" },
  { title: "📅 Há exatamente X meses", value: "exactly_months_ago" },
  { title: "📅 Há exatamente X anos", value: "exactly_years_ago" },
  { title: "📅 Foi na semana passada", value: "is_last_week" },
  { title: "📅 Foi no mês passado", value: "is_last_month" },
  { title: "📅 Foi no ano passado", value: "is_last_year" },
  { title: "📅 É data passada", value: "is_past_date" },
  { title: '─── Horas ───', value: '_sep_hours', disabled: true },
  { title: "🕐 Nas próximas X horas", value: "within_hours" },
  { title: "🕐 Nas últimas X horas", value: "within_past_hours" },
  { title: "🕐 Há exatamente X horas", value: "exactly_hours_ago" },
  { title: "🕐 Daqui a exatamente X horas", value: "exactly_hours_from_now" },
  { title: '─── A mais de (tempo passado) ───', value: '_sep_morethan', disabled: true },
  { title: "🕐 A mais de X horas atrás", value: "more_than_hours_ago" },
  { title: "📅 A mais de X dias atrás", value: "more_than_days_ago" },
  { title: "📅 A mais de X meses atrás", value: "more_than_months_ago" },
  { title: '─── Comparação de data ───', value: '_sep_compare', disabled: true },
  { title: "📅 Antes da data", value: "date_before" },
  { title: "📅 Depois da data", value: "date_after" },
];

// Operadores genéricos para gatilhos
const genericOperatorItens = [
  { title: "Igual a", value: "eq" },
  { title: "Diferente de", value: "neq" },
  { title: "Contém", value: "contains" },
  { title: "Não contém", value: "not_contains" },
  { title: "Maior que", value: "gt" },
  { title: "Maior ou igual a", value: "gte" },
  { title: "Menor que", value: "lt" },
  { title: "Menor ou igual a", value: "lte" },
  { title: "Está vazio", value: "empty" },
  { title: "Não está vazio", value: "not_empty" },
  { title: "Regex", value: "regex" },
];

// Operadores que não precisam de valor
const triggerNoValueOperators = [
  'is_today', 'is_tomorrow', 'is_yesterday',
  'is_this_week', 'is_last_week', 'is_next_week',
  'is_this_month', 'is_last_month', 'is_next_month',
  'is_this_year', 'is_last_year',
  'is_future_date', 'is_past_date',
  'empty', 'not_empty'
];

const triggerNumericDateOps = [
  'within_days', 'within_past_days', 'within_months', 'within_past_months',
  'exactly_days_ago', 'exactly_months_ago', 'exactly_years_ago',
  'exactly_days_from_now', 'exactly_months_from_now', 'exactly_years_from_now',
  'within_hours', 'within_past_hours', 'exactly_hours_ago', 'exactly_hours_from_now',
  'more_than_hours_ago', 'more_than_days_ago', 'more_than_months_ago'
];
const triggerDateValueOps = ['date_before', 'date_after'];

const getTriggerOperators = (condition) => {
  const field = condition?.field || '';
  const isDateField = field.includes('data') || field.includes('cadastro') || field.includes('agendamento_data') || field.includes('ultimo_agendamento');
  if (isDateField) {
    return [...triggerDateOperators, { title: '─── Outros ───', value: '_sep_generic', disabled: true }, ...genericOperatorItens];
  }
  return genericOperatorItens;
};

const getTriggerValuePlaceholder = (operator) => {
  if (triggerNumericDateOps.includes(operator)) return 'Quantidade';
  if (triggerDateValueOps.includes(operator)) return 'Selecione a data';
  return 'Insira o valor';
};

const getTriggerValueLabel = (operator) => {
  if (['within_hours', 'within_past_hours', 'exactly_hours_ago', 'exactly_hours_from_now', 'more_than_hours_ago'].includes(operator)) return 'Horas';
  if (['within_days', 'within_past_days', 'exactly_days_ago', 'exactly_days_from_now', 'more_than_days_ago'].includes(operator)) return 'Dias';
  if (['within_months', 'within_past_months', 'exactly_months_ago', 'exactly_months_from_now', 'more_than_months_ago'].includes(operator)) return 'Meses';
  if (['exactly_years_ago', 'exactly_years_from_now'].includes(operator)) return 'Anos';
  if (triggerDateValueOps.includes(operator)) return 'Data';
  return 'Valor';
};

const getTriggerValueInputType = (operator, field) => {
  if (triggerNumericDateOps.includes(operator)) return 'number';
  if (triggerDateValueOps.includes(operator)) return 'date';
  if (field?.includes('data')) return 'date';
  return 'text';
};

const addTriggerCondition = () => {
  const newCondition = {
    id: new Date().getTime(),
    field: "",
    operator: "",
    value: "",
    logicalOperator: "and",
    valueIsSelect: false,
    valueIsDinheiro: false,
    itensValueSelect: [],
  };

  flow.value.trigger_conditions = [
    ...(flow.value.trigger_conditions || []),
    newCondition,
  ];
};

const removeTriggerCondition = (index) => {
  const newConditions = [...(flow.value.trigger_conditions || [])];
  newConditions.splice(index, 1);
  flow.value.trigger_conditions = newConditions;
};

// 🛡️ Gerenciar palavras-chave globais
const addGlobalKeyword = () => {
  if (!flow.value.global_keywords) {
    flow.value.global_keywords = [];
  }

  flow.value.global_keywords.push({
    keyword: "",
    matchType: "exact",
    action: "trigger_flow",
  });
};

const removeGlobalKeyword = (index) => {
  if (!flow.value.global_keywords) return;

  const newKeywords = [...flow.value.global_keywords];
  newKeywords.splice(index, 1);
  flow.value.global_keywords = newKeywords;
};

const handleTriggerFieldSelect = async (condition) => {
  condition.valueIsSelect = false;
  condition.valueIsDinheiro = false;
  condition.itensValueSelect = [];

  if (condition.field === "variavel") {
    condition.valueIsSelect = true;
    const allVars = await getAllVariables();
    condition.itensValueSelect = allVars;
  }
  // Campos de gênero
  else if (
    condition.field === "cliente_genero" ||
    condition.field === "genero"
  ) {
    condition.valueIsSelect = true;
    condition.itensValueSelect = [
      { title: "Masculino", value: "masculino" },
      { title: "Feminino", value: "feminino" },
      { title: "Não informado", value: "nao_informado" },
    ];
  }
  // Campos de localização
  else if (condition.field === "estado") {
    condition.valueIsSelect = true;
    condition.itensValueSelect = infos.value.estados || [];
  } else if (condition.field === "cidade") {
    condition.valueIsSelect = true;
    condition.itensValueSelect = infos.value.cidades || [];
  }
  // Campos de origem
  else if (condition.field === "origem") {
    condition.valueIsSelect = true;
    condition.itensValueSelect = infos.value.origens || [];
  }
  // Campos numéricos
  else if (
    condition.field === "cliente_qtd_pedidos" ||
    condition.field === "contagem_mensagens"
  ) {
    condition.valueIsSelect = false;
    condition.valueIsDinheiro = false;
  }
  // Campos monetários
  else if (
    condition.field === "cliente_valor_gasto" ||
    condition.field === "agendamento_valor"
  ) {
    condition.valueIsDinheiro = true;
  }
  // Campos de data
  else if (
    condition.field === "cliente_data_cadastro" ||
    condition.field === "cliente_ultima_compra" ||
    condition.field === "agendamento_data" ||
    condition.field === "data_cadastro" ||
    condition.field === "data_ultimo_pedido"
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de tags
  else if (condition.field === "tags") {
    condition.valueIsSelect = true;
    condition.itensValueSelect = tags.value;
  }
  // Campos de mensagens (para wait_reply_conditional)
  else if (
    condition.field === "ultima_mensagem" ||
    condition.field === "ultima_mensagem_cliente" ||
    condition.field === "ultima_mensagem_sistema"
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de sistema
  else if (
    condition.field === "data_atual" ||
    condition.field === "hora_atual" ||
    condition.field === "dia_semana" ||
    condition.field === "mes_atual" ||
    condition.field === "ano_atual"
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de comparação numérica
  else if (
    condition.field === "cliente_valor_gasto" ||
    condition.field === "cliente_qtd_pedidos" ||
    condition.field === "agendamento_valor" ||
    condition.field === "contagem_mensagens"
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de texto simples
  else if (
    condition.field === "cliente_nome" ||
    condition.field === "cliente_email" ||
    condition.field === "cliente_telefone" ||
    condition.field === "agendamento_id" ||
    condition.field === "agendamento_observacoes" ||
    condition.field === "agendamento_endereco" ||
    condition.field === "agendamento_funcionario"
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de data
  else if (
    condition.field === "agendamento_data" ||
    condition.field === "agendamento_hora_inicio" ||
    condition.field === "agendamento_hora_fim"
  ) {
    condition.valueIsSelect = false;
  }
  // Campos de status agendamento
  else if (condition.field === "agendamento_status") {
    condition.valueIsSelect = true;
    // Carregar status de agendamento
    /* try {
      const res = await $api('/agenda/status', { method: 'GET' });
      if (res?.status) {
        condition.itensValueSelect = res.status.map(s => ({
          title: s.status_nome,
          value: s.status_id
        }));
      }
    } catch (error) {
      console.error('Erro ao carregar status de agendamento:', error);
    } */

    condition.itensValueSelect = [
      {
        title: 'Agendado',
        value: 1
      },
      {
        title: 'Confirmado',
        value: 2
      },
      {
        title: 'Atendido',
        value: 3
      },
      {
        title: 'Cancelado',
        value: 6
      },
      {
        title: 'Remarcado',
        value: 7
      }
    ]
  } else {
    condition.valueIsSelect = false;
  }
};

// Funções para carregar dados das condicionais
const getInfos = async () => {
  try {
    const res = await $api("/disparos/seg/get-infos-users", {
      method: "GET",
    });

    if (res) {
      infos.value = res;
    }
  } catch (error) {
    console.error("Erro ao obter informações:", error);
  }
};

const getTags = async () => {
  try {
    const res = await $api("/clientes/list/tags", {
      method: "GET",
    });

    if (res?.tags && Array.isArray(res.tags)) {
      tags.value = res.tags.map((tag) => ({
        title: tag.name,
        value: tag.id,
      }));
    }
  } catch (error) {
    console.error("Erro ao obter tags:", error);
  }
};


// SVG path calculation
const getNodeCenter = (node) => ({
  x: node.position_x + NODE_WIDTH / 2,
  y: node.position_y + NODE_HEIGHT / 2,
});

const getConnectionPath = (sourceId, targetId) => {
  const sourceNode = nodes.value.find((n) => n.id === sourceId);
  const targetNode = nodes.value.find((n) => n.id === targetId);

  if (!sourceNode || !targetNode) return "";

  const start = getNodeCenter(sourceNode);
  const end = getNodeCenter(targetNode);

  const dx = end.x - start.x;
  const dy = end.y - start.y;

  const controlPoint1 = { x: start.x + dx * 0.5, y: start.y };
  const controlPoint2 = { x: end.x - dx * 0.5, y: end.y };

  return `M ${start.x} ${start.y} C ${controlPoint1.x} ${controlPoint1.y}, ${controlPoint2.x} ${controlPoint2.y}, ${end.x} ${end.y}`;
};

const getActiveConnectionPath = () => {
  if (!connecting.active || !connecting.sourceId) return "";

  const sourceNode = nodes.value.find((n) => n.id === connecting.sourceId);
  if (!sourceNode) return "";

  const start = getNodeCenter(sourceNode);
  return `M ${start.x} ${start.y} L ${connecting.mouseX} ${connecting.mouseY}`;
};

const getConnectionLabelX = (sourceId, targetId) => {
  const sourceNode = nodes.value.find((n) => n.id === sourceId);
  const targetNode = nodes.value.find((n) => n.id === targetId);

  if (!sourceNode || !targetNode) return 0;

  const start = getNodeCenter(sourceNode);
  const end = getNodeCenter(targetNode);

  return (start.x + end.x) / 2;
};

const getConnectionLabelY = (sourceId, targetId) => {
  const sourceNode = nodes.value.find((n) => n.id === sourceId);
  const targetNode = nodes.value.find((n) => n.id === targetId);

  if (!sourceNode || !targetNode) return 0;

  const start = getNodeCenter(sourceNode);
  const end = getNodeCenter(targetNode);

  return (start.y + end.y) / 2;
};

const load = async () => {
  if (props.flowData && props.flowData.id) {
    isNewFlow.value = false;
    loading.value = true;
    try {
      const res = await $api(`/flows/${props.flowData.id}`, { method: "GET" });

      console.log("res", res);

      if (res) {
        // Parse global_keywords se vier como string
        let parsedKeywords = res.flow.global_keywords || null;
        if (typeof parsedKeywords === "string") {
          try {
            parsedKeywords = JSON.parse(parsedKeywords);
          } catch (e) {
            console.error("Erro ao fazer parse de global_keywords:", e);
            parsedKeywords = null;
          }
        }

        // Garantir que seja array (vazio ou com valores) e não null para o v-for funcionar
        if (!parsedKeywords || !Array.isArray(parsedKeywords)) {
          parsedKeywords = [];
        }

        flow.value = {
          ...res.flow,
          trigger_conditions: res.flow.trigger_conditions || [],
          priority:
            res.flow.priority !== null && res.flow.priority !== undefined
              ? res.flow.priority
              : 50,
          interruptible:
            res.flow.interruptible === 1 || res.flow.interruptible === true,
          global_keywords: parsedKeywords,
        };

        console.log("✅ Fluxo carregado:", {
          priority: flow.value.priority,
          interruptible: flow.value.interruptible,
          global_keywords: flow.value.global_keywords,
        });

        nodes.value = res.nodes.map((n) => ({
          ...n,
          id:
            n.id ||
            `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          config: n.config
            ? typeof n.config === "string"
              ? JSON.parse(n.config)
              : n.config
            : {},
        }));
        edges.value = res.edges;

        for (const trigger of flow.value.trigger_conditions) {
          await handleTriggerFieldSelect(trigger);
        }
      }
    } catch (e) {
      console.error("Erro carregando fluxo", e);
    }
    loading.value = false;
  } else {
    isNewFlow.value = true;
    nodes.value = [
      {
        id: "node_start",
        type: "start",
        label: "Início",
        position_x: 100,
        position_y: 100,
        config: {
          auto_register_client: false,
          use_whatsapp_name: true,
          welcome_message:
            "<p>Olá! Para continuar, por favor me informe seu nome completo:</p>",
        },
      },
      {
        id: "node_end",
        type: "end",
        label: "Fim",
        position_x: 500,
        position_y: 100,
        config: {},
      },
    ];
    edges.value = [];
  }

  // Carregar dados para condicionais
  await loadConditionalData();
};

const loadConditionalData = async () => {
  await Promise.all([getInfos(), getTags()]);

  // Carregar campos disponíveis
  fieldItens.value = [
    // Campos de variáveis do sistema
    { title: "Variável", value: "variavel" },

    // Campos do cliente
    { title: "Nome do Cliente", value: "cliente_nome" },
    { title: "Email do Cliente", value: "cliente_email" },
    { title: "Telefone do Cliente", value: "cliente_telefone" },
    { title: "Gênero do Cliente", value: "cliente_genero" },
    { title: "Valor Total Gasto", value: "cliente_valor_gasto" },
    { title: "Quantidade de Agendamentos", value: "cliente_qtd_agendamentos" },
    { title: "Data de Cadastro", value: "cliente_data_cadastro" },
    { title: "Último Agendamento", value: "cliente_ultimo_agendamento" },
    { title: "Cidade do Cliente", value: "cliente_cidade" },
    { title: "Estado do Cliente", value: "cliente_estado" },
    { title: "Endereço do Cliente", value: "cliente_endereco" },

    // Campos do agendamento
    { title: "ID do Agendamento", value: "agendamento_id" },
    { title: "Data do Agendamento", value: "agendamento_data" },
    { title: "Data Fim do Agendamento", value: "agendamento_data_fim" },
    { title: "Hora Início", value: "agendamento_hora_inicio" },
    { title: "Hora Fim", value: "agendamento_hora_fim" },
    { title: "Status do Agendamento", value: "agendamento_status" },
    { title: "Nome do Status", value: "agendamento_status_nome" },
    { title: "Profissional/Funcionário", value: "agendamento_funcionario" },
    { title: "ID do Funcionário", value: "agendamento_funcionario_id" },
    { title: "Valor do Agendamento", value: "agendamento_valor" },
    { title: "Valor Pago", value: "agendamento_valor_pago" },
    { title: "Saldo Devedor", value: "agendamento_saldo_devedor" },
    { title: "Observações", value: "agendamento_observacoes" },
    { title: "Tipo de Agendamento", value: "agendamento_tipo" },
    { title: "Serviços do Agendamento", value: "agendamento_servicos" },
    { title: "Endereço", value: "agendamento_endereco" },

    // Campos de mensagens (para wait_reply_conditional)
    { title: "Última Mensagem", value: "ultima_mensagem" },
    { title: "Última Mensagem do Cliente", value: "ultima_mensagem_cliente" },
    { title: "Última Mensagem do Sistema", value: "ultima_mensagem_sistema" },
    { title: "Contagem de Mensagens", value: "contagem_mensagens" },
    { title: "Data Última Mensagem", value: "cliente_ultima_msg_data" },
    { title: "Data Última Msg do Cliente", value: "cliente_ultima_msg_cliente_data" },
    { title: "Data Última Msg do Sistema", value: "cliente_ultima_msg_sistema_data" },

    // Campos de segmentação
    { title: "Tags", value: "tags" },
    { title: "Origem", value: "origem" },
    { title: "Estado", value: "estado" },
    { title: "Cidade", value: "cidade" },

    // Variáveis do sistema
    { title: "Data Atual", value: "data_atual" },
    { title: "Hora Atual", value: "hora_atual" },
    { title: "Dia da Semana", value: "dia_semana" },
    { title: "Mês Atual", value: "mes_atual" },
    { title: "Ano Atual", value: "ano_atual" },
  ].sort((a, b) =>
    a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" })
  );
};

watch(
  () => props.isDrawerOpen,
  async (newVal) => {
    if (newVal) {
      load();
      // Verificar configurações de IA ao abrir
      await verificarConfigIA();
    } else {
      limparFlow();
    }
  }
);

watch(
  () => props.flowData,
  (newVal) => {
    if (newVal && newVal.id) {
      isNewFlow.value = false;
      load();
    }
  }
);

// Verificar configurações de IA
const verificarConfigIA = async () => {
  verificandoIA.value = true;
  try {
    const validation = await verificarConfiguracoesIA();
    validacaoIA.value = validation;
    iaConfigurado.value = validation.configured;
    
    if (!validation.configured) {
      console.warn('⚠️ Configurações de IA incompletas:', validation.warnings);
    }
  } catch (error) {
    console.error('Erro ao verificar configurações de IA:', error);
    iaConfigurado.value = false;
  } finally {
    verificandoIA.value = false;
  }
};

const limparFlow = () => {
  flow.value = {
    id: null,
    name: "Fluxo",
    description: "",
    status: "ativo",
    trigger_type: null,
    webhook_key: "",
    cron_time: null,
    trigger_conditions: [],
    priority: 50,
    interruptible: true,
    global_keywords: [],
  };
  nodes.value = [];
  edges.value = [];
  selected.value = null;
};

const closeNavigationDrawer = () => {
  emit("update:isDrawerOpen", false);
  limparFlow();
};

const handleDrawerModelValueUpdate = (val) => {
  emit("update:isDrawerOpen", val);
};

const save = async () => {
  loading.value = true;
  try {
    // Preparar os nós com informações adicionais
    const preparedNodes = nodes.value.map((node, index) => ({
      ...node,
      originalIndex: index,
    }));

    // Preparar as conexões com índices para facilitar o mapeamento no backend
    const preparedEdges = edges.value.map((edge) => {
      const sourceIndex = nodes.value.findIndex(
        (n) => n.id === edge.source_node_id
      );
      const targetIndex = nodes.value.findIndex(
        (n) => n.id === edge.target_node_id
      );

      return {
        ...edge,
        sourceIndex: sourceIndex >= 0 ? sourceIndex : null,
        targetIndex: targetIndex >= 0 ? targetIndex : null,
        source_label:
          nodes.value.find((n) => n.id === edge.source_node_id)?.label || null,
        target_label:
          nodes.value.find((n) => n.id === edge.target_node_id)?.label || null,
      };
    });

    const body = {
      ...flow.value,
      nodes: preparedNodes,
      edges: preparedEdges,
    };

    //Verificar se o trigger_conditions é um arra
    if (
      Array.isArray(body.trigger_conditions) &&
      body.trigger_conditions.length > 0
    ) {
      //Remover o objeto "itensValueSelect"
      body.trigger_conditions.forEach((condition) => {
        delete condition.itensValueSelect;
      });
    }

    // Validação de triggers cron
    if (['cron_minuto', 'cron_diario', 'cron_hora'].includes(body.trigger_type)) {
      if (!Array.isArray(body.trigger_conditions) || body.trigger_conditions.length === 0) {
        setAlert('Triggers do tipo Cron requerem pelo menos 1 condição configurada.', 'error', 'tabler-alert-triangle', 5000);
        loading.value = false;
        return;
      }
      // Default cron_time para cron_diario
      if (body.trigger_type === 'cron_diario' && !body.cron_time) {
        body.cron_time = '08:00';
      }
    }

    // 🛡️ Tratar configurações avançadas antes de salvar

    // 1. Garantir que priority é número
    body.priority = Number(body.priority) || 50;

    // 2. Garantir que interruptible é booleano (converter para 1 ou 0 no backend)
    body.interruptible =
      body.interruptible === true || body.interruptible === 1;

    // 3. Filtrar palavras-chave vazias e garantir estrutura correta
    if (
      Array.isArray(body.global_keywords) &&
      body.global_keywords.length > 0
    ) {
      body.global_keywords = body.global_keywords.filter(
        (kw) => kw && kw.keyword && kw.keyword.trim() !== ""
      );

      // Se após filtrar não sobrou nada, definir como null
      if (body.global_keywords.length === 0) {
        body.global_keywords = null;
      }
    } else {
      body.global_keywords = null;
    }

    console.log("📤 Body a ser enviado:", {
      priority: body.priority,
      interruptible: body.interruptible,
      global_keywords: body.global_keywords,
      nodes: body.nodes?.length,
      edges: body.edges?.length,
    });

    if (flow.value.id) {
      await $api(`/flows/${flow.value.id}`, { method: "PUT", body });
    } else {
      const idNew = await $api("/flows", { method: "POST", body });
      if (idNew?.id) flow.value.id = idNew.id;
    }

    setAlert(
      `Fluxo ${isNewFlow.value ? "criado" : "atualizado"} com sucesso!`,
      "success",
      "tabler-check",
      3000
    );

    closeNavigationDrawer();
    emit("updateFlows");
  } catch (e) {
    console.error("Erro salvando fluxo", e);
    setAlert(
      e?.response?._data?.message ||
        `Erro ao ${isNewFlow.value ? "criar" : "atualizar"} fluxo!`,
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
  loading.value = false;
};

const removeNode = (nodeId) => {
  // Remove o nó
  const nodeIndex = nodes.value.findIndex((n) => n.id === nodeId);
  if (nodeIndex > -1) {
    nodes.value.splice(nodeIndex, 1);
  }

  // Remove todas as conexões relacionadas a este nó
  edges.value = edges.value.filter(
    (e) => e.source_node_id !== nodeId && e.target_node_id !== nodeId
  );

  // Deseleciona se o nó removido estava selecionado
  if (selected.value?.id === nodeId) {
    selected.value = null;
  }
};

// Funções auxiliares
const getNodeDescription = (node) => {
  switch (node.type) {
    case "start":
      return "Ponto de início do fluxo";
    case "end":
      return "Fim do fluxo";
    case "send_whatsapp":
      return "Enviar mensagem WhatsApp";
    case "send_email":
      return "Enviar email";
    case "http":
      return "Requisição HTTP";
    case "condition":
      return "Verificar condição";
    case "delay":
      return "Aguardar tempo";
    case "wait_reply":
      return "Aguardar resposta do usuário";
    case "block_flows":
      return "Bloquear/desbloquear fluxos do cliente";
    case "create_agendamento":
      return "Criar novo agendamento";
    case "update_agendamento":
      return "Atualizar agendamento existente";
    case "get_appointment":
      return "Obter informações de agendamento";
    case "update_cliente":
      return "Atualizar informações do cliente";
    case "create_negocio":
      return "Criar novo negócio no CRM";
    case "update_negocio":
      return "Atualizar negócio existente";
    case "ai_decision":
      return "Decisão inteligente com IA";
    case "ai_actions":
      return "Executar ações com IA";
    case "ai_options":
      return "Opções inteligentes com IA";
    default:
      return "Bloco de ação";
  }
};

const getNodePalette = (nodeType) => {
  const paletteItem = palette.find((p) => p.type === nodeType);
  if (paletteItem) return paletteItem;

  // Para blocos start e end que não estão na paleta
  if (nodeType === "start") {
    return {
      type: "start",
      title: "Gatilho/Start",
      icon: "tabler-bolt",
      color: "primary",
    };
  }
  if (nodeType === "end") {
    return {
      type: "end",
      title: "Saída/End",
      icon: "tabler-door-exit",
      color: "error",
    };
  }

  return {
    type: nodeType,
    title: nodeType,
    icon: "tabler-square-rounded",
    color: "grey",
  };
};

const getHttpMethodColor = (method) => {
  switch (method?.toUpperCase()) {
    case "GET":
      return "success";
    case "POST":
      return "primary";
    case "PUT":
      return "warning";
    case "DELETE":
      return "error";
    default:
      return "grey";
  }
};

const getNodeLabel = (nodeId) => {
  const node = nodes.value.find((n) => n.id === nodeId);
  return node?.label || "Nó não encontrado";
};

// Função para fazer upload de arquivos/áudio para o servidor
const uploadMediaFiles = async (files, audio) => {
  const uploadedPaths = [];
  
  try {
    // Upload de arquivos anexados
    if (files && files.length > 0) {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await $api('/zap/save-anexo', {
          method: 'POST',
          body: formData
        });
        
        if (res && res.path) {
          uploadedPaths.push(res.path);
        }
      }
    }
    
    // Upload de áudio gravado
    if (audio) {
      const formData = new FormData();
      formData.append('file', audio, 'audio-gravado.webm');
      
      const res = await $api('/zap/save-anexo', {
        method: 'POST',
        body: formData
      });
      
      if (res && res.path) {
        uploadedPaths.push(res.path);
      }
    }
    
    return uploadedPaths;
  } catch (error) {
    console.error('Erro ao fazer upload de mídias:', error);
    return [];
  }
};

// Função para processar atualização de mensagem com mídia
const handleMessageUpdate = async ($event) => {
  // Atualizar conteúdo e modelo
  selected.value.config.content = $event.content;
  selected.value.config.idModelo = $event.idModelo;
  
  // Se solicitou limpar mídia existente
  if ($event.clearMedia) {
    console.log('🗑️ Limpando mídia existente...');
    if (selected.value.config.media) {
      delete selected.value.config.media.pathFile;
      delete selected.value.config.media.pathFiles;
    }
    return;
  }
  
  // Se tem arquivos ou áudio, fazer upload
  if (($event.files && $event.files.length > 0) || $event.audio) {
    console.log('📎 Fazendo upload de mídias...', {
      files: $event.files?.length || 0,
      audio: !!$event.audio
    });
    
    const uploadedPaths = await uploadMediaFiles($event.files, $event.audio);
    
    if (uploadedPaths.length > 0) {
      // Salvar os caminhos das mídias no config
      if (!selected.value.config.media) {
        selected.value.config.media = {};
      }
      
      // Se tem múltiplos arquivos, salvar como array; senão usar o primeiro
      if (uploadedPaths.length === 1) {
        selected.value.config.media.pathFile = uploadedPaths[0];
        delete selected.value.config.media.pathFiles; // Limpar array se havia
      } else {
        selected.value.config.media.pathFiles = uploadedPaths;
        delete selected.value.config.media.pathFile; // Limpar único se havia
      }
      
      console.log('✅ Upload concluído:', uploadedPaths);
    }
  } else if (!$event.files && !$event.audio) {
    // Se não tem mídia nova E não tem clearMedia, não fazer nada
    // (mantém mídia existente se houver)
  }
};

// Função para obter todas as variáveis do fluxo
const getAllFlowVariables = () => {
  const variables = [];

  // Adicionar variáveis dos blocos wait_reply e wait_reply_conditional
  nodes.value.forEach((node) => {
    if (node.type === "wait_reply" || node.type === "wait_reply_conditional") {
      const config = node.config || {};
      if (config.variables && Array.isArray(config.variables)) {
        config.variables.forEach((variable) => {
          if (variable.name) {
            variables.push({
              value: variable.name,
              title: variable.label || variable.name,
              type: "dinamica",
            });
          }
        });
      }
    }

    // Adicionar variáveis dos blocos HTTP
    if (node.type === "http") {
      const config = node.config || {};
      if (config.responseVariables && Array.isArray(config.responseVariables)) {
        config.responseVariables.forEach((variable) => {
          if (variable.name) {
            variables.push({
              value: variable.name,
              title: variable.description || variable.name,
              type: "dinamica",
            });
          }
        });
      }
    }
  });

  return variables;
};

// Função para obter todas as variáveis disponíveis (baseadas no utils.js)
const getAllVariables = () => {
  // Variáveis do sistema baseadas no utils.js
  const systemVariables = [
    // Variáveis do cliente
    {
      title: "Nome do cliente",
      value: "cliente_nome",
      type: "cliente",
      desc: "Nome do cliente",
    },
    {
      title: "Sobrenome do cliente",
      value: "cliente_sobrenome",
      type: "cliente",
      desc: "Sobrenome do cliente",
    },
    {
      title: "Nome completo do cliente",
      value: "cliente_nomecompleto",
      type: "cliente",
      desc: "Nome completo do cliente",
    },
    {
      title: "E-mail do cliente",
      value: "cliente_email",
      type: "cliente",
      desc: "E-mail do cliente",
    },
    {
      title: "Telefone do cliente",
      value: "cliente_telefone",
      type: "cliente",
      desc: "Telefone do cliente",
    },
    {
      title: "Gênero do cliente",
      value: "cliente_genero",
      type: "cliente",
      desc: "Gênero do cliente",
    },
    {
      title: "Valor ganho total",
      value: "cliente_valor_gasto",
      type: "cliente",
      desc: "Valor total ganho pelo cliente",
    },
    {
      title: "Quantidade de pedidos",
      value: "cliente_qtd_pedidos",
      type: "cliente",
      desc: "Quantidade de pedidos do cliente",
    },
    {
      title: "Data de cadastro",
      value: "cliente_data_cadastro",
      type: "cliente",
      desc: "Data de cadastro do cliente",
    },
    {
      title: "Última compra",
      value: "cliente_ultima_compra",
      type: "cliente",
      desc: "Data da última compra",
    },

    // Variáveis do agendamento
    {
      title: "ID do agendamento",
      value: "agendamento_id",
      type: "agendamento",
      desc: "ID do agendamento",
    },
    {
      title: "Data do agendamento",
      value: "agendamento_data",
      type: "agendamento",
      desc: "Data do agendamento",
    },
    {
      title: "Hora de início",
      value: "agendamento_hora_inicio",
      type: "agendamento",
      desc: "Hora de início",
    },
    {
      title: "Hora de fim",
      value: "agendamento_hora_fim",
      type: "agendamento",
      desc: "Hora de fim",
    },
    {
      title: "Status do agendamento",
      value: "agendamento_status",
      type: "agendamento",
      desc: "Status do agendamento",
    },
    {
      title: "Nome do status",
      value: "agendamento_status_nome",
      type: "agendamento",
      desc: "Nome do status do agendamento",
    },
    {
      title: "Nome do profissional",
      value: "agendamento_funcionario_nome",
      type: "agendamento",
      desc: "Nome do profissional",
    },
    {
      title: "ID do funcionário",
      value: "agendamento_funcionario_id",
      type: "agendamento",
      desc: "ID do funcionário",
    },
    {
      title: "Valor do serviço",
      value: "agendamento_valor",
      type: "agendamento",
      desc: "Valor do serviço",
    },
    {
      title: "Observações",
      value: "agendamento_observacoes",
      type: "agendamento",
      desc: "Observações do agendamento",
    },
    {
      title: "Tipo de serviço",
      value: "agendamento_tipo_servico",
      type: "agendamento",
      desc: "Tipo de serviço",
    },
    {
      title: "Endereço",
      value: "agendamento_endereco",
      type: "agendamento",
      desc: "Endereço do agendamento",
    },

    // Variáveis de mensagens
    {
      title: "Última mensagem",
      value: "ultima_mensagem",
      type: "mensagem",
      desc: "Última mensagem enviada/recebida",
    },
    {
      title: "Última mensagem do cliente",
      value: "ultima_mensagem_cliente",
      type: "mensagem",
      desc: "Última mensagem enviada pelo cliente",
    },
    {
      title: "Última mensagem do sistema",
      value: "ultima_mensagem_sistema",
      type: "mensagem",
      desc: "Última mensagem enviada pelo sistema",
    },
    {
      title: "Contagem de mensagens",
      value: "contagem_mensagens",
      type: "mensagem",
      desc: "Quantidade total de mensagens",
    },

    // Variáveis do sistema
    {
      title: "Data atual",
      value: "data_atual",
      type: "sistema",
      desc: "Data atual",
    },
    {
      title: "Hora atual",
      value: "hora_atual",
      type: "sistema",
      desc: "Hora atual",
    },
    {
      title: "Dia da semana",
      value: "dia_semana",
      type: "sistema",
      desc: "Dia da semana atual",
    },
    {
      title: "Mês atual",
      value: "mes_atual",
      type: "sistema",
      desc: "Mês atual",
    },
    {
      title: "Ano atual",
      value: "ano_atual",
      type: "sistema",
      desc: "Ano atual",
    },
  ];

  // Adicionar variáveis dinâmicas do fluxo
  const dynamicVariables = getAllFlowVariables();

  return [...systemVariables, ...dynamicVariables];
};
</script>

<template>
  <VDialog
    persistent
    fullscreen
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="handleDrawerModelValueUpdate"
  >
    <VCard flat v-if="flow" rounded="0">
      <VCardText class="pt-5">
        <div class="linha-flex justify-space-between align-center mb-4">
          <div style="max-width: 350px; width: 100%">
            <AppTextEdit
              v-model="flow.name"
              tag="h2"
              class="text-h5"
              type="text"
              @save="flow.name = $event"
            />
          </div>
          <div class="linha-flex">
            <VBtn
              variant="outlined"
              color="secondary"
              @click="closeNavigationDrawer"
            >
              Fechar
            </VBtn>
            <VBtn color="primary" @click="save" :loading="loading">
              <VIcon icon="tabler-device-floppy" class="mr-2" />Salvar
            </VBtn>
          </div>
        </div>

        <div
          class="d-flex"
          style="height: calc(100vh - 150px); position: relative"
        >
          <!-- Painel Lateral (Blocos/Configuração) -->
          <div
            class="overflow-y-auto pa-4"
            :style="{
              width: `${resizer.currentWidth}px`,
              minWidth: `${resizer.minWidth}px`,
              maxWidth: `${resizer.maxWidth}px`,
              borderRight:
                '1px solid rgba(var(--v-border-color), var(--v-border-opacity))',
              transition: resizer.active ? 'none' : 'width 0.2s ease',
              flexShrink: 0,
            }"
          >
            <div v-if="selected" :key="selected.id">
              <div class="linha-flex justify-space-between align-center mb-4">
                <div>
                  <p class="mb-0 font-weight-bold">
                    {{ selected.label || selected.type }}
                  </p>
                  <p class="mb-0 text-disabled text-caption">
                    Configuração do bloco
                  </p>
                </div>

                <IconBtn @click="selected = null">
                  <VIcon icon="tabler-x" />
                </IconBtn>
              </div>

              <VRow>
                <VCol cols="12">
                  <AppTextField v-model="selected.label" label="Rótulo" />
                </VCol>

                <template v-if="selected.type === 'start'">
                  <VCol cols="12">
                    <AppSelect
                      v-model="flow.trigger_type"
                      :items="[
                        { value: 'webhook', title: 'Webhook' },
                        {
                          value: 'novo_agendamento',
                          title: 'Novo Agendamento Criado',
                        },
                        {
                          value: 'status_agendamento',
                          title: 'Alteração Status Agendamento',
                        },
                        {
                          value: 'mensagem_whatsapp',
                          title: 'Mensagem WhatsApp',
                        },
                        {
                          value: 'cron_minuto',
                          title: 'Executar a cada minuto',
                        },
                        {
                          value: 'cron_hora',
                          title: 'Executar a cada hora',
                        },
                        {
                          value: 'cron_diario',
                          title: 'Executar diariamente',
                        },
                      ]"
                      label="Trigger Principal"
                      placeholder="Selecione"
                    />
                  </VCol>
                  <VCol cols="12" v-if="flow.trigger_type === 'webhook'">
                    <label
                      class="v-label mb-1 text-body-2 text-high-emphasis cursor-pointer"
                    >
                      Chave Webhook

                      <VIcon
                        icon="tabler-info-circle-filled"
                        class="ml-1"
                        color="primary"
                      />

                      <VTooltip activator="parent">
                        <p
                          class="text-sm mb-0 text-center"
                          style="max-width: 300px"
                        >
                          Defina uma URL para o webhook. Você poderá utilizar a
                          chave webhook de qualquer sistema externo para
                          disparar este fluxo.<br />
                          Exemplo:
                          {{urlApi}}/flows/webhook/:chave
                        </p>
                      </VTooltip>
                    </label>
                    <AppTextField
                      v-model="flow.webhook_key"
                      placeholder="chave"
                      :persistent-hint="flow.webhook_key ? true : false"
                      :hint="`${urlApi}/flows/webhook/${flow.webhook_key}`"
                    />
                  </VCol>

                  <VCol cols="12" v-if="flow.trigger_type === 'cron_diario'">
                    <AppTextField
                      v-model="flow.cron_time"
                      type="time"
                      label="Horário de execução"
                      hint="Horário que o cron diário será executado"
                      persistent-hint
                    />
                  </VCol>

                  <VRow v-if="['cron_minuto', 'cron_hora'].includes(flow.trigger_type)" class="mx-0 mb-2">
                    <VCol cols="12" md="6">
                      <AppTextField
                        v-model="flow.cron_time_start"
                        type="time"
                        label="Horário inicial"
                        hint="Início do horário de execução (ex: 08:00)"
                        persistent-hint
                        placeholder="08:00"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <AppTextField
                        v-model="flow.cron_time_end"
                        type="time"
                        label="Horário final"
                        hint="Fim do horário de execução (ex: 18:00)"
                        persistent-hint
                        placeholder="18:00"
                      />
                    </VCol>
                    <VCol cols="12">
                      <VAlert type="info" variant="tonal" density="compact" class="mt-1">
                        <span class="text-body-2">
                          Defina o horário comercial para limitar a execução. Se não preencher, o fluxo executará 24 horas.
                        </span>
                      </VAlert>
                    </VCol>
                  </VRow>

                  <VAlert
                    v-if="['cron_minuto', 'cron_diario', 'cron_hora'].includes(flow.trigger_type)"
                    type="warning" variant="tonal" class="mb-3 mx-3"
                  >
                    <VAlertTitle>Condições obrigatórias</VAlertTitle>
                    <span class="text-body-2">Triggers Cron requerem pelo menos 1 condição configurada. Sem condições, o fluxo não será executado.</span>
                  </VAlert>

                  <!-- Condicionais do Gatilho -->
                  <VCol cols="12">
                    <VDivider class="my-4" />
                    <div class="d-flex justify-space-between align-center mb-3">
                      <h6 class="text-h6 mb-0">Condicionais do Gatilho</h6>
                      <VBtn
                        @click="addTriggerCondition"
                        variant="tonal"
                        color="primary"
                        size="small"
                        style="height: 30px"
                      >
                        <VIcon class="me-1" icon="tabler-plus" />
                        Condição
                      </VBtn>
                    </div>

                    <div
                      v-for="(condition, index) in flow.trigger_conditions"
                      :key="condition.id"
                      class="v-row align-items-center mb-4"
                    >
                      <VCol cols="12" md="6">
                        <AppSelect
                          v-model="condition.field"
                          :items="
                            fieldItens.filter((item) =>
                              condition.searchQuery
                                ? item.title
                                    ?.toLowerCase()
                                    ?.includes(
                                      condition.searchQuery?.toLowerCase()
                                    )
                                : true
                            )
                          "
                          label="Campo"
                          required
                          placeholder="Selecione o campo"
                          @update:model-value="
                            handleTriggerFieldSelect(condition)
                          "
                        >
                          <template #prepend-item>
                            <VTextField
                              label="Pesquise"
                              v-model="condition.searchQuery"
                              placeholder="Pesquisar..."
                              class="mb-2 mx-2"
                            />
                            <VDivider />
                          </template>
                        </AppSelect>
                      </VCol>

                      <VCol cols="12" md="6">
                        <AppSelect
                          v-model="condition.operator"
                          :items="getTriggerOperators(condition)"
                          label="Operador"
                          required
                          placeholder="Selecione o operador"
                        />
                      </VCol>

                      <VCol cols="12" md="6" v-if="!triggerNoValueOperators.includes(condition.operator)">
                        <AppTextField
                          v-model="condition.value"
                          required
                          :rules="[requiredValidator]"
                          :placeholder="getTriggerValuePlaceholder(condition.operator)"
                          :label="getTriggerValueLabel(condition.operator)"
                          :type="getTriggerValueInputType(condition.operator, condition.field)"
                          v-if="
                            !condition.valueIsSelect &&
                            !condition.valueIsDinheiro
                          "
                        />
                        <AppSelect
                          v-model="condition.value"
                          :items="condition.itensValueSelect"
                          label="Valor"
                          required
                          placeholder="Selecione o valor"
                          v-if="
                            condition.valueIsSelect &&
                            !condition.valueIsDinheiro
                          "
                        >
                          <template #prepend-item>
                            <VTextField
                              label="Pesquise"
                              v-model="searchQuery"
                              placeholder="Pesquisar..."
                              class="mb-2 mx-2"
                            />
                            <VDivider />
                          </template>
                        </AppSelect>
                        <Dinheiro
                          label="Valor"
                          v-model="condition.value"
                          required
                          v-if="
                            !condition.valueIsSelect &&
                            condition.valueIsDinheiro
                          "
                        />
                      </VCol>

                      <VCol cols="12" md="6" class="d-flex align-end gap-5">
                        <AppSelect
                          v-model="condition.logicalOperator"
                          :items="[
                            { title: 'E', value: 'and' },
                            { title: 'OU', value: 'or' },
                          ]"
                          label="Lógica"
                          required
                          placeholder="E/OU"
                          v-if="
                            flow.trigger_conditions.length > 1 &&
                            index < flow.trigger_conditions.length - 1
                          "
                        />
                        <IconBtn
                          @click="removeTriggerCondition(index)"
                          variant="tonal"
                          color="error"
                        >
                          <VIcon icon="tabler-trash" />
                        </IconBtn>
                      </VCol>
                      <VCol
                        cols="12"
                        class="pa-0 d-flex flex-row align-center justify-center"
                      >
                        <VDivider />
                        <span class="text-caption mx-2">{{
                          index === flow.trigger_conditions.length - 1
                            ? "-"
                            : condition.logicalOperator === "or"
                            ? "OU"
                            : "&"
                        }}</span>
                        <VDivider />
                      </VCol>
                    </div>

                    <div
                      v-if="flow.trigger_conditions.length === 0"
                      class="text-center py-4 text-medium-emphasis"
                    >
                      <VIcon icon="tabler-info-circle" class="mb-2" size="48" />
                      <p class="mb-0">Nenhuma condição configurada</p>
                      <p class="text-caption">
                        Adicione condições para filtrar quando o gatilho deve
                        ser executado
                      </p>
                    </div>
                  </VCol>

                  <!-- Cadastro Automático de Cliente -->
                  <VCol cols="12">
                    <VDivider class="my-4" />
                    <div class="d-flex justify-space-between align-center mb-3">
                      <label
                        class="v-label text-body-2 text-high-emphasis cursor-pointer d-flex align-center"
                      >
                        <span>Cadastrar cliente automaticamente</span>
                        <VIcon
                          icon="tabler-info-circle-filled"
                          class="ml-1"
                          color="primary"
                          size="20"
                        />
                        <VTooltip activator="parent" max-width="400">
                          <p class="text-sm mb-2">
                            Quando ativado, se o cliente não estiver cadastrado
                            no sistema:
                          </p>
                          <ol class="text-sm mb-0 pl-4">
                            <li>
                              O sistema tentará usar o nome do WhatsApp (se
                              configurado)
                            </li>
                            <li>
                              Caso contrário, perguntará o nome do cliente
                            </li>
                            <li>
                              Criará/atualizará o cadastro do cliente com o nome
                            </li>
                            <li>
                              Salvará automaticamente o telefone do WhatsApp
                            </li>
                          </ol>
                          <p class="text-sm mt-2 mb-0 font-weight-bold">
                            💡 Esta etapa não aparece no canvas mas acontece
                            antes do primeiro bloco
                          </p>
                        </VTooltip>
                      </label>
                      <VSwitch
                        v-model="selected.config.auto_register_client"
                        color="primary"
                        hide-details
                        density="compact"
                      />
                    </div>

                    <!-- Configurações adicionais quando auto_register_client está ativo -->
                    <VRow
                      v-if="selected.config.auto_register_client"
                      class="mt-2"
                    >
                      <VCol cols="12">
                        <div
                          class="d-flex justify-space-between align-center mb-2"
                        >
                          <label
                            class="v-label text-body-2 text-high-emphasis cursor-pointer d-flex align-center"
                          >
                            <span>Usar nome disponível no WhatsApp</span>
                            <VIcon
                              icon="tabler-info-circle-filled"
                              class="ml-1"
                              color="primary"
                              size="18"
                            />
                            <VTooltip activator="parent" max-width="350">
                              <p class="text-sm mb-0">
                                Quando ativado, o sistema tentará usar o nome do
                                contato salvo no WhatsApp. Se não conseguir
                                obter ou se o nome for numérico, pedirá o nome
                                ao cliente.
                              </p>
                            </VTooltip>
                          </label>
                          <VSwitch
                            v-model="selected.config.use_whatsapp_name"
                            color="primary"
                            hide-details
                            density="compact"
                          />
                        </div>
                      </VCol>

                      <VCol cols="12">
                        <label
                          class="v-label text-body-2 text-high-emphasis mb-2 d-block"
                        >
                          Mensagem de Saudação
                        </label>
                        <p class="text-caption text-medium-emphasis mb-2">
                          Mensagem enviada para solicitar o nome do cliente
                        </p>

                        <!-- Editor Quill para mensagem de saudação -->
                        <div class="inputQP">
                          <div id="toolbar-welcome">
                            <button class="ql-bold"></button>
                            <button class="ql-italic"></button>
                            <button class="ql-strike"></button>
                          </div>
                          <QuillEditor
                            v-model:content="selected.config.welcome_message"
                            :options="welcomeEditorOptions"
                            class="inputQP mb-3"
                            contentType="html"
                          />
                        </div>
                      </VCol>
                    </VRow>
                  </VCol>

                  <!-- 🛡️ CONFIGURAÇÕES AVANÇADAS: PRIORIDADE E PALAVRAS-CHAVE GLOBAIS -->
                  <VCol cols="12">
                    <VDivider class="my-4" />

                    <VExpansionPanels>
                      <VExpansionPanel title="Configurações Avançadas">
                        <VExpansionPanelText>
                          <!-- Prioridade do Fluxo -->
                          <VRow class="mt-4">
                            <VCol cols="12">
                              <label
                                class="v-label text-body-2 text-high-emphasis mb-2 d-flex align-center"
                              >
                                <span>Prioridade do Fluxo</span>
                                <VIcon
                                  icon="tabler-info-circle-filled"
                                  class="ml-1"
                                  color="primary"
                                  size="20"
                                />
                                <VTooltip activator="parent" max-width="400">
                                  <p class="text-sm mb-2 font-weight-bold">
                                    🎯 Sistema de Prioridades
                                  </p>
                                  <p class="text-sm mb-2">
                                    Controla qual fluxo deve ser executado
                                    quando há conflitos.
                                  </p>
                                  <ul class="text-sm mb-2 pl-4">
                                    <li>
                                      <strong>0-30:</strong> Prioridade Baixa
                                    </li>
                                    <li>
                                      <strong>31-60:</strong> Prioridade Média
                                      (padrão: 50)
                                    </li>
                                    <li>
                                      <strong>61-80:</strong> Prioridade Alta
                                    </li>
                                    <li>
                                      <strong>81-100:</strong> Prioridade
                                      Crítica
                                    </li>
                                  </ul>
                                  <p class="text-sm mb-0">
                                    💡 Fluxos com maior prioridade podem
                                    interromper fluxos com menor prioridade.
                                  </p>
                                </VTooltip>
                              </label>
                              <VSlider
                                v-model="flow.priority"
                                :min="0"
                                :max="100"
                                :step="5"
                                thumb-label="always"
                                color="primary"
                                show-ticks="always"
                                :ticks="[0, 25, 50, 75, 100]"
                              >
                                <template #prepend>
                                  <VChip
                                    size="small"
                                    :color="
                                      flow.priority <= 30
                                        ? 'warning'
                                        : flow.priority <= 60
                                        ? 'info'
                                        : flow.priority <= 80
                                        ? 'success'
                                        : 'error'
                                    "
                                  >
                                    {{ flow.priority }}
                                  </VChip>
                                </template>
                              </VSlider>
                              <p
                                class="text-caption text-center text-medium-emphasis mb-0 mt-4"
                              >
                                {{
                                  flow.priority <= 30
                                    ? "📊 Baixa"
                                    : flow.priority <= 60
                                    ? "📈 Média"
                                    : flow.priority <= 80
                                    ? "🚀 Alta"
                                    : "⚡ Crítica"
                                }}
                              </p>
                            </VCol>

                            <!-- Interruptível -->
                            <VCol cols="12">
                              <div
                                class="d-flex justify-space-between align-center"
                              >
                                <label
                                  class="v-label text-body-2 text-high-emphasis cursor-pointer d-flex align-center"
                                >
                                  <span>Pode ser interrompido</span>
                                  <VIcon
                                    icon="tabler-info-circle-filled"
                                    class="ml-1"
                                    color="primary"
                                    size="20"
                                  />
                                  <VTooltip activator="parent" max-width="350">
                                    <p class="text-sm mb-2">
                                      Quando ativado, este fluxo pode ser
                                      interrompido por outros fluxos com maior
                                      prioridade ou palavras-chave globais.
                                    </p>
                                    <p class="text-sm mb-0">
                                      🔒 Desative para fluxos críticos que não
                                      devem ser interrompidos (ex: finalização
                                      de pagamento).
                                    </p>
                                  </VTooltip>
                                </label>
                                <VSwitch
                                  v-model="flow.interruptible"
                                  color="primary"
                                  hide-details
                                  density="compact"
                                />
                              </div>
                            </VCol>

                            <!-- Palavras-chave Globais -->
                            <VCol cols="12">
                              <VDivider class="my-3" />
                              <div
                                class="d-flex justify-space-between align-center mb-3"
                              >
                                <div
                                  class="text-body-2 text-high-emphasis cursor-pointer d-flex align-center"
                                >
                                  <span>Palavras-chave Globais</span>
                                  <VIcon
                                    icon="tabler-info-circle-filled"
                                    class="ml-1"
                                    color="primary"
                                    size="20"
                                  />
                                  <VTooltip activator="parent" max-width="400">
                                    <p class="text-sm mb-2 font-weight-bold">
                                      🔑 Sistema de Palavras-chave Globais
                                    </p>
                                    <p class="text-sm mb-2">
                                      Palavras ou frases que disparam este fluxo
                                      IMEDIATAMENTE, independente do fluxo em
                                      que o cliente esteja.
                                    </p>
                                    <p class="text-sm mb-0">
                                      <strong>Exemplos:</strong> "SAIR", "MENU",
                                      "FALAR COM ATENDENTE"
                                    </p>
                                  </VTooltip>
                                </div>
                                <VBtn
                                  @click="addGlobalKeyword"
                                  variant="tonal"
                                  color="primary"
                                  size="small"
                                  style="height: 30px"
                                >
                                  <VIcon class="me-1" icon="tabler-plus" />
                                  Palavra-chave
                                </VBtn>
                              </div>

                              <div
                                v-for="(keyword, index) in flow.global_keywords"
                                :key="index"
                                class="mb-3 pa-3"
                                style="
                                  border: 1px solid
                                    rgba(
                                      var(--v-border-color),
                                      var(--v-border-opacity)
                                    );
                                  border-radius: 8px;
                                "
                              >
                                <VRow>
                                  <VCol cols="12" md="7">
                                    <AppTextField
                                      v-model="keyword.keyword"
                                      label="Palavra ou Frase"
                                      placeholder="Ex: SAIR, MENU, etc"
                                      density="compact"
                                    />
                                  </VCol>

                                  <VCol cols="12" md="5">
                                    <AppSelect
                                      v-model="keyword.matchType"
                                      :items="[
                                        { value: 'exact', title: 'Exato' },
                                        { value: 'contains', title: 'Contém' },
                                        {
                                          value: 'startsWith',
                                          title: 'Começa com',
                                        },
                                        {
                                          value: 'endsWith',
                                          title: 'Termina com',
                                        },
                                        { value: 'regex', title: 'Regex' },
                                      ]"
                                      label="Tipo de Match"
                                      density="compact"
                                    />
                                  </VCol>

                                  <VCol cols="12">
                                    <div
                                      class="d-flex justify-space-between align-center"
                                    >
                                      <p
                                        class="text-caption text-medium-emphasis mb-0"
                                      >
                                        {{
                                          keyword.matchType === "exact"
                                            ? "📍 A mensagem deve ser exatamente igual"
                                            : keyword.matchType === "contains"
                                            ? "🔍 A mensagem deve conter esta palavra"
                                            : keyword.matchType === "startsWith"
                                            ? "▶️ A mensagem deve começar com esta palavra"
                                            : keyword.matchType === "endsWith"
                                            ? "◀️ A mensagem deve terminar com esta palavra"
                                            : "🔧 Usar expressão regular"
                                        }}
                                      </p>
                                      <IconBtn
                                        @click="removeGlobalKeyword(index)"
                                        variant="tonal"
                                        color="error"
                                        size="small"
                                      >
                                        <VIcon icon="tabler-trash" size="18" />
                                      </IconBtn>
                                    </div>
                                  </VCol>
                                </VRow>
                              </div>

                              <div
                                v-if="
                                  !flow.global_keywords ||
                                  flow.global_keywords.length === 0
                                "
                                class="text-center py-3 text-medium-emphasis"
                              >
                                <VIcon
                                  icon="tabler-key-off"
                                  class="mb-1"
                                  size="32"
                                />
                                <p class="mb-0 text-caption">
                                  Nenhuma palavra-chave configurada
                                </p>
                              </div>
                            </VCol>
                          </VRow>
                        </VExpansionPanelText>
                      </VExpansionPanel>
                    </VExpansionPanels>
                  </VCol>
                </template>

                <template v-if="selected.type === 'send_whatsapp'">
                  <VCol cols="12">
                    <MessageZapBlock
                      :message="selected.config.content"
                      :media="selected.config.media"
                      :flowVariables="getAllFlowVariables()"
                      @update:message="handleMessageUpdate($event)"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'send_email'">
                  <VCol cols="12">
                    <EmailBlock
                      :email="selected.config.content"
                      @update:email="
                        selected.config.content = $event.content;
                        selected.config.idModelo = $event.idModelo;
                      "
                    />
                  </VCol>
                  <VCol cols="12">
                    <AppTextField
                      v-model="selected.config.to"
                      label="Email Destinatário (opcional)"
                      placeholder="Ex: {{cliente_email}} ou email@exemplo.com"
                      hint="Deixe vazio para usar o email do cliente"
                      persistent-hint
                    />
                  </VCol>
                  <VCol cols="12">
                    <AppTextField
                      v-model="selected.config.subject"
                      label="Assunto do Email (opcional)"
                      placeholder="Ex: Confirmação do pedido #{{pedido_numero}}"
                      hint="Deixe vazio para usar o assunto do modelo selecionado"
                      persistent-hint
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'http'">
                  <VCol cols="12">
                    <HttpBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'condition'">
                  <VCol cols="12">
                    <ConditionBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'ai_decision'">
                  <VCol cols="12">
                    <AiDecisionBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

    <template v-else-if="selected.type === 'ai_actions'">
      <VCol cols="12">
        <AiActionsBlock
          :config="selected.config"
          @update:config="selected.config = $event"
        />
      </VCol>
    </template>

    <template v-else-if="selected.type === 'ai_options'">
      <VCol cols="12">
        <AiOptionsBlock
          :config="selected.config"
          :flowVariables="getAllVariables()"
          @update:config="selected.config = $event"
        />
      </VCol>
    </template>

                <template v-else-if="selected.type === 'create_agendamento'">
                  <VCol cols="12">
                    <CreateAgendamentoBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'update_agendamento'">
                  <VCol cols="12">
                    <UpdateAgendamentoBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'update_cliente'">
                  <VCol cols="12">
                    <UpdateClienteBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'create_negocio'">
                  <VCol cols="12">
                    <CreateNegocioBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'update_negocio'">
                  <VCol cols="12">
                    <UpdateNegocioBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'get_appointment'">
                  <VCol cols="12">
                    <GetAppointmentBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'delay'">
                  <VRow>
                    <VCol cols="12" md="6">
                      <AppTextField
                        v-model.number="selected.config.delayValue"
                        type="number"
                        label="Tempo de espera"
                        placeholder="Informe o tempo"
                        min="0"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <AppSelect
                        v-model="selected.config.delayType"
                        :items="[
                          { title: 'Segundos', value: 'seconds' },
                          { title: 'Minutos', value: 'minutes' },
                          { title: 'Horas', value: 'hours' },
                          { title: 'Dias', value: 'days' }
                        ]"
                        label="Unidade de tempo"
                        placeholder="Selecione"
                      />
                    </VCol>
                  </VRow>
                </template>

                <template v-else-if="selected.type === 'wait_reply'">
                  <VCol cols="12">
                    <WaitReplyBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template
                  v-else-if="selected.type === 'wait_reply_conditional'"
                >
                  <VCol cols="12">
                    <WaitReplyConditionalBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'wait_reply_options'">
                  <VCol cols="12">
                    <WaitReplyOptionsBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'wait_for_agent'">
                  <VCol cols="12">
                    <WaitForAgentBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'redirect_flow'">
                  <VCol cols="12">
                    <RedirectFlowBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'forward_contact'">
                  <VCol cols="12">
                    <ForwardContactBlock
                      :config="selected.config"
                      :flowVariables="getAllFlowVariables()"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>

                <template v-else-if="selected.type === 'block_flows'">
                  <VCol cols="12">
                    <BlockFlowsBlock
                      :config="selected.config"
                      @update:config="selected.config = $event"
                    />
                  </VCol>
                </template>
              </VRow>

              <div class="text-right mt-4">
                <VBtn
                  color="error"
                  variant="tonal"
                  size="small"
                  @click="removeNode(selected.id)"
                  v-if="selected.type !== 'start' && selected.type !== 'end'"
                >
                  <VIcon icon="tabler-trash" class="mr-1" />
                  Remover
                </VBtn>
              </div>
            </div>

            <div class="d-flex flex-column gap-4" v-else>
              <div  v-if="!iaConfigurado" style="position: sticky; top: 10; z-index: 100">
                <VAlert type="warning" variant="tonal" class="mb-3" density="compact">
                  <VAlertTitle class="text-caption">IA não configurada</VAlertTitle>
                  <p class="text-caption mb-0">
                    Alguns blocos requerem configuração de IA para funcionar corretamente.
                  </p>
                </VAlert>
              </div>
              <p class="mb-0 text-sm">Ações</p>
              <VList>
                <VListItem
                  v-for="p in palette.filter((p) => p.categoria === 'Ações')"
                  :key="p.type"
                  @click="addNode(p.type)"
                  :disabled="blocoRequerIA(p.type) && !iaConfigurado"
                >
                  <template #prepend>
                    <VIcon
                      :icon="p.icon"
                      class="mr-2"
                      :color="p.color ? p.color : 'primary'"
                    />
                  </template>
                  {{ p.title }}
                  <template #append v-if="blocoRequerIA(p.type) && !iaConfigurado">
                    <VTooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <VIcon
                          v-bind="tooltipProps"
                          icon="tabler-alert-circle"
                          color="warning"
                          size="small"
                        />
                      </template>
                      <span>Requer configuração de IA</span>
                    </VTooltip>
                  </template>
                </VListItem>
              </VList>

              <p class="mb-0 text-sm">Lógica</p>
              <VList>
                <VListItem
                  v-for="p in palette.filter((p) => p.categoria === 'Lógica')"
                  :key="p.type"
                  @click="addNode(p.type)"
                  :disabled="blocoRequerIA(p.type) && !iaConfigurado"
                >
                  <template #prepend>
                    <VIcon
                      :icon="p.icon"
                      class="mr-2"
                      :color="p.color ? p.color : 'primary'"
                    />
                  </template>
                  {{ p.title }}
                  <template #append v-if="blocoRequerIA(p.type) && !iaConfigurado">
                    <VTooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <VIcon
                          v-bind="tooltipProps"
                          icon="tabler-alert-circle"
                          color="warning"
                          size="small"
                        />
                      </template>
                      <span>Requer configuração de IA</span>
                    </VTooltip>
                  </template>
                </VListItem>
              </VList>

              <p class="mb-0 text-sm">Agendamentos</p>
              <VList>
                <VListItem
                  v-for="p in palette.filter(
                    (p) => p.categoria === 'Agendamentos'
                  )"
                  :key="p.type"
                  @click="addNode(p.type)"
                  :disabled="blocoRequerIA(p.type) && !iaConfigurado"
                >
                  <template #prepend>
                    <VIcon
                      :icon="p.icon"
                      class="mr-2"
                      :color="p.color ? p.color : 'primary'"
                    />
                  </template>
                  {{ p.title }}
                  <template #append v-if="blocoRequerIA(p.type) && !iaConfigurado">
                    <VTooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <VIcon
                          v-bind="tooltipProps"
                          icon="tabler-alert-circle"
                          color="warning"
                          size="small"
                        />
                      </template>
                      <span>Requer configuração de IA</span>
                    </VTooltip>
                  </template>
                </VListItem>
              </VList>

              <p class="mb-0 text-sm">CRM</p>
              <VList>
                <VListItem
                  v-for="p in palette.filter((p) => p.categoria === 'CRM')"
                  :key="p.type"
                  @click="addNode(p.type)"
                  :disabled="blocoRequerIA(p.type) && !iaConfigurado"
                >
                  <template #prepend>
                    <VIcon
                      :icon="p.icon"
                      class="mr-2"
                      :color="p.color ? p.color : 'primary'"
                    />
                  </template>
                  {{ p.title }}
                  <template #append v-if="blocoRequerIA(p.type) && !iaConfigurado">
                    <VTooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <VIcon
                          v-bind="tooltipProps"
                          icon="tabler-alert-circle"
                          color="warning"
                          size="small"
                        />
                      </template>
                      <span>Requer configuração de IA</span>
                    </VTooltip>
                  </template>
                </VListItem>
              </VList>

              <p class="mb-0 text-sm">IA</p>
              <VAlert 
                v-if="!iaConfigurado" 
                type="warning" 
                variant="tonal" 
                class="mb-3"
                density="compact"
              >
                <VAlertTitle class="text-caption">IA não configurada</VAlertTitle>
                <p class="text-caption mb-0">
                  Configure em: CRM > Configurações > Atendente Virtual
                </p>
              </VAlert>
              <VList>
                <VListItem
                  v-for="p in palette.filter(
                    (p) => p.categoria === 'IA'
                  )"
                  :key="p.type"
                  @click="addNode(p.type)"
                  :disabled="!iaConfigurado"
                >
                  <template #prepend>
                    <VIcon
                      :icon="p.icon"
                      class="mr-2"
                      :color="p.color ? p.color : 'primary'"
                    />
                  </template>
                  {{ p.title }}
                  <template #append v-if="!iaConfigurado">
                    <VTooltip location="top">
                      <template #activator="{ props: tooltipProps }">
                        <VIcon
                          v-bind="tooltipProps"
                          icon="tabler-alert-circle"
                          color="warning"
                          size="small"
                        />
                      </template>
                      <span>Requer configuração de IA</span>
                    </VTooltip>
                  </template>
                </VListItem>
              </VList>

              <p class="mb-0 text-sm">Tempo</p>
              <VList>
                <VListItem
                  v-for="p in palette.filter((p) => p.categoria === 'Tempo')"
                  :key="p.type"
                  @click="addNode(p.type)"
                >
                  <VIcon
                    :icon="p.icon"
                    class="mr-2"
                    :color="p.color ? p.color : 'primary'"
                  />
                  {{ p.title }}
                </VListItem>
              </VList>
            </div>
          </div>

          <!-- Redimensionador -->
          <div
            class="resizer"
            @mousedown="onResizerMouseDown"
            :class="{ 'resizer-active': resizer.active }"
          >
            <div class="resizer-handle">
              <VIcon
                icon="tabler-dots-vertical"
                size="16"
                color="medium-emphasis"
              />
            </div>
          </div>

          <!-- Área do Canvas -->
          <div
            class="flex-grow-1 position-relative pa-0"
            style="overflow: hidden"
          >
            <!-- Controles de Zoom -->
            <div
              class="position-absolute"
              style="top: 15px; right: 15px; z-index: 100"
            >
              <VBtnGroup variant="elevated">
                <VBtn
                  @click="zoomIn"
                  color="primary"
                  size="small"
                  :disabled="canvas.zoom >= canvas.maxZoom"
                  style="height: 35px"
                  rounded="lg"
                >
                  <VIcon icon="tabler-zoom-in" />
                  <VTooltip activator="parent">Aumentar Zoom</VTooltip>
                </VBtn>
                <VBtn
                  @click="resetZoom"
                  color="secondary"
                  size="small"
                  style="height: 35px"
                  rounded="lg"
                >
                  {{ Math.round(canvas.zoom * 100) }}%
                  <VTooltip activator="parent">Resetar Zoom e Posição</VTooltip>
                </VBtn>
                <VBtn
                  @click="zoomOut"
                  color="primary"
                  size="small"
                  :disabled="canvas.zoom <= canvas.minZoom"
                  style="height: 35px"
                  rounded="lg"
                >
                  <VIcon icon="tabler-zoom-out" />
                  <VTooltip activator="parent">Diminuir Zoom</VTooltip>
                </VBtn>
              </VBtnGroup>
            </div>

            <div
              ref="canvasRef"
              class="position-relative"
              style="
                height: 100%;
                background: #f8f9fa;
                border-radius: 5px;
                background-image: radial-gradient(
                  circle,
                  #ddd 1px,
                  transparent 1px
                );
                background-size: 20px 20px;
                overflow: hidden;
                cursor: grab;
              "
              @mousedown="onCanvasMouseDown"
              @mousemove="onCanvasMouseMove"
              @mouseup="onCanvasMouseUp"
              @mouseleave="onCanvasMouseUp"
              @wheel="onCanvasWheel"
            >
              <!-- Container com transform para zoom e pan -->
              <div
                :style="{
                  transform: `translate(${canvas.pan.x}px, ${canvas.pan.y}px) scale(${canvas.zoom})`,
                  transformOrigin: '0 0',
                  width: '10000px',
                  height: '10000px',
                  position: 'relative',
                }"
              >
                <!-- SVG para as conexões -->
                <svg
                  class="position-absolute"
                  style="
                    top: 0;
                    left: 0;
                    width: 10000px;
                    height: 10000px;
                    z-index: 1;
                    pointer-events: auto;
                  "
                >
                  <!-- Conexões existentes -->
                  <g v-for="(edge, i) in edges" :key="'edge-' + i">
                    <path
                      :d="
                        getConnectionPath(
                          edge.source_node_id,
                          edge.target_node_id
                        )
                      "
                      stroke="#5c6ac4"
                      stroke-width="2"
                      fill="none"
                      stroke-dasharray="5,5"
                      class="cursor-pointer"
                      @click="removeEdge(i)"
                      @contextmenu.prevent="showEdgeMenu($event, edge, i)"
                    />
                    <!-- Label da conexão -->
                    <text
                      v-if="edge.label"
                      :x="
                        getConnectionLabelX(
                          edge.source_node_id,
                          edge.target_node_id
                        )
                      "
                      :y="
                        getConnectionLabelY(
                          edge.source_node_id,
                          edge.target_node_id
                        )
                      "
                      text-anchor="middle"
                      font-size="12"
                      fill="#5c6ac4"
                      font-weight="bold"
                      class="cursor-pointer"
                      @click="removeEdge(i)"
                      @contextmenu.prevent="showEdgeMenu($event, edge, i)"
                    >
                      {{ edge.label }}
                    </text>
                  </g>

                  <!-- Conexão ativa (arrastando) -->
                  <path
                    v-if="connecting.active"
                    :d="getActiveConnectionPath()"
                    stroke="#ff6b6b"
                    stroke-width="2"
                    fill="none"
                    stroke-dasharray="3,3"
                  />
                </svg>

                <!-- Nós -->
                <div
                  v-for="node in nodes"
                  :key="node.id"
                  :data-node-id="node.id"
                  class="position-absolute rounded-lg node-card cursor-grab transition-all duration-200 hover:shadow-lg"
                  :class="[
                    selected?.id === node.id ? 'ring-2 ring-primary' : '',
                    `bg-${getNodePalette(node.type).color}-50`,
                    `border-${getNodePalette(node.type).color}-300`,
                    drag.active && drag.nodeId === node.id
                      ? 'cursor-grabbing'
                      : 'cursor-grab',
                  ]"
                  :style="{
                    left: node.position_x + 'px',
                    top: node.position_y + 'px',
                    width: NODE_WIDTH + 'px',
                    minHeight:
                      (node.type === 'wait_reply_options' || node.type === 'ai_options') &&
                      node.config?.options?.length > 3
                        ? 120 + (node.config.options.length - 3) * 20 + 'px'
                        : 'auto',
                    zIndex: selected?.id === node.id ? 10 : 2,
                  }"
                  @mousedown="(e) => onMouseDownNode(e, node.id)"
                  @click="selectNode(node)"
                  @contextmenu.prevent="node.viewMenu = true"
                >
                  <VMenu
                    v-model="node.viewMenu"
                    activator="parent"
                    v-if="node.viewMenu"
                  >
                    <VList>
                      <VListItem @click="selectNode(node)">
                        <VIcon
                          icon="tabler-settings"
                          class="mr-2"
                          color="primary"
                        />
                        Configurar
                      </VListItem>
                      <VListItem
                        @click="duplicateNode(node)"
                        v-if="node.type !== 'start' && node.type !== 'end'"
                      >
                        <VIcon icon="tabler-copy" class="mr-2" color="info" />
                        Duplicar
                      </VListItem>
                      <VListItem @click="resetNodeConnections(node.id)">
                        <VIcon
                          icon="tabler-refresh"
                          class="mr-2"
                          color="warning"
                        />
                        Resetar Conexões
                      </VListItem>
                      <VListItem
                        @click="removeNode(node.id)"
                        v-if="node.type !== 'start' && node.type !== 'end'"
                      >
                        <VIcon icon="tabler-trash" class="mr-2" color="error" />
                        Remover
                      </VListItem>
                    </VList>
                  </VMenu>
                  <!-- Header do nó -->
                  <div class="d-flex align-center pa-3 pb-2">
                    <VAvatar
                      :color="getNodePalette(node.type).color"
                      size="32"
                      class="mr-3"
                    >
                      <VIcon :icon="getNodePalette(node.type).icon" />
                    </VAvatar>
                    <div class="flex-grow-1">
                      <p
                        class="text-sm font-weight-medium mb-0 text-h6 text-black"
                      >
                        {{ node.label }}
                      </p>
                      <p class="text-xs text-medium-emphasis mb-0 text-black">
                        {{ getNodeDescription(node) }}
                      </p>
                    </div>
                  </div>

                  <!-- Conteúdo específico do nó -->
                  <div class="px-3 pb-3">
                    <div v-if="node.type === 'send_whatsapp'" class="text-xs">
                      <div class="bg-white rounded pa-2 border">
                        <div
                          class="text-caption text-medium-emphasis mb-1 text-disabled text-black"
                        >
                          Preview:
                        </div>
                        <VCard
                          color="#fff"
                          rounded="0"
                          class="pa-3"
                          variant="flat"
                        >
                          <div
                            class="html-content"
                            style="max-height: 100px; overflow-y: auto"
                            v-html="node.config?.content || 'Mensagem...'"
                          ></div>
                          
                          <!-- Indicador de mídia -->
                          <div v-if="node.config?.media?.pathFile || (node.config?.media?.pathFiles && node.config.media.pathFiles.length > 0)" class="mt-2">
                            <VChip
                              size="x-small"
                              color="success"
                              variant="tonal"
                            >
                              <VIcon 
                                :icon="node.config.media.pathFile?.match(/\.(mp3|wav|ogg|webm|m4a)$/i) ? 'tabler-microphone' : 'tabler-paperclip'" 
                                size="14" 
                                class="me-1" 
                              />
                              {{ node.config.media.pathFiles ? `${node.config.media.pathFiles.length} arquivos` : 'Mídia anexada' }}
                            </VChip>
                          </div>
                        </VCard>
                      </div>
                    </div>

                    <div v-else-if="node.type === 'send_email'" class="text-xs">
                      <div class="bg-white rounded pa-2 border">
                        <div
                          class="text-caption text-medium-emphasis mb-1 text-disabled text-black"
                        >
                          Preview:
                        </div>
                        <VCard
                          color="#fff"
                          rounded="0"
                          class="pa-3"
                          variant="flat"
                        >
                          <div
                            class="html-content"
                            style="max-height: 100px; overflow-y: auto"
                            v-html="node.config?.content?.html || 'Mensagem...'"
                          ></div>
                        </VCard>
                      </div>
                    </div>

                    <div v-else-if="node.type === 'http'" class="text-xs">
                      <VChip
                        size="x-small"
                        :color="getHttpMethodColor(node.config?.method)"
                        class="mr-1"
                      >
                        {{ node.config?.method || "GET" }}
                      </VChip>
                      <div class="text-truncate mt-1">
                        {{ node.config?.url || "URL..." }}
                      </div>
                    </div>

                    <div v-else-if="node.type === 'condition'" class="text-xs">
                      <div class="text-caption text-medium-emphasis">
                        Condições ({{ node.config?.conditions?.length || 0 }})
                      </div>
                      <div
                        v-if="node.config?.conditions?.length > 0"
                        class="text-truncate"
                      >
                        {{ node.config.conditions[0].field || "campo" }}
                        {{ node.config.conditions[0].operator || "op" }}
                        {{ node.config.conditions[0].value || "valor" }}
                        <span v-if="node.config.conditions.length > 1">
                          ... +{{ node.config.conditions.length - 1 }} mais
                        </span>
                      </div>
                      <div v-else class="text-truncate">
                        Nenhuma condição configurada
                      </div>
                    </div>

                    <div v-else-if="node.type === 'ai_decision'" class="text-xs">
                      <div class="text-caption text-medium-emphasis">
                        Decisão IA
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.instructions ? 'Configurado' : 'Sem instruções' }}
                      </div>
                    </div>

    <div v-else-if="node.type === 'ai_actions'" class="text-xs">
      <div class="text-caption text-medium-emphasis">
        Ações IA
      </div>
      <div class="text-truncate">
        {{
          Object.values(node.config?.capabilities || {}).filter(v => v).length
        }} capacidades ativas
      </div>
    </div>

    <div v-else-if="node.type === 'ai_options'" class="text-xs">
      <div class="text-caption text-medium-emphasis">
        Opções IA
      </div>
      <div class="text-truncate">
        {{ node.config?.options?.length || 0 }} opções configuradas
      </div>
    </div>

                    <div
                      v-else-if="node.type === 'create_agendamento'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Criar Agendamento
                      </div>
                      <div class="text-truncate">
                        Data: {{ node.config?.data || "..." }} -
                        {{ node.config?.horaInicio || "..." }}
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'update_agendamento'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Atualizar Agendamento
                      </div>
                      <div class="text-truncate">
                        ID: {{ node.config?.agendamentoId || "..." }}
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'update_cliente'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Atualizar Cliente
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.actions?.length || 0 }} ação(ões)
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'create_negocio'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Criar Negócio
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.titulo || "Novo negócio" }}
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'update_negocio'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Atualizar Negócio
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.actions?.length || 0 }} ação(ões)
                      </div>
                    </div>

                    <div v-else-if="node.type === 'delay'" class="text-xs">
                      <div class="text-caption text-medium-emphasis">
                        Aguardar
                      </div>
                      <div>
                        {{ node.config?.delayValue || node.config?.seconds || 0 }}
                        {{ 
                          node.config?.delayType === 'minutes' ? 'min' :
                          node.config?.delayType === 'hours' ? 'h' :
                          node.config?.delayType === 'days' ? 'd' :
                          's'
                        }}
                      </div>
                    </div>

                    <div v-else-if="node.type === 'wait_reply'" class="text-xs">
                      <div class="text-caption text-medium-emphasis">
                        Aguardar Resposta
                      </div>
                      <div class="text-truncate">
                        {{ 
                          node.config?.timeoutValue || node.config?.timeoutSeconds || "∞" 
                        }}{{ 
                          node.config?.timeoutType === 'minutes' ? 'min' :
                          node.config?.timeoutType === 'hours' ? 'h' :
                          node.config?.timeoutType === 'days' ? 'd' :
                          's'
                        }} timeout
                        <span
                          v-if="node.config?.variables?.length > 0"
                          class="ml-2"
                        >
                          + {{ node.config.variables.length }} var
                        </span>
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'wait_reply_conditional'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Aguardar Resposta Condicional
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.timeoutSeconds || "∞" }}s timeout
                        <span
                          v-if="node.config?.variables?.length > 0"
                          class="ml-2"
                        >
                          + {{ node.config.variables.length }} var
                        </span>
                        <span
                          v-if="node.config?.conditions?.length > 0"
                          class="ml-2"
                        >
                          + {{ node.config.conditions.length }} cond
                        </span>
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'wait_reply_options' || node.type === 'ai_options'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        {{ node.type === 'ai_options' ? 'Opções com IA' : 'Menu de Opções' }}
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.options?.length || 0 }} opção(ões)
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'wait_for_agent'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Aguardar Atendimento
                      </div>
                      <div class="text-truncate">
                        <VIcon icon="tabler-lock" size="12" class="me-1" />
                        Bloqueia fluxos automáticos
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'redirect_flow'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Redirecionar Fluxo
                      </div>
                      <div class="text-truncate">
                        {{
                          node.config?.targetFlowId
                            ? "Fluxo selecionado"
                            : "Nenhum fluxo"
                        }}
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'forward_contact'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        Encaminhar Contato
                      </div>
                      <div class="text-truncate">
                        {{ node.config?.phones?.length || 0 }} número(s) -
                        {{
                          node.config?.forwardType === "ordered"
                            ? "Ordenada"
                            : node.config?.forwardType === "random"
                            ? "Aleatória"
                            : "Todos"
                        }}
                      </div>
                    </div>

                    <div
                      v-else-if="node.type === 'block_flows'"
                      class="text-xs"
                    >
                      <div class="text-caption text-medium-emphasis">
                        {{
                          node.config?.action === "block"
                            ? "Bloquear Fluxos"
                            : "Desbloquear Fluxos"
                        }}
                      </div>
                      <div class="text-truncate">
                        <VIcon
                          :icon="
                            node.config?.action === 'block'
                              ? 'tabler-lock'
                              : 'tabler-lock-open'
                          "
                          size="12"
                          class="me-1"
                        />
                        {{
                          node.config?.action === "block"
                            ? "Bloqueio Permanente"
                            : "Remover Bloqueio"
                        }}
                      </div>
                    </div>

                    <div v-else-if="node.type === 'get_appointment'" class="text-xs">
                      <div class="text-caption text-medium-emphasis">
                        Obter Agendamento
                      </div>
                      <div class="text-truncate">
                        Máx. {{ node.config?.maxAttempts || 3 }} tentativas
                      </div>
                    </div>
                  </div>

                  <!-- Conectores -->
                  <!-- Conectores de entrada -->
                  <div
                    class="connection-point connection-in position-absolute"
                    style="left: -8px; top: 50%; transform: translateY(-50%)"
                  >
                    <div class="connection-dot">
                      <VIcon icon="tabler-arrows-move" size="12" />
                    </div>
                  </div>

                  <!-- Conectores de saída -->
                  <template
                    v-if="
                      node.type === 'condition' ||
                      node.type === 'wait_reply_conditional' ||
                      node.type === 'ai_decision'
                    "
                  >
                    <!-- Saída SIM -->
                    <div
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 40%; transform: translateY(-50%)"
                      @mousedown="(e) => startConnection(e, node.id, 'SIM')"
                    >
                      <div class="connection-dot connection-sim"></div>
                      <div class="connection-label">SIM</div>
                    </div>

                    <!-- Saída NÃO -->
                    <div
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 60%; transform: translateY(-50%)"
                      @mousedown="(e) => startConnection(e, node.id, 'NÃO')"
                    >
                      <div class="connection-dot connection-nao"></div>
                      <div class="connection-label">NÃO</div>
                    </div>

                    <!-- Saída Tempo Expirado -->
                    <div
                      v-if="node.type === 'wait_reply_conditional'"
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 80%; transform: translateY(-50%)"
                      @mousedown="
                        (e) => startConnection(e, node.id, 'Tempo Expirado')
                      "
                    >
                      <div class="connection-dot connection-nao"></div>
                      <div class="connection-label">Tempo Expirado</div>
                    </div>
                  </template>

                  <!-- Conectores de saída para Menu de Opções -->
                  <template v-else-if="node.type === 'wait_reply_options' || node.type === 'ai_options'">
                    <div
                      v-for="(option, index) in node.config?.options || []"
                      :key="option.id"
                      class="connection-point connection-out position-absolute"
                      :style="`right: -8px; top: ${
                        20 +
                        (index * 50) /
                          Math.max(1, node.config?.options?.length || 1)
                      }%; transform: translateY(-50%)`"
                      @mousedown="
                        (e) => startConnection(e, node.id, `OPÇÃO_${index + 1}`)
                      "
                    >
                      <div
                        class="connection-dot"
                        :class="`connection-option-${index % 3}`"
                      ></div>
                      <div class="connection-label">{{ index + 1 }}</div>
                    </div>

                    <!-- Saída para Opção Inválida -->
                    <div
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 85%; transform: translateY(-50%)"
                      @mousedown="
                        (e) => startConnection(e, node.id, 'OPÇÃO_INVÁLIDA')
                      "
                    >
                      <div class="connection-dot connection-nao"></div>
                      <div class="connection-label">Inválida</div>
                    </div>
                  </template>

                  <!-- Conectores de saída para Obter Agendamento -->
                  <template v-else-if="node.type === 'get_appointment'">
                    <!-- Saída padrão (Agendamento Encontrado) -->
                    <div
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 40%; transform: translateY(-50%)"
                      @mousedown="(e) => startConnection(e, node.id)"
                    >
                      <div class="connection-dot connection-sim"></div>
                      <div class="connection-label">Encontrado</div>
                    </div>

                    <!-- Saída para Agendamento Não Encontrado -->
                    <div
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 75%; transform: translateY(-50%)"
                      @mousedown="
                        (e) =>
                          startConnection(e, node.id, 'AGENDAMENTO_NÃO_ENCONTRADO')
                      "
                    >
                      <div class="connection-dot connection-nao"></div>
                      <div class="connection-label">Não Encontrado</div>
                    </div>
                  </template>

                  <!-- Conector de saída padrão -->
                  <template
                    v-else-if="
                      node.type !== 'redirect_flow' && node.type !== 'end'
                    "
                  >
                    <div
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 50%; transform: translateY(-50%)"
                      @mousedown="(e) => startConnection(e, node.id)"
                    >
                      <div class="connection-dot"></div>
                    </div>

                    <!-- Saída Tempo Expirado -->
                    <div
                      v-if="node.type === 'wait_reply'"
                      class="connection-point connection-out position-absolute"
                      style="right: -8px; top: 80%; transform: translateY(-50%)"
                      @mousedown="
                        (e) => startConnection(e, node.id, 'Tempo Expirado')
                      "
                    >
                      <div class="connection-dot connection-nao"></div>
                      <div class="connection-label">Tempo Expirado</div>
                    </div>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
      </VCardText>
    </VCard>

    <!-- Menu de contexto para conexões -->
    <VMenu
      v-model="edgeMenu.show"
      :location="`${edgeMenu.x}px ${edgeMenu.y}px`"
      @update:model-value="hideEdgeMenu"
    >
      <VList density="compact">
        <VListItem @click="confirmRemoveEdge">
          <VIcon icon="tabler-trash" class="me-2" color="error" />
          Remover Conexão
        </VListItem>
        <VListItem @click="hideEdgeMenu">
          <VIcon icon="tabler-x" class="me-2" />
          Cancelar
        </VListItem>
      </VList>
    </VMenu>
  </VDialog>
</template>

<style scoped>
.connection-point {
  width: 16px;
  height: 16px;
  cursor: pointer;
  z-index: 5;
}

.connection-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #5c6ac4;
  border: 2px solid white;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  transition: all 0.2s ease;
  color: #fff !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.connection-point:hover .connection-dot {
  background: #4c5ac4;
  transform: scale(1.2);
}

.connection-out .connection-dot {
  background: #5c6ac4;
}

.connection-in .connection-dot {
  background: #28a745;
}

.connection-sim {
  background: #28a745 !important;
}

.connection-nao {
  background: #dc3545 !important;
}

.connection-option-0 {
  background: #9c27b0 !important;
}

.connection-option-1 {
  background: #2196f3 !important;
}

.connection-option-2 {
  background: #ff9800 !important;
}

.connection-label {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: bold;
  color: #666;
  pointer-events: none;
  white-space: nowrap;
}

.cursor-pointer {
  cursor: pointer;
}

.cursor-grabbing {
  cursor: grabbing;
}

.cursor-grab {
  cursor: grab;
}

/* Estilo para quando está arrastando */
.dragging {
  transform: rotate(2deg);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  z-index: 1000;
}

/* Impedir seleção de texto durante o drag */
.no-select {
  user-select: none;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
}

/* Estilo para o canvas quando está em modo pan */
.canvas-panning {
  cursor: grabbing !important;
}

/* Estilos para o redimensionador */
.resizer {
  width: 8px;
  cursor: ew-resize;
  background: transparent;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.2s ease;
  flex-shrink: 0;
}

.resizer:hover {
  background-color: rgba(var(--v-theme-primary), 0.1);
}

.resizer-active {
  background-color: rgba(var(--v-theme-primary), 0.2) !important;
}

.resizer-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 40px;
  width: 100%;
  background: rgba(var(--v-theme-surface), 0.8);
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.2s ease;
}

.resizer:hover .resizer-handle,
.resizer-active .resizer-handle {
  opacity: 1;
}
</style>
