# One-Click Render Setup

This version is prepared for the easiest deployment flow.

## What you do

1. Put the project in a GitHub repository.
2. Open the repository's `README.md` on GitHub.
3. Click **Deploy to Render**.
4. Sign in to Render if prompted.
5. Review the service and click the deploy/approve button.
6. Enter the private environment variables listed below.
7. Wait for Render to finish the first deployment.
8. Invite your Discord bot to your server.

## Required secrets

Render will ask for these values:

- `DISCORD_TOKEN` — your Discord bot token.
- `DISCORD_CLIENT_ID` — your Discord application's Application ID.
- `DISCORD_GUILD_ID` — your Discord server ID.
- `ROBLOX_API_KEY` — your Roblox Open Cloud API key.
- `ROBLOX_GROUP_ID` — the Roblox group ID.
- `DISCORD_STAFF_ROLE_ID` — the Discord role allowed to run ranking commands.
- `LOG_CHANNEL_ID` — optional Discord channel ID for action logs.

`NODE_VERSION` and `DATA_DIR` are already configured by the Blueprint.

## Discord setup

In the Discord Developer Portal:

1. Create/open your bot application.
2. Copy the **Application ID** into `DISCORD_CLIENT_ID`.
3. Reset/copy the bot token into `DISCORD_TOKEN`.
4. Enable the bot's required server permissions when generating its invite.
5. Invite the bot to your server.
6. Copy your server ID into `DISCORD_GUILD_ID`.
7. Copy the staff role ID into `DISCORD_STAFF_ROLE_ID`.

The bot uses slash commands, so make sure it is invited with the `applications.commands` scope.

## Roblox setup

In Roblox Creator Hub:

1. Create an Open Cloud API key for the group.
2. Give it the group permissions required to read roles/memberships and assign/unassign roles.
3. Put the key into `ROBLOX_API_KEY`.
4. Put the group ID into `ROBLOX_GROUP_ID`.

Do not paste the Roblox API key into GitHub, Discord, or this chat.

## After deployment

Once Render reports the service as live:

- The bot should come online in Discord.
- Run `/roles` as staff to verify Roblox roles are visible.
- Have a member run `/verify username code`.
- Then staff can use `/setrank`, `/rank`, `/unrank`, `/getrank`, and `/blacklist`.

## Important

The included `render.yaml` uses a persistent disk at `/var/data` so the verification and blacklist data survive restarts.

The Blueprint intentionally uses `autoDeployTrigger: off` for button-based deployments. Render recommends this for services deployed from a Deploy to Render button so that later pushes to the repository do not unexpectedly deploy every instance created from the button.

## If the button doesn't detect the repository

Make sure you clicked the button while viewing the project's README on GitHub. Render's button can use the page referrer to determine which repository to deploy.

For a permanent public repository, you can also change the button target to explicitly include your GitHub repository URL.
