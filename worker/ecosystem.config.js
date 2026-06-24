module.exports = {
  apps: [
    {
      name: 'lead-worker',
      script: 'start.js',
      interpreter: 'node',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 0,         // unlimited — PM2 always restarts no matter what
      min_uptime: '30s',       // only counts as a crash if process dies within 30s of start
      restart_delay: 5000,
      exp_backoff_restart_delay: 100, // exponential backoff on repeated fast crashes
      max_memory_restart: '1G',
      node_args: '--max-old-space-size=768',
      out_file: './logs/worker-out.log',
      error_file: './logs/worker-error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
