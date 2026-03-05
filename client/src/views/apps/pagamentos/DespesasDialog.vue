<script setup>
import { useAlert } from "@/composables/useAlert";
import { can } from "@layouts/plugins/casl";
import lembreteTable from "@/views/apps/lembretes/lembreteTable.vue";
import moment from "moment";
import { useConfirm } from "@/utils/confirm.js";

const loading = ref(false);
const isNewDespesa = ref(true);
const lembretes = ref([]);

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  DespesaData: Object,
});

const emit = defineEmits([
  "update:isDrawerOpen",
  "updateDespesas",
  "closeDrawer",
]);

if (!can("view", "financeiro_despesa") && props.isDrawerOpen) {
  console.log("Não tem permissão para acessar essa funcionalidade!");
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  emit("update:isDrawerOpen", false);
}

console.log("DespesaData:", props.DespesaData);

const { setAlert } = useAlert();

const atualUser = useCookie("userData").value;

const despesa = ref({
  des_id: 0,
  des_descricao: "",
  des_valor: 0,
  des_data: null,
  des_tipo: null,
  des_obs: "",
  des_pago: 0,
  des_parent: 0,
  des_paga_data: null,
});

watch(
  () => props.DespesaData,
  (newVal) => {
    if (
      newVal &&
      newVal?.des_id !== null &&
      newVal?.des_id !== undefined &&
      newVal?.des_id !== 0
    ) {
      isNewDespesa.value = false;
      console.log("Não é nova despesa:", newVal);
      despesa.value = newVal;
      despesa.value.des_data = moment(newVal.des_data).format("YYYY-MM-DD");

      if (despesa.value.des_obs == "null") {
        despesa.value.des_obs = "";
      }

      if (despesa.value.des_descricao == "null") {
        despesa.value.des_descricao = "";
      }

      if (despesa.value.des_tipo == "null") {
        despesa.value.des_tipo = null;
      }
    }
  }
);

if (
  props.DespesaData &&
  props.DespesaData?.des_id !== null &&
  props.DespesaData?.des_id !== undefined &&
  props.DespesaData?.des_id !== 0
) {
  isNewDespesa.value = false;
  console.log("Não é novo pagamento:", props.DespesaData);
  despesa.value = props.DespesaData;
  despesa.value.des_data = moment(props.DespesaData.des_data).format(
    "YYYY-MM-DD"
  );

  if (props.DespesaData.des_obs == "null") {
    props.DespesaData.des_obs = "";
  }

  if (props.DespesaData.des_descricao == "null") {
    props.DespesaData.des_descricao = "";
  }

  if (props.DespesaData.des_tipo == "null") {
    props.DespesaData.des_tipo = null;
  }
}

const limparDespesa = () => {
  despesa.value = {
    des_id: 0,
    des_descricao: "",
    des_valor: 0,
    des_data: null,
    des_tipo: null,
    des_obs: "",
    des_pago: 0,
    des_parent: 0,
    des_paga_data: null,
  };

  isNewDespesa.value = true;
  repeatData.value = {
    tipo_repeat: "Mensal",
    quantidade_repeat: 1,
    add_lembretes: 0,
  };

  lembretes.value = [];
  isTableLembreteVisible.value = false;
  repeatDialogView.value = false;
  dialogViewSaida.value = false;
  searchTipoDespesa.value = '';
};

const closeNavigationDrawer = () => {
  emit("update:isDrawerOpen", false);
  limparDespesa();
};

const handleDrawerModelValueUpdate = (val) => {
  emit("update:isDrawerOpen", val);
};

const saveDespesa = async (marcarComoPago) => {
  console.log("Salvando despesa:", despesa.value, marcarComoPago);

  if (!can("edit", "financeiro_despesa") && !isNewDespesa.value) {
    setAlert(
      "Você não tem permissão para editar despesas!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (!can("create", "financeiro_despesa") && isNewDespesa.value) {
    setAlert(
      "Você não tem permissão para criar despesas!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (!can("pagar", "financeiro_despesa") && marcarComoPago) {
    setAlert(
      "Você não tem permissão para marcar despesas como pagas!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (!despesa.value.des_valor || despesa.value.des_valor === "") {
    setAlert(
      "Digite um valor para a despesa!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (!despesa.value.des_data) {
    setAlert(
      "Selecione uma data para a despesa!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  loading.value = true;

  let link = isNewDespesa.value
    ? "/pagamentos/create/despesas/"
    : `/pagamentos/update/despesas/${despesa.value.des_id}`;

  try {
    const res = await $api(link, {
      method: "POST",
      body: {
        despesaData: despesa.value,
        marcarComoPago: marcarComoPago,
      },
    });

    if (!res) return;

    console.log("Despesa cadastrada com sucesso!", res);

    setAlert(res, "success", "tabler-credit-card", 3000);
    closeNavigationDrawer();
    emit("updateDespesas");
  } catch (error) {
    console.error("Erro ao cadastrar despesa:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        "Erro ao salvar despesa! Tente novamente.",
      "error",
      "tabler-alert-triangle",
      7000
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

const isTableLembreteVisible = ref(false);
const viewLembretes = () => {
  if (isNewDespesa.value)
    return setAlert(
      "Salve a despesa primeiro para adicionar lembretes!",
      "error",
      "tabler-alert-triangle",
      3000
    );
  isTableLembreteVisible.value = true;
};

const repeatDialogView = ref(false);

const repeatData = ref({
  tipo_repeat: "Mensal",
  quantidade_repeat: 1,
  add_lembretes: 0,
});

const tiposRepeat = [
  { title: "Todo Mês", value: "Mensal" },
  { title: "Toda Semana", value: "Semanal" },
  { title: "Todos os Dias", value: "Diário" },
];

const quantidadeRepeat = [
  { title: "1 Vez", value: 1 },
  { title: "2 Vezes", value: 2 },
  { title: "3 Vezes", value: 3 },
  { title: "4 Vezes", value: 4 },
  { title: "5 Vezes", value: 5 },
  { title: "6 Vezes", value: 6 },
  { title: "7 Vezes", value: 7 },
  { title: "8 Vezes", value: 8 },
  { title: "9 Vezes", value: 9 },
  { title: "10 Vezes", value: 10 },
  { title: "11 Vezes", value: 11 },
  { title: "12 Vezes", value: 12 },
];

const loadingRepeat = ref(false);
const repeatDespesa = async () => {
  console.log("Repetindo despesa:", repeatData.value);

  if (!repeatData.value.tipo_repeat) {
    setAlert(
      "Selecione um tipo de repetição!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  if (!repeatData.value.quantidade_repeat) {
    setAlert(
      "Selecione uma quantidade de repetições!",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  loadingRepeat.value = true;

  let tipo = isNewDespesa.value ? "create" : "update";

  try {
    const res = await $api("/pagamentos/despesas/repeat", {
      method: "POST",
      body: {
        despesa: despesa.value,
        repeatData: repeatData.value,
        tipo,
      },
    });

    if (!res) return;

    console.log("Despesas repetidas com sucesso!", res);

    setAlert(res, "success", "tabler-repeat", 3000);
    closeNavigationDrawer();
    emit("updateDespesas");
  } catch (error) {
    console.error("Erro ao repetir despesa:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        `Erro ao repetir despesa! Tente novamente.`,
      "error",
      "tabler-alert-triangle",
      7000
    );
  }

  loadingRepeat.value = false;
  repeatDialogView.value = false;
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

getFormasPagamentoSaida();

const tiposDespesa = ref([]);

const getTipoDespesa = async () => {
  const res = await $api("/config/g/tipo_despesa", {
    method: "GET",
  });

  if (!res) return;

  console.log("Tipos de despesa:", res);

  tiposDespesa.value = res.map((r) => {
    return {
      title: r.value,
      value: r.value,
    }
  });
};

getTipoDespesa();

const deleteDespesa = async () => {
  if (!can("delete", "financeiro_despesa")) {
    setAlert(
      "Você não tem permissão para excluir despesas!",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }

  if (
    !(await useConfirm({
      message:
        "Deseja excluir a despesa? Essa ação não pode ser desfeita e os dados serão perdidos permanentemente.",
    }))
  ) {
    return;
  }

  try {
    const res = await $api(`/pagamentos/delete/despesas/${despesa.value.des_id}`, {
      method: "DELETE",
    });

    if (!res) return;

    console.log("Despesa excluída com sucesso!", res);

    setAlert('Despesa excluída com sucesso!', 'success', 'tabler-trash', 3000);
    closeNavigationDrawer();
    emit("updateDespesas");
  } catch (error) {
    console.error("Erro ao excluir despesa:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        "Erro ao excluir despesa! Tente novamente.",
      "error",
      "tabler-alert-triangle",
      7000
    );
  } 
};

const searchTipoDespesa = ref('');
</script>
<template>
  <VDialog
    width="800"
    persistent
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="handleDrawerModelValueUpdate"
  >
    <VCard flat>
      <VCardText class="pt-2">
        <!-- 👉 Title -->
        <AppDrawerHeaderSection @cancel="closeNavigationDrawer">
          <template #title>
            <h5 class="text-h5 mb-0 d-flex flex-row gap-3 align-center">
              {{ isNewDespesa ? "Cadastrar Despesa" : "Editar Despesa" }}
              <VChip
                color="success"
                class="font-weight-bold"
                label
                v-if="despesa.des_pago"
                variant="flat"
              >
                Paga em
                {{ moment(despesa.des_paga_data).format("DD/MM/YYYY") }}

                <VTooltip
                  activator="parent"
                  v-if="despesa.des_forma_pagamento || despesa.des_pagoPor"
                >
                  <p class="mb-0 text-sm" v-if="despesa.des_forma_pagamento">
                    Forma de Pagamento: {{ despesa.des_forma_pagamento }}
                  </p>
                  <p class="mb-0 text-sm" v-if="despesa.des_pagoPor">
                    Pago por: {{ despesa.des_pagoPor }}
                  </p>
                </VTooltip>
              </VChip>
              <IconBtn
                color="warning"
                @click="viewLembretes"
                size="small"
                variant="tonal"
              >
                <VIcon icon="tabler-bell" />
              </IconBtn>
            </h5>
          </template>
        </AppDrawerHeaderSection>
        <VRow>
          <VCol cols="12">
            <VLabel>
              <VIcon icon="tabler-align-left" class="mr-1" />
              Descrição da despesa
            </VLabel>
            <VTextField
              v-model="despesa.des_descricao"
              placeholder="Digite a descrição da despesa"
            />
          </VCol>

          <VCol cols="12" md="4">
            <VLabel>
              <VIcon icon="tabler-coin" class="mr-1" />
              Valor da despesa
            </VLabel>
            <Dinheiro v-model="despesa.des_valor" class="altura-input" />
          </VCol>

          <VCol cols="12" md="4">
            <VLabel>
              <VIcon icon="tabler-calendar" class="mr-1" />
              Data da despesa
            </VLabel>
            <VTextField
              v-model="despesa.des_data"
              type="date"
              placeholder="Selecione a data da despesa"
            />
          </VCol>

          <VCol cols="12" md="4">
            <VLabel>
              <VIcon icon="tabler-tag" class="mr-1" />
              Tipo da despesa
            </VLabel>
            <VSelect
              v-model="despesa.des_tipo"
              :items="tiposDespesa.filter(item => !searchTipoDespesa || 
              item.title?.toLowerCase()?.includes(searchTipoDespesa?.toLowerCase())
              ).sort((a, b) => a.title.localeCompare(b.title))"
              placeholder="Selecione o tipo da despesa"
              clearable
            >
            <template #prepend-item>
              <div class="px-2 mb-2" style="position: sticky; top: 0px; z-index: 2; background: rgb(var(--v-theme-surface));">
                <VTextField
                  v-model="searchTipoDespesa"
                  placeholder="Pesquisar tipo de despesa"
                
                  prepend-inner-icon="tabler-search"
                />
              </div>
            </template>
          </VSelect>
          </VCol>

          <VCol cols="12">
            <VLabel>
              <VIcon icon="tabler-file-text" class="mr-1" />
              Observações
              <span class="text-sm text-disabled ml-1">(opcional)</span>
            </VLabel>
            <VTextarea
              v-model="despesa.des_obs"
              placeholder="Digite observações sobre a despesa"
              rows="2"
              active
              auto-grow
            />
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
            color="primary"
            @click="repeatDialogView = true"
            variant="outlined"
          >
            <VIcon icon="tabler-repeat" class="mr-1" />
            Repetir
          </VBtn>

          <VDialog v-model="repeatDialogView" persistent max-width="500">
            <VCard>
              <VCardText>
                <AppDrawerHeaderSection
                  @cancel="repeatDialogView = false"
                  title="Repetir Despesa"
                  customClass="pt-0"
                />

                <VRow class="mt-2">
                  <VCol cols="12">
                    <VLabel>
                      <VIcon icon="tabler-repeat" class="mr-1" />
                      Frequência de repetição
                    </VLabel>
                    <p class="mb-2 text-caption">
                      As novas despesas serão criadas de acordo com a data da
                      despesa e a frequência escolhida.
                    </p>
                    <VSelect
                      v-model="repeatData.tipo_repeat"
                      :items="tiposRepeat"
                    />
                  </VCol>

                  <VCol cols="12">
                    <VLabel>
                      <VIcon icon="tabler-numbers" class="mr-1" />
                      Quantidade de repetições
                    </VLabel>
                    <p class="mb-2 text-caption">
                      A Despesa atual será a primeira, a quantidade de
                      repetições deve ser a mais. Por exemplo: Se for em 6
                      vezes, a quantidade de repetições deve ser 5, pois a
                      primeira já é a despesa atual.
                    </p>
                    <VSelect
                      v-model="repeatData.quantidade_repeat"
                      :items="quantidadeRepeat"
                    />
                  </VCol>

                  <VCol cols="12" class="d-flex flex-row gap-3">
                    <div>
                      <VLabel>
                        <VIcon icon="tabler-bell" class="mr-1" />
                        Adicionar Lembretes
                      </VLabel>
                      <p class="mb-2 text-caption">
                        Adiciona lembretes para cada repetição da despesa com
                        base na data da despesa.
                      </p>
                    </div>
                    <VSwitch v-model="repeatData.add_lembretes" />
                  </VCol>
                </VRow>
              </VCardText>
              <div class="d-flex flex-row justify-center mb-5 gap-3">
                <VBtn
                  color="primary"
                  variant="outlined"
                  @click="repeatDialogView = false"
                >
                  Cancelar
                </VBtn>

                <VBtn
                  color="success"
                  @click="repeatDespesa()"
                  :loading="loadingRepeat"
                >
                  <span style="text-transform: none !important">
                    Gerar Repetições
                  </span>
                </VBtn>
              </div>
            </VCard>
          </VDialog>

          <VBtn
            color="error"
            @click="deleteDespesa"
            :loading="loading"
            :disabled="loading"
            variant="outlined"
          >
            Excluir
          </VBtn>

          <VBtn
            @click="saveDespesa(false)"
            color="primary"
            :loading="loading"
            :disabled="loading"
          >
            Salvar
          </VBtn>
          <VBtn
            color="success"
            @click="dialogViewSaida = true"
            :loading="loading"
            :disabled="loading"
            v-if="!despesa.des_pago"
          >
            Marcar Pago
          </VBtn>

          <VDialog v-model="dialogViewSaida" max-width="500">
            <VCard>
              <VCardText>
                <AppDrawerHeaderSection
                  @cancel="dialogViewSaida = false"
                  title="Marcar Despesa como Paga"
                  customClass="pt-0"
                />

                <VLabel class="mt-4">
                  <VIcon icon="tabler-credit-card" class="mr-1" />
                  Forma de Pagamento
                </VLabel>
                <VSelect
                  v-model="despesa.sai_fpt"
                  :items="formasPagamentoSaida"
                  placeholder="Selecione a forma de pagamento da despesa"
                />

                <VLabel class="mt-4">
                  <VIcon icon="tabler-calendar" class="mr-1" />
                  Data de Pagamento
                </VLabel>
                <VTextField
                  v-model="despesa.sai_data"
                  placeholder="Selecione a data de pagamento"
                  type="date"
                />

                <VBtn
                  color="success"
                  class="w-100 mt-5"
                  @click="saveDespesa(true)"
                  :loading="loading"
                  :disabled="loading"
                  v-if="!despesa.des_pago"
                >
                  Pagar
                </VBtn>
              </VCardText>
            </VCard>
          </VDialog>
        </div>
      </VCardText>
    </VCard>

    <lembreteTable
      :isDrawerOpen="isTableLembreteVisible"
      @update:isDrawerOpen="isTableLembreteVisible = $event"
      type="Despesa"
      :params="`https://app.oregonhigienizacao.com.br/pagamentos?tab=despesas&viewDespesa=${despesa.des_id}`"
    />
  </VDialog>
</template>
