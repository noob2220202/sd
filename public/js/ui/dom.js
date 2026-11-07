// 작은 DOM 유틸리티 — 프레임워크 없이 요소를 만들고, 섹션 단위로 "시그니처"가 바뀐 경우에만 다시 그린다.

/**
 * 요소 생성. attrs: class, style(객체/문자열), dataset, on* 핸들러, html(innerHTML), 그 외 속성.
 * children 은 문자열/노드/배열/null 혼합 가능.
 */
export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) {
          if (sk.startsWith('--')) el.style.setProperty(sk, sv);
          else el.style[sk] = sv;
        }
      }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'html') el.innerHTML = v;
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  appendAll(el, children);
  return el;
}

export function appendAll(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** SVG 마크업 문자열 → 요소 */
export function svgEl(markup) {
  const t = document.createElement('template');
  t.innerHTML = markup.trim();
  return t.content.firstElementChild;
}

const SIGS = new WeakMap();

/**
 * 섹션 렌더링: sig 가 직전과 같으면 아무것도 하지 않고 false, 다르면 build() 결과로 자식을 교체하고 true.
 * 타이머 링/카운트다운처럼 매 프레임 바뀌는 값은 sig 에 넣지 않고 data-* 로 따로 갱신한다.
 */
export function section(el, sig, build) {
  const s = typeof sig === 'string' ? sig : JSON.stringify(sig);
  if (SIGS.get(el) === s) return false;
  SIGS.set(el, s);
  const out = build();
  el.replaceChildren();
  appendAll(el, [out]);
  return true;
}

/** 섹션 시그니처 초기화(강제 재렌더용) */
export function resetSection(el) {
  SIGS.delete(el);
}

/** 텍스트가 바뀐 경우에만 갱신 */
export function setText(el, s) {
  if (el && el.textContent !== s) el.textContent = s;
}

/** 클래스 토글 */
export function cls(el, name, on) {
  if (el) el.classList.toggle(name, Boolean(on));
}

/** 이벤트 위임 */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (e) => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}
