import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2 } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { AppShell } from '../../components/app/AppShell.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { api, ApiClientError } from '../../lib/api.ts';
import { profileUpdateSchema } from '../../shared/schemas.ts';

type ProfileFormValues = z.input<typeof profileUpdateSchema>;

export function SettingsPage() {
  const { user, refreshUser } = useAuth();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileUpdateSchema),
    defaultValues: {
      fullName: user?.fullName || '',
      role: user?.role || 'Founder',
      timezone: user?.timezone || 'Asia/Kolkata',
      currentPassword: '',
      newPassword: '',
    },
  });

  useEffect(() => {
    if (user) {
      reset({
        fullName: user.fullName,
        role: user.role,
        timezone: user.timezone,
        currentPassword: '',
        newPassword: '',
      });
    }
  }, [user, reset]);

  const onSubmit = async (values: ProfileFormValues) => {
    try {
      await api.users.updateMe(values);
      await refreshUser();
      toast.success('Profile settings updated.');
      reset({
        ...values,
        currentPassword: '',
        newPassword: '',
      });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : 'Unable to update settings.');
    }
  };

  return (
    <AppShell title="Profile & Settings" breadcrumb="Workspace / Settings">
      <div className="max-w-2xl space-y-6">
        <div className="rounded-xl border border-border-hairline bg-surface-canvas p-6 sm:p-8">
          <h2 className="text-base font-semibold text-ink-primary">Account Information</h2>
          <p className="mt-1 text-sm text-ink-secondary">
            Manage your founder profile and security credentials.
          </p>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5" noValidate>
            <div>
              <label htmlFor="set-email" className="block text-sm font-medium text-ink-primary">
                Email Address
              </label>
              <input
                id="set-email"
                type="email"
                disabled
                value={user?.email || ''}
                className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-subtle px-3.5 py-2.5 text-sm text-ink-muted"
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="set-name" className="block text-sm font-medium text-ink-primary">
                  Full Name *
                </label>
                <input
                  id="set-name"
                  type="text"
                  {...register('fullName')}
                  className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                />
                {errors.fullName && (
                  <p className="mt-1 text-xs text-semantic-danger">{errors.fullName.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="set-role" className="block text-sm font-medium text-ink-primary">
                  Role
                </label>
                <input
                  id="set-role"
                  type="text"
                  {...register('role')}
                  className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="Founder / Student / Operator"
                />
              </div>
            </div>

            <div>
              <label htmlFor="set-tz" className="block text-sm font-medium text-ink-primary">
                Timezone
              </label>
              <select
                id="set-tz"
                {...register('timezone')}
                className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
              >
                <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                <option value="UTC">UTC</option>
                <option value="America/New_York">America/New_York</option>
                <option value="Europe/London">Europe/London</option>
                <option value="Asia/Singapore">Asia/Singapore</option>
              </select>
            </div>

            <div className="border-t border-border-hairline pt-5">
              <h3 className="text-sm font-semibold text-ink-primary">Change Password (optional)</h3>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="set-curr-pw"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    Current Password
                  </label>
                  <input
                    id="set-curr-pw"
                    type="password"
                    {...register('currentPassword')}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                </div>
                <div>
                  <label
                    htmlFor="set-new-pw"
                    className="block text-sm font-medium text-ink-primary"
                  >
                    New Password (min 8 chars)
                  </label>
                  <input
                    id="set-new-pw"
                    type="password"
                    {...register('newPassword')}
                    className="mt-1.5 block w-full rounded-lg border border-border-hairline px-3.5 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                  />
                  {errors.newPassword && (
                    <p className="mt-1 text-xs text-semantic-danger">
                      {errors.newPassword.message}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-primary px-5 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors active:scale-[0.98] disabled:opacity-60"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {isSubmitting ? 'Saving...' : 'Save Settings'}
            </button>
          </form>
        </div>
      </div>
    </AppShell>
  );
}
