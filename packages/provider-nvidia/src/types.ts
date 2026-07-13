export interface NvidiaChatChoice {
  message: {
    content: string;
  };
}

export interface NvidiaUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface NvidiaResponse {
  choices: NvidiaChatChoice[];

  usage?: NvidiaUsage;

  model: string;
}
