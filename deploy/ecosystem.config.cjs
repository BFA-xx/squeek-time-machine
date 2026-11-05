// pm2 start deploy/ecosystem.config.cjs   (run from the repo root, after a build)
// pm2 doesn't pick up .env edits on a plain restart, so restart with this file: pm2 startOrRestart deploy/ecosystem.config.cjs --update-env
module.exports = {
  apps: [
    {
      name: "stm-api",
      cwd: "apps/api",
      script: "dist/main.js",
      node_args: "--env-file=.env --max-old-space-size=256",
      env: { NODE_ENV: "production" },
      max_memory_restart: "320M",
      kill_timeout: 8000,
    },
    {
      // Only if the web app runs on this server instead of Vercel.
      name: "stm-web",
      cwd: "apps/web",
      script: "../../node_modules/next/dist/bin/next",
      args: "start -p 3300 -H 127.0.0.1",
      node_args: "--env-file=.env.local --max-old-space-size=256",
      env: { NODE_ENV: "production" },
      max_memory_restart: "320M",
    },
  ],
};
