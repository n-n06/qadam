const BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path, { method = "GET", body, form } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  if (!res.ok) {
    let detail = null;
    try {
      detail = (await res.json()).detail;
    } catch {
      /* not JSON */
    }
    throw new Error(typeof detail === "string" ? detail : `Ошибка сервера (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  health: () => request("/health"),
  users: () => request("/users"),

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

  callToken: (id, userId) => request(`/meetings/${id}/call/token`, { method: "POST", body: { user_id: userId } }),
  endCall: (id) => request(`/meetings/${id}/call/end`, { method: "POST" }),

  drafts: (status = "pending") => request(`/drafts?status=${status}`),
  editDraft: (id, patch) => request(`/drafts/${id}`, { method: "PATCH", body: patch }),
  approveDraft: (id, userId) => request(`/drafts/${id}/approve`, { method: "POST", body: { user_id: userId } }),
  rejectDraft: (id, userId) => request(`/drafts/${id}/reject`, { method: "POST", body: { user_id: userId } }),

  tasks: () => request("/tasks"),
  task: (id) => request(`/tasks/${id}`),
  createTask: (body) => request("/tasks", { method: "POST", body }),
  updateTask: (id, patch) => request(`/tasks/${id}`, { method: "PATCH", body: patch }),
};
