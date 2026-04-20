import React, { useState, useEffect } from "react";
import {
  collection, getDocs, query, where, updateDoc,
  doc, onSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

/* ─────────────────────────────────────────────────────────────
   ADMIN PANEL
   • Tab 1 — Add jCoins (by username or "all")
   • Tab 2 — Player List (live, shows all players + balances)
───────────────────────────────────────────────────────────── */
export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState("add"); // "add" | "players"

  return (
    <div className="ao-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="ao-modal">

        {/* ── Header ── */}
        <div className="ao-header">
          <div className="ao-title-row">
            <span className="ao-icon">⚙️</span>
            <h2 className="ao-title">Admin Panel</h2>
          </div>
          <button className="ao-close" onClick={onClose} title="Close">✕</button>
        </div>

        {/* ── Tabs ── */}
        <div className="ao-tabs">
          <button
            className={`ao-tab ${tab === "add" ? "ao-tab-active" : ""}`}
            onClick={() => setTab("add")}
          >
            💎 Add jCoins
          </button>
          <button
            className={`ao-tab ${tab === "players" ? "ao-tab-active" : ""}`}
            onClick={() => setTab("players")}
          >
            👥 Players
          </button>
        </div>

        {/* ── Body ── */}
        <div className="ao-body">
          {tab === "add"     && <AddCoinsTab />}
          {tab === "players" && <PlayersTab />}
        </div>

      </div>
      <style>{CSS}</style>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TAB 1 — ADD jCOINS
───────────────────────────────────────────────────────────── */
function AddCoinsTab() {
  const [username, setUsername] = useState("");
  const [amount,   setAmount]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState(null);

  const flash = (text, type) => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 4500);
  };

  const handleAdd = async () => {
    const name = username.trim();
    const amt  = parseInt(amount);

    if (!name)                   return flash("Enter a username or 'all'", "warn");
    if (isNaN(amt) || amt <= 0)  return flash("Enter a positive amount", "warn");
    if (amt > 1_000_000)         return flash("Max 1,000,000 jCoins per action", "warn");

    setLoading(true);
    try {
      const isAll = name.toLowerCase() === "all";

      if (isAll) {
        const snap = await getDocs(collection(db, "players"));
        if (snap.empty) {
          flash("No players found in database", "warn");
          setLoading(false);
          return;
        }
        let count = 0;
        for (const d of snap.docs) {
          await updateDoc(doc(db, "players", d.id), {
            jCoin: (d.data().jCoin ?? 0) + amt,
          });
          count++;
        }
        flash(`✅ +${amt.toLocaleString()} jCoins → all ${count} players`, "success");
      } else {
        const q    = query(collection(db, "players"), where("username", "==", name));
        const snap = await getDocs(q);
        if (snap.empty) {
          flash(`No player found with username "${name}"`, "error");
          setLoading(false);
          return;
        }
        const d = snap.docs[0];
        await updateDoc(doc(db, "players", d.id), {
          jCoin: (d.data().jCoin ?? 0) + amt,
        });
        const newBal = (d.data().jCoin ?? 0) + amt;
        flash(`✅ +${amt.toLocaleString()} jCoins → ${name} (new balance: ${newBal.toLocaleString()})`, "success");
      }

      setUsername("");
      setAmount("");
    } catch (err) {
      flash(`Error: ${err.message}`, "error");
    } finally {
      setLoading(false);
    }
  };

  const presets = [100, 500, 1000, 5000];
  const isAll   = username.trim().toLowerCase() === "all";

  return (
    <div className="add-tab">

      {/* Hero */}
      <div className="add-hero">
        <span className="add-gem">💎</span>
        <p className="add-hero-text">
          {isAll
            ? "Broadcast jCoins to ALL players at once"
            : "Send jCoins directly to a player"}
        </p>
      </div>

      {/* Username */}
      <div className="ao-field">
        <label className="ao-label">Target Username</label>
        <input
          className={`ao-input ${isAll ? "ao-input-all" : ""}`}
          type="text"
          placeholder='username  or  "all"'
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          disabled={loading}
        />
        {isAll
          ? <p className="ao-hint ao-hint-all">⚡ Every registered player will receive coins</p>
          : <p className="ao-hint">Must match player's exact username — check Players tab</p>
        }
      </div>

      {/* Amount */}
      <div className="ao-field">
        <label className="ao-label">Amount (jCoins)</label>
        <input
          className="ao-input"
          type="number"
          placeholder="e.g. 500"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          disabled={loading}
          min="1"
        />
        <div className="ao-presets">
          {presets.map((v) => (
            <button
              key={v}
              className="ao-preset-btn"
              onClick={() => setAmount(String(v))}
              disabled={loading}
            >
              +{v.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      {/* Message */}
      {msg && <div className={`ao-msg ao-msg-${msg.type}`}>{msg.text}</div>}

      {/* Submit */}
      <button
        className={`ao-submit ${isAll ? "ao-submit-all" : ""}`}
        onClick={handleAdd}
        disabled={loading}
      >
        {loading
          ? "Processing…"
          : isAll
          ? "💎 Add to ALL Players"
          : "💎 Add jCoins"}
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   TAB 2 — PLAYERS LIST (live)
───────────────────────────────────────────────────────────── */
function PlayersTab() {
  const [players, setPlayers] = useState([]);
  const [search,  setSearch]  = useState("");
  const [sort,    setSort]    = useState("jCoin");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "players"), (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const now = Date.now();

  const filtered = players
    .filter((p) =>
      !search || (p.username ?? "").toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => {
      if (sort === "jCoin")    return (b.jCoin ?? 0) - (a.jCoin ?? 0);
      if (sort === "username") return (a.username ?? "").localeCompare(b.username ?? "");
      if (sort === "lastSeen") return (b.lastSeen?.toMillis() ?? 0) - (a.lastSeen?.toMillis() ?? 0);
      return 0;
    });

  const onlineCount = players.filter(
    (p) => now - (p.lastSeen?.toMillis() ?? 0) < 30_000
  ).length;

  const topBalance = players.reduce((m, p) => Math.max(m, p.jCoin ?? 0), 0);

  if (loading) return <div className="pt-loading">Loading players…</div>;

  return (
    <div className="players-tab">

      {/* Stats */}
      <div className="pt-stats">
        <div className="pt-stat">
          <span className="pt-stat-val">{players.length}</span>
          <span className="pt-stat-label">Total Players</span>
        </div>
        <div className="pt-stat">
          <span className="pt-stat-val" style={{ color: "#34d399" }}>{onlineCount}</span>
          <span className="pt-stat-label">Online Now</span>
        </div>
        <div className="pt-stat">
          <span className="pt-stat-val" style={{ color: "#fbbf24" }}>
            {topBalance.toLocaleString()}
          </span>
          <span className="pt-stat-label">Top Balance</span>
        </div>
      </div>

      {/* Search + sort */}
      <div className="pt-controls">
        <input
          className="ao-input pt-search"
          type="text"
          placeholder="🔍 Search by username…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="pt-sort-btns">
          {[
            ["jCoin",    "💎 Balance"],
            ["username", "🔤 Name"],
            ["lastSeen", "🕐 Recent"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`pt-sort-btn ${sort === key ? "pt-sort-active" : ""}`}
              onClick={() => setSort(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="pt-list">
        {filtered.length === 0 ? (
          <p className="pt-empty">
            {search ? `No players match "${search}"` : "No players yet"}
          </p>
        ) : (
          filtered.map((p) => {
            const isOnline = now - (p.lastSeen?.toMillis() ?? 0) < 30_000;
            return (
              <div key={p.id} className={`pt-row ${isOnline ? "pt-row-online" : ""}`}>
                <div className="pt-row-left">
                  <span className={`pt-dot ${isOnline ? "pt-dot-on" : "pt-dot-off"}`} />
                  <div className="pt-row-info">
                    <span className="pt-row-name">
                      {p.username ?? <em style={{ color: "#3a5a7a", fontStyle:"italic" }}>unnamed</em>}
                      {p.isAdmin && <span className="pt-admin-tag">ADMIN</span>}
                    </span>
                    <span className="pt-row-sub">
                      {isOnline ? "🟢 online now" : timeAgo(p.lastSeen?.toMillis())}
                    </span>
                  </div>
                </div>
                <div className="pt-row-right">
                  <span className="pt-coin-icon">💎</span>
                  <span className="pt-row-balance">
                    {(p.jCoin ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      <p className="pt-footer-note">
        🔴 Live — updates in real time · Click "Add jCoins" tab to send coins
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
function timeAgo(ms) {
  if (!ms) return "never seen";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 10)    return "just now";
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/* ─────────────────────────────────────────────────────────────
   CSS
───────────────────────────────────────────────────────────── */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Mono:wght@400;700&display=swap');

  .ao-overlay {
    position: fixed; inset: 0;
    background: rgba(0,0,0,.75);
    display: flex; align-items: center; justify-content: center;
    z-index: 9999;
    backdrop-filter: blur(4px);
    animation: aoFade .2s ease-out;
    padding: 16px;
  }
  @keyframes aoFade { from{opacity:0} to{opacity:1} }

  .ao-modal {
    background: linear-gradient(160deg, #0e1628 0%, #131a2e 100%);
    border: 1px solid rgba(168,85,247,.3);
    border-radius: 18px;
    width: 100%; max-width: 480px;
    max-height: 92vh;
    display: flex; flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,.9), 0 0 60px rgba(168,85,247,.12);
    overflow: hidden;
    animation: aoSlide .3s cubic-bezier(.34,1.56,.64,1);
    font-family: 'Rajdhani', sans-serif;
  }
  @keyframes aoSlide {
    from { opacity:0; transform:scale(.9) translateY(-16px) }
    to   { opacity:1; transform:scale(1) translateY(0) }
  }

  /* Header */
  .ao-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid rgba(168,85,247,.15);
    background: rgba(168,85,247,.05);
    flex-shrink: 0;
  }
  .ao-title-row { display: flex; align-items: center; gap: 8px; }
  .ao-icon { font-size: 18px; }
  .ao-title {
    font-family: 'Space Mono', monospace;
    font-size: 14px; font-weight: 700;
    color: #d8b4fe;
    letter-spacing: 2px;
    margin: 0;
  }
  .ao-close {
    background: transparent;
    border: 1px solid rgba(168,85,247,.3);
    color: #c4b5fd;
    width: 28px; height: 28px;
    border-radius: 7px;
    font-size: 12px; font-weight: 800;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all .18s;
  }
  .ao-close:hover { background: rgba(168,85,247,.18); border-color: #d8b4fe; }

  /* Tabs */
  .ao-tabs {
    display: flex;
    padding: 10px 16px 0;
    gap: 5px;
    border-bottom: 1px solid rgba(168,85,247,.12);
    flex-shrink: 0;
  }
  .ao-tab {
    flex: 1; padding: 8px 12px;
    background: transparent;
    border: 1px solid rgba(168,85,247,.12);
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    color: #7c6a9a;
    font-size: 12px; font-weight: 700;
    font-family: 'Rajdhani', sans-serif;
    cursor: pointer;
    transition: all .15s;
    letter-spacing: .5px;
    text-transform: uppercase;
  }
  .ao-tab:hover { color: #c4b5fd; background: rgba(168,85,247,.07); }
  .ao-tab-active {
    background: rgba(168,85,247,.1);
    border-color: rgba(168,85,247,.3);
    color: #e9d5ff;
  }

  /* Body */
  .ao-body {
    flex: 1; overflow-y: auto;
    padding: 20px;
  }
  .ao-body::-webkit-scrollbar { width: 3px; }
  .ao-body::-webkit-scrollbar-thumb { background: #2d1f4a; border-radius: 2px; }

  /* Fields */
  .ao-field { margin-bottom: 16px; }
  .ao-label {
    display: block;
    font-size: 10px; font-weight: 700;
    color: #9880c0;
    text-transform: uppercase; letter-spacing: 1px;
    margin-bottom: 7px;
  }
  .ao-input {
    width: 100%;
    background: rgba(0,0,0,.3);
    border: 1px solid rgba(168,85,247,.22);
    border-radius: 8px;
    padding: 10px 12px;
    color: #c8d8f8;
    font-size: 14px;
    font-family: 'Rajdhani', sans-serif;
    font-weight: 600;
    outline: none;
    transition: all .2s;
    -moz-appearance: textfield;
  }
  .ao-input::-webkit-inner-spin-button,
  .ao-input::-webkit-outer-spin-button { -webkit-appearance: none; }
  .ao-input:focus { border-color: #a855f7; box-shadow: 0 0 14px rgba(168,85,247,.18); }
  .ao-input:disabled { opacity: .4; cursor: not-allowed; }
  .ao-input-all { border-color: rgba(251,191,36,.4) !important; color: #fde68a; }
  .ao-input-all:focus { border-color: #fbbf24 !important; box-shadow: 0 0 14px rgba(251,191,36,.18) !important; }
  .ao-hint { font-size: 10px; color: #5a4a7a; margin-top: 5px; }
  .ao-hint-all { color: #92600a !important; font-weight: 600; }

  /* Presets */
  .ao-presets { display: flex; gap: 6px; margin-top: 8px; }
  .ao-preset-btn {
    flex: 1;
    background: rgba(168,85,247,.06);
    border: 1px solid rgba(168,85,247,.18);
    border-radius: 6px;
    padding: 6px 0;
    color: #c4b5fd;
    font-size: 11px; font-weight: 700;
    font-family: 'Rajdhani', sans-serif;
    cursor: pointer;
    transition: all .15s;
  }
  .ao-preset-btn:hover:not(:disabled) { background: rgba(168,85,247,.14); }
  .ao-preset-btn:disabled { opacity: .3; cursor: not-allowed; }

  /* Message */
  .ao-msg {
    padding: 10px 14px; border-radius: 8px;
    font-size: 13px; font-weight: 600;
    margin-bottom: 14px;
    animation: msgIn .25s ease-out;
    line-height: 1.4;
  }
  @keyframes msgIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:none} }
  .ao-msg-success { background: rgba(52,211,153,.08);  border:1px solid #34d39955; color: #6ee7b7; }
  .ao-msg-error   { background: rgba(255,58,58,.08);   border:1px solid #ff3a3a55; color: #fca5a5; }
  .ao-msg-warn    { background: rgba(251,191,36,.08);  border:1px solid #fbbf2455; color: #fde68a; }

  /* Submit */
  .ao-submit {
    width: 100%; padding: 13px;
    background: linear-gradient(135deg, #7c3aed, #a855f7, #d946ef);
    border: none; border-radius: 10px;
    color: #fff;
    font-size: 14px; font-weight: 800;
    font-family: 'Rajdhani', sans-serif;
    letter-spacing: 1px;
    text-transform: uppercase;
    cursor: pointer;
    transition: all .2s;
    box-shadow: 0 4px 20px rgba(168,85,247,.32);
  }
  .ao-submit:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 28px rgba(168,85,247,.48);
    filter: brightness(1.08);
  }
  .ao-submit:disabled { opacity: .4; cursor: not-allowed; transform: none; }
  .ao-submit-all {
    background: linear-gradient(135deg, #92400e, #d97706, #fbbf24);
    box-shadow: 0 4px 20px rgba(251,191,36,.25);
  }
  .ao-submit-all:hover:not(:disabled) { box-shadow: 0 6px 26px rgba(251,191,36,.42); }

  /* Add tab hero */
  .add-tab { display: flex; flex-direction: column; }
  .add-hero {
    text-align: center; padding: 10px 0 18px;
    border-bottom: 1px solid rgba(255,255,255,.04);
    margin-bottom: 18px;
  }
  .add-gem { font-size: 32px; filter: drop-shadow(0 0 14px rgba(168,85,247,.5)); }
  .add-hero-text { font-size: 12px; color: #7c6a9a; margin-top: 7px; letter-spacing: .3px; }

  /* Players tab */
  .players-tab { display: flex; flex-direction: column; gap: 14px; }
  .pt-loading { text-align:center; color:#5a4a7a; font-size:14px; padding:40px; }

  .pt-stats {
    display: flex; gap: 10px; padding: 12px;
    background: rgba(0,0,0,.2);
    border: 1px solid rgba(168,85,247,.1);
    border-radius: 10px;
  }
  .pt-stat { flex:1; text-align:center; }
  .pt-stat-val {
    display: block;
    font-family: 'Space Mono', monospace;
    font-size: 20px; font-weight: 700;
    color: #c4b5fd;
  }
  .pt-stat-label { font-size: 9px; color: #5a4a7a; text-transform: uppercase; letter-spacing: .5px; }

  .pt-controls { display: flex; flex-direction: column; gap: 8px; }
  .pt-search { font-size: 13px; padding: 8px 12px; }
  .pt-sort-btns { display: flex; gap: 6px; }
  .pt-sort-btn {
    flex: 1;
    background: rgba(0,0,0,.2);
    border: 1px solid rgba(168,85,247,.13);
    border-radius: 6px; padding: 6px 4px;
    color: #7c6a9a;
    font-size: 10px; font-weight: 700;
    font-family: 'Rajdhani', sans-serif;
    cursor: pointer; transition: all .15s;
    white-space: nowrap; text-transform: uppercase; letter-spacing: .4px;
  }
  .pt-sort-btn:hover { color: #c4b5fd; border-color: rgba(168,85,247,.28); }
  .pt-sort-active {
    border-color: #a855f7 !important;
    color: #d8b4fe !important;
    background: rgba(168,85,247,.1) !important;
  }

  .pt-list { display: flex; flex-direction: column; gap: 5px; max-height: 310px; overflow-y: auto; }
  .pt-list::-webkit-scrollbar { width: 3px; }
  .pt-list::-webkit-scrollbar-thumb { background: #2d1f4a; border-radius: 2px; }

  .pt-empty { text-align:center; color:#5a4a7a; font-size:13px; padding:24px; }

  .pt-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 12px;
    background: rgba(0,0,0,.2);
    border: 1px solid rgba(255,255,255,.04);
    border-radius: 9px;
    transition: background .15s;
  }
  .pt-row:hover { background: rgba(168,85,247,.06); border-color: rgba(168,85,247,.14); }
  .pt-row-online { border-color: rgba(52,211,153,.1); }

  .pt-row-left  { display:flex; align-items:center; gap:10px; }
  .pt-row-right { display:flex; align-items:center; gap:5px; }

  .pt-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .pt-dot-on  { background:#34d399; box-shadow: 0 0 6px #34d39977; }
  .pt-dot-off { background:#2a3a5a; }

  .pt-row-info  { display:flex; flex-direction:column; gap:2px; }
  .pt-row-name  {
    font-family: 'Space Mono', monospace;
    font-size: 12px; font-weight: 700; color: #c8d8f8;
    display: flex; align-items: center; gap: 6px;
  }
  .pt-row-sub   { font-size: 10px; color: #4a5a7a; }
  .pt-admin-tag {
    font-size: 8px; font-weight: 700;
    background: rgba(168,85,247,.18);
    border: 1px solid rgba(168,85,247,.38);
    color: #d8b4fe;
    border-radius: 4px; padding: 1px 5px;
    font-family: 'Rajdhani', sans-serif; letter-spacing: .5px;
  }
  .pt-coin-icon { font-size: 12px; }
  .pt-row-balance {
    font-family: 'Space Mono', monospace;
    font-size: 13px; font-weight: 700;
    color: #fbbf24;
  }

  .pt-footer-note {
    font-size: 10px; color: #3a2a5a; text-align: center;
    border-top: 1px solid rgba(255,255,255,.04);
    padding-top: 10px;
  }
`;
