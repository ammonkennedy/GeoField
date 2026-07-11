import { pgTable, serial, text, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const foldersTable = pgTable("folders", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const sampleTypeEnum = ["water", "rock", "soil_sand", "air", "other"] as const;

export const samplesTable = pgTable("samples", {
  id: serial("id").primaryKey(),
  sampleType: text("sample_type", { enum: sampleTypeEnum }).notNull(),
  sampleId: text("sample_id").notNull(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  folderId: integer("folder_id").references(() => foldersTable.id, { onDelete: "set null" }),
  notes: text("notes"),
  fields: jsonb("fields").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const insertFolderSchema = createInsertSchema(foldersTable).omit({ id: true, createdAt: true, deletedAt: true });
export type InsertFolder = z.infer<typeof insertFolderSchema>;
export type Folder = typeof foldersTable.$inferSelect;

export const insertSampleSchema = createInsertSchema(samplesTable).omit({ id: true, createdAt: true, updatedAt: true, deletedAt: true });
export type InsertSample = z.infer<typeof insertSampleSchema>;
export type Sample = typeof samplesTable.$inferSelect;
