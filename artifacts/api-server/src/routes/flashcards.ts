import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, wordPoolTable, flashcardProgressTable } from "@workspace/db";

const router: IRouter = Router();

const SESSION_SIZE = 10;    // total cards per session
const TARGET_DUE = 5;       // aim for this many review cards
const TARGET_NEW = 5;       // aim for this many new (unseen) cards

// ── Date helpers (calendar-day based, timezone-agnostic via client's local date) ─
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function serverToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeToday(raw: unknown): string {
  if (typeof raw === "string" && DATE_RE.test(raw)) return raw;
  return serverToday();
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── SM-2 style scheduler (binary right/wrong) ────────────────────────────────
type SrsState = { streak: number; intervalDays: number; easeFactor: number };

/**
 * Computes the next SRS state and the effective (fuzzed) interval used for the
 * due date. `intervalDays` returned is the UNFUZZED base (so fuzz never
 * compounds); `effectiveInterval` is what the due date is built from.
 */
function computeNext(prev: SrsState, correct: boolean): SrsState & { effectiveInterval: number } {
  let { streak, intervalDays, easeFactor } = prev;

  if (correct) {
    streak += 1;
    easeFactor = Math.min(3.0, easeFactor + 0.1);
    let base: number;
    if (streak <= 1) base = 1; // tomorrow
    else if (streak === 2) base = 2; // day after tomorrow
    else base = Math.round(intervalDays * easeFactor);
    intervalDays = Math.max(1, base);
  } else {
    // Fail: reset streak, due tomorrow, ease penalised.
    streak = 0;
    easeFactor = Math.max(1.3, easeFactor - 0.2);
    intervalDays = 1;
  }

  // Interval fuzzing: only for intervals >= 3 days. Leave tomorrow (1) and the
  // day after tomorrow (2) exactly as-is so they aren't shuffled around.
  let effectiveInterval = intervalDays;
  if (intervalDays >= 3) {
    const pct = Math.random() * 0.24 - 0.12; // -12% .. +12%
    effectiveInterval = Math.round(intervalDays * (1 + pct));
    if (effectiveInterval < 3) effectiveInterval = 3;
  }

  // Minimum interval is always 24h (1 calendar day).
  effectiveInterval = Math.max(1, effectiveInterval);

  return { streak, intervalDays, easeFactor, effectiveInterval };
}

/**
 * GET /flashcards/due/:language?today=YYYY-MM-DD
 *
 * Builds a 10-card session aiming for a 5/5 new-vs-review split:
 *   1. Take up to TARGET_DUE cards due today (or overdue) — shuffled.
 *   2. Take up to TARGET_NEW unseen (new) cards — shuffled.
 *   3. If either bucket is short, borrow from the other to hit SESSION_SIZE.
 *   4. If still short (both exhausted), fill with the soonest upcoming cards
 *      sorted by dueDate ascending — so there's never an empty session.
 *   5. Shuffle the combined set so new and review cards are interleaved.
 */
router.get("/flashcards/due/:language", async (req, res): Promise<void> => {
  const { language } = req.params;
  if (!language || !language.trim()) {
    res.status(400).json({ error: "Language is required" });
    return;
  }
  const today = normalizeToday(req.query.today);

  const poolRows = await db
    .select({ id: wordPoolTable.id })
    .from(wordPoolTable)
    .where(eq(wordPoolTable.language, language));
  const poolIds = poolRows.map((r) => r.id);

  if (poolIds.length === 0) {
    res.json({ cardIds: [], dueCount: 0, newCount: 0, totalAvailable: 0 });
    return;
  }

  const progressRows = await db
    .select({
      wordPoolId: flashcardProgressTable.wordPoolId,
      dueDate: flashcardProgressTable.dueDate,
      ignored: flashcardProgressTable.ignored,
    })
    .from(flashcardProgressTable)
    .where(inArray(flashcardProgressTable.wordPoolId, poolIds));

  const progressMap = new Map(progressRows.map((r) => [r.wordPoolId, r]));

  // Partition the pool into three buckets (ignored cards are excluded entirely)
  const dueNowIds: number[] = [];                                   // dueDate <= today
  const newIds: number[] = [];                                      // never reviewed
  const soonDue: { id: number; dueDate: string }[] = [];           // dueDate > today

  for (const id of poolIds) {
    const prog = progressMap.get(id);
    if (prog === undefined) {
      newIds.push(id);
    } else if (prog.ignored) {
      // excluded from all session buckets
    } else if (prog.dueDate <= today) {
      dueNowIds.push(id);
    } else {
      soonDue.push({ id, dueDate: prog.dueDate });
    }
  }

  // Closest upcoming cards first (fallback pool)
  soonDue.sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  // Shuffle within each primary bucket
  const shuffledDue = shuffle(dueNowIds);
  const shuffledNew = shuffle(newIds);

  // Start with the target 5/5 split
  let takeDue = Math.min(TARGET_DUE, shuffledDue.length);
  let takeNew = Math.min(TARGET_NEW, shuffledNew.length);

  // Borrow to reach SESSION_SIZE: first try the other primary bucket, then soonDue
  const shortage = SESSION_SIZE - takeDue - takeNew;
  if (shortage > 0) {
    // Try to borrow more from the new pool first, then from due
    const extraNew = Math.min(shortage, shuffledNew.length - takeNew);
    takeNew += extraNew;
    const remaining = shortage - extraNew;
    if (remaining > 0) {
      const extraDue = Math.min(remaining, shuffledDue.length - takeDue);
      takeDue += extraDue;
    }
  }

  const session: number[] = [
    ...shuffledDue.slice(0, takeDue),
    ...shuffledNew.slice(0, takeNew),
  ];

  // Final fallback: pull the soonest upcoming cards to avoid an empty session
  if (session.length < SESSION_SIZE) {
    const need = SESSION_SIZE - session.length;
    session.push(...soonDue.slice(0, need).map((e) => e.id));
  }

  // Shuffle the combined set so new and review cards are interleaved
  res.json({
    cardIds: shuffle(session),
    dueCount: dueNowIds.length,
    newCount: newIds.length,
    totalAvailable: poolIds.length,
  });
});

/**
 * POST /flashcards/review
 * Body: { wordPoolId: number, correct: boolean, today?: "YYYY-MM-DD" }
 * Applies the SM-2 scheduler and persists the new due date.
 */
router.post("/flashcards/review", async (req, res): Promise<void> => {
  const { wordPoolId, correct } = req.body ?? {};
  const today = normalizeToday(req.body?.today);

  if (typeof wordPoolId !== "number" || !Number.isInteger(wordPoolId)) {
    res.status(400).json({ error: "wordPoolId (integer) is required" });
    return;
  }
  if (typeof correct !== "boolean") {
    res.status(400).json({ error: "correct (boolean) is required" });
    return;
  }

  const [existing] = await db
    .select()
    .from(flashcardProgressTable)
    .where(eq(flashcardProgressTable.wordPoolId, wordPoolId))
    .limit(1);

  const prev: SrsState = existing
    ? { streak: existing.streak, intervalDays: existing.intervalDays, easeFactor: existing.easeFactor }
    : { streak: 0, intervalDays: 0, easeFactor: 2.5 };

  const next = computeNext(prev, correct);
  const dueDate = addDays(today, next.effectiveInterval);
  const now = new Date();

  if (existing) {
    await db
      .update(flashcardProgressTable)
      .set({
        streak: next.streak,
        intervalDays: next.intervalDays,
        easeFactor: next.easeFactor,
        reps: existing.reps + 1,
        dueDate,
        lastReviewedAt: now,
        updatedAt: now,
      })
      .where(eq(flashcardProgressTable.id, existing.id));
  } else {
    await db.insert(flashcardProgressTable).values({
      wordPoolId,
      streak: next.streak,
      intervalDays: next.intervalDays,
      easeFactor: next.easeFactor,
      reps: 1,
      dueDate,
      lastReviewedAt: now,
    });
  }

  res.json({
    wordPoolId,
    streak: next.streak,
    intervalDays: next.intervalDays,
    easeFactor: next.easeFactor,
    dueDate,
  });
});

/**
 * POST /flashcards/ignore
 * Body: { wordPoolId: number }
 * Marks a word as permanently ignored — excluded from all future sessions.
 * The word stays in the pool (for distractor purposes) but is never pulled as
 * a question again. Safe to call multiple times (idempotent).
 */
router.post("/flashcards/ignore", async (req, res): Promise<void> => {
  const { wordPoolId } = req.body ?? {};
  if (typeof wordPoolId !== "number" || !Number.isInteger(wordPoolId)) {
    res.status(400).json({ error: "wordPoolId (integer) is required" });
    return;
  }

  const [existing] = await db
    .select({ id: flashcardProgressTable.id })
    .from(flashcardProgressTable)
    .where(eq(flashcardProgressTable.wordPoolId, wordPoolId))
    .limit(1);

  const now = new Date();
  if (existing) {
    await db
      .update(flashcardProgressTable)
      .set({ ignored: true, updatedAt: now })
      .where(eq(flashcardProgressTable.id, existing.id));
  } else {
    // No review history yet — create a row just to mark it ignored.
    // Use a far-future dueDate as a placeholder (the field is required).
    await db.insert(flashcardProgressTable).values({
      wordPoolId,
      streak: 0,
      intervalDays: 0,
      easeFactor: 2.5,
      reps: 0,
      dueDate: "9999-12-31",
      ignored: true,
      lastReviewedAt: now,
    });
  }

  res.json({ wordPoolId, ignored: true });
});

export default router;
