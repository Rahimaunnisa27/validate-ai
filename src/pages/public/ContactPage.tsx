import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, Mail } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import type { z } from 'zod';
import { PublicFooter } from '../../components/public/PublicFooter.tsx';
import { PublicNavbar } from '../../components/public/PublicNavbar.tsx';
import { api, ApiClientError } from '../../lib/api.ts';
import { contactSchema } from '../../shared/schemas.ts';

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactPage() {
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { name: '', email: '', subject: '', message: '' },
  });

  const onSubmit = async (values: ContactFormValues) => {
    try {
      const res = await api.contact.submit(values);
      setSubmittedMessage(res.message);
      toast.success('Message saved successfully.');
      reset();
    } catch (err) {
      const msg =
        err instanceof ApiClientError ? err.message : 'Unable to send message right now.';
      toast.error(msg);
    }
  };

  return (
    <div className="min-h-screen bg-surface-canvas text-ink-primary flex flex-col">
      <PublicNavbar />
      <main className="flex-1 pt-28 pb-20">
        <div className="mx-auto max-w-[960px] px-6">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-sm font-medium text-brand-primary">Contact</p>
              <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink-primary">
                Get in touch
              </h1>
              <p className="mt-4 text-sm leading-relaxed text-ink-secondary sm:text-base">
                Have questions about validation tiers, enterprise workshops, or integration setup?
                Send us a message. Every submission is persisted directly to our database.
              </p>

              <div className="mt-8 rounded-xl border border-border-hairline bg-surface-subtle p-5">
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-brand-primary" aria-hidden="true" />
                  <div>
                    <p className="text-xs font-medium text-ink-muted">Support Desk</p>
                    <p className="text-sm font-semibold text-ink-primary">
                      support@venturepilot.local
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <div className="rounded-xl border border-border-hairline bg-surface-canvas p-6 sm:p-8">
                {submittedMessage && (
                  <div
                    role="status"
                    className="mb-6 rounded-lg border border-semantic-success/30 bg-semantic-success/5 p-4 flex items-start gap-3"
                  >
                    <CheckCircle2
                      className="h-5 w-5 text-semantic-success shrink-0 mt-0.5"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-ink-primary">{submittedMessage}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                    <div>
                      <label htmlFor="contact-name" className="block text-sm font-medium text-ink-primary">
                        Your Name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        {...register('name')}
                        className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                        placeholder="Aarav Sharma"
                      />
                      {errors.name && (
                        <p className="mt-1 text-xs text-semantic-danger">{errors.name.message}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="contact-email" className="block text-sm font-medium text-ink-primary">
                        Email Address
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        {...register('email')}
                        className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                        placeholder="aarav@company.in"
                      />
                      {errors.email && (
                        <p className="mt-1 text-xs text-semantic-danger">{errors.email.message}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="contact-subject" className="block text-sm font-medium text-ink-primary">
                      Subject
                    </label>
                    <input
                      id="contact-subject"
                      type="text"
                      {...register('subject')}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="Question about validation reports"
                    />
                    {errors.subject && (
                      <p className="mt-1 text-xs text-semantic-danger">{errors.subject.message}</p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="contact-message" className="block text-sm font-medium text-ink-primary">
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      rows={5}
                      {...register('message')}
                      className="mt-1.5 block w-full rounded-lg border border-border-hairline bg-surface-canvas px-3.5 py-2.5 text-sm text-ink-primary focus:border-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/20"
                      placeholder="Tell us how we can help..."
                    />
                    {errors.message && (
                      <p className="mt-1 text-xs text-semantic-danger">{errors.message.message}</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="inline-flex h-11 items-center justify-center rounded-lg bg-brand-primary px-6 text-sm font-medium text-white hover:bg-brand-primary-hover transition-all active:scale-[0.98] disabled:opacity-60"
                  >
                    {isSubmitting ? 'Sending...' : 'Send Message'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
