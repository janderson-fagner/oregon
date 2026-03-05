<script setup>
import agendamentos from "@/pages/apps/relatorios/agendamentos-relatorios.vue";
import financeiro from "@/pages/apps/relatorios/financeiro-relatorios.vue";
import comissoes from "@/pages/apps/relatorios/comissoes-relatorios.vue";
import servicos from "@/pages/apps/relatorios/servicos-relatorios.vue";
import crm from "@/pages/apps/relatorios/crm-relatorios.vue";
import atendimento from "@/pages/apps/relatorios/atendimento-relatorios.vue";
import contratosRelatorios from "@/pages/apps/relatorios/contratos-relatorios.vue";
import orcamentosRelatorios from "@/pages/apps/relatorios/orcamentos-relatorios.vue";
import { can } from "@layouts/plugins/casl";

const { setAlert } = useAlert();

const router = useRouter();
const route = useRoute();

const userData = useCookie("userData").value;
const userRole = userData ? userData.role : null;

const prodTab = ref(null);
const tabs = [
  {
    icon: "tabler-coin",
    title: "Financeiro",
    route: "relatoriosFinanceiro",
    can: can("view", "relatorio_financeiro"),
  },
  {
    icon: "tabler-gift-card",
    title: "Comissões",
    route: "relatoriosComissoes",
    can: can("view", "relatorio_financeiro"),
  },
  {
    icon: "tabler-tools",
    title: "Serviços",
    route: "relatoriosServicos",
    can: can("view", "relatorio_servicos"),
  },
  {
    icon: "tabler-calendar",
    title: "Agendamentos",
    route: "relatoriosAgendamentos",
    can: can("view", "relatorio_agendamentos"),
  },
  {
    icon: "tabler-heart-handshake",
    title: "CRM",
    route: "relatoriosCRM",
    can: can("view", "relatorio_crm"),
  },
  {
    icon: "tabler-message-circle-2",
    title: "Atendimento",
    route: "relatoriosAtendimento",
    can: can("view", "relatorio_crm"),
  },
  {
    icon: "tabler-file-text",
    title: "Contratos",
    route: "relatoriosContratos",
    can: can("view", "relatorio_financeiro"),
  },
  {
    icon: "tabler-file-invoice",
    title: "Orçamentos",
    route: "relatoriosOrcamentos",
    can: can("view", "relatorio_financeiro"),
  },
].filter((tab) => tab.can);

watch(prodTab, (val) => {
  let indexVal = val;
  let tabRoute = tabs[indexVal].route;
  router.push({ name: tabRoute });
});

if (
  route.name === "relatoriosFinanceiro" ||
  route.name === "relatoriosComissoes" ||
  route.name === "relatoriosServicos" ||
  route.name === "relatoriosAgendamentos" ||
  route.name === "relatoriosCRM" ||
  route.name === "relatoriosAtendimento" ||
  route.name === "relatoriosContratos" ||
  route.name === "relatoriosOrcamentos"
) {
  watch(
    () => route.name,
    (val) => {
      if (val === "relatoriosFinanceiro" || val === "relatorios") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Financeiro") ?? null;
      } else if (val === "relatoriosComissoes") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Comissões") ?? null;
      } else if (val === "relatoriosServicos") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Serviços") ?? null;
      } else if (val === "relatoriosAgendamentos") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Agendamentos") ?? null;
      } else if (val === "relatoriosCRM") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "CRM") ?? null;
      } else if (val === "relatoriosAtendimento") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Atendimento") ?? null;
      } else if (val === "relatoriosContratos") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Contratos") ?? null;
      } else if (val === "relatoriosOrcamentos") {
        prodTab.value =
          tabs.findIndex((tab) => tab.title === "Orçamentos") ?? null;
      }
      if(prodTab.value === null) {
        router.push('/');
      }
    }
  );
}

onMounted(() => {
  if (route.name === "relatoriosFinanceiro" || route.name === "relatorios") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Financeiro") ?? null;
  } else if (route.name === "relatoriosComissoes") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Comissões") ?? null;
  } else if (route.name === "relatoriosServicos") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Serviços") ?? null;
  } else if (route.name === "relatoriosAgendamentos") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Agendamentos") ?? null;
  } else if (route.name === "relatoriosCRM") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "CRM") ?? null;
  } else if (route.name === "relatoriosAtendimento") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Atendimento") ?? null;
  } else if (route.name === "relatoriosContratos") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Contratos") ?? null;
  } else if (route.name === "relatoriosOrcamentos") {
    prodTab.value = tabs.findIndex((tab) => tab.title === "Orçamentos") ?? null;
  }

  if(prodTab.value === null) {
    router.push('/');
  }
});
</script>
<template>
  <VRow class="d-flex flex-row justify-space-between">
    <VCol cols="6" class="flex-column">
      <h3>Relatórios</h3>
      <p class="mb-3">Faça análises e acompanhe o desempenho do seu negócio.</p>
    </VCol>
  </VRow>

  <div class="d-flex flex-row flex-nowrap gap-3 mb-4 overflow-x-auto">
    <VBtn
      v-for="(tab, index) in tabs"
      :key="index"
      :color="prodTab === index ? 'primary' : 'grey lighten-2'"
      :text-color="prodTab === index ? 'white' : 'black'"
      @click="prodTab = index"
      class="text-none"
    >
      <VIcon :icon="tab.icon" class="mr-2" />
      {{ tab.title }}
    </VBtn>
  </div>

  <VWindow v-model="prodTab" class="mt-6 disable-tab-transition" :touch="false"
  v-if="prodTab !== null && tabs?.length > 0">
    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <financeiro />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <comissoes />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <servicos />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <agendamentos />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <crm />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <atendimento />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <contratosRelatorios />
    </VWindowItem>

    <VWindowItem v-if="tabs?.[prodTab]?.can">
      <orcamentosRelatorios />
    </VWindowItem>
  </VWindow>
</template>
