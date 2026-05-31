---
name: TTS (speech synthesis) in WBlackjack
description: How browser TTS is wired in the flashcards/exercises games and the non-obvious traps.
---

# TTS in WBlackjack (web app)

There are TWO independent copies of the `speak()` TTS helper, by deliberate design
(each page is self-contained): `artifacts/wblackjack/src/pages/exercises-game.tsx`
and `artifacts/wblackjack/src/pages/flashcards-game.tsx`.
**Any TTS fix must be applied to BOTH copies** or one surface will silently keep the bug.

## Two distinct bugs that caused "wrong / previous language is spoken"

1. **Stale async callbacks across navigation.**
   When `speechSynthesis.getVoices()` is empty on first use, `speak()` registers a
   `voiceschanged` listener bound to that language. Navigating to another song before
   it fires leaves a stale listener that later re-queues the OLD language. The 100ms
   `setTimeout` inside `doSpeak` had the same race.
   **Fix:** module-level `_speakGen` counter, incremented each `speak()`; every
   `doSpeak`/timeout checks `gen !== _speakGen` and bails if superseded.

2. **Voice-matching by lang code is engine-specific.** Android/Chrome reports
   Mandarin voices as `cmn-Hans-CN` or `zh-Hans-CN`, NOT `zh-CN`. Naive
   `startsWith("zh-")` either misses it (→ no voice set → engine keeps the previous
   voice) or grabs Cantonese `zh-HK`.
   **Why:** when no `utt.voice` is assigned, setting only `utt.lang` is unreliable on
   Android — the OS keeps the last-used voice, which is the "previous language" symptom.
   **Fix:** parse tags into {base, region} ignoring 4-letter script subtags, alias
   Chinese bases (`zh`/`cmn`/`yue`) and disambiguate by region (CN=Mandarin, HK=Cantonese).

## How to apply
A temporary `[TTS] ...` console diagnostic (one-time voice dump + per-call match log)
was added to both files to read the device's real voice list via browser console.
Remove it once the language-specific issue is confirmed resolved on the user's device.

## Trailing spaces in DB language names

`songs.language` and `word_pool.language` had trailing spaces for some languages
(e.g. "Mandarin " not "Mandarin"). The TTS `speak()` function must call
`.toLowerCase().trim()` on the langName before the LANG_MAP lookup, or
the lookup returns `undefined` → no voice assigned → engine plays default voice.

**Also fix the data:** run `UPDATE songs SET language = trim(language) WHERE language != trim(language)`
and the same for `word_pool`. This happened for "Polish " and "Mandarin " (203 word_pool rows).
