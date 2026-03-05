<script setup>
import { VNodeRenderer } from '@layouts/components/VNodeRenderer'
import { themeConfig } from '@themeConfig'
import bklogin from '@images/pages/bk-login.svg'
import logoOregon from '@images/logo.png'
import logoDaviot from '@images/daviot-logo.png'
import { isDaviot } from '@/utils/typeClient'
import { useAlert } from '@/composables/useAlert'
const currentLogo = isDaviot() ? logoDaviot : logoOregon

const { setAlert } = useAlert()

const email = ref('')

definePage({
  meta: {
    layout: 'blank',
    unauthenticatedOnly: true,
  },
})

//Forçar Claro
import { useConfigStore } from '@core/stores/config'

const configStore = useConfigStore()

configStore.theme = 'light'

const sendEmail = ref('tabler-send')

const onSubmit = async () => {
  if (!email.value) {
    setAlert('Insira seu email para receber um link de redefinição de senha.', 'error', 'tabler-alert-triangle', 4000)
    
    return
  }

  sendEmail.value = 'tabler-loader'

  try {
    const res = await $api('/conta/resetar-senha', {
      method: 'POST',
      body: {
        email: email.value,
      },
    }).catch(error => {
      console.log('error', error, error.response)
      if (error.response && error.response.status === 404) {
        setAlert('Email não encontrado. Verifique se o email está correto e tente novamente.', 'error', 'tabler-alert-triangle', 4000)
      } else {
        setAlert('Erro ao enviar link de redefinição de senha. Tente novamente mais tarde.', 'error', 'tabler-alert-triangle', 4000)
      }
    })

    if (res) {

      sendEmail.value = 'tabler-check'

      setAlert('Link de redefinição de senha enviado com sucesso. Verifique seu email.', 'success', 'tabler-alert-triangle', 4000)

      setTimeout(() => {
        sendEmail.value = 'tabler-send'
      }, 3000)

    }

  } catch (error) {
    setAlert('Erro ao enviar link de redefinição de senha. Tente novamente mais tarde.', 'error', 'tabler-alert-triangle', 4000)
    console.error('Erro ao enviar link de redefinição de senha', error)
    console.error('Erro ao enviar link de redefinição de senha', error.response)
  }
}

const confirmPasswordValidator = value => {
  if (!password.value) return true

  return confirmedValidator(value, password.value)
}
</script>

<template>
  <VRow
    no-gutters
    class="auth-wrapper bg-surface justify-center align-center"
    :style="`background-image: url(${bklogin}); background-size: 100%; background-repeat: no-repeat;background-position: center center;`"
  >
    <VCol
      cols="12"
      lg="4"
      class="d-flex align-center justify-center"
    >
      <VCard
        flat
        :max-width="500"
        class="mt-12 mt-sm-0 pa-4"
      >
        <VCardText>
          <VCardText class="text-center d-lg-flex align-center justify-center">
            <img
              :src="currentLogo"
              alt="logo"
              style="width: 35%; max-width: 100%; height: auto;"
            >
          </VCardText>
          <h4 class="text-h4 mb-1 text-center">
            Esqueceu sua senha? 🔒
          </h4>
          <p class="mb-0 mt-2 text-center">
            Insira seu email para receber um link de redefinição de senha. <strong>O link tem validade de 24 horas.</strong>
          </p>
        </VCardText>

        <VCardText>
          <VForm @submit.prevent="onSubmit">
            <VRow>
              <!-- email -->
              <VCol cols="12">
                <AppTextField
                  v-model="email"
                  autofocus
                  label="Email"
                  type="email"
                  placeholder="Insira seu email"
                />
              </VCol>

              <!-- Reset link -->
              <VCol cols="12">
                <VBtn
                  block
                  type="submit"
                  style="text-transform: none;"
                  :append-icon="sendEmail"
                >
                  Enviar link de redefinição
                </VBtn>
              </VCol>

              <!-- back to login -->
              <VCol cols="12">
                <RouterLink
                  class="d-flex align-center justify-center"
                  :to="{ name: 'login' }"
                >
                  <VIcon
                    icon="tabler-chevron-left"
                    class="flip-in-rtl"
                  />
                  <span>Voltar ao login</span>
                </RouterLink>
              </VCol>
            </VRow>
          </VForm>
        </VCardText>
      </VCard>
    </VCol>
  </VRow>
</template>

<style lang="scss">
@use "@core/scss/template/pages/page-auth.scss";
</style>
