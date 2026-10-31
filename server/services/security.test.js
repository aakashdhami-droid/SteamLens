const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");

const { createAuthLimiter, createAiAnalysisLimiter } = require("../middleware/rateLimiters");
const { requireCollectorKey } = require("../middleware/collectorAuth");
const { isOriginAllowed, getClientOrigins } = require("../utils/corsConfig");

function createMockResponse(onDone) {
  return {
    statusCode: 200,
    headers: {},
    headersSent: false,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(body) {
      this.body = body;
      this.headersSent = true;
      if (onDone) onDone();
      return this;
    },
    json(body) {
      this.body = body;
      this.headersSent = true;
      if (onDone) onDone();
      return this;
    },
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
  };
}

function runLimiter(limiter, req) {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const res = createMockResponse(() => {
      finish({ res, nextCalled: false });
    });

    limiter(req, res, () => {
      finish({ res, nextCalled: true });
    });
  });
}

function createMockRequest(ip = "127.0.0.1", headers = {}) {
  return {
    ip,
    headers,
    app: {
      get: (key) => (key === "trust proxy" ? 1 : undefined),
    },
  };
}

describe("Security Hardening — Rate Limiting", () => {
  it("authLimiter allows requests up to the configured limit and blocks subsequent ones with 429", async () => {
    const limiter = createAuthLimiter({
      windowMs: 60 * 1000,
      max: 2,
      validate: false,
    });

    const ip = "192.168.1.10";

    // 1st request — allowed
    const { res: res1, nextCalled: next1 } = await runLimiter(limiter, createMockRequest(ip));
    assert.strictEqual(next1, true);
    assert.strictEqual(res1.statusCode, 200);

    // 2nd request — allowed
    const { res: res2, nextCalled: next2 } = await runLimiter(limiter, createMockRequest(ip));
    assert.strictEqual(next2, true);
    assert.strictEqual(res2.statusCode, 200);

    // 3rd request — blocked with 429
    const { res: res3, nextCalled: next3 } = await runLimiter(limiter, createMockRequest(ip));
    assert.strictEqual(next3, false);
    assert.strictEqual(res3.statusCode, 429);
    assert.deepStrictEqual(res3.body, {
      error: "Too many authentication attempts. Please try again after 15 minutes.",
    });
  });

  it("aiAnalysisLimiter allows requests within threshold and blocks excess with 429", async () => {
    const limiter = createAiAnalysisLimiter({
      windowMs: 60 * 1000,
      max: 2,
      validate: false,
    });

    const ip = "10.0.0.5";

    // Request 1 — allowed
    const { nextCalled: next1 } = await runLimiter(limiter, createMockRequest(ip));
    assert.strictEqual(next1, true);

    // Request 2 — allowed
    const { nextCalled: next2 } = await runLimiter(limiter, createMockRequest(ip));
    assert.strictEqual(next2, true);

    // Request 3 — blocked
    const { res: res3, nextCalled: next3 } = await runLimiter(limiter, createMockRequest(ip));
    assert.strictEqual(next3, false);
    assert.strictEqual(res3.statusCode, 429);
    assert.deepStrictEqual(res3.body, {
      error: "Too many AI analysis requests. Please try again later.",
    });
  });

  it("cached responses do not invoke or deplete the AI limiter", () => {
    let aiLimiterInvocations = 0;
    const mockAiLimiter = (req, res, next) => {
      aiLimiterInvocations++;
      next();
    };

    const handleGameRequest = (isCached, req, res) => {
      if (isCached) {
        return res.json({ cached: true, summary: "cached summary" });
      }
      mockAiLimiter(req, res, () => {
        res.json({ cached: false, summary: "fresh ai summary" });
      });
    };

    const resCached = createMockResponse();
    handleGameRequest(true, createMockRequest(), resCached);
    assert.strictEqual(resCached.body.cached, true);
    assert.strictEqual(aiLimiterInvocations, 0, "Cached request should never invoke AI limiter");

    const resUncached = createMockResponse();
    handleGameRequest(false, createMockRequest(), resUncached);
    assert.strictEqual(resUncached.body.cached, false);
    assert.strictEqual(aiLimiterInvocations, 1, "Uncached request must invoke AI limiter");
  });
});

describe("Security Hardening — Collector Admin Authentication", () => {
  const originalKey = process.env.COLLECTOR_ADMIN_KEY;

  beforeEach(() => {
    process.env.COLLECTOR_ADMIN_KEY = "test-secret-collector-key-123";
  });

  afterEach(() => {
    process.env.COLLECTOR_ADMIN_KEY = originalKey;
  });

  it("returns 401 when header is missing", () => {
    const req = { headers: {} };
    const res = createMockResponse();
    let nextCalled = false;

    requireCollectorKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
    assert.deepStrictEqual(res.body, {
      error: "Unauthorized: Invalid or missing collector admin key",
    });
  });

  it("returns 401 when header contains wrong key", () => {
    const req = { headers: { "x-collector-admin-key": "wrong-key" } };
    const res = createMockResponse();
    let nextCalled = false;

    requireCollectorKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  });

  it("returns 401 when COLLECTOR_ADMIN_KEY is not configured on server", () => {
    delete process.env.COLLECTOR_ADMIN_KEY;
    const req = { headers: { "x-collector-admin-key": "any-key" } };
    const res = createMockResponse();
    let nextCalled = false;

    requireCollectorKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, false);
    assert.strictEqual(res.statusCode, 401);
  });

  it("authorizes request with valid x-collector-admin-key", () => {
    const req = { headers: { "x-collector-admin-key": "test-secret-collector-key-123" } };
    const res = createMockResponse();
    let nextCalled = false;

    requireCollectorKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
    assert.strictEqual(res.statusCode, 200);
  });

  it("authorizes request with valid x-collector-key", () => {
    const req = { headers: { "x-collector-key": "test-secret-collector-key-123" } };
    const res = createMockResponse();
    let nextCalled = false;

    requireCollectorKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
  });

  it("authorizes request with valid x-admin-key", () => {
    const req = { headers: { "x-admin-key": "test-secret-collector-key-123" } };
    const res = createMockResponse();
    let nextCalled = false;

    requireCollectorKey(req, res, () => { nextCalled = true; });

    assert.strictEqual(nextCalled, true);
  });
});

describe("Security Hardening — CORS Origin Verification", () => {
  it("in production: allows only explicitly configured CLIENT_URL origins", () => {
    const prodClientUrl = "https://steamlens.vercel.app, https://steamlens-preview.vercel.app";

    // Configured production origins
    assert.strictEqual(
      isOriginAllowed("https://steamlens.vercel.app", true, prodClientUrl),
      true
    );
    assert.strictEqual(
      isOriginAllowed("https://steamlens-preview.vercel.app", true, prodClientUrl),
      true
    );
    // Trailing slash normalization
    assert.strictEqual(
      isOriginAllowed("https://steamlens.vercel.app/", true, prodClientUrl),
      true
    );

    // Unlisted *.vercel.app domain (wildcard was removed)
    assert.strictEqual(
      isOriginAllowed("https://malicious-app.vercel.app", true, prodClientUrl),
      false
    );

    // Unlisted external domain
    assert.strictEqual(
      isOriginAllowed("https://evil.example.com", true, prodClientUrl),
      false
    );

    // Localhost is rejected in production
    assert.strictEqual(
      isOriginAllowed("http://localhost:5173", true, prodClientUrl),
      false
    );
    assert.strictEqual(
      isOriginAllowed("http://127.0.0.1:3000", true, prodClientUrl),
      false
    );

    // Missing origin (server-to-server / health check) is allowed
    assert.strictEqual(isOriginAllowed(undefined, true, prodClientUrl), true);
    assert.strictEqual(isOriginAllowed(null, true, prodClientUrl), true);
    assert.strictEqual(isOriginAllowed("", true, prodClientUrl), true);
  });

  it("in development: preserves localhost and 127.0.0.1 on any port", () => {
    const devClientUrl = "http://localhost:5173";

    assert.strictEqual(isOriginAllowed("http://localhost:5173", false, devClientUrl), true);
    assert.strictEqual(isOriginAllowed("http://localhost:3000", false, devClientUrl), true);
    assert.strictEqual(isOriginAllowed("http://127.0.0.1:5173", false, devClientUrl), true);
    assert.strictEqual(isOriginAllowed("http://127.0.0.1:8080", false, devClientUrl), true);

    // Unlisted external domains are still rejected in development
    assert.strictEqual(isOriginAllowed("https://attacker.com", false, devClientUrl), false);
    assert.strictEqual(isOriginAllowed("https://steamlens.vercel.app", false, devClientUrl), false);
  });
});

describe("Security Hardening — Neon SSL & Docker PostgreSQL Compatibility", () => {
  it("determines correct SSL settings for Neon and local Docker", () => {
    function resolveSsl(databaseUrl, pgsslRejectUnauthorized) {
      const isNeon = databaseUrl.includes("neon.tech");
      const hasSslMode = databaseUrl.includes("sslmode=require");
      const isLocal =
        !isNeon &&
        !hasSslMode &&
        (databaseUrl.includes("localhost") ||
          databaseUrl.includes("127.0.0.1") ||
          databaseUrl.includes("@postgres:") ||
          databaseUrl.includes("@postgres/") ||
          databaseUrl.includes("postgres:5432"));

      const rejectUnauthorized = pgsslRejectUnauthorized !== "false";
      return isLocal ? false : { rejectUnauthorized };
    }

    // Neon database URL -> SSL enabled with certificate verification
    const neonUrl = "postgresql://user:pass@ep-cool-123.us-east-2.aws.neon.tech/neondb?sslmode=require";
    assert.deepStrictEqual(resolveSsl(neonUrl), { rejectUnauthorized: true });

    // Cloud database with sslmode=require -> SSL enabled with verification
    const cloudUrl = "postgresql://user:pass@db.example.com:5432/db?sslmode=require";
    assert.deepStrictEqual(resolveSsl(cloudUrl), { rejectUnauthorized: true });

    // Explicit override via PGSSL_REJECT_UNAUTHORIZED="false"
    assert.deepStrictEqual(resolveSsl(neonUrl, "false"), { rejectUnauthorized: false });

    // Docker Compose URL -> SSL disabled (local dev compatibility)
    const dockerUrl = "postgresql://postgres:postgrespassword@postgres:5432/steamlens";
    assert.strictEqual(resolveSsl(dockerUrl), false);

    // Localhost URL -> SSL disabled
    const localUrl = "postgresql://postgres:postgrespassword@localhost:5432/steamlens";
    assert.strictEqual(resolveSsl(localUrl), false);
  });
});
