/**
 * Composable que busca e cacheia a assinatura da empresa do usuário logado.
 * Expõe: assinatura, features, temFeature(nome), loading
 * empresa_id === 1 retorna todas features como true e sem limites.
 */

const assinatura = ref(null)
const loading = ref(false)
const loaded = ref(false)

export function useAssinatura() {

  const isEmpresaPrincipal = computed(() => {
    const userData = useCookie('userData').value
    return userData?.empresa_id === 1
  })

  const temFeature = (featureName) => {
    if (isEmpresaPrincipal.value) return true
    if (!assinatura.value?.plano_features) return false
    return !!assinatura.value.plano_features[featureName]
  }

  const limiteUsuarios = computed(() => {
    if (isEmpresaPrincipal.value) return Infinity
    return assinatura.value?.plano_features?.qtdFuncionarios ?? 0
  })

  const carregarAssinatura = async () => {
    if (loaded.value || loading.value) return
    if (isEmpresaPrincipal.value) {
      loaded.value = true
      return
    }

    loading.value = true
    try {
      const res = await $api('/saas/minha-assinatura')
      assinatura.value = res
      if (assinatura.value?.plano_features && typeof assinatura.value.plano_features === 'string') {
        assinatura.value.plano_features = JSON.parse(assinatura.value.plano_features)
      }
      loaded.value = true
    } catch (error) {
      console.error('[useAssinatura] Erro ao carregar assinatura:', error)
    } finally {
      loading.value = false
    }
  }

  return {
    assinatura,
    loading,
    loaded,
    temFeature,
    limiteUsuarios,
    carregarAssinatura,
    isEmpresaPrincipal
  }
}
