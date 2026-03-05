<script setup>
import { can } from "@layouts/plugins/casl";
import { temaAtual } from "@core/stores/config";

import Tags from "./configs/tags.vue";
import Zap from "./configs/zap.vue";
import Gemini from "./configs/gemini.vue";

const { setAlert } = useAlert();

const abasConfig = [
  {
    title: "WhatsApp",
    icon: "tabler-brand-whatsapp",
    keys: ["zap_conn"],
    view: can("view", "crm_chat"),
  },
  {
    title: "Tags",
    icon: "tabler-tags",
    keys: [],
    view: can("view", "crm_clientes"),
  },
  {
    title: "Funil de Vendas",
    icon: "tabler-filter",
    keys: ["motivos_perdas"],
    view: can("view", "crm_funil_vendas"),
  },
  {
    title: "Atendente Virtual",
    icon: "tabler-message-chatbot",
    keys: ["gemini_key", "gemini_comportamento"],
    view: can("view", "crm_chat"),
  },
];

if(!abasConfig.some((a) => a.view)) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

const tab = ref("WhatsApp");

const configs = ref([]);
const loading = ref(false);

const motivosPerdas = ref([]);

const getConfig = async () => {
  loading.value = true;
  motivosPerdas.value = [];

  try {
    const res = await $api("/config/get", {
      method: "GET",
      query: {
        types: abasConfig
        .filter((a) => a.view)
        .map((a) => a.keys).flat(),
      },
    });

    if (!res) return;

    console.log("Config:", res);
    configs.value = res;

    res
      .filter((r) => r.type === "motivos_perdas")
      .forEach((c) => {
        motivosPerdas.value.push(c.value);
      });
  } catch (error) {
    console.error("Erro ao buscar configurações:", error, error.response);
  }

  loading.value = false;
};

onMounted(() => {
  getConfig();
});

const motivoPerca = ref("");
const addMotivoPerca = () => {
  const motivo = motivoPerca.value.trim();
  if (motivo && !motivosPerdas.value.includes(motivo)) {
    motivosPerdas.value.push(motivo);
    motivoPerca.value = "";
  }
};

const updateConfig = async (config) => {
  loading.value = true;

  try {
    let data = [];
    let type_del = null;

    if (config === "motivo_perda" && can("manage", "crm_funil_vendas")) {
      data = motivosPerdas.value.map((motivo) => ({
        type: "motivos_perdas",
        value: motivo,
        multiple: true,
      }));

      type_del = data.length == 0 ? "motivos_perdas" : null;
    } else {
      return setAlert(
        "Configuração inválida",
        "error",
        "tabler-alert-circle",
        3000
      );
    }

    console.log("data to send:", data, type_del);

    const res = await $api("/config/update", {
      method: "POST",
      body: {
        data,
        type_del,
      },
    });

    if (!res) return;

    setAlert(
      "Configuração atualizada com sucesso!",
      "success",
      "tabler-check",
      3000
    );
    getConfig();
  } catch (error) {
    console.error("Erro ao atualizar configuração:", error, error.response);
  }

  loading.value = false;
};
</script>

<template>
  <h2 class="text-h5 mb-0">Configurações</h2>
  <p class="text-sm">Configure o sistema</p>

  <div class="d-flex flex-row flex-nowrap gap-3 mb-4">
    <VBtn
      v-for="(aba, index) in abasConfig.filter((a) => a.view)"
      :key="index"
      :color="tab === aba.title ? 'primary' : 'grey lighten-2'"
      :text-color="tab === aba.title ? 'white' : 'black'"
      @click="tab = aba.title"
      class="text-none"
    >
      <VIcon :icon="aba.icon" class="mr-2" />
      {{ aba.title }}
    </VBtn>
  </div>

  <VWindow v-model="tab" class="mb-4">
    <VWindowItem value="WhatsApp">
      <Zap />
    </VWindowItem>

    <VWindowItem value="Tags">
      <Tags />
    </VWindowItem>

    <VWindowItem value="Funil de Vendas">
      <h2 class="text-h6 mb-1 mt-2">
        <VIcon icon="tabler-filter" class="mr-2" />
        Configurações do Funil de Vendas
      </h2>

      <VExpansionPanels multiple class="mt-4">
        <VExpansionPanel
          class="mb-4 mt-2"
          :bg-color="temaAtual() == 'dark' ? '#3b3f59' : '#f5f5f5'"
        >
          <VExpansionPanelTitle>
            <div class="py-2">
              <p class="text-h6 mb-1 w-100">
                <VIcon icon="tabler-mood-sad-filled" class="mr-2" />
                Motivos de Perdas
              </p>
              <p class="text-sm mb-0">
                Configure os motivos de perdas que serão utilizados ao fechar um
                negócio como perdido.
              </p>
            </div>
          </VExpansionPanelTitle>

          <VExpansionPanelText>
            <VRow class="mt-4">
              <VCol cols="12" md="6" class="d-flex flex-row gap-2 align-center">
                <VTextField
                  v-model="motivoPerca"
                  placeholder="Insira o motivo de perda"
                  @keyup.enter="addMotivoPerca"
                />
                <VBtn @click="addMotivoPerca" color="primary">
                  <VIcon>tabler-plus</VIcon>
                </VBtn>
              </VCol>
              <VCol cols="12">
                <VChip
                  label
                  v-for="(motivo, index) in motivosPerdas"
                  :key="index"
                  class="me-2 mb-2"
                  color="primary"
                  variant="flat"
                  closable
                  @click:close="
                    motivosPerdas = motivosPerdas.filter((m) => m !== motivo)
                  "
                >
                  {{ motivo }}
                </VChip>
              </VCol>

              <VCol cols="12" md="4" class="d-flex align-end">
                <VBtn
                  @click="updateConfig('motivo_perda')"
                  color="primary"
                  class="w-100"
                  :loading="loading"
                >
                  Salvar motivos
                </VBtn>
              </VCol>
            </VRow>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VWindowItem>

    <VWindowItem value="Atendente Virtual">
      <Gemini :key="'gemini-config'" />
    </VWindowItem>
  </VWindow>
</template>
