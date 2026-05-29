<script setup>
import moment from "moment";
import informacoes from "@/views/apps/clientes/cliente/informacoes.vue";
import clienteAvancado from "@/pages/apps/clientes/cliente.vue";

const {
  escreverEndereco,
  formatDateAgendamento,
  copyEndereco,
  enderecoWaze,
  enderecoMaps,
} = useFunctions();

const props = defineProps({
  dados: {
    type: Object,
    default: () => ({}),
  },
});

const emit = defineEmits(["close", "rename"]);

const { setAlert } = useAlert();

// ---- Edição do nome do contato (WhatsApp) ----
const editandoNome = ref(false);
const nomeEdit = ref("");
const salvandoNome = ref(false);

const iniciarEdicaoNome = () => {
  nomeEdit.value =
    props.dados?.contato?.nomeCustom || props.dados?.contato?.nome || "";
  editandoNome.value = true;
};

const salvarNome = async () => {
  const convId = props.dados?.id;
  if (!convId) {
    editandoNome.value = false;
    return;
  }
  salvandoNome.value = true;
  try {
    const res = await $api(`/zap/contact-name/${convId}`, {
      method: "PUT",
      body: { name: nomeEdit.value },
    });
    // Propaga ao chat pai (cabeçalho + lista) o nome efetivo salvo
    emit("rename", res?.contact_name_custom ?? nomeEdit.value ?? null);
    editandoNome.value = false;
  } catch (error) {
    console.error("Erro ao salvar nome do contato:", error, error.response);
    setAlert("Não foi possível salvar o nome do contato.", "error");
  } finally {
    salvandoNome.value = false;
  }
};

// Formata um número WhatsApp (E.164 BR) como +55 (DDD) 00000-0000.
// Tolera 8 ou 9 dígitos no número local; se não reconhecer, devolve o original.
const formatPhone = (raw) => {
  let d = String(raw || "").replace(/\D/g, "");
  if (!d) return raw || "";
  let cc = "55";
  if (d.startsWith("55") && d.length >= 12) {
    d = d.slice(2);
  }
  const ddd = d.slice(0, 2);
  const num = d.slice(2);
  let numFmt = num;
  if (num.length === 9) numFmt = `${num.slice(0, 5)}-${num.slice(5)}`;
  else if (num.length === 8) numFmt = `${num.slice(0, 4)}-${num.slice(4)}`;
  if (!ddd) return `+${cc} ${num}`;
  return `+${cc} (${ddd}) ${numFmt}`;
};

const agendamentoSelected = ref(null);
const agendamentos = ref([]);
const allAgendamentos = ref([]);
const queryAgendamento = ref("");
const loadingAgendamentos = ref(false);
const getAgendamentos = async () => {
  if (!props.dados?.cliente?.cli_Id) return;

  loadingAgendamentos.value = true;

  try {
    const res = await $api(`/agenda/getAgendamentosByCliente/`, {
      method: "GET",
      query: {
        q: queryAgendamento.value,
        itemsPerPage: 1000,
        cliente: props.dados?.cliente?.cli_Id,
      },
    });

    if (!res) return;

    console.log("Res pedidos", res);

    allAgendamentos.value = res.agendamentos;

    agendamentos.value = res.agendamentos.slice(0, 20);
  } catch (error) {
    console.error("Error fetching agendamentos:", error, error.response);

    agendamentos.value = [];
    allAgendamentos.value = [];
  }

  loadingAgendamentos.value = false;
};

watch(
  () => props.dados,
  (newValue) => {
    if (newValue?.cliente?.cli_Id) {
      getAgendamentos();
    } else {
      agendamentos.value = [];
      allAgendamentos.value = [];
    }
  },
  { immediate: true }
);

const filterPedidos = () => {
  if (!queryAgendamento.value) {
    agendamentos.value = allAgendamentos.value.slice(0, 20);
    return;
  }

  const filtered = allAgendamentos.value.filter((agendamento) => {
    return (
      agendamento?.cliente?.first_name
        ?.toLowerCase()
        .includes(queryAgendamento.value.toLowerCase()) ||
      agendamento?.cliente?.last_name
        ?.toLowerCase()
        .includes(queryAgendamento.value.toLowerCase()) ||
      agendamento.id?.toString().includes(queryAgendamento.value.toLowerCase())
    );
  });

  agendamentos.value = filtered.slice(0, 20);
};

const formatValue = (value) => {
  if (!value) return "R$ 0,00";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const viewItens = ref(false);
const viewCodigoPix = ref(false);
const viewEventos = ref(false);

const closeDados = () => {
  agendamentoSelected.value = null;
  agendamentos.value = [];
  allAgendamentos.value = [];
  queryAgendamento.value = "";
  loadingAgendamentos.value = false;
  viewItens.value = false;
  viewCodigoPix.value = false;
  viewEventos.value = false;
  emit("close");
};

const viewClienteAvancado = ref(false);
</script>
<template>
  <div class="pa-3 overflow-y-auto" style="max-height: 700px">
    <div
      class="header-messages d-flex flex-row justify-space-between align-center"
    >
      <h2 class="text-h5 mb-4">
        {{ dados?.cliente?.cli_Id ? "Dados do Cliente" : "Dados do Contato" }}
      </h2>

      <VIcon icon="tabler-x" class="cursor-pointer" @click="closeDados" />
    </div>

    <p class="mb-2">Contato WhatsApp</p>

    <div class="d-flex flex-row gap-3 align-center">
      <VAvatar
        :color="dados?.contato?.avatar ? undefined : 'secondary'"
        size="40"
      >
        <VImg :src="dados?.contato?.avatar" v-if="dados?.contato?.avatar" />
        <VIcon icon="tabler-user-filled" v-else />
      </VAvatar>
      <div class="contact-info" style="min-width: 0; flex: 1">
        <!-- Nome do contato: visualização (com lápis) ou edição inline -->
        <div v-if="!editandoNome" class="d-flex align-center gap-1">
          <p class="mb-0 contact-name text-truncate">
            {{ dados?.contato?.nome || dados?.nome || "Contato" }}
          </p>
          <VIcon
            icon="tabler-pencil"
            size="16"
            class="cursor-pointer text-disabled flex-shrink-0"
            @click="iniciarEdicaoNome"
          />
        </div>
        <div v-else class="d-flex align-center gap-1">
          <VTextField
            v-model="nomeEdit"
            density="compact"
            hide-details
            autofocus
            placeholder="Nome do contato"
            style="min-width: 140px"
            @keyup.enter="salvarNome"
          />
          <IconBtn :loading="salvandoNome" @click="salvarNome">
            <VIcon icon="tabler-check" color="success" />
          </IconBtn>
          <IconBtn :disabled="salvandoNome" @click="editandoNome = false">
            <VIcon icon="tabler-x" />
          </IconBtn>
        </div>
        <p class="mb-0 online-msg">
          {{ formatPhone(dados?.contato?.numero) }}
        </p>
      </div>
    </div>

    <!-- Origem da conversa (anúncio Click-to-WhatsApp / publicação) -->
    <template v-if="dados?.referral">
      <VDivider class="my-3" />
      <p class="mb-2">Origem da conversa</p>
      <component
        :is="dados.referral.source_url ? 'a' : 'div'"
        class="origem-card"
        :class="{ 'cursor-pointer': dados.referral.source_url }"
        :href="dados.referral.source_url || undefined"
        :target="dados.referral.source_url ? '_blank' : undefined"
        rel="noopener noreferrer"
      >
        <VImg
          v-if="dados.referral.image_url || dados.referral.thumbnail_url"
          :src="dados.referral.image_url || dados.referral.thumbnail_url"
          width="52"
          height="52"
          cover
          class="rounded flex-shrink-0"
        />
        <VAvatar
          v-else
          color="primary"
          variant="tonal"
          size="52"
          class="rounded flex-shrink-0"
        >
          <VIcon icon="tabler-speakerphone" />
        </VAvatar>
        <div style="min-width: 0">
          <span class="origem-tag">
            <VIcon icon="tabler-speakerphone" size="12" />
            {{
              dados.referral.source_type === "post"
                ? "Publicação"
                : "Anúncio"
            }}
          </span>
          <p v-if="dados.referral.headline" class="origem-headline">
            {{ dados.referral.headline }}
          </p>
          <p v-if="dados.referral.body" class="origem-body">
            {{ dados.referral.body }}
          </p>
        </div>
      </component>
      <div class="text-caption text-disabled mt-1">
        <span v-if="dados.referral.source_id">
          ID: {{ dados.referral.source_id }}
        </span>
        <span v-if="dados.referral.ctwa_clid" class="d-block">
          Click ID: {{ dados.referral.ctwa_clid }}
        </span>
      </div>
    </template>

    <!-- Contato sem cadastro de cliente no sistema -->
    <template v-if="!dados?.cliente?.cli_Id">
      <VDivider class="my-3" />
      <VAlert type="info" variant="tonal" density="compact">
        Este contato ainda não possui cadastro de cliente no sistema.
      </VAlert>
    </template>

    <!-- Cliente cadastrado: dados completos + agendamentos -->
    <template v-else>
    <VDivider class="my-3" />

    <p class="mb-1 d-flex flex-row gap-2 align-center">
      Dados Cliente

      <span
        class="text-caption cursor-pointer text-primary ml-auto"
        @click="viewClienteAvancado = true"
      >
        Ver cadastro
      </span>
    </p>

    <informacoes :clienteData="dados?.cliente" :hideHistorico="true" />

    <VDivider class="my-3" />

    <p class="mb-1">Agendamentos</p>

    <VSelect
      :loading="loadingAgendamentos"
      placeholder="Selecione um agendamento para ver os dados"
      v-model="agendamentoSelected"
      :items="agendamentos"
      item-title="age_id"
      item-value="age_id"
      return-object
    >
      <template #prepend-item>
        <VTextField
          v-model="queryAgendamento"
          label="Pesquisar agendamento"
          class="mb-2 mx-2"
          placeholder="Insira o número do agendamento"
          @update:model-value="filterAgendamentos"
        />

        <VDivider />
      </template>

      <template #selection="{ item }">
        <p class="mb-0">
          #{{ item.raw.age_id }}
          -
          {{
            item.raw?.age_data
              ? moment(item.raw?.age_data).format("DD/MM/YYYY")
              : ""
          }}
        </p>
      </template>

      <template #item="{ props, item }">
        <VListItem
          #title
          v-bind="props"
          style="display: flex; align-items: center; gap: 0"
        >
          <p class="mb-0">
            #{{ item.raw.age_id }}
            -
            {{
              item.raw?.age_data
                ? moment(item.raw?.age_data).format("DD/MM/YYYY")
                : ""
            }}
          </p>

          <span class="text-caption">
            {{ item.raw.status }} - {{ item.raw.servicos?.length }} serviços
          </span>
        </VListItem>
      </template>
    </VSelect>

    <v-fade-transition>
      <div v-if="agendamentoSelected">
        <VDivider class="my-3" />
        <p class="mb-1">
          Dados do Agendamento - #{{ agendamentoSelected.age_id }}
        </p>

        <p class="mb-1">
          <VIcon icon="tabler-list-details" class="mr-2" />
          <VChip label :color="agendamentoSelected?.bkColor" variant="flat">
            {{ agendamentoSelected?.status }}
          </VChip>
        </p>

        <p class="mb-1">
          <VIcon icon="tabler-calendar" class="mr-1" />
          {{
            formatDateAgendamento(
              agendamentoSelected?.age_data,
              agendamentoSelected?.age_horaInicio,
              agendamentoSelected?.age_horaFim
            )
          }}
        </p>

        <p class="mb-1" v-if="agendamentoSelected?.age_dataFim">
          <VIcon icon="tabler-calendar-x" class="mr-1" />
          {{
            formatDateAgendamento(
              agendamentoSelected?.age_dataFim,
              agendamentoSelected?.age_horaInicioFim,
              agendamentoSelected?.age_horaFimFim
            )
          }}
        </p>

        <p class="mb-1" v-if="agendamentoSelected?.funcionario?.[0]">
          <VIcon icon="tabler-user-cog" class="mr-1" />
          {{ agendamentoSelected?.funcionario[0]?.fullName }}
        </p>

        <p class="mb-1" v-if="agendamentoSelected?.endereco?.[0]">
          <VIcon icon="tabler-map-pin" class="mr-1" />
          {{ escreverEndereco(agendamentoSelected?.endereco[0]) }}
        </p>

        <p class="mb-1">
          <VIcon icon="tabler-coin" class="mr-1" />
          {{ formatValue(agendamentoSelected?.age_valor) }}
        </p>

        <div class="mb-1" v-if="agendamentoSelected?.servicos">
          <p class="mb-1">Serviços:</p>
          <ul
            v-if="agendamentoSelected?.servicos?.length > 0"
            style="list-style-type: decimal"
            class="ml-5"
          >
            <li
              v-for="servico in agendamentoSelected?.servicos"
              class="text-sm"
            >
              {{ servico.ser_nome }} - {{ servico.ser_descricao }} -
              {{ formatValue(servico.ser_valor) }} -
              <strong>Qtd:</strong> {{ servico.ser_quantity }}
            </li>
          </ul>
          <span v-else>Nenhum serviço cadastrado</span>
        </div>
      </div>
    </v-fade-transition>
    </template>
  </div>

  <VDialog v-model="viewClienteAvancado">
    <VCard class="pa-3">
      <AppDrawerHeaderSection
        title="Cadastro do Cliente"
        @cancel="viewClienteAvancado = false"
      />
      <clienteAvancado :clienteId="dados?.cliente?.cli_Id" />
    </VCard>
  </VDialog>
</template>

<style scoped>
.origem-card {
  display: flex;
  flex-direction: row;
  gap: 10px;
  align-items: center;
  padding: 8px;
  border-radius: 8px;
  background-color: rgba(var(--v-theme-on-surface), 0.05);
  border-left: solid 3px rgba(var(--v-theme-primary), 0.7);
  text-decoration: none;
  color: inherit;
}

.origem-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  color: rgba(var(--v-theme-primary), 1);
}

.origem-headline {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  line-height: 16px;
}

.origem-body {
  margin: 0;
  font-size: 12px;
  line-height: 15px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
