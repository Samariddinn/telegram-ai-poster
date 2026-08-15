import { Component } from '@angular/core';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  template: `
    <div class="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-300">
      <h2 class="text-lg font-semibold text-slate-100">Welcome</h2>
      <p class="mt-2 text-sm">
        You're authenticated. Workflows, credentials, and destinations land here in later phases.
      </p>
    </div>
  `,
})
export class DashboardComponent {}
