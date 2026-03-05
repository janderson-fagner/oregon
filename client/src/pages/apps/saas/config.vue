<script setup>
const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(false);

// Verificar permissão de admin
const userData = useCookie("userData").value;
if (userData?.role !== 'admin') {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

// Configurações
const config = ref({
  apiKey: '',
  apiUrl: 'https://api.asaas.com'
});

const apiUrlOptions = [
  { title: 'Produção', value: 'https://api.asaas.com' },
  { title: 'Sandbox (Testes)', value: 'https://sandbox.asaas.com/api' }
];

const showApiKey = ref(false);
const testingConnection = ref(false);
const connectionResult = ref(null);

// Buscar configurações
const getConfig = async () => {
  loading.value = true;

  try {
    const res = await $api('/saas/config', { method: 'GET' });

    if (res) {
      config.value.apiKey = res.apiKey || '';
      config.value.apiUrl = res.apiUrl || 'https://api.asaas.com';
    }
  } catch (error) {
    console.error('Erro ao buscar configurações:', error);
  }

  loading.value = false;
};

// Salvar configurações
const saveConfig = async () => {
  loading.value = true;

  try {
    await $api('/saas/config', {
      method: 'POST',
      body: {
        apiKey: config.value.apiKey,
        apiUrl: config.value.apiUrl
      }
    });

    setAlert('Configurações salvas com sucesso!', 'success', 'tabler-check', 3000);
    getConfig();
  } catch (error) {
    console.error('Erro ao salvar configurações:', error);
    setAlert('Erro ao salvar configurações', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Testar conexão
const testConnection = async () => {
  testingConnection.value = true;
  connectionResult.value = null;

  try {
    const res = await $api('/saas/config/test', { method: 'POST' });
    connectionResult.value = res;

    if (res.success) {
      setAlert('Conexão estabelecida com sucesso!', 'success', 'tabler-check', 3000);
    } else {
      setAlert('Falha na conexão: ' + res.error, 'error', 'tabler-x', 5000);
    }
  } catch (error) {
    connectionResult.value = { success: false, error: error.message };
    setAlert('Erro ao testar conexão', 'error', 'tabler-x', 3000);
  }

  testingConnection.value = false;
};

onMounted(() => {
  getConfig();
});
</script>

<template>
  <h2 class="text-h5 mb-0">Configurações do Asaas</h2>
  <p class="text-sm">Configure a integração com o gateway de pagamentos Asaas</p>

  <VCard :loading="loading">
    <VCardText>
      <VRow>
        <!-- API Key -->
        <VCol cols="12">
          <h3 class="text-h6 mb-2">
            <VIcon icon="tabler-key" class="mr-2" />
            Credenciais da API
          </h3>
        </VCol>

        <VCol cols="12" md="8">
          <AppTextField
            v-model="config.apiKey"
            label="API Key"
            placeholder="Insira sua API Key do Asaas"
            type="password"
          />
        </VCol>

        <VCol cols="12" md="4">
          <AppSelect
            v-model="config.apiUrl"
            label="Ambiente"
            :items="apiUrlOptions"
            item-title="title"
            item-value="value"
          />
        </VCol>

        <VCol cols="12" class="d-flex gap-3">
          <VBtn color="primary" @click="saveConfig" :loading="loading">
            <VIcon icon="tabler-device-floppy" class="mr-2" />
            Salvar Credenciais
          </VBtn>

          <VBtn
            color="info"
            variant="outlined"
            @click="testConnection"
            :loading="testingConnection"
          >
            <VIcon icon="tabler-plug-connected" class="mr-2" />
            Testar Conexão
          </VBtn>
        </VCol>

        <!-- Resultado do teste -->
        <VCol cols="12" v-if="connectionResult">
          <VAlert
            :type="connectionResult.success ? 'success' : 'error'"
            variant="tonal"
            closable
            @click:close="connectionResult = null"
          >
            <template v-if="connectionResult.success">
              Conexão estabelecida com sucesso!
            </template>
            <template v-else>
              Erro: {{ connectionResult.error }}
            </template>
          </VAlert>
        </VCol>

        <VCol cols="12">
          <VAlert type="info" variant="tonal">
            <template #prepend>
              <VIcon icon="tabler-info-circle" />
            </template>
            O webhook será configurado automaticamente ao salvar as credenciais.
            Todos os eventos de pagamento e assinatura serão recebidos pela aplicação.
          </VAlert>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>
