// 섯다 서버 진입점
import { config } from './config.js';
import { createApp } from './app.js';

const { server, close } = createApp(config);

server.listen(config.port, config.host, () => {
  console.log(`[seotda] listening on http://${config.host}:${config.port}`);
});

let shuttingDown = false;
function shutdown(sig) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[seotda] ${sig} received, shutting down`);
  close().then(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
