// 시각 QA: public/ 을 임시 정적 서버로 띄우고, 목 모드의 모든 단계를 두 뷰포트에서 스크린샷으로 저장한다.
// 콘솔 에러/실패 요청은 "알려진 미수신 카드 이미지 7장" 을 제외하고 0건이어야 한다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, '..', '..', 'public');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const STAGES = ['lobby', 'roomlobby', 'waiting', 'open', 'bet1', 'bet2', 'select', 'showdown', 'regame', 'foldwin', 'spectator', 'paused', 'reconnect'];
const VIEWPORTS = [
  { name: 'desktop', width: 1366, height: 800 },
  { name: 'phone', width: 390, height: 844 },
];
const KNOWN_MISSING = new Set(['2y', '3g', '3t', '4y', '7y', '8y', '9t'].map((id) => `/assets/cards/${id}.svg`));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p.startsWith('/r/')) p = '/index.html';
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end('Not Found');
    return;
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch();
const problems = [];
const shots = [];
const only = process.argv.slice(2);

for (const vp of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'ko-KR' });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    if (/Failed to load resource/.test(text) && [...KNOWN_MISSING].some((k) => m.location()?.url?.includes(k))) return;
    problems.push(`[${vp.name}] console: ${text} @ ${m.location()?.url || ''}`);
  });
  page.on('pageerror', (e) => problems.push(`[${vp.name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    const u = new URL(r.url()).pathname;
    if (KNOWN_MISSING.has(u)) return;
    problems.push(`[${vp.name}] requestfailed: ${u} ${r.failure()?.errorText}`);
  });
  page.on('response', (r) => {
    if (r.status() < 400) return;
    const u = new URL(r.url()).pathname;
    if (KNOWN_MISSING.has(u)) return;
    problems.push(`[${vp.name}] http ${r.status()}: ${u}`);
  });

  for (const stage of STAGES) {
    if (only.length && !only.includes(stage)) continue;
    await page.goto(`${base}/?mock=1&stage=${stage}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => document.fonts.status === 'loaded');
    await page.waitForTimeout(stage === 'reconnect' ? 500 : 350);
    // 액션/도크 등 핵심 요소가 뷰포트 안에 있는지 검사
    const audit = await page.evaluate(() => {
      const out = [];
      const vw = innerWidth, vh = innerHeight;
      const check = (sel) => {
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          if (r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1) out.push(`${sel} out of viewport (${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)})`);
        }
      };
      check('.act');
      check('.seat-plate');
      check('.result-card');
      check('.btn-confirm');
      check('.topbar .btn, .topbar .icon-btn');
      // 좌석 플레이트끼리 겹침
      const plates = [...document.querySelectorAll('.seat-plate')].map((el) => el.getBoundingClientRect());
      for (let i = 0; i < plates.length; i++) for (let j = i + 1; j < plates.length; j++) {
        const a = plates[i], b = plates[j];
        if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) out.push(`seat plates overlap (${i},${j})`);
      }
      // 터치 타깃 44px
      for (const el of document.querySelectorAll('.act, .btn:not(.btn-xs):not(.btn-sm), .icon-btn, .tab')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.height && (r.height < 43 || r.width < 43)) out.push(`small target ${el.className.split(' ')[0]} ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
      return out;
    });
    for (const a of audit) problems.push(`[${vp.name}/${stage}] ${a}`);
    const file = path.join(OUT, `${vp.name}-${stage}.png`);
    await page.screenshot({ path: file, fullPage: false });
    shots.push(file);
    console.log('shot', path.relative(process.cwd(), file), audit.length ? `(${audit.length} layout notes)` : '');
  }
  // 모달 몇 개 (데스크톱만)
  if (vp.name === 'desktop' && !only.length) {
    for (const [name, kind] of [['credits', 'credits'], ['rules', 'rules'], ['ledger', 'ledger'], ['settings', 'settings']]) {
      await page.goto(`${base}/?mock=1&stage=${kind === 'settings' ? 'roomlobby' : 'bet2'}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      if (kind === 'credits') await page.click('.lobby-footer button:nth-of-type(2)').catch(() => {});
      if (kind === 'credits') {
        await page.goto(`${base}/?mock=1&stage=lobby`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(200);
        await page.getByRole('button', { name: '크레딧' }).click();
      } else if (kind === 'rules') await page.getByRole('button', { name: '규칙' }).click();
      else if (kind === 'ledger') await page.getByRole('button', { name: '장부' }).click();
      else await page.getByRole('button', { name: '설정', exact: true }).click();
      await page.waitForTimeout(250);
      const file = path.join(OUT, `desktop-modal-${name}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      console.log('shot', path.relative(process.cwd(), file));
    }
    // 모바일 패널 드로어
  }
  if (vp.name === 'phone' && !only.length) {
    await page.goto(`${base}/?mock=1&stage=bet2`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    await page.click('.tb-panel');
    await page.click('.tab[data-tab="chat"]');
    await page.waitForTimeout(300);
    const file = path.join(OUT, 'phone-panel-chat.png');
    await page.screenshot({ path: file });
    shots.push(file);
    console.log('shot', path.relative(process.cwd(), file));
  }
  await context.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(' -', p);
  process.exitCode = 1;
} else {
  console.log(`\nOK — ${shots.length} screenshots, no console errors / failed requests (except known-missing cards).`);
}
