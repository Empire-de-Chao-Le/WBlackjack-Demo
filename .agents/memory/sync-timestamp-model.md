---
name: Sync Tool / Karaoke timestamp model
description: The shared contract for how lyric line timestamps are recorded and consumed in WBlackjack
---

# Timestamp contract

`timestamp[i]` = the moment (ms) line `i` *begins*. This is the single source of
truth shared by both sides; any change to recording or consumption must preserve it.

- **Sync Tool recording** (`sync-tool.tsx`): `currentIdx` = the UPCOMING line to
  stamp next; the bright/middle line is `lines[currentIdx - 1]`. On tap, the
  upcoming line `lines[currentIdx]` is stamped with the current video time and
  becomes the new bright line. So the line that turns bright and the line that
  gets the timestamp are the same, stamped at the same instant.
- **Karaoke consumption** (`pages/karaoke-game.tsx`): line `i` is highlighted once
  `currentTime >= timestamp[i]` (picks the last such `i`).

**Why:** these two must agree or the highlighted line drifts from the audio.

## Undo seek
After an Undo the new bright line is `lines[newIdx - 1]` (where `newIdx =
currentIdx - 1`), so playback must seek to `timestamps[newIdx - 1]` — NOT
`timestamps[newIdx]` (that was an off-by-one that landed one line ahead). When
`newIdx === 0` seek to 0 (3-dots / start state).

## Storage gotcha
`song_timestamps.timestamp_ms` is an INTEGER column — round on both client and
server before insert, or the POST 500s. A 500 there leaves a song with lyrics but
no timestamps, which makes karaoke appear "stuck" on line 0 (nothing to follow).
Timestamps are stored in a separate `song_timestamps` table and merged into the
`GET /songs/:id/lyrics` response by line index.
