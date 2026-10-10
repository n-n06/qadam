import { NavLink, Outlet, useLocation } from "react-router-dom";
import { api } from "../api.js";
import { useMe } from "../context.jsx";
import { useLoad } from "../hooks.js";

const NAV = [
  ["/call", "Звонок"],
  ["/meetings", "Встречи"],
  ["/review", "Проверка"],
  ["/backlog", "Задачи"],
  ["/board", "Доска"],
];

export default function Layout() {
  const { users, me, setMe } = useMe();
  const { pathname } = useLocation();
  // pending-review count in the sidebar; refetched on every navigation
  const { data: pending } = useLoad(() => api.drafts("pending"), [pathname]);

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <span className="mark">Q</span> Qadam
        </div>
        <nav>
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? " active" : ""}`}>
              {label}
              {to === "/review" && pending?.length ? <span className="badge">{pending.length}</span> : null}
            </NavLink>
          ))}
        </nav>
        <div className="me">
          <label htmlFor="me">Вы</label>
          <select id="me" value={me.id} onChange={(e) => setMe(Number(e.target.value))}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </aside>
      <section className="main">
        <Outlet />
      </section>
    </div>
  );
}
