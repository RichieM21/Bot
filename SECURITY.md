# Security Notes

Never commit these values to GitHub:

- Discord bot token
- Roblox Open Cloud API key
- Any Render API key
- Any other secret

Use Render environment variables for secrets. If a token/key is accidentally exposed, rotate it immediately in the provider that issued it.
