import { useState } from "react";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, Page } from "../components/ui.jsx";
import TaskModal from "../components/TaskModal.jsx";
import { dayMonth, TASK_STATUS } from "../format.js";
import { useLoad } from "../hooks.js";

export function originLabel(t) {
  return t.origin_meeting_id ? `Принято со встречи ${dayMonth(t.origin_meeting_date)}` : "Создано вручную";
}

export default function BacklogPage() {
  const { me, byId } = useMe();
  const { data: tasks, error, reload } = useLoad(api.tasks, []);
  const [open, setOpen] = useState(null);
  const [title, setTitle] = useState("");

  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTask({ title, user_id: me.id });
    setTitle("");
    reload(true);
  };

  return (
    <Page title="Бэклог" sub="Только принятые задачи">
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      <form className="quick-add" onSubmit={add}>
        <input className="inline-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Новая задача вручную" aria-label="Название новой задачи" />
        <button className="btn" disabled={!title.trim()}>Добавить</button>
      </form>

      <div className="list">
        <div className="list-head"><span>Ключ</span><span>Задача</span><span>Исполнитель</span><span>Срок</span><span>Статус</span></div>
        {tasks?.map((t) => (
          <div className="task" key={t.id} role="button" tabIndex={0} onClick={() => setOpen(t.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(t.id)}>
            <span>{t.key}</span>
            <span>{t.title}</span>
            <span>{byId[t.assignee_id]?.name ?? "—"}</span>
            <span>{t.due_text ?? "—"}</span>
            <span>
              <span className={`pill ${t.status === "done" ? "" : t.status}`}>{TASK_STATUS[t.status]}</span>
              <span className="origin">{originLabel(t)}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="hint">Сюда попадают только задачи, которые человек принял или создал сам.</p>
      {open ? <TaskModal taskId={open} onClose={() => setOpen(null)} onChanged={() => reload(true)} /> : null}
    </Page>
  );
}
