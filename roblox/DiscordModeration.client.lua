-- DiscordModeration.client.lua
-- Place this LocalScript in StarterPlayerScripts.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")
local TweenService = game:GetService("TweenService")

local event = ReplicatedStorage:WaitForChild("DiscordModerationEvent")
local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local function showAnnouncement(message)
    local oldGui = playerGui:FindFirstChild("DiscordAnnouncement")
    if oldGui then
        oldGui:Destroy()
    end

    local screenGui = Instance.new("ScreenGui")
    screenGui.Name = "DiscordAnnouncement"
    screenGui.ResetOnSpawn = false
    screenGui.IgnoreGuiInset = true
    screenGui.Parent = playerGui

    local banner = Instance.new("Frame")
    banner.Name = "Banner"
    banner.AnchorPoint = Vector2.new(0.5, 0)
    banner.Position = UDim2.new(0.5, 0, -0.25, 0)
    banner.Size = UDim2.new(0.82, 0, 0, 110)
    banner.BackgroundColor3 = Color3.fromRGB(25, 25, 30)
    banner.BackgroundTransparency = 0.05
    banner.BorderSizePixel = 0
    banner.Parent = screenGui

    local corner = Instance.new("UICorner")
    corner.CornerRadius = UDim.new(0, 16)
    corner.Parent = banner

    local stroke = Instance.new("UIStroke")
    stroke.Thickness = 2
    stroke.Transparency = 0.25
    stroke.Color = Color3.fromRGB(255, 255, 255)
    stroke.Parent = banner

    local title = Instance.new("TextLabel")
    title.BackgroundTransparency = 1
    title.Size = UDim2.new(1, -30, 0, 34)
    title.Position = UDim2.new(0, 15, 0, 10)
    title.Font = Enum.Font.GothamBold
    title.Text = "📢 ANNOUNCEMENT"
    title.TextColor3 = Color3.fromRGB(255, 255, 255)
    title.TextScaled = true
    title.Parent = banner

    local body = Instance.new("TextLabel")
    body.BackgroundTransparency = 1
    body.Size = UDim2.new(1, -30, 0, 48)
    body.Position = UDim2.new(0, 15, 0, 50)
    body.Font = Enum.Font.Gotham
    body.Text = tostring(message or "")
    body.TextColor3 = Color3.fromRGB(235, 235, 235)
    body.TextScaled = true
    body.TextWrapped = true
    body.Parent = banner

    local showTween = TweenService:Create(
        banner,
        TweenInfo.new(0.45, Enum.EasingStyle.Quint, Enum.EasingDirection.Out),
        {Position = UDim2.new(0.5, 0, 0.06, 0)}
    )
    showTween:Play()

    task.delay(6, function()
        if not screenGui.Parent then return end

        local hideTween = TweenService:Create(
            banner,
            TweenInfo.new(0.4, Enum.EasingStyle.Quint, Enum.EasingDirection.In),
            {Position = UDim2.new(0.5, 0, -0.25, 0)}
        )
        hideTween:Play()
        hideTween.Completed:Wait()

        if screenGui.Parent then
            screenGui:Destroy()
        end
    end)
end

event.OnClientEvent:Connect(function(action, message)
    if action == "ANNOUNCE" then
        showAnnouncement(message)
    end
end)
