import { Anchor, Badge, Group, List, Loader, Modal, Select, SimpleGrid, Stack, Text, TextInput, Timeline, Title } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { dateTime, dayMonth, TASK_STATUS } from "../format.js";
import { useLoad } from "../hooks.js";
import { canEditTask } from "../permissions.js";
import { Banner, UserAvatar } from "./ui.jsx";

const NONE = "none";
const STATUS_OPTIONS = Object.entries(TASK_STATUS).map(([value, label]) => ({ value, label }));

/** Task detail with editable status / assignee / due date and the activity history (F3). */
export default function TaskModal({ taskId, onClose, onChanged }) {
  const { me, can, activeUsers, byId } = useMe();
  const { data: task, error, reload } = useLoad(() => api.task(taskId), [taskId]);
  const [saveError, setSaveError] = useState(null);

  const editable = task ? canEditTask(me, can, task) : false;
  const people = [{ value: NONE, label: "Не указан" }, ...activeUsers.map((u) => ({ value: String(u.id), label: u.name }))];

  const save = async (patch) => {
    try {
      await api.updateTask(taskId, patch);
      setSaveError(null);
    } catch (e) {
      setSaveError(e.message);
    }
    await reload(true);
    onChanged?.();
  };

  return (
    <Modal
      opened
      onClose={onClose}
      size="lg"
      title={task ? <Badge variant="light" size="lg" ff="monospace">{task.key}</Badge> : null}
    >
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      {!task ? (
        <Group justify="center" py="xl"><Loader size="sm" /></Group>
      ) : (
        <Stack gap="lg">
          <div>
            <Title order={3}>{task.title}</Title>
            {task.description ? <Text c="dimmed" mt={6}>{task.description}</Text> : null}
          </div>

          {saveError ? <Banner kind="error">{saveError}</Banner> : null}
          {!editable ? (
            <Banner kind="info">
              Менять задачу могут исполнитель, автор или руководитель.
            </Banner>
          ) : null}

          <SimpleGrid cols={{ base: 1, sm: 3 }}>
            <Select
              label="Статус"
              data={STATUS_OPTIONS}
              value={task.status}
              onChange={(v) => v && save({ status: v })}
              allowDeselect={false}
              disabled={!editable}
            />
            <Select
              label="Исполнитель"
              data={people}
              value={task.assignee_id ? String(task.assignee_id) : NONE}
              onChange={(v) => save({ assignee_id: v && v !== NONE ? Number(v) : null })}
              allowDeselect={false}
              disabled={!editable}
              searchable
            />
            <TextInput
              key={task.due_text ?? ""}
              label="Срок"
              defaultValue={task.due_text ?? ""}
              placeholder="Не указан"
              disabled={!editable}
              onBlur={(e) => e.currentTarget.value.trim() !== (task.due_text ?? "") && save({ due_text: e.currentTarget.value })}
            />
          </SimpleGrid>

          {task.acceptance_criteria.length ? (
            <div>
              <Text size="sm" fw={600} mb={6}>Критерии готовности</Text>
              <List size="sm" spacing={4}>
                {task.acceptance_criteria.map((c) => <List.Item key={c}>{c}</List.Item>)}
              </List>
            </div>
          ) : null}

          {task.origin_meeting_id ? (
            <div className="quote">
              Из встречи{" "}
              <Anchor component={Link} to={`/meetings/${task.origin_meeting_id}`} onClick={onClose}>
                «{task.origin_meeting_title}»
              </Anchor>
              {task.origin_quote ? <> — «{task.origin_quote}»</> : null}
            </div>
          ) : null}

          <div>
            <Group gap={6} mb="sm">
              <IconHistory size={16} />
              <Text size="sm" fw={600}>История</Text>
            </Group>
            <Timeline bulletSize={26} lineWidth={2}>
              {task.events.map((ev) => {
                const actor = ev.actor_id ? byId[ev.actor_id] : null;
                return (
                  <Timeline.Item key={ev.id} bullet={<UserAvatar user={actor} name={actor ? undefined : "Q"} size={22} />}>
                    <Text size="sm">{ev.text}</Text>
                    <Text size="xs" c="dimmed">{actor ? `${actor.name} · ` : ""}{dateTime(ev.created_at)}</Text>
                  </Timeline.Item>
                );
              })}
            </Timeline>
          </div>
          <Text size="xs" c="dimmed">Создана {dayMonth(task.created_at)}</Text>
        </Stack>
      )}
    </Modal>
  );
}
