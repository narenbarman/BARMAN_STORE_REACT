module.exports = {
  apps: [
    {
      name: 'barman-api',
      script: 'server/index.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        DB_PATH: 'server/barman-store.db',
        BACKUP_DIR: 'server/backups',
        FRONTEND_ORIGIN: 'http://127.0.0.1,http://localhost,http://192.168.29.18',
      },
    },
  ],
};
