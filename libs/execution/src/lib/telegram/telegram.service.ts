import { Injectable } from '@nestjs/common';
import { DetectedChat } from '@telegram-ai-poster/shared-dto';
import axios, { isAxiosError } from 'axios';
import { sanitizeOutput, splitForTelegram } from './sanitize';

const TELEGRAM_API = 'https://api.telegram.org';
const SEND_DELAY_MS = 350; // short delay between sequential parts of a split message
const SUPERGROUP_PREFIX = '-100';

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramUpdate {
  message?: { chat: TelegramChat };
  edited_message?: { chat: TelegramChat };
  channel_post?: { chat: TelegramChat };
  my_chat_member?: { chat: TelegramChat };
}

interface TelegramGetUpdatesResponse {
  ok: boolean;
  description?: string;
  result?: TelegramUpdate[];
}

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
  result?: { message_id: number };
}

export interface TelegramSendResult {
  messageIds: string[];
  usedChatId: string;
}

/**
 * The only place that talks to Telegram's HTTP API directly. Used by the
 * guided destination-detection flow, ad-hoc test messages, and workflow
 * execution (manual and scheduled) — same send pipeline everywhere.
 */
@Injectable()
export class TelegramService {
  /** Polls recent updates for chats this bot has seen, deduplicated by chat id. */
  async detectChats(token: string): Promise<DetectedChat[]> {
    const { data } = await axios.get<TelegramGetUpdatesResponse>(`${TELEGRAM_API}/bot${token}/getUpdates`, {
      params: { limit: 100 },
      timeout: 10_000,
    });

    if (!data.ok) {
      throw new Error(data.description ?? 'Failed to fetch updates from Telegram');
    }

    const chats = new Map<string, DetectedChat>();
    for (const update of data.result ?? []) {
      const chat =
        update.message?.chat ?? update.edited_message?.chat ?? update.channel_post?.chat ?? update.my_chat_member?.chat;
      if (!chat) {
        continue;
      }

      chats.set(String(chat.id), {
        chatId: String(chat.id),
        title:
          chat.title ??
          chat.username ??
          ([chat.first_name, chat.last_name].filter(Boolean).join(' ') || String(chat.id)),
        type: chat.type,
      });
    }

    return [...chats.values()];
  }

  /**
   * Sanitizes and splits the text, then sends the parts sequentially. If the
   * chat id is rejected and looks like a bare positive number, retries once
   * with a `-100` prefix — the classic "positive id pasted for a supergroup"
   * mistake (docs §4, §11).
   */
  async send(token: string, chatId: string, rawText: string): Promise<TelegramSendResult> {
    const parts = splitForTelegram(sanitizeOutput(rawText));

    try {
      const messageIds = await this.sendParts(token, chatId, parts);
      return { messageIds, usedChatId: chatId };
    } catch (err) {
      const normalizedId = /^\d+$/.test(chatId) ? `${SUPERGROUP_PREFIX}${chatId}` : null;
      if (normalizedId && err instanceof Error && /chat not found/i.test(err.message)) {
        const messageIds = await this.sendParts(token, normalizedId, parts);
        return { messageIds, usedChatId: normalizedId };
      }
      throw err;
    }
  }

  private async sendParts(token: string, chatId: string, parts: string[]): Promise<string[]> {
    const messageIds: string[] = [];

    for (const [index, part] of parts.entries()) {
      if (index > 0) {
        await this.delay(SEND_DELAY_MS);
      }

      try {
        const { data } = await axios.post<TelegramSendMessageResponse>(
          `${TELEGRAM_API}/bot${token}/sendMessage`,
          { chat_id: chatId, text: part, parse_mode: 'HTML' },
          { timeout: 15_000 },
        );

        if (!data.ok || !data.result) {
          throw new Error(this.translateError(data.description));
        }
        messageIds.push(String(data.result.message_id));
      } catch (err) {
        throw new Error(this.translateError(this.extractDescription(err)));
      }
    }

    return messageIds;
  }

  private extractDescription(err: unknown): string | undefined {
    if (isAxiosError(err)) {
      const data = err.response?.data as { description?: string } | undefined;
      return data?.description ?? err.message;
    }
    return err instanceof Error ? err.message : undefined;
  }

  /** Translates Telegram's raw error strings into the actionable messages docs §11 asks for. */
  private translateError(description?: string): string {
    if (!description) {
      return 'Telegram rejected the request';
    }
    if (/chat not found/i.test(description)) {
      return 'Chat not found — check the chat id or add the bot to the group';
    }
    if (/not enough rights|CHAT_ADMIN_REQUIRED/i.test(description)) {
      return "The bot doesn't have permission to post here. Make it an administrator with post permission.";
    }
    if (/bot was kicked|bot is not a member|kicked from/i.test(description)) {
      return 'The bot is not a member of this chat. Add it to the group first.';
    }
    return description;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
