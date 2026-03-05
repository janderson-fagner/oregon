const mysql = require('mysql');
const util = require('util');
require('dotenv').config();

// Configuração do pool
const pool = mysql.createPool({
  connectionLimit: 10,
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  charset: 'utf8mb4',
});

// Testa conexão ao iniciar
pool.query('SELECT 1', (err, results) => {
  if (err) {
    console.error('Erro ao conectar ao banco de dados:', err.message);
  } else {
    console.log(`✅ Conexão com o banco de dados ${process.env.DB_NAME} estabelecida com sucesso.`);
  }
});

// Transforma o pool.query em async/await
const executeQuery = util.promisify(pool.query).bind(pool);

/**
 * Executa query com tratamento de erro e reconexão em caso de ER_LOCK_WAIT_TIMEOUT.
 */
async function dbQuery(query, params, retryCount = 3) {
  try {
    return await executeQuery(query, params);
  } catch (error) {
    if (error.code === 'ER_LOCK_WAIT_TIMEOUT' && retryCount > 0) {
      console.warn('Timeout de bloqueio, tentando novamente...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      return dbQuery(query, params, retryCount - 1);
    } else {
      console.error('Erro na query:', error);
      throw error;
    }
  }
}

function empresaWhere(empresa_id) {
  if (empresa_id) return { sql: 'empresa_id = ?', params: [empresa_id] };
  return { sql: 'empresa_id IS NULL', params: [] };
}

module.exports = dbQuery;
module.exports.empresaWhere = empresaWhere;
