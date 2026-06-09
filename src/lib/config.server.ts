import process from "node:process";

// Server-only config. The .server.ts suffix prevents Vite from bundling
// this file into the client, values here never reach the browser.

export function getServerConfig() {
  return {
    nodeEnv: process.env.NODE_ENV,
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiImageModel: process.env.OPENAI_IMAGE_MODEL || "gpt-image-1",
    openaiChatModel: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
    openaiSearchModel: process.env.OPENAI_SEARCH_MODEL || "gpt-4o-mini-search-preview",
    pexelsApiKey: process.env.PEXELS_API_KEY,
  };
}

export function requireOpenAIKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to .env (see .env.example).",
    );
  }
  return key;
}
