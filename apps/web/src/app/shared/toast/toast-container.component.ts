import { Component, inject } from '@angular/core';
import { ToastService } from '../../core/services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  template: `
    <div class="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4">
      @for (t of toast.toasts(); track t.id) {
        <div
          class="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-lg"
          [class.border-emerald-800]="t.type === 'success'"
          [class.bg-emerald-950]="t.type === 'success'"
          [class.text-emerald-300]="t.type === 'success'"
          [class.border-red-800]="t.type === 'error'"
          [class.bg-red-950]="t.type === 'error'"
          [class.text-red-300]="t.type === 'error'"
          [class.border-amber-800]="t.type === 'warning'"
          [class.bg-amber-950]="t.type === 'warning'"
          [class.text-amber-300]="t.type === 'warning'"
          [class.border-slate-700]="t.type === 'info'"
          [class.bg-slate-800]="t.type === 'info'"
          [class.text-slate-200]="t.type === 'info'"
        >
          <span class="flex-1">{{ t.message }}</span>
          <button
            type="button"
            class="opacity-70 hover:opacity-100"
            aria-label="Dismiss"
            (click)="toast.dismiss(t.id)"
          >
            ✕
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  readonly toast = inject(ToastService);
}
