<script setup>
const router = useRouter();
const { setAlert } = useAlert();
const loading = ref(false);

const userData = useCookie("userData").value;

// Dados da empresa
const empresa = ref({
  nome: '',
  razao_social: '',
  cnpj: '',
  cpf: '',
  email: '',
  telefone: '',
  celular: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  logo: ''
});

const estados = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

// Buscar dados da empresa
const getEmpresa = async () => {
  loading.value = true;

  try {
    const res = await $api('/saas/minha-empresa', { method: 'GET' });
    if (res) {
      empresa.value = res;
    }
  } catch (error) {
    console.error('Erro ao buscar empresa:', error);
    if (error?.response?.status === 404) {
      setAlert('Você não está vinculado a nenhuma empresa', 'warning', 'tabler-alert-triangle', 3000);
    } else {
      setAlert('Erro ao buscar dados da empresa', 'error', 'tabler-x', 3000);
    }
  }

  loading.value = false;
};

// Salvar dados da empresa
const saveEmpresa = async () => {
  loading.value = true;

  try {
    await $api('/saas/minha-empresa', {
      method: 'PUT',
      body: empresa.value
    });
    setAlert('Dados atualizados com sucesso!', 'success', 'tabler-check', 3000);
    getEmpresa();
  } catch (error) {
    console.error('Erro ao salvar empresa:', error);
    setAlert('Erro ao salvar dados', 'error', 'tabler-x', 3000);
  }

  loading.value = false;
};

// Buscar CEP
const buscarCep = async () => {
  if (!empresa.value.cep || empresa.value.cep.length < 8) return;

  const cep = empresa.value.cep.replace(/\D/g, '');

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();

    if (!data.erro) {
      empresa.value.endereco = data.logradouro;
      empresa.value.bairro = data.bairro;
      empresa.value.cidade = data.localidade;
      empresa.value.estado = data.uf;
    }
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
  }
};

// Upload de logo
const handleLogoUpload = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    empresa.value.logo = e.target.result;
  };
  reader.readAsDataURL(file);
};

onMounted(() => {
  getEmpresa();
});
</script>

<template>
  <h2 class="text-h5 mb-0">Minha Empresa</h2>
  <p class="text-sm">Visualize e edite os dados da sua empresa</p>

  <VCard :loading="loading">
    <VCardText>
      <VRow>
        <!-- Logo -->
        <VCol cols="12" class="d-flex justify-center mb-4">
          <div class="text-center">
            <VAvatar size="120" color="primary" variant="tonal">
              <VImg v-if="empresa.logo" :src="empresa.logo" />
              <span v-else class="text-h3">{{ empresa.nome?.charAt(0)?.toUpperCase() }}</span>
            </VAvatar>
            <div class="mt-2">
              <VBtn size="small" variant="outlined" @click="$refs.logoInput.click()">
                <VIcon icon="tabler-upload" class="mr-1" size="16" />
                Alterar Logo
              </VBtn>
              <input
                ref="logoInput"
                type="file"
                accept="image/*"
                hidden
                @change="handleLogoUpload"
              />
            </div>
          </div>
        </VCol>

        <VCol cols="12">
          <h3 class="text-h6 mb-3">
            <VIcon icon="tabler-building" class="mr-2" />
            Dados da Empresa
          </h3>
        </VCol>

        <VCol cols="12" md="6">
          <AppTextField
            v-model="empresa.nome"
            label="Nome Fantasia"
            placeholder="Nome da empresa"
          />
        </VCol>

        <VCol cols="12" md="6">
          <AppTextField
            :model-value="empresa.documento"
            label="CPF/CNPJ"
            readonly
            disabled
            v-mask="['###.###.###-##', '##.###.###/####-##']"
          />
        </VCol>

        <VCol cols="12" md="6">
          <AppTextField
            v-model="empresa.email"
            label="Email"
            placeholder="email@empresa.com"
            readonly
            disabled
          />
        </VCol>

        <VCol cols="12" md="6">
          <AppTextField
            v-model="empresa.telefone"
            label="Telefone"
            placeholder="(00) 0000-0000"
          />
        </VCol>

        <VCol cols="12">
          <VDivider class="my-2" />
          <h3 class="text-h6 mb-3 mt-4">
            <VIcon icon="tabler-map-pin" class="mr-2" />
            Endereço
          </h3>
        </VCol>

        <VCol cols="12" md="3">
          <AppTextField
            v-model="empresa.cep"
            label="CEP"
            placeholder="00000-000"
            @blur="buscarCep"
            v-mask="['#####-###']"
          />
        </VCol>

        <VCol cols="12" md="7">
          <AppTextField
            v-model="empresa.endereco"
            label="Endereço"
            placeholder="Rua, Avenida..."
          />
        </VCol>

        <VCol cols="12" md="2">
          <AppTextField
            v-model="empresa.numero"
            label="Número"
            placeholder="000"
          />
        </VCol>

        <VCol cols="12" md="4">
          <AppTextField
            v-model="empresa.complemento"
            label="Complemento"
            placeholder="Sala, Andar..."
          />
        </VCol>

        <VCol cols="12" md="3">
          <AppTextField
            v-model="empresa.bairro"
            label="Bairro"
            placeholder="Bairro"
          />
        </VCol>

        <VCol cols="12" md="3">
          <AppTextField
            v-model="empresa.cidade"
            label="Cidade"
            placeholder="Cidade"
          />
        </VCol>

        <VCol cols="12" md="2">
          <AppSelect
            v-model="empresa.estado"
            label="Estado"
            :items="estados"
          />
        </VCol>

        <VCol cols="12" class="d-flex justify-end gap-2">
          <VBtn color="primary" @click="saveEmpresa" :loading="loading">
            <VIcon icon="tabler-device-floppy" class="mr-2" />
            Salvar Alterações
          </VBtn>
        </VCol>
      </VRow>
    </VCardText>
  </VCard>
</template>
