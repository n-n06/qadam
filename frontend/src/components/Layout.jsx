import {
  ActionIcon,
  AppShell,
  Badge,
  Burger,
  Group,
  Menu,
  NavLink,
  ScrollArea,
  Text,
  ThemeIcon,
  UnstyledButton,
  useComputedColorScheme,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import {
  IconCalendarEvent,
  IconChecklist,
  IconChevronDown,
  IconKey,
  IconLayoutKanban,
  IconListDetails,
  IconLogout,
  IconMoon,
  IconPhoneCall,
  IconSun,
  IconUsers,
} from "@tabler/icons-react";
import { NavLink as RouterLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth, useMe } from "../context.jsx";
import { useLoad } from "../hooks.js";
import { ROLE_LABEL } from "../format.js";
import ChangePasswordModal from "./ChangePasswordModal.jsx";
import { UserAvatar } from "./ui.jsx";

const NAV = [
  { to: "/call", label: "Звонок", icon: IconPhoneCall },
  { to: "/meetings", label: "Встречи", icon: IconCalendarEvent },
  { to: "/review", label: "Проверка", icon: IconChecklist },
  { to: "/backlog", label: "Задачи", icon: IconListDetails },
  { to: "/board", label: "Доска", icon: IconLayoutKanban },
  { to: "/team", label: "Команда", icon: IconUsers, permission: "users.manage" },
];

function ThemeToggle() {
  const { setColorScheme } = useMantineColorScheme();
  const scheme = useComputedColorScheme("light");
  return (
    <ActionIcon
      variant="default"
      size="lg"
      aria-label="Сменить тему"
      onClick={() => setColorScheme(scheme === "dark" ? "light" : "dark")}
    >
      {scheme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
    </ActionIcon>
  );
}

function UserMenu({ onChangePassword }) {
  const { me } = useMe();
  const { logout } = useAuth();
  const nav = useNavigate();
  return (
    <Menu position="top-start" width={240} withinPortal>
      <Menu.Target>
        <UnstyledButton className="user-button" w="100%" p="xs">
          <Group gap="sm" wrap="nowrap">
            <UserAvatar user={me} size="md" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Text size="sm" fw={600} truncate>{me.name}</Text>
              <Text size="xs" c="dimmed" truncate>{ROLE_LABEL[me.role]}</Text>
            </div>
            <IconChevronDown size={16} />
          </Group>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{me.email}</Menu.Label>
        <Menu.Item leftSection={<IconKey size={16} />} onClick={onChangePassword}>Сменить пароль</Menu.Item>
        <Menu.Divider />
        <Menu.Item
          color="red"
          leftSection={<IconLogout size={16} />}
          onClick={async () => {
            await logout();
            nav("/login", { replace: true });
          }}
        >
          Выйти
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export default function Layout() {
  const { can } = useMe();
  const { pathname } = useLocation();
  const [opened, { toggle, close }] = useDisclosure();
  const [pwOpen, pw] = useDisclosure(false);
  // pending-review count in the sidebar; refetched on every navigation
  const { data: pending } = useLoad(() => api.drafts("pending"), [pathname]);

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{ width: 260, breakpoint: "sm", collapsed: { mobile: !opened } }}
      padding={{ base: "md", sm: "xl" }}
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="sm">
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" aria-label="Меню" />
            <ThemeIcon size={32} radius="md" variant="gradient" gradient={{ from: "indigo", to: "violet", deg: 135 }}>
              <Text fw={800} size="md" c="white">Q</Text>
            </ThemeIcon>
            <Text fw={700} size="lg">Qadam</Text>
          </Group>
          <ThemeToggle />
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="sm">
        <AppShell.Section grow component={ScrollArea}>
          {NAV.filter((item) => !item.permission || can(item.permission)).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              component={RouterLink}
              to={to}
              label={label}
              active={pathname === to || pathname.startsWith(`${to}/`)}
              leftSection={<Icon size={18} stroke={1.7} />}
              rightSection={
                to === "/review" && pending?.length ? (
                  <Badge size="sm" variant="filled" circle>{pending.length}</Badge>
                ) : null
              }
              onClick={close}
              className="nav-link"
            />
          ))}
        </AppShell.Section>
        <AppShell.Section className="navbar-footer">
          <UserMenu onChangePassword={pw.open} />
        </AppShell.Section>
      </AppShell.Navbar>

      <AppShell.Main>
        <Outlet />
      </AppShell.Main>
      <ChangePasswordModal opened={pwOpen} onClose={pw.close} />
    </AppShell>
  );
}
