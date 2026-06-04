module.exports = {
  apps: [
    {
      name: 'lead-worker',
      script: 'index.ts',
      interpreter: 'ts-node',
      interpreter_args: '--transpile-only -r tsconfig-paths/register',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
    },
  ],
}
