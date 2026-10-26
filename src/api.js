// TypeSafe Jev API client.
//
// One HTTP request can carry many `noul` questions, which is dramatically
// cheaper than one request per ad. Texts are therefore always sent in chunks.

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const REQUEST_TIMEOUT_MS = 30_000;

/** Maximum number of ads asked in a single HTTP request. */
export const BATCH_SIZE = 10;

/** Maximum characters taken from one ad. */
export const MAX_TEXT_LENGTH = 1200;

function readProbability(answer) {
  if (answer && typeof answer.probability === "number") {
    return answer.probability;
  }
  if (answer && typeof answer.noul === "number" && !Number.isNaN(answer.noul)) {
    return answer.noul;
  }
  throw new Error("BAD_RESPONSE");
}

async function askChunk(apiKey, criteria, texts) {
  const questions = {};
  texts.forEach((text, index) => {
    questions[`hide_${index}`] = {
      type: "noul",
      instructions: `Criteria: ${criteria}. Does this NOT match? Text: ${text}`,
      criteria: { true: "Hide", false: "Keep" }
    };
  });

  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      state: { criteria },
      model: MODEL,
      questions
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (response.status === 401) throw new Error("UNAUTHORIZED");
  if (!response.ok) throw new Error(`HTTP_${response.status}`);

  const data = await response.json();
  return texts.map((_, index) => readProbability(data.answers?.[`hide_${index}`]));
}

/**
 * Classify a list of ads.
 *
 * @param {string} apiKey TypeSafe API key.
 * @param {string} criteria Free-text criteria entered by the user.
 * @param {string[]} texts Ad texts (already truncated by the caller).
 * @returns {Promise<number[]>} Probability that each ad does NOT match, 0..1.
 */
export async function askJevBatch(apiKey, criteria, texts) {
  const probabilities = [];
  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const chunk = texts.slice(offset, offset + BATCH_SIZE);
    const chunkProbabilities = await askChunk(apiKey, criteria, chunk);
    probabilities.push(...chunkProbabilities);
  }
  return probabilities;
}

/** Convenience wrapper for a single ad. */
export async function askJev(apiKey, criteria, text) {
  const [probability] = await askJevBatch(apiKey, criteria, [text]);
  return probability;
}
