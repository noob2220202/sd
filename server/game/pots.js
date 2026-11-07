// 기여금 → 메인/사이드팟 계산 (표준 레이어 알고리즘)
//
// contribs: Map<playerId, number> 또는 {playerId: number}  — 이 판에 각자 낸 총액(앤티 포함)
// folded:   Set<playerId> | playerId[]                      — 다이한 플레이어
// carried:  이전 판에서 이월된 금액 (메인팟에 합산)
//
// 반환: [{ amount, eligible: string[] }] 메인팟부터. eligible 이 같은 연속 레이어는 병합.
// 비어 있는 eligible(다이한 사람만 걸린 레이어)은 바로 아래 팟에 흡수된다.

export function buildPots(contribs, folded = new Set(), carried = 0) {
  const entries = contribs instanceof Map ? [...contribs.entries()] : Object.entries(contribs);
  const foldedSet = folded instanceof Set ? folded : new Set(folded);
  const players = entries
    .map(([id, amt]) => ({ id, amt: Math.max(0, Math.trunc(amt) || 0) }))
    .filter((p) => p.amt > 0 || !foldedSet.has(p.id));

  const levels = [...new Set(players.map((p) => p.amt).filter((a) => a > 0))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const level of levels) {
    let amount = 0;
    for (const p of players) amount += Math.max(0, Math.min(p.amt, level) - prev);
    const eligible = players.filter((p) => !foldedSet.has(p.id) && p.amt >= level).map((p) => p.id);
    prev = level;
    if (amount === 0) continue;
    if (eligible.length === 0) {
      // 다이한 플레이어들만 남은 레이어 → 아래 팟에 흡수 (아래 팟이 없으면 보류 후 첫 팟에 합산)
      if (pots.length) pots[pots.length - 1].amount += amount;
      else pots.push({ amount, eligible: [] });
      continue;
    }
    const last = pots[pots.length - 1];
    if (last && sameSet(last.eligible, eligible)) last.amount += amount;
    else if (last && last.eligible.length === 0) {
      // 앞서 보류된 무자격 레이어를 첫 유자격 팟에 합산
      last.amount += amount;
      last.eligible = eligible;
    } else pots.push({ amount, eligible });
  }

  const carry = Math.max(0, Math.trunc(carried) || 0);
  if (carry > 0) {
    if (pots.length) pots[0].amount += carry;
    else {
      // 기여금이 전혀 없는 경우(이론상 발생 안 함): 다이하지 않은 전원이 자격
      const eligible = players.filter((p) => !foldedSet.has(p.id)).map((p) => p.id);
      pots.push({ amount: carry, eligible });
    }
  }
  // 메인팟의 eligible 이 비어 있으면(모두 다이) 호출자가 처리하도록 그대로 둔다.
  return pots;
}

function sameSet(a, b) {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

/** 팟 배열의 총액 */
export function totalOfPots(pots) {
  return pots.reduce((s, p) => s + p.amount, 0);
}
