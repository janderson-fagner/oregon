<script setup>
import { can } from "@layouts/plugins/casl";
const router = useRouter();

const { setAlert } = useAlert();

if (!can("view", "crm_chat")) {
  setAlert(
    "Você não tem permissão para acessar esta página.",
    "error",
    "tabler-alert-triangle",
    3000
  );
  router.push("/");
}

import { temaAtual } from "@core/stores/config";
const loading = ref(false);

// ================== CONFIGURAÇÕES ==================
const geminiKey = ref("");
const elevenlabsKey = ref("");
const searchQueryFuncionario = ref("");

// Comportamento
const comportamento = ref({
  nome: "",
  genero: "neutro",
  tom: "",
  estilo: "",
  temperatura: "media",
  instrucoesCustomizadas: "",
});

// Empresa
const empresa = ref({
  nome: "",
  sobre: "",
  localizacao: "",
  regiaoAtendida: "",
  horarioAtendimento: "",
  politicas: "",
  informacoesAdicionais: "",
});

// Agendamentos
const agendamentos = ref({
  instrucoesGerais: "",
  servicos: [],
  regraDistancia: "",
  regraConfirmacao: "",
});

// Disponibilidade
const disponibilidade = ref({
  funcionarios: [],
  datasBloqueadas: [],
});

// Proteção
const protecao = ref({
  ativo: true,
  instrucoesAdicionais: "",
});

// Áudio
const audio = ref({
  ativo: false,
  instrucaoVoz: "",
  voiceId: "",
  customVoiceId: "", // ID de voz personalizado (prioridade sobre voiceId)
});

// ================== DADOS AUXILIARES ==================
const funcionariosDisponiveis = ref([]);
const servicosDisponiveis = ref([]);

// ================== VOZES ELEVENLABS ==================
const elevenlabsVoices = ref([]);
const voicesByGender = ref({ female: [], male: [], other: [] });
const loadingVoices = ref(false);
const previewingVoice = ref(null);
const previewAudio = ref(null);
const voiceTab = ref("default"); // 'default' ou 'community'
const freeVoicesOnly = ref(true); // Filtrar apenas vozes gratuitas (para contas free)

// Computed para garantir arrays validos sempre
const femaleVoices = computed(() => voicesByGender.value?.female || []);
const maleVoices = computed(() => voicesByGender.value?.male || []);
const otherVoices = computed(() => voicesByGender.value?.other || []);

const getElevenLabsVoices = async (type = voiceTab.value) => {
  if (!elevenlabsKey.value) return;

  loadingVoices.value = true;
  try {
    const res = await $api("/config/elevenlabs-voices", {
      method: "GET",
      query: {
        type,
        freeOnly: freeVoicesOnly.value ? 'true' : 'false'
      },
    });

    if (res?.success) {
      elevenlabsVoices.value = res.voices || [];
      voicesByGender.value = res.voicesByGender || { female: [], male: [], other: [] };
      console.log(`Vozes ${type} carregadas:`, elevenlabsVoices.value.length, res.freeOnly ? '(apenas gratuitas)' : '(todas)');
    }
  } catch (error) {
    console.error("Erro ao buscar vozes:", error);
  }
  loadingVoices.value = false;
};

// Atualizar vozes quando mudar a aba ou filtro de gratuitas
watch(voiceTab, (newTab) => {
  getElevenLabsVoices(newTab);
});

watch(freeVoicesOnly, () => {
  if (elevenlabsVoices.value.length > 0) {
    getElevenLabsVoices();
  }
});

const previewVoice = async (voiceId) => {
  // Se clicou na mesma voz que está tocando, para o áudio
  if (previewingVoice.value === voiceId) {
    if (previewAudio.value) {
      previewAudio.value.pause();
      previewAudio.value = null;
    }
    previewingVoice.value = null;
    return;
  }

  // Parar áudio anterior se existir
  if (previewAudio.value) {
    previewAudio.value.pause();
    previewAudio.value = null;
  }

  previewingVoice.value = voiceId;

  try {
    const voice = elevenlabsVoices.value.find(v => v.voice_id === voiceId);
    if (voice?.preview_url) {
      previewAudio.value = new Audio(voice.preview_url);

      previewAudio.value.onended = () => {
        previewingVoice.value = null;
        previewAudio.value = null;
      };

      previewAudio.value.onerror = () => {
        previewingVoice.value = null;
        previewAudio.value = null;
        setAlert("Erro ao reproduzir preview", "error", "tabler-alert-circle", 3000);
      };

      await previewAudio.value.play();
    } else {
      // Gerar preview via backend
      const res = await $api("/flow-test/tts-preview", {
        method: "POST",
        body: {
          voiceId,
          text: "Olá! Esta é uma prévia da voz selecionada para o atendimento virtual."
        }
      });

      if (res?.success && res.audioUrl) {
        previewAudio.value = new Audio(res.audioUrl);

        previewAudio.value.onended = () => {
          previewingVoice.value = null;
          previewAudio.value = null;
        };

        await previewAudio.value.play();
      } else {
        previewingVoice.value = null;
      }
    }
  } catch (error) {
    console.error("Erro ao fazer preview:", error);
    setAlert("Erro ao reproduzir preview", "error", "tabler-alert-circle", 3000);
    previewingVoice.value = null;
    previewAudio.value = null;
  }
};

const selectVoice = (voiceId) => {
  // Buscar dados completos da voz selecionada
  const voice = elevenlabsVoices.value.find(v => v.voice_id === voiceId);

  audio.value.voiceId = voiceId;
  audio.value.voiceName = voice?.name || '';
  audio.value.publicOwnerId = voice?.public_owner_id || null;

  console.log("Voz selecionada:", voiceId, voice?.name);
};

const getConfig = async () => {
  loading.value = true;

  try {
    const res = await $api("/config/get", {
      method: "GET",
      query: {
        types: [
          "gemini_key",
          "elevenlabs_key",
          "gemini_comportamento",
          "gemini_empresa",
          "gemini_agendamentos",
          "gemini_disponibilidade",
          "gemini_protecao",
          "gemini_audio",
        ],
      },
    });

    if (!res) return;

    console.log("Config:", res);

    geminiKey.value = res.find((r) => r.type === "gemini_key")?.value || "";
    elevenlabsKey.value = res.find((r) => r.type === "elevenlabs_key")?.value || "";

    // Parse configurações complexas
    const parseConfig = (type, defaultValue) => {
      const config = res.find((r) => r.type === type);
      if (!config || !config.value) return defaultValue;
      try {
        return typeof config.value === "string"
          ? JSON.parse(config.value)
          : config.value;
      } catch (error) {
        console.error(`Erro ao fazer parse de ${type}:`, error);
        return defaultValue;
      }
    };

    comportamento.value = parseConfig(
      "gemini_comportamento",
      comportamento.value
    );
    empresa.value = parseConfig("gemini_empresa", empresa.value);
    agendamentos.value = parseConfig("gemini_agendamentos", agendamentos.value);
    disponibilidade.value = parseConfig(
      "gemini_disponibilidade",
      disponibilidade.value
    );
    protecao.value = parseConfig("gemini_protecao", protecao.value);
    audio.value = parseConfig("gemini_audio", audio.value);
  } catch (error) {
    console.error("Erro ao buscar configurações:", error, error.response);
  }

  loading.value = false;
};

const getFuncionarios = async () => {
  try {
    const res = await $api("/agenda/funcionarios", {
      method: "GET",
      query: { ativo: 1 },
    });
    funcionariosDisponiveis.value = res || [];
  } catch (error) {
    console.error("Erro ao buscar funcionários:", error);
  }
};

const getServicos = async () => {
  try {
    const res = await $api("/servicos/list", {
      method: "GET",
      query: { itemsPerPage: -1 },
    });
    servicosDisponiveis.value = res?.servicos || [];
  } catch (error) {
    console.error("Erro ao buscar serviços:", error);
  }
};

onMounted(() => {
  getConfig();
  getFuncionarios();
  getServicos();
});

const abasConfigGPT = [
  { title: "Comportamento", icon: "tabler-user-cog" },
  { title: "Empresa", icon: "tabler-building-store" },
  { title: "Agendamentos", icon: "tabler-calendar-check" },
  { title: "Disponibilidade", icon: "tabler-clock-check" },
  { title: "Proteção", icon: "tabler-shield-lock" },
  { title: "Áudio", icon: "tabler-microphone" },
  { title: "API", icon: "tabler-key" },
];

const tabGPT = ref("Comportamento");

// Carregar vozes quando a aba de áudio for acessada
watch(tabGPT, (newTab) => {
  if (newTab === "Áudio" && elevenlabsVoices.value.length === 0 && elevenlabsKey.value) {
    getElevenLabsVoices();
  }
});

// Estimativas de custo baseadas em uso real de WhatsApp
const estimativasCusto = [
  {
    volume: "Até 1.000 conversas/mês",
    mensagens: "~10.000 mensagens",
    custo: "R$ 10 - R$ 20",
    desc: "Ideal para pequenos negócios iniciando com atendimento automatizado",
  },
  {
    volume: "1.000 - 5.000 conversas/mês",
    mensagens: "~50.000 mensagens",
    custo: "R$ 50 - R$ 100",
    desc: "Perfeito para empresas em crescimento com volume médio de atendimento",
  },
  {
    volume: "5.000 - 10.000 conversas/mês",
    mensagens: "~100.000 mensagens",
    custo: "R$ 100 - R$ 200",
    desc: "Para empresas estabelecidas com alto volume de interações",
  },
  {
    volume: "Acima de 10.000 conversas/mês",
    mensagens: "200.000+ mensagens",
    custo: "R$ 200+",
    desc: "Empresas de grande porte com atendimento intensivo",
  },
];

const updateConfig = async () => {
  loading.value = true;

  try {
    // Se uma voz da comunidade foi selecionada, adicionar à conta primeiro
    if (audio.value.voiceId && audio.value.publicOwnerId) {
      try {
        const voiceRes = await $api("/config/elevenlabs-select-voice", {
          method: "POST",
          body: {
            voiceId: audio.value.voiceId,
            voiceName: audio.value.voiceName,
            publicOwnerId: audio.value.publicOwnerId
          }
        });

        if (voiceRes?.success) {
          if (voiceRes.alreadyInAccount) {
            console.log("Voz já está na conta");
          } else {
            setAlert(
              `Voz "${audio.value.voiceName}" adicionada à sua conta!`,
              "info",
              "tabler-microphone",
              3000
            );
          }
        }
      } catch (voiceError) {
        console.error("Erro ao adicionar voz:", voiceError);
        setAlert(
          "Erro ao adicionar voz: " + (voiceError?.data?.error || voiceError.message),
          "error",
          "tabler-alert-circle",
          5000
        );
        loading.value = false;
        return;
      }
    }

    const data = [
      { type: "gemini_key", value: geminiKey.value },
      { type: "elevenlabs_key", value: elevenlabsKey.value },
      {
        type: "gemini_comportamento",
        value: JSON.stringify(comportamento.value),
      },
      { type: "gemini_empresa", value: JSON.stringify(empresa.value) },
      {
        type: "gemini_agendamentos",
        value: JSON.stringify(agendamentos.value),
      },
      {
        type: "gemini_disponibilidade",
        value: JSON.stringify(disponibilidade.value),
      },
      { type: "gemini_protecao", value: JSON.stringify(protecao.value) },
      { type: "gemini_audio", value: JSON.stringify(audio.value) },
    ];

    const res = await $api("/config/update", {
      method: "POST",
      body: { data, type_del: null },
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

// ================== GERENCIAMENTO DE SERVIÇOS ==================
const dialogServico = ref(false);
const servicoEdit = ref({
  servicoId: null,
  subservicoId: null,
  nome: "",
  descricao: "",
  regrasPrecificacao: [],
  observacoes: "",
  isSub: false,
});

// Gerenciamento de regras de precificação
const dialogRegra = ref(false);
const regraEdit = ref({
  titulo: "",
  descricao: "",
  preco: 0,
  duracaoMinutos: 60,
  imagens: [],
  condicoes: "",
});

// Lista de serviços com subserviços formatados
const servicosFormatados = computed(() => {
  const lista = [];
  
  for (const servico of servicosDisponiveis.value) {
    // Adicionar o serviço principal
    lista.push({
      title: servico.ser_nome,
      value: `servico_${servico.ser_id}`,
      servico_id: servico.ser_id,
      isSub: false,
      raw: servico
    });
    
    // Adicionar subserviços se existirem
    if (servico.ser_subservicos && servico.ser_subservicos.length > 0) {
      for (const sub of servico.ser_subservicos) {
        lista.push({
          title: `  ↳ ${sub.ser_nome}`,
          value: `sub_${sub.ser_id}`,
          servico_id: servico.ser_id,
          subservico_id: sub.ser_id,
          isSub: true,
          raw: sub
        });
      }
    }
  }
  
  return lista;
});

const addServico = () => {
  servicoEdit.value = {
    servicoId: null,
    subservicoId: null,
    nome: "",
    descricao: "",
    regrasPrecificacao: [],
    observacoes: "",
    isSub: false,
  };
  dialogServico.value = true;
};

const editServico = (index) => {
  servicoEdit.value = JSON.parse(
    JSON.stringify(agendamentos.value.servicos[index])
  );
  servicoEdit.value.index = index;

  // Garantir que regrasPrecificacao existe
  if (!servicoEdit.value.regrasPrecificacao) {
    servicoEdit.value.regrasPrecificacao = [];
  }

  dialogServico.value = true;
};

const onServicoSelect = (value) => {
  if (!value) return;
  
  const servicoSelecionado = servicosFormatados.value.find(s => s.value === value);
  if (!servicoSelecionado) return;
  
  const servicoData = servicoSelecionado.raw;
  
  servicoEdit.value.nome = servicoData.ser_nome;
  servicoEdit.value.descricao = servicoData.ser_descricao || "";
  servicoEdit.value.servicoId = servicoSelecionado.servico_id;
  servicoEdit.value.subservicoId = servicoSelecionado.isSub ? servicoSelecionado.subservico_id : null;
  servicoEdit.value.isSub = servicoSelecionado.isSub;
  
  // Se já não tiver regras, criar uma padrão com o valor do serviço
  if (!servicoEdit.value.regrasPrecificacao || servicoEdit.value.regrasPrecificacao.length === 0) {
    if (servicoData.ser_valor) {
      servicoEdit.value.regrasPrecificacao = [{
        titulo: "Padrão",
        descricao: "",
        preco: parseFloat(servicoData.ser_valor),
        duracaoMinutos: 60,
        imagens: [],
        condicoes: "",
      }];
    }
  }
};

const saveServico = () => {
  if (!agendamentos.value.servicos) {
    agendamentos.value.servicos = [];
  }

  // Validar serviço selecionado
  if (!servicoEdit.value.servicoId) {
    setAlert(
      "Selecione um serviço do sistema",
      "warning",
      "tabler-alert-circle",
      3000
    );
    return;
  }

  // Validar que tem pelo menos uma regra
  if (
    !servicoEdit.value.regrasPrecificacao ||
    servicoEdit.value.regrasPrecificacao.length === 0
  ) {
    setAlert(
      "Adicione pelo menos uma regra de precificação",
      "warning",
      "tabler-alert-circle",
      3000
    );
    return;
  }

  // Verificar se já existe
  const jaExiste = agendamentos.value.servicos.find((s, idx) => {
    if (servicoEdit.value.index !== undefined && idx === servicoEdit.value.index) {
      return false; // Ignorar o próprio serviço sendo editado
    }
    if (servicoEdit.value.isSub) {
      return s.subservicoId === servicoEdit.value.subservicoId;
    }
    return s.servicoId === servicoEdit.value.servicoId && !s.isSub;
  });

  if (jaExiste) {
    setAlert(
      "Este serviço já foi adicionado",
      "warning",
      "tabler-alert-circle",
      3000
    );
    return;
  }

  if (servicoEdit.value.index !== undefined) {
    agendamentos.value.servicos[servicoEdit.value.index] = JSON.parse(
      JSON.stringify(servicoEdit.value)
    );
    delete agendamentos.value.servicos[servicoEdit.value.index].index;
  } else {
    agendamentos.value.servicos.push(JSON.parse(JSON.stringify(servicoEdit.value)));
  }

  dialogServico.value = false;
};

const removeServico = (index) => {
  agendamentos.value.servicos.splice(index, 1);
};

// Funções para gerenciar regras de precificação
const addRegra = () => {
  regraEdit.value = {
    titulo: "",
    descricao: "",
    preco: 0,
    duracaoMinutos: 60,
    imagens: [],
    condicoes: "",
  };
  dialogRegra.value = true;
};

const editRegra = (index) => {
  regraEdit.value = JSON.parse(
    JSON.stringify(servicoEdit.value.regrasPrecificacao[index])
  );
  regraEdit.value.index = index;
  dialogRegra.value = true;
};

const saveRegra = () => {
  if (!servicoEdit.value.regrasPrecificacao) {
    servicoEdit.value.regrasPrecificacao = [];
  }

  if (regraEdit.value.index !== undefined) {
    servicoEdit.value.regrasPrecificacao[regraEdit.value.index] = JSON.parse(
      JSON.stringify(regraEdit.value)
    );
    delete servicoEdit.value.regrasPrecificacao[regraEdit.value.index].index;
  } else {
    servicoEdit.value.regrasPrecificacao.push(
      JSON.parse(JSON.stringify(regraEdit.value))
    );
  }

  dialogRegra.value = false;
};

const removeRegra = (index) => {
  servicoEdit.value.regrasPrecificacao.splice(index, 1);
};

// Upload de imagem para regra
const uploadingImage = ref(false);
const fileInputRef = ref(null);

const triggerFileInput = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click();
  }
};

const handleImageUpload = async (event) => {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  uploadingImage.value = true;

  try {
    for (const file of files) {
      // Validar tipo
      if (!file.type.startsWith("image/")) {
        setAlert(
          "Apenas imagens são permitidas",
          "error",
          "tabler-alert-circle",
          3000
        );
        continue;
      }

      // Validar tamanho (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setAlert(
          "Imagem muito grande (máx 5MB)",
          "error",
          "tabler-alert-circle",
          3000
        );
        continue;
      }

      // Converter para base64
      const reader = new FileReader();
      reader.onload = (e) => {
        if (!regraEdit.value.imagens) {
          regraEdit.value.imagens = [];
        }
        regraEdit.value.imagens.push({
          url: e.target.result,
          name: file.name,
        });
      };
      reader.readAsDataURL(file);
    }

    setAlert("Imagens adicionadas com sucesso", "success", "tabler-check", 2000);
  } catch (error) {
    console.error("Erro ao fazer upload:", error);
    setAlert("Erro ao adicionar imagens", "error", "tabler-alert-circle", 3000);
  }

  uploadingImage.value = false;
  // Limpar input para permitir selecionar a mesma imagem novamente
  event.target.value = "";
};

const removeImagem = (index) => {
  regraEdit.value.imagens.splice(index, 1);
};

// ================== GERENCIAMENTO DE DISPONIBILIDADE ==================
const dialogDisponibilidade = ref(false);
const funcEdit = ref(null);

const editDisponibilidadeFuncionario = (funcionario) => {
  const funcConfig = disponibilidade.value.funcionarios.find(
    (f) => f.fun_id === funcionario.id
  );

  if (funcConfig) {
    funcEdit.value = { ...funcConfig };
  } else {
    funcEdit.value = {
      fun_id: funcionario.id,
      fun_nome: funcionario.fullName,
      prioridade: 1,
      horarios: {
        domingo: { ativo: false, periodos: [] },
        segunda: { ativo: true, periodos: [{ inicio: "08:00", fim: "18:00" }] },
        terca: { ativo: true, periodos: [{ inicio: "08:00", fim: "18:00" }] },
        quarta: { ativo: true, periodos: [{ inicio: "08:00", fim: "18:00" }] },
        quinta: { ativo: true, periodos: [{ inicio: "08:00", fim: "18:00" }] },
        sexta: { ativo: true, periodos: [{ inicio: "08:00", fim: "18:00" }] },
        sabado: { ativo: false, periodos: [] },
      },
      servicos: [],
    };
  }

  dialogDisponibilidade.value = true;
};

const saveDisponibilidadeFuncionario = () => {
  if (!disponibilidade.value.funcionarios) {
    disponibilidade.value.funcionarios = [];
  }

  const index = disponibilidade.value.funcionarios.findIndex(
    (f) => f.fun_id === funcEdit.value.fun_id
  );

  if (index >= 0) {
    disponibilidade.value.funcionarios[index] = { ...funcEdit.value };
  } else {
    disponibilidade.value.funcionarios.push({ ...funcEdit.value });
  }

  dialogDisponibilidade.value = false;
};

const addPeriodo = (dia) => {
  if (!funcEdit.value.horarios[dia].periodos) {
    funcEdit.value.horarios[dia].periodos = [];
  }
  funcEdit.value.horarios[dia].periodos.push({ inicio: "08:00", fim: "12:00" });
};

const removePeriodo = (dia, index) => {
  funcEdit.value.horarios[dia].periodos.splice(index, 1);
};

// ================== DATAS BLOQUEADAS ==================
const dialogDataBloqueada = ref(false);
const dataBloqueada = ref({ data: "", descricao: "" });

const addDataBloqueada = () => {
  dataBloqueada.value = { data: "", descricao: "" };
  dialogDataBloqueada.value = true;
};

const saveDataBloqueada = () => {
  if (!disponibilidade.value.datasBloqueadas) {
    disponibilidade.value.datasBloqueadas = [];
  }

  disponibilidade.value.datasBloqueadas.push({ ...dataBloqueada.value });
  dialogDataBloqueada.value = false;
};

const removeDataBloqueada = (index) => {
  disponibilidade.value.datasBloqueadas.splice(index, 1);
};

const diasSemana = [
  { value: "segunda", label: "Segunda-feira" },
  { value: "terca", label: "Terça-feira" },
  { value: "quarta", label: "Quarta-feira" },
  { value: "quinta", label: "Quinta-feira" },
  { value: "sexta", label: "Sexta-feira" },
  { value: "sabado", label: "Sábado" },
  { value: "domingo", label: "Domingo" },
];
</script>

<template>
  <h2 class="text-h6 mb-1 mt-2">
    <VIcon icon="tabler-robot" class="mr-2" />
    Configurações do Atendente Virtual
  </h2>
  <p class="text-caption">
    Configure o atendente virtual (IA) da empresa. A inteligência artificial
    utilizada é o Gemini, da Google, e o Text-to-Speech é feito pelo ElevenLabs.<br />
    <a
      href="https://ai.google.dev/docs"
      target="_blank"
      class="text-primary"
      >Saiba mais sobre o Gemini aqui.</a
    >
    <a
      href="https://elevenlabs.io/docs"
      target="_blank"
      class="text-primary ml-2"
      >Saiba mais sobre o ElevenLabs aqui.</a
    >
  </p>

  <div class="d-flex flex-row flex-wrap gap-2 mb-4">
    <VBtn
      v-for="(aba, index) in abasConfigGPT"
      :key="index"
      :color="tabGPT === aba.title ? 'primary' : 'default'"
      :variant="tabGPT === aba.title ? 'elevated' : 'tonal'"
      @click="tabGPT = aba.title"
      class="text-none"
      size="small"
    >
      <VIcon :icon="aba.icon" class="mr-2" size="20" />
      {{ aba.title }}
    </VBtn>
  </div>

  <VWindow v-model="tabGPT" class="mb-4">
    <!-- ==================== ABA: COMPORTAMENTO ==================== -->
    <VWindowItem value="Comportamento">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-3">Identidade e Personalidade da IA</h3>
              <p class="text-caption mb-4">
                Configure como a IA deve se apresentar e se comportar durante os
                atendimentos.
              </p>
            </VCol>

            <VCol cols="12" md="6">
              <AppTextField
                v-model="comportamento.nome"
                label="Nome do Atendente"
                placeholder="Ex: Maria, João, Assistente..."
              />
            </VCol>

            <VCol cols="12" md="6">
              <AppSelect
                v-model="comportamento.genero"
                :items="[
                  { title: 'Neutro', value: 'neutro' },
                  { title: 'Masculino', value: 'masculino' },
                  { title: 'Feminino', value: 'feminino' },
                ]"
                label="Gênero"
                placeholder="Selecione o gênero"
              />
              <p class="text-caption mt-1 mb-0">
                <VIcon icon="tabler-info-circle" size="14" class="mr-1" />
                Define a voz usada quando a IA enviar mensagens de áudio
              </p>
            </VCol>

            <VCol cols="12" md="6">
              <AppTextField
                v-model="comportamento.tom"
                label="Tom de Voz"
                placeholder="Ex: Amigável e acolhedor, Profissional e formal..."
              />
            </VCol>

            <VCol cols="12" md="6">
              <AppSelect
                v-model="comportamento.temperatura"
                :items="[
                  { title: 'Baixa (Objetivo e Direto)', value: 'baixa' },
                  { title: 'Média (Equilibrado)', value: 'media' },
                  { title: 'Alta (Criativo e Empático)', value: 'alta' },
                ]"
                label="Criatividade"
              />
            </VCol>

            <VCol cols="12">
              <AppTextField
                v-model="comportamento.estilo"
                label="Estilo de Comunicação"
                placeholder="Ex: Informal e descontraído, Técnico e detalhado..."
              />
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="comportamento.instrucoesCustomizadas"
                label="Instruções de Comportamento"
                placeholder="Descreva características específicas de como a IA deve se comportar..."
                rows="4"
                active
              />
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <!-- ==================== ABA: EMPRESA ==================== -->
    <VWindowItem value="Empresa">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-3">Informações da Empresa</h3>
              <p class="text-caption mb-4">
                Informações sobre a empresa que a IA usará durante os
                atendimentos.
              </p>
            </VCol>

            <VCol cols="12" md="6">
              <AppTextField
                v-model="empresa.nome"
                label="Nome da Empresa"
                placeholder="Nome da empresa"
              />
            </VCol>

            <VCol cols="12" md="6">
              <AppTextField
                v-model="empresa.localizacao"
                label="Localização/Endereço"
                placeholder="Cidade, Estado"
              />
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="empresa.sobre"
                label="Sobre a Empresa"
                placeholder="Descreva o que a empresa faz, sua história, diferenciais..."
                rows="3"
                active
              />
            </VCol>

            <VCol cols="12" md="6">
              <AppTextField
                v-model="empresa.regiaoAtendida"
                label="Região Atendida"
                placeholder="Ex: São Paulo e região metropolitana"
              />
            </VCol>

            <VCol cols="12" md="6">
              <AppTextField
                v-model="empresa.horarioAtendimento"
                label="Horário de Atendimento"
                placeholder="Ex: Segunda a Sexta, 8h às 18h"
              />
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="empresa.politicas"
                label="Políticas e Regras da Empresa"
                placeholder="Políticas de cancelamento, garantias, formas de pagamento aceitas..."
                rows="4"
                active
              />
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="empresa.informacoesAdicionais"
                label="Informações Adicionais"
                placeholder="Outras informações relevantes que a IA deve saber..."
                rows="3"
                active
              />
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <!-- ==================== ABA: AGENDAMENTOS ==================== -->
    <VWindowItem value="Agendamentos">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-2">Regras de Agendamentos</h3>
              <p class="text-caption mb-4">
                Configure como a IA deve gerenciar agendamentos e serviços.
              </p>
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="agendamentos.instrucoesGerais"
                label="Instruções Gerais de Agendamento"
                placeholder="Descreva as regras gerais para criar agendamentos, como a IA deve abordar o cliente..."
                rows="4"
                active
              />
            </VCol>

            <VCol cols="12">
              <div class="d-flex justify-space-between align-center mb-3">
                <h4 class="text-subtitle-1">Serviços Configurados</h4>
                <VBtn color="primary" size="small" @click="addServico">
                  <VIcon icon="tabler-plus" class="mr-1" />
                  Adicionar Serviço
                </VBtn>
              </div>

              <VAlert
                v-if="
                  !agendamentos.servicos || agendamentos.servicos.length === 0
                "
                color="info"
                variant="tonal"
                class="mb-3"
              >
                <VIcon icon="tabler-info-circle" class="mr-2" />
                Nenhum serviço configurado. Adicione serviços para treinar a IA
                sobre precificação e características.
              </VAlert>

              <VList v-else class="mb-3">
                <VListItem
                  v-for="(servico, index) in agendamentos.servicos"
                  :key="index"
                  class="border rounded mb-2 pa-3"
                >
                  <div class="d-flex flex-column w-100">
                    <div class="d-flex justify-space-between align-center mb-2">
                      <div class="d-flex align-center gap-2">
                        <VIcon :icon="servico.isSub ? 'tabler-arrow-badge-right' : 'tabler-briefcase'" />
                        <div>
                          <h5 class="text-subtitle-2 mb-0">
                            {{ servico.isSub ? '↳ ' : '' }}{{ servico.nome }}
                          </h5>
                          <VChip
                            size="x-small"
                            :color="servico.isSub ? 'secondary' : 'primary'"
                            variant="tonal"
                            class="mt-1"
                          >
                            {{ servico.isSub ? 'Subserviço' : 'Serviço' }}
                          </VChip>
                        </div>
                      </div>
                      <div class="d-flex gap-1">
                        <IconBtn
                          title="Editar regras"
                          color="warning"
                          variant="tonal"
                          @click="editServico(index)"
                        >
                          <VIcon icon="tabler-pencil" />
                        </IconBtn>
                        <IconBtn
                          title="Remover"
                          color="error"
                          variant="tonal"
                          @click="removeServico(index)"
                        >
                          <VIcon icon="tabler-trash" />
                        </IconBtn>
                      </div>
                    </div>

                    <p v-if="servico.descricao" class="text-caption mb-2">
                      {{ servico.descricao }}
                    </p>

                    <!-- Regras de Precificação -->
                    <div v-if="servico.regrasPrecificacao && servico.regrasPrecificacao.length > 0">
                      <VDivider class="my-2" />
                      <p class="text-caption font-weight-medium mb-1">
                        <VIcon icon="tabler-receipt" size="14" class="mr-1" />
                        {{ servico.regrasPrecificacao.length }} 
                        {{ servico.regrasPrecificacao.length === 1 ? 'regra de precificação' : 'regras de precificação' }}
                      </p>
                      <div class="d-flex flex-wrap gap-1 mt-1">
                        <VChip
                          v-for="(regra, rIndex) in servico.regrasPrecificacao.slice(0, 3)"
                          :key="rIndex"
                          size="x-small"
                          color="primary"
                          variant="tonal"
                        >
                          {{ regra.titulo }}: R$ {{ regra.preco?.toFixed(2) || '0,00' }}
                        </VChip>
                        <VChip
                          v-if="servico.regrasPrecificacao.length > 3"
                          size="x-small"
                          color="default"
                          variant="tonal"
                        >
                          +{{ servico.regrasPrecificacao.length - 3 }} mais
                        </VChip>
                      </div>
                    </div>

                    <!-- Fallback para formato antigo -->
                    <div v-else-if="servico.precificacao">
                      <VDivider class="my-2" />
                      <p class="text-caption mb-0">
                        <VIcon icon="tabler-currency-real" size="14" class="mr-1" />
                        {{ servico.precificacao }}
                      </p>
                    </div>
                  </div>
                </VListItem>
              </VList>
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="agendamentos.regraDistancia"
                label="Regras de Distância e Deslocamento"
                placeholder="Ex: Adicionar taxa de R$ 50 para distâncias acima de 20km, não atender fora da região metropolitana..."
                rows="3"
                active
              />
            </VCol>

            <VCol cols="12">
              <AppTextarea
                v-model="agendamentos.regraConfirmacao"
                label="Regras de Confirmação"
                placeholder="Como a IA deve confirmar o agendamento antes de finalizar..."
                rows="3"
                active
              />
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <!-- ==================== ABA: DISPONIBILIDADE ==================== -->
    <VWindowItem value="Disponibilidade">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-2">Disponibilidade de Funcionários</h3>
              <p class="text-caption mb-4">
                Configure os horários de trabalho de cada funcionário para que a
                IA verifique disponibilidade.
              </p>
            </VCol>

            <VCol cols="12">
              <VTextField
                v-model="searchQueryFuncionario"
                label="Pesquisar funcionário"
                placeholder="Pesquisar funcionário"
                prepend-inner-icon="tabler-search"
                clearable
                variant="solo-filled"
              />
              <VList>
                <VListItem
                  v-for="funcionario in funcionariosDisponiveis.filter(
                    (f) =>
                      !searchQueryFuncionario ||
                      f?.fullName
                        ?.toLowerCase()
                        ?.includes(searchQueryFuncionario?.toLowerCase() || '')
                  )"
                  :key="funcionario.id"
                  class="border rounded mb-2"
                >
                  <template #prepend>
                    <!-- <VIcon icon="tabler-user" class="mr-2" /> -->

                    <VAvatar
                      :color="funcionario.avatar ? undefined : 'primary'"
                      :variant="funcionario.avatar ? undefined : 'tonal'"
                    >
                      <VImg
                        v-if="funcionario.avatar"
                        :src="funcionario.avatar"
                        cover
                      />
                      <VIcon v-else icon="tabler-user" />
                    </VAvatar>
                  </template>

                  <VListItemTitle>{{ funcionario.fullName }}</VListItemTitle>
                  <VListItemSubtitle>
                    {{
                      disponibilidade.funcionarios.find(
                        (f) => f.fun_id === funcionario.id
                      )
                        ? "Configurado"
                        : "Não configurado"
                    }}
                  </VListItemSubtitle>

                  <template #append>
                    <VBtn
                      size="small"
                      color="primary"
                      @click="editDisponibilidadeFuncionario(funcionario)"
                    >
                      <VIcon icon="tabler-clock" class="mr-1" />
                      Configurar
                    </VBtn>
                  </template>
                </VListItem>
              </VList>
            </VCol>

            <VCol cols="12">
              <VDivider class="my-4" />
              <h3 class="text-h6 mb-2">Datas Bloqueadas</h3>
              <p class="text-caption mb-4">
                Adicione feriados e outras datas que não devem estar disponíveis
                para agendamento.
              </p>

              <VBtn
                color="primary"
                size="small"
                @click="addDataBloqueada"
                class="mb-3 text-none"
              >
                <VIcon icon="tabler-plus" class="mr-1" />
                Adicionar bloqueio de data
              </VBtn>

              <VList
                v-if="
                  disponibilidade.datasBloqueadas &&
                  disponibilidade.datasBloqueadas.length > 0
                "
              >
                <VListItem
                  v-for="(data, index) in disponibilidade.datasBloqueadas"
                  :key="index"
                  class="border rounded mb-2"
                >
                  <template #prepend>
                    <VIcon
                      icon="tabler-calendar-x"
                      class="mr-2"
                      color="error"
                    />
                  </template>

                  <VListItemTitle>{{ data.data }}</VListItemTitle>
                  <VListItemSubtitle>{{ data.descricao }}</VListItemSubtitle>

                  <template #append>
                    <IconBtn
                      title="Excluir data bloqueada"
                      color="error"
                      variant="tonal"
                      @click="removeDataBloqueada(index)"
                    >
                      <VIcon icon="tabler-trash" />
                    </IconBtn>
                  </template>
                </VListItem>
              </VList>

              <VAlert v-else color="info" variant="tonal">
                Nenhuma data bloqueada configurada
              </VAlert>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <!-- ==================== ABA: PROTEÇÃO ==================== -->
    <VWindowItem value="Proteção">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-2">Proteção e Segurança</h3>
              <p class="text-caption mb-4">
                Configure proteções contra uso indevido da IA e limitações de
                escopo.
              </p>
            </VCol>

            <VCol cols="12">
              <VSwitch
                v-model="protecao.ativo"
                color="primary"
                inset
              >
            <template #label>
              <div>
                <span>Ativar Proteção Contra Prompt Injection</span>
                <p class="text-caption mb-0">
                  Quando ativado, a IA será instruída a ignorar tentativas de
                  modificar seu comportamento e manterá o foco apenas no
                  atendimento.
                </p>
              </div>
            </template>
            </VSwitch>
  
            </VCol>

            <VCol cols="12" v-if="protecao.ativo">
              <VAlert color="success" variant="tonal" class="mb-4">
                <VIcon icon="tabler-shield-check" class="mr-2" />
                <strong>Proteções Ativas:</strong>
                <ul class="mt-2">
                  <li>Não revela que é uma IA</li>
                  <li>Ignora comandos de "ignorar instruções anteriores"</li>
                  <li>Não responde perguntas fora do escopo</li>
                  <li>Não compartilha dados de outros clientes</li>
                </ul>
              </VAlert>

              <AppTextarea
                v-model="protecao.instrucoesAdicionais"
                label="Instruções Adicionais de Segurança"
                placeholder="Adicione regras personalizadas de segurança..."
                rows="4"
                active
              />
            </VCol>

            <VCol cols="12" v-else>
              <VAlert color="warning" variant="tonal">
                <VIcon icon="tabler-alert-triangle" class="mr-2" />
                <strong>Atenção:</strong> Com a proteção desativada, a IA pode
                ser mais suscetível a manipulações e uso indevido.
              </VAlert>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <!-- ==================== ABA: ÁUDIO ==================== -->
    <VWindowItem value="Áudio">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-2">Comunicação por Áudio</h3>
              <p class="text-caption mb-4">
                Configure como a IA deve se comportar ao enviar e receber
                áudios. O áudio é gerado pelo ElevenLabs.
              </p>
            </VCol>

            <VCol cols="12">
              <VSwitch
                v-model="audio.ativo"
                label="Ativar Resposta por Áudio"
                color="primary"
                inset
              >
              <template #label>
                <div>
                  <span>Ativar Resposta por Áudio</span>
                  <p class="text-caption mb-0">
                    Quando ativado, a IA poderá alternar entre texto e áudio nas
                    respostas.
                  </p>
                </div>
              </template>
              </VSwitch>
            </VCol>

            <VCol cols="12" v-if="audio.ativo">
              <!-- ========== SELEÇÃO DE VOZ ========== -->
              <VDivider class="my-4" />
              <div class="d-flex justify-space-between align-center mb-3">
                <div>
                  <h4 class="text-subtitle-1 mb-1">
                    <VIcon icon="tabler-microphone" class="mr-1" />
                    Escolha a Voz
                  </h4>
                  <p class="text-caption mb-0">
                    Selecione uma voz do ElevenLabs para o atendente virtual
                  </p>
                </div>
                <VBtn
                  size="small"
                  color="primary"
                  variant="tonal"
                  @click="getElevenLabsVoices()"
                  :loading="loadingVoices"
                >
                  <VIcon icon="tabler-refresh" class="mr-1" />
                  Atualizar Vozes
                </VBtn>
              </div>

              <!-- Abas de tipo de voz -->
              <div class="d-flex flex-wrap gap-2 mb-4 align-center">
                <VBtn
                  :color="voiceTab === 'default' ? 'primary' : 'default'"
                  :variant="voiceTab === 'default' ? 'elevated' : 'tonal'"
                  size="small"
                  @click="voiceTab = 'default'"
                >
                  <VIcon icon="tabler-star" class="mr-1" size="18" />
                  Vozes Padrão
                </VBtn>
                <VBtn
                  :color="voiceTab === 'community' ? 'primary' : 'default'"
                  :variant="voiceTab === 'community' ? 'elevated' : 'tonal'"
                  size="small"
                  @click="voiceTab = 'community'"
                >
                  <VIcon icon="tabler-users" class="mr-1" size="18" />
                  Vozes da Comunidade
                </VBtn>

                <VSpacer />

                <!-- Switch para filtrar vozes gratuitas -->
                <VSwitch
                  v-model="freeVoicesOnly"
                  color="success"
                  density="compact"
                  hide-details
                  inset
                >
                  <template #label>
                    <div class="d-flex align-center">
                      <VIcon icon="tabler-free-rights" size="18" class="mr-1" />
                      <span class="text-body-2">Apenas gratuitas</span>
                    </div>
                  </template>
                </VSwitch>
              </div>

              <VAlert
                v-if="voiceTab === 'community'"
                color="warning"
                variant="tonal"
                class="mb-3"
                density="compact"
              >
                <VIcon icon="tabler-alert-triangle" size="18" class="mr-1" />
                <span class="text-caption">
                  <strong>Atenção:</strong> Contas gratuitas do ElevenLabs não podem usar vozes da comunidade via API.
                  Para usar vozes da comunidade, é necessário fazer upgrade do plano no ElevenLabs.
                  <strong>Use as Vozes Padrão para contas gratuitas.</strong>
                </span>
              </VAlert>

              <VAlert
                v-if="!elevenlabsKey"
                key="no-api-key"
                color="warning"
                variant="tonal"
                class="mb-4"
              >
                <VIcon icon="tabler-alert-triangle" class="mr-2" />
                Configure a chave API do ElevenLabs na aba "API" para carregar as vozes disponíveis.
              </VAlert>

              <div v-else-if="elevenlabsVoices.length > 0" key="voices-list">
                <!-- Vozes Femininas -->
                <div v-if="femaleVoices.length > 0" key="female-voices" class="mb-4">
                  <h5 class="text-body-1 font-weight-medium mb-2">
                    <VIcon icon="tabler-venus" size="18" class="mr-1" color="pink" />
                    Vozes Femininas
                  </h5>
                  <div class="d-flex flex-wrap gap-2">
                    <VCard
                      v-for="(voice, idx) in femaleVoices"
                      :key="voice.voice_id || `female-${idx}`"
                      :class="['voice-card', audio.voiceId === voice.voice_id ? 'voice-selected' : '']"
                      :color="audio.voiceId === voice.voice_id ? 'primary' : undefined"
                      :variant="audio.voiceId === voice.voice_id ? 'tonal' : 'outlined'"
                      width="180"
                      @click="selectVoice(voice.voice_id)"
                    >
                      <VCardText class="pa-3">
                        <div class="d-flex flex-column">
                          <span class="font-weight-medium text-truncate">{{ voice.name }}</span>
                          <span class="text-caption text-truncate">{{ voice.accent || 'Accent' }}</span>
                          <div class="d-flex gap-1 mt-2">
                            <IconBtn
                              :color="previewingVoice === voice.voice_id ? 'error' : 'primary'"
                              variant="tonal"
                              @click.stop="previewVoice(voice.voice_id)"
                              :loading="previewingVoice === voice.voice_id"
                            >
                              <VIcon :icon="previewingVoice === voice.voice_id ? 'tabler-player-stop' : 'tabler-player-play'" size="14" />
                            </IconBtn>
                            <VChip
                              v-if="audio.voiceId === voice.voice_id"
                              size="x-small"
                              color="success"
                            >
                              Selecionada
                            </VChip>
                          </div>
                        </div>
                      </VCardText>
                    </VCard>
                  </div>
                </div>

                <!-- Vozes Masculinas -->
                <div v-if="maleVoices.length > 0" key="male-voices" class="mb-4">
                  <h5 class="text-body-1 font-weight-medium mb-2">
                    <VIcon icon="tabler-mars" size="18" class="mr-1" color="blue" />
                    Vozes Masculinas
                  </h5>
                  <div class="d-flex flex-wrap gap-2">
                    <VCard
                      v-for="(voice, idx) in maleVoices"
                      :key="voice.voice_id || `male-${idx}`"
                      :class="['voice-card', audio.voiceId === voice.voice_id ? 'voice-selected' : '']"
                      :color="audio.voiceId === voice.voice_id ? 'primary' : undefined"
                      :variant="audio.voiceId === voice.voice_id ? 'tonal' : 'outlined'"
                      width="180"
                      @click="selectVoice(voice.voice_id)"
                    >
                      <VCardText class="pa-3">
                        <div class="d-flex flex-column">
                          <span class="font-weight-medium text-truncate">{{ voice.name }}</span>
                          <span class="text-caption text-truncate">{{ voice.accent || 'Accent' }}</span>
                          <div class="d-flex gap-1 mt-2">
                            <IconBtn
                              :color="previewingVoice === voice.voice_id ? 'error' : 'primary'"
                              variant="tonal"
                              @click.stop="previewVoice(voice.voice_id)"
                              :loading="previewingVoice === voice.voice_id"
                            >
                              <VIcon :icon="previewingVoice === voice.voice_id ? 'tabler-player-stop' : 'tabler-player-play'" size="14" />
                            </IconBtn>
                            <VChip
                              v-if="audio.voiceId === voice.voice_id"
                              size="x-small"
                              color="success"
                            >
                              Selecionada
                            </VChip>
                          </div>
                        </div>
                      </VCardText>
                    </VCard>
                  </div>
                </div>

                <!-- Outras Vozes -->
                <div v-if="otherVoices.length > 0" key="other-voices" class="mb-4">
                  <h5 class="text-body-1 font-weight-medium mb-2">
                    <VIcon icon="tabler-gender-bigender" size="18" class="mr-1" color="purple" />
                    Outras Vozes
                  </h5>
                  <div class="d-flex flex-wrap gap-2">
                    <VCard
                      v-for="(voice, idx) in otherVoices"
                      :key="voice.voice_id || `other-${idx}`"
                      :class="['voice-card', audio.voiceId === voice.voice_id ? 'voice-selected' : '']"
                      :color="audio.voiceId === voice.voice_id ? 'primary' : undefined"
                      :variant="audio.voiceId === voice.voice_id ? 'tonal' : 'outlined'"
                      width="180"
                      @click="selectVoice(voice.voice_id)"
                    >
                      <VCardText class="pa-3">
                        <div class="d-flex flex-column">
                          <span class="font-weight-medium text-truncate">{{ voice.name }}</span>
                          <span class="text-caption text-truncate">{{ voice.accent || voice.category }}</span>
                          <div class="d-flex gap-1 mt-2">
                            <IconBtn
                              :color="previewingVoice === voice.voice_id ? 'error' : 'primary'"
                              variant="tonal"
                              @click.stop="previewVoice(voice.voice_id)"
                              :loading="previewingVoice === voice.voice_id"
                            >
                              <VIcon :icon="previewingVoice === voice.voice_id ? 'tabler-player-stop' : 'tabler-player-play'" size="14" />
                            </IconBtn>
                            <VChip
                              v-if="audio.voiceId === voice.voice_id"
                              size="x-small"
                              color="success"
                            >
                              Selecionada
                            </VChip>
                          </div>
                        </div>
                      </VCardText>
                    </VCard>
                  </div>
                </div>

                <VAlert color="info" variant="tonal" class="mt-2">
                  <VIcon icon="tabler-info-circle" class="mr-2" />
                  Clique no botão play para ouvir uma prévia da voz. Clique no card para selecionar.
                </VAlert>
              </div>

              <div v-else-if="loadingVoices" key="loading-voices" class="d-flex justify-center py-4">
                <VProgressCircular indeterminate color="primary" />
              </div>

              <div v-else key="no-voices">
                <VAlert color="info" variant="tonal">
                  <VIcon icon="tabler-info-circle" class="mr-2" />
                  Clique em "Atualizar Vozes" para carregar as vozes disponíveis do ElevenLabs.
                </VAlert>
              </div>

              <!-- ========== ID DE VOZ PERSONALIZADO ========== -->
              <VDivider class="my-4" />
              <div class="mb-4">
                <h4 class="text-subtitle-1 mb-1">
                  <VIcon icon="tabler-id" class="mr-1" />
                  ID de Voz Personalizado
                </h4>
                <p class="text-caption mb-3">
                  Se você tem um ID de voz específico do ElevenLabs, insira aqui.
                  Este ID terá <strong>prioridade</strong> sobre a voz selecionada acima.
                </p>

                <AppTextField
                  v-model="audio.customVoiceId"
                  label="ID da Voz (Voice ID)"
                  placeholder="Ex: 21m00Tcm4TlvDq8ikWAM"
                  clearable
                />

                <VAlert
                  v-if="audio.customVoiceId"
                  color="info"
                  variant="tonal"
                  class="mt-2"
                  density="compact"
                >
                  <VIcon icon="tabler-info-circle" size="18" class="mr-1" />
                  <span class="text-caption">
                    <strong>ID personalizado ativo:</strong> {{ audio.customVoiceId }}
                    <br />
                    Este ID será usado em vez da voz selecionada na lista acima.
                  </span>
                </VAlert>

                <VAlert
                  color="warning"
                  variant="tonal"
                  class="mt-2"
                  density="compact"
                >
                  <VIcon icon="tabler-alert-triangle" size="18" class="mr-1" />
                  <span class="text-caption">
                    <strong>Onde encontrar o Voice ID:</strong> No painel do ElevenLabs, vá em
                    <a href="https://elevenlabs.io/app/voice-lab" target="_blank" class="text-primary">Voice Lab</a>,
                    clique na voz desejada e copie o ID exibido.
                  </span>
                </VAlert>
              </div>

              <!-- ========== INSTRUÇÕES DE VOZ ========== -->
              <VDivider class="my-4" />
              <AppTextarea
                v-model="audio.instrucaoVoz"
                label="Instruções de Voz (Opcional)"
                placeholder="Descreva como a voz deve soar: tom, velocidade, pausas, entonação..."
                rows="3"
                active
              />

              <VAlert color="success" variant="tonal" class="mt-3">
                <VIcon icon="tabler-microphone" class="mr-2" />
                <strong>Dica:</strong> Mensagens de áudio tornam a comunicação mais natural e aumentam
                o engajamento dos clientes, especialmente para negócios que valorizam um atendimento mais pessoal.
              </VAlert>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>

    <!-- ==================== ABA: API ==================== -->
    <VWindowItem value="API">
      <VCard class="mt-4">
        <VCardText>
          <VRow>
            <VCol cols="12">
              <h3 class="text-h6 mb-2">Configurações das APIs</h3>
              <p class="text-caption mb-4">
                Configure as chaves de API do Gemini (Google) e ElevenLabs.
              </p>
            </VCol>

            <VCol cols="12">
              <AppTextField
                type="password"
                v-model="geminiKey"
                label="Chave API do Gemini (Google)"
                placeholder="Insira a chave API do Gemini"
                :rules="[requiredValidator]"
              />
              <VAlert color="info" variant="tonal" class="mt-2">
                <VIcon icon="tabler-info-circle" class="mr-2" />
                <strong>Gemini:</strong> Inteligência artificial da Google para processar texto, imagens, áudios e vídeos.<br />
                Obtenha sua chave em: <a href="https://aistudio.google.com/app/apikey" target="_blank" class="text-primary">Google AI Studio</a>
              </VAlert>
            </VCol>

            <VCol cols="12">
              <AppTextField
                type="password"
                v-model="elevenlabsKey"
                label="Chave API do ElevenLabs"
                placeholder="Insira a chave API do ElevenLabs"
              />
              <VAlert color="info" variant="tonal" class="mt-2">
                <VIcon icon="tabler-info-circle" class="mr-2" />
                <strong>ElevenLabs:</strong> Serviço de Text-to-Speech para gerar áudios realistas a partir de texto.<br />
                Obtenha sua chave em: <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" class="text-primary">ElevenLabs Dashboard</a>
              </VAlert>
            </VCol>

            <VCol cols="12">
              <h3 class="text-h6 mb-2">Estimativa de Custos Mensais</h3>
              <p class="text-caption mb-4">
                Valores aproximados baseados em uso real de atendimento via WhatsApp. 
                Os custos variam conforme o volume de conversas e complexidade das interações.
              </p>

              <VTable>
                <thead>
                  <tr>
                    <th>Volume de Conversas</th>
                    <th>Mensagens Aproximadas</th>
                    <th>Custo Estimado</th>
                    <th>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(estimativa, index) in estimativasCusto" :key="index">
                    <td>
                      <p class="mb-0 font-weight-medium">
                        {{ estimativa.volume }}
                      </p>
                    </td>
                    <td>
                      <p class="mb-0 text-sm">{{ estimativa.mensagens }}</p>
                    </td>
                    <td>
                      <p class="mb-0 font-weight-bold text-primary">
                        {{ estimativa.custo }}
                      </p>
                    </td>
                    <td>
                      <p class="mb-0 text-sm">{{ estimativa.desc }}</p>
                    </td>
                  </tr>
                </tbody>
              </VTable>

              <VAlert color="success" variant="tonal" class="mt-4">
                <VIcon icon="tabler-coin" class="mr-2" />
                <strong>Economia:</strong> Comparado a contratar um atendente humano, 
                o atendente virtual pode reduzir custos em até 80% enquanto oferece disponibilidade 24/7.
              </VAlert>

              <VAlert color="info" variant="tonal" class="mt-3">
                <VIcon icon="tabler-info-circle" class="mr-2" />
                <strong>Nota:</strong> Os valores são estimativas baseadas em conversas médias de 10-20 mensagens. 
                O Gemini oferece generosa cota gratuita e o ElevenLabs tem planos acessíveis para TTS.
              </VAlert>
            </VCol>
          </VRow>
        </VCardText>
      </VCard>
    </VWindowItem>
  </VWindow>

  <div class="d-flex justify-end mt-4">
    <VBtn
      :loading="loading"
      :disabled="loading"
      color="primary"
      @click="updateConfig"
    >
      <VIcon icon="tabler-device-floppy" class="mr-2" />
      Salvar Configurações
    </VBtn>
  </div>

  <!-- ==================== DIALOG: SERVIÇO ==================== -->
  <VDialog v-model="dialogServico" max-width="900px" persistent scrollable>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pt-0"
          title="Configurar Serviço"
          @cancel="dialogServico = false"
        />

        <VRow>
          <VCol cols="12" v-if="servicoEdit.index === undefined">
            <AppSelect
              :model-value="!servicoEdit.servicoId || !servicoEdit.subservicoId ? null : servicoEdit.isSub ? `sub_${servicoEdit.subservicoId}` : `servico_${servicoEdit.servicoId}`"
              @update:model-value="onServicoSelect"
              :items="servicosFormatados.filter(s =>  servicoEdit.searchQuery ? 
              s.title?.toLowerCase()?.includes(servicoEdit.searchQuery?.toLowerCase())
               : true)"
              label="Selecione o Serviço*"
              placeholder="Escolha um serviço do sistema"
              :disabled="servicoEdit.index !== undefined"
            >
              <template #prepend-item>
                <VTextField
                  v-model="servicoEdit.searchQuery"
                  placeholder="Pesquisar serviço"
                  prepend-inner-icon="tabler-search"
                />
              </template>
            </AppSelect>
            <p class="text-caption mt-1 mb-0">
              <VIcon icon="tabler-info-circle" size="14" class="mr-1" />
              {{ servicoEdit.index !== undefined ? 'O serviço não pode ser alterado após criado' : 'Serviços com subserviços aparecem indentados (↳)' }}
            </p>
          </VCol>

          <VCol cols="12" v-if="servicoEdit.servicoId">
            <VAlert color="info" variant="tonal">
              <div class="d-flex align-center">
                <VIcon icon="tabler-briefcase" class="mr-2" />
                <div>
                  <strong>{{ servicoEdit.nome }}</strong>
                  <p class="text-caption mb-0" v-if="servicoEdit.descricao">
                    {{ servicoEdit.descricao }}
                  </p>
                </div>
              </div>
            </VAlert>
          </VCol>

          <VCol cols="12">
            <VDivider class="my-2" />
            <div class="d-flex justify-space-between align-center mb-3">
              <div>
                <h4 class="text-subtitle-1 mb-1">Regras de Precificação*</h4>
                <p class="text-caption mb-0">
                  Crie regras específicas com preços, durações e imagens de exemplo
                </p>
              </div>
              <VBtn
                color="primary"
                size="small"
                @click="addRegra"
              >
                <VIcon icon="tabler-plus" class="mr-1" />
                Nova Regra
              </VBtn>
            </div>

            <VAlert
              v-if="!servicoEdit.regrasPrecificacao || servicoEdit.regrasPrecificacao.length === 0"
              color="warning"
              variant="tonal"
              class="mb-3"
            >
              <VIcon icon="tabler-alert-triangle" class="mr-2" />
              Adicione pelo menos uma regra de precificação
            </VAlert>

            <VList v-else class="mb-3">
              <VListItem
                v-for="(regra, index) in servicoEdit.regrasPrecificacao"
                :key="index"
                class="border rounded mb-2 pa-3"
              >
                <div class="d-flex flex-column w-100">
                  <div class="d-flex justify-space-between align-center mb-2">
                    <h5 class="text-subtitle-2">{{ regra.titulo || `Regra ${index + 1}` }}</h5>
                    <div class="d-flex gap-1">
                      <IconBtn
                        title="Editar regra"
                        color="warning"
                        variant="tonal"
                        @click="editRegra(index)"
                      >
                        <VIcon icon="tabler-pencil" />
                      </IconBtn>
                      <IconBtn
                        title="Excluir regra"
                        color="error"
                        variant="tonal"
                        @click="removeRegra(index)"
                      >
                        <VIcon icon="tabler-trash" />
                      </IconBtn>
                    </div>
                  </div>

                  <div class="text-caption">
                    <div v-if="regra.descricao" class="mb-1">
                      <VIcon icon="tabler-file-text" size="14" class="mr-1" />
                      {{ regra.descricao }}
                    </div>
                    <div class="mb-1">
                      <VIcon icon="tabler-currency-real" size="14" class="mr-1" />
                      <strong>R$ {{ regra.preco?.toFixed(2) || "0,00" }}</strong>
                    </div>
                    <div class="mb-1">
                      <VIcon icon="tabler-clock" size="14" class="mr-1" />
                      {{ regra.duracaoMinutos || 0 }} minutos
                    </div>
                    <div v-if="regra.condicoes" class="mb-1">
                      <VIcon icon="tabler-checklist" size="14" class="mr-1" />
                      {{ regra.condicoes }}
                    </div>
                    <div v-if="regra.imagens && regra.imagens.length > 0">
                      <VIcon icon="tabler-photo" size="14" class="mr-1" />
                      {{ regra.imagens.length }} {{ regra.imagens.length === 1 ? 'imagem' : 'imagens' }}
                    </div>
                  </div>
                </div>
              </VListItem>
            </VList>
          </VCol>

          <VCol cols="12">
            <AppTextarea
              v-model="servicoEdit.observacoes"
              label="Observações Gerais"
              placeholder="Informações adicionais sobre o serviço..."
              rows="2"
              active
            />
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4 gap-2">
          <VBtn color="error" variant="text" @click="dialogServico = false">
            Cancelar
          </VBtn>
          <VBtn
            color="primary"
            @click="saveServico"
            :disabled="!servicoEdit.nome"
          >
            Salvar Serviço
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- ==================== DIALOG: REGRA DE PRECIFICAÇÃO ==================== -->
  <VDialog v-model="dialogRegra" max-width="700px" persistent scrollable>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pt-0"
          title="Regra de Precificação"
          @cancel="dialogRegra = false"
        />

        <VRow>
          <VCol cols="12">
            <AppTextField
              v-model="regraEdit.titulo"
              label="Título da Regra*"
              placeholder="Ex: Sofá 3 lugares com manchas difíceis"
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              v-model="regraEdit.descricao"
              label="Descrição Detalhada"
              placeholder="Descreva sobre essa regra..."
              rows="2"
              active
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model.number="regraEdit.preco"
              label="Preço (R$)*"
              type="number"
              placeholder="0.00"
              step="0.01"
              active
            />
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model.number="regraEdit.duracaoMinutos"
              label="Duração (minutos)*"
              type="number"
              placeholder="60"
              active
            />
          </VCol>

          <VCol cols="12">
            <AppTextarea
              v-model="regraEdit.condicoes"
              label="Condições / Quando Aplicar"
              placeholder="Ex: Quando o cliente mencionar manchas de óleo, tinta ou sujeira pesada"
              rows="2"
              active
            />
            <p class="text-caption mt-1">
              <VIcon icon="tabler-bulb" size="14" class="mr-1" />
              Ajuda a IA entender quando usar esta regra
            </p>
          </VCol>

          <VCol cols="12">
            <VDivider class="my-2" />
            <div class="d-flex justify-space-between align-center mb-3">
              <h5 class="text-subtitle-2">Imagens de Exemplo</h5>
              <VBtn
                size="small"
                color="primary"
                @click="triggerFileInput"
                :loading="uploadingImage"
              >
                <VIcon icon="tabler-upload" class="mr-1" />
                Adicionar Imagens
              </VBtn>
              <input
                ref="fileInputRef"
                type="file"
                accept="image/*"
                multiple
                style="display: none"
                @change="handleImageUpload"
              />
            </div>

            <p class="text-caption mb-3">
              <VIcon icon="tabler-info-circle" size="14" class="mr-1" />
              Adicione fotos de exemplo para ajudar a IA a identificar visualmente o serviço (máx 5MB por imagem)
            </p>

            <div v-if="regraEdit.imagens && regraEdit.imagens.length > 0" class="d-flex flex-wrap gap-2 mb-3">
              <VCard
                v-for="(img, imgIndex) in regraEdit.imagens"
                :key="imgIndex"
                class="position-relative"
                width="120"
              >
                <VImg
                  :src="img.url"
                  height="120"
                  cover
                />
                <IconBtn
                  title="Excluir imagem"
                  color="error"
                  variant="tonal"
                  @click="removeImagem(imgIndex)"
                >
                  <VIcon icon="tabler-trash" />
                </IconBtn>
                <VCardText class="pa-1">
                  <p class="text-caption mb-0 text-truncate">{{ img.name }}</p>
                </VCardText>
              </VCard>
            </div>

            <VAlert
              v-else
              color="info"
              variant="tonal"
            >
              <VIcon icon="tabler-photo-off" class="mr-2" />
              Nenhuma imagem adicionada
            </VAlert>
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4 gap-2">
          <VBtn color="error" variant="text" @click="dialogRegra = false">
            Cancelar
          </VBtn>
          <VBtn
            color="primary"
            @click="saveRegra"
            :disabled="!regraEdit.titulo || !regraEdit.preco"
          >
            Salvar Regra
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- ==================== DIALOG: DISPONIBILIDADE FUNCIONÁRIO ==================== -->
  <VDialog v-model="dialogDisponibilidade" max-width="900px" persistent>
    <VCard v-if="funcEdit">
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pt-0"
          :title="`Disponibilidade - ${funcEdit.fun_nome}`"
          @cancel="dialogDisponibilidade = false"
        />

        <VRow>
          <VCol cols="12">
            <h4 class="text-subtitle-1 mb-3">Configurações Gerais</h4>
          </VCol>

          <VCol cols="12" md="6">
            <AppTextField
              v-model.number="funcEdit.prioridade"
              type="number"
              label="Prioridade*"
              placeholder="1"
              min="1"
              hint="Quanto menor o número, maior a prioridade (1 = mais alta)"
              persistent-hint
            />
          </VCol>

          <VCol cols="12">
            <VDivider class="my-2" />
            <p class="mb-3">Horários de Trabalho</p>
          </VCol>

          <VCol cols="12">
            <VExpansionPanels multiple>
              <VExpansionPanel v-for="dia in diasSemana" :key="dia.value">
                <VExpansionPanelTitle>
                  <VIcon icon="tabler-calendar" class="mr-2" />
                  {{ dia.label }}

                  <VChip
                    :color="funcEdit.horarios[dia.value].ativo ? 'success' : 'warning'"
                    variant="tonal"
                    class="ml-2"
                    label
                  >
                    {{ funcEdit.horarios[dia.value].ativo ? 'Ativo' : 'Inativo' }}
                  </VChip>
                </VExpansionPanelTitle>

                <VExpansionPanelText class="pt-5">
                  <div class="d-flex align-center mb-2">
                    <VSwitch
                      v-model="funcEdit.horarios[dia.value].ativo"
                      :label="dia.label"
                      color="primary"
                      inset
                      hide-details
                    />
                  </div>

                  <div v-if="funcEdit.horarios[dia.value].ativo" class="mt-4">
                    <div
                      v-for="(periodo, pIndex) in funcEdit.horarios[dia.value]
                        .periodos"
                      :key="pIndex"
                      class="d-flex align-center flex-row gap-2 mb-2"
                    >
                      <span>de</span>
                      <VTextField
                        v-model="periodo.inicio"
                        type="time"
                        density="compact"
                        hide-details
                        style="max-width: 120px"
                      />
                      <span>até</span>
                      <VTextField
                        v-model="periodo.fim"
                        type="time"
                        density="compact"
                        hide-details
                        style="max-width: 120px"
                      />
                      <IconBtn
                        title="Excluir período"
                        color="error"
                        variant="tonal"
                        @click="removePeriodo(dia.value, pIndex)"
                      >
                        <VIcon icon="tabler-trash" />
                      </IconBtn>
                    </div>

                    <VBtn
                      size="small"
                      variant="text"
                      color="primary"
                      @click="addPeriodo(dia.value)"
                    >
                      <VIcon icon="tabler-plus" class="mr-1" />
                      Adicionar Período
                    </VBtn>
                  </div>
                </VExpansionPanelText>
              </VExpansionPanel>
            </VExpansionPanels>
          </VCol>

          <VCol cols="12">
            <h4 class="text-subtitle-1 mb-2">Serviços que pode atender</h4>
            <p class="text-caption mb-3">
              <VIcon icon="tabler-info-circle" size="14" class="mr-1" />
              Deixe vazio para permitir todos os serviços. Serviços com ↳ são subserviços.
            </p>

            <VSelect
              v-model="funcEdit.servicos"
              :items="servicosFormatados.filter(s =>  funcEdit.searchQuery ? 
              s.title?.toLowerCase()?.includes(funcEdit.searchQuery?.toLowerCase()) : true)"
              label="Selecione os serviços e subserviços"
              multiple
              chips
              closable-chips
            >
              <template #prepend-item>
                <VTextField
                  v-model="funcEdit.searchQuery"
                  placeholder="Pesquisar serviço"
                  prepend-inner-icon="tabler-search"
                />
              </template>
            </VSelect>
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4 gap-2">
          <VBtn
            color="error"
            variant="text"
            @click="dialogDisponibilidade = false"
          >
            Cancelar
          </VBtn>
          <VBtn color="primary" @click="saveDisponibilidadeFuncionario">
            Salvar
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>

  <!-- ==================== DIALOG: DATA BLOQUEADA ==================== -->
  <VDialog v-model="dialogDataBloqueada" max-width="500px" persistent>
    <VCard>
      <VCardText>
        <AppDrawerHeaderSection
          customClass="pt-0"
          title="Adicionar bloqueio de data"
          @cancel="dialogDataBloqueada = false"
        />

        <VRow>
          <VCol cols="12">
            <AppTextField
              v-model="dataBloqueada.data"
              type="date"
              label="Data*"
            />
          </VCol>

          <VCol cols="12">
            <AppTextField
              v-model="dataBloqueada.descricao"
              label="Descrição*"
              placeholder="Ex: Natal, Feriado Municipal..."
            />
          </VCol>
        </VRow>

        <div class="linha-flex justify-end mt-4 gap-2">
          <VBtn
            color="error"
            variant="text"
            @click="dialogDataBloqueada = false"
          >
            Cancelar
          </VBtn>
          <VBtn
            color="primary"
            @click="saveDataBloqueada"
            :disabled="!dataBloqueada.data || !dataBloqueada.descricao"
          >
            Adicionar
          </VBtn>
        </div>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.voice-card {
  cursor: pointer;
  transition: all 0.2s ease;
}

.voice-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.voice-selected {
  border-width: 2px !important;
}
</style>
