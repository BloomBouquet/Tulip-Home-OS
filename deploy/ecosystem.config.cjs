const host = "127.0.0.1";
const port = process.env.TULIP_PORT || "3100";

module.exports = {
  apps: [
    {
      name: "tulip-home-os",
      cwd: __dirname + "/..",
      script: "pnpm",
      args: `--filter @tulip/web start -- --hostname ${host} --port ${port}`,
      autorestart: true,
      time: true,
      env: {
        NODE_ENV: "production"
      }
    }
  ]
};
