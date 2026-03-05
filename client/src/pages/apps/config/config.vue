<script setup>
import { temaAtual } from "@core/stores/config";
import tiposAgendamento from "./tiposAgendamento.vue";
import { useAssinatura } from "@/composables/useAssinatura";

import { can } from "@layouts/plugins/casl";
const router = useRouter();

if(!can("manage", "config_gerais")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

const { setAlert } = useAlert();
const { isEmpresaPrincipal } = useAssinatura();

const abasConfig = [
  { title: "Agendamentos", icon: "tabler-calendar" },
  { title: "Clientes", icon: "tabler-users" },
  { title: "Financeiro", icon: "tabler-currency-dollar" },
  { title: "Regras e Funções", icon: "tabler-user-circle" },
];

const tab = ref("Agendamentos");

const roles = ref([]);

const roles_api = async () => {
  try {
    const res = await $api("/roles/list-role", { method: "GET" });

    // Mapeia os resultados para o formato esperado
    // Empresa principal vê tudo exceto admin; outras empresas não veem admin nem gerente
    const apiRoles = res.results.filter((r) => {
      if (r.role_name === "admin") return false;
      if (!isEmpresaPrincipal.value && r.role_name === "gerente") return false;
      return true;
    });

    console.log("Roles from API:", apiRoles);

    // Atualiza a variável permissions com os dados da API
    roles.value = apiRoles;
  } catch (error) {
    console.error("Error fetching roles");
  }
};

roles_api();

const permissionsRelatorio = [
  {
    title: "Ver Todos",
    value: [{ action: "manage", subject: "relatorio" }],
  },
  {
    title: "Ver Agendamentos",
    value: [{ action: "view", subject: "relatorio_agendamentos" }],
  },
  {
    title: "Ver Clientes",
    value: [{ action: "view", subject: "relatorio_clientes" }],
  },
  {
    title: "Ver CRM",
    value: [{ action: "view", subject: "relatorio_crm" }],
  },
  {
    title: "Ver Serviços",
    value: [{ action: "view", subject: "relatorio_servicos" }],
  },
  {
    title: "Ver Financeiros",
    value: [{ action: "view", subject: "relatorio_financeiro" }],
  },
];

const permissionsAgendamento = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "agendamento" }],
  },
  {
    title: "Atender Agendamentos",
    value: [{ action: "atender", subject: "agendamento" }],
    tooltip: "Permite marcar o agendamento como atendido, finalizando o mesmo",
  },
  {
    title: "Cancelar Agendamentos",
    value: [{ action: "cancel", subject: "agendamento" }],
  },
  {
    title: "Confirmar Atendimento",
    value: [{ action: "confirmar", subject: "agendamento" }],
    tooltip: "Permite confirmar o agendamento",
  },
  {
    title: "Criar Agendamentos",
    value: [{ action: "create", subject: "agendamento" }],
  },
  {
    title: "Editar Agendamentos",
    value: [{ action: "edit", subject: "agendamento" }],
  },
  {
    title: "Ordem de Serviço",
    value: [{ action: "ordem_servico", subject: "agendamento" }],
  },
  {
    title: "Histórico do Agendamento",
    value: [{ action: "historico", subject: "agendamento" }],
  },
  {
    title: "Remarcar Agendamentos",
    value: [{ action: "remarcar", subject: "agendamento" }],
  },
  {
    title: "Ver Agendamentos (Próprio)",
    value: [{ action: "view", subject: "agendamento" }],
  },
  {
    title: "Ver Agendamentos (Todos)",
    value: [{ action: "view-all", subject: "agendamento" }],
  },
];

const permissionsCliente = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "cliente" }],
  },
  {
    title: "Criar Cliente",
    value: [{ action: "create", subject: "cliente" }],
  },
  {
    title: "Editar Cliente",
    value: [{ action: "edit", subject: "cliente" }],
  },
  {
    title: "Excluir Cliente",
    value: [{ action: "delete", subject: "cliente" }],
  },
  {
    title: "Ver Clientes",
    value: [{ action: "view", subject: "cliente" }],
  },
];

const permissionsFinanceiro = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "financeiro" }],
  },
  {
    title: "Criar Despesa",
    value: [{ action: "create", subject: "financeiro_despesa" }],
  },
  {
    title: "Criar Recebimento",
    value: [{ action: "create", subject: "financeiro_recebimento" }],
  },
  {
    title: "Editar comissões",
    value: [{ action: "edit", subject: "financeiro_comissao" }],
  },
  {
    title: "Editar Despesas",
    value: [{ action: "edit", subject: "financeiro_despesa" }],
  },
  {
    title: "Editar Recebimentos",
    value: [{ action: "edit", subject: "financeiro_recebimento" }],
  },
  {
    title: "Excluir comissões",
    value: [{ action: "delete", subject: "financeiro_comissao" }],
  },
  {
    title: "Excluir Despesas",
    value: [{ action: "delete", subject: "financeiro_despesa" }],
  },
  {
    title: "Excluir Recebimentos",
    value: [{ action: "delete", subject: "financeiro_recebimento" }],
  },
  {
    title: "Gerar comissões",
    value: [{ action: "gerar", subject: "financeiro_comissao" }],
  },
  {
    title: "Pagar Despesas",
    value: [{ action: "pagar", subject: "financeiro_despesa" }],
  },
  {
    title: "Ver comissões",
    value: [{ action: "view", subject: "financeiro_comissao" }],
  },
  {
    title: "Ver Despesas",
    value: [{ action: "view", subject: "financeiro_despesa" }],
  },
  {
    title: "Ver Recebimentos",
    value: [{ action: "view", subject: "financeiro_recebimento" }],
  },
];

const permissionsServico = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "servico" }],
  },
  {
    title: "Criar Serviço",
    value: [{ action: "create", subject: "servico" }],
  },
  {
    title: "Editar Serviço",
    value: [{ action: "edit", subject: "servico" }],
  },
  {
    title: "Excluir Serviço",
    value: [{ action: "delete", subject: "servico" }],
  },
  {
    title: "Ver Serviços",
    value: [{ action: "view", subject: "servico" }],
  },
];

const permissionsEstoque = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "estoque" }],
  },
  {
    title: "Criar Estoque",
    value: [{ action: "create", subject: "estoque" }],
  },
  {
    title: "Ver Estoque",
    value: [{ action: "view", subject: "estoque" }],
  },
  {
    title: "Editar Estoque",
    value: [{ action: "edit", subject: "estoque" }],
  },
  {
    title: "Excluir Estoque",
    value: [{ action: "delete", subject: "estoque" }],
  },
];

const atendimentoPermissions = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "crm" }],
  },
  {
    title: "Campanhas",
    value: [{ action: "view", subject: "crm_campanhas" }],
  },
  {
    title: "Chat/Atendente Virtual",
    value: [{ action: "view", subject: "crm_chat" }],
  },
  {
    title: "Dados Avançados de Clientes",
    value: [{ action: "view", subject: "crm_clientes" }],
  },
  {
    title: "Funil de Vendas",
    value: [{ action: "view", subject: "crm_funil_vendas" }],
  },
  {
    title: "Modelos de Mensagens/Emails/Fluxos",
    value: [{ action: "view", subject: "crm_modelos_mensagens" }],
  },
];

const configPermissions = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "config" }],
  },
  {
    title: "Configurar Usuários",
    value: [{ action: "manage", subject: "config_user" }],
    tooltip:
      "Permite adicionar, editar e remover usuários do sistema, além de alterar suas funções e permissões.",
  },
  {
    title: "Configurar Sistema",
    value: [{ action: "manage", subject: "config_gerais" }],
    tooltip:
      "Permite alterar as configurações gerais do sistema, como permissões, preferências e integrações.",
  },
];

const permissionsCalculadora = [
  {
    title: "Total",
    value: [{ action: "manage", subject: "calculadora" }],
  },
  {
    title: "Ver Calculadora",
    value: [{ action: "view", subject: "calculadora" }],
  },
  {
    title: "Gerar Orçamento",
    value: [{ action: "create", subject: "calculadora" }],
  },
  {
    title: "Editar Configurações",
    value: [{ action: "manage", subject: "calculadora_config" }],
  },
];

const permissoesType = [
  {
    title: "Relatórios",
    permissions: permissionsRelatorio.map((p) => {
      return {
        ...p,
        value: Array.isArray(p.value) ? p.value[0] : p.value,
      };
    }),
  },
  {
    title: "Agendamentos",
    permissions: permissionsAgendamento.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
  { title: "Clientes", permissions: permissionsCliente },
  {
    title: "Serviços",
    permissions: permissionsServico.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
  {
    title: "Estoque",
    permissions: permissionsEstoque.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
  {
    title: "Financeiro",
    permissions: permissionsFinanceiro.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
  {
    title: "CRM e Atendimento Virtual",
    permissions: atendimentoPermissions.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
  {
    title: "Configurações do Sistema",
    permissions: configPermissions.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
  {
    title: "Calculadora de Precificação",
    permissions: permissionsCalculadora.map((p) => {
      return { ...p, value: Array.isArray(p.value) ? p.value[0] : p.value };
    }),
  },
];

const dialogPermissions = ref(false);
const selectedRole = ref({
  role_name: "",
  role_ability: [],
  role_id: null,
});

/**
 * Coleta todas as permissões individuais "Total" (manage subject) de cada categoria.
 * Para empresas que não são a principal, "Permissão Total" marca todas essas.
 */
const allTotalPermissions = computed(() => {
  const totals = [];
  const allPerms = [
    permissionsRelatorio, permissionsAgendamento, permissionsCliente,
    permissionsServico, permissionsEstoque, permissionsFinanceiro,
    atendimentoPermissions, configPermissions, permissionsCalculadora
  ];
  for (const group of allPerms) {
    for (const p of group) {
      const val = Array.isArray(p.value) ? p.value[0] : p.value;
      totals.push(val);
    }
  }
  return totals;
});

/**
 * Verifica se todas as permissões individuais estão marcadas (para non-empresa-1 "Permissão Total")
 */
const allPermissionsSelected = computed(() => {
  if (!selectedRole.value.role_ability?.length) return false;
  return allTotalPermissions.value.every(perm =>
    selectedRole.value.role_ability.some(a => a.action === perm.action && a.subject === perm.subject)
  );
});

/**
 * Toggle "Permissão Total" para non-empresa-1: marca/desmarca todas as permissões individuais
 */
const toggleAllPermissions = () => {
  if (allPermissionsSelected.value) {
    // Desmarca tudo, deixa só read all
    selectedRole.value.role_ability = [{ action: 'read', subject: 'all' }];
  } else {
    // Marca todas as permissões individuais
    selectedRole.value.role_ability = [...allTotalPermissions.value];
  }
};

const configs = ref([]);

const coresStatus = ref([
  {
    status: "Atendido",
    cor: "#2dce89",
    type: "cor_atendido",
    showDialog: false,
  },
  {
    status: "Cancelado",
    cor: "#f5365c",
    type: "cor_cancelado",
    showDialog: false,
  },
  {
    status: "Remarcado",
    cor: "#fb6340",
    type: "cor_remarcado",
    showDialog: false,
  },
  {
    status: "Bloqueio",
    cor: "#000000",
    type: "cor_bloqueio",
    showDialog: false,
  },
]);

const loading = ref(false);

const swatches = [
  ["#FFFF00", "#AAAA00", "#555500"], // amarelo
  ["#00FF00", "#00AA00", "#005500"], // verde
  ["#FFA500", "#FF8C00", "#FF4500"], // laranja
  ["#FF0000", "#AA0000", "#550000"], // vermelho
  ["#FF00FF", "#AA00AA", "#550055"], // mantendo
];

const formasDePagamento = ref([]);
const formaDePagamento = ref("");

const addFormaDePagamento = () => {
  console.log("Adicionando forma de pagamento:", formaDePagamento.value);
  formasDePagamento.value.push(formaDePagamento.value);
  formaDePagamento.value = "";
};

const formasDePagamentoEntrada = ref([]);
const formaDePagamentoEntrada = ref("");

const fonteClientes = ref([]);
const fonteCliente = ref("");

const addFonteCliente = () => {
  console.log("Adicionando fonte de cliente:", fonteCliente.value);
  fonteClientes.value.push(fonteCliente.value);
  fonteCliente.value = "";
};

const tiposDespesas = ref([]);
const tipoDespesa = ref("");

const addTipoDespesa = () => {
  console.log("Adicionando tipo de despesa:", tipoDespesa.value);
  tiposDespesas.value.push(tipoDespesa.value);
  tipoDespesa.value = "";
};

const modoDev = ref(false);
const numerosDev = ref([]);

const getConfig = async () => {
  formasDePagamento.value = [];
  formasDePagamentoEntrada.value = [];
  fonteClientes.value = [];
  tiposDespesas.value = [];

  try {
    const res = await $api("/config/get", {
      method: "GET",
    });

    if (!res) return;

    console.log("Config:", res);
    configs.value = res;

    coresStatus.value.forEach((c) => {
      c.cor = res.find((r) => r.type === c.type)?.value;
    });

    res
      .filter((r) => r.type === "fpt_saida")
      .forEach((r) => {
        formasDePagamento.value.push(r.value);
      });

    res
      .filter((r) => r.type === "fonte_cliente")
      .forEach((r) => {
        fonteClientes.value.push(r.value);
      });

    res
      .filter((r) => r.type === "tipo_despesa")
      .forEach((r) => {
        tiposDespesas.value.push(r.value);
      });

    modoDev.value =
      res.filter((option) => option.type == "modo_dev")?.[0]?.value == "true";
    numerosDev.value = JSON.parse(
      res.filter((option) => option.type == "numeros_dev")[0]?.value || "[]"
    );

    try {
      const resPagamentoEntrada = await $api("/pagamentos/forma_entrada", {
        method: "GET",
      });

      formasDePagamentoEntrada.value = resPagamentoEntrada;
    } catch (error) {
      console.error("Erro ao buscar configurações:", error, error.response);
      formasDePagamentoEntrada.value = [];
    }
  } catch (error) {
    console.error("Erro ao buscar configurações:", error, error.response);

    modoDev.value = false;
    numerosDev.value = [];
    formasDePagamento.value = [];
    fonteClientes.value = [];
    tiposDespesas.value = [];
  }
};

onMounted(() => {
  getConfig();
});

const updateConfig = async (config) => {
  loading.value = true;

  try {
    let data = [];
    let type_del = null;

    if (config === "cores") {
      data = coresStatus.value.map((c) => ({
        type: c.type,
        value: c.cor,
        multiple: false,
      }));
    } else if (config === "fpt_saida") {
      data = formasDePagamento.value.map((f) => ({
        type: "fpt_saida",
        value: f,
        multiple: true,
      }));
      type_del = data.length == 0 ? "fpt_saida" : null;
    } else if (config === "fonte_cliente") {
      data = fonteClientes.value.map((f) => ({
        type: "fonte_cliente",
        value: f,
        multiple: true,
      }));
      type_del = data.length == 0 ? "fonte_cliente" : null;
    } else if (config === "tipo_despesa") {
      data = tiposDespesas.value.map((f) => ({
        type: "tipo_despesa",
        value: f,
        multiple: true,
      }));
      type_del = data.length == 0 ? "tipo_despesa" : null;
    } else if (config === "dev") {
      data = [
        {
          type: "modo_dev",
          value: modoDev.value,
        },
        {
          type: "numeros_dev",
          value: JSON.stringify(numerosDev.value),
        },
      ];
    } else {
      return setAlert(
        "Configuração inválida",
        "error",
        "tabler-alert-circle",
        3000
      );
    }

    const res = await $api("/config/update", {
      method: "POST",
      body: {
        data,
        type_del,
      },
    });

    if (!res) return;

    setAlert(
      "Configuração atualizada com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    getConfig();
  } catch (error) {
    console.error("Erro ao atualizar configuração:", error, error.response);
  }

  loading.value = false;
};

const loadingAddPagamentoEntrada = ref(false);

const addFormaDePagamentoEntrada = async () => {
  loadingAddPagamentoEntrada.value = true;

  let value = formaDePagamentoEntrada.value;
  console.log("Adicionando forma de pagamento de entrada:", value);

  try {
    const res = await $api("/pagamentos/forma_entrada", {
      method: "POST",
      body: { fpg_descricao: value },
    });

    if (!res) return;

    formasDePagamentoEntrada.value.push({
      fpg_id: res,
      fpg_descricao: value,
      fpg_ativo: 1,
    });
    formaDePagamentoEntrada.value = "";
    getConfig();
  } catch (error) {
    console.error(
      "Erro ao atualizar formas de pagamento de entrada:",
      error,
      error.response
    );
  }

  loadingAddPagamentoEntrada.value = false;
};

const saveFormasEntrada = () => {
  setAlert(
    "Formas de pagamento de entrada atualizadas com sucesso!",
    "success",
    "tabler-check",
    3000
  );
  getConfig();
};

const deleteFormasPagamentoEntrada = async (fpt) => {
  loading.value = true;

  try {
    const res = await $api(`/pagamentos/forma_entrada/${fpt.fpg_id}`, {
      method: "DELETE",
    });

    if (!res) return;

    setAlert(
      "Forma de pagamento de entrada removida com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    getConfig();
  } catch (error) {
    console.error(
      "Erro ao remover forma de pagamento de entrada:",
      error,
      error.response
    );
  }

  loading.value = false;
};

const loadingSaveRole = ref(false);

const saveRole = async () => {
  if (!selectedRole.value)
    return setAlert(
      "Selecione uma função",
      "error",
      "tabler-alert-circle",
      3000
    );

  if (!selectedRole.value.role_name)
    return setAlert(
      "Insira o nome da função",
      "error",
      "tabler-alert-circle",
      3000
    );

  if (
    !selectedRole.value.role_ability ||
    selectedRole.value.role_ability.length === 0
  )
    return setAlert(
      "Selecione ao menos uma permissão",
      "error",
      "tabler-alert-circle",
      3000
    );

  loadingSaveRole.value = true;

  try {
    const res = await $api(
      `/roles/${selectedRole.value.id ? "edit-role" : "add-role"}`,
      {
        method: "POST",
        body: {
          id: selectedRole.value.id ? selectedRole.value.id : null,
          name: selectedRole.value.role_name,
          permissions: selectedRole.value.role_ability.flat(Infinity),
        },
      }
    );

    if (!res) return;

    setAlert("Função atualizada com sucesso!", "success", "tabler-check", 3000);
    roles_api();
    dialogPermissions.value = false;
  } catch (error) {
    console.error("Erro ao atualizar função:", error, error.response);
  }

  loadingSaveRole.value = false;
};
</script>

<template>
  <h2 class="text-h5 mb-0">Configurações</h2>
  <p class="text-sm">Configure o sistema</p>

  <div class="d-flex flex-row flex-nowrap gap-3 mb-4">
    <VBtn
      v-for="(aba, index) in abasConfig"
      :key="index"
      :color="tab === aba.title ? 'primary' : 'grey lighten-2'"
      :text-color="tab === aba.title ? 'white' : 'black'"
      @click="tab = aba.title"
      class="text-none"
    >
      <VIcon :icon="aba.icon" class="mr-2" />
      {{ aba.title }}
    </VBtn>
  </div>

  <VWindow v-model="tab" class="mb-4">
    <VWindowItem value="Agendamentos">
      <VCard>
        <VCardText>
          <p class="text-h6 mb-1 w-100">
            <VIcon icon="tabler-currency-dollar" class="mr-2" />
            Configurações de agendamentos
          </p>
          <p class="text-caption mb-0">
            Configure as cores de status, tipos de agendamentos e etc.
          </p>

          <VExpansionPanels multiple class="mt-4">
            <VExpansionPanel
              class="mb-4 mt-2"
              :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
            >
              <VExpansionPanelTitle>
                <div class="py-1">
                  <p class="text-h6 mb-2 w-100">
                    <VIcon icon="tabler-palette" class="mr-2" />
                    Cores dos status de agendamentos
                  </p>
                  <p class="text-caption mb-0">
                    Configure as cores dos status de agendamentos.
                  </p>
                </div>
              </VExpansionPanelTitle>
              <VExpansionPanelText class="pa-2">
                <VRow class="mt-4">
                  <VCol cols="12" md="8">
                    <p class="text-disabled">
                      Clique no botão correspondente de cada status para definir
                      a cor.
                    </p>
                    <VRow>
                      <VCol
                        v-for="(cor, index) in coresStatus"
                        :key="index"
                        cols="12"
                        md="3"
                      >
                        <VBtn
                          :color="cor.cor ? cor.cor : '#3182CE'"
                          @click="cor.showDialog = !cor.showDialog"
                          class="w-100"
                        >
                          {{ cor.status }}
                          <VIcon class="ml-1">tabler-color-picker</VIcon>
                        </VBtn>

                        <VDialog v-model="cor.showDialog" width="auto">
                          <VCard class="pa-3">
                            <VColorPicker
                              v-model="cor.cor"
                              class="ma-2"
                              :swatches="swatches"
                              show-swatches
                              hide-inputs
                              :modes="['hexa']"
                            />
                            <VBtn
                              :color="cor.cor ? cor.cor : '#3182CE'"
                              @click="cor.showDialog = false"
                            >
                              <VIcon class="mr-1">tabler-color-picker</VIcon>
                              Selecionar Cor
                            </VBtn>
                          </VCard>
                        </VDialog>
                      </VCol>
                    </VRow>
                  </VCol>

                  <VCol cols="12" md="3" class="d-flex align-end">
                    <VBtn
                      @click="updateConfig('cores')"
                      color="primary"
                      class="w-100"
                      :loading="loading"
                    >
                      Salvar Cores</VBtn
                    >
                  </VCol>
                </VRow>
              </VExpansionPanelText>
            </VExpansionPanel>

            <VExpansionPanel
              class="mb-4 mt-2"
              :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
            >
              <VExpansionPanelTitle>
                <div class="py-1">
                  <p class="text-h6 mb-2 w-100">
                    <VIcon icon="tabler-list" class="mr-2" />
                    Tipos de agendamentos
                  </p>
                  <p class="text-caption mb-0">
                    Configure os tipos de agendamentos.
                  </p>
                </div>
              </VExpansionPanelTitle>

              <VExpansionPanelText class="pa-2">
                <tiposAgendamento />
              </VExpansionPanelText>
              </VExpansionPanel>
          </VExpansionPanels>
        </VCardText>
      </VCard>
    </VWindowItem>

    <VWindowItem value="Clientes">
      <VCard>
        <VCardText>
          <p class="text-h6 mb-1 w-100">
            <VIcon icon="tabler-world" class="mr-2" />
            Fontes de clientes
          </p>
          <p class="text-caption mb-0">
            Configure as fontes de captura dos clientes.
          </p>

          <VRow class="mt-4">
            <VCol cols="12" md="6" class="d-flex flex-row gap-2 align-center">
              <VTextField
                v-model="fonteCliente"
                placeholder="Insira o nome da fonte de cliente"
                @keyup.enter="addFonteCliente"
              />
              <VBtn @click="addFonteCliente" color="primary">
                <VIcon>tabler-plus</VIcon>
              </VBtn>
            </VCol>
            <VCol cols="12">
              <VChip
                label
                v-for="(fonte, index) in fonteClientes"
                :key="index"
                class="me-2 mb-2"
                color="primary"
                variant="flat"
                closable
                @click:close="fonteClientes.splice(index, 1)"
              >
                {{ fonte }}
              </VChip>
            </VCol>

            <VCol cols="12" md="4" class="d-flex align-end">
              <VBtn
                @click="updateConfig('fonte_cliente')"
                color="primary"
                class="w-100"
                :loading="loading"
              >
                Salvar fontes
              </VBtn>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <VWindowItem value="Financeiro">
      <VCard>
        <VCardText>
          <p class="text-h6 mb-1 w-100">
            <VIcon icon="tabler-currency-dollar" class="mr-2" />
            Configurações financeiras
          </p>
          <p class="text-caption mb-0">
            Configure as formas de pagamento e tipos de despesas.
          </p>

          <VExpansionPanels multiple class="mt-4">
            <VExpansionPanel
              class="mb-4 mt-2"
              :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
            >
              <VExpansionPanelTitle>
                <VRow>
                  <VCol cols="12" class="py-4">
                    <p class="text-h6 mb-2 w-100">
                      <VIcon icon="tabler-coin" class="mr-2" />
                      Formas de pagamento de entradas
                    </p>
                    <p class="text-caption mb-0">
                      Configure as formas de pagamento que serão utilizadas nos
                      recebimentos.
                    </p>
                  </VCol>
                </VRow>
              </VExpansionPanelTitle>
              <VExpansionPanelText class="pa-2">
                <VRow>
                  <VCol
                    cols="12"
                    md="6"
                    class="d-flex flex-row gap-2 align-center"
                  >
                    <VTextField
                      v-model="formaDePagamentoEntrada"
                      placeholder="Insira o nome da forma de pagamento"
                      @keyup.enter="addFormaDePagamentoEntrada"
                    />
                    <VBtn
                      @click="
                        addFormaDePagamentoEntrada(
                          formaDePagamentoEntrada.value
                        )
                      "
                      color="success"
                      :loading="loadingAddPagamentoEntrada"
                    >
                      <VIcon>tabler-plus</VIcon>
                    </VBtn>
                  </VCol>
                  <VCol cols="12">
                    <VChip
                      label
                      v-for="(fpt, index) in formasDePagamentoEntrada"
                      :key="index"
                      class="me-2 mb-2"
                      color="success"
                      closable
                      @click:close="deleteFormasPagamentoEntrada(fpt)"
                      variant="flat"
                    >
                      {{ fpt.fpg_descricao }}
                    </VChip>
                  </VCol>

                  <VCol cols="12" md="4" class="d-flex align-end">
                    <VBtn
                      @click="saveFormasEntrada"
                      color="success"
                      class="w-100"
                      :loading="loading"
                    >
                      Salvar Formas
                    </VBtn>
                  </VCol>
                </VRow>
              </VExpansionPanelText>
            </VExpansionPanel>

            <VExpansionPanel
              class="mb-4 mt-2"
              :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
            >
              <VExpansionPanelTitle>
                <VRow>
                  <VCol cols="12" class="py-4">
                    <p class="text-h6 mb-2 w-100">
                      <VIcon icon="tabler-cash" class="mr-2" />
                      Formas de pagamento de despesas
                    </p>
                    <p class="text-caption mb-0">
                      Configure as formas de pagamento que serão utilizadas no
                      lançamento de saídas.
                    </p>
                  </VCol>
                </VRow>
              </VExpansionPanelTitle>
              <VExpansionPanelText class="pa-2">
                <VRow>
                  <VCol
                    cols="12"
                    md="6"
                    class="d-flex flex-row gap-2 align-center"
                  >
                    <VTextField
                      v-model="formaDePagamento"
                      placeholder="Insira o nome da forma de pagamento"
                      @keyup.enter="addFormaDePagamento"
                    />
                    <VBtn @click="addFormaDePagamento" color="primary">
                      <VIcon>tabler-plus</VIcon>
                    </VBtn>
                  </VCol>
                  <VCol cols="12">
                    <VChip
                      label
                      v-for="(fpt, index) in formasDePagamento"
                      :key="index"
                      class="me-2 mb-2"
                      color="primary"
                      closable
                      variant="flat"
                      @click:close="formasDePagamento.splice(index, 1)"
                    >
                      {{ fpt }}
                    </VChip>
                  </VCol>

                  <VCol cols="12" md="4" class="d-flex align-end">
                    <VBtn
                      @click="updateConfig('fpt_saida')"
                      color="primary"
                      class="w-100"
                      :loading="loading"
                    >
                      Salvar Formas
                    </VBtn>
                  </VCol>
                </VRow>
              </VExpansionPanelText>
            </VExpansionPanel>

            <VExpansionPanel
              class="mb-4 mt-2"
              :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
            >
              <VExpansionPanelTitle>
                <VRow>
                  <VCol cols="12" class="py-4">
                    <p class="text-h6 mb-2 w-100">
                      <VIcon icon="tabler-receipt-refund" class="mr-2" />
                      Tipos de despesas
                    </p>
                    <p class="text-caption mb-0">
                      Configure os tipos de despesas.
                    </p>
                  </VCol>
                </VRow>
              </VExpansionPanelTitle>

              <VExpansionPanelText class="pa-2">
                <VRow>
                  <VCol
                    cols="12"
                    md="6"
                    class="d-flex flex-row gap-2 align-center"
                  >
                    <VTextField
                      v-model="tipoDespesa"
                      placeholder="Insira o nome do tipo de despesa"
                      @keyup.enter="addTipoDespesa"
                    />
                    <VBtn @click="addTipoDespesa" color="primary">
                      <VIcon>tabler-plus</VIcon>
                    </VBtn>
                  </VCol>
                  <VCol cols="12">
                    <VChip
                      label
                      v-for="(tipo, index) in tiposDespesas"
                      :key="index"
                      class="me-2 mb-2"
                      color="primary"
                      closable
                      @click:close="tiposDespesas.splice(index, 1)"
                      variant="flat"
                    >
                      {{ tipo }}
                    </VChip>
                  </VCol>

                  <VCol cols="12" md="4" class="d-flex align-end">
                    <VBtn
                      @click="updateConfig('tipo_despesa')"
                      color="primary"
                      class="w-100"
                      :loading="loading"
                    >
                      Salvar tipos de despesas
                    </VBtn>
                  </VCol>
                </VRow>
              </VExpansionPanelText>
            </VExpansionPanel>
          </VExpansionPanels>
        </VCardText>
      </VCard>
    </VWindowItem>

    <VWindowItem value="Regras e Funções">
      <VCard>
        <VCardText>
          <div class="linha-flex justify-space-between align-center">
            <div>
              <p class="text-h6 mb-1 w-100">
                <VIcon icon="tabler-user-circle" class="mr-2" />
                Configurações de regras e funções
              </p>
              <p class="text-caption mb-0">
                Configure as regras, funções e permissões de acesso.
              </p>
            </div>

            <VBtn
              color="primary"
              @click="
                selectedRole = {
                  role_name: '',
                  role_ability: [],
                  role_id: null,
                };
                dialogPermissions = true;
              "
            >
              <VIcon icon="tabler-plus" />
              Nova função
            </VBtn>
          </div>

          <VDivider class="my-4" />

          <VTable>
            <thead>
              <tr>
                <th>Função</th>
                <th>Permissões</th>
                <th>Ações</th>
              </tr>
            </thead>

            <tbody>
              <tr v-for="role in roles" :key="role.id">
                <td>
                  <p class="mb-0 text-capitalize">
                    {{ role.role_name }}
                  </p>
                  <p class="mb-0 text-caption">
                    {{ role.userCount || 0 }} usuário(s)
                  </p>
                </td>
                <td>
                  <p
                    class="mb-0"
                    v-if="
                      role.role_ability?.some(
                        (ability) =>
                          ability.action === 'manage' &&
                          ability.subject === 'all'
                      ) || (!isEmpresaPrincipal && role.role_ability?.length >= allTotalPermissions.length)
                    "
                  >
                    Permissão total
                  </p>

                  <div v-else class="my-1">
                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes('relatorio')
                        ).length
                      "
                    >
                      Relatórios ({{
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes("relatorio")
                        ).length
                      }})
                    </p>

                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes('agendamento')
                        ).length
                      "
                    >
                      Agendamentos ({{
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes("agendamento")
                        ).length
                      }})
                    </p>

                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes('cliente')
                        ).length
                      "
                    >
                      Clientes ({{
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes("cliente")
                        ).length
                      }})
                    </p>

                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes('servico')
                        ).length
                      "
                    >
                      Serviços ({{
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes("servico")
                        ).length
                      }})
                    </p>

                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes('financeiro')
                        ).length
                      "
                    >
                      Financeiros ({{
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes("financeiro")
                        ).length
                      }})
                    </p>

                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes('crm')
                        ).length
                      "
                    >
                      CRM ({{
                        role.role_ability?.filter((ability) =>
                          ability.subject?.includes("crm")
                        ).length
                      }})
                    </p>

                    <p
                      class="mb-0"
                      v-if="
                        role.role_ability?.filter(
                          (ability) =>
                            ability.subject?.includes('user') ||
                            ability.subject?.includes('config')
                        ).length
                      "
                    >
                      Configurações ({{
                        role.role_ability?.filter(
                          (ability) =>
                            ability.subject?.includes("user") ||
                            ability.subject?.includes("config")
                        ).length
                      }})
                    </p>
                  </div>
                </td>
                <td>
                  <IconBtn
                    color="primary"
                    @click="
                      selectedRole = role;
                      dialogPermissions = true;
                    "
                  >
                    <VIcon icon="tabler-edit" />
                  </IconBtn>
                  <IconBtn color="error" class="ml-2">
                    <VIcon icon="tabler-trash" />
                  </IconBtn>
                </td>
              </tr>
            </tbody>
          </VTable>
        </VCardText>
      </VCard>

      <VDialog v-model="dialogPermissions" max-width="800px">
        <VCard>
          <VCardText>
            <div
              class="d-flex flex-row justify-space-between align-center mb-4"
            >
              <div>
                <p class="text-h6 mb-1">
                  <VIcon icon="tabler-user-circle" class="mr-2" />
                  Permissões da função
                </p>
                <p class="text-caption mb-0">
                  Configure as permissões de acesso da função
                  <strong class="text-capitalize">{{
                    selectedRole?.role_name ?? ""
                  }}</strong>
                </p>
              </div>

              <VIcon icon="tabler-x" @click="dialogPermissions = false" />
            </div>

            <VRow class="my-4">
              <VCol cols="12">
                <AppTextField
                  v-model="selectedRole.role_name"
                  label="Nome da função"
                  placeholder="Insira o nome da função"
                  :rules="[requiredValidator]"
                />
              </VCol>

              <VCol cols="12" class="pb-0">
                <p class="mb-0 text-sm">
                  <VIcon icon="tabler-shield-lock" class="mr-2" />
                  Permissões
                </p>
              </VCol>

              <VCol cols="12">
                <!-- Empresa principal: manage all real -->
                <VCheckbox
                  v-if="isEmpresaPrincipal"
                  class="mb-2"
                  v-model="selectedRole.role_ability"
                  :value="{ action: 'manage', subject: 'all' }"
                >
                  <template #label>
                    <p class="text-sm ml-1 mb-0">
                      Permissão Total

                      <VIcon
                        icon="tabler-info-circle-filled"
                        size="16"
                        color="primary"
                        class="ml-1"
                      />

                      <VTooltip
                        activator="parent"
                        text="Permite acesso total ao sistema, sem restrições."
                      />
                    </p>
                  </template>
                </VCheckbox>

                <!-- Outras empresas: marca todas as permissões individuais -->
                <VCheckbox
                  v-else
                  class="mb-2"
                  :model-value="allPermissionsSelected"
                  @update:model-value="toggleAllPermissions"
                >
                  <template #label>
                    <p class="text-sm ml-1 mb-0">
                      Permissão Total

                      <VIcon
                        icon="tabler-info-circle-filled"
                        size="16"
                        color="primary"
                        class="ml-1"
                      />

                      <VTooltip
                        activator="parent"
                        text="Marca todas as permissões disponíveis."
                      />
                    </p>
                  </template>
                </VCheckbox>

                <VExpansionPanels
                  multiple
                  v-if="
                    !selectedRole.role_ability?.some(
                      (ability) =>
                        ability.action === 'manage' && ability.subject === 'all'
                    )
                  "
                >
                  <VExpansionPanel
                    v-for="(permissoes, index) in permissoesType"
                    :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                    :title="permissoes.title"
                  >
                    <VExpansionPanelText class="pt-3">
                      <div class="d-flex flex-wrap gap-4">
                        <template
                          v-for="permission in permissoes.permissions"
                          :key="permission.value"
                        >
                          <VCheckbox
                            v-model="selectedRole.role_ability"
                            :value="permission.value"
                          >
                            <template #label>
                              <p class="text-sm ml-1 mb-0">
                                {{ permission.title }}

                                <VIcon
                                  icon="tabler-info-circle-filled"
                                  size="16"
                                  color="primary"
                                  class="ml-1"
                                  v-if="permission.tooltip"
                                />

                                <VTooltip
                                  activator="parent"
                                  :text="permission.tooltip"
                                  v-if="permission.tooltip"
                                />
                              </p>
                            </template>
                          </VCheckbox>
                        </template>
                      </div>
                    </VExpansionPanelText>
                  </VExpansionPanel>
                </VExpansionPanels>
              </VCol>
            </VRow>

            <div class="d-flex flex-row justify-end mt-4">
              <VBtn
                variant="outlined"
                color="secondary"
                @click="dialogPermissions = false"
                :disabled="loadingSaveRole"
                class="mr-3"
                rounded="pill"
              >
                Cancelar
              </VBtn>

              <VBtn
                variant="outlined"
                color="error"
                @click="
                  selectedRole.role_ability = [
                    { action: 'read', subject: 'all' },
                  ];
                  saveRole();
                "
                :disabled="loadingSaveRole"
                class="mr-3"
                rounded="pill"
              >
                Resetar
              </VBtn>

              <VBtn
                color="primary"
                rounded="pill"
                @click="saveRole"
                :loading="loadingSaveRole"
                :disabled="
                  !selectedRole.role_name ||
                  selectedRole.role_ability?.length === 0
                "
              >
                Salvar Função
              </VBtn>
            </div>
          </VCardText>
        </VCard>
      </VDialog>
    </VWindowItem>
  </VWindow>
</template>
