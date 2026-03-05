<script setup>
const props = defineProps({
  modelValue: Boolean,
  empresa: Object
});

const emit = defineEmits(['update:modelValue', 'save']);

// Dados do formulário
const formData = ref({
  id: null,
  nome: '',
  documento: '',
  email: '',
  telefone: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  cep: '',
  status: 'pendente'
});

const estados = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];

const statusOptions = [
  { title: 'Pendente', value: 'pendente' },
  { title: 'Ativa', value: 'ativa' },
  { title: 'Suspensa', value: 'suspensa' },
  { title: 'Inativa', value: 'inativa' }
];

// Dialog visibility
const isDialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
});

// Reset form
const resetForm = () => {
  formData.value = {
    id: null,
    nome: '',
    documento: '',
    email: '',
    telefone: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    cep: '',
    status: 'pendente'
  };
};


// Watch para preencher o form quando receber empresa para edição
watch(() => props.empresa, (newEmpresa) => {
  if (newEmpresa) {
    formData.value = {
      ...newEmpresa,
      documento: newEmpresa.documento || newEmpresa.cnpj || newEmpresa.cpf || ''
    };
  } else {
    resetForm();
  }
}, { immediate: true });

// Buscar CEP
const buscarCep = async () => {
  if (!formData.value.cep || formData.value.cep.length < 8) return;

  const cep = formData.value.cep.replace(/\D/g, '');

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const data = await res.json();

    if (!data.erro) {
      formData.value.endereco = data.logradouro;
      formData.value.bairro = data.bairro;
      formData.value.cidade = data.localidade;
      formData.value.estado = data.uf;
    }
  } catch (error) {
    console.error('Erro ao buscar CEP:', error);
  }
};

// Salvar
const save = () => {
  emit('save', { ...formData.value });
};

// Fechar
const close = () => {
  isDialogVisible.value = false;
  resetForm();
};
</script>

<template>
  <VDialog v-model="isDialogVisible" max-width="700" persistent>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          :title="formData.id ? 'Editar Empresa' : 'Nova Empresa'"
          @cancel="close"
        />

        <VRow class="mt-4">
          <VCol cols="12">
            <h4 class="text-subtitle-1 font-weight-medium mb-2">
              <VIcon icon="tabler-building" class="mr-2" />
              Dados da Empresa
            </h4>
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model="formData.nome"
              label="Nome Fantasia *"
              placeholder="Nome da empresa"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model="formData.documento"
              label="CPF/CNPJ *"
              placeholder="000.000.000-00 ou 00.000.000/0000-00"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model="formData.email"
              label="Email *"
              placeholder="email@empresa.com"
              type="email"
            />
          </VCol>

          <VCol cols="12" md="6" v-if="formData.id">
            <AppSelect
              v-model="formData.status"
              label="Status"
              :items="statusOptions"
              item-title="title"
              item-value="value"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model="formData.telefone"
              label="Telefone"
              placeholder="(00) 0000-0000"
            />
          </VCol>

          <VCol cols="12">
            <VDivider class="my-2" />
            <h4 class="text-subtitle-1 font-weight-medium mb-2 mt-3">
              <VIcon icon="tabler-map-pin" class="mr-2" />
              Endereço
            </h4>
          </VCol>

          <VCol cols="12" md="3">
            <AppTextField
              v-model="formData.cep"
              label="CEP"
              placeholder="00000-000"
              @blur="buscarCep"
            />
          </VCol>

          <VCol cols="12" md="7">
            <AppTextField
              v-model="formData.endereco"
              label="Endereço"
              placeholder="Rua, Avenida..."
            />
          </VCol>

          <VCol cols="12" md="2">
            <AppTextField
              v-model="formData.numero"
              label="Número"
              placeholder="000"
            />
          </VCol>

          <VCol cols="12" md="4">
            <AppTextField
              v-model="formData.complemento"
              label="Complemento"
              placeholder="Sala, Andar..."
            />
          </VCol>

          <VCol cols="12" md="3">
            <AppTextField
              v-model="formData.bairro"
              label="Bairro"
              placeholder="Bairro"
            />
          </VCol>

          <VCol cols="12" md="3">
            <AppTextField
              v-model="formData.cidade"
              label="Cidade"
              placeholder="Cidade"
            />
          </VCol>

          <VCol cols="12" md="2">
            <AppSelect
              v-model="formData.estado"
              label="Estado"
              :items="estados"
            />
          </VCol>
        </VRow>

        <div class="d-flex justify-end gap-2 mt-4">
          <VBtn variant="outlined" @click="close">
            Cancelar
          </VBtn>
          <VBtn color="primary" @click="save">
            <VIcon icon="tabler-device-floppy" class="mr-2" />
            Salvar
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>
