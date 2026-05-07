<template>
  <VRow>
    <!-- Informações Principais -->
    <VCol cols="12">
      <VAlert
        color="success"
        variant="tonal"
        icon="tabler-briefcase-plus"
        class="mb-4"
      >
        <span class="text-subtitle-2 font-weight-bold">Criar Negócio</span>
        <div class="text-body-2">
          Este bloco criará um novo negócio no funil de vendas para o cliente atual.
          Configure as informações do negócio abaixo.
        </div>
      </VAlert>
    </VCol>

    <!-- Campos Principais -->
    <VCol cols="12">
      <VCard>
        <VCardText>
          <VRow>
            <VCol cols="12">
              <AppTextField
                v-model="localConfig.titulo"
                label="Título do Negócio"
                placeholder="Ex: Venda de Produto X ou {{titulo}}"
                required
                :rules="[requiredValidator]"
                hint="Nome que identifica o negócio"
                persistent-hint
              >
                <template #append-inner>
                  <VMenu location="bottom" :close-on-content-click="false">
                    <template #activator="{ props: menuProps }">
                      <VBtn
                        icon
                        size="x-small"
                        variant="text"
                        v-bind="menuProps"
                      >
                        <VIcon icon="tabler-braces" size="20" color="primary" />
                      </VBtn>
                    </template>
                    
                    <VCard max-width="300" max-height="400" class="overflow-auto">
                      <VCardText>
                        <div class="text-caption mb-2 font-weight-bold">Variáveis Disponíveis</div>
                        <div class="d-flex flex-column gap-1">
                          <VChip
                            v-for="variable in variaveisNegocio"
                            :key="variable.value"
                            size="small"
                            :color="variable.type === 'dinamica' ? 'success' : variable.type === 'sistema' ? 'info' : 'primary'"
                            variant="tonal"
                            class="cursor-pointer"
                            @click="localConfig.titulo = (localConfig.titulo || '') + `{{${variable.value}}}`"
                          >
                            <VIcon icon="tabler-plus" size="small" class="me-1" />
                            {{ variable.title }}
                          </VChip>
                        </div>
                      </VCardText>
                    </VCard>
                  </VMenu>
                </template>
              </AppTextField>
            </VCol>
            
            <VCol cols="12">
              <AppSelect
                v-model="localConfig.etapaId"
                :items="etapas"
                item-title="title"
                item-value="value"
                label="Etapa do Funil"
                required
                :rules="[requiredValidator]"
                :loading="loadingEtapas"
                hint="Em qual etapa do funil iniciar o negócio"
                persistent-hint
              />
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VCol>

    <!-- Informações Adicionais -->
    <VCol cols="12">
      <VExpansionPanels>
        <VExpansionPanel>
          <VExpansionPanelTitle>
            <div class="d-flex align-center gap-2">
              <VIcon icon="tabler-settings" size="20" color="primary" />
              <span class="text-sm">Informações Adicionais (Opcional)</span>
            </div>
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <VRow>
              <VCol cols="12">
                <Dinheiro
                  v-model.number="localConfig.valor"
                  label="Valor do Negócio (opcional)"
                  hint="Valor estimado do negócio em R$"
                  persistent-hint
                />
              </VCol>
              
              <VCol cols="12">
                <AppTextField
                  v-model="localConfig.origem"
                  label="Origem"
                  placeholder="Ex: WhatsApp, Site, Indicação ou {{origem}}"
                  hint="Canal ou fonte que gerou o negócio"
                  persistent-hint
                >
                  <template #append-inner>
                    <VMenu location="bottom" :close-on-content-click="false">
                      <template #activator="{ props: menuProps }">
                        <VBtn
                          icon
                          size="x-small"
                          variant="text"
                          v-bind="menuProps"
                        >
                          <VIcon icon="tabler-braces" size="20" color="primary" />
                        </VBtn>
                      </template>
                      
                      <VCard max-width="300" max-height="400" class="overflow-auto">
                        <VCardText>
                          <div class="text-caption mb-2 font-weight-bold">Variáveis Disponíveis</div>
                          <div class="d-flex flex-column gap-1">
                            <VChip
                              v-for="variable in variaveisNegocio"
                              :key="variable.value"
                              size="small"
                              :color="variable.type === 'dinamica' ? 'success' : variable.type === 'sistema' ? 'info' : 'primary'"
                              variant="tonal"
                              class="cursor-pointer"
                              @click="localConfig.origem = (localConfig.origem || '') + `{{${variable.value}}}`"
                            >
                              <VIcon icon="tabler-plus" size="small" class="me-1" />
                              {{ variable.title }}
                            </VChip>
                          </div>
                        </VCardText>
                      </VCard>
                    </VMenu>
                  </template>
                </AppTextField>
              </VCol>

              <VCol cols="12">
                <AppTextField
                  v-model="localConfig.dataFechamentoEsperada"
                  label="Data de Fechamento Esperada"
                  type="date"
                  hint="Previsão de quando o negócio será fechado"
                  persistent-hint
                />
              </VCol>

              <VCol cols="12">
                <AppTextarea
                  v-model="localConfig.descricao"
                  label="Descrição"
                  placeholder="Descrição detalhada do negócio..."
                  rows="3"
                  auto-grow
                  active
                  hint="Informações adicionais sobre o negócio"
                  persistent-hint
                />
              </VCol>

              <VCol cols="12">
                <AppSelect
                  v-model="localConfig.tags"
                  :items="tags"
                  label="Tags (opcional)"
                  multiple
                  chips
                  closable-chips
                  placeholder="Selecione as tags"
                  hint="Categorias para organizar o negócio"
                  persistent-hint
                />
              </VCol>
            </VRow>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCol>

    <VCol cols="12">
      <VariablesSection :flow-variables="props.flowVariables" />

      <BlockInfoSection
        :items="[
          { icon: 'tabler-briefcase', color: 'success', text: 'Cria um novo negócio no funil de vendas' },
          { icon: 'tabler-link', color: 'primary', text: 'Vincula automaticamente ao cliente do contexto' },
          { icon: 'tabler-variable', color: 'info', text: 'Suporta variáveis dinâmicas em todos os campos' }
        ]"
        hint="Título e Etapa do Funil são obrigatórios. Outros campos são opcionais."
      />
    </VCol>
  </VRow>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue';
import { getAllVariables } from '@/utils/dynamicVariables.js';
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  config: {
    type: Object,
    required: true,
    default: () => ({})
  },
  flowVariables: {
    type: Array,
    default: () => []
  }
});

const emit = defineEmits(['update:config']);

const localConfig = ref({
  titulo: props.config.titulo || '',
  etapaId: props.config.etapaId || null,
  valor: props.config.valor || null,
  origem: props.config.origem || '',
  descricao: props.config.descricao || '',
  dataFechamentoEsperada: props.config.dataFechamentoEsperada || '',
  tags: props.config.tags || []
});

const etapas = ref([]);
const tags = ref([]);
const variaveisNegocio = ref([]);
const loadingEtapas = ref(false);

const carregarEtapas = async () => {
  loadingEtapas.value = true;
  try {
    const res = await $api('/crm/list/funil');
    if (res) {
      etapas.value = res.map(f => ({
        title: f.nome,
        value: f.id
      }));
    }
  } catch (error) {
    console.error('Erro ao carregar etapas do funil:', error);
  } finally {
    loadingEtapas.value = false;
  }
};

// Carregar tags
const loadTags = async () => {
  try {
    const res = await $api('/crm/list/tags', { method: 'GET' });
    if (res?.tags) {
      tags.value = res.tags.map(tag => ({
        title: tag.name,
        value: tag.id
      }));
    }
  } catch (error) {
    console.error('Erro ao carregar tags:', error);
  }
};

// Watch para emitir mudanças
watch(localConfig, (newVal) => {
  emit('update:config', { ...newVal });
}, { deep: true });

onMounted(async () => {
  await carregarEtapas();
  await loadTags();
  
  // Carregar todas as variáveis disponíveis
  const allVars = await getAllVariables();
  variaveisNegocio.value = [...allVars, ...props.flowVariables] || [];
  
  // Se já tem config, usar ela
  if (props.config) {
    localConfig.value = {
      titulo: props.config.titulo || '',
      etapaId: props.config.etapaId || null,
      valor: props.config.valor || null,
      origem: props.config.origem || '',
      descricao: props.config.descricao || '',
      dataFechamentoEsperada: props.config.dataFechamentoEsperada || '',
      tags: props.config.tags || []
    };
  }
});
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
