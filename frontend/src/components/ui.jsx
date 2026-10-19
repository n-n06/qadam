import { Alert, Avatar, Badge, Box, Button, Center, Group, Stack, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconLock, IconX } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { MEETING_STATUS, mmss, TASK_STATUS } from "../format.js";
import { MEETING_STATUS_COLOR, TASK_STATUS_COLOR } from "../theme.js";

export function Page({ title, sub, actions, children }) {
  return (
    <Stack gap="lg" maw={1200} mx="auto" w="100%">
      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Title order={2}>{title}</Title>
          {sub ? <Text c="dimmed" size="sm" mt={4}>{sub}</Text> : null}
        </div>
        {actions}
      </Group>
      {children}
    </Stack>
  );
}

const BANNER = {
  info: { color: "blue", icon: IconInfoCircle },
  ok: { color: "teal", icon: IconCircleCheck },
  warn: { color: "yellow", icon: IconAlertTriangle },
  error: { color: "red", icon: IconX },
};

export function Banner({ kind = "info", title, children }) {
  const { color, icon: Icon } = BANNER[kind];
  return (
    <Alert variant="light" color={color} title={title} icon={<Icon size={18} />}>
      {children}
    </Alert>
  );
}

const PALETTE = ["indigo", "teal", "grape", "orange", "cyan", "pink", "lime", "violet"];

export function UserAvatar({ user, name, size = "sm" }) {
  const label = user?.name ?? name ?? "?";
  const color = user?.id ? PALETTE[user.id % PALETTE.length] : "gray";
  return (
    <Tooltip label={label} withArrow>
      <Avatar size={size} radius="xl" color={color} name={label} />
    </Tooltip>
  );
}

export const TaskStatusBadge = ({ status }) => (
  <Badge variant="light" color={TASK_STATUS_COLOR[status]}>{TASK_STATUS[status]}</Badge>
);

export const MeetingStatusBadge = ({ status }) => (
  <Badge variant={status === "live" ? "filled" : "light"} color={MEETING_STATUS_COLOR[status]}>
    {MEETING_STATUS[status]}
  </Badge>
);

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <Center py={48}>
      <Stack align="center" gap="xs" maw={420} ta="center">
        {Icon ? (
          <ThemeIcon size={52} radius="xl" variant="light">
            <Icon size={26} />
          </ThemeIcon>
        ) : null}
        <Text fw={600}>{title}</Text>
        <Text c="dimmed" size="sm">{children}</Text>
      </Stack>
    </Center>
  );
}

export function Forbidden() {
  return (
    <EmptyState icon={IconLock} title="Недостаточно прав">
      Этот раздел доступен только администратору.{" "}
      <Button component={Link} to="/meetings" variant="subtle" size="compact-sm">На главную</Button>
    </EmptyState>
  );
}

export function TranscriptLines({ segments }) {
  return (
    <Stack gap="md">
      {segments.map((s) => (
        <Group key={s.id} align="flex-start" wrap="nowrap" gap="md">
          <Text size="xs" c="dimmed" ff="monospace" pt={2} w={44} style={{ flexShrink: 0 }}>
            {mmss(s.start_sec)}
          </Text>
          <Box>
            {s.speaker ? <Text size="sm" fw={600}>{s.speaker}</Text> : null}
            <Text size="sm">{s.text}</Text>
          </Box>
        </Group>
      ))}
    </Stack>
  );
}
