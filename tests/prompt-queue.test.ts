import test from "node:test";
import assert from "node:assert/strict";
import { wantPrompt, dropPrompt, mayShowPrompt, markPromptShown, resetPromptQueue } from "../src/lib/prompt-queue";

test("the most important waiting prompt gets the visit; others wait for the next visit", () => {
  resetPromptQueue(0);
  wantPrompt("luck");
  wantPrompt("push");
  assert.equal(mayShowPrompt("luck", 10000), false);
  assert.equal(mayShowPrompt("push", 0), true);
  markPromptShown("push");
  dropPrompt("push");
  assert.equal(mayShowPrompt("luck", 10000), false);
  assert.equal(mayShowPrompt("push", 10000), true);
});

test("lower-priority prompts give higher ones time to ask first", () => {
  resetPromptQueue(0);
  wantPrompt("luck");
  assert.equal(mayShowPrompt("luck", 1000), false);
  assert.equal(mayShowPrompt("luck", 5000), true);
  wantPrompt("phone");
  assert.equal(mayShowPrompt("luck", 5000), false);
  assert.equal(mayShowPrompt("phone", 5000), true);
});

test("profile setup uses up the visit", () => {
  resetPromptQueue(0);
  markPromptShown("profile");
  wantPrompt("push");
  assert.equal(mayShowPrompt("push", 10000), false);
});
