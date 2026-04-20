// ═══════════════════════════════════════════════════════════════
//  AVIATOR — Multiplayer Crash Game  |  jCoin powered
//  No real money · No gambling · For entertainment purposes only
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  doc, collection, onSnapshot, setDoc, updateDoc,
  getDoc, runTransaction, serverTimestamp, query, where, getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import AdminPanel from "./AdminPanel";

/* ─────────────────────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────────────────────── */
const GAME_REF   = doc(db, "game", "state");
const pRef       = (id) => doc(db, "players", id);
const HOST_TTL   = 12_000;   // ms — stale-host timeout
const GROWTH     = 0.008;    // per 100 ms tick  →  ~8 %/s exponential
const WAIT_MS    = 5_000;    // waiting phase before each round
const CRASH_WAIT = 3_000;    // post-crash delay

/* ─────────────────────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────────────────────── */
const getOrCreatePid = () => {
  const KEY = "aviator_pid";
  return (
    localStorage.getItem(KEY) ||
    (() => {
      const id = `p_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 7)}`;
      localStorage.setItem(KEY, id);
      return id;
    })()
  );
};

/** Random crash point in [1.20 – 10.00] */
const randCrash = () =>
  parseFloat((Math.random() * 8.8 + 1.2).toFixed(2));

/** Multiplier at elapsed time since Firestore Timestamp `startTime` */
const multAt = (startTime) => {
  if (!startTime) return 1.0;
  const ms = Date.now() - startTime.toMillis();
  return ms <= 0 ? 1.0 : Math.pow(1 + GROWTH, ms / 100);
};

const fmt   = (n)  => n.toFixed(2) + "×";
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/* ─────────────────────────────────────────────────────────────
   DEFAULT GAME SHAPE
───────────────────────────────────────────────────────────── */
const BLANK_GAME = {
  status: "waiting",
  crashPoint: 2,
  multiplier: 1.0,
  history: [],
  roundId: "",
  startTime: null,
  hostId: "",
  hostLastPing: null,
};

/* ═══════════════════════════════════════════════════════════════
   APP COMPONENT
═══════════════════════════════════════════════════════════════ */
export default function App() {
  const [pid] = useState(getOrCreatePid);

  // ── State ──────────────────────────────────────────────────
  const [game,   setGame]   = useState(BLANK_GAME);
  const [player, setPlayer] = useState(null);
  const [mult,   setMult]   = useState(1.0);
  const [onlineCnt, setOnlineCnt] = useState(0);

  const [betInput, setBetInput] = useState("10");
  const [acInput,  setAcInput]  = useState("");     // auto cash-out ×

  const [flash,   setFlash]   = useState(false);
  const [toast,   setToast]   = useState(null);
  const [isHostUI, setIsHostUI] = useState(false);  // just for display badge
  const [showAdmin, setShowAdmin] = useState(false); // admin panel toggle

  // ── Refs (readable inside closures / RAF without re-render) ─
  const gameRef   = useRef(BLANK_GAME);
  const multRef   = useRef(1.0);
  const isHost    = useRef(false);
  const loopAlive = useRef(false);
  const autoDone  = useRef(false);
  const rafId     = useRef(null);
  const shownRound = useRef(""); // tracks which crash we already toasted

  // ── Derived booleans ───────────────────────────────────────
  const status   = game.status;
  const roundId  = game.roundId;
  const hasBet   = player?.betRoundId === roundId && (player?.currentBet ?? 0) > 0;
  const cashed   = hasBet && player?.cashedOut;
  const canBet   = status === "waiting" && !hasBet && (player?.jCoin ?? 0) > 0;
  const canCash  = status === "running"  && hasBet && !cashed;

  // ── Toast helper ───────────────────────────────────────────
  const showToast = useCallback((msg, type = "info") => {
    setToast({ msg, type, id: Date.now() });
  }, []);

  /* ───────────────────────────────────────────────────────────
     PLAYER — init + subscription
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const ref = pRef(pid);
    getDoc(ref).then((snap) => {
      if (!snap.exists()) {
        setDoc(ref, {
          playerId: pid,
          username: `player_${pid.slice(2, 7)}`,
          jCoin: 1000,
          currentBet: 0,
          cashedOut: false,
          cashoutMultiplier: 0,
          betRoundId: "",
          lastSeen: serverTimestamp(),
          isAdmin: false,
        });
      } else {
        updateDoc(ref, { lastSeen: serverTimestamp() });
      }
    });

    const unsub = onSnapshot(ref, (s) => {
      if (s.exists()) setPlayer(s.data());
    });
    const hb = setInterval(
      () => updateDoc(ref, { lastSeen: serverTimestamp() }).catch(() => {}),
      20_000,
    );
    return () => { unsub(); clearInterval(hb); };
  }, [pid]);

  /* ───────────────────────────────────────────────────────────
     ONLINE COUNT
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "players"), (snap) => {
      const cutoff = Date.now() - 30_000;
      setOnlineCnt(
        snap.docs.filter((d) => (d.data().lastSeen?.toMillis() ?? 0) > cutoff).length,
      );
    });
    return () => unsub();
  }, []);

  /* ───────────────────────────────────────────────────────────
     GAME STATE — subscription + host election
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const unsub = onSnapshot(GAME_REF, async (snap) => {
      if (!snap.exists()) {
        bootstrapGame(pid);
        return;
      }
      const g = snap.data();
      gameRef.current = g;
      setGame(g);

      if (g.status === "crashed") {
        setFlash(true);
        setMult(g.crashPoint);
        multRef.current  = g.crashPoint;
        autoDone.current = false;
        setTimeout(() => setFlash(false), 900);
      }
      if (g.status === "waiting") {
        setMult(1.0);
        multRef.current = 1.0;
        autoDone.current = false;
      }

      // Elect host if none or stale
      const stale = !g.hostId || Date.now() - (g.hostLastPing?.toMillis() ?? 0) > HOST_TTL;
      if (stale && !isHost.current) electHost(pid);
    });
    return () => unsub();
  }, [pid]);

  /* ───────────────────────────────────────────────────────────
     CRASH TOAST — tells player if they lost
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (
      status === "crashed" &&
      roundId !== shownRound.current &&
      player?.betRoundId === roundId &&
      !player?.cashedOut &&
      (player?.currentBet ?? 0) > 0
    ) {
      shownRound.current = roundId;
      showToast(`💸 Lost ${player.currentBet} jCoins — crashed at ${fmt(game.crashPoint)}`, "loss");
    }
  }, [status, roundId]);

  /* ───────────────────────────────────────────────────────────
     ANIMATION FRAME — live multiplier + auto cash-out
  ─────────────────────────────────────────────────────────── */
  useEffect(() => {
    const tick = () => {
      const g = gameRef.current;
      if (g?.status === "running" && g?.startTime) {
        const m = multAt(g.startTime);
        multRef.current = m;
        setMult(m);

        // Auto cash-out check
        const acv = parseFloat(acInput);
        if (
          hasBet &&
          !cashed &&
          !autoDone.current &&
          !isNaN(acv) &&
          acv > 1.01 &&
          m >= acv
        ) {
          autoDone.current = true;
          doCashOut(m);
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [hasBet, cashed, acInput]);

  /* ───────────────────────────────────────────────────────────
     BOOTSTRAP — creates the game document on first ever load
  ─────────────────────────────────────────────────────────── */
  const bootstrapGame = async (id) => {
    try {
      await setDoc(GAME_REF, {
        ...BLANK_GAME,
        crashPoint: randCrash(),
        hostId: id,
        hostLastPing: serverTimestamp(),
        roundId: Math.random().toString(36).slice(2, 10),
      });
      claimHost();
    } catch (e) { console.error("bootstrap", e); }
  };

  /* ───────────────────────────────────────────────────────────
     HOST ELECTION (Firestore transaction — only one wins)
  ─────────────────────────────────────────────────────────── */
  const electHost = async (id) => {
    try {
      let won = false;
      await runTransaction(db, async (tx) => {
        const s = await tx.get(GAME_REF);
        if (!s.exists()) return;
        const d = s.data();
        const stale = !d.hostId || Date.now() - (d.hostLastPing?.toMillis() ?? 0) > HOST_TTL;
        if (stale) {
          tx.update(GAME_REF, { hostId: id, hostLastPing: serverTimestamp() });
          won = true;
        }
      });
      if (won) claimHost();
    } catch (e) { console.error("election", e); }
  };

  const claimHost = () => {
    if (isHost.current) return;
    isHost.current = true;
    setIsHostUI(true);
    startLoop();
  };

  /* ───────────────────────────────────────────────────────────
     HOST GAME LOOP
     ► waiting 5 s → running → crash detected → wait 3 s → repeat
     ► Multiplier is NOT written to Firestore every tick;
       clients calculate it locally from startTime.
       Only state transitions are written (≈ 2 writes/round).
  ─────────────────────────────────────────────────────────── */
  const startLoop = useCallback(() => {
    if (loopAlive.current) return;
    loopAlive.current = true;

    const loop = async () => {
      while (isHost.current) {
        /* ── WAITING ── */
        try {
          await updateDoc(GAME_REF, {
            status: "waiting",
            hostLastPing: serverTimestamp(),
          });
        } catch { break; }
        await pause(WAIT_MS);
        if (!isHost.current) break;

        /* ── RUNNING ── */
        const cp  = randCrash();
        const rid = Math.random().toString(36).slice(2, 10);
        try {
          await updateDoc(GAME_REF, {
            status: "running",
            crashPoint: cp,
            roundId: rid,
            startTime: serverTimestamp(),
            multiplier: 1.0,
            hostLastPing: serverTimestamp(),
          });
        } catch { break; }

        /* ── WAIT FOR CRASH ── */
        let ticks = 0;
        let done  = false;
        while (!done && isHost.current) {
          await pause(100);
          ticks++;
          // Heartbeat every ~2 s so we're not considered stale
          if (ticks % 20 === 0) {
            updateDoc(GAME_REF, { hostLastPing: serverTimestamp() }).catch(() => {});
          }
          if (Math.pow(1 + GROWTH, ticks) >= cp) {
            done = true;
            try {
              await runTransaction(db, async (tx) => {
                const s = await tx.get(GAME_REF);
                if (!s.exists()) return;
                const d = s.data();
                const hist = [cp, ...(d.history ?? [])].slice(0, 10);
                tx.update(GAME_REF, {
                  status: "crashed",
                  multiplier: cp,
                  history: hist,
                  hostLastPing: serverTimestamp(),
                });
              });
            } catch (e) { console.error("crash write", e); }
          }
        }

        if (!isHost.current) break;
        await pause(CRASH_WAIT);
      }
      loopAlive.current = false;
    };

    loop();
  }, []);

  /* ───────────────────────────────────────────────────────────
     PLACE BET
  ─────────────────────────────────────────────────────────── */
  const placeBet = async () => {
    if (!canBet || !player) return;
    const bet = Math.floor(Number(betInput));
    if (!bet || bet <= 0)           return showToast("Enter a valid bet amount", "warn");
    if (bet > player.jCoin)         return showToast("Not enough jCoins!", "warn");

    autoDone.current = false;
    try {
      await runTransaction(db, async (tx) => {
        const ps = await tx.get(pRef(pid));
        const gs = await tx.get(GAME_REF);
        const p = ps.data(), g = gs.data();
        if (g.status !== "waiting")  throw new Error("Betting is closed — round in progress");
        if (p.jCoin < bet)           throw new Error("Insufficient jCoins");
        tx.update(pRef(pid), {
          jCoin: p.jCoin - bet,
          currentBet: bet,
          cashedOut: false,
          cashoutMultiplier: 0,
          betRoundId: g.roundId,
        });
      });
      showToast(`✅ Bet placed: ${bet} jCoins`, "ok");
    } catch (e) {
      showToast(e.message ?? "Bet failed", "warn");
    }
  };

  /* ───────────────────────────────────────────────────────────
     CASH OUT
  ─────────────────────────────────────────────────────────── */
  const doCashOut = async (m) => {
    if (!player) return;
    const cm = parseFloat(m.toFixed(2));
    try {
      await runTransaction(db, async (tx) => {
        const ps = await tx.get(pRef(pid));
        const gs = await tx.get(GAME_REF);
        const p = ps.data(), g = gs.data();
        if (g.status !== "running")       throw new Error("Round has ended");
        if (p.betRoundId !== g.roundId)   throw new Error("Round mismatch");
        if (p.cashedOut)                  throw new Error("Already cashed out");
        const win = Math.floor(p.currentBet * cm);
        tx.update(pRef(pid), {
          jCoin: p.jCoin + win,
          cashedOut: true,
          cashoutMultiplier: cm,
        });
      });
      showToast(`🎉 Cashed out at ${fmt(cm)}!`, "ok");
    } catch (e) {
      showToast(e.message ?? "Cash-out failed", "warn");
    }
  };

  const handleCashOut = () => doCashOut(multRef.current);

  /* ───────────────────────────────────────────────────────────
     COLOUR LOGIC
  ─────────────────────────────────────────────────────────── */
  const mc =
    status === "crashed" ? "#ff3a3a"
    : mult >= 5          ? "#fbbf24"
    : mult >= 2          ? "#34d399"
    :                      "#60a5fa";

  const multDisplay =
    status === "crashed" ? fmt(game.crashPoint)
    : status === "waiting" ? "1.00×"
    : fmt(mult);

  /* ═══════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════ */
  return (
    <div className="root">
      <style>{CSS}</style>

      {/* ── Crash Flash ── */}
      {flash && <div className="crash-flash" />}

      {/* ── Toast ── */}
      {toast && (
        <div key={toast.id} className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}

      {/* ─────────────── HEADER ─────────────── */}
      <header>
        <div className="brand">
          <span className="plane">✈</span>
          <span className="brand-name">AVIATOR</span>
        </div>
        <div className="header-pills">
          <div className="pill live-pill">
            <span className="live-dot" />
            LIVE
          </div>
          <div className="pill">
            <span className="pill-icon">👥</span>{onlineCnt}
          </div>
          <div className="pill balance-pill">
            <span className="pill-icon">💎</span>
            <span className="balance-num">{player?.jCoin?.toLocaleString() ?? "…"}</span>
            <span className="balance-label"> jCoin</span>
          </div>
          {player?.isAdmin && (
            <button className="pill admin-pill" onClick={() => setShowAdmin(!showAdmin)}>
              <span className="pill-icon">⚙️</span> ADMIN
            </button>
          )}
        </div>
      </header>

      {/* ─────────────── ADMIN PANEL ─────────────── */}
      {showAdmin && player?.isAdmin && (
        <AdminPanel onClose={() => setShowAdmin(false)} />
      )}

      {/* ─────────────── MULTIPLIER DISPLAY ─────────────── */}
      <section className="game-card">
        {/* Animated background particles */}
        <div className="stars">
          {Array.from({ length: 20 }, (_, i) => (
            <div key={i} className="star" style={{
              left: `${Math.random() * 100}%`,
              top:  `${Math.random() * 100}%`,
              animationDelay: `${(i * 0.37) % 3}s`,
              width:  `${1 + (i % 3)}px`,
              height: `${1 + (i % 3)}px`,
            }} />
          ))}
        </div>

        <div className={`status-badge badge-${status}`}>
          {status === "running" ? "🚀 FLYING"
          : status === "waiting" ? "⏳ NEXT ROUND"
          : "💥 CRASHED"}
        </div>

        <div
          className="multiplier"
          style={{ color: mc, textShadow: `0 0 60px ${mc}55, 0 0 20px ${mc}33` }}
        >
          {multDisplay}
        </div>

        {status === "waiting" && (
          <p className="sub-label">Place your bet before take-off ✈</p>
        )}
        {status === "crashed" && (
          <p className="sub-label crashed-label">ROUND ENDED</p>
        )}

        {/* In-flight bet info */}
        {hasBet && status === "running" && !cashed && (
          <div className="ride-info">
            <span>🎯 Riding</span>
            <span>Bet: <b>{player.currentBet}</b></span>
            <span>Value: <b style={{ color: "#34d399" }}>
              {Math.floor(player.currentBet * mult).toLocaleString()}
            </b> jCoins</span>
          </div>
        )}
        {cashed && (
          <div className="ride-info cashed-info">
            ✅ Cashed at {fmt(player.cashoutMultiplier ?? 1)}
            &nbsp;·&nbsp;
            +{Math.floor(player.currentBet * ((player.cashoutMultiplier ?? 1) - 1)).toLocaleString()} profit
          </div>
        )}
      </section>

      {/* ─────────────── BET CONTROLS ─────────────── */}
      <section className="controls-card">
        <div className="controls-row">

          {/* Bet amount */}
          <div className="field">
            <label className="field-label">Bet Amount (jCoin)</label>
            <input
              className="field-input"
              type="number"
              value={betInput}
              onChange={(e) => setBetInput(e.target.value)}
              disabled={!canBet}
              min="1"
            />
            <div className="quick-bets">
              {[10, 25, 50, 100, 250].map((v) => (
                <button
                  key={v}
                  className="qbtn"
                  onClick={() => setBetInput(String(v))}
                  disabled={!canBet}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Auto cash-out */}
          <div className="field">
            <label className="field-label">Auto Cash-Out (×)</label>
            <input
              className="field-input"
              type="number"
              placeholder="e.g.  2.00"
              value={acInput}
              onChange={(e) => setAcInput(e.target.value)}
              step="0.1"
              min="1.1"
            />
            <p className="field-hint">Leave blank to cash out manually</p>
          </div>

          {/* Action button */}
          <div className="field action-field">
            <label className="field-label">&nbsp;</label>
            {canCash ? (
              <button className="btn btn-cashout" onClick={handleCashOut}>
                <span className="btn-main">💸 CASH OUT</span>
                <span className="btn-sub">
                  {Math.floor((player?.currentBet ?? 0) * mult).toLocaleString()} jCoins
                </span>
              </button>
            ) : (
              <button className="btn btn-bet" onClick={placeBet} disabled={!canBet}>
                <span className="btn-main">
                  {status === "running"
                    ? hasBet ? "✅ BET PLACED" : "🔒 ROUND LIVE"
                    : canBet ? "🎯 PLACE BET"
                    : hasBet ? "✅ BET PLACED"
                    : "🎯 PLACE BET"}
                </span>
                {canBet && (
                  <span className="btn-sub">{betInput || 0} jCoins</span>
                )}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ─────────────── HISTORY ─────────────── */}
      <section className="history-card">
        <div className="section-title">📊 Last 10 Rounds</div>
        <div className="history-chips">
          {(game.history ?? []).length === 0 ? (
            <span className="no-history">Waiting for first round…</span>
          ) : (
            game.history.map((v, i) => (
              <span
                key={i}
                className={`chip ${v < 2 ? "chip-low" : v < 5 ? "chip-mid" : "chip-high"}`}
              >
                {fmt(v)}
              </span>
            ))
          )}
        </div>
      </section>

      {/* ─────────────── MY PROFILE ─────────────── */}
      <ProfileCard pid={pid} player={player} showToast={showToast} />

      {/* ─────────────── FOOTER ─────────────── */}
      <footer>
        🎮 <strong>This game uses jCoin only.</strong> No real money involved. For entertainment purposes only.
        {isHostUI && <span className="host-badge"> · HOST</span>}
      </footer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   PROFILE CARD — shows username, lets player rename themselves
═══════════════════════════════════════════════════════════════ */
function ProfileCard({ pid, player, showToast }) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState("");
  const [saving,  setSaving]  = useState(false);

  const startEdit = () => {
    setDraft(player?.username ?? "");
    setEditing(true);
  };

  const save = async () => {
    const name = draft.trim();
    if (!name)               return showToast("Username cannot be empty", "warn");
    if (name.length > 20)    return showToast("Max 20 characters", "warn");
    if (!/^[a-zA-Z0-9_]+$/.test(name))
      return showToast("Only letters, numbers, underscores", "warn");
    setSaving(true);
    try {
      await updateDoc(doc(db, "players", pid), { username: name });
      showToast(`✅ Username set to ${name}`, "ok");
      setEditing(false);
    } catch {
      showToast("Failed to save", "warn");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="profile-card">
      <div className="section-title">👤 My Profile</div>
      <div className="profile-row">
        <div className="profile-info">
          <span className="profile-label">Username</span>
          {editing ? (
            <input
              className="profile-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              maxLength={20}
              autoFocus
            />
          ) : (
            <span className="profile-username">{player?.username ?? "…"}</span>
          )}
          <span className="profile-hint">Admin adds jCoins by this username</span>
        </div>
        <div className="profile-actions">
          {editing ? (
            <>
              <button className="pro-btn pro-btn-save" onClick={save} disabled={saving}>
                {saving ? "…" : "Save"}
              </button>
              <button className="pro-btn pro-btn-cancel" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button className="pro-btn pro-btn-edit" onClick={startEdit}>
              ✏️ Edit
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CSS
═══════════════════════════════════════════════════════════════ */
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Space+Mono:wght@400;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  .root {
    min-height: 100vh;
    background:
      radial-gradient(ellipse 120% 60% at 50% -10%, #0d2a6a44, transparent),
      radial-gradient(ellipse 80% 40% at 80% 110%,  #1a0d4a33, transparent),
      #07091a;
    color: #c8d8f8;
    font-family: 'Rajdhani', sans-serif;
    padding: 16px;
    max-width: 720px;
    margin: 0 auto;
  }

  /* ── Header ── */
  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .brand { display: flex; align-items: center; gap: 8px; }
  .plane {
    font-size: 28px;
    filter: drop-shadow(0 0 8px #60a5fa88);
    animation: planeBob 3s ease-in-out infinite;
  }
  @keyframes planeBob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
  .brand-name {
    font-family: 'Space Mono', monospace;
    font-size: 22px;
    font-weight: 700;
    letter-spacing: 4px;
    color: #60a5fa;
    text-shadow: 0 0 20px #60a5fa66;
  }

  .header-pills { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .pill {
    display: flex; align-items: center; gap: 5px;
    background: rgba(255,255,255,.04);
    border: 1px solid rgba(96,165,250,.18);
    border-radius: 20px;
    padding: 5px 12px;
    font-size: 13px;
    font-weight: 600;
  }
  .live-pill { border-color: #34d399; color: #34d399; }
  .balance-pill { border-color: rgba(251,191,36,.25); }
  .admin-pill {
    background: rgba(168,85,247,.08);
    border-color: #a855f7;
    color: #d8b4fe;
    cursor: pointer;
    transition: all .2s;
  }
  .admin-pill:hover { background: rgba(168,85,247,.15); box-shadow: 0 0 12px rgba(168,85,247,.3); }
  .live-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: #34d399;
    animation: livePulse 1.5s ease-in-out infinite;
  }
  @keyframes livePulse {
    0%,100% { opacity:1; box-shadow: 0 0 0 0 #34d39966; }
    50%      { opacity:.6; box-shadow: 0 0 0 5px #34d39900; }
  }
  .pill-icon { font-size: 14px; }
  .balance-num { font-weight: 700; font-size: 15px; color: #fbbf24; }
  .balance-label { font-size: 11px; opacity: .6; }

  /* ── Cards ── */
  .game-card, .controls-card, .history-card {
    background: rgba(255,255,255,.025);
    border: 1px solid rgba(96,165,250,.12);
    border-radius: 16px;
    margin-bottom: 12px;
    position: relative;
    overflow: hidden;
  }

  /* ── Game Card ── */
  .game-card {
    padding: 50px 20px 30px;
    text-align: center;
    min-height: 220px;
  }
  .stars { position: absolute; inset: 0; pointer-events: none; }
  .star {
    position: absolute;
    background: #60a5fa;
    border-radius: 50%;
    opacity: .3;
    animation: starBlink 3s ease-in-out infinite;
  }
  @keyframes starBlink { 0%,100%{opacity:.15} 50%{opacity:.5} }

  .status-badge {
    position: absolute; top: 14px; left: 14px;
    border: 1px solid;
    border-radius: 20px;
    padding: 4px 12px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    font-family: 'Space Mono', monospace;
  }
  .badge-running { background: rgba(52,211,153,.08); border-color: #34d399; color: #34d399; }
  .badge-waiting { background: rgba(96,165,250,.08); border-color: #60a5fa; color: #60a5fa; }
  .badge-crashed { background: rgba(255,58,58,.08);  border-color: #ff3a3a; color: #ff3a3a; }

  .multiplier {
    font-family: 'Space Mono', monospace;
    font-size: clamp(64px, 14vw, 100px);
    font-weight: 700;
    line-height: 1;
    letter-spacing: -2px;
    transition: color .25s, text-shadow .25s;
    position: relative;
    z-index: 1;
  }

  .sub-label {
    font-size: 13px;
    opacity: .45;
    margin-top: 8px;
    letter-spacing: .5px;
  }
  .crashed-label { color: #ff6060; opacity: .7; letter-spacing: 3px; font-weight: 700; }

  .ride-info {
    display: flex;
    gap: 14px;
    justify-content: center;
    flex-wrap: wrap;
    margin-top: 14px;
    font-size: 13px;
    color: #fbbf24;
    font-weight: 600;
    position: relative;
    z-index: 1;
  }
  .cashed-info { color: #34d399; font-size: 14px; }

  /* ── Controls ── */
  .controls-card { padding: 18px; }
  .controls-row {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
    align-items: flex-end;
  }
  .field { flex: 1; min-width: 130px; }
  .action-field { min-width: 150px; flex: 0; }
  .field-label {
    display: block;
    font-size: 11px;
    color: #4a6a9a;
    text-transform: uppercase;
    letter-spacing: .8px;
    margin-bottom: 6px;
    font-weight: 700;
  }
  .field-input {
    width: 100%;
    background: rgba(0,0,0,.3);
    border: 1px solid rgba(96,165,250,.2);
    border-radius: 8px;
    padding: 10px 12px;
    color: #c8d8f8;
    font-size: 16px;
    font-weight: 700;
    outline: none;
    font-family: 'Space Mono', monospace;
    transition: border .2s;
    -moz-appearance: textfield;
  }
  .field-input::-webkit-inner-spin-button,
  .field-input::-webkit-outer-spin-button { -webkit-appearance: none; }
  .field-input:focus  { border-color: #60a5fa; }
  .field-input:disabled { opacity: .35; cursor: not-allowed; }
  .field-hint { font-size: 10px; color: #3a5a7a; margin-top: 5px; }

  .quick-bets { display: flex; gap: 5px; margin-top: 7px; }
  .qbtn {
    flex: 1;
    background: rgba(0,0,0,.25);
    border: 1px solid rgba(96,165,250,.15);
    border-radius: 5px;
    padding: 5px 0;
    color: #60a5fa;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    font-family: 'Rajdhani', sans-serif;
    transition: all .15s;
  }
  .qbtn:hover:not(:disabled) { background: rgba(96,165,250,.12); border-color: #60a5fa; }
  .qbtn:disabled { opacity: .25; cursor: not-allowed; }

  /* ── Buttons ── */
  .btn {
    width: 100%;
    border: none;
    border-radius: 10px;
    padding: 14px 10px;
    cursor: pointer;
    font-family: 'Rajdhani', sans-serif;
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    transition: all .2s;
    letter-spacing: .5px;
  }
  .btn-main { font-size: 15px; font-weight: 800; }
  .btn-sub  { font-size: 12px; font-weight: 500; opacity: .85; }

  .btn-bet {
    background: linear-gradient(135deg, #1d4ed8, #2563eb, #3b82f6);
    color: #fff;
    box-shadow: 0 4px 20px #2563eb44;
  }
  .btn-bet:hover:not(:disabled) {
    filter: brightness(1.15);
    transform: translateY(-1px);
    box-shadow: 0 6px 24px #2563eb66;
  }
  .btn-bet:disabled {
    background: rgba(255,255,255,.05);
    color: #3a5a7a;
    cursor: not-allowed;
    box-shadow: none;
  }

  .btn-cashout {
    background: linear-gradient(135deg, #c05a00, #ea580c, #f97316);
    color: #fff;
    box-shadow: 0 4px 20px #ea580c55;
    animation: cashGlow .8s ease-in-out infinite alternate;
  }
  .btn-cashout:hover {
    filter: brightness(1.15);
    transform: translateY(-1px);
  }
  @keyframes cashGlow {
    from { box-shadow: 0 4px 16px #ea580c44; }
    to   { box-shadow: 0 4px 28px #f97316aa; }
  }

  /* ── History ── */
  .history-card { padding: 16px; }
  .section-title {
    font-size: 12px;
    font-weight: 700;
    color: #4a6a9a;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 10px;
  }
  .history-chips { display: flex; flex-wrap: wrap; gap: 8px; }
  .chip {
    border-radius: 8px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 700;
    font-family: 'Space Mono', monospace;
    border: 1px solid;
  }
  .chip-low  { background: rgba(255,58,58,.1);  border-color: #ff3a3a55; color: #ff7070; }
  .chip-mid  { background: rgba(52,211,153,.1); border-color: #34d39955; color: #34d399; }
  .chip-high { background: rgba(251,191,36,.1); border-color: #fbbf2455; color: #fbbf24; }
  .no-history { font-size: 12px; color: #2a3a5a; }

  /* ── Crash Flash ── */
  .crash-flash {
    position: fixed; inset: 0;
    background: rgba(220, 20, 20, .22);
    z-index: 9000;
    pointer-events: none;
    animation: flashOut .9s ease-out forwards;
  }
  @keyframes flashOut { 0%{opacity:1} 100%{opacity:0} }

  /* ── Toast ── */
  .toast {
    position: fixed;
    top: 20px; left: 50%;
    transform: translateX(-50%);
    border-radius: 10px;
    padding: 10px 20px;
    font-size: 14px;
    font-weight: 700;
    z-index: 10000;
    white-space: nowrap;
    animation: toastAnim 3.2s ease-out forwards;
    font-family: 'Rajdhani', sans-serif;
    letter-spacing: .3px;
    border: 1px solid;
  }
  .toast-ok   { background: #07291a; border-color: #34d399; color: #6ee7b7; }
  .toast-warn { background: #291407; border-color: #f97316; color: #fdba74; }
  .toast-info { background: #071528; border-color: #60a5fa; color: #93c5fd; }
  .toast-loss { background: #290707; border-color: #ff3a3a; color: #fca5a5; }
  @keyframes toastAnim {
    0%   { opacity: 0; top: 12px; }
    10%  { opacity: 1; top: 20px; }
    80%  { opacity: 1; top: 20px; }
    100% { opacity: 0; top: 14px; }
  }

  /* ── Footer ── */
  footer {
    text-align: center;
    margin-top: 18px;
    padding-top: 14px;
    border-top: 1px solid rgba(96,165,250,.08);
    font-size: 11px;
    color: #2a3a5a;
    line-height: 1.7;
  }
  footer strong { color: #3a5a7a; }
  .host-badge { color: #1a3a6a; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: #07091a; }
  ::-webkit-scrollbar-thumb { background: #1a2a4a; border-radius: 3px; }

  /* ── Profile Card ── */
  .profile-card {
    background: rgba(255,255,255,.025);
    border: 1px solid rgba(96,165,250,.12);
    border-radius: 16px;
    margin-bottom: 12px;
    padding: 16px;
  }
  .profile-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
  }
  .profile-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    min-width: 180px;
  }
  .profile-label {
    font-size: 11px;
    color: #4a6a9a;
    text-transform: uppercase;
    letter-spacing: .8px;
    font-weight: 700;
  }
  .profile-username {
    font-family: 'Space Mono', monospace;
    font-size: 17px;
    font-weight: 700;
    color: #93c5fd;
    letter-spacing: .5px;
  }
  .profile-hint {
    font-size: 10px;
    color: #2a3a5a;
    font-style: italic;
    margin-top: 2px;
  }
  .profile-input {
    background: rgba(0,0,0,.3);
    border: 1px solid rgba(96,165,250,.3);
    border-radius: 7px;
    padding: 7px 10px;
    color: #c8d8f8;
    font-size: 15px;
    font-family: 'Space Mono', monospace;
    font-weight: 700;
    outline: none;
    width: 100%;
    max-width: 220px;
    transition: border .2s;
  }
  .profile-input:focus { border-color: #60a5fa; }
  .profile-actions { display: flex; gap: 8px; }
  .pro-btn {
    padding: 7px 14px;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 700;
    font-family: 'Rajdhani', sans-serif;
    cursor: pointer;
    border: 1px solid;
    transition: all .2s;
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  .pro-btn-edit   { background: rgba(96,165,250,.08); border-color: rgba(96,165,250,.3); color: #60a5fa; }
  .pro-btn-edit:hover { background: rgba(96,165,250,.15); }
  .pro-btn-save   { background: rgba(52,211,153,.12); border-color: #34d399; color: #34d399; }
  .pro-btn-save:hover:not(:disabled) { background: rgba(52,211,153,.2); }
  .pro-btn-save:disabled { opacity: .4; cursor: not-allowed; }
  .pro-btn-cancel { background: rgba(255,255,255,.04); border-color: rgba(255,255,255,.1); color: #6b7280; }
  .pro-btn-cancel:hover { background: rgba(255,255,255,.08); }
`;
