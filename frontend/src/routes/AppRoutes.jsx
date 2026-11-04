import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import AppLayout from '../components/layout/AppLayout';
import { Loading, EmptyState } from '../components/common/ui';
import LoginPage from '../pages/auth/LoginPage';

const p = (f) => lazy(f);
const SetupPage = p(() => import('../pages/auth/SetupPage'));
const ForgotPasswordPage = p(() => import('../pages/auth/ForgotPasswordPage'));
const ResetPasswordPage = p(() => import('../pages/auth/ResetPasswordPage'));
const DashboardPage = p(() => import('../pages/dashboard/DashboardPage'));
const SalesIdList = p(() => import('../pages/sales-ids/SalesIdList'));
const SalesIdDetails = p(() => import('../pages/sales-ids/SalesIdDetails'));
const LeadList = p(() => import('../pages/leads/LeadList'));
const LeadDetails = p(() => import('../pages/leads/LeadDetails'));
const CreateLead = p(() => import('../pages/leads/CreateLead'));
const EditLead = p(() => import('../pages/leads/EditLead'));
const ContactList = p(() => import('../pages/contacts/ContactList'));
const ContactDetails = p(() => import('../pages/contacts/ContactDetails'));
const CompanyList = p(() => import('../pages/companies/CompanyList'));
const CompanyDetails = p(() => import('../pages/companies/CompanyDetails'));
const DealBoard = p(() => import('../pages/deals/DealBoard'));
const DealList = p(() => import('../pages/deals/DealList'));
const DealDetails = p(() => import('../pages/deals/DealDetails'));
const TaskList = p(() => import('../pages/tasks/TaskList'));
const CampaignList = p(() => import('../pages/campaign/CampaignList'));
const CreateCampaign = p(() => import('../pages/campaign/CreateCampaign'));
const CampaignDetails = p(() => import('../pages/campaign/CampaignDetails'));
const CampaignAnalytics = p(() => import('../pages/campaign/CampaignAnalytics'));
const SmtpAccountList = p(() => import('../pages/smtp-accounts/SmtpAccountList'));
const EmailListList = p(() => import('../pages/email-lists/EmailListList'));
const EmailListDetails = p(() => import('../pages/email-lists/EmailListDetails'));
const TemplateList = p(() => import('../pages/templates/TemplateList'));
const TemplateEditor = p(() => import('../pages/templates/TemplateEditor'));
const AutomationList = p(() => import('../pages/automations/AutomationList'));
const AutomationBuilder = p(() => import('../pages/automations/AutomationBuilder'));
const ReportsPage = p(() => import('../pages/reports/ReportsPage'));
const SettingsPage = p(() => import('../pages/settings/SettingsPage'));

export default function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/setup" element={<SetupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="sales-ids" element={<SalesIdList />} />
          <Route path="sales-ids/:id" element={<SalesIdDetails />} />
          <Route path="leads" element={<LeadList />} />
          <Route path="leads/new" element={<CreateLead />} />
          <Route path="leads/:id" element={<LeadDetails />} />
          <Route path="leads/:id/edit" element={<EditLead />} />
          <Route path="contacts" element={<ContactList />} />
          <Route path="contacts/:id" element={<ContactDetails />} />
          <Route path="companies" element={<CompanyList />} />
          <Route path="companies/:id" element={<CompanyDetails />} />
          <Route path="deals" element={<DealBoard />} />
          <Route path="deals/list" element={<DealList />} />
          <Route path="deals/:id" element={<DealDetails />} />
          <Route path="tasks" element={<TaskList />} />
          <Route path="campaigns" element={<CampaignList />} />
          <Route path="campaigns/new" element={<CreateCampaign />} />
          <Route path="campaigns/:id" element={<CampaignDetails />} />
          <Route path="campaigns/:id/edit" element={<CreateCampaign />} />
          <Route path="campaigns/:id/analytics" element={<CampaignAnalytics />} />
          <Route path="smtp-accounts" element={<SmtpAccountList />} />
          <Route path="email-lists" element={<EmailListList />} />
          <Route path="email-lists/:id" element={<EmailListDetails />} />
          <Route path="templates" element={<TemplateList />} />
          <Route path="templates/new" element={<TemplateEditor />} />
          <Route path="templates/:id" element={<TemplateEditor />} />
          <Route path="automations" element={<AutomationList />} />
          <Route path="automations/new" element={<AutomationBuilder />} />
          <Route path="automations/:id" element={<AutomationBuilder />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<EmptyState title="Page not found" description="Check the address or use the menu." />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
