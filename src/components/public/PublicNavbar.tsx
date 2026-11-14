import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.tsx';

const NAV_ITEMS = [
  { label: 'Features', href: '/features', sectionId: 'features' },
  { label: 'How It Works', href: '/how-it-works', sectionId: 'how-it-works' },
  { label: 'Pricing', href: '/pricing', sectionId: 'pricing' },
  { label: 'About', href: '/about', sectionId: '' },
  { label: 'Contact', href: '/contact', sectionId: '' },
];

export function PublicNavbar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';

  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [activeSection, setActiveSection] = useState<string>('');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const lastScrollY = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const onScroll = () => {
      const currentY = window.scrollY;
      setScrolled(currentY > 24);

      if (currentY > 120 && currentY > lastScrollY.current + 6) {
        setHidden(true);
      } else if (currentY < lastScrollY.current - 6 || currentY <= 40) {
        setHidden(false);
      }
      lastScrollY.current = currentY;

      if (isHome) {
        const ids = ['features', 'how-it-works', 'sample-report', 'pricing'];
        let found = '';
        for (const id of ids) {
          const el = document.getElementById(id);
          if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.top <= 160 && rect.bottom >= 160) {
              found = id;
              break;
            }
          }
        }
        setActiveSection(found);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusable = drawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    focusable?.[0]?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setDrawerOpen(false);
        menuButtonRef.current?.focus();
        return;
      }
      if (e.key === 'Tab' && focusable && focusable.length > 0) {
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawerOpen]);

  const handleNavClick = (
    e: React.MouseEvent<HTMLAnchorElement>,
    item: (typeof NAV_ITEMS)[number],
  ) => {
    if (isHome && item.sectionId) {
      const target = document.getElementById(item.sectionId);
      if (target) {
        e.preventDefault();
        setDrawerOpen(false);
        target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
  };

  return (
    <>
      <header
        className={`fixed top-0 inset-x-0 z-40 transition-all duration-200 ease-out ${
          hidden && !drawerOpen ? '-translate-y-full' : 'translate-y-0'
        } ${
          scrolled
            ? 'bg-surface-canvas/90 backdrop-blur-md border-b border-border-hairline shadow-sm'
            : 'bg-transparent border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between gap-8 px-6">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-ink-primary whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary rounded"
          >
            VenturePilot AI
          </Link>

          <nav
            aria-label="Primary navigation"
            className="hidden md:flex items-center gap-7 text-sm font-medium text-ink-secondary"
          >
            {NAV_ITEMS.map((item) => {
              const isActive =
                (isHome && item.sectionId && activeSection === item.sectionId) ||
                location.pathname === item.href;
              return (
                <Link
                  key={item.label}
                  to={item.href}
                  onClick={(e) => handleNavClick(e, item)}
                  className={`whitespace-nowrap shrink-0 transition-colors duration-150 hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-primary rounded ${
                    isActive ? 'text-brand-primary font-semibold' : ''
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {!user && (
              <Link
                to="/login"
                className="hidden md:inline-flex items-center justify-center rounded-lg border border-border-hairline bg-surface-canvas/90 px-4 py-2 text-sm font-medium text-ink-primary hover:bg-surface-subtle transition-colors duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
              >
                Sign In
              </Link>
            )}
            <button
              type="button"
              onClick={() => navigate(user ? '/dashboard' : '/register')}
              className="hidden md:inline-flex items-center justify-center rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white hover:bg-brand-primary-hover transition-all duration-150 active:scale-[0.98] whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-primary"
            >
              {user ? 'Go to Dashboard' : 'Get Started'}
            </button>

            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
              className="md:hidden inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border-hairline bg-surface-canvas text-ink-primary hover:bg-surface-subtle transition-colors"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation"
        >
          <div
            className="fixed inset-0 bg-ink-primary/35 backdrop-blur-[2px]"
            onClick={() => setDrawerOpen(false)}
          />
          <div
            ref={drawerRef}
            className="fixed inset-y-0 right-0 w-72 max-w-[85vw] bg-surface-canvas border-l border-border-hairline p-6 shadow-xl flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-6 border-b border-border-hairline">
                <span className="font-display text-base font-bold text-ink-primary">
                  VenturePilot AI
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setDrawerOpen(false);
                    menuButtonRef.current?.focus();
                  }}
                  aria-label="Close navigation menu"
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <nav className="mt-6 flex flex-col gap-2">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    onClick={(e) => handleNavClick(e, item)}
                    className="flex h-11 items-center rounded-lg px-3 text-base font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
                {!user && (
                  <Link
                    to="/login"
                    className="flex h-11 items-center rounded-lg px-3 text-base font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary transition-colors"
                  >
                    Sign In
                  </Link>
                )}
              </nav>
            </div>

            <div className="pt-6 border-t border-border-hairline">
              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  navigate(user ? '/dashboard' : '/register');
                }}
                className="w-full h-11 rounded-lg bg-brand-primary px-4 text-sm font-medium text-white hover:bg-brand-primary-hover transition-colors active:scale-[0.98]"
              >
                {user ? 'Go to Dashboard' : 'Validate My Business Idea'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
