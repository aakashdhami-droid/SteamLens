# 🔍 SteamLens — AI-Powered Steam Review Summarizer

SteamLens uses AI to analyze hundreds of Steam game reviews and distill them into a concise, actionable summary. Instead of reading through pages of reviews, get an instant breakdown of what players love, what they hate, and the overall sentiment — powered by Groq's Llama 3 model.

![SteamLens](https://img.shields.io/badge/Stack-React%20%2B%20Express%20%2B%20PostgreSQL-blue) ![AI](https://img.shields.io/badge/AI-Groq%20Llama%203-green) ![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Features

- **Instant AI Summaries** — 50-60 word overview of player sentiment
- **Pros & Cons** — Top 3 strengths and weaknesses identified by AI
- **Sentiment Analysis** — Positive, Mixed, or Negative with confidence score
- **Smart Review Sampling** — Intelligent filtering pipeline (see below)
- **7-Day Caching** — Results cached in PostgreSQL, no redundant API calls
- **Quick Picks** — One-click analysis for popular games
- **Dark Steam Theme** — Clean, professional UI that feels native to Steam

## 🛠️ How to Run Locally

### Prerequisites
- Node.js 18+
- A free [Groq API key](https://console.groq.com)
- PostgreSQL 14+ (local install or free managed: [Supabase](https://supabase.com) / [Neon](https://neon.tech))

### 1. Clone & Setup Environment

```bash
git clone <your-repo-url>
cd steamlens
```

### 2. Start the Backend

```bash
cd server
npm install

# Create your .env file
cp ../.env.example .env
# Edit .env and add your GROQ_API_KEY and DATABASE_URL

npm run dev
```

The API will start on `http://localhost:3001`.

### 3. Start the Frontend

```bash
cd client
npm install

# Create .env file
echo "VITE_API_URL=http://localhost:3001" > .env

npm run dev
```

The app will open at `http://localhost:5173`.

## 🧠 How the Review Sampling Works

This is the core engineering insight of SteamLens. Raw Steam reviews are **extremely noisy** — full of memes, ASCII art, one-word jokes, and copy-pasted spam. Sending all of them to an LLM produces terrible summaries.

### The Pipeline

```
Raw Reviews (up to 300)
    │
    ▼
┌─────────────────────────┐
│  1. Spam Filter          │  Remove: <50 chars, pure emoji,
│     (filterSpam)         │  repeated chars, non-English
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  2. Deduplication        │  Remove reviews with >80%
│     (removeDuplicates)   │  character overlap (Dice coeff.)
└──────────┬──────────────┘
           │
           ▼
┌─────────────────────────┐
│  3. Stratified Sample    │  10 helpful positive reviews
│     (sampleReviews)      │  10 helpful negative reviews
│                          │  5 most recent reviews
└──────────┬──────────────┘
           │
           ▼
    25 high-quality reviews → Groq Llama 3 → Structured JSON
```

### Why This Matters

| Approach | Problem |
|----------|---------|
| Send all 300 reviews | Token limit exceeded, diluted by spam, expensive |
| Random sample of 25 | Might miss all negative reviews, biased result |
| Top 25 by helpfulness | Misses recent reviews (game may have changed) |
| **Our approach** | **Balanced positive/negative, includes recency, filters noise** |

The stratified sample ensures:
- **Balance** — Equal representation of positive and negative opinions
- **Quality** — Community-upvoted reviews tend to be well-written
- **Freshness** — Recent reviews capture the current state of the game
- **Cleanliness** — Spam/duplicate removal prevents noise from dominating

## 📡 API Endpoints

### `GET /api/game/:appid`

Analyze a Steam game's reviews. Returns cached result if available (within 7 days).

**Response:**
```json
{
  "cached": false,
  "appid": "570",
  "game_name": "Dota 2",
  "header_image": "https://...",
  "summary": "Players praise Dota 2's deep strategic gameplay...",
  "pros": ["Deep strategic complexity", "Free to play", "Active competitive scene"],
  "cons": ["Toxic community", "Steep learning curve", "Long match times"],
  "sentiment": "mixed",
  "confidence": 78,
  "total_positive": 1500000,
  "total_negative": 400000,
  "total_reviews": 1900000,
  "reviews_fetched": 285,
  "reviews_sent_to_ai": 22,
  "processing_stats": {
    "raw": 285,
    "afterSpamFilter": 180,
    "afterDedup": 165,
    "sampled": 22
  }
}
```

### `GET /api/cached`

List all previously analyzed games.

### `DELETE /api/cache/:appid`

Clear the cached summary for a specific game.

## 🚀 Deployment

### Backend → Render

1. Push your code to GitHub
2. Go to [render.com](https://render.com) → New Web Service
3. Connect your repo, set root directory to `server/`
4. Build command: `npm install`
5. Start command: `node index.js`
6. Add environment variables:
   - `GROQ_API_KEY` — your Groq key
   - `CLIENT_URL` — your Vercel frontend URL
   - `PORT` — Render sets this automatically

> **Note:** You'll need a PostgreSQL database. Use [Render Postgres](https://render.com/docs/databases), [Supabase](https://supabase.com), or [Neon](https://neon.tech) (all have free tiers). Add the connection string as the `DATABASE_URL` environment variable.

### Frontend → Vercel

1. Go to [vercel.com](https://vercel.com) → Import Project
2. Set root directory to `client/`
3. Framework preset: Vite
4. Add environment variable:
   - `VITE_API_URL` — your Render backend URL (e.g. `https://steamlens-api.onrender.com`)

## 📁 Project Structure

```
steamlens/
├── server/
│   ├── index.js              # Express entry point
│   ├── routes/game.js        # API route handlers
│   ├── services/
│   │   ├── steamService.js    # Steam API integration
│   │   ├── reviewProcessor.js # Spam filter + sampling pipeline
│   │   └── groqService.js     # Groq LLM integration
│   ├── db/database.js         # PostgreSQL cache layer (pg + connection pooling)
│   └── package.json
├── client/
│   ├── src/
│   │   ├── App.jsx            # Main app with state management
│   │   └── components/
│   │       ├── SearchBar.jsx  # Input + quick picks
│   │       ├── GameCard.jsx   # Game info + review stats
│   │       ├── SummaryCard.jsx# AI summary + sentiment
│   │       └── ProsCons.jsx   # Pros/cons columns
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
├── .env.example
├── .gitignore
└── README.md
```

## 📜 License

MIT — do whatever you want with it.
