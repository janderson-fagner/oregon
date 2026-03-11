<script setup>
const props = defineProps({
  src: { type: String, required: true },
  audioId: { type: [String, Number], default: null },
  activeAudioId: { type: [String, Number], default: null },
  avatar: { type: String, default: null },
})

const emit = defineEmits(['play'])

const audioRef = ref(null)
const isPlaying = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const playbackRate = ref(1)
const isDragging = ref(false)

const speeds = [1, 1.5, 2]

// Gera alturas pseudo-aleatórias para as barras (simulando waveform do WhatsApp)
const seededRandom = (seed) => {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}
const getBarHeight = (i) => {
  const base = seededRandom(i * 7 + 3)
  return Math.max(4, Math.floor(base * 18))
}

const progress = computed(() => {
  if (!duration.value) return 0
  return (currentTime.value / duration.value) * 100
})

const formatTime = (seconds) => {
  if (!seconds || isNaN(seconds)) return '0:00'
  const min = Math.floor(seconds / 60)
  const sec = Math.floor(seconds % 60).toString().padStart(2, '0')
  return `${min}:${sec}`
}

const timeDisplay = computed(() => {
  if (isPlaying.value || currentTime.value > 0) {
    return formatTime(currentTime.value)
  }
  return formatTime(duration.value)
})

const togglePlay = () => {
  if (!audioRef.value) return

  if (isPlaying.value) {
    audioRef.value.pause()
    isPlaying.value = false
  } else {
    emit('play', props.audioId)
    audioRef.value.play()
    isPlaying.value = true
  }
}

const cycleSpeed = () => {
  const idx = speeds.indexOf(playbackRate.value)
  playbackRate.value = speeds[(idx + 1) % speeds.length]
  if (audioRef.value) {
    audioRef.value.playbackRate = playbackRate.value
  }
}

const onTimeUpdate = () => {
  if (!isDragging.value && audioRef.value) {
    currentTime.value = audioRef.value.currentTime
  }
}

const onLoadedMetadata = () => {
  if (audioRef.value) {
    duration.value = audioRef.value.duration
  }
}

const onEnded = () => {
  isPlaying.value = false
  currentTime.value = 0
}

// Controle de seek via clique/drag na barra
const progressBarRef = ref(null)

const seekFromEvent = (e) => {
  if (!progressBarRef.value || !audioRef.value) return
  const rect = progressBarRef.value.getBoundingClientRect()
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
  const percent = x / rect.width
  audioRef.value.currentTime = percent * duration.value
  currentTime.value = audioRef.value.currentTime
}

const onMouseDown = (e) => {
  isDragging.value = true
  seekFromEvent(e)
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

const onMouseMove = (e) => {
  if (isDragging.value) seekFromEvent(e)
}

const onMouseUp = () => {
  isDragging.value = false
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
}

// Touch support
const onTouchStart = (e) => {
  isDragging.value = true
  seekFromEvent(e.touches[0])
}

const onTouchMove = (e) => {
  if (isDragging.value) {
    e.preventDefault()
    seekFromEvent(e.touches[0])
  }
}

const onTouchEnd = () => {
  isDragging.value = false
}

// Pausa quando outro áudio começa a tocar
watch(() => props.activeAudioId, (newId) => {
  if (newId !== props.audioId && isPlaying.value) {
    audioRef.value?.pause()
    isPlaying.value = false
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousemove', onMouseMove)
  document.removeEventListener('mouseup', onMouseUp)
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value = null
  }
})
</script>

<template>
  <div class="audio-player">
    <audio
      ref="audioRef"
      :src="src"
      preload="metadata"
      @timeupdate="onTimeUpdate"
      @loadedmetadata="onLoadedMetadata"
      @ended="onEnded"
    />

    <!-- Avatar -->
    <div class="audio-avatar" @click="togglePlay">
      <VAvatar
        :image="avatar || undefined"
        :icon="!avatar ? 'tabler-user' : undefined"
        size="45"
        color="primary"
        variant="tonal"
      />
      <div class="play-overlay">
        <VIcon
          :icon="isPlaying ? 'tabler-player-pause-filled' : 'tabler-player-play-filled'"
          size="18"
          color="white"
        />
      </div>
    </div>

    <div class="audio-controls">
      <!-- Waveform / barra de progresso -->
      <div
        ref="progressBarRef"
        class="audio-waveform"
        @mousedown="onMouseDown"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="onTouchEnd"
      >
        <div class="waveform-bg">
          <div
            v-for="i in 35"
            :key="i"
            class="wave-bar"
            :class="{ active: (i / 35) * 100 <= progress }"
            :style="{ height: getBarHeight(i) + 'px' }"
          />
        </div>
        <div
          class="seek-dot"
          :style="{ left: progress + '%' }"
        />
      </div>

      <!-- Tempo e velocidade -->
      <div class="audio-info">
        <span class="audio-time">{{ timeDisplay }}</span>
        <button
          class="speed-btn"
          @click.stop="cycleSpeed"
        >
          {{ playbackRate }}x
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.audio-player {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  min-width: 240px;
  max-width: 320px;
  user-select: none;
}

.audio-avatar {
  position: relative;
  cursor: pointer;
  flex-shrink: 0;
}

.play-overlay {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  display: flex;
  align-items: center;
  justify-content: center;
}

.audio-controls {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.audio-waveform {
  position: relative;
  height: 28px;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 0 6px;
}

.waveform-bg {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 100%;
  height: 100%;
}

.wave-bar {
  flex: 1;
  min-width: 2px;
  max-width: 4px;
  border-radius: 2px;
  background: rgba(var(--v-theme-on-surface), 0.25);
  transition: background 0.1s;
}

.wave-bar.active {
  background: rgb(var(--v-theme-primary));
}

.seek-dot {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  transform: translate(-50%, -50%);
  transition: left 0.05s linear;
  z-index: 2;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}

.audio-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;
}

.audio-time {
  font-size: 11px;
  color: rgba(var(--v-theme-on-surface), 0.55);
  font-variant-numeric: tabular-nums;
}

.speed-btn {
  font-size: 11px;
  font-weight: 600;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: none;
  border-radius: 10px;
  padding: 1px 8px;
  cursor: pointer;
  line-height: 1.4;
  transition: background 0.15s;
}

.speed-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.15);
}
</style>
