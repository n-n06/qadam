import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "./api.js";

const Ctx = createContext(null);
export const useMe = () => useContext(Ctx);

/** Loads the team and remembers "who am I" (no login in the MVP: RBAC / F7 is planned for Sprint 4). */
export function UserProvider({ children }) {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [meId, setMeId] = useState(() => Number(localStorage.getItem("qadam.user")) || null);

  useEffect(() => {
    api.users().then(setUsers).catch(setError);
  }, []);

  const value = useMemo(() => {
    if (!users) return null;
    const me = users.find((u) => u.id === meId) || users.find((u) => u.role === "lead") || users[0];
    return {
      users,
      me,
      byId: Object.fromEntries(users.map((u) => [u.id, u])),
      setMe: (id) => {
        localStorage.setItem("qadam.user", String(id));
        setMeId(id);
      },
    };
  }, [users, meId]);

  if (error) return <div className="boot">Не удалось подключиться к серверу: {error.message}</div>;
  if (!value) return <div className="boot">Загрузка…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
