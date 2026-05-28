<script setup>
import { can } from "@layouts/plugins/casl";
const { setAlert } = useAlert();
const router = useRouter();

if (!can("view", "crm_chat")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

const loading = ref(false);
const loadingSave = ref(false);
const loadingRemove = ref(false);
const loadingStatus = ref(false);

// Campos do formulário (write-only para tokens)
const form = ref({
  phone_number_id: "",
  waba_id: "",
  graph_api_version: "v23.0",
  access_token: "",
  app_secret: "",
  verify_token: "",
});

// Status da configuração salva no backend
const config = ref(null);
const configured = ref(false);

// Resultado da verificação AO VIVO na Meta (GET /whatsapp/config/status)
const status = ref(null);

// Controle de visão: false = card de confirmação; true = formulário de edição
const editing = ref(false);

// Liberação de edição POR CAMPO (lápis). Cada campo só é enviado ao salvar se
// estiver liberado aqui — assim dá para alterar só o Verify Token, por exemplo.
const editable = reactive({
  phone_number_id: false,
  waba_id: false,
  graph_api_version: false,
  access_token: false,
  app_secret: false,
  verify_token: false,
});

// Toggle de visibilidade dos campos sensíveis
const showAccessToken = ref(false);
const showAppSecret = ref(false);
const showVerifyToken = ref(false);

// URL do webhook gerada pelo backend
const webhookUrl = computed(() => config.value?.webhook_url || "");

// Número exibido no card: prioriza o resultado ao vivo, com fallback no cache salvo
const numeroExibicao = computed(
  () =>
    status.value?.display_phone_number || config.value?.display_phone_number || ""
);

// Cor do chip de qualidade conforme classificação da Meta
const qualidadeCor = computed(() => {
  switch (status.value?.quality_rating) {
    case "GREEN":
      return "success";
    case "YELLOW":
      return "warning";
    case "RED":
      return "error";
    default:
      return "default";
  }
});

// Define o estado de liberação de TODOS os campos de uma vez
const resetEditable = (valor) => {
  editable.phone_number_id = valor;
  editable.waba_id = valor;
  editable.graph_api_version = valor;
  editable.access_token = valor;
  editable.app_secret = valor;
  editable.verify_token = valor;
};

const carregarConfig = async () => {
  loading.value = true;
  try {
    const res = await $api("/whatsapp/config", { method: "GET" });
    if (!res) return;

    config.value = res;
    configured.value = !!res.configured;

    // Preenche os campos não-sensíveis
    form.value.phone_number_id = res.phone_number_id || "";
    form.value.waba_id = res.waba_id || "";
    form.value.graph_api_version = res.graph_api_version || "v23.0";
    // access_token e app_secret não voltam do backend (write-only) — ficam em branco.
    // Verify Token é legível: repopula o valor salvo para você visualizar/copiar.
    // Se ainda não há um configurado, gera um por padrão.
    form.value.verify_token = res.verify_token || "";
    if (!form.value.verify_token) {
      form.value.verify_token = novoVerifyToken();
      showVerifyToken.value = true;
    }

    // Sem configuração ainda: abre direto no formulário com tudo liberado.
    // Já configurado: mostra o card de confirmação (campos bloqueados).
    editing.value = !configured.value;
    resetEditable(!configured.value);
  } catch (e) {
    setAlert(
      e?.response?._data?.message ||
        e?.response?._data?.error ||
        "Erro ao carregar configuração do WhatsApp.",
      "error",
      "tabler-alert-triangle",
      4000
    );
  } finally {
    loading.value = false;
  }
};

// Verifica AO VIVO se as credenciais estão conectadas na Meta
const checarStatus = async () => {
  if (!configured.value) return;
  loadingStatus.value = true;
  try {
    status.value = await $api("/whatsapp/config/status", { method: "GET" });
    // O backend cacheia o número conectado; reflete na config local
    if (status.value?.display_phone_number && config.value) {
      config.value.display_phone_number = status.value.display_phone_number;
    }
  } catch (e) {
    status.value = {
      connected: false,
      message:
        e?.response?._data?.message ||
        e?.response?._data?.error ||
        "Não foi possível verificar a conexão.",
    };
  } finally {
    loadingStatus.value = false;
  }
};

// Libera um campo específico para edição (lápis)
const liberarCampo = (campo) => {
  editable[campo] = true;
  // Segredos write-only começam vazios ao liberar (digite o novo valor)
  if (campo === "access_token") {
    form.value.access_token = "";
    showAccessToken.value = true;
  }
  if (campo === "app_secret") {
    form.value.app_secret = "";
    showAppSecret.value = true;
  }
  if (campo === "verify_token") showVerifyToken.value = true;
};

// Entra no modo de edição a partir do card (campos começam bloqueados)
const entrarEdicao = () => {
  editing.value = true;
  resetEditable(false);
};

// Sai do modo de edição sem salvar (recarrega valores originais)
const cancelarEdicao = async () => {
  await carregarConfig();
  if (configured.value) editing.value = false;
};

const salvar = async () => {
  // Monta o corpo APENAS com os campos liberados e preenchidos.
  const body = {};
  if (editable.phone_number_id && form.value.phone_number_id)
    body.phone_number_id = form.value.phone_number_id;
  if (editable.waba_id && form.value.waba_id)
    body.waba_id = form.value.waba_id;
  if (editable.graph_api_version && form.value.graph_api_version)
    body.graph_api_version = form.value.graph_api_version;
  if (editable.access_token && form.value.access_token)
    body.access_token = form.value.access_token;
  if (editable.app_secret && form.value.app_secret)
    body.app_secret = form.value.app_secret;
  if (editable.verify_token && form.value.verify_token)
    body.verify_token = form.value.verify_token;

  // Em edição de config existente, nada para enviar = nada a fazer.
  if (configured.value && Object.keys(body).length === 0) {
    setAlert(
      "Nenhuma alteração para salvar. Use o lápis para liberar um campo.",
      "info",
      "tabler-info-circle",
      3500
    );
    return;
  }

  loadingSave.value = true;
  try {
    await $api("/whatsapp/config", { method: "POST", body });

    setAlert("Configuração salva com sucesso!", "success", "tabler-check", 3000);

    // Limpa os segredos write-only após salvar
    form.value.access_token = "";
    form.value.app_secret = "";

    await carregarConfig();
    editing.value = false;
    resetEditable(false);
    await checarStatus();
  } catch (e) {
    setAlert(
      e?.response?._data?.message ||
        e?.response?._data?.error ||
        "Erro ao salvar configuração.",
      "error",
      "tabler-alert-triangle",
      4000
    );
  } finally {
    loadingSave.value = false;
  }
};

const remover = async () => {
  if (
    !confirm(
      "Tem certeza que deseja remover a configuração do WhatsApp Meta? Esta ação não pode ser desfeita."
    )
  )
    return;
  loadingRemove.value = true;
  try {
    await $api("/whatsapp/config", { method: "DELETE" });
    setAlert("Configuração removida.", "info", "tabler-trash", 3000);
    config.value = null;
    configured.value = false;
    status.value = null;
    form.value = {
      phone_number_id: "",
      waba_id: "",
      graph_api_version: "v23.0",
      access_token: "",
      app_secret: "",
      verify_token: novoVerifyToken(),
    };
    editing.value = true;
    resetEditable(true);
    showVerifyToken.value = true;
  } catch (e) {
    setAlert(
      e?.response?._data?.message ||
        e?.response?._data?.error ||
        "Erro ao remover configuração.",
      "error",
      "tabler-alert-triangle",
      4000
    );
  } finally {
    loadingRemove.value = false;
  }
};

const copiarWebhook = async () => {
  if (!webhookUrl.value) return;
  try {
    await navigator.clipboard.writeText(webhookUrl.value);
    setAlert("URL copiada!", "success", "tabler-check", 2000);
  } catch {
    setAlert("Não foi possível copiar.", "error", "tabler-alert-triangle", 2000);
  }
};

// Gera uma string aleatória segura (48 chars hex) para usar como Verify Token
const novoVerifyToken = () => {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};

// Ação do botão "Gerar": cria um novo Verify Token, libera o campo e avisa
const gerarVerifyToken = () => {
  form.value.verify_token = novoVerifyToken();
  editable.verify_token = true;
  showVerifyToken.value = true;
  setAlert(
    "Verify Token gerado. Copie/cole o mesmo valor no Meta e salve a configuração.",
    "info",
    "tabler-refresh",
    3500
  );
};

// Copia o Verify Token atual do formulário
const copiarVerifyToken = async () => {
  if (!form.value.verify_token) return;
  try {
    await navigator.clipboard.writeText(form.value.verify_token);
    setAlert("Verify Token copiado!", "success", "tabler-check", 2000);
  } catch {
    setAlert("Não foi possível copiar.", "error", "tabler-alert-triangle", 2000);
  }
};

onMounted(async () => {
  await carregarConfig();
  if (configured.value) checarStatus();
});
</script>

<template>
  <div class="mb-6">
    <h2 class="text-h5 mb-0">WhatsApp Meta (API Oficial)</h2>
    <p class="text-sm mb-0">
      Configure as credenciais da API oficial do WhatsApp Business (Meta).
      <a
        href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
        target="_blank"
        rel="noopener noreferrer"
        class="text-primary text-decoration-none font-weight-medium"
      >
        Ver tutorial de configuração
        <VIcon icon="tabler-external-link" size="14" class="ml-1" />
      </a>
    </p>
  </div>

  <div v-if="loading" class="d-flex justify-center py-8">
    <VProgressCircular indeterminate color="primary" size="48" />
  </div>

  <VRow v-else>
    <!-- ============ COLUNA ESQUERDA ============ -->
    <VCol cols="12" md="7">
      <!-- ---------- CARD DE CONFIRMAÇÃO (visão) ---------- -->
      <VCard v-if="configured && !editing">
        <VCardText>
          <div class="d-flex align-center justify-space-between mb-4">
            <p class="text-h6 mb-0">
              <VIcon icon="tabler-brand-whatsapp" class="mr-2" />
              Conexão WhatsApp
            </p>
            <VChip v-if="loadingStatus" color="default" size="small" label>
              <VProgressCircular
                indeterminate
                size="14"
                width="2"
                class="mr-2"
              />
              Verificando…
            </VChip>
            <VChip
              v-else-if="status && status.connected"
              color="success"
              size="small"
              label
            >
              <VIcon icon="tabler-circle-check-filled" size="14" class="mr-1" />
              Conectado
            </VChip>
            <VChip v-else color="error" size="small" label>
              <VIcon icon="tabler-alert-circle" size="14" class="mr-1" />
              Não conectado
            </VChip>
          </div>

          <!-- Número conectado + nome verificado -->
          <div class="d-flex align-center gap-4 mb-4">
            <VAvatar color="success" variant="tonal" size="56" rounded>
              <VIcon icon="tabler-brand-whatsapp" size="32" />
            </VAvatar>
            <div class="flex-grow-1">
              <p class="text-h5 mb-0">{{ numeroExibicao || "—" }}</p>
              <div class="d-flex align-center gap-2">
                <span class="text-sm text-disabled">
                  {{ status?.verified_name || "Número do WhatsApp Business" }}
                </span>
                <VChip
                  v-if="status && status.connected && status.quality_rating"
                  :color="qualidadeCor"
                  size="x-small"
                  label
                >
                  Qualidade: {{ status.quality_rating }}
                </VChip>
              </div>
            </div>
          </div>

          <!-- Aviso quando não conectado -->
          <VAlert
            v-if="status && !status.connected"
            type="warning"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            {{
              status.reason === "no_token"
                ? "Access Token ausente. Edite a configuração para reconectar."
                : status.message ||
                  "Não foi possível confirmar a conexão. Verifique as credenciais."
            }}
          </VAlert>

          <VDivider class="mb-3" />

          <!-- Identificadores -->
          <div class="d-flex flex-column gap-2 mb-1">
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption text-disabled">Phone Number ID</span>
              <span class="text-sm font-weight-medium">{{
                config?.phone_number_id || "—"
              }}</span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption text-disabled">WABA ID</span>
              <span class="text-sm font-weight-medium">{{
                config?.waba_id || "—"
              }}</span>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption text-disabled">Versão Graph API</span>
              <span class="text-sm font-weight-medium">{{
                config?.graph_api_version || "—"
              }}</span>
            </div>
          </div>

          <VDivider class="my-3" />

          <!-- Status dos tokens -->
          <p class="text-caption text-disabled mb-2">Credenciais:</p>
          <div class="d-flex flex-wrap gap-2">
            <VChip
              :color="config?.has_access_token ? 'success' : 'default'"
              size="x-small"
              label
            >
              <VIcon
                :icon="
                  config?.has_access_token ? 'tabler-check' : 'tabler-x'
                "
                size="12"
                class="mr-1"
              />
              Access Token
            </VChip>
            <VChip
              :color="config?.has_app_secret ? 'success' : 'default'"
              size="x-small"
              label
            >
              <VIcon
                :icon="config?.has_app_secret ? 'tabler-check' : 'tabler-x'"
                size="12"
                class="mr-1"
              />
              App Secret
            </VChip>
            <VChip
              :color="config?.has_verify_token ? 'success' : 'default'"
              size="x-small"
              label
            >
              <VIcon
                :icon="
                  config?.has_verify_token ? 'tabler-check' : 'tabler-x'
                "
                size="12"
                class="mr-1"
              />
              Verify Token
            </VChip>
          </div>

          <div
            class="d-flex flex-row align-center justify-end flex-wrap gap-3 mt-6"
          >
            <VBtn
              color="error"
              variant="outlined"
              @click="remover"
              :loading="loadingRemove"
            >
              <VIcon icon="tabler-trash" class="mr-1" />
              Remover
            </VBtn>
            <VBtn
              color="secondary"
              variant="tonal"
              @click="checarStatus"
              :loading="loadingStatus"
            >
              <VIcon icon="tabler-refresh" class="mr-1" />
              Testar conexão
            </VBtn>
            <VBtn color="primary" @click="entrarEdicao">
              <VIcon icon="tabler-pencil" class="mr-1" />
              Editar
            </VBtn>
          </div>
        </VCardText>
      </VCard>

      <!-- ---------- FORMULÁRIO DE CREDENCIAIS (edição) ---------- -->
      <VCard v-else>
        <VCardText>
          <div class="d-flex align-center justify-space-between mb-4">
            <p class="text-h6 mb-0">
              <VIcon icon="tabler-brand-meta" class="mr-2" />
              Credenciais
            </p>
            <VChip
              :color="configured ? 'success' : 'default'"
              size="small"
              label
            >
              <VIcon
                :icon="configured ? 'tabler-check' : 'tabler-settings'"
                size="14"
                class="mr-1"
              />
              {{ configured ? "Editando" : "Não configurado" }}
            </VChip>
          </div>

          <p v-if="configured" class="text-caption text-disabled mb-4">
            <VIcon icon="tabler-pencil" size="14" class="mr-1" />
            Clique no lápis de cada campo para liberá-lo. Só os campos liberados
            serão alterados — os demais permanecem como estão.
          </p>

          <VRow>
            <VCol cols="12">
              <AppTextField
                v-model="form.phone_number_id"
                label="Phone Number ID"
                autocomplete="off"
                placeholder="123456789012345"
                :readonly="!editable.phone_number_id"
                :prepend-inner-icon="'tabler-phone'"
                :append-inner-icon="
                  !editable.phone_number_id ? 'tabler-pencil' : undefined
                "
                @click:append-inner="liberarCampo('phone_number_id')"
                hint="ID numérico do telefone. Em Meta > WhatsApp > Configuração da API, no campo 'ID do número de telefone'."
                persistent-hint
              />
            </VCol>
            <VCol cols="12">
              <AppTextField
                v-model="form.waba_id"
                label="WABA ID"
                autocomplete="off"
                placeholder="123456789012345"
                :readonly="!editable.waba_id"
                :prepend-inner-icon="'tabler-building-store'"
                :append-inner-icon="
                  !editable.waba_id ? 'tabler-pencil' : undefined
                "
                @click:append-inner="liberarCampo('waba_id')"
                hint="ID da conta do WhatsApp Business. Aparece em Meta > WhatsApp > Configuração da API, em 'Identificação da conta do WhatsApp Business'."
                persistent-hint
              />
            </VCol>
            <VCol cols="12">
              <AppTextField
                v-model="form.graph_api_version"
                label="Versão Graph API"
                autocomplete="off"
                placeholder="v23.0"
                :readonly="!editable.graph_api_version"
                :prepend-inner-icon="'tabler-code'"
                :append-inner-icon="
                  !editable.graph_api_version ? 'tabler-pencil' : undefined
                "
                @click:append-inner="liberarCampo('graph_api_version')"
                hint="Versão da Graph API do Meta. Recomendado: v23.0. Mantenha o padrão se tiver dúvida."
                persistent-hint
              />
            </VCol>

            <VCol cols="12">
              <VDivider class="my-2" />
              <p class="text-caption text-disabled mb-3">
                <VIcon icon="tabler-lock" size="14" class="mr-1" />
                Tokens — libere pelo lápis para criar ou substituir. Mantidos
                como estão se não forem liberados.
              </p>
            </VCol>

            <!-- Access Token: bloqueado mostra status; liberado vira campo -->
            <VCol cols="12">
              <AppTextField
                v-if="editable.access_token"
                v-model="form.access_token"
                label="Access Token"
                autocomplete="off"
                placeholder="EAAxxxxx..."
                :type="showAccessToken ? 'text' : 'password'"
                :prepend-inner-icon="'tabler-key'"
                :append-inner-icon="
                  showAccessToken ? 'tabler-eye-off' : 'tabler-eye'
                "
                @click:append-inner="showAccessToken = !showAccessToken"
                hint="Token permanente do Usuário do Sistema. Meta Business > Configurações > Usuários do sistema > Gerar token (permissão whatsapp_business_messaging)."
                persistent-hint
              />
              <div v-else class="field-locked">
                <div>
                  <div class="text-caption text-disabled">Access Token</div>
                  <div class="text-sm d-flex align-center">
                    <VIcon
                      :icon="
                        config?.has_access_token
                          ? 'tabler-circle-check-filled'
                          : 'tabler-circle-x'
                      "
                      :color="config?.has_access_token ? 'success' : 'disabled'"
                      size="16"
                      class="mr-1"
                    />
                    {{ config?.has_access_token ? "Configurado" : "Ausente" }}
                  </div>
                </div>
                <IconBtn size="small" @click="liberarCampo('access_token')">
                  <VIcon icon="tabler-pencil" size="18" />
                  <VTooltip text="Alterar Access Token" activator="parent" />
                </IconBtn>
              </div>
            </VCol>

            <!-- App Secret: idem -->
            <VCol cols="12">
              <AppTextField
                v-if="editable.app_secret"
                v-model="form.app_secret"
                label="App Secret"
                autocomplete="off"
                placeholder="abc123..."
                :type="showAppSecret ? 'text' : 'password'"
                :prepend-inner-icon="'tabler-lock'"
                :append-inner-icon="
                  showAppSecret ? 'tabler-eye-off' : 'tabler-eye'
                "
                @click:append-inner="showAppSecret = !showAppSecret"
                hint="Chave secreta do app. Painel do app Meta > Configurações > Básico > Chave Secreta do App."
                persistent-hint
              />
              <div v-else class="field-locked">
                <div>
                  <div class="text-caption text-disabled">App Secret</div>
                  <div class="text-sm d-flex align-center">
                    <VIcon
                      :icon="
                        config?.has_app_secret
                          ? 'tabler-circle-check-filled'
                          : 'tabler-circle-x'
                      "
                      :color="config?.has_app_secret ? 'success' : 'disabled'"
                      size="16"
                      class="mr-1"
                    />
                    {{ config?.has_app_secret ? "Configurado" : "Ausente" }}
                  </div>
                </div>
                <IconBtn size="small" @click="liberarCampo('app_secret')">
                  <VIcon icon="tabler-pencil" size="18" />
                  <VTooltip text="Alterar App Secret" activator="parent" />
                </IconBtn>
              </div>
            </VCol>

            <!-- Verify Token: legível; lápis libera edição, com Gerar -->
            <VCol cols="12">
              <div class="d-flex align-center justify-space-between mb-1">
                <span class="text-caption text-disabled">Verify Token</span>
                <div class="d-flex align-center gap-1">
                  <VBtn
                    v-if="!editable.verify_token"
                    size="x-small"
                    variant="text"
                    color="primary"
                    prepend-icon="tabler-pencil"
                    @click="liberarCampo('verify_token')"
                  >
                    Alterar
                  </VBtn>
                  <VBtn
                    size="x-small"
                    variant="text"
                    color="primary"
                    prepend-icon="tabler-refresh"
                    @click="gerarVerifyToken"
                  >
                    Gerar
                  </VBtn>
                </div>
              </div>
              <AppTextField
                v-model="form.verify_token"
                autocomplete="off"
                placeholder="meu-token-secreto"
                :readonly="!editable.verify_token"
                :type="showVerifyToken ? 'text' : 'password'"
                :prepend-inner-icon="'tabler-shield-check'"
                :append-inner-icon="
                  showVerifyToken ? 'tabler-eye-off' : 'tabler-eye'
                "
                @click:append-inner="showVerifyToken = !showVerifyToken"
                hint="Crie uma string secreta sua. Use exatamente o mesmo valor aqui e no painel do Meta ao cadastrar o Webhook."
                persistent-hint
              />
            </VCol>
          </VRow>

          <div class="d-flex flex-row align-center justify-end gap-3 mt-6">
            <VBtn
              v-if="configured"
              color="secondary"
              variant="outlined"
              @click="cancelarEdicao"
            >
              Cancelar
            </VBtn>
            <VBtn color="primary" @click="salvar" :loading="loadingSave">
              <VIcon icon="tabler-device-floppy" class="mr-1" />
              {{ configured ? "Salvar alterações" : "Salvar" }}
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- ============ PAINEL LATERAL: WEBHOOK (referência) ============ -->
    <VCol cols="12" md="5">
      <VCard>
        <VCardText>
          <p class="text-h6 mb-3">
            <VIcon icon="tabler-webhook" class="mr-2" />
            Webhook
          </p>

          <VAlert
            type="info"
            variant="tonal"
            density="compact"
            icon="tabler-info-circle"
            class="mb-4"
          >
            Configure esta URL no painel do Facebook Developer como URL de
            callback do Webhook.
          </VAlert>

          <p class="text-caption text-disabled mb-1">URL do Webhook</p>
          <div
            class="webhook-code d-flex align-center justify-space-between gap-2 mb-4"
          >
            <span class="text-caption webhook-url-text">
              {{ webhookUrl || "Salve a configuração para gerar a URL" }}
            </span>
            <IconBtn v-if="webhookUrl" size="small" @click="copiarWebhook">
              <VIcon icon="tabler-copy" size="16" />
              <VTooltip text="Copiar URL" activator="parent" />
            </IconBtn>
          </div>

          <div class="d-flex align-center justify-space-between mb-1">
            <span class="text-caption text-disabled">Verify Token</span>
            <VBtn
              v-if="form.verify_token"
              size="x-small"
              variant="text"
              color="primary"
              prepend-icon="tabler-copy"
              @click="copiarVerifyToken"
            >
              Copiar
            </VBtn>
          </div>
          <AppTextField
            v-model="form.verify_token"
            autocomplete="off"
            readonly
            placeholder="meu-token-secreto"
            :type="showVerifyToken ? 'text' : 'password'"
            :prepend-inner-icon="'tabler-shield-check'"
            :append-inner-icon="
              showVerifyToken ? 'tabler-eye-off' : 'tabler-eye'
            "
            @click:append-inner="showVerifyToken = !showVerifyToken"
            hint="Mesmo valor cadastrado no painel do Meta. Altere pelo formulário de credenciais."
            persistent-hint
            class="mb-4"
          />

          <VDivider class="my-3" />

          <p class="text-caption text-disabled mb-2">
            Eventos necessários no Webhook:
          </p>
          <div class="d-flex flex-column gap-1">
            <VChip size="x-small" color="primary" variant="tonal" label>
              <VIcon icon="tabler-message" size="12" class="mr-1" />
              messages
            </VChip>
            <VChip size="x-small" color="primary" variant="tonal" label>
              <VIcon icon="tabler-checks" size="12" class="mr-1" />
              message_status_updates
            </VChip>
          </div>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style scoped>
.webhook-code {
  background: rgba(var(--v-theme-surface-variant), 0.5);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 6px;
  padding: 8px 12px;
  font-family: monospace;
  font-size: 12px;
  min-height: 40px;
}
.webhook-url-text {
  word-break: break-all;
  font-family: monospace;
  font-size: 11px;
}
.field-locked {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 6px;
  padding: 8px 12px;
}
</style>
