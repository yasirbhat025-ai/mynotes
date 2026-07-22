import React, { useEffect, useState } from "react";
import { restoreSession, loginOrCreate, logout, currentUserId } from "./auth.js";
import { setSyncUserId } from "./storage-shim.js";

export default function LoginGate({ children }) {
  const [status, setStatus] = useState("checking"); // checking | loggedOut | loggedIn
  const [username, setUsername] = useState("");
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    restoreSession().then(async (name) => {
      if (name) {
        setSyncUserId(await currentUserId());
        setUsername(name);
        setStatus("loggedIn");
      } else {
        setStatus("loggedOut");
      }
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const name = await loginOrCreate(input);
      setSyncUserId(await currentUserId());
      setUsername(name);
      setStatus("loggedIn");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "checking") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif", color: "#647573" }}>
        Loading…
      </div>
    );
  }

  if (status === "loggedOut") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#F5F6F3", fontFamily: "sans-serif", padding: 20 }}>
        <form onSubmit={submit} style={{ background: "#fff", padding: 28, borderRadius: 16, width: "100%", maxWidth: 320, boxShadow: "0 8px 24px rgba(20,40,38,0.08)" }}>
          <h1 style={{ fontSize: 20, marginBottom: 4, fontWeight: 700 }}>MedNotebook</h1>
          <p style={{ fontSize: 13, color: "#647573", marginBottom: 16, lineHeight: 1.5 }}>
            Enter a username. New username → creates your account. Existing one → logs you
            in, on any device.
          </p>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Username"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #E1E6E2", marginBottom: 10, fontSize: 14, boxSizing: "border-box" }}
          />
          {error && <div style={{ color: "#B4485E", fontSize: 12.5, marginBottom: 10 }}>{error}</div>}
          <button
            type="submit"
            disabled={busy}
            style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "none", background: "#0E7C74", color: "#fff", fontWeight: 600, cursor: "pointer", fontSize: 14 }}
          >
            {busy ? "Please wait…" : "Continue"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <>
      {children}
      <button
        onClick={async () => {
          await logout();
          window.location.reload();
        }}
        title={`Logged in as ${username} — tap to log out`}
        style={{
          position: "fixed", bottom: 10, right: 10, zIndex: 1000, fontSize: 11,
          padding: "6px 10px", borderRadius: 20, border: "1px solid #E1E6E2",
          background: "#fff", color: "#647573", cursor: "pointer", opacity: 0.85,
        }}
      >
        {username} · Log out
      </button>
    </>
  );
}
