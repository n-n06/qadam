import { Room, RoomEvent, Track } from "livekit-client";
import { useEffect, useReducer, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { Banner, Page } from "../components/ui.jsx";
import { initials, mmss } from "../format.js";
import { useLoad } from "../hooks.js";

/* ------------------------------------------------------------------ in-call screen */
function LiveCall({ meeting }) {
  const { me } = useMe();
  const nav = useNavigate();
  const roomRef = useRef(null);
  const [, rerender] = useReducer((x) => x + 1, 0);
  const [conn, setConn] = useState("connecting"); // connecting | connected | error
  const [error, setError] = useState(null);
  const [micError, setMicError] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  // keep the meeting fresh: shows whether recording really started, and notices when someone ends the call
  const { data: fresh } = useLoad(() => api.meeting(meeting.id), [meeting.id], () => true);
  useEffect(() => {
    if (fresh && !["scheduled", "live"].includes(fresh.status)) nav(`/meetings/${meeting.id}`, { replace: true });
  }, [fresh, meeting.id, nav]);

  useEffect(() => {
    let cancelled = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;

    room.on(RoomEvent.ParticipantConnected, rerender);
    room.on(RoomEvent.ParticipantDisconnected, rerender);
    room.on(RoomEvent.ActiveSpeakersChanged, rerender);
    room.on(RoomEvent.TrackMuted, rerender);
    room.on(RoomEvent.TrackUnmuted, rerender);
    room.on(RoomEvent.LocalTrackPublished, rerender);
    room.on(RoomEvent.TrackSubscribed, (track) => {
      if (track.kind === Track.Kind.Audio) document.body.appendChild(track.attach()); // play remote audio
      rerender();
    });
    room.on(RoomEvent.TrackUnsubscribed, (track) => track.detach().forEach((el) => el.remove()));
    room.on(RoomEvent.Disconnected, () => !cancelled && nav(`/meetings/${meeting.id}`));

    (async () => {
      try {
        const { url, token } = await api.callToken(meeting.id, me.id);
        if (cancelled) return;
        await room.connect(url, token);
        if (cancelled) return;
        setConn("connected");
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch {
          setMicError("Нет доступа к микрофону — вы слышите других, но вас не слышно. Разрешите микрофон в браузере.");
        }
        rerender();
      } catch (e) {
        if (!cancelled) {
          setConn("error");
          setError(e.message);
        }
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
    };
  }, [meeting.id, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const room = roomRef.current;
  const people = room && conn === "connected" ? [room.localParticipant, ...room.remoteParticipants.values()] : [];
  const micOn = room?.localParticipant?.isMicrophoneEnabled ?? false;

  const toggleMic = async () => {
    try {
      await room.localParticipant.setMicrophoneEnabled(!micOn);
      setMicError(null);
    } catch {
      setMicError("Нет доступа к микрофону.");
    }
    rerender();
  };
  const leave = () => nav("/meetings");
  const endForAll = async () => {
    try {
      await api.endCall(meeting.id);
    } catch (e) {
      setError(e.message);
      return;
    }
    nav(`/meetings/${meeting.id}`);
  };

  const recording = fresh?.recording;
  return (
    <Page title={meeting.title} sub="Звонок в Qadam · аудио">
      {error ? <Banner kind="error">{error} <div className="actions"><Link className="btn small" to="/call">Назад</Link></div></Banner> : null}
      {micError ? <Banner kind="warn">{micError}</Banner> : null}
      {conn === "connected" && fresh && !recording ? (
        <Banner kind="warn">Запись пока не началась. Если так и останется, после звонка загрузите аудио вручную.</Banner>
      ) : null}

      <div className="call">
        <div className="call-stage">
          <p className="live">
            <span className={`dot${recording ? "" : " idle"}`} />
            {recording ? "Идёт запись" : conn === "connecting" ? "Подключение…" : "Запись не идёт"} · {mmss(elapsed)}
          </p>
          <div className="people">
            {people.map((p) => (
              <div className={`person${p.isSpeaking ? " talk" : ""}`} key={p.identity}>
                <div className="big-av">{initials(p.name || p.identity)}</div>
                <span>{p.name || p.identity}{p.isLocal ? " (вы)" : ""}</span>
                <small>{!p.isMicrophoneEnabled ? "микрофон выкл." : p.isSpeaking ? "говорит" : "в звонке"}</small>
              </div>
            ))}
          </div>
          <div className="controls">
            <button className={`ctl ${micOn ? "on" : "off"}`} onClick={toggleMic} disabled={conn !== "connected"}>
              {micOn ? "Микрофон" : "Микрофон выкл."}
            </button>
            <button className="ctl off" disabled title="Видео появится позже">Камера выкл.</button>
            <button className="ctl off" onClick={leave}>Выйти</button>
            <button className="ctl end" onClick={endForAll} disabled={conn !== "connected"}>Завершить для всех</button>
          </div>
        </div>

        <div className="panel">
          <h2>Запись и транскрипт</h2>
          <ol className="steps">
            <li>Звонок записывается на сервере.</li>
            <li>Когда его завершат, Whisper распознаёт речь.</li>
            <li>Из текста появятся предложения задач — они ждут вашей проверки.</li>
          </ol>
          <p className="hint">Транскрипт появится после завершения звонка. «Выйти» оставляет звонок идти для остальных, «Завершить для всех» закрывает его и запускает обработку.</p>
        </div>
      </div>
    </Page>
  );
}

/* ------------------------------------------------------------------ start / join screen */
function StartCall() {
  const nav = useNavigate();
  const [title, setTitle] = useState("Планирование спринта");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { data: health } = useLoad(api.health, []);
  const { data: meetings } = useLoad(api.meetings, []);
  const live = meetings?.filter((m) => m.status === "live") ?? [];

  const create = async (target) => {
    setBusy(true);
    setError(null);
    try {
      const m = await api.createMeeting(title.trim());
      nav(target === "call" ? `/call/${m.id}` : `/meetings/${m.id}`);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Page title="Звонок" sub="Аудиозвонок с записью и автоматическим транскриптом">
      {health && !health.livekit ? (
        <Banner kind="warn">Сервер звонков не настроен (задайте LIVEKIT_API_KEY и LIVEKIT_API_SECRET). Пока можно загрузить запись встречи вручную.</Banner>
      ) : null}
      {error ? <Banner kind="error">{error}</Banner> : null}

      <div className="split">
        <div className="panel">
          <h2>Новая встреча</h2>
          <label className="field"><span>Название</span><input value={title} onChange={(e) => setTitle(e.target.value)} /></label>
          <div className="actions">
            <button className="btn primary" disabled={busy || !title.trim() || !health?.livekit} onClick={() => create("call")}>Начать звонок</button>
            <button className="btn" disabled={busy || !title.trim()} onClick={() => create("meeting")}>Загрузить запись</button>
          </div>
        </div>
        <div className="panel">
          <h2>Идут сейчас</h2>
          {live.length ? (
            live.map((m) => (
              <div className="draft-line" key={m.id}>
                <span>{m.title}</span>
                <Link className="btn small" to={`/call/${m.id}`}>Присоединиться</Link>
              </div>
            ))
          ) : (
            <p className="empty">Активных звонков нет.</p>
          )}
        </div>
      </div>
    </Page>
  );
}

export default function CallPage() {
  const { meetingId } = useParams();
  const { data: meeting, error } = useLoad(() => (meetingId ? api.meeting(meetingId) : Promise.resolve(null)), [meetingId]);

  if (!meetingId) return <StartCall />;
  if (error) return <Page title="Звонок"><Banner kind="error">{error.message}</Banner></Page>;
  if (!meeting) return <Page title="Звонок" sub="Загрузка…" />;
  if (!["scheduled", "live"].includes(meeting.status)) return <Navigate to={`/meetings/${meeting.id}`} replace />;
  return <LiveCall meeting={meeting} />;
}
