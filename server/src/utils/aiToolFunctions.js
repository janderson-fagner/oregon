/**
 * 🤖 AI TOOL FUNCTIONS - Funções disponíveis para a IA executar
 * 
 * Este arquivo contém todas as funções que o Gemini pode executar via function calling
 * Inclui: Agendamentos, CRM, Comunicação, Controle de Fluxo, Localização
 */

const dbQuery = require('./dbHelper');
const { empresaWhere } = require('./dbHelper');
const moment = require('moment');

/**
 * Definições das funções para o Gemini (Function Declarations)
 * FORMATO: JSON Schema padrão compatível com @google/genai SDK v1.33+
 */
const toolDefinitions = [
    // ═══════════════════════════════════════════════════════════════════
    // 📅 AGENDAMENTOS
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "buscarDisponibilidades",
        description: "OBRIGATÓRIO: Busca horários disponíveis para agendamento em um período. SEMPRE use esta função ANTES de confirmar qualquer horário com o cliente. Retorna lista de horários livres.",
        parameters: {
            type: "object",
            properties: {
                dataInicio: {
                    type: "string",
                    description: "Data inicial no formato YYYY-MM-DD (ex: 2025-12-17)"
                },
                dataFim: {
                    type: "string",
                    description: "Data final no formato YYYY-MM-DD (ex: 2025-12-20)"
                },
                duracaoMinutos: {
                    type: "integer",
                    description: "Duração do serviço em minutos (padrão: 60)"
                },
                periodoPreferido: {
                    type: "string",
                    enum: ["manha", "tarde", "noite", "qualquer"],
                    description: "Período preferido do cliente"
                },
                servicoId: {
                    type: "integer",
                    description: "ID do serviço desejado"
                }
            },
            required: ["dataInicio", "dataFim"]
        }
    },
    {
        name: "verificarHorarioDisponivel",
        description: "Verifica se um horário específico está disponível para agendamento",
        parameters: {
            type: "object",
            properties: {
                data: {
                    type: "string",
                    description: "Data no formato YYYY-MM-DD"
                },
                horaInicio: {
                    type: "string",
                    description: "Horário de início no formato HH:MM (ex: 10:00)"
                },
                horaFim: {
                    type: "string",
                    description: "Horário de fim no formato HH:MM"
                },
                servicoId: {
                    type: "integer",
                    description: "ID do serviço"
                }
            },
            required: ["data", "horaInicio"]
        }
    },
    {
        name: "consultarAgendamentosCliente",
        description: "IMPORTANTE: Consulta os agendamentos de um cliente. USE SEMPRE quando o cliente perguntar sobre 'meu agendamento', 'último agendamento', 'histórico de agendamentos', 'agendamentos anteriores' ou 'próximos agendamentos'.",
        parameters: {
            type: "object",
            properties: {
                clienteId: {
                    type: "integer",
                    description: "ID do cliente (obtido automaticamente do contexto)"
                },
                tipo: {
                    type: "string",
                    enum: ["ultimos", "proximos", "todos", "hoje"],
                    description: "Tipo de consulta: ultimos (passados), proximos (futuros), todos ou hoje"
                },
                limite: {
                    type: "integer",
                    description: "Quantidade máxima de resultados (padrão: 5)"
                }
            },
            required: ["tipo"]
        }
    },
    {
        name: "criarAgendamento",
        description: "AÇÃO CRÍTICA: Cria um novo agendamento no sistema. Use IMEDIATAMENTE após o cliente confirmar data e horário. NÃO apenas responda 'ok, agendado' - EXECUTE esta função para criar o agendamento de verdade! IMPORTANTE: Sempre passe nomeServico e tamanho para identificar corretamente o serviço e calcular o valor.",
        parameters: {
            type: "object",
            properties: {
                data: {
                    type: "string",
                    description: "Data do agendamento no formato YYYY-MM-DD (ex: 2025-12-17)"
                },
                horaInicio: {
                    type: "string",
                    description: "Horário de início no formato HH:MM (ex: 10:00)"
                },
                horaFim: {
                    type: "string",
                    description: "Horário de fim no formato HH:MM (opcional, será calculado automaticamente)"
                },
                funcionarioId: {
                    type: "integer",
                    description: "ID do funcionário/profissional (opcional, será escolhido automaticamente)"
                },
                servicoId: {
                    type: "integer",
                    description: "ID do serviço (se conhecido). Se não souber, use nomeServico."
                },
                nomeServico: {
                    type: "string",
                    description: "Nome do serviço (ex: 'sofá', 'colchão', 'tapete', 'cadeira'). SEMPRE informe para identificar o serviço corretamente."
                },
                tamanho: {
                    type: "string",
                    description: "Tamanho/tipo do item (ex: '3 lugares', '2 lugares', 'casal', 'solteiro', 'queen', 'king'). SEMPRE informe quando aplicável."
                },
                valor: {
                    type: "number",
                    description: "Valor do serviço em reais (ex: 306.90). Será calculado automaticamente se não informado."
                },
                endereco: {
                    type: "string",
                    description: "Endereço completo do atendimento (se diferente do cadastrado)"
                },
                observacoes: {
                    type: "string",
                    description: "Observações adicionais sobre o serviço"
                }
            },
            required: ["data", "horaInicio"]
        }
    },
    {
        name: "atualizarAgendamento",
        description: "Atualiza um agendamento existente (data, horário, status, observações)",
        parameters: {
            type: "object",
            properties: {
                agendamentoId: {
                    type: "integer",
                    description: "ID do agendamento a atualizar"
                },
                data: {
                    type: "string",
                    description: "Nova data no formato YYYY-MM-DD"
                },
                horaInicio: {
                    type: "string",
                    description: "Novo horário de início no formato HH:MM"
                },
                status: {
                    type: "string",
                    enum: ["agendado", "confirmado", "atendido", "concluido", "cancelado", "remarcado"],
                    description: "Novo status do agendamento"
                },
                observacoes: {
                    type: "string",
                    description: "Observações atualizadas"
                }
            },
            required: ["agendamentoId"]
        }
    },
    {
        name: "cancelarAgendamento",
        description: "Cancela um agendamento existente quando o cliente solicitar cancelamento",
        parameters: {
            type: "object",
            properties: {
                agendamentoId: {
                    type: "integer",
                    description: "ID do agendamento a cancelar"
                },
                motivo: {
                    type: "string",
                    description: "Motivo do cancelamento"
                }
            },
            required: ["agendamentoId"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // 💼 CRM E NEGÓCIOS
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "criarNegocio",
        description: "IMPORTANTE: Cria uma nova oportunidade/negócio no CRM. Use no INÍCIO da conversa quando cliente demonstrar interesse em agendar ou comprar. Isso permite rastrear o funil de vendas.",
        parameters: {
            type: "object",
            properties: {
                titulo: {
                    type: "string",
                    description: "Título do negócio (ex: 'Interesse em agendamento - Maria Silva')"
                },
                descricao: {
                    type: "string",
                    description: "Descrição detalhada do negócio"
                },
                valor: {
                    type: "number",
                    description: "Valor estimado do negócio"
                },
                etapaId: {
                    type: "integer",
                    description: "ID da etapa do funil"
                },
                funnelId: {
                    type: "integer",
                    description: "ID do funil"
                }
            },
            required: ["titulo"]
        }
    },
    {
        name: "atualizarNegocio",
        description: "Atualiza um negócio existente no CRM (avançar etapa, atualizar valor, adicionar anotação). USE para avançar negócio no funil quando cliente evoluir.",
        parameters: {
            type: "object",
            properties: {
                negocioId: {
                    type: "integer",
                    description: "ID do negócio a atualizar (obtido do contexto ou de consultarAgendamentosCliente)"
                },
                titulo: {
                    type: "string",
                    description: "Novo título"
                },
                valor: {
                    type: "number",
                    description: "Novo valor do negócio"
                },
                etapaId: {
                    type: "integer",
                    description: "ID da nova etapa do funil para avançar o negócio (ex: 1=Contato Inicial, 6=Orçamento, 7=Fechamento)"
                },
                anotacao: {
                    type: "string",
                    description: "Anotação/observação sobre a atualização"
                }
            },
            required: ["negocioId"]
        }
    },
    {
        name: "marcarNegocioGanho",
        description: "IMPORTANTE: Marca um negócio como GANHO quando o cliente confirmar o fechamento e o agendamento for criado com sucesso. Use após criar agendamento.",
        parameters: {
            type: "object",
            properties: {
                negocioId: {
                    type: "integer",
                    description: "ID do negócio a marcar como ganho"
                },
                valorFinal: {
                    type: "number",
                    description: "Valor final acordado do negócio"
                }
            },
            required: ["negocioId"]
        }
    },
    {
        name: "marcarNegocioPerdido",
        description: "Marca um negócio como PERDIDO quando o cliente desistir ou não houver mais interesse. Use com cautela - tente recuperar o cliente primeiro.",
        parameters: {
            type: "object",
            properties: {
                negocioId: {
                    type: "integer",
                    description: "ID do negócio a marcar como perdido"
                },
                motivo: {
                    type: "string",
                    description: "Motivo da perda (ex: 'Preço alto', 'Desistiu', 'Concorrência')"
                },
                observacao: {
                    type: "string",
                    description: "Observação adicional sobre a perda"
                }
            },
            required: ["negocioId", "motivo"]
        }
    },
    {
        name: "atualizarCliente",
        description: "Atualiza dados do cliente quando ele informar novos dados (nome, email, telefone, endereço, observações)",
        parameters: {
            type: "object",
            properties: {
                nome: {
                    type: "string",
                    description: "Nome do cliente"
                },
                email: {
                    type: "string",
                    description: "Email do cliente"
                },
                telefone: {
                    type: "string",
                    description: "Telefone do cliente"
                },
                endereco: {
                    type: "string",
                    description: "Endereço completo do cliente"
                },
                observacoes: {
                    type: "string",
                    description: "Observações sobre o cliente"
                },
                tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Tags para o cliente"
                }
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // ⏱️ CONTROLE DE FLUXO
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "aguardarResposta",
        description: "Pausa o fluxo e aguarda resposta do cliente antes de continuar",
        parameters: {
            type: "object",
            properties: {
                timeout: {
                    type: "integer",
                    description: "Tempo máximo de espera em segundos (padrão: 300 = 5min)"
                },
                variavel: {
                    type: "string",
                    description: "Nome da variável para armazenar a resposta"
                }
            }
        }
    },
    {
        name: "agendarAcaoFutura",
        description: "Agenda uma ação para ser executada após X minutos. Use para follow-ups, lembretes ou quando instruído a 'esperar X minutos se cliente não responder'.",
        parameters: {
            type: "object",
            properties: {
                minutos: {
                    type: "integer",
                    description: "Quantidade de minutos para aguardar antes de executar a ação"
                },
                acao: {
                    type: "string",
                    enum: ["followup", "lembrete", "enviar_mensagem", "verificar_resposta"],
                    description: "Tipo de ação a executar"
                },
                mensagem: {
                    type: "string",
                    description: "Mensagem a ser enviada quando a ação for executada"
                }
            },
            required: ["minutos", "acao"]
        }
    },
    {
        name: "bloquearClienteFluxos",
        description: "Bloqueia ou desbloqueia um cliente de receber novos fluxos automáticos (útil quando aguardando atendente humano)",
        parameters: {
            type: "object",
            properties: {
                bloquear: {
                    type: "boolean",
                    description: "true para bloquear, false para desbloquear"
                }
            },
            required: ["bloquear"]
        }
    },
    {
        name: "encaminharParaAtendente",
        description: "Encaminha a conversa para um atendente humano. Use apenas internamente - NUNCA diga ao cliente que está encaminhando.",
        parameters: {
            type: "object",
            properties: {
                mensagem: {
                    type: "string",
                    description: "Mensagem interna sobre o motivo do encaminhamento"
                },
                departamento: {
                    type: "string",
                    description: "Departamento para encaminhar (opcional)"
                },
                prioridade: {
                    type: "string",
                    enum: ["baixa", "normal", "alta", "urgente"],
                    description: "Prioridade do atendimento"
                }
            }
        }
    },
    {
        name: "redirecionarFluxo",
        description: "Redireciona para outro fluxo específico",
        parameters: {
            type: "object",
            properties: {
                fluxoId: {
                    type: "integer",
                    description: "ID do fluxo para redirecionar"
                },
                fluxoNome: {
                    type: "string",
                    description: "Nome do fluxo (alternativa ao ID)"
                }
            }
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // 💬 COMUNICAÇÃO
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "enviarMensagem",
        description: "Envia mensagem WhatsApp para o cliente",
        parameters: {
            type: "object",
            properties: {
                mensagem: {
                    type: "string",
                    description: "Texto da mensagem"
                },
                phone: {
                    type: "string",
                    description: "Número de telefone (opcional, usa o do cliente atual)"
                }
            },
            required: ["mensagem"]
        }
    },
    {
        name: "enviarEmail",
        description: "Envia email para o cliente",
        parameters: {
            type: "object",
            properties: {
                destinatario: {
                    type: "string",
                    description: "Email do destinatário (opcional, usa o do cliente)"
                },
                assunto: {
                    type: "string",
                    description: "Assunto do email"
                },
                corpo: {
                    type: "string",
                    description: "Corpo do email"
                }
            },
            required: ["assunto", "corpo"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // 🗺️ LOCALIZAÇÃO E DISTÂNCIA
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "geocodificarEndereco",
        description: "Converte endereço em coordenadas geográficas (latitude/longitude)",
        parameters: {
            type: "object",
            properties: {
                endereco: {
                    type: "string",
                    description: "Endereço completo para geocodificar"
                }
            },
            required: ["endereco"]
        }
    },
    {
        name: "buscarEnderecoPorLocal",
        description: "IMPORTANTE: Busca o endereço completo de um local/ponto de referência usando Google Maps. Use quando o cliente informar um LOCAL (shopping, terminal, praça, estabelecimento) em vez de endereço completo. Retorna endereço completo com rua, número, bairro, cidade e coordenadas.",
        parameters: {
            type: "object",
            properties: {
                local: {
                    type: "string",
                    description: "Nome do local ou ponto de referência (ex: 'Shopping Palladium', 'Terminal Pinheirinho', 'Praça Osório')"
                },
                cidadeEstado: {
                    type: "string",
                    description: "Cidade e estado para contexto (ex: 'Curitiba, PR'). Padrão: região de atendimento da empresa"
                }
            },
            required: ["local"]
        }
    },
    {
        name: "calcularTaxaDeslocamento",
        description: "Calcula a taxa de deslocamento baseada na distância entre o endereço do cliente e a base da empresa. Retorna distância em km e valor da taxa adicional.",
        parameters: {
            type: "object",
            properties: {
                enderecoCliente: {
                    type: "string",
                    description: "Endereço completo do cliente"
                },
                coordenadasCliente: {
                    type: "object",
                    properties: {
                        lat: { type: "number" },
                        lng: { type: "number" }
                    },
                    description: "Coordenadas do cliente (se já disponíveis)"
                }
            },
            required: ["enderecoCliente"]
        }
    },
    {
        name: "calcularDistancia",
        description: "Calcula distância e tempo de deslocamento entre dois endereços",
        parameters: {
            type: "object",
            properties: {
                endereco1: {
                    type: "string",
                    description: "Endereço de origem"
                },
                endereco2: {
                    type: "string",
                    description: "Endereço de destino"
                }
            },
            required: ["endereco1", "endereco2"]
        }
    },
    {
        name: "resumirDisponibilidadeComMaps",
        description: "Resume opções de disponibilidade considerando localização do cliente para otimizar roteirização",
        parameters: {
            type: "object",
            properties: {
                opcoes: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            data: { type: "string" },
                            horarioInicio: { type: "string" },
                            horarioFim: { type: "string" },
                            funcionario: { type: "string" }
                        }
                    },
                    description: "Lista de opções de disponibilidade"
                },
                latLng: {
                    type: "object",
                    properties: {
                        lat: { type: "number" },
                        lng: { type: "number" }
                    },
                    description: "Coordenadas do cliente"
                }
            },
            required: ["opcoes"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // 📷 ANÁLISE DE IMAGENS
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "analisarImagemCliente",
        description: "IMPORTANTE: Use quando cliente enviar foto do item (sofá, colchão, etc). Analisa a condição visual descrita e sugere a regra de precificação adequada baseada na condição observada.",
        parameters: {
            type: "object",
            properties: {
                nomeServico: {
                    type: "string",
                    description: "Nome do serviço (ex: 'sofá', 'colchão', 'tapete')"
                },
                descricaoImagem: {
                    type: "string",
                    description: "Descrição detalhada do que você observa na imagem enviada pelo cliente"
                },
                condicaoObservada: {
                    type: "string",
                    enum: ["otima", "boa", "regular", "ruim", "muito_ruim"],
                    description: "Condição geral do item na imagem"
                },
                manchasVisiveis: {
                    type: "boolean",
                    description: "Se há manchas visíveis no item"
                },
                tipoManchas: {
                    type: "string",
                    description: "Tipo de manchas se houver (ex: 'óleo', 'café', 'urina', 'sujeira geral')"
                },
                tamanhoEstimado: {
                    type: "string",
                    description: "Tamanho estimado se identificável (ex: '3 lugares', 'casal')"
                }
            },
            required: ["nomeServico", "descricaoImagem", "condicaoObservada"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // 🔍 BUSCA DE SERVIÇOS
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "buscarServicoPorNome",
        description: "OBRIGATÓRIO ANTES DE AGENDAR: Busca serviço pelo nome para obter servicoId. SEMPRE chame esta função ANTES de criarAgendamento. Retorna ID, nome, preços e regras de precificação.",
        parameters: {
            type: "object",
            properties: {
                nomeServico: {
                    type: "string",
                    description: "Nome ou parte do nome do serviço (ex: 'sofá', 'colchão', 'tapete')"
                },
                tamanho: {
                    type: "string",
                    description: "Tamanho/variação do serviço se aplicável (ex: '3 lugares', 'queen', '2m x 3m')"
                }
            },
            required: ["nomeServico"]
        }
    },

    // ═══════════════════════════════════════════════════════════════════
    // 💰 CALCULADORA DE ORCAMENTO (para servicos com modoAtendimento = "calculadora")
    // ═══════════════════════════════════════════════════════════════════
    {
        name: "calcularOrcamentoIA",
        description: "Calcula orcamento dinamico usando a calculadora de precos da empresa. Use para servicos com modo 'calculadora'. Retorna valor final calculado.",
        parameters: {
            type: "object",
            properties: {
                nomeServico: {
                    type: "string",
                    description: "Nome do servico (ex: 'limpeza de sofa', 'higienizacao de colchao')"
                },
                detalhes: {
                    type: "string",
                    description: "Detalhes do servico: tamanho, condicao, quantidade (ex: 'sofa 3 lugares com manchas')"
                },
                horasEstimadas: {
                    type: "number",
                    description: "Horas estimadas de trabalho (ex: 2.5)"
                },
                enderecoCliente: {
                    type: "string",
                    description: "Endereco do cliente para calculo de deslocamento"
                }
            },
            required: ["nomeServico", "detalhes"]
        }
    }
];

/**
 * Executar função chamada pela IA
 * @param {String} functionName - Nome da função
 * @param {Object} args - Argumentos
 * @param {Object} context - Contexto do fluxo
 * @returns {Promise<Object>} - Resultado
 */
async function executeToolFunction(functionName, args, context = {}) {
    console.log(`\n🔧 Executando função: ${functionName}`);
    console.log('📥 Argumentos:', JSON.stringify(args, null, 2));

    const empresa_id = context?.empresa_id || null;
    const ew = empresaWhere(empresa_id);

    try {
    switch (functionName) {
            // ═══════════════════════════════════════════════════════════════════
            // 📅 AGENDAMENTOS
            // ═══════════════════════════════════════════════════════════════════
            case 'buscarDisponibilidades': {
                const availabilityHelper = require('../flows/helpers/availabilityHelper');
                const resultado = await availabilityHelper.buscarOpcoesDisponibilidade(
                args.dataInicio,
                args.dataFim,
                args.duracaoMinutos || 60,
                    args.periodoPreferido || 'qualquer',
                    args.servicoId || null,
                    args.subservicoId || null,
                    empresa_id
                );
                console.log(`✅ Encontradas ${resultado?.length || 0} opções de disponibilidade`);
                return resultado;
            }

            case 'verificarHorarioDisponivel': {
            const { verificarDisponibilidadeGeral } = require('../flows/helpers/availabilityHelper');
                const resultado = await verificarDisponibilidadeGeral(
                args.data,
                args.horaInicio,
                args.horaFim,
                args.servicoId,
                args.subservicoId,
                empresa_id
            );
                console.log(`✅ Horário ${args.horaInicio} em ${args.data}: ${resultado.disponivel ? 'Disponível' : 'Indisponível'}`);
                return resultado;
            }

            case 'consultarAgendamentosCliente': {
                const clienteId = args.clienteId || context?.cliente?.cli_Id;
                if (!clienteId) {
                    return { error: 'Cliente não identificado', agendamentos: [] };
                }
                
                const tipo = args.tipo || 'proximos';
                const limite = args.limite || 5;
                const hoje = moment().format('YYYY-MM-DD');
                
                // Usar a função completa do agendaUtils
                const { getAgendamentos } = require('./agendaUtils');
                
                let query = `
                    SELECT * FROM AGENDAMENTO a
                    WHERE a.cli_id = ?
                    AND a.age_ativo = 1
                    AND a.${ew.sql}
                `;
                
                const params = [clienteId, ...ew.params];

                switch (tipo) {
                    case 'ultimos':
                        query += ` AND a.age_data < ? ORDER BY a.age_data DESC, a.age_horaInicio DESC`;
                        params.push(hoje);
                        break;
                    case 'proximos':
                        query += ` AND a.age_data >= ? ORDER BY a.age_data ASC, a.age_horaInicio ASC`;
                        params.push(hoje);
                        break;
                    case 'hoje':
                        query += ` AND a.age_data = ? ORDER BY a.age_horaInicio ASC`;
                        params.push(hoje);
                        break;
                    default:
                        query += ` ORDER BY a.age_data DESC, a.age_horaInicio DESC`;
                }
                
                query += ` LIMIT ?`;
                params.push(limite);
                
                // Usar getAgendamentos para obter dados completos
                const agendamentos = await getAgendamentos(query, params, empresa_id);
                
                // Formatar para a IA de forma mais completa
                const formatados = agendamentos.map(ag => {
                    const servicosNomes = ag.servicos?.map(s => s.ser_nome).join(', ') || 'Serviço';
                    const funcionarioNome = ag.funcionario?.[0]?.fullName || 'A definir';
                    const clienteNome = ag.cliente?.[0]?.cli_nome || '';
                    const endereco = ag.endereco?.[0] 
                        ? `${ag.endereco[0].end_logradouro || ''}, ${ag.endereco[0].end_numero || ''} - ${ag.endereco[0].end_bairro || ''}`
                        : '';
                    
                    return {
                        id: ag.age_id,
                        data: moment(ag.age_data).format('DD/MM/YYYY'),
                        diaSemana: moment(ag.age_data).format('dddd'),
                        horario: `${ag.age_horaInicio}${ag.age_horaFim ? ' às ' + ag.age_horaFim : ''}`,
                        status: ag.status || 'Pendente',
                        funcionario: funcionarioNome,
                        servicos: servicosNomes,
                        valor: ag.age_valor ? `R$ ${parseFloat(ag.age_valor).toFixed(2)}` : null,
                        valorPago: ag.age_valorPago ? `R$ ${parseFloat(ag.age_valorPago).toFixed(2)}` : null,
                        endereco: endereco,
                        observacao: ag.age_observacao,
                        pago: ag.pago
                    };
                });
                
                console.log(`✅ Encontrados ${formatados.length} agendamentos (${tipo}) para cliente ${clienteId}`);
                
                // Criar resumo textual para a IA
                let resumoTexto = '';
                if (formatados.length > 0) {
                    resumoTexto = formatados.map((ag, i) => 
                        `${i + 1}. ${ag.data} (${ag.diaSemana}) às ${ag.horario} - ${ag.servicos} com ${ag.funcionario} - Status: ${ag.status}${ag.valor ? ` - Valor: ${ag.valor}` : ''}`
                    ).join('\n');
                } else {
                    resumoTexto = tipo === 'ultimos' 
                        ? 'O cliente não possui agendamentos anteriores.' 
                        : tipo === 'proximos' 
                            ? 'O cliente não possui agendamentos futuros marcados.'
                            : 'Nenhum agendamento encontrado.';
                }
                
                return {
                    tipo,
                    total: formatados.length,
                    agendamentos: formatados,
                    resumoTexto,
                    mensagem: formatados.length > 0 
                        ? `Encontrados ${formatados.length} agendamentos` 
                        : 'Nenhum agendamento encontrado'
                };
            }

            case 'verificarDataDisponivel': {
                const { isDataBloqueada } = require('../flows/helpers/availabilityHelper');
                const bloqueada = await isDataBloqueada(args.data, empresa_id);
                return { disponivel: !bloqueada, dataBloqueada: bloqueada };
            }

            case 'criarAgendamento': {
                console.log('\n📅 ========== CRIANDO AGENDAMENTO VIA IA ==========');
                console.log('📥 Args recebidos:', JSON.stringify(args, null, 2));
                console.log('👤 Cliente no contexto:', context?.cliente?.cli_Id || context?.cliente?.id || 'NÃO ENCONTRADO');
                console.log('📦 Dados de serviço no contexto:', {
                    servico_id: context?.servico_id,
                    servico_nome: context?.servico_nome,
                    servico_preco: context?.servico_preco
                });

                if (!context || !context.cliente) {
                    console.error('❌ ERRO: Contexto sem cliente!');
                    return { error: 'Contexto com cliente necessário para criar agendamento', success: false };
                }

                const { createAgendamento } = require('../flows/actions/agendamentoActions');
                const moment = require('moment');
                const clienteId = context.cliente.cli_Id || context.cliente.id;

                // ═══════════════════════════════════════════════════════════════════
                // RESOLVER SERVIÇO - buscar pelo nome se não vier ID
                // ═══════════════════════════════════════════════════════════════════
                let servicoId = args.servicoId || context.servico_id;
                let servicoValor = args.valor || context.servico_preco || 0;
                let servicoDuracao = args.duracao || 60;

                // Tentar extrair nome do serviço das observações se não vier diretamente
                let nomeServicoParaBusca = args.nomeServico || args.servico || context.servico_nome;
                if (!nomeServicoParaBusca && args.observacoes) {
                    // Tentar extrair serviço das observações (ex: "Limpeza de sofá de 3 lugares")
                    const obsLower = args.observacoes.toLowerCase();
                    if (obsLower.includes('sofá') || obsLower.includes('sofa')) {
                        nomeServicoParaBusca = 'sofá';
                    } else if (obsLower.includes('colchão') || obsLower.includes('colchao')) {
                        nomeServicoParaBusca = 'colchão';
                    } else if (obsLower.includes('tapete')) {
                        nomeServicoParaBusca = 'tapete';
                    } else if (obsLower.includes('cadeira')) {
                        nomeServicoParaBusca = 'cadeira';
                    } else if (obsLower.includes('poltrona')) {
                        nomeServicoParaBusca = 'poltrona';
                    } else if (obsLower.includes('impermeabilização') || obsLower.includes('impermeabilizacao')) {
                        nomeServicoParaBusca = 'impermeabilização';
                    }
                    if (nomeServicoParaBusca) {
                        console.log(`🔍 Extraído nome do serviço das observações: "${nomeServicoParaBusca}"`);
                    }
                }

                // Tentar extrair tamanho das observações
                let tamanhoParaBusca = args.tamanho || context.tamanho_servico;
                if (!tamanhoParaBusca && args.observacoes) {
                    const obsLower = args.observacoes.toLowerCase();
                    if (obsLower.includes('3 lugares') || obsLower.includes('três lugares')) {
                        tamanhoParaBusca = '3 lugares';
                    } else if (obsLower.includes('2 lugares') || obsLower.includes('dois lugares')) {
                        tamanhoParaBusca = '2 lugares';
                    } else if (obsLower.includes('4 lugares') || obsLower.includes('quatro lugares')) {
                        tamanhoParaBusca = '4 lugares';
                    } else if (obsLower.includes('5 lugares') || obsLower.includes('cinco lugares')) {
                        tamanhoParaBusca = '5 lugares';
                    } else if (obsLower.includes('solteiro')) {
                        tamanhoParaBusca = 'solteiro';
                    } else if (obsLower.includes('casal')) {
                        tamanhoParaBusca = 'casal';
                    } else if (obsLower.includes('queen')) {
                        tamanhoParaBusca = 'queen';
                    } else if (obsLower.includes('king')) {
                        tamanhoParaBusca = 'king';
                    }
                    if (tamanhoParaBusca) {
                        console.log(`📏 Extraído tamanho das observações: "${tamanhoParaBusca}"`);
                    }
                }

                if (!servicoId && nomeServicoParaBusca) {
                    console.log(`🔍 Buscando serviço pelo nome: "${nomeServicoParaBusca}" ${tamanhoParaBusca ? `(${tamanhoParaBusca})` : ''}`);

                    const busca = await executeToolFunction('buscarServicoPorNome', {
                        nomeServico: nomeServicoParaBusca,
                        tamanho: tamanhoParaBusca
                    }, context);

                    if (busca.success && busca.servicoId) {
                        servicoId = busca.servicoId;
                        servicoValor = busca.preco || servicoValor;
                        servicoDuracao = busca.duracao || servicoDuracao;
                        console.log(`✅ Serviço encontrado: ID ${servicoId}, R$ ${servicoValor}, ${servicoDuracao} min`);
                    } else {
                        console.log('⚠️ Serviço não encontrado pelo nome:', busca);
                    }
                } else if (servicoId) {
                    console.log(`✅ Serviço já definido: ID ${servicoId}, R$ ${servicoValor}`);
                } else {
                    console.log('⚠️ Nenhum serviço identificado');
                }

                // ═══════════════════════════════════════════════════════════════════
                // RESOLVER ENDEREÇO - usar endereço encontrado se disponível
                // ═══════════════════════════════════════════════════════════════════
                let enderecoFinal = args.endereco;
                let coordenadasCliente = null;

                // Se há endereço encontrado pelo buscarEnderecoPorLocal, usar ele
                if (context.enderecoEncontrado && context.enderecoEncontrado.success) {
                    console.log('📍 Usando endereço encontrado via Google Maps');
                    enderecoFinal = context.enderecoEncontrado.endereco || context.enderecoEncontrado.enderecoCompleto;
                    coordenadasCliente = context.enderecoEncontrado.coordenadas;
                }

                // ═══════════════════════════════════════════════════════════════════
                // CALCULAR TAXA DE DESLOCAMENTO (se configurado)
                // ═══════════════════════════════════════════════════════════════════
                let taxaDeslocamento = 0;
                if (coordenadasCliente || enderecoFinal) {
                    try {
                        const taxaResult = await executeToolFunction('calcularTaxaDeslocamento', {
                            enderecoCliente: typeof enderecoFinal === 'string' ? enderecoFinal : JSON.stringify(enderecoFinal),
                            coordenadasCliente: coordenadasCliente
                        }, context);

                        if (taxaResult.success && taxaResult.taxaDeslocamento > 0) {
                            taxaDeslocamento = taxaResult.taxaDeslocamento;
                            console.log(`💰 Taxa de deslocamento calculada: R$ ${taxaDeslocamento}`);
                        }
                    } catch (taxaError) {
                        console.log('⚠️ Não foi possível calcular taxa de deslocamento:', taxaError.message);
                    }
                }

                // Adicionar taxa ao valor total
                const valorTotal = parseFloat(servicoValor) + parseFloat(taxaDeslocamento);
                console.log(`💵 Valor total (serviço + deslocamento): R$ ${valorTotal}`);

                // Atualizar args com dados resolvidos
                args.servicoId = servicoId;
                args.valor = valorTotal;
                args.valorServico = servicoValor;
                args.taxaDeslocamento = taxaDeslocamento;
                
                // ═══════════════════════════════════════════════════════════════════
                // VERIFICAÇÃO DE DUPLICATAS - Evita criar múltiplos agendamentos
                // ═══════════════════════════════════════════════════════════════════
                console.log('🔍 Verificando agendamentos existentes para evitar duplicatas...');
                
                // Verificar se já existe agendamento pendente para a mesma data
                const agendamentosExistentes = await dbQuery(`
                    SELECT age_id, age_data, age_horaInicio, age_horaFim, ast_id
                    FROM AGENDAMENTO
                    WHERE cli_id = ?
                    AND age_ativo = 1
                    AND ast_id IN (1, 2)  -- Agendado ou Confirmado
                    AND age_data = ?
                    AND ${ew.sql}
                    ORDER BY age_horaInicio ASC
                `, [clienteId, args.data, ...ew.params]);
                
                if (agendamentosExistentes.length > 0) {
                    const existente = agendamentosExistentes[0];
                    console.log(`⚠️ DUPLICATA DETECTADA! Já existe agendamento #${existente.age_id} para ${args.data}`);
                    console.log(`   Horário existente: ${existente.age_horaInicio}`);
                    console.log(`   Horário solicitado: ${args.horaInicio}`);
                    
                    // Se é para o mesmo horário, retornar sucesso sem criar novo
                    if (existente.age_horaInicio === args.horaInicio) {
                        console.log('✅ Agendamento já existe para este horário, retornando existente');
                        return {
                            success: true,
                            agendamentoId: existente.age_id,
                            agendamento_id: existente.age_id,
                            jaExistia: true,
                            mensagemConfirmacao: `Você já tem um agendamento confirmado para ${args.data} às ${args.horaInicio}`,
                            contextUpdates: {
                                agendamento_id: existente.age_id,
                                agendamento_data: args.data,
                                agendamento_hora: args.horaInicio
                            }
                        };
                    }

                    // Se é horário diferente, atualizar o existente ao invés de criar novo
                    console.log('🔄 Atualizando agendamento existente para novo horário...');
                    const { updateAgendamento } = require('../flows/actions/agendamentoActions');
                    const updateResult = await updateAgendamento({
                        agendamentoId: existente.age_id,
                        data: args.data,
                        horaInicio: args.horaInicio,
                        horaFim: args.horaFim,
                        observacoes: `Horário alterado via IA de ${existente.age_horaInicio} para ${args.horaInicio} - ${moment().format('DD/MM/YYYY HH:mm')}`
                    }, context);

                    if (updateResult.success) {
                        console.log(`✅ Agendamento #${existente.age_id} atualizado para ${args.horaInicio}`);
                        return {
                            ...updateResult,
                            agendamentoId: existente.age_id,
                            agendamento_id: existente.age_id,
                            foiAtualizado: true,
                            mensagemConfirmacao: `Agendamento alterado para ${args.data} às ${args.horaInicio}`,
                            contextUpdates: {
                                agendamento_id: existente.age_id,
                                agendamento_data: args.data,
                                agendamento_hora: args.horaInicio
                            }
                        };
                    }
                }
                
                // Verificar se existe agendamento pendente em outra data (remarcação)
                const agendamentoPendente = await dbQuery(`
                    SELECT age_id, age_data, age_horaInicio
                    FROM AGENDAMENTO
                    WHERE cli_id = ?
                    AND age_ativo = 1
                    AND ast_id IN (1, 2)  -- Agendado ou Confirmado
                    AND age_data >= CURDATE()
                    AND ${ew.sql}
                    ORDER BY age_data ASC, age_horaInicio ASC
                    LIMIT 1
                `, [clienteId, ...ew.params]);
                
                if (agendamentoPendente.length > 0 && context.isRemarking) {
                    const pendente = agendamentoPendente[0];
                    console.log(`🔄 Cliente tem agendamento pendente #${pendente.age_id} para ${pendente.age_data}`);
                    console.log('   Detectada intenção de remarcação, atualizando ao invés de criar...');
                    
                    const { updateAgendamento } = require('../flows/actions/agendamentoActions');
                    const updateResult = await updateAgendamento({
                        agendamentoId: pendente.age_id,
                        data: args.data,
                        horaInicio: args.horaInicio,
                        horaFim: args.horaFim,
                        statusId: 7, // Remarcado
                        observacoes: `Remarcado via IA de ${moment(pendente.age_data).format('DD/MM/YYYY')} ${pendente.age_horaInicio} para ${args.data} ${args.horaInicio}`
                    }, context);
                    
                    if (updateResult.success) {
                        return {
                            ...updateResult,
                            foiRemarcado: true,
                            agendamentoAnterior: {
                                id: pendente.age_id,
                                data: pendente.age_data,
                                hora: pendente.age_horaInicio
                            }
                        };
                    }
                }
                
                // ═══════════════════════════════════════════════════════════════════
                // CRIAR NOVO AGENDAMENTO (se não houver duplicata)
                // ═══════════════════════════════════════════════════════════════════
                
                // Calcular hora fim se não fornecida (60 minutos padrão)
                let horaFim = args.horaFim;
                if (!horaFim && args.horaInicio) {
                    const horaInicioMoment = moment(args.horaInicio, 'HH:mm');
                    horaFim = horaInicioMoment.add(60, 'minutes').format('HH:mm');
                    console.log(`⏰ Hora fim calculada: ${horaFim}`);
                }
                
                const createConfig = {
                    data: args.data,
                    horaInicio: args.horaInicio,
                    horaFim: horaFim,
                    funcionarioId: args.funcionarioId || args.profissionalId || null, // null = escolher automaticamente
                    observacoes: args.observacoes || `Agendamento criado via IA - ${moment().format('DD/MM/YYYY HH:mm')}`,
                    statusId: 1, // Agendado
                    fonte: 'ia_gemini',
                    enderecoMode: enderecoFinal ? 'novo' : 'padrao',
                    duracaoMinutos: servicoDuracao
                };

                // Processar endereço (usar enderecoFinal que pode ter sido resolvido via Maps)
                if (enderecoFinal) {
                    if (typeof enderecoFinal === 'string') {
                        // Se é string, usar como logradouro
                        createConfig.enderecoMode = 'novo';
                        createConfig.endereco = {
                            logradouro: enderecoFinal
                        };
                    } else if (typeof enderecoFinal === 'object') {
                        // Se é objeto (do buscarEnderecoPorLocal), usar campos
                        createConfig.enderecoMode = 'novo';
                        createConfig.endereco = {
                            logradouro: enderecoFinal.logradouro || '',
                            numero: enderecoFinal.numero || '',
                            bairro: enderecoFinal.bairro || '',
                            cidade: enderecoFinal.cidade || '',
                            estado: enderecoFinal.estado || '',
                            cep: enderecoFinal.cep || ''
                        };
                    }
                }

                // Serviços - SEMPRE adicionar se tivermos um servicoId (resolvido ou passado)
                createConfig.servicos = [];
                if (servicoId) {
                    console.log(`✅ Adicionando serviço ao agendamento: ID ${servicoId}, R$ ${servicoValor}`);
                    createConfig.servicos.push({
                        servicoId: servicoId,
                        quantidade: args.quantidade || 1,
                        valor: servicoValor || 0,
                        descricao: args.descricaoServico || args.nomeServico || context.servico_nome || ''
                    });

                    // Se há taxa de deslocamento, adicionar como item separado ou na observação
                    if (taxaDeslocamento > 0) {
                        createConfig.observacoes = (createConfig.observacoes || '') +
                            `\n💰 Taxa de deslocamento: R$ ${taxaDeslocamento.toFixed(2)}`;
                    }
                } else if (Array.isArray(args.servicos) && args.servicos.length > 0) {
                    createConfig.servicos = args.servicos;
                } else {
                    console.error('❌ ERRO: Agendamento requer ao menos um serviço!');
                    return {
                        success: false,
                        error: 'É necessário informar um serviço para criar o agendamento. Use buscarServicoPorNome primeiro para obter o servicoId.',
                        requiresService: true,
                        sugestao: 'Chame buscarServicoPorNome("nome do serviço") antes de criarAgendamento'
                    };
                }
                
                console.log('📋 Config final:', JSON.stringify(createConfig, null, 2));
                
                try {
                    const resultado = await createAgendamento(createConfig, context);
                    
                    console.log('📤 Resultado createAgendamento:', JSON.stringify(resultado, null, 2));
                    
                    if (resultado.success) {
                        console.log(`✅ ========== AGENDAMENTO #${resultado.agendamentoId || resultado.agendamento_id} CRIADO! ==========\n`);
                        
                        // Criar negócio automaticamente se não existir
                        const clienteId = context.cliente.cli_Id || context.cliente.id;
                        const clienteNome = context.cliente.cli_nome || 'Cliente';
                        
                        try {
                            const { criarNegocioAutomatico } = require('./negocioHelper');
                            const negocioExistente = await dbQuery(
                                `SELECT id FROM Negocios WHERE cli_Id = ? AND status = 'Pendente' AND ${ew.sql} LIMIT 1`,
                                [clienteId, ...ew.params]
                            );
                            
                            if (negocioExistente.length === 0) {
                                console.log('💼 Criando negócio automático para o cliente...');
                                const negocioResult = await criarNegocioAutomatico({
                                    clienteId,
                                    titulo: `Agendamento - ${clienteNome}`,
                                    valor: args.valor || 0,
                                    origem: 'Agendamento via IA',
                                    descricao: `Agendamento para ${args.data} às ${args.horaInicio}`,
                                    empresa_id
                                });
                                
                                if (negocioResult.success) {
                                    console.log(`✅ Negócio #${negocioResult.negocioId} criado automaticamente!`);
                                    
                                    // Vincular agendamento ao negócio
                                    await dbQuery(
                                        'UPDATE Negocios SET age_id = ? WHERE id = ? AND ' + ew.sql,
                                        [resultado.agendamentoId || resultado.agendamento_id, negocioResult.negocioId, ...ew.params]
                                    );
                                }
                            }
                        } catch (negocioErr) {
                            console.error('⚠️ Erro ao criar negócio automático:', negocioErr.message);
                            // Não falhar o agendamento por causa do negócio
                        }
                        
                        return {
                            ...resultado,
                            mensagemConfirmacao: `Agendamento confirmado para ${args.data} às ${args.horaInicio}`,
                            contextUpdates: {
                                agendamento_id: resultado.agendamentoId || resultado.agendamento_id,
                                agendamento_data: args.data,
                                agendamento_hora: args.horaInicio
                            }
                        };
                    }
                    
                    console.error('❌ Falha ao criar agendamento:', resultado.error);
                    return resultado;
                } catch (createError) {
                    console.error('❌ EXCEÇÃO ao criar agendamento:', createError);
                    return { success: false, error: createError.message };
                }
            }

            case 'atualizarAgendamento': {
            if (!context) {
                    return { error: 'Contexto necessário para atualizar agendamento', success: false };
            }
                
            const { updateAgendamento } = require('../flows/actions/agendamentoActions');
            
                // Mapear status para ID
            let statusId = null;
            if (args.status) {
                const statusMap = {
                    'agendado': 1,
                    'confirmado': 2,
                    'atendido': 3,
                    'concluido': 3,
                        'em_atendimento': 4,
                        'em_deslocamento': 5,
                    'cancelado': 6,
                    'remarcado': 7
                };
                statusId = statusMap[args.status.toLowerCase()] || null;
            }
            
                const updateConfig = {
                agendamentoId: args.agendamentoId || context.agendamento_id,
                data: args.data,
                horaInicio: args.horaInicio,
                horaFim: args.horaFim,
                    funcionarioId: args.funcionarioId,
                statusId: statusId,
                    observacoes: args.observacoes
                };
                
                console.log('📝 Atualizando agendamento:', updateConfig);
                return await updateAgendamento(updateConfig, context);
            }

            case 'cancelarAgendamento': {
            if (!context) {
                    return { error: 'Contexto necessário para cancelar agendamento', success: false };
                }
                
                const { updateAgendamento: updateForCancel } = require('../flows/actions/agendamentoActions');
                return await updateForCancel({
                    agendamentoId: args.agendamentoId || context.agendamento_id,
                    statusId: 6, // Cancelado
                    observacoes: args.motivo || 'Cancelado via IA'
                }, context);
            }

            // ═══════════════════════════════════════════════════════════════════
            // 💼 CRM E NEGÓCIOS
            // ═══════════════════════════════════════════════════════════════════
            case 'criarNegocio': {
                console.log('\n💼 ========== CRIANDO NEGÓCIO VIA IA ==========');
                console.log('📥 Args recebidos:', JSON.stringify(args, null, 2));
                
                if (!context || !context.cliente) {
                    console.error('❌ ERRO: Contexto sem cliente!');
                    return { error: 'Contexto com cliente necessário para criar negócio', success: false };
                }
                
                const clienteId = context.cliente.cli_Id || context.cliente.id;
                const clienteNome = context.cliente.cli_nome || 'Cliente';
                
                // Verificar se já existe negócio ativo para este cliente
                const negocioExistente = await dbQuery(
                    `SELECT id, title, status FROM Negocios WHERE cli_Id = ? AND status = 'Pendente' AND ${ew.sql} ORDER BY created_at DESC LIMIT 1`,
                    [clienteId, ...ew.params]
                );
                
                if (negocioExistente.length > 0) {
                    console.log(`⚠️ Cliente já possui negócio ativo: #${negocioExistente[0].id} - ${negocioExistente[0].title}`);
                    
                    // Atualizar negócio existente se necessário
                    if (args.valor || args.titulo) {
                        const { atualizarNegocio } = require('./negocioHelper');
                        await atualizarNegocio({
                            negocioId: negocioExistente[0].id,
                            valor: args.valor,
                            anotacao: `Atualizado via IA: ${args.descricao || args.titulo || 'Nova interação'}`,
                            empresa_id
                        });
                    }
                    
                    return {
                        success: true,
                        message: `Negócio existente #${negocioExistente[0].id} utilizado`,
                        negocioId: negocioExistente[0].id,
                        negocio_id: negocioExistente[0].id,
                        jaExistia: true,
                        contextUpdates: {
                            negocio_id: negocioExistente[0].id
                        }
                    };
                }
                
                // Criar novo negócio
                const { criarNegocioAutomatico } = require('./negocioHelper');
                const resultado = await criarNegocioAutomatico({
                    clienteId,
                    titulo: args.titulo || `Interesse - ${clienteNome}`,
                    valor: args.valor || 0,
                    origem: 'Conversa via IA',
                    descricao: args.descricao || `Cliente demonstrou interesse em agendamento/serviço`,
                    empresa_id
                });

                if (resultado.success) {
                    console.log(`✅ ========== NEGÓCIO #${resultado.negocioId} CRIADO! ==========\n`);
                    return {
                        ...resultado,
                        negocio_id: resultado.negocioId,
                        contextUpdates: {
                            negocio_id: resultado.negocioId
                        }
                    };
                }
                
                console.error('❌ Falha ao criar negócio:', resultado.error);
                return resultado;
            }

            case 'atualizarNegocio': {
                console.log('\n💼 ========== ATUALIZANDO NEGÓCIO VIA IA ==========');

                if (!context) {
                    return { error: 'Contexto necessário para atualizar negócio', success: false };
                }

                const { atualizarNegocio: atualizarNegocioHelper } = require('./negocioHelper');

                const negocioId = args.negocioId || context.negocio_id;
                if (!negocioId) {
                    return { error: 'ID do negócio não informado', success: false };
                }

                const resultado = await atualizarNegocioHelper({
                    negocioId: negocioId,
                    etapaId: args.etapaId || args.stageId,
                    valor: args.valor,
                    anotacao: args.anotacao || args.descricao,
                    empresa_id
                });

                if (resultado.success) {
                    console.log('✅ Negócio atualizado com sucesso!');
                    return {
                        ...resultado,
                        contextUpdates: {
                            negocio_atualizado: true,
                            negocio_etapa_id: args.etapaId || context.negocio_etapa_id
                        }
                    };
                }

                return resultado;
            }

            case 'marcarNegocioGanho': {
                console.log('\n🎉 ========== MARCANDO NEGÓCIO COMO GANHO ==========');

                const { marcarNegocioGanho: ganhoHelper } = require('./negocioHelper');

                const negocioIdGanho = args.negocioId || context.negocio_id;
                if (!negocioIdGanho) {
                    return { error: 'ID do negócio não informado', success: false };
                }

                const resultadoGanho = await ganhoHelper({
                    negocioId: negocioIdGanho,
                    valorFinal: args.valorFinal,
                    empresa_id
                });

                if (resultadoGanho.success) {
                    console.log('✅ Negócio marcado como GANHO!');
                }

                return resultadoGanho;
            }

            case 'marcarNegocioPerdido': {
                console.log('\n😞 ========== MARCANDO NEGÓCIO COMO PERDIDO ==========');

                const { marcarNegocioPerdido: perdidoHelper } = require('./negocioHelper');

                const negocioIdPerdido = args.negocioId || context.negocio_id;
                if (!negocioIdPerdido) {
                    return { error: 'ID do negócio não informado', success: false };
                }

                const resultadoPerdido = await perdidoHelper({
                    negocioId: negocioIdPerdido,
                    motivo: args.motivo || 'Não especificado',
                    observacao: args.observacao,
                    empresa_id
                });

                if (resultadoPerdido.success) {
                    console.log('✅ Negócio marcado como PERDIDO');
                }

                return resultadoPerdido;
            }

            case 'atualizarCliente': {
                if (!context || !context.cliente) {
                    return { error: 'Contexto com cliente necessário para atualizar', success: false };
                }
                
                const { updateCliente } = require('../flows/actions/clienteActions');
                return await updateCliente({
                nome: args.nome,
                email: args.email,
                telefone: args.telefone,
                    endereco: args.endereco,
                observacoes: args.observacoes,
                tags: args.tags
                }, context);
            }

            // ═══════════════════════════════════════════════════════════════════
            // ⏱️ CONTROLE DE FLUXO
            // ═══════════════════════════════════════════════════════════════════
            case 'aguardarResposta': {
                console.log('⏳ Configurando aguardar resposta...');
                
                const timeout = args.timeout || 300; // 5 minutos padrão
                const variavel = args.variavel || 'resposta_cliente';
                
                return {
                    success: true,
                    action: 'wait_reply',
                    timeout: timeout,
                    variavel: variavel,
                    contextUpdates: {
                        waiting_reply: true,
                        wait_timeout: timeout,
                        wait_variable: variavel
                    }
                };
            }

            case 'agendarAcaoFutura': {
                console.log(`⏰ Agendando ação para ${args.minutos} minutos...`);
                
                if (!context || !context.cliente) {
                    return { error: 'Contexto necessário para agendar ação', success: false };
                }
                
                const clienteId = context.cliente.cli_Id || context.cliente.id;
                const dataAgendada = moment().add(args.minutos, 'minutes').format('YYYY-MM-DD HH:mm:ss');
                
                // Inserir na tabela de ações agendadas
                try {
                    const phone = context.cliente?.cli_celular || context.phone || null;
                    await dbQuery(`
                        INSERT INTO FlowScheduledActions
                        (flowRunId, clientId, phone, acao, parametros, executarEm, executado, created_at, empresa_id)
                        VALUES (?, ?, ?, ?, ?, ?, 0, NOW(), ?)
                    `, [
                        context.flowRunId || null,
                        clienteId,
                        phone,
                        args.acao,
                        JSON.stringify({
                            mensagem: args.mensagem,
                            flowId: context.flowId
                        }),
                        dataAgendada,
                        empresa_id
                    ]);
                    
                    console.log(`✅ Ação agendada para ${dataAgendada}`);
                    
                    return {
                        success: true,
                        scheduledAt: dataAgendada,
                        action: args.acao,
                        message: `Ação "${args.acao}" agendada para ${args.minutos} minutos`
                    };
                } catch (error) {
                    console.error('❌ Erro ao agendar ação:', error);
                    return { error: error.message, success: false };
                }
            }

            case 'bloquearClienteFluxos': {
                console.log(`🔒 ${args.bloquear ? 'Bloqueando' : 'Desbloqueando'} cliente de fluxos...`);
                
                if (!context || !context.cliente) {
                    return { error: 'Contexto com cliente necessário', success: false };
                }
                
                const clienteId = context.cliente.cli_Id || context.cliente.id;
                
                try {
                    await dbQuery(`
                        UPDATE CLIENTES
                        SET flows_blocked = ?, flows_blocked_at = ${args.bloquear ? 'NOW()' : 'NULL'}
                        WHERE cli_Id = ? AND ${ew.sql}
                    `, [args.bloquear ? 1 : 0, clienteId, ...ew.params]);
                    
                    console.log(`✅ Cliente ${args.bloquear ? 'bloqueado' : 'desbloqueado'}`);
                    
                    return {
                        success: true,
                        blocked: args.bloquear,
                        contextUpdates: {
                            flows_blocked: args.bloquear
                        }
                    };
                } catch (error) {
                    console.error('❌ Erro ao alterar bloqueio:', error);
                    return { error: error.message, success: false };
                }
            }

            case 'encaminharParaAtendente': {
                console.log('👨‍💼 Encaminhando para atendente...');
                
                if (!context || !context.cliente) {
                    return { error: 'Contexto necessário para encaminhar', success: false };
                }
                
                // args.mensagem é INTERNA (motivo do encaminhamento) - NUNCA enviar ao cliente
                const mensagemInterna = args.mensagem || 'Encaminhado para atendimento humano';
                const clienteId = context.cliente.cli_Id || context.cliente.id;

                try {
                    // NÃO enviar mensagem ao cliente aqui - a IA já envia sua própria resposta conversacional
                    // A mensagem interna vai apenas para o log de encaminhamento
                    
                    // Bloquear fluxos automáticos
                    await dbQuery(`
                        UPDATE CLIENTES
                        SET flows_blocked = 1, flows_blocked_at = NOW(), flows_blocked_reason = 'wait_for_agent'
                        WHERE cli_Id = ? AND ${ew.sql}
                    `, [clienteId, ...ew.params]);
                    
                    // Registrar encaminhamento
                    // FlowForwardLog: flow_run_id, flow_id, node_id, contact_phone, forwarded_to_phone, forwarded_to_label, message_content, status
                    const phone = context.cliente?.cli_celular || context.phone || '';
                    await dbQuery(`
                        INSERT INTO FlowForwardLog
                        (flow_run_id, flow_id, node_id, contact_phone, forwarded_to_phone, forwarded_to_label, message_content, status, created_at, empresa_id)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', NOW(), ?)
                    `, [
                        context.flowRunId || 0,
                        context.flowId || 0,
                        context.nodeId || 0,
                        phone,
                        args.departamento || 'atendente',
                        `IA encaminhou - ${args.prioridade || 'normal'}`,
                        args.mensagem || 'Encaminhado para atendimento humano',
                        empresa_id
                    ]);
                    
                    console.log('✅ Encaminhado para atendente');
                    
                    return {
                        success: true,
                        wait_for_agent: true,
                        contextUpdates: {
                            wait_for_agent: true,
                            flows_blocked: true
                        }
                    };
                } catch (error) {
                    console.error('❌ Erro ao encaminhar:', error);
                    return { error: error.message, success: false };
                }
            }

            case 'redirecionarFluxo': {
                console.log('↪️ Redirecionando fluxo...');
                
                let fluxoId = args.fluxoId;
                
                // Se passou nome, buscar ID
                if (!fluxoId && args.fluxoNome) {
                    const [flow] = await dbQuery(`
                        SELECT id FROM Flows WHERE name LIKE ? AND status = 'active' AND ${ew.sql} LIMIT 1
                    `, [`%${args.fluxoNome}%`, ...ew.params]);
                    
                    if (flow) {
                        fluxoId = flow.id;
                    }
                }
                
                if (!fluxoId) {
                    return { error: 'Fluxo não encontrado', success: false };
                }
                
                return {
                    success: true,
                    action: 'redirect_flow',
                    targetFlowId: fluxoId,
                    contextUpdates: {
                        redirect_to_flow: fluxoId
                    }
                };
            }

            // ═══════════════════════════════════════════════════════════════════
            // 💬 COMUNICAÇÃO
            // ═══════════════════════════════════════════════════════════════════
            case 'enviarMensagem': {
                if (!context) {
                    return { error: 'Contexto necessário para enviar mensagem', success: false };
                }
                
                const { sendWhatsAppMessage } = require('../flows/actions/messageActions');
                return await sendWhatsAppMessage({
                    message: args.mensagem,
                    phone: args.phone,
                    fromAI: true // Marcar para ativar TTS se configurado
                }, context);
            }

            case 'enviarEmail': {
            if (!context) {
                    return { error: 'Contexto necessário para enviar email', success: false };
                }
                
                const { sendEmail } = require('../flows/actions/emailActions');
                return await sendEmail({
                    to: args.destinatario || context.cliente?.cli_email,
                    subject: args.assunto,
                    body: args.corpo
                }, context);
            }

            // ═══════════════════════════════════════════════════════════════════
            // 🗺️ LOCALIZAÇÃO E DISTÂNCIA
            // ═══════════════════════════════════════════════════════════════════
            case 'geocodificarEndereco': {
                const { geocodificarEnderecoComMaps } = require('../flows/helpers/availabilityHelper');
                const coords = await geocodificarEnderecoComMaps(args.endereco);
                console.log(`📍 Geocodificado: ${args.endereco} -> ${JSON.stringify(coords)}`);
                return { latLng: coords, endereco: args.endereco };
            }

            case 'buscarEnderecoPorLocal': {
                console.log('\n🗺️ ========== BUSCA DE ENDEREÇO POR LOCAL ==========');
                const { buscarEnderecoPorLocal } = require('../flows/helpers/availabilityHelper');

                // Usar cidade padrão da empresa se não informada
                let cidadeEstado = args.cidadeEstado;
                if (!cidadeEstado) {
                    try {
                        const empresaConfig = await dbQuery("SELECT value FROM Options WHERE type = 'gemini_empresa' AND " + ew.sql + " LIMIT 1", [...ew.params]);
                        if (empresaConfig?.[0]?.value) {
                            const emp = JSON.parse(empresaConfig[0].value);
                            cidadeEstado = emp.regiaoAtendida || emp.localizacao || 'Curitiba, PR';
                        }
                    } catch (_) {
                        cidadeEstado = 'Curitiba, PR';
                    }
                }

                const resultado = await buscarEnderecoPorLocal(args.local, cidadeEstado, empresa_id);

                if (resultado.success) {
                    console.log(`✅ Endereço encontrado: ${resultado.enderecoCompleto}`);

                    // Salvar no contexto para uso posterior
                    if (context) {
                        context.enderecoEncontrado = resultado;
                        context.endereco_completo = resultado.enderecoCompleto;
                        context.coordenadas_cliente = resultado.coordenadas;
                    }

                    return {
                        success: true,
                        ...resultado,
                        mensagem: `Encontrei o endereço: ${resultado.enderecoCompleto}`
                    };
                }

                return resultado;
            }

            case 'calcularTaxaDeslocamento': {
                console.log('\n💰 ========== CÁLCULO DE TAXA DE DESLOCAMENTO ==========');
                const { geocodificarEnderecoComMaps, calcularTaxaDeslocamento } = require('../flows/helpers/availabilityHelper');

                // Buscar coordenadas da base da empresa
                let coordsBase = null;
                try {
                    const empresaConfig = await dbQuery("SELECT value FROM Options WHERE type = 'gemini_empresa' AND " + ew.sql + " LIMIT 1", [...ew.params]);
                    if (empresaConfig?.[0]?.value) {
                        const emp = JSON.parse(empresaConfig[0].value);
                        if (emp.coordenadas) {
                            coordsBase = emp.coordenadas;
                        } else if (emp.localizacao) {
                            coordsBase = await geocodificarEnderecoComMaps(emp.localizacao);
                        }
                    }
                } catch (_) {}

                // Usar coordenadas padrão de Curitiba se não encontrar
                if (!coordsBase) {
                    coordsBase = { lat: -25.4284, lng: -49.2733 }; // Centro de Curitiba
                }

                // Obter coordenadas do cliente
                let coordsCliente = args.coordenadasCliente;
                if (!coordsCliente && args.enderecoCliente) {
                    coordsCliente = await geocodificarEnderecoComMaps(args.enderecoCliente);
                }

                if (!coordsCliente) {
                    return {
                        success: false,
                        error: 'Não foi possível obter coordenadas do endereço do cliente'
                    };
                }

                // Buscar configuração de taxa do banco
                let configTaxa = null;
                try {
                    const taxaConfig = await dbQuery("SELECT value FROM Options WHERE type = 'gemini_agendamentos' AND " + ew.sql + " LIMIT 1", [...ew.params]);
                    if (taxaConfig?.[0]?.value) {
                        const agendConfig = JSON.parse(taxaConfig[0].value);
                        if (agendConfig.taxaDeslocamento) {
                            configTaxa = agendConfig.taxaDeslocamento;
                        }
                    }
                } catch (_) {}

                const resultado = await calcularTaxaDeslocamento(coordsBase, coordsCliente, configTaxa);

                console.log(`📏 Distância: ${resultado.distanciaKm} km`);
                console.log(`💰 Taxa: R$ ${resultado.taxaDeslocamento}`);

                return {
                    success: true,
                    ...resultado,
                    mensagem: resultado.dentroRaioBase
                        ? `Endereço dentro da área de atendimento (${resultado.distanciaKm} km), sem taxa adicional.`
                        : `Endereço a ${resultado.distanciaKm} km, taxa de deslocamento: R$ ${resultado.taxaDeslocamento.toFixed(2)}`
                };
            }

            case 'calcularDistancia': {
                try {
                    const { calcularDistancia } = require('./distanceHelper');
                    return await calcularDistancia(args.endereco1, args.endereco2);
                } catch (error) {
                    console.error('❌ Erro ao calcular distância:', error);
                    return { error: 'Função de distância não disponível', success: false };
                }
            }

            case 'resumirDisponibilidadeComMaps': {
                const { resumirOpcoesParaIAComMaps } = require('../flows/helpers/availabilityHelper');
                const resumo = await resumirOpcoesParaIAComMaps(args.opcoes || [], args.latLng || null);
                return { resumo };
            }

            // ═══════════════════════════════════════════════════════════════════
            // 📷 ANÁLISE DE IMAGENS DO CLIENTE
            // ═══════════════════════════════════════════════════════════════════
            case 'analisarImagemCliente': {
                console.log('\n📷 ========== ANÁLISE DE IMAGEM DO CLIENTE ==========');

                const { nomeServico, descricaoImagem, condicaoObservada, manchasVisiveis, tipoManchas, tamanhoEstimado } = args;

                console.log(`📥 Serviço: ${nomeServico}`);
                console.log(`📝 Descrição: ${descricaoImagem}`);
                console.log(`🎯 Condição: ${condicaoObservada}`);

                // Buscar configuração de serviços
                const optionsResultImg = await dbQuery(`SELECT value FROM Options WHERE type = 'gemini_agendamentos' AND ` + ew.sql, [...ew.params]);

                if (!optionsResultImg || optionsResultImg.length === 0) {
                    return { success: false, error: 'Configuração não encontrada' };
                }

                let configServicosImg;
                try {
                    configServicosImg = JSON.parse(optionsResultImg[0].value);
                } catch (err) {
                    return { success: false, error: 'Erro ao carregar configuração' };
                }

                const termoBuscaImg = nomeServico.toLowerCase();

                const servicoImg = (configServicosImg.servicos || []).find(s =>
                    (s.nome || '').toLowerCase().includes(termoBuscaImg)
                );

                if (!servicoImg || !servicoImg.regrasPrecificacao) {
                    return { success: false, error: 'Serviço não encontrado', servicoNome: nomeServico };
                }

                // Mapear condição para índice de regra (escala de preço)
                // otima/boa = menor preço, regular = médio, ruim/muito_ruim = maior preço
                const condicaoMap = { 'otima': 0, 'boa': 0, 'regular': 1, 'ruim': 2, 'muito_ruim': -1 };
                let indiceRegra = condicaoMap[condicaoObservada] || 0;
                if (indiceRegra === -1) indiceRegra = servicoImg.regrasPrecificacao.length - 1;
                if (indiceRegra >= servicoImg.regrasPrecificacao.length) indiceRegra = servicoImg.regrasPrecificacao.length - 1;

                // Buscar regra por tamanho se informado
                if (tamanhoEstimado) {
                    const regraByTamanho = servicoImg.regrasPrecificacao.find(r =>
                        (r.titulo || '').toLowerCase().includes(tamanhoEstimado.toLowerCase())
                    );
                    if (regraByTamanho) {
                        console.log(`✅ Regra encontrada por tamanho: ${regraByTamanho.titulo} - R$ ${regraByTamanho.preco}`);
                        return {
                            success: true,
                            analise: {
                                condicao: condicaoObservada,
                                manchas: manchasVisiveis || false,
                                tipoManchas: tipoManchas || null,
                                tamanhoEstimado: tamanhoEstimado,
                                observacao: descricaoImagem
                            },
                            regraSugerida: {
                                titulo: regraByTamanho.titulo,
                                preco: regraByTamanho.preco,
                                duracao: regraByTamanho.duracaoMinutos,
                                justificativa: `Baseado no tamanho "${tamanhoEstimado}" e condição "${condicaoObservada}"`
                            },
                            servicoId: servicoImg.servicoId,
                            subservicoId: servicoImg.subservicoId || null,
                            contextUpdates: {
                                imagem_analisada: true,
                                condicao_item: condicaoObservada,
                                servico_preco: regraByTamanho.preco,
                                servico_id: servicoImg.servicoId
                            }
                        };
                    }
                }

                const regraSugerida = servicoImg.regrasPrecificacao[indiceRegra];

                console.log(`✅ Regra sugerida: ${regraSugerida.titulo} - R$ ${regraSugerida.preco}`);

                return {
                    success: true,
                    analise: {
                        condicao: condicaoObservada,
                        manchas: manchasVisiveis || false,
                        tipoManchas: tipoManchas || null,
                        observacao: descricaoImagem
                    },
                    regraSugerida: {
                        titulo: regraSugerida.titulo,
                        preco: regraSugerida.preco,
                        duracao: regraSugerida.duracaoMinutos,
                        justificativa: `Baseado na condição "${condicaoObservada}", sugiro "${regraSugerida.titulo}"`
                    },
                    servicoId: servicoImg.servicoId,
                    subservicoId: servicoImg.subservicoId || null,
                    contextUpdates: {
                        imagem_analisada: true,
                        condicao_item: condicaoObservada,
                        servico_preco: regraSugerida.preco,
                        servico_id: servicoImg.servicoId
                    }
                };
            }

            case 'buscarServicoPorNome': {
                console.log('\n🔍 ========== BUSCA DE SERVIÇO POR NOME ==========');
                console.log(`📥 Buscando: "${args.nomeServico}" ${args.tamanho ? `(${args.tamanho})` : ''}`);

                const termoBusca = args.nomeServico.toLowerCase();

                // Buscar configuração de serviços da tabela Options (fonte correta de preços)
                const optionsResult = await dbQuery(`
                    SELECT value FROM Options WHERE type = 'gemini_agendamentos' AND ` + ew.sql, [...ew.params]);

                if (!optionsResult || optionsResult.length === 0) {
                    console.log('❌ Configuração gemini_agendamentos não encontrada');
                    return {
                        success: false,
                        encontrado: false,
                        mensagem: 'Configuração de serviços não encontrada. Entre em contato com o suporte.'
                    };
                }

                let configServicos;
                try {
                    configServicos = JSON.parse(optionsResult[0].value);
                } catch (err) {
                    console.log('❌ Erro ao parsear configuração:', err.message);
                    return {
                        success: false,
                        encontrado: false,
                        mensagem: 'Erro ao carregar configuração de serviços.'
                    };
                }

                console.log(`📋 Serviços configurados: ${configServicos.servicos?.length || 0}`);

                // Buscar serviços que correspondem ao termo
                const servicosEncontrados = (configServicos.servicos || []).filter(s => {
                    const nomeLower = (s.nome || '').toLowerCase();
                    const descLower = (s.descricao || '').toLowerCase();
                    return nomeLower.includes(termoBusca) || descLower.includes(termoBusca);
                });

                console.log(`📋 Serviços encontrados: ${servicosEncontrados.length}`);

                if (servicosEncontrados.length === 0) {
                    console.log('⚠️ Não encontrado no Options, buscando no banco de dados...');

                    // Fallback: buscar em SERVICOS_SUBS (subserviços) e SERVICOS_NEW (serviços pai)
                    const dbServicos = await dbQuery(`
                        SELECT ss.ser_id as sub_id, ss.ser_pai, ss.ser_nome as sub_nome, ss.ser_valor as sub_valor,
                               sn.ser_id as pai_id, sn.ser_nome as pai_nome
                        FROM SERVICOS_SUBS ss
                        JOIN SERVICOS_NEW sn ON ss.ser_pai = sn.ser_id
                        WHERE ss.empresa_id = ?
                          AND LOWER(ss.ser_nome) LIKE ?
                    `, [empresa_id, `%${termoBusca}%`]);

                    if (dbServicos && dbServicos.length > 0) {
                        console.log(`✅ Encontrados ${dbServicos.length} subserviço(s) no banco`);
                        const servicosDB = dbServicos.map(s => ({
                            servicoId: s.ser_pai,
                            subservicoId: s.sub_id,
                            nome: s.sub_nome,
                            categoriaPai: s.pai_nome,
                            regrasPreco: [{
                                titulo: s.sub_nome,
                                preco: s.sub_valor,
                                duracao: null,
                                descricao: `${s.sub_nome} (categoria: ${s.pai_nome})`
                            }],
                            regraEscolhida: {
                                titulo: s.sub_nome,
                                preco: s.sub_valor,
                                duracao: null
                            },
                            // Sem config no Options = modo regras padrão (encaminhar se preço null)
                            modoAtendimento: s.sub_valor ? 'regras' : 'encaminhar'
                        }));

                        const semPreco = servicosDB.filter(s => !s.regraEscolhida.preco);
                        if (semPreco.length === servicosDB.length) {
                            return {
                                success: true,
                                encontrado: true,
                                modoAtendimento: 'encaminhar',
                                acao: 'encaminharParaAtendente',
                                nome: servicosDB[0].nome,
                                servicoId: servicosDB[0].servicoId,
                                subservicoId: servicosDB[0].subservicoId,
                                mensagem: `O serviço "${servicosDB[0].nome}" requer atendimento especializado para precificação.`,
                                contextUpdates: {
                                    servico_id: servicosDB[0].servicoId,
                                    subservico_id: servicosDB[0].subservicoId,
                                    servico_nome: servicosDB[0].nome,
                                    servico_modo: 'encaminhar'
                                }
                            };
                        }

                        return {
                            success: true,
                            encontrado: true,
                            modoAtendimento: 'regras',
                            quantidade: servicosDB.length,
                            servicos: servicosDB,
                            servicoPrincipal: servicosDB[0],
                            contextUpdates: {
                                servico_id: servicosDB[0].servicoId,
                                subservico_id: servicosDB[0].subservicoId,
                                servico_nome: servicosDB[0].nome,
                                servico_modo: 'regras'
                            }
                        };
                    }

                    // Tentar também por nome do serviço pai
                    const dbServicosPai = await dbQuery(`
                        SELECT sn.ser_id, sn.ser_nome, sn.ser_valor
                        FROM SERVICOS_NEW sn
                        WHERE sn.empresa_id = ?
                          AND LOWER(sn.ser_nome) LIKE ?
                    `, [empresa_id, `%${termoBusca}%`]);

                    if (dbServicosPai && dbServicosPai.length > 0) {
                        // Buscar todos os subserviços deste pai
                        const paiId = dbServicosPai[0].ser_id;
                        const subs = await dbQuery(`
                            SELECT ser_id, ser_nome, ser_valor FROM SERVICOS_SUBS
                            WHERE ser_pai = ? AND empresa_id = ?
                        `, [paiId, empresa_id]);

                        return {
                            success: true,
                            encontrado: true,
                            modoAtendimento: 'regras',
                            nome: dbServicosPai[0].ser_nome,
                            servicoId: paiId,
                            subservicos: (subs || []).map(s => ({
                                subservicoId: s.ser_id,
                                nome: s.ser_nome,
                                preco: s.ser_valor
                            })),
                            mensagem: `Encontrei a categoria "${dbServicosPai[0].ser_nome}". Há ${(subs || []).length} opções de subserviço.`,
                            contextUpdates: {
                                servico_id: paiId,
                                servico_nome: dbServicosPai[0].ser_nome
                            }
                        };
                    }

                    console.log('❌ Nenhum serviço encontrado no Options nem no banco');
                    return {
                        success: false,
                        encontrado: false,
                        mensagem: `Não encontrei serviço com o nome "${args.nomeServico}". Serviços disponíveis: ${(configServicos.servicos || []).map(s => s.nome).join(', ')}`
                    };
                }

                // Formatar serviços com regras de precificação
                const servicosComPreco = servicosEncontrados.map(servico => {
                    const regras = servico.regrasPrecificacao || [];

                    // Se há tamanho especificado, tentar encontrar regra correspondente
                    let regraEscolhida = null;
                    if (args.tamanho && regras.length > 0) {
                        const tamanhoLower = args.tamanho.toLowerCase();
                        regraEscolhida = regras.find(r =>
                            (r.titulo || '').toLowerCase().includes(tamanhoLower) ||
                            (r.descricao || '').toLowerCase().includes(tamanhoLower)
                        );
                    }

                    return {
                        servicoId: servico.servicoId,
                        subservicoId: servico.subservicoId || null,
                        nome: servico.nome,
                        descricao: servico.descricao,
                        regrasPreco: regras.map(r => ({
                            titulo: r.titulo,
                            preco: r.preco,
                            duracao: r.duracaoMinutos,
                            descricao: r.descricao
                        })),
                        regraEscolhida: regraEscolhida ? {
                            titulo: regraEscolhida.titulo,
                            preco: regraEscolhida.preco,
                            duracao: regraEscolhida.duracaoMinutos
                        } : null
                    };
                });

                console.log(`✅ Encontrados ${servicosComPreco.length} servico(s)`);

                // Se so encontrou um servico, facilitar uso
                const servicoPrincipal = servicosComPreco[0];

                // Verificar modoAtendimento do servico original
                const servicoOriginal = servicosEncontrados[0];
                const modoAtendimento = servicoOriginal.modoAtendimento || 'regras';
                console.log(`🔧 Modo atendimento: ${modoAtendimento}`);

                // Se modo "encaminhar", retornar instrucao para encaminhar
                if (modoAtendimento === 'encaminhar') {
                    return {
                        success: true,
                        encontrado: true,
                        modoAtendimento: 'encaminhar',
                        acao: 'encaminharParaAtendente',
                        nome: servicoPrincipal.nome,
                        servicoId: servicoPrincipal.servicoId,
                        mensagem: `O servico "${servicoPrincipal.nome}" requer atendimento especializado. Use encaminharParaAtendente para direcionar o cliente.`,
                        contextUpdates: {
                            servico_id: servicoPrincipal.servicoId,
                            servico_nome: servicoPrincipal.nome,
                            servico_modo: 'encaminhar'
                        }
                    };
                }

                // Se modo "calculadora", retornar instrucao para usar calculadora
                if (modoAtendimento === 'calculadora') {
                    return {
                        success: true,
                        encontrado: true,
                        modoAtendimento: 'calculadora',
                        acao: 'calcularOrcamentoIA',
                        nome: servicoPrincipal.nome,
                        servicoId: servicoPrincipal.servicoId,
                        subservicoId: servicoPrincipal.subservicoId,
                        mensagem: `Para obter o preco de "${servicoPrincipal.nome}", use calcularOrcamentoIA com os detalhes do cliente.`,
                        contextUpdates: {
                            servico_id: servicoPrincipal.servicoId,
                            subservico_id: servicoPrincipal.subservicoId,
                            servico_nome: servicoPrincipal.nome,
                            servico_modo: 'calculadora'
                        }
                    };
                }

                // Modo "regras" (padrao): retornar precos das regras
                const precoFinal = servicoPrincipal.regraEscolhida?.preco ||
                                   servicoPrincipal.regrasPreco?.[0]?.preco ||
                                   0;

                const duracaoFinal = servicoPrincipal.regraEscolhida?.duracao ||
                                     servicoPrincipal.regrasPreco?.[0]?.duracao ||
                                     60;

                console.log(`💰 Servico principal: "${servicoPrincipal.nome}" (ID: ${servicoPrincipal.servicoId}, SubID: ${servicoPrincipal.subservicoId}) - R$ ${precoFinal}`);

                return {
                    success: true,
                    encontrado: true,
                    modoAtendimento: 'regras',
                    total: servicosComPreco.length,
                    servicos: servicosComPreco,
                    servicoId: servicoPrincipal.servicoId,
                    subservicoId: servicoPrincipal.subservicoId,
                    nome: servicoPrincipal.nome,
                    preco: precoFinal,
                    duracao: duracaoFinal,
                    regrasDisponiveis: servicoPrincipal.regrasPreco,
                    contextUpdates: {
                        servico_id: servicoPrincipal.servicoId,
                        subservico_id: servicoPrincipal.subservicoId,
                        servico_nome: servicoPrincipal.nome,
                        servico_preco: precoFinal,
                        servico_duracao: duracaoFinal,
                        servico_modo: 'regras'
                    }
                };
            }

            // ═══════════════════════════════════════════════════════════════════
            // 💰 CALCULADORA DE ORCAMENTO IA
            // ═══════════════════════════════════════════════════════════════════
            case 'calcularOrcamentoIA': {
                console.log('\n💰 ========== CALCULADORA DE ORCAMENTO IA ==========');
                console.log(`📥 Servico: "${args.nomeServico}" | Detalhes: "${args.detalhes}"`);

                // Buscar config da calculadora para a empresa
                const calcConfigResult = await dbQuery(
                    `SELECT * FROM Calculadora_Config WHERE ` + ew.sql + ` LIMIT 1`,
                    [...ew.params]
                );

                if (!calcConfigResult || calcConfigResult.length === 0) {
                    return {
                        success: false,
                        mensagem: 'Calculadora de precos nao configurada para esta empresa. Use buscarServicoPorNome para regras de preco.'
                    };
                }

                const calcConfig = calcConfigResult[0];
                let materiais = [];
                try {
                    materiais = typeof calcConfig.materiais === 'string' ? JSON.parse(calcConfig.materiais) : (calcConfig.materiais || []);
                } catch (e) {
                    materiais = [];
                }

                // Calcular custo de materiais (match por nome do servico)
                const nomeServicoLower = (args.nomeServico || '').toLowerCase();
                let custoMateriais = 0;
                const materiaisUsados = [];

                for (const mat of materiais) {
                    const matNome = (mat.nome || '').toLowerCase();
                    const matServicos = (mat.servicos_aplicaveis || mat.servico || '').toLowerCase();
                    if (matNome.includes(nomeServicoLower) || matServicos.includes(nomeServicoLower) || nomeServicoLower.includes(matNome)) {
                        const custoUnit = parseFloat(mat.custo_por_uso || mat.custo || 0);
                        custoMateriais += custoUnit;
                        materiaisUsados.push({ nome: mat.nome, custo: custoUnit });
                    }
                }

                // Calcular custo de mao de obra
                const metaMensal = parseFloat(calcConfig.meta_mensal || 10000);
                const diasTrabalhados = parseInt(calcConfig.dias_trabalhados_mes || 22);
                const horasPorDia = parseInt(calcConfig.horas_por_dia || 8);
                const custoPorHora = metaMensal / (diasTrabalhados * horasPorDia);
                const horasEstimadas = parseFloat(args.horasEstimadas || 2);
                const custoMaoObra = custoPorHora * horasEstimadas;

                // Calcular deslocamento
                let custoDeslocamento = 0;
                if (args.enderecoCliente && calcConfig.endereco_base) {
                    try {
                        const { geocodificarEnderecoComMaps, calcularTaxaDeslocamento } = require('../flows/helpers/availabilityHelper');
                        const coordsBase = await geocodificarEnderecoComMaps(calcConfig.endereco_base);
                        const coordsCliente = await geocodificarEnderecoComMaps(args.enderecoCliente);
                        if (coordsBase && coordsCliente) {
                            const combustivelLitro = parseFloat(calcConfig.combustivel_custo_litro || 6);
                            const kmPorLitro = parseFloat(calcConfig.veiculo_km_por_litro || 10);
                            const taxaResult = await calcularTaxaDeslocamento(coordsBase, coordsCliente, {
                                combustivelLitro,
                                kmPorLitro
                            });
                            custoDeslocamento = taxaResult?.taxa || 0;
                        }
                    } catch (distErr) {
                        console.log('⚠️ Nao foi possivel calcular deslocamento:', distErr.message);
                    }
                }

                // Rateio de custos fixos
                const custoFixoMensal = parseFloat(calcConfig.custos_fixos_mensais || 0);
                const servicosPorDia = horasPorDia / horasEstimadas;
                const custoFixoRateado = custoFixoMensal / (diasTrabalhados * servicosPorDia);

                // Subtotal
                const custoTotal = custoMateriais + custoMaoObra + custoDeslocamento + custoFixoRateado;

                // Aplicar margem
                const margemPadrao = parseFloat(calcConfig.margem_padrao || 30);
                const valorFinal = custoTotal * (1 + margemPadrao / 100);

                console.log(`💰 Calculo: materiais=${custoMateriais.toFixed(2)}, maoObra=${custoMaoObra.toFixed(2)}, deslocamento=${custoDeslocamento.toFixed(2)}, fixo=${custoFixoRateado.toFixed(2)}, margem=${margemPadrao}%`);
                console.log(`💰 Valor final: R$ ${valorFinal.toFixed(2)}`);

                return {
                    success: true,
                    nomeServico: args.nomeServico,
                    detalhes: args.detalhes,
                    valorFinal: Math.round(valorFinal * 100) / 100,
                    horasEstimadas: horasEstimadas,
                    servicosIncluidos: materiaisUsados.length > 0
                        ? materiaisUsados.map(m => m.nome).join(', ')
                        : args.nomeServico,
                    temDeslocamento: custoDeslocamento > 0,
                    taxaDeslocamento: Math.round(custoDeslocamento * 100) / 100,
                    mensagem: `Orcamento calculado: R$ ${valorFinal.toFixed(2)} para ${args.nomeServico}. ${custoDeslocamento > 0 ? `Inclui taxa de deslocamento de R$ ${custoDeslocamento.toFixed(2)}.` : ''}`,
                    contextUpdates: {
                        orcamento_valor: Math.round(valorFinal * 100) / 100,
                        orcamento_servico: args.nomeServico,
                        orcamento_calculado: true
                    }
                };
            }

            // ═══════════════════════════════════════════════════════════════════
            // DEFAULT
            // ═══════════════════════════════════════════════════════════════════
        default:
                console.warn(`⚠️ Função não implementada: ${functionName}`);
                return { error: `Função não encontrada: ${functionName}`, success: false };
        }
    } catch (error) {
        console.error(`❌ Erro ao executar ${functionName}:`, error);
        return { error: error.message, success: false };
    }
}

/**
 * Obter definições de ferramentas para o Gemini
 * @param {Array} capabilities - Lista de capacidades habilitadas (opcional)
 * @returns {Array} - Definições de ferramentas
 */
function getToolDefinitions(capabilities = null) {
    if (!capabilities || capabilities.length === 0) {
        return toolDefinitions;
    }
    
    // Filtrar por capacidades
    const capabilityMap = {
        'agendamentos': ['buscarDisponibilidades', 'verificarHorarioDisponivel', 'consultarAgendamentosCliente', 'criarAgendamento', 'atualizarAgendamento', 'cancelarAgendamento', 'buscarServicoPorNome', 'analisarImagemCliente', 'calcularOrcamentoIA'],
        'crm': ['criarNegocio', 'atualizarNegocio', 'atualizarCliente', 'marcarNegocioGanho', 'marcarNegocioPerdido'],
        'fluxo': ['aguardarResposta', 'agendarAcaoFutura', 'bloquearClienteFluxos', 'encaminharParaAtendente', 'redirecionarFluxo'],
        'comunicacao': ['enviarMensagem', 'enviarEmail'],
        'localizacao': ['geocodificarEndereco', 'calcularDistancia', 'resumirDisponibilidadeComMaps', 'buscarEnderecoPorLocal', 'calcularTaxaDeslocamento']
    };
    
    const allowedFunctions = new Set();
    for (const cap of capabilities) {
        if (capabilityMap[cap]) {
            capabilityMap[cap].forEach(fn => allowedFunctions.add(fn));
        }
    }
    
    return toolDefinitions.filter(tool => allowedFunctions.has(tool.name));
}

/**
 * Formatar definições para o formato Gemini
 */
function getToolsForGemini(capabilities = null) {
    const definitions = getToolDefinitions(capabilities);
    return [{
        functionDeclarations: definitions
    }];
}

module.exports = {
    executeToolFunction,
    getToolDefinitions,
    getToolsForGemini,
    toolDefinitions
};
