<script setup>
import Vue3DraggableResizable from "vue3-draggable-resizable";
import "vue3-draggable-resizable/dist/Vue3DraggableResizable.css";

const isMobile = window.innerWidth < 768;

import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker?worker&url";
GlobalWorkerOptions.workerSrc = workerSrc;

defineExpose({ Vue3DraggableResizable });

const props = defineProps({
  isDrawerOpen: { type: Boolean, required: true, default: false },
  contratoData: { type: Object, default: null },
});

const emit = defineEmits(["update:isDrawerOpen", "update"]);

const handleDrawerModelValueUpdate = (val) => {
  emit("update:isDrawerOpen", val);
  if (!val) {
    clearSignatureCanvas();
    box.x = 150;
    box.y = 50;
    box.w = 265;
    box.h = 85;
    loadingAssinar.value = false;
    signatureData.value = null;
    blobSignature.value = null;
    stepDigital.value = 1;
  }
};

const closeNavigationDrawer = () => handleDrawerModelValueUpdate(false);

const { setAlert } = useAlert();

const loadingAssinar = ref(false);

const box = reactive({ x: 150, y: 50, w: 265, h: 85 });

// PDF.js refs
const pdfDoc = ref(null);
const totalPages = ref(0);
const pagesArray = ref([]);
const pdfViewerRef = ref(null);
const scale = ref(1);
const MIN_SCALE = 0.5;
const MAX_SCALE = 3;
function clamp(v) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, v));
}

const pageCanvases = {};
const renderizando = ref(false);
const renderizado = ref(false);
const signatureCanvas = ref(null);
const blobSignature = ref(null);

const isDrawing = ref(false);
const signatureData = ref(null);
let ctxSignature = null;

let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

function initSignatureCanvas() {
  try {
    const canvas = signatureCanvas.value;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;
    canvas.width = cssWidth * dpr;
    canvas.height = cssHeight * dpr;
    ctxSignature = canvas.getContext("2d");
    ctxSignature.scale(dpr, dpr);
    ctxSignature.lineWidth = 2;
    ctxSignature.lineCap = "round";
    ctxSignature.strokeStyle = "#000";
    ctxSignature.clearRect(0, 0, canvas.width, canvas.height);
  } catch (error) {
    console.error("Erro ao inicializar canvas:", error);
  }
}

function getSignaturePos(e) {
  const canvas = signatureCanvas.value;
  const rect = canvas.getBoundingClientRect();
  const clientX = e.touches?.[0]?.clientX ?? e.clientX;
  const clientY = e.touches?.[0]?.clientY ?? e.clientY;
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function startDrawing(e) {
  isDrawing.value = true;
  [minX, minY] = [Infinity, Infinity];
  [maxX, maxY] = [-Infinity, -Infinity];
  const { x, y } = getSignaturePos(e);
  ctxSignature.beginPath();
  ctxSignature.moveTo(x, y);
  minX = maxX = x;
  minY = maxY = y;
}

function draw(e) {
  if (!isDrawing.value) return;
  const { x, y } = getSignaturePos(e);
  ctxSignature.lineTo(x, y);
  ctxSignature.stroke();
  if (x < minX) minX = x;
  if (x > maxX) maxX = x;
  if (y < minY) minY = y;
  if (y > maxY) maxY = y;
}

function stopDrawing() {
  if (!isDrawing.value || !ctxSignature) return;
  isDrawing.value = false;
  ctxSignature.closePath();
  blobSignature.value = signatureCanvas.value.toDataURL("image/png");
}

function clearSignatureCanvas() {
  if (!signatureCanvas.value) return;
  ctxSignature?.clearRect(0, 0, signatureCanvas.value.width, signatureCanvas.value.height);
  signatureData.value = null;
  blobSignature.value = null;
  stepDigital.value = 1;
  minX = Infinity; minY = Infinity; maxX = -Infinity; maxY = -Infinity;
}

const storePageCanvas = (page, el) => {
  if (el) pageCanvases[page] = el;
};

const getNormalizedCoords = () => {
  const canvas = pageCanvases[totalPages.value];
  if (!canvas) return null;
  const { width: cssW, height: cssH } = canvas.getBoundingClientRect();
  return {
    page: totalPages.value,
    xNorm: box.x / cssW,
    yNorm: box.y / cssH,
    wNorm: box.w / cssW,
    hNorm: box.h / cssH,
  };
};

async function renderAllPages() {
  if (!pdfDoc.value || renderizando.value) return;
  renderizando.value = true;
  renderizado.value = false;

  for (let i = 1; i <= totalPages.value; i++) {
    const page = await pdfDoc.value.getPage(i);
    const canvasEl = pageCanvases[i];
    if (!canvasEl) continue;

    const divCtxSign = document.querySelector(`#page-contrato-${i}-signature`);
    const context = canvasEl.getContext("2d");
    const viewport = page.getViewport({ scale: scale.value });
    const outputScale = window.devicePixelRatio || 1;
    canvasEl.width = viewport.width * outputScale;
    canvasEl.height = viewport.height * outputScale;
    canvasEl.style.width = `${viewport.width}px`;
    canvasEl.style.height = `${viewport.height}px`;

    if (divCtxSign) {
      divCtxSign.style.width = `${viewport.width}px`;
      divCtxSign.style.height = `${viewport.height}px`;
    }

    const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
    await page.render({ canvasContext: context, viewport, transform }).promise;
  }

  renderizando.value = false;
  renderizado.value = true;
}

const renderPDF = async () => {
  const url = props.contratoData?.pdf_gerado_url || props.contratoData?.conteudo_pdf_url;
  if (!url) return;

  const loadingTask = getDocument({ url });
  const rawPdfDoc = await loadingTask.promise;
  pdfDoc.value = markRaw(rawPdfDoc);
  totalPages.value = pdfDoc.value.numPages;
  pagesArray.value = Array.from({ length: totalPages.value }, (_, i) => i + 1);
  await nextTick();
  await renderAllPages();
};

watch(scale, () => {
  if (pdfDoc.value) renderAllPages();
});

watch(() => props.isDrawerOpen, async (val) => {
  if (val) {
    await nextTick();
    initSignatureCanvas();
  }
}, { immediate: true });

const stepDigital = ref(1);

const nextStepDigital = () => {
  if (stepDigital.value < 2) {
    stepDigital.value++;
    if (stepDigital.value === 1) {
      nextTick(() => initSignatureCanvas());
    } else {
      nextTick(() => renderPDF());
    }
  } else {
    assinarDigitalmente();
  }
};

const assinarDigitalmente = async () => {
  if (!blobSignature.value) {
    setAlert("Desenhe sua assinatura antes de enviar!", "error", "tabler-alert-circle", 5000);
    return;
  }

  try {
    loadingAssinar.value = true;
    const coords = getNormalizedCoords();
    if (!coords) return;

    const croppedBlob = await fetch(blobSignature.value);
    const blob = await croppedBlob.blob();
    const fileAssinatura = new File([blob], "assinatura.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("assinatura", fileAssinatura);
    formData.append("assinaturaCoordinates", JSON.stringify(coords));

    const res = await $api(`/contratos/assinar-empresa/${props.contratoData.id}`, {
      method: "POST",
      body: formData,
    });

    if (!res) return;
    setAlert("Contrato assinado com sucesso!", "success", "tabler-check", 5000);
    clearSignatureCanvas();
    emit("update");
    closeNavigationDrawer();
  } catch (err) {
    console.error("Erro ao assinar:", err.response || err);
    setAlert(err?.response?._data?.message || "Erro ao assinar contrato", "error", "tabler-alert-circle", 5000);
  }
  loadingAssinar.value = false;
};

function updateBox(newProps) {
  box.x = newProps.x || box.x;
  box.y = newProps.y || box.y;
}
</script>

<template>
  <VDialog
    fullscreen
    :model-value="props.isDrawerOpen"
    @update:model-value="handleDrawerModelValueUpdate"
    v-if="contratoData"
    persistent
  >
    <VCard rounded="0">
      <VCardText
        class="d-flex flex-column justify-center"
        :style="!isMobile ? 'max-width: 1000px; min-width: 1000px; margin: 0 auto' : ''"
      >
        <h4 class="text-center text-h6 mb-4">
          Assinar Contrato<br>
          <span style="max-width: 400px">{{ contratoData?.numero ? `Contrato ${contratoData.numero}` : '' }}</span>
        </h4>

        <div>
          <div v-if="stepDigital <= 1">
            <p class="mb-3 text-center">Faça sua assinatura na área abaixo.</p>
            <div class="d-flex flex-column align-center justify-center">
              <canvas
                ref="signatureCanvas"
                class="signature-overlay elevation-2 rounded"
                style="width: 100%; max-width: 600px; height: 250px; touch-action: none; border: 1px solid #ccc;"
                @mousedown="startDrawing"
                @mousemove="draw"
                @mouseup="stopDrawing"
                @mouseleave="stopDrawing"
                @touchstart.prevent="startDrawing"
                @touchmove.prevent="draw"
                @touchend.prevent="stopDrawing"
              ></canvas>
            </div>
          </div>

          <div v-else>
            <p class="mb-3 text-center">Arraste e posicione a área da assinatura na última página do PDF:</p>

            <div class="d-flex flex-row align-center justify-center mb-3">
              <div class="rounded-pill elevation-2 d-flex flex-row align-center justify-center">
                <IconBtn color="primary" @click="scale = clamp(scale - 0.5)" :disabled="scale <= MIN_SCALE || renderizando">
                  <VIcon icon="tabler-minus" size="20" />
                </IconBtn>
                <span class="mx-2">{{ (scale * 100).toFixed(0) }}%</span>
                <IconBtn color="primary" @click="scale = clamp(scale + 0.5)" :disabled="scale >= MAX_SCALE || renderizando">
                  <VIcon icon="tabler-plus" size="20" />
                </IconBtn>
              </div>
            </div>

            <div class="pdf-viewer-container border rounded position-relative" ref="pdfViewerRef" style="height: 450px; overflow: auto">
              <div
                v-for="pg in pagesArray"
                :key="pg"
                class="pdf-page-container position-relative mb-3"
                :style="`display: flex; justify-content: ${isMobile ? 'start' : 'center'}; position: relative;`"
                :id="`page-contrato-${pg}`"
              >
                <canvas :ref="(el) => storePageCanvas(pg, el)"></canvas>
                <div :id="`page-contrato-${pg}-signature`" class="position-absolute">
                  <vue3-draggable-resizable
                    v-if="pg === totalPages && renderizado"
                    v-model:x="box.x"
                    v-model:y="box.y"
                    v-model:w="box.w"
                    v-model:h="box.h"
                    :initW="235"
                    :initH="85"
                    :resizable="true"
                    :lockAspectRatio="true"
                    :parent="true"
                    @resizing="updateBox"
                    @dragging="updateBox"
                    :handles="['tl', 'tr', 'bl', 'br']"
                    class="signature-box-digital"
                  >
                    <div style="width: 100%; height: 100%; pointer-events: none" class="d-flex justify-center align-center flex-column">
                      <VImg :src="blobSignature" class="signature-preview" style="width: 100%; height: 100%" />
                    </div>
                  </vue3-draggable-resizable>
                </div>
              </div>
            </div>
          </div>

          <VRow class="my-3 justify-center">
            <VCol cols="12" md="6" v-if="stepDigital == 1">
              <VBtn color="primary" variant="outlined" @click="clearSignatureCanvas" class="w-100" :disabled="loadingAssinar">
                <VIcon icon="tabler-x" class="mr-2" /> Limpar Assinatura
              </VBtn>
            </VCol>
            <VCol cols="12" md="6">
              <VBtn color="primary" @click="nextStepDigital()" class="w-100" :loading="loadingAssinar">
                <VIcon icon="tabler-check" class="mr-2" />
                {{ stepDigital == 1 ? 'Avançar' : 'Assinar' }}
              </VBtn>
            </VCol>
          </VRow>
        </div>

        <VBtn
          color="primary"
          variant="text"
          @click="stepDigital > 1 ? (stepDigital = 0, nextStepDigital()) : closeNavigationDrawer()"
          class="w-100"
        >
          <VIcon icon="tabler-arrow-back" class="mr-2" /> Voltar
        </VBtn>
      </VCardText>
    </VCard>
  </VDialog>
</template>

<style scoped>
.signature-box-digital {
  box-shadow: rgb(255, 153, 0) 0px 0px 10px 0px;
  overflow: hidden;
  text-align: center;
  z-index: 9999999;
  cursor: move;
  border: 1px dashed rgb(150, 150, 150) !important;
  color: black;
}
.pdf-viewer-container {
  background: #f9f9f9;
  padding: 10px;
}
.pdf-page-container {
  position: relative;
  display: flex;
  justify-content: center;
}
@media (max-width: 600px) {
  .pdf-viewer-container { height: 400px; }
  .pdf-page-container { padding-left: 10px; }
}
</style>
