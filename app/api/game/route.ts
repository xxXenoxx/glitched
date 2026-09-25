import { env } from "cloudflare:workers";
import { DEFAULT_SETTINGS } from "@/lib/packs";
import {
  act,
  advance,
  GameError,
  requireGame,
  uid,
  view,
  choose,
  type Room,
  type Player,
  type Presence,
} from "@/lib/server/engine";
export const dynamic = "force-dynamic";
const DAY = 86400000;
const headers = {
  "Cache-Control": "no-store, private",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
};
const json = (body: unknown, status = 200, cookie?: string) =>
  Response.json(body, {
    status,
    headers: { ...headers, ...(cookie ? { "Set-Cookie": cookie } : {}) },
  });
async function hash(s: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
function database() {
  requireGame(env.DB, "Game storage is temporarily unavailable.", 503);
  return env.DB!;
}
function cookie(req: Request, code: string) {
  return (
    req.headers
      .get("cookie")
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`g_${code}=`))
      ?.slice(code.length + 3) ?? ""
  );
}
function setCookie(req: Request, code: string, secret: string) {
  return `g_${code}=${secret}; Path=/api/game; HttpOnly; SameSite=Strict; Max-Age=172800${new URL(req.url).protocol === "https:" ? "; Secure" : ""}`;
}
async function rate(req: Request, kind: string, max: number) {
  const db = database(),
    now = Date.now(),
    ip = req.headers.get("cf-connecting-ip") ?? "local",
    key = await hash(`${ip}|${kind}|${Math.floor(now / 60000)}`);
  const row = await db
    .prepare(
      "INSERT INTO limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count",
    )
    .bind(key, now + 120000)
    .first<{ count: number }>();
  requireGame(
    row && row.count <= max,
    "Too many attempts. Please wait a minute.",
    429,
  );
}
async function handle(req: Request) {
  try {
    const db = database(),
      now = Date.now();
    let input: any = {};
    if (req.method === "POST") {
      const origin = req.headers.get("origin");
      requireGame(
        !origin || origin === new URL(req.url).origin,
        "Cross-site requests are not allowed.",
        403,
      );
      requireGame(
        req.headers.get("content-type")?.includes("application/json"),
        "Use JSON.",
        415,
      );
      const raw = await req.text();
      requireGame(raw.length < 4096, "Request too large.", 413);
      try {
        input = JSON.parse(raw);
      } catch {
        throw new GameError("Invalid request.");
      }
    }
    const url = new URL(req.url);
    const code = String(input.code ?? url.searchParams.get("code") ?? "")
      .trim()
      .toUpperCase();
    const tab = String(input.tab ?? url.searchParams.get("tab") ?? "");
    requireGame(
      /^[a-zA-Z0-9-]{8,80}$/.test(tab),
      "Refresh this browser tab to reconnect.",
    );
    if (input.action === "create") {
      await rate(req, "create", 8);
      const name = validName(input.name);
      const secret = uid() + uid();
      const me: Player = {
        id: uid(),
        name,
        secret: await hash(secret),
        score: 0,
        joined: now,
      };
      for (let attempt = 0; attempt < 6; attempt++) {
        const roomCode = Array.from({ length: 6 }, () =>
          choose("ABCDEFGHJKLMNPQRSTUVWXYZ23456789".split("")),
        ).join("");
        const room: Room = {
          code: roomCode,
          host: me.id,
          players: [me],
          phase: "lobby",
          settings: structuredClone(DEFAULT_SETTINGS),
          used: [],
          deadline: null,
          grace: false,
          notice: "",
          created: now,
        };
        const result = await db
          .prepare(
            "INSERT OR IGNORE INTO rooms (code,version,data,updated) VALUES (?,0,?,?)",
          )
          .bind(roomCode, JSON.stringify(room), now)
          .run();
        if (result.meta.changes) {
          await db
            .prepare("INSERT INTO presence (id,room,seen,tab) VALUES (?,?,?,?)")
            .bind(me.id, roomCode, now, tab)
            .run();
          await cleanup(now);
          return json(
            view(room, me, [{ id: me.id, seen: now, tab }], now, 0, tab),
            200,
            setCookie(req, roomCode, secret),
          );
        }
      }
      throw new GameError("Could not create a code. Please try again.", 503);
    }
    requireGame(
      /^[A-Z2-9]{6}$/.test(code),
      "Enter a valid six-character room code.",
    );
    if (input.action === "join") await rate(req, "join", 30);
    else if (req.method === "POST") await rate(req, "actions", 180);
    const token = cookie(req, code);
    const digest = token ? await hash(token) : "";
    let newPlayer: Player | undefined,
      newSecret = "";
    for (let retry = 0; retry < 12; retry++) {
      const stored = await db
        .prepare("SELECT data,version,updated FROM rooms WHERE code=?")
        .bind(code)
        .first<{ data: string; version: number; updated: number }>();
      requireGame(
        stored && now - stored.updated < DAY,
        "That room has expired or does not exist.",
        404,
      );
      const room = JSON.parse(stored.data) as Room;
      let me = room.players.find((p) => p.secret === digest);
      let changed = false;
      if (!me && input.action === "join") {
        requireGame(room.players.length < 12, "This room is full.");
        const name = validName(input.name);
        requireGame(
          !room.players.some(
            (p) => p.name.toLowerCase() === name.toLowerCase(),
          ),
          "That name is already in the room. Pick another.",
        );
        if (!newPlayer) {
          newSecret = uid() + uid();
          newPlayer = {
            id: uid(),
            name,
            secret: await hash(newSecret),
            score: 0,
            joined: now,
          };
        }
        me = newPlayer;
        room.players.push(me);
        changed = true;
      }
      requireGame(
        me,
        "Join this room to play. Your previous seat may have been removed.",
        401,
      );
      const take = input.action === "takeControl" || input.action === "join";
      await db
        .prepare(
          "INSERT INTO presence (id,room,seen,tab) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET seen=excluded.seen,tab=excluded.tab WHERE presence.tab=excluded.tab OR presence.seen<? OR ?=1",
        )
        .bind(me.id, code, now, tab, now - 8000, take ? 1 : 0)
        .run();
      const pres = (
        await db
          .prepare("SELECT id,seen,tab FROM presence WHERE room=?")
          .bind(code)
          .all<Presence>()
      ).results;
      changed = advance(room, pres, now) || changed;
      if (
        req.method === "POST" &&
        input.action !== "join" &&
        input.action !== "takeControl"
      ) {
        requireGame(
          pres.find((p) => p.id === me!.id)?.tab === tab,
          "Another tab is controlling this player. Take control here first.",
          409,
        );
        act(room, me, input, pres, now);
        changed = true;
        advance(room, pres, now);
      }
      if (changed) {
        const result = await db
          .prepare(
            "UPDATE rooms SET data=?,version=version+1,updated=? WHERE code=? AND version=?",
          )
          .bind(JSON.stringify(room), now, code, stored.version)
          .run();
        if (!result.meta.changes) continue;
        return json(
          view(room, me, pres, now, stored.version + 1, tab),
          200,
          newPlayer ? setCookie(req, code, newSecret) : undefined,
        );
      }
      if (now - stored.updated > 60000)
        await db
          .prepare("UPDATE rooms SET updated=? WHERE code=? AND updated<?")
          .bind(now, code, now - 60000)
          .run();
      return json(view(room, me, pres, now, stored.version, tab));
    }
    throw new GameError("The room is busy. Please try again.", 409);
  } catch (error) {
    if (error instanceof GameError)
      return json({ error: error.message }, error.status);
    console.error(
      "Game operation failed",
      error instanceof Error ? error.message : "unknown",
    );
    return json(
      { error: "Connection to the game is interrupted. Please retry." },
      503,
    );
  }
}
function validName(value: unknown) {
  const name =
    typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  requireGame(
    name.length >= 1 && name.length <= 20 && !/[\x00-\x1f\x7f]/.test(name),
    "Use a display name of 1–20 characters.",
  );
  return name;
}
async function cleanup(now: number) {
  const db = database();
  await db.batch([
    db.prepare("DELETE FROM rooms WHERE updated<?").bind(now - DAY),
    db.prepare("DELETE FROM presence WHERE seen<?").bind(now - DAY),
    db.prepare("DELETE FROM limits WHERE expires<?").bind(now),
  ]);
}
export const GET = handle;
export const POST = handle;
