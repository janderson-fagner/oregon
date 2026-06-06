<script setup>
// Aviso de "nova versão disponível". Aparece quando o useAppVersion detecta
// que o /version.json publicado difere do build atualmente carregado.
//
// Layout: card flutuante próprio (não usa o chrome do VSnackbar), com badge de
// ícone flutuante, faixa de destaque animada e ações claras. Adapta-se ao tema
// claro/escuro via variáveis do Vuetify (--v-theme-*).
import { useAppVersion } from '@/composables/useAppVersion'

const { updateAvailable, iniciarMonitoramento, reloadApp } = useAppVersion()

const dispensado = ref(false)
const recarregando = ref(false)

const visivel = computed(() => updateAvailable.value && !dispensado.value)

const atualizar = () => {
  recarregando.value = true
  reloadApp()
}

onMounted(() => {
  iniciarMonitoramento()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="update-toast">
      <div
        v-if="visivel"
        class="update-toast"
        role="status"
        aria-live="polite"
      >
        <!-- Fechar rápido -->
        <button
          class="update-toast__close"
          type="button"
          aria-label="Dispensar"
          @click="dispensado = true"
        >
          <VIcon icon="tabler-x" size="16" />
        </button>

        <div class="update-toast__body">
          <!-- Badge de ícone com anel pulsante -->
          <div class="update-toast__badge">
            <span class="update-toast__pulse" />
            <VIcon icon="tabler-sparkles" size="22" />
          </div>

          <div class="update-toast__text">
            <p class="update-toast__title">Nova versão disponível</p>
            <p class="update-toast__subtitle">
              Atualize para carregar as últimas melhorias do sistema.
            </p>
          </div>
        </div>

        <div class="update-toast__actions">
          <button
            class="update-toast__ghost"
            type="button"
            :disabled="recarregando"
            @click="dispensado = true"
          >
            Agora não
          </button>
          <button
            class="update-toast__primary"
            type="button"
            :class="{ 'is-loading': recarregando }"
            :disabled="recarregando"
            @click="atualizar"
          >
            <VIcon
              :icon="recarregando ? 'tabler-loader-2' : 'tabler-refresh'"
              size="18"
              :class="{ 'spin': recarregando }"
            />
            <span>{{ recarregando ? 'Atualizando…' : 'Atualizar agora' }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.update-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 2147483647;
  width: 360px;
  max-width: calc(100vw - 32px);
  padding: 18px 18px 16px;
  border-radius: 16px;
  overflow: hidden;
  background: rgb(var(--v-theme-surface));
  border: 1px solid rgba(var(--v-theme-on-surface), 0.08);
  /* Sombra em camadas: ambiente suave + recorte próximo */
  box-shadow:
    0 1px 1px rgba(15, 23, 42, 0.04),
    0 10px 20px -8px rgba(15, 23, 42, 0.18),
    0 28px 48px -16px rgba(var(--v-theme-primary), 0.28);
}

/* Brilho sutil de fundo vindo do canto, na cor primária */
.update-toast::before {
  content: "";
  position: absolute;
  inset: 0;
  background: radial-gradient(
    120% 90% at 100% 0%,
    rgba(var(--v-theme-primary), 0.10) 0%,
    transparent 55%
  );
  pointer-events: none;
}

.update-toast__close {
  position: absolute;
  top: 12px;
  right: 12px;
  display: grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: rgba(var(--v-theme-on-surface), 0.45);
  background: transparent;
  transition: background-color 0.18s ease, color 0.18s ease;
}
.update-toast__close:hover {
  background: rgba(var(--v-theme-on-surface), 0.07);
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.update-toast__body {
  position: relative;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding-right: 22px;
}

.update-toast__badge {
  position: relative;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.12);
  animation: badge-float 4s ease-in-out infinite;
}

.update-toast__pulse {
  position: absolute;
  inset: 0;
  border-radius: 12px;
  border: 1.5px solid rgb(var(--v-theme-primary));
  opacity: 0;
  animation: badge-pulse 2.6s ease-out infinite;
}

.update-toast__title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  letter-spacing: -0.01em;
  line-height: 1.3;
  color: rgba(var(--v-theme-on-surface), 0.92);
}

.update-toast__subtitle {
  margin: 3px 0 0;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: rgba(var(--v-theme-on-surface), 0.55);
}

.update-toast__actions {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

/* Botão secundário (ghost) */
.update-toast__ghost {
  padding: 9px 14px;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: transparent;
  transition: background-color 0.18s ease, color 0.18s ease;
}
.update-toast__ghost:hover:not(:disabled) {
  background: rgba(var(--v-theme-on-surface), 0.06);
  color: rgba(var(--v-theme-on-surface), 0.85);
}

/* Botão primário */
.update-toast__primary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 9px 16px;
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #fff;
  background: rgb(var(--v-theme-primary));
  box-shadow:
    0 1px 2px rgba(var(--v-theme-primary), 0.45),
    0 6px 16px -6px rgba(var(--v-theme-primary), 0.7);
  transition: transform 0.16s ease, box-shadow 0.16s ease, filter 0.16s ease;
}
.update-toast__primary:hover:not(:disabled) {
  transform: translateY(-1px);
  filter: brightness(1.06);
  box-shadow:
    0 2px 4px rgba(var(--v-theme-primary), 0.5),
    0 10px 22px -6px rgba(var(--v-theme-primary), 0.8);
}
.update-toast__primary:active:not(:disabled) {
  transform: translateY(0);
}
.update-toast__primary:hover:not(.is-loading) :deep(.v-icon) {
  transform: rotate(90deg);
  transition: transform 0.3s ease;
}
.update-toast__primary.is-loading {
  cursor: progress;
  opacity: 0.85;
}

.spin {
  animation: spin 0.8s linear infinite;
}

/* ── Animações ─────────────────────────────────────────── */
@keyframes badge-float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes badge-pulse {
  0% { opacity: 0.5; transform: scale(1); }
  70%, 100% { opacity: 0; transform: scale(1.35); }
}
@keyframes spin {
  to { transform: rotate(360deg); }
}

/* ── Transição de entrada/saída ────────────────────────── */
.update-toast-enter-active {
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.32s ease;
}
.update-toast-leave-active {
  transition: transform 0.28s ease, opacity 0.22s ease;
}
.update-toast-enter-from {
  transform: translateY(20px) scale(0.96);
  opacity: 0;
}
.update-toast-leave-to {
  transform: translateY(12px) scale(0.98);
  opacity: 0;
}

/* Respeita usuários que preferem menos movimento */
@media (prefers-reduced-motion: reduce) {
  .update-toast__badge,
  .update-toast__pulse,
  .spin {
    animation: none;
  }
  .update-toast-enter-active,
  .update-toast-leave-active {
    transition: opacity 0.2s ease;
  }
  .update-toast-enter-from,
  .update-toast-leave-to {
    transform: none;
  }
}

/* Mobile: ocupa a largura com margens */
@media (max-width: 600px) {
  .update-toast {
    left: 16px;
    right: 16px;
    bottom: 16px;
    width: auto;
  }
}
</style>
