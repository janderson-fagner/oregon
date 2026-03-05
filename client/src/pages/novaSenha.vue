<script setup>
import bklogin from '@images/pages/bk-login.svg'
import logoOregon from '@images/logo.png'
import logoDaviot from '@images/daviot-logo.png'
import { isDaviot } from '@/utils/typeClient'
import { useAlert } from '@/composables/useAlert'
const currentLogo = isDaviot() ? logoDaviot : logoOregon

const { setAlert } = useAlert()
const router = useRouter()
const route = useRoute()

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

const isRedefinirSenha = route.name === 'redefinirSenha'

console.log('isRedefinirSenha', isRedefinirSenha)

let resetar = 'resetar'
let redefinir = 'redefinir'
let redefinicao = 'redefinição de senha'
let alterada = 'alterada'

if(!isRedefinirSenha) {
  resetar = 'gerar'
  redefinir = 'gerar'
  redefinicao = 'geração de senha'
  alterada = 'gerada'
}

//Obter token
const query = window.location.search
const params = new URLSearchParams(query)
const token = params.get('token')

//Validar Token
const validateToken = async () => {
  if (!token) {
    setAlert('URL inválida. Acesse novamente o link enviado por email para' + resetar + 'sua senha.', 'error', 'tabler-alert-triangle', 8000)
    setTimeout(() => {
      router.push({ name: 'login' })
    }, 6000)
  }
  try {
    const res = await $api('/conta/validar-token', {
      method: 'POST',
      body: {
        token: token,
      },
    }).catch(error => {
      console.log('error', error, error.response)
      if (error.response && error.response.status === 404) {
        setAlert('Link de ' + redefinicao + ' inválida. Verifique se o link está correto e tente novamente.', 'error', 'tabler-alert-triangle', 8000)
      } else if (error.response && error.response.status === 405) {
        setAlert('O link de ' + redefinicao + ' expirou, solicite um novo link ou entre em contato com seu administrador.', 'error', 'tabler-alert-triangle', 8000)
      } else {
        setAlert('Ocorreu um erro com o ' + redefinicao + ' de senha. Tente novamente mais tarde.', 'error', 'tabler-alert-triangle', 8000)
      }

      setTimeout(() => {
        router.push({ name: 'login' })
      }, 7000)
    })

    if (res) {
      console.log('Token Validado', res)
    }

  } catch (error) {
    setAlert('Erro ao validar token. Tente novamente mais tarde.', 'error', 'tabler-alert-triangle', 4000)
    console.error('Erro ao validar token', error)
    console.error('Erro ao validar token', error.response)
  }
}

validateToken()


const password = ref('')
const confirmPassword = ref('')
const isPasswordVisible = ref(false)
const isConfirmPasswordVisible = ref(false)

const onSubmit = async () => {
  if (!password.value || !confirmPassword.value) {
    setAlert('Preencha todos os campos para ' + redefinir + ' sua senha.', 'error', 'tabler-alert-triangle', 4000)
    
    return
  }

  if (password.value !== confirmPassword.value) {
    setAlert('As senhas não coincidem. Verifique e tente novamente.', 'error', 'tabler-alert-triangle', 4000)
    
    return
  }

  try {
    const res = await $api('/conta/nova-senha', {
      method: 'POST',
      body: {
        token: token,
        password: password.value,
      },
    }).catch(error => {
      console.log('error', error, error.response)
      if (error.response && error.response.status === 404) {
        setAlert('Link de ' + redefinicao + ' inválida. Verifique se o link está correto e tente novamente.', 'error', 'tabler-alert-triangle', 8000)
      } else if (error.response && error.response.status === 405) {
        setAlert('O link de ' + redefinicao + ' expirou, solicite um novo link ou entre em contato com seu administrador.', 'error', 'tabler-alert-triangle', 8000)
      } else {
        setAlert('Ocorreu um erro com o ' + redefinicao + ' de senha. Tente novamente mais tarde.', 'error', 'tabler-alert-triangle', 8000)
      }
    })

    if (res) {
      console.log('Senha alterada', res)
      setAlert('Senha ' + alterada + ' com sucesso. Redirecionando para a página de login.', 'success', 'tabler-check', 4000)

      setTimeout(() => {
        router.push({ name: 'login' })
      }, 3000)

    }

  } catch (error) {
    setAlert('Ocorreu um erro ao ' + redefinir + ' sua senha. Tente novamente mais tarde.', 'error', 'tabler-alert-triangle', 4000)
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
      v-if="token"
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
            {{ isRedefinirSenha ? 'Redefinir senha 🔑' : 'Gerar Nova Senha 🔑' }}
          </h4>
          <p class="mb-0 mt-2 text-center">
            Insira uma nova senha para sua conta.
          </p>
        </VCardText>

        <VCardText>
          <VForm @submit.prevent="onSubmit">
            <VRow>
              <!-- password -->
              <VCol cols="12">
                <AppTextField
                  id="pass"
                  v-model="password"
                  label="Nova Senha"
                  placeholder="********"
                  :type="isPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  @click:append-inner="isPasswordVisible = !isPasswordVisible"
                />
              </VCol>

              <VCol cols="12">
                <AppTextField
                  v-model="confirmPassword"
                  label="Confirmar Nova Senha"
                  placeholder="********"
                  :type="isConfirmPasswordVisible ? 'text' : 'password'"
                  :append-inner-icon="isConfirmPasswordVisible ? 'tabler-eye-off' : 'tabler-eye'"
                  :rules="[confirmPasswordValidator]"
                  @click:append-inner="isConfirmPasswordVisible = !isConfirmPasswordVisible"
                />
              </VCol>


              <!-- Reset link -->
              <VCol cols="12">
                <VBtn
                  block
                  type="submit"
                  append-icon="tabler-key"
                >
                  {{ isRedefinirSenha ? 'Redefinir Senha' : 'Gerar Nova Senha' }}
                </VBtn>
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
