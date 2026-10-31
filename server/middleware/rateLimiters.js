const { rateLimit, MemoryStore } = require("express-rate-limit");

/**
 * MemoryStore with unreferenced interval timer so background cleanup
 * doesn't keep the Node.js event loop or test runner open unnecessarily.
 */
class UnrefMemoryStore extends MemoryStore {
  init(options) {
    super.init(options);
    if (this.interval && typeof this.interval.unref === "function") {
      this.interval.unref();
    }
  }
}

function createAuthLimiter(options = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    store: new UnrefMemoryStore(),
    message: {
      error: "Too many authentication attempts. Please try again after 15 minutes.",
    },
    ...options,
  });
}

function createAiAnalysisLimiter(options = {}) {
  return rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 uncached AI analysis requests per 15 minutes per IP
    standardHeaders: true,
    legacyHeaders: false,
    store: new UnrefMemoryStore(),
    message: {
      error: "Too many AI analysis requests. Please try again later.",
    },
    ...options,
  });
}

const authLimiter = createAuthLimiter();
const aiAnalysisLimiter = createAiAnalysisLimiter();

module.exports = {
  authLimiter,
  aiAnalysisLimiter,
  createAuthLimiter,
  createAiAnalysisLimiter,
  UnrefMemoryStore,
};
