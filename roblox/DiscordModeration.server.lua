-- DiscordModeration.server.lua
-- Place this Script in ServerScriptService.
-- The Discord bot publishes moderation commands to the "discord-moderation" topic.

local MessagingService = game:GetService("MessagingService")
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TextChatService = game:GetService("TextChatService")

local adminNotify = ReplicatedStorage:WaitForChild("AdminSystem"):WaitForChild("AdminNotify")

local SERVER_LOCKED = false
local mutedUntil = {}

local function getPlayer(userId)
    return Players:GetPlayerByUserId(tonumber(userId))
end

local function kickPlayer(userId, reason)
    local player = getPlayer(userId)
    if player then
        player:Kick(reason or "You have been kicked by staff.")
    end
end

local function setMuted(userId, durationSeconds)
    local id = tonumber(userId)
    if not id then return end

    mutedUntil[id] = os.time() + (tonumber(durationSeconds) or 0)

    for _, channel in ipairs(TextChatService.TextChannels:GetChildren()) do
        for _, source in ipairs(channel:GetChildren()) do
            if source:IsA("TextSource") and source.UserId == id then
                source.CanSend = false
            end
        end
    end
end

local function unmute(userId)
    local id = tonumber(userId)
    if not id then return end
    mutedUntil[id] = nil

    for _, channel in ipairs(TextChatService.TextChannels:GetChildren()) do
        for _, source in ipairs(channel:GetChildren()) do
            if source:IsA("TextSource") and source.UserId == id then
                source.CanSend = true
            end
        end
    end
end

local function applyMuteToPlayer(player)
    local untilTime = mutedUntil[player.UserId]
    if not untilTime then return end

    if untilTime <= os.time() then
        mutedUntil[player.UserId] = nil
        return
    end

    task.delay(0.5, function()
        for _, channel in ipairs(TextChatService.TextChannels:GetChildren()) do
            for _, source in ipairs(channel:GetChildren()) do
                if source:IsA("TextSource") and source.UserId == player.UserId then
                    source.CanSend = false
                end
            end
        end
    end)
end

Players.PlayerAdded:Connect(function(player)
    if SERVER_LOCKED then
        player:Kick("The server is currently locked. Please try again later.")
        return
    end
    applyMuteToPlayer(player)
end)

task.spawn(function()
    while true do
        task.wait(5)
        for userId, untilTime in pairs(mutedUntil) do
            if untilTime <= os.time() then
                unmute(userId)
            end
        end
    end
end)

local success, connection = pcall(function()
    return MessagingService:SubscribeAsync("discord-moderation", function(message)
        local ok, data = pcall(function()
            return game:GetService("HttpService"):JSONDecode(message.Data)
        end)

        if not ok or type(data) ~= "table" then
            warn("Invalid Discord moderation message.")
            return
        end

        local action = data.action

        if action == "KICK" then
            kickPlayer(data.userId, data.reason)
        elseif action == "MUTE" then
            setMuted(data.userId, data.durationSeconds)
        elseif action == "UNMUTE" then
            unmute(data.userId)
        elseif action == "ANNOUNCE" then
            adminNotify:FireAllClients({
                type = "announce",
                message = tostring(data.message or "")
            })
        elseif action == "SERVERLOCK" then
            SERVER_LOCKED = true
        elseif action == "SERVERUNLOCK" then
            SERVER_LOCKED = false
        elseif action == "SHUTDOWN" then
            for _, player in ipairs(Players:GetPlayers()) do
                player:Kick("Server shutting down: " .. tostring(data.reason or "Maintenance"))
            end
        end
    end)
end)

if not success then
    warn("Could not subscribe to Discord moderation topic:", connection)
end
