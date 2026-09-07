const axios = require("axios");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-20b";

async function summarizeReviews(reviews, gameName) {
  const apiKey = process.env.GROQ_API_KEY;
  if (
    !apiKey ||
    apiKey.trim() === "" ||
    apiKey === "your_groq_key_from_console.groq.com"
  ) {
    throw new Error(
      "GROQ_API_KEY is not set or is still the default placeholder. Please add your Groq API key to server/.env"
    );
  }

  const reviewTexts = reviews
    .map((r, i) => {
      const sentiment = r.voted_up ? "[POSITIVE]" : "[NEGATIVE]";
      return `${i + 1}. ${sentiment} ${r.review}`;
    })
    .join("\n\n");

  const systemPrompt = `You are a Steam game review analyst. Analyze the provided reviews and respond ONLY with a valid JSON object, no other text. Do not wrap the response in markdown code blocks. Do not include any explanation before or after the JSON.`;

  const userPrompt = `Game: ${gameName}

Reviews:
${reviewTexts}

Respond with exactly this JSON structure:
{
  "summary": "A 50-60 word paragraph describing overall player sentiment, what players love, and what frustrates them",
  "pros": ["short pro point 1", "short pro point 2", "short pro point 3"],
  "cons": ["short con point 1", "short con point 2", "short con point 3"],
  "sentiment": "positive or mixed or negative",
  "confidence": 75
}

Rules:
- summary must be exactly 50-60 words
- pros and cons must each have exactly 3 items
- each pro/con should be a short phrase (5-10 words max)
- sentiment must be one of: positive, mixed, negative
- confidence is a number 0-100 representing how confident you are in this analysis based on review quality and consistency`;

  try {
    const response = await axios.post(
      GROQ_API_URL,
      {
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 1500,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      }
    );

    const content = response.data.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("Groq returned an empty response");
    }

    const withoutThinking = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

    const cleaned = withoutThinking
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse Groq response as JSON:", cleaned);
      throw new Error("AI returned invalid JSON. Raw response logged above.");
    }

    return {
      summary: typeof parsed.summary === "string" ? parsed.summary : "Unable to generate summary.",
      pros: Array.isArray(parsed.pros) && parsed.pros.length >= 3
        ? parsed.pros.slice(0, 3)
        : ["Not enough data", "Not enough data", "Not enough data"],
      cons: Array.isArray(parsed.cons) && parsed.cons.length >= 3
        ? parsed.cons.slice(0, 3)
        : ["Not enough data", "Not enough data", "Not enough data"],
      sentiment: ["positive", "mixed", "negative"].includes(parsed.sentiment)
        ? parsed.sentiment
        : "mixed",
      confidence: typeof parsed.confidence === "number"
        ? Math.min(100, Math.max(0, Math.round(parsed.confidence)))
        : 50,
    };
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const errData = error.response.data;

      if (status === 429) {
        throw new Error("Groq rate limit exceeded. Please wait a moment and try again.");
      }
      if (status === 401) {
        throw new Error("Invalid Groq API key. Check your GROQ_API_KEY environment variable.");
      }
      throw new Error(`Groq API error (${status}): ${JSON.stringify(errData)}`);
    }

    throw error;
  }
}

module.exports = { summarizeReviews };

