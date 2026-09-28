import "dotenv/config";
import http from "node:http";
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
  "DISCORD_STAFF_ROLE_ID"
];

for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing ${key} in .env`);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

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

    if (interaction.commandName === "verify") {
      const username = interaction.options.getString("username", true).trim();
      const code = interaction.options.getString("code", true).trim();

      if (!/^[A-Za-z0-9]{4,20}$/.test(code)) {
        throw new Error("That verification code format is invalid.");
      }

      const user = await getUserByUsername(username);
      if (!user) throw new Error("Roblox username not found.");

      const profile = await getUserProfile(user.id);
      const description = profile.description ?? "";

      if (!description.includes(code)) {
        throw new Error(
          `I couldn't find **${code}** in ${profile.name}'s Roblox profile About section. Put the code there, then run /verify again.`
        );
      }

      await setVerified(interaction.user.id, {
        userId: String(user.id),
        username: profile.name,
        verifiedAt: new Date().toISOString()
      });

      await interaction.reply({
        content: `✅ Verified **${profile.name}** and linked it to your Discord account.`,
        ephemeral: false
      });
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
const healthServer = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, discord: client.isReady() }));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Roblox Ranking Bot is running.");
});
healthServer.listen(port, "0.0.0.0", () => {
  console.log(`Health server listening on port ${port}`);
});

client.login(process.env.DISCORD_TOKEN);
