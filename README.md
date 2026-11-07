# 섯다 (Seotda)

친구들끼리 방 코드 하나로 모여 웹 브라우저에서 즐기는 **무기명 한게임식 3장 섯다**. 가상 칩만 쓰며 사행성 요소는 없습니다.

**핵심 특징**

- **무기명**: 계정·가입 없이 닉네임만 입력하면 바로 입장.
- **방 코드 / 초대 링크**: 6자리 방 코드 또는 `https://도메인/r/코드` 링크로 초대.
- **한게임식 3장 섯다**: 2장 받고 1구 베팅 → 1장 더 받고 2구 베팅 → 3장 중 2장을 골라 최종 패 결정 → 승부.
- **한게임식 베팅**: 체크 / 삥 / 콜 / 따당 / 쿼터 / 하프 / 맥스 / 올인 / 다이. 버튼마다 실제 내는 금액 표시.
- **특수족보**: 땡잡이 · 암행어사 · 구사 · 멍텅구리구사, 방 설정에서 각각 on/off.
- **사이드팟**: 올인 시 메인팟/사이드팟을 표준 레이어 방식으로 정확히 계산·분배.
- **재경기 · 판돈 이월**: 동점·구사·멍텅구리구사는 재경기, 판돈은 전부 다음 판으로 쌓임. 구사 재경기에는 다이했던 사람도 이월 판돈 절반을 내고 참가 가능.
- **리필 / 장부**: 수동·자동·끄기 리필 정책, 플레이어별 총 투입·현재 칩·순손익·승 횟수 장부.
- **재접속 복구**: 새로고침·네트워크 끊김 후 같은 브라우저로 돌아오면 자리와 칩이 그대로 복구.
- **모바일 대응**: 세로 390px 폰부터 데스크톱까지 반응형, 터치 44px 이상.
- **사행성 없음**: 가상 칩만 사용, 환전·결제·광고·땡값/땡팟/딜러비 없음.
- **에셋 직접 호스팅**: 이모지 없이 화투 SVG 이미지 + 자체 호스팅 한글 웹폰트 + 인라인 SVG 아이콘.

---

## 빠른 시작 (로컬)

요구 사항: **Node.js 20 이상** (22 권장). 빌드 단계는 없습니다(ESM, 런타임 의존성은 `express`, `ws` 두 개).

```bash
git clone <저장소 URL> seotda
cd seotda
npm install
npm start
```

브라우저에서 <http://localhost:3000> 을 열고, 한 사람이 **방 만들기** → 나머지는 방 코드 또는 `http://localhost:3000/r/코드` 링크로 입장합니다. 혼자 테스트하려면 브라우저 창(또는 시크릿 창)을 여러 개 띄우면 됩니다. 토큰이 `localStorage` 에 저장되므로 같은 브라우저 프로필의 탭은 같은 플레이어로 취급됩니다.

```bash
npm test          # 단위/통합 테스트 (node:test)
npm run test:e2e  # Playwright E2E (브라우저 3개가 한 판을 끝까지 진행)
npm run dev       # 파일 변경 시 자동 재시작 (node --watch)
```

---

## VPS 배포

세 가지 방법 중 하나를 고르세요. 어느 방법이든 **외부 공개는 nginx(c)** 뒤에 두는 것을 권장합니다(TLS, WebSocket 프록시).

### (a) Node 직접 실행 + systemd

```bash
# 1. Node.js 22 설치 (Debian/Ubuntu 예시)
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git

# 2. 코드 받기
sudo git clone <저장소 URL> /opt/seotda
cd /opt/seotda
sudo npm ci --omit=dev
sudo chown -R www-data:www-data /opt/seotda

# 3. systemd 유닛 등록
sudo cp deploy/seotda.service /etc/systemd/system/seotda.service
sudo systemctl daemon-reload
sudo systemctl enable --now seotda

# 4. 확인
systemctl status seotda
curl -s http://127.0.0.1:3000/healthz     # {"ok":true,"rooms":0}
journalctl -u seotda -f                   # 로그
```

`deploy/seotda.service` 는 `User=www-data`, `WorkingDirectory=/opt/seotda`, `HOST=127.0.0.1`, `PORT=3000`, `TRUST_PROXY=1` 로 설정되어 있어 **nginx 뒤에서만** 접근됩니다. nginx 없이 바로 공개하려면 유닛의 `Environment=HOST=0.0.0.0` 으로 바꾸고 `TRUST_PROXY` 줄을 지우세요. 다른 경로/사용자를 쓰면 유닛 파일의 `WorkingDirectory`, `User` 를 함께 수정합니다.

### (b) Docker

```bash
git clone <저장소 URL> seotda
cd seotda

# compose 사용 (권장)
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml logs -f

# 또는 직접 빌드/실행
docker build -f deploy/Dockerfile -t seotda .
docker run -d --name seotda --restart unless-stopped -p 127.0.0.1:3000:3000 seotda
```

`deploy/Dockerfile` 은 `node:22-alpine` 기반, 비루트(`node`) 사용자로 실행되며 `/healthz` 헬스체크가 포함되어 있습니다. `deploy/docker-compose.yml` 은 호스트의 **127.0.0.1:3000** 에만 바인딩하므로 역시 nginx 를 앞에 두는 구성입니다. 외부에 직접 노출하려면 `ports` 를 `"3000:3000"` 으로 바꾸고 `TRUST_PROXY` 를 `"0"` 으로 바꾸세요. 환경변수는 compose 파일의 `environment` 블록에서 조정합니다.

### (c) nginx 리버스 프록시 + Let's Encrypt

(a) 또는 (b) 로 앱이 `127.0.0.1:3000` 에서 돌고 있는 상태에서:

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx

sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/seotda
sudo sed -i 's/seotda.example.com/실제도메인/g' /etc/nginx/sites-available/seotda
sudo ln -s /etc/nginx/sites-available/seotda /etc/nginx/sites-enabled/seotda
sudo nginx -t && sudo systemctl reload nginx

# TLS 발급 (server 블록에 443 설정이 자동 추가되고 자동 갱신 타이머가 등록됨)
sudo certbot --nginx -d 실제도메인
```

주의 사항:

- **WebSocket 업그레이드**: 클라이언트는 `/ws` 경로로 WebSocket 을 연결합니다. 예시 설정에는 `Upgrade`/`Connection` 헤더 전달과 `proxy_read_timeout 3600s` 가 들어 있습니다(서버 하트비트 25초 간격이라 유휴 끊김 없음). 다른 프록시(Caddy, Traefik, Cloudflare 등)를 쓸 때도 `/ws` 에 대해 WebSocket 프록시가 켜져 있어야 합니다.
- **`TRUST_PROXY=1`**: 프록시 뒤에서는 설정하세요. express 가 `X-Forwarded-*` 헤더를 신뢰해 실제 클라이언트 주소와 프로토콜(https)을 올바르게 인식합니다. 프록시가 없으면 끄세요.
- HTTPS 로 접속하면 클라이언트가 자동으로 `wss://` 를 사용합니다(별도 설정 불필요).

### 방화벽 (ufw)

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

3000 포트는 열지 않습니다(앱은 127.0.0.1 에만 바인딩, nginx 가 80/443 으로 받음).

### 업데이트

```bash
# (a) systemd
cd /opt/seotda && sudo git pull && sudo npm ci --omit=dev && sudo chown -R www-data:www-data . && sudo systemctl restart seotda

# (b) Docker
cd seotda && git pull && docker compose -f deploy/docker-compose.yml up -d --build
```

서버는 메모리 전용이므로 **재시작하면 진행 중인 모든 방이 사라집니다**. 사람이 없는 시간에 업데이트하세요.

---

## 환경변수

출처: `server/config.js`. 모두 선택 사항입니다.

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | HTTP/WebSocket 수신 포트 |
| `HOST` | `0.0.0.0` | 바인딩 주소. 리버스 프록시 뒤에서는 `127.0.0.1` 권장 |
| `TRUST_PROXY` | 꺼짐 | `1` 또는 `true` 로 두면 `X-Forwarded-*` 헤더를 신뢰(nginx 등 프록시 뒤에서 필수) |
| `ROOM_IDLE_MS` | `7200000` (2시간) | 접속자가 0명인 방을 정리하기까지의 유휴 시간(ms) |
| `MAX_ROOMS` | `500` | 동시에 존재할 수 있는 최대 방 수. 초과 시 방 생성 거절 |
| `HEARTBEAT_MS` | `25000` | WebSocket 하트비트 간격(ms). 응답 없는 소켓은 다음 주기에 끊음 |
| `MSG_RATE_LIMIT` | `20` | 소켓당 1초에 받아주는 최대 메시지 수(남용 방지) |
| `DISCONNECT_GRACE_MS` | `600000` (10분) | 접속이 끊긴 플레이어의 좌석·칩을 유지하는 시간. 핸드 사이에만 정리됨 |
| `NODE_ENV` | — | `production` 권장(배포 파일들에 이미 설정됨) |

---

## 방 설정

방장이 방을 만들 때 정하고, 게임 중에도 **설정** 메뉴에서 바꿀 수 있습니다(변경은 다음 판부터 적용). 기본값 출처: `server/net/protocol.js` 의 `DEFAULT_SETTINGS`.

| 키 | 라벨 | 기본값 | 허용 범위 | 의미 |
|---|---|---|---|---|
| `startChips` | 시작 칩 | `1,000,000` | 1,000 ~ 1조 | 착석 시 받는 가상 칩. 리필 시 이 금액까지 채움 |
| `base` | 삥(기본 베팅액) | `10,000` | 1 ~ 1조, 시작 칩 미만 | 매 판 앤티이자 삥·최소 레이즈 단위. 이보다 칩이 적으면 참가 불가 |
| `maxPlayers` | 최대 인원 | `6` | 2 ~ 6 | 좌석 수. 3장 섯다는 20장 덱이라 최대 6명. 초과 입장자는 관전 |
| `turnSeconds` | 턴 제한시간 | `30` | 0 / 15 / 30 / 60 | 베팅·공개 카드 선택·최종 패 선택 각 단계의 제한시간. `0` 은 무제한 |
| `refill` | 리필 | `manual` | `off` / `manual` / `auto` | `manual`: 판 사이에 칩이 시작 칩보다 적으면 "리필" 버튼. `auto`: 판 시작 때 삥을 못 내는 사람을 자동 충전. `off`: 리필 없음 |
| `maxRaises` | 레이즈 횟수 상한 | `0` | 0 ~ 20 | 한 베팅 라운드에서 허용되는 레이즈(따당·쿼터·하프·맥스) 횟수. `0` 은 무제한 |
| `openCard` | 공개 카드 | `second` | `second` / `choose` | `second`: 2번째 받은 카드가 자동 공개. `choose`: 2장을 받은 뒤 공개할 카드를 직접 선택(한게임식) |
| `allInFrom` | 올인 허용 | `bet2` | `bet1` / `bet2` / `off` | 올인 버튼이 열리는 라운드. `bet1`: 1구부터, `bet2`: 2구부터, `off`: 버튼 없음(칩 부족 콜은 항상 올인 처리) |
| `dealerRule` | 선 결정 | `winner` | `winner` / `rotate` | `winner`: 직전 판 승자(사이드팟이면 메인팟 승자)가 선. `rotate`: 매판 시계방향 이동. 첫 판은 방장 |
| `regameRejoin` | 구사 재경기 참가 허용 | `true` | 불리언 | 구사·멍텅구리구사 재경기에 그 판에서 다이한 사람이 이월 판돈의 절반을 내고 참가할 수 있음 |
| `rules.ddaengjabi` | 땡잡이 | `true` | 불리언 | 3월 광 + 7월 열끗 특수족보 사용 |
| `rules.amhaeng` | 암행어사 | `true` | 불리언 | 4월 열끗 + 7월 열끗 특수족보 사용 |
| `rules.gusa` | 구사 | `true` | 불리언 | 4월 + 9월 재경기 규칙 사용 |
| `rules.mungGusa` | 멍텅구리구사 | `true` | 불리언 | 4월 열끗 + 9월 열끗 재경기 규칙 사용 |

---

## 규칙 요약

전체 규칙(판정 순서, 올인 세부, 예외 처리)은 **[docs/RULES.md](docs/RULES.md)** 가 단일 기준입니다. 아래는 요약입니다.

**진행**: 삥(앤티) → 2장 분배(1장 비공개 + 1장 공개) → 1구 베팅 → 3번째 카드(비공개) → 2구 베팅 → 3장 중 2장 선택 → 승부. 베팅 중 1명만 남으면 카드 공개 없이 기권승.
공개 카드는 기본으로 **2번째 받은 카드**가 자동 공개되며, 방 설정 `openCard: choose` 로 바꾸면 2장을 보고 **공개할 카드를 직접 선택**합니다(제한시간 초과 시 2번째 카드 공개).

### 족보 (높은 순)

| 순위 | 족보 | 구성 |
|---|---|---|
| 1 | 38광땡 | 3월 광 + 8월 광 |
| 2 | 18광땡 | 1월 광 + 8월 광 |
| 3 | 13광땡 | 1월 광 + 3월 광 |
| 4 | 장땡 | 10월 두 장 |
| 5 | 9땡 ~ 2땡 | 같은 월 두 장(월이 높을수록 강함) |
| 6 | 삥땡 | 1월 두 장 |
| 7 | 알리 | 1월 + 2월 |
| 8 | 독사 | 1월 + 4월 |
| 9 | 구삥 | 1월 + 9월 |
| 10 | 장삥 | 1월 + 10월 |
| 11 | 장사 | 4월 + 10월 |
| 12 | 세륙 | 4월 + 6월 |
| 13 | 갑오(9끗) | 두 월의 합 끝자리 9 |
| 14 | 여덟끗 ~ 한끗 | 끝자리 8 ~ 1 |
| 15 | 망통 | 끝자리 0 |

**특수족보**(설정에서 on/off): 땡잡이(3광+7열끗, 삥땡~9땡을 잡음) · 암행어사(4열끗+7열끗, 13·18광땡을 잡음) · 구사(4+9, 상대 최고가 알리 이하면 재경기) · 멍텅구리구사(4열끗+9열끗, 상대 최고가 9땡 이하면 재경기). 발동하지 않으면 각각 망통 / 한끗 / 세끗 / 세끗으로 계산.

### 베팅 버튼 (한게임식)

| 버튼 | 가능한 때 | 내는 금액 |
|---|---|---|
| 체크 | 라운드 첫 액션자(선)만, 베팅 없을 때 | 0 |
| 삥 | 베팅이 없을 때 | 삥(기본 베팅액) |
| 콜 | 베팅이 있을 때 | 콜 금액 |
| 따당 | 베팅이 있을 때 | 현재 베팅액의 2배로 올림 |
| 쿼터 | 항상 | 콜 금액 + (콜 포함 판돈)의 1/4 |
| 하프 | 항상 | 콜 금액 + (콜 포함 판돈)의 1/2 |
| 맥스 | 항상 | 콜 금액 + (콜 포함 판돈) 전부 |
| 올인 | 2구부터(설정) | 보유 칩 전부 |
| 다이 | 항상 | 0 |

체크/콜을 한 사람은 그 라운드에서 다시 레이즈할 수 없습니다. 칩이 모자라면 어떤 버튼이든 가진 칩 전부로 처리되며 버튼에 "올인" 표시가 붙고, 초과분은 사이드팟으로 갈립니다.

### 재경기 요약

| 상황 | 참가자 | 판돈 |
|---|---|---|
| 동점(최고 족보 2명 이상) | 동점자끼리만 | 동점 난 팟 전액 이월 |
| 구사 / 멍텅구리구사 | 다이하지 않은 전원 (+ 설정 시 다이한 사람도 이월 판돈 절반을 내고 참가) | 판돈 전액 이월 |

재경기 판은 앤티 없이 이월 판돈으로 시작하며 테이블 중앙에 "이월 +X" 로 표시됩니다. 재경기에서 또 동점/구사가 나오면 계속 쌓입니다. 참가자가 1명만 남으면 그 사람이 가져가고, 0명이면 다음 일반 판에 합산됩니다.

---

## 아키텍처 요약

```
server/
  index.js            진입점(listen, 종료 시그널 처리)
  app.js              express 정적 서빙 + ws 서버 조립 (/, /r/:code, /healthz, WebSocket /ws)
  config.js           환경변수
  net/
    protocol.js       메시지 검증, 방 설정 스키마/기본값
    connection.js     소켓 1개의 생애주기 (hello/token, 하트비트, 라우팅)
    roomManager.js    방 생성/조회/코드 발급/유휴 방 정리
    room.js           Room: 좌석·플레이어·설정·방장·채팅·로그·타이머·핸드 진행·뷰(redaction)
  game/
    cards.js          20장 덱, crypto 기반 셔플
    betting.js        베팅 라운드 상태기계
    pots.js           메인/사이드팟 계산·분배·이월
    engine.js         Hand(한 판) 상태기계: open → bet1 → bet2 → select → done
public/
  index.html, css/    단일 페이지(로비 + 테이블)
  js/app.js, net.js   부트/라우팅/localStorage, WebSocket 클라이언트(자동 재접속)
  js/ui/              렌더러(테이블, 좌석, 카드, 액션바, 선택, 쇼다운, 로그/채팅, 장부, 설정)
  js/shared/          서버·클라 공용 순수 모듈 (cards, hands, format)
  assets/cards/       화투 20장 + 뒷면 SVG
  assets/fonts/       자체 호스팅 woff2 + fonts.css
test/                 node:test 단위/통합 테스트, test/e2e/ Playwright
deploy/               Dockerfile, docker-compose.yml, seotda.service, nginx.conf.example
docs/                 SPEC.md(설계), RULES.md(규칙), ATTRIBUTION.md(에셋 출처)
```

- **서버 권위(server-authoritative)**: 셔플·분배·베팅 합법성·족보 판정·팟 분배를 모두 서버가 수행합니다. 클라이언트는 자신의 카드와 공개/쇼다운된 카드만 받고, 상대의 비공개 카드는 절대 전송되지 않습니다(수신자별 redaction).
- **WebSocket JSON**: 단일 엔드포인트 `/ws`. 변화가 있을 때마다 서버가 수신자 기준 전체 방 스냅샷(`{t:'state', room}`)을 보내고, 클라이언트는 이 스냅샷만으로 화면을 그립니다. `{t:'event'}` 는 애니메이션/사운드 트리거 전용입니다. 메시지 형식은 `server/net/protocol.js` 와 `docs/SPEC.md` §5 참조.
- **세션**: 32자리 hex 토큰을 브라우저 `localStorage` 에 저장. 재접속 시 토큰으로 같은 플레이어(좌석·칩)를 복구합니다.
- **메모리 전용**: 데이터베이스가 없습니다. 모든 방·칩·장부는 프로세스 메모리에만 존재하므로 **서버가 재시작되면 모든 방이 소멸**합니다. 접속자 0명인 방은 `ROOM_IDLE_MS` 후 정리됩니다.
- 족보 평가(`public/js/shared/hands.js`)는 서버와 클라이언트가 같은 파일을 공유해 선택 단계 미리보기와 서버 판정이 항상 일치합니다.

---

## 테스트

```bash
# 단위/통합 (node:test, 추가 의존성 없음)
npm test
# 또는
node --test test/*.test.js
```

- `test/hands.test.js` 족보·이름·비교·특수족보 판정
- `test/betting.test.js` 베팅 라운드(체크/삥/따당/쿼터/하프/맥스/올인/레이즈 제한)
- `test/pots.test.js` 메인/사이드팟 레이어, 이월
- `test/engine.test.js` 한 판 시나리오(기권승, 쇼다운, 올인 사이드팟, 구사 재경기 이월, 동점 이월, 타임아웃)
- `test/room.test.js` 입장/퇴장/재접속/redaction/방장 승계/타이머/리필/재경기 참가
- `test/server.test.js` 실제 HTTP·WebSocket 서버를 임시 포트에 띄워 프로토콜 전체 검증

```bash
# E2E (Playwright). 처음 한 번 브라우저 설치가 필요합니다.
npx playwright install chromium
npm run test:e2e
```

E2E 는 로컬 서버를 띄우고 브라우저 3개가 방을 만들어 한 판을 끝까지 진행하며 스크린샷을 `test/e2e/out/` 에 저장합니다.

---

## 라이선스 & 크레딧

- **코드**: [MIT License](LICENSE) — Copyright (c) 2026 seotda contributors.
- **화투 카드 이미지** (`public/assets/cards/*.svg`, `back.svg` 제외): **Spenĉjo**, [Wikimedia Commons "SVG Hwatu"](https://commons.wikimedia.org/wiki/Category:SVG_Hwatu), [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). 파일명만 변경하여 수정 없이 사용. 카드 뒷면(`back.svg`)은 이 프로젝트에서 제작(MIT).
- **글꼴** (모두 [SIL Open Font License 1.1](https://openfontlicense.org/), Google Fonts 배포본 자체 호스팅): Song Myung(송명, 제목·족보), Gowun Dodum(고운돋움, 본문·UI), Black Han Sans(검은고딕, 베팅 콜아웃). 각 폴더의 `OFL.txt` 참조.
- **아이콘**: 전부 인라인 SVG 로 직접 제작(이모지 미사용).

원본 파일명 대응표 등 상세 출처는 **[docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)** 를 참조하세요. 카드 이미지를 포함해 재배포할 때는 CC BY-SA 4.0 에 따라 작가 표기와 동일 조건 공유를 지켜야 합니다.

---

## 알려진 제한

- **영속성 없음**: DB 가 없어 서버 재시작·배포 시 모든 방과 칩·장부가 사라집니다. 접속자 0명인 방도 2시간(기본) 후 정리됩니다.
- **계정 없음**: 무기명 설계입니다. 같은 브라우저의 토큰으로만 자리를 복구하며, 브라우저 저장소를 지우거나 다른 기기에서 접속하면 새 플레이어로 취급됩니다. 통계·랭킹·친구 목록 없음.
- **땡값 / 땡팟 미구현**: 땡을 잡았을 때 상대에게 추가로 받는 땡값, 땡 적립 팟, 딜러비 등 현금성 부가 규칙은 사행성 요소로 보아 의도적으로 넣지 않았습니다.
- 한 서버 프로세스 안에서만 방이 공유됩니다(수평 확장 시 방이 프로세스별로 분리됨). 친구 모임 규모(방당 최대 6명, 서버당 기본 500방)를 가정한 설계입니다.
