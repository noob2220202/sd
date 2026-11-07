// WebSocket 클라이언트: 자동 재접속(지수 백오프), 하트비트, 전송 큐
export class Net {
  constructor({ url, onMessage, onStatus }) {
    this.url = url;
    this.onMessage = onMessage;
    this.onStatus = onStatus || (() => {});
    this.ws = null;
    this.queue = [];
    this.attempt = 0;
    this.closedByUser = false;
    this.pingTimer = null;
    this.reconnectTimer = null;
    this.status = 'idle';
  }

  connect() {
    this.closedByUser = false;
    this._open();
  }

  _setStatus(s) {
    if (this.status === s) return;
    this.status = s;
    this.onStatus(s);
  }

  _open() {
    clearTimeout(this.reconnectTimer);
    this._setStatus(this.attempt === 0 ? 'connecting' : 'reconnecting');
    let ws;
    try {
      ws = new WebSocket(this.url);
    } catch {
      this._scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this._setStatus('open');
      this._startPing();
      // hello 는 app 이 'open' 상태 콜백에서 먼저 보내므로, 큐는 그 뒤에 비운다
      const q = this.queue;
      this.queue = [];
      for (const m of q) this.send(m);
    };
    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (msg && msg.t === 'pong') return;
      this.onMessage(msg);
    };
    ws.onclose = () => {
      this._stopPing();
      this.ws = null;
      if (this.closedByUser) {
        this._setStatus('closed');
        return;
      }
      this._scheduleReconnect();
    };
    ws.onerror = () => {
      // onclose 가 이어서 호출됨
    };
  }

  _scheduleReconnect() {
    this._setStatus('reconnecting');
    const delay = Math.min(10_000, 500 * 2 ** Math.min(this.attempt, 5)) + Math.random() * 300;
    this.attempt += 1;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => this._open(), delay);
  }

  _startPing() {
    this._stopPing();
    this.pingTimer = setInterval(() => this.send({ t: 'ping' }, false), 20_000);
  }

  _stopPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  /** 열려 있으면 즉시 전송, 아니면 큐에 보관(queueIfClosed=false 면 버림) */
  send(msg, queueIfClosed = true) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    if (queueIfClosed) this.queue.push(msg);
    return false;
  }

  close() {
    this.closedByUser = true;
    clearTimeout(this.reconnectTimer);
    this._stopPing();
    if (this.ws) this.ws.close();
  }
}

/** 현재 페이지 기준 ws URL (http→ws, https→wss) */
export function defaultWsUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws`;
}
