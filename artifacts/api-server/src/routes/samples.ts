import { Router, type IRouter } from "express";
import { db, foldersTable, sampleTypeEnum, samplesTable } from "@workspace/db";
import { eq, and, isNull, isNotNull, lt } from "drizzle-orm";

const RETENTION_DAYS = 20;

const router: IRouter = Router();
const validSampleTypes = new Set<string>(sampleTypeEnum);

function parseRequiredId(value: string | undefined): number | null {
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptionalId(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function userOwnsFolder(userId: string, folderId: number): Promise<boolean> {
  const [folder] = await db
    .select({ id: foldersTable.id })
    .from(foldersTable)
    .where(and(eq(foldersTable.id, folderId), eq(foldersTable.userId, userId)));

  return Boolean(folder);
}

router.get("/samples", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const folderIdParam = req.query.folderId;

  let samples;
  if (folderIdParam !== undefined && folderIdParam !== null && folderIdParam !== "") {
    const folderId = parseOptionalId(folderIdParam);
    if (folderId === undefined || folderId === null) {
      res.status(400).json({ error: "Invalid folderId" });
      return;
    }
    samples = await db
      .select()
      .from(samplesTable)
      .where(and(eq(samplesTable.userId, userId), eq(samplesTable.folderId, folderId), isNull(samplesTable.deletedAt)))
      .orderBy(samplesTable.createdAt);
  } else {
    samples = await db
      .select()
      .from(samplesTable)
      .where(and(eq(samplesTable.userId, userId), isNull(samplesTable.deletedAt)))
      .orderBy(samplesTable.createdAt);
  }

  res.json(samples);
});

router.post("/samples", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const { sampleType, sampleId, folderId, notes, fields } = req.body;

  if (!sampleType || !validSampleTypes.has(sampleType)) {
    res.status(400).json({ error: "Invalid sampleType" });
    return;
  }
  if (!sampleId || typeof sampleId !== "string") {
    res.status(400).json({ error: "sampleId is required" });
    return;
  }
  if (fields !== undefined && !isPlainObject(fields)) {
    res.status(400).json({ error: "fields must be an object" });
    return;
  }

  const parsedFolderId = parseOptionalId(folderId);
  if (parsedFolderId === undefined) {
    res.status(400).json({ error: "Invalid folderId" });
    return;
  }
  if (parsedFolderId !== null && !(await userOwnsFolder(userId, parsedFolderId))) {
    res.status(400).json({ error: "Dataset not found" });
    return;
  }

  const [sample] = await db
    .insert(samplesTable)
    .values({
      sampleType,
      sampleId,
      userId,
      folderId: parsedFolderId,
      notes: notes ?? null,
      fields: fields ?? {},
    })
    .returning();
  res.status(201).json(sample);
});

router.get("/samples/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const id = parseRequiredId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid sample id" });
    return;
  }
  const [sample] = await db
    .select()
    .from(samplesTable)
    .where(and(eq(samplesTable.id, id), eq(samplesTable.userId, userId)));
  if (!sample) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(sample);
});

router.put("/samples/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const id = parseRequiredId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid sample id" });
    return;
  }
  const { sampleId, folderId, notes, fields } = req.body;

  const updates: Record<string, unknown> = {};
  if (sampleId !== undefined) {
    if (typeof sampleId !== "string" || !sampleId) {
      res.status(400).json({ error: "sampleId must be a non-empty string" });
      return;
    }
    updates.sampleId = sampleId;
  }
  if (folderId !== undefined) {
    const parsedFolderId = parseOptionalId(folderId);
    if (parsedFolderId === undefined) {
      res.status(400).json({ error: "Invalid folderId" });
      return;
    }
    if (parsedFolderId !== null && !(await userOwnsFolder(userId, parsedFolderId))) {
      res.status(400).json({ error: "Dataset not found" });
      return;
    }
    updates.folderId = parsedFolderId;
  }
  if (notes !== undefined) updates.notes = notes;
  if (fields !== undefined) {
    if (!isPlainObject(fields)) {
      res.status(400).json({ error: "fields must be an object" });
      return;
    }
    updates.fields = fields;
  }

  const [sample] = await db
    .update(samplesTable)
    .set(updates)
    .where(and(eq(samplesTable.id, id), eq(samplesTable.userId, userId)))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(sample);
});

router.get("/samples/recently-deleted", async (req, res) => {
  if (!req.isAuthenticated()) return void res.status(401).json({ error: "Unauthorized" });
  const expiresBefore = new Date(Date.now() - RETENTION_DAYS * 86400000);
  await db.delete(samplesTable).where(and(eq(samplesTable.userId, req.user!.id), lt(samplesTable.deletedAt, expiresBefore)));
  const rows = await db.select().from(samplesTable)
    .where(and(eq(samplesTable.userId, req.user!.id), isNotNull(samplesTable.deletedAt)))
    .orderBy(samplesTable.deletedAt);
  res.json(rows);
});

router.post("/samples/:id/restore", async (req, res) => {
  if (!req.isAuthenticated()) return void res.status(401).json({ error: "Unauthorized" });
  const id = parseRequiredId(req.params.id);
  if (!id) return void res.status(400).json({ error: "Invalid sample id" });
  const [sample] = await db.update(samplesTable).set({ deletedAt: null })
    .where(and(eq(samplesTable.id, id), eq(samplesTable.userId, req.user!.id))).returning();
  if (!sample) return void res.status(404).json({ error: "Not found" });
  res.json(sample);
});

router.delete("/samples/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const id = parseRequiredId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid sample id" });
    return;
  }
  const deleted = await db
    .update(samplesTable)
    .set({ deletedAt: new Date() })
    .where(and(eq(samplesTable.id, id), eq(samplesTable.userId, userId)))
    .returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

router.patch("/samples/:id/move", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const id = parseRequiredId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid sample id" });
    return;
  }
  const { folderId } = req.body;
  const parsedFolderId = parseOptionalId(folderId);
  if (parsedFolderId === undefined) {
    res.status(400).json({ error: "Invalid folderId" });
    return;
  }
  if (parsedFolderId !== null && !(await userOwnsFolder(userId, parsedFolderId))) {
    res.status(400).json({ error: "Dataset not found" });
    return;
  }

  const [sample] = await db
    .update(samplesTable)
    .set({ folderId: parsedFolderId })
    .where(and(eq(samplesTable.id, id), eq(samplesTable.userId, userId)))
    .returning();
  if (!sample) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(sample);
});

export default router;
