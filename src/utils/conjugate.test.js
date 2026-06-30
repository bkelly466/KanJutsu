import { describe, it, expect } from 'vitest';
import { detectVerbClass, getVerbForms } from './conjugate';

// Helper: build a minimal normalised word entry with a verb part-of-speech.
const word = (w, r, pos) => ({
  word: w,
  reading: r,
  senses: [{ definitions: ['x'], partsOfSpeech: pos }],
});

describe('detectVerbClass', () => {
  it('recognises each class from Jisho part-of-speech strings', () => {
    expect(detectVerbClass(['Ichidan verb', 'Transitive verb'])).toBe('ichidan');
    expect(detectVerbClass(["Godan verb with 'ru' ending"])).toBe('godan');
    expect(detectVerbClass(['Noun', 'Suru verb'])).toBe('suru');
    expect(detectVerbClass(['Kuru verb - special class'])).toBe('kuru');
  });

  it('returns null for non-verbs', () => {
    expect(detectVerbClass(['Noun'])).toBeNull();
    expect(detectVerbClass([])).toBeNull();
  });
});

describe('getVerbForms — polite present', () => {
  const cases = [
    // [word, reading, partsOfSpeech, expectedPoliteWord, expectedPoliteReading]
    ['食べる', 'たべる', ['Ichidan verb'], '食べます', 'たべます'],
    ['帰る', 'かえる', ["Godan verb with 'ru' ending"], '帰ります', 'かえります'],
    ['飲む', 'のむ', ["Godan verb with 'mu' ending"], '飲みます', 'のみます'],
    ['書く', 'かく', ["Godan verb with 'ku' ending"], '書きます', 'かきます'],
    ['話す', 'はなす', ["Godan verb with 'su' ending"], '話します', 'はなします'],
    ['泳ぐ', 'およぐ', ["Godan verb with 'gu' ending"], '泳ぎます', 'およぎます'],
    ['待つ', 'まつ', ["Godan verb with 'tsu' ending"], '待ちます', 'まちます'],
    ['買う', 'かう', ["Godan verb with 'u' ending"], '買います', 'かいます'],
    ['遊ぶ', 'あそぶ', ["Godan verb with 'bu' ending"], '遊びます', 'あそびます'],
    ['死ぬ', 'しぬ', ["Godan verb with 'nu' ending"], '死にます', 'しにます'],
    ['来る', 'くる', ['Kuru verb - special class'], '来ます', 'きます'],
    ['する', 'する', ['Suru verb - irregular'], 'します', 'します'],
  ];

  it.each(cases)('%s → %s', (w, r, pos, politeWord, politeReading) => {
    const forms = getVerbForms(word(w, r, pos));
    expect(forms.polite.word).toBe(politeWord);
    expect(forms.polite.reading).toBe(politeReading);
  });

  it('handles する-nouns by appending する / します to the full form', () => {
    const forms = getVerbForms(word('勉強', 'べんきょう', ['Noun', 'Suru verb']));
    expect(forms.base.word).toBe('勉強する');
    expect(forms.base.reading).toBe('べんきょうする');
    expect(forms.polite.word).toBe('勉強します');
    expect(forms.polite.reading).toBe('べんきょうします');
  });

  it('keeps the dictionary form equal to the word for non-suru verbs', () => {
    const forms = getVerbForms(word('食べる', 'たべる', ['Ichidan verb']));
    expect(forms.base.word).toBe('食べる');
  });

  it('returns null for non-verbs', () => {
    expect(getVerbForms(word('水', 'みず', ['Noun']))).toBeNull();
    expect(getVerbForms(null)).toBeNull();
  });
});
