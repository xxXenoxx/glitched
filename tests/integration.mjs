import assert from "node:assert/strict";
const base = process.env.TEST_BASE ?? "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
class Player {
  constructor(name) {
    this.name = name;
    this.tab = crypto.randomUUID();
    this.cookie = "";
    this.code = "";
    this.ip = crypto.randomUUID();
  }
  async request(action, extra = {}) {
    const body = {
      action,
      code: this.code,
      name: this.name,
      tab: this.tab,
      roundId: this.state?.round?.id,
      ...extra,
    };
    const res = await fetch(
      `${base}/api/game${action ? "" : `?code=${this.code}&tab=${this.tab}`}`,
      {
        method: action ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          Cookie: this.cookie,
          "cf-connecting-ip": this.ip,
        },
        ...(action ? { body: JSON.stringify(body) } : {}),
      },
    );
    const c = res.headers.get("set-cookie");
    if (c) this.cookie = c.split(";")[0];
    const data = await res.json();
    if (res.ok) {
      this.state = data;
      this.code = data.code;
    }
    return { status: res.status, data };
  }
  async ok(a, e) {
    const r = await this.request(a, e);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    return r.data;
  }
}
for (const n of [3, 6, 12]) {
  const players = Array.from(
      { length: n },
      (_, i) => new Player(`Test ${n}-${i}`),
    ),
    host = players[0];
  await host.ok("create");
  for (const p of players.slice(1)) {
    p.code = host.code;
    await p.ok("join");
  }
  await host.ok("settings", {
    settings: {
      ...host.state.settings,
      rounds: 3,
      answer: 120,
      discussion: 30,
      vote: 30,
    },
  });
  const stranger = new Player("Stranger");
  stranger.code = host.code;
  assert.equal((await stranger.request()).status, 401);
  assert.equal((await players[1].request("start")).status, 403);
  await host.ok("start");
  for (let round = 1; round <= 3; round++) {
    await Promise.all(players.map((p) => p.ok()));
    const prompts = players.map((p) => p.state.round.prompt);
    const counts = Object.values(Object.groupBy(prompts, (p) => p))
      .map((a) => a.length)
      .sort((a, b) => a - b);
    assert.deepEqual(counts, [1, n - 1]);
    for (const p of players) {
      assert.equal(p.state.round.number, round);
      assert.ok(!("cards" in p.state.round));
      assert.ok(!("alternate" in p.state.round));
      assert.ok(!JSON.stringify(p.state).includes("secret"));
    }
    await players[0].ok("answer", { answer: "Test answer 0" });
    await players[0].ok("answer", { answer: "Duplicate must not replace" });
    await Promise.all(
      players
        .slice(1)
        .map((p, i) => p.ok("answer", { answer: `Test answer ${i + 1}` })),
    );
    await host.ok();
    assert.equal(host.state.phase, "syncing");
    assert.ok(!("cards" in host.state.round));
    await sleep(3100);
    await Promise.all(players.map((p) => p.ok()));
    assert.equal(host.state.phase, "discussion");
    assert.equal(host.state.round.cards.length, n);
    assert.ok(host.state.round.cards.some((c) => c.answer === "Test answer 0"));
    assert.ok(
      !host.state.round.cards.some(
        (c) => c.answer === "Duplicate must not replace",
      ),
    );
    assert.ok(!host.state.round.cards.some((c) => "author" in c));
    await host.ok("openVote");
    await Promise.all(players.map((p) => p.ok()));
    assert.equal(
      (
        await host.request("vote", {
          cardId: host.state.round.cards.find((c) => c.own).id,
        })
      ).status,
      400,
    );
    await Promise.all(
      players.map((p) =>
        p.ok("vote", { cardId: p.state.round.cards.find((c) => !c.own).id }),
      ),
    );
    await host.ok();
    assert.equal(host.state.phase, "revealCountdown");
    assert.ok(!("glitchedName" in host.state.round));
    await sleep(3100);
    await Promise.all(players.map((p) => p.ok()));
    assert.equal(host.state.phase, "reveal");
    const scores = host.state.players.map((p) => p.score);
    assert.ok(host.state.round.glitchedName);
    for (const p of players)
      assert.deepEqual(
        p.state.players.map((x) => x.score),
        scores,
      );
    await Promise.all(players.map((p) => p.ok()));
    assert.deepEqual(
      host.state.players.map((p) => p.score),
      scores,
    );
    await host.ok("leaderboard");
    await host.ok("next");
    console.log(
      `${n} players, round ${round}: private prompts, concurrent answers/votes, synchronized scoring PASS`,
    );
  }
  assert.equal(host.state.phase, "finished");
  await host.ok("rematch");
  assert.equal(host.state.phase, "lobby");
  assert.ok(host.state.players.every((p) => p.score === 0));
  const oldTab = host.tab;
  host.tab = crypto.randomUUID();
  await host.ok();
  assert.equal(host.state.activeTab, false);
  assert.equal((await host.request("start")).status, 409);
  await host.ok("takeControl");
  assert.equal(host.state.activeTab, true);
  const restored = new Player(host.name);
  restored.code = host.code;
  restored.cookie = host.cookie;
  restored.tab = host.tab;
  await restored.ok();
  assert.equal(restored.state.me, host.state.me);
  host.tab = oldTab;
  console.log(
    `${n} players: full game, rematch, recovery and duplicate-tab protection PASS`,
  );
}
console.log("ALL INTEGRATION CHECKS PASSED");
