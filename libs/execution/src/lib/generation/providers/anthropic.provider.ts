import axios from 'axios';
import { describeAxiosError } from '../../http-error';
import { GenerationParams, GenerationResult } from '../provider.interface';

const GENERATION_TIMEOUT_MS = 60_000;
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessageResponse {
  content: { type: string; text?: string }[];
  usage?: { input_tokens: number; output_tokens: number };
}

export async function generateWithAnthropic(params: GenerationParams): Promise<GenerationResult> {
  try {
    const { data } = await axios.post<AnthropicMessageResponse>(
      'https://api.anthropic.com/v1/messages',
      {
        model: params.model,
        max_tokens: params.maxTokens,
        temperature: params.temperature,
        ...(params.systemPrompt ? { system: params.systemPrompt } : {}),
        messages: [{ role: 'user', content: params.userPrompt }],
      },
      {
        headers: {
          'x-api-key': params.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        timeout: GENERATION_TIMEOUT_MS,
      },
    );

    const text = data.content
      .filter((block) => block.type === 'text' && block.text)
      .map((block) => block.text)
      .join('\n');

    return {
      text,
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    };
  } catch (err) {
    throw new Error(describeAxiosError(err));
  }
}
