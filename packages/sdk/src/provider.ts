export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];

  temperature?: number;
  maxTokens?: number;

  stream?: boolean;
}

export interface ChatResponse {
  provider: string;
  model: string;
  content: string;
  finishReason?: string;

  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface ChatChunk {
  provider: string;
  model: string;
  content: string;
  finishReason?: string;

  done?: boolean;

  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AIProvider {
  readonly name: string;

  chat(request: ChatRequest): Promise<ChatResponse>;

  streamChat(request: ChatRequest): AsyncGenerator<ChatChunk, void, unknown>;

  listModels(): Promise<string[]>;

  health(): Promise<boolean>;
}
