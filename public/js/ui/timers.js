// 타이머 링/카운트다운 갱신 루프. 서버 시간 오프셋을 받아 data-deadline / data-until 요소를 주기적으로 갱신한다.
const CIRC = 2 * Math.PI * 21;

export function startTicker(getOffset) {
  let timer = null;
  function tick() {
    const now = Date.now() + getOffset();
    for (const el of document.querySelectorAll('.ring-fg[data-deadline]')) {
      const deadline = Number(el.dataset.deadline);
      const total = Math.max(1000, Number(el.dataset.total) || 30000);
      const remain = Math.max(0, deadline - now);
      const ratio = Math.min(1, remain / total);
      el.style.strokeDasharray = `${CIRC}`;
      el.style.strokeDashoffset = `${CIRC * (1 - ratio)}`;
      el.classList.toggle('urgent', remain < 5000);
    }
    for (const el of document.querySelectorAll('[data-until]')) {
      const until = Number(el.dataset.until);
      const s = Math.max(0, Math.ceil((until - now) / 1000));
      const text = `${s}초`;
      if (el.textContent !== text) el.textContent = text;
      el.classList.toggle('urgent', s <= 5);
    }
  }
  tick();
  timer = setInterval(tick, 200);
  return () => clearInterval(timer);
}
