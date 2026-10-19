import {
  ActionIcon,
  Badge,
  Button,
  Card,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconDots, IconKey, IconPencil, IconUserCheck, IconUserOff, IconUserPlus } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, Page, UserAvatar } from "../components/ui.jsx";
import { dayMonth, ROLE_LABEL } from "../format.js";
import { useLoad } from "../hooks.js";
import { ROLE_COLOR } from "../theme.js";

const ROLE_OPTIONS = Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }));

const ROLE_HELP = [
  { role: "member", text: "Встречи и звонки, свои задачи. Не принимает предложения ИИ." },
  { role: "lead", text: "Всё, что участник, плюс проверка предложений ИИ и любые задачи и встречи." },
  { role: "admin", text: "Всё, что руководитель, плюс управление командой и ролями." },
];

/** mode: "create" | "edit" | "password" */
function UserModal({ mode, user, onClose, onSaved }) {
  const [f, setF] = useState({ name: user?.name ?? "", email: user?.email ?? "", role: user?.role ?? "member", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.currentTarget.value });

  const title = { create: "Новый участник", edit: `Изменить: ${user?.name}`, password: `Новый пароль: ${user?.name}` }[mode];
  const valid =
    mode === "password"
      ? f.password.length >= 8
      : f.name.trim() && f.email.trim() && (mode === "edit" || f.password.length >= 8);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "create") await api.createUser(f);
      else if (mode === "edit") await api.updateUser(user.id, { name: f.name, email: f.email, role: f.role });
      else await api.updateUser(user.id, { password: f.password });
      onSaved(mode === "password" ? "Пароль изменён, сессии пользователя завершены" : "Сохранено");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal opened onClose={onClose} title={<Text fw={600}>{title}</Text>}>
      <form onSubmit={submit}>
        <Stack>
          {error ? <Banner kind="error">{error}</Banner> : null}
          {mode !== "password" ? (
            <>
              <TextInput label="Имя" value={f.name} onChange={set("name")} required data-autofocus />
              <TextInput label="Почта" type="email" value={f.email} onChange={set("email")} required />
              <Select label="Роль" data={ROLE_OPTIONS} value={f.role} onChange={(v) => v && setF({ ...f, role: v })} allowDeselect={false} />
            </>
          ) : null}
          {mode !== "edit" ? (
            <PasswordInput
              label={mode === "create" ? "Временный пароль" : "Новый пароль"}
              description="Минимум 8 символов. Передайте его человеку лично."
              value={f.password}
              onChange={set("password")}
              autoComplete="new-password"
              required
            />
          ) : null}
          <Group justify="flex-end" mt="sm">
            <Button variant="default" onClick={onClose}>Отмена</Button>
            <Button type="submit" loading={busy} disabled={!valid}>{mode === "create" ? "Создать" : "Сохранить"}</Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export default function TeamPage() {
  const { me, reloadUsers } = useMe();
  const { data: users, error, reload } = useLoad(api.usersAdmin, []);
  const [modal, setModal] = useState(null); // { mode, user }
  const [actionError, setActionError] = useState(null);

  const refresh = (message) => {
    setModal(null);
    if (message) notifications.show({ color: "teal", message });
    reload(true);
    reloadUsers();
  };

  const toggleActive = async (u) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active });
      setActionError(null);
      refresh(u.is_active ? `${u.name} отключён(а)` : `${u.name} снова активен(на)`);
    } catch (e) {
      setActionError(e.message);
    }
  };

  return (
    <Page
      title="Команда"
      sub="Участники, роли и доступ"
      actions={<Button leftSection={<IconUserPlus size={16} />} onClick={() => setModal({ mode: "create" })}>Добавить</Button>}
    >
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      {actionError ? <Banner kind="error">{actionError}</Banner> : null}

      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {ROLE_HELP.map(({ role, text }) => (
          <Card key={role} padding="md">
            <Badge variant="light" color={ROLE_COLOR[role]} tt="none" size="md" mb={6}>{ROLE_LABEL[role]}</Badge>
            <Text size="sm" c="dimmed">{text}</Text>
          </Card>
        ))}
      </SimpleGrid>

      <Card p={0}>
        <Table.ScrollContainer minWidth={680}>
          <Table verticalSpacing="sm" horizontalSpacing="lg">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Участник</Table.Th>
                <Table.Th w={160}>Роль</Table.Th>
                <Table.Th w={150}>Статус</Table.Th>
                <Table.Th w={130}>Добавлен</Table.Th>
                <Table.Th w={60} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {users?.map((u) => (
                <Table.Tr key={u.id} opacity={u.is_active ? 1 : 0.55}>
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <UserAvatar user={u} size="md" />
                      <div>
                        <Text size="sm" fw={500}>{u.name}{u.id === me.id ? " (вы)" : ""}</Text>
                        <Text size="xs" c="dimmed">{u.email ?? "без входа"}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td><Badge variant="light" color={ROLE_COLOR[u.role]} tt="none" size="md">{ROLE_LABEL[u.role] ?? u.role}</Badge></Table.Td>
                  <Table.Td>
                    <Badge variant="dot" color={u.is_active ? "teal" : "gray"} tt="none" size="md">{u.is_active ? "Активен" : "Отключён"}</Badge>
                  </Table.Td>
                  <Table.Td><Text size="sm" c="dimmed">{u.created_at ? dayMonth(u.created_at) : "—"}</Text></Table.Td>
                  <Table.Td>
                    <Menu position="bottom-end" withinPortal>
                      <Menu.Target>
                        <ActionIcon variant="subtle" color="gray" aria-label="Действия"><IconDots size={18} /></ActionIcon>
                      </Menu.Target>
                      <Menu.Dropdown>
                        <Menu.Item leftSection={<IconPencil size={16} />} onClick={() => setModal({ mode: "edit", user: u })}>Изменить</Menu.Item>
                        <Menu.Item leftSection={<IconKey size={16} />} onClick={() => setModal({ mode: "password", user: u })}>Задать пароль</Menu.Item>
                        {u.id !== me.id ? (
                          <>
                            <Menu.Divider />
                            <Menu.Item
                              color={u.is_active ? "red" : "teal"}
                              leftSection={u.is_active ? <IconUserOff size={16} /> : <IconUserCheck size={16} />}
                              onClick={() => toggleActive(u)}
                            >
                              {u.is_active ? "Отключить доступ" : "Вернуть доступ"}
                            </Menu.Item>
                          </>
                        ) : null}
                      </Menu.Dropdown>
                    </Menu>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {modal ? <UserModal {...modal} onClose={() => setModal(null)} onSaved={refresh} /> : null}
    </Page>
  );
}
