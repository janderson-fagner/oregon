module.exports = {
  apps: [
      {
          name: 'oregon-node-dev',
          script: 'index.js', // substitua pelo seu script de entrada
          watch: true,
          time: true,
          log_file: 'logs/pm2-g.log',
          combine_logs: true,
          ignore_watch: [
              'node_modules',
              'files',
              'uploads',
              'midias',
              'logs',
              'session-zap',
              '.wwebjs_auth',
              '.wwebjs_cache',
              '*.log'
          ],
          watch_options: {
              followSymlinks: false,
          },
          env: {
              NODE_ENV: 'dev' // Definindo a variável de ambiente NODE_ENV
          }
      }
  ]
};
