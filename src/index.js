import "dotenv/config";
import http from "node:http";
import crypto from "node:crypto";
import {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder
} from "discord.js";

import {
  getUserByUsername,
  getUserProfile,
  findRoleByName,
  listRoles,
  assignRole,
  unassignHighestRole,
  getCurrentRole,
  permanentBanUser,
  unbanUser,
  getUserRestriction,
  temporaryBanUser,
  publishGameMessage,
  restartUniverseServers
} from "./roblox.js";

import { getVerified, setVerified, isBlacklisted, setBlacklisted, getBlacklistEntry, getDiscordIdByRobloxUserId, addModerationAction, getModerationHistory, clearWarnings, addStaffNote, getStaffNotes } from "./db.js";

const required = [
  "DISCORD_TOKEN",
  "DISCORD_CLIENT_ID",
  "DISCORD_GUILD_ID",
  "ROBLOX_API_KEY",
  "ROBLOX_GROUP_ID",
  "DISCORD_STAFF_ROLE_ID",
  "ROBLOX_OAUTH_CLIENT_ID",
  "ROBLOX_OAUTH_CLIENT_SECRET",
  "ROBLOX_OAUTH_REDIRECT_URI",
  "VERIFY_STATE_SECRET"
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});


const BOT_VERSION = "1.1.0";

function formatUptime(totalSeconds) {
  let seconds = Math.max(0, Math.floor(totalSeconds));
  const days = Math.floor(seconds / 86400);
  seconds %= 86400;
  const hours = Math.floor(seconds / 3600);
  seconds %= 3600;
  const minutes = Math.floor(seconds / 60);
  seconds %= 60;

  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);
  return parts.join(" ");
}

const EIGHT_BALL = [
  "It is certain.", "It is decidedly so.", "Without a doubt.",
  "Yes — definitely.", "You may rely on it.", "Most likely.",
  "Outlook good.", "Yes.", "Signs point to yes.",
  "Reply hazy, try again.", "Ask again later.", "Better not tell you now.",
  "Cannot predict now.", "Don't count on it.", "My reply is no.",
  "Outlook not so good.", "Very doubtful."
];

const ROASTS = [
  "I'd roast you, but your gameplay already did that.",
  "You're not lagging — your decisions are.",
  "Even the loading screen has more progress than you.",
  "I've seen NPCs with better decision-making.",
  "Your Wi-Fi isn't the problem. It's you.",
  "You bring everyone together... to ask what happened.",
  "Somewhere, a Roblox server is trying to figure out what you just did.",
  "You're proof that the respawn button exists for a reason."
];

function isStaff(interaction) {
  return interaction.member?.roles?.cache?.has(process.env.DISCORD_STAFF_ROLE_ID);
}

function requireStaff(interaction) {
  if (!isStaff(interaction)) {
    throw new Error("You do not have permission to use this command.");
  }
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 900 ? message.slice(0, 900) + "…" : message;
}

async function logAction(interaction, text) {
  const channelId = process.env.LOG_CHANNEL_ID;
  if (!channelId) return;

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel?.isTextBased()) {
      await channel.send(text);
    }


  } catch (error) {
    console.error("Could not write log:", error);
  }
}



const OAUTH_AUTHORIZE_URL = "https://apis.roblox.com/oauth/v1/authorize";
const OAUTH_TOKEN_URL = "https://apis.roblox.com/oauth/v1/token";
const OAUTH_USERINFO_URL = "https://apis.roblox.com/oauth/v1/userinfo";
const pendingVerificationStates = new Map();

function createVerificationState(discordId, mode = "verify") {
  const nonce = crypto.randomBytes(24).toString("base64url");
  const expiresAt = Date.now() + 10 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ discordId: String(discordId), nonce, expiresAt, mode })).toString("base64url");
  const signature = crypto.createHmac("sha256", process.env.VERIFY_STATE_SECRET).update(payload).digest("base64url");
  pendingVerificationStates.set(nonce, expiresAt);
  return `${payload}.${signature}`;
}

async function updateVerificationMessage(nonce, payload) {
  const token = pendingVerificationStates.get(`token:${nonce}`);
  pendingVerificationStates.delete(`token:${nonce}`);
  if (!token || !client.user?.id) return false;
  const response = await fetch(`https://discord.com/api/v10/webhooks/${client.user.id}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Could not update the verification message (${response.status}): ${detail}`);
  }
  return true;
}

async function syncDiscordMember(discordId, robloxUsername, robloxUserId) {
  const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID);
  const member = await guild.members.fetch(discordId);
  const groupRoles = await listRoles();
  const targetGroupRole = await getCurrentRole(robloxUserId);
  if (!targetGroupRole?.role) throw new Error("That Roblox account is not currently a member of the configured group.");

  const targetName = String(targetGroupRole.role.displayName || "").trim();
  if (!targetName) throw new Error("Roblox returned an invalid group role.");
  const targetDiscordRole = guild.roles.cache.find(role => !role.managed && role.name.toLowerCase() === targetName.toLowerCase());
  if (!targetDiscordRole) throw new Error(`No Discord role named "${targetName}" exists. Create a Discord role with the same name as the Roblox group role first.`);
  if (!targetDiscordRole.editable) throw new Error(`The bot cannot manage the Discord role "${targetDiscordRole.name}". Move the bot highest role above it.`);

  const groupRoleNames = new Set(groupRoles.map(role => String(role.displayName || "").trim().toLowerCase()).filter(Boolean));
  const oldRankRoles = member.roles.cache.filter(role => !role.managed && groupRoleNames.has(role.name.trim().toLowerCase()) && role.id !== targetDiscordRole.id);
  if (oldRankRoles.size) await member.roles.remove(oldRankRoles, "Roblox verification role sync");
  if (!member.roles.cache.has(targetDiscordRole.id)) await member.roles.add(targetDiscordRole, "Roblox verification role sync");
  if (!member.manageable) throw new Error("The bot cannot change this member nickname. Make sure the bot highest role is above the member.");
  await member.setNickname(robloxUsername, "Roblox verification nickname sync");
  return { groupRole: targetGroupRole.role, discordRole: targetDiscordRole };
}

function consumeVerificationState(state) {
  const [payload, signature] = String(state || "").split(".");
  if (!payload || !signature) throw new Error("Invalid verification link.");
  const expected = crypto.createHmac("sha256", process.env.VERIFY_STATE_SECRET).update(payload).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid verification link.");
  let data;
  try { data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); }
  catch { throw new Error("Invalid verification link."); }
  if (!data.discordId || !data.nonce || Date.now() > Number(data.expiresAt)) {
    throw new Error("This verification link has expired. Run /verify in Discord again.");
  }
  const expiresAt = pendingVerificationStates.get(data.nonce);
  if (!expiresAt || expiresAt < Date.now()) {
    throw new Error("This verification link has expired or was already used. Run /verify in Discord again.");
  }
  pendingVerificationStates.delete(data.nonce);
  return data;
}

function escapeHtml(value) {
  return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
}

function htmlPage(title, body) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{margin:0;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1020;color:#f8fafc;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box}
.card{width:min(560px,100%);background:#151b2e;border:1px solid #29314d;border-radius:20px;padding:32px;box-sizing:border-box;text-align:center;box-shadow:0 20px 60px #0005}
h1{margin:0 0 12px;font-size:28px}.sub{color:#aab3cc;line-height:1.6;margin:0 0 24px}.btn{display:inline-block;background:#5865f2;color:white;text-decoration:none;border-radius:12px;padding:14px 22px;font-weight:700}.ok{font-size:48px;margin-bottom:12px}.small{color:#7f8aa8;font-size:13px;margin-top:22px}
</style></head><body><main class="card">${body}</main></body></html>`;
}

function sendHtml(res, status, html) {
  res.writeHead(status, {"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store"});
  res.end(html);
}

async function handleRobloxCallback(requestUrl, res) {
  if (requestUrl.searchParams.get("error")) {
    sendHtml(res, 400, htmlPage("Verification cancelled", `<div class="ok">↩️</div><h1>Verification cancelled</h1><p class="sub">Roblox authorization was cancelled. Run <b>/verify</b> in Discord to try again.</p>`));
    return;
  }

  const code = requestUrl.searchParams.get("code");
  const stateData = consumeVerificationState(requestUrl.searchParams.get("state"));
  const pkce = pendingVerificationStates.get(`pkce:${stateData.nonce}`);
  pendingVerificationStates.delete(`pkce:${stateData.nonce}`);
  if (!code || !pkce || pkce.expiresAt < Date.now()) {
    throw new Error("The verification session expired. Run /verify in Discord again.");
  }

  const tokenResponse = await fetch(OAUTH_TOKEN_URL, {
    method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({
      grant_type:"authorization_code",
      code,
      code_verifier:pkce.verifier,
      client_id:process.env.ROBLOX_OAUTH_CLIENT_ID,
      client_secret:process.env.ROBLOX_OAUTH_CLIENT_SECRET,
      redirect_uri:process.env.ROBLOX_OAUTH_REDIRECT_URI
    })
  });
  if (!tokenResponse.ok) throw new Error(`Roblox authorization failed (${tokenResponse.status}).`);

  const tokens=await tokenResponse.json();
  const userResponse=await fetch(OAUTH_USERINFO_URL,{headers:{Authorization:`Bearer ${tokens.access_token}`}});
  if (!userResponse.ok) throw new Error(`Could not read Roblox account information (${userResponse.status}).`);

  const robloxUser=await userResponse.json();
  if (!robloxUser.sub) throw new Error("Roblox did not return a user ID.");

  const robloxUsername = robloxUser.preferred_username || robloxUser.name || "Roblox User";
  const sync = await syncDiscordMember(stateData.discordId, robloxUsername, String(robloxUser.sub));
  await setVerified(stateData.discordId,{
    userId:String(robloxUser.sub),
    username:robloxUsername,
    verifiedAt:new Date().toISOString(),
    method:"roblox-oauth"
  });
  await updateVerificationMessage(stateData.nonce, {
    content: `✅ **Verification Complete**\n\nYour Roblox account has been successfully verified and your Discord account has been synchronized.\n\n**Roblox:** \`${robloxUsername}\`\n**Group Rank:** \`${sync.groupRole.displayName}\` (rank ${sync.groupRole.rank})\n**Discord Role:** \`@${sync.discordRole.name}\`\n**Nickname:** \`${robloxUsername}\``,
    components: []
  });
  sendHtml(res,200,htmlPage("Verification complete",`<div class="ok">✅</div><h1>Verification complete!</h1><p class="sub"><b>${escapeHtml(robloxUsername)}</b> has been verified and your Discord role and nickname have been synchronized.</p><p class="small">You can close this page and return to Discord.</p>`));
}

async function getRobloxUser(username) {
  const user = await getUserByUsername(String(username).trim());
  if (!user) throw new Error("Roblox username not found.");
  return user;
}

async function recordAction(user, action, reason, interaction, extra = {}) {
  await addModerationAction(user.id, {
    action,
    reason: reason || "",
    username: user.name,
    userId: String(user.id),
    staffId: interaction.user.id,
    staffTag: interaction.user.tag,
    timestamp: new Date().toISOString(),
    ...extra
  });
}

function formatHistory(entries, filter = null) {
  const items = filter ? entries.filter(filter) : entries;
  if (!items.length) return "No moderation history found.";
  return items.slice(0, 15).map((entry, i) => {
    const date = new Date(entry.timestamp).toLocaleString();
    return `**${i + 1}. ${entry.action}** — ${entry.reason || "No reason"}\nStaff: ${entry.staffTag || entry.staffId || "Unknown"}\n${date}`;
  }).join("\n\n");
}

client.on(Events.InteractionCreate, async interaction => {
  try {
    // Role-name autocomplete
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== "rank" && interaction.commandName !== "setrank") return;

      const focused = interaction.options.getFocused();
      const roles = await listRoles();

      const results = roles
        .filter(r => r.displayName)
        .filter(r =>
          r.displayName.toLowerCase().includes(focused.toLowerCase()) ||
          String(r.rank).includes(focused)
        )
        .slice(0, 25)
        .map(r => ({
          name: `${r.displayName} (rank ${r.rank})`,
          value: r.displayName
        }));

      await interaction.respond(results);
      return;
    }

    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "help") {
      const staffCommands = [
        "/userinfo", "/rank", "/unrank", "/setrank", "/blacklist", "/roles",
        "/pban", "/unpban", "/warn", "/warnings", "/clearwarnings", "/kick",
        "/ban", "/mute", "/unmute", "/history", "/notes", "/profile", "/gameinfo",
        "/modlog", "/stafflog", "/announce", "/shutdown", "/serverlock",
        "/serverunlock", "/promote", "/demote", "/rankinfo", "/rankhistory", "/say"
      ];
      const everyoneCommands = [
        "/help", "/myinfo", "/verify", "/switchaccount", "/getrank", "/botinfo", "/ping",
        "/uptime", "/stats", "/8ball", "/coinflip", "/roast"
      ];

      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🤖 Bot Help")
        .setDescription("Commands are grouped by who can use them.")
        .addFields(
          { name: "🌐 Everyone", value: everyoneCommands.join("\n") },
          { name: "🛡️ Staff Only", value: staffCommands.join("\n") }
        )
        .setFooter({ text: `Bot v${BOT_VERSION}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "botinfo") {
      const guild = interaction.guild;
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle("🤖 Bot Information")
        .addFields(
          { name: "Version", value: BOT_VERSION, inline: true },
          { name: "Uptime", value: formatUptime(process.uptime()), inline: true },
          { name: "Commands", value: String((await client.application?.commands?.fetch())?.size || 0), inline: true },
          { name: "Server", value: guild?.name || "Direct message", inline: true },
          { name: "Members", value: guild ? String(guild.memberCount) : "N/A", inline: true }
        )
        .setFooter({ text: "Roblox Ranking Bot" })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "ping") {
      const sentAt = Date.now();
      await interaction.reply({ content: "🏓 Pinging..." });
      const roundTrip = Date.now() - sentAt;
      const websocket = client.ws.ping;

      await interaction.editReply(
        `🏓 **Pong!**\nRound trip: **${roundTrip}ms**\nDiscord WebSocket: **${websocket}ms**`
      );
      return;
    }

    if (interaction.commandName === "uptime") {
      await interaction.reply({
        content: `⏱️ I've been running for **${formatUptime(process.uptime())}**.`,
        ephemeral: false
      });
      return;
    }

    if (interaction.commandName === "stats") {
      const guild = interaction.guild;
      const embed = new EmbedBuilder()
        .setColor(0x22c55e)
        .setTitle("📊 Bot & Server Stats")
        .addFields(
          { name: "Server", value: guild?.name || "Direct message", inline: true },
          { name: "Members", value: guild ? String(guild.memberCount) : "N/A", inline: true },
          { name: "Bot Uptime", value: formatUptime(process.uptime()), inline: true },
          { name: "WebSocket Ping", value: `${client.ws.ping}ms`, inline: true },
          { name: "Bot Version", value: BOT_VERSION, inline: true }
        )
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "say") {
      requireStaff(interaction);
      const message = interaction.options.getString("message", true).trim();
      await interaction.reply({ content: "✅ Sent.", ephemeral: true });
      await interaction.channel.send({ content: message });
      return;
    }

    if (interaction.commandName === "8ball") {
      const question = interaction.options.getString("question", true).trim();
      const answer = EIGHT_BALL[Math.floor(Math.random() * EIGHT_BALL.length)];
      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("🎱 Magic 8-Ball")
        .addFields(
          { name: "Question", value: question },
          { name: "Answer", value: answer }
        )
        .setFooter({ text: `Asked by ${interaction.user.username}` });

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "coinflip") {
      const result = Math.random() < 0.5 ? "Heads" : "Tails";
      await interaction.reply({ content: `🪙 The coin landed on **${result}**!`, ephemeral: false });
      return;
    }

    if (interaction.commandName === "roast") {
      const target = interaction.options.getUser("user") || interaction.user;
      const roast = ROASTS[Math.floor(Math.random() * ROASTS.length)];
      await interaction.reply({
        content: `🔥 **${target.username}** — ${roast}`,
        ephemeral: false
      });
      return;
    }


    if (interaction.commandName === "verify" || interaction.commandName === "switchaccount") {
      const existingVerification = await getVerified(interaction.user.id);
      const switching = interaction.commandName === "switchaccount";

      if (!switching && existingVerification) {
        throw new Error(`You are already verified as **${existingVerification.username}**. You do not need to verify again.`);
      }

      if (switching && !existingVerification) {
        throw new Error("You are not currently verified. Use **/verify** first.");
      }

      const state = createVerificationState(interaction.user.id, switching ? "switch" : "verify");
      const url = new URL(process.env.ROBLOX_OAUTH_REDIRECT_URI);
      url.pathname = "/verify";
      url.search = new URLSearchParams({ state }).toString();

      await interaction.reply({
        content: switching
          ? "🔄 **Switch Roblox Account**\n\nClick the button below to link a different Roblox account. Your current linked account will be replaced only after the new account is successfully verified.\n\n⏳ This link expires in 10 minutes."
          : "🔗 **Link your Roblox account**\n\nClick the button below to open the verification website. Roblox will handle the sign-in, then your account will be linked automatically.\n\n⏳ This link expires in 10 minutes.",
        components: [{
          type: 1,
          components: [{ type: 2, style: 5, label: "🔗 Link Roblox Account", url: url.toString() }]
        }],
        ephemeral: true
      });
      const statePayload = JSON.parse(Buffer.from(state.split(".")[0], "base64url").toString("utf8"));
      pendingVerificationStates.set(`token:${statePayload.nonce}`, interaction.token);
      return;
    }

    if (interaction.commandName === "userinfo") {
      requireStaff(interaction);

      const username = interaction.options.getString("username", true).trim();
      const user = await getUserByUsername(username);
      if (!user) {
        throw new Error("Roblox username not found.");
      }

      const restriction = await getUserRestriction(user.id);
      const banInfo = restriction?.gameJoinRestriction?.active
        ? `🔴 **Currently game banned**\n**Reason:** ${restriction.gameJoinRestriction.displayReason || restriction.gameJoinRestriction.privateReason || "No reason provided."}`
        : "🟢 Not currently game banned.";

      const linkedDiscordId = await getDiscordIdByRobloxUserId(user.id);
      const blacklist = linkedDiscordId ? await getBlacklistEntry(linkedDiscordId) : null;

      const embed = new EmbedBuilder()
        .setColor(0xef4444)
        .setTitle(`🔨 Punishments — ${user.name}`)
        .addFields(
          { name: "Roblox account", value: `👤 **Username:** ${user.name}\n🆔 **User ID:** ${user.id}` },
          { name: "Game ban", value: banInfo },
          { name: "Staff blacklist", value: blacklist ? `🔴 **Staff blacklisted**\n**Reason:** ${blacklist.reason || "No reason provided."}` : "🟢 Not staff blacklisted." }
        )
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "myinfo") {
      const verified = await getVerified(interaction.user.id);
      const blacklist = await getBlacklistEntry(interaction.user.id);

      let robloxInfo = "❌ No Roblox account is linked.";
      let rankInfo = "❌ No Roblox group rank available.";
      let statusInfo = "🟢 No active game restriction.";

      if (verified) {
        robloxInfo = `👤 **Username:** ${verified.username}\n🆔 **User ID:** ${verified.userId}`;

        const current = await getCurrentRole(verified.userId);
        if (current?.role) {
          rankInfo = `🏷️ **${current.role.displayName}** (rank ${current.role.rank})`;
        }

        const restriction = await getUserRestriction(verified.userId);
        if (restriction?.gameJoinRestriction?.active) {
          const reason = restriction.gameJoinRestriction.displayReason || restriction.gameJoinRestriction.privateReason || "No reason provided.";
          statusInfo = `🔴 Active game restriction\n**Reason:** ${reason}`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("🪐 Your information")
        .setDescription("Current information available for your account.")
        .addFields(
          { name: "Roblox information", value: robloxInfo },
          { name: "Game status", value: statusInfo },
          { name: "Blacklist information", value: blacklist ? `🔴 Staff blacklisted\n**Reason:** ${blacklist.reason || "No reason provided."}` : "🟢 Not staff blacklisted." },
          { name: "Group rank", value: rankInfo }
        )
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }


    if (interaction.commandName === "warn") {
      requireStaff(interaction);
      const username = interaction.options.getString("username", true);
      const reason = interaction.options.getString("reason", true).trim();
      const user = await getRobloxUser(username);
      await recordAction(user, "WARN", reason, interaction);
      await interaction.reply({ content: `⚠️ Warned **${user.name}**. Reason: ${reason}`, ephemeral: false });
      await logAction(interaction, `⚠️ **Warning**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nReason: ${reason}`);
      return;
    }

    if (interaction.commandName === "warnings") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const history = await getModerationHistory(user.id);
      const text = formatHistory(history, e => e.action === "WARN");
      const embed = new EmbedBuilder().setColor(0xf59e0b).setTitle(`⚠️ Warnings — ${user.name}`).setDescription(text).setFooter({ text: `Requested by ${interaction.user.username}` }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "clearwarnings") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      await clearWarnings(user.id);
      await interaction.reply({ content: `✅ Cleared warnings for **${user.name}**.`, ephemeral: false });
      await logAction(interaction, `🧹 **Warnings Cleared**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})`);
      return;
    }

    if (interaction.commandName === "kick") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const reason = interaction.options.getString("reason", true).trim();
      await publishGameMessage("discord-moderation", { action: "KICK", userId: user.id, reason });
      await recordAction(user, "KICK", reason, interaction);
      await interaction.reply({ content: `👢 Kicked **${user.name}** from active game servers.`, ephemeral: false });
      await logAction(interaction, `👢 **Kick**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nReason: ${reason}`);
      return;
    }

    if (interaction.commandName === "ban") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const minutes = interaction.options.getInteger("duration", true);
      const reason = interaction.options.getString("reason", true).trim();
      await temporaryBanUser(user.id, minutes * 60, reason);
      await recordAction(user, "BAN", reason, interaction, { durationMinutes: minutes });
      await interaction.reply({ content: `🔨 Banned **${user.name}** for **${minutes} minutes**.\nReason: ${reason}`, ephemeral: false });
      await logAction(interaction, `🔨 **Temporary Ban**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nDuration: ${minutes} minutes\nReason: ${reason}`);
      return;
    }

    if (interaction.commandName === "mute") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const minutes = interaction.options.getInteger("duration", true);
      const reason = interaction.options.getString("reason", true).trim();
      await publishGameMessage("discord-moderation", { action: "MUTE", userId: user.id, durationSeconds: minutes * 60, reason });
      await recordAction(user, "MUTE", reason, interaction, { durationMinutes: minutes });
      await interaction.reply({ content: `🔇 Muted **${user.name}** for **${minutes} minutes**.\nReason: ${reason}`, ephemeral: false });
      await logAction(interaction, `🔇 **Mute**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nDuration: ${minutes} minutes\nReason: ${reason}`);
      return;
    }

    if (interaction.commandName === "unmute") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      await publishGameMessage("discord-moderation", { action: "UNMUTE", userId: user.id });
      await recordAction(user, "UNMUTE", "Manual unmute", interaction);
      await interaction.reply({ content: `🔊 Unmuted **${user.name}**.`, ephemeral: false });
      await logAction(interaction, `🔊 **Unmute**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})`);
      return;
    }

    if (interaction.commandName === "history" || interaction.commandName === "modlog" || interaction.commandName === "stafflog") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const history = await getModerationHistory(user.id);
      const text = formatHistory(history);
      const embed = new EmbedBuilder().setColor(0x6366f1).setTitle(`📋 Moderation History — ${user.name}`).setDescription(text).setFooter({ text: `Requested by ${interaction.user.username}` }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "notes") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const note = interaction.options.getString("note", true).trim();
      await addStaffNote(user.id, { note, staffId: interaction.user.id, staffTag: interaction.user.tag, timestamp: new Date().toISOString() });
      await interaction.reply({ content: `📝 Added a staff note for **${user.name}**.`, ephemeral: false });
      await logAction(interaction, `📝 **Staff Note Added**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nNote: ${note}`);
      return;
    }

    if (interaction.commandName === "profile") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const profile = await getUserProfile(user.id);
      const embed = new EmbedBuilder().setColor(0x3b82f6).setTitle(`👤 Roblox Profile — ${profile.name}`).addFields(
        { name: "Username", value: profile.name, inline: true },
        { name: "Display name", value: profile.displayName || profile.name, inline: true },
        { name: "User ID", value: String(profile.id), inline: true },
        { name: "Created", value: profile.created ? new Date(profile.created).toLocaleDateString() : "Unknown", inline: true },
        { name: "Description", value: (profile.description || "No description.").slice(0, 1000) }
      ).setFooter({ text: `Requested by ${interaction.user.username}` }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "gameinfo") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const current = await getCurrentRole(user.id);
      const restriction = await getUserRestriction(user.id);
      const rank = current?.role ? `${current.role.displayName} (rank ${current.role.rank})` : "Not in group";
      const status = restriction?.gameJoinRestriction?.active
        ? `🔴 Banned\nReason: ${restriction.gameJoinRestriction.displayReason || restriction.gameJoinRestriction.privateReason || "No reason provided."}`
        : "🟢 Not currently game banned.";
      const embed = new EmbedBuilder().setColor(0x22c55e).setTitle(`🎮 Game Info — ${user.name}`).addFields(
        { name: "Group rank", value: rank },
        { name: "Game status", value: status }
      ).setFooter({ text: `Requested by ${interaction.user.username}` }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "announce") {
      requireStaff(interaction);
      const message = interaction.options.getString("message", true).trim();
      await publishGameMessage("discord-moderation", { action: "ANNOUNCE", message });
      await interaction.reply({ content: `📢 Announcement sent to live game servers.\n${message}`, ephemeral: false });
      await logAction(interaction, `📢 **Game Announcement**\nStaff: ${interaction.user.tag}\nMessage: ${message}`);
      return;
    }

    if (interaction.commandName === "shutdown") {
      requireStaff(interaction);
      const reason = interaction.options.getString("reason", true).trim();
      await publishGameMessage("discord-moderation", { action: "SHUTDOWN", reason });
      await restartUniverseServers();
      await interaction.reply({ content: `🔄 Restart request sent to all game servers. Reason: ${reason}`, ephemeral: false });
      await logAction(interaction, `🔄 **Server Shutdown/Restart**\nStaff: ${interaction.user.tag}\nReason: ${reason}`);
      return;
    }

    if (interaction.commandName === "serverlock") {
      requireStaff(interaction);
      const reason = interaction.options.getString("reason", true).trim();
      await publishGameMessage("discord-moderation", { action: "SERVERLOCK", reason });
      await interaction.reply({ content: `🔒 Live game servers are now locked against new joins.\nReason: ${reason}`, ephemeral: false });
      await logAction(interaction, `🔒 **Server Lock**\nStaff: ${interaction.user.tag}\nReason: ${reason}`);
      return;
    }

    if (interaction.commandName === "serverunlock") {
      requireStaff(interaction);
      await publishGameMessage("discord-moderation", { action: "SERVERUNLOCK" });
      await interaction.reply({ content: "🔓 Live game servers have been unlocked.", ephemeral: false });
      await logAction(interaction, `🔓 **Server Unlock**\nStaff: ${interaction.user.tag}`);
      return;
    }

    if (interaction.commandName === "promote" || interaction.commandName === "demote") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const current = await getCurrentRole(user.id);
      if (!current?.role) throw new Error("That Roblox user is not currently in the group.");

      const roles = (await listRoles()).sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      const index = roles.findIndex(r => String(r.id) === String(current.role.id));
      const targetIndex = interaction.commandName === "promote" ? index + 1 : index - 1;
      if (targetIndex < 0 || targetIndex >= roles.length) throw new Error(`Cannot ${interaction.commandName} **${user.name}** any further.`);

      const targetRole = roles[targetIndex];
      await assignRole(user.id, targetRole.id);
      const action = interaction.commandName === "promote" ? "PROMOTE" : "DEMOTE";
      await recordAction(user, action, `${current.role.displayName} → ${targetRole.displayName}`, interaction, { fromRank: current.role.rank, toRank: targetRole.rank });
      await interaction.reply({ content: `${action === "PROMOTE" ? "⬆️" : "⬇️"} **${user.name}** is now **${targetRole.displayName}** (rank ${targetRole.rank}).`, ephemeral: false });
      await logAction(interaction, `📋 **${action}**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nNew role: ${targetRole.displayName} (${targetRole.rank})`);
      return;
    }

    if (interaction.commandName === "rankinfo") {
      requireStaff(interaction);
      const input = interaction.options.getString("rank", true).trim();
      const roles = await listRoles();
      const role = /^\d+$/.test(input) ? roles.find(r => String(r.rank) === input) : roles.find(r => String(r.displayName).toLowerCase() === input.toLowerCase());
      if (!role) throw new Error("Rank not found.");
      const embed = new EmbedBuilder().setColor(0x8b5cf6).setTitle(`🏷️ Rank Information — ${role.displayName}`).addFields(
        { name: "Rank number", value: String(role.rank), inline: true },
        { name: "Members", value: role.memberCount != null ? String(role.memberCount) : "Not provided", inline: true }
      ).setFooter({ text: `Requested by ${interaction.user.username}` }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "rankhistory") {
      requireStaff(interaction);
      const user = await getRobloxUser(interaction.options.getString("username", true));
      const history = await getModerationHistory(user.id);
      const text = formatHistory(history, e => ["PROMOTE", "DEMOTE", "RANK", "SETRANK"].includes(e.action));
      const embed = new EmbedBuilder().setColor(0x14b8a6).setTitle(`📈 Rank History — ${user.name}`).setDescription(text).setFooter({ text: `Requested by ${interaction.user.username}` }).setTimestamp();
      await interaction.reply({ embeds: [embed], ephemeral: false });
      return;
    }

    if (interaction.commandName === "pban") {
      requireStaff(interaction);

      const username = interaction.options.getString("username", true).trim();
      const reason = interaction.options.getString("reason", true).trim();

      const user = await getUserByUsername(username);
      if (!user) {
        throw new Error("Roblox username not found.");
      }

      const linkedDiscordId = await getDiscordIdByRobloxUserId(user.id);
      if (linkedDiscordId) {
        const blacklist = await getBlacklistEntry(linkedDiscordId);
        if (blacklist) {
          throw new Error("This user is blacklisted. In order to permanently ban, use the command **/unblacklist.**");
        }
      }

      await interaction.deferReply({ ephemeral: false });

      await permanentBanUser(user.id, reason);
      await recordAction(user, "PBAN", reason, interaction);

     await interaction.editReply(
      `🚫 Permanently banned **${user.name}** for **${reason}**.`
       );

      await logAction(
        interaction,
        `🚫 **Permanent Roblox Ban**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nReason: ${reason}`
      );

      return;
    }

    if (interaction.commandName === "unpban") {
      requireStaff(interaction);

      const username = interaction.options.getString("username", true).trim();
      const user = await getUserByUsername(username);

      if (!user) {
        throw new Error("Roblox username not found.");
      }

      await interaction.deferReply({ ephemeral: false });
      await unbanUser(user.id);
      await recordAction(user, "UNPBAN", "Manual permanent ban removal", interaction);

      await interaction.editReply(
        `✅ Unbanned **${user.name}**.`
      );

      await logAction(
        interaction,
        `✅ **Roblox Unban**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})`
      );

      return;
    }

    if (interaction.commandName === "blacklist") {
      requireStaff(interaction);

      const target = interaction.options.getUser("user", true);
      const action = interaction.options.getString("action", true);
      const reason = interaction.options.getString("reason")?.trim() || "No reason provided.";

      if (action === "add") {
        const verified = await getVerified(target.id);
        if (verified) {
          const restriction = await getUserRestriction(verified.userId);
          const gameJoinRestriction = restriction?.gameJoinRestriction;

          if (gameJoinRestriction?.active && !gameJoinRestriction?.duration) {
            throw new Error(
              target.username + " is permanently banned from the Roblox game and cannot be blacklisted."
            );
          }
        }

        await setBlacklisted(target.id, {
          reason,
          staffId: interaction.user.id,
          staffTag: interaction.user.tag,
          timestamp: new Date().toISOString()
        });

        await interaction.reply({
          content: `🚫 **${target.username}** has been blacklisted from Roblox ranking.\nReason: ${reason}`,
          ephemeral: false
        });

        await logAction(
          interaction,
          `🚫 **Blacklist Added**\nStaff: ${interaction.user.tag}\nTarget: ${target.tag}\nReason: ${reason}`
        );
      } else {
        await setBlacklisted(target.id, null);

        await interaction.reply({
          content: `✅ **${target.username}** has been removed from the ranking blacklist.`,
          ephemeral: false
        });

        await logAction(
          interaction,
          `✅ **Blacklist Removed**\nStaff: ${interaction.user.tag}\nTarget: ${target.tag}`
        );
      }
      return;
    }

    if (interaction.commandName === "setrank") {
      requireStaff(interaction);

      const username = interaction.options.getString("username", true).trim();
      const roleInput = interaction.options.getString("role", true).trim();

      const user = await getUserByUsername(username);
      if (!user) {
        throw new Error("Roblox username not found.");
      }

      const linkedDiscordId = await getDiscordIdByRobloxUserId(user.id);
      const blacklist = linkedDiscordId ? await getBlacklistEntry(linkedDiscordId) : null;
      if (blacklist) {
        throw new Error(`${user.name} is blacklisted from ranking. Reason: ${blacklist.reason}`);
      }

      const roles = await listRoles();
      const role = /^\d+$/.test(roleInput)
        ? roles.find(r => String(r.rank) === roleInput)
        : await findRoleByName(roleInput);

      if (!role) {
        throw new Error(`Roblox group role "${roleInput}" was not found. Enter the rank name or rank number.`);
      }

      await interaction.deferReply({ ephemeral: false });
      await assignRole(user.id, role.id);

      await interaction.editReply(
        `✅ Set **${user.name}** to **${role.displayName}** (rank ${role.rank}).`
      );
      await recordAction(user, "SETRANK", `Set to ${role.displayName} (rank ${role.rank})`, interaction, { toRank: role.rank });

      await logAction(
        interaction,
        `📋 **Set Rank**\nStaff: ${interaction.user.tag}\nRoblox: ${user.name} (${user.id})\nNew role: ${role.displayName} (${role.id})`
      );
      return;
    }

    if (interaction.commandName === "roles") {
      requireStaff(interaction);

      const roles = await listRoles();
      const text = roles
        .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
        .map(r => `**${r.displayName}** — rank ${r.rank} — ID ${r.id}`)
        .join("\n");

      await interaction.reply({
        content: text.slice(0, 1900) || "No roles found.",
        ephemeral: false
      });
      return;
    }

    if (interaction.commandName === "getrank") {
      const target = interaction.options.getUser("user", true);
      const verified = await getVerified(target.id);

      if (!verified) {
        throw new Error(`${target.username} has not linked a Roblox account.`);
      }

      const current = await getCurrentRole(verified.userId);

      if (!current) {
        await interaction.reply({
          content: `**${verified.username}** is not currently a member of the Roblox group.`,
          ephemeral: false
        });
        return;
      }

      await interaction.reply({
        content: `**${verified.username}** — **${current.role.displayName}** (rank ${current.role.rank})`,
        ephemeral: false
      });
      return;
    }

    if (interaction.commandName === "rank") {
      requireStaff(interaction);

      const target = interaction.options.getUser("user", true);
      const roleName = interaction.options.getString("role", true);

      const blacklist = await getBlacklistEntry(target.id);
      if (blacklist) {
        throw new Error(`${target.username} is blacklisted from ranking. Reason: ${blacklist.reason}`);
      }

      const verified = await getVerified(target.id);
      if (!verified) {
        throw new Error(`${target.username} has not linked a Roblox account. They need to use /verify first.`);
      }

      const role = await findRoleByName(roleName);
      if (!role) {
        throw new Error(`Roblox group role "${roleName}" was not found. Use /roles to see the available roles.`);
      }

      await interaction.deferReply({ ephemeral: false });
      await assignRole(verified.userId, role.id);

      await interaction.editReply(
        `✅ Ranked **${verified.username}** as **${role.displayName}** (rank ${role.rank}).`
      );
      await recordAction({ id: verified.userId, name: verified.username }, "RANK", `Set to ${role.displayName} (rank ${role.rank})`, interaction, { toRank: role.rank });

      await logAction(
        interaction,
        `📋 **Rank Action**\nStaff: ${interaction.user.tag}\nTarget: ${target.tag}\nRoblox: ${verified.username} (${verified.userId})\nNew role: ${role.displayName} (${role.id})`
      );
      return;
    }

    if (interaction.commandName === "unrank") {
      requireStaff(interaction);

      const target = interaction.options.getUser("user", true);
      const verified = await getVerified(target.id);

      if (!verified) {
        throw new Error(`${target.username} has not linked a Roblox account.`);
      }

      await interaction.deferReply({ ephemeral: false });
      await unassignHighestRole(verified.userId);

      await interaction.editReply(
        `✅ Removed the current highest Roblox group role from **${verified.username}**.`
      );
      await recordAction({ id: verified.userId, name: verified.username }, "UNRANK", "Removed current highest role", interaction);

      await logAction(
        interaction,
        `📋 **Unrank Action**\nStaff: ${interaction.user.tag}\nTarget: ${target.tag}\nRoblox: ${verified.username} (${verified.userId})`
      );
      return;
    }
  } catch (error) {
    console.error(error);

    const content = `❌ ${friendlyError(error)}`;

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content }).catch(() => {});
    } else {
      await interaction.reply({ content, ephemeral: false }).catch(() => {});
    }
  }
});

const port = Number(process.env.PORT || 10000);
const healthServer = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, discord: client.isReady() }));
      return;
    }

    if (requestUrl.pathname === "/privacy") {
      sendHtml(res, 200, htmlPage("Privacy Policy", `
        <h1>Privacy Policy</h1>
        <p class="sub">BloxyWorld Connect uses Roblox OAuth 2.0 to connect a Roblox account with a Discord account for account linking and Roblox group management.</p>
        <h2>Information we store</h2>
        <p>When you link your account, we store your Discord user ID, Roblox user ID, Roblox username, verification time, and verification method. The service may also store moderation records, warnings, blacklist information, staff notes, and rank-related history when those features are used.</p>
        <h2>How we use it</h2>
        <p>This information is used to maintain your account link, manage Roblox group ranks, provide moderation features, and maintain records needed to operate the community.</p>
        <h2>Access and removal</h2>
        <p>You may contact BloxyWorld community staff to request access to information associated with your account or to request removal of your account-linking information. Some records may need to be retained when reasonably necessary for moderation, security, fraud prevention, legal obligations, or community administration.</p>
        <h2>Sharing</h2>
        <p>We do not sell your information. Information may be processed by Roblox, Discord, Supabase, Render, and other service providers used to operate BloxyWorld Connect.</p>
        <h2>Contact</h2>
        <p>For privacy questions, access requests, or removal requests, contact the BloxyWorld community staff through the official Discord server.</p>
      `));
      return;
    }

    if (requestUrl.pathname === "/terms") {
      sendHtml(res, 200, htmlPage("Terms of Service", `
        <h1>Terms of Service</h1>
        <p class="sub">By using BloxyWorld Connect, you agree to use the service only for its intended account-linking and Roblox group-management purposes.</p>
        <h2>Use of the service</h2>
        <p>You must use an account you are authorized to link. Do not attempt to impersonate another Roblox or Discord user or abuse the verification system.</p>
        <h2>Roblox and Discord</h2>
        <p>BloxyWorld Connect is a third-party service and is not operated by Roblox Corporation or Discord Inc. Your use of Roblox and Discord remains subject to their respective terms and policies.</p>
        <h2>Data and account records</h2>
        <p>Using the service means you understand that information described in the Privacy Policy may be stored to provide account linking, ranking, moderation, and security features. You may contact community staff to request access to or removal of information associated with your account, subject to legitimate retention needs.</p>
        <h2>Changes and termination</h2>
        <p>Community staff may restrict access to the verification service or change its functionality when necessary to operate the community. The service may retain records reasonably necessary for moderation, security, fraud prevention, legal obligations, or community administration.</p>
        <h2>Contact</h2>
        <p>For questions about these terms, contact the BloxyWorld community staff through the official Discord server.</p>
      `));
      return;
    }

    if (requestUrl.pathname === "/verify") {
      const state = requestUrl.searchParams.get("state");
      if (!state) {
        sendHtml(res, 400, htmlPage("Verify Roblox", "<h1>🔗 Link Roblox</h1><p class=\"sub\">Start verification from Discord with <b>/verify</b>.</p>"));
        return;
      }

      const [payload, signature] = state.split(".");
      if (!payload || !signature) throw new Error("Invalid verification link.");
      const expected = crypto.createHmac("sha256", process.env.VERIFY_STATE_SECRET).update(payload).digest("base64url");
      const a=Buffer.from(signature), b=Buffer.from(expected);
      if(a.length!==b.length || !crypto.timingSafeEqual(a,b)) throw new Error("Invalid verification link.");
      const stateData=JSON.parse(Buffer.from(payload,"base64url").toString("utf8"));
      const expiresAt=pendingVerificationStates.get(stateData.nonce);
      if(!expiresAt || expiresAt < Date.now() || Date.now() > Number(stateData.expiresAt)) throw new Error("This verification link has expired. Run /verify in Discord again.");

      const verifier=crypto.randomBytes(48).toString("base64url");
      const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");
      pendingVerificationStates.set(`pkce:${stateData.nonce}`,{verifier,expiresAt:Date.now()+10*60*1000});

      const params=new URLSearchParams({
        client_id:process.env.ROBLOX_OAUTH_CLIENT_ID,
        redirect_uri:process.env.ROBLOX_OAUTH_REDIRECT_URI,
        scope:"openid profile",
        response_type:"code",
        state,
        nonce:stateData.nonce,
        code_challenge:challenge,
        code_challenge_method:"S256"
      });
      sendHtml(res,200,htmlPage("Link Roblox Account",`<h1>🔗 Link Roblox Account</h1><p class="sub">Continue to the official Roblox authorization page. After you approve, you'll be sent back here and automatically verified.</p><a class="btn" href="${OAUTH_AUTHORIZE_URL}?${params.toString()}">Continue with Roblox</a><p class="small">Only your Roblox identity is used for verification.</p>`));
      return;
    }

    if (requestUrl.pathname === "/oauth/roblox/callback") {
      await handleRobloxCallback(requestUrl,res);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Roblox Ranking Bot is running.");
  } catch(error) {
    console.error("Verification web error:",error);
    sendHtml(res,400,htmlPage("Verification error",`<h1>❌ Verification error</h1><p class="sub">${escapeHtml(error.message || "Something went wrong.")}</p><p class="small">Run /verify in Discord again to start a fresh session.</p>`));
  }
});
healthServer.listen(port, "0.0.0.0", () => {
  console.log(`Health server listening on port ${port}`);
});

client.once(Events.ClientReady, readyClient => {
  const statuses = [
    { name: "BloxyWorld | /verify", type: 0 },
    { name: "BloxyWorld | /help", type: 0 },
    { name: "Playing BloxyWorld", type: 0 },
    { name: "Watching for rule breakers", type: 0 }
  ];

  let statusIndex = 0;

  const updateStatus = () => {
    readyClient.user.setPresence({
      activities: [statuses[statusIndex]],
      status: "online"
    });
    statusIndex = (statusIndex + 1) % statuses.length;
  };

  updateStatus();
  setInterval(updateStatus, 45_000);
  console.log("Rotating Discord status enabled.");
});

client.login(process.env.DISCORD_TOKEN);
