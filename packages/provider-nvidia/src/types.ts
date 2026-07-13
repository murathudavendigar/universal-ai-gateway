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

export interface NvidiaStreamChoice {
  delta: {
    content?: string;
  };

  finish_reason?: string | null;
}

export interface NvidiaStreamChunk {
  choices: NvidiaStreamChoice[];

  usage?: NvidiaUsage;

  model: string;
}
