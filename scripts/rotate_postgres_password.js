/**
 * Secure PostgreSQL Administrator Password Rotation Script
 *
 * Responsibilities:
 * 1. Generates a strong, 32-character cryptographically random alphanumeric password.
 * 2. Safely updates the 'postgres' role password inside PostgreSQL via stdin.
 * 3. Verifies that the new password authenticates successfully over TCP.
 * 4. Updates steamlens/.env and steamlens/server/.env while preserving existing structure.
 * 5. NEVER logs, prints, or exposes password values.
 */

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Client } = require(path.join(__dirname, "../server/node_modules/pg"));

function generateSecurePassword(length = 32) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(length);
  let pass = "";
  for (let i = 0; i < length; i++) {
    pass += chars[bytes[i] % chars.length];
  }
  return pass;
}

function executePsqlStdin(sqlCommand) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", [
      "exec",
      "-i",
      "steamlens-postgres",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ]);

    let stderr = "";
    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`psql failed with exit code ${code}: ${stderr}`));
      }
    });

    child.stdin.write(sqlCommand);
    child.stdin.end();
  });
}

async function verifyAuth(password, database = "postgres") {
  const client = new Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: password,
    database: database,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const res = await client.query("SELECT current_user, current_database()");
    await client.end();
    return { success: true, user: res.rows[0].current_user, db: res.rows[0].current_database };
  } catch (err) {
    return { success: false, error: err.message, code: err.code };
  }
}

async function rotate() {
  console.log("==================================================");
  console.log("  Coordinated PostgreSQL Password Rotation");
  console.log("==================================================");

  // 1. Generate new password
  console.log("\n[1/5] Generating cryptographically random password...");
  const newPassword = generateSecurePassword(32);
  console.log("  [OK] Generated 32-character secure password.");

  // 2. Read existing .env to check current configuration
  const rootEnvPath = path.join(__dirname, "../.env");
  const serverEnvPath = path.join(__dirname, "../server/.env");

  if (!fs.existsSync(rootEnvPath)) {
    throw new Error(`Missing root .env file at ${rootEnvPath}`);
  }
  if (!fs.existsSync(serverEnvPath)) {
    throw new Error(`Missing server .env file at ${serverEnvPath}`);
  }

  // 3. Update PostgreSQL role password in database engine via stdin
  console.log("\n[2/5] Updating 'postgres' role password in database engine...");
  // Escape single quotes if any
  const escapedPassword = newPassword.replace(/'/g, "''");
  await executePsqlStdin(`ALTER ROLE postgres WITH PASSWORD '${escapedPassword}';\n`);
  console.log("  [OK] 'postgres' role password altered successfully in PostgreSQL.");

  // 4. Verify authentication with new password over TCP
  console.log("\n[3/5] Verifying authentication over TCP (localhost:5432)...");
  const authCheckNew = await verifyAuth(newPassword, "steamlens");
  if (!authCheckNew.success) {
    throw new Error(`Authentication verification failed with new password: ${authCheckNew.error}`);
  }
  console.log(`  [OK] Successfully authenticated as '${authCheckNew.user}' against database '${authCheckNew.db}'.`);

  // 5. Update configuration files
  console.log("\n[4/5] Updating configuration files...");
  
  // Update root .env
  let rootEnv = fs.readFileSync(rootEnvPath, "utf8");
  rootEnv = rootEnv
    .replace(/^POSTGRES_PASSWORD=.*$/m, `POSTGRES_PASSWORD=${newPassword}`)
    .replace(/^(DATABASE_URL=postgresql:\/\/[^:]+:)[^@]+(@.*)$/m, `$1${newPassword}$2`);
  fs.writeFileSync(rootEnvPath, rootEnv, "utf8");
  console.log("  [OK] Updated steamlens/.env (POSTGRES_PASSWORD and DATABASE_URL).");

  // Update server .env
  let serverEnv = fs.readFileSync(serverEnvPath, "utf8");
  serverEnv = serverEnv
    .replace(/^(DATABASE_URL=postgresql:\/\/[^:]+:)[^@]+(@.*)$/m, `$1${newPassword}$2`);
  fs.writeFileSync(serverEnvPath, serverEnv, "utf8");
  console.log("  [OK] Updated steamlens/server/.env (DATABASE_URL).");

  // 6. Verify table integrity
  console.log("\n[5/5] Verifying database integrity...");
  const client = new Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: newPassword,
    database: "steamlens",
  });
  await client.connect();
  const tablesRes = await client.query(
    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name"
  );
  await client.end();

  const tableNames = tablesRes.rows.map((r) => r.table_name);
  console.log(`  [OK] Verified tables in 'steamlens' database: ${tableNames.join(", ")}`);

  console.log("\n==================================================");
  console.log("  Rotation completed successfully!");
  console.log("==================================================\n");
}

rotate().catch((err) => {
  console.error("\n❌ Rotation failed:", err.message);
  process.exit(1);
});
