## 🚀 One-Click Render Deployment

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

**How it works:** Put this project in a GitHub repository, open this README on GitHub, and click the **Deploy to Render** button above. Render will detect the repository from the page and use the included `render.yaml` Blueprint.

> **Important:** You will still need to enter your private Discord and Roblox credentials into Render when prompted. Never put those secrets in GitHub.

# Roblox Discord Ranking Bot

A Discord slash-command bot that verifies Roblox accounts and manages Roblox group roles through Roblox Open Cloud.

## Commands

- `/verify username:<Roblox username> code:<verification code>`
- `/rank user:<Discord user> role:<Roblox role>`
- `/setrank user:<Discord user> role:<Roblox role>`
- `/blacklist user:<Discord user> action:<add/remove> reason:<reason>`
- `/unrank user:<Discord user>`
- `/getrank user:<Discord user>`
- `/roles`

## Requirements

- Node.js 24+
- A Discord application/bot
- A Roblox group
- A Roblox Open Cloud API key with `group:read` and `group:write`
- The API key must be allowed to manage the group
- The bot must be installed in your Discord server

## Setup

1. Copy `.env.example` to `.env`.
2. Fill in all values.
3. Run:
   `npm install`
4. Register the Discord slash commands:
   `npm run deploy`
5. Start the bot:
   `npm start`

## Verification

A user runs `/verify` with their Roblox username and a code.

Example:

`/verify username:ExamplePlayer code:ABC123`

They must put `ABC123` in their Roblox profile About/description first. The bot checks the public Roblox profile description before linking the account.

## Important

Never upload your `.env` file or share your Roblox API key / Discord bot token.

The bot stores verified accounts and blacklist entries in `data/users.json`. For a large community, move this to a real database such as SQLite/Postgres later.


## Render deployment

The project includes `render.yaml` for a Render Blueprint deployment. It configures a Node web service, health check, environment variables, and a 1 GB persistent disk mounted at `/var/data`.

Render persistent disks are paid and are required here because the bot stores verification and blacklist data locally. See Render's persistent disk documentation for current pricing/availability.

After the first deployment, run `npm run deploy` once in the Render Shell to register the slash commands for your Discord server.
