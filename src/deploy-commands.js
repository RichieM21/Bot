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
    .setDescription("Link your Discord account to a Roblox account.")
    .addStringOption(o =>
      o.setName("username")
        .setDescription("Your Roblox username")
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("code")
        .setDescription("The verification code you placed in your Roblox profile About section")
        .setRequired(true)
    ),

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
        .setDescription("Roblox group role name")
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
    )
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
