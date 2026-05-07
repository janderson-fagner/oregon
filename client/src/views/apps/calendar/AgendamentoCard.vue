<script setup>
import { temaAtual } from "@core/stores/config";
import moment from "moment";
import { useConfirm } from "@/utils/confirm.js";
import { useFunctions } from "@/composables/useFunctions";
const {
  escreverEndereco,
  formatDateAgendamento,
  copyEndereco,
  enderecoWaze,
  enderecoMaps,
  typesAgendamento,
} = useFunctions();

import ReceberDialog from "@/views/apps/pagamentos/ReceberDialog.vue";
import lembreteTable from "@/views/apps/lembretes/lembreteTable.vue";
import ComissaoDialog from "@/views/apps/comissao/comissaoDialog.vue";
import OrdemServico from "@/views/apps/calendar/OrdemServico.vue";
import AgendamentoHistorico from "@/views/apps/calendar/agendamentoHistorico.vue";
import NewCliente from "@/views/apps/clientes/newCliente.vue";

import { can } from "@layouts/plugins/casl";
const { setAlert } = useAlert();

const userData = useCookie("userData").value;

const isMobile = window.innerWidth < 768;
const loading = ref(false);
const loadingUploads = ref(false);

const sizeIconBtn = ref(isMobile ? 35 : 30);
const sizeIcon = ref(isMobile ? 25 : 20);

let refAge = {
  cliente: [],
  endereco: [],
  servicos: [],
  imagens: [],
  funcionarios: [],
  statusColors: [],
  age_metragem: {
    interno: null,
    externo: null,
    total: null,
  },
  outrosAgendamentos: [],
};

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  agendamentoData: {
    type: Object,
    required: false,
    default: {
      cliente: [],
      endereco: [],
      servicos: [],
      imagens: [],
      funcionarios: [],
      statusColors: [],
      age_metragem: {
        interno: null,
        externo: null,
        total: null,
      },
      outrosAgendamentos: [],
    },
  },
});

const emit = defineEmits([
  "update:isDrawerOpen",
  "closeDrawer",
  "updateEvents",
  "addEvents",
  "removeEvents",
]);

console.log("agendamentoData:", props.agendamentoData);

const lembretes = ref([]);
const viewHistoricoAgendamento = ref(false);
const agendamento = ref({ ...refAge });

const descontoInputView = ref(false);
const comissaoInputView = ref(false);

const dataDup = ref({
  novaDataDup: agendamento.value?.age_data
    ? moment(agendamento.value?.age_data).format("YYYY-MM-DD")
    : "",
  novaHoraInicioDup: agendamento.value?.age_horaInicio
    ? agendamento.value?.age_horaInicio
    : "",
  novaHoraFimDup: agendamento.value?.age_horaFim
    ? agendamento.value?.age_horaFim
    : "",
  novoStatusDup: agendamento.value?.ast_id ? agendamento.value?.ast_id : 1,
  novoFuncionarioDup:
    agendamento.value?.funcionario?.length > 0
      ? agendamento.value?.funcionario[0]?.id
      : null,
  novaDataFimDup: agendamento.value?.age_dataFim
    ? moment(agendamento.value?.age_dataFim).format("YYYY-MM-DD")
    : "",
  novaHoraInicioFimDup: agendamento.value?.age_horaInicioFim
    ? agendamento.value?.age_horaInicioFim
    : "",
  novaHoraFimFimDup: agendamento.value?.age_horaFimFim
    ? agendamento.value?.age_horaFimFim
    : "",
});

const optionsDup = ref({
  pagamentos: true,
  comissao: true,
  servicos: true,
  imagens: true,
  infosAdicionais: true,
});

const keyLabel = (key) => {
  if (!key) return;
  const labels = {
    pagamentos: "Pagamentos",
    comissao: "Comissão",
    servicos: "Serviços",
    imagens: "Imagens",
    infosAdicionais: "Info Adicionais",
  };
  return labels[key] || key;
};

const canEditAge = ref(false);

const dataRemarcar = ref({
  novaData: agendamento.value?.age_data
    ? moment(agendamento.value?.age_data).format("YYYY-MM-DD")
    : "",
  novaHoraInicio: agendamento.value?.age_horaInicio
    ? agendamento.value?.age_horaInicio
    : "",
  novaHoraFim: agendamento.value?.age_horaFim
    ? agendamento.value?.age_horaFim
    : "",
  novaDataFim: agendamento.value?.age_dataFim
    ? moment(agendamento.value?.age_dataFim).format("YYYY-MM-DD")
    : "",
  novaHoraInicioFim: agendamento.value?.age_horaInicioFim
    ? agendamento.value?.age_horaInicioFim
    : "",
  novaHoraFimFim: agendamento.value?.age_horaFimFim
    ? agendamento.value?.age_horaFimFim
    : "",
  novoFuncionario:
    agendamento.value?.funcionario?.length > 0
      ? agendamento.value?.funcionario[0]
      : {},
  novoStatus: agendamento.value?.ast_id ? agendamento.value?.ast_id : 1,
});

const handleAgendamentoProps = (newVal) => {
  if (!newVal) return;

  console.log("Agendamento:", newVal);
  agendamento.value = {
    ...refAge,
    ...newVal,
  };

  if (
    agendamento.value.funcionario?.[0]?.id &&
    !can("view-all", "agendamento") &&
    useCookie("userData")?.value?.id !== agendamento.value.funcionario[0]?.id
  ) {
    setAlert(
      "Você não tem permissão para ver este agendamento!",
      "error",
      "tabler-alert-circle",
      5000
    );
    emit("update:isDrawerOpen", false);
    return;
  }

  const totalServicos = agendamento.value.servicos.reduce((acc, servico) => {
    const valor = parseFloat(servico.ser_valor) || 0;
    const quantidade = parseFloat(servico.ser_quantity) || 0;
    return acc + valor * quantidade;
  }, 0);

  const desconto = parseFloat(agendamento.value.age_desconto) || 0;

  dataDup.value = {
    novaDataDup: newVal?.age_data
      ? moment(newVal?.age_data).format("YYYY-MM-DD")
      : "",
    novaHoraInicioDup: newVal?.age_horaInicio ? newVal?.age_horaInicio : "",
    novaHoraFimDup: newVal?.age_horaFim ? newVal?.age_horaFim : "",
    novoStatusDup: newVal?.ast_id ? newVal?.ast_id : 1,
    novoFuncionarioDup:
      newVal?.funcionario?.length > 0 ? newVal?.funcionario[0].id : null,
    novaDataFimDup: newVal?.age_dataFim
      ? moment(newVal?.age_dataFim).format("YYYY-MM-DD")
      : "",
    novaHoraInicioFimDup: newVal?.age_horaInicioFim
      ? newVal?.age_horaInicioFim
      : "",
    novaHoraFimFimDup: newVal?.age_horaFimFim ? newVal?.age_horaFimFim : "",
  };

  dataRemarcar.value = {
    novaData: newVal?.age_data
      ? moment(newVal?.age_data).format("YYYY-MM-DD")
      : "",
    novaHoraInicio: newVal?.age_horaInicio ? newVal?.age_horaInicio : "",
    novaHoraFim: newVal?.age_horaFim ? newVal?.age_horaFim : "",
    novaDataFim: newVal?.age_dataFim
      ? moment(newVal?.age_dataFim).format("YYYY-MM-DD")
      : "",
    novaHoraInicioFim: newVal?.age_horaInicioFim
      ? newVal?.age_horaInicioFim
      : "",
    novaHoraFimFim: newVal?.age_horaFimFim ? newVal?.age_horaFimFim : "",
    novoFuncionario:
      newVal?.funcionario?.length > 0 ? newVal?.funcionario[0] : {},
    novoStatus: newVal?.ast_id ? newVal?.ast_id : 1,
  };

  canEditAge.value =
    agendamento.value.ast_id == 3 || agendamento.value.ast_id == 6
      ? false
      : can("edit", "agendamento");
};

if (props.agendamentoData) {
  handleAgendamentoProps(props.agendamentoData);
}

watch(
  () => props.agendamentoData,
  (newVal) => {
    handleAgendamentoProps(newVal);
  }
);

const checkStatus = () => {
  if (agendamento.value.ast_id == 3) {
    setAlert(
      "Agendamento já foi atendido, não é possível altera-lo!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return false;
  } else if (agendamento.value.ast_id == 6) {
    setAlert(
      "Agendamento foi cancelado, não é possível altera-lo!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return false;
  }

  return true;
};

const limparAgendamento = async () => {
  // Reinicie os watchers
  await iniciarWatchers();

  agendamento.value = null;

  const resetLoadingStates = () => {
    loading.value = false;
    loadingUploads.value = false;
    loadingSetDiscount.value = false;
    loadingSetComissao.value = false;
    loadingRemoveImage.value = false;
    loadingDuplicar.value = false;
    loadingSave.value = false;
    loadingSetAtendido.value = false;
    loadingGerarCertificado.value = false;
    loadingGerarRecibo.value = false;
    loadingViewPagamento.value = false;
    servicoSelected.value = null;
    imagesUploads.value = [];
  };

  const resetRemarcarStates = () => {
    remarcarLoading.value = false;

    dataDup.value = {
      novaDataDup: "",
      novaHoraInicioDup: "",
      novaHoraFimDup: "",
      novoStatusDup: 1,
      novoFuncionarioDup: null,
      novaDataFimDup: "",
      novaHoraInicioFimDup: "",
      novaHoraFimFimDup: "",
    };

    dataRemarcar.value = {
      novaData: "",
      novaHoraInicio: "",
      novaHoraFim: "",
      novaDataFim: "",
      novaHoraInicioFim: "",
      novaHoraFimFim: "",
      novoFuncionario: {},
      novoStatus: 1,
    };
  };

  const resetViewStates = () => {
    descontoInputView.value = false;
    comissaoInputView.value = false;
    remarcarView.value = false;
    remarcarLoading.value = false;
    changeFuncionarioView.value = false;
    editEndereco.value = false;
    confirmAtendidoVisible.value = false;
    isRecebimentoDrawerVisible.value = false;
    ReceberData.value = {};
    viewDuplicarDialog.value = false;
    viewHistoricoAgendamento.value = false;
  };

  const resetPermissionsAndLembretes = () => {
    canEditAge.value = true;
    lembretes.value = [];
    isTableLembreteVisible.value = false;
  };

  // Executar todas as funções de reset
  resetLoadingStates();
  resetRemarcarStates();
  resetViewStates();
  resetPermissionsAndLembretes();
};

const formatValue = (value) => {
  if (!value) return "R$ 0,00";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
};

const typeDesconto = ref("Valor");
const percentValue = ref(0);
const descontoBk = ref(0);

const calcDesconto = () => {
  if (typeDesconto.value == "Porcentagem") {
    //agendamento.value.age_desconto = agendamento.value.age_valor * (percentValue.value / 100)
    descontoBk.value = agendamento.value.age_valor * (percentValue.value / 100);
  }
};

// Armazene as funções de parada dos watch em variáveis
let stopWatchServicos;
let stopWatchDesconto;

const iniciarWatchers = async () => {
  stopWatchServicos = watch(
    () => agendamento?.value?.servicos,
    (newVal) => {
      console.log("Servicos:", newVal);
      if (agendamento.value) {
        // Converta os valores para números
        const totalServicos = agendamento?.value?.servicos.reduce(
          (acc, servico) => {
            const valor = parseFloat(servico.ser_valor) || 0;
            const quantidade = parseFloat(servico.ser_quantity) || 0;
            return acc + valor * quantidade;
          },
          0
        );

        const desconto = parseFloat(agendamento.value.age_desconto) || 0;

        agendamento.value.age_valor = totalServicos - desconto;

        console.log("Total Serviços:", totalServicos);
        console.log("Desconto:", desconto);
        console.log("Valor Final:", agendamento.value.age_valor);
      }
    },
    { deep: true }
  );

  stopWatchDesconto = watch(
    () => agendamento?.value?.age_desconto,
    (newVal) => {
      if (agendamento.value) {
        const totalServicos = agendamento?.value?.servicos.reduce(
          (acc, servico) => {
            const valor = parseFloat(servico.ser_valor) || 0;
            const quantidade = parseFloat(servico.ser_quantity) || 0;
            return acc + valor * quantidade;
          },
          0
        );

        const desconto = parseFloat(agendamento.value.age_desconto) || 0;

        agendamento.value.age_valor = totalServicos - desconto;

        if (agendamento.value.age_valor < 0) {
          agendamento.value.age_desconto = 0;
        }
      }
    }
  );
};

// Inicialize os watchers
iniciarWatchers();

const loadingSetDiscount = ref(false);

const setDiscount = async () => {
  loadingSetDiscount.value = true;

  try {
    let discount = descontoBk.value;

    const res = await $api(`/agenda/setDiscount`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
        discount: discount,
      },
    });

    agendamento.value.updated_by = userData.fullName;
    agendamento.value.updated_at = new Date();
    descontoInputView.value = false;
    agendamento.value.age_desconto = discount;
  } catch (error) {
    console.error("Erro ao definir desconto:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao definir o desconto, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }
  loadingSetDiscount.value = false;
};

const comissoesVisible = ref(false);
const comissoes = ref([]);
const loadingSetComissao = ref(false);
const selectedComissaoData = ref({});
const isComissaoDrawerVisible = ref(false);

const viewComissoes = async () => {
  loadingSetComissao.value = true;

  try {
    const res = await $api(`/comissoes/list-agenda`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
      },
    });

    if (!res) return;

    console.log("Comissões:", res);

    comissoes.value = res;
  } catch (error) {
    console.error("Erro ao buscar comissões:", error, error.response);
  }

  loadingSetComissao.value = false;
  comissoesVisible.value = true;
};

const agendamentoDataD = ref({});

const addComissao = () => {
  selectedComissaoData.value = {};
  agendamentoDataD.value = agendamento.value;

  if (!agendamentoDataD.value.age_id || !agendamentoDataD.value) {
    agendamentoDataD.value = agendamento.value;
  }

  isComissaoDrawerVisible.value = true;
};

const viewComissao = async (item) => {
  try {
    const res = await $api(`/comissoes/get/${item.com_id}`, {
      method: "GET",
    });

    if (!res) return;

    console.log("res edit", res);

    selectedComissaoData.value = res;

    agendamentoDataD.value = agendamento.value;

    if (!agendamentoDataD.value.age_id || !agendamentoDataD.value) {
      agendamentoDataD.value = agendamento.value;
    }

    isComissaoDrawerVisible.value = true;
  } catch (error) {
    console.error("Error fetching user data", error, error.response);
  }
};

const addPhotos = () => {
  document.getElementById("fileInput").click();
};

const imagesUploads = ref([]);

const enviarFotos = async () => {
  if (imagesUploads.value.length === 0) {
    setAlert(
      "Nenhuma imagem selecionada",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  const formData = new FormData();
  imagesUploads.value.forEach((file) => {
    formData.append("images", file);
  });

  formData.append("age_id", agendamento.value.age_id);

  loadingUploads.value = true;

  try {
    const res = await $api(
      `/agenda/upload-images/${agendamento.value.age_id}`,
      {
        method: "POST",
        body: formData,
      }
    );

    if (!res) return;

    setAlert(
      "Imagens enviadas com sucesso",
      "success",
      "tabler-photo-check",
      3000
    );
    imagesUploads.value = [];
    agendamento.value.updated_by = userData.fullName;
    agendamento.value.updated_at = new Date();
    agendamento.value.imagens.push(...res);
  } catch (error) {
    console.error("Erro ao enviar imagens:", error, error.response);
    imagesUploads.value = [];
    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao enviar imagens, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }

  loadingUploads.value = false;
};

const loadingRemoveImage = ref(false);

const removeImage = async (index) => {
  loadingRemoveImage.value = true;
  const res = await $api(
    `/agenda/remove-image/${agendamento.value.imagens[index].img_id}`,
    {
      method: "DELETE",
    }
  );

  if (!res) return;

  agendamento.value.imagens.splice(index, 1);
  loadingRemoveImage.value = false;
};

const closeNavigationDrawer = async () => {
  await limparAgendamento();
  emit("update:isDrawerOpen", false);
};

const handleDrawerModelValueUpdate = (val) => {
  emit("update:isDrawerOpen", val);
};

const changeStatus = async (status) => {
  let check = checkStatus();
  if (!check) return;

  if (status == "Atendido") {
    let confirm = window.confirm(
      "Deseja realmente marcar este agendamento como atendido? Não será possível editar o agendamento após isso."
    );

    if (!confirm) return;
  } else if (status == "Cancelado") {
    let confirm = window.confirm("Deseja realmente cancelar este agendamento?");

    if (!confirm) return;
  }

  const res = await $api(`/agenda/changeStatus`, {
    method: "POST",
    body: {
      age_id: agendamento.value.age_id,
      status: status,
    },
  });

  if (!res) return;

  agendamento.value.status = status;
  agendamento.value.updated_by = userData.fullName;
  agendamento.value.updated_at = new Date();

  if (status == "Atendido") {
    agendamento.value.bkColor =
      agendamento.value.statusColors &&
      agendamento.value.statusColors?.length > 0
        ? agendamento?.value?.statusColors?.find(
            (cor) => cor.type === "cor_atendido"
          ).value
        : "#A8A8A8";
    agendamento.value.ast_id = 3;
    setAlert(
      "Agendamento marcado como atendido!",
      "success",
      "tabler-check",
      3000
    );
  } else if (status == "Cancelado") {
    agendamento.value.bkColor =
      agendamento.value.statusColors &&
      agendamento.value.statusColors?.length > 0
        ? agendamento?.value?.statusColors?.find(
            (cor) => cor.type === "cor_cancelado"
          ).value
        : "#FF4500";
    agendamento.value.ast_id = 6;
    setAlert("Agendamento cancelado com sucesso!", "success", "tabler-x", 3000);
  }

  emit("updateEvents", agendamento.value?.age_id);
};

const remarcarView = ref(false);

const remarcarOpen = () => {
  remarcarView.value = !remarcarView.value;
};

const remarcarLoading = ref(false);

const remarcarAge = async () => {
  if (!can("remarcar", "agendamento")) {
    setAlert(
      "Você não tem permissão para remarcar agendamentos!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  if (!dataRemarcar.value.novaData) {
    setAlert(
      "Data é obrigatória para remarcar o agendamento!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }

  if (!dataRemarcar.value.novaHoraInicio || !dataRemarcar.value.novaHoraFim) {
    setAlert(
      "Horário de início e fim são obrigatórios para remarcar o agendamento!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  if (
    !dataRemarcar.value.novoFuncionario ||
    !dataRemarcar.value.novoFuncionario?.id
  ) {
    setAlert(
      "Funcionário é obrigatório para remarcar o agendamento!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  if (!dataRemarcar.value.novoStatus) {
    setAlert(
      "Status é obrigatório para remarcar o agendamento!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  let check = checkStatus();
  if (!check) return;

  if (
    agendamento.value.servicos.length > 0 &&
    agendamento.value.servicos.some((servico) => servico.isOld)
  ) {
    if (
      !(await useConfirm({
        message:
          "Este agendamento possui serviços antigos, os serviços antigos não serão duplicados no novo agendamento! Deseja remarcar mesmo assim?",
      }))
    ) {
      return;
    }
  }

  remarcarLoading.value = true;

  try {
    const res = await $api(`/agenda/remarcar`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
        age_data: dataRemarcar.value.novaData,
        age_horaInicio: dataRemarcar.value.novaHoraInicio,
        age_horaFim: dataRemarcar.value.novaHoraFim,
        age_dataFim: dataRemarcar.value.novaDataFim,
        age_horaInicioFim: dataRemarcar.value.novaHoraInicioFim,
        age_horaFimFim: dataRemarcar.value.novaHoraFimFim,
        fun_id: dataRemarcar.value.novoFuncionario.id,
        ast_id: dataRemarcar.value.novoStatus,
      },
    });

    if (!res) return;

    setAlert(
      "Agendamento remarcado com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    const oldAgeId = agendamento.value.age_id;
    agendamento.value = { ...agendamento.value, ...res };
    remarcarView.value = false;
    // Emite addEvents com o novo age_id E updateEvents pro antigo (ficou status 7)
    emit("addEvents", res.age_id);
    emit("updateEvents", oldAgeId);
  } catch (error) {
    console.error("Erro ao remarcar agendamento:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao remarcar o agendamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }
  remarcarLoading.value = false;
};

const changeFuncionarioView = ref(false);

const changeFuncionarioOpen = () => {
  changeFuncionarioView.value = !changeFuncionarioView.value;
};

const changeFuncionario = async (funcionario) => {
  console.log("Funcionario:", funcionario);
  let check = checkStatus();
  if (!check) return;

  const res = await $api(`/agenda/changeFuncionario`, {
    method: "POST",
    body: {
      age_id: agendamento.value.age_id,
      fun_id: funcionario.id,
      userData: userData,
    },
  });

  if (!res) return;

  setAlert(
    "Funcionário alterado com sucesso!",
    "success",
    "tabler-check",
    3000
  );
  agendamento.value.funcionario[0] = funcionario;
  changeFuncionarioView.value = false;
  agendamento.value.updated_by = userData.fullName;
  agendamento.value.updated_at = new Date();
  emit("updateEvents", agendamento.value?.age_id);
};

const editEndereco = ref(false);

const getCep = async (cep) => {
  if (!cep) return;
  if (cep.length < 9) return;

  const res = await $api(`/clientes/clientes-cep`, {
    method: "GET",
    query: { cep: cep.replace("-", "") },
  });

  if (!res) return;

  agendamento.value.endereco[0].end_logradouro = res.logradouro;
  agendamento.value.endereco[0].end_bairro = res.bairro;
  agendamento.value.endereco[0].end_cidade = res.localidade;
  agendamento.value.endereco[0].end_estado = res.uf;
};

const loadingGerarCertificado = ref(false);

const gerarCertificado = async (gerarNovo = false) => {
  if (agendamento.value.age_certificado && !gerarNovo) {
    window.open(agendamento.value.age_certificado, "_blank");
    return;
  }

  if (agendamento.value.ast_id == 6) {
    setAlert(
      "Agendamento cancelado, não é possível gerar certificado!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  loadingGerarCertificado.value = true;

  try {
    const res = await $api(`/agenda/getCertificate`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
      },
    });

    if (!res) return;

    console.log("Certificado:", res);

    agendamento.value.age_certificado = res;
    setAlert(
      "Certificado gerado com sucesso!",
      "success",
      "tabler-check",
      3000
    );

    //Abrir certificado em nova guia
    window.open(res, "_blank");
  } catch (error) {
    console.error("Erro ao gerar certificado:", error, error.response);
  }

  loadingGerarCertificado.value = false;
};

const loadingGerarRecibo = ref(false);
const gerarRecibo = async (gerarNovo = false) => {
  if (agendamento.value.age_recibo && !gerarNovo) {
    window.open(agendamento.value.age_recibo, "_blank");
    return;
  }

  if (agendamento.value.ast_id == 6) {
    setAlert(
      "Agendamento cancelado, não é possível gerar recibo!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return;
  }

  loadingGerarRecibo.value = true;

  try {
    const res = await $api(`/agenda/getRecibo`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
      },
    });

    if (!res) return;

    console.log("Recibo:", res);

    agendamento.value.age_recibo = res;
    setAlert("Recibo gerado com sucesso!", "success", "tabler-check", 3000);

    //Abrir recibo em nova guia
    window.open(res, "_blank");
  } catch (error) {
    console.error("Erro ao gerar recibo:", error, error.response);
  }

  loadingGerarRecibo.value = false;
};

const loadingDuplicar = ref(false);
const viewDuplicarDialog = ref(false);

const openDuplicarDialog = () => {
  viewDuplicarDialog.value = !viewDuplicarDialog.value;
};

const statusAgendamentoItens = [
  { value: 1, text: "Agendado" },
  { value: 2, text: "Confirmado" },
  { value: 3, text: "Atendido" },
  { value: 4, text: "Remarcado" },
  { value: 5, text: "Aguardando" },
  { value: 6, text: "Cancelado" },
  { value: 7, text: "Remarcado" },
];

const duplicarAgendamento = async () => {
  loadingDuplicar.value = true;

  try {
    const res = await $api(`/agenda/duplicar`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
        age_data: dataDup.value.novaDataDup,
        age_horaInicio: dataDup.value.novaHoraInicioDup,
        age_horaFim: dataDup.value.novaHoraFimDup,
        age_dataFim: dataDup.value.novaDataFimDup,
        age_horaInicioFim: dataDup.value.novaHoraInicioFimDup,
        age_horaFimFim: dataDup.value.novaHoraFimFimDup,
        ast_id: dataDup.value.novoStatusDup,
        fun_id: dataDup.value.novoFuncionarioDup,
        options: optionsDup.value,
      },
    });

    if (!res) return;

    setAlert(
      "Agendamento duplicado com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    emit("addEvents", res);
    closeNavigationDrawer();
  } catch (error) {
    console.error("Erro ao duplicar agendamento:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao duplicar agendamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  } finally {
    loadingDuplicar.value = false;
  }
};

const loadingSave = ref(false);

const saveAgendamento = async () => {
  let check = checkStatus();
  if (!check) return false;

  if (!can("edit", "agendamento")) {
    setAlert(
      "Você não tem permissão para editar este agendamento!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return false;
  }

  if (!canEditAge.value) {
    setAlert(
      "Este agendamento não pode ser editado!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return false;
  }

  //Fazer foreach nos servicos para verificar se há algum campo em branco ou null
  let servicos = agendamento.value.servicos;

  if (servicos.length > 0) {
    for (let i = 0; i < servicos.length; i++) {
      if (servicos[i].ser_nome === "") {
        setAlert(
          "Preencha o nome do serviço para salvar o agendamento!",
          "error",
          "tabler-alert-triangle",
          6000
        );
        return false;
      } else if (servicos[i].ser_quantity === 0) {
        setAlert(
          "Preencha a quantidade do serviço para salvar o agendamento!",
          "error",
          "tabler-alert-triangle",
          6000
        );
        return false;
      }
    }
  }

  loadingSave.value = true;

  console.log("Data:", agendamento.value);

  try {
    const res = await $api(`/agenda/update`, {
      method: "POST",
      body: {
        data: agendamento.value,
      },
    });

    if (!res) return false;

    setAlert("Agendamento salvo com sucesso!", "success", "tabler-check", 3000);
    //closeNavigationDrawer();
    emit("updateEvents", agendamento.value?.age_id);
    agendamento.value.updated_by = userData.fullName;
    agendamento.value.updated_at = new Date();
    return true;
  } catch (error) {
    console.error("Erro ao salvar agendamento:", error, error.response);
    setAlert(
      "Ocorreu um erro ao salvar agendamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
    return false;
  } finally {
    loadingSave.value = false;
  }
};

const viewDialogServicos = ref(false);
const searchQueryServicos = ref("");
const loadingServicos = ref(false);
const servicos = ref([]);
const servicoSelected = ref(null);

const setServico = () => {
  if (!servicoSelected.value) return;

  agendamento.value.servicos.push(servicoSelected.value);
  viewDialogServicos.value = false;
};

const getServicosApi = async () => {
  let textQuery = searchQueryServicos.value?.trim();

  if (textQuery.length < 3) {
    servicos.value = [];
    return;
  }

  loadingServicos.value = true;

  try {
    const res = await $api("/servicos/list", {
      method: "GET",
      query: {
        q: textQuery,
        search: true,
      },
    });

    if (!res) return;

    console.log("Serviços:", res.servicos);

    servicos.value = res.servicos;
  } catch (error) {
    console.error("Erro ao buscar serviços:", error, error.response);
    servicos.value = [];
  } finally {
    loadingServicos.value = false;
  }
};

const confirmAtendidoVisible = ref(false);

const openConfirmAtendido = () => {
  if (!can("atender", "agendamento")) {
    setAlert(
      "Você não tem permissão para atender este agendamento!",
      "error",
      "tabler-alert-circle",
      5000
    );
    return;
  }
  confirmAtendidoVisible.value = !confirmAtendidoVisible.value;
};

const confirmAtendido = async () => {
  if (!can("atender", "agendamento")) {
    setAlert(
      "Você não tem permissão para atender este agendamento!",
      "error",
      "tabler-alert-circle",
      5000
    );
    return;
  }

  setAtendido();
};

const loadingDesatender = ref(false);

const desatenderAgendamento = async () => {
  if (!can("atender", "agendamento")) {
    setAlert(
      "Você não tem permissão para desatender este agendamento!",
      "error",
      "tabler-alert-circle",
      5000
    );
    return;
  }

  if (
    !(await useConfirm({
      message:
        "Deseja realmente desatender este agendamento? O agendamento só será contabilizado nos relatórios financeiros se for atendido novamente.",
    }))
  ) {
    return;
  }

  loadingDesatender.value = true;
  try {
    const res = await $api(`/agenda/desetAtendido`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
      },
    });

    if (!res) return;

    setAlert(
      "Agendamento desatendido com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    agendamento.value.ast_id = 2;
    agendamento.value.status = "Confirmado";
    agendamento.value.updated_by = userData.fullName;
    agendamento.value.updated_at = new Date();
    canEditAge.value = true;
    emit("updateEvents", agendamento.value?.age_id);
  } catch (error) {
    console.error("Erro ao desatender agendamento:", error, error.response);
    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao desatender o agendamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  } finally {
    loadingDesatender.value = false;
  }
};

const isRecebimentoDrawerVisible = ref(false);
const loadingSetAtendido = ref(false);
const ReceberData = ref({});
const pagamentos = ref([]);
const pagamentosVisible = ref(false);

watch(isRecebimentoDrawerVisible, (newVal) => {
  if (!newVal) {
    ReceberData.value = {};
  }
});

const setAtendido = async () => {
  console.log("Dados: ", agendamento.value);

  if (!can("atender", "agendamento")) {
    setAlert(
      "Você não tem permissão para atender este agendamento!",
      "error",
      "tabler-alert-circle",
      5000
    );
    return;
  }

  loadingSetAtendido.value = true;

  let salvar = await saveAgendamento();

  if (!salvar) {
    loadingSetAtendido.value = false;
    return setAlert(
      "Não foi possível atender o agendamento, verifique os dados e tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }

  try {
    const res = await $api(`/agenda/setAtendido`, {
      method: "POST",
      body: {
        data: agendamento.value,
      },
    });

    if (!res) return;

    console.log("Produto edit:", res);

    agendamento.value.bkColor =
      agendamento.value.statusColors &&
      agendamento.value.statusColors?.length > 0
        ? agendamento?.value?.statusColors?.find(
            (cor) => cor.type === "cor_atendido"
          ).value
        : "#A8A8A8";
    agendamento.value.ast_id = 3;
    agendamento.value.status = "Atendido";
    canEditAge.value = false;

    setAlert(
      "Agendamento atendido com successo!",
      "success",
      "tabler-check",
      3000
    );
    agendamento.value.updated_by = userData.fullName;
    agendamento.value.updated_at = new Date();
    confirmAtendidoVisible.value = !confirmAtendidoVisible.value;

    if (
      can("create", "financeiro_recebimento") ||
      can("edit", "financeiro_recebimento")
    ) {
      viewPagamento();
    }

    emit("updateEvents", agendamento.value?.age_id);
  } catch (error) {
    console.error("Error getting produto:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao atender o agendamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }

  loadingSetAtendido.value = false;
};

const loadingViewPagamento = ref(false);
const loadingAddPagamento = ref(false);

const viewPagamento = async () => {
  if (!can("edit", "financeiro_recebimento")) {
    setAlert(
      "Você não tem permissão para ver os pagamentos!",
      "error",
      "tabler-alert-circle",
      5000
    );
    return;
  }

  loadingViewPagamento.value = true;

  try {
    const res = await $api(`/agenda/getPagamentos`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
      },
    });

    if (!res) return;

    console.log("Pagamentos:", res);

    pagamentos.value = res.pagamentos;
    agendamento.value.age_valorPago = res.valorPagoTotal;
    agendamento.value.age_valorNaoPago = res.valorNaoPagoTotal;
  } catch (error) {
    console.error("Error getting produto:", error, error.response);
  }

  pagamentosVisible.value = true;
  loadingViewPagamento.value = false;
};

const viewPagamento2 = async (pagamento) => {
  loadingViewPagamento.value = true;

  console.log("Pagamento:", pagamento);

  try {
    const res = await $api(`/pagamentos/get/receber/${pagamento.pgt_id}`, {
      method: "GET",
    });

    if (!res) return;

    console.log("Pagamentos:", res);

    ReceberData.value = res;
    isRecebimentoDrawerVisible.value = true;
  } catch (error) {
    console.error("Error getting produto:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao buscar o pagamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );
  }

  loadingViewPagamento.value = false;
};

const addPagamento = async () => {
  loadingAddPagamento.value = true;

  try {
    const res = await $api(`/agenda/addPagamento`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
      },
    });

    if (!res) return;

    console.log("Pagamentos:", res);

    setAlert(
      "Pagamento adicionado com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    viewPagamento();
    viewPagamento2({ pgt_id: res });
  } catch (error) {
    console.error("Error getting produto:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao adicionar o pagamento, tente novamente!",
      "error",
      "tabler-alert-triangle",
      8000
    );
  }

  loadingAddPagamento.value = false;
};

const isTableLembreteVisible = ref(false);
const viewLembretes = () => {
  isTableLembreteVisible.value = true;
};

const formasPagamento = ref([]);

const getFormasPagamentos = async () => {
  const resPagamentoEntrada = await $api("/pagamentos/forma_entrada", {
    method: "GET",
  });

  if (!resPagamentoEntrada) {
    formasPagamento.value = [
      { fpg_id: 3, fpg_nome: "Cartão de Crédito" },
      { fpg_id: 4, fpg_nome: "Dinheiro" },
      { fpg_id: 5, fpg_nome: "Cartão de Débito" },
      { fpg_id: 6, fpg_nome: "Pix" },
      { fpg_id: 7, fpg_nome: "Transferência PJ" },
      { fpg_id: 8, fpg_nome: "Boleto" },
    ];
  } else {
    formasPagamento.value = resPagamentoEntrada.map((pagamento) => {
      return {
        fpg_id: pagamento.fpg_id,
        fpg_nome: pagamento.fpg_descricao,
      };
    });
  }
};

const fontes = ref([]);

const getFontes = async () => {
  const resFontes = await $api("/config/g/fonte_cliente", {
    method: "GET",
  });

  console.log("resFontes:", resFontes);

  if (!resFontes) return;

  console.log("Fontes:", resFontes);

  fontes.value = resFontes;
};

const removeOldServico = async (index) => {
  try {
    const servico = agendamento.value.servicos[index];

    if (!servico || !servico.isOld) return;

    const res = await $api(`/servicos/removeOldServico`, {
      method: "POST",
      body: {
        age_id: agendamento.value.age_id,
        ser_id: servico.ser_id,
      },
    });

    if (!res) return;

    console.log("Serviço removido:", res);
    agendamento.value.servicos.splice(index, 1);
  } catch (error) {
    console.error("Error getting produto:", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao remover o serviço, tente novamente!",
      "error",
      "tabler-alert-triangle",
      6000
    );

    agendamento.value.servicos.splice(index, 1);
  }
};

const changeHorariosView = ref(false);

const changeHorariosOpen = () => {
  changeHorariosView.value = !changeHorariosView.value;
};

const changeHorarios = async () => {
  let check = checkStatus();
  if (!check) return;

  let body = {
    age_id: agendamento.value.age_id,
    age_horaInicio: agendamento.value.age_horaInicio,
    age_horaFim: agendamento.value.age_horaFim,
    age_horaInicioFim: agendamento.value.age_horaInicioFim,
    age_horaFimFim: agendamento.value.age_horaFimFim,
    age_data: dataRemarcar.value.novaData,
    age_dataFim: dataRemarcar.value.novaDataFim,
  };

  const res = await $api(`/agenda/changeHorarios`, {
    method: "POST",
    body,
  });

  if (!res) return;

  setAlert("Horários alterados com sucesso!", "success", "tabler-check", 3000);
  changeHorariosView.value = false;
  agendamento.value.updated_by = userData.fullName;
  agendamento.value.updated_at = new Date();
  agendamento.value.age_data = dataRemarcar.value.novaData;
  agendamento.value.age_dataFim = dataRemarcar.value.novaDataFim;

  emit("updateEvents", agendamento.value?.age_id);
};

const viewOrdemServico = ref(false);

const selectedUserData = ref(null);
const viewEditCliente = ref(false);

watch(viewEditCliente, (newVal) => {
  if (!newVal) {
    selectedUserData.value = null;
  }
});

const editUser = async () => {
  if (!can("edit", "cliente")) {
    setAlert(
      "Você não tem permissão para editar clientes.",
      "error",
      "tabler-alert-triangle",
      3000
    );
    return;
  }

  try {
    let id = agendamento.value.cliente[0]?.cli_Id;
    const res = await $api(`/clientes/get/${id}`);

    if (!res) return;

    console.log("res edit", res);

    selectedUserData.value = res[0];
    viewEditCliente.value = true;
  } catch (error) {
    console.error("Error fetching user data", error, error.response);

    setAlert(
      error?.response?._data?.message ||
        "Ocorreu um erro ao buscar os dados do cliente, tente novamente!",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const calcularPeriodo = (contrato) => {
  if (!contrato.periodoType || !contrato.periodo || !contrato.inicioData)
    return "";

  let inicio = moment(contrato.inicioData);

  switch (contrato.periodoType) {
    case "Mensal":
      return inicio.add(contrato.periodo, "months").format("DD/MM/YYYY");
    case "Trimestral":
      return inicio.add(contrato.periodo * 3, "months").format("DD/MM/YYYY");
    case "Semestral":
      return inicio.add(contrato.periodo * 6, "months").format("DD/MM/YYYY");
    case "Anual":
      return inicio.add(contrato.periodo, "years").format("DD/MM/YYYY");
  }

  return "";
};

await getFormasPagamentos();
await getFontes();
</script>

<template>
  <VDialog
    persistent
    class="scrollable-content"
    :model-value="props.isDrawerOpen"
    @update:model-value="handleDrawerModelValueUpdate"
    :width="agendamento.age_type == 'bloqueio' ? '400' : '100%'"
    v-if="agendamento"
  >
    <VCard flat>
      <VCardText class="pt-2">
        <!-- 👉 Title -->
        <AppDrawerHeaderSection @cancel="closeNavigationDrawer">
          <template #title>
            <div class="d-flex flex-md-row flex-column align-center">
              <h5 class="text-h6 mb-0 mr-2">
                <VIcon icon="tabler-calendar" class="mr-2" />
                {{
                  agendamento.age_type != "bloqueio"
                    ? `Agendamento #${agendamento.age_id}`
                    : "Bloqueio de Horário"
                }}
              </h5>

              <div
                class="d-flex flex-row align-center"
                :class="{ 'mt-2': isMobile }"
              >
                <VChip
                  v-if="agendamento.age_type != 'bloqueio'"
                  :color="agendamento.bkColor ? agendamento.bkColor : 'primary'"
                  class="ml-2"
                  label
                  variant="flat"
                >
                  <span class="text-white">{{ agendamento.status }}</span>
                </VChip>

                <IconBtn
                  color="warning"
                  @click="viewLembretes"
                  v-if="
                    (can('view', 'agendamento') ||
                      can('view-all', 'agendamento')) &&
                    agendamento.age_type != 'bloqueio'
                  "
                  class="ml-3"
                  :size="sizeIconBtn"
                >
                  <VIcon icon="tabler-bell" :size="sizeIcon" />
                </IconBtn>

                <IconBtn
                  color="info"
                  @click="viewHistoricoAgendamento = !viewHistoricoAgendamento"
                  v-if="
                    can('historico', 'agendamento') &&
                    agendamento.age_type != 'bloqueio'
                  "
                  class="ml-3"
                  :size="sizeIconBtn"
                >
                  <VIcon icon="tabler-history" :size="sizeIcon" />
                </IconBtn>
              </div>
            </div>
          </template>
        </AppDrawerHeaderSection>

        <VRow>
          <VCol cols="12" :md="agendamento.age_type != 'bloqueio' ? 9 : 12">
            <VRow>
              <VCol cols="12" :md="agendamento.age_type != 'bloqueio' ? 6 : 12">
                <p class="mb-2 font-weight-bold">Dados do Agendamento</p>

                <!--Tipo do Agendamento-->
                <VMenu
                  offset-y
                  max-width="300"
                  min-width="300"
                  max-height="300"
                  transition="scale-transition"
                  rounded="xl"
                >
                  <template v-slot:activator="{ props }">
                    <p class="mb-2 cursor-pointer" v-bind="props">
                      <VIcon icon="tabler-list" class="mr-2" />
                      {{
                        typesAgendamento.find(
                          (t) => t.value === agendamento.age_type
                        )?.emoji ?? ""
                      }}
                      {{
                        typesAgendamento.find(
                          (t) => t.value === agendamento.age_type
                        )?.title || "Não identificado"
                      }}

                      <VTooltip activator="parent" location="start">
                        <p class="mb-0 text-sm">Tipo do Agendamento</p>
                      </VTooltip>
                    </p>
                  </template>

                  <VList>
                    <VListItem
                      v-for="(tipo, index) in typesAgendamento"
                      :key="index"
                      rounded
                      @click="agendamento.age_type = tipo.value"
                    >
                      {{ tipo.emoji ?? "" }}
                      {{ tipo.title ?? "" }}
                    </VListItem>
                  </VList>
                </VMenu>

                <p class="mb-1">
                  <VIcon icon="tabler-calendar" class="mr-2" />
                  {{
                    formatDateAgendamento(
                      agendamento.age_data,
                      agendamento.age_horaInicio,
                      agendamento.age_horaFim
                    )
                  }}
                  <VTooltip
                    activator="parent"
                    text="Data e hora do agendamento"
                  />
                </p>

                <p class="mb-1" v-if="agendamento.age_dataFim">
                  <VIcon icon="tabler-calendar-x" class="mr-2" />
                  {{
                    formatDateAgendamento(
                      agendamento.age_dataFim,
                      agendamento.age_horaInicioFim,
                      agendamento.age_horaFimFim
                    )
                  }}
                  <VTooltip
                    activator="parent"
                    text="Data e hora do fim do agendamento"
                  />
                </p>

                <p class="mb-1" v-if="agendamento.funcionario.length > 0">
                  <VIcon icon="tabler-calendar-user" class="mr-2" />
                  {{ agendamento.funcionario[0]?.fullName }}
                  <VTooltip
                    activator="parent"
                    text="Funcionário responsável pelo agendamento"
                  />
                </p>

                <AppTextEdit
                  v-model="agendamento.age_observacao"
                  tag="p"
                  class="mb-1"
                  type="textarea"
                  tooltip="Observação do agendamento"
                  icon="tabler-message"
                  colorIcon="success"
                  @save="agendamento.age_observacao = $event"
                  variant="solo-filled"
                  viewCompleto="true"
                  maxLength="150"
                />

                <VBtn
                  color="primary"
                  variant="tonal"
                  block
                  @click="changeHorariosOpen"
                  v-if="canEditAge && agendamento.age_type == 'bloqueio'"
                >
                  <VIcon icon="tabler-clock" class="mr-2" />
                  Alterar Horários
                </VBtn>
              </VCol>

              <VCol cols="12" md="6" v-if="agendamento.age_type != 'bloqueio'">
                <div class="d-flex flex-row align-center mb-2">
                  <p class="mb-0 font-weight-bold">Cliente</p>

                  <IconBtn
                    v-if="
                      can('edit', 'cliente') && agendamento.cliente[0]?.cli_Id
                    "
                    color="primary"
                    variant="tonal"
                    @click="editUser"
                    class="ml-2"
                    size="25"
                  >
                    <VIcon icon="tabler-edit" size="20" />
                  </IconBtn>
                </div>

                <p class="mb-1">
                  <VIcon icon="tabler-user" class="mr-2" />
                  {{ agendamento.cliente[0]?.cli_nome }}
                  <VTooltip activator="parent" text="Nome do cliente" />
                </p>

                <p class="mb-1" v-if="agendamento.cliente[0]?.cli_celular">
                  <VIcon icon="tabler-phone" class="mr-2" />
                  {{ agendamento.cliente[0]?.cli_celular }}
                  <VTooltip activator="parent" text="Celular do cliente" />
                </p>

                <p class="mb-1" v-if="agendamento.cliente[0]?.cli_email">
                  <VIcon icon="tabler-mail" class="mr-2" />
                  {{ agendamento.cliente[0]?.cli_email }}
                  <VTooltip activator="parent" text="Email do cliente" />
                </p>

                <!--Fonte-->
                <VMenu
                  offset-y
                  max-width="300"
                  min-width="300"
                  max-height="300"
                  transition="scale-transition"
                  rounded="xl"
                >
                  <template v-slot:activator="{ props }">
                    <p class="mb-2 cursor-pointer" v-bind="props">
                      <VIcon icon="tabler-world" class="mr-2" />

                      {{ agendamento.age_fonte || "Fonte do Agendamento" }}

                      <VTooltip activator="parent" location="start">
                        <p class="mb-0 text-sm">Fonte do Agendamento</p>
                      </VTooltip>
                    </p>
                  </template>

                  <VList>
                    <VListItem
                      v-for="(fonte, index) in fontes.map((f) => f.value)"
                      :key="index"
                      rounded
                      @click="agendamento.age_fonte = fonte"
                    >
                      {{ fonte }}
                    </VListItem>
                  </VList>
                </VMenu>

                <!--Contratos-->
                <VMenu
                  offset-y
                  max-width="300"
                  min-width="300"
                  max-height="300"
                  transition="scale-transition"
                  rounded="xl"
                  v-if="
                    agendamento.cliente[0]?.cli_contratos?.length > 0 ||
                    agendamento.age_contrato
                  "
                  :disabled="!canEditAge"
                >
                  <template v-slot:activator="{ props }">
                    <p class="mb-1 cursor-pointer" v-bind="props">
                      <VIcon icon="tabler-file-text" class="mr-2" />

                      {{
                        agendamento.age_contrato
                          ? `N° #${agendamento.age_contrato}`
                          : "Contrato do Agendamento"
                      }}

                      <VTooltip
                        activator="parent"
                        text="Contrato do cliente"
                        location="start"
                      />
                    </p>
                  </template>

                  <VList>
                    <VListItem
                      rounded
                      @click="agendamento.age_contrato = null"
                      :active="!agendamento.age_contrato"
                    >
                      <p class="mb-0 text-sm">Nenhum contrato</p>
                    </VListItem>

                    <VListItem
                      v-for="(contrato, index) in agendamento.cliente[0]
                        ?.cli_contratos"
                      :key="index"
                      rounded
                      @click="agendamento.age_contrato = contrato.numero"
                      :active="agendamento.age_contrato === contrato.numero"
                    >
                      <div>
                        <div class="d-flex flex-row align-center mb-1">
                          <p class="mb-0 text-sm">N° #{{ contrato.numero }}</p>
                          <VChip
                            :color="contrato.ativo ? 'success' : 'error'"
                            size="small"
                            label
                            class="ml-2"
                          >
                            {{ contrato.ativo ? "Ativo" : "Inativo" }}
                          </VChip>
                        </div>

                        <p class="mb-0 text-sm">
                          <strong>Período:</strong> {{ contrato.periodo }} ({{
                            contrato.periodoType
                          }})
                        </p>

                        <p class="mb-0 text-sm">
                          <strong>Início:</strong>
                          {{ moment(contrato.inicioData).format("DD/MM/YYYY") }}
                          -
                          <strong>Fim:</strong> {{ calcularPeriodo(contrato) }}
                        </p>

                        <p class="mb-0 text-sm">
                          <strong>Valor:</strong>
                          {{ formatValue(contrato.valor) }}
                        </p>
                      </div>
                    </VListItem>
                  </VList>
                </VMenu>
              </VCol>
            </VRow>

            <VDivider
              class="mt-6 mb-5"
              v-if="agendamento.age_type != 'bloqueio'"
            />

            <div
              class="linha-flex mb-4"
              v-if="agendamento.age_type != 'bloqueio'"
            >
              <p class="font-weight-bold mb-0">
                <VIcon icon="tabler-map-pin-2" class="mr-2" />
                Endereço
              </p>
              <IconBtn
                color="primary"
                variant="tonal"
                @click="editEndereco = !editEndereco"
                class="ml-2"
                :size="sizeIconBtn"
                v-if="!editEndereco && canEditAge"
              >
                <VIcon icon="tabler-edit" :size="sizeIcon" />

                <VTooltip activator="parent" text="Editar Endereço" />
              </IconBtn>

              <IconBtn
                color="success"
                variant="tonal"
                @click="editEndereco = !editEndereco"
                class="ml-2"
                :size="sizeIconBtn"
                v-if="editEndereco && canEditAge"
              >
                <VIcon icon="tabler-check" :size="sizeIcon" />

                <VTooltip activator="parent" text="Salvar Edição" />
              </IconBtn>

              <IconBtn
                color="warning"
                variant="tonal"
                @click="copyEndereco(agendamento.endereco[0])"
                class="ml-2"
                :size="sizeIconBtn"
              >
                <VIcon icon="tabler-copy" :size="sizeIcon" />

                <VTooltip activator="parent" text="Copiar Endereço" />
              </IconBtn>

              <IconBtn
                color="info"
                variant="tonal"
                @click="enderecoWaze(agendamento.endereco[0])"
                class="ml-2"
                :size="sizeIconBtn"
              >
                <VIcon icon="tabler-brand-waze" :size="sizeIcon" />

                <VTooltip activator="parent" text="Ver no Waze" />
              </IconBtn>

              <IconBtn
                color="success"
                variant="tonal"
                @click="enderecoMaps(agendamento.endereco[0])"
                class="ml-2"
                :size="sizeIconBtn"
              >
                <VIcon icon="tabler-brand-google-maps" :size="sizeIcon" />

                <VTooltip activator="parent" text="Ver no Google Maps" />
              </IconBtn>
            </div>

            <VRow v-if="editEndereco">
              <VCol cols="12" md="3">
                <VLabel>
                  <VIcon icon="tabler-map-pin" class="mr-2" /> CEP
                </VLabel>
                <VTextField
                  v-model="agendamento.endereco[0].end_cep"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  v-mask="'#####-###'"
                  @keyup="getCep(agendamento.endereco[0]?.end_cep)"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
              <VCol cols="12" md="5">
                <VLabel>
                  <VIcon icon="tabler-align-left" class="mr-2" /> Logradouro
                </VLabel>
                <VTextField
                  v-model="agendamento.endereco[0].end_logradouro"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-align-center" class="mr-2" />
                  Complemento
                </VLabel>
                <VTextarea
                  v-model="agendamento.endereco[0].end_complemento"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  :rows="isMobile ? 2 : 1"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
              <VCol cols="12" md="2">
                <VLabel>
                  <VIcon icon="tabler-numbers" class="mr-2" /> Número
                </VLabel>
                <VTextField
                  v-model="agendamento.endereco[0].end_numero"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-map-pin-2" class="mr-2" /> Bairro
                </VLabel>
                <VTextField
                  v-model="agendamento.endereco[0].end_bairro"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
              <VCol cols="12" md="3">
                <VLabel>
                  <VIcon icon="tabler-map-pin-2" class="mr-2" /> Cidade
                </VLabel>
                <VTextField
                  v-model="agendamento.endereco[0].end_cidade"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
              <VCol cols="12" md="3">
                <VLabel>
                  <VIcon icon="tabler-flag" class="mr-2" /> Estado
                </VLabel>
                <VTextField
                  v-model="agendamento.endereco[0].end_estado"
                  :readonly="!editEndereco"
                  variant="solo-filled"
                  :hint="
                    editEndereco
                      ? 'Salve o agendamento para que as alterações sejam salvas'
                      : undefined
                  "
                />
              </VCol>
            </VRow>

            <p v-else class="mb-0">
              {{ escreverEndereco(agendamento.endereco[0]) }}
            </p>

            <VDivider
              class="mt-6 mb-5"
              v-if="agendamento.age_type != 'bloqueio'"
            />

            <p
              class="font-weight-bold mb-0"
              v-if="agendamento.age_type != 'bloqueio'"
            >
              <VIcon icon="tabler-tools" class="mr-2" />
              Serviços
              <IconBtn
                color="primary"
                variant="tonal"
                @click="viewDialogServicos = true"
                class="ml-2"
                :size="sizeIconBtn"
                v-if="canEditAge"
              >
                <VIcon icon="tabler-plus" :size="sizeIcon" />

                <VTooltip activator="parent" text="Adicionar Serviço" />
              </IconBtn>
            </p>

            <p
              class="mb-0 mt-2"
              v-if="
                agendamento.servicos?.length === 0 &&
                agendamento.age_type != 'bloqueio'
              "
            >
              <VIcon icon="tabler-info-circle" class="mr-2" />
              Nenhum serviço adicionado
            </p>

            <VExpansionPanels
              multiple
              v-else-if="agendamento.age_type != 'bloqueio'"
              class="mt-3"
            >
              <template
                v-for="(servico, index) in agendamento.servicos"
                :key="index"
              >
                <VExpansionPanel
                  v-if="servico"
                  @click="
                    servico.isOld
                      ? setAlert(
                          'Este serviço é antigo, não é possível editar! Caso necessário, adicione um novo serviço.',
                          'info',
                          'tabler-info-circle',
                          10000
                        )
                      : null
                  "
                  :title="`${index + 1} - ${servico.ser_nome} - ${formatValue(
                    servico.ser_valor
                  )} (Qtd: ${servico.ser_quantity})`"
                  :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                  rounded="md"
                >
                  <VExpansionPanelText class="pt-4">
                    <VRow>
                      <VCol cols="12" md="7">
                        <VLabel>
                          <VIcon icon="tabler-align-center" class="mr-2" />
                          Descrição
                        </VLabel>
                        <VTextField
                          v-model="servico.ser_descricao"
                          placeholder="Insira a metragem, inseto ou descrição do serviço"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>
                      <VCol cols="12" md="2">
                        <VLabel>
                          <VIcon icon="tabler-coin" class="mr-2" /> Valor
                        </VLabel>
                        <Dinheiro
                          v-model="servico.ser_valor"
                          class="altura-input"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>
                      <VCol cols="12" md="3">
                        <div class="d-flex flex-row gap-3 align-end">
                          <div>
                            <VLabel>
                              <VIcon icon="tabler-box" class="mr-2" /> Qtd.
                            </VLabel>
                            <VTextField
                              v-model="servico.ser_quantity"
                              type="number"
                              placeholder="Insira a quantidade do serviço"
                              :readonly="servico.isOld || !canEditAge"
                            />
                          </div>

                          <IconBtn
                            color="error"
                            v-if="canEditAge"
                            @click="
                              !servico.isOld
                                ? agendamento.servicos.splice(index, 1)
                                : removeOldServico(index)
                            "
                            icon="tabler-trash"
                          />
                        </div>
                      </VCol>

                      <VCol cols="12" md="6" v-if="!servico.isOld">
                        <VLabel>
                          <VIcon icon="tabler-star" class="mr-2" /> Garantia
                        </VLabel>
                        <VTextField
                          v-model="servico.ser_data.garantia"
                          placeholder="Ex.: 3 meses"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>

                      <VCol cols="12" md="6" v-if="!servico.isOld">
                        <VLabel>
                          <VIcon icon="tabler-home" class="mr-2" /> Área
                        </VLabel>
                        <VSelect
                          v-model="servico.ser_data.ser_area"
                          :items="['Interno', 'Externo', 'Ambos']"
                          dense
                          outlined
                          placeholder="Selecione a área"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>

                      <VCol cols="12" md="4" v-if="!servico.isOld">
                        <VLabel>
                          <VIcon icon="tabler-ruler-measure" class="mr-2" /> m²
                          Interno
                        </VLabel>
                        <VTextField
                          v-model="servico.ser_data.metragem_interno"
                          placeholder="Ex.: 100"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>
                      <VCol cols="12" md="4" v-if="!servico.isOld">
                        <VLabel>
                          <VIcon icon="tabler-ruler-measure" class="mr-2" /> m²
                          Externo
                        </VLabel>
                        <VTextField
                          v-model="servico.ser_data.metragem_externo"
                          placeholder="Ex.: 100"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>
                      <VCol cols="12" md="4" v-if="!servico.isOld">
                        <VLabel>
                          <VIcon icon="tabler-ruler-measure" class="mr-2" /> m²
                          Total
                        </VLabel>
                        <VTextField
                          v-model="servico.ser_data.metragem_total"
                          placeholder="Ex.: 100"
                          :readonly="servico.isOld || !canEditAge"
                        />
                      </VCol>
                    </VRow>
                  </VExpansionPanelText>
                </VExpansionPanel>
              </template>
            </VExpansionPanels>

            <VDivider
              class="mt-6 mb-5"
              v-if="agendamento.age_type != 'bloqueio'"
            />

            <VExpansionPanels
              multiple
              class="mt-4"
              v-if="agendamento.age_type != 'bloqueio'"
            >
              <VExpansionPanel
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                rounded="md"
              >
                <VExpansionPanelTitle>
                  <div>
                    <p class="font-weight-bold mb-0">
                      <VIcon icon="tabler-info-circle" class="mr-1" />
                      Informações Adicionais
                    </p>

                    <p class="mb-0 text-sm">
                      <span v-if="agendamento.age_garantia">
                        Garantia:
                        <strong>{{ agendamento.age_garantia }}</strong>
                      </span>

                      <span v-if="agendamento.age_metragem.interno">
                        | Interno:
                        <strong>
                          {{ agendamento.age_metragem.interno }} m²
                        </strong>
                      </span>

                      <span v-if="agendamento.age_metragem.externo">
                        | Externo:
                        <strong>
                          {{ agendamento.age_metragem.externo }} m²
                        </strong>
                      </span>

                      <span v-if="agendamento.age_metragem.total">
                        | Total:
                        <strong>
                          {{ agendamento.age_metragem.total }} m²
                        </strong>
                      </span>

                      <span v-if="agendamento.age_local">
                        | Área:
                        <strong>{{ agendamento.age_local }}</strong>
                      </span>
                    </p>
                  </div>
                </VExpansionPanelTitle>
                <VExpansionPanelText class="pt-4">
                  <VRow>
                    <VCol cols="12" md="6">
                      <VLabel>
                        <VIcon icon="tabler-star" class="mr-2" /> Garantia
                      </VLabel>
                      <VTextField
                        v-model="agendamento.age_garantia"
                        placeholder="Ex.: 3 meses"
                        variant="solo-filled"
                        :readonly="!canEditAge"
                      />
                    </VCol>
                    <VCol cols="12" md="6">
                      <VLabel>
                        <VIcon icon="tabler-home" class="mr-2" /> Área
                      </VLabel>
                      <VSelect
                        v-model="agendamento.age_local"
                        :items="['Interno', 'Externo', 'Ambos']"
                        dense
                        outlined
                        placeholder="Selecione a área"
                        variant="solo-filled"
                        :readonly="!canEditAge"
                      />
                    </VCol>
                    <VCol cols="12" md="4">
                      <VLabel>
                        <VIcon icon="tabler-ruler-measure" class="mr-2" /> m²
                        Interno
                      </VLabel>
                      <VTextField
                        v-model="agendamento.age_metragem.interno"
                        placeholder="Ex.: 100"
                        variant="solo-filled"
                        :readonly="!canEditAge"
                      />
                    </VCol>
                    <VCol cols="12" md="4">
                      <VLabel>
                        <VIcon icon="tabler-ruler-measure" class="mr-2" /> m²
                        Externo
                      </VLabel>
                      <VTextField
                        v-model="agendamento.age_metragem.externo"
                        placeholder="Ex.: 100"
                        variant="solo-filled"
                        :readonly="!canEditAge"
                      />
                    </VCol>
                    <VCol cols="12" md="4">
                      <VLabel>
                        <VIcon icon="tabler-ruler-measure" class="mr-2" /> m²
                        Total
                      </VLabel>
                      <VTextField
                        v-model="agendamento.age_metragem.total"
                        placeholder="Ex.: 100"
                        variant="solo-filled"
                        :readonly="!canEditAge"
                      />
                    </VCol>
                  </VRow>
                </VExpansionPanelText>
              </VExpansionPanel>

              <VExpansionPanel
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                rounded="md"
              >
                <VExpansionPanelTitle>
                  <div>
                    <p class="font-weight-bold mb-0">
                      <VIcon icon="tabler-photo" class="mr-1" />
                      Imagens ({{ agendamento.imagens?.length ?? 0 }})
                    </p>
                  </div>
                </VExpansionPanelTitle>
                <VExpansionPanelText class="pt-4">
                  <v-file-input
                    id="fileInput"
                    accept="image/png, image/jpeg, image/jpg"
                    multiple
                    style="display: none"
                    v-model="imagesUploads"
                    @update:model-value="enviarFotos"
                  />
                  <VBtn
                    color="primary"
                    variant="tonal"
                    @click="addPhotos"
                    :loading="loadingUploads"
                    v-if="canEditAge"
                  >
                    <VIcon icon="tabler-cloud-upload" class="mr-2" />
                    Adicionar Imagens
                  </VBtn>

                  <VRow class="mt-4" dense>
                    <v-fade-transition>
                      <VCol cols="12" v-if="agendamento.imagens.length === 0">
                        <p class="mb-0">
                          <VIcon icon="tabler-photo-x" class="mr-2" />
                          Nenhuma imagem adicionada
                        </p>
                      </VCol>
                    </v-fade-transition>
                    <v-fade-transition
                      v-for="(image, index) in agendamento.imagens"
                      :key="index"
                    >
                      <VCol
                        class="v-col-4 v-col-md-3"
                        v-if="agendamento.imagens.length > 0"
                      >
                        <VImg
                          :src="image.url"
                          width="200px"
                          height="200px"
                          class="rounded w-100"
                          cover
                        />
                        <VBtn
                          color="error"
                          @click="removeImage(index)"
                          class="mt-2 w-100"
                          :loading="loadingRemoveImage"
                          v-if="canEditAge"
                        >
                          Remover Imagem
                          <v-icon class="ml-2">tabler-circle-x</v-icon>
                        </VBtn>
                      </VCol>
                    </v-fade-transition>
                  </VRow>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </VCol>

          <VCol cols="12" md="3" v-if="agendamento.age_type != 'bloqueio'">
            <p
              class="d-flex flex-row gap-3 font-weight-bold align-center justify-center mb-4 w-100 text-sm"
              v-if="canEditAge"
            >
              Retrabalho/Reforço
              <VSwitch v-model="agendamento.age_retrabalho" color="primary" />

              <VTooltip
                location="top"
                activator="parent"
                text="Ative a chave se o agendamento for um retrabalho ou reforço"
              />
            </p>

            <VSelect
              v-model="agendamento.age_retrabalho_id"
              :items="agendamento.outrosAgendamentos"
              item-title="age_data"
              item-value="age_id"
              placeholder="Selecione o agendamento inicial"
              variant="solo-filled"
              v-if="agendamento.age_retrabalho && canEditAge"
              class="mb-4"
            >
              <template v-slot:selection="{ item }">
                <div class="d-flex align-center pt-2 pb-1">
                  <VIcon icon="tabler-calendar" class="mr-2" />
                  <span>{{
                    new Date(item.raw.age_data).toLocaleDateString("pt-BR")
                  }}</span>
                </div>
              </template>

              <template #item="{ props, item }">
                <VListItem
                  #title
                  v-bind="props"
                  style="display: flex; align-items: center"
                >
                  <VIcon icon="tabler-calendar" class="mr-2" />
                  <span>
                    {{
                      new Date(item.raw.age_data).toLocaleDateString("pt-BR")
                    }}
                    -
                    {{
                      statusAgendamentoItens.find(
                        (status) => status?.value === item.raw.ast_id
                      ).text
                    }}
                    - {{ formatValue(item.raw.age_valor) }}
                  </span>
                </VListItem>
              </template>
            </VSelect>

            <VTextarea
              v-model="agendamento.age_retrabalho_motivo"
              active
              auto-grow
              placeholder="Insira o motivo do retrabalho"
              variant="solo-filled"
              rows="3"
              v-if="agendamento.age_retrabalho && canEditAge"
              hint="Salve o agendamento para salvar as alterações"
            />

            <VDivider class="my-4" v-if="agendamento.age_retrabalho" />

            <VExpansionPanels>
              <VExpansionPanel
                title="Ações"
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                rounded="md"
              >
                <VExpansionPanelText class="pt-4">
                  <div
                    class="d-flex flex-column gap-3 align-center justify-center"
                  >
                    <VBtn
                      color="primary"
                      block
                      @click="saveAgendamento"
                      :loading="loadingSave"
                      v-if="canEditAge"
                    >
                      <VIcon icon="tabler-device-floppy" class="mr-2" />
                      Salvar
                    </VBtn>

                    <VBtn
                      class="w-100"
                      color="warning"
                      variant="tonal"
                      @click="openDuplicarDialog"
                      :loading="loadingDuplicar"
                      v-if="can('edit', 'agendamento')"
                    >
                      <VIcon icon="tabler-copy" class="mr-2" />
                      Duplicar
                    </VBtn>

                    <VBtn
                      class="w-100"
                      v-if="canEditAge && can('confirmar', 'agendamento')"
                      color="success"
                      variant="tonal"
                      @click="changeStatus('Confirmado')"
                      :disabled="agendamento.status === 'Confirmado'"
                    >
                      <VIcon icon="tabler-circle-check" class="mr-2" />
                      Confirmado
                    </VBtn>

                    <VBtn
                      class="w-100"
                      v-if="canEditAge && can('atender', 'agendamento')"
                      :color="
                        agendamento.statusColors &&
                        agendamento.statusColors?.length > 0
                          ? agendamento?.statusColors?.find(
                              (cor) => cor.type === 'cor_atendido'
                            ).value
                          : '#A8A8A8'
                      "
                      @click="openConfirmAtendido"
                      :disabled="agendamento.status === 'Atendido'"
                    >
                      <VIcon icon="tabler-check" class="mr-2" />
                      Atendido
                    </VBtn>

                    <VBtn
                      class="w-100"
                      v-if="
                        can('atender', 'agendamento') && agendamento.ast_id == 3
                      "
                      color="error"
                      variant="outlined"
                      @click="desatenderAgendamento"
                      :loading="loadingDesatender"
                    >
                      <VIcon icon="tabler-x" class="mr-2" />
                      Desatender
                    </VBtn>

                    <VBtn
                      class="w-100"
                      @click="remarcarOpen()"
                      v-if="canEditAge && can('remarcar', 'agendamento')"
                      :color="
                        agendamento.statusColors &&
                        agendamento.statusColors?.length > 0
                          ? agendamento.statusColors?.find(
                              (cor) => cor.type === 'cor_remarcado'
                            ).value
                          : '#AA0000'
                      "
                    >
                      <VIcon icon="tabler-calendar" class="mr-2" />
                      Remarcar
                    </VBtn>

                    <VBtn
                      class="w-100 text-none"
                      v-if="can('ordem_servico', 'agendamento')"
                      color="#4E342E"
                      @click="viewOrdemServico = true"
                    >
                      <VIcon icon="tabler-receipt" class="mr-2" />
                      Ordem de Serviço
                    </VBtn>

                    <VBtn
                      class="w-100"
                      v-if="canEditAge && can('cancelar', 'agendamento')"
                      :color="
                        agendamento.statusColors &&
                        agendamento.statusColors?.length > 0
                          ? agendamento.statusColors?.find(
                              (cor) => cor.type === 'cor_cancelado'
                            ).value
                          : '#FF4500'
                      "
                      @click="changeStatus('Cancelado')"
                      :disabled="agendamento.status === 'Cancelado'"
                    >
                      <VIcon icon="tabler-x" class="mr-2" />
                      Cancelar
                    </VBtn>

                    <div
                      class="d-flex flex-row gap-3 align-center justify-center w-100"
                    >
                      <VBtn
                        :class="`${
                          agendamento.age_certificado ? 'w-75' : 'w-100'
                        }`"
                        color="success"
                        @click="gerarCertificado"
                        v-if="
                          agendamento.ast_id !== 6 && can('edit', 'agendamento')
                        "
                        :loading="loadingGerarCertificado"
                      >
                        <VIcon icon="tabler-certificate" class="mr-2" />
                        {{
                          agendamento.age_certificado
                            ? "Certificado"
                            : "Gerar Certificado"
                        }}
                      </VBtn>
                      <a
                        href="#"
                        v-if="
                          agendamento.age_certificado &&
                          can('edit', 'agendamento')
                        "
                        class="d-block text-center w-25"
                        @click="gerarCertificado(true)"
                      >
                        <VIcon icon="tabler-repeat" class="mr-2" />

                        <VTooltip
                          activator="parent"
                          text="Gerar novo certificado"
                        />
                      </a>
                    </div>

                    <div
                      class="d-flex flex-row gap-3 align-center justify-center w-100"
                    >
                      <VBtn
                        color="success"
                        :class="`${agendamento.age_recibo ? 'w-75' : 'w-100'}`"
                        @click="gerarRecibo(false)"
                        v-if="
                          agendamento.ast_id !== 6 && can('edit', 'agendamento')
                        "
                        :loading="loadingGerarRecibo"
                      >
                        <VIcon icon="tabler-receipt" class="mr-2" />
                        {{ agendamento.age_recibo ? "Recibo" : "Gerar Recibo" }}
                      </VBtn>

                      <a
                        href="#"
                        v-if="
                          agendamento.age_recibo && can('edit', 'agendamento')
                        "
                        class="d-block text-center w-25"
                        @click="gerarRecibo(true)"
                      >
                        <VIcon icon="tabler-repeat" class="mr-2" />

                        <VTooltip activator="parent" text="Gerar novo recibo" />
                      </a>
                    </div>

                    <VBtn
                      color="primary"
                      variant="tonal"
                      block
                      @click="changeFuncionarioOpen"
                      v-if="canEditAge"
                      class="w-100"
                    >
                      <VIcon
                        :icon="
                          !changeFuncionarioView
                            ? 'tabler-user-cog'
                            : 'tabler-x'
                        "
                        class="mr-2"
                      />
                      {{
                        !changeFuncionarioView ? "Trocar Funcionário" : "Fechar"
                      }}
                    </VBtn>

                    <v-fade-transition>
                      <VCard
                        rounded="md"
                        class="pa-2 w-100"
                        v-if="
                          changeFuncionarioView && can('edit', 'agendamento')
                        "
                      >
                        <VSelect
                          class="w-100"
                          v-model="agendamento.funcionario[0]"
                          :items="agendamento.funcionarios"
                          item-value="object"
                          item-title="fullName"
                          label="Escolha o novo funcionário"
                          return-object
                          @update:model-value="
                            changeFuncionario(agendamento.funcionario[0])
                          "
                        />
                      </VCard>
                    </v-fade-transition>

                    <VBtn
                      color="primary"
                      variant="tonal"
                      block
                      @click="changeHorariosOpen"
                      v-if="canEditAge"
                    >
                      <VIcon icon="tabler-clock" class="mr-2" />
                      Alterar Horários
                    </VBtn>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>

              <VExpansionPanel
                v-if="
                  can('view', 'financeiro_comissao') ||
                  can('view', 'financeiro_recebimento')
                "
                :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
                rounded="md"
              >
                <VExpansionPanelTitle>
                  <p class="mb-0">Financeiro</p>

                  <VChip
                    v-if="
                      agendamento.ast_id == 3 &&
                      agendamento.age_valor != null &&
                      agendamento.age_valor > 0
                    "
                    class="ml-2"
                    size="x-small"
                    :color="agendamento.pago ? 'success' : 'warning'"
                    label
                  >
                    <VIcon icon="tabler-coin" size="12" class="mr-1" />
                    {{ agendamento.pago ? "Pago" : "Pendente" }}
                    <VTooltip activator="parent" location="bottom">
                      <p class="mb-0 text-sm">Status do pagamento</p>
                    </VTooltip>
                  </VChip>
                </VExpansionPanelTitle>
                <VExpansionPanelText class="pt-4">
                  <div
                    class="d-flex flex-column gap-3 align-center justify-center"
                  >
                    <VBtn
                      color="warning"
                      @click="viewComissoes"
                      :loading="loadingSetComissao"
                      class="w-100"
                      v-if="can('edit', 'financeiro_comissao')"
                    >
                      <VIcon icon="tabler-gift-card" class="mr-2" />
                      Comissões
                    </VBtn>

                    <VBtn
                      color="info"
                      @click="descontoInputView = !descontoInputView"
                      class="w-100"
                      v-if="can('edit', 'financeiro_recebimento')"
                    >
                      <VIcon icon="tabler-discount" class="mr-2" />
                      Descontos
                    </VBtn>

                    <VBtn
                      color="success"
                      block
                      @click="viewPagamento"
                      v-if="
                        agendamento.ast_id == 3 &&
                        can('edit', 'financeiro_recebimento')
                      "
                      :loading="loadingViewPagamento"
                    >
                      <VIcon icon="tabler-credit-card" class="mr-2" />
                      Pagamentos
                    </VBtn>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>

            <h6
              class="text-h6 d-flex justify-space-between mb-2 mt-4"
              v-if="
                agendamento.ast_id !== 7 &&
                can('edit', 'financeiro_recebimento')
              "
            >
              Desconto:
              <span class="font-weight-bold">{{
                formatValue(agendamento.age_desconto)
              }}</span>
            </h6>

            <h5 class="text-h5 mt-3 d-flex justify-space-between">
              Valor total:
              <span class="font-weight-medium">
                {{ formatValue(agendamento.age_valor) }}
              </span>
            </h5>
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <lembreteTable
      v-if="agendamento?.age_type !== 'bloqueio'"
      :isDrawerOpen="isTableLembreteVisible"
      @update:isDrawerOpen="isTableLembreteVisible = $event"
      type="Agendamento"
      :params="`https://app.oregonhigienizacao.com.br/agendamento?viewAgendamento=${agendamento.age_id}`"
    />

    <ReceberDialog
      v-if="agendamento?.age_type !== 'bloqueio'"
      :isDrawerOpen="isRecebimentoDrawerVisible"
      @updateReceber="viewPagamento"
      @update:isDrawerOpen="isRecebimentoDrawerVisible = $event"
      :ReceberData="ReceberData"
    />

    <ComissaoDialog
      v-if="agendamento?.age_type !== 'bloqueio'"
      :isDrawerOpen="isComissaoDrawerVisible"
      @update:isDrawerOpen="isComissaoDrawerVisible = $event"
      :comissaoData="selectedComissaoData"
      :agendamento="agendamentoDataD"
      @updateComissoes="viewComissoes"
    />

    <template v-if="agendamento">
      <VDialog
        v-model="changeHorariosView"
        width="600"
        v-if="changeHorariosView && canEditAge"
      >
        <VCard>
          <VCardText>
            <AppDrawerHeaderSection
              customClass="pt-0"
              title="Alterar Horários"
              @cancel="changeHorariosView = false"
            />

            <VRow class="mt-3">
              <VCol cols="12">
                <AppTextField
                  v-model="dataRemarcar.novaData"
                  label="Nova data"
                  type="date"
                  class="w-100"
                />
              </VCol>

              <VCol cols="12" md="6">
                <AppTextField
                  v-model="agendamento.age_horaInicio"
                  label="Nova hora ínicio"
                  type="time"
                  class="w-100"
                />
              </VCol>
              <VCol cols="12" md="6">
                <AppTextField
                  v-model="agendamento.age_horaFim"
                  label="Nova hora fim"
                  type="time"
                  class="w-100"
                />
              </VCol>

              <VCol cols="12">
                <AppTextField
                  v-model="dataRemarcar.novaDataFim"
                  label="Nova data de término"
                  type="date"
                  class="w-100"
                />
              </VCol>

              <VCol cols="12" md="6">
                <AppTextField
                  v-model="agendamento.age_horaInicioFim"
                  label="Nova hora início término"
                  type="time"
                  class="w-100"
                />
              </VCol>

              <VCol cols="12" md="6">
                <AppTextField
                  v-model="agendamento.age_horaFimFim"
                  label="Nova hora fim término"
                  type="time"
                  class="w-100"
                />
              </VCol>
            </VRow>
            <VBtn
              color="success"
              @click="changeHorarios"
              class="mt-4 w-100"
              :loading="loadingChangeHorarios"
            >
              <VIcon icon="tabler-clock-check" class="mr-2" />
              Alterar
            </VBtn>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="viewDuplicarDialog"
        max-width="700"
        v-if="can('edit', 'agendamento') && agendamento.age_type != 'bloqueio'"
      >
        <VCard flat>
          <VCardText>
            <AppDrawerHeaderSection
              title="Duplicar Agendamento"
              @cancel="viewDuplicarDialog = false"
              customClass="pt-0"
            />

            <VRow class="mt-3">
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-calendar" class="mr-2" />
                  Data da duplicação
                </VLabel>
                <VTextField
                  v-model="dataDup.novaDataDup"
                  type="date"
                  placeholder="Selecione a data"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" />
                  Hora de Início
                </VLabel>
                <VTextField
                  v-model="dataDup.novaHoraInicioDup"
                  type="time"
                  placeholder="Selecione a hora de início"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" />
                  Hora Fim
                </VLabel>
                <VTextField
                  v-model="dataDup.novaHoraFimDup"
                  type="time"
                  placeholder="Selecione a hora de fim"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-calendar" class="mr-2" />
                  Data Fim
                </VLabel>
                <VTextField
                  v-model="dataDup.novaDataFimDup"
                  type="date"
                  placeholder="Selecione a data de fim (opcional)"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" />
                  Hora Inicio Fim
                </VLabel>
                <VTextField
                  v-model="dataDup.novaHoraInicioFimDup"
                  type="time"
                  placeholder="Selecione a hora de início"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" />
                  Hora Fim
                </VLabel>
                <VTextField
                  v-model="dataDup.novaHoraFimFimDup"
                  type="time"
                  placeholder="Selecione a hora de fim"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-user" class="mr-2" />
                  Funcionário da duplicação
                </VLabel>
                <VSelect
                  v-model="dataDup.novoFuncionarioDup"
                  :items="agendamento.funcionarios"
                  item-title="fullName"
                  item-value="id"
                  dense
                  outlined
                  placeholder="Selecione o funcionário"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-settings" class="mr-2" />
                  Opções da duplicação
                </VLabel>
                <p class="text-caption mb-1">
                  Selecione o que deseja duplicar desse agendamento
                </p>
                <div class="d-flex flex-wrap gap-3">
                  <div
                    v-for="(value, key) in optionsDup"
                    :key="key"
                    class="d-flex align-center"
                  >
                    <VCheckbox v-model="optionsDup[key]" />
                    <span style="font-size: 13px">{{ keyLabel(key) }}</span>
                  </div>
                </div>
              </VCol>

              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-info-circle" class="mr-2" />
                  Status da duplicação
                </VLabel>
                <VSelect
                  v-model="dataDup.novoStatusDup"
                  :items="statusAgendamentoItens"
                  item-title="text"
                  item-value="value"
                  dense
                  outlined
                  placeholder="Selecione o status"
                  variant="solo-filled"
                />
              </VCol>

              <VCol cols="12" align="center">
                <VBtn
                  color="error"
                  variant="tonal"
                  class="mr-2"
                  @click="viewDuplicarDialog = false"
                >
                  <VIcon icon="tabler-x" class="mr-2" />
                  Fechar
                </VBtn>
                <VBtn
                  color="success"
                  @click="duplicarAgendamento"
                  :loading="loadingDuplicar"
                >
                  <VIcon icon="tabler-copy" class="mr-2" />
                  Duplicar
                </VBtn>
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="viewDialogServicos"
        width="600"
        persistent
        v-if="agendamento.age_type != 'bloqueio'"
      >
        <VCard>
          <VCardText class="pt-2">
            <!-- 👉 Title -->
            <AppDrawerHeaderSection
              title="Adicionar Serviço"
              @cancel="
                viewDialogServicos = false;
                servicos = [];
                searchQueryServicos = '';
                servicoSelected = null;
              "
            />

            <v-menu location="bottom" max-height="250">
              <template v-slot:activator="{ props }">
                <VTextField
                  v-model="searchQueryServicos"
                  v-bind="props"
                  :loading="loadingServicos"
                  @update:model-value="getServicosApi()"
                  clearable
                  placeholder="Pesquise por nome do serviço (mínimo 3 caracteres)"
                  append-inner-icon="tabler-search"
                />
              </template>

              <VList dense v-if="servicos.length > 0">
                <VListItem
                  v-for="(servicoGet, indexl) in servicos"
                  :key="indexl"
                  @click="
                    servicoSelected = {
                      ...servicoGet,
                      ser_data: {
                        garantia: '',
                        ser_area: null,
                        metragem_externo: '',
                        metragem_interno: '',
                        metragem_total: '',
                      },
                      ser_sub_id:
                        servicoGet.isSub && servicoGet.ser_pai
                          ? servicoGet.ser_id
                          : null,
                      isSub:
                        servicoGet.isSub ||
                        (servicoGet.isSub && servicoGet.ser_pai),
                      ser_quantity: 1,
                    }
                  "
                  :active="servicoSelected?.ser_id === servicoGet.ser_id"
                  class="item-cliente"
                >
                  <div :class="{ 'ml-2': servicoGet.isSub }">
                    <p class="mb-0">
                      {{ servicoGet.isSub ? "↳ " : "" }}
                      {{
                        servicoGet.ser_nome +
                        " - " +
                        formatValue(servicoGet.ser_valor)
                      }}
                    </p>
                    <p
                      class="text-caption mb-0 text-disabled"
                      v-if="servicoGet.isSub"
                    >
                      Serviço vinculado a: {{ servicoGet.pai_name }}
                    </p>
                    <p class="text-caption mb-0 text-disabled">
                      {{ servicoGet.ser_descricao }}
                    </p>
                  </div>
                </VListItem>
              </VList>
            </v-menu>

            <div class="mb-0 mt-4" v-if="servicoSelected">
              <strong>Serviço Selecionado:</strong>
              <p class="mb-0">
                {{
                  servicoSelected.ser_nome +
                  " - " +
                  formatValue(servicoSelected.ser_valor)
                }}
              </p>
              <p
                class="text-caption mb-0 text-disabled"
                v-if="servicoSelected.isSub"
              >
                Serviço vinculado a: {{ servicoSelected.pai_name }}
              </p>
              <p class="text-caption mb-0 text-disabled">
                {{ servicoSelected.ser_descricao }}
              </p>
            </div>

            <VDivider class="my-4" />

            <div class="linha-flex gap-3 justify-end mt-4">
              <VBtn
                color="secondary"
                variant="outlined"
                @click="
                  viewDialogServicos = false;
                  servicos = [];
                  searchQueryServicos = '';
                  servicoSelected = null;
                "
              >
                Cancelar
              </VBtn>

              <VBtn
                color="primary"
                :disabled="!servicoSelected"
                @click="setServico()"
              >
                Adicionar Serviço
              </VBtn>
            </div>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="confirmAtendidoVisible"
        max-width="700"
        v-if="
          canEditAge &&
          can('atender', 'agendamento') &&
          agendamento.age_type != 'bloqueio'
        "
      >
        <VCard flat>
          <VCardText>
            <AppDrawerHeaderSection
              title="Marcar agendamento como atendido"
              @cancel="confirmAtendidoVisible = false"
              customClass="pt-0"
            />

            <VRow class="mt-4">
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-tools" class="mr-2" />
                  Serviços
                </VLabel>
                <VList dense>
                  <VListItem
                    v-for="(servico, index) in agendamento.servicos"
                    :key="index"
                    v-if="agendamento.servicos.length > 0"
                  >
                    <p class="mb-0">
                      {{
                        servico.ser_nome +
                        " - " +
                        formatValue(servico.ser_valor)
                      }}
                    </p>
                    <p class="text-caption mb-0">
                      {{ servico.ser_descricao }}
                    </p>
                  </VListItem>
                  <p class="mb-0" v-else>Nenhum serviço adicionado</p>
                </VList>
              </VCol>
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-user" class="mr-2" />
                  Funcionário
                </VLabel>
                <VTextField
                  v-model="agendamento.funcionario[0].fullName"
                  readonly
                />
              </VCol>
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-discount" class="mr-2" />
                  Desconto
                </VLabel>
                <Dinheiro v-model="agendamento.age_desconto" readonly />
              </VCol>
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-coin" class="mr-2" />
                  Valor Total
                </VLabel>
                <Dinheiro v-model="agendamento.age_valor" readonly />
              </VCol>
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-message" class="mr-2" />
                  Observações
                </VLabel>
                <VTextarea
                  v-model="agendamento.age_observacao"
                  readonly
                  rows="2"
                />
              </VCol>
              <VCol cols="12" align="center">
                <VBtn
                  color="error"
                  variant="tonal"
                  class="mr-2"
                  @click="confirmAtendidoVisible = false"
                >
                  <VIcon icon="tabler-x" class="mr-2" />
                  Fechar
                </VBtn>
                <VBtn
                  color="success"
                  @click="confirmAtendido"
                  :loading="loadingSetAtendido"
                >
                  <VIcon icon="tabler-check" class="mr-2" />
                  Confirmar
                </VBtn>
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="remarcarView"
        max-width="700"
        v-if="
          canEditAge &&
          can('remarcar', 'agendamento') &&
          agendamento.age_type != 'bloqueio'
        "
      >
        <VCard flat>
          <VCardText>
            <AppDrawerHeaderSection
              title="Remarcar Agendamento"
              @cancel="remarcarView = false"
              customClass="pt-0"
            />

            <VRow class="mt-4">
              <VCol cols="12" md="6">
                <VLabel>
                  <VIcon icon="tabler-dashboard" class="mr-2" /> Status
                </VLabel>
                <VSelect
                  v-model="dataRemarcar.novoStatus"
                  :items="statusAgendamentoItens"
                  item-title="text"
                  item-value="value"
                  dense
                  outlined
                  placeholder="Selecione o status"
                  variant="solo-filled"
                />
              </VCol>
              <VCol cols="12" md="6">
                <VLabel>
                  <VIcon icon="tabler-user-cog" class="mr-2" />
                  Funcionário
                </VLabel>
                <VSelect
                  v-model="dataRemarcar.novoFuncionario"
                  :items="agendamento.funcionarios"
                  item-value="id"
                  return-object
                  placeholder="Selecione o novo funcionário"
                  item-title="fullName"
                  variant="solo-filled"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-calendar" class="mr-2" /> Nova Data
                </VLabel>
                <VTextField
                  v-model="dataRemarcar.novaData"
                  variant="solo-filled"
                  placeholder="Selecione a data"
                  type="date"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" /> Nova hora de início
                </VLabel>
                <VTextField
                  v-model="dataRemarcar.novaHoraInicio"
                  variant="solo-filled"
                  placeholder="Selecione a hora"
                  type="time"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" /> Nova hora de fim
                </VLabel>
                <VTextField
                  v-model="dataRemarcar.novaHoraFim"
                  variant="solo-filled"
                  placeholder="Selecione a hora"
                  type="time"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-calendar" class="mr-2" /> Nova data de fim
                </VLabel>
                <VTextField
                  v-model="dataRemarcar.novaDataFim"
                  variant="solo-filled"
                  placeholder="Selecione a data"
                  type="date"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" /> Nova hora de início
                  de fim
                </VLabel>
                <VTextField
                  v-model="dataRemarcar.novaHoraInicioFim"
                  variant="solo-filled"
                  placeholder="Selecione a hora"
                  type="time"
                />
              </VCol>
              <VCol cols="12" md="4">
                <VLabel>
                  <VIcon icon="tabler-clock" class="mr-2" /> Nova hora de fim de
                  fim
                </VLabel>
                <VTextField
                  v-model="dataRemarcar.novaHoraFimFim"
                  variant="solo-filled"
                  placeholder="Selecione a hora"
                  type="time"
                />
              </VCol>

              <VCol cols="12" align="center">
                <VBtn
                  color="error"
                  variant="tonal"
                  class="mr-2"
                  @click="remarcarView = false"
                >
                  <VIcon icon="tabler-x" class="mr-2" />
                  Fechar
                </VBtn>
                <VBtn
                  color="success"
                  @click="remarcarAge"
                  :loading="remarcarLoading"
                >
                  <VIcon icon="tabler-check" class="mr-2" />
                  Remarcar
                </VBtn>
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="comissoesVisible"
        max-width="600"
        v-if="
          can('edit', 'financeiro_comissao') &&
          agendamento.age_type != 'bloqueio'
        "
      >
        <VCard flat>
          <VCardText>
            <div
              class="d-flex flex-row justify-space-between mb-2 align-center"
            >
              <p class="mb-0 font-weight-bold">
                <VIcon icon="tabler-gift-card" class="mr-1" />
                Comissões

                <VBtn
                  color="primary"
                  variant="tonal"
                  @click="addComissao"
                  class="ml-2"
                  size="small"
                  style="height: 30px"
                  v-if="can('edit', 'financeiro_comissao')"
                >
                  <VIcon icon="tabler-plus" class="mr-2" />
                  Adicionar Comissão
                </VBtn>
              </p>
              <IconBtn
                icon="tabler-x"
                @click="comissoesVisible = false"
                title="Fechar"
              />
            </div>
            <VTable>
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="comissao in comissoes"
                  :key="comissao.com_id"
                  v-if="comissoes.length > 0"
                >
                  <td>
                    {{ comissao.fullName }}
                  </td>
                  <td>{{ formatValue(comissao.com_valor) }}</td>
                  <td>
                    <VChip
                      :color="comissao.com_paga ? 'success' : 'warning'"
                      label
                    >
                      {{
                        comissao.com_paga
                          ? `Pago em ${new Date(
                              comissao.com_paga_data
                            ).toLocaleDateString()}`
                          : "Pendente"
                      }}
                    </VChip>
                  </td>
                  <td>
                    <IconBtn
                      icon="tabler-pencil"
                      @click="viewComissao(comissao)"
                      title="Visualizar Comissão"
                      :loading="loadingSetComissao"
                    />
                  </td>
                </tr>
                <tr v-else class="text-center">
                  <td colspan="4">Nenhuma comissão adicionada</td>
                </tr>
              </tbody>
            </VTable>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="pagamentosVisible"
        max-width="600"
        v-if="
          agendamento.ast_id == 3 &&
          can('edit', 'financeiro_recebimento') &&
          agendamento.age_type != 'bloqueio'
        "
      >
        <VCard flat>
          <VCardText>
            <div
              class="d-flex flex-row justify-space-between mb-2 align-center"
            >
              <p class="mb-0 font-weight-bold">
                <VIcon icon="tabler-cash" class="mr-1" />
                Pagamentos
                <!--  <VBtn
                  color="primary"
                  variant="tonal"
                  size="small"
                  class="ml-2"
                  style="height: 30px"
                  @click="addPagamento"
                >
                  <VIcon icon="tabler-plus" class="mr-1" />
                  Adicionar Pagamento
                </VBtn> -->
              </p>
              <IconBtn
                icon="tabler-x"
                @click="pagamentosVisible = false"
                title="Fechar"
              />
            </div>

            <div class="d-flex flex-row gap-4 align-center my-4 justify-center">
              <div
                style="border-right: 1px solid #ffffff4a; padding-right: 8px"
              >
                <p class="mb-0 text-h5 text-warning">
                  {{ formatValue(agendamento?.age_valorNaoPago) }}
                </p>
                <p class="mb-0 text-caption">Valor Pendente</p>
              </div>

              <div
                style="border-right: 1px solid #ffffff4a; padding-right: 8px"
              >
                <p class="mb-0 text-h5 text-success">
                  {{ formatValue(agendamento?.age_valorPago) }}
                </p>
                <p class="mb-0 text-caption">Valor Pago</p>
              </div>

              <div>
                <p class="mb-0 text-h5">
                  {{ formatValue(agendamento?.age_valor) }}
                </p>
                <p class="mb-0 text-caption">Valor Total</p>
              </div>
            </div>

            <VTable>
              <thead>
                <tr>
                  <th>Forma de Pgt.</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="outroPagamento in pagamentos"
                  :key="index"
                  v-if="pagamentos.length > 0"
                >
                  <td v-if="outroPagamento.fpg_name">
                    {{ outroPagamento.fpg_name }}
                  </td>
                  <td v-else>-</td>
                  <td>{{ formatValue(outroPagamento.pgt_valor_bk) }}</td>
                  <td>
                    <VChip
                      :color="outroPagamento.pgt_data ? 'success' : 'warning'"
                      label
                    >
                      {{
                        outroPagamento.pgt_data
                          ? outroPagamento.pgt_data
                          : "Pendente"
                      }}
                    </VChip>
                  </td>
                  <td>
                    <IconBtn
                      color="primary"
                      icon="tabler-eye"
                      @click="viewPagamento2(outroPagamento)"
                      title="Visualizar Pagamento"
                      :loading="loadingViewPagamento"
                    />
                  </td>
                </tr>
                <tr v-else class="text-center">
                  <td colspan="4">Nenhum pagamento adicionado</td>
                </tr>
              </tbody>
            </VTable>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="descontoInputView"
        max-width="600"
        v-if="
          agendamento.ast_id !== 7 &&
          can('edit', 'financeiro_recebimento') &&
          agendamento.age_type != 'bloqueio'
        "
      >
        <VCard flat>
          <VCardText>
            <AppDrawerHeaderSection
              title="Definir Desconto"
              @cancel="descontoInputView = false"
              customClass="pt-0"
            />
            <VRow class="mt-4">
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-percentage" class="mr-2" />
                  Tipo de desconto
                </VLabel>
                <VSelect
                  v-model="typeDesconto"
                  :items="['Porcentagem', 'Valor']"
                  placeholder="Selecione o tipo de desconto"
                />
              </VCol>
              <VCol cols="12" v-if="typeDesconto === 'Porcentagem'">
                <VLabel>
                  <VIcon icon="tabler-percentage" class="mr-2" />
                  Porcentagem do desconto
                </VLabel>
                <VTextField
                  v-model="percentValue"
                  variant="solo-filled"
                  placeholder="Insira a porcentagem do desconto"
                  @update:model-value="calcDesconto"
                />
              </VCol>
              <VCol cols="12">
                <VLabel>
                  <VIcon icon="tabler-coin" class="mr-2" />
                  Valor do desconto
                </VLabel>
                <Dinheiro
                  v-model="descontoBk"
                  :readonly="typeDesconto === 'Porcentagem'"
                  class="altura-input"
                />
              </VCol>
              <VCol cols="12" align="center">
                <VBtn
                  color="error"
                  variant="tonal"
                  class="mr-2"
                  @click="descontoInputView = false"
                >
                  <VIcon icon="tabler-x" class="mr-2" />
                  Fechar
                </VBtn>
                <VBtn
                  color="success"
                  @click="setDiscount()"
                  :loading="loadingSetDiscount"
                >
                  <VIcon icon="tabler-check" class="mr-2" />
                  Confirmar
                </VBtn>
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </VDialog>

      <VDialog
        v-model="viewOrdemServico"
        :max-width="
          !agendamento?.age_ordemServico?.assinaturaData ? '1200' : '600'
        "
        persistent
      >
        <VCard>
          <VCardText>
            <AppDrawerHeaderSection
              title="Ordem de Serviço"
              @cancel="viewOrdemServico = false"
              customClass="pt-0"
            />
            <OrdemServico
              :agendamentoData="agendamento"
              :isDialog="true"
              @close="
                {
                  viewOrdemServico = false;
                  agendamento.age_ordemservico = $event;
                }
              "
              @updateOrdem="agendamento.age_ordemServico = $event"
            />
          </VCardText>
        </VCard>
      </VDialog>

      <AgendamentoHistorico
        v-if="agendamento?.age_type !== 'bloqueio'"
        :isDrawerOpen="viewHistoricoAgendamento"
        @update:isDrawerOpen="viewHistoricoAgendamento = $event"
        :agendamento_id="agendamento.age_id"
      />

      <NewCliente
        :isDrawerOpen="viewEditCliente"
        @update:isDrawerOpen="viewEditCliente = $event"
        :clienteData="selectedUserData"
        @clienteSaved="agendamento.cliente = [$event]"
      />
    </template>
  </VDialog>
</template>
