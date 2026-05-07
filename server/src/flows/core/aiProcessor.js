/**
 * 🤖 AI PROCESSOR - Processador de Blocos com Inteligência Artificial
 * 
 * Processa blocos AI (ai_actions, ai_decision, ai_options, create_agendamento, update_agendamento)
 * Usa Gemini com function calling para executar ações automaticamente
 * 
 * CONTROLE TOTAL: A IA tem acesso a todas as ações de fluxo
 */

const dbQuery = require('../../utils/dbHelper');
const { generateGeminiText, generateGeminiTextWithActions, getGeminiConfig } = require('../../utils/gemini');
const { getToolsForGemini, executeToolFunction } = require('../../utils/aiToolFunctions');
const { replaceVariables, buildFlatContext } = require('../helpers/contextHelper');
const { flowLog } = require('../helpers/logHelper');
const { sendWhatsAppMessage } = require('../actions/messageActions');
const {
    addMessageToHistory,
    getFormattedHistory,
    syncHistoryFromWhatsApp,
    hasPreviousModelMessage,
    getHistorySummary
} = require('../helpers/conversationHelper');
const {
    shouldUseTTS,
    getAudioConfig
} = require('../helpers/textToSpeech');
const moment = require('moment');

/**
 * Parse seguro de JSON
 */
function parseJSON(value) {
    if (!value) return null;
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (error) {
        return value;
    }
}

/**
 * Normaliza texto para comparacao de similaridade
 * Remove pontuacao, acentos, emojis, espacos extras e coloca em minusculas
 */
function normalizeForComparison(text) {
    if (!text) return '';
    return String(text)
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
        .replace(/[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu, '') // remove emojis
        .replace(/[^\w\s]/g, ' ') // pontuacao vira espaco
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Similaridade Jaccard entre dois textos - quantas palavras em comum.
 * Retorna 0.0 a 1.0 (0 = nenhuma, 1 = identicas)
 * Ideal para detectar respostas duplicadas do bot
 */
function textSimilarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;

    const wordsA = new Set(a.split(/\s+/).filter(w => w.length >= 3));
    const wordsB = new Set(b.split(/\s+/).filter(w => w.length >= 3));

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) intersection++;
    }
    const union = wordsA.size + wordsB.size - intersection;
    return union > 0 ? intersection / union : 0;
}

/**
 * Encaminha para atendimento humano em caso de erro
 * NUNCA mostra mensagem de erro ao cliente
 */
async function forwardToHumanOnError(context, errorReason) {
    flowLog.log('INFO', '🚨 Encaminhando para atendimento humano devido a erro', { reason: errorReason });
    
    try {
        // Bloquear fluxos automáticos para este cliente
        if (context.cliente?.cli_Id) {
            await dbQuery(
                'UPDATE CLIENTES SET flows_blocked = 1 WHERE cli_Id = ?',
                [context.cliente.cli_Id]
            );
        }
        
        // Enviar mensagem amigável ao cliente (NUNCA mencionar atendente/IA)
        const mensagemFallback = "Tudo certo! Um especialista nosso já vai entrar em contato com você em breve 😊";
        
        await sendWhatsAppMessage({
            message: mensagemFallback,
            phone: context.phone,
            fromAI: false
        }, context);
        
        // Notificar equipe (se configurado)
        try {
            const notifyConfig = await dbQuery("SELECT value FROM Options WHERE type = 'gemini_comportamento' AND empresa_id = ? LIMIT 1", [context.empresa_id]);
            if (notifyConfig?.[0]?.value) {
                const config = parseJSON(notifyConfig[0].value);
                if (config?.notifyOnForward && config?.notifyNumber) {
                    const { getClientById } = require('../../zap/client');
                    const client = getClientById(context.clientId);
                    if (client) {
                        const alertMsg = `🚨 *Atendimento Necessário*\n\nCliente: ${context.cliente?.cli_nome || context.phone}\nMotivo: Erro na IA\nDetalhes: ${errorReason}`;
                        await client.sendMessage(`${config.notifyNumber}@c.us`, alertMsg);
                    }
                }
            }
        } catch (notifyError) {
            flowLog.log('WARN', 'Não foi possível notificar equipe', { error: notifyError.message });
        }
        
        return {
            output: 'wait_for_agent',
            response: mensagemFallback,
            actionsExecuted: [{ function: 'forwardToHumanOnError', result: { reason: errorReason } }],
            add: {
                wait_for_agent: true,
                flows_blocked: true,
                error_forwarded: true,
                error_reason: errorReason
            }
        };
    } catch (fallbackError) {
        flowLog.log('ERROR', '❌ Erro crítico no fallback', { error: fallbackError.message });
        // Retorno mínimo para não quebrar o fluxo
        return {
            output: 'wait_for_agent',
            add: { wait_for_agent: true, flows_blocked: true }
        };
    }
}

/**
 * Enriquece o contexto com dados do cliente
 */
async function enrichContextWithClient(context) {
    try {
        // Resolver cliente por telefone se necessário
        if (!context.cliente && context.phone) {
            const { getClienteByPhone } = require('../actions/clienteActions');
            const cliente = await getClienteByPhone(context.phone, context.empresa_id);
            if (cliente) {
                context.cliente = cliente;
            }
        }

        // Buscar resumo do cliente para IA (com empresa_id para multi-tenant)
        if (context.cliente?.cli_Id && !context.clienteResumo) {
            const { getResumoClienteParaIA } = require('../../utils/clienteHelper');
            const resumo = await getResumoClienteParaIA(context.cliente.cli_Id, context.empresa_id || null);

            if (resumo?.success) {
                context.clienteResumo = resumo;

                // Preencher negócio principal
                if (resumo.negocioPrincipal) {
                    context.negocio = resumo.negocioPrincipal;
                    context.negocio_id = resumo.negocioPrincipal.id;
                }

                // Instruções da etapa do funil
                if (resumo.instrucoesEtapa) {
                    context.negocio_etapa_instrucoes = resumo.instrucoesEtapa;
                }
            }
        }
        
        // Buscar agendamento pendente do cliente (para detectar remarcação)
        if (context.cliente?.cli_Id && !context.agendamentoPendente) {
            try {
                const agendamentos = await dbQuery(`
                    SELECT age_id, age_data, age_horaInicio, age_horaFim, ast_id
                    FROM AGENDAMENTO 
                    WHERE cli_id = ? 
                    AND age_ativo = 1 
                    AND ast_id IN (1, 2)  -- Agendado ou Confirmado
                    AND age_data >= CURDATE()
                    ORDER BY age_data ASC, age_horaInicio ASC
                    LIMIT 1
                `, [context.cliente.cli_Id]);
                
                if (agendamentos.length > 0) {
                    const ag = agendamentos[0];
                    context.agendamentoPendente = {
                        id: ag.age_id,
                        data: ag.age_data,
                        horaInicio: ag.age_horaInicio,
                        horaFim: ag.age_horaFim
                    };
                    context.agendamento_id = ag.age_id;
                    flowLog.log('INFO', `📅 Cliente tem agendamento pendente #${ag.age_id} para ${moment(ag.age_data).format('DD/MM/YYYY')} ${ag.age_horaInicio}`);
                }
            } catch (agErr) {
                flowLog.log('WARN', 'Erro ao buscar agendamento pendente', { error: agErr.message });
            }
        }
        
        // Detectar se é intenção de remarcação pela mensagem
        if (context.mensagem?.text || context.ultima_mensagem) {
            const msg = (context.mensagem?.text || context.ultima_mensagem || '').toLowerCase();
            const palavrasRemarcacao = ['remarcar', 'mudar', 'alterar', 'trocar', 'adiar', 'antecipar', 'outro horário', 'outra data', 'reagendar'];
            
            if (palavrasRemarcacao.some(p => msg.includes(p))) {
                context.isRemarking = true;
                flowLog.log('INFO', '🔄 Detectada intenção de REMARCAÇÃO');
            }
        }
        
    } catch (err) {
        flowLog.log('WARN', 'Não foi possível enriquecer contexto', { error: err.message });
    }
    
    return context;
}

/**
 * Construir prompt base com instrucoes do bloco
 * Dados do cliente/agendamento/negocio sao incluidos via buildSystemInstructions (fonte unica)
 */
function buildBasePrompt(config, context) {
    let prompt = '';

    // Instrucoes do bloco
    if (config.instructions) {
        prompt += config.instructions + '\n\n';
    }

    return prompt;
}

/**
 * Processar bloco AI Actions - IA com ações configuráveis
 * CONTROLE TOTAL: Pode executar qualquer ação do sistema
 */
async function processAIActions(node, context) {
    flowLog.log('INFO', '🤖 Processando bloco AI Actions', { nodeId: node.id });
    
    const config = parseJSON(node.config) || {};
    const capabilities = config.capabilities || {};
    let userInput = (context.mensagem && context.mensagem.text) || context.ultima_mensagem || '';

    // Extrair mídia da mensagem (áudio, imagem, etc.) para enviar ao Gemini
    const mediaFiles = [];
    if (context.mensagem && context.mensagem.mediaPath && context.mensagem.mediaType) {
        mediaFiles.push({
            path: context.mensagem.mediaPath,
            type: context.mensagem.mediaType
        });
        flowLog.log('INFO', '📎 Mídia detectada na mensagem', {
            type: context.mensagem.mediaType,
            path: context.mensagem.mediaPath
        });

        // Se é áudio sem texto, indicar ao Gemini que deve ouvir o áudio
        if (!userInput && context.mensagem.mediaType.includes('audio')) {
            userInput = '[O cliente enviou um áudio. Ouça e responda de acordo.]';
        }
    }
    
    // Enriquecer contexto
    context = await enrichContextWithClient(context);
    
    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUIR PROMPT COMPLETO
    // ═══════════════════════════════════════════════════════════════════
    let systemPrompt = buildBasePrompt(config, context);
    
    // Adicionar instruções de capabilities
    systemPrompt += '# AÇÕES DISPONÍVEIS\n\n';
    systemPrompt += 'Execute as ações automaticamente quando apropriado, sem pedir confirmação desnecessária:\n\n';
    
    const capabilityInstructions = {
        createAppointment: '✅ **Criar Agendamento**: Use `criarAgendamento` quando tiver todos os dados (serviço, data, horário)',
        updateAppointment: '✅ **Atualizar Agendamento**: Use `atualizarAgendamento` para remarcar ou alterar',
        cancelAppointment: '✅ **Cancelar Agendamento**: Use `cancelarAgendamento` quando solicitado',
        checkAvailability: '✅ **Verificar Disponibilidade**: SEMPRE use `buscarDisponibilidades` antes de confirmar horário.\n   ✅ **Consultar Agendamentos**: OBRIGATÓRIO usar `consultarAgendamentosCliente` quando perguntarem "meu agendamento", "último agendamento", "histórico", etc.',
        createBusiness: '✅ **Criar Negócio**: Use `criarNegocio` para registrar oportunidades no CRM',
        updateBusiness: '✅ **Atualizar Negócio**: Use `atualizarNegocio` para atualizar status',
        updateClient: '✅ **Atualizar Cliente**: Use `atualizarCliente` quando receber novos dados',
        updateAddress: '✅ **Atualizar Endereço**: Atualize o endereço do cliente quando informado',
        forwardToAgent: '✅ **Solicitar Apoio**: Use `encaminharParaAtendente` apenas internamente, NUNCA diga ao cliente',
        sendMessage: '✅ **Enviar Mensagem**: Use `enviarMensagem` para comunicar com cliente',
        scheduleAction: '✅ **Agendar Ação Futura**: Use `agendarAcaoFutura` para follow-ups e lembretes'
    };
    
    for (const [cap, instruction] of Object.entries(capabilityInstructions)) {
        if (capabilities[cap]) {
            systemPrompt += `${instruction}\n`;
        }
    }
    
    // Instruções importantes
    systemPrompt += '\n## ⚠️ REGRAS CRÍTICAS - SIGA À RISCA\n';
    systemPrompt += '1. **SEMPRE USE FERRAMENTAS** - Quando cliente perguntar sobre agendamentos, CHAME `consultarAgendamentosCliente`\n';
    systemPrompt += '2. **NUNCA DIGA "não tenho acesso"** - Você TEM acesso, use as ferramentas!\n';
    systemPrompt += '3. **NUNCA MENCIONE IA/ATENDENTE** - Você é uma pessoa real chamada ${context.nomeAssistente || "atendente"}\n';
    systemPrompt += '4. **SEJA PROATIVO** - Execute ações automaticamente quando tiver dados\n';
    systemPrompt += '5. **VERIFIQUE DISPONIBILIDADE** - Sempre antes de confirmar horário\n';
    systemPrompt += '6. Se precisar de apoio interno, use `encaminharParaAtendente` MAS NUNCA diga isso ao cliente\n';
    systemPrompt += '7. Diga apenas "Um momento, vou verificar" enquanto busca informações\n\n';
    
    systemPrompt += '## 🔧 QUANDO USAR CADA FERRAMENTA\n';
    systemPrompt += '- Cliente pergunta "meu agendamento/histórico" → USE `consultarAgendamentosCliente`\n';
    systemPrompt += '- Cliente quer marcar horário → USE `buscarDisponibilidades` e depois `criarAgendamento`\n';
    systemPrompt += '- Cliente informa dados novos → USE `atualizarCliente`\n\n';
    
    // Substituir variáveis
    const flatContext = buildFlatContext(context);
    const finalInstructions = replaceVariables(systemPrompt, flatContext);
    
    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUIR TOOLS BASEADO NAS CAPABILITIES
    // ═══════════════════════════════════════════════════════════════════
    const enabledCapabilities = [];
    
    if (capabilities.createAppointment || capabilities.updateAppointment || capabilities.cancelAppointment || capabilities.checkAvailability) {
        enabledCapabilities.push('agendamentos');
    }
    if (capabilities.createBusiness || capabilities.updateBusiness || capabilities.updateClient) {
        enabledCapabilities.push('crm');
    }
    if (capabilities.forwardToAgent || capabilities.scheduleAction) {
        enabledCapabilities.push('fluxo');
    }
    if (capabilities.sendMessage) {
        enabledCapabilities.push('comunicacao');
    }
    if (capabilities.checkAvailability || capabilities.updateAddress) {
        enabledCapabilities.push('localizacao');
    }
    
    // Se nenhuma capability específica, habilitar todas
    const tools = enabledCapabilities.length > 0 
        ? getToolsForGemini(enabledCapabilities)
        : getToolsForGemini();
    
    // ═══════════════════════════════════════════════════════════════════
    // GERAR RESPOSTA COM GEMINI
    // ═══════════════════════════════════════════════════════════════════
    flowLog.log('INFO', '📤 Enviando para Gemini com tools...', { 
        toolCount: tools[0]?.functionDeclarations?.length || 0 
    });
    
    // ═══════════════════════════════════════════════════════════════════
    // CARREGAR HISTÓRICO DE CONVERSA
    // Prioridade: 1) Histórico do contexto, 2) WhatsApp (se não simulação)
    // ═══════════════════════════════════════════════════════════════════
    let conversationHistory = [];

    // 1. Primeiro: tentar usar histórico do contexto (funciona em simulação E produção)
    if (context.history && Array.isArray(context.history) && context.history.length > 0) {
        conversationHistory = getFormattedHistory(context, 20);
        flowLog.log('INFO', `📚 Histórico do contexto: ${conversationHistory.length} mensagens`);

        // Log resumo para debug
        if (conversationHistory.length > 0) {
            const summary = getHistorySummary(context, 3);
            flowLog.log('DEBUG', `📜 Últimas mensagens:\n${summary}`);
        }
    }
    // 2. Fallback: buscar do WhatsApp se não houver histórico no contexto E não for simulação
    else if (context.clientId && context.chatId && !context.isSimulation) {
        try {
            const { getChatMessages } = require('../../zap/chats');
            const whatsappMessages = await getChatMessages(context.clientId, context.chatId, 20);

            if (whatsappMessages && whatsappMessages.length > 0) {
                conversationHistory = whatsappMessages;
                flowLog.log('INFO', `📚 Histórico do WhatsApp: ${conversationHistory.length} mensagens`);
            } else {
                flowLog.log('INFO', '📚 Histórico vazio (WhatsApp não retornou mensagens)');
            }
        } catch (err) {
            flowLog.log('WARN', 'Não foi possível carregar histórico do WhatsApp', { error: err.message });
        }
    } else {
        flowLog.log('INFO', `📚 Histórico: ${context.isSimulation ? 'modo simulação' : 'sem clientId/chatId'}, usando contexto local`);
    }

    // Verificar se já houve mensagem do modelo (para evitar saudação duplicada)
    const hasModelMessage = hasPreviousModelMessage(context) || conversationHistory.some(m => m.role === 'model');
    if (hasModelMessage) {
        context.first_ai_greeting_sent = true;
    }

    // ═══════════════════════════════════════════════════════════════════
    // PREFERÊNCIA DE CANAL (texto vs áudio) — detecção e persistência
    // ═══════════════════════════════════════════════════════════════════
    try {
        const {
            detectChannelPreference,
            setPreferTextOnly,
            getPreferTextOnly,
        } = require('../helpers/contactPreferences');

        const incomingText = (typeof userInput === 'string' ? userInput : (userInput?.text || ''));
        const intent = detectChannelPreference(incomingText);
        if (intent.textPreference) {
            await setPreferTextOnly(context.phone, context.empresa_id, true, {
                reason: intent.reason,
                chatId: context.chatId,
            });
            context.preferTextOnly = true;
            flowLog.log('INFO', '📝 Cliente solicitou apenas texto — preferência registrada');
        } else if (intent.audioPreference) {
            await setPreferTextOnly(context.phone, context.empresa_id, false, {
                reason: intent.reason,
                chatId: context.chatId,
            });
            context.preferTextOnly = false;
            flowLog.log('INFO', '🎤 Cliente reverteu para áudio — preferência atualizada');
        } else if (typeof context.preferTextOnly !== 'boolean') {
            context.preferTextOnly = await getPreferTextOnly(context.phone, context.empresa_id);
        }
    } catch (prefErr) {
        flowLog.log('WARN', 'Falha ao avaliar preferência de canal', { error: prefErr.message });
    }

    // ═══════════════════════════════════════════════════════════════════
    // DETERMINAR FORMATO DE SAÍDA (ÁUDIO ou TEXTO) ANTES DE CHAMAR GEMINI
    // Isso permite que a IA otimize sua resposta para o formato de saída
    // ═══════════════════════════════════════════════════════════════════
    let outputFormat = 'text';
    try {
        // Se cliente pediu só texto, força text e nem consulta o ciclo TTS
        if (context.preferTextOnly) {
            flowLog.log('INFO', '📝 Forçando TEXTO: cliente pediu para receber respostas escritas');
        } else {
            const audioConfig = await getAudioConfig(context.empresa_id);
            if (audioConfig.audio?.ativo || context.fullAudio || context.ttsEnabled) {
                const willBeAudio = context.fullAudio || await shouldUseTTS(true, context.empresa_id);
                if (willBeAudio) {
                    outputFormat = 'audio';
                    flowLog.log('INFO', '🎤 Próxima mensagem será ÁUDIO - instruções de áudio ativadas para Gemini');
                }
            }
        }
    } catch (ttsErr) {
        flowLog.log('WARN', 'Não foi possível determinar formato de saída TTS', { error: ttsErr.message });
    }

    // Passar outputFormat para o contexto (será usado pelo buildSystemInstructions)
    context.outputFormat = outputFormat;

    let result;
    try {
        result = await generateGeminiTextWithActions({
            instructions: finalInstructions,
            userText: userInput,
            history: conversationHistory,
            context: context,
            clientId: context.clientId,
            chatId: context.chatId,
            tools: tools,
            capabilities: enabledCapabilities,
            mediaFiles: mediaFiles
        });
        
        flowLog.log('INFO', '✅ Resposta recebida do Gemini', {
            responseLength: result.response?.length || 0,
            actionsCount: result.actionsExecuted?.length || 0
        });
        
        // Se a IA chamou encaminharParaAtendente, NUNCA sobrescrever com fallback de erro
        // mesmo que responseText seja vazio - o encaminhamento ja foi feito com sucesso
        const alreadyForwarded = (result.actionsExecuted || []).some(
            a => a?.function === 'encaminharParaAtendente' && a?.result?.success === true
        );

        // Se a IA chamou permanecerEmSilencio, resposta vazia e ESPERADA - nao tratar como erro
        const silenceRequested = (result.actionsExecuted || []).some(
            a => a?.function === 'permanecerEmSilencio' || a?.result?.silent === true || a?.result?.skip_response === true
        );

        // Outras acoes terminais que tambem justificam resposta vazia (ex: aguardarResposta, agendarAcaoFutura, bloquearClienteFluxos, redirecionarFluxo)
        const hasTerminalAction = (result.actionsExecuted || []).some(
            a => ['aguardarResposta', 'agendarAcaoFutura', 'bloquearClienteFluxos', 'redirecionarFluxo'].includes(a?.function)
        );

        // Se resposta vazia ou erro E nao houve encaminhamento/silencio/acao-terminal, fallback
        const responseEmpty = !result.response || !String(result.response).trim();
        const responseHasErrorMarker = result.response && (result.response.includes('não consegui gerar') || result.response.includes('houve um erro'));

        if (!alreadyForwarded && !silenceRequested && !hasTerminalAction && (responseEmpty || responseHasErrorMarker)) {
            console.log(`[aiProcessor] ⚠️ Fallback "Resposta inválida da IA" disparado | empty=${responseEmpty} errMarker=${!!responseHasErrorMarker} actions=${(result.actionsExecuted || []).map(a => a?.function).join(',') || 'none'} responseLen=${(result.response || '').length}`);
            flowLog.log('WARN', '⚠️ Resposta inválida da IA, encaminhando para atendimento humano');
            return await forwardToHumanOnError(context, 'Resposta inválida da IA');
        }

        if (silenceRequested) {
            console.log(`[aiProcessor] 🤫 permanecerEmSilencio detectado - sem fallback de erro | actions=${(result.actionsExecuted || []).map(a => a?.function).join(',')}`);
        }
        if (hasTerminalAction && responseEmpty) {
            console.log(`[aiProcessor] 🏁 Acao terminal detectada com resposta vazia (esperado) | actions=${(result.actionsExecuted || []).map(a => a?.function).join(',')}`);
        }
    } catch (aiError) {
        flowLog.log('ERROR', '❌ Erro no Gemini, encaminhando para atendimento humano', { error: aiError.message });
        return await forwardToHumanOnError(context, aiError.message);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // PROCESSAR RESULTADOS
    // ═══════════════════════════════════════════════════════════════════
    
    // Verificar se alguma ação pediu atendimento humano
    let hasWaitForAgent = (result.actionsExecuted || []).some(
        a => a?.result?.wait_for_agent || a?.wait_for_agent
    );

    // Verificar se a IA pediu permanecer em silêncio (não responder ao cliente)
    // IMPORTANTE: permanecerEmSilencio NUNCA deve sobrescrever texto ja gerado em
    // iteracao anterior. Ex: AI emite "Um momento, vou verificar!" + encaminhar em iter 1,
    // depois chama permanecerEmSilencio em iter 2 - o texto da iter 1 DEVE ser enviado.
    const shouldSilence = (result.actionsExecuted || []).some(
        a => a?.result?.silent === true || a?.result?.skip_response === true
    );
    if (shouldSilence && (!result.response || !result.response.trim())) {
        flowLog.log('INFO', '🤫 IA optou por permanecer em silêncio - sem resposta para enviar');
        result.response = '';
    } else if (shouldSilence && result.response && result.response.trim()) {
        flowLog.log('INFO', '📤 permanecerEmSilencio ignorado - ha texto preservado de iteracao anterior para enviar');
    }

    // Verificar se há redirecionamento de fluxo
    const redirectAction = (result.actionsExecuted || []).find(
        a => a?.result?.action === 'redirect_flow' || a?.action === 'redirect_flow'
    );
    
    // Marcar primeira saudação
    if (!context.first_ai_greeting_sent) {
        context.first_ai_greeting_sent = true;
    }

    // Filtrar mensagens internas da IA que não devem ir ao cliente
    if (result.response) {
        let resp = result.response.trim();

        // Padrão 1: Mensagem inteira é interna (começa com padrão interno)
        const padroesInternos = /^(Cliente\s+(solicitando|quer|precisa|pediu|deseja|está|informou)|Resumo\s*(d[aoe]s?\s|das\s|:)|#{1,3}\s*Resumo|Nota interna|Encaminhando|Transferindo para|Ação do Sistema|---\s*\n|(Entendido|Ok|Certo)[.,]?\s*(As\s+)?[Ii]nforma(ç|c)(õ|o)es\s+coleta|[Ii]nforma(ç|c)(õ|o)es\s+coletadas\s+at(e|é)\s+agora)/i;
        if (padroesInternos.test(resp)) {
            flowLog.log('WARN', '🔇 Mensagem interna da IA filtrada (não enviada ao cliente)', { preview: resp.substring(0, 100) });
            result.response = '';
        }

        // Padrão 2: Mensagem mista - contém seção "Resposta Conversacional ao Cliente" ou "Aqui está a resposta" após notas internas
        if (result.response) {
            resp = result.response.trim();

            // 2a: Marker "### Resposta Conversacional ao Cliente"
            const markerMatch = resp.match(/###?\s*Resposta\s+Conversacional\s+(ao\s+Cliente)?\s*\n+([\s\S]+)/i);
            if (markerMatch) {
                result.response = markerMatch[2].replace(/^#{1,3}\s*/gm, '').trim();
                flowLog.log('WARN', '🔇 Notas internas removidas, mantida parte conversacional');
            }

            // 2b: Marker "Aqui está a resposta para o cliente:" ou "Aqui está a resposta:"
            if (!markerMatch) {
                const aquiMatch = resp.match(/[Aa]qui\s+est[aá]\s+a\s+resposta\s*(para\s+o\s+cliente)?:\s*([\s\S]+)/i);
                if (aquiMatch) {
                    result.response = aquiMatch[2].replace(/^#{1,3}\s*/gm, '').trim();
                    flowLog.log('WARN', '🔇 Texto "Aqui está a resposta" removido, mantida parte conversacional');
                }
            }

            // 2c: Separador "---" entre notas internas e resposta real
            if (result.response && result.response.includes('---')) {
                const partes = result.response.split(/\n---+\n/);
                if (partes.length >= 2) {
                    // A ultima parte após --- geralmente é a resposta ao cliente
                    const ultimaParte = partes[partes.length - 1].trim();
                    // Verificar se a primeira parte parece interna (tem bullets, "Serviço:", "Local:", etc)
                    const primeiraParte = partes[0].trim();
                    if (/(\*\s+(Servi(ç|c)o|Local|Endere(ç|c)o|Pragas?|Tipo):|informaç|coletad)/i.test(primeiraParte)) {
                        result.response = ultimaParte.replace(/^#{1,3}\s*/gm, '').trim();
                        flowLog.log('WARN', '🔇 Notas internas antes de --- removidas');
                    }
                }
            }
        }

        // Padrão 3: Pensamento em inglês vazado (thinking do Gemini que escapou)
        if (result.response) {
            resp = result.response.trim();
            const thinkingPattern = /^(Okay,?\s+(so\s+)?I\s+(need|have|should|must|want|see|know|think|understand|am)|Let's\s+see|First,?\s+I|Now,?\s+I|Alright,?\s+(so\s+)?I|Let me\s+(think|check|see|figure)|I('m|\s+am)\s+(thinking|going\s+to)|So,?\s+(I\s+need|the\s+user|considering))/i;
            if (thinkingPattern.test(resp)) {
                flowLog.log('WARN', '🔇 Pensamento em inglês detectado e filtrado', { preview: resp.substring(0, 100) });
                result.response = '';
            }
        }

        // Padrão 4: Limpar artefatos de formatação que não devem ir ao cliente
        if (result.response) {
            let cleaned = result.response;

            // Remover > (blockquote markdown) do início das linhas
            cleaned = cleaned.replace(/^>\s?/gm, '');

            // Remover timestamps no início das linhas (00:00, 00:01, 12:30, etc)
            cleaned = cleaned.replace(/^\d{1,2}:\d{2}\s*/gm, '');

            // Remover ** (duplo asterisco markdown) - substituir por * simples do WhatsApp
            cleaned = cleaned.replace(/\*\*([^*]+)\*\*/g, '*$1*');

            // Remover ### headers residuais
            cleaned = cleaned.replace(/^#{1,3}\s*/gm, '');

            // Remover meta-texto residual tipo "Resposta ao cliente:" ou "Para o cliente:"
            cleaned = cleaned.replace(/^(Resposta\s+(ao|para\s+o)\s+cliente\s*:|Para\s+o\s+cliente\s*:)\s*/im, '');

            if (cleaned !== result.response) {
                flowLog.log('WARN', '🧹 Artefatos de formatação removidos da resposta');
                result.response = cleaned.trim();
            }
        }
    }



    // Guard: se IA prometeu encaminhar no texto mas nao chamou a tool, forcar encaminhamento
    // Bug comum: IA diz "a especialista ja vai te chamar" / "vou passar para a especialista" mas
    // nao chama encaminharParaAtendente() -> cliente fica esperando eternamente
    if (result.response && result.response.trim()) {
        const alreadyForwardedLocal = (result.actionsExecuted || []).some(
            a => a?.function === 'encaminharParaAtendente' && a?.result?.success === true
        );

        if (!alreadyForwardedLocal) {
            const texto = result.response.toLowerCase();
            const promessasEncaminhamento = [
                /\ba\s+especialista\s+(ja\s+)?vai\s+(te\s+)?(chamar|contatar|entrar\s+em\s+contato)/i,
                /\bvou\s+(passar|repassar|encaminhar|transferir)\s+(voce\s+)?(tudo\s+)?(isso\s+)?para\s+(a|o|minha|nossa)?\s*(especialista|atendente|equipe|consultora|responsavel)/i,
                /\bja\s+(estou|to)\s+(passando|repassando|encaminhando|transferindo)\s+(tudo\s+)?para\s+(a|o|minha|nossa)?\s*(especialista|atendente|equipe)/i,
                /\bestou\s+(te\s+)?passando\s+para\s+(a|o|minha|nossa)?\s*(especialista|atendente|equipe)/i,
                /\bpassando\s+tudo\s+para\s+(a|o|minha|nossa)?\s*especialista/i,
                /\bvou\s+chamar\s+(a|o|minha|nossa)?\s*(especialista|atendente)/i,
                /\bespecialista\s+(vai|ira)\s+(te\s+)?(formular|preparar|montar|avaliar|enviar|passar|retornar)/i,
                /\bespecialista\s+entra\s+em\s+contato/i
            ];

            const prometeuEncaminhar = promessasEncaminhamento.some(re => re.test(texto));

            if (prometeuEncaminhar) {
                flowLog.log('WARN', '🚨 IA prometeu encaminhar no texto mas nao chamou a tool - forcando encaminharParaAtendente', {
                    textoPreview: result.response.substring(0, 120)
                });
                try {
                    const { executeToolFunction } = require('../../utils/aiToolFunctions');
                    const forceResult = await executeToolFunction('encaminharParaAtendente', {}, context);
                    if (!result.actionsExecuted) result.actionsExecuted = [];
                    result.actionsExecuted.push({ function: 'encaminharParaAtendente', result: forceResult, forced: true });
                    if (forceResult?.contextUpdates) {
                        Object.assign(context, forceResult.contextUpdates);
                    }
                } catch (forceErr) {
                    flowLog.log('ERROR', '❌ Erro ao forcar encaminhamento', { error: forceErr.message });
                }
            }
        }
    }

    // Recalcular hasWaitForAgent apos possivel forca
    if (!hasWaitForAgent) {
        const reCheck = (result.actionsExecuted || []).some(
            a => a?.result?.wait_for_agent || a?.wait_for_agent
        );
        if (reCheck) {
            hasWaitForAgent = true;
            flowLog.log('INFO', '✅ Encaminhamento forcado aplicado, wait_for_agent ativo');
        }
    }

    // Guard anti-repetição: se resposta da IA é muito similar às últimas mensagens do bot,
    // cancelar o envio (AI tentando repetir informação já enviada)
    if (result.response && result.response.trim() && conversationHistory.length > 0) {
        const normalizedResponse = normalizeForComparison(result.response);
        const recentBotMessages = conversationHistory
            .filter(m => m.role === 'model' || m.fromMe === true || m.from === 'bot')
            .slice(-5); // ultimas 5 mensagens do bot

        for (const botMsg of recentBotMessages) {
            const botText = botMsg.text || botMsg.body || botMsg.content ||
                            (botMsg.parts && botMsg.parts[0]?.text) || '';
            if (!botText) continue;

            const similarity = textSimilarity(normalizedResponse, normalizeForComparison(botText));
            if (similarity >= 0.7) {
                flowLog.log('WARN', `🔇 Resposta bloqueada - ${Math.round(similarity * 100)}% similar a mensagem recente do bot`, {
                    nova: result.response.substring(0, 80),
                    anterior: botText.substring(0, 80)
                });
                result.response = '';
                break;
            }
        }
    }

    // Enviar resposta ao cliente se configurado
    if (capabilities.sendMessage && result.response && result.response.trim()) {
        try {
            await sendWhatsAppMessage({
                message: result.response,
                phone: context.phone,
                fromAI: true // Ativa TTS se configurado
            }, context);

            if (!result.actionsExecuted) result.actionsExecuted = [];
            result.actionsExecuted.push({ function: 'sendMessage', result: { success: true } });

        } catch (error) {
            flowLog.log('ERROR', '❌ Erro ao enviar mensagem', { error: error.message });
        }
    }
    
    // Construir resultado final
    const finalResult = {
        output: redirectAction ? `redirect_${redirectAction.result.targetFlowId}` : 'continue',
        response: result.response,
        actionsExecuted: result.actionsExecuted || [],
        add: {
            ai_response: result.response,
            ai_actions_executed: result.actionsExecuted || [],
            first_ai_greeting_sent: true,
            ...result.contextUpdates || {}
        }
    };
    
    // Flags especiais
    if (hasWaitForAgent) {
        finalResult.add.wait_for_agent = true;
        finalResult.output = 'wait_for_agent';
    }
    
    return finalResult;
}

/**
 * Processar bloco Create Agendamento - Criação via IA
 * Versão especializada do AI Actions focada em agendamentos
 */
async function processCreateAgendamento(node, context) {
    flowLog.log('INFO', '📅 Processando bloco Create Agendamento via IA', { nodeId: node.id });
    
    const config = parseJSON(node.config) || {};
    
    // Forçar capabilities de agendamento
    config.capabilities = {
        createAppointment: true,
        checkAvailability: true,
        updateClient: true,
        sendMessage: true
    };
    
    // Adicionar instruções específicas
    config.instructions = (config.instructions || '') + `

## TAREFA: CRIAR AGENDAMENTO

Você está no modo de criação de agendamento. Siga o fluxo:

1. **VERIFICAR DADOS**: Confirme que tem serviço, data, horário e endereço
2. **BUSCAR DISPONIBILIDADE**: Use \`buscarDisponibilidades\` para verificar horários
3. **APRESENTAR OPÇÕES**: Ofereça 3-5 horários disponíveis ao cliente
4. **CONFIRMAR**: Quando cliente escolher, confirme TODOS os dados
5. **CRIAR**: Use \`criarAgendamento\` para finalizar

Se faltar algum dado, pergunte de forma natural.
`;
    
    return await processAIActions({ ...node, config: JSON.stringify(config) }, context);
}

/**
 * Processar bloco Update Agendamento - Atualização via IA
 * Versão especializada para atualizações
 */
async function processUpdateAgendamento(node, context) {
    flowLog.log('INFO', '📝 Processando bloco Update Agendamento via IA', { nodeId: node.id });
    
    const config = parseJSON(node.config) || {};
    
    // Forçar capabilities de atualização
    config.capabilities = {
        updateAppointment: true,
        cancelAppointment: true,
        checkAvailability: true,
        sendMessage: true
    };
    
    // Adicionar instruções específicas
    config.instructions = (config.instructions || '') + `

## TAREFA: ATUALIZAR AGENDAMENTO

Você está no modo de atualização de agendamento. O cliente pode querer:

- **REMARCAR**: Alterar data/horário (verifique disponibilidade primeiro!)
- **CANCELAR**: Cancelar o agendamento
- **CONFIRMAR**: Confirmar que irá comparecer
- **ALTERAR DADOS**: Mudar endereço, observações, etc.

Sempre confirme a alteração antes de executar.
`;
    
    return await processAIActions({ ...node, config: JSON.stringify(config) }, context);
}

/**
 * Processar bloco AI Decision - Decisão SIM/NÃO
 */
async function processAIDecision(node, context) {
    flowLog.log('INFO', '🤔 Processando bloco AI Decision', { nodeId: node.id });

    const config = parseJSON(node.config) || {};
    context = await enrichContextWithClient(context);

    // ═══════════════════════════════════════════════════════════════════
    // CARREGAR HISTÓRICO DE CONVERSA
    // AI Decision PRECISA de histórico para tomar decisões informadas
    // Se não existir histórico, retorna NÃO (decisão segura)
    // ═══════════════════════════════════════════════════════════════════
    let conversationHistory = [];

    // 1. Histórico do contexto
    if (context.history && Array.isArray(context.history) && context.history.length > 0) {
        conversationHistory = getFormattedHistory(context, 20);
        flowLog.log('INFO', `📚 AI Decision - Histórico do contexto: ${conversationHistory.length} mensagens`);
    }
    // 2. Fallback: buscar do WhatsApp
    else if (context.clientId && context.chatId && !context.isSimulation) {
        try {
            const { getChatMessages } = require('../../zap/chats');
            const whatsappMessages = await getChatMessages(context.clientId, context.chatId, 20);
            if (whatsappMessages && whatsappMessages.length > 0) {
                conversationHistory = whatsappMessages;
                flowLog.log('INFO', `📚 AI Decision - Histórico do WhatsApp: ${conversationHistory.length} mensagens`);
            }
        } catch (err) {
            flowLog.log('WARN', 'AI Decision - Erro ao carregar histórico do WhatsApp', { error: err.message });
        }
    }

    // Sem histórico E sem mensagem do usuário = sem contexto para decidir → retorna NÃO
    const userMessage = context.ultima_mensagem || '';
    if (conversationHistory.length === 0 && !userMessage) {
        flowLog.log('WARN', '⚠️ AI Decision sem histórico e sem mensagem - retornando NÃO (decisão segura)');
        return {
            output: 'false',
            decision: 'NÃO',
            reasoning: 'Sem histórico de conversa disponível para análise',
            add: {
                ai_decision: 'false',
                ai_decision_reasoning: 'Sem histórico de conversa disponível para análise'
            }
        };
    }

    // Construir prompt de decisão
    let systemPrompt = buildBasePrompt(config, context);
    systemPrompt += '\n## TAREFA\n';
    systemPrompt += 'Analise a conversa e responda APENAS com "SIM" ou "NÃO" (sem aspas, sem explicações).\n';

    // Substituir variáveis
    const flatContext = buildFlatContext(context);
    const finalInstructions = replaceVariables(systemPrompt, flatContext);

    // Gerar decisão com Gemini (agora com histórico)
    const geminiResponse = await generateGeminiText({
        instructions: finalInstructions,
        userText: userMessage,
        history: conversationHistory,
        context: context,
        clientId: context.clientId,
        chatId: context.chatId
    });
    
    // Normalizar resposta
    const decision = (geminiResponse || '').trim().toUpperCase();
    const isYes = decision.includes('SIM') || decision.includes('YES') || decision === 'S' || decision === 'Y';
    const output = isYes ? 'true' : 'false';
    
    flowLog.log('INFO', `✅ Decisão IA: ${output}`, { response: geminiResponse });
    
    return {
        output: output,
        decision: isYes ? 'SIM' : 'NÃO',
        reasoning: geminiResponse,
        add: {
            ai_decision: output,
            ai_decision_reasoning: geminiResponse
        }
    };
}

/**
 * Processar bloco AI Options - Múltiplas opções
 */
async function processAIOptions(node, context) {
    flowLog.log('INFO', '📋 Processando bloco AI Options', { nodeId: node.id });
    
    const config = parseJSON(node.config) || {};
    const options = config.options || [];
    
    if (options.length === 0) {
        flowLog.log('WARN', 'Nenhuma opção configurada');
        return { output: 'continue' };
    }
    
    context = await enrichContextWithClient(context);
    
    // Construir prompt com opções
    let systemPrompt = buildBasePrompt(config, context);
    systemPrompt += '\n## TAREFA\n';
    systemPrompt += 'Analise a conversa e escolha UMA das seguintes opções:\n\n';
    
    options.forEach((opt, index) => {
        const label = opt.label || opt.title || `Opção ${index + 1}`;
        const description = opt.description || '';
        systemPrompt += `${index + 1}. **${label}**${description ? ': ' + description : ''}\n`;
    });
    
    systemPrompt += '\nResponda APENAS com o número da opção escolhida (1, 2, 3, etc).\n';
    
    // Substituir variáveis
    const flatContext = buildFlatContext(context);
    const finalInstructions = replaceVariables(systemPrompt, flatContext);
    
    // Gerar decisão com Gemini
    const geminiResponse = await generateGeminiText({
        instructions: finalInstructions,
        userText: context.ultima_mensagem || '',
        history: [],
        context: context,
        clientId: context.clientId,
        chatId: context.chatId
    });
    
    // Extrair número da opção
    const match = (geminiResponse || '').match(/\d+/);
    let selectedIndex = match ? parseInt(match[0]) - 1 : 0;
    
    // Validar índice
    if (selectedIndex < 0 || selectedIndex >= options.length) {
        selectedIndex = 0;
        flowLog.log('WARN', 'Índice inválido, usando primeira opção');
    }
    
    const selectedOption = options[selectedIndex];
    
    flowLog.log('INFO', `✅ Opção escolhida: ${selectedIndex + 1}`, { 
        label: selectedOption.label 
    });
    
    return {
        output: selectedOption.output || `option_${selectedIndex}`,
        selectedOption: selectedIndex,
        selectedLabel: selectedOption.label,
        reasoning: geminiResponse,
        add: {
            ai_selected_option: selectedIndex,
            ai_selected_label: selectedOption.label,
            ai_decision_reasoning: geminiResponse
        }
    };
}

/**
 * Processar ação genérica via IA
 * Usado quando a IA precisa executar uma ação específica
 */
async function processAIGenericAction(actionType, args, context) {
    flowLog.log('INFO', `🔧 Executando ação via IA: ${actionType}`, { args });
    
    try {
        const result = await executeToolFunction(actionType, args, context);
        
        flowLog.log('INFO', `✅ Ação ${actionType} executada`, { 
            success: result.success !== false 
        });
        
        return result;
    } catch (error) {
        flowLog.log('ERROR', `❌ Erro na ação ${actionType}`, { error: error.message });
        return { error: error.message, success: false };
    }
}

module.exports = {
    processAIActions,
    processAIDecision,
    processAIOptions,
    processCreateAgendamento,
    processUpdateAgendamento,
    processAIGenericAction,
    enrichContextWithClient,
    buildBasePrompt
};
