import { Link } from 'react-router-dom';

export function PublicFooter() {
  return (
    <footer className="border-t border-border-hairline bg-surface-subtle">
      <div className="mx-auto max-w-[1200px] px-6 py-12">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
          <div className="md:col-span-1">
            <Link to="/" className="font-display text-lg font-bold text-ink-primary">
              VenturePilot AI
            </Link>
            <p className="mt-3 text-sm leading-relaxed text-ink-secondary">
              Structured business idea validation and startup execution workspace built for founders
              in India and globally.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Product</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-secondary">
              <li>
                <Link to="/features" className="hover:text-ink-primary transition-colors">
                  Features
                </Link>
              </li>
              <li>
                <Link to="/how-it-works" className="hover:text-ink-primary transition-colors">
                  How It Works
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="hover:text-ink-primary transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link to="/integrations" className="hover:text-ink-primary transition-colors">
                  Integration Status
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Company</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-secondary">
              <li>
                <Link to="/about" className="hover:text-ink-primary transition-colors">
                  About
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-ink-primary transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-ink-primary transition-colors">
                  Sign In
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-ink-primary transition-colors">
                  Create Account
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-ink-primary">Legal & Trust</h3>
            <ul className="mt-3 space-y-2.5 text-sm text-ink-secondary">
              <li>
                <Link to="/terms" className="hover:text-ink-primary transition-colors">
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-ink-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link to="/refund-policy" className="hover:text-ink-primary transition-colors">
                  Refund Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-3 border-t border-border-hairline pt-6 text-xs text-ink-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} VenturePilot AI. All rights reserved.</p>
          <p>
            Evidence-first startup intelligence · Scores assess clarity and evidence, never
            guarantee business outcomes.
          </p>
        </div>
      </div>
    </footer>
  );
}
