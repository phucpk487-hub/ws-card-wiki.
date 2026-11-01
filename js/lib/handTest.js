// Test hand: shuffle the deck, draw 5, optionally mulligan once, then draw more cards. Pure logic (no DOM); `rng` can be seeded for tests.
export const HAND = 5;

export function shuffle(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** numbers: every card of the deck, one entry per copy. */
export function startGame(numbers, rng = Math.random) {
  const deck = shuffle(numbers, rng);
  return { deck: deck.slice(HAND), hand: deck.slice(0, HAND), waiting: [], mulliganed: false };
}

/** Weiss Schwarz mulligan: pick any number of cards in hand, they go to the waiting room, and you draw as many new ones. Once per game. */
export function mulligan(state, picks) {
  const out = new Set(picks);
  if (state.mulliganed || !out.size) return state;
  const keep = state.hand.filter((_, i) => !out.has(i)), gone = state.hand.filter((_, i) => out.has(i));
  const take = Math.min(gone.length, state.deck.length);
  return { deck: state.deck.slice(take), hand: [...keep, ...state.deck.slice(0, take)], waiting: [...state.waiting, ...gone], mulliganed: true };
}

export function draw(state) {
  if (!state.deck.length) return state;
  return { ...state, deck: state.deck.slice(1), hand: [...state.hand, state.deck[0]] };
}

/** How many of each kind are in `numbers`, for the summary line. */
export function summarize(numbers, byNumber) {
  const s = { 'Level 0': 0, 'Level 1': 0, 'Level 2': 0, 'Level 3': 0, Events: 0, Climax: 0, Unknown: 0 };
  for (const n of numbers) {
    const c = byNumber.get(n);
    if (!c) s.Unknown++; else if (c.type === 'Climax') s.Climax++; else if (c.type === 'Event') s.Events++; else s[`Level ${Math.min(3, Math.max(0, c.level ?? 0))}`]++;
  }
  return s;
}
