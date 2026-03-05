<script setup>
import { VDataTableServer } from "vuetify/labs/VDataTable";
import { paginationMeta } from "@api-utils/paginationMeta";

import { useFunctions } from "@/composables/useFunctions";
const {
  formatValue,
  escreverEndereco,
  formatDateAgendamento,
} = useFunctions();

const props = defineProps({
  dataDe: {
    type: String,
    default: null,
  },
  dataAte: {
    type: String,
    default: null,
  },
});

const router = useRouter();
const loading = ref(true);
const userData = useCookie("userData").value;

onMounted(() => {
  getAgendamentos();
});

// Queries
const searchQuery = ref("");
const dataDeQuery = ref("");
const dataAteQuery = ref("");
const statusQuery = ref(null);
const clienteQuery = ref(null);
const clienteText = ref("");

// Clientes
const clientes = ref([]);
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

    clientes.value = res.clientes;
  } catch (error) {
    console.error("Error Get Clientes:", error);
  } finally {
    loadingClientes.value = false;
  }
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

if (props.dataDe) {
  dataDeQuery.value = props.dataDe;
}

if (props.dataAte) {
  dataAteQuery.value = props.dataAte;
}

// Watchers
watch(
  () => props.dataDe,
  () => {
    dataDeQuery.value = props.dataDe;
    getAgendamentos();
  }
);

watch(
  () => props.dataAte,
  () => {
    dataAteQuery.value = props.dataAte;
    getAgendamentos();
  }
);

// Data table options
const itemsPerPage = ref(10);
const page = ref(1);
const sortBy = ref();
const orderBy = ref();

const updateOptions = (options) => {
  page.value = options.page;
  sortBy.value = options.sortBy[0]?.key;
  orderBy.value = options.sortBy[0]?.order;
  getAgendamentos();
};

// Headers
const headers = [
  {
    title: "Informações do Agendamento",
    key: "age_data",
  },
  {
    title: "Serviços",
    key: "servicos",
    sortable: false,
  },
  {
    title: "Ações",
    key: "actions",
    sortable: false,
  },
];

// Agendamentos
const agendamentos = ref([]);
const totalAgendamentos = ref(0);

const getAgendamentos = async () => {
  loading.value = true;

  try {
    const res = await $api(`/agenda/getAgendamentosByCliente/`, {
      method: "GET",
      query: {
        q: searchQuery.value,
        dataDe: dataDeQuery.value,
        dataAte: dataAteQuery.value,
        cliente: clienteQuery.value,
        status: statusQuery.value,
        itemsPerPage: itemsPerPage.value,
        page: page.value,
        sortBy: sortBy.value,
        orderBy: orderBy.value,
      },
    });

    agendamentos.value = res.agendamentos;
    totalAgendamentos.value = res.totalAgendamentos;
  } catch (err) {
    console.error("Error fetching agendamentos", err);
    agendamentos.value = [];
  }

  loading.value = false;
};

// Funcionários
const funcionarios = ref([]);

const fetchResources = async () => {
  try {
    const res = await $api("/agenda/funcionarios", {
      method: "GET",
      query: {
        role: "colaborador",
        ativo: null,
        data: userData.id,
      },
    });

    if (!res) return;

    funcionarios.value = res;

    funcionarios.value.unshift({
      id: null,
      fullName: "Todos",
    });
  } catch (error) {
    console.error("Error fetching resources", error);
  }
};

fetchResources();

const statusItens = [
  { value: null, title: "Todos" },
  { value: 1, title: "Agendado" },
  { value: 2, title: "Confirmado" },
  { value: 3, title: "Atendido" },
  { value: 6, title: "Cancelado" },
  { value: 7, title: "Remarcado" },
];

const viewAge = (age) => {
  router.push({
    name: "agendamento",
    query: {
      viewAgendamento: age.age_id,
    },
  });
};
</script>

<template>
  <section>
    <div class="mb-6">
      <VRow class="match-height">
        <VCol cols="12">
          <VCard>
            <VCardText>
              <VRow>
                <VCol cols="12" md="4">
                  <v-menu location="bottom" max-height="250px">
                    <template v-slot:activator="{ props }">
                      <AppTextField
                        v-model="clienteText"
                        variant="solo-filled"
                        v-bind="props"
                        :loading="loadingClientes"
                        @keyup="getClientes"
                        clearable
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
                          {{ cliente.cli_nome
                          }}{{
                            cliente?.enderecos?.[0]?.end_bairro
                              ? " - " + cliente?.enderecos?.[0]?.end_bairro
                              : cliente?.enderecos?.[0]?.end_cidade
                              ? " - " + cliente?.enderecos?.[0]?.end_cidade
                              : ""
                          }}
                        </p>
                        <p
                          class="text-caption mb-1"
                          v-for="endereco in cliente?.enderecos?.filter(
                            (endereco) =>
                              endereco?.end_logradouro ||
                              endereco?.end_cidade ||
                              endereco?.end_estado ||
                              endereco?.end_cep ||
                              endereco?.end_numero ||
                              endereco?.end_bairro
                          )"
                          :key="endereco.id"
                          v-if="cliente?.enderecos?.length > 0"
                        >
                          <VIcon icon="tabler-map-pin" size="12" class="mr-1" />
                          {{
                            endereco?.end_logradouro ||
                            endereco?.end_cidade ||
                            endereco?.end_estado ||
                            endereco?.end_cep ||
                            endereco?.end_numero ||
                            endereco?.end_bairro
                              ? escreverEndereco(endereco)
                              : ""
                          }}
                        </p>
                        <p class="text-caption mb-1" v-else>
                          Sem endereço cadastrado
                        </p>
                      </VListItem>
                    </VList>

                    <VList dense v-else-if="clienteText === ''">
                      <VListItem>
                        <p class="mb-0">
                          Escreva mais de 3 letras para pesquisar um cliente por
                          nome, CPF, telefone ou endereço
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
                </VCol>

                <VCol cols="12" md="4">
                  <AppTextField
                    v-model="searchQuery"
                    label="Pesquise por valor"
                    placeholder="Pesquisar por valor"
                    density="compact"
                    @update:model-value="getAgendamentos"
                  />
                </VCol>

                <VCol cols="12" md="4">
                  <AppSelect
                    v-model="statusQuery"
                    :items="statusItens"
                    label="Status do Agendamento"
                    @update:model-value="getAgendamentos"
                  />
                </VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </div>

    <VCard>
      <VCardText class="d-flex flex-wrap py-4 gap-4">
        <div class="me-3 d-flex gap-3">
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
        </div>
        <VSpacer />
      </VCardText>

      <VDivider />

      <!-- SECTION datatable -->
      <VDataTableServer
        v-model:items-per-page="itemsPerPage"
        v-model:page="page"
        :items="agendamentos"
        :items-length="totalAgendamentos"
        :headers="headers"
        @update:options="updateOptions"
        :loading="loading"
        loading-text="Carregando agendamentos..."
      >
        <template #item.age_data="{ item }">
          <div class="my-2" style="max-width: 300px">
            <p class="mb-1 text-sm">
              <VIcon icon="tabler-user" class="mr-2" />
              {{ item?.cliente[0]?.cli_nome || "N/A" }}
              <VTooltip activator="parent" location="bottom">
                <p class="mb-0 text-sm">Cliente</p>
              </VTooltip>
            </p>

            <p class="mb-1 text-sm" v-if="item?.cliente[0]?.cli_celular">
              <VIcon icon="tabler-phone" class="mr-2" />
              {{ item.cliente[0].cli_celular }}
              <VTooltip activator="parent" location="bottom">
                <p class="mb-0 text-sm">Telefone do cliente</p>
              </VTooltip>
            </p>

            <p class="mb-1 text-sm">
              <VIcon icon="tabler-calendar" class="mr-2" />
              {{
                formatDateAgendamento(
                  item.age_data,
                  item.age_horaInicio,
                  item.age_horaFim
                )
              }}
              <VTooltip activator="parent" location="bottom">
                <p class="mb-0 text-sm">Data do agendamento</p>
              </VTooltip>
            </p>

            <p class="mb-1 text-sm">
              <VIcon icon="tabler-info-circle" class="mr-2" />
              {{ item?.status || "Sem status" }}
              <VTooltip activator="parent" location="bottom">
                <p class="mb-0 text-sm">Status do agendamento</p>
              </VTooltip>
            </p>

            <p class="mb-1 text-sm text-truncate">
              <VIcon icon="tabler-user" class="mr-2" />
              {{
                item?.funcionario?.length
                  ? item.funcionario[0]?.fullName
                  : "Sem funcionário"
              }}
              <VTooltip activator="parent" location="bottom">
                <p class="mb-0 text-sm">Funcionário responsável</p>
              </VTooltip>
            </p>

            <p class="mb-0 text-sm" v-if="item?.age_valor != null">
              <VIcon icon="tabler-coin" class="mr-2" />
              {{ formatValue(item?.age_valor) }}
              <VTooltip activator="parent" location="bottom">
                <p class="mb-0 text-sm">Valor do agendamento</p>
              </VTooltip>
            </p>
          </div>
        </template>

        <template #item.servicos="{ item }">
          <div class="my-2" style="max-width: 300px">
            <div v-if="item?.servicos?.length > 0">
              <p
                class="mb-1 text-sm cursor-pointer"
                v-for="(servico, index) in item.servicos"
                :key="index"
              >
                <VIcon icon="tabler-tools" class="mr-2" size="16" />
                <strong>{{ servico.ser_quantity || 1 }}x</strong>
                {{ servico.ser_nome }} ({{ formatValue(servico.ser_valor) }})
              </p>
            </div>
            <p class="mb-0 text-sm text-disabled" v-else>
              <VIcon icon="tabler-tools-off" class="mr-2" />
              Nenhum serviço
            </p>
          </div>
        </template>

        <!-- Actions -->
        <template #item.actions="{ item }">
          <IconBtn variant="tonal" color="success" @click="viewAge(item)">
            <VIcon icon="tabler-eye" />

            <VTooltip
              activator="parent"
              location="bottom"
              text="Visualizar agendamento"
            />
          </IconBtn>
        </template>

        <!-- pagination -->
        <template #bottom>
          <VDivider />
          <div
            class="d-flex align-center justify-sm-space-between justify-center flex-wrap gap-3 pa-5 pt-3"
          >
            <p class="text-sm text-disabled mb-0">
              {{ paginationMeta({ page, itemsPerPage }, totalAgendamentos) }}
            </p>

            <VPagination
              v-model="page"
              :length="Math.ceil(totalAgendamentos / itemsPerPage)"
              :total-visible="
                $vuetify.display.xs
                  ? 1
                  : totalAgendamentos > 100
                  ? 4
                  : Math.ceil(totalAgendamentos / itemsPerPage)
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
      <!-- SECTION -->
    </VCard>
  </section>
</template>
