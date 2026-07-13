const BASE_URL = "https://integrate.api.nvidia.com/v1";

export class NvidiaClient {
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
}
