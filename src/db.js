import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..", "data");
const file = path.join(dataDir, "users.json");

async function ensure() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, JSON.stringify({ verified: {}, blacklist: {} }, null, 2));
  }
}

async function read() {
  await ensure();
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function write(data) {
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

export async function getVerified(discordId) {
  const data = await read();
  return data.verified[discordId] ?? null;
}

export async function setVerified(discordId, roblox) {
  const data = await read();
  data.verified[discordId] = roblox;
  await write(data);
}


export async function getBlacklistEntry(discordId) {
  const data = await read();
  return data.blacklist?.[discordId] ?? null;
}

export async function isBlacklisted(discordId) {
  return Boolean(await getBlacklistEntry(discordId));
}

export async function setBlacklisted(discordId, entry) {
  const data = await read();
  data.blacklist ??= {};

  if (entry) {
    data.blacklist[discordId] = entry;
  } else {
    delete data.blacklist[discordId];
  }

  await write(data);
}


export async function getDiscordIdByRobloxUserId(userId) {
  const data = await read();
  const entry = Object.entries(data.verified ?? {}).find(
    ([, roblox]) => String(roblox.userId) === String(userId)
  );
  return entry?.[0] ?? null;
}


export async function addModerationAction(userId, action) {
  const data = await read();
  data.moderationHistory ??= {};
  data.moderationHistory[String(userId)] ??= [];
  data.moderationHistory[String(userId)].unshift(action);
  data.moderationHistory[String(userId)] = data.moderationHistory[String(userId)].slice(0, 100);
  await write(data);
}

export async function getModerationHistory(userId) {
  const data = await read();
  return data.moderationHistory?.[String(userId)] ?? [];
}

export async function addStaffNote(userId, note) {
  const data = await read();
  data.staffNotes ??= {};
  data.staffNotes[String(userId)] ??= [];
  data.staffNotes[String(userId)].unshift(note);
  data.staffNotes[String(userId)] = data.staffNotes[String(userId)].slice(0, 100);
  await write(data);
}

export async function getStaffNotes(userId) {
  const data = await read();
  return data.staffNotes?.[String(userId)] ?? [];
}

export async function clearWarnings(userId) {
  const data = await read();
  const key = String(userId);
  const history = data.moderationHistory?.[key] ?? [];
  data.moderationHistory ??= {};
  data.moderationHistory[key] = history.filter(entry => entry.action !== "WARN");
  await write(data);
}
