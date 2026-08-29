import { Route } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

export const appRoutes: Route[] = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell/shell.component').then((m) => m.ShellComponent),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'credentials',
        loadComponent: () =>
          import('./features/credentials/credentials.component').then((m) => m.CredentialsComponent),
      },
      {
        path: 'destinations',
        loadComponent: () =>
          import('./features/destinations/destinations.component').then((m) => m.DestinationsComponent),
      },
      {
        path: 'workflows',
        loadComponent: () =>
          import('./features/workflows/workflows-list.component').then((m) => m.WorkflowsListComponent),
      },
      {
        path: 'workflows/new',
        loadComponent: () =>
          import('./features/workflows/workflow-editor.component').then((m) => m.WorkflowEditorComponent),
      },
      {
        path: 'workflows/:id',
        loadComponent: () =>
          import('./features/workflows/workflow-editor.component').then((m) => m.WorkflowEditorComponent),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
