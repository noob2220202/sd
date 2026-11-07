# 섯다 (Seotda) 웹 게임 — 설계 명세

> 친구들끼리 방 코드/링크로 접속해서 즐기는 무기명 한게임식 **3장 섯다**. 사행성 없음(가상 칩).
> 서버 권위(server‑authoritative) 구조. 클라이언트는 절대 상대의 비공개 카드를 받지 않는다.

## 0. 사용자 결정 사항 (확정)
| 항목 | 결정 |
|---|---|
| 서버 | Node.js 단일 서버 (`express` 정적 파일 + `ws` 실시간). 사용자 VPS에 배포 |
| 베팅 | 한게임식: 삥 / 콜 / 따당 / 쿼터 / 하프 / 풀(맥스) / 다이 (+ 체크 규칙은 §3 참조) |
| 카드 공개 | 1번째 비공개, **2번째 공개**, 3번째 비공개. 마지막에 3장 중 2장 선택 |
| 동점/구사 | 동점·구사·멍텅구리구사 모두 **재경기**, 판돈은 다음 판으로 전부 이월(쌓임) |
| 에셋 | 이모지 금지. 화투 카드 이미지(자유 라이선스)와 자체 호스팅 한글 웹폰트 사용 |
| 방 설정 | 시작 칩, 삥(기본 베팅액), 리필 정책, 특수족보 on/off, 턴 제한시간, 최대 인원 등은 방장이 설정 |

## 1. 디렉터리 구조
```
server/
  index.js            진입점: config 로 createApp 후 listen, SIGTERM 처리
  app.js              createApp(config): express 정적 파일 + ws 서버 + 하트비트 (/, /r/:code, /healthz, /ws)
  config.js           환경변수 (PORT, HOST, TRUST_PROXY, ROOM_IDLE_MS, MAX_ROOMS ...)
  net/
    protocol.js       메시지 타입 상수, 검증(validate) 함수
    connection.js     소켓 1개의 생애주기(hello/token, heartbeat, 라우팅)
    roomManager.js    방 생성/조회/코드 발급/유휴 방 정리
    room.js           Room 클래스: 좌석, 플레이어, 설정, 방장, 채팅, 로그, 타이머, 핸드 진행, 뷰(redaction)
  game/
    cards.js          20장 덱 정의, crypto 기반 셔플
    hands.js          2장 → 족보 평가, 비교, 이름, 특수족보 판정 (public/js/shared/hands.js 를 re-export)
    betting.js        베팅 라운드 상태기계(합법 액션/금액 계산/라운드 종료 판정/올인)
    pots.js           기여금 → 메인/사이드팟 계산, 분배, 이월
    engine.js         Hand(한 판) 상태기계: ante → deal2 → bet1 → deal3 → bet2 → select → showdown | regame
public/
  index.html          단일 페이지(로비 + 테이블). URL /r/CODE 로 들어오면 코드 자동 입력
  css/*.css
  js/
    shared/hands.js   서버·클라 공용 족보 평가(순수 함수, 의존성 없음)
    shared/format.js  칩 금액 포매팅 (1,234,567 / 123만 / 1.2억)
    shared/rules.js   액션 이름/설명 등 상수
    app.js            부트, 라우팅, 상태 저장(localStorage: token, nickname)
    net.js            WebSocket 클라이언트(자동 재접속, 큐)
    ui/*.js           렌더러(테이블, 좌석, 카드, 액션바, 선택, 쇼다운, 로그/채팅, 장부, 설정 모달)
  assets/cards/*.svg  화투 20장 + 뒷면
  assets/fonts/*      woff2 + css
test/                 node:test 단위/통합 테스트, test/e2e/ Playwright 시나리오
deploy/               Dockerfile, docker-compose.yml, systemd unit, nginx 예시
docs/                 SPEC.md(이 문서), RULES.md(플레이어용 규칙 설명)
```
`package.json` 은 `"type": "module"` (ESM). 런타임 의존성은 `express`, `ws` 만.

## 2. 카드
섯다는 화투 1~10월 각 2장 = 20장을 쓴다. 카드 ID는 `"{월}{종류}"` 로 고정한다.

| 월 | 카드 A | 카드 B |
|---|---|---|
| 1 송학 | `1g` 광(학) | `1t` 띠(홍단) |
| 2 매조 | `2y` 열끗(새) | `2t` 띠 |
| 3 벚꽃 | `3g` 광(휘장) | `3t` 띠(홍단) |
| 4 흑싸리 | `4y` 열끗(두견새) | `4t` 띠 |
| 5 난초 | `5y` 열끗(다리) | `5t` 띠 |
| 6 모란 | `6y` 열끗(나비) | `6t` 띠 |
| 7 홍싸리 | `7y` 열끗(멧돼지) | `7t` 띠 |
| 8 공산 | `8g` 광(달) | `8y` 열끗(기러기) |
| 9 국진 | `9y` 열끗(술잔) | `9t` 띠 |
| 10 단풍 | `10y` 열끗(사슴) | `10t` 띠 |

`cards.js`: `DECK` (20개 `{id, month, kind: 'g'|'y'|'t', name}`), `shuffle(deck)` 는 `crypto.randomInt` 기반 Fisher–Yates.

## 3. 규칙
확정 규칙은 **docs/RULES.md** 가 단일 기준이다. 구현 위치:
- 족보/특수족보/쇼다운 판정: `public/js/shared/hands.js` (`evaluate`, `bestPair`, `allPairs`, `resolveShowdown`)
- 베팅 라운드: `server/game/betting.js` (`BettingRound`) — 체크는 첫 액션자만, 체크/콜 후 리레이즈 불가, 올인은 allowAllIn 라운드만
- 한 판: `server/game/engine.js` (`Hand`) — 단계 `open`(공개패 선택, openCard='choose' 일 때만) → `bet1` → `bet2` → `select` → `done`
  - `new Hand({no, players, dealerIdx, settings, carried, ante, regame, deck}).start()`
  - `act(id, kind)`, `chooseOpen(id, idx)`, `select(id, [i,j])`, `timeoutTurn()`, `timeoutOpen()`, `timeoutSelect()`, `forceLeave(id)`
  - `legalActions(id)`, `turnPlayerId`, `pendingOpeners()`, `pendingSelectors()`, `flushEvents()`, `view(viewerId)`
  - `result`: `{type:'fold'|'showdown'|'regame', reason, winners, dealerNext, pots, payouts, reveals, effective, specials, carriedNext, regameNext:{reason, participants}|null, pot}`

### 3.1 Room 이 담당하는 규칙 (engine 밖)
- **참가자 결정**: 착석 + 접속 여부 무관(끊겨도 자리 유지) + `chips >= base`. `refill:'auto'` 면 시작 전 `chips < base` 인 착석자를 `startChips` 로 채운다. 참가자 2명 미만이면 시작하지 않고 `waiting`.
- **재경기 판**: 직전 결과의 `regameNext` 가 있으면 다음 판은 `ante:false, carried:carriedNext, regame:{reason}`, 참가자 = `regameNext.participants` 중 아직 방에 있는(착석) 사람 + (구사 재경기이고 `regameRejoin` 이면) 결과 표시 중 `rejoin` 을 보내고 `floor(carried/2)` 를 낸 사람(그 돈은 carried 에 합산). 참가자 1명 → 그 사람에게 carried 지급 후 일반 판. 0명 → carried 를 다음 일반 판에 합산.
- **선(dealer)**: `dealerRule:'winner'` → `result.dealerNext` 가 있으면 그 사람, 없으면(재경기) 유지. 선이 다음 판 참가자가 아니면 좌석 시계방향으로 다음 참가자. `'rotate'` → 매판 시계방향 다음 참가자. 첫 판은 방장.
- **타이머**: `turnSeconds>0` 이면 `turn`/`open`/`select` 단계마다 deadline 설정. 만료 시 `timeoutTurn/timeoutOpen/timeoutSelect`. 결과 표시 7초(`INTERMISSION_MS`), 그 후 자동 다음 판(일시정지 아니면).
- **퇴장/강퇴**: 판 참가 중이면 `forceLeave(id)`; 턴이 아닌 베팅 중이었다면 턴이 올 때 Room 이 다시 `forceLeave` 호출(즉시 다이). 끊김(disconnect)은 자리 유지, 타임아웃 자동 액션에 맡긴다.
- **장부**: `buyIn`(시작 칩 + 리필 누계), `refills`, `wins`, `net = chips - buyIn`.

## 4. 팟 계산 (`pots.js`)
```js
buildPots(contribs: Map<playerId, amount>, folded: Set<playerId>, carried: number)
 -> [{ amount, eligible: Set<playerId> }]   // 메인팟 먼저, eligible 동일한 연속 레이어는 병합. carried 는 메인팟에 합산.
```
표준 레이어 알고리즘: 기여액을 오름차순 고유값으로 자르고 레이어별 합산. 다이한 플레이어의 기여는 각 레이어에 포함되되 eligible 에서 제외.
분배: 팟별 `resolveShowdown` 결과대로. 승자 1명 → 전액. 동점 → 그 팟 `carried` 로 이월. 끝전(정수 나눔)은 발생하지 않음(동점 분배 없음).

## 5. 네트워크 프로토콜 (WebSocket, JSON, UTF‑8)
### 5.1 클라이언트 → 서버
| t | 필드 | 설명 |
|---|---|---|
| `hello` | `token?` | 접속 직후. 토큰 없으면 서버가 발급. 응답 `hello_ok {token, playerId}` |
| `create_room` | `nickname, settings` | 방 생성 + 방장 착석 |
| `join_room` | `code, nickname` | 입장. 빈 좌석 있으면 착석(진행 중 핸드는 다음 판부터), 없으면 관전 |
| `leave_room` | | 퇴장(진행 중 핸드에 참여 중이면 다이 처리) |
| `sit` / `stand` | | 관전↔착석 전환 |
| `action` | `handNo, kind` | kind ∈ check,bbing,call,ddadang,quarter,half,max,allin,die |
| `open_choose` | `handNo, idx` | 공개할 카드 선택(0 또는 1, openCard='choose' 일 때) |
| `select` | `handNo, idx:[i,j]` | 최종 2장 선택(idx 0..2, 서로 다름) |
| `rejoin` | | 구사 재경기 참가(다이했던 사람, 결과 표시 중, 이월 판돈 절반 지불) |
| `refill` | | 리필 요청(설정 허용 시) |
| `chat` | `text` (≤200자) | 채팅. 초당 2건 제한 |
| `host` | `cmd, ...` | start, pause, resume, kick{playerId}, settings{settings}, transfer{playerId}, reveal? |
| `ping` | | 하트비트 (서버 `pong`) |

### 5.2 서버 → 클라이언트
| t | 설명 |
|---|---|
| `hello_ok` | `{token, playerId}` |
| `state` | 전체 방 뷰 스냅샷(수신자 기준 redaction). 변화마다 전송. 방이 작아서 diff 불필요 |
| `event` | 애니메이션/사운드 트리거: `{ev:'deal'|'bet'|'die'|'turn'|'reveal'|'win'|'regame'|'refill'|'chat'|'join'|'leave'|'kick'|'timeout', ...}` |
| `error` | `{code, message}` (예: `room_not_found`, `room_full`, `not_your_turn`, `illegal_action`, `bad_request`) |
| `pong` | |

### 5.3 RoomView (수신자별 뷰)
```ts
{
  code, hostId, phase: 'lobby'|'playing'|'paused',
  settings: { startChips, base, maxPlayers, turnSeconds, refill:'off'|'manual'|'auto', maxRaises,
              openCard:'second'|'choose', allInFrom:'bet1'|'bet2'|'off', dealerRule:'winner'|'rotate', regameRejoin:boolean,
              rules: { ddaengjabi, amhaeng, gusa, mungGusa } },
  me: { id, nickname, seat|null, chips, cards:[{id}|{hidden:true}]... (내 카드는 항상 id 포함), selected:[i,j]|null },
  players: [{ id, nickname, seat, chips, connected, isHost,
              status:'waiting'|'active'|'folded'|'allin'|'sitout'|'spectating',
              roundBet, handBet, cards:[{id}|{hidden:true}] (공개 카드만 id),
              reveal?: { cards:[id,id], hand:{name,...} },   // 쇼다운 후
              ledger:{ buyIn, refills, net, wins } }],
  hand: null | { ...engine.view(me) 그대로(no, stage, regame, dealerId, turnId, pot, carried, cur, legal, players[], result),
                 deadline: ms epoch | null, deadlineTotal: ms | null,  // 현재 단계 제한시간과 그 전체 길이
                 intermission: null | { until: ms epoch, regameNext: {reason, participants}|null, rejoinFee, rejoinable: [ids], rejoined: [ids] } },
  waiting: null | { reason: 'need_players'|'paused'|'lobby' },
  log: [{ts, text}] (최근 100개), chat: [{ts, from, text}] (최근 100개)
}
```

## 6. 방/세션 규칙
- 토큰: 32 hex, localStorage. 재접속 시 같은 플레이어로 복구(좌석/칩 유지). 끊김 중에도 턴 타이머는 흐르며 타임아웃 시 자동 액션.
- 방 코드: 혼동 문자 제외 영대문자+숫자 6자. URL `/r/CODE`.
- 방장: 생성자. 방장이 나가면 가장 오래 있던 접속자에게 자동 승계. 방장 명령: 게임 시작/일시정지/재개, 강퇴, 설정 변경(핸드 사이에만 적용), 방장 양도.
- 유휴 방(접속자 0명 2시간)은 정리. 서버 재시작 시 방은 소멸(메모리 전용) — README 에 명시.
- 닉네임 1~12자, 중복 시 `(2)` 접미.

## 7. 타이머
- 턴 제한 `turnSeconds` ∈ {0(무제한),15,30,60}. 타임아웃: 베팅 → `check` 가능하면 체크, 아니면 다이. 선택 → `bestPair`.
- 결과 표시 6초, 재경기 안내 4초, 그 후 자동으로 다음 판. 방장이 일시정지하면 다음 판을 시작하지 않음.

## 8. 리필/장부(사행성 없음, 가상 칩)
- `refill:'manual'`: 핸드 사이에 `chips < startChips` 이면 "리필" 버튼 → `startChips` 까지 충전, refills+1, buyIn 누계 반영.
- `refill:'auto'`: 핸드 시작 시 `chips < base` 인 착석자를 자동 충전.
- 장부(ledger): 플레이어별 총 투입(buyIn), 현재 칩, 순손익(net = chips - buyIn), 승 횟수. 모달로 표시.

## 9. UI 요구사항
- 전체 한국어. 이모지 사용 금지(아이콘은 인라인 SVG 로 직접 그림). 화투 이미지는 `assets/cards/`.
- 폰트: 제목/족보 콜아웃용 디스플레이 서체 + 본문용 가독 서체, 모두 자체 호스팅 woff2(`@font-face`).
- 테이블: 담요(짙은 녹색) 느낌의 타원 테이블, 좌석 최대 6 (내 좌석은 항상 하단 중앙). 좌석 카드: 뒷면 2장 + 공개 1장(2번째). 내 카드는 앞면.
- 중앙: 판돈(이월분 별도 표기 "이월 +X"), 칩 더미 그래픽(SVG), 선 토큰("선"), 현재 턴 표시 + 남은 시간 링.
- 액션바(내 턴): 각 버튼에 금액 표시(예: "하프 12,500"). 비합법 액션은 비활성. 올인되는 경우 "올인" 배지.
- 선택 단계: 내 3장 중 2장 탭/클릭 → 조합 족보명 미리보기, "확정" 버튼, 타이머.
- 쇼다운: 생존자 카드 공개 + 족보명 + 승자 하이라이트, 재경기 시 "재경기 — 판돈 이월" 배너.
- 사이드 패널(토글): 게임 로그 / 채팅. 상단: 방 코드·초대 링크 복사·장부·설정(방장)·나가기.
- 모바일(세로 390px) ~ 데스크톱 반응형. 터치 44px 이상.

## 10. 배포 (VPS)
- `npm ci --omit=dev && PORT=3000 npm start`. 환경변수 `PORT`(기본 3000), `HOST`(0.0.0.0), `TRUST_PROXY=1`.
- `deploy/Dockerfile`, `deploy/docker-compose.yml`, `deploy/seotda.service`(systemd), `deploy/nginx.conf.example`(WebSocket upgrade, TLS 위치 안내). README 에 단계별 설명(한국어).

## 11. 테스트
- `test/hands.test.js` 모든 족보/이름/비교/특수 판정, `test/betting.test.js`, `test/pots.test.js`, `test/engine.test.js`(스크립트 시나리오: 다이승, 쇼다운, 올인 사이드팟, 구사 재경기 이월 후 다음 판 합산, 동점 이월, 타임아웃), `test/room.test.js`(입장/퇴장/재접속/redaction/방장 승계).
- `test/e2e/`: Playwright 로 브라우저 3개가 방을 만들고 한 판을 끝까지 진행, 스크린샷 저장.
