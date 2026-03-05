/**
 * 🔄 SYNC DB SCHEMA - Sincronização de Schema entre Produção e Desenvolvimento
 *
 * Compara a estrutura (tabelas, colunas, tipos, índices) do banco de PRODUÇÃO
 * com o banco de DESENVOLVIMENTO e gera/executa os ALTERs necessários para
 * que o DEV fique com a mesma estrutura do PROD.
 *
 * DIREÇÃO PADRÃO: DESENVOLVIMENTO → PRODUÇÃO (DEV é a referência)
 *
 * Uso:
 *   node src/scripts/sync-db-schema.js              # Dry-run: mostra diferenças DEV → PROD
 *   node src/scripts/sync-db-schema.js --execute    # Executa as alterações no PROD para ficar igual ao DEV
 *   node src/scripts/sync-db-schema.js --reverse    # Dry-run: mostra diferenças PROD → DEV
 *   node src/scripts/sync-db-schema.js --reverse --execute  # Executa as alterações no DEV para ficar igual ao PROD
 *
 * Segurança:
 *   - NUNCA deleta tabelas ou colunas automaticamente (apenas reporta)
 *   - NUNCA altera dados, apenas estrutura (DDL)
 *   - Modo dry-run por padrão
 *   - Pede confirmação antes de executar
 */

const mysql = require('mysql');
const util = require('util');
const readline = require('readline');

// ── Configuração dos bancos ──────────────────────────────────────────────────
const DB_CONFIG = {
  host: '127.0.0.1',
  port: 3306,
  user: 'dboregonsys_user',
  password: 'DB@OregonSys93219',
  charset: 'utf8mb4',
};

const PROD_DB = 'newdboregon2';
const DEV_DB = 'DEVdboregonsys';

// Direção padrão: DEV → PROD (dev é a referência)

// ── Helpers ──────────────────────────────────────────────────────────────────

function createConnection(database) {
  const conn = mysql.createConnection({ ...DB_CONFIG, database });
  conn.queryAsync = util.promisify(conn.query).bind(conn);
  return conn;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── Funções de leitura de schema ─────────────────────────────────────────────

/**
 * Busca todas as tabelas de um banco
 */
async function getTables(conn, dbName) {
  const rows = await conn.queryAsync(
    'SELECT TABLE_NAME, ENGINE, TABLE_COLLATION FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = "BASE TABLE" ORDER BY TABLE_NAME',
    [dbName]
  );
  return rows;
}

/**
 * Busca todas as colunas de uma tabela
 */
async function getColumns(conn, dbName, tableName) {
  const rows = await conn.queryAsync(
    `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA, ORDINAL_POSITION, COLUMN_KEY, CHARACTER_SET_NAME, COLLATION_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [dbName, tableName]
  );
  return rows;
}

/**
 * Busca todos os índices de uma tabela
 */
async function getIndexes(conn, dbName, tableName) {
  const rows = await conn.queryAsync(
    `SELECT INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) as COLUMNS, INDEX_TYPE
     FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
     GROUP BY INDEX_NAME, NON_UNIQUE, INDEX_TYPE
     ORDER BY INDEX_NAME`,
    [dbName, tableName]
  );
  return rows;
}

// ── Comparação e geração de SQL ──────────────────────────────────────────────

/**
 * Compara schemas e retorna lista de alterações
 */
async function compareSchemas(sourceConn, targetConn, sourceDB, targetDB) {
  const changes = [];
  const warnings = [];

  // 1. Buscar tabelas de ambos os bancos
  const sourceTables = await getTables(sourceConn, sourceDB);
  const targetTables = await getTables(targetConn, targetDB);

  const sourceTableNames = new Set(sourceTables.map(t => t.TABLE_NAME));
  const targetTableNames = new Set(targetTables.map(t => t.TABLE_NAME));

  // 2. Tabelas que existem no source mas não no target → CREATE TABLE
  for (const table of sourceTables) {
    if (!targetTableNames.has(table.TABLE_NAME)) {
      // Gerar CREATE TABLE a partir do source
      const createResult = await sourceConn.queryAsync(`SHOW CREATE TABLE \`${table.TABLE_NAME}\``);
      let createSQL = createResult[0]['Create Table'];

      changes.push({
        type: 'CREATE_TABLE',
        table: table.TABLE_NAME,
        sql: createSQL + ';',
      });
    }
  }

  // 3. Tabelas que existem no target mas não no source → AVISO (nunca deleta)
  for (const table of targetTables) {
    if (!sourceTableNames.has(table.TABLE_NAME)) {
      warnings.push(`⚠️  Tabela "${table.TABLE_NAME}" existe apenas no ${targetDB} (não será removida)`);
    }
  }

  // 4. Tabelas em comum → comparar colunas e índices
  for (const table of sourceTables) {
    if (!targetTableNames.has(table.TABLE_NAME)) continue;

    const tableName = table.TABLE_NAME;

    // 4a. Comparar colunas
    const sourceCols = await getColumns(sourceConn, sourceDB, tableName);
    const targetCols = await getColumns(targetConn, targetDB, tableName);

    const sourceColMap = new Map(sourceCols.map(c => [c.COLUMN_NAME, c]));
    const targetColMap = new Map(targetCols.map(c => [c.COLUMN_NAME, c]));

    // Colunas novas no source → ADD COLUMN
    for (const [colName, srcCol] of sourceColMap) {
      if (!targetColMap.has(colName)) {
        // Determinar posição (AFTER coluna anterior)
        const prevCol = sourceCols.find(c => c.ORDINAL_POSITION === srcCol.ORDINAL_POSITION - 1);
        const afterClause = prevCol ? ` AFTER \`${prevCol.COLUMN_NAME}\`` : ' FIRST';

        let colDef = `\`${colName}\` ${srcCol.COLUMN_TYPE}`;
        colDef += srcCol.IS_NULLABLE === 'YES' ? ' NULL' : ' NOT NULL';
        if (srcCol.COLUMN_DEFAULT !== null && srcCol.COLUMN_DEFAULT !== undefined) {
          // Tratar defaults especiais
          if (srcCol.COLUMN_DEFAULT === 'CURRENT_TIMESTAMP' || srcCol.EXTRA.includes('DEFAULT_GENERATED')) {
            colDef += ` DEFAULT ${srcCol.COLUMN_DEFAULT}`;
          } else {
            colDef += ` DEFAULT '${srcCol.COLUMN_DEFAULT}'`;
          }
        }
        if (srcCol.EXTRA && !srcCol.EXTRA.includes('DEFAULT_GENERATED')) {
          colDef += ` ${srcCol.EXTRA}`;
        }

        changes.push({
          type: 'ADD_COLUMN',
          table: tableName,
          column: colName,
          sql: `ALTER TABLE \`${tableName}\` ADD COLUMN ${colDef}${afterClause};`,
        });
      }
    }

    // Colunas que existem no target mas não no source → AVISO
    for (const [colName] of targetColMap) {
      if (!sourceColMap.has(colName)) {
        warnings.push(`⚠️  Coluna "${tableName}.${colName}" existe apenas no ${targetDB} (não será removida)`);
      }
    }

    // Colunas em comum → comparar tipo, nullable, default
    for (const [colName, srcCol] of sourceColMap) {
      const tgtCol = targetColMap.get(colName);
      if (!tgtCol) continue;

      const diffs = [];
      if (srcCol.COLUMN_TYPE !== tgtCol.COLUMN_TYPE) {
        diffs.push(`tipo: ${tgtCol.COLUMN_TYPE} → ${srcCol.COLUMN_TYPE}`);
      }
      if (srcCol.IS_NULLABLE !== tgtCol.IS_NULLABLE) {
        diffs.push(`nullable: ${tgtCol.IS_NULLABLE} → ${srcCol.IS_NULLABLE}`);
      }
      // Comparar defaults (normalizar null vs undefined)
      const srcDefault = srcCol.COLUMN_DEFAULT === undefined ? null : srcCol.COLUMN_DEFAULT;
      const tgtDefault = tgtCol.COLUMN_DEFAULT === undefined ? null : tgtCol.COLUMN_DEFAULT;
      if (String(srcDefault) !== String(tgtDefault)) {
        diffs.push(`default: ${tgtDefault} → ${srcDefault}`);
      }

      if (diffs.length > 0) {
        let colDef = `\`${colName}\` ${srcCol.COLUMN_TYPE}`;
        colDef += srcCol.IS_NULLABLE === 'YES' ? ' NULL' : ' NOT NULL';
        if (srcCol.COLUMN_DEFAULT !== null && srcCol.COLUMN_DEFAULT !== undefined) {
          if (srcCol.COLUMN_DEFAULT === 'CURRENT_TIMESTAMP' || (srcCol.EXTRA && srcCol.EXTRA.includes('DEFAULT_GENERATED'))) {
            colDef += ` DEFAULT ${srcCol.COLUMN_DEFAULT}`;
          } else {
            colDef += ` DEFAULT '${srcCol.COLUMN_DEFAULT}'`;
          }
        }
        if (srcCol.EXTRA && !srcCol.EXTRA.includes('DEFAULT_GENERATED')) {
          colDef += ` ${srcCol.EXTRA}`;
        }

        changes.push({
          type: 'MODIFY_COLUMN',
          table: tableName,
          column: colName,
          details: diffs.join(', '),
          sql: `ALTER TABLE \`${tableName}\` MODIFY COLUMN ${colDef};`,
        });
      }
    }

    // 4b. Comparar índices
    const sourceIdx = await getIndexes(sourceConn, sourceDB, tableName);
    const targetIdx = await getIndexes(targetConn, targetDB, tableName);

    const sourceIdxMap = new Map(sourceIdx.map(i => [i.INDEX_NAME, i]));
    const targetIdxMap = new Map(targetIdx.map(i => [i.INDEX_NAME, i]));

    for (const [idxName, srcIdx] of sourceIdxMap) {
      if (idxName === 'PRIMARY') continue; // Primary keys tratadas separadamente

      const tgtIdx = targetIdxMap.get(idxName);

      if (!tgtIdx) {
        // Índice não existe no target → criar
        const unique = srcIdx.NON_UNIQUE === 0 ? 'UNIQUE ' : '';
        const columns = srcIdx.COLUMNS.split(',').map(c => `\`${c.trim()}\``).join(', ');

        changes.push({
          type: 'ADD_INDEX',
          table: tableName,
          index: idxName,
          sql: `ALTER TABLE \`${tableName}\` ADD ${unique}INDEX \`${idxName}\` (${columns});`,
        });
      } else if (srcIdx.COLUMNS !== tgtIdx.COLUMNS) {
        // Índice diferente → recriar
        const unique = srcIdx.NON_UNIQUE === 0 ? 'UNIQUE ' : '';
        const columns = srcIdx.COLUMNS.split(',').map(c => `\`${c.trim()}\``).join(', ');

        changes.push({
          type: 'MODIFY_INDEX',
          table: tableName,
          index: idxName,
          sql: `ALTER TABLE \`${tableName}\` DROP INDEX \`${idxName}\`, ADD ${unique}INDEX \`${idxName}\` (${columns});`,
        });
      }
    }

    // Índices que existem no target mas não no source → AVISO
    for (const [idxName] of targetIdxMap) {
      if (idxName === 'PRIMARY') continue;
      if (!sourceIdxMap.has(idxName)) {
        warnings.push(`⚠️  Índice "${tableName}.${idxName}" existe apenas no ${targetDB} (não será removido)`);
      }
    }
  }

  return { changes, warnings };
}

// ── Execução principal ───────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const executeMode = args.includes('--execute');
  const reverseMode = args.includes('--reverse');

  // Padrão: DEV → PROD | Reverse: PROD → DEV
  const sourceDB = reverseMode ? PROD_DB : DEV_DB;
  const targetDB = reverseMode ? DEV_DB : PROD_DB;

  console.log('');
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║           🔄 SYNC DB SCHEMA - Sincronização                ║');
  console.log('╠══════════════════════════════════════════════════════════════╣');
  console.log(`║  Source (origem):  ${sourceDB.padEnd(40)}║`);
  console.log(`║  Target (destino): ${targetDB.padEnd(40)}║`);
  console.log(`║  Modo: ${(executeMode ? '🔴 EXECUTAR ALTERAÇÕES' : '🟢 DRY-RUN (apenas visualizar)').padEnd(51)}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Aviso extra ao alterar PRODUÇÃO
  if (!reverseMode && executeMode) {
    console.log('⚠️  ATENÇÃO: Você está prestes a alterar o banco de PRODUÇÃO!\n');
  }

  const sourceConn = createConnection(sourceDB);
  const targetConn = createConnection(targetDB);

  try {
    console.log('🔍 Comparando schemas...\n');
    const { changes, warnings } = await compareSchemas(sourceConn, targetConn, sourceDB, targetDB);

    // Mostrar avisos
    if (warnings.length > 0) {
      console.log('── Avisos ──────────────────────────────────────────────────────');
      warnings.forEach(w => console.log(w));
      console.log('');
    }

    // Mostrar alterações
    if (changes.length === 0) {
      console.log('✅ Schemas estão sincronizados! Nenhuma alteração necessária.\n');
      return;
    }

    // Agrupar por tipo
    const createTables = changes.filter(c => c.type === 'CREATE_TABLE');
    const addColumns = changes.filter(c => c.type === 'ADD_COLUMN');
    const modifyColumns = changes.filter(c => c.type === 'MODIFY_COLUMN');
    const addIndexes = changes.filter(c => c.type === 'ADD_INDEX');
    const modifyIndexes = changes.filter(c => c.type === 'MODIFY_INDEX');

    console.log('── Alterações necessárias ──────────────────────────────────────');
    console.log(`  📋 ${createTables.length} tabelas novas`);
    console.log(`  ➕ ${addColumns.length} colunas novas`);
    console.log(`  🔧 ${modifyColumns.length} colunas modificadas`);
    console.log(`  📇 ${addIndexes.length} índices novos`);
    console.log(`  🔄 ${modifyIndexes.length} índices modificados`);
    console.log(`  📊 Total: ${changes.length} alterações\n`);

    // Detalhar cada alteração
    if (createTables.length > 0) {
      console.log('── TABELAS NOVAS ───────────────────────────────────────────────');
      createTables.forEach(c => {
        console.log(`\n  📋 CREATE TABLE ${c.table}`);
        console.log(`  ${c.sql.substring(0, 200)}...`);
      });
      console.log('');
    }

    if (addColumns.length > 0) {
      console.log('── COLUNAS NOVAS ───────────────────────────────────────────────');
      addColumns.forEach(c => {
        console.log(`  ➕ ${c.table}.${c.column}`);
        console.log(`     ${c.sql}`);
      });
      console.log('');
    }

    if (modifyColumns.length > 0) {
      console.log('── COLUNAS MODIFICADAS ─────────────────────────────────────────');
      modifyColumns.forEach(c => {
        console.log(`  🔧 ${c.table}.${c.column} (${c.details})`);
        console.log(`     ${c.sql}`);
      });
      console.log('');
    }

    if (addIndexes.length > 0) {
      console.log('── ÍNDICES NOVOS ───────────────────────────────────────────────');
      addIndexes.forEach(c => {
        console.log(`  📇 ${c.table}.${c.index}`);
        console.log(`     ${c.sql}`);
      });
      console.log('');
    }

    if (modifyIndexes.length > 0) {
      console.log('── ÍNDICES MODIFICADOS ─────────────────────────────────────────');
      modifyIndexes.forEach(c => {
        console.log(`  🔄 ${c.table}.${c.index}`);
        console.log(`     ${c.sql}`);
      });
      console.log('');
    }

    // Se dry-run, mostrar SQL completo e sair
    if (!executeMode) {
      console.log('── SQL COMPLETO (copie e cole, ou use --execute) ─────────────');
      console.log('');
      changes.forEach(c => console.log(c.sql));
      console.log('');
      console.log(`💡 Para executar: node src/scripts/sync-db-schema.js${reverseMode ? ' --reverse' : ''} --execute`);
      console.log('');
      return;
    }

    // Modo execute → pedir confirmação
    console.log('');
    const answer = await ask(`⚠️  Deseja aplicar ${changes.length} alterações no banco "${targetDB}"? (sim/nao): `);

    if (answer !== 'sim' && answer !== 's') {
      console.log('\n❌ Operação cancelada pelo usuário.\n');
      return;
    }

    console.log('\n🔄 Executando alterações...\n');

    let success = 0;
    let errors = 0;

    for (const change of changes) {
      try {
        await targetConn.queryAsync(change.sql);
        console.log(`  ✅ ${change.type}: ${change.table}${change.column ? '.' + change.column : ''}${change.index ? '.' + change.index : ''}`);
        success++;
      } catch (err) {
        // Ignorar erros de "já existe" (idempotência)
        if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_TABLE_EXISTS_ERROR' || err.code === 'ER_DUP_KEYNAME') {
          console.log(`  ⏭️  ${change.type}: ${change.table}${change.column ? '.' + change.column : ''} (já existe, ignorado)`);
          success++;
        } else {
          console.log(`  ❌ ${change.type}: ${change.table}${change.column ? '.' + change.column : ''}`);
          console.log(`     Erro: ${err.message}`);
          errors++;
        }
      }
    }

    console.log(`\n📊 Resultado: ${success} ok, ${errors} erros de ${changes.length} total\n`);

  } finally {
    sourceConn.end();
    targetConn.end();
  }
}

main().catch(err => {
  console.error('❌ Erro fatal:', err.message);
  process.exit(1);
});
