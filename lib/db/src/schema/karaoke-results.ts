import { pgTable, serial, integer, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Aggregate Karaoke reward counts.
 *
 * One row per (songId, difficulty, tier). `count` is the number of times that
 * tier has been earned at that difficulty for that song. Finishing a game
 * upserts the matching row and increments its count by 1. Exiting mid-game via
 * the back button never records anything.
 *
 * tier ∈ "normal" | "high" | "perfect"
 * difficulty ∈ 10 | 33 | 100
 */
export const karaokeResultsTable = pgTable(
  "karaoke_results",
  {
    id: serial("id").primaryKey(),
    songId: integer("song_id").notNull(),
    difficulty: integer("difficulty").notNull(),
    tier: text("tier").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    songDiffTierIdx: uniqueIndex("karaoke_results_song_diff_tier_idx").on(
      t.songId,
      t.difficulty,
      t.tier
    ),
  })
);

export type KaraokeResult = typeof karaokeResultsTable.$inferSelect;
