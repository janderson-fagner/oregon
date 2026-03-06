<script setup>
import { temaAtual } from "@core/stores/config";
import { useConfirm } from "@/utils/confirm.js";
import moment from "moment";
const isMobile = window.innerWidth < 768;
import { useFunctions } from "@/composables/useFunctions";
import { can } from "@layouts/plugins/casl";

const {
  escreverEndereco,
  formatDateAgendamento,
  copyEndereco,
  enderecoWaze,
  enderecoMaps,
} = useFunctions();

const loading = ref(false);
const isNewComissao = ref(true);

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  comissaoData: Object,
  agendamento: Object,
});

const emit = defineEmits([
  "update:isDrawerOpen",
  "updateComissoes",
  "closeDrawer",
]);

console.log("comissaoData:", props.comissaoData);

const { setAlert } = useAlert();
const disabled = ref(false);
const atualUser = useCookie("userData").value;

if (!can("view", "financeiro_comissao")) {
  setAlert(
    "Você não tem permissão para acessar essa funcionalidade!",
    "error",
    "tabler-alert-triangle",
    3000
  );
  emit("update:isDrawerOpen", false);
}

const comissao = ref({
  com_id: 0,
  com_valor: 0,
  com_valor_bk: 0,
  fun_id: null,
  fun_id_bk: 0,
  age_id: 0,
  com_paga: 0,
  com_paga_data: null,
  com_descricao: null,
  ser_id: null,
  created_at: null,
  agendamento: [],
  cliente: [],
  funcionario: [],
  servicos: [],
});

const handleProps = () => {
  if (props.agendamento) {
    console.log("Agendamento:", props.agendamento);
    comissao.value.agendamento = props.agendamento;
    comissao.value.servicos = (props.agendamento?.servicos || []).map((servico) => ({
      ...servico,
      ser_id: servico.ser_sub_id ? servico.ser_sub_id : servico.ser_id,
    }));

    if (props.agendamento?.cliente)
      comissao.value.cliente = props.agendamento?.cliente[0];

    comissao.value.funcionario = props.agendamento?.funcionario;
    comissao.value.fun_id = props.agendamento?.fun_id;
    comissao.value.age_id = props.agendamento?.age_id;

    disabled.value =
      comissao.value.com_paga || !can("edit", "financeiro_comissao");
  }
};

watch(
  () => props.isDrawerOpen,
  (newVal) => {
    if (!newVal) {
      limparComissao();
    } else {
      handleProps();
    }
  }
);

watch(
  () => props.comissaoData,
  (newVal) => {
    if (
      newVal &&
      newVal?.com_id !== null &&
      newVal?.com_id !== undefined &&
      newVal?.com_id !== 0
    ) {
      isNewComissao.value = false;
      console.log("Não é nova comissao:", newVal);
      comissao.value = newVal;
      disabled.value = newVal.com_paga || !can("edit", "financeiro_comissao");
    }
  }
);

if (
  props.comissaoData &&
  props.comissaoData?.com_id !== null &&
  props.comissaoData?.com_id !== undefined &&
  props.comissaoData?.com_id !== 0
) {
  isNewComissao.value = false;
  console.log("Não é nova comissao:", props.comissaoData);
  comissao.value = props.comissaoData;
}

watch(
  () => props.agendamento,
  (newVal) => {
    console.log("Agendamento:", newVal);

    handleProps();
  }
);

if (props.agendamento) {
  console.log("Agendamento:", props.agendamento);
  handleProps();
}

const limparComissao = () => {
  comissao.value = {
    com_id: 0,
    com_valor: 0,
    com_valor_bk: 0,
    fun_id: null,
    fun_id_bk: 0,
    age_id: 0,
    com_paga: 0,
    com_paga_data: null,
    com_descricao: null,
    ser_id: null,
    created_at: null,
    agendamento: [],
    cliente: [],
    funcionario: [],
    servicos: [],
  };

  editFuncionario.value = false;
  porcentagemCalcView.value = false;
  porcentagemCalc.value = 0;
  searchFuncionario.value = '';
};

const closeNavigationDrawer = () => {
  emit("update:isDrawerOpen", false);
  limparComissao();
};

const handleDrawerModelValueUpdate = (val) => {
  emit("update:isDrawerOpen", val);
};

const editFuncionario = ref(false);
const porcentagemCalcView = ref(false);
const porcentagemCalc = ref(0);

const calcPorcentagem = () => {
  let newVal = parseInt(porcentagemCalc.value);

  //Achar serviço selecionado no agendamento
  let servico = comissao.value.agendamento.servicos.find(
    (servico) => servico.ser_id === comissao.value.ser_id
  );

  console.log("Calculando porcentagem:", newVal, servico);
  if (newVal > 0) {
    //comissao.value.com_valor = (comissao.value.agendamento.age_valor * newVal) / 100
    comissao.value.com_valor = servico
      ? (parseFloat(servico.ser_valor) * newVal * servico.ser_quantity) / 100
      : (comissao.value.agendamento.age_valor * newVal) / 100;
  } else if (
    newVal === 0 ||
    newVal === null ||
    newVal === undefined ||
    newVal === "" ||
    isNaN(newVal)
  ) {
    comissao.value.com_valor = comissao.value.com_valor_bk;
  }
};

const saveServico = async () => {
  console.log("Comissao:", comissao.value);

  if (!comissao.value.fun_id) {
    setAlert(
      "Selecione um funcionário para a comissão!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (!comissao.value.com_valor || comissao.value.com_valor === 0) {
    setAlert(
      "Digite um valor para a comissão!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  loading.value = true;

  let link = isNewComissao.value
    ? "/comissoes/create"
    : `/comissoes/update/${comissao.value.com_id}`;

  try {
    const res = await $api(link, {
      method: "POST",
      body: {
        fun_id: comissao.value.fun_id,
        age_id: comissao.value.age_id,
        com_valor: comissao.value.com_valor,
        ser_id: comissao.value.ser_id,
        com_descricao: comissao.value.com_descricao,
      },
    });

    if (!res) return;

    console.log("Comissão cadastrada com sucesso!", res);

    setAlert(
      `Comissão ${
        isNewComissao.value ? "cadastrada" : "atualizada"
      } com sucesso!`,
      "success",
      "tabler-user-check",
      3000
    );

    closeNavigationDrawer();
    emit("updateComissoes");
  } catch (error) {
    console.error("Erro ao cadastrar serviço:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        `Erro ao ${
          isNewComissao.value ? "cadastrar" : "atualizar"
        } comissão! Tente novamente.`,
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  loading.value = false;
};

const formatValor = (valor) => {
  if (!valor) return "R$ 0,00";
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const formasPagamentoSaida = ref([]);
const dialogViewSaida = ref(false);

const getFormasPagamentoSaida = async () => {
  const res = await $api("/config/g/fpt_saida", {
    method: "GET",
  });

  if (!res) return;

  console.log("Formas de pagamento:", res);

  formasPagamentoSaida.value = res.map((r) => r.value);
};

await getFormasPagamentoSaida();

const pagarComissao = async () => {
  //Confirmação de exclusão
  if (
    !(await useConfirm({
      message: `Tem certeza que deseja marcar esta comissão como paga? Não será possível editá-la depois.`,
    }))
  )
    return;

  try {
    const res = await $api(`/comissoes/paga/${comissao.value.com_id}`, {
      method: "PUT",
    });

    if (!res) return;

    setAlert("Comissão paga com sucesso!", "success", "tabler-coin", 3000);
    emit("updateComissoes");
    comissao.value.com_paga = 1;
    comissao.value.com_paga_data = new Date();
    comissao.value.com_pagoPor = atualUser.fullName;
    comissao.value.com_forma_pagamento = comissao.value.sai_fpt;
    disabled.value = true;
    dialogViewSaida.value = false;
  } catch (err) {
    console.error("Error fetching user data", err, err.response);
    setAlert(
      err?.response?._data?.message ||
        "Ocorreu um erro ao pagar a comissão, tente novamente!",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const funcionarios = ref([]);
const searchFuncionario = ref("");

const fetchResources = async () => {
  try {
    const res = await $api("/agenda/funcionarios", {
      method: "GET",
      query: {
        all: can("view-all", "agendamento"),
      },
    });

    if (!res) return;

    console.log("Funcionários:", res);

    funcionarios.value = res;
  } catch (error) {
    console.error("Error fetching resources", error);
  }
};

fetchResources();

const handleServico = () => {
  if (!comissao.value.ser_id) return;

  let servico = comissao.value.agendamento?.servicos?.find(
    (servico) => servico.ser_id === comissao.value.ser_id
  );

  if (
    servico &&
    servico.servico_raw &&
    servico.servico_raw?.ser_comissao &&
    servico.servico_raw?.ser_comissao_type
  ) {
    if (servico.servico_raw?.ser_comissao_type === "Porcentagem") {
      comissao.value.com_valor =
        (parseFloat(servico.ser_valor) *
          parseInt(servico.servico_raw?.ser_comissao) *
          servico.ser_quantity) /
        100;
      porcentagemCalc.value = parseInt(servico.servico_raw?.ser_comissao);
    } else {
      comissao.value.com_valor =
        parseFloat(servico.servico_raw?.ser_comissao) * servico.ser_quantity;
    }
    comissao.value.com_valor_bk = comissao.value.com_valor;
  }
};

const expansionModel = ref(!isMobile ? [0] : []);

const loadingDelete = ref(false);

const deleteComissao = async () => {
  if (!can("delete", "financeiro_comissao")) {
    setAlert(
      "Você não tem permissão para realizar essa ação!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (
    !(await useConfirm({
      message: `Tem certeza que deseja excluir esta comissão? Esta ação não poderá ser desfeita.`,
    }))
  )
    return;

  loadingDelete.value = true;

  try {
    await $api(`/comissoes/delete/${comissao.value.com_id}`, {
      method: "DELETE",
    });

    setAlert("Comissão excluída com sucesso!", "success", "tabler-trash", 3000);
    emit("updateComissoes");
    closeNavigationDrawer();
  } catch (error) {
    console.error("Erro ao excluir comissão:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao excluir a comissão, tente novamente!",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  loadingDelete.value = false;
};
</script>
<template>
  <VDialog
    persistent
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    width="900"
    @update:model-value="handleDrawerModelValueUpdate"
  >
    <VCard flat v-if="comissao">
      <VCardText class="pt-2">
        <!-- 👉 Title -->
        <AppDrawerHeaderSection @cancel="closeNavigationDrawer">
          <template #title>
            <h5 class="text-h5 mb-0 d-flex flex-row gap-3 align-center">
              {{ isNewComissao ? "Cadastrar" : "Editar" }} Comissão

              <VChip
                color="success"
                class="font-weight-bold"
                label
                variant="flat"
                v-if="comissao.com_paga && !isNewComissao"
              >
                Pago em
                {{ moment(comissao.com_paga_data).format("DD/MM/YYYY") }}
              </VChip>
              <VChip
                color="warning"
                class="font-weight-bold"
                label
                variant="flat"
                v-else-if="!isNewComissao"
              >
                Pendente
              </VChip>
            </h5>
          </template>
        </AppDrawerHeaderSection>

        <VRow>
          <VCol cols="6">
            <VExpansionPanels multiple class="mb-3" v-model="expansionModel">
              <VExpansionPanel
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                rounded="md"
              >
                <VExpansionPanelTitle>
                  <p class="mb-0 font-weight-bold">
                    <VIcon icon="tabler-calendar" class="mr-1" />
                    Detalhes do agendamento
                  </p>
                </VExpansionPanelTitle>

                <VExpansionPanelText class="pt-4">
                  <p class="mb-1">
                    <VIcon icon="tabler-list-details" class="mr-1" />
                    <VChip
                      label
                      :color="comissao.agendamento?.bkColor"
                      class="ml-2"
                    >
                      {{ comissao.agendamento?.status }}
                    </VChip>
                  </p>
                  <p class="mb-1">
                    <VIcon icon="tabler-calendar" class="mr-1" />
                    {{
                      formatDateAgendamento(
                        comissao.agendamento?.age_data,
                        comissao.agendamento?.age_horaInicio,
                        comissao.agendamento?.age_horaFim
                      )
                    }}
                  </p>
                  <p class="mb-1" v-if="comissao.agendamento?.age_dataFim">
                    <VIcon icon="tabler-calendar-x" class="mr-1" />
                    {{
                      formatDateAgendamento(
                        comissao.agendamento?.age_dataFim,
                        comissao.agendamento?.age_horaInicioFim,
                        comissao.agendamento?.age_horaFimFim
                      )
                    }}
                  </p>
                  <p class="mb-1">
                    <VIcon icon="tabler-user-cog" class="mr-1" />
                    {{ comissao.agendamento?.funcionario?.[0]?.fullName }}
                  </p>
                  <p class="mb-1">
                    <VIcon icon="tabler-coin" class="mr-1" />
                    {{ formatValor(comissao.agendamento?.age_valor) }}
                  </p>
                  <div class="mb-1">
                    <p class="mb-1">Serviços:</p>
                    <ul
                      v-if="comissao.agendamento?.servicos?.length > 0"
                      style="list-style-type: decimal"
                      class="ml-5"
                    >
                      <li
                        v-for="servico in comissao.agendamento?.servicos"
                        class="text-sm"
                      >
                        {{ servico.ser_nome }} - {{ servico.ser_descricao }} -
                        {{ formatValor(servico.ser_valor) }} -
                        <strong>Qtd:</strong> {{ servico.ser_quantity }}
                      </li>
                    </ul>
                    <span v-else>Nenhum serviço cadastrado</span>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>

              <VExpansionPanel
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                rounded="md"
              >
                <VExpansionPanelTitle>
                  <p class="mb-0 font-weight-bold">
                    <VIcon icon="tabler-user" class="mr-1" />
                    Detalhes do cliente
                  </p>
                </VExpansionPanelTitle>

                <VExpansionPanelText class="pt-4">
                  <p class="mb-1">
                    <VIcon icon="tabler-user" class="mr-1" />
                    {{ comissao.agendamento?.cliente?.[0]?.cli_nome }}
                  </p>
                  <p
                    class="mb-1"
                    v-if="comissao.agendamento?.cliente?.[0]?.cli_celular"
                  >
                    <VIcon icon="tabler-phone" class="mr-1" />
                    {{ comissao.agendamento?.cliente?.[0]?.cli_celular }}
                  </p>
                  <p
                    class="mb-1"
                    v-if="comissao.agendamento?.cliente?.[0]?.cli_email"
                  >
                    <VIcon icon="tabler-mail" class="mr-1" />
                    {{ comissao.agendamento?.cliente?.[0]?.cli_email }}
                  </p>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </VCol>
          <VCol cols="6">
            <VRow>
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-user-cog" class="mr-2" /> Funcionário
                </VLabel>
                <VSelect
                  v-model="comissao.fun_id"
                  :items="
                    funcionarios.filter(
                      (funcionario) =>
                        !searchFuncionario ||
                        !searchFuncionario.trim() === '' ||
                        funcionario.fullName
                          ?.toLowerCase()
                          ?.includes(
                            searchFuncionario?.toLowerCase()?.trim() || ''
                          )
                    )
                  "
                  item-title="fullName"
                  item-value="id"
                  outlined
                  dense
                  :readonly="!isNewComissao ? true : disabled"
                  placeholder="Selecione um funcionário..."
                >
                  <template #prepend-item>
                    <VTextField
                      v-model="searchFuncionario"
                      placeholder="Pesquisar funcionário..."
                      dense
                      outlined
                      hide-details
                      class="mx-2"
                      clearable
                      prepend-inner-icon="tabler-search"
                    />
                  </template>
                </VSelect>
              </VCol>

              <VCol cols="12" :md="!porcentagemCalcView ? 6 : 4">
                <VLabel class="mt-1">
                  <VIcon icon="tabler-tools" class="mr-2" /> Serviço
                </VLabel>

                <VSelect
                  v-model="comissao.ser_id"
                  :items="comissao.servicos"
                  item-title="ser_nome"
                  item-value="ser_id"
                  outlined
                  dense
                  :readonly="disabled"
                  placeholder="Selecione um serviço"
                  @update:model-value="handleServico"
                />
              </VCol>

              <VCol cols="12" :md="!porcentagemCalcView ? 6 : 8">
                <VLabel class="mb-2">
                  <VIcon icon="tabler-cash" class="mr-2" /> Valor
                  <IconBtn
                    @click="porcentagemCalcView = true"
                    color="primary"
                    size="25"
                    variant="tonal"
                    class="ml-3"
                    v-if="!porcentagemCalcView && !disabled"
                  >
                    <VIcon icon="tabler-percentage" size="20" />
                  </IconBtn>
                </VLabel>

                <v-fade-transition>
                  <div
                    v-if="porcentagemCalcView && !disabled"
                    class="d-flex flex-row gap-2 mb-2 align-center"
                  >
                    <VTextField
                      label="Calcular porcentagem"
                      v-model="porcentagemCalc"
                      placeholder="Digite a porcentagem..."
                      dense
                      outlined
                      type="number"
                      @update:model-value="calcPorcentagem"
                    />
                    <IconBtn
                      @click="porcentagemCalcView = false"
                      color="success"
                    >
                      <VIcon icon="tabler-check" />
                    </IconBtn>
                  </div>
                </v-fade-transition>

                <Dinheiro
                  v-model="comissao.com_valor"
                  :readonly="disabled"
                  class="altura-input"
                />
              </VCol>

              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-notes" class="mr-2" /> Descrição
                </VLabel>
                <VTextarea
                  rows="2"
                  active
                  auto-grow
                  v-model="comissao.com_descricao"
                  outlined
                  dense
                  placeholder="Digite uma descrição..."
                  :readonly="disabled"
                />
              </VCol>
            </VRow>
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4">
          <VBtn
            variant="outlined"
            color="secondary"
            @click="closeNavigationDrawer"
          >
            Fechar
          </VBtn>
          <VBtn
            variant="outlined"
            color="error"
            @click="deleteComissao"
            :loading="loadingDelete"
            v-if="
              !isNewComissao &&
              !disabled &&
              can('delete', 'financeiro_comissao')
            "
          >
            Excluir
          </VBtn>
          <VBtn
            v-if="!disabled"
            @click="saveServico"
            color="primary"
            :loading="loading"
            :disabled="loading"
          >
            Salvar
          </VBtn>

          <VBtn
            @click="dialogViewSaida = true"
            color="success"
            v-if="!disabled"
          >
            Pagar
          </VBtn>
        </div>
      </VCardText>
    </VCard>

    <VDialog v-model="dialogViewSaida" max-width="500" v-if="!disabled">
      <VCard>
        <VCardText>
          <AppDrawerHeaderSection
            @cancel="dialogViewSaida = false"
            title="Marcar comissão como paga"
            customClass="pt-0"
          />

          <VLabel class="mt-4">
            <VIcon icon="tabler-credit-card" class="mr-1" />
            Forma de Pagamento
          </VLabel>
          <VSelect
            v-model="comissao.sai_fpt"
            :items="formasPagamentoSaida"
            placeholder="Selecione a forma de pagamento da comissão"
          />

          <VLabel class="mt-4">
            <VIcon icon="tabler-calendar" class="mr-1" />
            Data de Pagamento
          </VLabel>
          <VTextField
            v-model="comissao.sai_data"
            placeholder="Selecione a data de pagamento"
            type="date"
          />

          <VBtn
            color="success"
            class="w-100 mt-5"
            @click="pagarComissao(comissao.com_id)"
            :loading="loadingPagar"
            v-if="!disabled"
          >
            Pagar
          </VBtn>
        </VCardText>
      </VCard>
    </VDialog>
  </VDialog>
</template>
