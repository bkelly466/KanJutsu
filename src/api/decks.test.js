import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SESSION_EXPIRED, SYNC_FAILED } from '../utils/writeFailure';

/**
 * The Amplify data client, faked.
 *
 * vi.hoisted runs before the vi.mock factory and before the import of ./decks,
 * so `models` is guaranteed to exist by the time anything reaches for it.
 * Nothing here talks to AppSync; these tests are about the rules this module
 * enforces on the way in and out.
 */
const { models } = vi.hoisted(() => ({
  models: {
    Deck: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    Card: { list: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}));

vi.mock('aws-amplify/data', () => ({ generateClient: () => ({ models }) }));

const {
  listDecks,
  createDeck,
  updateDeck,
  deleteDeck,
  addCardToDeck,
  copyCardToDeck,
  removeCardFromDeck,
  updateCard,
  updateCardSRS,
  resetDecksClient,
} = await import('./decks');

const KANJI_ITEM = {
  kanji: '食',
  meanings: ['eat', 'food'],
  on_readings: ['ショク'],
  kun_readings: ['た.べる'],
  jlpt: 5,
  grade: 2,
};

const WORD_ITEM = {
  word: '猫',
  reading: 'ねこ',
  meanings: ['cat'],
  partsOfSpeech: ['Noun'],
  jlpt: ['N5'],
};

beforeEach(() => {
  vi.clearAllMocks();
  resetDecksClient();
  models.Deck.list.mockResolvedValue({ data: [] });
  models.Card.list.mockResolvedValue({ data: [] });
  models.Deck.create.mockResolvedValue({ data: { id: 'deck-1' } });
  models.Card.create.mockResolvedValue({ data: { id: 'card-1' } });
  models.Deck.update.mockResolvedValue({ data: {} });
  models.Card.update.mockResolvedValue({ data: {} });
  models.Deck.delete.mockResolvedValue({ data: {} });
  models.Card.delete.mockResolvedValue({ data: {} });
});

/* -------------------------------------------------------------------------- */

describe('the AWSJSON round trip', () => {
  // This is the bug that shipped (commit 523c9b4): a.json() fields must be
  // stringified on write and parsed on read, and the two halves have to agree.
  // Asserting them separately would not have caught a mismatch BETWEEN them,
  // so each test here writes a value and reads the same value back.

  it('sends Deck.category as a JSON string and reads it back as an object', async () => {
    const category = { type: 'jlpt', value: 'N5' };
    await createDeck({ name: 'JLPT N5', description: '', category });

    const written = models.Deck.create.mock.calls[0][0];
    expect(typeof written.category).toBe('string');

    models.Deck.list.mockResolvedValue({
      data: [{ id: 'deck-1', name: 'JLPT N5', ...written }],
    });
    const [deck] = await listDecks();

    expect(deck.category).toEqual(category);
  });

  it('sends Card.back as a JSON string and reads it back as an object', async () => {
    await addCardToDeck('deck-1', KANJI_ITEM, 'kanji', []);

    const written = models.Card.create.mock.calls[0][0];
    expect(typeof written.back).toBe('string');

    models.Deck.list.mockResolvedValue({ data: [{ id: 'deck-1', name: 'D' }] });
    models.Card.list.mockResolvedValue({ data: [{ id: 'card-1', ...written }] });
    const [deck] = await listDecks();

    expect(deck.cards[0].back).toEqual({
      meanings: 'eat, food',
      onyomi: 'ショク',
      kunyomi: 'た.べる',
    });
  });

  it('defaults an unparseable back to an empty object rather than throwing', async () => {
    models.Deck.list.mockResolvedValue({ data: [{ id: 'deck-1', name: 'D' }] });
    models.Card.list.mockResolvedValue({
      data: [{ id: 'card-1', deckId: 'deck-1', back: 'not json' }],
    });

    const [deck] = await listDecks();
    expect(deck.cards[0].back).toEqual({});
  });

  it('stringifies a category on update, not just on create', async () => {
    await updateDeck('deck-1', { category: { type: 'jlpt', value: 'N4' } });
    const written = models.Deck.update.mock.calls[0][0];
    expect(written.id).toBe('deck-1');
    expect(written.category).toBe('{"type":"jlpt","value":"N4"}');
  });

  it('does not double-encode a category that is already a string', async () => {
    await updateDeck('deck-1', { category: '{"type":"custom","value":"x"}' });
    expect(models.Deck.update.mock.calls[0][0].category).toBe('{"type":"custom","value":"x"}');
  });
});

describe('failures the client reports without throwing', () => {
  // create/update/delete resolve with an `errors` array instead of rejecting,
  // so an unchecked response looks exactly like a success. This is what made
  // Create Deck fail silently.
  it('turns an errors array into a thrown sync failure', async () => {
    models.Deck.create.mockResolvedValue({
      data: null,
      errors: [{ message: 'Variable category has an invalid value' }],
    });

    const error = await createDeck({ name: 'D' }).catch((e) => e);

    expect(error.code).toBe(SYNC_FAILED);
    expect(error.message).toBe('Something went wrong syncing with the cloud. Please try again.');
    // The technical detail is preserved for devtools, not shown to the user.
    expect(error.cause.message).toContain('Variable category has an invalid value');
  });

  it('surfaces an expired session as its own code', async () => {
    models.Card.update.mockRejectedValue(new Error('NoSignedUser'));

    const error = await updateCardSRS('card-1', { repetitions: 1 }).catch((e) => e);

    expect(error.code).toBe(SESSION_EXPIRED);
    expect(error.message).toBe('Your session expired. Please sign out and sign in again.');
  });

  it('reads leniently — a partial list still renders what came back', async () => {
    // AppSync can return usable rows alongside an error. Throwing here would
    // turn a degraded read into a blank screen.
    models.Deck.list.mockResolvedValue({
      data: [{ id: 'deck-1', name: 'D' }],
      errors: [{ message: 'partial failure' }],
    });

    await expect(listDecks()).resolves.toHaveLength(1);
  });
});

describe('deleteDeck', () => {
  it('deletes every card before the deck', async () => {
    await deleteDeck('deck-1', [{ id: 'card-1' }, { id: 'card-2' }]);

    expect(models.Card.delete).toHaveBeenCalledTimes(2);
    expect(models.Deck.delete).toHaveBeenCalledWith({ id: 'deck-1' });
  });

  it('leaves the deck alone when a card delete fails', async () => {
    // Order is the whole point: deleting the deck first would strand the
    // surviving card under a deck that no longer exists, making it invisible
    // in the UI and impossible to remove.
    models.Card.delete.mockResolvedValueOnce({ errors: [{ message: 'denied' }] });

    await expect(deleteDeck('deck-1', [{ id: 'card-1' }, { id: 'card-2' }])).rejects.toThrow();

    expect(models.Deck.delete).not.toHaveBeenCalled();
  });
});

describe('dedupe', () => {
  it('does not add a card the deck already has', async () => {
    await addCardToDeck('deck-1', KANJI_ITEM, 'kanji', [{ key: '食' }]);
    expect(models.Card.create).not.toHaveBeenCalled();
  });

  it('adds a card the deck does not have', async () => {
    await addCardToDeck('deck-1', KANJI_ITEM, 'kanji', [{ key: '水' }]);
    expect(models.Card.create).toHaveBeenCalledTimes(1);
  });

  it('does not copy a card the target deck already has', async () => {
    await copyCardToDeck('deck-2', { key: '食', type: 'kanji' }, [{ key: '食' }]);
    expect(models.Card.create).not.toHaveBeenCalled();
  });
});

describe('copyCardToDeck', () => {
  it('starts the copy on fresh SRS state', async () => {
    // A different deck is a separate study context, so inheriting the
    // original's streak would misrepresent it.
    const studied = {
      key: '食',
      type: 'kanji',
      front: '食',
      back: { meanings: 'eat' },
      repetitions: 7,
      easeFactor: 2.9,
      interval: 45,
      lastReviewedDate: '2026-01-01T00:00:00.000Z',
      addedAt: '2025-01-01T00:00:00.000Z',
    };

    await copyCardToDeck('deck-2', studied, []);

    const written = models.Card.create.mock.calls[0][0];
    expect(written).toMatchObject({
      deckId: 'deck-2',
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      lastReviewedDate: null,
    });
    expect(written.addedAt).not.toBe(studied.addedAt);
  });
});

describe('mapping between the schema and the app', () => {
  it('coerces a numeric kanji jlpt to the string the schema wants', async () => {
    await addCardToDeck('deck-1', KANJI_ITEM, 'kanji', []);
    expect(models.Card.create.mock.calls[0][0].jlpt).toBe('5');
  });

  it('keeps a word card as its own type', async () => {
    await addCardToDeck('deck-1', WORD_ITEM, 'word', []);

    const written = models.Card.create.mock.calls[0][0];
    expect(written.type).toBe('word');
    expect(written.cardKey).toBe('猫::ねこ');
    expect(written.word).toBe('猫');
    expect(written.reading).toBe('ねこ');
  });

  it('fills in defaults for a card that has never been reviewed', async () => {
    models.Deck.list.mockResolvedValue({ data: [{ id: 'deck-1', name: 'D' }] });
    models.Card.list.mockResolvedValue({
      data: [{ id: 'card-1', deckId: 'deck-1', cardKey: '食', front: '食' }],
    });

    const [deck] = await listDecks();

    expect(deck.cards[0]).toMatchObject({
      repetitions: 0,
      easeFactor: 2.5,
      interval: 0,
      lastReviewedDate: null,
    });
  });

  it('attaches each card to its own deck', async () => {
    models.Deck.list.mockResolvedValue({
      data: [{ id: 'deck-1', name: 'A' }, { id: 'deck-2', name: 'B' }],
    });
    models.Card.list.mockResolvedValue({
      data: [
        { id: 'card-1', deckId: 'deck-1', cardKey: '食' },
        { id: 'card-2', deckId: 'deck-2', cardKey: '水' },
        { id: 'card-3', deckId: 'deck-2', cardKey: '火' },
      ],
    });

    const [a, b] = await listDecks();

    expect(a.cards.map((c) => c.key)).toEqual(['食']);
    expect(b.cards.map((c) => c.key)).toEqual(['水', '火']);
  });

  it('gives a deck without a category the custom default', async () => {
    models.Deck.list.mockResolvedValue({ data: [{ id: 'deck-1', name: 'D' }] });
    const [deck] = await listDecks();
    expect(deck.category).toEqual({ type: 'custom', value: '' });
  });
});

describe('updateCard', () => {
  it('stringifies back, exactly as updateDeck does for category', async () => {
    await updateCard('card-1', { back: { meanings: 'my own words' } });

    const written = models.Card.update.mock.calls[0][0];
    expect(written.id).toBe('card-1');
    expect(written.back).toBe('{"meanings":"my own words"}');
  });

});

describe('updateCardSRS', () => {
  it('leaves non-json fields alone', async () => {
    await updateCardSRS('card-1', { repetitions: 3, easeFactor: 2.4 });
    expect(models.Card.update).toHaveBeenCalledWith({
      id: 'card-1',
      repetitions: 3,
      easeFactor: 2.4,
    });
  });
});

describe('removeCardFromDeck', () => {
  // Its signature changed from (deckId, cardId) to (cardId) in this refactor —
  // the deck is implied by the card — so the argument shape is worth pinning.
  it('deletes just that card', async () => {
    await removeCardFromDeck('card-1');
    expect(models.Card.delete).toHaveBeenCalledWith({ id: 'card-1' });
  });

  it('throws when the delete comes back with errors', async () => {
    models.Card.delete.mockResolvedValue({ errors: [{ message: 'denied' }] });

    const error = await removeCardFromDeck('card-1').catch((e) => e);

    expect(error.code).toBe(SYNC_FAILED);
    expect(error.cause.message).toContain('denied');
  });
});
