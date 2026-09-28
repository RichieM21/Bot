-- DiscordModeration.client.lua
-- Place this LocalScript in StarterPlayerScripts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local event = ReplicatedStorage:WaitForChild("DiscordModerationEvent")

event.OnClientEvent:Connect(function(action, message)
    if action == "ANNOUNCE" then
        local channel = TextChatService.TextChannels:FindFirstChild("RBXGeneral")

        if channel then
            channel:DisplaySystemMessage("📢 " .. tostring(message or ""))
        end
    end
end)
