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
  getUserRestriction
} from "./roblox.js";

import { getVerified, setVerified, isBlacklisted, setBlacklisted, getBlacklistEntry } from "./db.js";

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



client.on(Events.InteractionCreate, async interaction => {
  try {
    // Role-name autocomplete
    if (interaction.isAutocomplete()) {
      if (interaction.commandName !== "rank") return;

      const focused = interaction.options.getFocused();
      const roles = await listRoles();

      const results = roles
        .filter(r => r.displayName)
        .filter(r => r.displayName.toLowerCase().includes(focused.toLowerCase()))
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
        if (interaction.commandName === "myinfo") {
      const verified = await getVerified(interaction.user.id);
      const blacklist = await getBlacklistEntry(interaction.user.id);

      let robloxInfo = "❌ No Roblox account is linked.";
      let rankInfo = "❌ No Roblox group rank available.";
      let statusInfo = "🟢 No active game restriction.";

      if (verified) {
        robloxInfo = `👤 **Username:** ${verified.username}\\n🆔 **User ID:** ${verified.userId}`;

        const current = await getCurrentRole(verified.userId);
        if (current?.role) {
          rankInfo = `🏷️ **${current.role.displayName}** (rank ${current.role.rank})`;
        }

        const restriction = await getUserRestriction(verified.userId);
        if (restriction?.gameJoinRestriction?.active) {
          const reason = restriction.gameJoinRestriction.displayReason || restriction.gameJoinRestriction.privateReason || "No reason provided.";
          statusInfo = `🔴 Active game restriction\\n**Reason:** ${reason}`;
        }
      }

      const embed = new EmbedBuilder()
        .setColor(0x8b5cf6)
        .setTitle("🪐 Your information")
        .setDescription("Current information available for your account.")
        .addFields(
          { name: "Roblox information", value: robloxInfo },
          { name: "Game status", value: statusInfo },
          { name: "Blacklist information", value: blacklist ? `🔴 Staff blacklisted\\n**Reason:** ${blacklist.reason || "No reason provided."}` : "🟢 Not staff blacklisted." },
          { name: "Group rank", value: rankInfo }
        )
        .setFooter({ text: `Requested by ${interaction.user.username}` })
        .setTimestamp();

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

      await interaction.editReply(
        `✅ Unbanned **${user.name}**.`
      );

      await logAction(
        interaction,
        `✅ **Roblox Unban**\\nStaff: ${interaction.user.tag}\\nRoblox: ${user.name} (${user.id})`
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

      await interaction.deferReply({ ephemeral: true });
      await assignRole(verified.userId, role.id);

      await interaction.editReply(
        `✅ Set **${verified.username}** to **${role.displayName}** (rank ${role.rank}).`
      );

      await logAction(
        interaction,
        `📋 **Set Rank**\nStaff: ${interaction.user.tag}\nTarget: ${target.tag}\nRoblox: ${verified.username} (${verified.userId})\nNew role: ${role.displayName} (${role.id})`
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
