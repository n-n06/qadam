import { initials, mmss } from "../format.js";

export function Page({ title, sub, actions, children }) {
  return (
    <>
      <header className="top">
        <div>
          <h1>{title}</h1>
          {sub ? <p>{sub}</p> : null}
        </div>
        {actions}
      </header>
      <div className="content">{children}</div>
    </>
  );
}

export const Banner = ({ kind = "info", children }) => <div className={`banner ${kind}`}>{children}</div>;

export const Avatar = ({ name }) => (
  <span className="avatar" title={name}>
    {initials(name)}
  </span>
);

export function TranscriptLines({ segments }) {
  return segments.map((s) => (
    <div className="line" key={s.id}>
      <span className="time">{mmss(s.start_sec)}</span>
      <div>
        {s.speaker ? <span className="who">{s.speaker}</span> : null}
        <p className="say">{s.text}</p>
      </div>
    </div>
  ));
}
