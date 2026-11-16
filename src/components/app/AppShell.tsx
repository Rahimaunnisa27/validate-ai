import {
  Activity,
  Briefcase,
  Calculator,
  CheckSquare,
  ChevronDown,
  Compass,
  FileCheck2,
  FilePlus2,
  Handshake,
  LayoutDashboard,
  Lightbulb,
  LogOut,
  Megaphone,
  Menu,
  Receipt,
  Search,
  Settings,
  Swords,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useEffect, useState, type ReactNode } from 'react';
import { Link, Navigate, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext.tsx';
import { MOTION_DURATIONS } from '../../lib/motion.ts';

const WORKSPACE_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/startups', label: 'Startups', icon: Briefcase },
  { to: '/ideas/new', label: 'Submit Idea', icon: FilePlus2 },
  { to: '/ideas', label: 'Ideas & Drafts', icon: Lightbulb },
  { to: '/reports', label: 'Validation Reports', icon: FileCheck2 },
  { to: '/finance', label: 'Financial Planner', icon: Calculator },
  { to: '/personas', label: 'Customer Personas', icon: Users },
  { to: '/research', label: 'Market Research', icon: Search },
  { to: '/competitors', label: 'Competitor Analysis', icon: Swords },
  { to: '/leads', label: 'Leads & Pipeline', icon: UserCheck },
  { to: '/marketing', label: 'Marketing Strategy', icon: Megaphone },
  { to: '/sales', label: 'Sales Assistant', icon: Handshake },
  { to: '/roadmap', label: 'Startup Roadmap', icon: Compass },
  { to: '/tasks', label: 'Tasks & Execution', icon: CheckSquare },
  { to: '/expenses', label: 'Expense Tracker', icon: Receipt },
  { to: '/settings', label: 'Profile & Settings', icon: Settings },
  { to: '/integrations', label: 'Integration Status', icon: Activity },
];

const UPCOMING_PHASES = [
  { phase: 'Phase 6', items: 'Razorpay Payments & History' },
];

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-surface-subtle flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-border-hairline bg-surface-canvas p-8 space-y-3 animate-pulse">
          <div className="h-5 w-1/2 rounded bg-surface-muted" />
          <div className="h-4 w-3/4 rounded bg-surface-muted" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  }

  return <>{children}</>;
}

export function AppShell({
  title,
  breadcrumb,
  action,
  children,
}: {
  title: string;
  breadcrumb: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const reducedMotion = useReducedMotion();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [roadmapOpen, setRoadmapOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileOpen]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      toast.success('Signed out.');
      navigate('/login', { replace: true });
    } finally {
      setLoggingOut(false);
    }
  };

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-surface-canvas border-r border-border-hairline">
      <div className="p-5">
        <div className="flex items-center justify-between">
          <Link
            to="/dashboard"
            className="font-display text-lg font-bold tracking-tight text-ink-primary"
          >
            VenturePilot AI
          </Link>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            aria-label="Close sidebar"
            className="lg:hidden inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-secondary hover:bg-surface-subtle"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Workspace navigation" className="mt-6 space-y-1">
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/ideas'}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-brand-primary/8 text-brand-primary'
                      : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary'
                  }`
                }
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-border-hairline pt-4">
          <button
            type="button"
            onClick={() => setRoadmapOpen((prev) => !prev)}
            aria-expanded={roadmapOpen}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-xs font-medium text-ink-muted hover:bg-surface-subtle hover:text-ink-secondary transition-colors"
          >
            <span>Coming in later phases</span>
            <ChevronDown
              className={`h-3.5 w-3.5 transition-transform duration-150 ${
                roadmapOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>
          {roadmapOpen && (
            <div className="mt-2 space-y-2.5 px-3 text-xs text-ink-muted">
              {UPCOMING_PHASES.map((up) => (
                <div key={up.phase}>
                  <p className="font-semibold text-ink-secondary">{up.phase}</p>
                  <p className="mt-0.5 leading-snug">{up.items}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-border-hairline p-4">
        {user && (
          <div className="mb-3 px-2">
            <p className="truncate text-sm font-medium text-ink-primary">{user.fullName}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>
        )}
        <button
          type="button"
          disabled={loggingOut}
          onClick={handleLogout}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary transition-colors disabled:opacity-50"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{loggingOut ? 'Signing out...' : 'Sign Out'}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-subtle text-ink-primary flex">
      <aside className="hidden lg:block w-[260px] shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <div
            className="fixed inset-0 bg-ink-primary/35 backdrop-blur-[2px]"
            onClick={() => setMobileOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 w-[260px] max-w-[85vw] shadow-xl">
            {sidebarContent}
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-surface-canvas/95 backdrop-blur border-b border-border-hairline px-4 sm:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation sidebar"
              className="lg:hidden inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border-hairline text-ink-primary hover:bg-surface-subtle shrink-0"
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="text-xs text-ink-muted truncate">{breadcrumb}</p>
              <h1 className="font-display text-base font-bold text-ink-primary truncate sm:text-lg">
                {title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {action || (
              <Link
                to="/ideas/new"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-primary px-3.5 text-xs font-medium text-white hover:bg-brand-primary-hover transition-colors whitespace-nowrap"
              >
                <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" />
                New Idea
              </Link>
            )}
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-8 sm:py-8">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reducedMotion ? 0 : MOTION_DURATIONS.pageTransition }}
            className="mx-auto max-w-[1160px]"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
