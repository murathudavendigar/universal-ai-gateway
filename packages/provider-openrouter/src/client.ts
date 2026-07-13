import { parseSSEStream } from "./sse.js";

const BASE_URL = "https://openrouter.ai/api/v1";

export class OpenRouterClient {
  constructor(private readonly apiKey: string) {}

  async chat(body: unknown) {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    return response.json();
  }

  async *chatStream(body: Record<string, unknown>): AsyncGenerator<string, void, unknown> {
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({ ...body, stream: true }),
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    if (!response.body) {
      throw new Error("OpenRouter stream response has no body.");
    }

    yield* parseSSEStream(response.body);
  }
}
