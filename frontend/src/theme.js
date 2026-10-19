import { createTheme } from "@mantine/core";

// Mantine theme. The same tokens exist in the official Mantine UI Figma kit, so mock-ups and code match.
export const theme = createTheme({
  primaryColor: "indigo",
  primaryShade: { light: 6, dark: 5 },
  defaultRadius: "md",
  fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headings: { fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", fontWeight: "650" },
  cursorType: "pointer",
  components: {
    Card: { defaultProps: { withBorder: true, radius: "lg", padding: "lg" } },
    Paper: { defaultProps: { radius: "lg" } },
    Modal: { defaultProps: { radius: "lg", centered: true, overlayProps: { backgroundOpacity: 0.45, blur: 3 } } },
    Badge: { defaultProps: { radius: "sm", tt: "none", fw: 600 } },
    Button: { defaultProps: { radius: "md" } },
  },
});

export const TASK_STATUS_COLOR = { todo: "gray", in_progress: "blue", done: "teal" };
export const MEETING_STATUS_COLOR = { scheduled: "gray", live: "red", processing: "yellow", ready: "teal", failed: "red" };
export const ROLE_COLOR = { admin: "grape", lead: "indigo", member: "gray" };
