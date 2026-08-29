import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Credential,
  CreateCredentialPayload,
  CreateCredentialResponse,
  CredentialValidationResult,
} from '../models/credential.model';

@Injectable({ providedIn: 'root' })
export class CredentialsService {
  private readonly http = inject(HttpClient);

  private readonly credentialsSignal = signal<Credential[]>([]);
  private readonly loadingSignal = signal(false);

  readonly credentials = this.credentialsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  async refresh(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const credentials = await firstValueFrom(
        this.http.get<Credential[]>(`${environment.apiUrl}/credentials`),
      );
      this.credentialsSignal.set(credentials);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async create(payload: CreateCredentialPayload): Promise<CreateCredentialResponse> {
    const response = await firstValueFrom(
      this.http.post<CreateCredentialResponse>(`${environment.apiUrl}/credentials`, payload),
    );
    this.credentialsSignal.update((current) => [response.credential, ...current]);
    return response;
  }

  async validate(id: string): Promise<CredentialValidationResult> {
    const result = await firstValueFrom(
      this.http.post<CredentialValidationResult>(`${environment.apiUrl}/credentials/${id}/validate`, {}),
    );
    if (result.valid) {
      this.credentialsSignal.update((current) =>
        current.map((c) => (c.id === id ? { ...c, lastValidatedAt: new Date().toISOString() } : c)),
      );
    }
    return result;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/credentials/${id}`));
    this.credentialsSignal.update((current) => current.filter((c) => c.id !== id));
  }
}
