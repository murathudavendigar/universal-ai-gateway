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

export interface RoutableModelSource {
  listRoutableModels(): string[];
}

export async function buildKnownModelSet(
  providers: { listModels(): Promise<string[]> }[],
  router?: RoutableModelSource
): Promise<Set<string>> {
  const lists = await Promise.all(providers.map((provider) => provider.listModels()));
  const models = new Set(lists.flat());

  if (router) {
    for (const model of router.listRoutableModels()) {
      models.add(model);
    }
  }

  return models;
}
