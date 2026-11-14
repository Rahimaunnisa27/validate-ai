import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { RequireAuth } from './components/app/AppShell.tsx';
import { AuthProvider } from './context/AuthContext.tsx';
import { CompetitorsPage } from './pages/app/CompetitorsPage.tsx';
import { DashboardPage } from './pages/app/DashboardPage.tsx';
import { FinancePage } from './pages/app/FinancePage.tsx';
import { IdeaDetailPage } from './pages/app/IdeaDetailPage.tsx';
import { IdeasListPage } from './pages/app/IdeasListPage.tsx';
import { IdeaWizardPage } from './pages/app/IdeaWizardPage.tsx';
import { IntegrationStatusPage } from './pages/app/IntegrationStatusPage.tsx';
import { LeadsPage } from './pages/app/LeadsPage.tsx';
import { MarketingPage } from './pages/app/MarketingPage.tsx';
import { PersonasPage } from './pages/app/PersonasPage.tsx';
import { ReportsListPage } from './pages/app/ReportsListPage.tsx';
import { ReportViewerPage } from './pages/app/ReportViewerPage.tsx';
import { ResearchPage } from './pages/app/ResearchPage.tsx';
import { SalesPage } from './pages/app/SalesPage.tsx';
import { SettingsPage } from './pages/app/SettingsPage.tsx';
import { StartupsPage } from './pages/app/StartupsPage.tsx';
import {
  ForgotPasswordPage,
  LoginPage,
  RegisterPage,
  ResetPasswordPage,
} from './pages/auth/AuthPages.tsx';
import { ContactPage } from './pages/public/ContactPage.tsx';
import {
  AboutPage,
  FeaturesPage,
  HowItWorksPage,
  PricingPage,
  PrivacyPage,
  RefundPolicyPage,
  TermsPage,
} from './pages/public/InfoPages.tsx';
import { LandingPage } from './pages/public/LandingPage.tsx';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" richColors closeButton />
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/refund-policy" element={<RefundPolicyPage />} />
          <Route path="/integrations" element={<IntegrationStatusPage />} />

          {/* Auth Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Workspace Routes */}
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/startups"
            element={
              <RequireAuth>
                <StartupsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ideas"
            element={
              <RequireAuth>
                <IdeasListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ideas/new"
            element={
              <RequireAuth>
                <IdeaWizardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ideas/:id/edit"
            element={
              <RequireAuth>
                <IdeaWizardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/ideas/:id"
            element={
              <RequireAuth>
                <IdeaDetailPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports"
            element={
              <RequireAuth>
                <ReportsListPage />
              </RequireAuth>
            }
          />
          <Route
            path="/reports/:id"
            element={
              <RequireAuth>
                <ReportViewerPage />
              </RequireAuth>
            }
          />
          <Route
            path="/finance"
            element={
              <RequireAuth>
                <FinancePage />
              </RequireAuth>
            }
          />
          <Route
            path="/personas"
            element={
              <RequireAuth>
                <PersonasPage />
              </RequireAuth>
            }
          />
          <Route
            path="/research"
            element={
              <RequireAuth>
                <ResearchPage />
              </RequireAuth>
            }
          />
          <Route
            path="/competitors"
            element={
              <RequireAuth>
                <CompetitorsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/leads"
            element={
              <RequireAuth>
                <LeadsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/marketing"
            element={
              <RequireAuth>
                <MarketingPage />
              </RequireAuth>
            }
          />
          <Route
            path="/sales"
            element={
              <RequireAuth>
                <SalesPage />
              </RequireAuth>
            }
          />
          <Route
            path="/settings"
            element={
              <RequireAuth>
                <SettingsPage />
              </RequireAuth>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
