import {
  Anchor,
  Badge,
  Box,
  Button,
  Group,
  Paper,
  PasswordInput,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  ThemeIcon,
  Title,
  UnstyledButton,
} from "@mantine/core";
import { IconAt, IconChecklist, IconLock, IconMicrophone, IconSparkles } from "@tabler/icons-react";
import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Banner } from "../components/ui.jsx";
import { useAuth } from "../context.jsx";
import { ROLE_LABEL } from "../format.js";
import { ROLE_COLOR } from "../theme.js";

// Seeded by the backend when SEED_DEMO=true (password = DEMO_PASSWORD). Shown in dev builds only.
const DEMO = [
  { email: "aliya@qadam.kz", name: "Алия", role: "admin" },
  { email: "erlan@qadam.kz", name: "Ерлан", role: "lead" },
  { email: "aigerim@qadam.kz", name: "Айгерим", role: "member" },
];

const FEATURES = [
  { icon: IconMicrophone, text: "Звонок записывается и распознаётся Whisper" },
  { icon: IconSparkles, text: "ИИ предлагает задачи из разговора" },
  { icon: IconChecklist, text: "Человек проверяет — только потом бэклог" },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const from = location.state?.from?.pathname || "/meetings";
  if (user) return <Navigate to={from} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      nav(from, { replace: true });
    } catch (err) {
      setError(err.status === 422 ? "Введите корректную почту" : err.message);
      setBusy(false);
    }
  };

  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0} mih="100vh">
      <Box className="login-hero" visibleFrom="md" p={56}>
        <Stack justify="space-between" h="100%">
          <Group gap="sm">
            <ThemeIcon size={40} radius="md" color="white" variant="white">
              <Text fw={800} c="indigo">Q</Text>
            </ThemeIcon>
            <Text fw={700} size="xl" c="white">Qadam</Text>
          </Group>
          <Stack gap="xl">
            <Title order={1} c="white" fz={40} lh={1.15}>
              От встречи —<br />к задачам на доске
            </Title>
            <Stack gap="md">
              {FEATURES.map(({ icon: Icon, text }) => (
                <Group key={text} gap="sm" wrap="nowrap">
                  <ThemeIcon variant="white" color="indigo" radius="xl" size={34}>
                    <Icon size={18} />
                  </ThemeIcon>
                  <Text c="white" opacity={0.92}>{text}</Text>
                </Group>
              ))}
            </Stack>
          </Stack>
          <Text size="xs" c="white" opacity={0.7}>Qadam · meeting-to-task платформа</Text>
        </Stack>
      </Box>

      <Stack justify="center" align="center" p="xl">
        <Paper w="100%" maw={400} p={0} bg="transparent">
          <Stack gap={4} mb="xl">
            <Title order={2}>Вход</Title>
            <Text c="dimmed" size="sm">Используйте рабочую почту и пароль, которые выдал администратор.</Text>
          </Stack>

          <form onSubmit={submit}>
            <Stack>
              {error ? <Banner kind="error">{error}</Banner> : null}
              <TextInput
                label="Почта"
                placeholder="you@company.kz"
                type="email"
                autoComplete="username"
                leftSection={<IconAt size={16} />}
                value={email}
                onChange={(e) => setEmail(e.currentTarget.value)}
                required
                autoFocus
              />
              <PasswordInput
                label="Пароль"
                autoComplete="current-password"
                leftSection={<IconLock size={16} />}
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                required
              />
              <Button type="submit" size="md" loading={busy} fullWidth mt="xs">Войти</Button>
            </Stack>
          </form>

          {import.meta.env.DEV ? (
            <Paper withBorder p="md" mt="xl" radius="md">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">Демо-аккаунты · пароль qadam-demo</Text>
              <Stack gap={6}>
                {DEMO.map((d) => (
                  <UnstyledButton
                    key={d.email}
                    className="demo-account"
                    onClick={() => {
                      setEmail(d.email);
                      setPassword("qadam-demo");
                    }}
                  >
                    <Group justify="space-between" wrap="nowrap">
                      <div>
                        <Text size="sm" fw={500}>{d.name}</Text>
                        <Anchor component="span" size="xs">{d.email}</Anchor>
                      </div>
                      <Badge variant="light" color={ROLE_COLOR[d.role]} tt="none">{ROLE_LABEL[d.role]}</Badge>
                    </Group>
                  </UnstyledButton>
                ))}
              </Stack>
            </Paper>
          ) : null}
        </Paper>
      </Stack>
    </SimpleGrid>
  );
}
