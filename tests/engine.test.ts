import assert from "node:assert/strict";
import { test } from "node:test";
import {
  act,
  advance,
  begin,
  view,
  settings,
  type Room,
  type Presence,
} from "../lib/server/engine";
import { DEFAULT_SETTINGS, PACKS } from "../lib/packs";
import { PROMPTS } from "../lib/server/prompts";
function fixture(n = 3) {
  const now = 100000;
  const players = Array.from({ length: n }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    secret: `secret${i}`,
    score: 0,
    joined: now + i,
  }));
  const r: Room = {
    code: "ABCDEF",
    host: "p0",
    phase: "lobby",
    players,
    settings: structuredClone(DEFAULT_SETTINGS),
    used: [],
    deadline: null,
    grace: false,
    notice: "",
    created: now,
  };
  const p: Presence[] = players.map((x) => ({
    id: x.id,
    seen: now,
    tab: x.id,
  }));
  return { r, p, now };
}
test("120 validated unique prompt pairs, twenty per pack", () => {
  assert.equal(PROMPTS.length, 120);
  assert.equal(new Set(PROMPTS.map((p) => p.id)).size, 120);
  for (const pack of PACKS)
    assert.equal(PROMPTS.filter((p) => p.pack === pack.id).length, 20);
  for (const p of PROMPTS) {
    assert.notEqual(p.standard, p.alternate);
    assert.ok(p.standard.length > 15 && p.alternate.length > 15);
  }
});
test("exactly one alternate, no secret metadata or answer leaks, no repetition", () => {
  const { r, p, now } = fixture(12);
  for (let i = 0; i < 20; i++) {
    begin(r, p, now, i + 1);
    const views = r.players.map((me) => view(r, me, p, now, 1, me.id));
    assert.equal(
      views.filter((v) => v.round?.prompt === r.round!.prompt.alternate).length,
      1,
    );
    for (const v of views) {
      assert.ok(!JSON.stringify(v).includes("secret"));
      assert.ok(!("glitch" in v.round!));
      assert.ok(!("cards" in v.round!));
      assert.ok(!("alternate" in v.round!));
    }
  }
  assert.equal(new Set(r.used).size, 20);
});
test("submission validation, anonymity and no self-voting", () => {
  const { r, p, now } = fixture();
  begin(r, p, now, 1);
  const q = r.round!;
  assert.throws(() =>
    act(
      r,
      r.players[0],
      { action: "answer", roundId: q.id, answer: " " },
      p,
      now,
    ),
  );
  for (const me of r.players)
    act(
      r,
      me,
      { action: "answer", roundId: q.id, answer: "Same answer" },
      p,
      now,
    );
  act(
    r,
    r.players[0],
    { action: "answer", roundId: q.id, answer: "replacement" },
    p,
    now,
  );
  assert.equal(q.answers.p0, "Same answer");
  advance(r, p, now);
  assert.equal(r.phase, "syncing");
  assert.ok(!("cards" in view(r, r.players[0], p, now, 2, "p0").round!));
  advance(r, p, now + 3000);
  assert.equal(r.phase, "discussion");
  const v = view(r, r.players[0], p, now + 3000, 3, "p0");
  assert.equal(v.round!.cards!.length, 3);
  for (const card of v.round!.cards!) {
    assert.ok(!("player" in card));
    assert.ok(!("author" in card));
  }
  act(r, r.players[0], { action: "openVote", roundId: q.id }, p, now + 3000);
  assert.throws(() =>
    act(
      r,
      r.players[0],
      {
        action: "vote",
        roundId: q.id,
        cardId: q.cards.find((c) => c.player === "p0")!.id,
      },
      p,
      now + 3000,
    ),
  );
  assert.throws(() => act(r, r.players[1], { action: "end" }, p, now));
});
test("scoring thresholds and zero-vote bonus for 3, 6, 12 players; score once", () => {
  for (const n of [3, 6, 12])
    for (let hits = 0; hits < n; hits++) {
      const { r, p, now } = fixture(n);
      begin(r, p, now, 1);
      const q = r.round!;
      q.glitch = "p0";
      q.answers = Object.fromEntries(q.roster.map((id) => [id, "answer"]));
      q.votes = Object.fromEntries(
        q.roster.map((id, i) => [
          id,
          i === 0 ? "p1" : i <= hits ? "p0" : i === 1 ? "p2" : "p1",
        ]),
      );
      r.phase = "voting";
      advance(r, p, now);
      assert.equal(r.phase, "revealCountdown");
      assert.ok(r.players.every((p) => p.score === 0));
      advance(r, p, now + 3000);
      assert.equal(r.phase, "reveal");
      const expected = hits < (n - 1) / 2 ? 3 + (hits === 0 ? 1 : 0) : 0;
      assert.equal(r.players[0].score, expected);
      assert.equal(
        r.players.slice(1).reduce((a, p) => a + p.score, 0),
        hits * 2,
      );
      const scores = r.players.map((p) => p.score);
      advance(r, p, now + 5000);
      assert.deepEqual(
        r.players.map((p) => p.score),
        scores,
      );
    }
});
test("missing submissions get grace then void without points", () => {
  const { r, p, now } = fixture();
  begin(r, p, now, 1);
  advance(r, p, now + 60001);
  assert.equal(r.grace, true);
  advance(r, p, now + 80002);
  assert.equal(r.phase, "void");
  assert.ok(r.players.every((p) => p.score === 0));
});
test("host transfer after 30 seconds; disconnected roster retained", () => {
  const { r, p, now } = fixture();
  begin(r, p, now, 1);
  p[1].seen = now + 31000;
  p[2].seen = now + 31000;
  advance(r, p, now + 31000);
  assert.equal(r.host, "p1");
  assert.equal(r.round!.roster.length, 3);
});
test("reject stale round actions, wrong settings, and fewer than three players", () => {
  const { r, p, now } = fixture(2);
  assert.throws(() => begin(r, p, now, 1));
  assert.throws(() => settings({ ...DEFAULT_SETTINGS, packs: [] }));
  assert.throws(() => settings({ ...DEFAULT_SETTINGS, rounds: 11 }));
  const f = fixture();
  begin(f.r, f.p, now, 1);
  assert.throws(() =>
    act(
      f.r,
      f.r.players[0],
      { action: "answer", roundId: "old", answer: "x" },
      f.p,
      now,
    ),
  );
});
test("late join cannot receive prompt or vote; rematch resets scores and prompts", () => {
  const { r, p, now } = fixture();
  begin(r, p, now, 1);
  const late = {
    id: "late",
    name: "Late",
    secret: "late-secret",
    score: 0,
    joined: now,
  };
  r.players.push(late);
  assert.ok(!("prompt" in view(r, late, p, now, 1, "late").round!));
  assert.throws(() =>
    act(
      r,
      late,
      { action: "answer", roundId: r.round!.id, answer: "x" },
      p,
      now,
    ),
  );
  r.phase = "finished";
  r.players[0].score = 10;
  act(r, r.players[0], { action: "rematch" }, p, now);
  assert.equal(r.phase, "lobby");
  assert.equal(r.used.length, 0);
  assert.equal(r.round, undefined);
  assert.ok(r.players.every((p) => p.score === 0));
});
