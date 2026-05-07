<script setup>
import { ref, watch, onMounted } from "vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import { getAllVariables, copyVariableToClipboard } from "@/utils/dynamicVariables";
import VariablesSection from "./VariablesSection.vue";
import BlockInfoSection from "./BlockInfoSection.vue";

const props = defineProps({
  config: {
    type: Object,
    required: true,
  },
  flowVariables: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["update:config"]);

const localConfig = ref({
  method: props.config.method || "GET",
  url: props.config.url || "",
  headers: props.config.headers || [],
  bodyType: props.config.bodyType || "json",
  body: props.config.body || "",
  responseVariables: props.config.responseVariables || [],
  timeout: props.config.timeout || 30,
});

const variaveisDisponiveis = ref([]);
const showResponseHelp = ref(false);

// Métodos HTTP disponíveis
const httpMethods = [
  { title: "GET", value: "GET" },
  { title: "POST", value: "POST" },
  { title: "PUT", value: "PUT" },
  { title: "PATCH", value: "PATCH" },
  { title: "DELETE", value: "DELETE" },
];

// Tipos de body
const bodyTypes = [
  { title: "JSON", value: "json" },
  { title: "Form URL Encoded", value: "form" },
  { title: "Texto Puro", value: "raw" },
];

// Adicionar header
const addHeader = () => {
  localConfig.value.headers.push({ key: "", value: "" });
};

// Remover header
const removeHeader = (index) => {
  localConfig.value.headers.splice(index, 1);
};

// Adicionar variável de resposta
const addResponseVariable = () => {
  localConfig.value.responseVariables.push({
    name: "",
    path: "",
    description: "",
  });
};

// Remover variável de resposta
const removeResponseVariable = (index) => {
  localConfig.value.responseVariables.splice(index, 1);
};

// Adicionar parâmetro form
const addFormParam = () => {
  if (!Array.isArray(localConfig.value.body)) {
    localConfig.value.body = [];
  }
  localConfig.value.body.push({ key: "", value: "" });
};

// Remover parâmetro form
const removeFormParam = (index) => {
  localConfig.value.body.splice(index, 1);
};

// Copiar variável para clipboard
const copyVariable = (value) => {
  copyVariableToClipboard(value);
};

// Watch para emitir mudanças
watch(
  localConfig,
  (newVal) => {
    emit("update:config", { ...newVal });
  },
  { deep: true }
);

onMounted(async () => {
  const allVars = await getAllVariables();
  variaveisDisponiveis.value = allVars || [];

  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      method: props.config.method || "GET",
      url: props.config.url || "",
      headers: props.config.headers || [],
      bodyType: props.config.bodyType || "json",
      body: props.config.body || (props.config.bodyType === "form" ? [] : ""),
      responseVariables: props.config.responseVariables || [],
      timeout: props.config.timeout || 30,
    };
  }
});

// Watch para converter body quando trocar tipo
watch(
  () => localConfig.value.bodyType,
  (newType, oldType) => {
    if (newType === "form" && !Array.isArray(localConfig.value.body)) {
      localConfig.value.body = [];
    } else if (newType !== "form" && Array.isArray(localConfig.value.body)) {
      localConfig.value.body = "";
    }
  }
);
</script>

<template>
  <VRow>
    <!-- Título e Descrição -->
    <VCol cols="12">
      <VAlert
        color="info"
        variant="tonal"
        icon="tabler-info-circle"
        class="mb-4"
      >
        <span class="text-subtitle-2 font-weight-bold">Requisição HTTP</span>
        <div class="text-body-2">
          Use este bloco para fazer chamadas a APIs externas (serviços web). Você
          pode buscar dados, enviar informações e salvar as respostas em variáveis
          para usar no restante do fluxo.
        </div>
      </VAlert>
    </VCol>

    <!-- Método HTTP -->
    <VCol cols="12" md="6">
      <AppSelect
        v-model="localConfig.method"
        label="Método HTTP"
        :items="httpMethods"
        item-title="title"
        item-value="value"
        hint="GET busca dados, POST envia dados"
        persistent-hint
      />
    </VCol>

    <!-- Timeout -->
    <VCol cols="12" md="6">
      <AppTextField
        v-model.number="localConfig.timeout"
        label="Timeout (segundos)"
        type="number"
        min="5"
        max="300"
        hint="Tempo máximo de espera pela resposta"
        persistent-hint
      />
    </VCol>

    <!-- URL da Requisição -->
    <VCol cols="12">
      <AppTextField
        v-model="localConfig.url"
        label="URL da API"
        placeholder="https://api.exemplo.com/usuarios"
        hint="Endereço completo da API que você quer acessar"
        persistent-hint
      >
        <template #append-inner>
          <VTooltip location="top">
            <template #activator="{ props: tooltipProps }">
              <VIcon
                v-bind="tooltipProps"
                icon="tabler-help-circle"
                size="20"
                color="info"
              />
            </template>
            <div style="max-width: 300px">
              <strong>Exemplo de URL:</strong><br />
              https://api.exemplo.com/pedidos<br /><br />
              <strong>Você pode usar variáveis:</strong><br />
              https://api.exemplo.com/pedidos/<span v-pre>{{pedido_numero}}</span>
            </div>
          </VTooltip>
        </template>
      </AppTextField>
    </VCol>

    <!-- Headers Personalizados -->
    <VCol cols="12">
      <VExpansionPanels>
        <VExpansionPanel>
          <VExpansionPanelTitle>
            <div class="d-flex align-center gap-2">
              <VIcon icon="tabler-settings" size="20" />
              <span class="text-sm">Headers (Cabeçalhos HTTP)</span>
              <VChip size="x-small" color="primary">
                {{ localConfig.headers.length }}
              </VChip>
            </div>
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <VAlert
              color="info"
              variant="tonal"
              density="compact"
              icon="tabler-info-circle"
              class="mb-4"
            >
              <div class="text-caption">
                <strong>O que são Headers?</strong> São informações extras que você
                envia junto com a requisição. Exemplo comum: chaves de autenticação
                (API Key, Token).
              </div>
            </VAlert>

            <div
              v-for="(header, index) in localConfig.headers"
              :key="index"
              class="mb-3"
            >
              <VRow>
                <VCol cols="12">
                  <VTextField
                    v-model="header.key"
                    label="Nome do Header"
                    placeholder="Authorization"
                    density="compact"
                  />
                </VCol>
                <VCol cols="12" class="d-flex align-center gap-2">
                  <VTextField
                    v-model="header.value"
                    label="Valor"
                    placeholder="Bearer {{token}}"
                    density="compact"
                  />
               
                  <IconBtn
                    icon
                    size="small"
                    color="error"
                    variant="tonal"
                    @click="removeHeader(index)"
                  >
                    <VIcon icon="tabler-trash" />
                  </IconBtn>
                </VCol>
              </VRow>
            </div>

            <VBtn
              size="small"
              color="primary"
              variant="tonal"
              prepend-icon="tabler-plus"
              @click="addHeader"
            >
              Adicionar Header
            </VBtn>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCol>

    <!-- Body da Requisição (POST/PUT/PATCH) -->
    <VCol
      v-if="
        localConfig.method !== 'GET' && localConfig.method !== 'DELETE'
      "
      cols="12"
    >
      <VDivider class="my-2" />
      
      <label class="v-label text-body-2 text-high-emphasis mb-2 d-block">
        Corpo da Requisição (Body)
      </label>
      
      <VAlert
        color="info"
        variant="tonal"
        density="compact"
        icon="tabler-info-circle"
        class="mb-3"
      >
        <div class="text-caption">
          <strong>O que é o Body?</strong> São os dados que você está enviando para
          a API. Escolha o formato que a API espera receber.
        </div>
      </VAlert>

      <!-- Tipo de Body -->
      <AppSelect
        v-model="localConfig.bodyType"
        label="Formato do Body"
        :items="bodyTypes"
        item-title="title"
        item-value="value"
        class="mb-4"
      />

      <!-- Body JSON -->
      <div v-if="localConfig.bodyType === 'json'">
        <AppTextarea
          active
          v-model="localConfig.body"
          label="JSON"
          rows="8"
          auto-grow
          placeholder='{
            "nome": "{{cliente_nome}}",
            "email": "{{cliente_email}}",
            "telefone": "{{cliente_telefone}}"
          }'
          hint="Cole o JSON que a API espera. Use {{variavel}} para dados dinâmicos."
          persistent-hint
        />

        <div class="text-caption text-medium-emphasis mt-2">
          Use {{variavel}} para inserir dados dinâmicos no JSON.
        </div>
      </div>

      <!-- Body Form -->
      <div v-else-if="localConfig.bodyType === 'form'">
        <VAlert
          color="warning"
          variant="tonal"
          density="compact"
          icon="tabler-info-circle"
          class="mb-3"
        >
          <div class="text-caption">
            <strong>Form URL Encoded:</strong> Formato comum para formulários web.
            Adicione pares de chave-valor abaixo.
          </div>
        </VAlert>

        <div
          v-for="(param, index) in localConfig.body"
          :key="index"
          class="mb-3"
        >
          <VRow>
            <VCol cols="5">
              <AppTextField
                v-model="param.key"
                label="Nome do Campo"
                placeholder="nome"
                density="compact"
              />
            </VCol>
            <VCol cols="6">
              <AppTextField
                v-model="param.value"
                label="Valor"
                placeholder="{{cliente_nome}}"
                density="compact"
              />
            </VCol>
            <VCol cols="1" class="d-flex align-center">
              <VBtn
                icon
                size="small"
                color="error"
                variant="text"
                @click="removeFormParam(index)"
              >
                <VIcon icon="tabler-trash" />
              </VBtn>
            </VCol>
          </VRow>
        </div>

        <VBtn
          size="small"
          color="primary"
          variant="tonal"
          prepend-icon="tabler-plus"
          @click="addFormParam"
        >
          Adicionar Campo
        </VBtn>
      </div>

      <!-- Body Raw -->
      <div v-else>
        <AppTextarea
          v-model="localConfig.body"
          label="Texto Puro"
          rows="6"
          placeholder="Envie qualquer texto ou XML aqui"
          hint="Use para formatos personalizados como XML, CSV, etc."
          persistent-hint
        />
      </div>
    </VCol>

    <!-- Capturar Variáveis da Resposta -->
    <VCol cols="12">
      <VDivider class="my-4" />

      <div class="d-flex align-center justify-space-between mb-3">
        <div>
          <label class="v-label text-body-2 text-high-emphasis d-block">
            Salvar Dados da Resposta
          </label>
          <p class="text-caption text-medium-emphasis mb-0">
            Capture informações que a API retorna para usar no fluxo
          </p>
        </div>
        <VBtn
          size="small"
          color="info"
          variant="text"
          prepend-icon="tabler-help-circle"
          @click="showResponseHelp = !showResponseHelp"
        >
          Como usar?
        </VBtn>
      </div>

      <VExpandTransition>
        <VAlert
          v-show="showResponseHelp"
          color="info"
          variant="tonal"
          icon="tabler-lightbulb"
          class="mb-4"
        >
          <span class="text-subtitle-2 font-weight-bold">Como capturar dados da resposta?</span>
          <div class="text-body-2">
            <p class="mb-2">
              <strong>1. Path (Caminho):</strong> Indica onde está o dado na resposta
              da API.
            </p>
            <p class="mb-2">
              <strong>Exemplo de resposta da API:</strong>
            </p>
            <pre
              class="bg-surface pa-2 rounded mb-2"
              style="font-size: 11px"
            >{
  "usuario": {
    "nome": "João Silva",
    "idade": 30,
    "email": "joao@exemplo.com"
  },
  "pedidos": [
    { "numero": "001", "valor": 150.00 },
    { "numero": "002", "valor": 200.00 }
  ]
}</pre>
            <p class="mb-2">
              <strong>Paths para capturar:</strong>
            </p>
            <ul class="mb-2">
              <li><code>usuario.nome</code> → captura "João Silva"</li>
              <li><code>usuario.email</code> → captura "joao@exemplo.com"</li>
              <li><code>pedidos[0].numero</code> → captura "001"</li>
              <li><code>pedidos[1].valor</code> → captura "200.00"</li>
            </ul>
            <p class="mb-0">
              <strong>2. Nome da Variável:</strong> Como você vai usar depois no
              fluxo. Exemplo: salve <code>usuario.nome</code> como
              <code>nome_usuario</code>, depois use <code>{{nome_usuario}}</code>
              nas mensagens.
            </p>
          </div>
        </VAlert>
      </VExpandTransition>

      <div
        v-for="(rv, index) in localConfig.responseVariables"
        :key="index"
        class="mb-4"
      >
        <VCard variant="tonal">
          <VCardText>
            <VRow>
              <VCol cols="12" md="4">
                <AppTextField
                  v-model="rv.name"
                  label="Nome da Variável"
                  placeholder="nome_usuario"
                  density="compact"
                  hint="Como usar depois: {{nome_usuario}}"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="4">
                <AppTextField
                  v-model="rv.path"
                  label="Path (Caminho)"
                  placeholder="usuario.nome"
                  density="compact"
                  hint="Use pontos para acessar campos"
                  persistent-hint
                />
              </VCol>
              <VCol cols="12" md="3">
                <AppTextField
                  v-model="rv.description"
                  label="Descrição (opcional)"
                  placeholder="Nome completo do usuário"
                  density="compact"
                />
              </VCol>
              <VCol cols="12" md="1" class="d-flex align-center justify-center">
                <VBtn
                  icon
                  size="small"
                  color="error"
                  variant="text"
                  @click="removeResponseVariable(index)"
                >
                  <VIcon icon="tabler-trash" />
                </VBtn>
              </VCol>
            </VRow>
          </VCardText>
        </VCard>
      </div>

      <VBtn
        size="small"
        color="primary"
        variant="tonal"
        prepend-icon="tabler-plus"
        @click="addResponseVariable"
      >
        Adicionar Variável de Resposta
      </VBtn>
    </VCol>

    <!-- Variáveis e Info -->
    <VCol cols="12">
      <VariablesSection :flow-variables="props.flowVariables" />

      <BlockInfoSection
        :items="[
          { icon: 'tabler-world', color: 'primary', text: 'Faz chamadas a APIs externas (serviços web)' },
          { icon: 'tabler-variable', color: 'success', text: 'Você pode usar variáveis do fluxo na URL, headers e body' },
          { icon: 'tabler-download', color: 'info', text: 'Capture dados da resposta e salve como variáveis para usar depois' },
          { icon: 'tabler-clock', color: 'warning', text: 'Configure o timeout para evitar bloqueios em APIs lentas' },
        ]"
        hint="As variáveis de resposta ficam disponíveis nos blocos seguintes do fluxo."
      />
    </VCol>

    <!-- Exemplos Práticos -->
    <VCol cols="12">
      <VDivider class="my-4" />

      <VExpansionPanels>
        <VExpansionPanel>
          <VExpansionPanelTitle>
            <div class="d-flex align-center gap-2">
              <VIcon icon="tabler-bulb" size="20" color="warning" />
              <span>Exemplos Práticos</span>
            </div>
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <VTabs v-model="activeTab" class="mb-4">
              <VTab value="cep">Consultar CEP</VTab>
              <VTab value="whatsapp">Enviar WhatsApp (API Externa)</VTab>
              <VTab value="woocommerce">WooCommerce</VTab>
            </VTabs>

            <VWindow v-model="activeTab">
              <!-- Exemplo CEP -->
              <VWindowItem value="cep">
                <VAlert color="success" variant="tonal" icon="tabler-map-pin">
                  <span class="text-subtitle-2 font-weight-bold">Consultar CEP (ViaCEP)</span>
                  <div class="text-body-2">
                    <p class="mb-2">
                      <strong>URL:</strong>
                      <span v-pre>https://viacep.com.br/ws/{{cliente_cep}}/json/</span>
                    </p>
                    <p class="mb-2"><strong>Método:</strong> GET</p>
                    <p class="mb-2"><strong>Variáveis para capturar:</strong></p>
                    <ul class="mb-0">
                      <li>
                        <strong>Nome:</strong> endereco_rua,
                        <strong>Path:</strong> logradouro
                      </li>
                      <li>
                        <strong>Nome:</strong> endereco_bairro,
                        <strong>Path:</strong> bairro
                      </li>
                      <li>
                        <strong>Nome:</strong> endereco_cidade,
                        <strong>Path:</strong> localidade
                      </li>
                      <li>
                        <strong>Nome:</strong> endereco_estado,
                        <strong>Path:</strong> uf
                      </li>
                    </ul>
                  </div>
                </VAlert>
              </VWindowItem>

              <!-- Exemplo WhatsApp API -->
              <VWindowItem value="whatsapp">
                <VAlert color="success" variant="tonal" icon="tabler-brand-whatsapp">
                  <span class="text-subtitle-2 font-weight-bold">Enviar WhatsApp via API Externa</span>
                  <div class="text-body-2">
                    <p class="mb-2">
                      <strong>URL:</strong>
                      <span v-pre>https://api.seuservico.com/send</span>
                    </p>
                    <p class="mb-2"><strong>Método:</strong> POST</p>
                    <p class="mb-2"><strong>Headers:</strong></p>
                    <ul class="mb-2">
                      <li>
                        <strong>Nome:</strong> Authorization,
                        <strong>Valor:</strong> Bearer SUA_API_KEY_AQUI
                      </li>
                    </ul>
                    <p class="mb-2"><strong>Body (JSON):</strong></p>
                    <span v-pre class="bg-surface pa-2 rounded" style="font-size: 11px">{
  "phone": "{{cliente_telefone}}",
  "message": "Olá {{cliente_nome}}, seu pedido foi aprovado!"
}</span>
                  </div>
                </VAlert>
              </VWindowItem>

              <!-- Exemplo WooCommerce -->
              <VWindowItem value="woocommerce">
                <VAlert color="success" variant="tonal" icon="tabler-shopping-cart">
                  <span class="text-subtitle-2 font-weight-bold">Atualizar Pedido WooCommerce</span>
                  <div class="text-body-2">
                    <p class="mb-2">
                      <strong>URL:</strong>
                      <span v-pre>
                      https://seusite.com/wp-json/wc/v3/orders/{{pedido_id}}
                    </span>
                    </p>
                    <p class="mb-2"><strong>Método:</strong> PUT</p>
                    <p class="mb-2"><strong>Headers:</strong></p>
                    <ul class="mb-2">
                      <li>
                        <strong>Nome:</strong> Authorization,
                        <strong>Valor:</strong> Basic BASE64(consumer_key:consumer_secret)
                      </li>
                    </ul>
                    <p class="mb-2"><strong>Body (JSON):</strong></p>
                    <span v-pre class="bg-surface pa-2 rounded" style="font-size: 11px">{
  "status": "completed",
  "meta_data": [
    {
      "key": "codigo_rastreio",
      "value": "{{codigo_rastreio}}"
    }
  ]
}</span>
                  </div>
                </VAlert>
              </VWindowItem>
            </VWindow>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCol>
  </VRow>
</template>

<script>
export default {
  name: "HttpBlock",
  data() {
    return {
      activeTab: "cep",
    };
  },
};
</script>

<style scoped>
pre {
  overflow-x: auto;
  white-space: pre-wrap;
  word-wrap: break-word;
}

code {
  background-color: rgba(var(--v-theme-primary), 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: monospace;
  font-size: 0.9em;
}
</style>
