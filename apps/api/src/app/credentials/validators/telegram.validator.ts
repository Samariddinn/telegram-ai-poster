import axios from 'axios';
import { CredentialValidationResult, describeAxiosError } from './validation-result';

interface TelegramGetMeResponse {
  ok: boolean;
  description?: string;
  result?: { username: string };
}

/** Confirms the bot token is live via Telegram's getMe endpoint. */
export async function validateTelegramBotToken(token: string): Promise<CredentialValidationResult> {
  try {
    const { data } = await axios.get<TelegramGetMeResponse>(
      `https://api.telegram.org/bot${token}/getMe`,
      { timeout: 10_000 },
    );

    if (!data.ok || !data.result) {
      return { valid: false, message: data.description ?? 'Telegram rejected the token' };
    }

    return { valid: true, message: `Connected as @${data.result.username}` };
  } catch (err) {
    return { valid: false, message: describeAxiosError(err) };
  }
}
