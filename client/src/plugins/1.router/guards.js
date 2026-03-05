import { canNavigate } from '@layouts/plugins/casl'
import { useCookieStore } from '@layouts/stores/config'
import { useAlert } from '@/composables/useAlert'
import { useAssinatura } from '@/composables/useAssinatura'
import { disconnectSocket } from '@/composables/useSocket'

const { setAlert } = useAlert()

export const setupGuards = router => {
  router.beforeEach(async (to, from, next) => {

    console.log('to', to);

    const token = useCookie('accessToken').value;
    const usuario = useCookie('userData').value;
    const roleInit = usuario && usuario?.role ? usuario.role : null;

    if(token && !usuario || !token && usuario) {
      useCookie('userAbilityRules').value = null;
      useCookie('userData').value = null;
      useCookie('accessToken').value = null;
      next({ name: 'login', query: { next: to.fullPath } });
      return;
    }
    
    if (to.meta.public || to.meta.unauthenticatedOnly) {
      console.log('Public or unauthenticatedOnly');
      next();
      return;
    }

    if (!token && !['login', 'register', 'forgot-password', 'reset-password', 'cadastro', 'landing'].includes(to.name)) {
      console.log('Não há token');

      if (usuario) {
        useCookie('userAbilityRules').value = null;
        useCookie('userData').value = null;
        useCookie('accessToken').value = null;
      }

      let irPara = to.fullPath;

      if (irPara.includes('logout') || irPara.includes('login') || irPara.includes('register') ||
        irPara.includes('forgot-password') || irPara.includes('reset-password')) {
        irPara = '/';
      }

      if (irPara.includes('reload')) {
        irPara = irPara.replace('?reload=true', '');
      }

      next({ name: 'login', query: { next: irPara } });
      return;
    } else if (!token && ['register', 'forgot-password', 'reset-password', 'login', 'cadastro', 'landing'].includes(to.name)) {
      console.log('Não há token register', to.name);
      next();
      return;
    } else if (canNavigate(to)) {

      if (!usuario) {
        next({ name: 'login', query: { next: to.fullPath } });
        return;
      }

      if (token && usuario) {
        const res = await $api('/conta/auth-cookie', {
          method: 'POST',
          body: {
            id: usuario.id,
            token: token,
            roleInit: roleInit,
          },
        }).catch(error => {
          handleAuthError(to.fullPath, error, next);
          return;
        });

        if (res) {
          console.log('Auth Success: ', res.response);

          const { accessToken, userData, userAbilityRules, maxAge } = res.response;
          const tokenValue = accessToken || token;
          const maxAgeValue = maxAge || 30 * 24 * 60 * 60;

          const cookieStore = useCookieStore();
          cookieStore.updateCookies({
            userData: userData,
            rules: userAbilityRules,
            accessToken: tokenValue,
            maxAge: maxAgeValue,
          });

          // Verificar empresa pendente - só permite acesso à assinatura
          if (userData?.empresaPendente) {
            const allowedRoutes = ['saas-minha-assinatura', 'saas-minha-empresa'];
            if (!allowedRoutes.includes(to.name)) {
              setAlert('Sua empresa está pendente. Regularize sua assinatura para acessar o sistema.', 'warning', 'tabler-alert-triangle', 5000);
              next({ name: 'saas-minha-assinatura' });
              return;
            }
          }

          // Verificar feature da rota (se definida em meta.feature)
          if (to.meta.feature) {
            const { temFeature, carregarAssinatura } = useAssinatura();
            await carregarAssinatura();
            if (!temFeature(to.meta.feature)) {
              setAlert('Seu plano não inclui acesso a este recurso. Faça upgrade para liberar.', 'error', 'tabler-lock-access-off', 5000);
              next('/');
              return;
            }
          }

          next();
        }
      } else {
        next();
      }
    } else {
      setAlert('Você não tem permissão para acessar essa página.', 'error', 'tabler-lock-access-off', 3000);
      next('/');
    }
  });
}

function handleAuthError(to, error, next) {
  console.error('Auth Error: ', error.response);
  if (error.response) {
    if (error.response.status === 401) {
      setAlert('Login expirado. Faça login novamente.', 'error', 'tabler-alert-triangle', 3000);
    } else if (error.response.status === 405) {
      setAlert('A assinatura da empresa que você faz parte não está ativa, entre em contato com seu administrador.', 'error', 'tabler-alert-triangle', 5000);
    } else if ([406, 407].includes(error.response.status)) {
      setAlert('A Empresa que você faz parte não está ativa ou não foi encontrada, entre em contato com seu administrador.', 'error', 'tabler-alert-triangle', 8000);
    }

    clearAuthCookies();
    console.log('Next: ', to);
    next({ name: 'login', query: { next: to } });
  } else {
    setAlert('Ocorreu um erro com seu acesso. Faça login novamente.', 'error', 'tabler-alert-triangle', 3000);
    clearAuthCookies();
    console.log('Next: ', to);
    next({ name: 'login', query: { next: to } });
  }
}

function clearAuthCookies() {
  useCookie('userAbilityRules').value = null;
  useCookie('userData').value = null;
  useCookie('accessToken').value = null;
  disconnectSocket();
}
