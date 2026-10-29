import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ArrowUpRight, CheckCheck, Clock3, FileCheck2, FileText, Plus, RefreshCw, ShieldCheck, Users, Wallet } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { listWorkspaceApplications } from "../services/financeApplicationService";
import { listAdminKycRecords } from "../services/kycService";

function recordsFrom(response) {
  const payload = response?.data ?? response;
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.content)) return payload.content;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.applications)) return payload.applications;
  return [];
}

function valueOf(record, ...keys) {
  for (const key of keys) if (record?.[key] !== undefined && record?.[key] !== null) return record[key];
  return null;
}

function formatMoney(value) {
  if (value === null || value === undefined || value === "") return "—";
  const number = Number(value);
  return Number.isFinite(number) ? new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(number) : "—";
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
  const isCustomer = user?.role === "CUSTOMER";
  const isAdmin = user?.role === "ADMIN";
  const isInternal = !isCustomer;
  const [loading, setLoading] = useState(isCustomer || isAdmin);
  const [error, setError] = useState("");
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!isCustomer && !isAdmin) return undefined;
    let current = true;
    async function fetchDashboardData() {
      try {
        if (isAdmin) {
          const response = await listAdminKycRecords();
          if (current) setCustomers(recordsFrom(response));
        } else {
          const response = await listWorkspaceApplications(false, user?.id);
          if (current) setApplications(recordsFrom(response));
        }
      } catch (requestError) {
        if (current) setError(requestError.response?.status === 503 ? "The finance service is temporarily unavailable." : isAdmin ? "Unable to load customer and KYC dashboard data." : "We couldn't load the latest application data.");
      } finally {
        if (current) setLoading(false);
      }
    }
    fetchDashboardData();
    return () => { current = false; };
  }, [isCustomer, isAdmin, user?.id, retryCount]);

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
  const outstanding = applications.reduce((total, item) => total + (Number(valueOf(item, "outstandingBalance", "balanceAmount")) || 0), 0);
  const approvedAmount = applications.reduce((total, item) => {
    const status = String(valueOf(item, "status", "applicationStatus") || "").toUpperCase();
    return total + (["APPROVED", "DISBURSED", "ACTIVE", "CLOSED"].includes(status) ? Number(valueOf(item, "approvedAmount", "requestedAmount", "amount")) || 0 : 0);
  }, 0);
  const name = user?.name?.split(" ")[0] || "there";
  const roleNames = {
    ADMIN: "Administrator",
    LOAN_OFFICER: "Loan officer",
    CREDIT_ANALYST: "Credit analyst",
    CREDIT_MANAGER: "Credit manager",
  };
  const staffModules = {
    ADMIN: ["Manage internal users", "Review system status", "Monitor finance workflows"],
    LOAN_OFFICER: ["Review application intake", "Check customer onboarding", "Track application status"],
    CREDIT_ANALYST: ["Review assessment requests", "Record eligibility findings", "View assessment history"],
    CREDIT_MANAGER: ["Review decision queue", "Oversee application decisions", "Monitor team activity"],
  };

  return (
    <div className="page-stack page-enter">
      <section className="page-heading dashboard-heading">
        <div><p className="eyebrow">{isInternal ? `${roleNames[user?.role] || "STAFF"} WORKSPACE` : "YOUR FINANCIAL OVERVIEW"}</p><h1>{isInternal ? `${roleNames[user?.role] || "Staff"} dashboard` : `Welcome back, ${name}`}</h1><p>{isInternal ? "Your workspace is tailored to your assigned role." : "Manage your finance applications and repayments."}</p></div>
        {isCustomer && <Link className="button button-primary" to="/customer/apply"><Plus size={17} /> Apply for finance</Link>}
      </section>

      {error && <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary small-button" onClick={retryLoad}><RefreshCw size={15} /> Retry</button></div>}

      <section className="metrics-grid" aria-label="Finance summary">
        {isAdmin ? <>
          <MetricCard label="Customer profiles" value={loading ? "…" : error ? "—" : customers.length} note="Customer service records" icon={Users} />
          <MetricCard label="Pending KYC" value={loading ? "…" : error ? "—" : pendingKycCount} note="Awaiting review" icon={Clock3} tone="amber" />
          <MetricCard label="KYC verified" value={loading ? "…" : error ? "—" : verifiedKycCount} note="Verification complete" icon={ShieldCheck} tone="green" />
          <MetricCard label="Onboarding incomplete" value={loading ? "…" : error ? "—" : incompleteOnboardingCount} note="Profile setup needed" icon={FileCheck2} tone="blue" />
        </> : isInternal ? <>
          <MetricCard label="Applications" value="—" note="Not exposed by current API" icon={FileText} />
          <MetricCard label="Pending work" value="—" note="Role workflow API not available" icon={Clock3} tone="amber" />
          <MetricCard label="Team activity" value="—" note="Not exposed by current API" icon={FileCheck2} tone="green" />
        </> : <>
          <MetricCard label="Active applications" value={loading ? "…" : activeCount} note="In progress or approved" icon={FileText} />
          <MetricCard label="Approved finance" value={loading ? "…" : formatMoney(approvedAmount)} note="Based on available application data" icon={ArrowUpRight} tone="green" />
          <MetricCard label="Outstanding balance" value={loading ? "…" : formatMoney(outstanding)} note="From linked finance records" icon={Wallet} tone="blue" />
          <MetricCard label="Next EMI" value="—" note="No due date available" icon={Clock3} tone="amber" />
        </>}
      </section>

      <section className="content-grid dashboard-lower">
        <article className="panel applications-panel">
          <div className="panel-heading"><div><h2>{isAdmin ? "Recent customer KYC" : isInternal ? `${roleNames[user?.role] || "Staff"} workspace` : "Recent applications"}</h2><p>{isAdmin ? "Latest customer verification and onboarding status" : isInternal ? "Role-specific work areas" : "Latest activity from your finance account"}</p></div>{isAdmin ? <Link className="text-link" to="/admin/kyc">Open KYC review <ArrowRight size={15} /></Link> : isCustomer && <Link className="text-link" to="/customer/applications">View all <ArrowRight size={15} /></Link>}</div>
          {isAdmin ? loading ? <div className="table-placeholder"><span className="spinner" />Loading customer records</div> : error ? <div className="empty-state compact"><strong>Customer data unavailable</strong><p>Retry the dashboard request to check the API connection.</p></div> : customers.length === 0 ? <div className="empty-state compact"><span className="empty-icon"><Users size={20} /></span><strong>No customer records</strong><p>Customer profiles will appear when available.</p></div> : <div className="table-wrap"><table><thead><tr><th>Customer ID</th><th>Customer</th><th>Mobile</th><th>KYC status</th><th>Onboarding</th></tr></thead><tbody>{customers.slice(0, 6).map((customer, index) => <tr key={customer.customerId || index}><td className="mono">{customer.customerId || "—"}</td><td>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}</td><td>{customer.mobileNumber || "—"}</td><td><StatusBadge status={customer.kycStatus} /></td><td>{String(customer.onboardingStatus || "—").replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : isInternal ? <div className="role-task-list">{(staffModules[user?.role] || []).map((module) => <div className="role-task" key={module}><span className="empty-icon"><FileCheck2 size={17} /></span><span>{module}</span></div>)}</div> : loading ? <div className="table-placeholder"><span className="spinner" />Loading application data</div> : applications.length === 0 ? <div className="empty-state"><span className="empty-icon"><FileText size={20} /></span><strong>No applications yet</strong><p>Applications will appear here once they are available from your account.</p><Link to="/customer/apply" className="text-link">Start an application <ArrowRight size={15} /></Link></div> : (
            <div className="table-wrap"><table><thead><tr><th>Application</th><th>Product</th><th>Requested amount</th><th>Status</th><th aria-label="Action" /></tr></thead><tbody>
              {applications.slice(0, 6).map((item, index) => <tr key={valueOf(item, "applicationId", "id") || index}><td className="mono">{valueOf(item, "applicationNumber", "applicationId", "id") || "—"}</td><td>{valueOf(item, "productName", "productType", "product") || "—"}</td><td>{formatMoney(valueOf(item, "requestedAmount", "amount"))}</td><td><StatusBadge status={valueOf(item, "status", "applicationStatus")} /></td><td><Link aria-label="View applications" className="row-action" to="/customer/applications"><ArrowRight size={16} /></Link></td></tr>)}
            </tbody></table></div>
          )}
        </article>
        <aside className="panel side-summary">
          <div className="panel-heading"><div><h2>{isInternal ? "Next step" : "Upcoming EMI"}</h2><p>{isInternal ? "Your role's primary work area" : "Your next scheduled payment"}</p></div></div>
          {isAdmin ? <><div className="summary-highlight"><span className="summary-icon amber"><Clock3 size={19} /></span><div><strong>{loading ? "…" : error ? "—" : pendingKycCount} pending</strong><small>{loading ? "Loading KYC queue" : `${rejectedKycCount} rejected KYC records`}</small></div></div><Link className="button button-secondary full-button" to="/admin/kyc">Review KYC records <ArrowRight size={15} /></Link></> : isInternal ? <div className="empty-state compact"><span className="empty-icon"><Clock3 size={20} /></span><strong>Backend workflow pending</strong><p>The current API reference does not expose staff queue or assessment endpoints.</p></div> : <div className="empty-state compact"><span className="empty-icon"><Wallet size={20} /></span><strong>No EMI details available</strong><p>Payment details will show once linked to a disbursed finance account.</p><Link to="/customer/emi" className="text-link">View EMI schedule <ArrowRight size={15} /></Link></div>}
        </aside>
      </section>
      <footer className="page-footnote"><CheckCheck size={15} /> Account information is retrieved from your finance services.</footer>
    </div>
  );
}