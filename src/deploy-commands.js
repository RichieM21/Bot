import "dotenv/config";
import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

const commands = [
  new SlashCommandBuilder()
    .setName("myinfo")
    .setDescription("Show your Roblox, rank, status, and blacklist information."),

  new SlashCommandBuilder()
    .setName("userinfo")
    .setDescription("View a player's current punishments. Staff only.")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Roblox username to check")
        .setRequired(true)
    ),


  new SlashCommandBuilder()
    .setName("verify")
    .setDescription("Link your Discord account to Roblox through the verification website."),

  new SlashCommandBuilder()
    .setName("switchaccount")
    .setDescription("Switch your Discord account to a different Roblox account."),

  new SlashCommandBuilder()
    .setName("rank")
    .setDescription("Set a verified Roblox user's group rank.")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Discord user to rank")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("role")
        .setDescription("Roblox rank name or rank number")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("unrank")
    .setDescription("Remove the user's current highest Roblox group role.")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Discord user to unrank")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("getrank")
    .setDescription("Show a verified user's current Roblox group rank.")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Discord user")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("setrank")
    .setDescription("Set a Roblox user's group rank.")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Roblox username to rank")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("role")
        .setDescription("Roblox rank name or rank number")
        .setRequired(true)
        .setAutocomplete(true)
    ),

  new SlashCommandBuilder()
    .setName("blacklist")
    .setDescription("Add or remove a user from the ranking blacklist.")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Discord user")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("action")
        .setDescription("Blacklist action")
        .setRequired(true)
        .addChoices(
          { name: "Add", value: "add" },
          { name: "Remove", value: "remove" }
        )
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason for the blacklist")
        .setRequired(false)
    ),

    new SlashCommandBuilder()
    .setName("unblacklist")
    .setDescription("Remove a user from the ranking blacklist. Staff only.")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("Discord user to remove from the blacklist")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("roles")
    .setDescription("List the Roblox group roles available to the bot.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("pban")
    .setDescription("Permanently ban a Roblox user from the game.")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Roblox username to permanently ban")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("reason")
        .setDescription("Reason for the permanent ban")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("unpban")
    .setDescription("Unban a Roblox user from the game.")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Roblox username to unban")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("warn")
    .setDescription("Warn a Roblox player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Warning reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("warnings")
    .setDescription("View a player's warnings. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("clearwarnings")
    .setDescription("Clear a player's warnings. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a player from all active game servers. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("reason").setDescription("Kick reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Temporarily ban a Roblox player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addIntegerOption(o => o.setName("duration").setDescription("Ban duration in minutes").setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName("reason").setDescription("Ban reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("Mute a player in Roblox chat. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addIntegerOption(o => o.setName("duration").setDescription("Mute duration in minutes").setRequired(true).setMinValue(1))
    .addStringOption(o => o.setName("reason").setDescription("Mute reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("unmute")
    .setDescription("Unmute a Roblox player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("history")
    .setDescription("View a player's moderation history. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("notes")
    .setDescription("Add a staff note to a player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true))
    .addStringOption(o => o.setName("note").setDescription("Internal staff note").setRequired(true)),

  new SlashCommandBuilder()
    .setName("profile")
    .setDescription("View a Roblox player's profile. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("gameinfo")
    .setDescription("View a player's current Roblox game status. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("modlog")
    .setDescription("View moderation actions for a player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("stafflog")
    .setDescription("View staff actions involving a player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("announce")
    .setDescription("Send an announcement to every live game server. Staff only.")
    .addStringOption(o => o.setName("message").setDescription("Announcement message").setRequired(true)),

  new SlashCommandBuilder()
    .setName("shutdown")
    .setDescription("Restart all live game servers. Staff only.")
    .addStringOption(o => o.setName("reason").setDescription("Shutdown reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("serverlock")
    .setDescription("Lock live game servers against new joins. Staff only.")
    .addStringOption(o => o.setName("reason").setDescription("Lock reason").setRequired(true)),

  new SlashCommandBuilder()
    .setName("serverunlock")
    .setDescription("Unlock live game servers. Staff only."),

  new SlashCommandBuilder()
    .setName("promote")
    .setDescription("Promote a Roblox player one group rank. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("demote")
    .setDescription("Demote a Roblox player one group rank. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rankinfo")
    .setDescription("View information about a Roblox group rank. Staff only.")
    .addStringOption(o => o.setName("rank").setDescription("Rank name or rank number").setRequired(true)),

  new SlashCommandBuilder()
    .setName("rankhistory")
    .setDescription("View rank changes for a Roblox player. Staff only.")
    .addStringOption(o => o.setName("username").setDescription("Roblox username").setRequired(true)),


  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show all bot commands and who can use them."),

  new SlashCommandBuilder()
    .setName("botinfo")
    .setDescription("Show bot version, uptime, server, and command information."),

  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Show the bot's latency."),

  new SlashCommandBuilder()
    .setName("uptime")
    .setDescription("Show how long the bot has been running."),

  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Show bot and server statistics."),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("Make the bot send a message. Staff only.")
    .addStringOption(o =>
      o.setName("message")
        .setDescription("Message for the bot to send")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("8ball")
    .setDescription("Ask the Magic 8-Ball a question.")
    .addStringOption(o =>
      o.setName("question")
        .setDescription("Your question")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("coinflip")
    .setDescription("Flip a virtual coin."),

  new SlashCommandBuilder()
    .setName("roast")
    .setDescription("Give someone a playful roast.")
    .addUserOption(o =>
      o.setName("user")
        .setDescription("User to roast (defaults to you)")
        .setRequired(false)
    ),

  ];

const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);

if (!process.env.DISCORD_TOKEN || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_GUILD_ID) {
  throw new Error("Missing Discord environment variables.");
}

await rest.put(
  Routes.applicationGuildCommands(
    process.env.DISCORD_CLIENT_ID,
    process.env.DISCORD_GUILD_ID
  ),
  { body: commands.map(c => c.toJSON()) }
);

console.log("Guild slash commands deployed.");
