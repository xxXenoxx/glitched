"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Radio,
  Users,
  LockKeyhole,
  ScanLine,
  Copy,
  Check,
  ArrowRight,
  WifiOff,
  Crown,
  Shield,
  Timer,
  RotateCcw,
  Trophy,
  X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { PACKS } from "@/lib/packs";
import type { view } from "@/lib/server/engine";
type State = ReturnType<typeof view>;
const phaseNames: Record<string, string> = {
  lobby: "The waiting room",
  answering: "Keep it to yourself",
  syncing: "Signals incoming",
  discussion: "Read the room",
  voting: "Trust your suspicion",
  revealCountdown: "Finding the Glitch",
  reveal: "The truth comes out",
  board: "The standings",
  void: "Signal interrupted",
  finished: "That's a wrap",
};
function Rules() {
  return (
    <Dialog>
      <DialogTrigger className="text-button">How to play</DialogTrigger>
      <DialogContent className="rules">
        <DialogHeader>
          <DialogTitle>
            One prompt is different.
            <br />
            Nobody knows whose.
          </DialogTitle>
          <DialogDescription>
            A social deduction game for 3–12 adults. Play together in person, or
            keep your usual voice call open.
          </DialogDescription>
        </DialogHeader>
        <ol>
          <li>
            <b>Answer privately.</b> You all see a prompt. One randomly chosen
            player sees a related prompt instead. Even that player isn't told.
          </li>
          <li>
            <b>Read and discuss.</b> Anonymous answers appear together. Explain
            your thinking, but don't read your exact prompt aloud.
          </li>
          <li>
            <b>Vote for an answer.</b> Pick the signal you think belongs to the
            Glitched player. You cannot vote for yourself.
          </li>
          <li>
            <b>See the truth.</b> Both prompts, the Glitched player, answer
            authors, and vote totals are revealed.
          </li>
        </ol>
        <div className="rule-score">
          <b>+2</b> correct vote <b>+3</b> Glitch escapes <b>+1</b> zero votes
        </div>
        <p className="muted small">
          The Glitch escapes if fewer than half the other players identify them.
          Their own vote never counts toward detection. Missing submissions void
          the round. Highest score wins; ties share the win.
        </p>
      </DialogContent>
    </Dialog>
  );
}
function Choice({
  label,
  value,
  values,
  onChange,
  disabled = false,
}: {
  label: string;
  value: number;
  values: number[];
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="setting">
      <label>{label}</label>
      <Select
        value={String(value)}
        onValueChange={(v) => onChange(Number(v))}
        disabled={disabled}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={String(v)}>
              {v}
              {label === "Rounds" ? " rounds" : " seconds"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
export default function Home() {
  const [mode, setMode] = useState("create"),
    [name, setName] = useState(""),
    [code, setCode] = useState(""),
    [roomCode, setRoomCode] = useState(""),
    [state, setState] = useState<State | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(true),
    [now, setNow] = useState(Date.now()),
    [answer, setAnswer] = useState(""),
    [vote, setVote] = useState(""),
    [copied, setCopied] = useState(false),
    [confirm, setConfirm] = useState<{
      action: string;
      title: string;
      detail: string;
      playerId?: string;
    } | null>(null);
  const tab = useRef(""),
    latest = useRef<State | null>(null),
    offset = useRef(0),
    draftRound = useRef("");
  const accept = useCallback((data: State) => {
    const old = latest.current;
    if (
      old &&
      old.code === data.code &&
      (old.version > data.version || old.serverNow > data.serverNow)
    )
      return;
    latest.current = data;
    offset.current = data.serverNow - Date.now();
    setState(data);
    setConnected(true);
  }, []);
  useEffect(() => {
    tab.current = crypto.randomUUID();
    const query = new URLSearchParams(location.search).get("room");
    if (query) {
      setCode(query.toUpperCase());
      setMode("join");
    }
    const saved = localStorage.getItem("glitched-room");
    if (saved && (!query || saved === query.toUpperCase())) setRoomCode(saved);
    setName(localStorage.getItem("glitched-name") ?? "");
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (!roomCode) return;
    let stopped = false,
      t: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/game?code=${encodeURIComponent(roomCode)}&tab=${tab.current}`,
          { cache: "no-store", signal: AbortSignal.timeout(10000) },
        );
        const data = (await res.json()) as State & { error?: string };
        if (stopped) return;
        if (!res.ok) {
          if (res.status === 401 || res.status === 404) {
            setError(data.error ?? "Room unavailable.");
            setRoomCode("");
            setState(null);
            latest.current = null;
            localStorage.removeItem("glitched-room");
            setCode(roomCode);
            setMode("join");
            return;
          }
          throw Error(data.error);
        }
        accept(data);
      } catch {
        if (!stopped) setConnected(false);
      } finally {
        if (!stopped) t = setTimeout(poll, document.hidden ? 3000 : 1000);
      }
    };
    void poll();
    const wake = () => {
      if (!document.hidden) {
        clearTimeout(t);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      stopped = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [roomCode, accept]);
  useEffect(() => {
    const id = state?.round?.id ?? "";
    if (id !== draftRound.current) {
      draftRound.current = id;
      setAnswer(id ? (sessionStorage.getItem(`draft-${id}`) ?? "") : "");
      setVote("");
    }
    if (state?.round?.answered && id) sessionStorage.removeItem(`draft-${id}`);
  }, [state?.round?.id, state?.round?.answered]);
  const post = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      setBusy(true);
      setError("");
      try {
        const s = latest.current;
        const res = await fetch("/api/game", {
          method: "POST",
          signal: AbortSignal.timeout(12000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            code: s?.code ?? code,
            tab: tab.current,
            roundId: s?.round?.id,
            ...extra,
          }),
        });
        const data = (await res.json()) as State & { error?: string };
        if (!res.ok) throw Error(data.error ?? "Please try again.");
        accept(data);
        setRoomCode(data.code);
        localStorage.setItem("glitched-room", data.code);
        return data as State;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Please try again.");
        throw e;
      } finally {
        setBusy(false);
      }
    },
    [code, accept],
  );
  const send = (action: string, extra: Record<string, unknown> = {}) => {
    void post(action, extra).catch(() => {});
  };
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "read_glitched_room",
          description:
            "Read this player's current public room phase and scores. Does not reveal prompts, answers, or votes.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          execute(input: unknown) {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("No arguments expected.");
            const s = latest.current;
            return s
              ? {
                  code: s.code,
                  phase: s.phase,
                  round: s.round?.number,
                  players: s.players.map((p) => ({
                    name: p.name,
                    score: p.score,
                    online: p.online,
                  })),
                }
              : { phase: "not_joined" };
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
    return () => lifecycle.abort();
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [state?.phase, state?.round?.id]);
  const s = state,
    q = s?.round,
    isHost = s?.host === s?.me,
    seconds = Math.max(
      0,
      Math.ceil(((s?.deadline ?? 0) - (now + offset.current)) / 1000),
    );
  const active = connected && s?.activeTab && !busy;
  const myName = s?.players.find((p) => p.id === s.me)?.name;
  const ranked = s ? [...s.players].sort((a, b) => b.score - a.score) : [];
  const winners = ranked.filter((p) => p.score === ranked[0]?.score);
  const share = async () => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/?room=${s!.code}`,
      );
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(`Room code: ${s!.code}. Share this code with your friends.`);
    }
  };
  const board = (
    <div className="scores">
      {ranked.map((p, i) => (
        <div className={`score-row ${p.id === s?.me ? "you" : ""}`} key={p.id}>
          <span className="rank">
            {i === 0 ? <Crown size={20} /> : String(i + 1).padStart(2, "0")}
          </span>
          <span className="player-name">
            {p.name}
            {p.id === s?.me && <small>YOU</small>}
          </span>
          {q && "gains" in q && q.gains && (
            <span className="gain">+{q.gains[p.id] ?? 0}</span>
          )}
          <strong>
            {p.score}
            <small>PTS</small>
          </strong>
        </div>
      ))}
    </div>
  );
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="GLITCHED home">
          G<span>↯</span>
        </a>
        <span className="eyebrow">
          {s ? `ROOM / ${s.code}` : "A SOCIAL DEDUCTION GAME"}
        </span>
        <div className="header-right">
          <Rules />
          {s ? (
            <span className="identity">{myName}</span>
          ) : (
            <span className="edition">VOL. 01 / AFTER DARK</span>
          )}
        </div>
      </header>
      {error && (
        <div className="notice error" role="alert">
          <span>{error}</span>
          <button onClick={() => setError("")} aria-label="Dismiss error">
            <X size={18} />
          </button>
        </div>
      )}
      {!connected && s && (
        <div className="notice" role="status">
          <WifiOff size={18} /> Reconnecting… Your accepted answers and score
          are safe.
        </div>
      )}
      {roomCode && !s ? (
        <section className="center-state">
          <Radio size={40} />
          <h1>Finding your signal…</h1>
          <p>Reconnecting to room {roomCode}.</p>
          <button
            className="secondary"
            onClick={() => {
              setRoomCode("");
              localStorage.removeItem("glitched-room");
            }}
          >
            Back to start
          </button>
        </section>
      ) : !s ? (
        <>
          <section className="landing">
            <div className="intro">
              <div className="kicker">
                <span className="live-dot" /> TRUST YOUR FRIENDS. QUESTION
                EVERYTHING.
              </div>
              <h1 className="wordmark" data-text="GLITCHED">
                GLITCHED<span className="cursor">_</span>
              </h1>
              <h2>
                Same room.
                <br />
                <span>Different reality.</span>
              </h2>
              <p className="lede">
                Everyone has a prompt. One of you has a different one.
                <br className="desktop" /> The catch? Even they don’t know.
              </p>
              <div className="facts">
                <span>
                  <Users size={17} />
                  3–12 players
                </span>
                <span>
                  <Radio size={17} />
                  Play anywhere
                </span>
                <span>
                  <LockKeyhole size={17} />
                  No accounts
                </span>
              </div>
            </div>
            <div className="entry panel">
              <div className="panel-top">
                <ScanLine size={23} />
                <span className="eyebrow">ESTABLISH A CONNECTION</span>
                <span className="tiny-code">001</span>
              </div>
              <Tabs value={mode} onValueChange={setMode}>
                <TabsList className="entry-tabs">
                  <TabsTrigger value="create">Create a room</TabsTrigger>
                  <TabsTrigger value="join">Join a room</TabsTrigger>
                </TabsList>
              </Tabs>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  localStorage.setItem("glitched-name", name.trim());
                  send(mode, { name, code });
                }}
              >
                <label htmlFor="name">What should we call you?</label>
                <input
                  id="name"
                  placeholder="Your display name"
                  maxLength={20}
                  autoComplete="nickname"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
                {mode === "join" && (
                  <>
                    <label htmlFor="code">Room code</label>
                    <input
                      id="code"
                      className="code-input"
                      placeholder="ABCDEF"
                      maxLength={6}
                      value={code}
                      onChange={(e) =>
                        setCode(
                          e.target.value
                            .toUpperCase()
                            .replace(/[^A-Z2-9]/g, ""),
                        )
                      }
                      autoCapitalize="characters"
                      autoComplete="off"
                      required
                      minLength={6}
                    />
                  </>
                )}
                <button className="primary" disabled={busy} type="submit">
                  {busy
                    ? "Connecting…"
                    : mode === "create"
                      ? "Create room"
                      : "Join the room"}
                  <ArrowUpRight size={20} />
                </button>
              </form>
              <p className="hint">
                {mode === "create"
                  ? "Get your people together. We’ll handle the chaos."
                  : "Your friends have the code. You have your suspicions."}
              </p>
            </div>
          </section>
          <section className="how">
            <div>
              <span className="step">01 / ANSWER</span>
              <p>Keep your prompt to yourself.</p>
            </div>
            <div>
              <span className="step">02 / QUESTION</span>
              <p>Read the room. Spot the odd answer.</p>
            </div>
            <div>
              <span className="step pink">03 / EXPOSE</span>
              <p>Lock your vote. Uncover the Glitch.</p>
            </div>
          </section>
        </>
      ) : (
        <section className="game">
          <p className="sr-only" role="status">
            {phaseNames[s.phase]}
          </p>
          {!s.activeTab && (
            <div className="notice">
              This player is active in another tab.
              <button
                className="text-button"
                onClick={() => send("takeControl")}
                disabled={busy}
              >
                Play here instead
              </button>
            </div>
          )}
          <div className="phase-bar">
            <span className="eyebrow">
              {s.phase === "lobby"
                ? "BEFORE THE STATIC"
                : `ROUND ${String(q?.number ?? 1).padStart(2, "0")} / ${String(s.settings.rounds).padStart(2, "0")}`}
            </span>
            <span className="connection">
              <span className="live-dot" />
              {s.players.filter((p) => p.online).length} CONNECTED
            </span>
          </div>
          {s.notice && (
            <div className="notice" role="status">
              {s.notice}
            </div>
          )}
          {s.phase === "lobby" ? (
            <>
              <div className="game-heading">
                <div>
                  <h1>
                    The waiting room<span className="pink">.</span>
                  </h1>
                  <p>Your people. One shared reality. For now.</p>
                </div>
                <button className="room-code" onClick={share}>
                  <span>ROOM CODE</span>
                  <b>{s.code}</b>
                  {copied ? <Check size={18} /> : <Copy size={18} />}
                </button>
              </div>
              <div className="lobby-grid">
                <div>
                  <div className="section-label">
                    <span>THE LINEUP</span>
                    <span>{s.players.length} / 12</span>
                  </div>
                  <div className="players">
                    {s.players.map((p, i) => (
                      <div className="player" key={p.id}>
                        <div className="avatar">
                          {String(i + 1).padStart(2, "0")}
                        </div>
                        <div>
                          <b>{p.name}</b>
                          <span>
                            {p.id === s.me ? "You · " : ""}
                            {p.id === s.host
                              ? "Host"
                              : p.online
                                ? "Connected"
                                : "Reconnecting"}
                          </span>
                        </div>
                        {p.id === s.host ? (
                          <Crown size={17} className="host-icon" />
                        ) : (
                          <span
                            className={p.online ? "online-dot" : "offline-dot"}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="lobby-note">
                    <Shield size={20} />
                    <p>
                      Keep this tab on your own device. Your prompt is for your
                      eyes only.
                    </p>
                  </div>
                  <button
                    className="primary"
                    disabled={
                      !active ||
                      !isHost ||
                      s.players.filter((p) => p.online).length < 3
                    }
                    onClick={() => send("start")}
                  >
                    {isHost
                      ? s.players.filter((p) => p.online).length < 3
                        ? `Waiting for ${3 - s.players.filter((p) => p.online).length} more player${s.players.filter((p) => p.online).length === 2 ? "" : "s"}`
                        : "Start the game"
                      : "Waiting for the host"}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <div className="panel settings-panel">
                  <div className="section-label">
                    <span>SET THE FREQUENCY</span>
                    <span>{isHost ? "HOST CONTROLS" : "HOST DECIDES"}</span>
                  </div>
                  <div className="settings-grid">
                    <Choice
                      label="Rounds"
                      value={s.settings.rounds}
                      values={[3, 4, 5, 6, 7, 8, 9, 10]}
                      disabled={!isHost || !active}
                      onChange={(v) =>
                        send("settings", {
                          settings: { ...s.settings, rounds: v },
                        })
                      }
                    />
                    <Choice
                      label="Answer timer"
                      value={s.settings.answer}
                      values={[30, 60, 90, 120]}
                      disabled={!isHost || !active}
                      onChange={(v) =>
                        send("settings", {
                          settings: { ...s.settings, answer: v },
                        })
                      }
                    />
                    <Choice
                      label="Discussion timer"
                      value={s.settings.discussion}
                      values={[30, 60, 90, 120]}
                      disabled={!isHost || !active}
                      onChange={(v) =>
                        send("settings", {
                          settings: { ...s.settings, discussion: v },
                        })
                      }
                    />
                    <Choice
                      label="Vote timer"
                      value={s.settings.vote}
                      values={[30, 60, 90, 120]}
                      disabled={!isHost || !active}
                      onChange={(v) =>
                        send("settings", {
                          settings: { ...s.settings, vote: v },
                        })
                      }
                    />
                  </div>
                  <div className="section-label pack-label">
                    <span>PROMPT PACKS</span>
                    <span>20 PAIRS EACH</span>
                  </div>
                  {PACKS.map((p) => (
                    <label className="pack" key={p.id} htmlFor={`pack-${p.id}`}>
                      <Checkbox
                        id={`pack-${p.id}`}
                        checked={s.settings.packs.includes(p.id)}
                        disabled={!isHost || !active}
                        onCheckedChange={(checked) =>
                          send("settings", {
                            settings: {
                              ...s.settings,
                              packs: checked
                                ? [...s.settings.packs, p.id]
                                : s.settings.packs.filter((x) => x !== p.id),
                            },
                          })
                        }
                      />
                      <span>
                        <b>{p.name}</b>
                        <small>{p.description}</small>
                      </span>
                      <em className={p.id === "afterhours" ? "pink" : ""}>
                        {p.tag}
                      </em>
                    </label>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="game-heading">
                <div>
                  <h1>
                    {phaseNames[s.phase]}
                    <span className="pink">.</span>
                  </h1>
                  <p>
                    {s.phase === "answering"
                      ? "Don't overthink it. That's how the doubt gets in."
                      : s.phase === "discussion"
                        ? "One answer came from a different question. Talk it out."
                        : s.phase === "voting"
                          ? "Vote for the answer you suspect. Its author gets your vote."
                          : s.phase === "board"
                            ? "A little trust lost. A few points gained."
                            : ""}
                  </p>
                </div>
                {s.deadline && (
                  <div
                    className={`timer ${seconds <= 10 ? "urgent" : ""}`}
                    aria-label={`${seconds} seconds remaining`}
                  >
                    <Timer size={18} />
                    <b>{String(seconds).padStart(2, "0")}</b>
                    <span>SEC</span>
                  </div>
                )}
              </div>
              {q &&
                !q.participating &&
                !["finished", "board", "void"].includes(s.phase) && (
                  <div className="notice">
                    You're in the room. You'll join the next round.
                  </div>
                )}
              {s.phase === "answering" && q?.participating && (
                <div className="prompt-layout">
                  <div className="prompt-card panel">
                    <div className="section-label">
                      <span>
                        <LockKeyhole size={14} /> YOUR PRIVATE PROMPT
                      </span>
                      <span>DON'T READ ALOUD</span>
                    </div>
                    <h2>{"prompt" in q ? q.prompt : ""}</h2>
                    {q.answered ? (
                      <div className="submitted">
                        <Check size={26} />
                        <div>
                          <b>Answer locked.</b>
                          <p>Look innocent. Everyone else is still thinking.</p>
                        </div>
                      </div>
                    ) : (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          send("answer", { answer });
                        }}
                      >
                        <label htmlFor="answer">Your answer</label>
                        <textarea
                          id="answer"
                          rows={3}
                          placeholder="Say what comes to mind…"
                          maxLength={160}
                          value={answer}
                          onChange={(e) => {
                            setAnswer(e.target.value);
                            sessionStorage.setItem(
                              `draft-${q.id}`,
                              e.target.value,
                            );
                          }}
                          required
                          disabled={!s.activeTab}
                        />
                        <div className="answer-meta">
                          <span>Anonymous until the reveal</span>
                          <span>{answer.length}/160</span>
                        </div>
                        <button
                          className="primary"
                          disabled={!active || !answer.trim()}
                        >
                          {busy ? "Sending…" : "Lock my answer"}
                          <LockKeyhole size={17} />
                        </button>
                      </form>
                    )}
                  </div>
                  <aside className="round-aside">
                    <Radio size={28} />
                    <h3>
                      Everyone thinks
                      <br />
                      they belong.
                    </h3>
                    <p>
                      Most of you have the same prompt. One of you doesn't.
                      Nobody gets a warning.
                    </p>
                    <div className="progress-count">
                      <b>
                        {q.answerCount}
                        <span> / {q.total}</span>
                      </b>
                      <small>ANSWERS LOCKED</small>
                    </div>
                  </aside>
                </div>
              )}
              {(s.phase === "syncing" || s.phase === "revealCountdown") && (
                <div className="center-state reveal-count" key={s.phase}>
                  <ScanLine size={44} />
                  <div className="big-count">{seconds || "↯"}</div>
                  <h2>
                    {s.phase === "syncing"
                      ? "All answers locked."
                      : "No changing your mind now."}
                  </h2>
                  <p>
                    {s.phase === "syncing"
                      ? "Your signals are about to collide."
                      : "One of you was living in a different reality."}
                  </p>
                </div>
              )}
              {(s.phase === "discussion" || s.phase === "voting") &&
                q &&
                "cards" in q && (
                  <>
                    <div className="section-label">
                      <span>ANONYMOUS SIGNALS</span>
                      <span>
                        {s.phase === "voting"
                          ? `${q.voteCount} / ${q.total} VOTES LOCKED`
                          : "EXPLAIN YOUR ANSWER, NOT YOUR PROMPT"}
                      </span>
                    </div>
                    {s.phase === "voting" && q.participating && !q.voted ? (
                      <>
                        <RadioGroup
                          className="answer-grid"
                          value={vote}
                          onValueChange={setVote}
                          aria-label="Choose the Glitched answer"
                        >
                          {q.cards?.map((c) => (
                            <label
                              className={`signal panel ${vote === c.id ? "selected" : ""} ${c.own ? "own" : ""}`}
                              key={c.id}
                              htmlFor={c.id}
                            >
                              <div className="section-label">
                                <span>{c.label}</span>
                                <span>
                                  {c.own ? (
                                    "YOUR SIGNAL"
                                  ) : (
                                    <RadioGroupItem
                                      id={c.id}
                                      value={c.id}
                                      disabled={!s.activeTab}
                                    />
                                  )}
                                </span>
                              </div>
                              <p>{c.answer}</p>
                            </label>
                          ))}
                        </RadioGroup>
                        <button
                          className="primary vote-button"
                          disabled={!active || !vote}
                          onClick={() => send("vote", { cardId: vote })}
                        >
                          Lock my vote
                          <LockKeyhole size={17} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="answer-grid">
                          {q.cards?.map((c) => (
                            <article className="signal panel" key={c.id}>
                              <div className="section-label">
                                <span>{c.label}</span>
                                <span>{c.own ? "YOUR SIGNAL" : ""}</span>
                              </div>
                              <p>{c.answer}</p>
                            </article>
                          ))}
                        </div>
                        {q.voted && (
                          <div className="submitted compact">
                            <Check size={22} />
                            <span>Vote locked. Waiting for the others.</span>
                          </div>
                        )}
                      </>
                    )}
                    {s.phase === "discussion" && isHost && (
                      <button
                        className="secondary"
                        disabled={!active}
                        onClick={() => send("openVote")}
                      >
                        Ready? Open voting
                        <ArrowRight size={16} />
                      </button>
                    )}
                  </>
                )}
              {s.phase === "reveal" && q && "glitchedName" in q && (
                <div className="reveal" key={q.id}>
                  <div className="reveal-hero">
                    <span className="kicker pink">IDENTITY EXPOSED</span>
                    <h2>{q.glitchedName}</h2>
                    <div className="glitched-stamp">WAS GLITCHED</div>
                    <p>
                      {q.escaped
                        ? "They slipped through the static."
                        : "You caught the signal."}{" "}
                      <b>
                        {q.hits} of {q.total - 1}
                      </b>{" "}
                      other players found them.
                    </p>
                  </div>
                  <div className="prompt-pair">
                    <div className="panel">
                      <span className="step">THE SHARED PROMPT</span>
                      <h3>{q.standard}</h3>
                    </div>
                    <div className="panel alternate">
                      <span className="step pink">THE GLITCHED PROMPT</span>
                      <h3>{q.alternate}</h3>
                    </div>
                  </div>
                  <div className="answer-grid">
                    {q.cards?.map((c) => (
                      <article
                        className={`signal panel ${"glitched" in c && c.glitched ? "alternate" : ""}`}
                        key={c.id}
                      >
                        <div className="section-label">
                          <span>{"author" in c ? c.author : ""}</span>
                          <span>{"votes" in c ? c.votes : 0} VOTES</span>
                        </div>
                        <p>{c.answer}</p>
                        {"glitched" in c && c.glitched && (
                          <span className="step pink">GLITCHED</span>
                        )}
                      </article>
                    ))}
                  </div>
                  {isHost ? (
                    <button
                      className="primary vote-button"
                      disabled={!active}
                      onClick={() => send("leaderboard")}
                    >
                      See the standings
                      <ArrowRight size={18} />
                    </button>
                  ) : (
                    <p className="hint">The host will open the leaderboard.</p>
                  )}
                </div>
              )}
              {s.phase === "board" && (
                <div className="leaderboard">
                  {board}
                  {isHost ? (
                    <button
                      className="primary"
                      disabled={!active}
                      onClick={() => send("next")}
                    >
                      {q!.number >= s.settings.rounds
                        ? "Reveal the winner"
                        : "Next round"}
                      <ArrowRight size={18} />
                    </button>
                  ) : (
                    <p className="hint">Waiting for the host to continue.</p>
                  )}
                </div>
              )}
              {s.phase === "void" && (
                <div className="center-state">
                  <WifiOff size={42} />
                  <h2>No points. No hard feelings.</h2>
                  <p>
                    Reconnect your players, or remove absent players below.
                    <br />
                    At least three connected players are needed to continue.
                  </p>
                  {isHost ? (
                    <button
                      className="primary vote-button"
                      disabled={
                        !active || s.players.filter((p) => p.online).length < 3
                      }
                      onClick={() => send("next")}
                    >
                      Try a fresh prompt
                      <RotateCcw size={18} />
                    </button>
                  ) : (
                    <p className="hint">Waiting for the host.</p>
                  )}
                </div>
              )}
              {s.phase === "finished" && (
                <div className="final">
                  <div className="winner">
                    <Trophy size={40} />
                    <span className="kicker">
                      {s.endedEarly ? "GAME ENDED EARLY" : "FINAL TRANSMISSION"}
                    </span>
                    <h2>{winners.map((p) => p.name).join(" & ")}</h2>
                    <p>
                      {winners.length > 1
                        ? "Share the crown. Split the bragging rights."
                        : "Trust issues. Excellent instincts. One winner."}
                    </p>
                  </div>
                  <div className="leaderboard">
                    {board}
                    {isHost ? (
                      <button
                        className="primary"
                        disabled={!active}
                        onClick={() => send("rematch")}
                      >
                        Run it back
                        <RotateCcw size={18} />
                      </button>
                    ) : (
                      <p className="hint">The host can start a rematch.</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          {isHost && (
            <details className="host-controls">
              <summary>
                <Crown size={15} /> Host controls
              </summary>
              <div className="host-actions">
                {["answering", "discussion", "voting"].includes(s.phase) && (
                  <button
                    className="secondary"
                    disabled={!active}
                    onClick={() => send("extend")}
                  >
                    Add 30 seconds
                  </button>
                )}
                {["answering", "syncing", "discussion", "voting"].includes(
                  s.phase,
                ) && (
                  <button
                    className="secondary"
                    disabled={!active}
                    onClick={() =>
                      setConfirm({
                        action: "skip",
                        title: "Skip this round?",
                        detail:
                          "Nobody earns points. The next attempt uses a new prompt.",
                      })
                    }
                  >
                    Skip round
                  </button>
                )}
                {s.phase !== "lobby" && s.phase !== "finished" && (
                  <button
                    className="secondary danger"
                    disabled={!active}
                    onClick={() =>
                      setConfirm({
                        action: "end",
                        title: "End the game early?",
                        detail:
                          "Current scores become final. An unfinished round earns no points.",
                      })
                    }
                  >
                    End game
                  </button>
                )}
              </div>
              <div className="manage-players">
                {s.players
                  .filter((p) => p.id !== s.me)
                  .map((p) => (
                    <div key={p.id}>
                      <span>{p.name}</span>
                      <button
                        className="text-button"
                        disabled={!active || !p.online}
                        onClick={() => send("transfer", { playerId: p.id })}
                      >
                        Make host
                      </button>
                      {["lobby", "board", "void", "finished"].includes(
                        s.phase,
                      ) && (
                        <button
                          className="text-button danger"
                          disabled={!active}
                          onClick={() =>
                            setConfirm({
                              action: "remove",
                              playerId: p.id,
                              title: `Remove ${p.name}?`,
                              detail:
                                "Their seat and score will be removed. They can rejoin with the room code.",
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
              </div>
            </details>
          )}
        </section>
      )}
      <footer>
        {s ? (
          <button
            className="text-button"
            onClick={() =>
              setConfirm({
                action: "leaveLocal",
                title: "Leave this screen?",
                detail:
                  "Your seat stays in the room. Rejoin with the same browser and room code to return. An incomplete round may time out.",
              })
            }
          >
            Leave room
          </button>
        ) : (
          <span>GOOD FRIENDS. QUESTIONABLE ANSWERS.</span>
        )}
        <span>18+ · MADE FOR YOUR GROUP CHAT</span>
      </footer>
      <AlertDialog
        open={!!confirm}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.detail}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep playing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm?.action === "leaveLocal") {
                  setRoomCode("");
                  setState(null);
                  latest.current = null;
                  localStorage.removeItem("glitched-room");
                  setMode("create");
                } else if (confirm)
                  send(
                    confirm.action,
                    confirm.playerId ? { playerId: confirm.playerId } : {},
                  );
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
