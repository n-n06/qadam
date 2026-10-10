import { useState } from "react";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Avatar, Banner, Page } from "../components/ui.jsx";
import TaskModal from "../components/TaskModal.jsx";
import { parseDate, TASK_STATUS } from "../format.js";
import { useLoad } from "../hooks.js";

const DAY = 24 * 3600 * 1000;

export default function BoardPage() {
  const { me, byId } = useMe();
  const { data: tasks, error, reload } = useLoad(api.tasks, []);
  const [open, setOpen] = useState(null);
  const [over, setOver] = useState(null);
  const [moveError, setMoveError] = useState(null);

  const move = async (taskId, status) => {
    setOver(null);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || task.status === status) return;
    try {
      await api.updateTask(taskId, { status, user_id: me.id });
      setMoveError(null);
    } catch (e) {
      setMoveError(e.message);
    }
    reload(true);
  };

  return (
    <Page title="Доска" sub="Перетащите карточку в другую колонку или откройте её">
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      {moveError ? <Banner kind="error">{moveError}</Banner> : null}
      <div className="board">
        {Object.entries(TASK_STATUS).map(([status, label]) => {
          const items = (tasks ?? []).filter((t) => t.status === status);
          return (
            <div
              key={status}
              className={`col${over === status ? " over" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setOver(status); }}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={(e) => { e.preventDefault(); move(Number(e.dataTransfer.getData("text/plain")), status); }}
            >
              <h2 className="col-h">{label} <span className="count">{items.length}</span></h2>
              {items.map((t) => {
                const fresh = t.origin_meeting_id && Date.now() - parseDate(t.created_at) < DAY;
                return (
                  <article
                    key={t.id}
                    className={`issue${fresh ? " new" : ""}`}
                    draggable
                    tabIndex={0}
                    onDragStart={(e) => e.dataTransfer.setData("text/plain", String(t.id))}
                    onClick={() => setOpen(t.id)}
                    onKeyDown={(e) => e.key === "Enter" && setOpen(t.id)}
                  >
                    <div className="key">{t.key}</div>
                    <div className="issue-title">{t.title}</div>
                    <div className="issue-foot">
                      {t.origin_meeting_id ? <span className="from-meet">Со встречи</span> : <span />}
                      {t.assignee_id ? <Avatar name={byId[t.assignee_id]?.name} /> : null}
                    </div>
                  </article>
                );
              })}
            </div>
          );
        })}
      </div>
      {open ? <TaskModal taskId={open} onClose={() => setOpen(null)} onChanged={() => reload(true)} /> : null}
    </Page>
  );
}
