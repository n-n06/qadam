import { Alert, Center, Loader } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, refreshSession, setAccessToken, setSessionLostHandler } from "./api.js";

const AuthCtx = createContext(null);
const TeamCtx = createContext(null);

/** { user, login, logout, can, setSession } - `user` is null when logged out, undefined while booting. */
export const useAuth = () => useContext(AuthCtx);

/** { me, users, byId, can, reloadUsers } - only inside the logged-in part of the app. */
export const useMe = () => useContext(TeamCtx);

export const FullScreenLoader = () => (
  <Center h="100vh">
    <Loader />
  </Center>
);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  const setSession = useCallback((session) => {
    setAccessToken(session.access_token);
    setUser(session.user);
  }, []);

  useEffect(() => {
    setSessionLostHandler(() => {
      setUser(null);
      notifications.show({ color: "orange", title: "Сессия завершена", message: "Войдите снова, чтобы продолжить." });
    });
    // Restore the session from the httpOnly refresh cookie, if there is one.
    refreshSession()
      .then((session) => setUser(session.user))
      .catch(() => setUser(null));
  }, []);

  const value = useMemo(
    () => ({
      user,
      setSession,
      can: (permission) => Boolean(user?.permissions?.includes(permission)),
      login: async (email, password) => setSession(await api.login(email, password)),
      logout: async () => {
        try {
          await api.logout();
        } finally {
          setAccessToken(null);
          setUser(null);
        }
      },
    }),
    [user, setSession]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

/** Loads the team directory (names for avatars / assignee pickers). */
export function TeamProvider({ children }) {
  const { user, can } = useAuth();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);

  const reloadUsers = useCallback(() => api.users().then(setUsers).catch(setError), []);
  useEffect(() => {
    reloadUsers();
  }, [reloadUsers]);

  const value = useMemo(() => {
    if (!users) return null;
    return {
      me: user,
      users,
      activeUsers: users.filter((u) => u.is_active),
      byId: Object.fromEntries(users.map((u) => [u.id, u])),
      can,
      reloadUsers,
    };
  }, [users, user, can, reloadUsers]);

  if (error)
    return (
      <Center h="100vh" p="md">
        <Alert color="red" title="Не удалось подключиться к серверу">{error.message}</Alert>
      </Center>
    );
  if (!value) return <FullScreenLoader />;
  return <TeamCtx.Provider value={value}>{children}</TeamCtx.Provider>;
}
