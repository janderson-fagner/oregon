<script setup>
import PlanoDialog from "@/views/apps/saas/PlanoDialog.vue";

const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(false);

// Verificar permissão de admin
const userData = useCookie("userData").value;
if (userData?.role !== 'admin') {
  setAlert("Você não tem permissão para acessar esta página.", "error", "tabler-alert-triangle", 3000);
  router.push("/");
}

const planos = ref([]);
const selectedPlano = ref(null);
const dialogPlano = ref(false);
const filtroStatus = ref('ativos');

// Filtro de planos por status
const planosFiltrados = computed(() => {
  if (filtroStatus.value === 'ativos') return planos.value.filter(p => p.ativo);
  if (filtroStatus.value === 'inativos') return planos.value.filter(p => !p.ativo);
  return planos.value;
});

// Buscar planos
const getPlanos = async () => {
  loading.value = true;

  try {
    const res = await $api('/saas/planos', { method: 'GET' });
    planos.value = res || [];
  } catch (error) {
    console.error('Erro ao buscar planos:', error);
    setAlert('Erro ao buscar planos', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Abrir dialog para criar plano
const openCreateDialog = () => {
  selectedPlano.value = null;
  dialogPlano.value = true;
};

// Abrir dialog para editar plano
const openEditDialog = (plano) => {
  selectedPlano.value = { ...plano };
  dialogPlano.value = true;
};

// Salvar plano (criar ou atualizar)
const savePlano = async (planoData) => {
  loading.value = true;

  try {
    if (planoData.id) {
      await $api(`/saas/planos/${planoData.id}`, {
        method: 'PUT',
        body: planoData
      });
      setAlert('Plano atualizado com sucesso!', 'success', 'tabler-check', 3000);
    } else {
      await $api('/saas/planos', {
        method: 'POST',
        body: planoData
      });
      setAlert('Plano criado com sucesso!', 'success', 'tabler-check', 3000);
    }

    dialogPlano.value = false;
    getPlanos();
  } catch (error) {
    console.error('Erro ao salvar plano:', error);
    setAlert('Erro ao salvar plano', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Desativar plano
const deletePlano = async (plano) => {
  const confirm = window.confirm(
    `Deseja desativar o plano "${plano.nome}"?\n\nTodas as assinaturas ativas deste plano serão canceladas e as empresas serão inativadas.`
  );
  if (!confirm) return;

  loading.value = true;

  try {
    const res = await $api(`/saas/planos/${plano.id}`, { method: 'DELETE' });
    const msg = res.canceladas > 0
      ? `Plano desativado! ${res.canceladas} assinatura(s) cancelada(s).`
      : 'Plano desativado com sucesso!';
    setAlert(msg, 'success', 'tabler-check', 4000);
    getPlanos();
  } catch (error) {
    console.error('Erro ao desativar plano:', error);
    setAlert(error?.response?._data?.error || 'Erro ao desativar plano', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Formatar valor
const formatCurrency = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

onMounted(() => {
  getPlanos();
});
</script>

<template>
  <h2 class="text-h5 mb-0">Planos</h2>
  <p class="text-sm">Gerencie os planos de assinatura disponíveis</p>

  <VCard :loading="loading">
    <VCardText>
      <div class="d-flex justify-space-between align-center mb-4">
        <VBtnToggle
          v-model="filtroStatus"
          mandatory
          color="primary"
          rounded="pill"
          density="comfortable"
        >
          <VBtn value="ativos" rounded="pill">Ativos</VBtn>
          <VBtn value="inativos" rounded="pill">Inativos</VBtn>
          <VBtn value="todos" rounded="pill">Todos</VBtn>
        </VBtnToggle>

        <VBtn color="primary" @click="openCreateDialog">
          <VIcon icon="tabler-plus" class="mr-2" />
          Novo Plano
        </VBtn>
      </div>

      <VRow>
        <VCol
          v-for="plano in planosFiltrados"
          :key="plano.id"
          cols="12"
          md="4"
        >
          <VCard
            :class="{ 'border-primary': plano.ativo, 'opacity-50': !plano.ativo }"
            variant="outlined"
          >
            <VCardText class="text-center py-6">
              <VChip
                v-if="!plano.ativo"
                color="error"
                size="small"
                class="mb-2"
              >
                Inativo
              </VChip>

              <h3 class="text-h5 mb-2">{{ plano.nome }}</h3>

              <div class="d-flex justify-center align-end mb-4">
                <span class="text-h3 font-weight-bold text-primary">
                  {{ formatCurrency(plano.valor_mensal) }}
                </span>
                <span class="text-medium-emphasis mb-1">/mês</span>
              </div>

              <p class="text-sm text-medium-emphasis mb-4" v-if="plano.descricao">
                {{ plano.descricao }}
              </p>

              <VDivider class="my-4" />

              <div class="text-start">
                <div v-if="plano.dias_teste > 0" class="d-flex align-center mb-2">
                  <VIcon icon="tabler-gift" color="success" size="20" class="mr-2" />
                  <span>{{ plano.dias_teste }} dias de teste grátis</span>
                </div>

                <template v-if="plano.features">
                  <div v-if="plano.features.qtdFuncionarios" class="d-flex align-center mb-2">
                    <VIcon icon="tabler-users" color="primary" size="20" class="mr-2" />
                    <span>Até {{ plano.features.qtdFuncionarios }} funcionários</span>
                  </div>

                  <div v-if="plano.features.gerenciamentoEstoque" class="d-flex align-center mb-2">
                    <VIcon icon="tabler-package" color="success" size="20" class="mr-2" />
                    <span>Gerenciamento de estoque</span>
                  </div>

                  <div v-if="plano.features.acessoCRM" class="d-flex align-center mb-2">
                    <VIcon icon="tabler-users-group" color="success" size="20" class="mr-2" />
                    <span>Acesso ao CRM</span>
                  </div>

                  <div v-if="plano.features.acessoCalculadora" class="d-flex align-center mb-2">
                    <VIcon icon="tabler-calculator" color="success" size="20" class="mr-2" />
                    <span>Calculadora avançada</span>
                  </div>
                </template>
              </div>

              <VDivider class="my-4" />

              <div class="d-flex gap-2 justify-center">
                <VBtn size="small" variant="outlined" color="primary" @click="openEditDialog(plano)">
                  <VIcon icon="tabler-edit" size="16" class="mr-1" />
                  Editar
                </VBtn>
                <VBtn
                  v-if="plano.ativo"
                  size="small"
                  variant="outlined"
                  color="error"
                  @click="deletePlano(plano)"
                >
                  <VIcon icon="tabler-trash" size="16" class="mr-1" />
                  Desativar
                </VBtn>
              </div>
            </VCardText>
          </VCard>
        </VCol>

        <VCol cols="12" v-if="planosFiltrados.length === 0 && !loading">
          <VAlert type="info" variant="tonal">
            Nenhum plano cadastrado. Clique em "Novo Plano" para começar.
          </VAlert>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>

  <!-- Dialog de Plano -->
  <PlanoDialog
    v-model="dialogPlano"
    :plano="selectedPlano"
    @save="savePlano"
  />
</template>
