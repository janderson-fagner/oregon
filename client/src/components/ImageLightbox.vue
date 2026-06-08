<script setup>
/**
 * Lightbox de imagem completo: zoom (scroll do mouse, botões, duplo-clique e
 * pinça no touch), pan (arrastar quando ampliado), rotação, reset, download e
 * fechamento (X, Esc ou clique no fundo). Renderizado via Teleport no body para
 * não ser cortado por containers com overflow.
 *
 * Uso: <ImageLightbox v-model="aberto" :src="url" />
 */
import { ref, watch, computed, onBeforeUnmount } from "vue"

const props = defineProps({
  modelValue: { type: Boolean, default: false },
  src: { type: String, default: "" },
  alt: { type: String, default: "" },
})

const emit = defineEmits(["update:modelValue"])

const MIN = 1
const MAX = 6
const STEP = 0.3

const scale = ref(1)
const rotation = ref(0)
const tx = ref(0)
const ty = ref(0)
const dragging = ref(false)
const loaded = ref(false)
const errored = ref(false)

let startX = 0
let startY = 0
let startTx = 0
let startTy = 0

const reset = () => {
  scale.value = 1
  rotation.value = 0
  tx.value = 0
  ty.value = 0
}

const close = () => emit("update:modelValue", false)

const zoomIn = () => {
  scale.value = Math.min(MAX, +(scale.value + STEP).toFixed(2))
}

const zoomOut = () => {
  scale.value = Math.max(MIN, +(scale.value - STEP).toFixed(2))
  if (scale.value === 1) {
    tx.value = 0
    ty.value = 0
  }
}

const rotate = () => {
  rotation.value = (rotation.value + 90) % 360
}

const onWheel = e => {
  if (e.deltaY < 0) zoomIn()
  else zoomOut()
}

const onDblClick = () => {
  if (scale.value > 1) reset()
  else scale.value = 2.5
}

// ---- Pan com mouse ----
const onMouseDown = e => {
  if (scale.value <= 1) return
  dragging.value = true
  startX = e.clientX
  startY = e.clientY
  startTx = tx.value
  startTy = ty.value
}

const onMouseMove = e => {
  if (!dragging.value) return
  tx.value = startTx + (e.clientX - startX)
  ty.value = startTy + (e.clientY - startY)
}

const onMouseUp = () => {
  dragging.value = false
}

// ---- Pinça + pan no touch ----
let pinchStartDist = 0
let pinchStartScale = 1

const distancia = touches => {
  const [a, b] = touches

  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
}

const onTouchStart = e => {
  if (e.touches.length === 2) {
    pinchStartDist = distancia(e.touches)
    pinchStartScale = scale.value
  } else if (e.touches.length === 1 && scale.value > 1) {
    dragging.value = true
    startX = e.touches[0].clientX
    startY = e.touches[0].clientY
    startTx = tx.value
    startTy = ty.value
  }
}

const onTouchMove = e => {
  if (e.touches.length === 2) {
    const d = distancia(e.touches)
    if (pinchStartDist > 0) {
      scale.value = Math.min(
        MAX,
        Math.max(MIN, +(pinchStartScale * (d / pinchStartDist)).toFixed(2)),
      )
    }
  } else if (e.touches.length === 1 && dragging.value) {
    tx.value = startTx + (e.touches[0].clientX - startX)
    ty.value = startTy + (e.touches[0].clientY - startY)
  }
}

const onTouchEnd = e => {
  dragging.value = false
  if (e.touches.length < 2) pinchStartDist = 0
  if (scale.value === 1) {
    tx.value = 0
    ty.value = 0
  }
}

const download = () => {
  if (!props.src) return
  const a = document.createElement("a")

  a.href = props.src
  a.download = props.src.split("/").pop() || "imagem"
  a.target = "_blank"
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  a.remove()
}

const onKey = e => {
  if (!props.modelValue) return
  if (e.key === "Escape") close()
  else if (e.key === "+" || e.key === "=") zoomIn()
  else if (e.key === "-" || e.key === "_") zoomOut()
  else if (e.key.toLowerCase() === "r") rotate()
  else if (e.key === "0") reset()
}

watch(
  () => props.modelValue,
  v => {
    if (v) {
      reset()
      loaded.value = false
      errored.value = false
      window.addEventListener("keydown", onKey)
      document.documentElement.style.overflow = "hidden"
    } else {
      window.removeEventListener("keydown", onKey)
      document.documentElement.style.overflow = ""
    }
  },
)

onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKey)
  document.documentElement.style.overflow = ""
})

const transform = computed(
  () =>
    `translate(${tx.value}px, ${ty.value}px) scale(${scale.value}) rotate(${rotation.value}deg)`,
)
</script>

<template>
  <Teleport to="body">
    <Transition name="lb-fade">
      <div
        v-if="modelValue"
        class="lb-overlay"
        @click.self="close"
        @wheel.prevent="onWheel"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @mouseleave="onMouseUp"
        @touchmove.prevent="onTouchMove"
        @touchend="onTouchEnd"
      >
        <!-- Barra de ferramentas -->
        <div
          class="lb-toolbar"
          @click.stop
        >
          <IconBtn
            class="lb-btn"
            @click="zoomOut"
          >
            <VIcon icon="tabler-zoom-out" />
          </IconBtn>
          <span class="lb-zoom-label">{{ Math.round(scale * 100) }}%</span>
          <IconBtn
            class="lb-btn"
            @click="zoomIn"
          >
            <VIcon icon="tabler-zoom-in" />
          </IconBtn>
          <IconBtn
            class="lb-btn"
            @click="rotate"
          >
            <VIcon icon="tabler-rotate-clockwise" />
          </IconBtn>
          <IconBtn
            class="lb-btn"
            @click="reset"
          >
            <VIcon icon="tabler-aspect-ratio" />
          </IconBtn>
          <IconBtn
            class="lb-btn"
            @click="download"
          >
            <VIcon icon="tabler-download" />
          </IconBtn>
          <IconBtn
            class="lb-btn"
            @click="close"
          >
            <VIcon icon="tabler-x" />
          </IconBtn>
        </div>

        <!-- Imagem -->
        <div class="lb-stage">
          <VProgressCircular
            v-if="!loaded && !errored"
            indeterminate
            color="white"
            size="48"
          />
          <div
            v-if="errored"
            class="lb-error"
          >
            <VIcon
              icon="tabler-photo-off"
              size="48"
            />
            <p class="mt-2 mb-0">
              Não foi possível carregar a imagem.
            </p>
          </div>
          <img
            v-show="loaded && !errored"
            :src="src"
            :alt="alt"
            class="lb-img"
            :class="{ 'lb-grab': scale > 1, 'lb-grabbing': dragging }"
            :style="{ transform }"
            draggable="false"
            @load="loaded = true"
            @error="errored = true"
            @mousedown.prevent="onMouseDown"
            @touchstart="onTouchStart"
            @dblclick="onDblClick"
            @click.stop
          >
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.lb-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.92);
  user-select: none;
  overflow: hidden;
}

.lb-toolbar {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.45);
  border-radius: 999px;
  backdrop-filter: blur(6px);
}

.lb-btn {
  color: #fff !important;
}

.lb-zoom-label {
  min-width: 46px;
  color: #fff;
  font-size: 13px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.lb-stage {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 64px 24px 24px;
}

.lb-img {
  max-width: 92vw;
  max-height: 88vh;
  object-fit: contain;
  transition: transform 0.08s ease-out;
  will-change: transform;
  border-radius: 4px;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
}

.lb-grab {
  cursor: grab;
}

.lb-grabbing {
  cursor: grabbing;
  transition: none;
}

.lb-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: #fff;
  opacity: 0.85;
}

.lb-fade-enter-active,
.lb-fade-leave-active {
  transition: opacity 0.2s ease;
}

.lb-fade-enter-from,
.lb-fade-leave-to {
  opacity: 0;
}
</style>
