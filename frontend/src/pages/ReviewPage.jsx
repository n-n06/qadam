import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, Page } from "../components/ui.jsx";
import { dayMonth } from "../format.js";
import { useLoad } from "../hooks.js";

function EditForm({ draft, onSave, onCancel }) {
  const { users } = useMe();
  const [f, setF] = useState({
    title: draft.title,
    description: draft.description,
    criteria: draft.acceptance_criteria.join("\n"),
    assignee_id: draft.assignee_id ?? "",
    due_text: draft.due_text ?? "",
  });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  return (
    <>
      <label className="field"><span>Название</span><input value={f.title} onChange={set("title")} /></label>
      <label className="field"><span>Описание</span><textarea value={f.description} onChange={set("description")} /></label>
      <label className="field"><span>Критерии готовности (по одному на строку)</span><textarea value={f.criteria} onChange={set("criteria")} /></label>
      <div className="row">
        <label className="field">
          <span>Исполнитель</span>
          <select value={f.assignee_id} onChange={set("assignee_id")}>
            <option value="">Не указан</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Срок</span><input value={f.due_text} onChange={set("due_text")} placeholder="Не указан" /></label>
      </div>
      <div className="actions">
        <button
          className="btn primary"
          disabled={!f.title.trim()}
          onClick={() =>
            onSave({
              title: f.title,
              description: f.description,
              acceptance_criteria: f.criteria.split("\n"),
              assignee_id: f.assignee_id === "" ? null : Number(f.assignee_id),
              due_text: f.due_text,
            })
          }
        >
          Сохранить
        </button>
        <button className="btn" onClick={onCancel}>Отмена</button>
      </div>
    </>
  );
}

function DraftCard({ draft, onDecided }) {
  const { me, byId } = useMe();
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const assignee = draft.assignee_id ? byId[draft.assignee_id]?.name : null;
  const reviewer = draft.reviewer_id ? byId[draft.reviewer_id]?.name : null;

  const act = async (fn, message) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fn();
      onDecided(typeof message === "function" ? message(res) : message);
      setBusy(false);
      return true;
    } catch (e) {
      setError(e.message);
      setBusy(false);
      return false;
    }
  };

  return (
    <div className="card">
      <h2>Встреча «{draft.meeting_title}» · {dayMonth(draft.meeting_date)}</h2>
      <span className="review-status">Предложил ИИ · ждёт решения</span>
      {error ? <Banner kind="error">{error}</Banner> : null}

      {editing ? (
        <EditForm
          draft={draft}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            if (await act(() => api.editDraft(draft.id, patch), "Изменения сохранены")) setEditing(false);
          }}
        />
      ) : (
        <>
          <h3>{draft.title}</h3>
          {draft.description ? <p className="desc">{draft.description}</p> : null}
          {draft.acceptance_criteria.length ? (
            <>
              <div className="label">Критерии готовности</div>
              <ul>{draft.acceptance_criteria.map((c) => <li key={c}>{c}</li>)}</ul>
            </>
          ) : null}
          <div className="meta">
            <span>Исполнитель: <b>{assignee ?? "не указан"}</b></span>
            <span>Срок: <b>{draft.due_text ?? "не указан"}</b></span>
          </div>
          {draft.source_quote ? <div className="quote">Из встречи — «{draft.source_quote}»</div> : null}
          {draft.meeting_skipped_note ? <p className="skip">{draft.meeting_skipped_note}</p> : null}
          <p className="gate">
            {reviewer ? `Проверяет ${reviewer}. ` : ""}Пока решение не принято («Принять», «Изменить» или «Отклонить»), задачи нет ни в бэклоге, ни на доске.
          </p>
          <div className="actions">
            <button className="btn primary" disabled={busy} onClick={() => act(() => api.approveDraft(draft.id, me.id), (t) => `Задача ${t.key} принята и добавлена в бэклог`)}>Принять</button>
            <button className="btn" disabled={busy} onClick={() => setEditing(true)}>Изменить</button>
            <button className="btn quiet" disabled={busy} onClick={() => act(() => api.rejectDraft(draft.id, me.id), "Предложение отклонено")}>Отклонить</button>
          </div>
        </>
      )}
    </div>
  );
}

export default function ReviewPage() {
  const { data: drafts, error, reload } = useLoad(() => api.drafts("pending"), []);
  const [notice, setNotice] = useState(null);

  return (
    <Page title="Проверка предложений ИИ" sub="Человек принимает, меняет или отклоняет задачу до бэклога">
      {error ? <Banner kind="error">{error.message}</Banner> : null}
      {notice ? <Banner kind="ok">{notice}</Banner> : null}
      {drafts && !drafts.length ? (
        <div className="panel empty" style={{ maxWidth: 760 }}>
          <h3>Очередь пуста</h3>
          Новые предложения появятся здесь после обработки встречи. <Link to="/call">Начать звонок</Link> или <Link to="/meetings">открыть встречи</Link>.
        </div>
      ) : null}
      <div className="stack">
        {drafts?.map((d) => (
          <DraftCard key={d.id} draft={d} onDecided={(msg) => { setNotice(msg); reload(true); }} />
        ))}
      </div>
    </Page>
  );
}
