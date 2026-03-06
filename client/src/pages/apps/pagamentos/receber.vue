<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { useConfirm } from "@/utils/confirm.js";
import { paginationMeta } from "@api-utils/paginationMeta";
import { useAlert } from "@/composables/useAlert";
import ReceberDialog from "@/views/apps/pagamentos/ReceberDialog.vue";
import { can } from "@layouts/plugins/casl";
import moment from "moment";
import { useFunctions } from "@/composables/useFunctions";

const { escreverEndereco, debounce } = useFunctions();
const { setAlert } = useAlert();

const router = useRouter();
const route = useRoute();

if (!can("view", "financeiro_recebimento")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

const recebimentos = ref([]);
const loading = ref(false);
const loadingAdd = ref(false);

let mesAtual = new Date().getMonth() + 1;

// 👉 Store
const searchQuery = ref("");
const dataDeQuery = ref(moment().startOf("month").format("YYYY-MM-DD"));
const dataAteQuery = ref(moment().endOf("month").format("YYYY-MM-DD"));
const pagoQuery = ref(2);

// Data table options
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref();
const orderBy = ref();
const totalPagamentos = ref(0);

const updateOptions = (options) => {
  console.log("Update: ", options);
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key;
  orderBy.value = options.sortBy[0]?.order;

  getReceber();
};

// Headers
const headers = [
  {
    title: "Cliente/Agendamento",
    key: "age_data",
  },
  {
    title: "Formas de Pag.",
    key: "fpg_name",
  },
  {
    title: "Nota Fiscal",
    key: "pgt_numero_nota_fiscal",
  },
  {
    title: "Valor",
    key: "pgt_valor",
  },
  {
    title: "Data do Pagamento",
    key: "pgt_data",
  },
  {
    title: "Ações",
    key: "actions",
    sortable: false,
  },
];

const isRecebimentoDrawerVisible = ref(false);
const loadingReceberData = ref(true);
const ReceberData = ref({});

const relatorios = ref({
  totalRecebimento: 0,
  totalNaoPago: 0,
  totalPago: 0,
});

const widgetData = ref([
  {
    title: "Total de Recebimentos",
    value: relatorios.value.totalRecebimento,
    desc: `${moment(dataDeQuery.value).format("DD/MM/YYYY")} - ${moment(
      dataAteQuery.value
    ).format("DD/MM/YYYY")}`,
    icon: "tabler-wallet",
    iconColor: "primary",
  },
  {
    title: "Total Pago",
    value: relatorios.value.totalPago,
    desc: `${moment(dataDeQuery.value).format("DD/MM/YYYY")} - ${moment(
      dataAteQuery.value
    ).format("DD/MM/YYYY")}`,
    icon: "tabler-check",
    iconColor: "success",
  },
  {
    title: "Total Não Pago",
    value: relatorios.value.totalNaoPago,
    desc: `${moment(dataDeQuery.value).format("DD/MM/YYYY")} - ${moment(
      dataAteQuery.value
    ).format("DD/MM/YYYY")}`,
    icon: "tabler-x",
    iconColor: "error",
  },
]);

const editarRecebimento = async (item) => {
  if (!can("edit", "financeiro_recebimento")) {
    return setAlert(
      "Você não tem permissão para isto.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  try {
    const res = await $api(`/pagamentos/get/receber/${item}`, {
      method: "GET",
    });

    if (!res) return;

    console.log("Produto edit:", res);

    ReceberData.value = res;

    isRecebimentoDrawerVisible.value = true;
  } catch (error) {
    console.error("Error getting produto:", error, error.response);

    setAlert(
      error.response?._data?.message ||
        "Erro ao carregar dados do recebimento! Tente novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  loadingReceberData.value = false;
};

if (route.query.viewPagamento) {
  editarRecebimento(route.query.viewPagamento);

  // Remove query from URL
  router.replace({ query: { tab: "receber" } });
}

const deletarPagamento = async (item) => {
  if (!can("delete", "financeiro_recebimento")) {
    return setAlert(
      "Você não tem permissão para isto.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  if (
    !(await useConfirm({
      message: `Tem certeza que deseja deletar o pagamento de <strong>${
        item.cli_nome
      }</strong> no valor de <strong>${formatValor(item.pgt_valor)}</strong>?`,
      allowHtml: true,
    }))
  )
    return;

  try {
    const res = await $api(`/pagamentos/delete/receber/${item.pgt_id}`, {
      method: "DELETE",
    });

    if (!res) return;

    setAlert(
      "Pagamento deletado com sucesso!",
      "success",
      "tabler-trash",
      3000
    );

    getReceber();
  } catch (error) {
    console.error("Error deleting produto:", error, error.response);

    setAlert(
      error.response?._data?.message ||
        "Erro ao deletar pagamento! Tente novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

watch(isRecebimentoDrawerVisible, (val) => {
  console.log("isRecebimentoDrawerVisible:", val);
  if (!val) {
    ReceberData.value = {};
  }
});

const formatValor = (valor) => {
  if (!valor) return "R$ 0,00";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const getReceber = async () => {
  if (loading.value) return;

  if (!can("view", "financeiro_recebimento")) {
    setAlert(
      "Você não tem permissão para acessar esta página.",
      "error",
      "tabler-alert-triangle",
      3000
    );
    router.push("/");
    return;
  }

  const dataDeQ = JSON.parse(JSON.stringify(dataDeQuery.value));
  const dataAteQ = JSON.parse(JSON.stringify(dataAteQuery.value));

  loadingReceberData.value = true;
  loading.value = true;

  const query = {
    page: page.value,
    itemsPerPage: itemsPerPage.value,
    q: searchQuery.value,
    sortBy: sortBy.value,
    orderBy: orderBy.value,
    dataDe: dataDeQ,
    dataAte: dataAteQ,
    pago: pagoQuery.value,
  };

  console.log("query", query);
  try {
    const res = await $api("/pagamentos/list/receber", {
      query,
    });

    if (!res) return;

    if (res.again) {
      return await getReceber();
    }

    console.log("Recebimentos:", res);

    recebimentos.value = res.pagamentos;
    totalPagamentos.value = res.totalPagamentos;

    console.log(
      "valor pendente: ",
      res.pagamentos.reduce((acc, curr) => acc + curr.pgt_valor_bk, 0)
    );

    let descW = `${moment(dataDeQ).format("DD/MM/YYYY")} - ${moment(
      dataAteQ
    ).format("DD/MM/YYYY")}`;

    //Atualizar widgets
    widgetData.value = [
      {
        title: "Total de Recebimentos",
        value: res.relatorios.totalRecebimento,
        desc: descW,
        icon: "tabler-wallet",
        iconColor: "primary",
      },
      {
        title: "Total Pago",
        value: res.relatorios.totalPago,
        desc: descW,
        icon: "tabler-check",
        iconColor: "success",
      },
      {
        title: "Total Não Pago",
        value: res.relatorios.totalNaoPago,
        desc: descW,
        icon: "tabler-x",
        iconColor: "error",
      },
    ];

    ReceberData.value = {};
  } catch (error) {
    console.error("Error getting produtos:", error, error.response);

    recebimentos.value = [];
    totalPagamentos.value = 0;
  }

  loading.value = false;
};

const debouncedGetReceber = () => {};

onMounted(() => {
  getReceber();
});

const viewAddPagamentoDialog = ref(false);

const clienteQuery = ref(null);
const clienteText = ref("");
const dateQuery = ref(null);

const clientes = ref([]);
const agendamentos = ref([]);

const loadingClientes = ref(false);

const getClientes = async () => {
  let textQuery = clienteText.value;

  if (textQuery.length < 3) {
    clientes.value = [];
    return;
  }

  loadingClientes.value = true;

  try {
    const res = await $api("/clientes/list", {
      method: "GET",
      query: {
        q: textQuery,
      },
    });

    if (!res) return;

    console.log("Res Get Clientes:", res);

    clientes.value = res.clientes;
  } catch (error) {
    console.error("Error Get Clientes:", error, error.response);
  } finally {
    loadingClientes.value = false;
  }
};

const getAgendamentos = async () => {
  loading.value = true;

  try {
    const res = await $api(`/agenda/getAgendamentosByCliente/`, {
      method: "GET",
      query: {
        cliente: clienteQuery.value,
        d: dateQuery.value,
      },
    });

    console.log("res agendamentos", res);

    agendamentos.value = res.agendamentos;
  } catch (err) {
    console.error("Error fetching user data", err, err.response);

    agendamentos.value = [];
  }

  loading.value = false;
};

const setCliente = (cliente) => {
  clienteText.value = cliente.cli_nome;
  clienteQuery.value = cliente.cli_id;
  clientes.value = [];

  getAgendamentos();
};

const clearClientes = () => {
  clienteText.value = "";
  clienteQuery.value = "";
  clientes.value = [];
  getAgendamentos();
};

const agendamentoSelected = ref(null);

const createPagamento = async () => {
  if (!can("create", "financeiro_recebimento")) {
    return setAlert(
      "Você não tem permissão para isto.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  if (!agendamentoSelected.value) {
    setAlert(
      "Selecione um agendamento para adicionar um pagamento!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  loadingAdd.value = true;

  console.log("agendamentoSelected:", agendamentoSelected.value);

  try {
    const res = await $api("/pagamentos/create/receber", {
      method: "POST",
      body: {
        age_id: agendamentoSelected.value,
      },
    });

    if (!res) return;

    setAlert(
      "Pagamento adicionado com sucesso!",
      "success",
      "tabler-check",
      3000
    );

    getReceber();
    viewAddPagamentoDialog.value = false;
    editarRecebimento(res);
  } catch (error) {
    console.error("Error creating pagamento:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Erro ao adicionar pagamento! Tente novamente.",
      "error",
      "tabler-alert-triangle",
      8000
    );
  } finally {
    loadingAdd.value = false;
  }
};
</script>
<template>
  <VCard class="mb-6">
    <VCardText>
      <VRow>
        <!-- 👉 Search  -->
        <VCol cols="12" sm="4">
          <AppTextField
            v-model="searchQuery"
            label="Pesquise um pagamento"
            placeholder="Pesquise pelo cliente, data do agendamento ou valor"
            density="compact"
            clearable
            @click:clear="debouncedGetReceber"
            @update:model-value="debouncedGetReceber"
          />
        </VCol>

        <!-- 👉 Meses -->
        <VCol cols="12" sm="2">
          <AppTextField
            v-model="dataDeQuery"
            label="Data inicial"
            placeholder="Selecione uma data"
            type="date"
            @update:model-value="debouncedGetReceber"
          />
        </VCol>

        <!-- 👉 Ano -->
        <VCol cols="12" sm="2">
          <AppTextField
            v-model="dataAteQuery"
            label="Data final"
            placeholder="Selecione uma data"
            type="date"
            @update:model-value="debouncedGetReceber"
          />
        </VCol>

        <VCol cols="12" sm="2">
          <AppSelect
            v-model="pagoQuery"
            :items="[
              { value: 2, title: 'Todos' },
              { value: 1, title: 'Pago' },
              { value: 3, title: 'Não Pago' },
            ]"
            label="Status"
            placeholder="Selecione um status"
            density="compact"
            clearable
            @click:clear="debouncedGetReceber"
            @update:model-value="debouncedGetReceber"
          />
        </VCol>

        <VCol cols="12" sm="2">
          <label class="v-label mb-1 text-body-2 text-high-emphasis" style="opacity: 0 !important;">
            Pesquisar
          </label>
          <VBtn color="primary" @click="getReceber">
            <VIcon icon="tabler-search" class="mr-1" />
            Pesquisar
          </VBtn>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <VRow class="match-height mb-4">
    <template v-for="(data, id) in widgetData" :key="id">
      <VCol cols="12" md="4">
        <VCard>
          <VCardText>
            <div class="d-flex justify-space-between">
              <div class="d-flex flex-column gap-y-1">
                <span class="text-medium-emphasis">{{ data.title }}</span>
                <div>
                  <h5 class="text-h5">
                    {{ formatValor(data.value) }}
                  </h5>
                </div>
                <span class="text-caption">{{ data.desc }}</span>
              </div>
              <VAvatar
                :color="data.iconColor"
                variant="tonal"
                rounded
                size="30"
              >
                <VIcon :icon="data.icon" size="20" />
              </VAvatar>
            </div>
          </VCardText>
        </VCard>
      </VCol>
    </template>
  </VRow>

  <VCard>
    <VCardText class="d-flex flex-wrap py-4 gap-4">
      <!--       <VBtn color="primary" @click="imprimir('receber')" variant="tonal">
        <VIcon icon="tabler-printer" class="mr-2" />
        <span style="text-transform: none !important"
          >Relatório de Recebimentos</span
        >
      </VBtn> -->

      <VBtn
        color="primary"
        @click="viewAddPagamentoDialog = true"
        class="ml-auto"
        v-if="can('create', 'financeiro_recebimento')"
      >
        <VIcon icon="tabler-plus" class="mr-1" />
        Adicionar Pagamento
      </VBtn>

      <VDialog v-model="viewAddPagamentoDialog" persistent max-width="600">
        <VCard>
          <VCardText>
            <AppDrawerHeaderSection
              customClass="pt-0"
              title="Adicionar Pagamento"
              @cancel="viewAddPagamentoDialog = false"
            />

            <v-menu location="bottom" max-height="250px">
              <template v-slot:activator="{ props }">
                <AppTextField
                  v-bind="props"
                  v-model="clienteText"
                  :loading="loadingClientes"
                  @keyup="getClientes"
                  clearable
                  class="mt-4"
                  @click:clear="clearClientes"
                  label="Pesquise por cliente"
                  placeholder="Pesquise por cliente por nome, CPF, telefone ou endereço"
                />
              </template>

              <VList dense v-if="clientes.length > 0">
                <VListItem
                  v-for="cliente in clientes"
                  :key="cliente.id"
                  class="item-cliente"
                  @click="setCliente(cliente)"
                >
                  <p class="mb-0">
                    {{ cliente.cli_nome }}
                  </p>
                  <p class="text-caption mb-0">
                    <VIcon icon="tabler-map-pin" size="12" class="mr-1" />
                    {{ escreverEndereco(cliente.enderecos[0]) }}
                  </p>
                </VListItem>
              </VList>

              <VList dense v-else-if="clienteText === ''">
                <VListItem>
                  <p class="mb-0">
                    Escreva mais de 3 letras para pesquisar um cliente por nome,
                    CPF, telefone ou endereço
                  </p>
                </VListItem>
              </VList>

              <VList
                dense
                v-else-if="clientes.length === 0 && clienteText !== ''"
              >
                <VListItem>
                  <p class="mb-0">Nenhum cliente encontrado</p>
                </VListItem>
              </VList>
            </v-menu>

            <v-fade-transition>
              <AppTextField
                v-model="dateQuery"
                label="Filtrar por data do agendamento (opcional)"
                type="date"
                dense="compact"
                class="my-6"
                v-if="agendamentos.length > 0 && clienteText"
              />
            </v-fade-transition>

            <v-fade-transition>
              <AppSelect
                label="Selecione o agendamento"
                v-model="agendamentoSelected"
                :items="agendamentos"
                placeholder="Selecione um agendamento"
                item-title="age_data"
                item-value="age_id"
                v-if="agendamentos.length > 0 && clienteText"
              >
                <template v-slot:selection="{ item }">
                  <p class="mb-0">
                    {{
                      new Date(item.raw.age_data).toLocaleDateString("pt-BR")
                    }}
                    - {{ formatValor(item.raw.age_valor) }}
                  </p>
                </template>
                <template #item="{ props, item }">
                  <VListItem #title v-bind="props">
                    <div>
                      <p class="mb-0">
                        <VIcon icon="tabler-calendar" class="mr-1" />
                        {{ moment(item.raw.age_data).format("DD/MM/YYYY") }}
                      </p>
                      <p class="mb-0 text-sm">
                        <VIcon icon="tabler-coin" class="mr-1" />
                        {{ formatValor(item.raw.age_valor) }}
                      </p>
                      <p class="mb-0 text-sm">
                        <VIcon icon="tabler-user-cog" class="mr-1" />
                        {{ item.raw.funcionario[0]?.fullName }}
                      </p>
                    </div>
                  </VListItem>
                </template>
              </AppSelect>
            </v-fade-transition>

            <div class="d-flex flex-row gap-3 align-center justify-center mt-6">
              <VBtn
                color="primary"
                variant="tonal"
                @click="viewAddPagamentoDialog = false"
              >
                Cancelar
              </VBtn>

              <VBtn
                color="success"
                @click="createPagamento"
                :disabled="!agendamentoSelected"
                :loading="loadingAdd"
              >
                Adicionar Pagamento
              </VBtn>
            </div>
          </VCardText>
        </VCard>
      </VDialog>
    </VCardText>

    <VDivider />

    <!-- SECTION datatable -->
    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :items="recebimentos"
      :items-length="totalPagamentos"
      :headers="headers"
      class="text-no-wrap tabela-produtos"
      @update:options="updateOptions"
      :loading="loading"
      loading-text="Carregando..."
    >
      <template v-slot:item.age_data="{ item }">
        <div class="my-1" style="max-width: 300px">
          <p class="text-sm text-truncate mb-0 cursor-pointer">
            <VIcon icon="tabler-user" class="mr-1" />
            {{
              item.agendamento?.[0]?.cliente?.[0]?.cli_nome ||
              "Não Identificado"
            }}

            <VTooltip activator="parent">
              <span class="text-sm">
                {{
                  item.agendamento?.[0]?.cliente?.[0]?.cli_nome ||
                  "Não Identificado"
                }}
              </span>
            </VTooltip>
          </p>
          <p class="mb-0 text-sm">
            <VIcon icon="tabler-calendar" class="mr-1" />
            {{
              item.agendamento?.[0]?.age_data
                ? moment(item.agendamento?.[0]?.age_data).format("DD/MM/YYYY")
                : "Não Encontrado"
            }}
          </p>
          <p
            class="mb-0 text-truncate text-sm cursor-pointer"
            v-if="item.agendamento?.[0]?.endereco?.length > 0"
          >
            <VIcon icon="tabler-map-pin" class="mr-1" />
            {{ escreverEndereco(item.agendamento[0].endereco[0]) }}

            <VTooltip activator="parent">
              <span class="text-sm">
                {{ escreverEndereco(item.agendamento[0].endereco[0]) }}
              </span>
            </VTooltip>
          </p>
        </div>
      </template>

      <template v-slot:item.fpg_name="{ item }">
        {{ item.fpg_name }}
      </template>

      <template v-slot:item.pgt_numero_nota_fiscal="{ item }">
        <VIcon
          icon="tabler-check"
          v-if="item.pgt_numero_nota_fiscal"
          color="success"
        />
        <VIcon icon="tabler-x" v-else color="error" />
        {{ item.pgt_numero_nota_fiscal ?? "-" }}
      </template>

      <template v-slot:item.pgt_valor="{ item }">
        {{ formatValor(item.pgt_valor_bk) }}
      </template>

      <template v-slot:item.pgt_data="{ item }">
        <VChip v-if="item.pgt_data" color="success" label
          >Pago em {{ item.pgt_data }}</VChip
        >
        <VChip v-else color="warning" label>Pendente</VChip>
      </template>

      <template v-slot:item.actions="{ item }">
        <IconBtn
          color="warning"
          @click="editarRecebimento(item.pgt_id)"
          v-if="can('edit', 'financeiro_recebimento')"
        >
          <VIcon icon="tabler-edit" />
        </IconBtn>

        <IconBtn
          @click="deletarPagamento(item)"
          color="error"
          class="ml-3"
          v-if="can('delete', 'financeiro_recebimento')"
        >
          <VIcon icon="tabler-trash" />
        </IconBtn>
      </template>

      <!-- pagination -->
      <template #bottom>
        <VDivider />
        <div
          class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3"
        >
          <p class="text-sm text-disabled mb-0" v-if="itemsPerPage != -1">
            {{ paginationMeta({ page, itemsPerPage }, totalPagamentos) }}
          </p>
          <p class="text-sm text-disabled mb-0" v-if="itemsPerPage == -1">
            {{ "Exibindo " + totalPagamentos + " resultados" }}
          </p>

          <AppSelect
            :model-value="itemsPerPage"
            :items="[
              { value: 10, title: '10' },
              { value: 25, title: '25' },
              { value: 50, title: '50' },
              { value: 100, title: '100' },
              { value: -1, title: 'Todos' },
            ]"
            style="inline-size: 6.25rem"
            @update:model-value="itemsPerPage = parseInt($event, 10)"
          />

          <VPagination
            v-model="page"
            :length="Math.ceil(totalPagamentos / itemsPerPage)"
            :total-visible="
              $vuetify.display.xs
                ? 1
                : Math.ceil(totalPagamentos / itemsPerPage) > 5
                ? 5
                : Math.ceil(totalPagamentos / itemsPerPage)
            "
          >
            <template #prev="slotProps">
              <VBtn
                variant="tonal"
                color="default"
                v-bind="slotProps"
                :icon="false"
              >
                Anterior
              </VBtn>
            </template>

            <template #next="slotProps">
              <VBtn
                variant="tonal"
                color="default"
                v-bind="slotProps"
                :icon="false"
              >
                Próximo
              </VBtn>
            </template>
          </VPagination>
        </div>
      </template>
    </VDataTableServer>
  </VCard>

  <ReceberDialog
    :isDrawerOpen="isRecebimentoDrawerVisible"
    @update:isDrawerOpen="isRecebimentoDrawerVisible = $event"
    :ReceberData="ReceberData"
    @updateReceber="getReceber"
  />
</template>
