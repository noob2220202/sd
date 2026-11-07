// 한 판(Hand) 상태기계
//   ante → deal2 → [open: 공개패 선택] → bet1(1구) → deal3 → bet2(2구) → select(최종 2장) → showdown | regame | fold-win
// 순수 로직(타이머 없음). Room 이 타이머·네트워크·선(dealer) 결정·재경기 참가자 관리를 담당한다.
import { shuffledDeck } from './cards.js';
import { BettingRound } from './betting.js';
import { buildPots } from './pots.js';
import { evaluate, bestPair, resolveShowdown } from '../../public/js/shared/hands.js';

export const STAGES = ['open', 'bet1', 'bet2', 'select', 'done'];

export class Hand {
  /**
   * @param {{
   *   no:number,
   *   players:{id:string, chips:number}[],   // 좌석 순(시계방향) 참가자 전원
   *   dealerIdx:number,                      // players 배열에서 선(보스)의 인덱스. 1구·2구 모두 선부터 액션
   *   settings:{base:number, maxRaises?:number, openCard?:'second'|'choose', allInFrom?:'bet1'|'bet2'|'off', rules?:object},
   *   carried?:number,                       // 이월된 판돈
   *   ante?:boolean,                         // false 면 앤티 없이 시작(재경기)
   *   regame?:null|{reason:string},          // 이 판이 재경기인지(표시용)
   *   deck?:string[],                        // 테스트용 고정 덱
   * }} opts
   */
  constructor({ no, players, dealerIdx, settings, carried = 0, ante = true, regame = null, deck = null }) {
    if (!Array.isArray(players) || players.length < 2) throw new Error('참가자는 2명 이상이어야 합니다');
    if (players.length > 6) throw new Error('참가자는 최대 6명');
    this.no = no;
    this.settings = { maxRaises: 0, openCard: 'second', allInFrom: 'bet2', rules: {}, ...settings };
    this.base = this.settings.base;
    this.dealerIdx = ((dealerIdx % players.length) + players.length) % players.length;
    this.players = players.map((p) => ({
      id: p.id,
      chips: p.chips,
      cards: [],
      openIdx: null, // 공개 카드 인덱스 (0 또는 1)
      folded: false,
      allIn: false,
      handBet: 0,
      selected: null, // [i, j]
    }));
    this.carried = Math.max(0, Math.trunc(carried) || 0);
    this.ante = ante;
    this.regame = regame;
    this.deck = deck ? [...deck] : shuffledDeck();
    this.stage = null;
    this.round = null;
    this.result = null;
    this.events = [];
    this.lastAggressor = null;
  }

  // ---- 조회 ----------------------------------------------------------------------
  get pot() {
    return this.carried + this.players.reduce((s, p) => s + p.handBet, 0);
  }
  get isDone() {
    return this.stage === 'done';
  }
  get isBetting() {
    return this.stage === 'bet1' || this.stage === 'bet2';
  }
  get turnPlayerId() {
    return this.isBetting && this.round ? this.round.turnPlayerId : null;
  }
  get dealerId() {
    return this.players[this.dealerIdx].id;
  }
  player(id) {
    return this.players.find((p) => p.id === id) || null;
  }
  alive() {
    return this.players.filter((p) => !p.folded);
  }
  legalActions(id) {
    return this.isBetting && this.round ? this.round.legalActions(id) : [];
  }
  /** 공개패 선택 단계에서 아직 선택하지 않은 플레이어 */
  pendingOpeners() {
    return this.stage === 'open' ? this.players.filter((p) => p.openIdx === null) : [];
  }
  /** 선택 단계에서 아직 선택하지 않은 생존자 */
  pendingSelectors() {
    return this.stage === 'select' ? this.alive().filter((p) => !p.selected) : [];
  }
  flushEvents() {
    const ev = this.events;
    this.events = [];
    return ev;
  }
  _emit(ev) {
    this.events.push(ev);
  }

  // ---- 진행 ----------------------------------------------------------------------
  start() {
    if (this.stage !== null) throw new Error('이미 시작됨');
    if (this.ante) {
      for (const p of this.players) {
        const ante = Math.min(this.base, p.chips);
        p.chips -= ante;
        p.handBet += ante;
      }
    }
    for (const p of this.players) if (p.chips === 0) p.allIn = true;
    this._emit({ type: 'ante', amount: this.ante ? this.base : 0, carried: this.carried, pot: this.pot, regame: this.regame });
    // 2장 분배
    for (let k = 0; k < 2; k++) for (const p of this.players) p.cards.push(this.deck.shift());
    this._emit({ type: 'deal', stage: 'deal2' });
    if (this.settings.openCard === 'choose') {
      this.stage = 'open';
      this._emit({ type: 'stage', stage: 'open' });
    } else {
      for (const p of this.players) p.openIdx = 1;
      this._emit({ type: 'open', open: this.players.map((p) => ({ id: p.id, card: p.cards[1] })) });
      this._startRound('bet1');
    }
    return this;
  }

  /** 공개할 카드 선택 (openCard === 'choose') */
  chooseOpen(id, idx) {
    if (this.stage !== 'open') return { ok: false, error: 'not_opening' };
    const p = this.player(id);
    if (!p) return { ok: false, error: 'not_in_hand' };
    if (p.openIdx !== null) return { ok: false, error: 'already_chosen' };
    if (idx !== 0 && idx !== 1) return { ok: false, error: 'bad_selection' };
    p.openIdx = idx;
    this._emit({ type: 'open_chosen', playerId: id });
    if (this.pendingOpeners().length === 0) this._finishOpen();
    return { ok: true };
  }

  /** 공개패 선택 타임아웃: 미선택자는 2번째 카드 자동 공개 */
  timeoutOpen() {
    for (const p of this.pendingOpeners()) {
      p.openIdx = 1;
      this._emit({ type: 'timeout', playerId: p.id, stage: 'open', auto: 'open' });
    }
    if (this.stage === 'open' && this.pendingOpeners().length === 0) this._finishOpen();
  }

  _finishOpen() {
    this._emit({ type: 'open', open: this.players.map((p) => ({ id: p.id, card: p.cards[p.openIdx] })) });
    this._startRound('bet1');
  }

  _startRound(stage) {
    this.stage = stage;
    const folded = new Set(this.players.filter((p) => p.folded).map((p) => p.id));
    const allIn = new Set(this.players.filter((p) => p.allIn).map((p) => p.id));
    const allInFrom = this.settings.allInFrom;
    const allowAllIn = allInFrom === 'bet1' || (allInFrom === 'bet2' && stage === 'bet2');
    this.round = new BettingRound({
      players: this.players.map((p) => ({ id: p.id, chips: p.chips })),
      pot: this.pot,
      base: this.base,
      maxRaises: this.settings.maxRaises,
      firstIdx: this.dealerIdx,
      alreadyFolded: folded,
      alreadyAllIn: allIn,
      allowAllIn,
    });
    this._emit({ type: 'stage', stage });
    if (this.round.over) this._afterRound();
    else this._emit({ type: 'turn', playerId: this.round.turnPlayerId, stage });
  }

  /** 베팅 액션 */
  act(id, kind) {
    if (!this.isBetting) return { ok: false, error: 'not_betting' };
    const res = this.round.act(id, kind);
    if (!res.ok) return res;
    const p = this.player(id);
    const rp = this.round.player(id);
    p.chips = rp.chips;
    p.handBet += res.action.pay;
    if (rp.folded) p.folded = true;
    if (rp.allIn) p.allIn = true;
    if (res.action.raise) this.lastAggressor = id;
    this._emit({ type: 'action', stage: this.stage, ...res.action, pot: this.pot });
    if (this.round.over) this._afterRound();
    else this._emit({ type: 'turn', playerId: this.round.turnPlayerId, stage: this.stage });
    return { ok: true, action: res.action };
  }

  /** 베팅 턴 타임아웃: 체크 가능하면 체크, 아니면 다이 */
  timeoutTurn() {
    const id = this.turnPlayerId;
    if (!id) return null;
    const legal = this.legalActions(id);
    const kind = legal.some((a) => a.kind === 'check') ? 'check' : 'die';
    this._emit({ type: 'timeout', playerId: id, stage: this.stage, auto: kind });
    return this.act(id, kind);
  }

  _afterRound() {
    const alive = this.alive();
    if (alive.length === 1) return this._finishByFold(alive[0]);
    if (this.stage === 'bet1') {
      for (const p of this.players) if (!p.folded) p.cards.push(this.deck.shift());
      this._emit({ type: 'deal', stage: 'deal3' });
      return this._startRound('bet2');
    }
    if (this.stage === 'bet2') {
      this.stage = 'select';
      this.round = null;
      this._emit({ type: 'stage', stage: 'select' });
    }
  }

  /** 최종 2장 선택 (idx: 0..2 두 개) */
  select(id, idx) {
    if (this.stage !== 'select') return { ok: false, error: 'not_selecting' };
    const p = this.player(id);
    if (!p || p.folded) return { ok: false, error: 'not_in_hand' };
    if (p.selected) return { ok: false, error: 'already_selected' };
    if (!Array.isArray(idx) || idx.length !== 2 || idx[0] === idx[1] || idx.some((i) => ![0, 1, 2].includes(i)))
      return { ok: false, error: 'bad_selection' };
    p.selected = [Math.min(idx[0], idx[1]), Math.max(idx[0], idx[1])];
    this._emit({ type: 'select', playerId: id });
    if (this.pendingSelectors().length === 0) this._showdown();
    return { ok: true };
  }

  /** 선택 타임아웃: 미선택자 전원 자동 선택(기본 랭크 최고 조합) */
  timeoutSelect() {
    for (const p of this.pendingSelectors()) {
      p.selected = bestPair(p.cards);
      this._emit({ type: 'timeout', playerId: p.id, stage: 'select', auto: 'select' });
      this._emit({ type: 'select', playerId: p.id, auto: true });
    }
    if (this.stage === 'select' && this.pendingSelectors().length === 0) this._showdown();
  }

  /** 플레이어가 판 도중 나갔을 때: 베팅 중이면 다이, 선택 중이면 자동 선택, 공개 선택 중이면 자동 공개 */
  forceLeave(id) {
    const p = this.player(id);
    if (!p || this.isDone) return;
    if (this.stage === 'open') {
      if (p.openIdx === null) p.openIdx = 1;
      if (this.pendingOpeners().length === 0) this._finishOpen();
      return;
    }
    if (this.isBetting && !p.folded) {
      // 내 턴이면 즉시 다이. 턴이 아니면 Room 이 턴이 돌아올 때 forceLeave 를 다시 호출한다.
      if (this.turnPlayerId === id) {
        this._emit({ type: 'leave_fold', playerId: id });
        this.act(id, 'die');
      }
      return;
    }
    if (this.stage === 'select' && !p.folded && !p.selected) {
      p.selected = bestPair(p.cards);
      this._emit({ type: 'select', playerId: id, auto: true });
      if (this.pendingSelectors().length === 0) this._showdown();
    }
  }

  _finishByFold(winner) {
    const amount = this.pot;
    winner.chips += amount;
    this.stage = 'done';
    this.round = null;
    this.result = {
      type: 'fold',
      reason: null,
      winners: [winner.id],
      dealerNext: winner.id,
      pots: [{ amount, eligible: [winner.id], winner: winner.id, tie: false }],
      payouts: { [winner.id]: amount },
      reveals: {},
      specials: [],
      carriedNext: 0,
      regameNext: null,
      pot: amount,
    };
    this._emit({ type: 'result', result: this.result });
  }

  _showdown() {
    const alive = this.alive();
    const entries = alive.map((p) => ({ id: p.id, cards: [p.cards[p.selected[0]], p.cards[p.selected[1]]] }));
    const rules = this.settings.rules || {};
    const reveals = {};
    for (const e of entries) reveals[e.id] = { cards: e.cards, hand: evaluate(e.cards[0], e.cards[1]) };

    // 1) 구사/멍텅구리구사 판정은 쇼다운 참가자 전체로 1회 → 판 전체 재경기
    const overall = resolveShowdown(entries, rules);
    if (overall.regame && overall.reason !== 'tie') {
      return this._finishRegame(overall.reason, reveals, overall.specials, overall.effective, alive.map((p) => p.id));
    }

    // 2) 팟별 해결 (메인팟 → 사이드팟)
    const contribs = new Map(this.players.map((p) => [p.id, p.handBet]));
    const folded = new Set(this.players.filter((p) => p.folded).map((p) => p.id));
    const pots = buildPots(contribs, folded, this.carried);
    const payouts = {};
    let carriedNext = 0;
    const tiedSet = new Set();
    const potResults = [];
    const allSpecials = [];
    let effective = overall.effective;
    for (const pot of pots) {
      const sub = entries.filter((e) => pot.eligible.includes(e.id));
      const r = sub.length === 1 ? { regame: false, winners: [sub[0].id], tied: [], specials: [] } : resolveShowdown(sub, rules);
      allSpecials.push(...(r.specials || []));
      if (sub.length === entries.length && r.effective) effective = r.effective;
      if (r.regame) {
        carriedNext += pot.amount;
        for (const id of r.tied) tiedSet.add(id);
        potResults.push({ amount: pot.amount, eligible: pot.eligible, winner: null, tie: true, tied: r.tied });
      } else {
        const w = r.winners[0];
        payouts[w] = (payouts[w] || 0) + pot.amount;
        potResults.push({ amount: pot.amount, eligible: pot.eligible, winner: w, tie: false, tied: [] });
      }
    }
    for (const [id, amt] of Object.entries(payouts)) this.player(id).chips += amt;

    this.stage = 'done';
    const winners = [...new Set(potResults.filter((p) => p.winner).map((p) => p.winner))];
    const mainTie = potResults[0]?.tie === true;
    const allTie = potResults.every((p) => p.tie);
    this.result = {
      type: allTie ? 'regame' : 'showdown',
      reason: allTie ? 'tie' : null,
      winners,
      // 다음 판 선: 메인팟 승자. 메인팟이 동점이면 선 유지(null)
      dealerNext: mainTie ? null : potResults[0]?.winner ?? null,
      pots: potResults,
      payouts,
      reveals,
      effective,
      specials: dedupeSpecials(allSpecials),
      carriedNext,
      regameNext: carriedNext > 0 ? { reason: 'tie', participants: [...tiedSet] } : null,
      pot: this.pot,
    };
    this._emit({ type: 'result', result: this.result });
  }

  _finishRegame(reason, reveals, specials, effective, participants) {
    this.stage = 'done';
    this.result = {
      type: 'regame',
      reason,
      winners: [],
      dealerNext: null,
      pots: [],
      payouts: {},
      reveals,
      effective,
      specials,
      carriedNext: this.pot,
      regameNext: { reason, participants },
      pot: this.pot,
    };
    this._emit({ type: 'result', result: this.result });
  }

  // ---- 뷰 ------------------------------------------------------------------------
  /** viewerId 기준으로 비공개 정보를 가린 뷰 */
  view(viewerId) {
    const reveals = this.result?.reveals || {};
    return {
      no: this.no,
      stage: this.stage,
      regame: this.regame,
      dealerId: this.dealerId,
      turnId: this.turnPlayerId,
      lastAggressor: this.lastAggressor,
      pot: this.pot,
      carried: this.carried,
      cur: this.round ? this.round.cur : 0,
      legal: this.turnPlayerId === viewerId ? this.legalActions(viewerId) : [],
      players: this.players.map((p) => {
        const mine = p.id === viewerId;
        const revealed = reveals[p.id];
        return {
          id: p.id,
          chips: p.chips,
          handBet: p.handBet,
          roundBet: this.round ? this.round.player(p.id)?.roundBet ?? 0 : 0,
          folded: p.folded,
          allIn: p.allIn,
          openIdx: p.openIdx,
          cards: p.cards.map((c, i) => {
            const isOpen = p.openIdx !== null && i === p.openIdx;
            if (mine) return { id: c, open: isOpen };
            if (isOpen) return { id: c, open: true };
            if (revealed && revealed.cards.includes(c)) return { id: c, open: true };
            return { hidden: true, open: false };
          }),
          selected: mine ? p.selected : null,
          hasSelected: Boolean(p.selected),
          hasChosenOpen: p.openIdx !== null,
          reveal: revealed
            ? { cards: revealed.cards, hand: { name: revealed.hand.name, rank: revealed.hand.rank, category: revealed.hand.category, flags: revealed.hand.flags } }
            : null,
        };
      }),
      result: this.result,
    };
  }
}

function dedupeSpecials(list) {
  const seen = new Set();
  const out = [];
  for (const s of list) {
    const k = `${s.id}:${s.kind}:${s.success}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
