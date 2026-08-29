import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExecutionResult, PreviewPayload, PreviewResponse, Workflow, WorkflowFormValue } from '../models/workflow.model';

@Injectable({ providedIn: 'root' })
export class WorkflowsService {
  private readonly http = inject(HttpClient);

  private readonly workflowsSignal = signal<Workflow[]>([]);
  private readonly loadingSignal = signal(false);

  readonly workflows = this.workflowsSignal.asReadonly();
  readonly loading = this.loadingSignal.asReadonly();

  async refresh(): Promise<void> {
    this.loadingSignal.set(true);
    try {
      const workflows = await firstValueFrom(this.http.get<Workflow[]>(`${environment.apiUrl}/workflows`));
      this.workflowsSignal.set(workflows);
    } finally {
      this.loadingSignal.set(false);
    }
  }

  async create(payload: WorkflowFormValue): Promise<Workflow> {
    const workflow = await firstValueFrom(this.http.post<Workflow>(`${environment.apiUrl}/workflows`, payload));
    this.workflowsSignal.update((current) => [workflow, ...current]);
    return workflow;
  }

  async update(id: string, payload: WorkflowFormValue): Promise<Workflow> {
    const workflow = await firstValueFrom(
      this.http.patch<Workflow>(`${environment.apiUrl}/workflows/${id}`, payload),
    );
    this.workflowsSignal.update((current) => current.map((w) => (w.id === id ? workflow : w)));
    return workflow;
  }

  async setEnabled(id: string, enabled: boolean): Promise<void> {
    const workflow = await firstValueFrom(
      this.http.post<Workflow>(`${environment.apiUrl}/workflows/${id}/${enabled ? 'enable' : 'disable'}`, {}),
    );
    this.workflowsSignal.update((current) => current.map((w) => (w.id === id ? workflow : w)));
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${environment.apiUrl}/workflows/${id}`));
    this.workflowsSignal.update((current) => current.filter((w) => w.id !== id));
  }

  preview(payload: PreviewPayload): Promise<PreviewResponse> {
    return firstValueFrom(this.http.post<PreviewResponse>(`${environment.apiUrl}/workflows/preview`, payload));
  }

  async runNow(id: string): Promise<ExecutionResult> {
    const result = await firstValueFrom(
      this.http.post<ExecutionResult>(`${environment.apiUrl}/workflows/${id}/run`, {}),
    );
    this.workflowsSignal.update((current) =>
      current.map((w) => (w.id === id ? { ...w, lastRunAt: result.startedAt } : w)),
    );
    return result;
  }
}
