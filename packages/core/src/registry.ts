import type { AIProvider } from "@uag/sdk/provider";

export class ProviderRegistry {
  private readonly providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    this.providers.set(provider.name, provider);
  }

  get(name: string): AIProvider {
    const provider = this.providers.get(name);

    if (!provider) {
      throw new Error(`Provider '${name}' not found.`);
    }

    return provider;
  }

  has(name: string): boolean {
    return this.providers.has(name);
  }

  list(): AIProvider[] {
    return [...this.providers.values()];
  }
}
