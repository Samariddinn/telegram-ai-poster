import axios from 'axios';
import { CredentialValidationResult, describeAxiosError } from './validation-result';

// Cheapest available model per provider — this call only proves the key
// works, it never needs real generation quality.
const OPENAI_VALIDATION_MODEL = 'gpt-5.6-luna';
const ANTHROPIC_VALIDATION_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_VERSION = '2023-06-01';

/** Issues a 1-token completion to confirm the OpenAI key is live. */
export async function validateOpenAiKey(apiKey: string): Promise<CredentialValidationResult> {
  try {
    await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: OPENAI_VALIDATION_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      },
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        timeout: 15_000,
      },
    );

    return { valid: true, message: 'OpenAI key is valid' };
  } catch (err) {
    return { valid: false, message: describeAxiosError(err) };
  }
}

/** Issues a 1-token completion to confirm the Anthropic key is live. */
export async function validateAnthropicKey(apiKey: string): Promise<CredentialValidationResult> {
  try {
    await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: ANTHROPIC_VALIDATION_MODEL,
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
          'content-type': 'application/json',
        },
        timeout: 15_000,
      },
    );

    return { valid: true, message: 'Anthropic key is valid' };
  } catch (err) {
    return { valid: false, message: describeAxiosError(err) };
  }
}

/** Lists models rather than generating — genuinely free, still catches a dead/typo'd key. */
export async function validateGeminiKey(apiKey: string): Promise<CredentialValidationResult> {
  try {
    await axios.get('https://generativelanguage.googleapis.com/v1beta/models', {
      params: { key: apiKey, pageSize: 1 },
      timeout: 15_000,
    });

    return { valid: true, message: 'Gemini key is valid' };
  } catch (err) {
    return { valid: false, message: describeAxiosError(err) };
  }
}
