export interface OpenRouterChatChoice {
  message: {
    content: string;
  };
}

export interface OpenRouterUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OpenRouterResponse {
  choices: OpenRouterChatChoice[];

  usage?: OpenRouterUsage;

  model: string;
}

export interface OpenRouterStreamChoice {
  delta: {
    content?: string;
  };

  finish_reason?: string | null;
}

export interface OpenRouterStreamChunk {
  choices: OpenRouterStreamChoice[];

  usage?: OpenRouterUsage;

  model: string;
}
