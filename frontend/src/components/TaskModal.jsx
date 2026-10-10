import { useEffect } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { dateTime, dayMonth, TASK_STATUS } from "../format.js";
import { useLoad } from "../hooks.js";

/** Task detail with editable status / assignee / due date and the activity history (F3). */
export default function TaskModal({ taskId, onClose, onChanged }) {
  const { users, me, byId } = useMe();
  const { data: task, error, reload } = useLoad(() => api.task(taskId), [taskId]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (patch) => {
    await api.updateTask(taskId, { ...patch, user_id: me.id });
    await reload(true);
    onChanged?.();
  };

  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Задача">
        {error ? <div className="banner error">{error.message}</div> : null}
        {!task ? null : (
          <>
            <div className="modal-head">
              <span className="key">{task.key}</span>
              <button className="btn small" onClick={onClose}>Закрыть</button>
            </div>
            <h3>{task.title}</h3>
            {task.description ? <p className="desc">{task.description}</p> : null}
            {task.acceptance_criteria.length ? (
              <>
                <div className="label">Критерии готовности</div>
                <ul>{task.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}</ul>
              </>
            ) : null}

            <div className="row">
              <label className="field">
                <span>Статус</span>
                <select value={task.status} onChange={(e) => save({ status: e.target.value })}>
                  {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Исполнитель</span>
                <select value={task.assignee_id ?? ""} onChange={(e) => save({ assignee_id: e.target.value ? Number(e.target.value) : null })}>
                  <option value="">Не указан</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Срок</span>
                <input
                  defaultValue={task.due_text ?? ""}
                  placeholder="Не указан"
                  onBlur={(e) => e.target.value.trim() !== (task.due_text ?? "") && save({ due_text: e.target.value })}
                />
              </label>
            </div>

            {task.origin_meeting_id ? (
              <div className="quote">
                Из встречи <Link to={`/meetings/${task.origin_meeting_id}`} onClick={onClose}>«{task.origin_meeting_title}»</Link>
                {task.origin_quote ? <> — «{task.origin_quote}»</> : null}
              </div>
            ) : null}

            <div className="label">История</div>
            <ul className="history">
              {task.events.map((ev) => (
                <li key={ev.id}>
                  <span>{ev.text}{ev.actor_id && byId[ev.actor_id] ? ` · ${byId[ev.actor_id].name}` : ""}</span>
                  <time>{dateTime(ev.created_at)}</time>
                </li>
              ))}
            </ul>
            <p className="hint">Создана {dayMonth(task.created_at)}</p>
          </>
        )}
      </div>
    </div>
  );
}
