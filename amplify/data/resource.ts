import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * KanJutsu flashcard data model.
 *
 * Two models with a one-to-many relationship:
 *   Deck  --< Card        (one deck has many cards)
 *
 * Authorization: every model uses `allow.owner()`, so a signed-in user can only
 * see and modify their OWN decks and cards. Combined with the `userPool` default
 * auth mode below, this means the flashcard data requires login — which is
 * exactly the gating we want (the dictionary stays public because it doesn't use
 * this API at all; it talks to the Jisho/kanji proxies directly).
 */
const schema = a.schema({
  Deck: a
    .model({
      name: a.string().required(),
      description: a.string(),
      // Deck category, e.g. { type: 'jlpt', value: 'N5' }. Kept as JSON so the
      // shape can evolve without a schema migration.
      category: a.json(),
      // One deck has many cards. 'deckId' is the foreign-key field stored on Card.
      cards: a.hasMany('Card', 'deckId'),
    })
    .authorization((allow) => [allow.owner()]),

  Card: a
    .model({
      // Link back to the parent deck (the other side of the relationship).
      deckId: a.id().required(),
      deck: a.belongsTo('Deck', 'deckId'),

      // Card identity / content
      type: a.string().required(), // 'kanji' | 'word'
      cardKey: a.string().required(), // dedupe key: the kanji char, or "word::reading"
      front: a.string().required(),

      // Display payload revealed on flip (meanings, readings, verb forms, etc.).
      // Stored as JSON to mirror the existing card.back shape exactly.
      back: a.json(),

      // Optional metadata used by the UI / SRS
      kanji: a.string(),
      word: a.string(),
      reading: a.string(),
      jlpt: a.string(),
      grade: a.integer(),

      // Spaced-repetition state (SM-2). Defaults make a fresh card due immediately.
      repetitions: a.integer().default(0),
      easeFactor: a.float().default(2.5),
      interval: a.integer().default(0),
      nextReviewDate: a.string(),
      addedAt: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // Require a signed-in Cognito user for all data operations. The dictionary
    // does not use this API, so it remains usable without logging in.
    defaultAuthorizationMode: 'userPool',
  },
});
