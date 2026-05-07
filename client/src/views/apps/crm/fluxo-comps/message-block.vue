<script setup>
import modeloDialog from "@/views/apps/crm/modeloDialog.vue";
import { QuillEditor } from "@vueup/vue-quill";
import "@vueup/vue-quill/dist/vue-quill.snow.css";
import VariablesSection from './VariablesSection.vue';
import BlockInfoSection from './BlockInfoSection.vue';

const props = defineProps({
  message: {
    type: String,
    required: false,
    default: "",
  },
  modeloSelected: {
    type: Object,
    required: false,
    default: null,
  },
  flowVariables: {
    type: Array,
    default: () => []
  },
  isCampanha: {
    type: Boolean,
    required: false,
    default: false
  },
  media: {
    type: Object,
    required: false,
    default: null
  }
});

const emit = defineEmits(["update:message"]);

const modelos = ref([]);
const loading = ref(false);
const modeloSelecionado = ref(props.modeloSelected ?? null);
const useTemplate = ref(!!props.modeloSelected);
const messageContent = ref(props.message || "");
const viewModeloDialog = ref(false);

// Variáveis para o editor
const variavel = ref(null);
const refQuillEditor = ref(null);
const variaveisItens = ref([]);

// Variáveis para gravação de áudio
const gravando = ref(false);
const audioUrl = ref(null);
const mediaRecorder = ref(null);
const chunks = [];
const timeGravando = ref(0);
const audioBlob = ref(null);
let intervalGravando = null;

// Variáveis para anexos
const filesToSend = ref([]);
const inputFiles = ref(null);

// Variáveis para mídia existente (já salva no servidor)
const existingMediaPath = ref(null);
const existingMediaPaths = ref([]);

// Função para inserir variável no editor
function insertVariableInline(quill, value) {
  if (!value) return;

  // garante foco e seleção atual
  quill.focus();
  let range = quill.getSelection(true);

  // se não tiver seleção, insere no fim (antes do \n terminal)
  const insertAt = range ? range.index : Math.max(0, quill.getLength() - 1);

  const token = `{{${value}}}`;

  // se há texto selecionado, substitui; senão apenas insere
  if (range && range.length > 0) {
    quill.deleteText(insertAt, range.length, "user");
  }

  quill.insertText(insertAt, token, "user");

  // posiciona o caret após o token
  quill.setSelection(insertAt + token.length, 0, "silent");
}

// Configurações do editor Quill
const editorOptions = {
  theme: "snow",
  placeholder: "Escreva o conteúdo da mensagem...",
  modules: {
    toolbar: "#toolbar-message",
  },
};


// Função para inserir variável no editor
const insertVariable = () => {
  let value = variavel.value;
  if (!value) return;

  let quill = refQuillEditor.value?.getQuill();
  if (!quill) return;

  insertVariableInline(quill, value);
  variavel.value = null;
};

// Carregar variáveis
const getVariaveis = async () => {
  try {
    const res = await $api("/disparos/variaveis", {
      method: "GET",
    });

    if (!res) return;

    // Combinar variáveis da API com variáveis do fluxo
    const allVariables = [...res, ...props.flowVariables];
    variaveisItens.value = allVariables;
  } catch (error) {
    console.error("Error fetching variables", error);
    // Se houver erro na API, usar apenas variáveis do fluxo
    variaveisItens.value = props.flowVariables;
  }
};

const getTemplates = async () => {
  loading.value = true;

  try {
    const res = await $api("/templates", {
      method: "GET",
      query: {
        type: "mensagem",
        itemsPerPage: 1000,
      },
    });

    if (!res) return;

    modelos.value = res.templates;
  } catch (error) {
    console.error("Error fetching user data", error, error.response);
    modelos.value = [];
  }
  loading.value = false;
};

// Watch para modelo selecionado
watch(modeloSelecionado, (newVal) => {
  if (newVal) {
    useTemplate.value = true;
    messageContent.value = newVal.content || "";
    emit("update:message", {
      content: newVal.content,
      idModelo: newVal.id,
    });
  }
});

// Watch para conteúdo da mensagem
watch(messageContent, (newVal) => {
  if (!useTemplate.value) {
    emit("update:message", {
      content: newVal,
      idModelo: null,
    });
  }
});

// Watch para mudança entre template e mensagem manual
watch(useTemplate, (newVal) => {
  if (!newVal) {
    modeloSelecionado.value = null;
    emit("update:message", {
      content: messageContent.value,
      idModelo: null,
    });
  } else if (modeloSelecionado.value) {
    emit("update:message", {
      content: modeloSelecionado.value.content,
      idModelo: modeloSelecionado.value.id,
    });
  }
});

// === FUNÇÕES DE GRAVAÇÃO DE ÁUDIO ===
const initTimer = () => {
  timeGravando.value = 0;

  if (intervalGravando) {
    clearInterval(intervalGravando);
  }

  intervalGravando = setInterval(() => {
    timeGravando.value += 1;
  }, 1000);
};

const stopTimer = () => {
  timeGravando.value = 0;
  clearInterval(intervalGravando);
};

const iniciarGravacao = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    let mimeType;
    if (MediaRecorder.isTypeSupported("audio/webm")) {
      mimeType = "audio/webm";
    } else {
      throw new Error("Nenhum formato de gravação suportado");
    }

    mediaRecorder.value = new MediaRecorder(stream, { mimeType });

    mediaRecorder.value.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };

    mediaRecorder.value.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      audioBlob.value = blob;
      audioUrl.value = URL.createObjectURL(blob);
      chunks.length = 0;
    };

    mediaRecorder.value.start();
    gravando.value = true;
    initTimer();
  } catch (err) {
    console.error("Erro ao gravar:", err);
    alert("Não foi possível iniciar gravação: " + err.message);
  }
};

const pararGravacao = () => {
  if (mediaRecorder.value && gravando.value) {
    mediaRecorder.value.stop();
    gravando.value = false;
    stopTimer();
    console.log("Gravação parada.");
  }
};

const cancelarGravacao = () => {
  pararGravacao();
  audioUrl.value = null;
  audioBlob.value = null;
  chunks.length = 0;
};

const formatTime = (seconds) => {
  const min = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const sec = Math.floor(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${min}:${sec}`;
};

// === FUNÇÕES DE ANEXO ===
const handleFileSelect = (event) => {
  const files = Array.from(event.target.files);
  filesToSend.value = files;
  
  console.log("Arquivos selecionados:", files);
};

const removeFile = (index) => {
  filesToSend.value.splice(index, 1);
  if (inputFiles.value) {
    inputFiles.value.value = null;
  }
};

const resolveIconFile = (type) => {
  if (!type) return "tabler-file";

  type = type.toLowerCase();

  if (type.includes("pdf")) return "tabler-file-type-pdf";
  if (type.includes("doc")) return "tabler-file-word";
  if (type.includes("xls")) return "tabler-file-excel";
  if (type.includes("ppt")) return "tabler-file-type-ppt";
  if (type.includes("zip") || type.includes("rar")) return "tabler-file-zip";
  if (type.includes("jpg") || type.includes("jpeg"))
    return "tabler-file-type-jpg";
  if (type.includes("png")) return "tabler-file-type-png";
  if (type.includes("svg")) return "tabler-file-type-svg";
  if (type.includes("audio")) return "tabler-file-music";
  if (type.includes("video")) return "tabler-photo-video";
  if (type.includes("image")) return "tabler-photo";

  return "tabler-file";
};

const resolveIconFromPath = (path) => {
  if (!path) return "tabler-file";
  
  const ext = path.split('.').pop().toLowerCase();
  
  if (['mp3', 'wav', 'ogg', 'webm', 'm4a'].includes(ext)) return "tabler-microphone";
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) return "tabler-photo";
  if (['mp4', 'avi', 'mov', 'webm'].includes(ext)) return "tabler-video";
  if (ext === 'pdf') return "tabler-file-type-pdf";
  
  return "tabler-file";
};

const getFileNameFromPath = (path) => {
  if (!path) return '';
  return path.split('/').pop();
};

const removeExistingMedia = () => {
  existingMediaPath.value = null;
  existingMediaPaths.value = [];
  
  // Emitir atualização sem mídia
  emit("update:message", {
    content: messageContent.value,
    idModelo: useTemplate.value ? modeloSelecionado.value?.id : null,
    files: filesToSend.value,
    audio: audioBlob.value,
    clearMedia: true
  });
};

// Emitir mudanças quando arquivos ou áudio mudam
watch([filesToSend, audioUrl], () => {
  emit("update:message", {
    content: messageContent.value,
    idModelo: useTemplate.value ? modeloSelecionado.value?.id : null,
    files: filesToSend.value,
    audio: audioBlob.value
  });
});

// Inicializar
onMounted(async () => {
  await Promise.all([getTemplates(), getVariaveis()]);
  
  // Se já tem mensagem, não usar template
  if (props.isCampanha) {
    useTemplate.value = true;
    messageContent.value = props.message;
  } else if (props.message && !props.modeloSelected) {
    useTemplate.value = false;
    messageContent.value = props.message;
  }
  
  // Carregar mídia existente se houver
  if (props.media) {
    if (props.media.pathFile) {
      existingMediaPath.value = props.media.pathFile;
    }
    if (props.media.pathFiles && props.media.pathFiles.length > 0) {
      existingMediaPaths.value = props.media.pathFiles;
    }
  }
});
</script>
<template>
  <div>
    <!-- Opção de escolha entre template e mensagem manual -->
    <VRow class="mb-3">
      <VCol cols="12">
        <VBtnToggle
          v-model="useTemplate"
          mandatory
          variant="text"
          color="primary"
          class="w-100"
        >
          <VBtn :value="true" class="flex-grow-1" size="small" variant="text" rounded="lg">
            <VIcon icon="tabler-template" class="me-2" />
            Modelo
          </VBtn>
          <VBtn :value="false" class="flex-grow-1" size="small" variant="text" rounded="lg">
            <VIcon icon="tabler-edit" class="me-2" />
            Mensagem
          </VBtn>
        </VBtnToggle>
      </VCol>
    </VRow>

    <!-- Seleção de Modelo -->
    <div v-if="useTemplate">
      <AppSelect
        v-model="modeloSelecionado"
        :items="modelos"
        item-value="id"
        item-title="name"
        label="Modelo de Mensagem"
        placeholder="Selecione um modelo"
        return-object
      >
        <template #prepend-item>
          <div class="text-center">
            <VBtn
              variant="tonal"
              @click="viewModeloDialog = true"
              class="mx-2 mb-2"
              rounded="lg"
              style="width: 90%; height: 35px"
            >
              <VIcon icon="tabler-plus" />
              Novo Modelo
            </VBtn>
          </div>
        </template>
      </AppSelect>
    </div>

    <!-- Editor de Mensagem Manual -->
    <div v-else>
      <p class="mb-1">Escreva o conteúdo da mensagem.</p>

      <!-- Editor Quill -->
      <div class="inputQP">
        <div id="toolbar-message">
          <!-- Add a bold button -->
          <button class="ql-bold"></button>
          <!-- Add a italic button -->
          <button class="ql-italic"></button>
          <!-- Add a strike button -->
          <button class="ql-strike"></button>

          <AppSelect
            v-model="variavel"
            :items="variaveisItens"
            @update:modelValue="insertVariable"
            item-title="title"
            item-value="value"
            placeholder="Inserir variável"
            class="select-var"
          />
        </div>
        <QuillEditor
          v-model:content="messageContent"
          :options="editorOptions"
          class="inputQP mb-3"
          contentType="html"
          ref="refQuillEditor"
        />
      </div>

      <!-- Controles de Mídia -->
      <div class="mt-3 d-flex gap-2 align-center">
        <!-- Input de arquivos (oculto) -->
        <input
          class="d-none"
          type="file"
          ref="inputFiles"
          multiple
          accept="image/*,video/*,audio/*,application/pdf,.doc,.docx,.xls,.xlsx"
          @change="handleFileSelect"
        />

        <!-- Botão de anexar arquivo -->
        <VBtn
          v-if="!gravando && !audioUrl"
          size="small"
          variant="tonal"
          color="primary"
          @click="inputFiles.click()"
        >
          <VIcon icon="tabler-paperclip" class="me-2" />
          Anexar Mídia
        </VBtn>

        <!-- Botão de gravar áudio -->
        <VBtn
          v-if="!gravando && !audioUrl && filesToSend.length === 0"
          size="small"
          variant="tonal"
          color="secondary"
          @click="iniciarGravacao"
        >
          <VIcon icon="tabler-microphone" class="me-2" />
          Gravar Áudio
        </VBtn>

        <!-- Controles durante gravação -->
        <div v-if="gravando" class="d-flex align-center gap-2">
          <VBtn
            size="small"
            variant="tonal"
            color="error"
            @click="cancelarGravacao"
          >
            <VIcon icon="tabler-x" class="me-1" />
            Cancelar
          </VBtn>

          <VChip color="error" variant="elevated">
            <VIcon icon="tabler-microphone" class="me-1" />
            {{ formatTime(timeGravando) }}
          </VChip>

          <VBtn
            size="small"
            variant="elevated"
            color="success"
            @click="pararGravacao"
          >
            <VIcon icon="tabler-check" class="me-1" />
            Finalizar
          </VBtn>
        </div>

        <!-- Preview do áudio gravado -->
        <div v-if="audioUrl && !gravando" class="d-flex align-center gap-2">
          <audio :src="audioUrl" controls class="flex-grow-1"></audio>
          <VBtn
            size="small"
            variant="tonal"
            color="error"
            icon
            @click="cancelarGravacao"
          >
            <VIcon icon="tabler-trash" />
          </VBtn>
        </div>
      </div>

      <!-- Mídia existente (já salva) -->
      <div v-if="existingMediaPath || existingMediaPaths.length > 0" class="mt-3">
        <p class="text-caption mb-2">Mídia salva:</p>
        <div class="d-flex flex-wrap gap-2">
          <!-- Mídia única -->
          <VChip
            v-if="existingMediaPath"
            closable
            @click:close="removeExistingMedia"
            color="success"
            variant="elevated"
          >
            <VIcon :icon="resolveIconFromPath(existingMediaPath)" class="me-2" size="18" />
            {{ getFileNameFromPath(existingMediaPath) }}
          </VChip>
          
          <!-- Múltiplas mídias -->
          <VChip
            v-for="(path, index) in existingMediaPaths"
            :key="index"
            closable
            @click:close="removeExistingMedia"
            color="success"
            variant="elevated"
          >
            <VIcon :icon="resolveIconFromPath(path)" class="me-2" size="18" />
            {{ getFileNameFromPath(path) }}
          </VChip>
        </div>
      </div>
      
      <!-- Lista de arquivos anexados (novos) -->
      <div v-if="filesToSend.length > 0" class="mt-3">
        <p class="text-caption mb-2">Arquivos anexados:</p>
        <div class="d-flex flex-wrap gap-2">
          <VChip
            v-for="(file, index) in filesToSend"
            :key="index"
            closable
            @click:close="removeFile(index)"
            color="primary"
            variant="tonal"
          >
            <VIcon :icon="resolveIconFile(file.type)" class="me-2" size="18" />
            {{ file.name }}
          </VChip>
        </div>
      </div>
    </div>

    <!-- Variáveis Disponíveis -->
    <VariablesSection :flow-variables="props.flowVariables" />

    <!-- Informações -->
    <BlockInfoSection
      title="Como funciona"
      :items="[
        { icon: 'tabler-message', color: 'primary', text: 'Envia uma mensagem de texto, áudio ou mídia ao cliente' },
        { icon: 'tabler-template', color: 'info', text: 'Pode usar modelos de mensagem pré-configurados' },
        { icon: 'tabler-variable', color: 'success', text: 'Suporta variáveis dinâmicas no conteúdo (Ex: {{cliente_nome}})' },
        { icon: 'tabler-paperclip', color: 'warning', text: 'Permite anexar arquivos, imagens, vídeos e áudios gravados' },
      ]"
      hint="Use o seletor de variáveis na barra de ferramentas do editor para inserir variáveis diretamente no texto."
    />
  </div>

  <modeloDialog
    :isDrawerOpen="viewModeloDialog"
    @update:isDrawerOpen="viewModeloDialog = $event"
    :modeloData="modeloSelecionado"
    @updateModelo="getTemplates(); modeloSelecionado = $event"
    :flowVariables="flowVariables"
  />
</template>
