import { DEFAULT_SETTINGS, PACKS } from "../packs";
import { PROMPTS } from "./prompts";
export type Settings = typeof DEFAULT_SETTINGS;
export type Player = {
  id: string;
  name: string;
  secret: string;
  score: number;
  joined: number;
};
export type Round = {
  id: string;
  number: number;
  roster: string[];
  glitch: string;
  prompt: (typeof PROMPTS)[number];
  answers: Record<string, string>;
  votes: Record<string, string>;
  cards: { id: string; player: string }[];
  gains: Record<string, number>;
  escaped?: boolean;
  hits?: number;
};
export type Room = {
  code: string;
  host: string;
  phase: string;
  players: Player[];
  settings: Settings;
  round?: Round;
  used: string[];
  deadline: number | null;
  grace: boolean;
  notice: string;
  endedEarly?: boolean;
  created: number;
};
export type Presence = { id: string; seen: number; tab: string };
export class GameError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function requireGame(
  ok: unknown,
  message: string,
  status = 400,
): asserts ok {
  if (!ok) throw new GameError(message, status);
}
export const uid = () => crypto.randomUUID();
export function choose<T>(items: T[]): T {
  requireGame(items.length > 0, "No options available.");
  const a = new Uint32Array(1);
  let x: number;
  const lim = Math.floor(4294967296 / items.length) * items.length;
  do {
    crypto.getRandomValues(a);
    x = a[0];
  } while (x >= lim);
  return items[x % items.length];
}
export function shuffle<T>(items: T[]): T[] {
  const remaining = [...items],
    out: T[] = [];
  while (remaining.length) {
    const v = choose(remaining);
    out.push(v);
    remaining.splice(remaining.indexOf(v), 1);
  }
  return out;
}
export function settings(input: any): Settings {
  requireGame(
    input &&
      Number.isInteger(input.rounds) &&
      input.rounds >= 3 &&
      input.rounds <= 10,
    "Choose 3–10 rounds.",
  );
  for (const k of ["answer", "discussion", "vote"])
    requireGame(
      [30, 60, 90, 120].includes(input[k]),
      "Choose a supported timer.",
    );
  requireGame(
    Array.isArray(input.packs) &&
      input.packs.length > 0 &&
      input.packs.every((p: any) => PACKS.some((x) => x.id === p)),
    "Choose at least one prompt pack.",
  );
  return {
    rounds: input.rounds,
    answer: input.answer,
    discussion: input.discussion,
    vote: input.vote,
    packs: [...new Set<string>(input.packs)],
  };
}
export function online(p: Player, pres: Presence[], now: number) {
  return pres.some((x) => x.id === p.id && now - x.seen < 15000);
}
export function begin(r: Room, pres: Presence[], now: number, number: number) {
  const roster = r.players.filter((p) => online(p, pres, now)).map((p) => p.id);
  requireGame(roster.length >= 3, "At least 3 connected players are needed.");
  const pool = PROMPTS.filter(
    (p) => r.settings.packs.includes(p.pack) && !r.used.includes(p.id),
  );
  requireGame(
    pool.length,
    "This room has used every selected prompt. Start a rematch to reshuffle.",
  );
  const prompt = choose(pool);
  r.used.push(prompt.id);
  r.round = {
    id: uid(),
    number,
    roster,
    glitch: choose(roster),
    prompt,
    answers: {},
    votes: {},
    cards: shuffle(roster).map((player) => ({ id: uid(), player })),
    gains: {},
  };
  r.phase = "answering";
  r.deadline = now + r.settings.answer * 1000;
  r.grace = false;
  r.notice = "";
}
export function voidRound(r: Room, message: string) {
  r.phase = "void";
  r.deadline = null;
  r.notice = message;
  r.grace = false;
}
export function score(r: Room) {
  const q = r.round!;
  q.hits = q.roster.filter(
    (id) => id !== q.glitch && q.votes[id] === q.glitch,
  ).length;
  q.escaped = q.hits < (q.roster.length - 1) / 2;
  for (const id of q.roster) {
    const gain =
      id === q.glitch
        ? q.escaped
          ? 3 + (q.hits === 0 ? 1 : 0)
          : 0
        : q.votes[id] === q.glitch
          ? 2
          : 0;
    q.gains[id] = gain;
    const p = r.players.find((p) => p.id === id);
    if (p) p.score += gain;
  }
}
export function advance(r: Room, pres: Presence[], now: number) {
  let changed = false;
  const hostPresence = pres.find((p) => p.id === r.host);
  if (now - (hostPresence?.seen ?? r.created) > 30000) {
    const next = r.players
      .filter((p) => online(p, pres, now))
      .sort((a, b) => a.joined - b.joined)[0];
    if (next && next.id !== r.host) {
      r.host = next.id;
      changed = true;
    }
  }
  const q = r.round;
  if (!q) return changed;
  if (
    r.phase === "answering" &&
    q.roster.every((id) => q.answers[id] !== undefined)
  ) {
    r.phase = "syncing";
    r.deadline = now + 3000;
    r.notice = "";
    r.grace = false;
    return true;
  }
  if (
    r.phase === "voting" &&
    q.roster.every((id) => q.votes[id] !== undefined)
  ) {
    r.phase = "revealCountdown";
    r.deadline = now + 3000;
    r.notice = "";
    r.grace = false;
    return true;
  }
  if (r.deadline !== null && now >= r.deadline) {
    switch (r.phase) {
      case "answering":
      case "voting":
        if (!r.grace) {
          r.grace = true;
          r.notice = "Waiting on a missing submission. The host can add time.";
          r.deadline = now + 20000;
        } else
          voidRound(
            r,
            "A submission was missing. No points awarded; try a fresh prompt.",
          );
        break;
      case "syncing":
        r.phase = "discussion";
        r.deadline = now + r.settings.discussion * 1000;
        break;
      case "discussion":
        r.phase = "voting";
        r.deadline = now + r.settings.vote * 1000;
        break;
      case "revealCountdown":
        score(r);
        r.phase = "reveal";
        r.deadline = null;
        break;
    }
    return true;
  }
  return changed;
}
export function act(
  r: Room,
  me: Player,
  input: any,
  pres: Presence[],
  now: number,
) {
  const a = input.action;
  const host = me.id === r.host;
  const q = r.round;
  if (
    [
      "answer",
      "vote",
      "skip",
      "extend",
      "openVote",
      "leaderboard",
      "next",
    ].includes(a)
  )
    requireGame(
      q && input.roundId === q.id,
      "That round has changed. Your screen is refreshing.",
      409,
    );
  if (a === "answer") {
    requireGame(q && q.roster.includes(me.id), "You join the next round.");
    if (q.answers[me.id] !== undefined) return;
    requireGame(r.phase === "answering", "Answers are closed.", 409);
    const value = typeof input.answer === "string" ? input.answer.trim() : "";
    requireGame(
      value.length > 0 && value.length <= 160,
      "Write an answer of 1–160 characters.",
    );
    q.answers[me.id] = value;
    return;
  }
  if (a === "vote") {
    requireGame(q && q.roster.includes(me.id), "You join the next round.");
    if (q.votes[me.id] !== undefined) return;
    requireGame(r.phase === "voting", "Voting is closed.", 409);
    const card = q.cards.find((c) => c.id === input.cardId);
    requireGame(
      card && card.player !== me.id,
      "Choose another player's answer.",
    );
    q.votes[me.id] = card.player;
    return;
  }
  if (a === "join") return;
  requireGame(host, "Only the host can do that.", 403);
  if (a === "settings") {
    requireGame(r.phase === "lobby", "Settings lock during a game.");
    r.settings = settings(input.settings);
    return;
  }
  if (a === "start") {
    requireGame(r.phase === "lobby", "The game already started.", 409);
    begin(r, pres, now, 1);
    return;
  }
  if (a === "extend") {
    requireGame(
      ["answering", "discussion", "voting"].includes(r.phase),
      "This phase has no timer.",
    );
    r.deadline = Math.max(r.deadline ?? now, now) + 30000;
    r.notice = "The host added 30 seconds.";
    return;
  }
  if (a === "openVote") {
    requireGame(r.phase === "discussion", "Discussion has ended.", 409);
    r.phase = "voting";
    r.deadline = now + r.settings.vote * 1000;
    r.grace = false;
    r.notice = "";
    return;
  }
  if (a === "skip") {
    requireGame(
      ["answering", "syncing", "discussion", "voting"].includes(r.phase),
      "This round cannot be skipped now.",
    );
    voidRound(r, "The host skipped this round. No points awarded.");
    return;
  }
  if (a === "leaderboard") {
    requireGame(r.phase === "reveal", "Results aren't ready yet.", 409);
    r.phase = "board";
    return;
  }
  if (a === "next") {
    requireGame(
      ["board", "void"].includes(r.phase),
      "Wait for the round to finish.",
      409,
    );
    if (r.phase === "board" && q!.number >= r.settings.rounds) {
      r.phase = "finished";
      return;
    }
    begin(r, pres, now, q!.number + (r.phase === "void" ? 0 : 1));
    return;
  }
  if (a === "remove") {
    requireGame(
      ["lobby", "board", "void", "finished"].includes(r.phase),
      "Remove players between rounds.",
    );
    requireGame(input.playerId !== me.id, "Transfer hosting before leaving.");
    r.players = r.players.filter((p) => p.id !== input.playerId);
    return;
  }
  if (a === "transfer") {
    requireGame(
      r.players.some((p) => p.id === input.playerId && online(p, pres, now)),
      "Choose a connected player.",
    );
    r.host = input.playerId;
    return;
  }
  if (a === "end") {
    requireGame(r.phase !== "lobby", "The game hasn't started.");
    r.phase = "finished";
    r.deadline = null;
    r.endedEarly = true;
    return;
  }
  if (a === "rematch") {
    requireGame(r.phase === "finished", "Finish this game first.");
    r.phase = "lobby";
    r.round = undefined;
    r.used = [];
    r.deadline = null;
    r.notice = "";
    r.endedEarly = false;
    for (const p of r.players) p.score = 0;
    return;
  }
  throw new GameError("Unknown action.");
}
export function view(
  r: Room,
  me: Player,
  pres: Presence[],
  now: number,
  version: number,
  tab: string,
) {
  const q = r.round;
  const included = q?.roster.includes(me.id);
  const visible = [
    "discussion",
    "voting",
    "revealCountdown",
    "reveal",
    "board",
    "finished",
  ].includes(r.phase);
  const revealed =
    ["reveal", "board", "finished"].includes(r.phase) &&
    q &&
    Object.keys(q.gains).length > 0;
  return {
    code: r.code,
    version,
    serverNow: now,
    host: r.host,
    me: me.id,
    phase: r.phase,
    settings: r.settings,
    deadline: r.deadline,
    grace: r.grace,
    notice: r.notice,
    endedEarly: r.endedEarly,
    activeTab: pres.find((p) => p.id === me.id)?.tab === tab,
    players: r.players.map((p) => ({
      id: p.id,
      name: p.name,
      score: p.score,
      online: online(p, pres, now),
    })),
    round: q
      ? {
          id: q.id,
          number: q.number,
          total: q.roster.length,
          participating: included,
          answered: included ? q.answers[me.id] !== undefined : false,
          voted: included ? q.votes[me.id] !== undefined : false,
          answerCount: Object.keys(q.answers).length,
          voteCount: Object.keys(q.votes).length,
          ...(included && r.phase === "answering"
            ? {
                prompt:
                  me.id === q.glitch ? q.prompt.alternate : q.prompt.standard,
              }
            : {}),
          ...(visible
            ? {
                cards: q.cards.map((c, i) => ({
                  id: c.id,
                  label: `Signal ${String.fromCharCode(65 + i)}`,
                  answer: q.answers[c.player],
                  own: c.player === me.id,
                  ...(revealed
                    ? {
                        author:
                          r.players.find((p) => p.id === c.player)?.name ??
                          "Former player",
                        glitched: c.player === q.glitch,
                        votes: Object.values(q.votes).filter(
                          (v) => v === c.player,
                        ).length,
                      }
                    : {}),
                })),
              }
            : {}),
          ...(revealed
            ? {
                standard: q.prompt.standard,
                alternate: q.prompt.alternate,
                glitchedName:
                  r.players.find((p) => p.id === q.glitch)?.name ??
                  "Former player",
                glitchedId: q.glitch,
                gains: q.gains,
                escaped: q.escaped,
                hits: q.hits,
              }
            : {}),
        }
      : null,
  };
}
