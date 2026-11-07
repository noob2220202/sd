// 한게임식 베팅 라운드 상태기계 (순수 로직, 타이머 없음)
//
// 액션: check(체크) bbing(삥) call(콜) ddadang(따당) quarter(쿼터) half(하프) max(맥스) allin(올인) die(다이)
// 금액 산식(docs/RULES.md):
//   pot    = 이번 라운드 이전까지의 판돈(이월+앤티+이전 라운드) + 이번 라운드에 낸 금액 합
//   cur    = 이번 라운드 최고 누계,  mine = 내 누계,  toCall = cur - mine
//   체크   = 이 라운드의 첫 액션자(선/보스)만, 아무 베팅이 없을 때
//   삥     = base                              (cur == 0 일 때만: 선 또는 선이 체크한 뒤 다음 사람)
//   따당   = cur * 2                           (cur > 0 일 때만)
//   쿼터/하프/맥스 = cur + max(base, floor((pot + toCall) * 1/4 | 1/2 | 1))
//   올인   = mine + chips                      (allowAllIn 라운드에서만, 레이즈가 될 때만 별도 표시)
//   체크·콜을 한 플레이어는 그 라운드에서 이후 콜/다이만 가능(리레이즈 불가).
//   레이즈성 액션은 maxRaises(0=무제한) 에 걸리면 불가. 칩이 부족하면 올인(보유 칩 전부).

export const RAISE_KINDS = ['bbing', 'ddadang', 'quarter', 'half', 'max', 'allin'];
const FRACTION = { quarter: 0.25, half: 0.5, max: 1 };

export class BettingRound {
  /**
   * @param {{players:{id:string, chips:number}[], pot:number, base:number, maxRaises?:number, firstIdx?:number,
   *          alreadyFolded?:Set<string>, alreadyAllIn?:Set<string>}} opts
   *  players 는 액션 순서(시계방향) 로 정렬된 "이 판 참가자 전원".
   */
  constructor({ players, pot, base, maxRaises = 0, firstIdx = 0, alreadyFolded = new Set(), alreadyAllIn = new Set(), allowAllIn = false }) {
    this.players = players.map((p) => ({
      id: p.id,
      chips: p.chips,
      roundBet: 0,
      folded: alreadyFolded.has(p.id),
      allIn: alreadyAllIn.has(p.id) || p.chips <= 0,
      acted: false,
      passive: false, // 체크/콜 이후 → 리레이즈 불가
    }));
    this.potBefore = pot;
    this.base = base;
    this.maxRaises = maxRaises;
    this.allowAllIn = allowAllIn;
    this.raises = 0;
    this.cur = 0;
    this.lastAggressor = null;
    this.actions = []; // 로그
    this.turnIdx = -1;
    this.over = false;
    const start = this._firstActorFrom(firstIdx);
    if (start === -1 || this._activeCount() <= 1) {
      this.over = true;
    } else {
      this.turnIdx = start;
    }
  }

  // ---- 조회 ------------------------------------------------------------------
  get pot() {
    return this.potBefore + this.players.reduce((s, p) => s + p.roundBet, 0);
  }

  get turnPlayerId() {
    return this.over || this.turnIdx < 0 ? null : this.players[this.turnIdx].id;
  }

  player(id) {
    return this.players.find((p) => p.id === id) || null;
  }

  /** 다이하지 않은 플레이어 수 */
  aliveCount() {
    return this.players.filter((p) => !p.folded).length;
  }

  /** 다이·올인 아닌(아직 베팅할 수 있는) 플레이어 수 */
  _activeCount() {
    return this.players.filter((p) => !p.folded && !p.allIn).length;
  }

  _firstActorFrom(idx) {
    const n = this.players.length;
    for (let k = 0; k < n; k++) {
      const i = (idx + k) % n;
      const p = this.players[i];
      if (!p.folded && !p.allIn) return i;
    }
    return -1;
  }

  /** 플레이어의 합법 액션 목록 [{kind,total,pay,allIn}] (total = 이번 라운드 누계가 될 값) */
  legalActions(id) {
    if (this.over) return [];
    const p = this.player(id);
    if (!p || this.turnPlayerId !== id) return [];
    const toCall = this.cur - p.roundBet;
    const out = [];
    const mk = (kind, total) => {
      let pay = total - p.roundBet;
      let allIn = false;
      if (pay >= p.chips) {
        pay = p.chips;
        total = p.roundBet + pay;
        allIn = true;
      }
      return { kind, total, pay, allIn };
    };

    const firstActor = this.actions.length === 0;
    if (this.cur === 0) {
      if (firstActor) out.push({ kind: 'check', total: p.roundBet, pay: 0, allIn: false });
    } else out.push(mk('call', this.cur));

    const canRaise =
      !p.passive && (this.maxRaises === 0 || this.raises < this.maxRaises) && p.chips > Math.max(0, toCall);
    if (canRaise) {
      const raiseOpts = [];
      if (this.cur === 0) raiseOpts.push(mk('bbing', this.base));
      else raiseOpts.push(mk('ddadang', this.cur * 2));
      const potForFraction = this.pot + Math.max(0, toCall);
      for (const kind of ['quarter', 'half', 'max']) {
        const raise = Math.max(this.base, Math.floor(potForFraction * FRACTION[kind]));
        raiseOpts.push(mk(kind, this.cur + raise));
      }
      if (this.allowAllIn) raiseOpts.push({ kind: 'allin', total: p.roundBet + p.chips, pay: p.chips, allIn: true });
      // 올인으로 금액이 같아지는 중복 옵션 제거(앞선 작은 액션만 남김), 콜과 같은 금액이면 제외
      const seen = new Set([this.cur]);
      for (const o of raiseOpts) {
        if (o.total <= this.cur) continue; // 레이즈가 되지 못함(사실상 콜)
        if (seen.has(o.total)) continue;
        seen.add(o.total);
        out.push(o);
      }
    }
    out.push({ kind: 'die', total: p.roundBet, pay: 0, allIn: false });
    return out;
  }

  // ---- 액션 적용 ---------------------------------------------------------------
  /**
   * @returns {{ok:true, action:{playerId,kind,total,pay,allIn,raise:boolean}, over:boolean} | {ok:false, error:string}}
   */
  act(id, kind) {
    if (this.over) return { ok: false, error: 'round_over' };
    if (this.turnPlayerId !== id) return { ok: false, error: 'not_your_turn' };
    const legal = this.legalActions(id).find((a) => a.kind === kind);
    if (!legal) return { ok: false, error: 'illegal_action' };
    const p = this.player(id);

    const action = { playerId: id, kind, total: legal.total, pay: legal.pay, allIn: legal.allIn, raise: false };
    if (kind === 'die') {
      p.folded = true;
      p.acted = true;
    } else {
      p.chips -= legal.pay;
      p.roundBet = legal.total;
      p.acted = true;
      if (kind === 'check' || kind === 'call') p.passive = true;
      if (legal.allIn) p.allIn = true;
      if (legal.total > this.cur) {
        // 레이즈(또는 베팅): 다른 모든 활성 플레이어는 다시 액션해야 함
        this.cur = legal.total;
        this.raises += 1;
        this.lastAggressor = id;
        action.raise = true;
        for (const q of this.players) if (q.id !== id && !q.folded && !q.allIn) q.acted = false;
      }
    }
    this.actions.push(action);
    this._advance();
    return { ok: true, action, over: this.over };
  }

  _needsAction(p) {
    return !p.folded && !p.allIn && (!p.acted || p.roundBet < this.cur);
  }

  _advance() {
    if (this.aliveCount() <= 1) {
      this.over = true;
      this.turnIdx = -1;
      return;
    }
    const n = this.players.length;
    for (let k = 1; k <= n; k++) {
      const i = (this.turnIdx + k) % n;
      if (this._needsAction(this.players[i])) {
        this.turnIdx = i;
        return;
      }
    }
    this.over = true;
    this.turnIdx = -1;
  }

  /** 타임아웃 자동 액션: 체크 가능하면 체크, 아니면 다이 */
  autoAction(id) {
    const legal = this.legalActions(id);
    if (!legal.length) return null;
    const kind = legal.some((a) => a.kind === 'check') ? 'check' : 'die';
    return this.act(id, kind);
  }

  /** 라운드 결과 요약 */
  summary() {
    return {
      cur: this.cur,
      pot: this.pot,
      raises: this.raises,
      players: this.players.map((p) => ({ id: p.id, chips: p.chips, roundBet: p.roundBet, folded: p.folded, allIn: p.allIn })),
    };
  }
}
