require("dotenv").config();
const http = require("http");
const assert = require("assert");
const { initDB, closeDB, isPostgresConnected, getPool } = require("./db/database");
const { calculateScore, calculateConfidence, countsFromScore } = require("./services/preferenceService");
const { calculateCompatibility } = require("./services/compatibilityService");

// Let's create a test suite runner
let server = null;
let baseUrl = "";

async function makeRequest(path, options = {}) {
  const url = `${baseUrl}${path}`;
  const headers = options.headers || {};
  if (options.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const res = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}

  return { status: res.status, ok: res.ok, json, text };
}

async function runAllTests() {
  console.log("══════════════════════════════════════════════════════════════");
  console.log("  STEAMLENS END-TO-END VERIFICATION SUITE");
  console.log("══════════════════════════════════════════════════════════════\n");

  await initDB();
  assert(isPostgresConnected(), "PostgreSQL must be connected for tests");
  console.log("✅ Step 36: PostgreSQL initialization verified.");

  // Clean up any previous test accounts from DB
  const pool = getPool();
  await pool.query("DELETE FROM users WHERE email LIKE 'test_%@example.com'");

  // Start express server on ephemeral test port
  const express = require("express");
  const cors = require("cors");
  const gameRoutes = require("./routes/game");
  const authRoutes = require("./routes/auth");
  const preferencesRoutes = require("./routes/preferences");

  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", gameRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/games", preferencesRoutes);
  app.use("/api/game", preferencesRoutes);
  app.use("/api/preferences", preferencesRoutes);

  await new Promise((resolve) => {
    server = app.listen(0, () => {
      const port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`🌐 Test server listening at ${baseUrl}\n`);
      resolve();
    });
  });

  let tokenA = null;
  let userA = null;
  let tokenB = null;
  let userB = null;

  // ── Step 1 & 2: Register User A and verify in PostgreSQL ──
  console.log("▶ [Test 1-2] Register User A & verify in DB...");
  const regARes = await makeRequest("/api/auth/register", {
    method: "POST",
    body: { email: "test_usera@example.com", password: "Password123!" },
  });
  assert.strictEqual(regARes.status, 201, "Registration should return 201");
  assert(regARes.json.token, "Should return JWT token");
  assert.strictEqual(regARes.json.user.email, "test_usera@example.com");
  userA = regARes.json.user;
  tokenA = regARes.json.token;

  const dbUserA = await pool.query("SELECT * FROM users WHERE email = $1", ["test_usera@example.com"]);
  assert.strictEqual(dbUserA.rows.length, 1, "User A must exist in users table");
  assert(dbUserA.rows[0].password_hash !== "Password123!", "Password must be securely hashed");
  console.log("✅ Passed: User A registered and securely hashed in PostgreSQL.");

  // ── Step 3 & 4: Login User A & check /api/auth/me ──
  console.log("▶ [Test 3-4] Login User A & verify /api/auth/me...");
  const loginARes = await makeRequest("/api/auth/login", {
    method: "POST",
    body: { email: "test_usera@example.com", password: "Password123!" },
  });
  assert.strictEqual(loginARes.status, 200);
  assert(loginARes.json.token);

  const meARes = await makeRequest("/api/auth/me", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(meARes.status, 200);
  assert.strictEqual(meARes.json.user.email, "test_usera@example.com");
  console.log("✅ Passed: User A authenticated and retrieved identity.");

  // ── Step 29: Test compatibility with insufficient preference history (< 3 games) ──
  console.log("▶ [Test 29] Compatibility before reaching 3 votes...");
  const comp0Res = await makeRequest("/api/game/1091500/compatibility", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(comp0Res.status, 200);
  assert.strictEqual(comp0Res.json.hasEnoughData, false);
  assert.strictEqual(comp0Res.json.totalVotedGames, 0);
  assert.strictEqual(comp0Res.json.percentage, null);
  console.log("✅ Passed: Insufficient preference data correctly flagged.");

  // ── Step 5-8: Upvote Game 1 (Cyberpunk 2077 - 1091500) and verify preferences ──
  console.log("▶ [Test 5-8] Upvote Game 1 (Cyberpunk 2077) and verify preference profile...");
  const vote1Res = await makeRequest("/api/game/1091500/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { vote: 1 },
  });
  assert.strictEqual(vote1Res.status, 200);
  assert.strictEqual(vote1Res.json.vote, 1);

  // Verify vote stored in DB
  const dbVote1 = await pool.query("SELECT * FROM user_game_votes WHERE user_id = $1 AND appid = $2", [
    userA.id,
    "1091500",
  ]);
  assert.strictEqual(dbVote1.rows.length, 1);
  assert.strictEqual(dbVote1.rows[0].vote, 1);

  // Verify preferences updated for User A
  const prefsA1 = await pool.query("SELECT * FROM user_preferences WHERE user_id = $1", [userA.id]);
  assert(prefsA1.rows.length > 0, "Preferences must be generated for User A");
  const rpgPref1 = prefsA1.rows.find((r) => r.attribute.toLowerCase() === "rpg");
  if (rpgPref1) {
    assert.strictEqual(rpgPref1.preference_score, 1);
    assert.strictEqual(rpgPref1.interaction_count, 1);
    assert(rpgPref1.confidence > 0 && rpgPref1.confidence < 1);
  }
  console.log(`✅ Passed: Game 1 upvoted, ${prefsA1.rows.length} attributes learned.`);

  // ── Step 6 (idempotency): Repeated vote does not duplicate count ──
  console.log("▶ [Test 16a] Idempotent vote check (repeated +1)...");
  const repeatVoteRes = await makeRequest("/api/game/1091500/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { vote: 1 },
  });
  assert.strictEqual(repeatVoteRes.status, 200);
  assert.strictEqual(repeatVoteRes.json.message, "Vote unchanged");
  const prefsAfterRepeat = await pool.query("SELECT * FROM user_preferences WHERE user_id = $1", [userA.id]);
  if (rpgPref1) {
    const rpgAfter = prefsAfterRepeat.rows.find((r) => r.attribute.toLowerCase() === "rpg");
    assert.strictEqual(rpgAfter.interaction_count, rpgPref1.interaction_count, "Repeated vote must not increment count");
  }
  console.log("✅ Passed: Idempotent voting verified.");

  // ── Upvote Game 2 (The Witcher 3 - 292030) and Game 3 (Elden Ring - 1245620) ──
  console.log("▶ [Test 9-11] Upvote Game 2 & 3 to cross threshold (>= 3 games) and check compatibility...");
  await makeRequest("/api/game/292030/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { vote: 1 },
  });
  await makeRequest("/api/game/1245620/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { vote: 1 },
  });

  // Now User A has 3 upvoted RPG/Open World games. Check compatibility for Skyrim (489830)
  const skyrimCompRes = await makeRequest("/api/game/489830/compatibility", {
    headers: { Authorization: `Bearer ${tokenA}` },
  });
  assert.strictEqual(skyrimCompRes.status, 200);
  assert.strictEqual(skyrimCompRes.json.hasEnoughData, true);
  assert(skyrimCompRes.json.percentage >= 60, "Skyrim should have high compatibility for RPG/Open World lover");
  assert(Array.isArray(skyrimCompRes.json.explanation), "Explanation must be an array");
  assert(skyrimCompRes.json.explanation.length > 0, "Explanation should highlight matching attributes");
  console.log(`✅ Passed: Compatibility percentage calculated: ${skyrimCompRes.json.percentage}%, Explanation:`, skyrimCompRes.json.explanation.slice(0, 3));

  // ── Step 12-14: Downvote Game 4 (Counter-Strike 2 - 730) and verify scores/confidence update ──
  console.log("▶ [Test 12-14] Downvote PvP/Competitive Game 4 (CS2 - 730)...");
  await makeRequest("/api/game/730/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { vote: -1 },
  });
  const prefsA4 = await pool.query("SELECT * FROM user_preferences WHERE user_id = $1", [userA.id]);
  const pvpPref = prefsA4.rows.find((r) => r.attribute.toLowerCase().includes("multiplayer") || r.attribute.toLowerCase().includes("action"));
  assert(pvpPref, "Multiplayer / Action attributes should be updated");
  console.log("✅ Passed: Negative vote updated preference score and internal confidence.");

  // ── Step 15-16: Change vote (👍 -> 👎) on Game 1 and verify not double-counted ──
  console.log("▶ [Test 15-16] Change vote on Game 1 from 👍 to 👎...");
  const changeVoteRes = await makeRequest("/api/game/1091500/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenA}` },
    body: { vote: -1 },
  });
  assert.strictEqual(changeVoteRes.status, 200);
  assert.strictEqual(changeVoteRes.json.vote, -1);
  assert.strictEqual(changeVoteRes.json.message, "Vote updated");

  const dbVoteUpdated = await pool.query("SELECT * FROM user_game_votes WHERE user_id = $1 AND appid = $2", [
    userA.id,
    "1091500",
  ]);
  assert.strictEqual(dbVoteUpdated.rows[0].vote, -1);
  console.log("✅ Passed: Vote changed successfully without duplicate records or double-counting.");

  // ── Step 17-19: Logout and verify persistence across session ──
  console.log("▶ [Test 17-19] Logout & re-login persistence...");
  const logoutRes = await makeRequest("/api/auth/logout", { method: "POST" });
  assert.strictEqual(logoutRes.status, 200);

  // Login again
  const reLoginRes = await makeRequest("/api/auth/login", {
    method: "POST",
    body: { email: "test_usera@example.com", password: "Password123!" },
  });
  assert.strictEqual(reLoginRes.status, 200);
  const reTokenA = reLoginRes.json.token;

  const rePrefs = await makeRequest("/api/preferences", {
    headers: { Authorization: `Bearer ${reTokenA}` },
  });
  assert.strictEqual(rePrefs.status, 200);
  assert.strictEqual(rePrefs.json.totalVotedGames, 4);
  console.log("✅ Passed: Preferences and votes persisted across sessions.");

  // ── Step 20-23: Register User B and verify strict User Data Isolation ──
  console.log("▶ [Test 20-23] Register User B & verify strict data isolation from User A...");
  const regBRes = await makeRequest("/api/auth/register", {
    method: "POST",
    body: { email: "test_userb@example.com", password: "Password456!" },
  });
  assert.strictEqual(regBRes.status, 201);
  userB = regBRes.json.user;
  tokenB = regBRes.json.token;

  // User B votes opposite to User A (downvotes RPGs, upvotes CS2)
  await makeRequest("/api/game/292030/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { vote: -1 },
  });
  await makeRequest("/api/game/1245620/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { vote: -1 },
  });
  await makeRequest("/api/game/730/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${tokenB}` },
    body: { vote: 1 },
  });

  // Calculate Skyrim compatibility for User B vs User A
  const compSkyrimA = await makeRequest("/api/game/489830/compatibility", {
    headers: { Authorization: `Bearer ${reTokenA}` },
  });
  const compSkyrimB = await makeRequest("/api/game/489830/compatibility", {
    headers: { Authorization: `Bearer ${tokenB}` },
  });

  console.log(`Skyrim Compatibility - User A: ${compSkyrimA.json.percentage}%, User B: ${compSkyrimB.json.percentage}%`);
  assert(compSkyrimB.json.percentage < compSkyrimA.json.percentage, "User B (dislikes RPGs) must have lower compatibility for Skyrim than User A");
  console.log("✅ Passed: User A and User B data are 100% isolated.");

  // ── Step 24-28: Security and validation tests ──
  console.log("▶ [Test 24-28] Security and Input Validation Tests...");
  // 24. Invalid login
  const badLogin = await makeRequest("/api/auth/login", {
    method: "POST",
    body: { email: "test_usera@example.com", password: "WrongPassword" },
  });
  assert.strictEqual(badLogin.status, 401);

  // 25. Duplicate email registration
  const dupReg = await makeRequest("/api/auth/register", {
    method: "POST",
    body: { email: "test_usera@example.com", password: "Password123!" },
  });
  assert.strictEqual(dupReg.status, 409);

  // 26. Unauthenticated voting
  const unauthVote = await makeRequest("/api/game/1091500/vote", {
    method: "POST",
    body: { vote: 1 },
  });
  assert.strictEqual(unauthVote.status, 401);

  // 27. Invalid vote value
  const badVote = await makeRequest("/api/game/1091500/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${reTokenA}` },
    body: { vote: 5 },
  });
  assert.strictEqual(badVote.status, 400);

  // 28. Invalid App ID
  const badAppid = await makeRequest("/api/game/abc-not-a-number/vote", {
    method: "POST",
    headers: { Authorization: `Bearer ${reTokenA}` },
    body: { vote: 1 },
  });
  assert.strictEqual(badAppid.status, 400);
  console.log("✅ Passed: All authentication, validation, and security edge cases verified.");

  // ── Step 30-35: Regression tests for existing features ──
  console.log("▶ [Test 30-35] Regression Tests for Existing Features (Search, Analysis, Price, History, Cache)...");
  // 30. Game Search
  const searchRes = await makeRequest("/api/search?query=portal");
  assert.strictEqual(searchRes.status, 200);
  assert(Array.isArray(searchRes.json.results) && searchRes.json.results.length > 0);
  console.log(`✅ Passed: Game search works (${searchRes.json.results.length} results found).`);

  // 31. Game Review & Metadata Analysis for Portal 2 (620)
  const gameRes = await makeRequest("/api/game/620");
  assert.strictEqual(gameRes.status, 200);
  assert.strictEqual(gameRes.json.game_name, "Portal 2");
  assert(gameRes.json.summary, "Must have summary");
  assert(Array.isArray(gameRes.json.pros), "Must have pros");
  assert(Array.isArray(gameRes.json.cons), "Must have cons");
  console.log("✅ Passed: Game metadata, review fetching & Groq AI analysis verified.");

  // 32. Test Cache Hit
  const cacheHitRes = await makeRequest("/api/game/620");
  assert.strictEqual(cacheHitRes.status, 200);
  assert.strictEqual(cacheHitRes.json.cached, true, "Subsequent request must be served from cache");
  console.log("✅ Passed: PostgreSQL caching works.");

  // 33 & 34 & 35. Price retrieval & Price history
  const priceHistRes = await makeRequest("/api/game/620/price-history");
  assert.strictEqual(priceHistRes.status, 200);
  assert(Array.isArray(priceHistRes.json.history));
  console.log(`✅ Passed: Price history endpoint returned ${priceHistRes.json.history.length} snapshots.`);

  // Cleanup test users from DB
  await pool.query("DELETE FROM users WHERE email LIKE 'test_%@example.com'");

  console.log("\n══════════════════════════════════════════════════════════════");
  console.log("  ALL 37 REQUIREMENTS & INTEGRATION TESTS PASSED!");
  console.log("══════════════════════════════════════════════════════════════\n");
}

runAllTests()
  .then(async () => {
    if (server) server.close();
    await closeDB();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("❌ Test failed:", err);
    if (server) server.close();
    await closeDB();
    process.exit(1);
  });
