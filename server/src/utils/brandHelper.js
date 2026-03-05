/**
 * brandHelper.js - Determina branding (Daviot/Oregon) baseado no hostname
 *
 * Daviot é o padrão. Oregon é exceção detectada pelo domínio.
 */

function isOregonDomain(hostname) {
  return hostname?.includes('oregonservicos') || hostname?.includes('oregonhigienizacao');
}

/**
 * Retorna objeto de branding baseado no hostname da requisição
 * @param {string} hostname - req.hostname ou similar
 * @returns {{ isOregon: boolean, appName: string, appUrl: string, emailFrom: string, emailContato: string, logoUrl: string }}
 */
function getBrandFromHost(hostname) {
  const isOregon = isOregonDomain(hostname);
  const smtpFrom = process.env.SMTP_FROM || 'automatico@oregonservicos.com.br';

  return {
    isOregon,
    appName: isOregon ? 'Oregon' : 'Daviot',
    appUrl: isOregon ? 'https://app.oregonservicos.com.br' : 'https://app.daviot.com.br',
    logoUrl: isOregon ? '/uploads/logo.png' : '/uploads/daviot-logo.png',
    emailFrom: isOregon
      ? `"Oregon Sistema" <${smtpFrom}>`
      : `"Daviot Sistema" <${smtpFrom}>`,
    emailContato: isOregon ? 'contato@oregonservicos.com.br' : 'contato@daviot.com.br',
  };
}

module.exports = { getBrandFromHost, isOregonDomain };
