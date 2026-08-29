import axios from 'axios';
import { describeAxiosError } from '../../http-error';
import { GenerationParams, GenerationResult } from '../provider.interface';

// LLM call gets a hard timeout — a hung provider shouldn't hang the request (docs §6).
const GENERATION_TIMEOUT_MS = 60_000;

interface OpenAiChatCompletionResponse {
  choices: { message: { content: string } }[];
  usage?: { prompt_tokens: number; completion_tokens: number };
}

export async function generateWithOpenAi(params: GenerationParams): Promise<GenerationResult> {
  try {
    const { data } = await axios.post<OpenAiChatCompletionResponse>(
      'https://api.openai.com/v1/chat/completions',
      {
        model: params.model,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        messages: [
          ...(params.systemPrompt ? [{ role: 'system', content: params.systemPrompt }] : []),
          { role: 'user', content: params.userPrompt },
        ],
      },
      { headers: { Authorization: `Bearer ${params.apiKey}` }, timeout: GENERATION_TIMEOUT_MS },
    );

    return {
      text: data.choices[0]?.message?.content ?? '',
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
    };
  } catch (err) {
    throw new Error(describeAxiosError(err));
  }
}
