# KanJutsu

The project's shared vocabulary. This is a glossary and nothing else — what
each term means, and which near-synonyms not to use. For what the app *does*
see `README.md`; for how it's built see `CLAUDE.md`.

## Language

### Lookup

**Entry**:
A single record in the dictionary — one word, with its readings, meanings and
parts of speech. Identified by a stable id (Jisho's `slug`).
_Avoid_: item, result, definition

**Headword**:
The Japanese string an Entry is filed under, and the form a learner is expected
to memorise: 飲む, not 飲んだ. For a kana-only Entry the Headword is the kana.
_Avoid_: dictionary form, base form, lemma, word

**Surface form**:
The Japanese string as it actually appeared — typically what the user typed.
飲んだ is a Surface form of the Entry whose Headword is 飲む. A Headword is also
a valid Surface form of itself.
_Avoid_: conjugated form, inflected form, raw input

**Reading**:
How a Headword is pronounced, written in kana: たべる for 食べる. A kana-only
Entry has a Reading identical to its Headword.
_Avoid_: pronunciation, furigana, kana

**Verb class**:
Which conjugation pattern a verb Entry follows — ichidan, godan, suru or kuru.
Determines how its forms are built.
_Avoid_: verb type, conjugation group

### Study

**Card**:
A study object built from an Entry (or from a single kanji), carrying its own
review schedule. Two Cards built from the same Entry in different Decks are
independent and are scheduled separately.
_Avoid_: flashcard, item, note

**Deck**:
A named, owner-scoped collection of Cards. The unit a user studies.
_Avoid_: collection, set, list

**Study session**:
One sitting in which a user is shown Cards from a single Deck and rates each
one. Bounded by what is due when it starts.
_Avoid_: review session, quiz, practice

**Due**:
The property of a Card whose scheduled review date has arrived or passed. A
Card is either due or it is not; there is no partial state.
_Avoid_: ready, pending, scheduled

**Lapse**:
A review in which a user fails a Card they had previously been getting right.
Resets the Card's correct streak.
_Avoid_: fail, miss, forget
