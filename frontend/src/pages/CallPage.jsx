import { Room, RoomEvent, Track } from "livekit-client";
import { useEffect, useReducer, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import {
  ActionIcon,
  Avatar,
  Box,
  Button,
  Card,
  Grid,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Timeline,
  Title,
  Tooltip,
} from "@mantine/core";
import { IconDoorExit, IconMicrophone, IconMicrophoneOff, IconPhoneCall, IconPhoneOff, IconUpload, IconVideoOff } from "@tabler/icons-react";
import { useMe } from "../context.jsx";
import { Banner, Page } from "../components/ui.jsx";
import { initials, mmss } from "../format.js";
import { useLoad } from "../hooks.js";
import { canManageMeeting } from "../permissions.js";

/* ------------------------------------------------------------------ in-call screen */
function LiveCall({ meeting }) {
  const { me, can } = useMe();
  const nav = useNavigate();
  const roomRef = useRef(null);
  const [, rerender] = useReducer((x) => x + 1, 0);
  const [conn, setConn] = useState("connecting"); // connecting | connected | error
  const [error, setError] = useState(null);
  const [micError, setMicError] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  // keep the meeting fresh: shows whether recording really started, and notices when someone ends the call
  const { data: fresh } = useLoad(() => api.meeting(meeting.id), [meeting.id], () => true);
  useEffect(() => {
    if (fresh && !["scheduled", "live"].includes(fresh.status)) nav(`/meetings/${meeting.id}`, { replace: true });
  }, [fresh, meeting.id, nav]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(RoomEvent.ParticipantConnected, rerender);
    room.on(RoomEvent.ParticipantDisconnected, rerender);
    room.on(RoomEvent.ActiveSpeakersChanged, rerender);
    room.on(RoomEvent.TrackMuted, rerender);
    room.on(RoomEvent.TrackUnmuted, rerender);
    room.on(RoomEvent.LocalTrackPublished, rerender);
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach()); // play remote audio
      rerender();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    room.on(RoomEvent.Disconnected, () => !cancelled && nav(`/meetings/${meeting.id}`));

    (async () => {
      try {
        const { url, token } = await api.callToken(meeting.id);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) return;
        setConn("connected");
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          setMicError("Нет доступа к микрофону — вы слышите других, но вас не слышно. Разрешите микрофон в браузере.");
        }
        rerender();
      } catch (e) {
        if (!cancelled) {
          setConn("error");
          setError(e.message);
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
    };
  }, [meeting.id, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const room = roomRef.current;
  const people = room && conn === "connected" ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const micOn = room?.localParticipant?.isMicrophoneEnabled ?? false;

  const toggleMic = async () => {
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicError(null);
    } catch {
      setMicError("Нет доступа к микрофону.");
    }
    rerender();
  };
  const leave = () => nav("/meetings");
  const endForAll = async () => {
    try {
      await api.endCall(meeting.id);
    } catch (e) {
      setError(e.message);
      return;
    }
    nav(`/meetings/${meeting.id}`);
  };

  const recording = fresh?.recording;
  const canEnd = canManageMeeting(me, can, fresh ?? meeting);
  return (
    <Page title={meeting.title} sub="Звонок в Qadam · аудио">
      {error ? (
        <Banner kind="error">
          {error}
          <Box mt={8}><Button component={Link} to="/call" size="xs" variant="default">Назад</Button></Box>
        </Banner>
      ) : null}
      {micError ? <Banner kind="warn">{micError}</Banner> : null}
      {conn === "connected" && fresh && !recording ? (
        <Banner kind="warn">Запись пока не началась. Если так и останется, после звонка загрузите аудио вручную.</Banner>
      ) : null}

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Paper className="call-stage" p="xl" radius="lg" mih={420}>
            <Stack justify="space-between" h="100%" mih={380}>
              <Group gap={8}>
                <span className="rec-dot" data-idle={!recording || undefined} />
                <Text size="sm" fw={500}>
                  {recording ? "Идёт запись" : conn === "connecting" ? "Подключение…" : "Запись не идёт"} · {mmss(elapsed)}
                </Text>
              </Group>

              <Group justify="center" gap={40} py="xl">
                {conn === "connecting" ? <Loader color="white" /> : null}
                {people.map((p) => (
                  <Stack key={p.identity} align="center" gap={8}>
                    <Avatar
                      className="person-avatar"
                      data-talking={p.isSpeaking || undefined}
                      size={88}
                      radius={999}
                      color="indigo"
                      variant="filled"
                    >
                      {initials(p.name || p.identity)}
                    </Avatar>
                    <Text fw={600}>{p.name || p.identity}{p.isLocal ? " (вы)" : ""}</Text>
                    <Text size="xs" opacity={0.7}>
                      {!p.isMicrophoneEnabled ? "микрофон выкл." : p.isSpeaking ? "говорит" : "в звонке"}
                    </Text>
                  </Stack>
                ))}
              </Group>

              <Group justify="center" gap="sm">
                <Tooltip label={micOn ? "Выключить микрофон" : "Включить микрофон"}>
                  <ActionIcon size={52} radius="xl" variant={micOn ? "white" : "filled"} color={micOn ? "dark" : "gray"} onClick={toggleMic} disabled={conn !== "connected"} aria-label="Микрофон">
                    {micOn ? <IconMicrophone size={22} /> : <IconMicrophoneOff size={22} />}
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Видео появится позже">
                  <ActionIcon size={52} radius="xl" variant="filled" color="gray" disabled aria-label="Камера">
                    <IconVideoOff size={22} />
                  </ActionIcon>
                </Tooltip>
                <Tooltip label="Выйти — звонок продолжится для остальных">
                  <ActionIcon size={52} radius="xl" variant="filled" color="gray" onClick={leave} aria-label="Выйти">
                    <IconDoorExit size={22} />
                  </ActionIcon>
                </Tooltip>
                {canEnd ? (
                  <Button size="lg" radius="xl" color="red" leftSection={<IconPhoneOff size={20} />} onClick={endForAll} disabled={conn !== "connected"}>
                    Завершить для всех
                  </Button>
                ) : null}
              </Group>
            </Stack>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card h="100%">
            <Title order={4} mb="md">Запись и транскрипт</Title>
            <Timeline active={recording ? 0 : -1} bulletSize={24} lineWidth={2}>
              <Timeline.Item title="Запись">
                <Text size="sm" c="dimmed">Звонок записывается на сервере.</Text>
              </Timeline.Item>
              <Timeline.Item title="Распознавание">
                <Text size="sm" c="dimmed">Когда звонок завершат, Whisper распознает речь.</Text>
              </Timeline.Item>
              <Timeline.Item title="Проверка">
                <Text size="sm" c="dimmed">Из текста появятся предложения задач — они ждут проверки.</Text>
              </Timeline.Item>
            </Timeline>
            <Text size="xs" c="dimmed" mt="lg">
              «Выйти» оставляет звонок идти для остальных. «Завершить для всех» (автор встречи или руководитель) закрывает его и запускает обработку.
            </Text>
          </Card>
        </Grid.Col>
      </Grid>
    </Page>
  );
}

/* ------------------------------------------------------------------ start / join screen */
function StartCall() {
  const nav = useNavigate();
  const { can } = useMe();
  const [title, setTitle] = useState("Планирование спринта");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data: health } = useLoad(api.health, []);
  const { data: meetings } = useLoad(api.meetings, []);
  const live = meetings?.filter((m) => m.status === "live") ?? [];

  const create = async (target) => {
    setBusy(true);
    setError(null);
    try {
      const m = await api.createMeeting(title.trim());
      nav(target === "call" ? `/call/${m.id}` : `/meetings/${m.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Page title="Звонок" sub="Аудиозвонок с записью и автоматическим транскриптом">
      {health && !health.livekit ? (
        <Banner kind="warn" title="Сервер звонков не настроен">
          Задайте LIVEKIT_API_KEY и LIVEKIT_API_SECRET. Пока можно загрузить запись встречи вручную.
        </Banner>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <Grid gutter="lg">
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Card>
            <Group gap="sm" mb="md">
              <ThemeIcon variant="light" size="lg" radius="md"><IconPhoneCall size={18} /></ThemeIcon>
              <Title order={4}>Новая встреча</Title>
            </Group>
            {can("meetings.create") ? (
              <Stack>
                <TextInput label="Название" value={title} onChange={(e) => setTitle(e.currentTarget.value)} />
                <Group>
                  <Button leftSection={<IconPhoneCall size={16} />} loading={busy} disabled={!title.trim() || !health?.livekit} onClick={() => create("call")}>
                    Начать звонок
                  </Button>
                  <Button variant="default" leftSection={<IconUpload size={16} />} disabled={busy || !title.trim()} onClick={() => create("meeting")}>
                    Загрузить запись
                  </Button>
                </Group>
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">У вас нет прав создавать встречи.</Text>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Card>
            <Group gap="sm" mb="md">
              <span className="rec-dot" data-idle={!live.length || undefined} />
              <Title order={4}>Идут сейчас</Title>
            </Group>
            {live.length ? (
              <Stack gap="sm">
                {live.map((m) => (
                  <Group key={m.id} justify="space-between" wrap="nowrap">
                    <Text size="sm" fw={500} truncate>{m.title}</Text>
                    <Button component={Link} to={`/call/${m.id}`} size="xs" variant="light">Присоединиться</Button>
                  </Group>
                ))}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">Активных звонков нет.</Text>
            )}
          </Card>
        </Grid.Col>
      </Grid>
    </Page>
  );
}

export default function CallPage() {
  const { meetingId } = useParams();
  const { data: meeting, error } = useLoad(() => (meetingId ? api.meeting(meetingId) : Promise.resolve(null)), [meetingId]);

  if (!meetingId) return <StartCall />;
  if (error) return <Page title="Звонок"><Banner kind="error">{error.message}</Banner></Page>;
  if (!meeting) return <Page title="Звонок"><Group justify="center" py="xl"><Loader /></Group></Page>;
  if (!["scheduled", "live"].includes(meeting.status)) return <Navigate to={`/meetings/${meeting.id}`} replace />;
  return <LiveCall meeting={meeting} />;
}
