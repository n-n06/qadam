import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api.js";
import { Banner, Page, TranscriptLines } from "../components/ui.jsx";
import { dayMonth } from "../format.js";
import { useLoad } from "../hooks.js";

const DRAFT_STATUS = { pending: "на проверке", approved: "принята", rejected: "отклонена" };

/** Empty state that doubles as the manual fallback (F4 AC2): upload audio or paste a transcript. */
function FallbackInput({ meeting, onDone }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="empty">
        <h3>Транскрипта пока нет</h3>
        Загрузите запись встречи — её распознает Whisper. Или вставьте готовый текст.
      </div>
      {error ? <Banner kind="error">{error}</Banner> : null}
      <label className="field" style={{ marginTop: 16 }}>
        <span>Аудио или видео</span>
        <input
          type="file"
          accept="audio/*,video/*,.ogg,.opus,.m4a"
          disabled={busy}
          onChange={(e) => e.target.files[0] && run(() => api.uploadAudio(meeting.id, e.target.files[0]))}
        />
      </label>
      <label className="field">
        <span>Или текст: одна реплика на строку, можно «Имя: реплика»</span>
        <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Алия: Давайте добавим экспорт в Excel.\nЕрлан: Пусть сделает Айгерим, срок — пятница."} />
      </label>
      <button className="btn primary" disabled={busy || !text.trim()} onClick={() => run(() => api.uploadTranscript(meeting.id, text))}>
        Создать задачи из текста
      </button>
    </div>
  );
}

export default function MeetingPage() {
  const { id } = useParams();
  const { data: m, error, reload } = useLoad(() => api.meeting(id), [id], (d) => d?.status === "processing" || d?.status === "live");

  if (error && !m) return <Page title="Встреча"><Banner kind="error">{error.message}</Banner></Page>;
  if (!m) return <Page title="Встреча" sub="Загрузка…" />;

  const minutes = m.duration_sec ? Math.max(1, Math.round(m.duration_sec / 60)) : null;
  const sub = [dayMonth(m.created_at), minutes && `${minutes} мин`].filter(Boolean).join(" · ");
  const needsInput = !m.segments.length && ["scheduled", "ready", "failed"].includes(m.status);

  return (
    <Page title={m.title} sub={sub}>
      {m.status === "processing" ? <Banner kind="info">Распознаём речь и готовим задачи — обычно это занимает несколько минут. Страница обновится сама.</Banner> : null}
      {m.status === "failed" ? <Banner kind="error">{m.error || "Не удалось обработать встречу."} Запись не потеряна — загрузите аудио или текст ниже.</Banner> : null}
      {m.status === "live" ? (
        <Banner kind="warn">
          Звонок идёт.
          <div className="actions"><Link className="btn primary small" to={`/call/${m.id}`}>Присоединиться</Link></div>
        </Banner>
      ) : null}

      <div className="split">
        <div className="panel">
          <h2>Текст встречи</h2>
          {needsInput ? <FallbackInput meeting={m} onDone={() => reload()} /> : <TranscriptLines segments={m.segments} />}
          {!needsInput && !m.segments.length ? <p className="empty">Пока пусто.</p> : null}
        </div>

        <div className="panel summary">
          <h2>Сводка</h2>
          {m.summary ? <p>{m.summary}</p> : <p className="empty">Сводка появится после обработки.</p>}
          {m.skipped_note ? <div className="note">{m.skipped_note}</div> : null}

          {m.drafts.length ? (
            <div style={{ marginTop: 16 }}>
              {m.drafts.map((d) => (
                <div className="draft-line" key={d.id}><span>{d.title}</span><span>{DRAFT_STATUS[d.status]}</span></div>
              ))}
            </div>
          ) : null}

          <div className="actions">
            {m.pending_drafts ? <Link className="btn primary" to="/review">Проверить задачи ({m.pending_drafts})</Link> : null}
            {m.segments.length && !["processing", "live"].includes(m.status) ? (
              <button className="btn" onClick={async () => { await api.reprocess(m.id); reload(); }}>Пересоздать черновики</button>
            ) : null}
          </div>
        </div>
      </div>
    </Page>
  );
}
