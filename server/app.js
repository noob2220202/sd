// HTTP(express 정적) + WebSocket(ws) 서버 조립. index.js 가 listen 하고, 테스트는 포트 0 으로 띄운다.
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { RoomManager } from './net/roomManager.js';
import { attachConnection } from './net/connection.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, '..', 'public');

export function createApp(config) {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  const rooms = new RoomManager(config);

  app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size() }));

  app.use(
    express.static(publicDir, {
      index: 'index.html',
      etag: true,
      setHeaders(res, filePath) {
        if (filePath.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
        else if (/[\\/]assets[\\/]/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
        else res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  // 방 링크 /r/CODE → SPA
  app.get('/r/:code', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  app.use((_req, res) => res.status(404).send('Not Found'));

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  wss.on('connection', (ws, req) => attachConnection(ws, req, rooms, config));

  const hb = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      try { ws.ping(); } catch { /* ignore */ }
    }
  }, config.heartbeatMs);
  hb.unref?.();

  function close() {
    clearInterval(hb);
    rooms.destroyAll();
    for (const ws of wss.clients) {
      try { ws.terminate(); } catch { /* ignore */ }
    }
    return new Promise((resolve) => {
      wss.close(() => server.close(() => resolve()));
    });
  }

  return { app, server, wss, rooms, close };
}
