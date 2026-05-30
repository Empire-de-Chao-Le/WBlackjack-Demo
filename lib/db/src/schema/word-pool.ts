import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const wordPoolTable = pgTable("word_pool", {
  id: serial("id").primaryKey(),
  language: text("language").notNull(),
  phrase: text("phrase").notNull(),
  translation: text("translation").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WordPoolEntry = typeof wordPoolTable.$inferSelect;
