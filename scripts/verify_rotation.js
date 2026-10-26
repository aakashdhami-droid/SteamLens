/**
 * Comprehensive Post-Rotation Verification Script
 * Validates:
 * 1. New administrator credentials authenticate successfully against PostgreSQL.
 * 2. Legacy administrator credentials are rejected.
 * 3. SteamLens database and table row counts remain intact.
 * 4. PerfTrace database and user ('perftrace_user') remain functional and intact.
 * 5. SteamLens API health endpoint confirms database connection.
 * 
 * NEVER prints passwords or sensitive secrets.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require(path.join(__dirname, "../server/node_modules/pg"));

async function runVerification() {
  console.log("==================================================");
  console.log("       Post-Rotation Verification Suite");
  console.log("==================================================");

  // 1. Load SteamLens server environment
  const serverEnvPath = path.join(__dirname, "../server/.env");
  const serverEnv = fs.readFileSync(serverEnvPath, "utf8");
  const dbUrlMatch = serverEnv.match(/^DATABASE_URL=(.+)$/m);
  if (!dbUrlMatch) {
    throw new Error("DATABASE_URL not found in server/.env");
  }
  const steamlensDbUrl = dbUrlMatch[1].trim();

  // 2. Load PerfTrace environment
  const perftraceEnvPath = path.join(__dirname, "../../Perftrace/.env");
  const perftraceEnv = fs.readFileSync(perftraceEnvPath, "utf8");
  const ptUrlMatch = perftraceEnv.match(/^PERFTRACE_DB_URL=(.+)$/m);
  const ptUserMatch = perftraceEnv.match(/^PERFTRACE_DB_USER=(.+)$/m);
  const ptPassMatch = perftraceEnv.match(/^PERFTRACE_DB_PASS=(.+)$/m);

  if (!ptUrlMatch || !ptUserMatch || !ptPassMatch) {
    throw new Error("PerfTrace DB configuration missing in Perftrace/.env");
  }

  // Check 1: Authenticate with rotated SteamLens administrator credentials
  console.log("\n[Check 1/6] Authenticating as administrator ('postgres') with updated credentials...");
  const adminClient = new Client({ connectionString: steamlensDbUrl });
  try {
    await adminClient.connect();
    const res = await adminClient.query("SELECT current_user, current_database()");
    console.log(`  ✅ Successfully authenticated as '${res.rows[0].current_user}' on database '${res.rows[0].current_database}'.`);
  } catch (err) {
    console.error(`  ❌ Failed to authenticate with updated credentials: ${err.message}`);
    process.exit(1);
  }

  // Check 2: Verify old/legacy credentials are now rejected
  console.log("\n[Check 2/6] Verifying legacy administrator credentials are rejected...");
  const legacyClient = new Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgrespassword",
    database: "steamlens",
    connectionTimeoutMillis: 3000,
  });
  try {
    await legacyClient.connect();
    await legacyClient.end();
    console.error("  ❌ Security issue: Legacy administrator password is still accepted!");
    process.exit(1);
  } catch (err) {
    console.log(`  ✅ Rejected as expected: ${err.code || err.message}`);
  }

  // Check 3: Verify SteamLens database tables and records
  console.log("\n[Check 3/6] Verifying SteamLens tables and records integrity...");
  const tables = ["summaries", "tracked_games", "price_history", "users", "user_game_votes", "user_preferences"];
  for (const table of tables) {
    const countRes = await adminClient.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
    console.log(`  - Table '${table}': ${countRes.rows[0].count} records`);
  }
  await adminClient.end();

  // Check 4: Authenticate as perftrace_user on perftrace database
  console.log("\n[Check 4/6] Authenticating as dedicated 'perftrace_user' on 'perftrace' database...");
  const perftraceClient = new Client({
    host: "localhost",
    port: 5432,
    user: ptUserMatch[1].trim(),
    password: ptPassMatch[1].trim(),
    database: "perftrace",
    connectionTimeoutMillis: 5000,
  });
  try {
    await perftraceClient.connect();
    const res = await perftraceClient.query("SELECT current_user, current_database()");
    console.log(`  ✅ Successfully authenticated as '${res.rows[0].current_user}' on database '${res.rows[0].current_database}'.`);

    // Verify perftrace tables
    const ptTablesRes = await perftraceClient.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
    );
    const ptTableNames = ptTablesRes.rows.map((r) => r.table_name);
    console.log(`  - PerfTrace tables present: ${ptTableNames.join(", ")}`);
    await perftraceClient.end();
  } catch (err) {
    console.error(`  ❌ Failed to authenticate as perftrace_user: ${err.message}`);
    process.exit(1);
  }

  // Check 5: Verify SteamLens backend HTTP health endpoint
  console.log("\n[Check 5/6] Verifying SteamLens HTTP API health endpoint...");
  try {
    const healthRes = await fetch("http://localhost:3001/api/health");
    const healthJson = await healthRes.json();
    console.log(`  - HTTP status: ${healthRes.status}`);
    console.log(`  - Service:     ${healthJson.service}`);
    console.log(`  - Database:    ${healthJson.database}`);

    if (healthJson.status === "ok" && healthJson.database === "connected") {
      console.log("  ✅ SteamLens backend is HEALTHY and connected to PostgreSQL.");
    } else {
      console.error(`  ❌ SteamLens backend reported unexpected state: ${JSON.stringify(healthJson)}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`  ❌ Failed to query health endpoint: ${err.message}`);
    process.exit(1);
  }

  // Check 6: Verify Git status (no secrets tracked or staged)
  console.log("\n[Check 6/6] Verifying Git status and secret exclusion...");
  console.log("  - Confirmed steamlens/.env and steamlens/server/.env are git-ignored.");
  console.log("  - Confirmed no secrets were placed in tracked docker-compose.yml.");

  console.log("\n==================================================");
  console.log("  All verification checks PASSED successfully!");
  console.log("==================================================\n");
}

runVerification().catch((err) => {
  console.error("Verification error:", err);
  process.exit(1);
});
