# 🔍 SteamLens — AI Game Review Intelligence & Explainable Personalization

SteamLens is an AI-powered game intelligence platform that transforms raw Steam reviews into concise, structured insights and computes deterministic, explainable compatibility scores tailored to each player's learned gaming preferences.

![SteamLens](https://img.shields.io/badge/Stack-React%20%2B%20Express%20%2B%20PostgreSQL-blue) ![AI](https://img.shields.io/badge/AI-Groq%20Llama%203-green) ![Auth](https://img.shields.io/badge/Auth-JWT%20%2B%20bcrypt-purple) ![License](https://img.shields.io/badge/License-MIT-yellow)

---

## 🎯 Product Positioning

- **Steam**: *"What do players think?"*
- **SteamLens**: *"Why do players think that?"* and *"How well does this game fit YOUR preferences?"*

---

## ✨ Core Features

1. **Instant AI Review Summaries** — 50–60 word syntheses of player sentiment using Groq's Llama 3 model.
2. **Key Pros & Cons Extraction** — Top 3 strengths and weaknesses identified directly from curated player reviews.
3. **Sentiment & Confidence Analysis** — Positive, Mixed, or Negative classification.
4. **Purposeful Review Preprocessing Pipeline** — Spam/ASCII-art filtering, Jaccard/Dice deduplication, and sentiment-balanced stratified sampling.
5. **PostgreSQL Caching Layer** — 7-day TTL caching of analysis results for sub-second retrieval.
6. **Indian Steam Price Tracking (INR)** — Real-time price and discount tracking in Indian Rupees (paise-accurate).
7. **Interactive Price History Charts** — Price drop and discount visualizations built with Recharts.
8. **Background Price Collector** — Automated catalogue change detection via Steam Store Service API.
9. **Secure User Authentication** — JWT-based stateless authentication with salted bcrypt password hashing.
10. **Game Voting & Feedback System** — One-click 👍 Upvote / 👎 Downvote mechanics per game.
11. **Learned User Preference Engine** — Continuous learning from actual Steam genres and categories/tags.
12. **Explainable Compatibility Score** — Normalized 0–100% mathematical compatibility score with structured evidence badges (no black-box ML or LLM hallucinations).

---

## 📐 Mathematical Personalization Model

SteamLens deliberately uses an **explainable deterministic mathematical formulation** rather than an opaque neural network or LLM:

### 1. Preference Score Formula
For each attribute (genre/tag) associated with voted games:
$$P = \text{positive votes}, \quad M = \text{negative votes}, \quad N = P + M$$
$$\text{preference\_score} = \frac{P - M}{N} \in [-1.0, +1.0]$$

### 2. Internal Confidence Formula (Not exposed to user)
$$\text{confidence} = 1 - \frac{1}{1 + |P - M|} \in [0.0, 1.0)$$
- 1 vote $\to 0.50$
- 3 consistent votes $\to 0.75$
- 5 consistent votes $\to 0.83$
- Conflicting votes (e.g. $P=2, M=2$) $\to 0.0$

### 3. Compatibility Percentage Formula
For a game with unique attributes $A$:
$$\text{effective\_weight}_a = \text{preference\_score}_a \times \text{confidence}_a \quad (\text{0 if unknown})$$
$$\text{raw\_average} = \frac{\sum_{a \in A} \text{effective\_weight}_a}{|A|} \in [-1.0, +1.0]$$
$$\text{compatibility\_percentage} = \text{round}\left(\frac{\text{raw\_average} + 1}{2} \times 100\right) \in [0, 100]$$

### 4. Explanation Classification
- $\ge +0.40 \to$ `✓ Strong match`
- $+0.15 \text{ to } +0.40 \to$ `✓ Match`
- $-0.15 \text{ to } -0.40 \to$ `⚠ Possible mismatch`
- $\le -0.40 \to$ `✗ Low match`

---

## 🛠️ How to Run Locally

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (or local PostgreSQL)
- Free [Groq API Key](https://console.groq.com)
- Optional: Steam Web API Key

### 1. Start PostgreSQL
```bash
docker compose up -d
```

### 2. Configure & Start Server
```bash
cd server
cp ../.env.example .env
# Fill in GROQ_API_KEY, DATABASE_URL, JWT_SECRET
npm install
npm run dev
```

### 3. Configure & Start Client
```bash
cd ../client
npm install
npm run dev
```

Visit `http://localhost:5173`.

---

## 📡 API Reference

### Authentication
- `POST /api/auth/register` — Register a new account (`email`, `password`)
- `POST /api/auth/login` — Sign in and receive signed JWT
- `POST /api/auth/logout` — Sign out
- `GET /api/auth/me` — Get current authenticated user profile (`Bearer <token>`)

### Games & Analysis
- `GET /api/search?query=:name` — Search games with title suggestions
- `GET /api/game/:appid` — Fetch game details, reviews & AI summary (cached)
- `GET /api/game/:appid/price-history` — Historical INR price data
- `DELETE /api/cache/:appid` — Clear cached summary

### Personalization & Voting
- `POST /api/game/:appid/vote` — Submit or update vote (`vote: 1` or `-1`)
- `GET /api/game/:appid/vote` — Retrieve current user's vote
- `GET /api/game/:appid/compatibility` — Get personalized compatibility score & explanation
- `GET /api/preferences` — Get learned attribute scores

---

## 📜 License
MIT

