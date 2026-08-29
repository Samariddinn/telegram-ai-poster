import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CredentialDeleteBlocker,
  CredentialType,
  CredentialValidationResult,
  LlmProvider,
} from '../../core/models/credential.model';
import { CredentialsService } from '../../core/services/credentials.service';

interface RowState {
  validating: boolean;
  result: CredentialValidationResult | null;
  deleteError: string | null;
}

@Component({
  selector: 'app-credentials',
  standalone: true,
  imports: [FormsModule, DatePipe],
  templateUrl: './credentials.component.html',
})
export class CredentialsComponent implements OnInit {
  readonly credentials = inject(CredentialsService);

  readonly showAddModal = signal(false);
  readonly submitting = signal(false);
  readonly createError = signal<string | null>(null);
  readonly createResult = signal<CredentialValidationResult | null>(null);

  readonly rowState = signal<Record<string, RowState>>({});

  type: CredentialType = 'TELEGRAM_BOT_TOKEN';
  provider: LlmProvider = 'OPENAI';
  label = '';
  secret = '';

  ngOnInit(): void {
    void this.credentials.refresh();
  }

  openAddModal(): void {
    this.type = 'TELEGRAM_BOT_TOKEN';
    this.provider = 'OPENAI';
    this.label = '';
    this.secret = '';
    this.createError.set(null);
    this.createResult.set(null);
    this.showAddModal.set(true);
  }

  closeAddModal(): void {
    this.showAddModal.set(false);
  }

  async submitAdd(): Promise<void> {
    this.createError.set(null);
    this.createResult.set(null);
    this.submitting.set(true);
    try {
      const response = await this.credentials.create({
        type: this.type,
        provider: this.type === 'LLM_API_KEY' ? this.provider : undefined,
        label: this.label,
        secret: this.secret,
      });
      this.createResult.set(response.validation);
      this.secret = '';
    } catch (err) {
      this.createError.set(this.extractError(err));
    } finally {
      this.submitting.set(false);
    }
  }

  async validateRow(id: string): Promise<void> {
    this.patchRow(id, { validating: true, result: null });
    try {
      const result = await this.credentials.validate(id);
      this.patchRow(id, { validating: false, result });
    } catch (err) {
      this.patchRow(id, {
        validating: false,
        result: { valid: false, message: this.extractError(err) },
      });
    }
  }

  async deleteRow(id: string): Promise<void> {
    this.patchRow(id, { deleteError: null });
    try {
      await this.credentials.remove(id);
    } catch (err) {
      this.patchRow(id, { deleteError: this.extractBlockerError(err) });
    }
  }

  rowFor(id: string): RowState {
    return this.rowState()[id] ?? { validating: false, result: null, deleteError: null };
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
    const httpError = err as { error?: { blockers?: CredentialDeleteBlocker[]; message?: string } };
    const blockers = httpError?.error?.blockers;
    if (blockers && blockers.length > 0) {
      const names = blockers.map((b) => `${b.type} "${b.name}"`).join(', ');
      return `Still used by ${names}. Detach these first.`;
    }
    return this.extractError(err);
  }
}
