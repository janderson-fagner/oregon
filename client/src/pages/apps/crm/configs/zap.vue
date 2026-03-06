<script setup>
  import QRCode from "qrcode";
  import { socket } from "@/composables/useSocket";
  const { setAlert } = useAlert();
  import { can } from "@layouts/plugins/casl";

  const router = useRouter();
  if(!can("view", "crm_chat")) {
    setAlert(
      "Você não tem permissão para acessar esta página.",
      "error",
      "tabler-alert-triangle",
      3000
    );
    router.push("/");
  }
  // Gerenciamento de múltiplos clients (carregados da API)
  const clients = ref([]);
  const tabClient = ref(null);
  const loadingClients = ref(true);

  // Ícone e descrição por tipo de client
  const clientMeta = {
    atendimento: { icon: 'tabler-message-circle', description: 'WhatsApp usado para conversas e atendimento ao cliente' },
    disparos: { icon: 'tabler-send', description: 'WhatsApp usado para envio de disparos/campanhas' },
    default: { icon: 'tabler-brand-whatsapp', description: 'WhatsApp' }
  };

  const getClientType = (id) => {
    const parts = id.split('_');
    return parts.length > 1 ? parts.slice(0, -1).join('_') : id;
  };

  // Carrega clients da API (filtrados por empresa no backend)
  const loadClients = async () => {
    try {
      const res = await $api("/zap/clients/list", { method: "GET" });
      if (!res || !Array.isArray(res)) return;

      clients.value = res.filter(c => c.id !== 'default').map(c => {
        const type = getClientType(c.id);
        const meta = clientMeta[type] || clientMeta.default;
        return {
          id: c.id,
          name: c.name || type.charAt(0).toUpperCase() + type.slice(1),
          description: meta.description,
          icon: meta.icon,
          type,
          qrCode: null,
          conectado: c.status === 'connected',
          loading: false
        };
      });

      if (clients.value.length > 0 && !tabClient.value) {
        tabClient.value = clients.value[0].id;
      }
    } catch (error) {
      console.error('Erro ao carregar clients:', error);
    } finally {
      loadingClients.value = false;
    }
  };

  // Verifica conexão de um client específico
  const checkConectado = async (client) => {
    try {
      const res = await $api("/zap/check-conn", {
        method: "GET",
        query: { type: client.type }
      });

      if (!res) return;

      client.conectado = res.status === "Conectado";
    } catch (error) {
      console.error(`Error check ${client.id}:`, error);
      client.conectado = false;
    }

    client.loading = false;
  };

  // Conecta um client específico
  const connect = async (client) => {
    client.loading = true;

    try {
      const res = await $api("/zap/connect", {
        method: "GET",
        query: { type: client.type }
      });

      if (!res) return;

      if (res.message === "Conectado") {
        client.conectado = true;
        client.qrCode = null;
        setAlert(`${client.name} conectado!`, "success", "tabler-check", 3000);
      }
    } catch (error) {
      console.error(`Error connect ${client.id}:`, error);
      setAlert(`Erro ao conectar ${client.name}`, "error", "tabler-alert-triangle", 3000);
    }

    client.loading = false;
  };

  // Desconecta um client específico
  const disconnect = async (client) => {
    client.loading = true;

    try {
      const res = await $api("/zap/disconnect", {
        method: "GET",
        query: { type: client.type }
      });

      if (!res) return;

      client.conectado = false;
      client.qrCode = null;
      setAlert(`${client.name} desconectado!`, "info", "tabler-unlink", 3000);
    } catch (error) {
      console.error(`Error disconnect ${client.id}:`, error);
      setAlert(`Erro ao desconectar ${client.name}`, "error", "tabler-alert-triangle", 3000);
    }

    client.loading = false;
  };

  // Setup dos listeners do socket para cada client
  const setupSocketListeners = () => {
    clients.value.forEach(client => {
      socket.on(`qr-${client.id}`, (qr) => {
        QRCode.toDataURL(qr, (err, url) => {
          client.qrCode = url;
          client.conectado = false;
          client.loading = false;
        });
      });

      socket.on(`autentica-zap-${client.id}`, () => {
        setAlert(`${client.name} conectado com sucesso!`, "success", "tabler-check", 5000);
        client.qrCode = null;
        client.conectado = true;
        client.loading = false;
      });

      socket.on(`autentica-error-zap-${client.id}`, () => {
        setAlert(`Erro ao conectar ${client.name}. Tente novamente!`, "error", "tabler-alert-triangle", 5000);
        client.qrCode = null;
        client.conectado = false;
        client.loading = false;
      });

      socket.on(`desconectado-zap-${client.id}`, () => {
        setAlert(`${client.name} foi desconectado!`, "error", "tabler-unlink", 5000);
        client.qrCode = null;
        client.conectado = false;
        client.loading = false;
      });
    });
  };

  // Inicialização: carrega clients da API, depois configura socket
  onMounted(async () => {
    await loadClients();
    setupSocketListeners();
  });

  onUnmounted(() => {
    clients.value.forEach(client => {
      socket.off(`qr-${client.id}`);
      socket.off(`autentica-zap-${client.id}`);
      socket.off(`autentica-error-zap-${client.id}`);
      socket.off(`desconectado-zap-${client.id}`);
    });
  });
</script>
<template>
  <div class="mb-6">
    <h2 class="text-h5 mb-0">WhatsApp</h2>
    <p class="text-sm mb-0">Configure a conexão com os WhatsApps do sistema</p>
  </div>

  <!-- Abas dos Clients -->
  <div class="d-flex flex-row flex-nowrap gap-3 mb-4">
    <VBtn
      v-for="client in clients"
      :key="client.id"
      :color="tabClient === client.id ? 'primary' : 'grey lighten-2'"
      :text-color="tabClient === client.id ? 'white' : 'black'"
      @click="tabClient = client.id"
      class="text-none"
    >
      <VIcon :icon="client.icon" class="mr-2" />
      {{ client.name }}
      <VChip
        v-if="client.conectado"
        size="x-small"
        color="success"
        class="ml-2"
      >
        <VIcon icon="tabler-check" size="12" />
      </VChip>
    </VBtn>
  </div>

  <!-- Conteúdo de cada Client -->
  <VWindow v-model="tabClient">
    <VWindowItem
      v-for="client in clients"
      :key="client.id"
      :value="client.id"
    >
      <VCard class="mb-4">
        <VCardText>
          <div class="d-flex align-center mb-0">
            <VIcon :icon="client.icon" size="32" class="mr-3" />
            <div>
              <p class="text-h6 mb-0">{{ client.name }}</p>
              <p class="text-caption mb-0">{{ client.description }}</p>
            </div>
          </div>
        </VCardText>
      </VCard>

      <VRow>
        <!-- QR Code / Status -->
        <VCol cols="12" md="6">
          <VCard>
            <VCardText>
              <div class="text-center">
                <!-- QR Code -->
                <v-fade-transition>
                  <div v-if="client.qrCode">
                    <img :src="client.qrCode" alt="QR Code" class="img-fluid" />
                    <p class="mb-0 text-caption mt-2">
                      O QR Code é atualizado a cada 30 segundos!
                    </p>
                  </div>
                </v-fade-transition>

                <!-- Loading -->
                <v-fade-transition>
                  <div
                    v-if="!client.qrCode && !client.conectado && client.loading"
                    class="d-flex align-center justify-center flex-column"
                    style="min-height: 250px"
                  >
                    <VProgressCircular indeterminate color="primary" size="64" />
                    <p class="mt-2 text-caption">Carregando conexão...</p>
                  </div>
                </v-fade-transition>

                <!-- Conectado -->
                <v-fade-transition>
                  <div
                    v-if="client.conectado"
                    class="d-flex align-center justify-center flex-column"
                    style="min-height: 250px"
                  >
                    <VIcon icon="tabler-check" size="64" color="success" />
                    <p class="mt-2 text-h6">Conectado!</p>
                  </div>
                </v-fade-transition>

                <!-- Desconectado -->
                <v-fade-transition>
                  <div
                    v-if="!client.conectado && !client.qrCode && !client.loading"
                    class="d-flex align-center justify-center flex-column"
                    style="min-height: 250px"
                  >
                    <VIcon icon="tabler-unlink" size="48" color="error" class="mb-3" />
                    <p class="mb-2 text-caption">
                      Conecte o WhatsApp para {{ client.type === 'atendimento' ? 'atender clientes' : 'enviar campanhas' }}.
                    </p>
                    <VBtn
                      @click="connect(client)"
                      color="primary"
                      :loading="client.loading"
                    >
                      <VIcon icon="tabler-link" class="mr-1" />
                      Conectar
                    </VBtn>
                  </div>
                </v-fade-transition>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <!-- Informações -->
        <VCol cols="12" md="6">
          <VCard>
            <VCardText>
              <p class="font-weight-bold mb-3">
                <VIcon icon="tabler-info-circle" class="mr-2" />
                Informações
              </p>

              <div class="mb-3">
                <p class="text-sm mb-1">Status da Conexão:</p>
                <VChip
                  :color="client.conectado ? 'success' : 'error'"
                  label
                  size="small"
                >
                  <VIcon
                    :icon="client.conectado ? 'tabler-wifi' : 'tabler-wifi-off'"
                    size="16"
                    class="mr-1"
                  />
                  {{ client.conectado ? "Conectado" : "Desconectado" }}
                </VChip>
              </div>

              <VDivider class="my-3" />

              <div v-if="client.conectado" class="mb-3">
                <VAlert
                  type="info"
                  variant="tonal"
                  density="compact"
                  icon="tabler-info-circle"
                >
                  Para desconectar, use o botão abaixo ou desconecte pelo celular.
                </VAlert>

                <VBtn
                  @click="disconnect(client)"
                  color="error"
                  variant="outlined"
                  block
                  class="mt-3"
                  :loading="client.loading"
                >
                  <VIcon icon="tabler-unlink" class="mr-1" />
                  Desconectar
                </VBtn>
              </div>

              <div v-else>
                <VAlert
                  type="warning"
                  variant="tonal"
                  density="compact"
                  icon="tabler-alert-triangle"
                >
                  Este WhatsApp está desconectado. Conecte-o para {{ client.type === 'atendimento' ? 'atender clientes' : 'enviar campanhas' }}.
                </VAlert>
              </div>
            </VCardText>
          </VCard>
        </VCol>
      </VRow>
    </VWindowItem>
  </VWindow>
</template>
