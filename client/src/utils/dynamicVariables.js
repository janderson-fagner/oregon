import { ref, computed } from 'vue';
import { getVariaveisItens } from './flowVariables.js';

// Variáveis dinâmicas capturadas durante a execução do fluxo
const dynamicVariables = ref([]);

// Função para adicionar variáveis dinâmicas
export const addDynamicVariable = (name, value, label = '') => {
  const existingIndex = dynamicVariables.value.findIndex(v => v.name === name);
  const newVariable = {
    name,
    value,
    label: label || name,
    type: 'dinamica',
    desc: `Variável capturada: ${label || name}`
  };

  if (existingIndex >= 0) {
    dynamicVariables.value[existingIndex] = newVariable;
  } else {
    dynamicVariables.value.push(newVariable);
  }
};

// Função para limpar variáveis dinâmicas
export const clearDynamicVariables = () => {
  dynamicVariables.value = [];
};

// Função para obter todas as variáveis (padrão + dinâmicas)
export const getAllVariables = async () => {
  try {
    const staticVars = await getVariaveisItens();

    const messageVars = [  // Variáveis de mensagens
      { title: "Última mensagem", value: "ultima_mensagem", type: 'mensagem', desc: "Última mensagem enviada/recebida" },
      { title: "Última mensagem do cliente", value: "ultima_mensagem_cliente", type: 'mensagem', desc: "Última mensagem enviada pelo cliente" },
      { title: "Data última mensagem", value: "cliente_ultima_msg_data", type: 'mensagem', desc: "Data da última mensagem (qualquer)" },
      { title: "Data última msg do cliente", value: "cliente_ultima_msg_cliente_data", type: 'mensagem', desc: "Data da última mensagem enviada pelo cliente" },
      { title: "Data última msg do sistema", value: "cliente_ultima_msg_sistema_data", type: 'mensagem', desc: "Data da última mensagem enviada pelo sistema" },
    ];

    return [...staticVars, ...dynamicVariables.value, ...messageVars];
  } catch (error) {
    console.error('Erro ao obter variáveis:', error);
    return dynamicVariables.value;
  }
};

// Função para copiar variável para clipboard
export const copyVariableToClipboard = (variableName, setAlert) => {
  const variableText = `{{${variableName}}}`;

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(variableText).then(() => {
      setAlert(`Variável ${variableText} copiada!`, 'success', 'tabler-copy', 2000);
    }).catch(() => {
      // Fallback para navegadores mais antigos
      fallbackCopyToClipboard(variableText, setAlert);
    });
  } else {
    fallbackCopyToClipboard(variableText, setAlert);
  }
};

// Fallback para copiar texto
const fallbackCopyToClipboard = (text, setAlert) => {
  const textArea = document.createElement('textarea');
  textArea.value = text;
  textArea.style.position = 'fixed';
  textArea.style.left = '-999999px';
  textArea.style.top = '-999999px';
  document.body.appendChild(textArea);
  textArea.focus();
  textArea.select();

  try {
    document.execCommand('copy');
    setAlert(`Variável ${text} copiada!`, 'success', 'tabler-copy', 2000);
  } catch (err) {
    setAlert('Erro ao copiar variável', 'error', 'tabler-alert-circle', 2000);
  }

  document.body.removeChild(textArea);
};

// Função para obter variáveis dinâmicas comuns
export const getCommonDynamicVariables = () => [
  { name: 'data_escolhida', label: 'Data Escolhida', desc: 'Data escolhida pelo usuário' },
  { name: 'hora_escolhida', label: 'Hora Escolhida', desc: 'Hora escolhida pelo usuário' },
  { name: 'data_agendamento_escolhida', label: 'Data do Agendamento Escolhida', desc: 'Data específica do agendamento' },
  { name: 'horario_escolhido', label: 'Horário Escolhido', desc: 'Horário completo escolhido' },
  { name: 'preferencia_data', label: 'Preferência de Data', desc: 'Preferência de data do usuário' },
  { name: 'preferencia_hora', label: 'Preferência de Hora', desc: 'Preferência de hora do usuário' },
  { name: 'interesse_cliente', label: 'Interesse do Cliente', desc: 'Interesse demonstrado pelo cliente' },
  { name: 'produto_desejado', label: 'Produto Desejado', desc: 'Produto mencionado pelo cliente' },
  { name: 'servico_interessado', label: 'Serviço Interessado', desc: 'Serviço de interesse do cliente' },
  { name: 'orcamento_cliente', label: 'Orçamento Cliente', desc: 'Orçamento mencionado pelo cliente' },
  { name: 'preferencia_cliente', label: 'Preferência Cliente', desc: 'Preferência geral do cliente' },
  { name: 'resposta_usuario', label: 'Resposta do Usuário', desc: 'Resposta completa do usuário' },
  { name: 'nome_escolhido', label: 'Nome Escolhido', desc: 'Nome escolhido pelo usuário' },
  { name: 'email_escolhido', label: 'Email Escolhido', desc: 'Email fornecido pelo usuário' },
  { name: 'telefone_escolhido', label: 'Telefone Escolhido', desc: 'Telefone fornecido pelo usuário' }
];

export { dynamicVariables };
