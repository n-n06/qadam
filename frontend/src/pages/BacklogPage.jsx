import { Button, Card, Group, Table, Text, TextInput } from "@mantine/core";
import { IconListDetails, IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, EmptyState, Page, TaskStatusBadge, UserAvatar } from "../components/ui.jsx";
import TaskModal from "../components/TaskModal.jsx";
import { dayMonth } from "../format.js";
import { useLoad } from "../hooks.js";

export function originLabel(t) {
  return t.origin_meeting_id ? `Со встречи ${dayMonth(t.origin_meeting_date)}` : "Создано вручную";
}

export default function BacklogPage() {
  const { byId, can } = useMe();
  const { data: tasks, error, reload } = useLoad(api.tasks, []);
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState(null);

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await api.createTask({ title });
      setTitle("");
      setAddError(null);
      reload(true);
    } catch (err) {
      setAddError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Бэклог" sub="Только принятые задачи — те, что человек принял из встречи или создал сам">
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      {addError ? <Banner kind="error">{addError}</Banner> : null}

      {can("tasks.create") ? (
        <form onSubmit={add}>
          <Group gap="sm" wrap="nowrap">
            <TextInput
              style={{ flex: 1 }}
              value={title}
              onChange={(e) => setTitle(e.currentTarget.value)}
              placeholder="Новая задача вручную…"
              aria-label="Название новой задачи"
              leftSection={<IconPlus size={16} />}
            />
            <Button type="submit" disabled={!title.trim()} loading={busy}>Добавить</Button>
          </Group>
        </form>
      ) : null}

      <Card p={0}>
        {tasks && !tasks.length ? (
          <EmptyState icon={IconListDetails} title="Задач пока нет">
            Примите предложения ИИ на странице «Проверка» или добавьте задачу вручную.
          </EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={720}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th w={100}>Ключ</Table.Th>
                  <Table.Th>Задача</Table.Th>
                  <Table.Th w={180}>Исполнитель</Table.Th>
                  <Table.Th w={120}>Срок</Table.Th>
                  <Table.Th w={160}>Статус</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {tasks?.map((t) => {
                  const assignee = byId[t.assignee_id];
                  return (
                    <Table.Tr
                      key={t.id}
                      className="row-link"
                      tabIndex={0}
                      onClick={() => setOpen(t.id)}
                      onKeyDown={(e) => e.key === "Enter" && setOpen(t.id)}
                    >
                      <Table.Td><Text size="sm" c="dimmed" ff="monospace" style={{ whiteSpace: "nowrap" }}>{t.key}</Text></Table.Td>
                      <Table.Td>
                        <Text size="sm" fw={500}>{t.title}</Text>
                        <Text size="xs" c="dimmed">{originLabel(t)}</Text>
                      </Table.Td>
                      <Table.Td>
                        {assignee ? (
                          <Group gap="xs" wrap="nowrap">
                            <UserAvatar user={assignee} size="sm" />
                            <Text size="sm">{assignee.name}</Text>
                          </Group>
                        ) : (
                          <Text size="sm" c="dimmed">—</Text>
                        )}
                      </Table.Td>
                      <Table.Td><Text size="sm" c={t.due_text ? undefined : "dimmed"}>{t.due_text ?? "—"}</Text></Table.Td>
                      <Table.Td><TaskStatusBadge status={t.status} /></Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
      {open ? <TaskModal taskId={open} onClose={() => setOpen(null)} onChanged={() => reload(true)} /> : null}
    </Page>
  );
}
