import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastContainerComponent } from './shared/toast/toast-container.component';

@Component({
  imports: [RouterOutlet, ToastContainerComponent],
  selector: 'app-root',
  template: `
    <router-outlet />
    <app-toast-container />
  `,
})
export class App {
  protected title = 'web';
}
