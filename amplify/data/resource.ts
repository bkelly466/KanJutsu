import { type ClientSchema, a, defineData } from '@aws-amplify/backend';

/**
 * KanJutsu flashcard data model — one Deck has many Cards.
 *
 * `allow.owner()` on both, plus the `userPool` default below, is what gates the
 * flashcards on login. The dictionary stays public because it never touches
 * this API; it talks to the Jisho and kanji proxies directly.
 */
const schema = a.schema({
  Deck: a
    .model({
      name: a.string().required(),
      description: a.string(),
      // e.g. { type: 'jlpt', value: 'N5' }. JSON so the shape can evolve without
      // a schema migration — and so it must be stringified on write and parsed
      // on read; src/api/decks.js is the only place that happens.
      category: a.json(),
      // 'deckId' is the foreign key stored on Card.
      cards: a.hasMany('Card', 'deckId'),
    })
    .authorization((allow) => [allow.owner()]),

  Card: a
    .model({
      deckId: a.id().required(),
      deck: a.belongsTo('Deck', 'deckId'),

      // Card identity / content
      type: a.string().required(), // 'kanji' | 'word'
      cardKey: a.string().required(), // dedupe key: the kanji char, or "word::reading"
      front: a.string().required(),

      // Revealed on flip: meanings, readings, verb forms. JSON, so the same
      // stringify-on-write / parse-on-read rule as `Deck.category` applies.
      back: a.json(),

      // Optional metadata used by the UI / SRS
      kanji: a.string(),
      word: a.string(),
      reading: a.string(),
      jlpt: a.string(),
      grade: a.integer(),

      // SM-2 state. The defaults make a fresh card due immediately.
      repetitions: a.integer().default(0),
      easeFactor: a.float().default(2.5),
      interval: a.integer().default(0),
      nextReviewDate: a.string(),
      // Null until the first review, and on cards predating this field.
      lastReviewedDate: a.string(),
      addedAt: a.string(),
    })
    .authorization((allow) => [allow.owner()]),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    // A signed-in Cognito user for every data operation.
    defaultAuthorizationMode: 'userPool',
  },
});
