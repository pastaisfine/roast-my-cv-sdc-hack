import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

// Public reference data only. There is deliberately no CV/session/user column.
export const radarPublicCache = pgTable("radar_public_cache", {
  key: text("key").primaryKey(),
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertRadarPublicCacheSchema = createInsertSchema(radarPublicCache).omit({ createdAt: true });
export type RadarPublicCacheRow = typeof radarPublicCache.$inferSelect;
