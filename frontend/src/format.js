const pad = (n) => String(n).padStart(2, "0");

export const mmss = (sec) => `${pad(Math.floor(sec / 60))}:${pad(Math.floor(sec % 60))}`;

// The API returns naive UTC timestamps ("2026-10-10T12:00:00"); make the browser read them as UTC.
export function parseDate(s) {
  if (!s) return null;
  return new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}

export const dayMonth = (s) =>
  parseDate(s)?.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }) ?? "";

export const dateTime = (s) =>
  parseDate(s)?.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) ?? "";

export const initials = (name) => (name || "?").slice(0, 2).toUpperCase();

export const TASK_STATUS = { todo: "К выполнению", in_progress: "В работе", done: "Готово" };

export const MEETING_STATUS = {
  scheduled: "Не начата",
  live: "Идёт звонок",
  processing: "Обработка",
  ready: "Готово",
  failed: "Ошибка",
};

export const ROLE_LABEL = { admin: "Администратор", lead: "Руководитель", member: "Участник" };
