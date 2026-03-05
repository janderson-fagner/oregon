<script setup>
import moment from "moment";

const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(false);
const loadingCartao = ref(false);
const loadingCancelar = ref(false);

// Dados
const assinatura = ref(null);
const permanente = computed(() => {
  return useCookie('userData').value.empresa_id == 1;
});

const pagamentos = ref([]);

// Dialogs
const showCartaoDialog = ref(false);
const showCancelarDialog = ref(false);

// Dados do cartão
const cartao = ref({
  holderName: '',
  number: '',
  expiryMonth: null,
  expiryYear: null,
  ccv: '',
  postalCode: '',
  addressNumber: '',
  phone: '',
});

// Motivo do cancelamento
const motivoCancelamento = ref('');

// Gerar opções de meses e anos
const months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
const currentYear = new Date().getFullYear();
const years = Array.from({ length: 15 }, (_, i) => String(currentYear + i));

// Buscar assinatura
const getAssinatura = async () => {
  loading.value = true;

  try {
    const res = await $api('/saas/minha-assinatura', { method: 'GET' });
    assinatura.value = res;
  } catch (error) {
    console.error('Erro ao buscar assinatura:', error);
    if (error?.response?.status !== 404) {
      setAlert('Erro ao buscar dados da assinatura', 'error', 'tabler-x', 3000);
    }
  }

  loading.value = false;
};

// Buscar pagamentos
const getPagamentos = async () => {
  try {
    const res = await $api('/saas/minha-assinatura/pagamentos', { method: 'GET' });
    pagamentos.value = res || [];
  } catch (error) {
    console.error('Erro ao buscar pagamentos:', error);
  }
};

// Formatar valor
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

// Formatar data
const formatDate = (date) => {
  if (!date) return '-';
  return moment(date).format('DD/MM/YYYY');
};

// Cor do status
const getStatusColor = (status) => {
  const colors = {
    ativa: 'success',
    trial: 'info',
    pendente: 'warning',
    vencida: 'error',
    suspensa: 'error',
    cancelada: 'secondary'
  };
  return colors[status] || 'default';
};

// Label do status
const getStatusLabel = (status) => {
  const labels = {
    ativa: 'Ativa',
    trial: 'Período de Teste',
    pendente: 'Pendente',
    vencida: 'Vencida',
    suspensa: 'Suspensa',
    cancelada: 'Cancelada'
  };
  return labels[status] || status;
};

// Label do ciclo
const getCicloLabel = (ciclo) => {
  return ciclo === 'YEARLY' ? 'Anual' : 'Mensal';
};

// Dias restantes do trial
const diasRestantesTrial = computed(() => {
  if (!assinatura.value?.data_fim_trial) return 0;
  const fim = moment(assinatura.value.data_fim_trial);
  const hoje = moment();
  return Math.max(0, fim.diff(hoje, 'days'));
});

// Features lista
const featuresList = computed(() => {
  if (!assinatura.value?.plano_features) return [];
  const f = assinatura.value.plano_features;
  const list = [];
  if (f.qtdFuncionarios) list.push({ icon: 'tabler-users', text: `Até ${f.qtdFuncionarios} funcionários`, color: 'primary' });
  if (f.gerenciamentoEstoque) list.push({ icon: 'tabler-package', text: 'Gerenciamento de Estoque', color: 'success' });
  if (f.acessoCRM) list.push({ icon: 'tabler-heart-handshake', text: 'Acesso ao CRM', color: 'info' });
  if (f.acessoCalculadora) list.push({ icon: 'tabler-calculator', text: 'Calculadora Avançada', color: 'warning' });
  return list;
});

// Status do pagamento
const getPagStatusColor = (status) => {
  return (status === 'RECEIVED' || status === 'CONFIRMED') ? 'success' : 'warning';
};
const getPagStatusLabel = (status) => {
  return (status === 'RECEIVED' || status === 'CONFIRMED') ? 'Pago' : 'Pendente';
};

// Resetar form do cartão
const resetCartaoForm = () => {
  cartao.value = {
    holderName: '',
    number: '',
    expiryMonth: null,
    expiryYear: null,
    ccv: '',
    postalCode: '',
    addressNumber: '',
    phone: '',
  };
};

// Abrir dialog de alterar cartão
const abrirCartaoDialog = () => {
  resetCartaoForm();
  showCartaoDialog.value = true;
};

// Validar cartão
const validateCard = () => {
  const c = cartao.value;
  if (!c.holderName.trim()) {
    setAlert('Informe o nome impresso no cartão', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  if (c.number.replace(/\D/g, '').length < 13) {
    setAlert('Número do cartão inválido', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  if (!c.expiryMonth || !c.expiryYear) {
    setAlert('Informe a validade do cartão', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  if (!c.ccv || c.ccv.length < 3) {
    setAlert('Informe o código de segurança (CVV)', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  if (!c.postalCode || c.postalCode.replace(/\D/g, '').length < 8) {
    setAlert('Informe o CEP do titular', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  if (!c.addressNumber.trim()) {
    setAlert('Informe o número do endereço', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  if (!c.phone || c.phone.replace(/\D/g, '').length < 10) {
    setAlert('Informe o telefone do titular', 'error', 'tabler-alert-triangle', 3000);
    return false;
  }
  return true;
};

// Salvar novo cartão
const salvarCartao = async () => {
  if (!validateCard()) return;

  loadingCartao.value = true;

  try {
    const c = cartao.value;
    const userData = useCookie('userData').value;
    const docLimpo = userData.cpfCnpj?.replace(/\D/g, '') || '';

    await $api('/saas/minha-assinatura/cartao', {
      method: 'PUT',
      body: {
        creditCard: {
          holderName: c.holderName,
          number: c.number.replace(/\D/g, ''),
          expiryMonth: c.expiryMonth,
          expiryYear: c.expiryYear,
          ccv: c.ccv,
        },
        creditCardHolderInfo: {
          name: c.holderName,
          email: userData.email || '',
          cpfCnpj: docLimpo,
          postalCode: c.postalCode.replace(/\D/g, ''),
          addressNumber: c.addressNumber,
          phone: c.phone.replace(/\D/g, ''),
        },
      },
    });

    setAlert('Cartão atualizado com sucesso!', 'success', 'tabler-check', 3000);
    showCartaoDialog.value = false;
  } catch (error) {
    console.error('Erro ao atualizar cartão:', error);
    setAlert(
      error?.response?._data?.error || 'Erro ao atualizar cartão de crédito',
      'error', 'tabler-alert-triangle', 5000
    );
  }

  loadingCartao.value = false;
};

// Cancelar assinatura
const cancelarAssinatura = async () => {
  loadingCancelar.value = true;

  try {
    await $api('/saas/minha-assinatura/cancelar', {
      method: 'POST',
      body: { motivo: motivoCancelamento.value || 'Cancelamento pelo usuário' },
    });

    setAlert('Assinatura cancelada com sucesso', 'success', 'tabler-check', 3000);
    showCancelarDialog.value = false;
    motivoCancelamento.value = '';
    getAssinatura();
  } catch (error) {
    console.error('Erro ao cancelar assinatura:', error);
    setAlert(
      error?.response?._data?.error || 'Erro ao cancelar assinatura',
      'error', 'tabler-alert-triangle', 5000
    );
  }

  loadingCancelar.value = false;
};

onMounted(() => {
  getAssinatura();
  getPagamentos();
});
</script>

<template>
  <!-- Header -->
  <div class="d-flex align-center justify-space-between mb-6">
    <div>
      <h2 class="text-h5 mb-1">Minha Assinatura</h2>
      <p class="text-body-2 text-medium-emphasis mb-0">Gerencie sua assinatura e forma de pagamento</p>
    </div>
  </div>

  <!-- Empresa permanente -->
  <VCard v-if="permanente" rounded="lg">
    <VCardText class="text-center pa-8">
      <VAvatar size="64" color="success" variant="tonal" class="mb-4">
        <VIcon icon="tabler-crown" size="32" />
      </VAvatar>
      <h3 class="text-h5 mb-2 text-success">Assinatura Permanente</h3>
      <p class="text-medium-emphasis mb-0">Sua empresa possui acesso completo e ilimitado ao sistema.</p>
    </VCardText>
  </VCard>

  <template v-else>
    <VRow>
      <!-- Coluna principal: Assinatura -->
      <VCol cols="12" md="8">
        <!-- Card do Plano -->
        <VCard :loading="loading" class="mb-6">
          <VCardText v-if="assinatura" class="pa-6">
            <!-- Header do plano -->
            <div class="d-flex align-center justify-space-between mb-5">
              <div class="d-flex align-center gap-3">
                <VAvatar size="48" color="primary" variant="tonal">
                  <VIcon icon="tabler-rocket" size="24" />
                </VAvatar>
                <div>
                  <h3 class="text-h6 mb-0">{{ assinatura.plano_nome }}</h3>
                  <span class="text-body-2 text-medium-emphasis" v-if="assinatura.plano_descricao">
                    {{ assinatura.plano_descricao }}
                  </span>
                </div>
              </div>
              <VChip :color="getStatusColor(assinatura.status)" variant="flat" size="small">
                {{ getStatusLabel(assinatura.status) }}
              </VChip>
            </div>

            <!-- Alerta de Trial -->
            <VAlert
              v-if="assinatura.status === 'trial'"
              type="info"
              variant="tonal"
              class="mb-5"
              density="compact"
            >
              <template #prepend>
                <VIcon icon="tabler-gift" />
              </template>
              Você está no período de teste. Restam <strong>{{ diasRestantesTrial }} dias</strong>.
            </VAlert>

            <!-- Valor e Ciclo -->
            <div class="d-flex align-end gap-2 mb-5">
              <span class="text-h3 font-weight-bold text-primary">
                {{ formatCurrency(assinatura.valor) }}
              </span>
              <span class="text-body-2 text-medium-emphasis pb-1">
                /{{ assinatura.ciclo === 'YEARLY' ? 'ano' : 'mês' }}
              </span>
            </div>

            <VDivider class="mb-5" />

            <!-- Informações em grid -->
            <VRow dense>
              <VCol cols="6" sm="3">
                <div class="text-caption text-medium-emphasis mb-1">Data de Início</div>
                <div class="text-body-2 font-weight-medium">{{ formatDate(assinatura.data_inicio) }}</div>
              </VCol>
              <VCol cols="6" sm="3">
                <div class="text-caption text-medium-emphasis mb-1">Ciclo</div>
                <div class="text-body-2 font-weight-medium">{{ getCicloLabel(assinatura.ciclo) }}</div>
              </VCol>
              <VCol cols="6" sm="3">
                <div class="text-caption text-medium-emphasis mb-1">Próx. Vencimento</div>
                <div class="text-body-2 font-weight-medium">{{ formatDate(assinatura.data_proximo_vencimento) }}</div>
              </VCol>
              <VCol cols="6" sm="3" v-if="assinatura.data_fim_trial">
                <div class="text-caption text-medium-emphasis mb-1">Fim do Teste</div>
                <div class="text-body-2 font-weight-medium">{{ formatDate(assinatura.data_fim_trial) }}</div>
              </VCol>
            </VRow>

            <!-- Features -->
            <template v-if="featuresList.length > 0">
              <VDivider class="my-5" />
              <div class="text-subtitle-2 font-weight-medium mb-3">Recursos inclusos</div>
              <div class="d-flex flex-wrap gap-2">
                <VChip
                  v-for="(feat, idx) in featuresList"
                  :key="idx"
                  :color="feat.color"
                  variant="tonal"
                  size="small"
                  :prepend-icon="feat.icon"
                >
                  {{ feat.text }}
                </VChip>
              </div>
            </template>
          </VCardText>

          <!-- Sem assinatura -->
          <VCardText v-else-if="!loading" class="pa-6">
            <VAlert type="warning" variant="tonal">
              <template #prepend>
                <VIcon icon="tabler-alert-triangle" />
              </template>
              Nenhuma assinatura encontrada.
            </VAlert>
          </VCardText>
        </VCard>

        <!-- Histórico de Pagamentos -->
        <VCard>
          <VCardText class="pa-6">
            <div class="d-flex align-center gap-2 mb-4">
              <VAvatar size="36" color="secondary" variant="tonal">
                <VIcon icon="tabler-receipt" size="20" />
              </VAvatar>
              <h3 class="text-subtitle-1 font-weight-medium mb-0">Histórico de Pagamentos</h3>
            </div>

            <template v-if="pagamentos.length > 0">
              <VTable density="comfortable" class="text-no-wrap">
                <thead>
                  <tr>
                    <th>Valor</th>
                    <th>Data</th>
                    <th>Forma</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pag in pagamentos" :key="pag.id">
                    <td class="font-weight-medium">{{ formatCurrency(pag.valor) }}</td>
                    <td>{{ formatDate(pag.data_pagamento || pag.data_vencimento) }}</td>
                    <td>{{ pag.forma_pagamento || 'Aguardando' }}</td>
                    <td>
                      <VChip :color="getPagStatusColor(pag.status)" size="small" variant="tonal">
                        {{ getPagStatusLabel(pag.status) }}
                      </VChip>
                    </td>
                  </tr>
                </tbody>
              </VTable>
            </template>

            <div v-else class="text-center py-6">
              <VIcon icon="tabler-receipt-off" size="40" color="disabled" class="mb-2" />
              <p class="text-body-2 text-medium-emphasis mb-0">Nenhum pagamento registrado ainda</p>
            </div>
          </VCardText>
        </VCard>
      </VCol>

      <!-- Coluna lateral: Ações -->
      <VCol cols="12" md="4">
        <!-- Card Forma de Pagamento -->
        <VCard class="mb-4" v-if="assinatura">
          <VCardText class="pa-5">
            <div class="d-flex align-center gap-2 mb-4">
              <VAvatar size="36" color="info" variant="tonal">
                <VIcon icon="tabler-credit-card" size="20" />
              </VAvatar>
              <h4 class="text-subtitle-1 font-weight-medium mb-0">Forma de Pagamento</h4>
            </div>

            <div class="d-flex align-center gap-3 pa-3 rounded-lg" style="background: rgb(var(--v-theme-surface-variant), 0.4);">
              <VIcon icon="tabler-credit-card" size="24" color="primary" />
              <div>
                <div class="text-body-2 font-weight-medium">Cartão de Crédito</div>
                <div class="text-caption text-medium-emphasis">Forma de pagamento atual</div>
              </div>
            </div>

            <VBtn
              block
              variant="outlined"
              color="primary"
              class="mt-4"
              prepend-icon="tabler-refresh"
              @click="abrirCartaoDialog"
            >
              Alterar Cartão
            </VBtn>
          </VCardText>
        </VCard>

        <!-- Card Cancelar -->
        <VCard v-if="assinatura && assinatura.status !== 'cancelada'">
          <VCardText class="pa-5">
            <div class="d-flex align-center gap-2 mb-3">
              <VAvatar size="36" color="error" variant="tonal">
                <VIcon icon="tabler-alert-octagon" size="20" />
              </VAvatar>
              <h4 class="text-subtitle-1 font-weight-medium mb-0">Cancelar Assinatura</h4>
            </div>

            <p class="text-body-2 text-medium-emphasis mb-4">
              Ao cancelar, você perderá o acesso aos recursos do plano ao final do período atual.
            </p>

            <VBtn
              block
              variant="outlined"
              color="error"
              prepend-icon="tabler-x"
              @click="showCancelarDialog = true"
            >
              Cancelar Assinatura
            </VBtn>
          </VCardText>
        </VCard>
      </VCol>
    </VRow>
  </template>

  <!-- Dialog: Alterar Cartão -->
  <VDialog v-model="showCartaoDialog" max-width="550" persistent>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          title="Alterar Cartão de Crédito"
          @cancel="showCartaoDialog = false"
        />

        <div class="mt-4">
          <VRow dense>
            <VCol cols="12">
              <AppTextField
                v-model="cartao.holderName"
                label="Nome impresso no cartão"
                placeholder="Como está no cartão"
              />
            </VCol>
            <VCol cols="12">
              <AppTextField
                v-model="cartao.number"
                label="Número do cartão"
                placeholder="0000 0000 0000 0000"
                v-mask="['#### #### #### ####']"
              />
            </VCol>
            <VCol cols="4">
              <AppSelect
                v-model="cartao.expiryMonth"
                label="Mês"
                :items="months"
                placeholder="MM"
              />
            </VCol>
            <VCol cols="4">
              <AppSelect
                v-model="cartao.expiryYear"
                label="Ano"
                :items="years"
                placeholder="AAAA"
              />
            </VCol>
            <VCol cols="4">
              <AppTextField
                v-model="cartao.ccv"
                label="CVV"
                placeholder="123"
                maxlength="4"
                v-mask="['####']"
              />
            </VCol>
            <VCol cols="6">
              <AppTextField
                v-model="cartao.postalCode"
                label="CEP do titular"
                placeholder="00000-000"
                v-mask="['#####-###']"
              />
            </VCol>
            <VCol cols="6">
              <AppTextField
                v-model="cartao.addressNumber"
                label="Número"
                placeholder="123"
              />
            </VCol>
            <VCol cols="12">
              <AppTextField
                v-model="cartao.phone"
                label="Telefone do titular"
                placeholder="(00) 00000-0000"
                v-mask="['(##) #####-####', '(##) ####-####']"
              />
            </VCol>
          </VRow>

          <div class="d-flex justify-end gap-2 mt-5">
            <VBtn variant="outlined" color="secondary" @click="showCartaoDialog = false">
              Cancelar
            </VBtn>
            <VBtn color="primary" :loading="loadingCartao" @click="salvarCartao">
              Salvar Cartão
            </VBtn>
          </div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- Dialog: Cancelar Assinatura -->
  <VDialog v-model="showCancelarDialog" max-width="480" persistent>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          title="Cancelar Assinatura"
          @cancel="showCancelarDialog = false"
        />

        <div class="mt-4">
          <VAlert type="error" variant="tonal" class="mb-4" density="compact">
            <template #prepend>
              <VIcon icon="tabler-alert-triangle" />
            </template>
            Esta ação não pode ser desfeita. Ao cancelar sua assinatura, o acesso ao sistema será encerrado.
          </VAlert>

          <AppTextarea
            v-model="motivoCancelamento"
            label="Motivo do cancelamento (opcional)"
            placeholder="Conte-nos por que está cancelando..."
            rows="3"
          />

          <div class="d-flex justify-end gap-2 mt-5">
            <VBtn variant="outlined" color="secondary" @click="showCancelarDialog = false">
              Manter Assinatura
            </VBtn>
            <VBtn color="error" :loading="loadingCancelar" @click="cancelarAssinatura">
              Confirmar Cancelamento
            </VBtn>
          </div>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
