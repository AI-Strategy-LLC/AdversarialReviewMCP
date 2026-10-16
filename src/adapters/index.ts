import type { Adapter, ReviewerName } from "../types.js";
import { codexAdapter } from "./codex.js";
import { antigravityAdapter } from "./antigravity.js";
import { opencodeAdapter } from "./opencode.js";
import { crushAdapter } from "./crush.js";
import { kiloAdapter } from "./kilo.js";
import { glmAdapter } from "./glm.js";
import { copilotAdapter } from "./copilot.js";
import { claudeAdapter } from "./claude.js";

export const ADAPTERS: Record<ReviewerName, Adapter> = {
  codex: codexAdapter,
  antigravity: antigravityAdapter,
  opencode: opencodeAdapter,
  crush: crushAdapter,
  kilo: kiloAdapter,
  glm: glmAdapter,
  copilot: copilotAdapter,
  claude: claudeAdapter,
};

export function getAdapter(name: ReviewerName): Adapter {
  return ADAPTERS[name];
}
