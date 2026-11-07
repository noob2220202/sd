// 칩 금액 포매팅. 서버/클라이언트 공용. 의존성 없음.

/** 1234567 → '1,234,567' */
export function formatChips(n) {
  const v = Math.trunc(Number(n) || 0);
  const sign = v < 0 ? '-' : '';
  return sign + String(Math.abs(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 공간이 좁은 곳용 축약 표기.
 *  1,234 → '1,234'  /  12,345 → '1.2만'  /  1,234,567 → '123만'  /  123,456,789 → '1.2억'
 * 절삭(내림) 기준이며, 정확한 금액은 formatChips 로 보여준다.
 */
export function formatCompact(n) {
  const v = Math.trunc(Number(n) || 0);
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 100_000_000) return sign + trimUnit(abs / 100_000_000) + '억';
  if (abs >= 10_000) return sign + trimUnit(abs / 10_000) + '만';
  return formatChips(v);
}

function trimUnit(x) {
  if (x >= 100) return formatChips(Math.floor(x));
  if (x >= 10) return (Math.floor(x * 10) / 10).toFixed(1).replace(/\.0$/, '');
  return (Math.floor(x * 100) / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** 부호 포함 손익 표기: +1,000 / -500 / 0 */
export function formatSigned(n) {
  const v = Math.trunc(Number(n) || 0);
  if (v > 0) return '+' + formatChips(v);
  return formatChips(v);
}
