import React, { useState, useEffect, useRef, useCallback, useMemo, createContext, useContext } from "react";
import {
  Stethoscope, BookOpen, FolderOpen, FileText, Search, Plus, Pin, PinOff,
  Star, Trash2, Pencil, Sun, Moon, Monitor, Download, ChevronRight,
  ChevronLeft, X, Bold, Italic, Underline, Strikethrough, Highlighter,
  List, ListOrdered, CheckSquare, Quote, Minus, Image as ImageIcon,
  ArrowLeft, Menu, Clock, Check, AlignLeft, Heading2, Palette, PenTool,
  Link2, Table as TableIcon, Upload, ChevronDown, ChevronUp, Feather, Printer, Share2, Crosshair
} from "lucide-react";

/* ---------------------------------------------------------------------
   MedNotebook — an offline-style study notebook for medical students.
   Data model: notebooks -> subjects -> chapters -> notes.
   Everything persists via window.storage under a single key.
------------------------------------------------------------------------ */

const DB_KEY = "mednotebook-db";
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const now = () => Date.now();

const NOTEBOOK_COLORS = [
  { name: "Teal", hex: "#0E7C74" },
  { name: "Blue", hex: "#2F6690" },
  { name: "Emerald", hex: "#10925F" },
  { name: "Amber", hex: "#B4791F" },
  { name: "Rose", hex: "#B4485E" },
  { name: "Violet", hex: "#6E5DA6" },
  { name: "Slate", hex: "#5B6B6A" },
];

const HIGHLIGHTS = [
  { name: "Yellow", hex: "#FCE38A" },
  { name: "Green", hex: "#B7E4C7" },
  { name: "Pink", hex: "#F7C6D9" },
  { name: "Blue", hex: "#BFDBFE" },
  { name: "Orange", hex: "#FBD3A2" },
  { name: "Purple", hex: "#DCC6F0" },
];

const emptyDB = () => ({
  notebooks: [],
  subjects: [],
  chapters: [],
  notes: [],
  settings: { theme: "system", fontSize: "md" },
});

/* ---------------- Theme ---------------- */

const ThemeCtx = createContext(null);
const useT = () => useContext(ThemeCtx);

function buildTokens(mode) {
  if (mode === "dark") {
    return {
      mode,
      bg: "#0D1615",
      card: "#152220",
      cardAlt: "#1B2B29",
      border: "#263735",
      text: "#E9F0EE",
      muted: "#8FA3A0",
      teal: "#3FBDAE",
      blue: "#6FA8D6",
      emerald: "#4ED497",
      shadow: "0 8px 24px rgba(0,0,0,0.35)",
    };
  }
  return {
    mode,
    bg: "#F5F6F3",
    card: "#FFFFFF",
    cardAlt: "#F0F3F1",
    border: "#E1E6E2",
    text: "#182422",
    muted: "#647573",
    teal: "#0E7C74",
    blue: "#2F6690",
    emerald: "#10925F",
    shadow: "0 8px 24px rgba(20,40,38,0.08)",
  };
}

/* ---------------- Storage helpers ---------------- */

async function loadDB() {
  try {
    const res = await window.storage.get(DB_KEY, false);
    if (res && res.value) {
      const parsed = JSON.parse(res.value);
      return { ...emptyDB(), ...parsed };
    }
  } catch (e) {
    /* no existing data yet */
  }
  return emptyDB();
}

async function saveDB(db) {
  try {
    await window.storage.set(DB_KEY, JSON.stringify(db), false);
    return true;
  } catch (e) {
    console.error("Save failed", e);
    return false;
  }
}

/* ---------------- Small utilities ---------------- */

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function reorderList(list, draggedId, targetId) {
  const arr = [...list];
  const from = arr.findIndex((i) => i.id === draggedId);
  const to = arr.findIndex((i) => i.id === targetId);
  if (from === -1 || to === -1 || from === to) return arr;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return arr.map((it, idx) => ({ ...it, order: idx }));
}

function resolveNoteView(db, noteId) {
  const note = db.notes.find((n) => n.id === noteId);
  if (!note) return null;
  const chapter = db.chapters.find((c) => c.id === note.chapterId);
  const subject = db.subjects.find((s) => s.id === chapter?.subjectId);
  return { level: "note", noteId: note.id, chapterId: chapter?.id, subjectId: subject?.id, notebookId: subject?.notebookId };
}

function findTextMatches(root, query) {
  if (!root || !query) return [];
  const q = query.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const matches = [];
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.toLowerCase();
    let idx = 0;
    while ((idx = text.indexOf(q, idx)) !== -1) {
      matches.push({ node, start: idx, end: idx + q.length });
      idx += q.length;
    }
  }
  return matches;
}

function stripHtml(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  return d.textContent || "";
}

function wordCount(html) {
  const t = stripHtml(html).trim();
  return t ? t.split(/\s+/).length : 0;
}

function fmtDate(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now_ = new Date();
  const sameYear = d.getFullYear() === now_.getFullYear();
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

function timeAgo(ts) {
  const s = Math.floor((now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d ago`;
  return fmtDate(ts);
}

function download(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function htmlToMarkdown(html) {
  const d = document.createElement("div");
  d.innerHTML = html || "";
  let out = "";
  const walk = (node) => {
    node.childNodes.forEach((n) => {
      if (n.nodeType === 3) {
        out += n.textContent;
      } else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (tag === "strong" || tag === "b") { out += "**"; walk(n); out += "**"; }
        else if (tag === "em" || tag === "i") { out += "_"; walk(n); out += "_"; }
        else if (tag === "u") { walk(n); }
        else if (tag === "s" || tag === "strike") { out += "~~"; walk(n); out += "~~"; }
        else if (tag === "h1") { out += "\n# "; walk(n); out += "\n"; }
        else if (tag === "h2") { out += "\n## "; walk(n); out += "\n"; }
        else if (tag === "blockquote") { out += "\n> "; walk(n); out += "\n"; }
        else if (tag === "li") { out += "\n- "; walk(n); }
        else if (tag === "hr") { out += "\n---\n"; }
        else if (tag === "br" || tag === "div" || tag === "p") { walk(n); out += "\n"; }
        else { walk(n); }
      }
    });
  };
  walk(d);
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/* ---------------- Root App ---------------- */

export default function MedNotebookApp() {
  const [db, setDb] = useState(null);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [view, setView] = useState({ level: "home" });
  const [query, setQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const [confirm, setConfirm] = useState(null); // {message, onConfirm}
  const [systemDark, setSystemDark] = useState(
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : false
  );

  const saveTimer = useRef(null);

  useEffect(() => {
    loadDB().then((d) => {
      setDb(d);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const fn = (e) => setSystemDark(e.matches);
    mq.addEventListener?.("change", fn);
    return () => mq.removeEventListener?.("change", fn);
  }, []);

  const persist = useCallback((nextDb) => {
    setDb(nextDb);
    setSaving(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await saveDB(nextDb);
      setSaving(false);
    }, 500);
  }, []);

  const mode =
    db?.settings?.theme === "dark"
      ? "dark"
      : db?.settings?.theme === "light"
      ? "light"
      : systemDark
      ? "dark"
      : "light";
  const T = useMemo(() => buildTokens(mode), [mode]);

  if (!ready || !db) {
    return (
      <div style={{ minHeight: "100vh", background: "#F5F6F3", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, fontFamily: "'IBM Plex Sans', sans-serif", color: "#647573" }}>
          <PulseMark color="#0E7C74" />
          <span style={{ fontSize: 13, letterSpacing: 0.3 }}>Opening your notebook…</span>
        </div>
      </div>
    );
  }

  return (
    <ThemeCtx.Provider value={T}>
      <GlobalStyle T={T} />
      <div
        style={{
          minHeight: "100vh",
          background: T.bg,
          color: T.text,
          fontFamily: "'IBM Plex Sans', sans-serif",
          display: "flex",
          "--ink-color": T.mode === "dark" ? "#9FB3E8" : "#26326B",
        }}
      >
        <Sidebar
          db={db}
          persist={persist}
          view={view}
          setView={setView}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          mobileSidebar={mobileSidebar}
          setMobileSidebar={setMobileSidebar}
          setConfirm={setConfirm}
        />
        <MainArea
          db={db}
          persist={persist}
          view={view}
          setView={setView}
          query={query}
          setQuery={setQuery}
          saving={saving}
          setMobileSidebar={setMobileSidebar}
          setConfirm={setConfirm}
        />
      </div>
      {confirm && <ConfirmDialog confirm={confirm} setConfirm={setConfirm} />}
    </ThemeCtx.Provider>
  );
}

/* ---------------- Signature: pulse / ECG mark ---------------- */

function PulseMark({ color = "#0E7C74", width = 64, animate = true }) {
  return (
    <svg width={width} height={width * 0.28} viewBox="0 0 160 44" fill="none">
      <path
        d="M0 22 H40 L48 6 L58 38 L66 22 L74 30 L80 22 H160"
        stroke={color}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={animate ? "pulse-line" : ""}
      />
    </svg>
  );
}

function GlobalStyle({ T }) {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=Kalam:wght@400;700&display=swap');
      .handwritten-run { font-family: 'Kalam', cursive; font-size: 1.18em; line-height: 1.75; color: var(--ink-color, #26326B); }
      * { box-sizing: border-box; }
      body { margin: 0; }
      .display-font { font-family: 'Fraunces', serif; }
      .mono-font { font-family: 'IBM Plex Mono', monospace; }
      .pulse-line {
        stroke-dasharray: 400;
        stroke-dashoffset: 400;
        animation: draw 1.6s ease-out infinite;
      }
      @keyframes draw {
        0% { stroke-dashoffset: 400; opacity: 0.3; }
        60% { stroke-dashoffset: 0; opacity: 1; }
        100% { stroke-dashoffset: 0; opacity: 0.3; }
      }
      @media (prefers-reduced-motion: reduce) {
        .pulse-line { animation: none; stroke-dashoffset: 0; opacity: 1; }
        * { transition: none !important; }
      }
      @media print {
        .no-print { display: none !important; }
        body, html { background: #fff !important; }
        .editor-area { color: #111 !important; font-size: 13px; }
        .handwritten-run { color: #26326B !important; }
      }
      @keyframes laserFade {
        0% { background: #FF6B57; box-shadow: 0 0 14px 3px rgba(255,107,87,0.85); }
        65% { background: #FF6B57; box-shadow: 0 0 14px 3px rgba(255,107,87,0.45); }
        100% { background: transparent; box-shadow: none; }
      }
      .laser-flash { border-radius: 3px; padding: 0 1px; animation: laserFade 2.2s ease forwards; }
      ::selection { background: ${T.teal}33; }
      .scroll-thin::-webkit-scrollbar { width: 8px; height: 8px; }
      .scroll-thin::-webkit-scrollbar-thumb { background: ${T.border}; border-radius: 8px; }
      .scroll-thin::-webkit-scrollbar-track { background: transparent; }
      .editor-area { outline: none; line-height: 1.7; font-size: 16px; }
      .editor-area h2 { font-family: 'Fraunces', serif; font-size: 22px; margin: 18px 0 8px; }
      .editor-area blockquote { border-left: 3px solid ${T.teal}; margin: 10px 0; padding: 4px 14px; color: ${T.muted}; font-style: italic; }
      .editor-area hr { border: none; border-top: 1px solid ${T.border}; margin: 18px 0; }
      .editor-area ul, .editor-area ol { padding-left: 22px; }
      .editor-area img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
      .editor-area .chk-item { display: flex; align-items: flex-start; gap: 8px; margin: 4px 0; }
      .editor-area p:empty::before { content: ''; display: inline-block; }
      .editor-area .note-link { display: inline-flex; align-items: center; gap: 4px; background: ${T.teal}1A; color: ${T.teal}; padding: 1px 8px 1px 6px; border-radius: 999px; text-decoration: none; font-size: 0.9em; font-weight: 600; cursor: pointer; }
      .editor-area table.note-table { border-collapse: collapse; margin: 10px 0; width: 100%; }
      .editor-area table.note-table td { border: 1px solid ${T.border}; padding: 6px 10px; min-width: 60px; vertical-align: top; }
      .drag-row { cursor: grab; }
      .drag-row:active { cursor: grabbing; }
      .drag-over { outline: 2px dashed ${T.teal}; outline-offset: 2px; }
      input[type=checkbox] { accent-color: ${T.teal}; }
      .card-hover { transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease; }
      .card-hover:hover { transform: translateY(-2px); border-color: ${T.teal}55; }
      button { font-family: inherit; }
      .focus-ring:focus-visible { outline: 2px solid ${T.teal}; outline-offset: 2px; }
    `}</style>
  );
}

/* ---------------- Confirm dialog ---------------- */

function ConfirmDialog({ confirm, setConfirm }) {
  const T = useT();
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,16,15,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}
      onClick={() => setConfirm(null)}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: T.card, borderRadius: 16, padding: 24, width: 320, boxShadow: T.shadow, border: `1px solid ${T.border}` }}
      >
        <div style={{ fontSize: 15, marginBottom: 18, color: T.text, lineHeight: 1.5 }}>{confirm.message}</div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button className="focus-ring" onClick={() => setConfirm(null)}
            style={{ padding: "8px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", fontSize: 13 }}>
            Cancel
          </button>
          <button className="focus-ring" onClick={() => { confirm.onConfirm(); setConfirm(null); }}
            style={{ padding: "8px 14px", borderRadius: 10, border: "none", background: "#B4485E", color: "#fff", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sidebar ---------------- */

function Sidebar({ db, persist, view, setView, sidebarOpen, setSidebarOpen, mobileSidebar, setMobileSidebar, setConfirm }) {
  const T = useT();
  const [editingId, setEditingId] = useState(null);
  const [draftName, setDraftName] = useState("");

  const addNotebook = () => {
    const nb = { id: uid(), name: "New Notebook", color: NOTEBOOK_COLORS[0].hex, pinned: false, createdAt: now(), order: now() };
    persist({ ...db, notebooks: [nb, ...db.notebooks] });
    setEditingId(nb.id);
    setDraftName(nb.name);
    setView({ level: "notebook", notebookId: nb.id });
  };

  const commitRename = (id) => {
    if (!draftName.trim()) { setEditingId(null); return; }
    persist({ ...db, notebooks: db.notebooks.map((n) => (n.id === id ? { ...n, name: draftName.trim() } : n)) });
    setEditingId(null);
  };

  const togglePin = (id) => {
    persist({ ...db, notebooks: db.notebooks.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)) });
  };

  const setColor = (id, hex) => {
    persist({ ...db, notebooks: db.notebooks.map((n) => (n.id === id ? { ...n, color: hex } : n)) });
  };

  const deleteNotebook = (id) => {
    setConfirm({
      message: "Delete this notebook and everything inside it? This can't be undone.",
      onConfirm: () => {
        const subjIds = db.subjects.filter((s) => s.notebookId === id).map((s) => s.id);
        const chapIds = db.chapters.filter((c) => subjIds.includes(c.subjectId)).map((c) => c.id);
        persist({
          ...db,
          notebooks: db.notebooks.filter((n) => n.id !== id),
          subjects: db.subjects.filter((s) => s.notebookId !== id),
          chapters: db.chapters.filter((c) => !subjIds.includes(c.subjectId)),
          notes: db.notes.filter((n) => !chapIds.includes(n.chapterId)),
        });
        if (view.notebookId === id) setView({ level: "home" });
      },
    });
  };

  const sorted = [...db.notebooks].sort((a, b) => (b.pinned - a.pinned) || (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const onDrop = (targetId) => {
    if (dragId && dragId !== targetId) {
      const reordered = reorderList(sorted, dragId, targetId);
      persist({ ...db, notebooks: db.notebooks.map((n) => reordered.find((r) => r.id === n.id) ? { ...n, order: reordered.find((r) => r.id === n.id).order } : n) });
    }
    setDragId(null); setOverId(null);
  };

  const content = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "20px 18px 14px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
        onClick={() => { setView({ level: "home" }); setMobileSidebar(false); }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: T.teal, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Stethoscope size={18} color="#fff" />
        </div>
        <div>
          <div className="display-font" style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.1 }}>MedNotebook</div>
          <div className="mono-font" style={{ fontSize: 10, color: T.muted, letterSpacing: 0.5 }}>OFFLINE · NO ACCOUNT</div>
        </div>
      </div>

      <div style={{ padding: "0 14px" }}>
        <button
          className="focus-ring"
          onClick={addNotebook}
          style={{
            width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            padding: "10px 12px", borderRadius: 12, border: "none", background: T.teal, color: "#fff",
            fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 6,
          }}
        >
          <Plus size={15} /> New Notebook
        </button>
      </div>

      <div className="scroll-thin" style={{ flex: 1, overflowY: "auto", padding: "10px 10px 10px" }}>
        {sorted.length === 0 && (
          <div style={{ color: T.muted, fontSize: 12.5, padding: "16px 10px", lineHeight: 1.6 }}>
            No notebooks yet. Create one for each semester or subject block.
          </div>
        )}
        {sorted.map((nb) => {
          const active = view.notebookId === nb.id;
          return (
            <div key={nb.id} style={{ marginBottom: 3 }}>
              <div
                onClick={() => { setView({ level: "notebook", notebookId: nb.id }); setMobileSidebar(false); }}
                draggable
                onDragStart={() => setDragId(nb.id)}
                onDragOver={(e) => { e.preventDefault(); setOverId(nb.id); }}
                onDragLeave={() => setOverId((o) => (o === nb.id ? null : o))}
                onDrop={(e) => { e.preventDefault(); onDrop(nb.id); }}
                onDragEnd={() => { setDragId(null); setOverId(null); }}
                className={overId === nb.id && dragId && dragId !== nb.id ? "drag-row drag-over" : "drag-row"}
                style={{
                  display: "flex", alignItems: "center", gap: 9, padding: "8px 10px", borderRadius: 10,
                  cursor: "pointer", background: active ? T.cardAlt : "transparent", group: "row",
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: nb.color, flexShrink: 0 }} />
                {editingId === nb.id ? (
                  <input
                    autoFocus
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    onBlur={() => commitRename(nb.id)}
                    onKeyDown={(e) => { if (e.key === "Enter") commitRename(nb.id); if (e.key === "Escape") setEditingId(null); }}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flex: 1, fontSize: 13.5, border: `1px solid ${T.teal}`, borderRadius: 6, padding: "2px 6px", background: T.card, color: T.text }}
                  />
                ) : (
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: active ? 600 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {nb.name}
                  </span>
                )}
                {nb.pinned && <Pin size={12} color={T.muted} fill={T.muted} />}
              </div>
              {active && (
                <div style={{ display: "flex", gap: 4, padding: "4px 10px 8px 27px", flexWrap: "wrap" }}>
                  <IconBtn title="Rename" onClick={() => { setEditingId(nb.id); setDraftName(nb.name); }}><Pencil size={12} /></IconBtn>
                  <IconBtn title={nb.pinned ? "Unpin" : "Pin"} onClick={() => togglePin(nb.id)}>{nb.pinned ? <PinOff size={12} /> : <Pin size={12} />}</IconBtn>
                  <div style={{ position: "relative" }}>
                    <ColorPicker current={nb.color} onPick={(hex) => setColor(nb.id, hex)} />
                  </div>
                  <IconBtn title="Delete" danger onClick={() => deleteNotebook(nb.id)}><Trash2 size={12} /></IconBtn>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <SettingsBlock db={db} persist={persist} setConfirm={setConfirm} />
    </div>
  );

  return (
    <>
      <div
        className="scroll-thin no-print"
        style={{
          width: sidebarOpen ? 258 : 0, flexShrink: 0, borderRight: `1px solid ${T.border}`,
          background: T.card, transition: "width 0.18s ease", overflow: "hidden",
          display: window.innerWidth < 820 ? "none" : "block", height: "100vh", position: "sticky", top: 0,
        }}
      >
        {sidebarOpen && content}
      </div>

      {mobileSidebar && (
        <div style={{ position: "fixed", inset: 0, zIndex: 90, display: window.innerWidth < 820 ? "block" : "none" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }} onClick={() => setMobileSidebar(false)} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 270, background: T.card }}>{content}</div>
        </div>
      )}
    </>
  );
}

function IconBtn({ children, onClick, title, danger }) {
  const T = useT();
  return (
    <button
      className="focus-ring"
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center", width: 24, height: 24, borderRadius: 7,
        border: `1px solid ${T.border}`, background: T.card, color: danger ? "#B4485E" : T.muted, cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function ColorPicker({ current, onPick }) {
  const T = useT();
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <button className="focus-ring" title="Color" onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        style={{ width: 24, height: 24, borderRadius: 7, border: `1px solid ${T.border}`, background: T.card, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Palette size={12} color={T.muted} />
      </button>
      {open && (
        <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 28, left: 0, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6, zIndex: 20, boxShadow: T.shadow }}>
          {NOTEBOOK_COLORS.map((c) => (
            <button key={c.hex} onClick={() => { onPick(c.hex); setOpen(false); }} title={c.name}
              style={{ width: 20, height: 20, borderRadius: 6, background: c.hex, border: current === c.hex ? `2px solid ${T.text}` : "none", cursor: "pointer" }} />
          ))}
        </div>
      )}
    </div>
  );
}

function SettingsBlock({ db, persist, setConfirm }) {
  const T = useT();
  const theme = db.settings.theme;
  const setTheme = (v) => persist({ ...db, settings: { ...db.settings, theme: v } });
  const [restoreError, setRestoreError] = useState("");

  const backupAll = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    download(`mednotebook-backup-${stamp}.json`, JSON.stringify(db, null, 2));
  };

  const restoreFile = (file) => {
    setRestoreError("");
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed || !Array.isArray(parsed.notebooks) || !Array.isArray(parsed.notes) || !Array.isArray(parsed.subjects) || !Array.isArray(parsed.chapters)) {
          setRestoreError("That file doesn't look like a MedNotebook backup.");
          return;
        }
        setConfirm({
          message: "Restore this backup? It will replace everything currently in MedNotebook on this device.",
          onConfirm: () => persist({ ...emptyDB(), ...parsed, settings: { ...db.settings, ...parsed.settings } }),
        });
      } catch (e) {
        setRestoreError("Couldn't read that file — make sure it's a MedNotebook backup JSON.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div style={{ padding: 14, borderTop: `1px solid ${T.border}` }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span className="mono-font" style={{ fontSize: 10, color: T.muted, letterSpacing: 0.5 }}>THEME</span>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { v: "light", icon: <Sun size={13} /> },
            { v: "dark", icon: <Moon size={13} /> },
            { v: "system", icon: <Monitor size={13} /> },
          ].map((o) => (
            <button key={o.v} className="focus-ring" onClick={() => setTheme(o.v)}
              style={{
                width: 26, height: 26, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${theme === o.v ? T.teal : T.border}`, background: theme === o.v ? `${T.teal}1A` : "transparent",
                color: theme === o.v ? T.teal : T.muted, cursor: "pointer",
              }}>
              {o.icon}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span className="mono-font" style={{ fontSize: 10, color: T.muted, letterSpacing: 0.5 }}>DATA</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button className="focus-ring" title="Download a backup of everything" onClick={backupAll}
            style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Download size={13} />
          </button>
          <label title="Restore from a backup file" style={{ width: 26, height: 26, borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Upload size={13} />
            <input type="file" accept="application/json" hidden onChange={(e) => { if (e.target.files[0]) restoreFile(e.target.files[0]); e.target.value = ""; }} />
          </label>
        </div>
      </div>
      {restoreError && <div style={{ fontSize: 11, color: "#B4485E", marginTop: 8, lineHeight: 1.5 }}>{restoreError}</div>}
    </div>
  );
}

/* ---------------- Main Area router ---------------- */

function MainArea({ db, persist, view, setView, query, setQuery, saving, setMobileSidebar, setConfirm }) {
  const T = useT();

  const notebook = db.notebooks.find((n) => n.id === view.notebookId);
  const subject = db.subjects.find((s) => s.id === view.subjectId);
  const chapter = db.chapters.find((c) => c.id === view.chapterId);

  return (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100vh" }}>
      <TopBar
        db={db} view={view} setView={setView} query={query} setQuery={setQuery}
        saving={saving} setMobileSidebar={setMobileSidebar}
        notebook={notebook} subject={subject} chapter={chapter}
      />
      <div className="scroll-thin" style={{ flex: 1, overflowY: "auto" }}>
        {query.trim() ? (
          <SearchResults db={db} query={query} setView={setView} setQuery={setQuery} />
        ) : view.level === "home" ? (
          <HomeView db={db} persist={persist} setView={setView} />
        ) : view.level === "notebook" && notebook ? (
          <NotebookView db={db} persist={persist} notebook={notebook} setView={setView} setConfirm={setConfirm} />
        ) : view.level === "subject" && subject ? (
          <SubjectView db={db} persist={persist} subject={subject} setView={setView} setConfirm={setConfirm} />
        ) : view.level === "chapter" && chapter ? (
          <ChapterView db={db} persist={persist} chapter={chapter} setView={setView} setConfirm={setConfirm} />
        ) : view.level === "note" ? (
          <NoteEditorView db={db} persist={persist} noteId={view.noteId} setView={setView} chapter={chapter} />
        ) : (
          <HomeView db={db} persist={persist} setView={setView} />
        )}
      </div>
    </div>
  );
}

function TopBar({ db, view, setView, query, setQuery, saving, setMobileSidebar, notebook, subject, chapter }) {
  const T = useT();
  const crumbs = [];
  crumbs.push({ label: "Home", onClick: () => setView({ level: "home" }) });
  if (notebook) crumbs.push({ label: notebook.name, onClick: () => setView({ level: "notebook", notebookId: notebook.id }) });
  if (subject) crumbs.push({ label: subject.name, onClick: () => setView({ level: "subject", notebookId: notebook.id, subjectId: subject.id }) });
  if (chapter) crumbs.push({ label: chapter.name, onClick: () => setView({ level: "chapter", notebookId: notebook.id, subjectId: subject.id, chapterId: chapter.id }) });
  if (view.level === "note") crumbs.push({ label: "Note" });

  return (
    <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: `1px solid ${T.border}`, background: T.card, flexWrap: "wrap" }}>
      <button className="focus-ring" onClick={() => setMobileSidebar(true)}
        style={{ display: window.innerWidth < 820 ? "flex" : "none", border: "none", background: "transparent", cursor: "pointer", color: T.text }}>
        <Menu size={20} />
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", flex: 1, minWidth: 120 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <ChevronRight size={13} color={T.muted} />}
            <button className="focus-ring" onClick={c.onClick} disabled={!c.onClick}
              style={{ border: "none", background: "transparent", cursor: c.onClick ? "pointer" : "default", color: i === crumbs.length - 1 ? T.text : T.muted, fontSize: 13.5, fontWeight: i === crumbs.length - 1 ? 600 : 500, padding: "3px 4px" }}>
              {c.label}
            </button>
          </span>
        ))}
      </div>

      <div style={{ position: "relative", width: 240, maxWidth: "40vw" }}>
        <Search size={14} color={T.muted} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }} />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search everything…"
          className="focus-ring"
          style={{ width: "100%", padding: "8px 10px 8px 30px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 13 }}
        />
        {query && (
          <button onClick={() => setQuery("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", border: "none", background: "transparent", cursor: "pointer", color: T.muted }}>
            <X size={13} />
          </button>
        )}
      </div>

      <span className="mono-font" style={{ fontSize: 10.5, color: T.muted, letterSpacing: 0.4, minWidth: 70, textAlign: "right" }}>
        {saving ? "SAVING…" : "SAVED"}
      </span>
    </div>
  );
}

/* ---------------- Home ---------------- */

function HomeView({ db, persist, setView }) {
  const T = useT();
  const [homeDragId, setHomeDragId] = useState(null);
  const recent = [...db.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
  const pinnedNotes = db.notes.filter((n) => n.pinned).slice(0, 6);
  const favNotes = db.notes.filter((n) => n.favorite).slice(0, 6);
  const notebooksSorted = [...db.notebooks].sort((a, b) => (b.pinned - a.pinned) || (a.order ?? a.createdAt) - (b.order ?? b.createdAt));

  const openNote = (note) => {
    const chapter = db.chapters.find((c) => c.id === note.chapterId);
    const subject = db.subjects.find((s) => s.id === chapter?.subjectId);
    setView({ level: "note", noteId: note.id, chapterId: chapter?.id, subjectId: subject?.id, notebookId: subject?.notebookId });
  };

  const addNotebook = () => {
    const nb = { id: uid(), name: "New Notebook", color: NOTEBOOK_COLORS[0].hex, pinned: false, createdAt: now(), order: now() };
    persist({ ...db, notebooks: [nb, ...db.notebooks] });
    setView({ level: "notebook", notebookId: nb.id });
  };

  return (
    <div style={{ padding: "32px 28px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div className="mono-font" style={{ fontSize: 11, color: T.teal, letterSpacing: 1, marginBottom: 6 }}>MY WARD, MY NOTES</div>
          <h1 className="display-font" style={{ fontSize: 34, fontWeight: 600, margin: 0 }}>My Medical Notes</h1>
        </div>
        <PulseMark color={T.teal} width={90} />
      </div>
      <p style={{ color: T.muted, fontSize: 14, maxWidth: 520, marginTop: 6 }}>
        Everything you paste from lectures, textbooks, or an AI chat lives here — organized by notebook, subject and chapter, stored only on this device.
      </p>

      {db.notebooks.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={26} color={T.teal} />}
          title="No notebooks yet"
          body="Start with one for this semester — you can split it into subjects and chapters as you go."
          actionLabel="Create your first notebook"
          onAction={addNotebook}
        />
      ) : (
        <>
          {recent.length > 0 && (
            <Section title="Recent" icon={<Clock size={14} />}>
              <CardRow>
                {recent.map((n) => <NoteCard key={n.id} note={n} db={db} onClick={() => openNote(n)} />)}
              </CardRow>
            </Section>
          )}

          {pinnedNotes.length > 0 && (
            <Section title="Pinned" icon={<Pin size={14} />}>
              <CardRow>
                {pinnedNotes.map((n) => <NoteCard key={n.id} note={n} db={db} onClick={() => openNote(n)} />)}
              </CardRow>
            </Section>
          )}

          {favNotes.length > 0 && (
            <Section title="Favourites" icon={<Star size={14} />}>
              <CardRow>
                {favNotes.map((n) => <NoteCard key={n.id} note={n} db={db} onClick={() => openNote(n)} />)}
              </CardRow>
            </Section>
          )}

          <Section title="Notebooks" icon={<BookOpen size={14} />} action={
            <button className="focus-ring" onClick={addNotebook} style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: T.teal, cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}>
              <Plus size={13} /> New
            </button>
          }>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
              {notebooksSorted.map((nb) => {
                const subjCount = db.subjects.filter((s) => s.notebookId === nb.id).length;
                return (
                  <div key={nb.id} className="card-hover drag-row" onClick={() => setView({ level: "notebook", notebookId: nb.id })}
                    draggable
                    onDragStart={() => setHomeDragId(nb.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (homeDragId && homeDragId !== nb.id) {
                        const reordered = reorderList(notebooksSorted, homeDragId, nb.id);
                        persist({ ...db, notebooks: db.notebooks.map((n) => { const u = reordered.find((r) => r.id === n.id); return u ? { ...n, order: u.order } : n; }) });
                      }
                      setHomeDragId(null);
                    }}
                    onDragEnd={() => setHomeDragId(null)}
                    style={{ cursor: "pointer", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: `${nb.color}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <BookOpen size={15} color={nb.color} />
                      </div>
                      {nb.pinned && <Pin size={12} color={T.muted} fill={T.muted} style={{ marginLeft: "auto" }} />}
                    </div>
                    <div style={{ fontWeight: 600, fontSize: 14.5, marginBottom: 3 }}>{nb.name}</div>
                    <div className="mono-font" style={{ fontSize: 11, color: T.muted }}>{subjCount} subject{subjCount !== 1 ? "s" : ""}</div>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, icon, children, action }) {
  const T = useT();
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted }}>
          {icon}
          <span className="mono-font" style={{ fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" }}>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function CardRow({ children }) {
  return <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }} className="scroll-thin">{children}</div>;
}

function NoteCard({ note, db, onClick }) {
  const T = useT();
  const chapter = db.chapters.find((c) => c.id === note.chapterId);
  const subject = db.subjects.find((s) => s.id === chapter?.subjectId);
  return (
    <div className="card-hover" onClick={onClick}
      style={{ cursor: "pointer", minWidth: 200, maxWidth: 200, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 14, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <FileText size={13} color={T.teal} />
        {note.pinned && <Pin size={11} color={T.muted} />}
        {note.favorite && <Star size={11} color="#B4791F" fill="#B4791F" />}
      </div>
      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
        {note.title || "Untitled note"}
      </div>
      <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 8, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {stripHtml(note.html).slice(0, 60) || "No content yet"}
      </div>
      <div className="mono-font" style={{ fontSize: 10, color: T.muted, display: "flex", justifyContent: "space-between" }}>
        <span>{subject?.name || "—"}</span>
        <span>{timeAgo(note.updatedAt)}</span>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, actionLabel, onAction }) {
  const T = useT();
  return (
    <div style={{ marginTop: 40, textAlign: "center", padding: "40px 20px", border: `1px dashed ${T.border}`, borderRadius: 18, maxWidth: 460 }}>
      <div style={{ width: 52, height: 52, borderRadius: 14, background: `${T.teal}1A`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
        {icon}
      </div>
      <div className="display-font" style={{ fontSize: 18, fontWeight: 600, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13, color: T.muted, marginBottom: 18, lineHeight: 1.6 }}>{body}</div>
      {actionLabel && (
        <button className="focus-ring" onClick={onAction}
          style={{ padding: "9px 16px", borderRadius: 10, border: "none", background: T.teal, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ---------------- Search ---------------- */

function SearchResults({ db, query, setView, setQuery }) {
  const T = useT();
  const q = query.trim().toLowerCase();

  const notes = db.notes.filter((n) => n.title.toLowerCase().includes(q) || stripHtml(n.html).toLowerCase().includes(q));
  const subjects = db.subjects.filter((s) => s.name.toLowerCase().includes(q));
  const chapters = db.chapters.filter((c) => c.name.toLowerCase().includes(q));
  const notebooks = db.notebooks.filter((n) => n.name.toLowerCase().includes(q));

  const openNote = (note) => {
    const chapter = db.chapters.find((c) => c.id === note.chapterId);
    const subject = db.subjects.find((s) => s.id === chapter?.subjectId);
    setView({ level: "note", noteId: note.id, chapterId: chapter?.id, subjectId: subject?.id, notebookId: subject?.notebookId });
    setQuery("");
  };

  const total = notes.length + subjects.length + chapters.length + notebooks.length;

  const highlight = (text) => {
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <mark style={{ background: "#FCE38A", color: "#182422", padding: "0 1px", borderRadius: 3 }}>{text.slice(idx, idx + q.length)}</mark>
        {text.slice(idx + q.length)}
      </>
    );
  };

  return (
    <div style={{ padding: "28px", maxWidth: 800, margin: "0 auto" }}>
      <div className="mono-font" style={{ fontSize: 11, color: T.muted, marginBottom: 16, letterSpacing: 0.4 }}>
        {total} RESULT{total !== 1 ? "S" : ""} FOR "{query}"
      </div>
      {total === 0 && <div style={{ color: T.muted, fontSize: 13.5 }}>Nothing matches. Try a different term.</div>}

      {notes.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>Notes</div>
          {notes.map((n) => (
            <div key={n.id} onClick={() => openNote(n)} className="card-hover"
              style={{ cursor: "pointer", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 6, background: T.card }}>
              <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 2 }}>{highlight(n.title || "Untitled note")}</div>
              <div style={{ fontSize: 12, color: T.muted }}>{highlight(stripHtml(n.html).slice(0, 90))}</div>
            </div>
          ))}
        </div>
      )}
      {[
        { label: "Chapters", items: chapters, icon: <FolderOpen size={13} /> },
        { label: "Subjects", items: subjects, icon: <BookOpen size={13} /> },
        { label: "Notebooks", items: notebooks, icon: <BookOpen size={13} /> },
      ].map((group) =>
        group.items.length > 0 ? (
          <div key={group.label} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.muted, marginBottom: 8 }}>{group.label}</div>
            {group.items.map((it) => (
              <div key={it.id} onClick={() => {
                if (group.label === "Notebooks") setView({ level: "notebook", notebookId: it.id });
                if (group.label === "Subjects") setView({ level: "subject", notebookId: it.notebookId, subjectId: it.id });
                if (group.label === "Chapters") { const s = db.subjects.find((x) => x.id === it.subjectId); setView({ level: "chapter", notebookId: s?.notebookId, subjectId: it.subjectId, chapterId: it.id }); }
                setQuery("");
              }} className="card-hover"
                style={{ cursor: "pointer", padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 6, background: T.card, display: "flex", alignItems: "center", gap: 8 }}>
                {group.icon}<span style={{ fontSize: 13.5 }}>{highlight(it.name)}</span>
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}

/* ---------------- Notebook view (subjects) ---------------- */

function NotebookView({ db, persist, notebook, setView, setConfirm }) {
  const T = useT();
  const subjects = [...db.subjects.filter((s) => s.notebookId === notebook.id)].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState(null);

  const addSubject = () => {
    if (!draft.trim()) { setAdding(false); return; }
    const s = { id: uid(), notebookId: notebook.id, name: draft.trim(), createdAt: now(), order: now() };
    persist({ ...db, subjects: [...db.subjects, s] });
    setDraft(""); setAdding(false);
  };

  const deleteSubject = (id) => {
    setConfirm({
      message: "Delete this subject and all its chapters and notes?",
      onConfirm: () => {
        const chapIds = db.chapters.filter((c) => c.subjectId === id).map((c) => c.id);
        persist({ ...db, subjects: db.subjects.filter((s) => s.id !== id), chapters: db.chapters.filter((c) => c.subjectId !== id), notes: db.notes.filter((n) => !chapIds.includes(n.chapterId)) });
      },
    });
  };

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader color={notebook.color} title={notebook.name} subtitle={`${subjects.length} subject${subjects.length !== 1 ? "s" : ""}`} icon={<BookOpen size={20} color={notebook.color} />} />

      {subjects.length === 0 && !adding ? (
        <EmptyState icon={<FolderOpen size={24} color={T.teal} />} title="No subjects yet" body="Break this notebook into subjects — Anatomy, Pathology, Pharmacology — whatever this notebook covers." actionLabel="Add a subject" onAction={() => setAdding(true)} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, marginTop: 20 }}>
          {subjects.map((s) => {
            const chapCount = db.chapters.filter((c) => c.subjectId === s.id).length;
            return (
              <div key={s.id} className="card-hover drag-row" style={{ position: "relative", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}
                draggable
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== s.id) {
                    const reordered = reorderList(subjects, dragId, s.id);
                    persist({ ...db, subjects: db.subjects.map((x) => { const u = reordered.find((r) => r.id === x.id); return u ? { ...x, order: u.order } : x; }) });
                  }
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
              >
                <div onClick={() => setView({ level: "subject", notebookId: notebook.id, subjectId: s.id })} style={{ cursor: "pointer" }}>
                  <FolderOpen size={17} color={notebook.color} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  <div className="mono-font" style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{chapCount} chapter{chapCount !== 1 ? "s" : ""}</div>
                </div>
                <button className="focus-ring" onClick={() => deleteSubject(s.id)} title="Delete subject"
                  style={{ position: "absolute", top: 10, right: 10, border: "none", background: "transparent", color: T.muted, cursor: "pointer" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <AddCard adding={adding} setAdding={setAdding} draft={draft} setDraft={setDraft} onCommit={addSubject} placeholder="Subject name" label="Add subject" />
        </div>
      )}
    </div>
  );
}

/* ---------------- Subject view (chapters) ---------------- */

function SubjectView({ db, persist, subject, setView, setConfirm }) {
  const T = useT();
  const notebook = db.notebooks.find((n) => n.id === subject.notebookId);
  const chapters = [...db.chapters.filter((c) => c.subjectId === subject.id)].sort((a, b) => (a.order ?? a.createdAt) - (b.order ?? b.createdAt));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [dragId, setDragId] = useState(null);

  const addChapter = () => {
    if (!draft.trim()) { setAdding(false); return; }
    const c = { id: uid(), subjectId: subject.id, name: draft.trim(), createdAt: now(), order: now() };
    persist({ ...db, chapters: [...db.chapters, c] });
    setDraft(""); setAdding(false);
  };

  const deleteChapter = (id) => {
    setConfirm({
      message: "Delete this chapter and all notes inside it?",
      onConfirm: () => persist({ ...db, chapters: db.chapters.filter((c) => c.id !== id), notes: db.notes.filter((n) => n.chapterId !== id) }),
    });
  };

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 1100, margin: "0 auto" }}>
      <PageHeader color={notebook?.color} title={subject.name} subtitle={`${chapters.length} chapter${chapters.length !== 1 ? "s" : ""}`} icon={<FolderOpen size={20} color={notebook?.color} />} />

      {chapters.length === 0 && !adding ? (
        <EmptyState icon={<FileText size={24} color={T.teal} />} title="No chapters yet" body="Chapters keep notes bite-sized — one per topic, like Inflammation or Neoplasia." actionLabel="Add a chapter" onAction={() => setAdding(true)} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 12, marginTop: 20 }}>
          {chapters.map((c) => {
            const noteCount = db.notes.filter((n) => n.chapterId === c.id).length;
            return (
              <div key={c.id} className="card-hover drag-row" style={{ position: "relative", background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 16 }}
                draggable
                onDragStart={() => setDragId(c.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragId && dragId !== c.id) {
                    const reordered = reorderList(chapters, dragId, c.id);
                    persist({ ...db, chapters: db.chapters.map((x) => { const u = reordered.find((r) => r.id === x.id); return u ? { ...x, order: u.order } : x; }) });
                  }
                  setDragId(null);
                }}
                onDragEnd={() => setDragId(null)}
              >
                <div onClick={() => setView({ level: "chapter", notebookId: subject.notebookId, subjectId: subject.id, chapterId: c.id })} style={{ cursor: "pointer" }}>
                  <FileText size={17} color={notebook?.color} style={{ marginBottom: 8 }} />
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name}</div>
                  <div className="mono-font" style={{ fontSize: 11, color: T.muted, marginTop: 3 }}>{noteCount} note{noteCount !== 1 ? "s" : ""}</div>
                </div>
                <button className="focus-ring" onClick={() => deleteChapter(c.id)} title="Delete chapter"
                  style={{ position: "absolute", top: 10, right: 10, border: "none", background: "transparent", color: T.muted, cursor: "pointer" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
          <AddCard adding={adding} setAdding={setAdding} draft={draft} setDraft={setDraft} onCommit={addChapter} placeholder="Chapter name" label="Add chapter" />
        </div>
      )}
    </div>
  );
}

/* ---------------- Chapter view (notes) ---------------- */

function ChapterView({ db, persist, chapter, setView, setConfirm }) {
  const T = useT();
  const subject = db.subjects.find((s) => s.id === chapter.subjectId);
  const notebook = db.notebooks.find((n) => n.id === subject?.notebookId);
  const [sortMode, setSortMode] = useState("updated");
  const [dragId, setDragId] = useState(null);
  const [topicFilter, setTopicFilter] = useState("");
  let notes = db.notes.filter((n) => n.chapterId === chapter.id);
  const topics = [...new Set(notes.map((n) => n.topic).filter(Boolean))].sort();
  if (topicFilter) notes = notes.filter((n) => n.topic === topicFilter);
  notes = [...notes].sort((a, b) => {
    if (sortMode === "title") return a.title.localeCompare(b.title);
    if (sortMode === "created") return b.createdAt - a.createdAt;
    if (sortMode === "manual") return (a.order ?? a.createdAt) - (b.order ?? b.createdAt);
    return b.updatedAt - a.updatedAt;
  });

  const addNote = () => {
    const n = { id: uid(), chapterId: chapter.id, title: "Untitled note", html: "", pinned: false, favorite: false, createdAt: now(), updatedAt: now(), order: now() };
    persist({ ...db, notes: [...db.notes, n] });
    setView({ level: "note", noteId: n.id, chapterId: chapter.id, subjectId: subject?.id, notebookId: notebook?.id });
  };

  const toggle = (id, field) => persist({ ...db, notes: db.notes.map((n) => (n.id === id ? { ...n, [field]: !n[field] } : n)) });

  const deleteNote = (id) => {
    setConfirm({ message: "Delete this note?", onConfirm: () => persist({ ...db, notes: db.notes.filter((n) => n.id !== id) }) });
  };

  return (
    <div style={{ padding: "28px 28px 60px", maxWidth: 900, margin: "0 auto" }}>
      <PageHeader color={notebook?.color} title={chapter.name} subtitle={`${notes.length} note${notes.length !== 1 ? "s" : ""}`} icon={<FileText size={20} color={notebook?.color} />} />

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} className="focus-ring"
            style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text }}>
            <option value="updated">Sort: Last edited</option>
            <option value="title">Sort: Title</option>
            <option value="created">Sort: Date created</option>
            <option value="manual">Sort: Manual (drag to reorder)</option>
          </select>
          {topics.length > 0 && (
            <select value={topicFilter} onChange={(e) => setTopicFilter(e.target.value)} className="focus-ring"
              style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.card, color: T.text }}>
              <option value="">All topics</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
        <button className="focus-ring" onClick={addNote}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, border: "none", background: T.teal, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          <Plus size={14} /> New note
        </button>
      </div>

      {notes.length === 0 ? (
        <EmptyState icon={<FileText size={24} color={T.teal} />} title="No notes yet" body="Paste in a lecture summary, an AI answer, or start typing from scratch." actionLabel="Write your first note" onAction={addNote} />
      ) : (
        <div>
          {notes.map((n) => (
            <div key={n.id} className={sortMode === "manual" ? "card-hover drag-row" : "card-hover"}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "13px 14px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.card, marginBottom: 8, cursor: "pointer" }}
              onClick={() => setView({ level: "note", noteId: n.id, chapterId: chapter.id, subjectId: subject?.id, notebookId: notebook?.id })}
              draggable={sortMode === "manual"}
              onDragStart={() => setDragId(n.id)}
              onDragOver={(e) => { if (sortMode === "manual") e.preventDefault(); }}
              onDrop={(e) => {
                if (sortMode !== "manual") return;
                e.preventDefault();
                if (dragId && dragId !== n.id) {
                  const reordered = reorderList(notes, dragId, n.id);
                  persist({ ...db, notes: db.notes.map((x) => { const u = reordered.find((r) => r.id === x.id); return u ? { ...x, order: u.order } : x; }) });
                }
                setDragId(null);
              }}
              onDragEnd={() => setDragId(null)}
            >
              <FileText size={16} color={T.muted} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{n.title || "Untitled note"}</span>
                  {n.topic && (
                    <span className="mono-font" style={{ fontSize: 10, fontWeight: 600, color: T.teal, background: `${T.teal}1A`, padding: "2px 8px", borderRadius: 999 }}>
                      {n.topic}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12, color: T.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stripHtml(n.html).slice(0, 100) || "No content yet"}</div>
                <div className="mono-font" style={{ fontSize: 10.5, color: T.muted, marginTop: 4 }}>{timeAgo(n.updatedAt)} · {wordCount(n.html)} words</div>
              </div>
              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                <IconBtn title={n.pinned ? "Unpin" : "Pin"} onClick={() => toggle(n.id, "pinned")}>{n.pinned ? <Pin size={12} fill={T.muted} /> : <Pin size={12} />}</IconBtn>
                <IconBtn title={n.favorite ? "Unfavourite" : "Favourite"} onClick={() => toggle(n.id, "favorite")}><Star size={12} fill={n.favorite ? "#B4791F" : "none"} color={n.favorite ? "#B4791F" : T.muted} /></IconBtn>
                <IconBtn title="Delete" danger onClick={() => deleteNote(n.id)}><Trash2 size={12} /></IconBtn>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PageHeader({ color, title, subtitle, icon }) {
  const T = useT();
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: `${color || T.teal}22`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
        <h1 className="display-font" style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>{title}</h1>
      </div>
      <div className="mono-font" style={{ fontSize: 11, color: T.muted, marginLeft: 48 }}>{subtitle}</div>
    </div>
  );
}

function AddCard({ adding, setAdding, draft, setDraft, onCommit, placeholder, label }) {
  const T = useT();
  if (!adding) {
    return (
      <button className="focus-ring" onClick={() => setAdding(true)}
        style={{ border: `1.5px dashed ${T.border}`, borderRadius: 14, padding: 16, background: "transparent", color: T.muted, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 92 }}>
        <Plus size={16} />
        <span style={{ fontSize: 12.5 }}>{label}</span>
      </button>
    );
  }
  return (
    <div style={{ border: `1.5px solid ${T.teal}`, borderRadius: 14, padding: 16, background: T.card, minHeight: 92, display: "flex", flexDirection: "column", justifyContent: "center", gap: 8 }}>
      <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={placeholder}
        onKeyDown={(e) => { if (e.key === "Enter") onCommit(); if (e.key === "Escape") setAdding(false); }}
        style={{ border: "none", outline: "none", fontSize: 13.5, background: "transparent", color: T.text }} />
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onCommit} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "none", background: T.teal, color: "#fff", cursor: "pointer" }}>Add</button>
        <button onClick={() => setAdding(false)} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.muted, cursor: "pointer" }}>Cancel</button>
      </div>
    </div>
  );
}

/* ---------------- Note editor ---------------- */

function NoteEditorView({ db, persist, noteId, setView, chapter }) {
  const T = useT();
  const note = db.notes.find((n) => n.id === noteId);
  const editorRef = useRef(null);
  const [title, setTitle] = useState(note?.title || "");
  const [showHiLite, setShowHiLite] = useState(false);
  const [showLinker, setShowLinker] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findIndex, setFindIndex] = useState(0);
  const initialized = useRef(false);

  useEffect(() => {
    if (note && editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = note.html || "";
      setTitle(note.title || "");
      initialized.current = true;
    }
  }, [note]);

  useEffect(() => { initialized.current = false; }, [noteId]);

  const findMatches = useMemo(
    () => (findOpen && editorRef.current ? findTextMatches(editorRef.current, findQuery) : []),
    [findOpen, findQuery, note?.html]
  );

  const gotoMatch = (idx) => {
    if (!findMatches.length) return;
    const wrapped = ((idx % findMatches.length) + findMatches.length) % findMatches.length;
    const m = findMatches[wrapped];
    const range = document.createRange();
    range.setStart(m.node, m.start);
    range.setEnd(m.node, m.end);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    m.node.parentElement?.scrollIntoView({ block: "center", behavior: "smooth" });
    setFindIndex(wrapped);
  };

  useEffect(() => {
    if (findOpen && findMatches.length) gotoMatch(0);
    else setFindIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findQuery, findOpen]);

  const [tableCtx, setTableCtx] = useState(null); // { table, rowIndex, cellIndex }

  useEffect(() => {
    const handler = () => {
      const editor = editorRef.current;
      if (!editor) return;
      const sel = window.getSelection();
      if (!sel || !sel.anchorNode || !editor.contains(sel.anchorNode)) { setTableCtx(null); return; }
      let el = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const cell = el?.closest?.("td, th");
      const table = cell?.closest?.("table.note-table");
      if (!cell || !table || !table.tBodies[0]) { setTableCtx(null); return; }
      const tr = cell.closest("tr");
      const rowIndex = Array.prototype.indexOf.call(table.tBodies[0].rows, tr);
      const cellIndex = tr ? Array.prototype.indexOf.call(tr.children, cell) : -1;
      if (rowIndex === -1 || cellIndex === -1) { setTableCtx(null); return; }
      setTableCtx({ table, rowIndex, cellIndex });
    };
    document.addEventListener("selectionchange", handler);
    return () => document.removeEventListener("selectionchange", handler);
  }, []);

  if (!note) {
    return <div style={{ padding: 40, color: T.muted }}>This note was deleted or doesn't exist.</div>;
  }

  const updateNote = (patch) => {
    persist({ ...db, notes: db.notes.map((n) => (n.id === note.id ? { ...n, ...patch, updatedAt: now() } : n)) });
  };

  const onEditorInput = () => {
    updateNote({ html: editorRef.current.innerHTML });
  };

  const exec = (cmd, val) => {
    editorRef.current.focus();
    document.execCommand(cmd, false, val);
    onEditorInput();
  };

  const insertChecklist = () => {
    editorRef.current.focus();
    document.execCommand("insertHTML", false, `<div class="chk-item"><input type="checkbox" contenteditable="false"/><span>Checklist item</span></div>`);
    onEditorInput();
  };

  const handwriteOn = db.settings.handwriteOnPaste !== false;

  const onPaste = (e) => {
    if (!handwriteOn) return; // let the browser paste normally, keeping source formatting
    const cd = e.clipboardData;
    const text = cd && typeof cd.getData === "function" ? cd.getData("text/plain") : "";
    if (!text) return; // no readable clipboard text on this browser — fall back to normal paste
    e.preventDefault();
    const html = text
      .split(/\r\n|\r|\n/)
      .map((line) => (line ? escapeHtml(line) : "<br/>"))
      .join("<br/>");
    editorRef.current.focus();
    document.execCommand("insertHTML", false, `<span class="handwritten-run">${html}</span>`);
    onEditorInput();
  };

  const applyHandwritingToSelection = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.className = "handwritten-run";
    try {
      range.surroundContents(span);
    } catch (err) {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    onEditorInput();
  };

  const laserPoint = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    const span = document.createElement("span");
    span.className = "laser-flash";
    try {
      range.surroundContents(span);
    } catch (err) {
      const frag = range.extractContents();
      span.appendChild(frag);
      range.insertNode(span);
    }
    sel.removeAllRanges();
    // Deliberately not calling onEditorInput — this is a temporary pointer, never saved.
    setTimeout(() => {
      const parent = span.parentNode;
      if (!parent) return;
      while (span.firstChild) parent.insertBefore(span.firstChild, span);
      parent.removeChild(span);
      parent.normalize();
    }, 2300);
  };

  const insertTable = () => {
    editorRef.current.focus();
    let html = '<table class="note-table"><tbody>';
    for (let r = 0; r < 3; r++) {
      html += "<tr>";
      for (let c = 0; c < 3; c++) html += "<td>&nbsp;</td>";
      html += "</tr>";
    }
    html += "</tbody></table><p><br/></p>";
    document.execCommand("insertHTML", false, html);
    onEditorInput();
  };

  const addTableRow = () => {
    if (!tableCtx) return;
    const { table, rowIndex } = tableCtx;
    const tbody = table.tBodies[0];
    const refRow = tbody.rows[rowIndex];
    if (!refRow) return;
    const newRow = refRow.cloneNode(true);
    Array.from(newRow.cells).forEach((td) => { td.innerHTML = "&nbsp;"; });
    refRow.after(newRow);
    onEditorInput();
  };

  const deleteTableRow = () => {
    if (!tableCtx) return;
    const { table, rowIndex } = tableCtx;
    const tbody = table.tBodies[0];
    if (tbody.rows.length <= 1) return;
    tbody.deleteRow(rowIndex);
    setTableCtx(null);
    onEditorInput();
  };

  const addTableColumn = () => {
    if (!tableCtx) return;
    const { table, cellIndex } = tableCtx;
    Array.from(table.tBodies[0].rows).forEach((row) => {
      const refCell = row.cells[cellIndex];
      if (!refCell) return;
      const newCell = document.createElement(refCell.tagName.toLowerCase());
      newCell.innerHTML = "&nbsp;";
      refCell.after(newCell);
    });
    onEditorInput();
  };

  const deleteTableColumn = () => {
    if (!tableCtx) return;
    const { table, cellIndex } = tableCtx;
    const rows = table.tBodies[0].rows;
    if (!rows.length || rows[0].cells.length <= 1) return;
    Array.from(rows).forEach((row) => row.deleteCell(cellIndex));
    setTableCtx(null);
    onEditorInput();
  };

  const insertNoteLink = (targetNote) => {
    editorRef.current.focus();
    document.execCommand(
      "insertHTML",
      false,
      `<a href="#" class="note-link" contenteditable="false" data-note-id="${targetNote.id}"><span>🔗</span>${escapeHtml(targetNote.title || "Untitled note")}</a>&nbsp;`
    );
    onEditorInput();
    setShowLinker(false);
    setLinkQuery("");
  };

  const onEditorClick = (e) => {
    const linkEl = e.target.closest?.(".note-link");
    if (linkEl) {
      e.preventDefault();
      const targetId = linkEl.getAttribute("data-note-id");
      const dest = resolveNoteView(db, targetId);
      if (dest) setView(dest);
    }
  };

  const linkResults = linkQuery.trim()
    ? db.notes.filter((n) => n.id !== note.id && n.title.toLowerCase().includes(linkQuery.trim().toLowerCase())).slice(0, 8)
    : db.notes.filter((n) => n.id !== note.id).slice(0, 8);

  const backlinks = db.notes.filter((n) => n.id !== note.id && n.html && n.html.includes(`data-note-id="${note.id}"`));

  const insertImageFromFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      editorRef.current.focus();
      document.execCommand("insertHTML", false, `<img src="${reader.result}" />`);
      onEditorInput();
    };
    reader.readAsDataURL(file);
  };

  const words = wordCount(note.html);
  const chars = stripHtml(note.html).length;

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: "20px 24px 80px" }}>
      <button className="focus-ring no-print" onClick={() => setView({ level: "chapter", notebookId: db.subjects.find(s=>s.id===chapter?.subjectId)?.notebookId, subjectId: chapter?.subjectId, chapterId: chapter?.id })}
        style={{ display: "flex", alignItems: "center", gap: 5, border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 12.5, marginBottom: 14, padding: 0 }}>
        <ArrowLeft size={14} /> Back to {chapter?.name || "chapter"}
      </button>

      <input
        value={title}
        onChange={(e) => { setTitle(e.target.value); updateNote({ title: e.target.value }); }}
        placeholder="Untitled note"
        className="display-font focus-ring"
        style={{ width: "100%", border: "none", outline: "none", fontSize: 28, fontWeight: 600, background: "transparent", color: T.text, marginBottom: 4 }}
      />

      <input
        value={note.topic || ""}
        onChange={(e) => updateNote({ topic: e.target.value })}
        placeholder="Topic (e.g. Iron Deficiency Anemia)"
        className="mono-font focus-ring no-print"
        style={{ width: "100%", border: "none", outline: "none", fontSize: 12.5, background: "transparent", color: T.teal, marginBottom: 12, fontWeight: 600 }}
      />

      <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <button className="focus-ring" onClick={() => updateNote({ pinned: !note.pinned })} title="Pin"
          style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: note.pinned ? T.teal : T.muted, cursor: "pointer", fontSize: 12 }}>
          <Pin size={13} fill={note.pinned ? T.teal : "none"} /> Pin
        </button>
        <button className="focus-ring" onClick={() => updateNote({ favorite: !note.favorite })} title="Favourite"
          style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: note.favorite ? "#B4791F" : T.muted, cursor: "pointer", fontSize: 12 }}>
          <Star size={13} fill={note.favorite ? "#B4791F" : "none"} /> Favourite
        </button>
        <button className="focus-ring" onClick={() => window.print()}
          style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 12 }}>
          <Printer size={13} /> Save as PDF
        </button>
        <button
          className="focus-ring"
          onClick={async () => {
            const shareText = stripHtml(note.html);
            if (navigator.share) {
              try { await navigator.share({ title: note.title || "Note", text: shareText }); } catch (err) { /* user cancelled */ }
            } else {
              download(`${(note.title || "note").replace(/\s+/g, "_")}.txt`, shareText);
            }
          }}
          style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 12 }}>
          <Share2 size={13} /> Share as text
        </button>
        <button className="focus-ring" onClick={() => download(`${(note.title || "note").replace(/\s+/g, "_")}.md`, htmlToMarkdown(note.html))}
          style={{ display: "flex", alignItems: "center", gap: 4, border: "none", background: "transparent", color: T.muted, cursor: "pointer", fontSize: 12 }}>
          <Download size={13} /> Export .md
        </button>
      </div>

      <div className="scroll-thin no-print" style={{ position: "sticky", top: 0, zIndex: 5, display: "flex", flexWrap: "wrap", gap: 3, padding: "8px 8px", background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 14 }}>
        <ToolBtn onClick={() => exec("bold")} title="Bold"><Bold size={14} /></ToolBtn>
        <ToolBtn onClick={() => exec("italic")} title="Italic"><Italic size={14} /></ToolBtn>
        <ToolBtn onClick={() => exec("underline")} title="Underline"><Underline size={14} /></ToolBtn>
        <ToolBtn onClick={() => exec("strikeThrough")} title="Strikethrough"><Strikethrough size={14} /></ToolBtn>
        <Divider />
        <ToolBtn onClick={() => exec("formatBlock", "H2")} title="Heading"><Heading2 size={14} /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "P")} title="Paragraph"><AlignLeft size={14} /></ToolBtn>
        <ToolBtn onClick={() => exec("formatBlock", "BLOCKQUOTE")} title="Quote"><Quote size={14} /></ToolBtn>
        <Divider />
        <ToolBtn onClick={() => exec("insertUnorderedList")} title="Bullet list"><List size={14} /></ToolBtn>
        <ToolBtn onClick={() => exec("insertOrderedList")} title="Numbered list"><ListOrdered size={14} /></ToolBtn>
        <ToolBtn onClick={insertChecklist} title="Checklist"><CheckSquare size={14} /></ToolBtn>
        <Divider />
        <div style={{ position: "relative" }}>
          <ToolBtn onClick={() => setShowHiLite((s) => !s)} title="Highlighter — colors the background behind selected text"><Highlighter size={14} /></ToolBtn>
          {showHiLite && (
            <div style={{ position: "absolute", top: 32, left: 0, display: "flex", gap: 4, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 6, boxShadow: T.shadow, zIndex: 10 }}>
              {HIGHLIGHTS.map((h) => (
                <button key={h.hex} onClick={() => { exec("hiliteColor", h.hex); setShowHiLite(false); }} title={h.name}
                  style={{ width: 18, height: 18, borderRadius: 5, background: h.hex, border: "none", cursor: "pointer" }} />
              ))}
            </div>
          )}
        </div>
        <ToolBtn onClick={() => exec("insertHorizontalRule")} title="Divider"><Minus size={14} /></ToolBtn>
        <ToolBtn onClick={insertTable} title="Insert table"><TableIcon size={14} /></ToolBtn>
        <label title="Insert image" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 7, cursor: "pointer", color: T.muted }}>
          <ImageIcon size={14} />
          <input type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files[0]) insertImageFromFile(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <div style={{ position: "relative" }}>
          <ToolBtn onClick={() => { setShowLinker((s) => !s); setShowHiLite(false); }} title="Link to another note"><Link2 size={14} /></ToolBtn>
          {showLinker && (
            <div onClick={(e) => e.stopPropagation()} style={{ position: "absolute", top: 32, left: 0, width: 240, background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: 8, boxShadow: T.shadow, zIndex: 10 }}>
              <input
                autoFocus
                value={linkQuery}
                onChange={(e) => setLinkQuery(e.target.value)}
                placeholder="Search notes to link…"
                className="focus-ring"
                style={{ width: "100%", padding: "6px 8px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, color: T.text, fontSize: 12.5, marginBottom: 6 }}
              />
              <div className="scroll-thin" style={{ maxHeight: 180, overflowY: "auto" }}>
                {linkResults.length === 0 && <div style={{ fontSize: 12, color: T.muted, padding: "6px 4px" }}>No other notes yet.</div>}
                {linkResults.map((n) => (
                  <div key={n.id} onClick={() => insertNoteLink(n)}
                    style={{ padding: "6px 8px", borderRadius: 7, cursor: "pointer", fontSize: 12.5 }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = T.cardAlt)}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}>
                    {n.title || "Untitled note"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <ToolBtn onClick={() => setFindOpen((s) => !s)} title="Find in this note"><Search size={14} /></ToolBtn>
        <Divider />
        <button
          className="focus-ring"
          onClick={() => persist({ ...db, settings: { ...db.settings, handwriteOnPaste: !handwriteOn } })}
          title={handwriteOn ? "Pasted text becomes handwriting — click to turn off" : "Pasted text keeps its original formatting — click to turn on"}
          style={{
            display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 9px", borderRadius: 7, border: "none",
            background: handwriteOn ? `${T.teal}1A` : "transparent", color: handwriteOn ? T.teal : T.muted, cursor: "pointer", fontSize: 11.5, fontWeight: 600,
          }}
        >
          <PenTool size={13} /> Handwriting on paste
        </button>
        <ToolBtn onClick={applyHandwritingToSelection} title="Pen — select text, then tap this to make it handwriting"><Feather size={14} /></ToolBtn>
        <ToolBtn onClick={laserPoint} title="Laser pointer — select text to flash-highlight it briefly (not saved)"><Crosshair size={14} /></ToolBtn>
      </div>

      {findOpen && (
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "6px 10px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.card }}>
          <Search size={13} color={T.muted} />
          <input
            autoFocus
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); gotoMatch(e.shiftKey ? findIndex - 1 : findIndex + 1); }
              if (e.key === "Escape") { setFindOpen(false); setFindQuery(""); }
            }}
            placeholder="Find in this note…"
            className="focus-ring"
            style={{ flex: 1, border: "none", outline: "none", background: "transparent", color: T.text, fontSize: 13 }}
          />
          <span className="mono-font" style={{ fontSize: 11, color: T.muted, whiteSpace: "nowrap" }}>
            {findQuery ? (findMatches.length ? `${findIndex + 1} of ${findMatches.length}` : "0 found") : ""}
          </span>
          <button className="focus-ring" onClick={() => gotoMatch(findIndex - 1)} disabled={!findMatches.length}
            style={{ border: "none", background: "transparent", color: T.muted, cursor: findMatches.length ? "pointer" : "default" }}><ChevronUp size={14} /></button>
          <button className="focus-ring" onClick={() => gotoMatch(findIndex + 1)} disabled={!findMatches.length}
            style={{ border: "none", background: "transparent", color: T.muted, cursor: findMatches.length ? "pointer" : "default" }}><ChevronDown size={14} /></button>
          <button className="focus-ring" onClick={() => { setFindOpen(false); setFindQuery(""); }}
            style={{ border: "none", background: "transparent", color: T.muted, cursor: "pointer" }}><X size={14} /></button>
        </div>
      )}

      {tableCtx && (
        <div className="no-print" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "6px 10px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.card, flexWrap: "wrap" }}>
          <TableIcon size={13} color={T.muted} />
          <span className="mono-font" style={{ fontSize: 10.5, color: T.muted, marginRight: 4 }}>TABLE</span>
          {[
            { label: "+ Row", onClick: addTableRow },
            { label: "− Row", onClick: deleteTableRow },
            { label: "+ Col", onClick: addTableColumn },
            { label: "− Col", onClick: deleteTableColumn },
          ].map((b) => (
            <button
              key={b.label}
              className="focus-ring"
              onMouseDown={(e) => e.preventDefault()}
              onClick={b.onClick}
              style={{ fontSize: 11.5, fontWeight: 600, padding: "4px 9px", borderRadius: 7, border: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer" }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <div
        ref={editorRef}
        className="editor-area focus-ring"
        contentEditable
        suppressContentEditableWarning
        onInput={onEditorInput}
        onPaste={onPaste}
        onClick={onEditorClick}
        style={{ minHeight: 340, color: T.text }}
        data-placeholder="Start writing, or paste in your notes…"
      />

      {backlinks.length > 0 && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
          <div className="mono-font" style={{ fontSize: 10.5, color: T.muted, letterSpacing: 0.5, marginBottom: 8 }}>LINKED FROM</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {backlinks.map((n) => (
              <button key={n.id} className="focus-ring" onClick={() => { const d = resolveNoteView(db, n.id); if (d) setView(d); }}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", borderRadius: 999, border: "none", background: `${T.teal}1A`, color: T.teal, cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                <Link2 size={11} /> {n.title || "Untitled note"}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mono-font" style={{ marginTop: 18, fontSize: 11, color: T.muted, display: "flex", gap: 14, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
        <span>{words} words</span>
        <span>{chars} characters</span>
        <span>Edited {timeAgo(note.updatedAt)}</span>
      </div>
    </div>
  );
}

function ToolBtn({ children, onClick, title }) {
  const T = useT();
  return (
    <button className="focus-ring" onClick={onClick} title={title}
      style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "none", background: "transparent", color: T.text, cursor: "pointer" }}
      onMouseDown={(e) => e.preventDefault()}>
      {children}
    </button>
  );
}

function Divider() {
  const T = useT();
  return <span style={{ width: 1, alignSelf: "stretch", background: T.border, margin: "2px 4px" }} />;
}
