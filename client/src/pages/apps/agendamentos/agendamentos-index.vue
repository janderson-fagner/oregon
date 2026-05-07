<script setup>
import { temaAtual } from "@core/stores/config";
import FullCalendar from "@fullcalendar/vue3";
import { blankEvent, useCalendar } from "@/views/apps/calendar/useCalendar";
import { socket } from "@/composables/useSocket";
import { can } from "@layouts/plugins/casl";
import { useFunctions } from "@/composables/useFunctions";
const { typesAgendamento } = useFunctions();
import customLoaderBlue from "@/assets/images/custom-loader-blue.gif";
import draggable from "vuedraggable";
import moment from "moment";

// Components
import AgendamentoCard from "@/views/apps/calendar/AgendamentoCard.vue";
import NewAgendamento from "@/views/apps/calendar/NewAgendamento.vue";
import AgendamentosTable from "@/views/apps/calendar/AgendamentosTable.vue";

const router = useRouter();
const route = useRoute();
const { setAlert } = useAlert();

const isMobile = ref(window.innerWidth < 768);

// 👉 Event
const event = ref(structuredClone(blankEvent));
const isEventHandlerSidebarActive = ref(false);
const selectedFuncionario = ref(null);
const selectedType = ref(null);
const selectedStatus = ref(null);

if (!can("view", "agendamento") && !can("view-all", "agendamento")) {
  setAlert(
    "Você não tem permissão para ver os agendamentos!",
    "error",
    "tabler-alert-circle",
    5000
  );
  router.push("/");
}

const { isLeftSidebarOpen } = useResponsiveLeftSidebar();

// 👉 useCalendar
const {
  refCalendar,
  calendarOptions,
  addEvent,
  updateEvent,
  removeEvent,
  searchEventsByFuncionario,
  openEvent,
  isLoading,
  typeViewActive,
  fetchEvents,
  refetchEvents,
  fetchResources: fetchResourcesCalendar,
} = useCalendar(
  event,
  isEventHandlerSidebarActive,
  isLeftSidebarOpen,
  selectedFuncionario,
  selectedType,
  selectedStatus
);

const openNewEvent = ref(false);
const openDateNavigation = ref(false);
const selectedYear = ref(new Date().getFullYear());
const selectedMonth = ref(new Date().getMonth() + 1);
const selectedDay = ref(new Date().getDate());

const handleUpdateEvent = (event) => {
  console.log("Evento atualizado, emitindo evento para o servidor", event);
  socket.emit("updateEvent", event);
  // Força refetch local imediato para quem fez a ação
  refetchEvents();
};

const handleAddEvent = (eventId) => {
  console.log("Evento adicionado, emitindo evento para o servidor", eventId);
  socket.emit("addEvent", eventId);
  // Força refetch local imediato
  refetchEvents();
};

const funcionarios = ref([]);
const funcionariosOrder = ref([]);
const viewOrderFuncionarios = ref(false);

const fetchResources = async () => {
  let link = can("view-all", "agendamento")
    ? "/agenda/funcionarios"
    : "/agenda/funcionariosCalendar";
  try {
    const res = await $api(link, {
      method: "GET",
      query: {
        ativo: null,
      },
    });

    if (!res) return;

    console.log("Funcionários:", res);

    funcionarios.value = res;
    funcionariosOrder.value = JSON.parse(JSON.stringify(res)).sort(
      (a, b) => a.ordemCalendar - b.ordemCalendar
    );

    //Adicionar todos os funcionários
    funcionarios.value.unshift({
      id: null,
      fullName: "Todos",
    });
  } catch (error) {
    console.error("Error fetching resources", error);
  }
};

const handleEndOrderFuncionarios = async (event) => {
  console.log("Evento de ordenação de funcionários:", event);
  funcionariosOrder.value.forEach((funcionario, index) => {
    funcionario.ordemCalendar = index + 1;
  });

  try {
    const res = await $api("/agenda/funcionariosOrder", {
      method: "POST",
      body: {
        funcionarios: funcionariosOrder.value,
      },
    });

    if (!res) return;

    console.log("Funcionários ordenados:", res);

    setAlert(
      "Funcionários ordenados com sucesso!",
      "success",
      "tabler-check",
      5000
    );

    fetchResourcesCalendar();
  } catch (error) {
    console.error("Error ordering funcionários", error);
    setAlert(
      error.response?.data?.message ||
        "Erro ao ordenar funcionários, tente novamente!",
      "error",
      "tabler-alert-circle",
      5000
    );
  }
};

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

const status = [
  {
    title: "Todos",
    value: null,
  },
  {
    title: "Atendido",
    value: 3,
  },
  {
    title: "Agendado",
    value: 1,
  },
  {
    title: "Confirmado",
    value: 2,
  },
  {
    title: "Cancelado",
    value: 6,
  },
  {
    title: "Remarcado",
    value: 7,
  },
];

const getConfig = async () => {
  try {
    const res = await $api("/config/get", {
      method: "GET",
    });

    if (!res) return;

    console.log("Config:", res);

    coresStatus.value.forEach((c) => {
      c.cor = res.find((r) => r.type === c.type)?.value;
    });
  } catch (error) {
    console.error("Erro ao buscar configurações:", error, error.response);
  }
};

fetchResources();
getConfig();

//Se tiver a query "viewAgendamento" abre o agendamento
if (route.query.viewAgendamento) {
  openEvent(route.query.viewAgendamento);
}

const viewFilter = ref(false);
const viewHelper = ref(false);

// Função para navegar para uma data específica
const navigateToDate = () => {
  const targetDate = new Date(
    selectedYear.value,
    selectedMonth.value - 1,
    selectedDay.value
  );
  refCalendar.value.getApi().gotoDate(targetDate);
  openDateNavigation.value = false;
};

// Gerar array de anos (últimos 10 anos até próximos 10 anos)
const years = computed(() => {
  const currentYear = new Date().getFullYear();
  const yearsArray = [];
  for (let i = currentYear - 10; i <= currentYear; i++) {
    yearsArray.push(i);
  }
  return yearsArray;
});

// Array de meses
const months = [
  { value: 1, title: "Janeiro" },
  { value: 2, title: "Fevereiro" },
  { value: 3, title: "Março" },
  { value: 4, title: "Abril" },
  { value: 5, title: "Maio" },
  { value: 6, title: "Junho" },
  { value: 7, title: "Julho" },
  { value: 8, title: "Agosto" },
  { value: 9, title: "Setembro" },
  { value: 10, title: "Outubro" },
  { value: 11, title: "Novembro" },
  { value: 12, title: "Dezembro" },
];

const alturaCelendario = ref(window.innerHeight);

const calcularAlturaCelendario = () => {
  let alturaTela = window.innerHeight;
  let alturaHeader =
    document.querySelector(".layout-navbar.navbar-blur")?.offsetHeight + 40;
  let alturaToolbar =
    document.querySelector("#toolbar-calendario")?.offsetHeight + 40;
  let alturaTotal = alturaTela - alturaHeader - alturaToolbar;

  console.log("alturas", {
    alturaTela,
    alturaHeader,
    alturaToolbar,
    alturaTotal,
  });

  alturaCelendario.value = alturaTotal;
};

onMounted(() => {
  calcularAlturaCelendario();
});

watch(window.innerHeight, () => {
  calcularAlturaCelendario();
});

const viewType = ref("calendar");
const viewFilterTable = ref(false);

// Datas para tabela
const tableDataDe = ref(moment().startOf("month").format("YYYY-MM-DD"));
const tableDataAte = ref(moment().endOf("month").format("YYYY-MM-DD"));

const handleViewChange = async (view) => {
  await nextTick();
  if (view == "calendar") {
    refetchEvents();
  }
};
</script>

<template>
  <div
    id="toolbar-calendario"
    class="d-flex flex-row align-center justify-space-between mb-4 flex-wrap"
  >
    <div :class="!isMobile ? 'w-50' : 'w-100'">
      <h2 class="text-h5 mb-0">
        Agendamentos
        <VIcon
          :icon="
            !viewHelper ? 'tabler-info-circle-filled' : 'tabler-circle-x-filled'
          "
          @click="viewHelper = !viewHelper"
          color="primary"
          size="20"
        />
      </h2>
    </div>

    <div
      class="d-flex flex-row align-center gap-3"
      :class="!isMobile ? 'w-50 justify-end' : 'w-100 mt-2'"
    >
      <ViewToggle v-model="viewType" @update:modelValue="handleViewChange" />

      <template v-if="viewType == 'calendar'">
        <IconBtn
          v-if="can('view-all', 'agendamento')"
          color="primary"
          variant="tonal"
          @click="viewFilter = !viewFilter"
          size="48"
        >
          <VIcon :icon="viewFilter ? 'tabler-filter-off' : 'tabler-filter'" />
        </IconBtn>

        <IconBtn
          v-if="can('view-all', 'agendamento')"
          color="primary"
          variant="tonal"
          @click="viewOrderFuncionarios = !viewOrderFuncionarios"
          size="48"
        >
          <VIcon icon="tabler-reorder" />
        </IconBtn>

        <IconBtn
          color="primary"
          variant="tonal"
          @click="openDateNavigation = true"
          size="48"
        >
          <VIcon icon="tabler-calendar-event" />
        </IconBtn>
      </template>

      <VBtn
        color="primary"
        @click="openNewEvent = true"
        v-if="can('create', 'agendamento')"
        :icon="isMobile"
      >
        <VIcon icon="tabler-calendar-plus" :class="{ 'mr-2': !isMobile }" />
        {{ !isMobile ? "Novo Agendamento" : "" }}
      </VBtn>
    </div>
  </div>

  <div v-if="viewType == 'calendar'">
    <VCard
      flat
      :class="{
        'overflow-x-auto':
          typeViewActive == 'resourceTimeGridDay' &&
          isMobile &&
          can('view-all', 'agendamento'),
        'calendario-mobile': isMobile,
      }"
      :style="isMobile ? `max-height: ${alturaCelendario}px;` : ''"
    >
      <FullCalendar
        ref="refCalendar"
        :options="calendarOptions"
        :style="`${
          typeViewActive == 'resourceTimeGridDay' &&
          isMobile &&
          can('view-all', 'agendamento')
            ? 'min-width: 800px;'
            : ''
        }`"
      />
    </VCard>
  </div>

  <div v-else-if="viewType == 'table'">
    <VCard class="mb-6" rounded="xl">
      <VCardText>
        <VRow class="align-end">
          <VCol cols="12" sm="3">
            <VTextField
              v-model="tableDataDe"
              type="date"
              label="Data Inicial"
            />
          </VCol>

          <VCol cols="12" sm="3">
            <VTextField v-model="tableDataAte" type="date" label="Data Final" />
          </VCol>

          <VCol cols="12" sm="6">
            <div class="d-flex flex-wrap gap-2">
              <VBtn
                size="small"
                variant="tonal"
                @click="
                  tableDataDe = moment().format('YYYY-MM-DD');
                  tableDataAte = moment().format('YYYY-MM-DD');
                "
              >
                Hoje
              </VBtn>

              <VBtn
                size="small"
                variant="tonal"
                @click="
                  tableDataDe = moment().startOf('week').format('YYYY-MM-DD');
                  tableDataAte = moment().endOf('week').format('YYYY-MM-DD');
                "
              >
                Essa Semana
              </VBtn>

              <VBtn
                size="small"
                variant="tonal"
                @click="
                  tableDataDe = moment().startOf('month').format('YYYY-MM-DD');
                  tableDataAte = moment().endOf('month').format('YYYY-MM-DD');
                "
              >
                Este Mês
              </VBtn>

              <VBtn
                size="small"
                variant="flat"
                class="ml-auto"
                @click="viewFilterTable = !viewFilterTable"
              >
                <VIcon
                  :icon="
                    viewFilterTable ? 'tabler-filter-off' : 'tabler-filter'
                  "
                  class="mr-2"
                />
                {{ viewFilterTable ? "Ocultar Filtros" : "Mostrar Filtros" }}
              </VBtn>
            </div>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <AgendamentosTable
      :dataDe="tableDataDe"
      :dataAte="tableDataAte"
      :viewFilter="viewFilterTable"
      @openEvent="openEvent($event)"
    />
  </div>

  <VDialog
    v-model="viewOrderFuncionarios"
    width="500"
    v-if="can('view-all', 'agendamento')"
  >
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pt-0 mb-5"
          @cancel="viewOrderFuncionarios = false"
        >
          <template #title>
            <div>
              <p class="mb-0">
                <VIcon icon="tabler-reorder" class="mr-2" />
                Ordenar Colunas de Funcionários
              </p>
              <p class="mb-0 text-caption">
                Clique arraste e solte os funcionários para alterar a ordem das
                colunas.
              </p>
            </div>
          </template>
        </AppDrawerHeaderSection>

        <draggable
          v-model="funcionariosOrder"
          group="funcionarios"
          item-key="id"
          @end="handleEndOrderFuncionarios"
        >
          <template #item="{ element: funcionario, index: indexFuncionario }">
            <VCard
              class="pa-4 cursor-pointer mb-2"
              rounded="lg"
              :color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
            >
              <p class="mb-0">
                <VIcon icon="tabler-grip-vertical" class="mr-2" />
                {{ funcionario.ordemCalendar }} -
                {{ funcionario.fullName }}
              </p>
            </VCard>
          </template>
        </draggable>
      </VCardText>
    </VCard>
  </VDialog>

  <VDialog v-model="viewHelper" width="700">
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection title="Legendas" @cancel="viewHelper = false" />
        <VRow class="match-height">
          <VCol cols="12" md="6">
            <VCard>
              <VCardText class="pa-3">
                <div>
                  <p class="mb-1 text-sm">Status:</p>
                  <p
                    class="mb-1 text-sm"
                    v-for="core in coresStatus"
                    :key="core.type"
                  >
                    <VIcon icon="tabler-circle-filled" :color="core.cor" />
                    {{ core.status }}
                  </p>
                </div>
              </VCardText>
            </VCard>
          </VCol>
          <VCol cols="12" md="6">
            <VCard>
              <VCardText class="pa-3">
                <div>
                  <p class="mb-1 text-sm">Emojis:</p>
                  <p
                    class="mb-1 text-sm"
                    v-for="type in typesAgendamento"
                    :key="type.id"
                  >
                    {{ type.emoji }} {{ type.title }}
                  </p>
                </div>
              </VCardText>
            </VCard>
          </VCol>
        </VRow>

        <VCard v-if="can('view-all', 'agendamento')" class="mt-2">
          <VCardText class="pa-3">
            <div>
              <p class="mb-1 text-sm">Funcionários:</p>
              <div
                style="
                  display: grid;
                  grid-template-columns: repeat(3, 1fr);
                  gap: 4px;
                "
              >
                <p
                  class="mb-0 text-sm"
                  v-for="funcionario in funcionarios.filter(
                    (f) => f.id != null
                  )"
                  :key="funcionario.id"
                >
                  <VIcon
                    icon="tabler-circle-filled"
                    :color="funcionario.color || 'secondary'"
                  />
                  {{ funcionario.fullName }}
                </p>
              </div>
            </div>
          </VCardText>
        </VCard>
      </VCardText>
    </VCard>
  </VDialog>

  <VDialog
    v-model="viewFilter"
    width="400"
    v-if="can('view-all', 'agendamento')"
  >
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pt-0 mb-5"
          title="Filtrar Agendamentos"
          @cancel="viewFilter = false"
        />

        <AppSelect
          v-model="selectedFuncionario"
          :items="funcionarios"
          item-title="fullName"
          item-value="id"
          label="Filtrar por Funcionário"
          clearable
          class="mb-4"
        />

        <AppSelect
          v-model="selectedType"
          :items="[{ title: 'Todos', value: null }, ...typesAgendamento]"
          label="Filtrar por Tipo"
          placeholder="Selecione o tipo"
          clearable
          class="mb-4"
        >
          <template #selection="{ item }">
            {{ item.raw?.emoji ?? "" }}
            {{ item.raw?.title ?? "" }}
          </template>

          <template #item="{ props, item }">
            <VListItem
              #title
              v-bind="props"
              style="display: flex; align-items: center"
            >
              {{ item.raw.emoji ?? "" }}
              {{ item.raw.title ?? "" }}
            </VListItem>
          </template>
        </AppSelect>

        <AppSelect
          v-model="selectedStatus"
          :items="status"
          label="Filtrar por Status"
          placeholder="Selecione o status"
          clearable
          class="mb-4"
        />

        <VBtn
          class="w-100"
          color="primary"
          @click="
            viewFilter = false;
            searchEventsByFuncionario(
              selectedFuncionario,
              selectedType,
              selectedStatus
            );
          "
        >
          Filtrar
        </VBtn>

        <VBtn
          class="w-100 mt-2"
          style="height: 30px"
          size="small"
          variant="text"
          color="secondary"
          @click="
            viewFilter = false;
            selectedFuncionario = null;
            selectedType = null;
            selectedStatus = null;
            searchEventsByFuncionario(
              selectedFuncionario,
              selectedType,
              selectedStatus
            );
          "
        >
          Limpar Filtros
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>

  <AgendamentoCard
    :isDrawerOpen="isEventHandlerSidebarActive"
    @update:isDrawerOpen="isEventHandlerSidebarActive = $event"
    :agendamentoData="event"
    @updateEvents="handleUpdateEvent"
    @addEvents="handleAddEvent"
    @removeEvents="removeEvent"
  />

  <NewAgendamento
    @newEvent="(e) => { addEvent(e); socket.emit('addEvent', e); }"
    :isDrawerOpen="openNewEvent"
    @update:isDrawerOpen="openNewEvent = $event"
    v-if="can('create', 'agendamento')"
  />

  <!-- Loading Dialog -->
  <VDialog v-model="isLoading" persistent>
    <div class="d-flex flex-column align-center justify-center">
      <VImg
        :src="customLoaderBlue"
        alt="Carregando..."
        width="120px"
        height="120px"
      />
      <p class="mt-4 text-h6">Carregando agendamentos...</p>
    </div>
  </VDialog>

  <!-- Modal de Navegação de Datas -->
  <VDialog v-model="openDateNavigation" max-width="600">
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          title="Navegar para Data"
          @cancel="openDateNavigation = false"
          customClass="pt-0 mb-4"
        />

        <VRow>
          <VCol cols="12" md="4">
            <VTextField
              v-model="selectedDay"
              label="Dia"
              variant="outlined"
              density="compact"
            />
          </VCol>

          <VCol cols="12" md="4">
            <VSelect
              v-model="selectedMonth"
              :items="months"
              item-title="title"
              item-value="value"
              label="Mês"
              variant="outlined"
              density="compact"
            />
          </VCol>

          <VCol cols="12" md="4">
            <VSelect
              v-model="selectedYear"
              :items="years"
              label="Ano"
              variant="outlined"
              density="compact"
            />
          </VCol>
        </VRow>

        <div class="linha-flex mt-4 justify-end">
          <VBtn
            color="secondary"
            variant="text"
            @click="openDateNavigation = false"
          >
            Cancelar
          </VBtn>
          <VBtn color="primary" class="text-none" @click="navigateToDate">
            Ir para data
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style lang="scss">
@use "@core/scss/template/libs/full-calendar";

.calendars-checkbox {
  .v-label {
    color: rgba(var(--v-theme-on-surface), var(--v-high-emphasis-opacity));
    opacity: var(--v-high-emphasis-opacity);
  }
}

.calendar-add-event-drawer {
  &.v-navigation-drawer:not(.v-navigation-drawer--temporary) {
    border-end-start-radius: 0.375rem;
    border-start-start-radius: 0.375rem;
  }
}

.calendar-date-picker {
  display: none;

  + .flatpickr-input {
    + .flatpickr-calendar.inline {
      border: none;
      box-shadow: none;

      .flatpickr-months {
        border-block-end: none;
      }
    }
  }

  & ~ .flatpickr-calendar .flatpickr-weekdays {
    margin-block: 0 4px;
  }
}
</style>

<style lang="scss" scoped>
.v-layout {
  overflow: visible !important;

  .v-card {
    overflow: visible;
  }
}
</style>
