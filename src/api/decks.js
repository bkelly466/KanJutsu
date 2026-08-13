/**
 * Deck and Card data access.
 *
 * Every AppSync call for the flashcards feature lives here, along with the
 * translation between what the API stores and what the app uses. Same seam
 * src/api/words.js draws around Jisho: nothing above this file knows that a
 * Card is a DynamoDB record, and nothing in this file knows about React.
 *
 * The reason it's a plain module rather than living in the hook that calls it:
 * the AWSJSON rule below is a hard rule that has already shipped broken once
 * (commit 523c9b4 — Create Deck failed silently), and this project's test suite
 * runs in Node with no DOM. A plain module can be tested; a hook can't.
 *
 * **The AWSJSON rule.** `Deck.category` and `Card.back` are `a.json()` fields.
 * The Amplify client does NOT serialize them: they must be JSON.stringify-ed on
 * write and JSON.parse-ed on read, every time. `toModelInput` and `toUiCard`
 * are the only two places that happens, and decks.test.js asserts the round
 * trip rather than each half — the bug that shipped was a mismatch BETWEEN the
 * two halves, which testing them separately would not have caught.
 *
 * **Failures throw**, following the convention set by words.js and sentence.js:
 * `error.message` is copy that can go straight in front of the user,
 * `error.cause` carries the technical detail for devtools, and `error.code` is
 * one of the two codes in utils/writeFailure.js. Callers never have to inspect
 * an `errors` array or decide what to say.
 */

import { generateClient } from 'aws-amplify/data';
import { createCard } from '../utils/card';
import { getDefaultSRSState } from '../utils/srs';
import { classifyWriteFailure } from '../utils/writeFailure';

/**
 * The Amplify data client, created on first use and reused after.
 *
 * Lazy on purpose, and it must stay that way: src/main.jsx calls
 * `Amplify.configure(outputs)` AFTER its import block, so a `generateClient()`
 * at module scope would run against an unconfigured Amplify. (This is why the
 * old code hid the call inside a `useMemo`.)
 */
let client = null;

function getClient() {
  if (!client) client = generateClient();
  return client;
}

/** Drop the memoized client. Exists for tests; nothing in the app needs it. */
export function resetDecksClient() {
  client = null;
}

/* -------------------------------------------------------------------------- */
/* Reading                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Every Deck the signed-in user owns, with its Cards already attached.
 *
 * One function rather than two lists plus a join at the call site, because the
 * join is where `Deck.category` gets parsed — half of the AWSJSON round trip,
 * and not something a component should be holding.
 *
 * Note what this deliberately does NOT do: throw on an `errors` array. AppSync
 * can return usable rows alongside a partial error, and the previous behaviour
 * was to render what came back. Turning that into a hard failure would take a
 * degraded read and make it a blank screen. Network-level failures still throw.
 */
export async function listDecks() {
  try {
    const [decksRes, cardsRes] = await Promise.all([
      getClient().models.Deck.list(),
      getClient().models.Card.list(),
    ]);

    const cards = (cardsRes.data || []).map(toUiCard);

    return (decksRes.data || []).map((record) => ({
      id: record.id,
      name: record.name,
      description: record.description || '',
      category: parseJson(record.category) || { type: 'custom', value: '' },
      createdAt: record.createdAt,
      cards: cards.filter((card) => card.deckId === record.id),
    }));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/* -------------------------------------------------------------------------- */
/* Writing                                                                    */
/*                                                                            */
/* Each write below takes the target Deck's OWN cards where it needs them,    */
/* rather than the whole card list. Passing them in (instead of querying)     */
/* keeps every write to a single round trip and makes the dedupe and cascade  */
/* rules testable with a plain array. It also makes the staleness honest: the */
/* cards are a snapshot from before the call, which is exactly why two fast   */
/* taps can both see "not there yet" — see CardDetailModal's handleCopy.      */
/* -------------------------------------------------------------------------- */

/** Create a Deck. Resolves with the new Deck's id. */
export async function createDeck({ name, description, category }) {
  try {
    const res = await getClient().models.Deck.create({
      name,
      description: description || '',
      category: JSON.stringify(category || { type: 'custom', value: '' }),
    });
    throwIfErrors(res);
    return res.data.id;
  } catch (cause) {
    throw toFailure(cause);
  }
}

/** Update a Deck's name, description or category. */
export async function updateDeck(deckId, updates) {
  try {
    const payload = { id: deckId, ...updates };
    // Callers pass `category` as an object; the schema wants AWSJSON. Guarded
    // by a type check so an already-serialized value isn't double-encoded.
    if (payload.category != null && typeof payload.category !== 'string') {
      payload.category = JSON.stringify(payload.category);
    }
    throwIfErrors(await getClient().models.Deck.update(payload));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/**
 * Delete a Deck and every Card in it.
 *
 * There's no cascade in the schema, so it happens here — and the ORDER is the
 * whole point. Every Card must be confirmed gone before the Deck goes: delete
 * the Deck first and a failed Card delete leaves orphans that no longer belong
 * to anything, so they're invisible in the UI and impossible to remove.
 *
 * @param {string} deckId
 * @param {Array}  cards   that Deck's Cards
 */
export async function deleteDeck(deckId, cards = []) {
  try {
    const results = await Promise.all(
      cards.map((card) => getClient().models.Card.delete({ id: card.id })),
    );
    // delete() reports failure via `errors` rather than throwing, so an
    // unchecked response would look exactly like a success.
    results.forEach(throwIfErrors);

    throwIfErrors(await getClient().models.Deck.delete({ id: deckId }));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/**
 * Build a Card from a kanji or word lookup and add it to a Deck.
 *
 * Adding something already in the Deck is a no-op, not an error: the user's
 * intent ("this should be in that deck") is satisfied either way, so the UI
 * shows the same "✓ Added" state.
 *
 * @param {string} deckId
 * @param {object} item    kanji data or normalised word data
 * @param {'kanji'|'word'} type
 * @param {Array}  cards   that Deck's Cards, for the dedupe check
 */
export async function addCardToDeck(deckId, item, type = 'kanji', cards = []) {
  try {
    const built = createCard(item, type);
    if (cards.some((card) => card.key === built.key)) return;

    throwIfErrors(await getClient().models.Card.create(toModelInput(deckId, built)));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/**
 * Copy an EXISTING Card into another Deck.
 *
 * addCardToDeck can't be reused: it takes raw lookup data and runs it through
 * createCard, which we no longer have for a saved Card. This goes through
 * toModelInput instead, which already accepts the built-card shape.
 *
 * The copy starts with fresh SRS state — a different Deck is a separate study
 * context, so inheriting the original's streak would misrepresent it.
 */
export async function copyCardToDeck(targetDeckId, card, cards = []) {
  try {
    if (cards.some((existing) => existing.key === card.key)) return;

    const fresh = {
      ...card,
      ...getDefaultSRSState(),
      addedAt: new Date().toISOString(),
    };
    throwIfErrors(await getClient().models.Card.create(toModelInput(targetDeckId, fresh)));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/** Remove a single Card. */
export async function removeCardFromDeck(cardId) {
  try {
    throwIfErrors(await getClient().models.Card.delete({ id: cardId }));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/** Write a Card's SRS state after a review. */
export async function updateCardSRS(cardId, srsMetrics) {
  try {
    throwIfErrors(await getClient().models.Card.update({ id: cardId, ...srsMetrics }));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/**
 * Update non-SRS Card fields (currently the custom definition in `back`).
 *
 * Separate from updateCardSRS because `back` is an a.json() field and has to be
 * stringified, exactly as updateDeck does for `category`.
 */
export async function updateCard(cardId, updates) {
  try {
    const payload = { id: cardId, ...updates };
    if (payload.back != null && typeof payload.back !== 'string') {
      payload.back = JSON.stringify(payload.back);
    }
    throwIfErrors(await getClient().models.Card.update(payload));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The Amplify client reports failures via an `errors` array on the response
 * instead of throwing. Collapse that into a thrown Error so a single catch can
 * cover both failure styles.
 */
function throwIfErrors({ errors } = {}) {
  if (errors) throw new Error(errors.map((e) => e.message).join('; '));
}

/**
 * Wrap whatever went wrong in the error shape this module promises: a
 * user-facing `message`, the original on `cause`, and a `code`. Reads use it
 * too, which is why it is not called writeError.
 */
function toFailure(cause) {
  const { code, message } = classifyWriteFailure(cause);
  const error = new Error(message, { cause });
  error.code = code;
  return error;
}

/**
 * Parse an a.json() (AWSJSON) value read back from the API. AppSync returns it
 * as a JSON string; an already-parsed object is handled defensively too.
 */
function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

/** Map a built card (from createCard) to a Card model record. */
function toModelInput(deckId, card) {
  return {
    deckId,
    type: card.type,
    cardKey: card.key,
    front: card.front,
    back: JSON.stringify(card.back ?? {}), // a.json() (AWSJSON) must be a string
    kanji: card.kanji ?? null,
    word: card.word ?? null,
    reading: card.reading ?? null,
    // Card.jlpt is a string in the schema; kanji cards carry a number (e.g. 5).
    jlpt: card.jlpt != null ? String(card.jlpt) : null,
    grade: card.grade ?? null,
    repetitions: card.repetitions,
    easeFactor: card.easeFactor,
    interval: card.interval,
    nextReviewDate: card.nextReviewDate,
    lastReviewedDate: card.lastReviewedDate ?? null,
    addedAt: card.addedAt,
  };
}

/** Map a Card model record back to the shape the components/SRS expect. */
function toUiCard(record) {
  return {
    id: record.id,
    // Kept so listDecks can attach each Card to its Deck. Nothing downstream
    // reads it — a Card is always reached through the Deck it's nested in.
    deckId: record.deckId,
    type: record.type,
    key: record.cardKey,
    front: record.front,
    back: parseJson(record.back) || {},
    kanji: record.kanji,
    word: record.word,
    reading: record.reading,
    jlpt: record.jlpt,
    grade: record.grade,
    repetitions: record.repetitions ?? 0,
    easeFactor: record.easeFactor ?? 2.5,
    interval: record.interval ?? 0,
    nextReviewDate: record.nextReviewDate,
    // Null on Cards that have never been reviewed, and on any Card created
    // before this field was added to the schema.
    lastReviewedDate: record.lastReviewedDate ?? null,
    addedAt: record.addedAt,
  };
}
