import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCheck, Clock3, FileCheck2, FileText, Plus, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { listAssessmentQueue, listWorkspaceApplications } from "../services/financeApplicationService";
import { listApprovals } from "../services/approvalService";
import { listCreditAssessments } from "../services/creditAssessmentService";
import { getEmiScheduleForApplication, listEmiInstallments } from "../services/emiService";
import { listAdminKycRecords } from "../services/kycService";

function recordsFrom(response) {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.applications)) return payload.applications;
  if (Array.isArray(payload?.assessments)) return payload.assessments;
  if (Array.isArray(payload?.approvals)) return payload.approvals;
  return [];
}

function valueOf(record, ...keys) {
  for (const key of keys) if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
  return null;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(number) : "—";
}

const dashboardDateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const dashboardDate = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

function displayDate(value, formatter = dashboardDateTime) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : formatter.format(date);
}

function sumMoney(records, field) {
  const cents = records.reduce((total, record) => total + Math.round((Number(record[field]) || 0) * 100), 0);
  return cents / 100;
}

async function loadCustomerFinancialSummary(customerApplications) {
  const scheduleResults = await Promise.allSettled(customerApplications.map(async (application) => {
    try {
      const account = await getEmiScheduleForApplication(application.applicationId);
      return { account, application };
    } catch (failure) {
      if (failure.response?.status === 404) return null;
      throw failure;
    }
  }));
  const scheduleFailure = scheduleResults.find((result) => result.status === "rejected");
  if (scheduleFailure) throw scheduleFailure.reason;

  const accounts = scheduleResults.filter((result) => result.status === "fulfilled" && result.value).map((result) => result.value);
  const installmentResults = await Promise.allSettled(accounts.map(async ({ account, application }) => {
    try {
      const response = await listEmiInstallments(account.loanAccountId);
      return { account, application, installments: recordsFrom(response) };
    } catch (failure) {
      if (failure.response?.status === 404) return { account, application, installments: [] };
      throw failure;
    }
  }));
  const installmentFailure = installmentResults.find((result) => result.status === "rejected");
  if (installmentFailure) throw installmentFailure.reason;

  const loans = installmentResults.filter((result) => result.status === "fulfilled").map((result) => result.value);
  const financedAccounts = loans.filter(({ account }) => ["ACTIVE", "CLOSED"].includes(String(account.status).toUpperCase()));
  const activeAccounts = loans.filter(({ account }) => String(account.status).toUpperCase() === "ACTIVE");
  const pendingInstallments = loans.flatMap(({ account, application, installments }) => installments
    .filter((installment) => String(installment.status).toUpperCase() === "PENDING")
    .map((installment) => ({ ...installment, loanAccountId: account.loanAccountId, applicationId: application.applicationId, applicationNumber: application.applicationNumber })))
    .sort((left, right) => (Date.parse(left.dueDate) || Infinity) - (Date.parse(right.dueDate) || Infinity));

  return {
    approvedFinance: sumMoney(financedAccounts.map(({ account }) => account), "principalAmount"),
    outstandingBalance: sumMoney(activeAccounts.map(({ account }) => account), "outstandingAmount"),
    nextInstallment: pendingInstallments[0] || null,
  };
}

function financialSummaryError(error) {
  const status = error.response?.status;
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to view this financial summary.";
  if (status === 502 || status === 503) return "Financial summary temporarily unavailable. Your application history remains available.";
  return "Financial summary could not be loaded. Your application history remains available.";
}

function StatusBadge({ status }) {
  const label = String(status || "UNKNOWN").replaceAll("_", " ");
  return <span className={`status-badge status-${String(status || "unknown").toLowerCase().replaceAll("_", "-")}`}>{label}</span>;
}

function MetricCard({ label, value, note, icon: Icon, tone = "teal" }) {
  return <article className="metric-card"><div className={`metric-icon ${tone}`}><Icon size={19} /></div><p>{label}</p><strong>{value}</strong><span>{note}</span></article>;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [applications, setApplications] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [staffApplications, setStaffApplications] = useState([]);
  const [staffAssessments, setStaffAssessments] = useState([]);
  const [staffApprovals, setStaffApprovals] = useState([]);
  const [financeSummaryResult, setFinanceSummaryResult] = useState({ userId: null, retryCount: -1, data: null, error: "" });
  const isCustomer = user?.role === "CUSTOMER";
  const isAdmin = user?.role === "ADMIN";
  const isAnalyst = user?.role === "CREDIT_ANALYST";
  const isCreditManager = user?.role === "CREDIT_MANAGER";
  const isInternal = !isCustomer;
  const [loading, setLoading] = useState(isCustomer || isAdmin || isAnalyst || isCreditManager);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isCustomer && !isAdmin && !isAnalyst && !isCreditManager) return undefined;
    let current = true;
    async function fetchDashboardData() {
      try {
        if (isAdmin) {
          const response = await listAdminKycRecords();
          if (current) setCustomers(recordsFrom(response));
        } else if (isCustomer) {
          const response = await listWorkspaceApplications(false, user?.id);
          const customerApplications = recordsFrom(response);
          if (current) {
            setApplications(customerApplications);
            setLoading(false);
          }
          try {
            const data = await loadCustomerFinancialSummary(customerApplications);
            if (current) setFinanceSummaryResult({ userId: user.id, retryCount, data, error: "" });
          } catch (summaryFailure) {
            if (current) setFinanceSummaryResult({ userId: user.id, retryCount, data: null, error: financialSummaryError(summaryFailure) });
          }
        } else {
          const [queueResult, assessmentResult, approvalResult] = await Promise.all([
            listAssessmentQueue(),
            listCreditAssessments(),
            isCreditManager ? listApprovals() : Promise.resolve([]),
          ]);
          if (current) {
            setStaffApplications(recordsFrom(queueResult).filter((item) => item.status === "SUBMITTED"));
            setStaffAssessments(recordsFrom(assessmentResult));
            setStaffApprovals(recordsFrom(approvalResult));
          }
        }
      } catch (requestError) {
        if (current) setError(requestError.response?.status === 503 ? "The finance service is temporarily unavailable." : isAdmin ? "Unable to load customer and KYC dashboard data." : isCustomer ? "We couldn't load the latest application data." : "Unable to load staff queue metrics.");
        if (current && isCustomer) setFinanceSummaryResult({ userId: user?.id, retryCount, data: null, error: "Financial summary could not be loaded because applications are unavailable." });
      } finally {
        if (current) setLoading(false);
      }
    }
    fetchDashboardData();
    return () => { current = false; };
  }, [isCustomer, isAdmin, isAnalyst, isCreditManager, user?.id, retryCount]);

  function retryLoad() {
    setLoading(true);
    setError("");
    setRetryCount((count) => count + 1);
  }

  const statuses = applications.map((item) => String(valueOf(item, "status", "applicationStatus") || "").toUpperCase());
  const activeCount = statuses.filter((status) => ["SUBMITTED", "UNDER_REVIEW", "APPROVED", "DISBURSED", "ACTIVE"].includes(status)).length;
  const kycStatuses = customers.map((customer) => String(customer.kycStatus || "PENDING").toUpperCase());
  const pendingKycCount = kycStatuses.filter((status) => ["PENDING", "UNDER_REVIEW"].includes(status)).length;
  const verifiedKycCount = kycStatuses.filter((status) => status === "VERIFIED").length;
  const rejectedKycCount = kycStatuses.filter((status) => status === "REJECTED").length;
  const incompleteOnboardingCount = customers.filter((customer) => String(customer.onboardingStatus || "").toUpperCase() !== "COMPLETED").length;
  const assessedApplicationIds = new Set(staffAssessments.map((assessment) => String(assessment.applicationId)));
  const decidedApplicationIds = new Set(staffApprovals.map((approval) => String(approval.applicationId)));
  const pendingAssessmentCount = staffApplications.filter((application) => !assessedApplicationIds.has(String(application.applicationId))).length;
  const pendingDecisionCount = staffAssessments.filter((assessment) => assessment.status === "ELIGIBLE" && !decidedApplicationIds.has(String(assessment.applicationId))).length;
  const financeSummaryCurrent = financeSummaryResult.userId === user?.id && financeSummaryResult.retryCount === retryCount;
  const financeSummaryLoading = isCustomer && !financeSummaryCurrent;
  const financeSummary = financeSummaryCurrent ? financeSummaryResult.data : null;
  const financeSummaryErrorText = financeSummaryCurrent ? financeSummaryResult.error : "";
  const name = user?.name?.split(" ")[0] || "there";
  const roleNames = {
    ADMIN: "Administrator",
    LOAN_OFFICER: "Loan officer",
    CREDIT_ANALYST: "Credit analyst",
    CREDIT_MANAGER: "Credit manager",
  };
  const staffModules = {
    ADMIN: ["Manage internal users", "Review system status", "Monitor finance workflows"],
    LOAN_OFFICER: [],
    CREDIT_ANALYST: ["Review assessment requests", "Record eligibility findings", "View assessment history"],
    CREDIT_MANAGER: ["Review eligible assessments", "Record application decisions", "Manage approved disbursements"],
  };

  return (
    <div className="page-stack page-enter">
      <section className="page-heading dashboard-heading">
        <div><p className="eyebrow">{isInternal ? `${roleNames[user?.role] || "STAFF"} WORKSPACE` : "YOUR FINANCIAL OVERVIEW"}</p><h1>{isInternal ? `${roleNames[user?.role] || "Staff"} dashboard` : `Welcome back, ${name}`}</h1><p>{isInternal ? "Your workspace is tailored to your assigned role." : "Manage your finance applications and repayments."}</p></div>
        {isCustomer && <Link className="button button-primary" to="/customer/apply"><Plus size={17} /> Apply for finance</Link>}
      </section>

      {error && <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary small-button" onClick={retryLoad}><RefreshCw size={15} /> Retry</button></div>}
      {isCustomer && financeSummaryErrorText && <div className="inline-error" role="status">{financeSummaryErrorText}</div>}

      {(isAdmin || isCustomer || isAnalyst || isCreditManager) && <section className="metrics-grid" aria-label="Finance summary">
        {isAdmin ? <>
          <MetricCard label="Customer profiles" value={loading ? "…" : error ? "—" : customers.length} note="Customer service records" icon={Users} />
          <MetricCard label="Pending KYC" value={loading ? "…" : error ? "—" : pendingKycCount} note="Awaiting review" icon={Clock3} tone="amber" />
          <MetricCard label="KYC verified" value={loading ? "…" : error ? "—" : verifiedKycCount} note="Verification complete" icon={ShieldCheck} tone="green" />
          <MetricCard label="Onboarding incomplete" value={loading ? "…" : error ? "—" : incompleteOnboardingCount} note="Profile setup needed" icon={FileCheck2} tone="blue" />
        </> : isAnalyst || isCreditManager ? <>
          <MetricCard label="Applications" value={loading ? "…" : error ? "—" : staffApplications.length} note="Submitted assessment queue" icon={FileText} />
          <MetricCard label="Pending work" value={loading ? "…" : error ? "—" : isAnalyst ? pendingAssessmentCount : pendingDecisionCount} note={isAnalyst ? "Awaiting credit assessment" : "Eligible without approval"} icon={Clock3} tone="amber" />
        </> : <>
          <MetricCard label="Active applications" value={loading ? "…" : activeCount} note="In progress or approved" icon={FileText} />
          <MetricCard label="Approved finance" value={loading || financeSummaryLoading ? "…" : financeSummaryErrorText ? "—" : formatMoney(financeSummary?.approvedFinance ?? 0)} note="Principal on active or closed loan accounts" icon={ArrowUpRight} tone="green" />
          <MetricCard label="Outstanding balance" value={loading || financeSummaryLoading ? "…" : financeSummaryErrorText ? "—" : formatMoney(financeSummary?.outstandingBalance ?? 0)} note="From active loan accounts" icon={Wallet} tone="blue" />
          <MetricCard label="Next EMI" value={loading || financeSummaryLoading ? "…" : financeSummaryErrorText ? "—" : financeSummary?.nextInstallment ? formatMoney(financeSummary.nextInstallment.emiAmount) : "—"} note={loading || financeSummaryLoading ? "Loading installment data" : financeSummaryErrorText ? "Financial summary unavailable" : financeSummary?.nextInstallment ? `Due ${displayDate(financeSummary.nextInstallment.dueDate, dashboardDate)}` : "No pending installment"} icon={Clock3} tone="amber" />
        </>}
      </section>}

      <section className="content-grid dashboard-lower">
        <article className="panel applications-panel">
          <div className="panel-heading"><div><h2>{isAdmin ? "Recent customer KYC" : isInternal ? `${roleNames[user?.role] || "Staff"} workspace` : "Recent applications"}</h2><p>{isAdmin ? "Latest customer verification and onboarding status" : isInternal ? "Role-specific work areas" : "Latest activity from your finance account"}</p></div>{isAdmin ? <Link className="text-link" to="/admin/kyc">Open KYC review <ArrowRight size={15} /></Link> : isCustomer && <Link className="text-link" to="/customer/applications">View all <ArrowRight size={15} /></Link>}</div>
          {isAdmin ? loading ? <div className="table-placeholder"><span className="spinner" />Loading customer records</div> : error ? <div className="empty-state compact"><strong>Customer data unavailable</strong><p>Retry the dashboard request to check the API connection.</p></div> : customers.length === 0 ? <div className="empty-state compact"><span className="empty-icon"><Users size={20} /></span><strong>No customer records</strong><p>Customer profiles will appear when available.</p></div> : <div className="table-wrap"><table><thead><tr><th>Customer ID</th><th>Customer</th><th>Mobile</th><th>KYC status</th><th>Onboarding</th></tr></thead><tbody>{customers.slice(0, 6).map((customer, index) => <tr key={customer.customerId || index}><td className="mono">{customer.customerId || "—"}</td><td>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}</td><td>{customer.mobileNumber || "—"}</td><td><StatusBadge status={customer.kycStatus} /></td><td>{String(customer.onboardingStatus || "—").replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : isInternal ? user?.role === "LOAN_OFFICER" ? <div className="empty-state compact"><span className="empty-icon"><Clock3 size={20} /></span><strong>No staff queue access</strong><p>The current backend role rules do not authorize a submitted-application queue for loan officers.</p></div> : <div className="role-task-list">{(staffModules[user?.role] || []).map((module) => <div className="role-task" key={module}><span className="empty-icon"><FileCheck2 size={17} /></span><span>{module}</span></div>)}</div> : loading ? <div className="table-placeholder"><span className="spinner" />Loading application data</div> : applications.length === 0 ? <div className="empty-state"><span className="empty-icon"><FileText size={20} /></span><strong>No applications yet</strong><p>Applications will appear here once they are available from your account.</p><Link to="/customer/apply" className="text-link">Start an application <ArrowRight size={15} /></Link></div> : (
            <div className="table-wrap"><table><thead><tr><th>Application</th><th>Product</th><th>Requested amount</th><th>Status</th><th aria-label="Action" /></tr></thead><tbody>
              {applications.slice(0, 6).map((item, index) => <tr key={valueOf(item, "applicationId", "id") || index}><td className="mono">{valueOf(item, "applicationNumber", "applicationId", "id") || "—"}</td><td>{valueOf(item, "productName", "productType", "product") || "—"}</td><td>{formatMoney(valueOf(item, "requestedAmount", "amount"))}</td><td><StatusBadge status={valueOf(item, "status", "applicationStatus")} /></td><td><Link aria-label="View applications" className="row-action" to="/customer/applications"><ArrowRight size={16} /></Link></td></tr>)}
            </tbody></table></div>
          )}
        </article>
        <aside className="panel side-summary">
          <div className="panel-heading"><div><h2>{isInternal ? "Next step" : "Upcoming EMI"}</h2><p>{isInternal ? "Your role's primary work area" : "Your next scheduled payment"}</p></div></div>
          {isAdmin ? <><div className="summary-highlight"><span className="summary-icon amber"><Clock3 size={19} /></span><div><strong>{loading ? "…" : error ? "—" : pendingKycCount} pending</strong><small>{loading ? "Loading KYC queue" : `${rejectedKycCount} rejected KYC records`}</small></div></div><Link className="button button-secondary full-button" to="/admin/kyc">Review KYC records <ArrowRight size={15} /></Link></> : isAnalyst ? <><div className="summary-highlight"><span className="summary-icon amber"><Clock3 size={19} /></span><div><strong>{loading ? "…" : error ? "—" : pendingAssessmentCount} to assess</strong><small>Submitted applications without an assessment</small></div></div><Link className="button button-secondary full-button" to="/admin/assessments">Open assessment queue <ArrowRight size={15} /></Link></> : isCreditManager ? <><div className="summary-highlight"><span className="summary-icon amber"><Clock3 size={19} /></span><div><strong>{loading ? "…" : error ? "—" : pendingDecisionCount} pending</strong><small>Eligible assessments without an approval</small></div></div><Link className="button button-secondary full-button" to="/admin/decisions">Open decision queue <ArrowRight size={15} /></Link></> : isInternal ? <div className="empty-state compact"><span className="empty-icon"><Clock3 size={20} /></span><strong>Application queue unavailable</strong><p>Your role is not authorized to view the submitted assessment queue.</p></div> : financeSummaryLoading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading your next installment</div> : financeSummaryErrorText ? <div className="empty-state compact"><span className="empty-icon"><Wallet size={20} /></span><strong>Financial summary temporarily unavailable</strong><p>Your application history is still available.</p><Link to="/customer/emi" className="text-link">View EMI schedule <ArrowRight size={15} /></Link></div> : financeSummary?.nextInstallment ? <><div className="summary-highlight"><span className="summary-icon amber"><Clock3 size={19} /></span><div><strong>Installment {financeSummary.nextInstallment.installmentNumber ?? "—"}</strong><small>{displayDate(financeSummary.nextInstallment.dueDate, dashboardDate)} · {formatMoney(financeSummary.nextInstallment.emiAmount)}</small></div></div><div className="summary-highlight"><span className="summary-icon blue"><Wallet size={19} /></span><div><strong><StatusBadge status={financeSummary.nextInstallment.status} /></strong><small>{financeSummary.nextInstallment.applicationNumber || `Application ${financeSummary.nextInstallment.applicationId}`} · Loan account {financeSummary.nextInstallment.loanAccountId}</small></div></div><Link to="/customer/emi" className="button button-secondary full-button">View EMI schedule <ArrowRight size={15} /></Link></> : <div className="empty-state compact"><span className="empty-icon"><Wallet size={20} /></span><strong>No pending EMI</strong><p>There are no pending installments on your loan accounts.</p><Link to="/customer/emi" className="text-link">View EMI schedule <ArrowRight size={15} /></Link></div>}
        </aside>
      </section>
      <footer className="page-footnote"><CheckCheck size={15} /> Account information is retrieved from your finance services.</footer>
    </div>
  );
}