import { describe, it, expect } from 'vitest';
import { sourceKey, getCardKey, createCard, createWordCard } from './card';

const sampleKanji = {
  kanji: '水',
  meanings: ['water'],
  on_readings: ['スイ'],
  kun_readings: ['みず'],
  jlpt: 5,
  grade: 1,
};

const sampleWord = {
  word: '食べる',
  reading: 'たべる',
  meanings: ['to eat'],
  jlpt: ['N5'],
  senses: [{ definitions: ['to eat'], partsOfSpeech: ['Ichidan verb'] }],
};

describe('sourceKey', () => {
  it('uses the character itself for kanji items', () => {
    expect(sourceKey(sampleKanji, 'kanji')).toBe('水');
  });

  it('combines word and reading for word items', () => {
    expect(sourceKey(sampleWord, 'word')).toBe('食べる::たべる');
  });
});

describe('getCardKey', () => {
  it('returns the card key', () => {
    expect(getCardKey({ key: '食べる::たべる' })).toBe('食べる::たべる');
  });
});

describe('createCard (kanji)', () => {
  const card = createCard(sampleKanji);

  it('sets type and a stable key', () => {
    expect(card.type).toBe('kanji');
    expect(card.key).toBe('水');
  });

  it('puts the kanji on the front and readings/meanings on the back', () => {
    expect(card.front).toBe('水');
    expect(card.back.meanings).toBe('water');
    expect(card.back.onyomi).toBe('スイ');
    expect(card.back.kunyomi).toBe('みず');
  });

  it('starts with SRS defaults and is due immediately', () => {
    expect(card.repetitions).toBe(0);
    expect(card.interval).toBe(0);
    expect(card.easeFactor).toBe(2.5);
    expect(card.nextReviewDate).toBeTruthy();
    expect(card.id).toBeTruthy();
  });
});

describe('createWordCard (word)', () => {
  const card = createWordCard(sampleWord);

  it('sets type and a word::reading key', () => {
    expect(card.type).toBe('word');
    expect(card.key).toBe('食べる::たべる');
  });

  it('puts the word on the front and reading + meanings on the back', () => {
    expect(card.front).toBe('食べる');
    expect(card.back.meanings).toBe('to eat');
    expect(card.back.reading).toBe('たべる');
  });

  it('keeps the first JLPT level for display', () => {
    expect(card.jlpt).toBe('N5');
  });

  it('shares the same SRS starting state as kanji cards', () => {
    expect(card.repetitions).toBe(0);
    expect(card.easeFactor).toBe(2.5);
    expect(card.id).toBeTruthy();
  });
});
