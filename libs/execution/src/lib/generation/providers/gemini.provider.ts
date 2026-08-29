import axios from 'axios';
import { describeAxiosError } from '../../http-error';
import { GenerationParams, GenerationResult } from '../provider.interface';

const GENERATION_TIMEOUT_MS = 60_000;
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';

interface GeminiGenerateContentResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
}

export async function generateWithGemini(params: GenerationParams): Promise<GenerationResult> {
  try {
    const { data } = await axios.post<GeminiGenerateContentResponse>(
      `${GEMINI_API}/models/${params.model}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
        ...(params.systemPrompt ? { systemInstruction: { parts: [{ text: params.systemPrompt }] } } : {}),
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: params.maxTokens,
        },
      },
      {
        params: { key: params.apiKey },
        headers: { 'content-type': 'application/json' },
        timeout: GENERATION_TIMEOUT_MS,
      },
    );

    const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? '').join('');

    return {
      text,
      promptTokens: data.usageMetadata?.promptTokenCount ?? 0,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
    };
  } catch (err) {
    throw new Error(describeAxiosError(err));
  }
}
