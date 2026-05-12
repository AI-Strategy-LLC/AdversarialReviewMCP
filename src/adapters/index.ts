import type { Adapter, ReviewerName } from "../types.js";
import { codexAdapter } from "./codex.js";
import { geminiAdapter } from "./gemini.js";
import { opencodeAdapter } from "./opencode.js";
import { crushAdapter } from "./crush.js";
import { kiloAdapter } from "./kilo.js";

export const ADAPTERS: Record<ReviewerName, Adapter> = {
  codex: codexAdapter,
  gemini: geminiAdapter,
  opencode: opencodeAdapter,
  crush: crushAdapter,
  kilo: kiloAdapter,
};

export function getAdapter(name: ReviewerName): Adapter {
  return ADAPTERS[name];
}
