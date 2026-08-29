export interface GenerationParams {
  apiKey: string;
  model: string;
  systemPrompt?: string;
  userPrompt: string;
  temperature: number;
  maxTokens: number;
}

export interface GenerationResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
}

export type GenerateFn = (params: GenerationParams) => Promise<GenerationResult>;
