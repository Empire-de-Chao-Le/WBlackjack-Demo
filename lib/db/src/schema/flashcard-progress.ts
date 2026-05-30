import { pgTable, serial, integer, real, date, timestamp, uniqueIndex, boolean } from "drizzle-orm/pg-core";

export const flashcardProgressTable = pgTable(
  "flashcard_progress",
  {
    id: serial("id").primaryKey(),
    wordPoolId: integer("word_pool_id").notNull(),
    streak: integer("streak").notNull().default(0),
    intervalDays: integer("interval_days").notNull().default(0),
    easeFactor: real("ease_factor").notNull().default(2.5),
    reps: integer("reps").notNull().default(0),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    ignored: boolean("ignored").notNull().default(false),
    lastReviewedAt: timestamp("last_reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    wordPoolIdx: uniqueIndex("flashcard_progress_word_pool_id_idx").on(t.wordPoolId),
  })
);

export type FlashcardProgress = typeof flashcardProgressTable.$inferSelect;
