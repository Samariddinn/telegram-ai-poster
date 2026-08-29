import { Component, input } from '@angular/core';

/**
 * A generic pulsing placeholder bar for non-table loading states
 * (stat tiles, form skeletons, cards).
 */
@Component({
  selector: 'app-skeleton-block',
  standalone: true,
  template: `
    <div
      class="animate-pulse rounded bg-slate-800"
      [style.height]="height()"
      [style.width]="width()"
    ></div>
  `,
})
export class SkeletonBlockComponent {
  readonly height = input('1rem');
  readonly width = input('100%');
}
