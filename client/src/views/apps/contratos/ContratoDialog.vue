<script setup>
import { temaAtual } from "@core/stores/config";
import moment from "moment";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import NovaCobrancaDialog from "./NovaCobrancaDialog.vue";
import NovaAssinaturaDialog from "./NovaAssinaturaDialog.vue";
import ContratoAssinaturaDialog from "./ContratoAssinaturaDialog.vue";
import ImportarModeloDialog from "./ImportarModeloDialog.vue";

const toolbarOptions = [
  [{ header: 1 }, { header: 2 }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ align: [] }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  ["blockquote"],
  ["clean"],
];

const { setAlert } = useAlert();

const emit = defineEmits(["update:isDrawerOpen", "contratoSaved"]);

const props = defineProps({
  isDrawerOpen: {
    type: Boolean,
    required: true,
  },
  contratoData: {
    type: Object,
    default: null,
  },
});

let refData = {
  id: null,
  cli_id: null,
  numero: null,
  inicio_data: null,
  periodo: null,
  periodo_type: null,
  ativo: 1,
  valor: null,
  obs: null,
  conteudo_html: null,
  status: "gerado",
};

const form = ref({ ...refData });
const pagamentos = ref([]);
const loading = ref(false);
const loadingPdf = ref(false);
const currentTab = ref(0);

const closeDrawer = () => {
  emit("update:isDrawerOpen", false);
  form.value = { ...refData };
  pagamentos.value = [];
  currentTab.value = 0;
};

const handleDrawer = (val) => {
  emit("update:isDrawerOpen", val);
  if (!val) {
    form.value = { ...refData };
    pagamentos.value = [];
    currentTab.value = 0;
  }
};

// Clientes autocomplete
const clientes = ref([]);
const clienteSearch = ref("");
const loadingClientes = ref(false);
let searchTimeout = null;

const searchClientes = async (val) => {
  if (searchTimeout) clearTimeout(searchTimeout);
  searchTimeout = setTimeout(async () => {
    if (!val || val.length < 2) return;
    loadingClientes.value = true;
    try {
      const res = await $api("/clientes/list", {
        query: { q: val, itemsPerPage: 20, page: 1 },
      });
      clientes.value = res.clientes.map((c) => ({
        title: c.cli_nome,
        value: c.cli_Id,
      }));
    } catch (err) {
      console.error("Erro ao buscar clientes:", err);
    }
    loadingClientes.value = false;
  }, 300);
};

watch(clienteSearch, searchClientes);

// Carrega assinatura recorrente ao abrir aba de cobranças
watch(currentTab, (val) => {
  if (val === 3 && form.value.id) {
    getAssinaturaRecorrente();
  }
});

watch(
  () => props.contratoData,
  (newVal) => {
    if (newVal?.id) {
      form.value = {
        ...refData,
        id: newVal.id,
        cli_id: newVal.cli_id,
        numero: newVal.numero,
        inicio_data: newVal.inicio_data
          ? moment(newVal.inicio_data).format("YYYY-MM-DD")
          : null,
        periodo: newVal.periodo == "" ? null : newVal.periodo,
        periodo_type:
          newVal.periodo_type == "null" ? null : newVal.periodo_type,
        ativo: newVal.ativo,
        valor: newVal.valor,
        obs: newVal.obs,
        conteudo_html: newVal.conteudo_html,
        status: newVal.status,
      };
      pagamentos.value = newVal.pagamentos || [];

      if (newVal.cli_id && newVal.cli_nome) {
        clientes.value = [{ title: newVal.cli_nome, value: newVal.cli_id }];
      }
    } else {
      form.value = { ...refData };
      pagamentos.value = [];
    }
  },
  { immediate: true }
);

// Salvar
const salvar = async () => {
  loading.value = true;
  try {
    if (form.value.id) {
      await $api(`/contratos/update/${form.value.id}`, {
        method: "PUT",
        body: form.value,
      });
      setAlert(
        "Contrato atualizado com sucesso!",
        "success",
        "tabler-check",
        5000
      );
    } else {
      const res = await $api("/contratos/create", {
        method: "POST",
        body: form.value,
      });
      form.value.id = res.id;
      setAlert("Contrato criado com sucesso!", "success", "tabler-check", 5000);
    }
    emit("contratoSaved");
  } catch (err) {
    console.error("Erro ao salvar contrato:", err);
    setAlert(
      err?.response?._data?.message ||
        "Erro ao salvar contrato. Tente novamente.",
      "error",
      "tabler-alert-triangle",
      5000
    );
  }
  loading.value = false;
};

// PDF
const conteudoMode = ref("editor");

const gerarPdf = async () => {
  if (!form.value.id) {
    setAlert(
      "Salve o contrato antes de gerar o PDF",
      "warning",
      "tabler-alert-triangle",
      5000
    );
    return;
  }
  loadingPdf.value = true;
  try {
    const res = await $api(`/contratos/gerar-pdf/${form.value.id}`, {
      method: "POST",
    });
    setAlert("PDF gerado com sucesso!", "success", "tabler-check", 5000);
    if (props.contratoData) {
      props.contratoData.pdf_gerado_url = res.fileUrl;
      props.contratoData.pdf_gerado_path = res.filePath;
    }
  } catch (err) {
    console.error("Erro ao gerar PDF:", err);
    setAlert("Erro ao gerar PDF", "error", "tabler-alert-triangle", 5000);
  }
  loadingPdf.value = false;
};

const uploadPdfFile = ref(null);

const uploadPdf = async () => {
  if (!form.value.id) {
    setAlert(
      "Salve o contrato antes de fazer upload",
      "warning",
      "tabler-alert-triangle",
      5000
    );
    return;
  }
  if (!uploadPdfFile.value || uploadPdfFile.value.length === 0) {
    setAlert(
      "Selecione um arquivo PDF",
      "warning",
      "tabler-alert-triangle",
      5000
    );
    return;
  }
  loadingPdf.value = true;
  try {
    const formData = new FormData();
    formData.append("pdf", uploadPdfFile.value[0]);
    const res = await $api(`/contratos/upload-pdf/${form.value.id}`, {
      method: "POST",
      body: formData,
    });
    setAlert("PDF enviado com sucesso!", "success", "tabler-check", 5000);
    if (props.contratoData) {
      props.contratoData.conteudo_pdf_url = res.fileUrl;
      props.contratoData.conteudo_pdf_path = res.filePath;
    }
  } catch (err) {
    console.error("Erro ao enviar PDF:", err);
    setAlert("Erro ao enviar PDF", "error", "tabler-alert-triangle", 5000);
  }
  loadingPdf.value = false;
};

// Assinatura
const viewAssinaturaDialog = ref(false);

const pdfUrl = computed(() => {
  if (!props.contratoData) return null;
  return (
    props.contratoData.pdf_gerado_url || props.contratoData.conteudo_pdf_url
  );
});

const linkAssinatura = ref("");

const gerarLinkAssinatura = async () => {
  if (!form.value.id) return;
  try {
    const res = await $api(
      `/contratos/gerar-link-assinatura/${form.value.id}`,
      { method: "POST" }
    );
    linkAssinatura.value = res.link;
    setAlert("Link gerado com sucesso!", "success", "tabler-check", 5000);
  } catch (err) {
    console.error("Erro ao gerar link:", err);
    setAlert("Erro ao gerar link", "error", "tabler-alert-triangle", 5000);
  }
};

const copiarLink = () => {
  navigator.clipboard.writeText(linkAssinatura.value);
  setAlert("Link copiado!", "success", "tabler-copy", 2000);
};

// Painel do Cliente
const dashboardSenha = ref("");
const passwordVisible = ref(false);
const loadingSenhaDashboard = ref(false);

const salvarSenhaDashboard = async () => {
  if (!form.value.id) return;
  if (!dashboardSenha.value || dashboardSenha.value.length < 6) {
    setAlert(
      "A senha deve ter pelo menos 6 caracteres",
      "warning",
      "tabler-alert-triangle",
      3000
    );
    return;
  }
  loadingSenhaDashboard.value = true;
  try {
    await $api(`/contratos/set-senha/${form.value.id}`, {
      method: "PUT",
      body: { senha: dashboardSenha.value },
    });
    setAlert("Senha do painel salva!", "success", "tabler-check", 3000);
    dashboardSenha.value = "";
  } catch (err) {
    setAlert(
      err?.response?._data?.message || "Erro ao salvar senha",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
  loadingSenhaDashboard.value = false;
};

const gerarSenhaAleatoria = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let senha = '';
  for (let i = 0; i < 6; i++) {
    senha += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  dashboardSenha.value = senha;
  passwordVisible.value = true;
};

const copiarLinkDashboard = async () => {
  if (!form.value.id) return;
  try {
    const res = await $api(`/contratos/dashboard-link/${form.value.id}`);
    navigator.clipboard.writeText(res.link);
    setAlert("Link copiado!", "success", "tabler-copy", 2000);
  } catch (err) {
    setAlert(
      err?.response?._data?.message || "Defina uma senha antes",
      "warning",
      "tabler-alert-triangle",
      3000
    );
  }
};

// Importar Modelo
const viewImportarModeloDialog = ref(false);

const onModeloSelected = (conteudoHtml) => {
  if (form.value.conteudo_html && form.value.conteudo_html !== "<p><br></p>") {
    const confirmar = window.confirm(
      "O contrato já possui conteúdo. Deseja substituir pelo modelo?"
    );
    if (!confirmar) return;
  }
  form.value.conteudo_html = conteudoHtml;
  setAlert("Modelo importado com sucesso!", "success", "tabler-check", 3000);
};

// Assinatura Recorrente
const viewAssinaturaRecorrenteDialog = ref(false);
const assinaturaRecorrente = ref(null);
const loadingAssinatura = ref(false);

const getAssinaturaRecorrente = async () => {
  if (!form.value.id) return;
  loadingAssinatura.value = true;
  try {
    const res = await $api(`/contratos/assinatura/${form.value.id}`);
    assinaturaRecorrente.value = res;
  } catch (err) {
    console.error("Erro ao buscar assinatura:", err);
  }
  loadingAssinatura.value = false;
};

const cancelarAssinatura = async () => {
  if (!assinaturaRecorrente.value?.id) return;
  const confirm = window.confirm(
    "Tem certeza que deseja cancelar a assinatura recorrente?"
  );
  if (!confirm) return;
  try {
    await $api(`/contratos/assinatura/${assinaturaRecorrente.value.id}`, {
      method: "DELETE",
    });
    setAlert("Assinatura cancelada!", "success", "tabler-check", 3000);
    assinaturaRecorrente.value = null;
  } catch (err) {
    console.error("Erro ao cancelar assinatura:", err);
    setAlert("Erro ao cancelar", "error", "tabler-alert-triangle", 3000);
  }
};

const onAssinaturaRecorrenteCreated = () => {
  getAssinaturaRecorrente();
  refreshPagamentos();
};

const getCicloLabel = (ciclo) => {
  const map = {
    MONTHLY: "Mensal",
    BIMONTHLY: "Bimestral",
    QUARTERLY: "Trimestral",
    SEMIANNUALLY: "Semestral",
    YEARLY: "Anual",
  };
  return map[ciclo] || ciclo;
};

const getAssinaturaStatusColor = (status) => {
  const map = {
    ACTIVE: "success",
    PENDING: "warning",
    INACTIVE: "error",
    CANCELLED: "default",
    EXPIRED: "error",
  };
  return map[status] || "default";
};

// Cobranças
const viewCobrancaDialog = ref(false);

const getStatusPagamentoColor = (status) => {
  const map = {
    PENDING: "warning",
    RECEIVED: "success",
    CONFIRMED: "success",
    OVERDUE: "error",
    DELETED: "default",
    REFUNDED: "info",
    CANCELLED: "default",
  };
  return map[status] || "default";
};

const getStatusPagamentoLabel = (status) => {
  const map = {
    PENDING: "Pendente",
    RECEIVED: "Recebido",
    CONFIRMED: "Confirmado",
    OVERDUE: "Vencido",
    DELETED: "Excluído",
    REFUNDED: "Estornado",
    CANCELLED: "Cancelado",
  };
  return map[status] || status;
};

const formatValor = (valor) => {
  if (!valor) return "R$ 0,00";
  return parseFloat(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
};

const abrirInvoice = (url) => {
  if (url) window.open(url, "_blank");
};

const copiarInvoice = (url) => {
  if (url) {
    navigator.clipboard.writeText(url);
    setAlert("Link copiado!", "success", "tabler-copy", 2000);
  }
};

const cancelarPagamento = async (pagamentoId) => {
  const confirm = window.confirm(
    "Tem certeza que deseja cancelar este pagamento?"
  );
  if (!confirm) return;
  try {
    await $api(`/contratos/pagamento/${pagamentoId}`, { method: "DELETE" });
    setAlert("Pagamento cancelado!", "success", "tabler-check", 3000);
    refreshPagamentos();
  } catch (err) {
    console.error("Erro ao cancelar pagamento:", err);
    setAlert(
      "Erro ao cancelar pagamento",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const refreshPagamentos = async () => {
  if (!form.value.id) return;
  try {
    const res = await $api(`/contratos/pagamentos/${form.value.id}`);
    pagamentos.value = res;
  } catch (err) {
    console.error("Erro ao atualizar pagamentos:", err);
  }
};

const onAssinaturaUpdate = async () => {
  if (form.value.id) {
    try {
      const res = await $api(`/contratos/get/${form.value.id}`);
      if (props.contratoData) {
        Object.assign(props.contratoData, res);
      }
      pagamentos.value = res.pagamentos || [];
    } catch (err) {
      console.error("Erro ao recarregar contrato:", err);
    }
  }
  emit("contratoSaved");
};

const calcularPeriodo = () => {
  if (
    !form.value.periodo_type ||
    !form.value.periodo ||
    !form.value.inicio_data
  )
    return "";
  let inicio = moment(form.value.inicio_data);
  switch (form.value.periodo_type) {
    case "Mensal":
      return inicio.add(form.value.periodo, "months").format("DD/MM/YYYY");
    case "Trimestral":
      return inicio.add(form.value.periodo * 3, "months").format("DD/MM/YYYY");
    case "Semestral":
      return inicio.add(form.value.periodo * 6, "months").format("DD/MM/YYYY");
    case "Anual":
      return inicio.add(form.value.periodo, "years").format("DD/MM/YYYY");
  }
  return "";
};
</script>

<template>
  <VDialog
    :modelValue="props.isDrawerOpen"
    @update:modelValue="handleDrawer"
    max-width="1000"
    persistent
  >
    <VCard v-if="form && props.isDrawerOpen">
      <VCardText class="pa-4">
        <AppDrawerHeaderSection
          customClass="px-0 pb-0 pt-3"
          :title="form?.id ? 'Editar Contrato' : 'Novo Contrato'"
          @cancel="closeDrawer"
        />

        <VTabs v-model="currentTab" class="mt-2 mb-4">
          <VTab :value="0">Dados</VTab>
          <VTab :value="1">Conteúdo</VTab>
          <VTab :value="2" :disabled="!form.id">Assinaturas</VTab>
          <VTab :value="3" :disabled="!form.id">Cobranças</VTab>
          <VTab :value="4" :disabled="!form.id">Painel do Cliente</VTab>
        </VTabs>

        <VWindow v-model="currentTab">
          <!-- ABA DADOS -->
          <VWindowItem :value="0">
            <VRow>
              <VCol cols="12" md="6">
                <AppAutocomplete
                  v-model="form.cli_id"
                  v-model:search="clienteSearch"
                  :items="clientes"
                  :loading="loadingClientes"
                  label="Cliente"
                  placeholder="Buscar cliente..."
                  no-data-text="Nenhum cliente encontrado"
                  clearable
                />
              </VCol>

              <VCol cols="12" md="6">
                <AppTextField
                  v-model="form.numero"
                  label="Número do Contrato"
                  placeholder="Número do Contrato"
                />
              </VCol>

              <VCol cols="12" md="4">
                <AppTextField
                  v-model="form.inicio_data"
                  label="Data de Início"
                  type="date"
                />
              </VCol>

              <VCol cols="12" md="4">
                <AppTextField
                  v-model="form.periodo"
                  label="Período"
                  placeholder="Período"
                  type="number"
                />
              </VCol>

              <VCol cols="12" md="4">
                <AppSelect
                  v-model="form.periodo_type"
                  :items="['Mensal', 'Trimestral', 'Semestral', 'Anual']"
                  label="Tipo de Período"
                  placeholder="Tipo de Período"
                  clearable
                />
              </VCol>

              <VCol cols="12" class="py-0" v-if="calcularPeriodo()">
                <p class="text-sm mb-0">
                  Fim do Contrato: <strong>{{ calcularPeriodo() }}</strong>
                </p>
              </VCol>

              <VCol cols="12" md="6">
                <Dinheiro v-model="form.valor" label="Valor do Contrato" />
              </VCol>

              <VCol cols="12" md="6">
                <AppSelect
                  v-model="form.status"
                  :items="[
                    { title: 'Gerado', value: 'gerado' },
                    { title: 'Assinado Empresa', value: 'assinado_empresa' },
                    { title: 'Assinado Cliente', value: 'assinado_cliente' },
                    { title: 'Ativo', value: 'ativo' },
                    { title: 'Cancelado', value: 'cancelado' },
                  ]"
                  label="Status"
                  placeholder="Status"
                />
              </VCol>

              <VCol cols="12">
                <VSwitch
                  v-model="form.ativo"
                  :true-value="1"
                  :false-value="0"
                  :label="form.ativo ? 'Contrato Ativo' : 'Contrato Inativo'"
                />
              </VCol>

              <VCol cols="12">
                <AppTextarea
                  v-model="form.obs"
                  label="Observações"
                  placeholder="Observações"
                  rows="3"
                  auto-grow
                />
              </VCol>
            </VRow>
          </VWindowItem>

          <!-- ABA CONTEÚDO -->
          <VWindowItem :value="1">
            <!-- Barra de ações do PDF (fixa no topo) -->
            <VCard variant="tonal" color="primary" class="mb-4 pa-3">
              <div class="d-flex flex-wrap align-center gap-2">
                <VBtn
                  v-if="conteudoMode === 'editor'"
                  color="primary"
                  @click="gerarPdf"
                  :loading="loadingPdf"
                  :disabled="!form.id"
                  size="small"
                >
                  <VIcon icon="tabler-file-type-pdf" class="mr-2" />
                  Gerar PDF
                </VBtn>
                <VBtn
                  v-if="pdfUrl"
                  color="success"
                  :href="pdfUrl"
                  target="_blank"
                  size="small"
                >
                  <VIcon icon="tabler-external-link" class="mr-2" />
                  Visualizar PDF
                </VBtn>
                <VSpacer />
                <p v-if="!form.id" class="text-caption text-warning mb-0">
                  Salve o contrato antes de gerar o PDF.
                </p>
              </div>
            </VCard>

            <p class="text-body-2 text-disabled mb-2">Modo de conteúdo</p>

            <div class="d-flex gap-3 mb-4">
              <VBtn
                :color="conteudoMode === 'editor' ? 'primary' : 'default'"
                :variant="conteudoMode === 'editor' ? 'elevated' : 'tonal'"
                @click="conteudoMode = 'editor'"
                size="small"
              >
                <VIcon icon="tabler-writing" class="mr-2" />
                Editor de Texto
              </VBtn>
              <VBtn
                :color="conteudoMode === 'upload' ? 'primary' : 'default'"
                :variant="conteudoMode === 'upload' ? 'elevated' : 'tonal'"
                @click="conteudoMode = 'upload'"
                size="small"
              >
                <VIcon icon="tabler-upload" class="mr-2" />
                Upload PDF
              </VBtn>
            </div>

            <div v-if="conteudoMode === 'editor'">
              <div class="d-flex align-center justify-space-between mb-2">
                <p class="text-body-2 mb-0">Conteúdo do Contrato</p>
                <VBtn
                  variant="tonal"
                  color="info"
                  size="small"
                  @click="viewImportarModeloDialog = true"
                >
                  <VIcon icon="tabler-file-import" class="mr-2" />
                  Importar Modelo
                </VBtn>
              </div>
              <QuillEditor
                v-model:content="form.conteudo_html"
                theme="snow"
                :toolbar="toolbarOptions"
                class="inputQuill"
                contentType="html"
                placeholder="Escreva o conteúdo do contrato aqui..."
              />
            </div>

            <div v-else>
              <VFileInput
                v-model="uploadPdfFile"
                label="Selecionar PDF"
                accept=".pdf"
                prepend-icon="tabler-upload"
              />

              <VBtn
                color="primary"
                class="mt-3"
                @click="uploadPdf"
                :loading="loadingPdf"
                :disabled="!form.id"
                size="small"
                variant="tonal"
              >
                <VIcon icon="tabler-upload" class="mr-2" />
                Enviar PDF
              </VBtn>

              <p v-if="!form.id" class="text-caption text-warning mt-1">
                Salve o contrato antes de fazer upload.
              </p>
            </div>
          </VWindowItem>

          <!-- ABA ASSINATURAS -->
          <VWindowItem :value="2">
            <VRow>
              <VCol cols="12" md="6">
                <VCard
                  variant="outlined"
                  class="pa-4"
                  :color="contratoData?.assinatura_empresa ? 'success' : ''"
                >
                  <h6 class="text-subtitle-1 font-weight-bold mb-3">
                    <VIcon icon="tabler-building" class="mr-1" />
                    Assinatura da Empresa
                  </h6>

                  <div v-if="contratoData?.assinatura_empresa">
                    <VChip color="success" size="small" label class="mb-2">
                      <VIcon icon="tabler-check" size="16" class="mr-1" />
                      Assinado
                    </VChip>
                    <p class="text-body-2 text-medium-emphasis mb-0">
                      Por: {{ contratoData.assinatura_empresa.assinado_por }}
                    </p>
                    <p class="text-body-2 text-medium-emphasis mb-0">
                      Em: {{ contratoData.assinatura_empresa.assinado_em }}
                    </p>
                  </div>

                  <div v-else>
                    <p class="text-body-2 text-medium-emphasis mb-3">
                      Ainda não assinado pela empresa.
                    </p>
                    <VBtn
                      color="primary"
                      @click="viewAssinaturaDialog = true"
                      :disabled="!pdfUrl"
                      size="small"
                      variant="tonal"
                    >
                      <VIcon icon="tabler-pencil" class="mr-2" />
                      Assinar
                    </VBtn>
                    <p v-if="!pdfUrl" class="text-caption text-error mt-1">
                      Gere ou envie um PDF primeiro.
                    </p>
                  </div>
                </VCard>
              </VCol>

              <VCol cols="12" md="6">
                <VCard
                  variant="outlined"
                  class="pa-4"
                  :color="contratoData?.assinatura_cliente ? 'success' : ''"
                >
                  <h6 class="text-subtitle-1 font-weight-bold mb-3">
                    <VIcon icon="tabler-user" class="mr-1" />
                    Assinatura do Cliente
                  </h6>

                  <div v-if="contratoData?.assinatura_cliente">
                    <VChip color="success" size="small" label class="mb-2">
                      <VIcon icon="tabler-check" size="16" class="mr-1" />
                      Assinado
                    </VChip>
                    <p class="text-body-2 text-medium-emphasis mb-0">
                      Em: {{ contratoData.assinatura_cliente.assinado_em }}
                    </p>
                  </div>

                  <div v-else>
                    <p class="text-body-2 text-medium-emphasis mb-3">
                      Gere um link para o cliente assinar remotamente.
                    </p>
                    <VBtn
                      color="primary"
                      @click="gerarLinkAssinatura"
                      :disabled="!pdfUrl"
                      size="small"
                      variant="tonal"
                    >
                      <VIcon icon="tabler-link" class="mr-2" />
                      Gerar Link
                    </VBtn>
                    <p v-if="!pdfUrl" class="text-caption text-error mt-1">
                      Gere ou envie um PDF primeiro.
                    </p>

                    <div v-if="linkAssinatura" class="mt-3">
                      <AppTextField
                        :model-value="linkAssinatura"
                        readonly
                        label="Link de Assinatura"
                      />
                      <VBtn
                        color="primary"
                        @click="copiarLink"
                        size="small"
                        variant="tonal"
                        class="mt-2"
                      >
                        <VIcon icon="tabler-copy" class="mr-2" />
                        Copiar Link
                      </VBtn>
                    </div>
                  </div>
                </VCard>
              </VCol>
            </VRow>
          </VWindowItem>

          <!-- ABA COBRANÇAS -->
          <VWindowItem :value="3">
            <!-- Seção: Assinatura Recorrente -->
            <VCard variant="outlined" class="mb-4 pa-4">
              <div class="d-flex align-center justify-space-between mb-3">
                <h6 class="text-subtitle-1 font-weight-bold">
                  <VIcon icon="tabler-repeat" class="mr-1" />
                  Assinatura Recorrente
                </h6>
                <VBtn
                  v-if="!assinaturaRecorrente"
                  color="primary"
                  size="small"
                  variant="tonal"
                  @click="viewAssinaturaRecorrenteDialog = true"
                >
                  <VIcon icon="tabler-plus" class="mr-2" />
                  Criar Assinatura
                </VBtn>
              </div>

              <div v-if="loadingAssinatura" class="text-center py-4">
                <VProgressCircular indeterminate size="24" />
              </div>

              <div v-else-if="assinaturaRecorrente">
                <VRow dense>
                  <VCol cols="6" md="3">
                    <p class="text-caption text-disabled mb-0">Status</p>
                    <VChip
                      :color="
                        getAssinaturaStatusColor(assinaturaRecorrente.status)
                      "
                      size="small"
                      label
                    >
                      {{ assinaturaRecorrente.status }}
                    </VChip>
                  </VCol>
                  <VCol cols="6" md="3">
                    <p class="text-caption text-disabled mb-0">Valor</p>
                    <p class="font-weight-medium mb-0">
                      {{ formatValor(assinaturaRecorrente.valor) }}
                    </p>
                  </VCol>
                  <VCol cols="6" md="3">
                    <p class="text-caption text-disabled mb-0">Ciclo</p>
                    <p class="mb-0">
                      {{ getCicloLabel(assinaturaRecorrente.ciclo) }}
                    </p>
                  </VCol>
                  <VCol cols="6" md="3">
                    <p class="text-caption text-disabled mb-0">
                      Próx. Vencimento
                    </p>
                    <p class="mb-0">
                      {{
                        assinaturaRecorrente.next_due_date
                          ? moment(assinaturaRecorrente.next_due_date).format(
                              "DD/MM/YYYY"
                            )
                          : "-"
                      }}
                    </p>
                  </VCol>
                </VRow>
                <div
                  v-if="assinaturaRecorrente.credit_card_last_digits"
                  class="mt-2"
                >
                  <p class="text-caption text-disabled mb-0">Cartão</p>
                  <p class="mb-0">
                    {{ assinaturaRecorrente.credit_card_brand }} ****
                    {{ assinaturaRecorrente.credit_card_last_digits }}
                  </p>
                </div>
                <VBtn
                  color="error"
                  size="small"
                  variant="tonal"
                  class="mt-3"
                  @click="cancelarAssinatura"
                >
                  <VIcon icon="tabler-x" class="mr-1" />
                  Cancelar Assinatura
                </VBtn>
              </div>

              <div v-else class="text-center py-3">
                <p class="text-body-2 text-medium-emphasis mb-0">
                  Nenhuma assinatura recorrente ativa.
                </p>
              </div>
            </VCard>

            <!-- Seção: Cobranças Avulsas -->
            <div class="d-flex align-center justify-space-between mb-4">
              <h6 class="text-subtitle-1 font-weight-bold">
                Cobranças Avulsas
              </h6>
              <VBtn
                color="primary"
                size="small"
                variant="tonal"
                @click="viewCobrancaDialog = true"
              >
                <VIcon icon="tabler-plus" class="mr-2" />
                Nova Cobrança
              </VBtn>
            </div>

            <div v-if="pagamentos.length === 0" class="text-center py-6">
              <VIcon
                icon="tabler-receipt-off"
                size="48"
                color="disabled"
                class="mb-2"
              />
              <p class="text-body-2 text-medium-emphasis">
                Nenhuma cobrança registrada.
              </p>
            </div>

            <VTable v-else density="compact" class="text-no-wrap">
              <thead>
                <tr>
                  <th>Valor</th>
                  <th>Vencimento</th>
                  <th>Pagamento</th>
                  <th>Status</th>
                  <th>Forma</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="pag in pagamentos" :key="pag.id">
                  <td>{{ formatValor(pag.valor) }}</td>
                  <td>
                    {{
                      pag.data_vencimento
                        ? moment(pag.data_vencimento).format("DD/MM/YYYY")
                        : "-"
                    }}
                  </td>
                  <td>
                    {{
                      pag.data_pagamento
                        ? moment(pag.data_pagamento).format("DD/MM/YYYY")
                        : "-"
                    }}
                  </td>
                  <td>
                    <VChip
                      :color="getStatusPagamentoColor(pag.status)"
                      size="small"
                      label
                    >
                      {{ getStatusPagamentoLabel(pag.status) }}
                    </VChip>
                  </td>
                  <td>{{ pag.forma_pagamento && pag.forma_pagamento != 'UNDEFINED' ? pag.forma_pagamento : '-' }}</td>
                  <td>
                    <div class="d-flex gap-1">
                      <IconBtn
                        v-if="pag.invoice_url"
                        variant="tonal"
                        color="primary"
                        title="Abrir link de pagamento"
                        @click="abrirInvoice(pag.invoice_url)"
                      >
                        <VIcon icon="tabler-external-link" />
                      </IconBtn>
                      <IconBtn
                        v-if="pag.invoice_url"
                        variant="tonal"
                        color="info"
                        title="Copiar link"
                        @click="copiarInvoice(pag.invoice_url)"
                      >
                        <VIcon icon="tabler-copy" />
                      </IconBtn>
                      <IconBtn
                        v-if="pag.status === 'PENDING'"
                        variant="tonal"
                        color="error"
                        title="Cancelar pagamento"
                        @click="cancelarPagamento(pag.id)"
                      >
                        <VIcon icon="tabler-x" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              </tbody>
            </VTable>
          </VWindowItem>

          <!-- ABA PAINEL DO CLIENTE -->
          <VWindowItem :value="4">
            <VRow dense>
              <VCol cols="12">
                <AppTextField
                  v-model="dashboardSenha"
                  label="Senha do Painel"
                  :type="passwordVisible ? 'text' : 'password'"
                  placeholder="Mínimo 6 caracteres"
                  :append-inner-icon="passwordVisible ? 'tabler-eye' : 'tabler-eye-off'"
                  @click:append-inner="passwordVisible = !passwordVisible"
                />
              </VCol>
              <VCol cols="12" class="d-flex align-end gap-2">
                <VBtn
                  color="secondary"
                  size="small"
                  variant="tonal"
                  @click="gerarSenhaAleatoria"
                >
                  <VIcon icon="tabler-key" class="mr-1" />
                  Gerar Senha
                </VBtn>
                <VBtn
                  color="primary"
                  size="small"
                  variant="tonal"
                  @click="salvarSenhaDashboard"
                  :loading="loadingSenhaDashboard"
                >
                  Salvar Senha
                </VBtn>
                <VBtn
                  color="info"
                  size="small"
                  variant="tonal"
                  @click="copiarLinkDashboard"
                >
                  <VIcon icon="tabler-copy" class="mr-1" />
                  Copiar Link
                </VBtn>
              </VCol>
            </VRow>
          </VWindowItem>
        </VWindow>

        <div class="linha-flex justify-end mt-4">
          <VBtn
            variant="outlined"
            color="secondary"
            rounded="pill"
            :disabled="loading"
            @click="closeDrawer"
          >
            Cancelar
          </VBtn>

          <VBtn
            color="primary"
            rounded="pill"
            :loading="loading"
            @click="salvar"
          >
            {{ form.id ? "Atualizar Contrato" : "Salvar Contrato" }}
          </VBtn>
        </div>
      </VCardText>
    </VCard>

    <NovaCobrancaDialog
      :isDrawerOpen="viewCobrancaDialog"
      @update:isDrawerOpen="viewCobrancaDialog = $event"
      :contratoId="form.id"
      @created="refreshPagamentos"
    />

    <NovaAssinaturaDialog
      :isDrawerOpen="viewAssinaturaRecorrenteDialog"
      @update:isDrawerOpen="viewAssinaturaRecorrenteDialog = $event"
      :contratoId="form.id"
      @created="onAssinaturaRecorrenteCreated"
    />

    <ContratoAssinaturaDialog
      :isDrawerOpen="viewAssinaturaDialog"
      @update:isDrawerOpen="viewAssinaturaDialog = $event"
      :contratoData="contratoData"
      @update="onAssinaturaUpdate"
    />

    <ImportarModeloDialog
      :isDrawerOpen="viewImportarModeloDialog"
      @update:isDrawerOpen="viewImportarModeloDialog = $event"
      @selected="onModeloSelected"
    />
  </VDialog>
</template>
