<script setup>
import moment from "moment";

const route = useRoute();
const contratoId = route.params.id;

// Auth state
const isLoggedIn = ref(false);
const token = ref(null);
const loginForm = ref({ numero: contratoId || "", senha: "" });
const loginLoading = ref(false);
const loginError = ref("");

// Data
const contrato = ref(null);
const pagamentos = ref([]);
const assinatura = ref(null);
const currentTab = ref(0);

// Card form
const showCartaoDialog = ref(false);
const loadingCartao = ref(false);
const cartao = ref({
  holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "",
  postalCode: "", addressNumber: "", phone: "",
});

const months = Array.from({ length: 12 }, (_, i) => ({ title: String(i + 1).padStart(2, "0"), value: String(i + 1).padStart(2, "0") }));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, i) => ({ title: String(currentYear + i), value: String(currentYear + i) }));

// Assinatura do cliente
const showAssinaturaDialog = ref(false);
const loadingAssinar = ref(false);
const signatureCanvas = ref(null);
let ctxSignature = null;
const isDrawing = ref(false);
const blobSignature = ref(null);
const assinaturaError = ref("");

function initSignatureCanvas() {
  try {
    const canvas = signatureCanvas.value;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctxSignature = canvas.getContext("2d");
    ctxSignature.scale(dpr, dpr);
    ctxSignature.lineWidth = 2;
    ctxSignature.lineCap = "round";
    ctxSignature.strokeStyle = "#000";
    ctxSignature.clearRect(0, 0, canvas.width, canvas.height);
    blobSignature.value = null;
  } catch (error) {
    console.error("Erro ao inicializar canvas:", error);
  }
}

function getSignaturePos(e) {
  const canvas = signatureCanvas.value;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches?.[0]?.clientX ?? e.clientX;
  const clientY = e.touches?.[0]?.clientY ?? e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDrawing(e) {
  isDrawing.value = true;
  const { x, y } = getSignaturePos(e);
  ctxSignature.beginPath();
  ctxSignature.moveTo(x, y);
}

function draw(e) {
  if (!isDrawing.value) return;
  const { x, y } = getSignaturePos(e);
  ctxSignature.lineTo(x, y);
  ctxSignature.stroke();
}

function stopDrawing() {
  if (!isDrawing.value || !ctxSignature) return;
  isDrawing.value = false;
  ctxSignature.closePath();
  blobSignature.value = signatureCanvas.value.toDataURL("image/png");
}

function clearSignatureCanvas() {
  if (!signatureCanvas.value) return;
  ctxSignature?.clearRect(0, 0, signatureCanvas.value.width, signatureCanvas.value.height);
  blobSignature.value = null;
}

const openAssinaturaDialog = () => {
  showAssinaturaDialog.value = true;
  assinaturaError.value = "";
  nextTick(() => initSignatureCanvas());
};

const closeAssinaturaDialog = () => {
  showAssinaturaDialog.value = false;
  clearSignatureCanvas();
  assinaturaError.value = "";
};

const enviarAssinatura = async () => {
  if (!blobSignature.value) {
    assinaturaError.value = "Desenhe sua assinatura antes de enviar!";
    return;
  }
  loadingAssinar.value = true;
  assinaturaError.value = "";
  try {
    const croppedBlob = await fetch(blobSignature.value);
    const blob = await croppedBlob.blob();
    const fileAssinatura = new File([blob], "assinatura.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("assinatura", fileAssinatura);

    await $api("/contrato-publico/dashboard/assinar", {
      method: "POST",
      ...apiHeaders(),
      body: formData,
    });

    closeAssinaturaDialog();
    loadDashboard();
  } catch (err) {
    assinaturaError.value = err?.response?._data?.message || "Erro ao assinar contrato";
  }
  loadingAssinar.value = false;
};

const apiHeaders = () => ({ headers: { Authorization: `Bearer ${token.value}` } });

const login = async () => {
  loginLoading.value = true;
  loginError.value = "";
  try {
    const res = await $api("/contrato-publico/dashboard/login", {
      method: "POST",
      body: loginForm.value,
    });
    token.value = res.token;
    contrato.value = res.contrato;
    isLoggedIn.value = true;
    loadDashboard();
  } catch (err) {
    loginError.value = err?.response?._data?.message || "Erro ao fazer login";
  }
  loginLoading.value = false;
};

const logout = () => {
  isLoggedIn.value = false;
  token.value = null;
  contrato.value = null;
  pagamentos.value = [];
  assinatura.value = null;
};

const loadDashboard = async () => {
  try {
    const [dados, pags, ass] = await Promise.all([
      $api("/contrato-publico/dashboard/dados", apiHeaders()),
      $api("/contrato-publico/dashboard/pagamentos", apiHeaders()),
      $api("/contrato-publico/dashboard/assinatura", apiHeaders()),
    ]);
    contrato.value = { ...contrato.value, ...dados };
    pagamentos.value = pags;
    assinatura.value = ass;
  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
  }
};

const formatValor = (v) => {
  if (!v) return "R$ 0,00";
  return parseFloat(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
};

const getStatusColor = (s) => {
  const m = { PENDING: "warning", RECEIVED: "success", CONFIRMED: "success", OVERDUE: "error", DELETED: "default", REFUNDED: "info", CANCELLED: "default" };
  return m[s] || "default";
};

const getStatusLabel = (s) => {
  const m = { PENDING: "Pendente", RECEIVED: "Recebido", CONFIRMED: "Confirmado", OVERDUE: "Vencido", DELETED: "Excluído", REFUNDED: "Estornado", CANCELLED: "Cancelado" };
  return m[s] || s;
};

const getCicloLabel = (c) => {
  const m = { MONTHLY: "Mensal", BIMONTHLY: "Bimestral", QUARTERLY: "Trimestral", SEMIANNUALLY: "Semestral", YEARLY: "Anual" };
  return m[c] || c;
};

const getContratoStatusColor = (s) => {
  const m = { gerado: "secondary", rascunho: "warning", assinado_empresa: "info", assinado_cliente: "info", ativo: "success", cancelado: "error" };
  return m[s] || "default";
};

const getContratoStatusLabel = (s) => {
  const m = { gerado: "Gerado", rascunho: "Rascunho", assinado_empresa: "Assinado pela Empresa", assinado_cliente: "Assinado pelo Cliente", ativo: "Ativo", cancelado: "Cancelado" };
  return m[s] || s;
};

// Verifica se o cliente pode assinar (contrato tem PDF e ainda não foi assinado pelo cliente)
const podeAssinar = computed(() => {
  if (!contrato.value) return false;
  const c = contrato.value;
  const temPdf = !!(c.pdf_gerado_url || c.conteudo_pdf_url);
  const jaAssinou = !!c.assinatura_cliente;
  return temPdf && !jaAssinou;
});

const salvarCartao = async () => {
  const c = cartao.value;
  if (!c.holderName || !c.number || !c.expiryMonth || !c.expiryYear || !c.ccv || !c.postalCode || !c.addressNumber || !c.phone) {
    loginError.value = "Preencha todos os campos do cartão";
    return;
  }
  loadingCartao.value = true;
  try {
    await $api("/contrato-publico/dashboard/cartao", {
      method: "PUT",
      ...apiHeaders(),
      body: {
        creditCard: {
          holderName: c.holderName,
          number: c.number.replace(/\s/g, ""),
          expiryMonth: c.expiryMonth,
          expiryYear: c.expiryYear,
          ccv: c.ccv,
        },
        creditCardHolderInfo: {
          name: c.holderName,
          postalCode: c.postalCode.replace(/\D/g, ""),
          addressNumber: c.addressNumber,
          phone: c.phone.replace(/\D/g, ""),
        },
      },
    });
    showCartaoDialog.value = false;
    cartao.value = { holderName: "", number: "", expiryMonth: "", expiryYear: "", ccv: "", postalCode: "", addressNumber: "", phone: "" };
    loadDashboard();
  } catch (err) {
    loginError.value = err?.response?._data?.message || "Erro ao salvar cartão";
  }
  loadingCartao.value = false;
};
</script>

<template>
  <div class="d-flex justify-center align-center" :style="!isLoggedIn ? 'min-height: 100vh' : ''" :class="!isLoggedIn ? 'bg-surface' : ''">
    <!-- LOGIN -->
    <VCard v-if="!isLoggedIn" max-width="420" class="pa-6 mx-auto" style="margin-top: 10vh">
      <div class="text-center mb-6">
        <VIcon icon="tabler-file-text" size="48" color="primary" class="mb-2" />
        <h4 class="text-h5">Painel do Contrato</h4>
        <p class="text-body-2 text-disabled">Acesse os dados do seu contrato</p>
      </div>

      <VAlert v-if="loginError" type="error" class="mb-4" closable @click:close="loginError = ''">
        {{ loginError }}
      </VAlert>

      <AppTextField v-model="loginForm.numero" label="Número do Contrato" placeholder="Número do contrato" class="mb-4" />
      <AppTextField v-model="loginForm.senha" label="Senha" type="password" placeholder="Senha de acesso" class="mb-4" @keyup.enter="login" />

      <VBtn color="primary" block :loading="loginLoading" @click="login">Entrar</VBtn>
    </VCard>

    <!-- DASHBOARD -->
    <div v-else style="max-width: 900px; width: 100%; margin: 0 auto; padding: 24px">
      <div class="d-flex align-center justify-space-between mb-6">
        <div>
          <h4 class="text-h5 mb-1">Contrato #{{ contrato?.numero || contrato?.id }}</h4>
          <p class="text-body-2 text-disabled mb-0">{{ contrato?.cli_nome }}</p>
        </div>
        <VBtn variant="tonal" color="secondary" size="small" @click="logout">
          <VIcon icon="tabler-logout" class="mr-1" /> Sair
        </VBtn>
      </div>

      <VTabs v-model="currentTab" class="mb-4">
        <VTab :value="0">Contrato</VTab>
        <VTab :value="1">Cobranças</VTab>
        <VTab :value="2" v-if="assinatura && assinatura.billing_type === 'CREDIT_CARD'">Cartão</VTab>
      </VTabs>

      <VWindow v-model="currentTab">
        <!-- TAB CONTRATO -->
        <VWindowItem :value="0">
          <VCard class="mb-4">
            <VCardText>
              <VRow dense>
                <VCol cols="6" md="3">
                  <p class="text-caption text-disabled mb-0">Status</p>
                  <VChip :color="getContratoStatusColor(contrato?.status)" size="small" label>
                    {{ getContratoStatusLabel(contrato?.status) }}
                  </VChip>
                </VCol>
                <VCol cols="6" md="3">
                  <p class="text-caption text-disabled mb-0">Valor</p>
                  <p class="font-weight-bold mb-0">{{ formatValor(contrato?.valor) }}</p>
                </VCol>
                <VCol cols="6" md="3">
                  <p class="text-caption text-disabled mb-0">Início</p>
                  <p class="mb-0">{{ contrato?.inicio_data ? moment(contrato.inicio_data).format('DD/MM/YYYY') : '-' }}</p>
                </VCol>
                <VCol cols="6" md="3">
                  <p class="text-caption text-disabled mb-0">Período</p>
                  <p class="mb-0">{{ contrato?.periodo || '-' }} {{ contrato?.periodo_type || '' }}</p>
                </VCol>
              </VRow>

              <div class="d-flex flex-wrap gap-2 mt-4">
                <VBtn v-if="contrato?.pdf_gerado_url || contrato?.conteudo_pdf_url" variant="tonal" color="primary" size="small" :href="contrato?.pdf_gerado_url || contrato?.conteudo_pdf_url" target="_blank">
                  <VIcon icon="tabler-file-type-pdf" class="mr-1" /> Visualizar PDF
                </VBtn>

                <VBtn v-if="podeAssinar" color="success" size="small" @click="openAssinaturaDialog">
                  <VIcon icon="tabler-pencil" class="mr-1" /> Assinar Contrato
                </VBtn>

                <VChip v-if="contrato?.assinatura_cliente" color="success" size="small" label>
                  <VIcon icon="tabler-check" size="16" class="mr-1" /> Assinado por você
                </VChip>
              </div>
            </VCardText>
          </VCard>

          <VCard v-if="assinatura">
            <VCardText>
              <h6 class="text-subtitle-1 font-weight-bold mb-3">Assinatura Recorrente</h6>
              <VRow dense>
                <VCol cols="6" md="3"><p class="text-caption text-disabled mb-0">Valor</p><p class="font-weight-medium mb-0">{{ formatValor(assinatura.valor) }}</p></VCol>
                <VCol cols="6" md="3"><p class="text-caption text-disabled mb-0">Ciclo</p><p class="mb-0">{{ getCicloLabel(assinatura.ciclo) }}</p></VCol>
                <VCol cols="6" md="3"><p class="text-caption text-disabled mb-0">Status</p><VChip :color="assinatura.status === 'ACTIVE' ? 'success' : 'warning'" size="small" label>{{ assinatura.status === 'ACTIVE' ? 'Ativa' : assinatura.status }}</VChip></VCol>
                <VCol cols="6" md="3"><p class="text-caption text-disabled mb-0">Próx. Venc.</p><p class="mb-0">{{ assinatura.next_due_date ? moment(assinatura.next_due_date).format('DD/MM/YYYY') : '-' }}</p></VCol>
              </VRow>
            </VCardText>
          </VCard>
        </VWindowItem>

        <!-- TAB COBRANÇAS -->
        <VWindowItem :value="1">
          <VCard>
            <VCardText>
              <h6 class="text-subtitle-1 font-weight-bold mb-3">Cobranças</h6>
              <div v-if="pagamentos.length === 0" class="text-center py-6">
                <VIcon icon="tabler-receipt-off" size="40" color="disabled" class="mb-2" />
                <p class="text-disabled mb-0">Nenhuma cobrança registrada.</p>
              </div>
              <VTable v-else density="compact" class="text-no-wrap">
                <thead><tr><th>Valor</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th>Link</th></tr></thead>
                <tbody>
                  <tr v-for="pag in pagamentos" :key="pag.id">
                    <td>{{ formatValor(pag.valor) }}</td>
                    <td>{{ pag.data_vencimento ? moment(pag.data_vencimento).format('DD/MM/YYYY') : '-' }}</td>
                    <td>{{ pag.data_pagamento ? moment(pag.data_pagamento).format('DD/MM/YYYY') : '-' }}</td>
                    <td><VChip :color="getStatusColor(pag.status)" size="small" label>{{ getStatusLabel(pag.status) }}</VChip></td>
                    <td><VBtn v-if="pag.invoice_url" variant="tonal" color="primary" size="x-small" :href="pag.invoice_url" target="_blank"><VIcon icon="tabler-external-link" size="16" /></VBtn></td>
                  </tr>
                </tbody>
              </VTable>
            </VCardText>
          </VCard>
        </VWindowItem>

        <!-- TAB CARTÃO -->
        <VWindowItem :value="2">
          <VCard>
            <VCardText>
              <h6 class="text-subtitle-1 font-weight-bold mb-3">Cartão de Crédito</h6>
              <div v-if="assinatura?.credit_card_last_digits" class="mb-4">
                <p class="mb-1">Cartão atual: <strong>{{ assinatura.credit_card_brand }} **** {{ assinatura.credit_card_last_digits }}</strong></p>
              </div>
              <VBtn color="primary" variant="tonal" @click="showCartaoDialog = true">
                <VIcon icon="tabler-credit-card" class="mr-1" /> Alterar Cartão
              </VBtn>
            </VCardText>
          </VCard>
        </VWindowItem>
      </VWindow>
    </div>
  </div>

  <!-- Dialog Assinatura -->
  <VDialog v-model="showAssinaturaDialog" max-width="600" persistent>
    <VCard>
      <VCardText class="pa-5">
        <AppDrawerHeaderSection title="Assinar Contrato" @cancel="closeAssinaturaDialog" />

        <VAlert v-if="assinaturaError" type="error" class="mb-4 mt-3" closable @click:close="assinaturaError = ''">
          {{ assinaturaError }}
        </VAlert>

        <p class="text-body-2 text-center mt-3 mb-3">Desenhe sua assinatura na área abaixo:</p>

        <div class="d-flex flex-column align-center">
          <canvas
            ref="signatureCanvas"
            style="width: 100%; max-width: 520px; height: 200px; touch-action: none; border: 1px solid #ccc; border-radius: 8px; background: #fafafa;"
            @mousedown="startDrawing"
            @mousemove="draw"
            @mouseup="stopDrawing"
            @mouseleave="stopDrawing"
            @touchstart.prevent="startDrawing"
            @touchmove.prevent="draw"
            @touchend.prevent="stopDrawing"
          ></canvas>
        </div>

        <div class="d-flex justify-center gap-3 mt-4">
          <VBtn variant="outlined" color="secondary" @click="clearSignatureCanvas" :disabled="loadingAssinar">
            <VIcon icon="tabler-eraser" class="mr-1" /> Limpar
          </VBtn>
          <VBtn color="success" :loading="loadingAssinar" @click="enviarAssinatura">
            <VIcon icon="tabler-check" class="mr-1" /> Assinar
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- Dialog Cartão -->
  <VDialog v-model="showCartaoDialog" max-width="550" persistent>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection title="Alterar Cartão de Crédito" @cancel="showCartaoDialog = false" />

        <VAlert v-if="loginError" type="error" class="mb-4 mt-3" closable @click:close="loginError = ''">{{ loginError }}</VAlert>

        <VRow dense class="mt-3">
          <VCol cols="12"><AppTextField v-model="cartao.holderName" label="Nome impresso no cartão" /></VCol>
          <VCol cols="12"><AppTextField v-model="cartao.number" label="Número do cartão" v-mask="['#### #### #### ####']" /></VCol>
          <VCol cols="4"><AppSelect v-model="cartao.expiryMonth" label="Mês" :items="months" /></VCol>
          <VCol cols="4"><AppSelect v-model="cartao.expiryYear" label="Ano" :items="years" /></VCol>
          <VCol cols="4"><AppTextField v-model="cartao.ccv" label="CVV" maxlength="4" v-mask="['####']" /></VCol>
          <VCol cols="6"><AppTextField v-model="cartao.postalCode" label="CEP" v-mask="['#####-###']" /></VCol>
          <VCol cols="6"><AppTextField v-model="cartao.addressNumber" label="Número" /></VCol>
          <VCol cols="12"><AppTextField v-model="cartao.phone" label="Telefone" v-mask="['(##) #####-####', '(##) ####-####']" /></VCol>
        </VRow>

        <div class="d-flex justify-end gap-2 mt-5">
          <VBtn variant="outlined" color="secondary" @click="showCartaoDialog = false">Cancelar</VBtn>
          <VBtn color="primary" :loading="loadingCartao" @click="salvarCartao">Salvar Cartão</VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
