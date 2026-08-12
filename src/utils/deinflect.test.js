import { describe, it, expect } from 'vitest';
import { deinflect } from './deinflect';

describe('deinflect', () => {
  describe('the cases that motivated this module', () => {
    // Jisho returns 飲んだくれ ("drunkard") for these and drops 飲む entirely.
    it('proposes 飲む for 飲んだ', () => {
      expect(deinflect('飲んだ')).toContain('飲む');
    });

    it('proposes 読む for 読んで', () => {
      expect(deinflect('読んで')).toContain('読む');
    });

    it('proposes 待つ for 待った', () => {
      expect(deinflect('待った')).toContain('待つ');
    });
  });

  describe('ambiguous endings offer every possibility', () => {
    // んだ can come from む, ぶ or ぬ — only the dictionary can say which.
    it('offers all three む/ぶ/ぬ candidates for んだ', () => {
      expect(deinflect('遊んだ')).toEqual(
        expect.arrayContaining(['遊む', '遊ぶ', '遊ぬ']),
      );
    });

    it('offers all three う/つ/る candidates for った', () => {
      expect(deinflect('買った')).toEqual(
        expect.arrayContaining(['買う', '買つ', '買る']),
      );
    });

    it('offers both godan-す and suru candidates for した', () => {
      expect(deinflect('勉強した')).toEqual(
        expect.arrayContaining(['勉強す', '勉強する']),
      );
    });
  });

  describe('unambiguous endings offer exactly one candidate', () => {
    it('maps いた to く', () => {
      expect(deinflect('書いた')).toEqual(['書く']);
    });

    it('maps いで to ぐ', () => {
      expect(deinflect('泳いで')).toEqual(['泳ぐ']);
    });
  });

  describe('行く, the irregular godan た-form', () => {
    // Without the special case, った → う resolves 行った to 行う (おこなう,
    // "to perform") — a real word, and the wrong one.
    it('proposes 行く for 行った', () => {
      expect(deinflect('行った')).toContain('行く');
    });

    it('ranks 行く ahead of the regular 行う candidate', () => {
      const candidates = deinflect('行った');
      expect(candidates.indexOf('行く')).toBeLessThan(candidates.indexOf('行う'));
    });

    it('handles the て-form and compounds', () => {
      expect(deinflect('行って')).toContain('行く');
      expect(deinflect('持って行った')).toContain('持って行く');
    });

    it('offers both いく and いう for the kana-only いった', () => {
      // いった is 行った *or* 言った — both readings have to be on the table.
      expect(deinflect('いった')).toEqual(expect.arrayContaining(['いく', 'いう']));
    });

    it('does not propose duplicates when both rules agree', () => {
      const candidates = deinflect('いった');
      expect(new Set(candidates).size).toBe(candidates.length);
    });
  });

  describe('ichidan stem + た/て', () => {
    // 見た returns 見た目 and 出た returns 出たて — the verb is absent from both.
    it('proposes 見る for 見た and 見て', () => {
      expect(deinflect('見た')).toEqual(['見る']);
      expect(deinflect('見て')).toEqual(['見る']);
    });

    it('proposes 出る for 出た and 食べる for 食べた', () => {
      expect(deinflect('出た')).toEqual(['出る']);
      expect(deinflect('食べた')).toEqual(['食べる']);
    });

    it('does not fire when a euphonic rule already claimed the form', () => {
      // 買った must not also produce 買っる.
      expect(deinflect('買った')).not.toContain('買っる');
      expect(deinflect('書いた')).not.toContain('書いっる');
    });

    it('does not fire for the copula or adjective pasts', () => {
      expect(deinflect('学生だった')).toEqual([]);
      expect(deinflect('高かった')).toEqual([]);
    });
  });

  describe('returns no candidates, so the caller never re-searches', () => {
    it('ignores forms Jisho already handles', () => {
      // 食べました works on Jisho today — it must not cost a second request.
      expect(deinflect('食べました')).toEqual([]);
      expect(deinflect('行かなかった')).toEqual([]);
    });

    it('does not mistake the polite past or the copula for a godan す verb', () => {
      // All of these end in した but none is 話す-shaped. Left unguarded they
      // produce nonsense (食べます, 食べまする) and a wasted second request.
      expect(deinflect('食べました')).toEqual([]);
      expect(deinflect('行きました')).toEqual([]);
      expect(deinflect('食べませんでした')).toEqual([]);
      expect(deinflect('学生でした')).toEqual([]);
      // The real godan す verb still works.
      expect(deinflect('話した')).toContain('話す');
    });

    it('does not mistake adjective or negative pasts for godan った forms', () => {
      // These end in った but are adjective / auxiliary morphology, which Jisho
      // already resolves correctly (高かった → 高い, 行かなかった → 行く).
      expect(deinflect('高かった')).toEqual([]);
      expect(deinflect('行かなかった')).toEqual([]);
      expect(deinflect('食べたかった')).toEqual([]);
      // Real godan った verbs are untouched, because with kanji the character
      // before った isn't か.
      expect(deinflect('買った')).toContain('買う');
      expect(deinflect('待った')).toContain('待つ');
    });

    it('ignores plain dictionary forms', () => {
      expect(deinflect('飲む')).toEqual([]);
      expect(deinflect('食べる')).toEqual([]);
    });

    it('ignores English and kana that do not end in a た/て form', () => {
      expect(deinflect('eat')).toEqual([]);
      expect(deinflect('ありがとう')).toEqual([]);
    });

    it('ignores a bare ending with no stem', () => {
      expect(deinflect('った')).toEqual([]);
      expect(deinflect('んで')).toEqual([]);
    });

    it('handles empty, whitespace and missing input', () => {
      expect(deinflect('')).toEqual([]);
      expect(deinflect('   ')).toEqual([]);
      expect(deinflect(undefined)).toEqual([]);
      expect(deinflect(null)).toEqual([]);
    });
  });

  it('trims surrounding whitespace before matching', () => {
    expect(deinflect('  飲んだ  ')).toContain('飲む');
  });
});
