import { Button, Group, Modal, PasswordInput, Stack, Text } from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { useState } from "react";
import { api } from "../api.js";
import { useAuth } from "../context.jsx";
import { Banner } from "./ui.jsx";

const EMPTY = { current: "", next: "", repeat: "" };

export default function ChangePasswordModal({ opened, onClose }) {
  const { setSession } = useAuth();
  const [f, setF] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });

  const mismatch = f.repeat && f.next !== f.repeat;
  const valid = f.current && f.next.length >= 8 && f.next === f.repeat;

  const close = () => {
    setF(EMPTY);
    setError(null);
    onClose();
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setSession(await api.changePassword(f.current, f.next));
      notifications.show({ color: "teal", message: "Пароль изменён. Остальные сессии завершены." });
      close();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal opened={opened} onClose={close} title={<Text fw={600}>Сменить пароль</Text>}>
      <form onSubmit={submit}>
        <Stack>
          {error ? <Banner kind="error">{error}</Banner> : null}
          <PasswordInput label="Текущий пароль" value={f.current} onChange={set("current")} autoComplete="current-password" data-autofocus />
          <PasswordInput label="Новый пароль" description="Минимум 8 символов" value={f.next} onChange={set("next")} autoComplete="new-password" />
          <PasswordInput label="Повторите пароль" value={f.repeat} onChange={set("repeat")} error={mismatch ? "Пароли не совпадают" : null} autoComplete="new-password" />
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={close}>Отмена</Button>
            <Button type="submit" loading={busy} disabled={!valid}>Сохранить</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
