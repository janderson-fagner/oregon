<script setup>
import { ref } from "vue";
import VariablesSection from './VariablesSection.vue';

const props = defineProps({
  flowVariables: {
    type: Array,
    default: () => []
  },
  config: {
    type: Object,
    default: () => ({
      instructions: "",
      capabilities: {
        createAppointment: true,
        updateAppointment: true,
        cancelAppointment: true,
        searchServices: true,
        listServices: true,
        addServicesToAppointment: true,
        updateAddress: true,
        createBusiness: true,
        updateBusiness: true,
        updateClient: true,
        sendMessage: true,
        askQuestions: true,
        collectData: true
      },
      serviceSearchConfig: {
        maxResults: 10,
        includeDescription: true,
        includePrice: true,
        allowMultipleSelection: true
      },
      fallbackActions: [],
      maxAttempts: 3,
      timeoutSeconds: 300
    })
  }
});

const emit = defineEmits(["update:config"]);

// Ações disponíveis por categoria
const agendamentoActions = [
  { 
    title: "Criar Agendamento", 
    value: "createAppointment",
    description: "Permite à IA criar novos agendamentos automaticamente",
    category: "agendamento"
  },
  { 
    title: "Atualizar Agendamento", 
    value: "updateAppointment",
    description: "Permite à IA modificar agendamentos existentes",
    category: "agendamento"
  },
  { 
    title: "Cancelar Agendamento", 
    value: "cancelAppointment",
    description: "Permite à IA cancelar agendamentos",
    category: "agendamento"
  },
  { 
    title: "Atualizar Endereço", 
    value: "updateAddress",
    description: "Permite à IA atualizar endereços de agendamentos",
    category: "agendamento"
  }
];

const servicoActions = [
  { 
    title: "Adicionar Serviços", 
    value: "addServicesToAppointment",
    description: "Permite à IA adicionar serviços a agendamentos (usa serviços configurados no GPT)",
    category: "servico"
  }
];

const crmActions = [
  { 
    title: "Criar Negócio", 
    value: "createBusiness",
    description: "Permite à IA criar novos negócios no CRM",
    category: "crm"
  },
  { 
    title: "Atualizar Negócio", 
    value: "updateBusiness",
    description: "Permite à IA modificar negócios existentes",
    category: "crm"
  },
  { 
    title: "Atualizar Cliente", 
    value: "updateClient",
    description: "Permite à IA atualizar dados do cliente",
    category: "crm"
  }
];


const comunicacaoActions = [
  { 
    title: "Enviar Mensagem", 
    value: "sendMessage",
    description: "Permite à IA enviar mensagens personalizadas",
    category: "comunicacao"
  },
  { 
    title: "Fazer Perguntas", 
    value: "askQuestions",
    description: "Permite à IA fazer perguntas para coletar informações",
    category: "comunicacao"
  },
  { 
    title: "Coletar Dados", 
    value: "collectData",
    description: "Permite à IA coletar e armazenar dados do cliente",
    category: "comunicacao"
  },
  { 
    title: "Encaminhar para Atendente", 
    value: "forwardToAgent",
    description: "Permite à IA encaminhar conversa para atendimento humano quando não souber responder",
    category: "comunicacao"
  }
];

const availableActions = [
  ...agendamentoActions,
  ...servicoActions,
  ...crmActions,
  ...comunicacaoActions
];

// Ações de fallback
const fallbackOptions = [
  { title: "Transferir para Atendimento Humano", value: "transferToHuman" },
  { title: "Encerrar Conversa", value: "endConversation" },
  { title: "Repetir Pergunta", value: "repeatQuestion" },
  { title: "Oferecer Alternativas", value: "offerAlternatives" }
];

// Atualizar configuração
const updateConfig = (key, value) => {
  const newConfig = { ...props.config, [key]: value };

  // Garantir que serviceSearchConfig existe
  if (!newConfig.serviceSearchConfig) {
    newConfig.serviceSearchConfig = {
      maxResults: 10,
      includeDescription: true,
      includePrice: true,
      allowMultipleSelection: true
    };
  }

  // Garantir valores padrão
  if (typeof newConfig.serviceSearchConfig.maxResults === 'undefined') {
    newConfig.serviceSearchConfig.maxResults = 10;
  }

  if (typeof newConfig.serviceSearchConfig.includeDescription === 'undefined') {
    newConfig.serviceSearchConfig.includeDescription = true;
  }

  if (typeof newConfig.serviceSearchConfig.includePrice === 'undefined') {
    newConfig.serviceSearchConfig.includePrice = true;
  }

  if (typeof newConfig.serviceSearchConfig.allowMultipleSelection === 'undefined') {
    newConfig.serviceSearchConfig.allowMultipleSelection = true;
  }

  emit("update:config", newConfig);
};

// Atualizar capabilities
const updateCapability = (capability, value) => {
  // Garantir que capabilities existe
  const currentCapabilities = props.config.capabilities || {};
  const newCapabilities = { ...currentCapabilities, [capability]: value };
  
  const newConfig = { 
    ...props.config, 
    capabilities: newCapabilities
  };
  
  // Garantir que serviceSearchConfig existe
  if (!newConfig.serviceSearchConfig) {
    newConfig.serviceSearchConfig = {
      maxResults: 10,
      includeDescription: true,
      includePrice: true,
      allowMultipleSelection: true
    };
  }
  
  emit("update:config", newConfig);
};

// Atualizar configurações de pesquisa de serviços
const updateServiceSearchConfig = (key, value) => {
  // Garantir que serviceSearchConfig existe
  const currentServiceSearch = props.config.serviceSearchConfig || {
    maxResults: 10,
    includeDescription: true,
    includePrice: true,
    allowMultipleSelection: true
  };
  
  const newServiceSearchConfig = { ...currentServiceSearch, [key]: value };
  
  const newConfig = {
    ...props.config,
    serviceSearchConfig: newServiceSearchConfig
  };
  
  emit("update:config", newConfig);
};

// Adicionar ação de fallback
const addFallbackAction = () => {
  const newFallbacks = [...props.config.fallbackActions, ""];
  updateConfig("fallbackActions", newFallbacks);
};

// Remover ação de fallback
const removeFallbackAction = (index) => {
  const newFallbacks = [...props.config.fallbackActions];
  newFallbacks.splice(index, 1);
  updateConfig("fallbackActions", newFallbacks);
};

</script>

<template>
  <div>
    <VRow>
      <VCol cols="12">
        <h6 class="text-h6 mb-2">Ações IA Avançadas</h6>
        <p class="text-body-2 text-medium-emphasis mb-4">
          Configure como a IA deve agir de forma inteligente durante a conversa, 
          permitindo que ela execute ações automaticamente baseadas no contexto.
        </p>
        
        <!-- Alertas Informativos sobre Capacidades -->
        <VAlert type="info" variant="tonal" class="mb-4">
          <span class="text-subtitle-2 font-weight-bold d-flex align-center">
            <VIcon icon="tabler-info-circle" class="me-2" size="18" />
            O que a IA Consegue Fazer
          </span>
          <div class="text-body-2">
            <p class="mb-2">A IA é um <strong>assistente virtual completo</strong> que pode:</p>
            <ul class="mb-2">
              <li><strong>Criar e gerenciar agendamentos</strong>: Busca disponibilidades, confirma horários e cria agendamentos automaticamente</li>
              <li><strong>Gerenciar negócios no CRM</strong>: Cria, atualiza e avança negócios pelas etapas do funil de vendas</li>
              <li><strong>Atualizar dados de clientes</strong>: Coleta e atualiza informações cadastrais automaticamente</li>
              <li><strong>Consultar serviços</strong>: Conhece todos os serviços, preços e regras configurados no GPT</li>
              <li><strong>Verificar disponibilidades</strong>: Checa horários livres considerando funcionários e suas prioridades</li>
              <li><strong>Enviar mensagens de voz</strong>: Alterna entre texto e áudio para tornar o atendimento mais humano</li>
              <li><strong>Agir como vendedora</strong>: Conduz conversas para fechamento, gerencia objeções e cria urgência</li>
            </ul>
            <p class="mb-0 text-caption">
              💡 <strong>Dica</strong>: A IA usa as configurações de <em>Configurações > GPT AI</em> automaticamente, 
              incluindo serviços, disponibilidade de funcionários, datas bloqueadas e personalidade.
            </p>
          </div>
        </VAlert>
        
        <VAlert type="success" variant="tonal" class="mb-4">
          <span class="text-subtitle-2 font-weight-bold d-flex align-center">
            <VIcon icon="tabler-wand" class="me-2" size="18" />
            Visão Completa do Cliente
          </span>
          <div class="text-body-2">
            <p class="mb-0">
              A IA tem acesso a um <strong>resumo completo</strong> de cada cliente, incluindo:
              histórico de agendamentos, negócios em andamento, anotações importantes, atividades pendentes,
              tags e insights de comportamento. Isso permite um atendimento personalizado e consultivo.
            </p>
          </div>
        </VAlert>
      </VCol>

      <!-- Instruções Principais -->
      <VCol cols="12">
        <AppTextarea
          :model-value="config.instructions"
          @update:model-value="updateConfig('instructions', $event)"
          label="Instruções para a IA"
          placeholder="Descreva como a IA deve se comportar e quais ações pode executar..."
          rows="4"
          active
          auto-grow
          hint="Ex: Você é um assistente virtual especializado em agendamentos. Quando o cliente quiser marcar um horário, colete os dados necessários e crie o agendamento automaticamente."
        />
      </VCol>

      <!-- Capacidades da IA por Categoria -->
      <VCol cols="12">
        <VExpansionPanels multiple>
          <!-- Agendamentos -->
          <VExpansionPanel rounded="lg">
            <VExpansionPanelTitle>
              <div class="d-flex align-center">
                <VIcon icon="tabler-calendar" class="me-2" color="primary" />
                <span class="font-weight-medium">Agendamentos</span>
              </div>
            </VExpansionPanelTitle>
            <VExpansionPanelText>
              <VRow class="match-height mt-2">
                <VCol 
                  v-for="action in agendamentoActions" 
                  :key="action.value"
                  cols="12" 
                  md="6"
                >
                  <VCard 
                    rounded="lg"
                    variant="outlined" 
                    :class="{ 'border-primary': config.capabilities[action.value] }"
                  >
                    <VCardText class="pa-3">
                      <div class="d-flex align-center justify-space-between">
                        <div class="flex-grow-1">
                          <h6 class="text-subtitle-2 mb-1">{{ action.title }}</h6>
                          <p class="text-caption text-medium-emphasis mb-0">
                            {{ action.description }}
                          </p>
                        </div>
                        <VCheckbox
                          :model-value="config.capabilities[action.value]"
                          @update:model-value="updateCapability(action.value, $event)"
                          color="primary"
                          hide-details
                        />
                      </div>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </VExpansionPanelText>
          </VExpansionPanel>

          <!-- Serviços -->
          <VExpansionPanel rounded="lg">
            <VExpansionPanelTitle>
              <div class="d-flex align-center">
                <VIcon icon="tabler-tool" class="me-2" color="success" />
                <span class="font-weight-medium">Serviços</span>
              </div>
            </VExpansionPanelTitle>
            <VExpansionPanelText>
              <VRow class="match-height mt-2">
                <VCol 
                  v-for="action in servicoActions" 
                  :key="action.value"
                  cols="12" 
                  md="6"
                >
                  <VCard 
                    rounded="lg"
                    variant="outlined" 
                    :class="{ 'border-success': config.capabilities[action.value] }"
                  >
                    <VCardText class="pa-3">
                      <div class="d-flex align-center justify-space-between">
                        <div class="flex-grow-1">
                          <h6 class="text-subtitle-2 mb-1">{{ action.title }}</h6>
                          <p class="text-caption text-medium-emphasis mb-0">
                            {{ action.description }}
                          </p>
                        </div>
                        <VCheckbox
                          :model-value="config.capabilities[action.value]"
                          @update:model-value="updateCapability(action.value, $event)"
                          color="success"
                          hide-details
                        />
                      </div>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>

              <!-- Informação sobre Serviços GPT -->
              <VAlert type="info" variant="tonal" class="mt-4">
                <span class="text-subtitle-2 font-weight-bold d-flex align-center">
                  <VIcon icon="tabler-info-circle" class="me-2" size="18" />
                  Sobre os Serviços
                </span>
                <p class="text-body-2 mb-0">
                  A IA utiliza automaticamente os serviços configurados em <strong>Configurações > GPT AI > Agendamentos</strong>.
                  <br><br>
                  Não é necessário buscar ou listar serviços manualmente - a IA já conhece todos os serviços, 
                  preços e regras de precificação configuradas, incluindo imagens de exemplo para identificação visual.
                </p>
              </VAlert>
            </VExpansionPanelText>
          </VExpansionPanel>

          <!-- CRM -->
          <VExpansionPanel rounded="lg">
            <VExpansionPanelTitle>
              <div class="d-flex align-center">
                <VIcon icon="tabler-users" class="me-2" color="warning" />
                <span class="font-weight-medium">CRM</span>
              </div>
            </VExpansionPanelTitle>
            <VExpansionPanelText>
              <VRow class="match-height mt-2">
                <VCol 
                  v-for="action in crmActions" 
                  :key="action.value"
                  cols="12" 
                  md="6"
                >
                  <VCard 
                    rounded="lg"
                    variant="outlined" 
                    :class="{ 'border-warning': config.capabilities[action.value] }"
                  >
                    <VCardText class="pa-3">
                      <div class="d-flex align-center justify-space-between">
                        <div class="flex-grow-1">
                          <h6 class="text-subtitle-2 mb-1">{{ action.title }}</h6>
                          <p class="text-caption text-medium-emphasis mb-0">
                            {{ action.description }}
                          </p>
                        </div>
                        <VCheckbox
                          :model-value="config.capabilities[action.value]"
                          @update:model-value="updateCapability(action.value, $event)"
                          color="warning"
                          hide-details
                        />
                      </div>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </VExpansionPanelText>
          </VExpansionPanel>

          <!-- Comunicação -->
          <VExpansionPanel rounded="lg">
            <VExpansionPanelTitle>
              <div class="d-flex align-center">
                <VIcon icon="tabler-message" class="me-2" color="info" />
                <span class="font-weight-medium">Comunicação</span>
              </div>
            </VExpansionPanelTitle>
            <VExpansionPanelText>
              <VRow class="match-height mt-2">
                <VCol 
                  v-for="action in comunicacaoActions" 
                  :key="action.value"
                  cols="12" 
                  md="6"
                >
                  <VCard 
                    rounded="lg"
                    variant="outlined" 
                    :class="{ 'border-info': config.capabilities[action.value] }"
                  >
                    <VCardText class="pa-3">
                      <div class="d-flex align-center justify-space-between">
                        <div class="flex-grow-1">
                          <h6 class="text-subtitle-2 mb-1">{{ action.title }}</h6>
                          <p class="text-caption text-medium-emphasis mb-0">
                            {{ action.description }}
                          </p>
                        </div>
                        <VCheckbox
                          :model-value="config.capabilities[action.value]"
                          @update:model-value="updateCapability(action.value, $event)"
                          color="info"
                          hide-details
                        />
                      </div>
                    </VCardText>
                  </VCard>
                </VCol>
              </VRow>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </VCol>

      <!-- Configurações Avançadas -->
      <VCol cols="12" md="6">
        <AppTextField
          :model-value="config.maxAttempts"
          @update:model-value="updateConfig('maxAttempts', $event)"
          type="number"
          label="Máximo de Tentativas"
          placeholder="3"
          hint="Número máximo de tentativas para completar uma ação"
        />
      </VCol>

      <VCol cols="12" md="6">
        <AppTextField
          :model-value="config.timeoutSeconds"
          @update:model-value="updateConfig('timeoutSeconds', $event)"
          type="number"
          label="Timeout (segundos)"
          placeholder="300"
          hint="Tempo limite para execução de ações"
        />
      </VCol>

      <!-- Ações de Fallback -->
      <VCol cols="12">
        <VDivider class="my-4" />
        <h6 class="text-subtitle-1 mb-2">Ações de Fallback</h6>
        <p class="text-caption text-medium-emphasis mb-3">
          O que fazer quando a IA não conseguir executar uma ação ou o cliente não cooperar
        </p>
        
        <VAlert type="warning" variant="tonal" class="mb-3">
          <span class="text-subtitle-2 font-weight-bold d-flex align-center">
            <VIcon icon="tabler-alert-triangle" class="me-2" size="18" />
            Fallback Recomendado
          </span>
          <p class="text-body-2 mb-0">
            O fallback padrão é <strong>"Aguardar Atendimento Humano"</strong>, que coloca o cliente 
            em uma fila para ser atendido por um humano quando a IA não consegue resolver. 
            Isso garante que nenhum cliente fique sem resposta.
          </p>
        </VAlert>
        
        <div v-for="(action, index) in config.fallbackActions" :key="index" class="mb-3">
          <VRow>
            <VCol cols="10">
              <AppSelect
                :model-value="action"
                @update:model-value="(value) => {
                  const newActions = [...config.fallbackActions];
                  newActions[index] = value;
                  updateConfig('fallbackActions', newActions);
                }"
                :items="fallbackOptions"
                label="Ação de Fallback"
                placeholder="Selecione uma ação"
              />
            </VCol>
            <VCol cols="2" class="d-flex align-center">
              <VBtn
                @click="removeFallbackAction(index)"
                icon="tabler-trash"
                variant="text"
                color="error"
                size="small"
              />
            </VCol>
          </VRow>
        </div>

        <VBtn
          @click="addFallbackAction"
          variant="outlined"
          color="primary"
          size="small"
          prepend-icon="tabler-plus"
        >
          Adicionar Ação de Fallback
        </VBtn>
      </VCol>
    </VRow>

    <!-- Configurações Globais -->
    <VDivider class="my-4" />
    <VAlert type="info" variant="tonal" class="mb-4">
      <span class="text-subtitle-2 font-weight-bold d-flex align-center">
        <VIcon icon="tabler-settings" class="me-2" size="18" />
        Configurações Globais de IA
      </span>
      <p class="text-caption mb-0">
        A IA usará as configurações definidas em <strong>Configurações > GPT AI</strong>:
        <br>• Serviços e regras de precificação
        <br>• Disponibilidade de funcionários
        <br>• Datas bloqueadas (feriados)
        <br>• Comportamento e personificação
        <br><br>
        Estas configurações globais serão aplicadas automaticamente em todas as ações.
      </p>
    </VAlert>

    <!-- Variáveis Disponíveis -->
    <VariablesSection :flow-variables="props.flowVariables || []" />

    <!-- Exemplos de Instruções -->
    <VExpansionPanels>
      <VExpansionPanel rounded="lg">
        <VExpansionPanelTitle>
          <div class="d-flex align-center">
            <VIcon icon="tabler-bulb" class="me-2" color="warning" />
            <span class="font-weight-medium">Exemplos de Instruções</span>
          </div>
        </VExpansionPanelTitle>
        <VExpansionPanelText>
          <VAlert type="success" variant="tonal" class="mb-3">
            <span class="text-subtitle-2 font-weight-bold d-flex align-center">
              <VIcon icon="tabler-calendar" class="me-2" size="18" />
              Exemplo 1: Agendamento Completo com Serviços
            </span>
            <p class="text-body-2 mb-0">
              "Você é um assistente virtual especializado em agendamentos de serviços. 
              Quando o cliente quiser marcar um horário, siga este fluxo:
              <br><br>
              1. Pergunte qual serviço ele deseja (use a função de pesquisar serviços)
              <br>
              2. Apresente as opções disponíveis com preços
              <br>
              3. Colete a data e horário preferidos
              <br>
              4. Confirme o endereço (use {{cliente_endereco}} ou peça um novo)
              <br>
              5. Confirme todos os dados antes de criar o agendamento
              <br>
              6. Após criar, envie a confirmação com todos os detalhes
              <br><br>
              Se o cliente quiser adicionar mais serviços, use a função de adicionar serviços ao agendamento."
            </p>
          </VAlert>

          <VAlert type="info" variant="tonal" class="mb-3">
            <span class="text-subtitle-2 font-weight-bold d-flex align-center">
              <VIcon icon="tabler-edit" class="me-2" size="18" />
              Exemplo 2: Atualização de Agendamento
            </span>
            <p class="text-body-2 mb-0">
              "Você pode ajudar clientes a remarcar ou modificar agendamentos. 
              Quando o cliente pedir para remarcar:
              <br><br>
              1. Identifique o agendamento usando {{agendamento_id}}
              <br>
              2. Pergunte o que ele deseja alterar (data, horário, serviços)
              <br>
              3. Confirme as alterações antes de atualizar
              <br>
              4. Envie a confirmação da remarcação
              <br><br>
              Sempre seja claro sobre quais dados serão alterados."
            </p>
          </VAlert>

          <VAlert type="warning" variant="tonal">
            <span class="text-subtitle-2 font-weight-bold d-flex align-center">
              <VIcon icon="tabler-search" class="me-2" size="18" />
              Exemplo 3: Consulta e Recomendação de Serviços
            </span>
            <p class="text-body-2 mb-0">
              "Quando o cliente perguntar sobre serviços disponíveis:
              <br><br>
              1. Use a função de pesquisar serviços com palavras-chave
              <br>
              2. Apresente até {{config.serviceSearchConfig?.maxResults || 10}} opções
              <br>
              3. Inclua descrição e preço se configurado
              <br>
              4. Pergunte se deseja agendar algum dos serviços
              <br>
              5. Se sim, prossiga com o fluxo de agendamento
              <br><br>
              Seja consultivo e ajude o cliente a escolher o melhor serviço."
            </p>
          </VAlert>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
</template>
