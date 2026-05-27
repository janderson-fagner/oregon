
const util = require('util');
const transporter = require('../transporter');
const multer = require("multer");
const fs = require('fs');
const handlebars = require('handlebars');
const path = require('path');
const moment = require('moment');
const axios = require('axios');

// Importar emitToEmpresa de forma segura para permitir testes
let emitToEmpresa = () => {};
try {
    const socketModule = require('../socket');
    emitToEmpresa = socketModule.emitToEmpresa;
} catch (error) {
    console.warn('⚠️ Socket.io não disponível - rodando em modo de teste');
}

const { sendZapMessage, sendZapMessageImage } = require('../zap');

const dbQuery = require('./dbHelper');
const { empresaWhere } = require('./dbHelper');

async function waitIntervaloAleatorio(min, max) {
    min = !min ? 15000 : min;
    max = !max ? 60000 : max;

    min = parseInt(min);
    max = parseInt(max);

    console.log('Intervalo mínimo:', min, 'ms - Intervalo máximo:', max, 'ms');

    let intervaloAleatorio = Math.floor(Math.random() * (max - min + 1)) + min;
    console.log('Intervalo aleatório:', intervaloAleatorio);
    await new Promise((resolve) => setTimeout(resolve, intervaloAleatorio));

    return intervaloAleatorio;
}

async function getSegTotalUsers(rules, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    let qtdRules = rules.length;

    if (qtdRules == 0) {
        return {
            total: 0,
            totalEmails: 0,
            totalWhatsapp: 0
        };
    }

    let query = `
        SELECT
            COUNT(DISTINCT c.cli_Id) as total,
            COUNT(DISTINCT CASE WHEN NULLIF(TRIM(c.cli_email), '') IS NOT NULL THEN c.cli_Id END) as totalEmails,
            COUNT(DISTINCT CASE WHEN NULLIF(TRIM(c.cli_celular), '') IS NOT NULL THEN c.cli_Id END) as totalWhatsapp
        FROM CLIENTES c
        LEFT JOIN ENDERECO e ON e.cli_id = c.cli_Id
        LEFT JOIN (
            SELECT
                a.cli_id,
                SUM(COALESCE(p.pgt_valor, 0)) AS valorPago,
                COUNT(DISTINCT a.age_id) AS countAgendamentos,
                MAX(a.age_data) AS ultimoAgendamento,
                GROUP_CONCAT(DISTINCT a.age_fonte SEPARATOR ',') AS origens
            FROM AGENDAMENTO a
            LEFT JOIN PAGAMENTO p ON p.age_id = a.age_id AND p.pgt_data IS NOT NULL
            WHERE a.age_fonte IS NOT NULL AND a.age_fonte != ''
            GROUP BY a.cli_id
        ) pag ON pag.cli_id = c.cli_Id
        LEFT JOIN (
            SELECT
                cli_Id,
                COUNT(*) AS countNegocios,
                MAX(etapaId) AS etapaAtual
            FROM Negocios
            GROUP BY cli_Id
        ) neg ON neg.cli_Id = c.cli_Id
        WHERE (NULLIF(TRIM(c.cli_celular), '') IS NOT NULL
        OR NULLIF(TRIM(c.cli_email), '') IS NOT NULL)
        AND c.${ew.sql}
    `;

    console.log('RULES:', rules);

    for (let rule of rules) {
        let { field, operator, value, logicalOperator } = rule;

        if (field?.includes('data')) {
            value = `${moment(value + 'T00:00:00Z').format('YYYY-MM-DD HH:mm:ss')}`;
        }

        let condition = '';

        if (field === 'tags') {
            let subquery = `JSON_CONTAINS(c.cli_tags, JSON_OBJECT('id', ${value}))`;

            if (operator === 'eq') {
                condition = subquery;
            } else if (operator === 'neq') {
                condition = `NOT ${subquery}`;
            } else if (operator === 'contains') {
                condition = subquery;
            } else if (operator === 'not_contains') {
                condition = `NOT ${subquery}`;
            } else if (operator === 'empty') {
                condition = `(c.cli_tags IS NULL OR c.cli_tags = '[]' OR c.cli_tags = '')`;
            } else if (operator === 'not_empty') {
                condition = `(c.cli_tags IS NOT NULL AND c.cli_tags != '[]' AND c.cli_tags != '')`;
            }
        } else if (field === 'origem') {
            // Usar GROUP_CONCAT de origens

            if (operator === 'eq') {
                condition = `pag.origens LIKE '%${value}%'`;
            } else if (operator === 'neq') {
                condition = `(pag.origens NOT LIKE '%${value}%' OR pag.origens IS NULL)`;
            } else if (operator === 'contains') {
                condition = `pag.origens LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `(pag.origens NOT LIKE '%${value}%' OR pag.origens IS NULL)`;
            } else if (operator === 'empty') {
                condition = `(pag.origens IS NULL OR pag.origens = '')`;
            } else if (operator === 'not_empty') {
                condition = `(pag.origens IS NOT NULL AND pag.origens != '')`;
            }
        } else if (field === 'email') {
            if (operator === 'eq') {
                condition = `c.cli_email = '${value}'`;
            } else if (operator === 'neq') {
                condition = `c.cli_email != '${value}'`;
            } else if (operator === 'contains') {
                condition = `c.cli_email LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `c.cli_email NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(c.cli_email IS NULL OR c.cli_email = '')`;
            } else if (operator === 'not_empty') {
                condition = `(c.cli_email IS NOT NULL AND c.cli_email != '')`;
            } else if (operator === 'regex') {
                condition = `c.cli_email REGEXP '${value}'`;
            }
        } else if (field === 'genero') {
            if (operator === 'eq') {
                condition = `c.cli_genero = '${value}'`;
            } else if (operator === 'neq') {
                condition = `c.cli_genero != '${value}'`;
            } else if (operator === 'contains') {
                condition = `c.cli_genero LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `c.cli_genero NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(c.cli_genero IS NULL OR c.cli_genero = '')`;
            } else if (operator === 'not_empty') {
                condition = `(c.cli_genero IS NOT NULL AND c.cli_genero != '')`;
            }
        } else if (field === 'bairro') {
            if (operator === 'eq') {
                condition = `e.end_bairro = '${value}'`;
            } else if (operator === 'neq') {
                condition = `e.end_bairro != '${value}'`;
            } else if (operator === 'contains') {
                condition = `e.end_bairro LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `e.end_bairro NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(e.end_bairro IS NULL OR e.end_bairro = '')`;
            } else if (operator === 'not_empty') {
                condition = `(e.end_bairro IS NOT NULL AND e.end_bairro != '')`;
            }
        } else if (field === 'estado') {
            if (operator === 'eq') {
                condition = `e.end_estado = '${value}'`;
            } else if (operator === 'neq') {
                condition = `e.end_estado != '${value}'`;
            } else if (operator === 'contains') {
                condition = `e.end_estado LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `e.end_estado NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(e.end_estado IS NULL OR e.end_estado = '')`;
            } else if (operator === 'not_empty') {
                condition = `(e.end_estado IS NOT NULL AND e.end_estado != '')`;
            }
        } else if (field === 'cidade') {
            if (operator === 'eq') {
                condition = `e.end_cidade = '${value}'`;
            } else if (operator === 'neq') {
                condition = `e.end_cidade != '${value}'`;
            } else if (operator === 'contains') {
                condition = `e.end_cidade LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `e.end_cidade NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(e.end_cidade IS NULL OR e.end_cidade = '')`;
            } else if (operator === 'not_empty') {
                condition = `(e.end_cidade IS NOT NULL AND e.end_cidade != '')`;
            }
        } else if (field === 'valor_gasto') {
            if (operator === 'eq') {
                condition = `COALESCE(pag.valorPago, 0) = ${value}`;
            } else if (operator === 'neq') {
                condition = `COALESCE(pag.valorPago, 0) != ${value}`;
            } else if (operator === 'gt') {
                condition = `COALESCE(pag.valorPago, 0) > ${value}`;
            } else if (operator === 'gte') {
                condition = `COALESCE(pag.valorPago, 0) >= ${value}`;
            } else if (operator === 'lt') {
                condition = `COALESCE(pag.valorPago, 0) < ${value}`;
            } else if (operator === 'lte') {
                condition = `COALESCE(pag.valorPago, 0) <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(pag.valorPago IS NULL OR pag.valorPago = 0)`;
            } else if (operator === 'not_empty') {
                condition = `(pag.valorPago IS NOT NULL AND pag.valorPago > 0)`;
            }
        } else if (field === 'data_cadastro') {
            if (operator === 'eq') {
                condition = `DATE(c.created_at) = '${value}'`;
            } else if (operator === 'neq') {
                condition = `DATE(c.created_at) != '${value}'`;
            } else if (operator === 'gt') {
                condition = `DATE(c.created_at) > '${value}'`;
            } else if (operator === 'gte') {
                condition = `DATE(c.created_at) >= '${value}'`;
            } else if (operator === 'lt') {
                condition = `DATE(c.created_at) < '${value}'`;
            } else if (operator === 'lte') {
                condition = `DATE(c.created_at) <= '${value}'`;
            } else if (operator === 'empty') {
                condition = `(c.created_at IS NULL)`;
            } else if (operator === 'not_empty') {
                condition = `(c.created_at IS NOT NULL)`;
            }
        } else if (field === 'data_ultimo_agendamento') {
            if (operator === 'eq') {
                condition = `DATE(pag.ultimoAgendamento) = '${value}'`;
            } else if (operator === 'neq') {
                condition = `DATE(pag.ultimoAgendamento) != '${value}'`;
            } else if (operator === 'gt') {
                condition = `DATE(pag.ultimoAgendamento) > '${value}'`;
            } else if (operator === 'gte') {
                condition = `DATE(pag.ultimoAgendamento) >= '${value}'`;
            } else if (operator === 'lt') {
                condition = `DATE(pag.ultimoAgendamento) < '${value}'`;
            } else if (operator === 'lte') {
                condition = `DATE(pag.ultimoAgendamento) <= '${value}'`;
            } else if (operator === 'empty') {
                condition = `(pag.ultimoAgendamento IS NULL)`;
            } else if (operator === 'not_empty') {
                condition = `(pag.ultimoAgendamento IS NOT NULL)`;
            }
        } else if (field === 'quantidade_agendamentos') {
            if (operator === 'eq') {
                condition = `COALESCE(pag.countAgendamentos, 0) = ${value}`;
            } else if (operator === 'neq') {
                condition = `COALESCE(pag.countAgendamentos, 0) != ${value}`;
            } else if (operator === 'gt') {
                condition = `COALESCE(pag.countAgendamentos, 0) > ${value}`;
            } else if (operator === 'gte') {
                condition = `COALESCE(pag.countAgendamentos, 0) >= ${value}`;
            } else if (operator === 'lt') {
                condition = `COALESCE(pag.countAgendamentos, 0) < ${value}`;
            } else if (operator === 'lte') {
                condition = `COALESCE(pag.countAgendamentos, 0) <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(pag.countAgendamentos IS NULL OR pag.countAgendamentos = 0)`;
            } else if (operator === 'not_empty') {
                condition = `(pag.countAgendamentos IS NOT NULL AND pag.countAgendamentos > 0)`;
            }
        } else if (field === 'quantidade_negocios') {
            if (operator === 'eq') {
                condition = `COALESCE(neg.countNegocios, 0) = ${value}`;
            } else if (operator === 'neq') {
                condition = `COALESCE(neg.countNegocios, 0) != ${value}`;
            } else if (operator === 'gt') {
                condition = `COALESCE(neg.countNegocios, 0) > ${value}`;
            } else if (operator === 'gte') {
                condition = `COALESCE(neg.countNegocios, 0) >= ${value}`;
            } else if (operator === 'lt') {
                condition = `COALESCE(neg.countNegocios, 0) < ${value}`;
            } else if (operator === 'lte') {
                condition = `COALESCE(neg.countNegocios, 0) <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(neg.countNegocios IS NULL OR neg.countNegocios = 0)`;
            } else if (operator === 'not_empty') {
                condition = `(neg.countNegocios IS NOT NULL AND neg.countNegocios > 0)`;
            }
        } else if (field === 'etapa_funil_vendas') {
            if (operator === 'eq') {
                condition = `neg.etapaAtual = ${value}`;
            } else if (operator === 'neq') {
                condition = `neg.etapaAtual != ${value}`;
            } else if (operator === 'gt') {
                condition = `neg.etapaAtual > ${value}`;
            } else if (operator === 'gte') {
                condition = `neg.etapaAtual >= ${value}`;
            } else if (operator === 'lt') {
                condition = `neg.etapaAtual < ${value}`;
            } else if (operator === 'lte') {
                condition = `neg.etapaAtual <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(neg.etapaAtual IS NULL)`;
            } else if (operator === 'not_empty') {
                condition = `(neg.etapaAtual IS NOT NULL)`;
            }
        }

        if (logicalOperator && logicalOperator.toLowerCase() === 'or') {
            query += ` OR (${condition})`;
        } else {
            query += ` AND (${condition})`;
        }
    }

    console.log('QUERY:', query);

    let result = await dbQuery(query, [...ew.params]);
    let { total, totalEmails, totalWhatsapp } = result[0];

    return {
        total: parseInt(total) || 0,
        totalEmails: parseInt(totalEmails) || 0,
        totalWhatsapp: parseInt(totalWhatsapp) || 0
    };
}

async function getSegUsers(rules, empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    let qtdRules = rules.length;

    if (qtdRules == 0) {
        return [];
    }

    let query = `
        SELECT DISTINCT
            c.*,
            COALESCE(e.enderecos, JSON_ARRAY()) AS enderecos,
            COALESCE(neg.negocios, JSON_ARRAY()) AS negocios,
            COALESCE(pag.pagamentos, JSON_ARRAY()) AS pagamentos,
            COALESCE(pag.valorPago, 0) AS valorPago,
            pag.origens AS origens,
            COALESCE(pag.countAgendamentos, 0) AS countAgendamentos,
            pag.ultimoAgendamento,
            COALESCE(neg.countNegocios, 0) AS countNegocios,
            neg.etapaAtual
        FROM CLIENTES c
        LEFT JOIN (
            SELECT
                cli_id,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'end_id', end_id,
                        'end_logradouro', end_logradouro,
                        'end_numero', end_numero,
                        'end_bairro', end_bairro,
                        'end_cidade', end_cidade,
                        'end_estado', end_estado,
                        'end_cep', end_cep
                    )
                ) AS enderecos
            FROM ENDERECO
            GROUP BY cli_id
        ) e ON e.cli_id = c.cli_Id
        LEFT JOIN (
            SELECT
                cli_Id,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', id,
                        'title', title,
                        'status', status,
                        'valor', valor,
                        'origem', origem,
                        'created_at', created_at
                    )
                ) AS negocios,
                COUNT(*) AS countNegocios,
                MAX(etapaId) AS etapaAtual
            FROM Negocios
            GROUP BY cli_Id
        ) neg ON neg.cli_Id = c.cli_Id
        LEFT JOIN (
            SELECT
                a.cli_id,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'pgt_id', p.pgt_id,
                        'age_id', p.age_id,
                        'pgt_valor', p.pgt_valor,
                        'pgt_data', p.pgt_data
                    )
                ) AS pagamentos,
                SUM(COALESCE(p.pgt_valor, 0)) AS valorPago,
                COUNT(DISTINCT a.age_id) AS countAgendamentos,
                MAX(a.age_data) AS ultimoAgendamento,
                GROUP_CONCAT(DISTINCT a.age_fonte SEPARATOR ',') AS origens
            FROM AGENDAMENTO a
            LEFT JOIN PAGAMENTO p ON p.age_id = a.age_id AND p.pgt_data IS NOT NULL
            WHERE a.age_fonte IS NOT NULL AND a.age_fonte != ''
            GROUP BY a.cli_id
        ) pag ON pag.cli_id = c.cli_Id
        WHERE (NULLIF(TRIM(c.cli_celular), '') IS NOT NULL
        OR NULLIF(TRIM(c.cli_email), '') IS NOT NULL)
        AND c.${ew.sql}
    `;

    console.log('RULES:', rules);
    
    for (let rule of rules) {
        let { field, operator, value, logicalOperator } = rule;

        if (field?.includes('data')) {
            value = `${moment(value + 'T00:00:00Z').format('YYYY-MM-DD HH:mm:ss')}`;
        }

        let condition = '';

        if (field === 'tags') {
            let subquery = `JSON_CONTAINS(c.cli_tags, JSON_OBJECT('id', ${value}))`;

            if (operator === 'eq') {
                condition = subquery;
            } else if (operator === 'neq') {
                condition = `NOT ${subquery}`;
            } else if (operator === 'contains') {
                condition = subquery;
            } else if (operator === 'not_contains') {
                condition = `NOT ${subquery}`;
            } else if (operator === 'empty') {
                condition = `(c.cli_tags IS NULL OR c.cli_tags = '[]' OR c.cli_tags = '')`;
            } else if (operator === 'not_empty') {
                condition = `(c.cli_tags IS NOT NULL AND c.cli_tags != '[]' AND c.cli_tags != '')`;
            }
        } else if (field === 'origem') {
            // Usar GROUP_CONCAT de origens

            if (operator === 'eq') {
                condition = `pag.origens LIKE '%${value}%'`;
            } else if (operator === 'neq') {
                condition = `(pag.origens NOT LIKE '%${value}%' OR pag.origens IS NULL)`;
            } else if (operator === 'contains') {
                condition = `pag.origens LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `(pag.origens NOT LIKE '%${value}%' OR pag.origens IS NULL)`;
            } else if (operator === 'empty') {
                condition = `(pag.origens IS NULL OR pag.origens = '')`;
            } else if (operator === 'not_empty') {
                condition = `(pag.origens IS NOT NULL AND pag.origens != '')`;
            }
        } else if (field === 'email') {
            if (operator === 'eq') {
                condition = `c.cli_email = '${value}'`;
            } else if (operator === 'neq') {
                condition = `c.cli_email != '${value}'`;
            } else if (operator === 'contains') {
                condition = `c.cli_email LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `c.cli_email NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(c.cli_email IS NULL OR c.cli_email = '')`;
            } else if (operator === 'not_empty') {
                condition = `(c.cli_email IS NOT NULL AND c.cli_email != '')`;
            } else if (operator === 'regex') {
                condition = `c.cli_email REGEXP '${value}'`;
            }
        } else if (field === 'genero') {
            if (operator === 'eq') {
                condition = `c.cli_genero = '${value}'`;
            } else if (operator === 'neq') {
                condition = `c.cli_genero != '${value}'`;
            } else if (operator === 'contains') {
                condition = `c.cli_genero LIKE '%${value}%'`;
            } else if (operator === 'not_contains') {
                condition = `c.cli_genero NOT LIKE '%${value}%'`;
            } else if (operator === 'empty') {
                condition = `(c.cli_genero IS NULL OR c.cli_genero = '')`;
            } else if (operator === 'not_empty') {
                condition = `(c.cli_genero IS NOT NULL AND c.cli_genero != '')`;
            }
        } else if (field === 'bairro') {
            if (operator === 'eq') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '${value}', NULL, '$[*].end_bairro') IS NOT NULL`;
            } else if (operator === 'neq') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '${value}', NULL, '$[*].end_bairro') IS NULL`;
            } else if (operator === 'contains') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '%${value}%', NULL, '$[*].end_bairro') IS NOT NULL`;
            } else if (operator === 'not_contains') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '%${value}%', NULL, '$[*].end_bairro') IS NULL`;
            } else if (operator === 'empty') {
                condition = `(e.enderecos IS NULL OR e.enderecos = '[]')`;
            } else if (operator === 'not_empty') {
                condition = `(e.enderecos IS NOT NULL AND e.enderecos != '[]')`;
            }
        } else if (field === 'estado') {
            if (operator === 'eq') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '${value}', NULL, '$[*].end_estado') IS NOT NULL`;
            } else if (operator === 'neq') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '${value}', NULL, '$[*].end_estado') IS NULL`;
            } else if (operator === 'contains') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '%${value}%', NULL, '$[*].end_estado') IS NOT NULL`;
            } else if (operator === 'not_contains') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '%${value}%', NULL, '$[*].end_estado') IS NULL`;
            } else if (operator === 'empty') {
                condition = `(e.enderecos IS NULL OR e.enderecos = '[]')`;
            } else if (operator === 'not_empty') {
                condition = `(e.enderecos IS NOT NULL AND e.enderecos != '[]')`;
            }
        } else if (field === 'cidade') {
            if (operator === 'eq') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '${value}', NULL, '$[*].end_cidade') IS NOT NULL`;
            } else if (operator === 'neq') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '${value}', NULL, '$[*].end_cidade') IS NULL`;
            } else if (operator === 'contains') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '%${value}%', NULL, '$[*].end_cidade') IS NOT NULL`;
            } else if (operator === 'not_contains') {
                condition = `JSON_SEARCH(e.enderecos, 'one', '%${value}%', NULL, '$[*].end_cidade') IS NULL`;
            } else if (operator === 'empty') {
                condition = `(e.enderecos IS NULL OR e.enderecos = '[]')`;
            } else if (operator === 'not_empty') {
                condition = `(e.enderecos IS NOT NULL AND e.enderecos != '[]')`;
            }
        } else if (field === 'valor_gasto') {
            if (operator === 'eq') {
                condition = `COALESCE(pag.valorPago, 0) = ${value}`;
            } else if (operator === 'neq') {
                condition = `COALESCE(pag.valorPago, 0) != ${value}`;
            } else if (operator === 'gt') {
                condition = `COALESCE(pag.valorPago, 0) > ${value}`;
            } else if (operator === 'gte') {
                condition = `COALESCE(pag.valorPago, 0) >= ${value}`;
            } else if (operator === 'lt') {
                condition = `COALESCE(pag.valorPago, 0) < ${value}`;
            } else if (operator === 'lte') {
                condition = `COALESCE(pag.valorPago, 0) <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(pag.valorPago IS NULL OR pag.valorPago = 0)`;
            } else if (operator === 'not_empty') {
                condition = `(pag.valorPago IS NOT NULL AND pag.valorPago > 0)`;
            }
        } else if (field === 'data_cadastro') {
            if (operator === 'eq') {
                condition = `DATE(c.created_at) = '${value}'`;
            } else if (operator === 'neq') {
                condition = `DATE(c.created_at) != '${value}'`;
            } else if (operator === 'gt') {
                condition = `DATE(c.created_at) > '${value}'`;
            } else if (operator === 'gte') {
                condition = `DATE(c.created_at) >= '${value}'`;
            } else if (operator === 'lt') {
                condition = `DATE(c.created_at) < '${value}'`;
            } else if (operator === 'lte') {
                condition = `DATE(c.created_at) <= '${value}'`;
            } else if (operator === 'empty') {
                condition = `(c.created_at IS NULL)`;
            } else if (operator === 'not_empty') {
                condition = `(c.created_at IS NOT NULL)`;
            }
        } else if (field === 'data_ultimo_agendamento') {
            if (operator === 'eq') {
                condition = `DATE(pag.ultimoAgendamento) = '${value}'`;
            } else if (operator === 'neq') {
                condition = `DATE(pag.ultimoAgendamento) != '${value}'`;
            } else if (operator === 'gt') {
                condition = `DATE(pag.ultimoAgendamento) > '${value}'`;
            } else if (operator === 'gte') {
                condition = `DATE(pag.ultimoAgendamento) >= '${value}'`;
            } else if (operator === 'lt') {
                condition = `DATE(pag.ultimoAgendamento) < '${value}'`;
            } else if (operator === 'lte') {
                condition = `DATE(pag.ultimoAgendamento) <= '${value}'`;
            } else if (operator === 'empty') {
                condition = `(pag.ultimoAgendamento IS NULL)`;
            } else if (operator === 'not_empty') {
                condition = `(pag.ultimoAgendamento IS NOT NULL)`;
            }
        } else if (field === 'quantidade_agendamentos') {
            if (operator === 'eq') {
                condition = `COALESCE(pag.countAgendamentos, 0) = ${value}`;
            } else if (operator === 'neq') {
                condition = `COALESCE(pag.countAgendamentos, 0) != ${value}`;
            } else if (operator === 'gt') {
                condition = `COALESCE(pag.countAgendamentos, 0) > ${value}`;
            } else if (operator === 'gte') {
                condition = `COALESCE(pag.countAgendamentos, 0) >= ${value}`;
            } else if (operator === 'lt') {
                condition = `COALESCE(pag.countAgendamentos, 0) < ${value}`;
            } else if (operator === 'lte') {
                condition = `COALESCE(pag.countAgendamentos, 0) <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(pag.countAgendamentos IS NULL OR pag.countAgendamentos = 0)`;
            } else if (operator === 'not_empty') {
                condition = `(pag.countAgendamentos IS NOT NULL AND pag.countAgendamentos > 0)`;
            }
        } else if (field === 'quantidade_negocios') {
            if (operator === 'eq') {
                condition = `COALESCE(neg.countNegocios, 0) = ${value}`;
            } else if (operator === 'neq') {
                condition = `COALESCE(neg.countNegocios, 0) != ${value}`;
            } else if (operator === 'gt') {
                condition = `COALESCE(neg.countNegocios, 0) > ${value}`;
            } else if (operator === 'gte') {
                condition = `COALESCE(neg.countNegocios, 0) >= ${value}`;
            } else if (operator === 'lt') {
                condition = `COALESCE(neg.countNegocios, 0) < ${value}`;
            } else if (operator === 'lte') {
                condition = `COALESCE(neg.countNegocios, 0) <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(neg.countNegocios IS NULL OR neg.countNegocios = 0)`;
            } else if (operator === 'not_empty') {
                condition = `(neg.countNegocios IS NOT NULL AND neg.countNegocios > 0)`;
            }
        } else if (field === 'etapa_funil_vendas') {
            if (operator === 'eq') {
                condition = `neg.etapaAtual = ${value}`;
            } else if (operator === 'neq') {
                condition = `neg.etapaAtual != ${value}`;
            } else if (operator === 'gt') {
                condition = `neg.etapaAtual > ${value}`;
            } else if (operator === 'gte') {
                condition = `neg.etapaAtual >= ${value}`;
            } else if (operator === 'lt') {
                condition = `neg.etapaAtual < ${value}`;
            } else if (operator === 'lte') {
                condition = `neg.etapaAtual <= ${value}`;
            } else if (operator === 'empty') {
                condition = `(neg.etapaAtual IS NULL)`;
            } else if (operator === 'not_empty') {
                condition = `(neg.etapaAtual IS NOT NULL)`;
            }
        }

        if (logicalOperator && logicalOperator.toLowerCase() === 'or') {
            query += ` OR (${condition})`;
        } else {
            query += ` AND (${condition})`;
        }
    }

    console.log('QUERY 2:', query);

    let results = await dbQuery(query, [...ew.params]);
    
    // Processar os resultados para converter JSON strings para objetos
    for (let cliente of results) {
        cliente.enderecos = cliente.enderecos ? JSON.parse(cliente.enderecos) : [];
        cliente.negocios = cliente.negocios ? JSON.parse(cliente.negocios) : [];
        cliente.pagamentos = cliente.pagamentos ? JSON.parse(cliente.pagamentos) : [];
        cliente.cli_tags = cliente.cli_tags ? JSON.parse(cliente.cli_tags) : [];
        cliente.cli_contatos = cliente.cli_contatos ? JSON.parse(cliente.cli_contatos) : [];
        cliente.origens = cliente.origens ? cliente.origens.split(',') : [];
        cliente.cli_historico = cliente.cli_historico ? JSON.parse(cliente.cli_historico) : [];
        cliente.cli_atividades = cliente.cli_atividades ? JSON.parse(cliente.cli_atividades) : [];
        cliente.cli_anotacoes = cliente.cli_anotacoes ? JSON.parse(cliente.cli_anotacoes) : [];
        cliente.valorPago = cliente.valorPago ? parseFloat(cliente.valorPago) : 0;
        cliente.countAgendamentos = cliente.countAgendamentos ? parseInt(cliente.countAgendamentos) : 0;
        cliente.countNegocios = cliente.countNegocios ? parseInt(cliente.countNegocios) : 0;
    }
    
    return results;
}

const cleanNumber = (number) => {
    if (!number) return '';
    return number.replace(/\D/g, '').replace(/^\+55/, '').replace(/^55/, '');
};

// Função para obter transporter SMTP
async function getSMTPTransporter(empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    try {
        const smtpConfig = await dbQuery(
            'SELECT value FROM Options WHERE type = ? AND ' + ew.sql,
            ['credenciais_smtp', ...ew.params]
        );

        if (!smtpConfig || smtpConfig.length === 0) {
            console.warn('⚠️ Credenciais SMTP não configuradas');
            return null;
        }

        const config = typeof smtpConfig[0].value === 'string'
            ? JSON.parse(smtpConfig[0].value)
            : smtpConfig[0].value;

        if (!config.host || !config.user || !config.pass) {
            console.warn('⚠️ Credenciais SMTP incompletas');
            return null;
        }

        const port = config.port || 587;
        const secure = port === 465 ? true : false;

        console.log('✅ Criando transporter SMTP:', {
            host: config.host,
            port: port,
            secure: secure,
            user: config.user
        });

        const nodemailer = require('nodemailer');

        const transportConfig = {
            host: config.host,
            port: port,
            secure: secure,
            auth: {
                user: config.user,
                pass: config.pass
            }
        };

        if (port === 587) {
            transportConfig.requireTLS = true;
            transportConfig.tls = {
                rejectUnauthorized: false
            };
        }

        let fromField = config.from || config.user;
        if (config.fromName) {
            fromField = `"${config.fromName}" <${config.from || config.user}>`;
        }

        return {
            transporter: nodemailer.createTransport(transportConfig),
            from: fromField
        };
    } catch (error) {
        console.error('❌ Erro ao criar transporter SMTP:', error);
        return null;
    }
}

async function dispararCampanhas(empresa_id = null) {
    const ew = empresaWhere(empresa_id);
    let campanhas = await dbQuery('SELECT * FROM Campanhas WHERE (status = "Agendada" OR status = "Criada") AND data_envio IS NOT NULL AND data_envio = ? AND ' + ew.sql, [moment().format('YYYY-MM-DD'), ...ew.params]);

    const saveCampanha = async (campanha, dataLog, status = 'Pausada') => {
        dataLog.dataFim = moment().format('YYYY-MM-DD HH:mm:ss');

        const saveDateLog = dataLog;
        delete saveDateLog.messagesLog;

        await dbQuery('UPDATE Campanhas SET status = ?, dataLog = ? WHERE id = ? AND ' + ew.sql, [status, JSON.stringify(saveDateLog), campanha.id, ...ew.params]);
        emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });

        console.log('Campanha Salva', campanha.id);
    }

    const saveMessageLog = async (campanha, message) => {
        await dbQuery('INSERT INTO MessagesLog (idCampanha, data, phone, email, cliente, message, tipo, sucesso, empresa_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
            campanha.id,
            message.data || moment().format('YYYY-MM-DD HH:mm:ss'),
            message.phone || null,
            message.email || null,
            message.cliente || '',
            message.message || '',
            message.tipo || 'whatsapp',
            message.sucesso || false,
            empresa_id
        ]);
    }

    if (campanhas.length > 0) {
        console.log('📊 Campanhas encontradas:', campanhas.length);

        for (const campanha of campanhas) {

            if (moment().hour() < campanha.hora_envio.split(':')[0] && moment().minute() != campanha.hora_envio.split(':')[1]
                || moment().hour() == campanha.hora_envio.split(':')[0] && moment().minute() < campanha.hora_envio.split(':')[1]) {
                console.log('⏰ Hora agora', moment().hour(), moment().minute(), 'Hora envio', campanha.hora_envio.split(':')[0], campanha.hora_envio.split(':')[1]);
                console.log(`⏱️ Agora é ${moment().format('YYYY-MM-DD HH:mm:ss')} e a campanha ${campanha.id} está agendada para ${moment(campanha.data_envio).format('YYYY-MM-DD') + ' ' + campanha.hora_envio}.`);
                continue;
            } else if (moment().hour() > campanha.hora_envio.split(':')[0] || moment().hour() == campanha.hora_envio.split(':')[0] && moment().minute() > campanha.hora_envio.split(':')[1]) {
                console.log(`❌ Agora é ${moment().format('YYYY-MM-DD HH:mm:ss')} e a campanha ${campanha.id} já deveria ter sido enviada.`);
                await dbQuery('UPDATE Campanhas SET status = "Erro: Horário de envio passado" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                continue;
            }

            // Verificar tipos de disparo
            const types = campanha.types ? campanha.types.split(',') : [];
            const hasWhatsApp = types.includes('zap');
            const hasEmail = types.includes('email');

            console.log(`📋 Campanha ${campanha.id} - Tipos:`, types);

            // Verificar WhatsApp se necessário (usa client de disparos)
            if (hasWhatsApp) {
                const { isClientConnected } = require('../zap');
                const clientConnected = await isClientConnected('disparos_1');
                
                if (!clientConnected) {
                    console.error('❌ WhatsApp de Disparos não conectado!');
                    await dbQuery('UPDATE Campanhas SET status = "Erro: WhatsApp de Disparos não conectado" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                    emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                    continue;
                }
            }

            // Obter SMTP se necessário
            let smtpData = null;
            if (hasEmail) {
                smtpData = await getSMTPTransporter();
                if (!smtpData) {
                    console.error('❌ SMTP não configurado!');
                    await dbQuery('UPDATE Campanhas SET status = "Erro: SMTP não configurado" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                    emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                    continue;
                }
            }

            let dataLog = {
                dataInicio: moment().format('YYYY-MM-DD HH:mm:ss'),
                enviosSucesso: 0,
                enviosErro: 0,
                enviosWhatsApp: { sucesso: 0, erro: 0 },
                enviosEmail: { sucesso: 0, erro: 0 }
            };

            let segQuery = await dbQuery('SELECT * FROM Segmentacoes WHERE id = ? AND ' + ew.sql, [campanha.segmentacao, ...ew.params]);

            if (segQuery.length == 0) {
                console.error('❌ Segmentação não encontrada!');
                await dbQuery('UPDATE Campanhas SET status = "Erro: Segmentação não encontrada" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                continue;
            }

            let segmentacao = segQuery[0];

            if (!segmentacao.rules || segmentacao.rules.length == 0 || segmentacao.rules == 'null') {
                console.error('❌ Segmentação sem regras!');
                await dbQuery('UPDATE Campanhas SET status = "Erro: Segmentação sem regras" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                continue;
            }

            let rules = JSON.parse(segmentacao.rules);
            let clientes = await getSegUsers(rules, empresa_id);

            console.log('📊 Qtd Clientes:', clientes.length);
            dataLog.qtdClientes = clientes.length;

            const dataLogInit = campanha.dataLog ? typeof campanha.dataLog === 'string' ? JSON.parse(campanha.dataLog) : campanha.dataLog : null;
            const messagesLogs = await dbQuery('SELECT * FROM MessagesLog WHERE idCampanha = ? AND ' + ew.sql, [campanha.id, ...ew.params]);

            if (dataLogInit && messagesLogs.length > 0) {
                dataLog = dataLogInit;
                let newClientes = clientes.filter(cliente => {
                    return !messagesLogs.some(log => (log.phone && log.phone == cliente.phone) || (log.email && log.email == cliente.email));
                });

                console.log('📊 Clientes ainda a enviar:', newClientes.length, ' - Clientes já enviados:', messagesLogs.length, ' - Total de clientes:', clientes.length);

                clientes = newClientes;
            }

            if (clientes.length == 0) {
                console.error('❌ Nenhum cliente encontrado!');
                await dbQuery('UPDATE Campanhas SET status = "Erro: Nenhum cliente encontrado" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                continue;
            }

            // Buscar modelos de mensagem e email
            let modeloWhatsApp = null;
            let modeloEmail = null;

            if (hasWhatsApp && campanha.modeloMensagem) {
                const modeloQuery = await dbQuery('SELECT * FROM Templates WHERE id = ? AND ' + ew.sql, [campanha.modeloMensagem, ...ew.params]);
                if (modeloQuery && modeloQuery.length > 0) {
                    modeloWhatsApp = modeloQuery[0];
                    modeloWhatsApp.content = typeof modeloWhatsApp.content === 'string' ? JSON.parse(modeloWhatsApp.content) : modeloWhatsApp.content;
                    console.log('✅ Modelo WhatsApp carregado:', modeloWhatsApp.name);
                }
            }

            if (hasEmail && campanha.modeloEmail) {
                const modeloQuery = await dbQuery('SELECT * FROM Templates WHERE id = ? AND ' + ew.sql, [campanha.modeloEmail, ...ew.params]);
                if (modeloQuery && modeloQuery.length > 0) {
                    modeloEmail = modeloQuery[0];
                    modeloEmail.content = typeof modeloEmail.content === 'string' ? JSON.parse(modeloEmail.content) : modeloEmail.content;
                    console.log('✅ Modelo Email carregado:', modeloEmail.name);
                }
            }

            // Validar se tem os modelos necessários
            if (hasWhatsApp && !modeloWhatsApp) {
                console.error('❌ Modelo de WhatsApp não encontrado!');
                await dbQuery('UPDATE Campanhas SET status = "Erro: Modelo de WhatsApp não encontrado" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                continue;
            }

            if (hasEmail && !modeloEmail) {
                console.error('❌ Modelo de Email não encontrado!');
                await dbQuery('UPDATE Campanhas SET status = "Erro: Modelo de Email não encontrado" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
                emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                continue;
            }

            await dbQuery('UPDATE Campanhas SET status = "Realizando disparo" WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);
            emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
            console.log('🚀 Iniciando disparo...');

            for (const cliente of clientes) {
                const checkPlayQuery = await dbQuery('SELECT * FROM Campanhas WHERE id = ? AND ' + ew.sql, [campanha.id, ...ew.params]);

                if (checkPlayQuery.length == 0) {
                    console.error('❌ Campanha não encontrada!');
                    await saveCampanha(campanha, dataLog, "Erro: Campanha não encontrada");
                    emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                    return;
                }

                if (checkPlayQuery[0].play == 0) {
                    console.log('⏸️ Campanha pausada - interrompendo disparo.');
                    await saveCampanha(campanha, dataLog, "Pausada");
                    emitToEmpresa(empresa_id, 'atualizacampanha', { id: campanha.id });
                    return;
                }

                const pedidosCliente = cliente.pedidos ? (typeof cliente.pedidos === 'string' ? JSON.parse(cliente.pedidos) : cliente.pedidos) : [];
                const pedido = pedidosCliente.length > 0 ? pedidosCliente[0] : null;

                // Enviar WhatsApp se configurado e cliente tiver telefone
                if (hasWhatsApp && cliente.phone && cliente.phone.trim() !== '') {
                    try {
                        console.log(`📱 Enviando WhatsApp para: ${cliente.phone}`);

                        // Obter conteúdo do modelo
                        let content = modeloWhatsApp.content?.content || modeloWhatsApp.content || '';
                        let message = await formatContent(content, cliente, pedido, null, true);

                        let envioM = false;

                        // Verificar se tem mídia
                        const midia = modeloWhatsApp.midia || modeloWhatsApp.content?.midia;

                        // TODO [ASSUMPTION-AUTOPILOT]: fluxo/disparo via wwebjs desativado — pendente migração Cloud API
                        if (midia && midia.pathFile) {
                            console.log('🖼️ Enviando com mídia:', midia.pathFile);
                            envioM = await sendZapMessageImage('disparos_1', cliente.phone, message, midia.pathFile);
                        } else {
                            envioM = await sendZapMessage('disparos_1', cliente.phone, message);
                        }

                        await saveMessageLog(campanha, {
                            cliente: `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim(),
                            phone: cliente.phone,
                            email: null,
                            message: message,
                            tipo: 'whatsapp',
                            sucesso: envioM,
                            data: moment().format('YYYY-MM-DD HH:mm:ss')
                        });

                        if (envioM) {
                            dataLog.enviosWhatsApp.sucesso++;
                            dataLog.enviosSucesso++;
                            console.log('✅ WhatsApp enviado com sucesso');
                        } else {
                            dataLog.enviosWhatsApp.erro++;
                            dataLog.enviosErro++;
                            console.log('❌ Erro ao enviar WhatsApp');
                        }
                    } catch (error) {
                        console.error('❌ Erro ao enviar WhatsApp:', error);
                        dataLog.enviosWhatsApp.erro++;
                        dataLog.enviosErro++;
                    }
                }

                // Enviar Email se configurado e cliente tiver email
                if (hasEmail && cliente.email && cliente.email.trim() !== '') {
                    try {
                        console.log(`📧 Enviando Email para: ${cliente.email}`);

                        // Obter conteúdo HTML do modelo
                        let htmlContent = modeloEmail.content?.inlinedHtml || modeloEmail.content?.html || modeloEmail.content?.content || '';
                        let subject = modeloEmail.content?.subject || 'Mensagem';

                        // Formatar conteúdo (sem remover HTML para email)
                        htmlContent = await formatContent(htmlContent, cliente, pedido, null, false);
                        subject = await formatContent(subject, cliente, pedido, null, false);

                        // Enviar email
                        await smtpData.transporter.sendMail({
                            from: smtpData.from,
                            to: cliente.email,
                            subject: subject,
                            html: htmlContent
                        });

                        await saveMessageLog(campanha, {
                            cliente: `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim(),
                            phone: null,
                            email: cliente.email,
                            message: htmlContent,
                            tipo: 'email',
                            sucesso: true,
                            data: moment().format('YYYY-MM-DD HH:mm:ss')
                        });

                        dataLog.enviosEmail.sucesso++;
                        dataLog.enviosSucesso++;
                        console.log('✅ Email enviado com sucesso');

                    } catch (error) {
                        console.error('❌ Erro ao enviar Email:', error);

                        await saveMessageLog(campanha, {
                            cliente: `${cliente.first_name || ''} ${cliente.last_name || ''}`.trim(),
                            phone: null,
                            email: cliente.email,
                            message: `Erro: ${error.message}`,
                            tipo: 'email',
                            sucesso: false,
                            data: moment().format('YYYY-MM-DD HH:mm:ss')
                        });

                        dataLog.enviosEmail.erro++;
                        dataLog.enviosErro++;
                    }
                }

                await saveCampanha(campanha, dataLog, 'Realizando disparo');

                console.log('⏱️ Intervalo da campanha:', campanha.intervalo);

                let intervaloCampanha = campanha.intervalo ? parseInt(campanha.intervalo) * 1000 : 60000;
                let intervaloCampanhaA = intervaloCampanha + Math.floor(Math.random() * 1000);

                await waitIntervaloAleatorio(intervaloCampanha, intervaloCampanhaA);
            }

            console.log(`✅ Campanha ${campanha.id} concluída!`);
            console.log(`📊 WhatsApp: ${dataLog.enviosWhatsApp.sucesso} sucesso, ${dataLog.enviosWhatsApp.erro} erros`);
            console.log(`📊 Email: ${dataLog.enviosEmail.sucesso} sucesso, ${dataLog.enviosEmail.erro} erros`);

            await saveCampanha(campanha, dataLog, "Concluído com sucesso");
        }

        console.log('✅ Todas as campanhas foram processadas!');
    }
}


async function formatContent(content, cliente, agendamento, replaceHtml = true) {

    // Definição de cliente e pedido padrão
    if (!cliente) {
        cliente = {
            cli_nome: '',
            cli_email: '',
            cli_celular: '',
            endereco: { end_cidade: '', end_estado: '' },
            ultimo_agendamento_concluido: '',
            ultimo_agendamento_cancelado: '',
            ultimo_agendamento: '',
            qtd_agendamentos_concluidos: 0,
            qtd_agendamentos_cancelados: 0,
            qtd_agendamentos: 0
        };
    }
    if (!agendamento) {
        agendamento = {
            age_data: '',
            age_horaInicio: '',
            age_dataFinal: '',
            age_horaFinal: '',
            age_id: '',
            servicos: [],
            age_valor: 0,
            profissional: '',
            observacoes: '',
            endereco: { rua: '', numero: '', complemento: '', bairro: '', cidade: '', estado: '', cep: '' },
            status: ''
        };
    }

    // Função utilitária para trim automático
    const correctValue = (value) => {
        return value != null ? value.toString().trim() : '';
    };

    // 🔧 Pré-processamento: remover espaços dentro de {{   }}
    content = content.replace(/{{\s*([\w_]+)\s*}}/g, (_, key) => `{{${key}}}`);

    // Substituição de variáveis do cliente
    content = content.replace(/{{cliente_nome}}/g, correctValue(cliente.cli_nome.split(' ')[0] || ''))
        .replace(/{{cliente_sobrenome}}/g, correctValue(cliente.cli_nome.split(' ').slice(1).join(' ') || ''))
        .replace(/{{cliente_nomecompleto}}/g, correctValue(cliente.cli_nome || ''))
        .replace(/{{cliente_email}}/g, correctValue(cliente.cli_email || ''))
        .replace(/{{cliente_celular}}/g, correctValue(cliente.cli_celular || ''))
        .replace(/{{cliente_end_cidade}}/g, correctValue(cliente.endereco?.end_cidade || ''))
        .replace(/{{cliente_end_estado}}/g, correctValue(cliente.endereco?.end_estado || ''));

    // Substituição de variáveis do agendamento
    let endereco = agendamento.endereco ?
        Array.isArray(agendamento.endereco) ?
            agendamento.endereco.length > 0 ? agendamento.endereco[0] : {}
            : agendamento.endereco
        : {};

    content = content.replace(/{{agendamento_data}}/g, agendamento.age_data ? moment(agendamento.age_data).format('DD/MM/YYYY') : '')
        .replace(/{{agendamento_hora}}/g, correctValue(agendamento.age_horaInicio || ''))
        .replace(/{{agendamento_datacompleta}}/g, agendamento.age_data && agendamento.age_horaInicio ?
            (moment(agendamento.age_data).format('DD/MM/YYYY') + ' ' +
                agendamento.age_horaInicio.split(':').map(n => n.padStart(2, '0')).join(':')) :
            moment(agendamento.age_data).format('DD/MM/YYYY'))
        .replace(/{{agendamento_data_final}}/g, agendamento.age_dataFinal ? moment(agendamento.age_dataFinal).format('DD/MM/YYYY') : '')
        .replace(/{{agendamento_hora_final}}/g, correctValue(agendamento.age_horaFinal || ''))
        .replace(/{{agendamento_numero}}/g, correctValue(agendamento.age_id || ''))
        .replace(/{{agendamento_valor}}/g, agendamento.age_valor ? parseFloat(agendamento.age_valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '')
        .replace(/{{agendamento_profissional}}/g, correctValue(agendamento.profissional || ''))
        .replace(/{{agendamento_observacoes}}/g, correctValue(agendamento.observacoes || ''))
        .replace(/{{agendamento_status}}/g, correctValue(agendamento.status || ''))
        .replace(/{{agendamento_endereco}}/g, correctValue(formatEndereco(endereco)))
        .replace(/{{agendamento_servico}}/g, agendamento.servicos && agendamento.servicos.length > 0 ? agendamento.servicos.map(s => s.ser_nome || '').join(', ') : '');

    // Variações aleatórias
    const getRandomVariation = (text) => {
        const vars = text.split('|').map(v => v.trim());
        return vars[Math.floor(Math.random() * vars.length)];
    };
    content = content.replace(/{{\s*(.*?)\s*}}/g, (m, p1) => getRandomVariation(p1));

    // Formatação HTML ↔ WhatsApp
    if (replaceHtml) {
        content = content.replace(/<p><br><\/p>/gi, '\n')
            .replace(/<\/p\s*>/gi, '\n')
            .replace(/<p[^>]*>/gi, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/<em>/gi, '_').replace(/<\/em>/gi, '_')
            .replace(/<strong>/gi, '*').replace(/<\/strong>/gi, '*')
            .replace(/<s>/gi, '~').replace(/<\/s>/gi, '~')
            .replace(/<br\s*\/?/gi, '\n')
            .replace(/<(?!br\b)(\w+)[^>]*>\s*<\/\1>/gi, '')
            .replace(/<[^>]+>/g, '');
    } else {
        content = content
            .replace(/\*(.*?)\*/g, '<strong>$1</strong>')
            .replace(/_(.*?)_/g, '<em>$1</em>')
            .replace(/~(.*?)~/g, '<s>$1</s>')
            .replace(/\n/g, '<br>');
    }

    return content;
}

const variaveisItens = [
    { title: "Nome do cliente", value: "cliente_nome", type: 'cliente', desc: "Nome do cliente (o sistema separa o nome por espaço)" },
    { title: "Sobrenome do cliente", value: "cliente_sobrenome", type: 'cliente', desc: "Sobrenome do cliente (o sistema separa o sobrenome por espaço)" },
    { title: "Nome completo do cliente", value: "cliente_nomecompleto", type: 'cliente', desc: "Nome completo do cliente" },
    { title: "Telefone do cliente", value: "cliente_telefone", type: 'cliente', desc: "Telefone do cliente" },
    { title: "E-mail do cliente", value: "cliente_email", type: 'cliente', desc: "E-mail do cliente" },
    { title: "Data último agendamento (concluído)", value: "cliente_ultimo_agendamento_concluido", type: 'cliente', desc: "Data do último agendamento concluído do cliente" },
    { title: "Data último agendamento (cancelado)", value: "cliente_ultimo_agendamento_cancelado", type: 'cliente', desc: "Data do último agendamento cancelado do cliente" },
    { title: "Data último agendamento (todos)", value: "cliente_ultimo_agendamento", type: 'cliente', desc: "Data do último agendamento do cliente" },
    { title: "Cidade do cliente", value: "cliente_cidade", type: 'cliente', desc: "Cidade do cliente (pega o primeiro endereço que foi cadastrado)" },
    { title: "Estado do cliente", value: "cliente_estado", type: 'cliente', desc: "Estado do cliente (pega o primeiro endereço que foi cadastrado)" },
    { title: "Número de agendamentos (concluídos)", value: "cliente_qtd_agendamentos_concluidos", type: 'cliente', desc: "Número total de agendamentos concluídos do cliente" },
    { title: "Número de agendamentos (cancelados)", value: "cliente_qtd_agendamentos_cancelados", type: 'cliente', desc: "Número total de agendamentos cancelados do cliente" },
    { title: "Número de agendamentos (todos)", value: "cliente_qtd_agendamentos", type: 'cliente', desc: "Número total de agendamentos do cliente" },

    { title: "Data do Agendamento", value: "agendamento_data", type: 'agendamento', desc: "Data do agendamento" },
    { title: "Hora do Agendamento", value: "agendamento_hora", type: 'agendamento', desc: "Hora do agendamento" },
    { title: "Data completa do Agendamento", value: "agendamento_datacompleta", type: 'agendamento', desc: "Data completa do agendamento (data + hora)" },
    { title: "Data final do Agendamento", value: "agendamento_data_final", type: 'agendamento', desc: "Data do término do agendamento" },
    { title: "Hora final do Agendamento", value: "agendamento_hora_final", type: 'agendamento', desc: "Hora do término do agendamento" },
    { title: "Número do Agendamento", value: "agendamento_numero", type: 'agendamento', desc: "Número do agendamento" },
    { title: "Serviços do Agendamento", value: "agendamento_servico", type: 'agendamento', desc: "Serviços do agendamento separados por vírgula" },
    { title: "Profissional do Agendamento", value: "agendamento_profissional", type: 'agendamento', desc: "Profissional do agendamento" },
    { title: "Status do Agendamento", value: "agendamento_status", type: 'agendamento', desc: "Status do agendamento" },
    { title: "Observações do Agendamento", value: "agendamento_observacoes", type: 'agendamento', desc: "Observações do agendamento" },
    { title: "Valor do Agendamento", value: "agendamento_valor", type: 'agendamento', desc: "Valor total do agendamento" },
    { title: "Endereço do Agendamento", value: "agendamento_endereco", type: 'agendamento', desc: "Endereço completo do agendamento" },

    // Variáveis adicionais de Cliente
    { title: "Celular do cliente", value: "cliente_celular", type: 'cliente', desc: "Celular do cliente (alias de telefone)" },
    { title: "CPF do cliente", value: "cliente_cpf", type: 'cliente', desc: "CPF do cliente" },
    { title: "Data de nascimento", value: "cliente_data_nascimento", type: 'cliente', desc: "Data de nascimento do cliente" },
    { title: "Bairro do cliente", value: "cliente_bairro", type: 'cliente', desc: "Bairro do cliente (primeiro endereço)" },
    { title: "Endereço do cliente", value: "cliente_endereco", type: 'cliente', desc: "Endereço completo do cliente" },
    { title: "Gênero do cliente", value: "cliente_genero", type: 'cliente', desc: "Gênero do cliente" },
    { title: "Valor total gasto", value: "cliente_valor_gasto", type: 'cliente', desc: "Valor total gasto pelo cliente" },
    { title: "Data de cadastro", value: "cliente_data_cadastro", type: 'cliente', desc: "Data de cadastro do cliente" },
    { title: "Tags do cliente", value: "cliente_tags", type: 'cliente', desc: "Tags do cliente separadas por vírgula" },
    { title: "ID do cliente", value: "cliente_id", type: 'cliente', desc: "ID único do cliente no sistema" },

    // Variáveis adicionais de Agendamento
    { title: "ID do Agendamento", value: "agendamento_id", type: 'agendamento', desc: "ID do agendamento" },
    { title: "Hora início do Agendamento", value: "agendamento_hora_inicio", type: 'agendamento', desc: "Hora de início do agendamento" },
    { title: "Hora fim do Agendamento", value: "agendamento_hora_fim", type: 'agendamento', desc: "Hora de término do agendamento" },
    { title: "Serviços do Agendamento", value: "agendamento_servicos", type: 'agendamento', desc: "Serviços do agendamento (alias)" },

    // Variáveis de Negócio (CRM)
    { title: "ID do Negócio", value: "negocio_id", type: 'negocio', desc: "ID do negócio no CRM" },
    { title: "Título do Negócio", value: "negocio_titulo", type: 'negocio', desc: "Título do negócio" },
    { title: "Valor do Negócio", value: "negocio_valor", type: 'negocio', desc: "Valor do negócio" },
    { title: "Status do Negócio", value: "negocio_status", type: 'negocio', desc: "Status atual do negócio" },
    { title: "Origem do Negócio", value: "negocio_origem", type: 'negocio', desc: "Origem/canal do negócio" },
    { title: "Etapa do Funil", value: "negocio_etapa_nome", type: 'negocio', desc: "Nome da etapa atual no funil" },

    // Variáveis do Sistema
    { title: "Data atual", value: "data_atual", type: 'sistema', desc: "Data atual do sistema (DD/MM/YYYY)" },
    { title: "Hora atual", value: "hora_atual", type: 'sistema', desc: "Hora atual do sistema (HH:mm)" },
    { title: "Dia da semana", value: "dia_semana", type: 'sistema', desc: "Dia da semana atual" },
    { title: "Mês atual", value: "mes_atual", type: 'sistema', desc: "Mês atual" },
    { title: "Ano atual", value: "ano_atual", type: 'sistema', desc: "Ano atual" },
];

const formatEndereco = (endereco) => {
    if (!endereco) return '';

    endereco = {
        end_logradouro: endereco.end_logradouro || endereco.logradouro || '',
        end_numero: endereco.end_numero || endereco.numero || '',
        end_bairro: endereco.end_bairro || endereco.bairro || '',
        end_cidade: endereco.end_cidade || endereco.cidade || '',
        end_estado: endereco.end_estado || endereco.estado || '',
        end_cep: endereco.end_cep || endereco.cep || '',
    }

    // ----------- Formato Brasileiro -----------
    const partes = [];

    let linha1 = [endereco.end_logradouro, endereco.end_numero, endereco.end_complemento]
        .filter(Boolean)
        .join(', ');
    if (linha1) partes.push(linha1);

    if (endereco.end_bairro) partes.push(endereco.end_bairro);

    let cidadeEstado = [endereco.end_cidade, endereco.end_estado]
        .filter(Boolean)
        .join('/');
    if (cidadeEstado) partes.push(cidadeEstado);

    if (endereco.end_cep) partes.push(`${endereco.end_cep}`);

    return partes.join(' - ');
};

module.exports = {
    getSegTotalUsers,
    getSegUsers,
    dispararCampanhas,
    variaveisItens,
    formatContent,
    getSMTPTransporter,
};