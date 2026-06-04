module.exports = {
  apps: [
    {
      name: 'lead-worker',
      script: 'start.js',
      interpreter: 'node',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
