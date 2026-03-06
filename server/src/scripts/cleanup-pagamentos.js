/**
 * CLEANUP PAGAMENTOS - Limpeza e Sincronização de Pagamentos
 *
 * Script para corrigir inconsistências encontradas na auditoria de pagamentos:
 *
 * 1. Remove pagamentos duplicados exatos (mesmo age_id, mesmo valor, mesma data)
 * 2. Remove pagamentos (pagos e pendentes) para agendamentos com status != Atendido (3)
 * 3. Remove pagamentos pendentes órfãos (agendamentos não-atendidos)
 * 4. Sincroniza pgt_valor com a soma real do pgt_json
 * 5. Sincroniza age_valor com a soma dos serviços (AXS + legado)
 *
 * Uso:
 *   node src/scripts/cleanup-pagamentos.js                    # Dry-run: mostra o que seria feito
 *   node src/scripts/cleanup-pagamentos.js --execute          # Executa as alterações
 *   node src/scripts/cleanup-pagamentos.js --empresa=1        # Filtra por empresa (default: todas)
 *
 * Segurança:
 *   - Modo dry-run por padrão (não altera nada)
 *   - Gera log detalhado de todas as ações
 *   - Pede confirmação antes de executar
 */

const mysql = require('mysql');
const util = require('util');
const readline = require('readline');
const path = require('path');
const PATHENV = path.join(__dirname, `../.env${process.env.NODE_ENV === 'dev' ? '.dev' : ''}`);
console.log('PATHENV', PATHENV)
require('dotenv').config({ path: PATHENV });

// ── Configuração ─────────────────────────────────────────────────────────────
const DB_CONFIG = {
    host: process.env.DB_HOST || '191.101.78.114',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'dboregonsys_user',
    password: process.env.DB_PASS || 'DB@OregonSys93219',
    database: process.env.DB_NAME || 'DEVdboregonsys',
    charset: 'utf8mb4'
};

console.log('DB_CONFIG', DB_CONFIG)

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const EMPRESA_ARG = args.find(a => a.startsWith('--empresa='));
const EMPRESA_ID = EMPRESA_ARG ? parseInt(EMPRESA_ARG.split('=')[1]) : null;

// ── Cores para console ───────────────────────────────────────────────────────
const c = {
    red: t => `\x1b[31m${t}\x1b[0m`,
    green: t => `\x1b[32m${t}\x1b[0m`,
    yellow: t => `\x1b[33m${t}\x1b[0m`,
    cyan: t => `\x1b[36m${t}\x1b[0m`,
    bold: t => `\x1b[1m${t}\x1b[0m`,
    dim: t => `\x1b[2m${t}\x1b[0m`,
};

// ── Contadores ───────────────────────────────────────────────────────────────
const stats = {
    duplicados_removidos: 0,
    duplicados_valor: 0,
    invalidos_removidos: 0,
    invalidos_valor: 0,
    orfaos_removidos: 0,
    orfaos_valor: 0,
    pgt_valor_sincronizados: 0,
    age_valor_sincronizados: 0,
    age_valor_diferenca_total: 0,
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function empresaFilter(alias = '') {
    const prefix = alias ? `${alias}.` : '';
    if (EMPRESA_ID) return `AND ${prefix}empresa_id = ${EMPRESA_ID}`;
    return '';
}

function formatMoney(val) {
    return `R$ ${parseFloat(val || 0).toFixed(2).replace('.', ',')}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
    const conn = mysql.createConnection(DB_CONFIG);
    const query = util.promisify(conn.query).bind(conn);

    console.log('\n' + c.bold('═══════════════════════════════════════════════════════════'));
    console.log(c.bold('  CLEANUP PAGAMENTOS - Auditoria e Limpeza'));
    console.log(c.bold('═══════════════════════════════════════════════════════════'));
    console.log(`  Modo: ${EXECUTE ? c.red('EXECUÇÃO REAL') : c.green('DRY-RUN (simulação)')}`);
    console.log(`  Banco: ${c.cyan(DB_CONFIG.database)}`);
    console.log(`  Empresa: ${EMPRESA_ID ? EMPRESA_ID : 'Todas'}`);
    console.log(c.bold('═══════════════════════════════════════════════════════════\n'));

    if (EXECUTE) {
        const ok = await confirmar('Tem certeza que deseja EXECUTAR as alterações? (sim/nao): ');
        if (!ok) {
            console.log(c.yellow('\nOperação cancelada pelo usuário.'));
            conn.end();
            return;
        }
    }

    try {
        // ── ETAPA 1: Remover pagamentos duplicados exatos ────────────────────
        await etapa1_duplicados(query);

        // ── ETAPA 2: Remover pagamentos de agendamentos não-atendidos (PAGOS) ─
        await etapa2_pagamentos_invalidos_pagos(query);

        // ── ETAPA 3: Remover pagamentos pendentes órfãos ─────────────────────
        await etapa3_orfaos_pendentes(query);

        // ── ETAPA 4: Sincronizar pgt_valor com pgt_json ──────────────────────
        await etapa4_sync_pgt_valor(query);

        // ── ETAPA 5: Sincronizar age_valor com serviços ──────────────────────
        await etapa5_sync_age_valor(query);

        // ── Resumo final ─────────────────────────────────────────────────────
        resumoFinal();

    } catch (err) {
        console.error(c.red('\nERRO FATAL:'), err.message);
        console.error(err.stack);
    } finally {
        conn.end();
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ETAPA 1: Pagamentos duplicados exatos
// Critério: mesmo age_id, mesmo pgt_valor, mesma pgt_data, todos pagos
// Ação: manter o mais antigo (menor pgt_id), deletar os extras
// ═════════════════════════════════════════════════════════════════════════════
async function etapa1_duplicados(query) {
    console.log(c.bold('\n── ETAPA 1: Pagamentos Duplicados Exatos ──────────────────\n'));

    const duplicados = await query(`
        SELECT
            p.age_id,
            p.pgt_valor,
            p.pgt_data,
            COUNT(*) as qtd,
            GROUP_CONCAT(p.pgt_id ORDER BY p.pgt_id) as ids,
            MIN(p.pgt_id) as manter_id
        FROM PAGAMENTO p
        JOIN AGENDAMENTO a ON a.age_id = p.age_id
        WHERE p.pgt_data IS NOT NULL
            ${empresaFilter('p')}
        GROUP BY p.age_id, p.pgt_valor, p.pgt_data
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
    `);

    if (!duplicados.length) {
        console.log(c.green('  Nenhum duplicado encontrado.'));
        return;
    }

    console.log(`  Encontrados ${c.yellow(duplicados.length)} grupos de duplicados:\n`);

    let idsParaDeletar = [];

    for (const dup of duplicados) {
        const todosIds = dup.ids.split(',').map(Number);
        const manterId = dup.manter_id;
        const deletarIds = todosIds.filter(id => id !== manterId);

        idsParaDeletar.push(...deletarIds);
        const excesso = dup.pgt_valor * (dup.qtd - 1);
        stats.duplicados_valor += excesso;

        console.log(`  age_id=${dup.age_id} | ${formatMoney(dup.pgt_valor)} x${dup.qtd} em ${dup.pgt_data ? new Date(dup.pgt_data).toLocaleDateString('pt-BR') : 'N/A'}`);
        console.log(`    ${c.green('Manter')}: pgt_id=${manterId} | ${c.red('Deletar')}: pgt_ids=[${deletarIds.join(', ')}]`);
        console.log(`    Excesso: ${c.red(formatMoney(excesso))}`);
    }

    stats.duplicados_removidos = idsParaDeletar.length;

    console.log(`\n  ${c.bold('Total')}: ${idsParaDeletar.length} pagamentos a remover | ${c.red(formatMoney(stats.duplicados_valor))} em excesso`);

    if (EXECUTE && idsParaDeletar.length > 0) {
        await query(`DELETE FROM PAGAMENTO WHERE pgt_id IN (?)`, [idsParaDeletar]);
        console.log(c.green(`\n  ✓ ${idsParaDeletar.length} pagamentos duplicados removidos.`));
    } else if (idsParaDeletar.length > 0) {
        console.log(c.dim(`\n  [DRY-RUN] DELETE FROM PAGAMENTO WHERE pgt_id IN (${idsParaDeletar.join(', ')})`));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ETAPA 2: Pagamentos PAGOS para agendamentos com status != Atendido (3)
// Critério: pgt_data IS NOT NULL, mas agendamento está Cancelado/Remarcado/Agendado/Confirmado
// Ação: deletar esses pagamentos
// ═════════════════════════════════════════════════════════════════════════════
async function etapa2_pagamentos_invalidos_pagos(query) {
    console.log(c.bold('\n── ETAPA 2: Pagamentos Pagos para Status Inválido ─────────\n'));

    // Buscar os status válidos por empresa (ast_id = 3 para empresa 1, 9 para empresa 3, etc.)
    const statusAtendido = await query(`
        SELECT ast_id, empresa_id FROM AGENDAMENTO_STATUS
        WHERE ast_descricao = 'Atendido'
    `);
    const idsAtendido = statusAtendido.map(s => s.ast_id);

    const invalidos = await query(`
        SELECT
            p.pgt_id,
            p.age_id,
            a.ast_id,
            a.age_data,
            a.age_valor,
            p.pgt_valor,
            p.pgt_data
        FROM PAGAMENTO p
        JOIN AGENDAMENTO a ON a.age_id = p.age_id
        WHERE p.pgt_data IS NOT NULL
            AND a.ast_id NOT IN (${idsAtendido.join(',')})
            ${empresaFilter('p')}
        ORDER BY a.ast_id, p.pgt_data
    `);

    if (!invalidos.length) {
        console.log(c.green('  Nenhum pagamento inválido encontrado.'));
        return;
    }

    // Buscar nomes dos status
    const statusNomes = await query(`SELECT ast_id, ast_descricao FROM AGENDAMENTO_STATUS`);
    const statusMap = {};
    for (const s of statusNomes) statusMap[s.ast_id] = s.ast_descricao;

    // Agrupar por status
    const porStatus = {};
    for (const inv of invalidos) {
        const nome = statusMap[inv.ast_id] || `Status ${inv.ast_id}`;
        if (!porStatus[nome]) porStatus[nome] = { qtd: 0, valor: 0, ids: [] };
        porStatus[nome].qtd++;
        porStatus[nome].valor += inv.pgt_valor;
        porStatus[nome].ids.push(inv.pgt_id);
    }

    console.log(`  Encontrados ${c.yellow(invalidos.length)} pagamentos pagos para status inválidos:\n`);

    for (const [status, data] of Object.entries(porStatus)) {
        console.log(`  ${c.yellow(status)}: ${data.qtd} pagamentos | ${c.red(formatMoney(data.valor))}`);
    }

    const todosIds = invalidos.map(i => i.pgt_id);
    const totalValor = invalidos.reduce((acc, i) => acc + i.pgt_valor, 0);

    stats.invalidos_removidos = todosIds.length;
    stats.invalidos_valor = totalValor;

    console.log(`\n  Detalhes:`);
    for (const inv of invalidos) {
        const status = statusMap[inv.ast_id] || `Status ${inv.ast_id}`;
        console.log(`    pgt_id=${inv.pgt_id} | age_id=${inv.age_id} | ${status} | ${inv.age_data ? new Date(inv.age_data).toLocaleDateString('pt-BR') : 'N/A'} | ${formatMoney(inv.pgt_valor)} | Pago em: ${inv.pgt_data ? new Date(inv.pgt_data).toLocaleDateString('pt-BR') : 'N/A'}`);
    }

    console.log(`\n  ${c.bold('Total')}: ${todosIds.length} pagamentos a remover | ${c.red(formatMoney(totalValor))}`);

    if (EXECUTE && todosIds.length > 0) {
        await query(`DELETE FROM PAGAMENTO WHERE pgt_id IN (?)`, [todosIds]);
        console.log(c.green(`\n  ✓ ${todosIds.length} pagamentos inválidos removidos.`));
    } else if (todosIds.length > 0) {
        console.log(c.dim(`\n  [DRY-RUN] DELETE FROM PAGAMENTO WHERE pgt_id IN (${todosIds.join(', ')})`));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ETAPA 3: Pagamentos pendentes órfãos (agendamentos não-atendidos)
// Critério: pgt_data IS NULL, agendamento com status != Atendido
// Ação: deletar pagamentos pendentes
// ═════════════════════════════════════════════════════════════════════════════
async function etapa3_orfaos_pendentes(query) {
    console.log(c.bold('\n── ETAPA 3: Pagamentos Pendentes Órfãos ───────────────────\n'));

    const statusAtendido = await query(`
        SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao = 'Atendido'
    `);
    const idsAtendido = statusAtendido.map(s => s.ast_id);

    const orfaos = await query(`
        SELECT
            p.pgt_id,
            p.age_id,
            a.ast_id,
            a.age_data,
            a.age_valor,
            p.pgt_valor
        FROM PAGAMENTO p
        JOIN AGENDAMENTO a ON a.age_id = p.age_id
        WHERE p.pgt_data IS NULL
            AND a.ast_id NOT IN (${idsAtendido.join(',')})
            ${empresaFilter('p')}
        ORDER BY a.ast_id, a.age_data
    `);

    if (!orfaos.length) {
        console.log(c.green('  Nenhum pagamento órfão encontrado.'));
        return;
    }

    const statusNomes = await query(`SELECT ast_id, ast_descricao FROM AGENDAMENTO_STATUS`);
    const statusMap = {};
    for (const s of statusNomes) statusMap[s.ast_id] = s.ast_descricao;

    console.log(`  Encontrados ${c.yellow(orfaos.length)} pagamentos pendentes órfãos:\n`);

    for (const orf of orfaos) {
        const status = statusMap[orf.ast_id] || `Status ${orf.ast_id}`;
        console.log(`    pgt_id=${orf.pgt_id} | age_id=${orf.age_id} | ${status} | ${formatMoney(orf.pgt_valor)}`);
    }

    const todosIds = orfaos.map(o => o.pgt_id);
    const totalValor = orfaos.reduce((acc, o) => acc + o.pgt_valor, 0);

    stats.orfaos_removidos = todosIds.length;
    stats.orfaos_valor = totalValor;

    console.log(`\n  ${c.bold('Total')}: ${todosIds.length} pagamentos a remover | ${c.red(formatMoney(totalValor))}`);

    if (EXECUTE && todosIds.length > 0) {
        await query(`DELETE FROM PAGAMENTO WHERE pgt_id IN (?)`, [todosIds]);
        console.log(c.green(`\n  ✓ ${todosIds.length} pagamentos órfãos removidos.`));
    } else if (todosIds.length > 0) {
        console.log(c.dim(`\n  [DRY-RUN] DELETE FROM PAGAMENTO WHERE pgt_id IN (${todosIds.join(', ')})`));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ETAPA 4: Sincronizar pgt_valor com a soma real do pgt_json
// Critério: pgt_valor != SUM(pgt_json[].pgt_valor)
// Ação: UPDATE pgt_valor = soma do pgt_json
// ═════════════════════════════════════════════════════════════════════════════
async function etapa4_sync_pgt_valor(query) {
    console.log(c.bold('\n── ETAPA 4: Sincronizar pgt_valor com pgt_json ────────────\n'));

    const pagamentos = await query(`
        SELECT pgt_id, pgt_valor, pgt_json
        FROM PAGAMENTO
        WHERE pgt_json IS NOT NULL
            ${empresaFilter()}
    `);

    let divergentes = [];

    for (const pag of pagamentos) {
        let json;
        try {
            json = typeof pag.pgt_json === 'string' ? JSON.parse(pag.pgt_json) : pag.pgt_json;
        } catch (e) {
            console.log(c.red(`  ERRO parse JSON pgt_id=${pag.pgt_id}: ${e.message}`));
            continue;
        }

        if (!Array.isArray(json)) continue;

        const somaJson = json.reduce((acc, item) => acc + parseFloat(item.pgt_valor || 0), 0);
        const somaJsonFixed = parseFloat(somaJson.toFixed(2));
        const pgtValorFixed = parseFloat(parseFloat(pag.pgt_valor || 0).toFixed(2));

        if (Math.abs(somaJsonFixed - pgtValorFixed) > 0.01) {
            divergentes.push({
                pgt_id: pag.pgt_id,
                pgt_valor_atual: pgtValorFixed,
                soma_json: somaJsonFixed,
                diferenca: parseFloat((somaJsonFixed - pgtValorFixed).toFixed(2))
            });
        }
    }

    if (!divergentes.length) {
        console.log(c.green('  Todos os pgt_valor estão sincronizados com pgt_json.'));
        return;
    }

    console.log(`  Encontrados ${c.yellow(divergentes.length)} registros divergentes:\n`);

    // Mostrar top 20
    const mostrar = divergentes.slice(0, 20);
    for (const div of mostrar) {
        console.log(`    pgt_id=${div.pgt_id} | Atual: ${formatMoney(div.pgt_valor_atual)} → Correto: ${formatMoney(div.soma_json)} | Dif: ${formatMoney(div.diferenca)}`);
    }
    if (divergentes.length > 20) {
        console.log(c.dim(`    ... e mais ${divergentes.length - 20} registros`));
    }

    stats.pgt_valor_sincronizados = divergentes.length;

    console.log(`\n  ${c.bold('Total')}: ${divergentes.length} registros a atualizar`);

    if (EXECUTE && divergentes.length > 0) {
        let count = 0;
        for (const div of divergentes) {
            await query(`UPDATE PAGAMENTO SET pgt_valor = ? WHERE pgt_id = ?`, [div.soma_json, div.pgt_id]);
            count++;
        }
        console.log(c.green(`\n  ✓ ${count} registros de pgt_valor sincronizados.`));
    } else if (divergentes.length > 0) {
        console.log(c.dim(`\n  [DRY-RUN] Seriam atualizados ${divergentes.length} registros.`));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// ETAPA 5: Sincronizar age_valor com a soma dos serviços (AXS + legado)
// O valor primordial do agendamento vem dos serviços, não do age_valor direto
// Critério: age_valor != SUM(serviços)
// Ação: UPDATE age_valor = soma dos serviços
// ═════════════════════════════════════════════════════════════════════════════
async function etapa5_sync_age_valor(query) {
    console.log(c.bold('\n── ETAPA 5: Sincronizar age_valor com Serviços ────────────\n'));

    // Buscar agendamentos atendidos que TEM serviços em AXS ou AGENDAMENTO_X_SERVICOS
    const agendamentos = await query(`
        SELECT
            a.age_id,
            a.age_valor,
            COALESCE(axs_sum.total, 0) as total_axs,
            COALESCE(old_sum.total, 0) as total_old
        FROM AGENDAMENTO a
        LEFT JOIN (
            SELECT age_id, SUM(ser_valor * COALESCE(ser_quantity, 1)) as total
            FROM AXS
            GROUP BY age_id
        ) axs_sum ON axs_sum.age_id = a.age_id
        LEFT JOIN (
            SELECT axs.age_id, SUM(s.ser_valor * COALESCE(axs.ser_quantity, 1)) as total
            FROM AGENDAMENTO_X_SERVICOS axs
            JOIN SERVICOS s ON s.ser_id = axs.ser_id
            GROUP BY axs.age_id
        ) old_sum ON old_sum.age_id = a.age_id
        WHERE a.ast_id IN (SELECT ast_id FROM AGENDAMENTO_STATUS WHERE ast_descricao = 'Atendido')
            AND a.age_ativo = 1
            ${empresaFilter('a')}
            AND (axs_sum.total IS NOT NULL OR old_sum.total IS NOT NULL)
    `);

    let divergentes = [];

    for (const age of agendamentos) {
        const totalServicos = parseFloat((age.total_axs + age.total_old).toFixed(2));
        const ageValor = parseFloat(parseFloat(age.age_valor || 0).toFixed(2));

        // Só considerar se tem serviços e o valor diverge
        if (totalServicos > 0 && Math.abs(totalServicos - ageValor) > 0.01) {
            divergentes.push({
                age_id: age.age_id,
                age_valor_atual: ageValor,
                total_servicos: totalServicos,
                diferenca: parseFloat((totalServicos - ageValor).toFixed(2))
            });
        }
    }

    if (!divergentes.length) {
        console.log(c.green('  Todos os age_valor estão sincronizados com os serviços.'));
        return;
    }

    console.log(`  Encontrados ${c.yellow(divergentes.length)} agendamentos com age_valor divergente:\n`);

    const totalDif = divergentes.reduce((acc, d) => acc + Math.abs(d.diferenca), 0);
    stats.age_valor_sincronizados = divergentes.length;
    stats.age_valor_diferenca_total = totalDif;

    // Mostrar top 20
    const mostrar = divergentes.slice(0, 20);
    for (const div of mostrar) {
        const seta = div.diferenca > 0 ? c.green('↑') : c.red('↓');
        console.log(`    age_id=${div.age_id} | Atual: ${formatMoney(div.age_valor_atual)} → Serviços: ${formatMoney(div.total_servicos)} | Dif: ${seta} ${formatMoney(Math.abs(div.diferenca))}`);
    }
    if (divergentes.length > 20) {
        console.log(c.dim(`    ... e mais ${divergentes.length - 20} registros`));
    }

    console.log(`\n  ${c.bold('Total')}: ${divergentes.length} agendamentos a atualizar | Diferença total: ${formatMoney(totalDif)}`);

    if (EXECUTE && divergentes.length > 0) {
        let count = 0;
        for (const div of divergentes) {
            await query(`UPDATE AGENDAMENTO SET age_valor = ? WHERE age_id = ?`, [div.total_servicos, div.age_id]);
            count++;
        }
        console.log(c.green(`\n  ✓ ${count} agendamentos com age_valor sincronizado.`));
    } else if (divergentes.length > 0) {
        console.log(c.dim(`\n  [DRY-RUN] Seriam atualizados ${divergentes.length} registros.`));
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// Resumo Final
// ═════════════════════════════════════════════════════════════════════════════
function resumoFinal() {
    console.log('\n' + c.bold('═══════════════════════════════════════════════════════════'));
    console.log(c.bold('  RESUMO FINAL'));
    console.log(c.bold('═══════════════════════════════════════════════════════════\n'));

    console.log(`  ${EXECUTE ? '✓' : '○'} Duplicados removidos:    ${stats.duplicados_removidos} registros | ${c.red(formatMoney(stats.duplicados_valor))}`);
    console.log(`  ${EXECUTE ? '✓' : '○'} Inválidos removidos:     ${stats.invalidos_removidos} registros | ${c.red(formatMoney(stats.invalidos_valor))}`);
    console.log(`  ${EXECUTE ? '✓' : '○'} Órfãos removidos:        ${stats.orfaos_removidos} registros | ${c.red(formatMoney(stats.orfaos_valor))}`);
    console.log(`  ${EXECUTE ? '✓' : '○'} pgt_valor sincronizados: ${stats.pgt_valor_sincronizados} registros`);
    console.log(`  ${EXECUTE ? '✓' : '○'} age_valor sincronizados: ${stats.age_valor_sincronizados} registros | Dif: ${formatMoney(stats.age_valor_diferenca_total)}`);

    const totalRemovidos = stats.duplicados_removidos + stats.invalidos_removidos + stats.orfaos_removidos;
    const totalValorRemovido = stats.duplicados_valor + stats.invalidos_valor + stats.orfaos_valor;

    console.log(`\n  ${c.bold('TOTAL DE REGISTROS REMOVIDOS')}: ${totalRemovidos}`);
    console.log(`  ${c.bold('TOTAL VALOR CORRIGIDO')}: ${c.red(formatMoney(totalValorRemovido))}`);

    if (!EXECUTE) {
        console.log(c.yellow('\n  ⚠ Modo DRY-RUN: nenhuma alteração foi feita.'));
        console.log(c.yellow('  Para executar de verdade, rode com: --execute'));
    } else {
        console.log(c.green('\n  ✓ Todas as alterações foram aplicadas com sucesso.'));
    }

    console.log('\n' + c.bold('═══════════════════════════════════════════════════════════\n'));
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function confirmar(pergunta) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
        rl.question(pergunta, answer => {
            rl.close();
            resolve(answer.toLowerCase().startsWith('s'));
        });
    });
}

// ── Run ──────────────────────────────────────────────────────────────────────
main().catch(err => {
    console.error(c.red('Erro fatal:'), err);
    process.exit(1);
});
