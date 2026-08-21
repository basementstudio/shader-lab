export const BOT_PROTECTED_ROUTES = [
  { method: "POST", path: "/api/community/drafts" },
  { method: "PUT", path: "/api/community/drafts/*" },
  { method: "POST", path: "/api/community/drafts/*/publish" },
  { method: "DELETE", path: "/api/community/scenes/*" },
  { method: "POST", path: "/api/community/scenes/*/like" },
  { method: "POST", path: "/api/community/scenes/*/remix" },
  { method: "POST", path: "/api/community/scenes/*/report" },
  { method: "PATCH", path: "/api/community/me/handle" },
] as const
