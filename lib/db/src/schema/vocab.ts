import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";

export const vocabTable = pgTable("vocab", {
  id: serial("id").primaryKey(),
  songId: integer("song_id").notNull(),
  phrase: text("phrase").notNull(),
  translation: text("translation").notNull(),
});

export type VocabEntry = typeof vocabTable.$inferSelect;
