// Disposable review branch. Never carry this opt-in into the release stack.
export function isFearTesterDiagnosticPreview(): boolean {
  return (
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "codex/fear-tester-diagnostic-temporary"
  );
}
