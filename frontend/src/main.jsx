import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";
import "./styles.css";

import { MantineProvider } from "@mantine/core";
import { Notifications } from "@mantine/notifications";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import { theme } from "./theme.js";

// No <StrictMode>: its dev-only double effect run would open and drop the LiveKit connection twice.
createRoot(document.getElementById("root")).render(
  <MantineProvider theme={theme} defaultColorScheme="auto">
    <Notifications position="top-right" />
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </MantineProvider>
);
