// E2E: 실제 서버(createApp, 포트 0) + 실제 클라이언트를 Chromium 3개(격리 컨텍스트)로 구동해
// 방 만들기 → 초대 링크 입장 → 게임 시작 → 한 판 전체(1구/2구 베팅, 최종 패 선택, 결과) → 다음 판 자동 시작
// → 채팅 / 장부 / 초대 링크 복사 / 새로고침 복구 / 일시정지·재개 / 나가기 를 모두 UI 클릭만으로 검증한다.
// 실패 시 메시지와 함께 종료 코드 1. 브라우저 콘솔 에러·실패한 네트워크 요청은 0건이어야 한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createApp } from '../../server/app.js';
import { config } from '../../server/config.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^failure-/.test(f)) fs.rmSync(path.join(OUT, f)); // 이전 실패 스크린샷 정리

const T0 = Date.now();
const elapsed = () => `${((Date.now() - T0) / 1000).toFixed(1)}s`;
const log = (...a) => console.log(`[${elapsed()}]`, ...a);
const problems = [];

class Fail extends Error {}
function assert(cond, msg) {
  if (!cond) throw new Fail(msg);
}
function eq(a, b, msg) {
  if (a !== b) throw new Fail(`${msg}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 조건이 참이 될 때까지 폴링 */
async function until(fn, msg, timeout = 15_000, step = 100) {
  const end = Date.now() + timeout;
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() > end) throw new Fail(`timeout (${timeout}ms): ${msg}`);
    await sleep(step);
  }
}

// ---- 서버 ---------------------------------------------------------------------------
const app = createApp({ ...config, heartbeatMs: 60_000 });
await new Promise((r) => app.server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${app.server.address().port}`;
log('server', base);

// ---- 브라우저 -----------------------------------------------------------------------
const browser = await chromium.launch();
const pages = {};
async function openPage(name) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'ko-KR' });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`[${name}] console.error: ${m.text()} @ ${m.location()?.url || ''}:${m.location()?.lineNumber ?? ''}`);
  });
  page.on('pageerror', (e) => problems.push(`[${name}] pageerror: ${e.message}`));
  page.on('requestfailed', (r) => problems.push(`[${name}] requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('response', (r) => {
    if (r.status() >= 400) problems.push(`[${name}] http ${r.status()}: ${r.url()}`);
  });
  pages[name] = page;
  return page;
}

let shotNo = 0;
async function shot(page, label) {
  shotNo += 1;
  const file = path.join(OUT, `${String(shotNo).padStart(2, '0')}-${label}.png`);
  await page.screenshot({ path: file });
  log('shot', path.relative(process.cwd(), file));
}

const tid = (id) => `[data-testid="${id}"]`;
const names = { A: '철수', B: '영희', C: '민수' };

/** 각 페이지의 도크 상태 {handNo, stage, mine} */
async function dockState(page) {
  return page.evaluate(() => {
    const d = document.querySelector('[data-testid="dock"]');
    if (!d) return null;
    return { handNo: Number(d.dataset.handNo), stage: d.dataset.stage, mine: d.dataset.mine === '1' };
  });
}

/** 지금 베팅 차례인(활성화된 액션 버튼이 있는) 페이지 이름 */
async function whoseTurn(stage) {
  for (const [name, page] of Object.entries(pages)) {
    const ok = await page.evaluate((st) => {
      const d = document.querySelector('[data-testid="dock"]');
      if (!d || d.dataset.mine !== '1' || (st && d.dataset.stage !== st)) return false;
      return Boolean(d.querySelector('[data-testid^="action-"]:not([disabled])'));
    }, stage || null);
    if (ok) return name;
  }
  return null;
}

/** 차례인 사람이 액션 버튼을 클릭. 이전 차례 페이지의 액션바가 사라질 때까지 기다린 뒤 다음 차례를 찾는다. */
async function act(kind, stage) {
  const who = await until(() => whoseTurn(stage), `someone's turn in ${stage}`);
  const page = pages[who];
  const btn = page.locator(tid(`action-${kind}`));
  assert((await btn.count()) === 1, `${who}: action button ${kind} should be present in ${stage}`);
  assert(await btn.isEnabled(), `${who}: action button ${kind} should be enabled`);
  await btn.click();
  // 서버 응답(state) 이 와서 내 액션바가 사라질 때까지
  await until(async () => !(await page.evaluate(() => document.querySelector('[data-testid="dock"]')?.dataset.mine === '1')) || (await dockState(page))?.stage !== stage, `${who}'s action bar closes after ${kind}`, 5000);
  log(`${who}(${names[who]}) → ${kind}`);
  return who;
}

/** 모든 플레이어가 좌석의 내 카드 2장을 클릭해 최종 패를 확정 */
async function selectAll(handNo) {
  for (const [name, page] of Object.entries(pages)) {
    const needs = await until(async () => {
      const st = await dockState(page);
      if (!st || st.handNo !== handNo) return null;
      if (st.stage !== 'select') return st.stage === 'done' ? { skip: true } : null;
      const hasConfirm = (await page.locator(tid('select-confirm')).count()) === 1;
      return { skip: !hasConfirm };
    }, `${name} reaches select stage`);
    if (needs.skip) continue; // 다이했거나 이미 완료
    const cards = page.locator('.seat-me button.card-selectable[data-idx]');
    eq(await cards.count(), 3, `${name}: should have 3 selectable cards`);
    await page.locator('.seat-me button.card-selectable[data-idx="0"]').click();
    await page.locator('.seat-me button.card-selectable[data-idx="2"]').click();
    const confirm = page.locator(tid('select-confirm'));
    await until(() => confirm.isEnabled(), `${name}: confirm enabled after picking 2 cards`, 3000);
    const label = await confirm.textContent();
    assert(/확정/.test(label), `${name}: confirm button shows 족보 preview (got "${label}")`);
    if (name === 'A') await shot(page, 'select');
    await confirm.click();
    await until(async () => (await page.locator(tid('select-confirm')).count()) === 0, `${name}: select bar closes after confirm`, 5000);
    log(`${name}(${names[name]}) selected: ${label.trim()}`);
  }
}

async function main() {
  const A = await openPage('A');
  const B = await openPage('B');
  const C = await openPage('C');

  // ---- 1. A: 로비 → 방 만들기 -----------------------------------------------------------
  await A.goto(`${base}/`, { waitUntil: 'networkidle' });
  await A.fill(tid('create-nickname'), names.A);
  const create = A.locator('.lobby-create');
  await create.locator('input[name=startChips]').fill('100000');
  await create.locator('input[name=base]').fill('1000');
  await create.locator('select[name=turnSeconds]').selectOption('30');
  await shot(A, 'lobby');
  await A.click(tid('create-submit'));
  const code = await until(async () => {
    const el = A.locator(tid('room-code'));
    if ((await el.count()) !== 1) return null;
    const t = (await el.textContent()).trim();
    return /^[A-Z0-9]{6}$/.test(t) ? t : null;
  }, 'room code visible after create');
  log('room code', code);
  assert(new URL(A.url()).pathname === `/r/${code}`, `URL should become /r/CODE (got ${A.url()})`);
  eq(await A.locator(tid('start-game')).count(), 1, 'host sees 게임 시작 button');
  assert(await A.locator(tid('start-game')).isDisabled(), '게임 시작 disabled with only 1 player');

  // ---- 2. B, C: /r/CODE 로 입장 (코드 자동 입력) -----------------------------------------
  for (const [name, page] of [['B', B], ['C', C]]) {
    await page.goto(`${base}/r/${code}`, { waitUntil: 'networkidle' });
    eq(await page.inputValue(tid('join-code')), code, `${name}: join code prefilled from URL`);
    await page.fill(tid('join-nickname'), names[name]);
    await page.click(tid('join-submit'));
    await until(async () => (await page.locator(tid('room-code')).count()) === 1 && (await page.locator(tid('room-code')).textContent()).trim() === code, `${name} enters room`);
    assert(/^\/r\/[A-Z0-9]{6}$/.test(new URL(page.url()).pathname), `${name}: URL is /r/CODE`);
  }
  await until(async () => (await A.locator('.seat:not(.seat-empty)').count()) === 3, 'A sees 3 seated players');
  for (const [name, page] of Object.entries(pages)) {
    const nick = (await page.locator('.seat-me .nick').textContent()).trim();
    eq(nick, names[name], `${name}: own seat shows own nickname`);
  }
  await shot(A, 'room-lobby');

  // 설정이 방에 반영되었는지(시작 칩 100,000 → 좌석 칩 표기)
  const chipsText = await A.locator('.seat-me .chips-full').textContent();
  eq(chipsText.replace(/[^0-9]/g, ''), '100000', 'start chips 100,000 applied');

  // ---- 3. 게임 시작 → 한 판 전체 ------------------------------------------------------
  await until(() => A.locator(tid('start-game')).isEnabled(), '게임 시작 enabled with 3 players');
  await A.click(tid('start-game'));
  await until(async () => (await dockState(A))?.stage === 'bet1', 'hand 1 bet1 starts');
  eq((await dockState(A)).handNo, 1, 'first hand number');
  // 선 = 방장 → 첫 차례는 A
  eq(await until(() => whoseTurn('bet1'), 'first turn'), 'A', 'host (dealer) acts first');
  // 타이머 표시(턴 제한 30초)
  assert((await A.locator('.seat-turn .ring-fg[data-deadline]').count()) === 1, 'timer ring shown on the turn seat');
  await shot(A, 'bet1-host-turn');
  await shot(B, 'bet1-other-view');

  // 1구: 체크 / 삥 / 콜 / 콜
  await act('check', 'bet1');
  await act('bbing', 'bet1');
  await act('call', 'bet1');
  await act('call', 'bet1');
  await until(async () => (await dockState(A))?.stage === 'bet2', 'bet2 starts');
  // 3번째 카드를 받았는지 (내 카드 3장)
  eq(await A.locator('.seat-me .card').count(), 3, 'A has 3 cards in bet2');
  await shot(A, 'bet2');
  // 2구: 체크 / 삥 / 콜 / 콜
  await act('check', 'bet2');
  await act('bbing', 'bet2');
  await act('call', 'bet2');
  await act('call', 'bet2');
  await until(async () => (await dockState(A))?.stage === 'select', 'select stage');

  // 최종 패 선택
  await selectAll(1);

  // 결과 배너
  const resultText = await until(async () => {
    const el = A.locator('.result-layer .result-card');
    return (await el.count()) === 1 ? (await el.textContent()).replace(/\s+/g, ' ') : null;
  }, 'result banner');
  assert(/승부|승리|기권승|재경기/.test(resultText), `result banner text should include 승부/승리/기권승/재경기 (got "${resultText}")`);
  const logText = (await A.locator(tid('log-list')).textContent()).replace(/\s+/g, ' ');
  assert(/승리|기권승|재경기/.test(logText), `game log should record 승리/기권승/재경기 (got "${logText.slice(-200)}")`);
  log('result:', resultText.slice(0, 120));
  await shot(A, 'result');

  // 다음 판 자동 시작
  await until(async () => (await dockState(A))?.handNo === 2 && (await dockState(A))?.stage === 'bet1', 'hand 2 starts automatically', 20_000);
  log('hand 2 started');
  // 로그 패널(A) 에 판 시작 기록
  assert(/2번째 판/.test(await A.locator(tid('log-list')).textContent()), 'log mentions 2번째 판');

  // ---- 4. 채팅: B → A ----------------------------------------------------------------
  await B.click(tid('tab-chat'));
  await B.fill(tid('chat-input'), '안녕하세요 e2e');
  await B.click(tid('chat-send'));
  await A.click(tid('tab-chat'));
  await until(async () => /안녕하세요 e2e/.test(await A.locator(tid('chat-list')).textContent()), 'A sees chat from B');
  const fromText = await A.locator(`${tid('chat-list')} .chat-from`).last().textContent();
  eq(fromText.trim(), names.B, 'chat author is B');
  eq(await B.inputValue(tid('chat-input')), '', 'chat input cleared after send');
  await shot(A, 'chat');

  // ---- 5. 장부 모달 -------------------------------------------------------------------
  await A.click(tid('ledger-open'));
  await until(async () => (await A.locator(tid('modal-ledger')).count()) === 1, 'ledger modal opens');
  const ledgerText = await A.locator(tid('modal-ledger')).textContent();
  for (const n of Object.values(names)) assert(ledgerText.includes(n), `ledger lists ${n}`);
  await shot(A, 'ledger');
  await A.click(tid('modal-close'));
  await until(async () => (await A.locator(tid('modal-ledger')).count()) === 0, 'ledger modal closes');

  // ---- 6. 초대 링크 복사 버튼 ---------------------------------------------------------
  eq(await A.locator(tid('invite-copy')).count(), 1, '초대 링크 복사 button exists');
  await A.click(tid('invite-copy'));
  await until(async () => /초대 링크/.test(await A.locator('#toast-root').textContent()), 'copy toast appears');
  const clip = await A.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (clip) eq(clip, `${base}/r/${code}`, 'clipboard holds invite URL');

  // ---- 7. B 새로고침 → 같은 자리/카드 복구 ------------------------------------------------
  // (1판이 동점 재경기였다면 2판 참가자가 2명일 수 있으므로, 카드를 들고 있는 쪽(B 우선, 아니면 C)을 새로고침한다)
  const hasCards = async (p) => (await p.locator('.seat-me .card-front img').count()) >= 2;
  const R = (await hasCards(B)) ? B : C;
  const rName = R === B ? 'B' : 'C';
  const before = await R.evaluate(() => ({
    id: document.querySelector('.seat-me')?.dataset.id,
    nick: document.querySelector('.seat-me .nick')?.textContent,
    chips: document.querySelector('.seat-me .chips-full')?.textContent,
    cards: [...document.querySelectorAll('.seat-me .card-front img')].map((i) => new URL(i.src).pathname),
    token: localStorage.getItem('seotda.token'),
  }));
  assert(before.id && before.cards.length >= 2, `${rName} has cards before reload (${JSON.stringify(before)})`);
  await R.reload({ waitUntil: 'networkidle' });
  await until(async () => (await R.locator('.seat-me .card-front img').count()) === before.cards.length, `${rName} restored after reload`);
  const after = await R.evaluate(() => ({
    id: document.querySelector('.seat-me')?.dataset.id,
    nick: document.querySelector('.seat-me .nick')?.textContent,
    chips: document.querySelector('.seat-me .chips-full')?.textContent,
    cards: [...document.querySelectorAll('.seat-me .card-front img')].map((i) => new URL(i.src).pathname),
    token: localStorage.getItem('seotda.token'),
  }));
  eq(after.token, before.token, 'token kept in localStorage');
  eq(after.id, before.id, 'same player id after reload');
  eq(after.nick, before.nick, 'same nickname (no (2) suffix) after reload');
  eq(after.chips, before.chips, 'same chips after reload');
  eq(JSON.stringify(after.cards), JSON.stringify(before.cards), 'same cards after reload');
  eq(await R.locator('.seat:not(.seat-empty)').count(), 3, `${rName} still sees 3 players`);
  // 다른 사람 시점에서도 다시 접속 상태
  await until(async () => (await A.locator(`.seat[data-id="${before.id}"] .conn-dot.on`).count()) === 1, `A sees ${rName} connected again`);
  // 새로고침한 페이지에도 다시 콘솔/네트워크 감시가 유지되는지(페이지 객체는 같음) — 바로 채팅 탭을 열어 기존 채팅이 복구되었는지 확인
  await R.click(tid('tab-chat'));
  assert(/안녕하세요 e2e/.test(await R.locator(tid('chat-list')).textContent()), `${rName} sees chat history after reload`);
  await shot(R, 'after-reload');

  // ---- 8. 일시정지 → 이번 판은 끝까지 → 다음 판 없음 → 재개 ----------------------------------
  await A.click(tid('pause-game'));
  await until(async () => (await A.locator(tid('resume-game')).count()) === 1, 'resume button appears after pause');
  // 2번째 판을 빨리 끝낸다: 첫 차례 삥, 나머지 전원 다이 → 기권승 (참가 인원과 무관하게 동작)
  const stage2 = (await dockState(A)).stage;
  assert(stage2 === 'bet1' || stage2 === 'bet2', `hand 2 still betting (${stage2})`);
  let fold = null;
  for (let i = 0; i < 6 && !fold; i++) {
    const who = await until(async () => (await whoseTurn()) || ((await A.locator('.result-layer .result-card').count()) === 1 ? 'done' : null), 'next turn or fold result');
    if (who !== 'done') {
      const canBbing = (await pages[who].locator(`${tid('action-bbing')}:not([disabled])`).count()) === 1;
      await act(canBbing ? 'bbing' : 'die', (await dockState(pages[who])).stage);
    }
    const el = A.locator('.result-layer .result-card');
    if ((await el.count()) === 1) fold = (await el.textContent()).replace(/\s+/g, ' ');
  }
  assert(fold, 'fold-win banner appears');
  assert(/기권승/.test(fold), `fold-win banner (got "${fold}")`);
  await shot(A, 'fold-win-paused');
  // 결과 표시(4초) 뒤에도 새 판이 시작되지 않아야 한다
  // (일시정지 중에는 끝난 판의 결과 카드가 남아 있고, 카운트다운만 사라진다)
  await until(async () => (await A.locator('.result-layer .result-countdown').count()) === 0 && /일시정지/.test(await A.locator(tid('dock')).textContent()), 'intermission ends without a new hand', 12_000);
  await sleep(1500);
  const st = await dockState(A);
  assert(st && st.handNo === 2 && st.stage === 'done', `no new hand while paused (dock=${JSON.stringify(st)})`);
  assert(/일시정지/.test(await A.locator(tid('waiting-msg')).textContent()), 'paused notice shown');
  assert(/일시정지/.test(await B.locator(tid('dock')).textContent()), 'B also sees paused state');
  await shot(A, 'paused');
  await A.click(tid('resume-game'));
  await until(async () => (await dockState(A))?.handNo === 3 && (await dockState(A))?.stage === 'bet1', 'hand 3 starts after resume');
  eq(await A.locator(tid('pause-game')).count(), 1, 'pause button back after resume');
  log('hand 3 started after resume');

  // ---- 9. C 나가기 → 로비로 복귀 ---------------------------------------------------------
  await C.click(tid('leave-open'));
  await until(async () => (await C.locator(tid('modal-leave')).count()) === 1, 'leave modal');
  await C.click(tid('leave-confirm'));
  await until(async () => (await C.locator(tid('create-submit')).count()) === 1, 'C back in lobby with create form');
  eq(new URL(C.url()).pathname, '/', 'C URL back to /');
  await until(async () => (await A.locator('.seat:not(.seat-empty)').count()) === 2, 'A sees C gone');
  await shot(C, 'lobby-after-leave');
  await shot(A, 'after-leave');
}

let exitCode = 0;
try {
  await main();
} catch (e) {
  exitCode = 1;
  console.error(`\nE2E FAILED: ${e instanceof Fail ? e.message : e.stack || e}`);
  for (const [name, page] of Object.entries(pages)) {
    try { await page.screenshot({ path: path.join(OUT, `failure-${name}.png`) }); } catch { /* ignore */ }
  }
}
await browser.close().catch(() => {});
await app.close().catch(() => {});

if (problems.length) {
  exitCode = 1;
  console.error(`\n${problems.length} browser problem(s) (console errors / failed requests):`);
  for (const p of problems) console.error(' -', p);
}
if (exitCode === 0) console.log(`\nE2E OK — ${shotNo} screenshots in ${path.relative(process.cwd(), OUT)}, 0 console errors, 0 failed requests (${elapsed()})`);
process.exit(exitCode);
