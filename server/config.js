// 환경변수 기반 서버 설정
const env = process.env;

function int(name, def) {
  const v = parseInt(env[name] ?? '', 10);
  return Number.isFinite(v) ? v : def;
}

export const config = {
  port: int('PORT', 3000),
  host: env.HOST || '0.0.0.0',
  // nginx 등 리버스 프록시 뒤에 있을 때 1 로 설정 (X-Forwarded-* 신뢰)
  trustProxy: env.TRUST_PROXY === '1' || env.TRUST_PROXY === 'true',
  // 접속자가 0명인 방을 정리하기까지의 유휴 시간
  roomIdleMs: int('ROOM_IDLE_MS', 2 * 60 * 60 * 1000),
  // 동시에 존재할 수 있는 최대 방 수
  maxRooms: int('MAX_ROOMS', 500),
  // WebSocket 하트비트 간격 / 응답 없을 때 끊기까지
  heartbeatMs: int('HEARTBEAT_MS', 25_000),
  // 소켓당 1초 메시지 상한 (간단한 남용 방지)
  msgRateLimit: int('MSG_RATE_LIMIT', 20),
  // 재접속 유예: 연결이 끊긴 플레이어의 좌석을 유지하는 시간(핸드 사이에만 정리)
  disconnectGraceMs: int('DISCONNECT_GRACE_MS', 10 * 60 * 1000),
};
