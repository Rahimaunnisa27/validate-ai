import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import type { z } from 'zod';
import { useAuth } from '../../context/AuthContext.tsx';
import { api, ApiClientError } from '../../lib/api.ts';
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from '../../shared/schemas.ts';

function AuthCardShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-surface-subtle flex flex-col justify-center px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="text-center mb-8">
          <Link
            to="/"
            className="font-display text-xl font-bold tracking-tight text-ink-primary hover:text-brand-primary transition-colors"
          >
            VenturePilot AI
          </Link>
          <h1 className="mt-4 font-display text-2xl font-bold text-ink-primary">{title}</h1>
          <p className="mt-1.5 text-sm text-ink-secondary">{subtitle}</p>
        </div>

        <div className="rounded-xl border border-border-hairline bg-surface-canvas p-6 sm:p-8 shadow-sm">
          {children}
        </div>

        <div className="mt-6 text-center text-sm text-ink-secondary">{footer}</div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [serverError, setServerError] = useState<string | null>(null);

  const from = (location.state as { from?: string } | null)?.from || '/dashboard';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof loginSchema>) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      toast.success('Signed in successfully.');
      navigate(from, { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Unable to sign in.');
    }
  };

  return (
    <AuthCardShell
      title="Sign in to your workspace"
      subtitle="Access your startups, idea drafts, and settings."
      footer={
        <>
          Don&apos;t have an account?{' '}
          <Link to="/register" className="font-semibold text-brand-primary hover:underline">
            Create one free
          </Link>
        </>
      }
    >
      {serverError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-3.5 flex items-start gap-2.5 text-sm text-semantic-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="login-email" className="block text-sm font-medium text-ink-primary">
            Email Address
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="founder@startup.in"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-semantic-danger">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="login-password" className="block text-sm font-medium text-ink-primary">
              Password
            </label>
            <Link
              to="/forgot-password"
              className="text-xs font-medium text-brand-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            {...register('password')}
            className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="••••••••"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-semantic-danger">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </AuthCardShell>
  );
}

export function RegisterPage() {
  const { register: registerUser } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { fullName: '', email: '', password: '' },
  });

  const onSubmit = async (values: z.infer<typeof registerSchema>) => {
    setServerError(null);
    try {
      await registerUser(values.fullName, values.email, values.password);
      toast.success('Account created! Welcome to VenturePilot AI.');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Unable to register.');
    }
  };

  return (
    <AuthCardShell
      title="Create your free account"
      subtitle="Start validating business ideas and organizing your startups."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      {serverError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-3.5 flex items-start gap-2.5 text-sm text-semantic-danger"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{serverError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="reg-name" className="block text-sm font-medium text-ink-primary">
            Full Name
          </label>
          <input
            id="reg-name"
            type="text"
            autoComplete="name"
            {...register('fullName')}
            className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="Priya Nair"
          />
          {errors.fullName && (
            <p className="mt-1 text-xs text-semantic-danger">{errors.fullName.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="reg-email" className="block text-sm font-medium text-ink-primary">
            Email Address
          </label>
          <input
            id="reg-email"
            type="email"
            autoComplete="email"
            {...register('email')}
            className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="priya@venture.in"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-semantic-danger">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="reg-password" className="block text-sm font-medium text-ink-primary">
            Password (minimum 8 characters)
          </label>
          <input
            id="reg-password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
            className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="At least 8 characters"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-semantic-danger">{errors.password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Creating account...' : 'Create Account'}
        </button>
      </form>
    </AuthCardShell>
  );
}

export function ForgotPasswordPage() {
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean>(true);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotPasswordSchema>>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = async (values: z.infer<typeof forgotPasswordSchema>) => {
    setServerError(null);
    try {
      const res = await api.auth.forgotPassword(values);
      setInfoMessage(res.message);
      setEmailConfigured(res.emailConfigured);
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Request failed.');
    }
  };

  return (
    <AuthCardShell
      title="Reset your password"
      subtitle="Request a single-use password reset link (valid for 30 minutes)."
      footer={
        <Link to="/login" className="font-semibold text-brand-primary hover:underline">
          Back to Sign In
        </Link>
      }
    >
      {serverError && (
        <div
          role="alert"
          className="mb-5 rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-3.5 text-sm text-semantic-danger"
        >
          {serverError}
        </div>
      )}

      {infoMessage && (
        <div
          role="status"
          className={`mb-5 rounded-lg border p-3.5 text-sm ${
            emailConfigured
              ? 'border-semantic-success/30 bg-semantic-success/5 text-ink-primary'
              : 'border-semantic-warning/30 bg-semantic-warning/5 text-ink-primary'
          }`}
        >
          <p className="font-medium">
            {emailConfigured ? 'Check your email' : 'SMTP Email Not Configured'}
          </p>
          <p className="mt-1 text-xs text-ink-secondary">{infoMessage}</p>
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div>
          <label htmlFor="forgot-email" className="block text-sm font-medium text-ink-primary">
            Account Email
          </label>
          <input
            id="forgot-email"
            type="email"
            {...register('email')}
            className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
            placeholder="founder@startup.in"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-semantic-danger">{errors.email.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-all active:scale-[0.98] disabled:opacity-60"
        >
          {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {isSubmitting ? 'Requesting...' : 'Send Reset Link'}
        </button>
      </form>
    </AuthCardShell>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const initialToken = searchParams.get('token') || '';
  const [done, setDone] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof resetPasswordSchema>>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token: initialToken, password: '' },
  });

  const onSubmit = async (values: z.infer<typeof resetPasswordSchema>) => {
    setServerError(null);
    try {
      await api.auth.resetPassword(values);
      setDone(true);
      toast.success('Password updated successfully.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (err) {
      setServerError(err instanceof ApiClientError ? err.message : 'Unable to reset password.');
    }
  };

  return (
    <AuthCardShell
      title="Set a new password"
      subtitle="Enter your reset token and choose a new password (min 8 characters)."
      footer={
        <Link to="/login" className="font-semibold text-brand-primary hover:underline">
          Back to Sign In
        </Link>
      }
    >
      {done ? (
        <div className="flex items-start gap-3 text-sm text-ink-primary">
          <CheckCircle2 className="h-5 w-5 text-semantic-success shrink-0" aria-hidden="true" />
          <p>Password reset complete. Redirecting you to sign in...</p>
        </div>
      ) : (
        <>
          {serverError && (
            <div
              role="alert"
              className="mb-5 rounded-lg border border-semantic-danger/30 bg-semantic-danger/5 p-3.5 text-sm text-semantic-danger"
            >
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="reset-token" className="block text-sm font-medium text-ink-primary">
                Reset Token
              </label>
              <input
                id="reset-token"
                type="text"
                {...register('token')}
                className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 font-mono text-xs text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                placeholder="Paste reset token"
              />
              {errors.token && (
                <p className="mt-1 text-xs text-semantic-danger">{errors.token.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="reset-password" className="block text-sm font-medium text-ink-primary">
                New Password
              </label>
              <input
                id="reset-password"
                type="password"
                {...register('password')}
                className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                placeholder="At least 8 characters"
              />
              {errors.password && (
                <p className="mt-1 text-xs text-semantic-danger">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-all active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        </>
      )}
    </AuthCardShell>
  );
}
