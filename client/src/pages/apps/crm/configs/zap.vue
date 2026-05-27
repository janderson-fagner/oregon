<script setup>
  import { can } from "@layouts/plugins/casl";
  const { setAlert } = useAlert();
  const router = useRouter();

  if (!can("view", "crm_chat")) {
    setAlert("Você não tem permissão para acessar esta página.", "error", "tabler-alert-triangle", 3000);
    router.push("/");
  }

  const loading = ref(false);
  const loadingSave = ref(false);
  const loadingRemove = ref(false);

  // Campos do formulário (write-only para tokens)
  const form = ref({
    phone_number_id: "",
    waba_id: "",
    display_phone_number: "",
    graph_api_version: "v18.0",
    access_token: "",
    app_secret: "",
    verify_token: "",
  });

  // Status da configuração
  const config = ref(null);
  const configured = ref(false);

  // Toggle de visibilidade dos campos de senha
  const showAccessToken = ref(false);
  const showAppSecret = ref(false);
  const showVerifyToken = ref(false);

  // URL do webhook gerada pelo backend
  const webhookUrl = computed(() => config.value?.webhook_url || "");

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
      form.value.display_phone_number = res.display_phone_number || "";
      form.value.graph_api_version = res.graph_api_version || "v18.0";
      // Tokens não são devolvidos pelo backend — campos ficam em branco (write-only)
    } catch (e) {
      setAlert("Erro ao carregar configuração do WhatsApp.", "error", "tabler-alert-triangle", 4000);
    } finally {
      loading.value = false;
    }
  };

  const salvar = async () => {
    loadingSave.value = true;
    try {
      const body = {
        phone_number_id: form.value.phone_number_id,
        waba_id: form.value.waba_id,
        display_phone_number: form.value.display_phone_number,
        graph_api_version: form.value.graph_api_version,
      };
      // Envia tokens somente se preenchidos
      if (form.value.access_token) body.access_token = form.value.access_token;
      if (form.value.app_secret) body.app_secret = form.value.app_secret;
      if (form.value.verify_token) body.verify_token = form.value.verify_token;

      await $api("/whatsapp/config", { method: "POST", body });

      setAlert("Configuração salva com sucesso!", "success", "tabler-check", 3000);

      // Limpa tokens do formulário após salvar (write-only)
      form.value.access_token = "";
      form.value.app_secret = "";
      form.value.verify_token = "";

      await carregarConfig();
    } catch (e) {
      setAlert(
        e?.response?._data?.message || "Erro ao salvar configuração.",
        "error",
        "tabler-alert-triangle",
        4000
      );
    } finally {
      loadingSave.value = false;
    }
  };

  const remover = async () => {
    if (!confirm("Tem certeza que deseja remover a configuração do WhatsApp Meta? Esta ação não pode ser desfeita.")) return;
    loadingRemove.value = true;
    try {
      await $api("/whatsapp/config", { method: "DELETE" });
      setAlert("Configuração removida.", "info", "tabler-trash", 3000);
      config.value = null;
      configured.value = false;
      form.value = {
        phone_number_id: "",
        waba_id: "",
        display_phone_number: "",
        graph_api_version: "v18.0",
        access_token: "",
        app_secret: "",
        verify_token: "",
      };
    } catch (e) {
      setAlert(
        e?.response?._data?.message || "Erro ao remover configuração.",
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

  onMounted(() => {
    carregarConfig();
  });
</script>

<template>
  <div class="mb-6">
    <h2 class="text-h5 mb-0">WhatsApp Meta (API Oficial)</h2>
    <p class="text-sm mb-0">Configure as credenciais da API oficial do WhatsApp Business (Meta)</p>
  </div>

  <div v-if="loading" class="d-flex justify-center py-8">
    <VProgressCircular indeterminate color="primary" size="48" />
  </div>

  <VRow v-else>
    <!-- Formulário de credenciais -->
    <VCol cols="12" md="7">
      <VCard>
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
              <VIcon :icon="configured ? 'tabler-check' : 'tabler-settings'" size="14" class="mr-1" />
              {{ configured ? "Configurado" : "Não configurado" }}
            </VChip>
          </div>

          <VRow>
            <VCol cols="12" sm="6">
              <AppTextField
                v-model="form.phone_number_id"
                label="Phone Number ID"
                placeholder="123456789012345"
                :prepend-inner-icon="'tabler-phone'"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <AppTextField
                v-model="form.waba_id"
                label="WABA ID"
                placeholder="123456789012345"
                :prepend-inner-icon="'tabler-building-store'"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <AppTextField
                v-model="form.display_phone_number"
                label="Número exibido"
                placeholder="+55 41 99999-9999"
                :prepend-inner-icon="'tabler-device-mobile'"
              />
            </VCol>
            <VCol cols="12" sm="6">
              <AppTextField
                v-model="form.graph_api_version"
                label="Versão Graph API"
                placeholder="v18.0"
                :prepend-inner-icon="'tabler-code'"
              />
            </VCol>

            <VCol cols="12">
              <VDivider class="my-2" />
              <p class="text-caption text-disabled mb-3">
                <VIcon icon="tabler-lock" size="14" class="mr-1" />
                Tokens — preencha apenas para criar ou atualizar. Deixe em branco para manter os salvos.
              </p>
            </VCol>

            <VCol cols="12">
              <AppTextField
                v-model="form.access_token"
                label="Access Token"
                placeholder="EAAxxxxx..."
                :type="showAccessToken ? 'text' : 'password'"
                :prepend-inner-icon="'tabler-key'"
                :append-inner-icon="showAccessToken ? 'tabler-eye-off' : 'tabler-eye'"
                @click:append-inner="showAccessToken = !showAccessToken"
                :hint="configured && config?.has_access_token ? 'Token já configurado — preencha para substituir' : ''"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" sm="6">
              <AppTextField
                v-model="form.app_secret"
                label="App Secret"
                placeholder="abc123..."
                :type="showAppSecret ? 'text' : 'password'"
                :prepend-inner-icon="'tabler-lock'"
                :append-inner-icon="showAppSecret ? 'tabler-eye-off' : 'tabler-eye'"
                @click:append-inner="showAppSecret = !showAppSecret"
                :hint="configured && config?.has_app_secret ? 'Já configurado — preencha para substituir' : ''"
                persistent-hint
              />
            </VCol>
            <VCol cols="12" sm="6">
              <AppTextField
                v-model="form.verify_token"
                label="Verify Token (Webhook)"
                placeholder="meu-token-secreto"
                :type="showVerifyToken ? 'text' : 'password'"
                :prepend-inner-icon="'tabler-shield-check'"
                :append-inner-icon="showVerifyToken ? 'tabler-eye-off' : 'tabler-eye'"
                @click:append-inner="showVerifyToken = !showVerifyToken"
                :hint="configured && config?.has_verify_token ? 'Já configurado — preencha para substituir' : ''"
                persistent-hint
              />
            </VCol>
          </VRow>

          <div class="d-flex flex-row align-center justify-end gap-3 mt-6">
            <VBtn
              v-if="configured"
              color="error"
              variant="outlined"
              @click="remover"
              :loading="loadingRemove"
            >
              <VIcon icon="tabler-trash" class="mr-1" />
              Remover
            </VBtn>
            <VBtn
              color="primary"
              @click="salvar"
              :loading="loadingSave"
            >
              <VIcon icon="tabler-device-floppy" class="mr-1" />
              {{ configured ? "Atualizar" : "Salvar" }}
            </VBtn>
          </div>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Painel lateral: Webhook -->
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
            Configure esta URL no painel do Facebook Developer como URL de callback do Webhook.
          </VAlert>

          <p class="text-caption text-disabled mb-1">URL do Webhook</p>
          <div class="webhook-code d-flex align-center justify-space-between gap-2 mb-4">
            <span class="text-caption webhook-url-text">
              {{ webhookUrl || "Salve a configuração para gerar a URL" }}
            </span>
            <IconBtn
              v-if="webhookUrl"
              size="small"
              @click="copiarWebhook"
            >
              <VIcon icon="tabler-copy" size="16" />
              <VTooltip text="Copiar URL" activator="parent" />
            </IconBtn>
          </div>

          <VDivider class="my-3" />

          <p class="text-caption text-disabled mb-2">Eventos necessários no Webhook:</p>
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

          <VDivider class="my-3" />

          <p class="text-caption text-disabled mb-2">Status dos tokens:</p>
          <div class="d-flex flex-column gap-2">
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption">Access Token</span>
              <VChip
                :color="config?.has_access_token ? 'success' : 'default'"
                size="x-small"
                label
              >
                {{ config?.has_access_token ? "Configurado" : "Ausente" }}
              </VChip>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption">App Secret</span>
              <VChip
                :color="config?.has_app_secret ? 'success' : 'default'"
                size="x-small"
                label
              >
                {{ config?.has_app_secret ? "Configurado" : "Ausente" }}
              </VChip>
            </div>
            <div class="d-flex align-center justify-space-between">
              <span class="text-caption">Verify Token</span>
              <VChip
                :color="config?.has_verify_token ? 'success' : 'default'"
                size="x-small"
                label
              >
                {{ config?.has_verify_token ? "Configurado" : "Ausente" }}
              </VChip>
            </div>
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
</style>
