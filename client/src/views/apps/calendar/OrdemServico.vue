<script setup>
import { temaAtual } from "@core/stores/config";
import moment from "moment";
import { useConfirm } from "@/utils/confirm.js";
import { useFunctions } from "@/composables/useFunctions";
const { escreverEndereco, debounce } = useFunctions();
import { VCard, VCardText } from "vuetify/components";

const urlApp = import.meta.env.VITE_APP_URL;
const props = defineProps({
  agendamentoData: {
    type: Object,
    required: true,
  },
  isDialog: {
    type: Boolean,
    required: false,
    default: false,
  },
});

const emit = defineEmits(["close", "updateOrdem"]);

const { setAlert } = useAlert();

const userData = useCookie("userData").value;
const isMobile = window.innerWidth < 768;

let refOrdem = {
  licensaSanitaria: {
    text: "",
    validade: null,
  },
  licensaAmbiental: {
    text: "",
    validade: null,
  },
  licensaVeicular: {
    text: "",
    validade: null,
  },
  cliente: "",
  endereco: "",
  dataExecucao: null,
  dataValidade: null,
  pragasAlvo: "",
  prazoAssistencia: "",
  nomeConcentracao: "",
  gruposQuimicos: "",
  principioAtivos: "",
  orientacoes: "",
  funcionarios: [],
  obs: "",
  assinaturaData: null,
};

const ordemServico = ref(refOrdem);

const handleValueOrdem = (newValue) => {
  if (!newValue) return;

  console.log("newValue", newValue);

  ordemServico.value = newValue?.age_ordemServico || refOrdem;

  if (!ordemServico.value.assinaturaData) {
    ordemServico.value.cliente = !ordemServico.value.cliente
      ? newValue?.cliente?.[0]?.cli_nome
      : ordemServico.value.cliente;
    ordemServico.value.endereco = !ordemServico.value.endereco
      ? escreverEndereco(newValue?.endereco?.[0] ?? null)
      : ordemServico.value.endereco;
    ordemServico.value.dataExecucao = !ordemServico.value.dataExecucao
      ? moment(newValue?.age_data).format("YYYY-MM-DD")
      : ordemServico.value.dataExecucao;
    ordemServico.value.funcionarios =
      !ordemServico.value.funcionarios ||
      ordemServico.value.funcionarios.length === 0
        ? newValue?.funcionario
        : ordemServico.value.funcionarios;
  }
};

watch(
  () => props.agendamentoData,
  (newVal) => {
    if (newVal) {
      handleValueOrdem(newVal);
    }
  },
  { immediate: true }
);

if (props.agendamentoData) {
  handleValueOrdem(props.agendamentoData);
}

const salvo = ref(false);
const salvando = ref(false);

const salvarOrdemServico = async (auto = true) => {
  salvando.value = true;

  try {
    const response = await $api("/agenda/salvarOrdemServico", {
      method: "POST",
      body: {
        age_id: props.agendamentoData.age_id,
        ordemData: ordemServico.value,
      },
    });

    if (!response) throw new Error("Erro ao salvar ordem de serviço");

    console.log("response", response);

    if (!auto)
      setAlert(
        "Ordem de serviço salva com sucesso",
        "success",
        "tabler-check",
        3000
      );

    salvo.value = true;
    salvando.value = false;

    if (!auto) close();
    return true;
  } catch (error) {
    console.error("Erro ao salvar ordem de serviço", error);
    setAlert(
      error.response?._data?.message || "Erro ao salvar ordem de serviço",
      "error",
      "tabler-alert-triangle",
      3000
    );
    salvando.value = false;
    return false;
  }
};

const gerarOrdemServico = async () => {
  let salvou = await salvarOrdemServico(true);

  if (!salvou) return;

  try {
    const response = await $api("/agenda/gerarOrdemServico", {
      method: "POST",
      body: {
        age_id: props.agendamentoData.age_id,
      },
    });

    if (!response || !response.url || !response.ordemData)
      throw new Error("Erro ao gerar ordem de serviço");

    console.log("response", response);

    setAlert(
      "Ordem de serviço gerada com sucesso",
      "success",
      "tabler-check",
      3000
    );

    //window.open(response.url, "_blank");
    ordemServico.value = response.ordemData;
    emit("updateOrdem", ordemServico.value);
  } catch (error) {
    console.error("Erro ao gerar ordem de serviço", error);
    setAlert(
      error.response?._data?.message || "Erro ao gerar ordem de serviço",
      "error",
      "tabler-alert-triangle",
      3000
    );
  }
};

const debounceSalvar = debounce(salvarOrdemServico, 600);

const close = () => {
  if (!salvo.value) {
    let confirmar = confirm(
      "Tem certeza que deseja fechar a página sem salvar os dados? Você perderá todos os dados que não foram salvos."
    );

    if (!confirmar) return;
  }

  emit("close", ordemServico.value);
  salvo.value = false;
  salvando.value = false;
};

const downloadOrdemServico = () => {
  if (!ordemServico.value.assinaturaData?.filePdf?.url) return;

  window.open(ordemServico.value.assinaturaData.filePdf.url, "_blank");
};
</script>
<template>
  <component :is="!isDialog ? VCard : 'div'" class="ordem-servico">
    <component
      :is="!isDialog ? VCardText : 'div'"
      class="ordem-servico-content"
    >
      <div v-if="!ordemServico.assinaturaData">
        <p class="mb-0 text-sm">
          Preencha os campos abaixo para gerar a ordem de serviço.
        </p>
        <p class="mb-3 text-caption">
          {{
            !salvando ? "Os dados são salvos automaticamente." : "Salvando..."
          }}
        </p>

        <VRow>
          <VCol cols="12" md="6">
            <AppTextField
              label="Licença Sanitária"
              placeholder="Digite a licença sanitária"
              v-model="ordemServico.licensaSanitaria.text"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              label="Validade licença sanitária"
              placeholder="Digite a validade da licença sanitária"
              v-model="ordemServico.licensaSanitaria.validade"
              type="date"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              label="Licença Ambiental"
              placeholder="Digite a licença ambiental"
              v-model="ordemServico.licensaAmbiental.text"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              label="Validade licença ambiental"
              placeholder="Digite a validade da licença ambiental"
              v-model="ordemServico.licensaAmbiental.validade"
              type="date"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              label="Cliente"
              placeholder="Digite o cliente"
              v-model="ordemServico.cliente"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              label="Endereço da aplicação"
              placeholder="Digite o endereço"
              v-model="ordemServico.endereco"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              label="Data de execução"
              placeholder="Digite a data de execução"
              v-model="ordemServico.dataExecucao"
              type="date"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              label="Data de validade do serviço"
              placeholder="Digite a data de validade do serviço"
              v-model="ordemServico.dataValidade"
              type="date"
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Pragas alvo"
              placeholder="Digite as pragas alvo"
              v-model="ordemServico.pragasAlvo"
              rows="1"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Prazo de assistência técnica por serviço"
              placeholder="Digite o prazo de assistência técnica por serviço"
              v-model="ordemServico.prazoAssistencia"
              rows="1"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Nome e concentração do(s) produto(s)"
              placeholder="Digite o nome da concentração"
              v-model="ordemServico.nomeConcentracao"
              rows="1"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Grupo(s) químico(s) do(s) produto(s)"
              placeholder="Digite os grupo(s) químico(s) do(s) produto(s)"
              v-model="ordemServico.gruposQuimicos"
              rows="1"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Principio ativo(s) do(s) produto(s)"
              placeholder="Digite os principio ativo(s) do(s) produto(s)"
              v-model="ordemServico.principioAtivos"
              rows="1"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Orientações"
              placeholder="Digite as orientações"
              v-model="ordemServico.orientacoes"
              rows="1"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppSelect
              label="Funcionário(s)"
              placeholder="Selecione o funcionário(s)"
              v-model="ordemServico.funcionarios"
              :items="props.agendamentoData.funcionarios || []"
              item-title="fullName"
              item-value="id"
              multiple
              chips
              closable-chips
              deletable-chips
              hide-details
              clearable
              @update:model-value="debounceSalvar"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              label="Observações"
              placeholder="Digite as observações"
              v-model="ordemServico.obs"
              rows="2"
              auto-grow
              active
              @update:model-value="debounceSalvar"
            />
          </VCol>
        </VRow>

        <div class="linha-flex justify-end w-100 mt-4">
          <VBtn variant="outlined" color="secondary" @click="close">
            Cancelar
          </VBtn>

          <VBtn
            variant="tonal"
            color="primary"
            @click="salvarOrdemServico(false)"
          >
            Salvar
          </VBtn>

          <VBtn color="success" @click="gerarOrdemServico"> Gerar </VBtn>
        </div>
      </div>

      <div
        v-else
        class="d-flex flex-column align-center justify-center mt-4 gap-3"
      >
        <p class="mb-0 text-sm">
          <VIcon icon="tabler-signature" class="mr-2" />
          Link de assinatura:
          <a
            :href="`${urlApp}/ordem-servico/${props.agendamentoData.age_id}`"
            target="_blank"
            class="text-primary"
          >
            {{ urlApp }}/ordem-servico/{{ props.agendamentoData.age_id }}
          </a>
        </p>
        <VBtn class="w-100 text-none" @click="downloadOrdemServico">
          <VIcon icon="tabler-download" class="mr-2" />
          Baixar Ordem de Serviço
        </VBtn>

        <VBtn class="w-100 text-none" @click="gerarOrdemServico(true)">
          <VIcon icon="tabler-refresh" class="mr-2" />
          Gerar Novamente
        </VBtn>
      </div>
    </component>
  </component>
</template>
