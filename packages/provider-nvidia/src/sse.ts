export async function* parseSSEStream(
  body: ReadableStream<Uint8Array>
): AsyncGenerator<string, void, unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      let result: ReadableStreamReadResult<Uint8Array>;

      try {
        result = await reader.read();
      } catch {
        return;
      }

      const { done, value } = result;
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;

        const data = trimmed.slice("data:".length).trim();
        if (data === "[DONE]") return;

        yield data;
      }
    }
  } finally {
    reader.releaseLock();
  }
}
