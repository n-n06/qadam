import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { AuthProvider, FullScreenLoader, TeamProvider, useAuth } from "./context.jsx";
import { Forbidden } from "./components/ui.jsx";
import BacklogPage from "./pages/BacklogPage.jsx";
import BoardPage from "./pages/BoardPage.jsx";
import CallPage from "./pages/CallPage.jsx";
import LoginPage from "./pages/LoginPage.jsx";
import MeetingPage from "./pages/MeetingPage.jsx";
import MeetingsPage from "./pages/MeetingsPage.jsx";
import ReviewPage from "./pages/ReviewPage.jsx";
import TeamPage from "./pages/TeamPage.jsx";

function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (user === undefined) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return <TeamProvider>{children}</TeamProvider>;
}

/** UI-side guard only; the API enforces the same permission. */
function RequirePermission({ permission, children }) {
  const { can } = useAuth();
  return can(permission) ? children : <Forbidden />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/meetings" replace />} />
        <Route path="call/:meetingId?" element={<CallPage />} />
        <Route path="meetings" element={<MeetingsPage />} />
        <Route path="meetings/:id" element={<MeetingPage />} />
        <Route path="review" element={<ReviewPage />} />
        <Route path="backlog" element={<BacklogPage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="team" element={<RequirePermission permission="users.manage"><TeamPage /></RequirePermission>} />
        <Route path="*" element={<Navigate to="/meetings" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
