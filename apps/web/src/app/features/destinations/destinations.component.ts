import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CredentialsService } from '../../core/services/credentials.service';
import { DestinationsService } from '../../core/services/destinations.service';
import { ToastService } from '../../core/services/toast.service';
import {
  DestinationDeleteBlocker,
  DestinationValidationResult,
  DetectedChat,
} from '../../core/models/destination.model';

interface RowState {
  testing: boolean;
  result: DestinationValidationResult | null;
  deleteError: string | null;
  showCustom: boolean;
  customText: string;
}

const EMPTY_ROW_STATE: RowState = { testing: false, result: null, deleteError: null, showCustom: false, customText: '' };

@Component({
  selector: 'app-destinations',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './destinations.component.html',
})
export class DestinationsComponent implements OnInit {
  readonly destinations = inject(DestinationsService);
  readonly credentials = inject(CredentialsService);
  private readonly toast = inject(ToastService);

  readonly botCredentials = computed(() => this.credentials.credentials().filter((c) => c.type === 'TELEGRAM_BOT_TOKEN'));

  readonly showAddModal = signal(false);
  readonly manualMode = signal(false);
  readonly detecting = signal(false);
  readonly detectError = signal<string | null>(null);
  readonly detectedChats = signal<DetectedChat[]>([]);
  readonly selectedChatId = signal<string | null>(null);

  readonly submitting = signal(false);
  readonly createError = signal<string | null>(null);

  readonly rowState = signal<Record<string, RowState>>({});

  botCredentialId = '';
  chatId = '';
  title = '';

  ngOnInit(): void {
    void this.destinations.refresh();
    void this.credentials.refresh();
  }

  openAddModal(): void {
    this.botCredentialId = this.botCredentials()[0]?.id ?? '';
    this.chatId = '';
    this.title = '';
    this.manualMode.set(false);
    this.detectedChats.set([]);
    this.selectedChatId.set(null);
    this.detectError.set(null);
    this.createError.set(null);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  async detectChats(): Promise<void> {
    if (!this.botCredentialId) {
      return;
    }
    this.detectError.set(null);
    this.detecting.set(true);
    this.detectedChats.set([]);
    try {
      const chats = await this.destinations.detect(this.botCredentialId);
      this.detectedChats.set(chats);
      if (chats.length === 0) {
        this.detectError.set(
          'No chats found yet. Add the bot to your group as an administrator, send any message there, then try again.',
        );
      }
    } catch (err) {
      this.detectError.set(this.extractError(err));
    } finally {
      this.detecting.set(false);
    }
  }

  pickChat(chat: DetectedChat): void {
    this.selectedChatId.set(chat.chatId);
    this.chatId = chat.chatId;
    this.title = chat.title;
  }

  toggleManualMode(): void {
    this.manualMode.set(!this.manualMode());
    this.selectedChatId.set(null);
  }

  async submitAdd(): Promise<void> {
    this.createError.set(null);
    this.submitting.set(true);
    try {
      const response = await this.destinations.create({
        botCredentialId: this.botCredentialId,
        chatId: this.chatId,
        title: this.title,
      });
      // Same reasoning as credentials: the destination is saved regardless of
      // whether the verification send succeeds, so close the modal either way
      // and let the toast communicate which case happened.
      this.showAddModal.set(false);
      if (response.verification.valid) {
        this.toast.success(`"${response.destination.title}" added and verified.`);
      } else {
        this.toast.warning(`"${response.destination.title}" added, but verification failed: ${response.verification.message}`);
      }
    } catch (err) {
      this.createError.set(this.extractError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  toggleCustom(id: string): void {
    this.patchRow(id, { showCustom: !this.rowFor(id).showCustom, result: null });
  }

  async sendQuickTest(id: string): Promise<void> {
    await this.sendTest(id, undefined);
  }

  async sendCustomTest(id: string): Promise<void> {
    await this.sendTest(id, this.rowFor(id).customText);
  }

  async deleteRow(id: string): Promise<void> {
    this.patchRow(id, { deleteError: null });
    try {
      await this.destinations.remove(id);
    } catch (err) {
      this.patchRow(id, { deleteError: this.extractBlockerError(err) });
    }
  }

  rowFor(id: string): RowState {
    return this.rowState()[id] ?? EMPTY_ROW_STATE;
  }

  botLabel(botCredentialId: string): string {
    return this.credentials.credentials().find((c) => c.id === botCredentialId)?.label ?? 'Unknown bot';
  }

  updateCustomText(id: string, text: string): void {
    this.patchRow(id, { customText: text });
  }

  private async sendTest(id: string, text: string | undefined): Promise<void> {
    this.patchRow(id, { testing: true, result: null });
    try {
      const result = await this.destinations.sendTest(id, text || undefined);
      this.patchRow(id, { testing: false, result });
    } catch (err) {
      this.patchRow(id, { testing: false, result: { valid: false, message: this.extractError(err) } });
    }
  }

  private patchRow(id: string, patch: Partial<RowState>): void {
    this.rowState.update((current) => ({
      ...current,
      [id]: { ...this.rowFor(id), ...patch },
    }));
  }

  private extractError(err: unknown): string {
    const httpError = err as { error?: { message?: string | string[] } };
    const message = httpError?.error?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    return message ?? 'Something went wrong. Please try again.';
  }

  private extractBlockerError(err: unknown): string {
    const httpError = err as { error?: { blockers?: DestinationDeleteBlocker[]; message?: string } };
    const blockers = httpError?.error?.blockers;
    if (blockers && blockers.length > 0) {
      const names = blockers.map((b) => `${b.type} "${b.name}"`).join(', ');
      return `Still used by ${names}. Detach these first.`;
    }
    return this.extractError(err);
  }
}
