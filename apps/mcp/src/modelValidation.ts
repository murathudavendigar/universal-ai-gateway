export interface ModelValidationResult {
  valid: boolean;
  error?: string;
}

export function validateModel(
  specificModel: string | undefined,
  knownModels: ReadonlySet<string>
): ModelValidationResult {
  if (!specificModel) return { valid: true };
  if (knownModels.has(specificModel)) return { valid: true };

  const supported = [...knownModels].sort().join(", ");
  return {
    valid: false,
    error: `Unknown model '${specificModel}'. Supported models: ${supported}`,
  };
}

export async function buildKnownModelSet(
  providers: { listModels(): Promise<string[]> }[]
): Promise<Set<string>> {
  const lists = await Promise.all(providers.map((provider) => provider.listModels()));
  return new Set(lists.flat());
}
