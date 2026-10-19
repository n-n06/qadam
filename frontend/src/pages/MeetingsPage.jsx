import { Badge, Button, Card, Group, Table, Text } from "@mantine/core";
import { IconCalendarEvent, IconPlus } from "@tabler/icons-react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, EmptyState, MeetingStatusBadge, Page, UserAvatar } from "../components/ui.jsx";
import { dateTime } from "../format.js";
import { useLoad } from "../hooks.js";

export default function MeetingsPage() {
  const nav = useNavigate();
  const { can, byId } = useMe();
  const { data: meetings, error } = useLoad(api.meetings, [], (d) => d?.some((m) => m.status === "processing"));

  return (
    <Page
      title="Встречи"
      sub="Звонки и их транскрипты"
      actions={
        can("meetings.create") ? (
          <Button component={Link} to="/call" leftSection={<IconPlus size={16} />}>Новая встреча</Button>
        ) : null
      }
    >
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      <Card p={0}>
        {meetings && !meetings.length ? (
          <EmptyState icon={IconCalendarEvent} title="Встреч пока нет">
            Начните звонок или загрузите запись — задачи появятся в очереди на проверку.
          </EmptyState>
        ) : (
          <Table.ScrollContainer minWidth={640}>
            <Table highlightOnHover verticalSpacing="sm" horizontalSpacing="lg">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Встреча</Table.Th>
                  <Table.Th w={170}>Когда</Table.Th>
                  <Table.Th w={150}>Статус</Table.Th>
                  <Table.Th w={150}>На проверке</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {meetings?.map((m) => (
                  <Table.Tr
                    key={m.id}
                    className="row-link"
                    tabIndex={0}
                    onClick={() => nav(`/meetings/${m.id}`)}
                    onKeyDown={(e) => e.key === "Enter" && nav(`/meetings/${m.id}`)}
                  >
                    <Table.Td>
                      <Group gap="sm" wrap="nowrap">
                        {m.created_by_id ? <UserAvatar user={byId[m.created_by_id]} size="sm" /> : null}
                        <Text size="sm" fw={500}>{m.title}</Text>
                      </Group>
                    </Table.Td>
                    <Table.Td><Text size="sm" c="dimmed">{dateTime(m.created_at)}</Text></Table.Td>
                    <Table.Td><MeetingStatusBadge status={m.status} /></Table.Td>
                    <Table.Td>
                      {m.pending_drafts ? (
                        <Badge variant="filled" color="indigo">{m.pending_drafts}</Badge>
                      ) : (
                        <Text size="sm" c="dimmed">—</Text>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>
    </Page>
  );
}
