const API = "https://apis.roblox.com";
const USERS_API = "https://users.roblox.com";

function headers() {
  return {
    "x-api-key": process.env.ROBLOX_API_KEY,
    "Content-Type": "application/json"
  };
}

async function robloxFetch(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers ?? {})
    }
  });

  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch {}

  if (!response.ok) {
    const detail = body?.message || body?.error || text || `HTTP ${response.status}`;
    throw new Error(`Roblox API ${response.status}: ${detail}`);
  }

  return body;
}

export async function getUserByUsername(username) {
  const response = await fetch(`${USERS_API}/v1/usernames/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      usernames: [username],
      excludeBannedUsers: false
    })
  });

  const body = await response.json();

  if (!response.ok) {
    throw new Error(`Roblox username lookup failed: ${response.status}`);
  }

  return body.data?.[0] ?? null;
}

export async function getUserProfile(userId) {
  const response = await fetch(`${USERS_API}/v1/users/${userId}`);
  if (!response.ok) throw new Error(`Roblox profile lookup failed: ${response.status}`);
  return response.json();
}

export async function listRoles() {
  const roles = [];
  let pageToken = "";

  do {
    const params = new URLSearchParams({ maxPageSize: "20" });
    if (pageToken) params.set("pageToken", pageToken);

    const body = await robloxFetch(
      `${API}/cloud/v2/groups/${process.env.ROBLOX_GROUP_ID}/roles?${params}`
    );

    roles.push(...(body.groupRoles ?? body.roles ?? []));
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);

  return roles;
}

export async function findRoleByName(name) {
  const roles = await listRoles();
  return roles.find(
    r => String(r.displayName ?? "").toLowerCase() === name.toLowerCase()
  ) ?? null;
}

export async function findMembership(userId) {
  const groupId = process.env.ROBLOX_GROUP_ID;
  const filter = encodeURIComponent(`user == 'users/${userId}'`);

  const body = await robloxFetch(
    `${API}/cloud/v2/groups/${groupId}/memberships?maxPageSize=100&filter=${filter}`
  );

  return body.groupMemberships?.[0] ?? null;
}

export async function assignRole(userId, roleId) {
  const groupId = process.env.ROBLOX_GROUP_ID;
  const membership = await findMembership(userId);

  if (!membership) {
    throw new Error("That Roblox account is not a member of the configured group.");
  }

  const membershipId = membership.path.split("/").pop();

  return robloxFetch(
    `${API}/cloud/v2/groups/${groupId}/memberships/${membershipId}:assignRole`,
    {
      method: "POST",
      body: JSON.stringify({
        role: `groups/${groupId}/roles/${roleId}`
      })
    }
  );
}

export async function unassignHighestRole(userId) {
  const groupId = process.env.ROBLOX_GROUP_ID;
  const membership = await findMembership(userId);

  if (!membership) {
    throw new Error("That Roblox account is not a member of the configured group.");
  }

  const currentRolePath = membership.role;
  if (!currentRolePath) {
    throw new Error("The member does not have a removable role.");
  }

  const membershipId = membership.path.split("/").pop();
  const roleId = currentRolePath.split("/").pop();

  return robloxFetch(
    `${API}/cloud/v2/groups/${groupId}/memberships/${membershipId}:unassignRole`,
    {
      method: "POST",
      body: JSON.stringify({
        role: `groups/${groupId}/roles/${roleId}`
      })
    }
  );
}

export async function getCurrentRole(userId) {
  const membership = await findMembership(userId);
  if (!membership) return null;

  const rolePath = membership.role;
  if (!rolePath) return null;

  const roleId = rolePath.split("/").pop();
  const role = await robloxFetch(
    `${API}/cloud/v2/groups/${process.env.ROBLOX_GROUP_ID}/roles/${roleId}`
  );

  return {
    membership,
    role
  };
}
export async function permanentBanUser(userId, reason) {
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  if (!universeId) {
    throw new Error("ROBLOX_UNIVERSE_ID is not configured.");
  }

  return robloxFetch(
    `${API}/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        gameJoinRestriction: {
          active: true,
          privateReason: reason,
          displayReason: reason,
          excludeAltAccounts: false
        }
      })
    }
  );
}


export async function unbanUser(userId) {
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  if (!universeId) {
    throw new Error("ROBLOX_UNIVERSE_ID is not configured.");
  }

  return robloxFetch(
    `${API}/cloud/v2/universes/${universeId}/user-restrictions/${userId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        gameJoinRestriction: {
          active: false
        }
      })
    }
  );
}

export async function getUserRestriction(userId) {
  const universeId = process.env.ROBLOX_UNIVERSE_ID;

  if (!universeId) {
    throw new Error("ROBLOX_UNIVERSE_ID is not configured.");
  }

  try {
    return await robloxFetch(
      `${API}/cloud/v2/universes/${universeId}/user-restrictions/${userId}`
    );
  } catch (error) {
    if (String(error.message).includes("Roblox API 404")) {
      return null;
    }
    throw error;
  }
}
