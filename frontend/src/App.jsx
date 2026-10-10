import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { UserProvider } from "./context.jsx";
import BacklogPage from "./pages/BacklogPage.jsx";
import BoardPage from "./pages/BoardPage.jsx";
import CallPage from "./pages/CallPage.jsx";
import MeetingPage from "./pages/MeetingPage.jsx";
import MeetingsPage from "./pages/MeetingsPage.jsx";
import ReviewPage from "./pages/ReviewPage.jsx";

export default function App() {
  return (
    <UserProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Navigate to="/meetings" replace />} />
          <Route path="call/:meetingId?" element={<CallPage />} />
          <Route path="meetings" element={<MeetingsPage />} />
          <Route path="meetings/:id" element={<MeetingPage />} />
          <Route path="review" element={<ReviewPage />} />
          <Route path="backlog" element={<BacklogPage />} />
          <Route path="board" element={<BoardPage />} />
          <Route path="*" element={<Navigate to="/meetings" replace />} />
        </Route>
      </Routes>
    </UserProvider>
  );
}
