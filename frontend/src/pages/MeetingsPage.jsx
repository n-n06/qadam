import { Link } from "react-router-dom";
import { api } from "../api.js";
import { Banner, Page } from "../components/ui.jsx";
import { dateTime, MEETING_STATUS } from "../format.js";
import { useLoad } from "../hooks.js";

export default function MeetingsPage() {
  const { data: meetings, error } = useLoad(api.meetings, [], (d) => d?.some((m) => m.status === "processing"));

  return (
    <Page
      title="Встречи"
      sub="Звонки и их транскрипты"
      actions={<Link className="btn primary" to="/call">Новая встреча</Link>}
    >
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      {meetings && !meetings.length ? (
        <div className="panel empty">
          <h3>Встреч пока нет</h3>
          Начните звонок или загрузите запись — задачи появятся в очереди на проверку.
        </div>
      ) : null}
      {meetings?.length ? (
        <div className="list">
          <div className="list-head" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr" }}>
            <span>Встреча</span><span>Когда</span><span>Статус</span><span>Задачи на проверке</span>
          </div>
          {meetings.map((m) => (
            <Link key={m.id} to={`/meetings/${m.id}`} className="task" style={{ gridTemplateColumns: "1.6fr 1fr 1fr 1fr", color: "inherit", textDecoration: "none" }}>
              <span>{m.title}</span>
              <span>{dateTime(m.created_at)}</span>
              <span><span className={`pill ${m.status === "ready" ? "" : m.status}`}>{MEETING_STATUS[m.status]}</span></span>
              <span>{m.pending_drafts || "—"}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </Page>
  );
}
