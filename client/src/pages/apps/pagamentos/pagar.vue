<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { useConfirm } from "@/utils/confirm.js";
import { paginationMeta } from "@api-utils/paginationMeta";
import { useAlert } from "@/composables/useAlert";
import { can } from "@layouts/plugins/casl";
import { useFunctions } from "@/composables/useFunctions";
import moment from "moment";

import PagarDialog from "@/views/apps/pagamentos/PagarDialog.vue";
import DespesasDialog from "@/views/apps/pagamentos/DespesasDialog.vue";

const { setAlert } = useAlert();
const { debounce } = useFunctions();

const router = useRouter();
const route = useRoute();

if (!can("pagar", "financeiro_despesa")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

const pagar = ref([]);
const loading = ref(false);

// 👉 Store
const searchQuery = ref("");
const dataDeQuery = ref(moment().startOf("month").format("YYYY-MM-DD"));
const dataAteQuery = ref(moment().endOf("month").format("YYYY-MM-DD"));
const pagoQuery = ref(5);
const funcionarioQuery = ref(null);
const tipoQuery = ref(null);

// Data table options
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref();
const orderBy = ref();
const totalPagar = ref(0);

const updateOptions = (options) => {
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key;
  orderBy.value = options.sortBy[0]?.order;

  getPagar();
};

// Headers
const headers = [
  {
    title: "Descrição",
    key: "descricao",
    sortable: false,
  },
  {
    title: "Tipo",
    key: "tipo",
  },
  {
    title: "Valor",
    key: "valor",
  },
  {
    title: "Vencimento",
    key: "data",
  },
  {
    title: "Status",
    key: "pago",
  },
  {
    title: "Ações",
    key: "actions",
    sortable: false,
  },
];

const selecionados = ref([]);
const contas = ref([]);

const pagoSelect = [
  { value: 0, title: "Todos" },
  { value: 5, title: "Não pagos" },
  { value: 1, title: "Pago" },
  { value: 2, title: "Em aberto" },
  { value: 3, title: "Em atraso" },
  { value: 4, title: "Pagar hoje" },
];

const relatorios = ref({
  totalaPagar: 0,
  totalEmAberto: 0,
  totalPago: 0,
  totalEmAtraso: 0,
});

const widgetData = ref([
  {
    title: "Total a Pagar",
    value: relatorios.value.totalaPagar,
    desc: `${moment(dataDeQuery.value).format("DD/MM/YYYY")} - ${moment(
      dataAteQuery.value
    ).format("DD/MM/YYYY")}`,
    icon: "tabler-credit-card",
    iconColor: "warning",
  },
  {
    title: "Total em Aberto",
    value: relatorios.value.totalEmAberto,
    desc: `${moment(dataDeQuery.value).format("DD/MM/YYYY")} - ${moment(
      dataAteQuery.value
    ).format("DD/MM/YYYY")}`,
    icon: "tabler-x",
    iconColor: "error",
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
    title: "Total em Atraso",
    value: relatorios.value.totalEmAtraso,
    desc: `${moment(dataDeQuery.value).format("DD/MM/YYYY")} - ${moment(
      dataAteQuery.value
    ).format("DD/MM/YYYY")}`,
    icon: "tabler-alert-triangle",
    iconColor: "error",
  },
]);

const formatValor = (valor) => {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const getPagar = async () => {
  if (loading.value) return;

  if (!can("pagar", "financeiro_despesa")) {
    setAlert(
      "Você não tem permissão para acessar esta página.",
      "error",
      "tabler-alert-triangle",
      3000
    );
    router.push("/");
    return;
  }

  if (!dataDeQuery.value || !dataAteQuery.value) {
    return setAlert(
      "Selecione a data inicial e final para filtrar as contas a pagar.",
      "warning",
      "tabler-alert-triangle",
      4000
    );
  }

  const dataDeQ = JSON.parse(JSON.stringify(dataDeQuery.value));
  const dataAteQ = JSON.parse(JSON.stringify(dataAteQuery.value));

  let queryPagar = {
    page: page.value,
    itemsPerPage: itemsPerPage.value,
    q: searchQuery.value,
    sortBy: sortBy.value,
    orderBy: orderBy.value,
    dataDe: dataDeQ,
    dataAte: dataAteQ,
    status: pagoQuery.value,
    funcionario: funcionarioQuery.value,
    tipo: tipoQuery.value,
  };

  console.log("Query Pagar", queryPagar);
  selecionados.value = [];
  loading.value = true;

  try {
    const res = await $api("/pagamentos/list/pagar", {
      query: queryPagar,
    });

    if (!res) return;

    console.log("pagar:", res);

    pagar.value = res.pagar;
    totalPagar.value = res.totalPagar;

    let descW = `${moment(dataDeQ).format("DD/MM/YYYY")} - ${moment(
      dataAteQ
    ).format("DD/MM/YYYY")}`;

    //Atualizar widgets
    widgetData.value = [
      {
        title: "Total a Pagar",
        value: res.relatorios.totalaPagar,
        desc: descW,
        icon: "tabler-credit-card",
        iconColor: "warning",
      },
      {
        title: "Total em Aberto",
        value: res.relatorios.totalEmAberto,
        desc: descW,
        icon: "tabler-x",
        iconColor: "error",
      },
      {
        title: "Total Pago",
        value: res.relatorios.totalPago,
        desc: descW,
        icon: "tabler-check",
        iconColor: "success",
      },
      {
        title: "Total em Atraso",
        value: res.relatorios.totalEmAtraso,
        desc: descW,
        icon: "tabler-alert-triangle",
        iconColor: "error",
      },
    ];
  } catch (error) {
    console.error("Error getting produtos:", error, error.response);

    pagar.value = [];
  }

  loading.value = false;
};

onMounted(() => {
  getPagar();
});

const checkDateStatus = (date) => {
  if (!date) return { status: "Em aberto", color: "info" };

  if (moment(date).isBefore(moment(), "day")) {
    return { status: "Em atraso", color: "error" };
  } else if (moment(date).isSame(moment(), "day")) {
    return { status: "Pagar hoje", color: "warning" };
  }

  return { status: "Em aberto", color: "info" };
};

watch(selecionados, (newVal) => {
  console.log("selecionados:", newVal);

  contas.value = newVal;

  //Adicionar classe "row-selecionada" nas linhas selecionadas
  const rows = document.querySelectorAll(".tabela-produtos tbody tr");
  rows.forEach((row) => {
    row.classList.remove("row-selecionada");
  });

  newVal.forEach((item) => {
    const row = document.querySelector(
      `.tabela-produtos tbody tr td div[data-id-item="${item.id}"]`
    )?.parentElement?.parentElement;
    if (row) row.classList.add("row-selecionada");
  });
});

const isPagarDrawerVisible = ref(false);

const openPagarDrawer = () => {
  if (selecionados.value.length == 0) {
    setAlert(
      "Selecione as contas para pagamento antes de adicionar uma saída!",
      "error",
      "tabler-alert-triangle",
      4000
    );
    return;
  }
  isPagarDrawerVisible.value = true;
};

watch(isPagarDrawerVisible, (newVal) => {
  if (!newVal) {
    selecionados.value = [];
  }
});

const funcionarios = ref([]);
const atualUser = useCookie("userData").value;

const fetchResources = async () => {
  let link = "/agenda/funcionarios";
  try {
    const res = await $api(link, {
      method: "GET",
      query: {
        ativo: null,
        data: atualUser.id,
      },
    });

    if (!res) return;

    funcionarios.value = res;

    //Adicionar todos os funcionários
    funcionarios.value.unshift({
      id: null,
      fullName: "Todos",
    });
  } catch (error) {
    console.error("Error fetching resources", error);
  }
};

fetchResources();

const tipoItens = [
  { value: null, title: "Todos" },
  { value: "Despesa", title: "Despesas" },
  { value: "Comissão", title: "Comissões" },
];

const isDespesaDrawerVisible = ref(false);
const DespesaData = ref({});

watch(isDespesaDrawerVisible, (newVal) => {
  if (!newVal) {
    DespesaData.value = {};
  }
});

const editarDespesa = async (item) => {
  if (!can("edit", "financeiro_despesa")) {
    setAlert(
      "Você não tem permissão para editar despesas!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (item.includes("D")) item = item.replace("D", "");
  try {
    const res = await $api(`/pagamentos/get/despesas/${item}`, {
      method: "GET",
    });

    if (!res) return;

    console.log("Produto edit:", res);

    DespesaData.value = res;
    isDespesaDrawerVisible.value = true;
  } catch (error) {
    console.error("Error getting produto:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Erro ao carregar despesa! Tente novamente.",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const debouncedGetPagar = () => {};
</script>
<template>
  <VCard class="mb-6">
    <VCardText>
      <VRow>
        <!-- 👉 Search  -->
        <VCol cols="12" sm="4">
          <AppTextField
            v-model="searchQuery"
            label="Pesquise uma conta a pagar"
            placeholder="Pesquise pela descrição, cliente, data ou valor"
            density="compact"
            @update:model-value="debouncedGetPagar"
            clearable
            @click:clear="getPagar"
          />
        </VCol>

        <!-- 👉 Meses -->
        <VCol cols="12" sm="4">
          <AppTextField
            v-model="dataDeQuery"
            label="Data inicial"
            placeholder="Selecione uma data"
            type="date"
            @update:model-value="debouncedGetPagar"
          />
        </VCol>

        <!-- 👉 Ano -->
        <VCol cols="12" sm="4">
          <AppTextField
            v-model="dataAteQuery"
            label="Data final"
            placeholder="Selecione uma data"
            type="date"
            @update:model-value="debouncedGetPagar"
          />
        </VCol>

        <VCol cols="12" sm="3">
          <AppSelect
            v-model="pagoQuery"
            :items="pagoSelect"
            label="Status"
            placeholder="Selecione um status"
            density="compact"
            clearable
            @click:clear="getPagar"
            @update:model-value="debouncedGetPagar"
          />
        </VCol>

        <VCol cols="12" sm="3">
          <AppSelect
            v-model="funcionarioQuery"
            :items="funcionarios"
            label="Funcionário"
            item-title="fullName"
            item-value="id"
            placeholder="Selecione um funcionário"
            density="compact"
            @update:model-value="debouncedGetPagar"
          />
        </VCol>

        <VCol cols="12" sm="3">
          <AppSelect
            v-model="tipoQuery"
            :items="tipoItens"
            label="Tipo"
            placeholder="Selecione um tipo"
            density="compact"
            @update:model-value="debouncedGetPagar"
          />
        </VCol>

        <VCol cols="12" sm="3">
          <label class="v-label mb-1 text-body-2 text-high-emphasis w-100" style="opacity: 0 !important;">
            Pesquisar
          </label>
          <VBtn color="primary" @click="getPagar">
            <VIcon icon="tabler-search" class="mr-1" />
            Pesquisar
          </VBtn>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <VRow class="match-height mb-4">
    <template v-for="(data, id) in widgetData" :key="id">
      <VCol cols="12" md="3">
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
      <VSpacer />

      <VBtn color="success" @click="openPagarDrawer">
        <VIcon icon="tabler-cash" class="mr-2" />
        Pagar

        <VTooltip
          location="top"
          activator="parent"
          v-if="selecionados.length == 0"
        >
          Selecione as contas para pagamento antes!
        </VTooltip>
      </VBtn>

      <!-- 👉 Add user button -->
      <VBtn color="primary" @click="isDespesaDrawerVisible = true">
        <VIcon icon="tabler-plus" class="mr-2" />
        Despesa
      </VBtn>
    </VCardText>

    <VDivider />

    <!-- SECTION datatable -->
    <VDataTableServer
      v-model:items-per-page="itemsPerPage"
      v-model:page="page"
      :items="pagar"
      :items-length="totalPagar"
      :headers="headers"
      class="text-no-wrap tabela-produtos tabela-pagar"
      @update:options="updateOptions"
      :loading="loading"
      loading-text="Carregando..."
      show-select
      item-value="id"
      v-model="selecionados"
      return-object
      item-selectable="selectable"
    >
      <template v-slot:item.descricao="{ item }">
        <div
          class="my-1 text-sm text-truncate"
          style="max-width: 300px"
          :data-id-item="item.id"
          v-html="item.descricao"
        />
      </template>

      <template v-slot:item.tipo="{ item }">
        <VChip
          :color="item.tipo == 'Despesa' ? 'warning' : 'primary'"
          class="text-capitalize"
          label
          variant="flat"
        >
          {{ item.tipo }}
        </VChip>
      </template>

      <template v-slot:item.valor="{ item }">
        <p class="mb-0">{{ formatValor(item.valor) }}</p>
      </template>

      <template v-slot:item.data="{ item }">
        <p class="mb-0">
          {{ moment(item.data).format("DD/MM/YYYY") }}
        </p>
      </template>

      <template v-slot:item.pago="{ item }">
        <VChip color="success" v-if="item.pago == 1" label variant="flat">
          Pago
        </VChip>
        <VChip
          :color="checkDateStatus(item.data).color"
          v-else
          label
          variant="flat"
        >
          {{ checkDateStatus(item.data).status }}
        </VChip>
      </template>

      <template #item.actions="{ item }">
        <IconBtn
          color="warning"
          @click="editarDespesa(item.id)"
          v-if="item.tipo == 'Despesa'"
        >
          <VIcon icon="tabler-edit" />
        </IconBtn>
      </template>

      <!-- pagination -->
      <template #bottom>
        <VDivider />
        <div
          class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3"
        >
          <p class="text-sm text-disabled mb-0" v-if="itemsPerPage != -1">
            {{ paginationMeta({ page, itemsPerPage }, totalPagar) }}
          </p>
          <p class="text-sm text-disabled mb-0" v-if="itemsPerPage == -1">
            {{ "Exibindo " + totalPagar + " resultados" }}
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
            :length="Math.ceil(totalPagar / itemsPerPage)"
            :total-visible="
              $vuetify.display.xs
                ? 1
                : Math.ceil(totalPagar / itemsPerPage) > 5
                ? 5
                : Math.ceil(totalPagar / itemsPerPage)
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

  <!--<DespesasDialog :isDrawerOpen="isDespesaDrawerVisible" @update:isDrawerOpen="isDespesaDrawerVisible = $event"
    :DespesaData="DespesaData" @updateDespesas="getDespesas" />-->

  <PagarDialog
    :isDrawerOpen="isPagarDrawerVisible"
    @update:isDrawerOpen="isPagarDrawerVisible = $event"
    :contas="contas"
    @updatePagar="getPagar"
  />

  <DespesasDialog
    :isDrawerOpen="isDespesaDrawerVisible"
    @update:isDrawerOpen="isDespesaDrawerVisible = $event"
    :DespesaData="DespesaData"
    @updateDespesas="getPagar"
  />
</template>

<style>
tr.v-data-table__tr.row-selecionada {
  background-color: #3182ce75;
}

.tabela-pagar .v-selection-control--disabled {
  display: none !important;
}
</style>
