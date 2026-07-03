import { Router, type IRouter } from "express";
import { db, foldersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const router: IRouter = Router();

function parseRequiredId(value: string | undefined): number | null {
  if (!value) return null;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

router.get("/folders", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const folders = await db
    .select()
    .from(foldersTable)
    .where(eq(foldersTable.userId, userId))
    .orderBy(foldersTable.createdAt);
  res.json(folders);
});

router.post("/folders", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const { name, description } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [folder] = await db
    .insert(foldersTable)
    .values({ name, description: description ?? null, userId })
    .returning();
  res.status(201).json(folder);
});

router.put("/folders/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const id = parseRequiredId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid folder id" });
    return;
  }
  const { name, description } = req.body;
  if (!name || typeof name !== "string") {
    res.status(400).json({ error: "name is required" });
    return;
  }
  const [folder] = await db
    .update(foldersTable)
    .set({ name, description: description ?? null })
    .where(and(eq(foldersTable.id, id), eq(foldersTable.userId, userId)))
    .returning();
  if (!folder) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(folder);
});

router.delete("/folders/:id", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const userId = req.user!.id;
  const id = parseRequiredId(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Invalid folder id" });
    return;
  }
  const deleted = await db
    .delete(foldersTable)
    .where(and(eq(foldersTable.id, id), eq(foldersTable.userId, userId)))
    .returning();
  if (!deleted.length) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.status(204).send();
});

export default router;
