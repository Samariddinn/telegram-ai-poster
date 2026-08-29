import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { ToastService } from '../services/toast.service';

// Requests to these hit while logged out (or trying to log in) — a 401 from
// them means "wrong credentials"/"invalid invite code", not "session expired".
// Auto-logout must not fire for those.
const AUTH_ENDPOINTS = ['/auth/login', '/auth/register'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const toast = inject(ToastService);
  const token = auth.token;

  const authedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      const isAuthEndpoint = AUTH_ENDPOINTS.some((path) => req.url.includes(path));
      // The isAuthenticated() check also stops duplicate toasts/logouts when
      // several requests are in flight and all 401 around the same time —
      // once the first one logs out, the rest see isAuthenticated() as false.
      if (err instanceof HttpErrorResponse && err.status === 401 && !isAuthEndpoint && auth.isAuthenticated()) {
        toast.error('Your session has expired. Please log in again.');
        auth.logout();
      }
      return throwError(() => err);
    }),
  );
};
