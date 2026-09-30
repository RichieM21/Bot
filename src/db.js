import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error("Missing DATABASE_URL in .env");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

let initialized = false;

export async function initDb() {
  if (initialized) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS verified_users (
      discord_id TEXT PRIMARY KEY,
      roblox_user_id TEXT NOT NULL,
      username TEXT NOT NULL,
      verified_at TIMESTAMPTZ,
      method TEXT
    );

    CREATE TABLE IF NOT EXISTS blacklist (
      discord_id TEXT PRIMARY KEY,
      entry JSONB NOT NULL
    );

    CREATE TABLE IF NOT EXISTS moderation_history (
      id BIGSERIAL PRIMARY KEY,
      roblox_user_id TEXT NOT NULL,
      action JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS moderation_history_user_idx
      ON moderation_history (roblox_user_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS staff_notes (
      id BIGSERIAL PRIMARY KEY,
      roblox_user_id TEXT NOT NULL,
      note JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS staff_notes_user_idx
      ON staff_notes (roblox_user_id, created_at DESC);
  `);

  initialized = true;
  console.log("PostgreSQL database initialized.");
}

async function query(text, values = []) {
  await initDb();
  return pool.query(text, values);
}

export async function getVerified(discordId) {
  const result = await query(
    "SELECT roblox_user_id, username, verified_at, method FROM verified_users WHERE discord_id = $1",
    [String(discordId)]
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    userId: String(row.roblox_user_id),
    username: row.username,
    verifiedAt: row.verified_at ? new Date(row.verified_at).toISOString() : null,
    method: row.method || null
  };
}

export async function setVerified(discordId, roblox) {
  await query(
    `INSERT INTO verified_users (discord_id, roblox_user_id, username, verified_at, method)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (discord_id)
     DO UPDATE SET
       roblox_user_id = EXCLUDED.roblox_user_id,
       username = EXCLUDED.username,
       verified_at = EXCLUDED.verified_at,
       method = EXCLUDED.method`,
    [
      String(discordId),
      String(roblox.userId),
      String(roblox.username || "Roblox User"),
      roblox.verifiedAt ? new Date(roblox.verifiedAt) : new Date(),
      roblox.method || null
    ]
  );
}

export async function getBlacklistEntry(discordId) {
  const result = await query(
    "SELECT entry FROM blacklist WHERE discord_id = $1",
    [String(discordId)]
  );
  return result.rows[0]?.entry ?? null;
}

export async function isBlacklisted(discordId) {
  return Boolean(await getBlacklistEntry(discordId));
}

export async function setBlacklisted(discordId, entry) {
  if (entry) {
    await query(
      `INSERT INTO blacklist (discord_id, entry)
       VALUES ($1, $2::jsonb)
       ON CONFLICT (discord_id)
       DO UPDATE SET entry = EXCLUDED.entry`,
      [String(discordId), JSON.stringify(entry)]
    );
  } else {
    await query("DELETE FROM blacklist WHERE discord_id = $1", [String(discordId)]);
  }
}

export async function getDiscordIdByRobloxUserId(userId) {
  const result = await query(
    "SELECT discord_id FROM verified_users WHERE roblox_user_id = $1 LIMIT 1",
    [String(userId)]
  );
  return result.rows[0]?.discord_id ?? null;
}

export async function addModerationAction(userId, action) {
  const robloxUserId = String(userId);
  await query(
    "INSERT INTO moderation_history (roblox_user_id, action) VALUES ($1, $2::jsonb)",
    [robloxUserId, JSON.stringify(action)]
  );

  await query(
    `DELETE FROM moderation_history
     WHERE roblox_user_id = $1
       AND id NOT IN (
         SELECT id FROM moderation_history
         WHERE roblox_user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 100
       )`,
    [robloxUserId]
  );
}

export async function getModerationHistory(userId) {
  const result = await query(
    `SELECT action
     FROM moderation_history
     WHERE roblox_user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [String(userId)]
  );
  return result.rows.map(row => row.action);
}

export async function addStaffNote(userId, note) {
  const robloxUserId = String(userId);
  await query(
    "INSERT INTO staff_notes (roblox_user_id, note) VALUES ($1, $2::jsonb)",
    [robloxUserId, JSON.stringify(note)]
  );

  await query(
    `DELETE FROM staff_notes
     WHERE roblox_user_id = $1
       AND id NOT IN (
         SELECT id FROM staff_notes
         WHERE roblox_user_id = $1
         ORDER BY created_at DESC, id DESC
         LIMIT 100
       )`,
    [robloxUserId]
  );
}

export async function getStaffNotes(userId) {
  const result = await query(
    `SELECT note
     FROM staff_notes
     WHERE roblox_user_id = $1
     ORDER BY created_at DESC, id DESC
     LIMIT 100`,
    [String(userId)]
  );
  return result.rows.map(row => row.note);
}

export async function clearWarnings(userId) {
  await query(
    "DELETE FROM moderation_history WHERE roblox_user_id = $1 AND action->>'action' = 'WARN'",
    [String(userId)]
  );
}

export async function migrateLegacyJsonIfPresent() {
  const dataDir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
  const file = path.join(dataDir, "users.json");

  let raw;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch {
    return;
  }

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    console.warn("Legacy users.json exists but could not be parsed; skipping migration.");
    return;
  }

  for (const [discordId, roblox] of Object.entries(data.verified ?? {})) {
    if (roblox?.userId) await setVerified(discordId, roblox);
  }

  for (const [discordId, entry] of Object.entries(data.blacklist ?? {})) {
    await setBlacklisted(discordId, entry);
  }

  for (const [userId, entries] of Object.entries(data.moderationHistory ?? {})) {
    const existing = await getModerationHistory(userId);
    if (existing.length || !Array.isArray(entries)) continue;
    for (const entry of [...entries].reverse().slice(0, 100)) {
      await addModerationAction(userId, entry);
    }
  }

  for (const [userId, entries] of Object.entries(data.staffNotes ?? {})) {
    const existing = await getStaffNotes(userId);
    if (existing.length || !Array.isArray(entries)) continue;
    for (const entry of [...entries].reverse().slice(0, 100)) {
      await addStaffNote(userId, entry);
    }
  }

  console.log("Legacy users.json migration check complete.");
}
