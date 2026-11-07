// 서버용 덱: 공용 정의 + 암호학적 난수 셔플
import { randomInt } from 'node:crypto';
import { DECK, cardById, isCardId } from '../../public/js/shared/cards.js';

export { DECK, cardById, isCardId };

/** Fisher–Yates (crypto.randomInt). 새 배열(카드 ID) 반환 */
export function shuffledDeck() {
  const ids = DECK.map((c) => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
