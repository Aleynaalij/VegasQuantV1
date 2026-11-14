export async function boundedJson(
  req: Request,
  limit = 2048,
): Promise<unknown> {
  if (
    !req.headers.get("content-type")?.startsWith("application/json") ||
    !req.body
  )
    return null;
  const reader = req.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > limit) {
        void reader.cancel().catch(() => {});
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
