// One optional pop-up per visit. Alerts, phone and daily luck each ask to open; the most important
// one that wants to open gets the visit, and the rest wait for a later visit (a new browser session).
// Onboarding (the welcome screen and required profile setup, both "profile" here) also uses up the
// visit, so a brand-new member sees only those.
export type PromptName = "profile" | "push" | "phone" | "luck";
const PRIORITY: Record<PromptName, number> = { profile: -1, push: 0, phone: 1, luck: 2 };
/** Lower-priority prompts wait this long per step after page load so higher ones can claim first. */
const SETTLE_MS = 2500;
const KEY = "vq-prompt-shown";

const wanted = new Set<PromptName>();
let pageStart = Date.now();
let memory: string | null = null;

const read = () => {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return memory;
  }
};

export function wantPrompt(name: PromptName) {
  wanted.add(name);
}
export function dropPrompt(name: PromptName) {
  wanted.delete(name);
}

/** May `name` open now? Once a prompt has opened this visit, only that prompt may (re)open. */
export function mayShowPrompt(name: PromptName, now = Date.now()) {
  const shown = read();
  if (shown) return shown === name;
  if (!wanted.has(name)) return false;
  if (now - pageStart < PRIORITY[name] * SETTLE_MS) return false;
  return [...wanted].every((other) => PRIORITY[other] >= PRIORITY[name]);
}

export function markPromptShown(name: PromptName) {
  memory = name;
  try {
    sessionStorage.setItem(KEY, name);
  } catch {
    /* Remembered for this page only. */
  }
}

/** Test hook: forget wishes and the visit's choice. */
export function resetPromptQueue(start = Date.now()) {
  wanted.clear();
  pageStart = start;
  memory = null;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* No storage in tests. */
  }
}
