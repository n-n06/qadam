import { Badge, Box, Button, Card, Divider, FileInput, Grid, Group, Loader, Stack, Text, Textarea, Title } from "@mantine/core";
import { IconChecklist, IconFileText, IconRefresh, IconUpload } from "@tabler/icons-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, EmptyState, MeetingStatusBadge, Page, TranscriptLines } from "../components/ui.jsx";
import { dayMonth } from "../format.js";
import { useLoad } from "../hooks.js";
import { canManageMeeting } from "../permissions.js";

const DRAFT_STATUS = {
  pending: { label: "на проверке", color: "yellow" },
  approved: { label: "принята", color: "teal" },
  rejected: { label: "отклонена", color: "gray" },
};

/** Empty state that doubles as the manual fallback (F4 AC2): upload audio or paste a transcript. */
function FallbackInput({ meeting, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack>
      <EmptyState icon={IconFileText} title="Транскрипта пока нет">
        Загрузите запись встречи — её распознает Whisper. Или вставьте готовый текст.
      </EmptyState>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <FileInput
        label="Аудио или видео"
        placeholder="Выберите файл"
        accept="audio/*,video/*,.ogg,.opus,.m4a"
        leftSection={<IconUpload size={16} />}
        disabled={busy}
        clearable
        onChange={(file) => file && run(() => api.uploadAudio(meeting.id, file))}
      />
      <Divider label="или" labelPosition="center" />
      <Textarea
        label="Текст встречи"
        description="Одна реплика на строку, можно «Имя: реплика»"
        autosize
        minRows={5}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
        placeholder={"Алия: Давайте добавим экспорт в Excel.\nЕрлан: Пусть сделает Айгерим, срок — пятница."}
      />
      <Group>
        <Button loading={busy} disabled={!text.trim()} onClick={() => run(() => api.uploadTranscript(meeting.id, text))}>
          Создать задачи из текста
        </Button>
      </Group>
    </Stack>
  );
}

export default function MeetingPage() {
  const { id } = useParams();
  const { me, can } = useMe();
  const { data: m, error, reload } = useLoad(() => api.meeting(id), [id], (d) => d?.status === "processing" || d?.status === "live");
  const [actionError, setActionError] = useState(null);

  if (error && !m) return <Page title="Встреча"><Banner kind="error">{error.message}</Banner></Page>;
  if (!m) return <Page title="Встреча"><Group justify="center" py="xl"><Loader /></Group></Page>;

  const manageable = canManageMeeting(me, can, m);
  const minutes = m.duration_sec ? Math.max(1, Math.round(m.duration_sec / 60)) : null;
  const sub = [dayMonth(m.created_at), minutes && `${minutes} мин`].filter(Boolean).join(" · ");
  const noText = !m.segments.length && ["scheduled", "ready", "failed"].includes(m.status);

  const reprocess = async () => {
    try {
      await api.reprocess(m.id);
      setActionError(null);
    } catch (e) {
      setActionError(e.message);
    }
    reload();
  };

  return (
    <Page title={m.title} sub={sub} actions={<MeetingStatusBadge status={m.status} />}>
      {actionError ? <Banner kind="error">{actionError}</Banner> : null}
      {m.status === "processing" ? (
        <Banner kind="info" title="Обработка">Распознаём речь и готовим задачи — обычно это занимает несколько минут. Страница обновится сама.</Banner>
      ) : null}
      {m.status === "failed" ? (
        <Banner kind="error" title="Не удалось обработать встречу">
          {m.error || "Неизвестная ошибка."} Запись не потеряна — загрузите аудио или текст ниже.
        </Banner>
      ) : null}
      {m.status === "live" ? (
        <Banner kind="warn" title="Звонок идёт">
          <Button component={Link} to={`/call/${m.id}`} size="xs" mt={6}>Присоединиться</Button>
        </Banner>
      ) : null}

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card>
            <Title order={4} mb="md">Текст встречи</Title>
            {noText && manageable ? (
              <FallbackInput meeting={m} onDone={() => reload()} />
            ) : m.segments.length ? (
              <TranscriptLines segments={m.segments} />
            ) : (
              <Text c="dimmed" size="sm">Пока пусто.</Text>
            )}
          </Card>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card>
            <Title order={4} mb="md">Сводка</Title>
            {m.summary ? <Text size="sm">{m.summary}</Text> : <Text c="dimmed" size="sm">Сводка появится после обработки.</Text>}
            {m.skipped_note ? <Box mt="md"><Banner kind="warn">{m.skipped_note}</Banner></Box> : null}

            {m.drafts.length ? (
              <Stack gap={8} mt="lg">
                <Text size="sm" fw={600}>Предложенные задачи</Text>
                {m.drafts.map((d) => (
                  <Group key={d.id} justify="space-between" wrap="nowrap" gap="sm">
                    <Text size="sm" truncate>{d.title}</Text>
                    <Badge variant="light" color={DRAFT_STATUS[d.status].color} style={{ flexShrink: 0 }}>
                      {DRAFT_STATUS[d.status].label}
                    </Badge>
                  </Group>
                ))}
              </Stack>
            ) : null}

            <Group mt="lg">
              {m.pending_drafts ? (
                <Button component={Link} to="/review" leftSection={<IconChecklist size={16} />}>
                  Проверить задачи ({m.pending_drafts})
                </Button>
              ) : null}
              {manageable && m.segments.length && !["processing", "live"].includes(m.status) ? (
                <Button variant="default" leftSection={<IconRefresh size={16} />} onClick={reprocess}>
                  Пересоздать черновики
                </Button>
              ) : null}
            </Group>
          </Card>
        </Grid.Col>
      </Grid>
    </Page>
  );
}
