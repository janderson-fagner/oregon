<script setup>
import { can } from "@layouts/plugins/casl";
import { useFunctions } from "@/composables/useFunctions";
import { isDaviot } from "@/utils/typeClient";
import { useTheme } from "vuetify";
const systemName = isDaviot() ? "Daviot" : "Oregon";
import moment from "moment";
import "moment/dist/locale/pt-br";
moment.locale("pt-br");

const { formatDateAgendamento, escreverEndereco, formatValue } = useFunctions();
const router = useRouter();
const vuetifyTheme = useTheme();

const userData = useCookie("userData").value;
const userName = userData.fullName?.split(" ")[0];

const isDark = computed(() => vuetifyTheme.global.current.value.dark);

// Saudação e gradiente dinâmico por hora do dia
const hour = new Date().getHours();
const greeting =
  hour >= 18 || hour < 6 ? "Boa noite" : hour >= 12 ? "Boa tarde" : "Bom dia";
const greetingIcon =
  hour >= 18 || hour < 6
    ? "tabler-moon-stars"
    : hour >= 12
    ? "tabler-sun"
    : "tabler-sunrise";

// Gradientes que simulam o céu conforme a hora
const getSkyGradient = () => {
  // Amanhecer (5h-7h) — rosa quente com laranja dourado
  if (hour >= 5 && hour < 7) {
    return {
      light:
        "linear-gradient(135deg, #f97316 0%, #fb923c 30%, #f472b6 70%, #c084fc 100%)",
      dark: "linear-gradient(135deg, #9a3412 0%, #b45309 30%, #9d174d 70%, #6b21a8 100%)",
    };
  }
  // Manhã (7h-12h) — azul claro e limpo
  if (hour >= 7 && hour < 12) {
    return {
      light: "linear-gradient(135deg, #38bdf8 0%, #60a5fa 40%, #818cf8 100%)",
      dark: "linear-gradient(135deg, #0c4a6e 0%, #1e3a5f 40%, #312e81 100%)",
    };
  }
  // Tarde (12h-16h) — azul profundo com dourado quente
  if (hour >= 12 && hour < 16) {
    return {
      light:
        "linear-gradient(135deg, #2563eb 0%, #3b82f6 40%, #60a5fa 80%, #fbbf24 100%)",
      dark: "linear-gradient(135deg, #1e3a5f 0%, #1e40af 40%, #1d4ed8 80%, #92400e 100%)",
    };
  }
  // Pôr do sol (16h-19h) — laranja intenso, rosa e roxo
  if (hour >= 16 && hour < 19) {
    return {
      light:
        "linear-gradient(135deg, #f59e0b 0%, #ef4444 30%, #ec4899 60%, #8b5cf6 100%)",
      dark: "linear-gradient(135deg, #92400e 0%, #991b1b 30%, #831843 60%, #4c1d95 100%)",
    };
  }
  // Noite (19h-23h) — azul escuro profundo com toques de roxo
  if (hour >= 19 && hour < 23) {
    return {
      light:
        "linear-gradient(135deg, #1e3a5f 0%, #312e81 40%, #4c1d95 70%, #0f172a 100%)",
      dark: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 40%, #2e1065 70%, #020617 100%)",
    };
  }
  // Madrugada (23h-5h) — noite profunda, quase preto com azul
  return {
    light: "linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0c0a1a 100%)",
    dark: "linear-gradient(135deg, #020617 0%, #0f0d24 50%, #000000 100%)",
  };
};

const skyGradient = getSkyGradient();
const heroGradient = computed(() =>
  isDark.value ? skyGradient.dark : skyGradient.light
);
// Texto sempre branco no hero pois todos os gradientes são escuros/vibrantes o suficiente
const isNightTime = hour >= 19 || hour < 7;

// Atalhos rápidos
const actions = [
  {
    title: "Agenda",
    icon: "tabler-calendar",
    to: "agendamento",
    color: "#7c5cfc",
    show: can("view", "agendamento") || can("view-all", "agendamento"),
  },
  {
    title: "Relatórios",
    icon: "tabler-chart-bar",
    to: "relatorios",
    color: "#0ea5e9",
    show:
      can("view", "relatorio_agendamentos") ||
      can("view", "relatorio_clientes") ||
      can("view", "relatorio_servicos") ||
      can("view", "relatorio_financeiro") ||
      can("view", "relatorio_crm"),
  },
  {
    title: "Serviços",
    icon: "tabler-tools",
    to: "servicos",
    color: "#f59e0b",
    show: can("view", "servico"),
  },
  {
    title: "Clientes",
    icon: "tabler-users-group",
    to: "clientes",
    color: "#10b981",
    show: can("view", "cliente"),
  },
  {
    title: "Lembretes",
    icon: "tabler-bell-ringing",
    to: "lembretes",
    color: "#ef4444",
    show: true,
  },
  {
    title: "Comissões",
    icon: "tabler-gift-card",
    to: "comissoes",
    color: "#8b5cf6",
    show: can("view", "financeiro_comissao"),
  },
  {
    title: "Pagamentos",
    icon: "tabler-wallet",
    to: "pagamentos",
    color: "#06b6d4",
    show:
      can("view", "financeiro_comissao") || can("view", "financeiro_despesa"),
  },
  {
    title: "Usuários",
    icon: "tabler-users",
    to: "/apps/user/list",
    color: "#64748b",
    show: can("manage", "config_user"),
  },
  {
    title: "Config",
    icon: "tabler-settings",
    to: "configuracoes",
    color: "#78716c",
    show: can("manage", "config_gerais"),
  },
];

// Agendamentos do dia
const agendamentosDia = ref([]);
const totalAgendamentosDia = ref(0);
const loadingAgendamentosDia = ref(false);

const widgetAgendamentos = ref([
  {
    title: "Hoje",
    periodo: "dia",
    icon: "tabler-calendar-event",
    gradient: "linear-gradient(135deg, #f59e0b, #f97316)",
    total: 0,
  },
  {
    title: "Semana",
    periodo: "semana",
    icon: "tabler-calendar-week",
    gradient: "linear-gradient(135deg, #7c5cfc, #a78bfa)",
    total: 0,
  },
  {
    title: "Mês",
    periodo: "mes",
    icon: "tabler-calendar-month",
    gradient: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
    total: 0,
  },
]);

const getAgendamentosDia = async () => {
  if (!can("view", "agendamento") && !can("view-all", "agendamento")) return;
  loadingAgendamentosDia.value = true;

  try {
    const res = await $api("/agenda/agendamentos", {
      method: "GET",
      query: {
        notBloqueio: true,
        start: moment().format("YYYY-MM-DD"),
        end: moment().format("YYYY-MM-DD"),
        fun_id: !can("view-all", "agendamento") ? userData.id : null,
      },
    });
    if (!res) throw new Error("Erro ao obter agendamentos");

    agendamentosDia.value = res.slice(0, 5);
    totalAgendamentosDia.value = res.length;

    for (let widget of widgetAgendamentos.value) {
      widget.total = await getTotalAgendamentos(widget.periodo);
    }
  } catch (error) {
    console.error("Error fetching agendamentos dia:", error);
    totalAgendamentosDia.value = 0;
    agendamentosDia.value = [];
  } finally {
    loadingAgendamentosDia.value = false;
  }
};

const getTotalAgendamentos = async (periodo = "dia") => {
  let dataInicio = moment().format("YYYY-MM-DD");
  let dataFim = moment().format("YYYY-MM-DD");

  if (periodo == "semana") {
    dataInicio = moment().startOf("week").format("YYYY-MM-DD");
    dataFim = moment().endOf("week").format("YYYY-MM-DD");
  } else if (periodo == "mes") {
    dataInicio = moment().startOf("month").format("YYYY-MM-DD");
    dataFim = moment().endOf("month").format("YYYY-MM-DD");
  }

  try {
    const res = await $api("/agenda/agendamentos", {
      method: "GET",
      query: {
        notBloqueio: true,
        onlyCount: true,
        start: dataInicio,
        end: dataFim,
        fun_id: !can("view-all", "agendamento") ? userData.id : null,
      },
    });
    return res?.total || 0;
  } catch (error) {
    console.error("Error fetching total agendamentos:", error);
    return 0;
  }
};

// Financeiro
const dataDeQuery = ref(moment().startOf("month").format("YYYY-MM-DD"));
const dataAteQuery = ref(moment().endOf("month").format("YYYY-MM-DD"));
const mesAtual = moment().format("MMMM [de] YYYY");

const widgetData = ref([
  {
    title: "A Pagar",
    value: 0,
    icon: "tabler-credit-card",
    gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",
    typesText: "",
  },
  {
    title: "Em Aberto",
    value: 0,
    icon: "tabler-clock-pause",
    gradient: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
    typesText: "",
  },
  {
    title: "Pago",
    value: 0,
    icon: "tabler-circle-check",
    gradient: "linear-gradient(135deg, #10b981, #34d399)",
    typesText: "",
  },
  {
    title: "Em Atraso",
    value: 0,
    icon: "tabler-alert-triangle",
    gradient: "linear-gradient(135deg, #ef4444, #f87171)",
    typesText: "",
  },
]);

const loadingDespesa = ref(false);

const getPagar = async () => {
  if (!can("view", "financeiro_despesa") || !can("view", "financeiro_comissao"))
    return;
  if (!dataDeQuery.value || !dataAteQuery.value) return;
  loadingDespesa.value = true;

  let queryPagar = {
    itemsPerPage: 10000,
    dataDe: dataDeQuery.value,
    dataAte: dataAteQuery.value,
  };

  if (
    can("view", "financeiro_comissao") &&
    !can("view", "financeiro_despesa")
  ) {
    queryPagar.tipo = "Comissão";
  } else if (
    can("view", "financeiro_despesa") &&
    !can("view", "financeiro_comissao")
  ) {
    queryPagar.tipo = "Despesa";
  }

  try {
    const res = await $api("/pagamentos/list/pagar", { query: queryPagar });
    if (!res) return;

    widgetData.value = [
      {
        title: "A Pagar",
        value: res.relatorios.totalaPagar,
        icon: "tabler-credit-card",
        gradient: "linear-gradient(135deg, #f59e0b, #fbbf24)",
        typesText: `${res.relatorios.countAPagar?.despesas ?? 0} despesas / ${
          res.relatorios.countAPagar?.comissoes ?? 0
        } comissões`,
      },
      {
        title: "Em Aberto",
        value: res.relatorios.totalEmAberto,
        icon: "tabler-clock-pause",
        gradient: "linear-gradient(135deg, #0ea5e9, #38bdf8)",
        typesText: `${res.relatorios.countEmAberto?.despesas ?? 0} despesas / ${
          res.relatorios.countEmAberto?.comissoes ?? 0
        } comissões`,
      },
      {
        title: "Pago",
        value: res.relatorios.totalPago,
        icon: "tabler-circle-check",
        gradient: "linear-gradient(135deg, #10b981, #34d399)",
        typesText: `${res.relatorios.countPago?.despesas ?? 0} despesas / ${
          res.relatorios.countPago?.comissoes ?? 0
        } comissões`,
      },
      {
        title: "Em Atraso",
        value: res.relatorios.totalEmAtraso,
        icon: "tabler-alert-triangle",
        gradient: "linear-gradient(135deg, #ef4444, #f87171)",
        typesText: `${res.relatorios.countEmAtraso?.despesas ?? 0} despesas / ${
          res.relatorios.countEmAtraso?.comissoes ?? 0
        } comissões`,
      },
    ];
  } catch (error) {
    console.error("Error getting pagamentos:", error);
  }
  loadingDespesa.value = false;
};

const statusColor = (status) => {
  const map = {
    Agendado: "#f59e0b",
    Confirmado: "#0ea5e9",
    Atendido: "#10b981",
    "Em Atendimento": "#7c5cfc",
    Cancelado: "#ef4444",
    Remarcado: "#64748b",
  };
  return map[status] || "#94a3b8";
};

const statusVuetifyColor = (status) => {
  const map = {
    Agendado: "warning",
    Confirmado: "info",
    Atendido: "success",
    "Em Atendimento": "primary",
    Cancelado: "error",
    Remarcado: "secondary",
  };
  return map[status] || "default";
};

getAgendamentosDia();
getPagar();
</script>

<template>
  <div class="home-dashboard">
    <!-- ===== HERO GREETING ===== -->
    <div class="hero-card mb-6" :style="{ background: heroGradient }">
      <div class="hero-content">
        <div class="hero-text">
          <div class="hero-greeting">
            <VIcon :icon="greetingIcon" size="20" class="hero-greeting-icon" />
            <span>{{ greeting }}</span>
          </div>
          <p class="hero-name">{{ userName }}</p>
          <p class="hero-subtitle">
            {{ moment().format("dddd, DD [de] MMMM") }}
          </p>
        </div>
        <p
          class="mb-0 text-sm"
          v-if="can('view', 'agendamento') || can('view-all', 'agendamento')"
        >
          Agendamentos:
        </p>
        <div
          class="hero-stats"
          v-if="can('view', 'agendamento') || can('view-all', 'agendamento')"
        >
          <div
            v-for="(widget, idx) in widgetAgendamentos"
            :key="widget.title"
            class="hero-stat-pill"
            :style="{ animationDelay: `${idx * 0.1 + 0.3}s` }"
          >
            <span class="hero-stat-number">{{ widget.total }}</span>
            <span class="hero-stat-label">{{ widget.title }}</span>
          </div>
        </div>
      </div>
      <div class="hero-decoration">
        <div class="hero-circle hero-circle-1"></div>
        <div class="hero-circle hero-circle-2"></div>
        <div class="hero-circle hero-circle-3"></div>
        <!-- Estrelas visíveis à noite -->
        <template v-if="isNightTime">
          <div
            class="hero-star"
            style="top: 15%; left: 10%; animation-delay: 0s"
          ></div>
          <div
            class="hero-star"
            style="top: 25%; left: 55%; animation-delay: 1.2s"
          ></div>
          <div
            class="hero-star"
            style="top: 60%; left: 30%; animation-delay: 0.6s"
          ></div>
          <div
            class="hero-star"
            style="top: 35%; left: 80%; animation-delay: 1.8s"
          ></div>
          <div
            class="hero-star"
            style="top: 70%; left: 70%; animation-delay: 0.3s"
          ></div>
          <div
            class="hero-star"
            style="top: 10%; left: 40%; animation-delay: 2.2s"
          ></div>
          <div
            class="hero-star"
            style="top: 80%; left: 15%; animation-delay: 1.5s"
          ></div>
          <div
            class="hero-star"
            style="top: 45%; left: 92%; animation-delay: 0.9s"
          ></div>
        </template>
      </div>
    </div>

    <!-- ===== MAIN CONTENT ===== -->
    <VRow>
      <!-- ===== AGENDAMENTOS DO DIA ===== -->
      <VCol
        cols="12"
        :md="
          can('view', 'financeiro_comissao') ||
          can('view', 'financeiro_despesa')
            ? 7
            : 12
        "
        v-if="can('view', 'agendamento') || can('view-all', 'agendamento')"
      >
        <VCard class="agenda-card fade-up" style="animation-delay: 0.15s">
          <div class="section-header">
            <div class="section-header-left">
              <div
                class="section-icon"
                style="background: linear-gradient(135deg, #7c5cfc, #a78bfa)"
              >
                <VIcon icon="tabler-calendar-event" size="18" color="white" />
              </div>
              <div>
                <p class="section-title">Agenda de Hoje</p>
                <p class="section-subtitle">{{ moment().format("dddd") }}</p>
              </div>
            </div>
            <VChip
              v-if="totalAgendamentosDia > 0"
              size="small"
              color="primary"
              variant="flat"
              class="font-weight-bold"
            >
              {{ totalAgendamentosDia }}
            </VChip>
          </div>

          <VDivider />

          <!-- Lista -->
          <div class="agenda-list" v-if="agendamentosDia.length > 0">
            <div
              v-for="(age, index) in agendamentosDia"
              :key="age.age_id"
              class="agenda-item fade-up"
              :style="{ animationDelay: `${index * 0.08 + 0.3}s` }"
              @click="
                router.push(`/agendamento/?viewAgendamento=${age.age_id}`)
              "
            >
              <div
                class="agenda-item-indicator"
                :style="{ backgroundColor: statusColor(age?.status) }"
              ></div>

              <div class="agenda-item-time">
                <span class="time-start">{{
                  moment(age?.age_horaInicio, "HH:mm:ss").format("HH:mm")
                }}</span>
                <span class="time-separator"></span>
                <span class="time-end">{{
                  moment(age?.age_horaFim, "HH:mm:ss").format("HH:mm")
                }}</span>
              </div>

              <div class="agenda-item-content">
                <p class="agenda-item-name">
                  {{ age?.cliente?.[0]?.cli_nome || "Sem cliente" }}
                </p>
                <div class="agenda-item-details">
                  <span v-if="age?.servicos?.length">
                    <VIcon icon="tabler-tools" size="13" />
                    {{ age.servicos.length }} serviço{{
                      age.servicos.length > 1 ? "s" : ""
                    }}
                  </span>
                  <span
                    v-if="age?.endereco?.[0]"
                    class="text-truncate"
                    style="max-width: 180px"
                  >
                    <VIcon icon="tabler-map-pin" size="13" />
                    {{ escreverEndereco(age.endereco[0]) }}
                  </span>
                </div>
              </div>

              <VChip
                :color="statusVuetifyColor(age?.status)"
                size="x-small"
                variant="tonal"
                label
                class="agenda-item-status"
              >
                {{ age?.status }}
              </VChip>
            </div>
          </div>

          <!-- Vazio -->
          <div v-else class="agenda-empty">
            <div class="agenda-empty-icon">
              <VIcon icon="tabler-calendar-smile" size="32" />
            </div>
            <p class="agenda-empty-text">Nenhum agendamento hoje</p>
            <p class="agenda-empty-hint">Aproveite o dia livre!</p>
          </div>

          <!-- Ver todos -->
          <div v-if="totalAgendamentosDia > 0" class="section-footer">
            <VBtn
              variant="text"
              color="primary"
              size="small"
              @click="router.push('/agendamento')"
              class="section-footer-btn"
            >
              Ver agenda completa
              <VIcon icon="tabler-arrow-right" size="16" class="ml-1" />
            </VBtn>
          </div>
        </VCard>
      </VCol>

      <!-- ===== FINANCEIRO ===== -->
      <VCol
        cols="12"
        :md="
          can('view', 'agendamento') || can('view-all', 'agendamento') ? 5 : 12
        "
        v-if="
          can('view', 'financeiro_comissao') ||
          can('view', 'financeiro_despesa')
        "
      >
        <VCard class="finance-card fade-up" style="animation-delay: 0.25s">
          <div class="section-header">
            <div class="section-header-left">
              <div
                class="section-icon"
                style="background: linear-gradient(135deg, #10b981, #34d399)"
              >
                <VIcon icon="tabler-report-money" size="18" color="white" />
              </div>
              <div>
                <p class="section-title">Financeiro</p>
                <p class="section-subtitle">{{ mesAtual }}</p>
              </div>
            </div>
          </div>

          <VDivider />

          <div class="finance-grid">
            <div
              v-for="(data, idx) in widgetData"
              :key="idx"
              class="finance-item fade-up"
              :style="{ animationDelay: `${idx * 0.08 + 0.4}s` }"
            >
              <div
                class="finance-item-icon"
                :style="{ background: data.gradient }"
              >
                <VIcon :icon="data.icon" size="18" color="white" />
              </div>
              <div class="finance-item-info">
                <span class="finance-item-label">{{ data.title }}</span>
                <span class="finance-item-value">{{
                  formatValue(data.value)
                }}</span>
                <span class="finance-item-detail" v-if="data.typesText">{{
                  data.typesText
                }}</span>
              </div>
            </div>
          </div>

          <div class="section-footer">
            <VBtn
              variant="text"
              color="primary"
              size="small"
              @click="router.push('/pagamentos')"
              class="section-footer-btn"
            >
              Ver pagamentos
              <VIcon icon="tabler-arrow-right" size="16" class="ml-1" />
            </VBtn>
          </div>
        </VCard>
      </VCol>
    </VRow>

    <!-- ===== ACESSO RÁPIDO ===== -->
    <div class="quick-access fade-up" style="animation-delay: 0.35s">
      <p class="quick-access-title">Acesso Rápido</p>
      <div class="quick-access-grid">
        <div
          v-for="(action, index) in actions.filter((a) => a.show)"
          :key="index"
          class="quick-access-item"
          :style="{ animationDelay: `${index * 0.05 + 0.4}s` }"
          @click="router.push(action.to)"
        >
          <div
            class="quick-access-icon"
            :style="{
              backgroundColor: action.color + '18',
              color: action.color,
            }"
          >
            <VIcon :icon="action.icon" size="22" />
          </div>
          <span class="quick-access-label">{{ action.title }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ===== ANIMATIONS ===== */
@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

@keyframes float {
  0%,
  100% {
    transform: translate(0, 0) scale(1);
  }
  33% {
    transform: translate(8px, -6px) scale(1.03);
  }
  66% {
    transform: translate(-4px, 4px) scale(0.97);
  }
}

.fade-up {
  opacity: 0;
  animation: fadeUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

/* ===== HERO ===== */
.hero-card {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 28px 32px;
  color: #fff;
  animation: scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.hero-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
}

.hero-text {
  flex: 1;
  min-width: 200px;
}

.hero-greeting {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  opacity: 0.85;
  margin-bottom: 4px;
}

.hero-greeting-icon {
  opacity: 0.9;
}

.hero-name {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  margin: 0 0 4px 0;
  letter-spacing: -0.5px;
}

.hero-subtitle {
  font-size: 14px;
  opacity: 0.75;
  margin: 0;
  font-weight: 400;
  text-transform: capitalize;
}

.hero-stats {
  display: flex;
  gap: 10px;
}

.hero-stat-pill {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  padding: 14px 20px;
  min-width: 80px;
  opacity: 0;
  animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  transition: background 0.2s ease, transform 0.2s ease;
}

.hero-stat-pill:hover {
  background: rgba(255, 255, 255, 0.28);
  transform: translateY(-2px);
}

.hero-stat-number {
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
}

.hero-stat-label {
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.8;
  margin-top: 4px;
}

/* Hero floating circles */
.hero-decoration {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  overflow: hidden;
}

.hero-circle {
  position: absolute;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  animation: float 8s ease-in-out infinite;
}

.hero-circle-1 {
  width: 180px;
  height: 180px;
  top: -60px;
  right: -30px;
  animation-delay: 0s;
}

.hero-circle-2 {
  width: 120px;
  height: 120px;
  bottom: -40px;
  right: 120px;
  animation-delay: -3s;
}

.hero-circle-3 {
  width: 80px;
  height: 80px;
  top: 10px;
  right: 200px;
  animation-delay: -5s;
}

/* Stars for night time */
@keyframes twinkle {
  0%,
  100% {
    opacity: 0.3;
    transform: scale(1);
  }
  50% {
    opacity: 1;
    transform: scale(1.4);
  }
}

.hero-star {
  position: absolute;
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #fff;
  animation: twinkle 3s ease-in-out infinite;
  box-shadow: 0 0 4px 1px rgba(255, 255, 255, 0.3);
}

/* ===== SECTION HEADER ===== */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
}

.section-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  line-height: 1.2;
}

.section-subtitle {
  font-size: 12px;
  opacity: 0.55;
  margin: 0;
  line-height: 1.3;
  text-transform: capitalize;
}

.section-footer {
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  padding: 8px 16px;
  text-align: center;
}

.section-footer-btn {
  letter-spacing: 0;
  text-transform: none;
  font-weight: 500;
  font-size: 13px;
}

/* ===== AGENDA LIST ===== */
.agenda-list {
  padding: 8px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agenda-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  position: relative;
}

.agenda-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.04);
  transform: translateX(2px);
}

.agenda-item-indicator {
  width: 4px;
  height: 36px;
  border-radius: 4px;
  flex-shrink: 0;
}

.agenda-item-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 48px;
  flex-shrink: 0;
}

.time-start {
  font-size: 14px;
  font-weight: 700;
  line-height: 1.2;
}

.time-separator {
  width: 1px;
  height: 8px;
  background: rgba(var(--v-theme-on-surface), 0.15);
  margin: 2px 0;
}

.time-end {
  font-size: 11px;
  opacity: 0.5;
  font-weight: 500;
  line-height: 1.2;
}

.agenda-item-content {
  flex: 1;
  min-width: 0;
}

.agenda-item-name {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 3px 0;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agenda-item-details {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  opacity: 0.55;
}

.agenda-item-details span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.agenda-item-status {
  flex-shrink: 0;
}

/* ===== AGENDA EMPTY ===== */
.agenda-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.agenda-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 16px;
  background: rgba(var(--v-theme-primary), 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: rgb(var(--v-theme-primary));
}

.agenda-empty-text {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px 0;
}

.agenda-empty-hint {
  font-size: 12px;
  opacity: 0.5;
  margin: 0;
}

/* ===== FINANCE ===== */
.finance-grid {
  padding: 12px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.finance-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  transition: background 0.2s ease;
}

.finance-item:hover {
  background: rgba(var(--v-theme-on-surface), 0.03);
}

.finance-item-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.finance-item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.finance-item-label {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  line-height: 1.2;
}

.finance-item-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.3px;
}

.finance-item-detail {
  font-size: 11px;
  opacity: 0.45;
  line-height: 1.3;
}

/* ===== QUICK ACCESS ===== */
.quick-access {
  margin-top: 24px;
}

.quick-access-title {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  opacity: 0.45;
  margin: 0 0 14px 4px;
}

.quick-access-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 10px;
}

.quick-access-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 18px 10px 14px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  background: rgba(var(--v-theme-on-surface), 0.04);
  border: 1px solid rgba(var(--v-border-color), 0.08);
  opacity: 0;
  animation: fadeUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

.quick-access-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
  border-color: rgba(var(--v-border-color), 0.2);
  background: rgba(var(--v-theme-on-surface), 0.07);
}

.quick-access-icon {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s ease;
}

.quick-access-item:hover .quick-access-icon {
  transform: scale(1.1);
}

.quick-access-label {
  font-size: 12px;
  font-weight: 600;
  text-align: center;
  line-height: 1.2;
}

/* ===== RESPONSIVE ===== */
@media (max-width: 600px) {
  .hero-card {
    padding: 22px 20px;
  }

  .hero-name {
    font-size: 22px;
  }

  .hero-content {
    flex-direction: column;
    align-items: flex-start;
  }

  .hero-stats {
    width: 100%;
    justify-content: space-between;
  }

  .hero-stat-pill {
    flex: 1;
    min-width: unset;
    padding: 10px 12px;
  }

  .hero-stat-number {
    font-size: 20px;
  }

  .quick-access-grid {
    grid-template-columns: repeat(3, 1fr);
  }

  .agenda-item-details {
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
  }
}
</style>
