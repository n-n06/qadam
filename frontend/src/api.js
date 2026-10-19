const BASE = import.meta.env.VITE_API_URL ?? "";

/*
 * Auth model: the access token lives only in memory (never localStorage, so XSS can't lift a long-lived
 * credential). The refresh token is an httpOnly cookie the browser sends to /api/auth/* only.
 * On a 401 we refresh once and retry; if that fails the app falls back to the login screen.
 */
let accessToken = null;
let refreshing = null;
let onSessionLost = () => {};

export const setAccessToken = (token) => {
  accessToken = token;
};
export const setSessionLostHandler = (fn) => {
  onSessionLost = fn;
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function send(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`${BASE}/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
}

async function parse(res) {
  if (!res.ok) {
    let detail = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* not JSON */
    }
    const message =
      typeof detail === "string"
        ? detail
        : Array.isArray(detail)
          ? "Проверьте правильность заполнения полей"
          : `Ошибка сервера (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? null : res.json();
}

/** One refresh at a time: parallel 401s wait for the same promise. */
export function refreshSession() {
  refreshing ??= send("/auth/refresh", { method: "POST" })
    .then(parse)
    .then((session) => {
      accessToken = session.access_token;
      return session;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

const NO_RETRY = ["/auth/login", "/auth/refresh", "/auth/logout"];

async function request(path, options = {}) {
  let res = await send(path, options);
  if (res.status === 401 && !NO_RETRY.includes(path)) {
    try {
      await refreshSession();
    } catch {
      accessToken = null;
      onSessionLost();
      return parse(res);
    }
    res = await send(path, options);
  }
  return parse(res);
}

export const api = {
  health: () => request("/health"),

  login: (email, password) => request("/auth/login", { method: "POST", body: { email, password } }),
  logout: () => request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),
  changePassword: (current_password, new_password) =>
    request("/auth/password", { method: "POST", body: { current_password, new_password } }),

  users: () => request("/users"),
  usersAdmin: () => request("/users/admin"),
  createUser: (body) => request("/users", { method: "POST", body }),
  updateUser: (id, patch) => request(`/users/${id}`, { method: "PATCH", body: patch }),

  meetings: () => request("/meetings"),
  meeting: (id) => request(`/meetings/${id}`),
  createMeeting: (title) => request("/meetings", { method: "POST", body: { title } }),
  uploadAudio: (id, file) => {
    const form = new FormData();
    form.append("file", file);
    return request(`/meetings/${id}/audio`, { method: "POST", form });
  },
  uploadTranscript: (id, text) => request(`/meetings/${id}/transcript`, { method: "POST", body: { text } }),
  reprocess: (id) => request(`/meetings/${id}/reprocess`, { method: "POST" }),

  callToken: (id) => request(`/meetings/${id}/call/token`, { method: "POST" }),
  endCall: (id) => request(`/meetings/${id}/call/end`, { method: "POST" }),

  drafts: (status = "pending") => request(`/drafts?status=${status}`),
  editDraft: (id, patch) => request(`/drafts/${id}`, { method: "PATCH", body: patch }),
  approveDraft: (id) => request(`/drafts/${id}/approve`, { method: "POST" }),
  rejectDraft: (id) => request(`/drafts/${id}/reject`, { method: "POST" }),

  tasks: () => request("/tasks"),
  task: (id) => request(`/tasks/${id}`),
  createTask: (body) => request("/tasks", { method: "POST", body }),
  updateTask: (id, patch) => request(`/tasks/${id}`, { method: "PATCH", body: patch }),
};
