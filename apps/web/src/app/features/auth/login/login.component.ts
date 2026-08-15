import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  username = '';
  password = '';
  inviteCode = '';

  toggleMode(): void {
    this.mode.set(this.mode() === 'login' ? 'register' : 'login');
    this.error.set(null);
  }

  async submit(): Promise<void> {
    this.error.set(null);
    this.loading.set(true);
    try {
      if (this.mode() === 'login') {
        await this.auth.login({ username: this.username, password: this.password });
      } else {
        await this.auth.register({
          username: this.username,
          password: this.password,
          inviteCode: this.inviteCode,
        });
      }
      this.router.navigate(['/']);
    } catch (err) {
      this.error.set(this.extractError(err));
    } finally {
      this.loading.set(false);
    }
  }

  private extractError(err: unknown): string {
    const httpError = err as { error?: { message?: string | string[] } };
    const message = httpError?.error?.message;
    if (Array.isArray(message)) {
      return message.join(', ');
    }
    return message ?? 'Something went wrong. Please try again.';
  }
}
