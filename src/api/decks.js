/**
 * Deck and Card data access — every AppSync call for the flashcards feature,
 * plus the translation between what the API stores and what the app uses.
 * Nothing above this file knows a Card is a DynamoDB record; nothing in it
 * knows about React.
 *
 * **The AWSJSON rule.** `Deck.category` and `Card.back` are `a.json()` fields
 * and the Amplify client does NOT serialize them: JSON.stringify on write,
 * JSON.parse on read, every time. `toModelInput` and `toUiCard` are the only
 * two places it happens, and decks.test.js asserts the round trip rather than
 * each half — the bug that shipped in 523c9b4 was a mismatch BETWEEN the halves,
 * which testing them separately would have missed. A plain module rather than a
 * hook so that test can exist at all; this suite runs in Node with no DOM.
 *
 * **Failures throw**, as in words.js and sentence.js: `error.message` is
 * user-facing copy, `error.cause` the technical detail, and `error.code` one of
 * utils/writeFailure.js's two codes. Callers never inspect an `errors` array.
 */

import { generateClient } from 'aws-amplify/data';
import { createCard } from '../utils/card';
import { getDefaultSRSState } from '../utils/srs';
import { classifyWriteFailure } from '../utils/writeFailure';

/**
 * The Amplify data client, created on first use and reused after.
 *
 * Lazy on purpose and must stay that way: src/main.jsx calls
 * `Amplify.configure(outputs)` after its import block, so a `generateClient()`
 * at module scope would run against an unconfigured Amplify.
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
 * One function rather than two lists joined at the call site, because the join
 * is where `Deck.category` gets parsed — half the AWSJSON round trip, and not
 * something a component should hold.
 *
 * Deliberately does NOT throw on an `errors` array: AppSync can return usable
 * rows alongside a partial error, and turning that into a hard failure would
 * make a degraded read a blank screen. Network failures still throw.
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
/* Each write takes the target Deck's OWN cards where it needs them. Passing  */
/* them in rather than querying keeps every write to one round trip and makes */
/* the dedupe and cascade rules testable with a plain array. The staleness is */
/* honest: they are a snapshot from before the call, which is why two fast    */
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
    // Callers pass `category` as an object and the schema wants AWSJSON. The
    // type check stops an already-serialized value being double-encoded.
    if (payload.category != null && typeof payload.category !== 'string') {
      payload.category = JSON.stringify(payload.category);
    }
    throwIfErrors(await getClient().models.Deck.update(payload));
  } catch (cause) {
    throw toFailure(cause);
  }
}

/**
 * Delete a Deck and every Card in it. There is no cascade in the schema, so it
 * happens here, and the ORDER is load-bearing: every Card must be confirmed
 * gone before the Deck is. Delete the Deck first and a failed Card delete
 * leaves orphans belonging to nothing — invisible in the UI and unremovable.
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
    // unchecked response is indistinguishable from a success.
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
 * Copy an EXISTING Card into another Deck. A no-op if the target already holds
 * it, as addCardToDeck is.
 *
 * The copy starts with fresh SRS state: a different Deck is a separate study
 * context, and inheriting the original's streak would misrepresent it.
 *
 * Not addCardToDeck, which needs the raw lookup data a saved Card no longer has.
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
 * Update non-SRS Card fields — currently the custom definition in `back`.
 *
 * Separate from updateCardSRS because `back` is an a.json() field needing the
 * stringify updateDeck does for `category`. A definition edit sent through
 * updateCardSRS would be stored unserialized.
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
 * Whatever went wrong, in the error shape this module promises: a user-facing
 * `message`, the original on `cause`, and a `code`. Reads use it too, which is
 * why it isn't named writeError.
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
