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
