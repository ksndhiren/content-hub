import OpenAI from "openai";
import { requireOpenAIKey } from "../config.server";

let _client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (_client) return _client;
  _client = new OpenAI({ apiKey: requireOpenAIKey() });
  return _client;
}
