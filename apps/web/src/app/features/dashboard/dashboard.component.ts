import { Component, OnInit, computed, inject } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CredentialsService } from '../../core/services/credentials.service';
import { DestinationsService } from '../../core/services/destinations.service';
import { WorkflowsService } from '../../core/services/workflows.service';
import { SkeletonBlockComponent } from '../../shared/skeleton/skeleton-block.component';
import { formatInterval } from '../../shared/format-interval';

interface AttentionItem {
  message: string;
  link: string[];
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, SkeletonBlockComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit {
  readonly auth = inject(AuthService);
  readonly credentials = inject(CredentialsService);
  readonly destinations = inject(DestinationsService);
  readonly workflows = inject(WorkflowsService);

  readonly formatInterval = formatInterval;

  readonly loading = computed(
    () => this.credentials.loading() || this.destinations.loading() || this.workflows.loading(),
  );

  readonly enabledWorkflows = computed(() => this.workflows.workflows().filter((w) => w.enabled));

  readonly upcomingRuns = computed(() =>
    this.enabledWorkflows()
      .filter((w) => w.nextRunAt)
      .sort((a, b) => new Date(a.nextRunAt as string).getTime() - new Date(b.nextRunAt as string).getTime())
      .slice(0, 5),
  );

  readonly attentionItems = computed<AttentionItem[]>(() => {
    const items: AttentionItem[] = [];
    for (const w of this.workflows.workflows()) {
      if (w.consecutiveFailures > 0) {
        items.push({
          message: `"${w.name}" has ${w.consecutiveFailures} consecutive failure${w.consecutiveFailures === 1 ? '' : 's'}`,
          link: ['/workflows', w.id],
        });
      }
    }
    for (const d of this.destinations.destinations()) {
      if (!d.verifiedAt) {
        items.push({ message: `Destination "${d.title}" has never been verified`, link: ['/destinations'] });
      }
    }
    for (const c of this.credentials.credentials()) {
      if (!c.lastValidatedAt) {
        items.push({ message: `Credential "${c.label}" has never been validated`, link: ['/credentials'] });
      }
    }
    return items;
  });

  ngOnInit(): void {
    void this.credentials.refresh();
    void this.destinations.refresh();
    void this.workflows.refresh();
  }
}
