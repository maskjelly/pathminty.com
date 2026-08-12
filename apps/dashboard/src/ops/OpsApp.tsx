import type { OpsFleetResponse, PlanId, StaffUser } from "@pathminty/contracts";
import { useEffect, useState } from "react";

import {
  ackOpsEvent,
  createOpsStaff,
  getOpsFleet,
  getOpsSession,
  listOpsStaff,
  opsLogin,
  opsOverridePlan,
} from "../api/sessions";
import { BrandMark } from "../BrandMark";

export function OpsApp() {
  const [staff, setStaff] = useState<StaffUser | null>(null);
  const [status, setStatus] = useState<"loading" | "login" | "ready">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fleet, setFleet] = useState<OpsFleetResponse | null>(null);
  const [team, setTeam] = useState<StaffUser[]>([]);
  const [invite, setInvite] = useState({
    email: "",
    name: "",
    password: "",
    role: "viewer" as "viewer" | "oncall",
  });

  useEffect(() => {
    void getOpsSession()
      .then((next) => {
        setStaff(next);
        setStatus(next ? "ready" : "login");
      })
      .catch(() => setStatus("login"));
  }, []);

  useEffect(() => {
    if (status !== "ready") return;
    void getOpsFleet()
      .then(setFleet)
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Fleet failed.");
      });
    if (staff?.role === "admin") {
      void listOpsStaff()
        .then(setTeam)
        .catch(() => undefined);
    }
  }, [status, staff?.role]);

  const signIn = async () => {
    setError("");
    try {
      const next = await opsLogin(email, password);
      setStaff(next);
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Sign-in failed.");
    }
  };

  if (status === "loading") {
    return (
      <main className="empty-dashboard">
        <section className="empty-dashboard-card">
          <BrandMark size={40} />
          <p className="empty-dashboard-kicker">PathMinty ops</p>
          <h1>Checking staff session…</h1>
        </section>
      </main>
    );
  }

  if (status === "login" || !staff) {
    return (
      <main className="empty-dashboard">
        <section className="empty-dashboard-card">
          <BrandMark size={40} />
          <p className="empty-dashboard-kicker">PathMinty ops</p>
          <h1>Staff sign-in</h1>
          <p>Viewer, on-call, and admin. Merchant dashboards stay shop-scoped.</p>
          <form
            className="ops-login"
            onSubmit={(event) => {
              event.preventDefault();
              void signIn();
            }}
          >
            <label>
              Email
              <input
                autoComplete="username"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            <label>
              Password
              <input
                autoComplete="current-password"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {error ? <p className="live-error">{error}</p> : null}
            <button className="marketing-cta primary" type="submit">
              Enter ops
            </button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <div className="ops-shell">
      <header className="ops-top">
        <div className="marketing-brand">
          <BrandMark size={28} />
          Ops
        </div>
        <span>
          {staff.name} · {staff.role}
        </span>
      </header>
      {error ? (
        <div className="live-error" role="alert">
          {error}
        </div>
      ) : null}
      {fleet ? (
        <>
          <section className="insight-strip ops-strip">
            <article>
              <p>Shops</p>
              <strong>{fleet.totals.shops}</strong>
              <span>{fleet.totals.connected} connected</span>
            </article>
            <article>
              <p>Paused on quota</p>
              <strong>{fleet.totals.paused}</strong>
              <span>Need an upgrade or reset</span>
            </article>
            <article>
              <p>Errors 24h</p>
              <strong>{fleet.totals.errors24h}</strong>
              <span>Collector / pipeline</span>
            </article>
            <article>
              <p>Billable sessions</p>
              <strong>{fleet.totals.billableSessions}</strong>
              <span>This UTC month, all shops</span>
            </article>
          </section>

          <section className="ops-table-wrap">
            <h2>Fleet</h2>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>Shop</th>
                  <th>Plan</th>
                  <th>Usage</th>
                  <th>Health</th>
                  <th>Last replay</th>
                  {staff.role === "admin" ? <th>Override</th> : null}
                </tr>
              </thead>
              <tbody>
                {fleet.shops.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No shops yet. First install will land here.</td>
                  </tr>
                ) : (
                  fleet.shops.map((shop) => (
                    <tr key={shop.shopId}>
                      <td>{shop.shopId.replace(".myshopify.com", "")}</td>
                      <td>{shop.planId}</td>
                      <td>
                        {shop.billableSessions}/{shop.limit}
                      </td>
                      <td data-health={shop.health}>
                        {shop.health.replaceAll("_", " ")}
                      </td>
                      <td>
                        {shop.lastReplayAt
                          ? new Date(shop.lastReplayAt).toLocaleString()
                          : "—"}
                      </td>
                      {staff.role === "admin" ? (
                        <td>
                          <select
                            defaultValue={shop.planId}
                            onChange={(event) => {
                              void opsOverridePlan(
                                shop.shopId,
                                event.target.value as PlanId,
                              ).catch((caught: unknown) => {
                                setError(
                                  caught instanceof Error
                                    ? caught.message
                                    : "Override failed.",
                                );
                              });
                            }}
                          >
                            <option value="free">free</option>
                            <option value="launch">launch</option>
                            <option value="growth">growth</option>
                          </select>
                        </td>
                      ) : null}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section className="ops-table-wrap">
            <h2>Failures & pipeline</h2>
            <table className="ops-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Level</th>
                  <th>Code</th>
                  <th>Shop</th>
                  <th>Message</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {fleet.events.length === 0 ? (
                  <tr>
                    <td colSpan={6}>Quiet. Quota pauses and 5xx land here.</td>
                  </tr>
                ) : (
                  fleet.events.map((event) => (
                    <tr key={event.id}>
                      <td>{new Date(event.at).toLocaleString()}</td>
                      <td>{event.level}</td>
                      <td>{event.code}</td>
                      <td>{event.shopId ?? "—"}</td>
                      <td>{event.message}</td>
                      <td>
                        {event.ackedAt ? (
                          "acked"
                        ) : staff.role === "viewer" ? (
                          ""
                        ) : (
                          <button
                            className="control"
                            onClick={() => {
                              void ackOpsEvent(event.id).then(() =>
                                getOpsFleet().then(setFleet),
                              );
                            }}
                            type="button"
                          >
                            Ack
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </>
      ) : (
        <p className="site-map-status">Loading fleet…</p>
      )}

      {staff.role === "admin" ? (
        <section className="ops-table-wrap">
          <h2>Staff</h2>
          <ul className="role-list">
            {team.map((member) => (
              <li key={member.id}>
                <strong>{member.name}</strong> · {member.email} · {member.role}
              </li>
            ))}
          </ul>
          <form
            className="ops-invite"
            onSubmit={(event) => {
              event.preventDefault();
              void createOpsStaff(invite)
                .then(() => listOpsStaff().then(setTeam))
                .catch((caught: unknown) => {
                  setError(caught instanceof Error ? caught.message : "Invite failed.");
                });
            }}
          >
            <input
              onChange={(event) => setInvite({ ...invite, name: event.target.value })}
              placeholder="Name"
              value={invite.name}
            />
            <input
              onChange={(event) => setInvite({ ...invite, email: event.target.value })}
              placeholder="Email"
              type="email"
              value={invite.email}
            />
            <input
              onChange={(event) =>
                setInvite({ ...invite, password: event.target.value })
              }
              placeholder="Temp password"
              type="password"
              value={invite.password}
            />
            <select
              onChange={(event) =>
                setInvite({
                  ...invite,
                  role: event.target.value as "viewer" | "oncall",
                })
              }
              value={invite.role}
            >
              <option value="viewer">viewer</option>
              <option value="oncall">oncall</option>
            </select>
            <button className="control" type="submit">
              Add staff
            </button>
          </form>
        </section>
      ) : null}
    </div>
  );
}
