import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { createDisbursement, getDisbursement, getDisbursementForApplication } from "../services/disbursementService";
import { getEmiScheduleForApplication, listEmiInstallments } from "../services/emiService";
import { createRepayment, getRepayment, listApplicationRepayments } from "../services/repaymentService";
import { getCustomerByUserId } from "../services/customerService";
import { listWorkspaceApplications } from "../services/financeApplicationService";
import { createNotification, getCustomerUnreadNotificationCount, listCustomerNotifications, markNotificationRead } from "../services/notificationService";

const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" });

function money(value) {
  const amount = Number(value);
  return value == null || value === "" || !Number.isFinite(amount) ? "-" : inr.format(amount);
}

function formattedDate(value, formatter = dateTime) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : formatter.format(parsed);
}

function collection(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["content", "data", "items"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  throw new Error("The service returned an unexpected response.");
}

function requestError(error, labels = {}) {
  const status = error.response?.status;
  const body = error.response?.data && typeof error.response.data === "object" ? error.response.data : {};
  const message = typeof body.message === "string" && body.message.length <= 400
    && !/(\n\s*at\s|Exception:|Error:)/.test(body.message) ? body.message : "";

  if (status === 400) {
    const errors = body.validationErrors || body.errors;
    const validation = errors && typeof errors === "object" ? Object.values(errors).filter(Boolean).join(" ") : "";
    return validation ? `Validation failed: ${validation}` : message || labels.badRequest || "The request is invalid. Check the required fields.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to perform this action.";
  if (status === 404) return labels.notFound || "The requested record was not found.";
  if (status === 409) return message || labels.conflict || "This action conflicts with the current record state. Refresh and try again.";
  if (status === 502 || status === 503) return "The service is temporarily unavailable. Try again shortly.";
  return labels.fallback || "The request could not be completed. Try again.";
}

function StatusBadge({ value }) {
  const status = String(value || "UNKNOWN").toUpperCase();
  return <span className={`status-badge status-${status.toLowerCase().replaceAll("_", "-")}`}>{status.replaceAll("_", " ")}</span>;
}

function useCustomerApplications(userId) {
  const [result, setResult] = useState({ userId: null, attempt: -1, applications: [], error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!userId) return undefined;
    let active = true;
    listWorkspaceApplications(false, userId)
      .then((response) => { if (active) setResult({ userId, attempt, applications: collection(response), error: "" }); })
      .catch((failure) => { if (active) setResult({ userId, attempt, applications: [], error: requestError(failure, { fallback: "Unable to load your applications." }) }); });
    return () => { active = false; };
  }, [userId, attempt]);

  const current = result.userId === userId && result.attempt === attempt;
  return {
    applications: current ? result.applications : [],
    loading: Boolean(userId) && !current,
    error: !userId ? "Your session does not include a user ID." : current ? result.error : "",
    retry: () => setAttempt((value) => value + 1),
  };
}

function ApplicationPicker({ applications, value, onChange }) {
  return <label className="field"><span>Application</span><select value={value} onChange={(event) => onChange(event.target.value)}>
    <option value="">Choose an application</option>
    {applications.map((application) => <option key={application.applicationId} value={application.applicationId}>
      {application.applicationNumber || `Application ${application.applicationId}`} ({String(application.status || "").replaceAll("_", " ")})
    </option>)}
  </select></label>;
}

function DisbursementFields({ record }) {
  return <dl className="finance-details">{[
    ["Disbursement ID", record.disbursementId],
    ["Application ID", record.applicationId],
    ["Approval ID", record.approvalId],
    ["Amount", money(record.amount)],
    ["Status", record.status?.replaceAll("_", " ")],
    ["Transaction reference", record.transactionReference],
    ["Processed by", record.processedBy],
    ["Disbursed at", formattedDate(record.disbursedAt)],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>;
}

export function DisbursementsWorkspace({ canManage }) {
  const [mode, setMode] = useState("application");
  const [lookupId, setLookupId] = useState("");
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [form, setForm] = useState({ applicationId: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [feedback, setFeedback] = useState("");

  async function lookup(event) {
    event.preventDefault();
    if (!lookupId.trim()) return;
    setLoading(true);
    setLookupError("");
    setRecord(null);
    try {
      const result = mode === "application"
        ? await getDisbursementForApplication(lookupId.trim())
        : await getDisbursement(lookupId.trim());
      setRecord(result);
    } catch (failure) {
      setLookupError(requestError(failure, { notFound: "No disbursement record was found for that ID." }));
    } finally {
      setLoading(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    setFeedback("");
    const applicationId = Number(form.applicationId);
    const amount = Number(form.amount);
    if (!Number.isSafeInteger(applicationId) || applicationId <= 0 || !Number.isFinite(amount) || amount <= 0) {
      setFormError("Enter a positive whole application ID and a positive disbursement amount.");
      return;
    }
    if (!canManage) {
      setFormError("Only administrators and credit managers can create disbursements.");
      return;
    }
    setSaving(true);
    try {
      const created = await createDisbursement({ applicationId, amount });
      setRecord(created);
      setLookupError("");
      setFeedback("Disbursement recorded.");
      setForm({ applicationId: "", amount: "" });
    } catch (failure) {
      setFormError(requestError(failure, {
        badRequest: "The application is not approved or the disbursement details are invalid.",
        conflict: "A disbursement already exists for this application.",
        fallback: "Unable to create the disbursement.",
      }));
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-stack">
    {canManage && <section className="panel">
      <div className="panel-heading"><div><h2>Create disbursement</h2><p>Only approved applications can be disbursed.</p></div></div>
      {formError && <div className="inline-error" role="alert">{formError}</div>}
      <form className="finance-toolbar" onSubmit={submit}>
        <label className="field"><span>Application ID</span><input type="number" min="1" step="1" required value={form.applicationId} onChange={(event) => setForm((current) => ({ ...current, applicationId: event.target.value }))} disabled={saving} /></label>
        <label className="field"><span>Amount (INR)</span><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} disabled={saving} /></label>
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? "Recording..." : "Create disbursement"}</button>
      </form>
    </section>}
    <section className="panel">
      <div className="panel-heading"><div><h2>Find disbursement</h2><p>Search by disbursement ID or application ID.</p></div></div>
      {feedback && <div className="inline-message" role="status">{feedback}</div>}
      {lookupError && <div className="inline-error" role="alert">{lookupError}</div>}
      <form className="finance-toolbar" onSubmit={lookup}>
        <label className="field"><span>Find by</span><select value={mode} onChange={(event) => setMode(event.target.value)} disabled={loading}><option value="application">Application ID</option><option value="disbursement">Disbursement ID</option></select></label>
        <label className="field"><span>{mode === "application" ? "Application ID" : "Disbursement ID"}</span><input required value={lookupId} onChange={(event) => setLookupId(event.target.value)} disabled={loading} /></label>
        <button className="button button-secondary" type="submit" disabled={loading || !lookupId.trim()}><Search size={15} />{loading ? "Searching..." : "Search"}</button>
      </form>
      {loading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading disbursement</div> : record && <DisbursementFields record={record} />}
    </section>
  </div>;
}

function CustomerApplicationWorkspace({ user, children }) {
  const { applications, loading, error, retry } = useCustomerApplications(user?.id);
  const [applicationId, setApplicationId] = useState("");

  return <div className="page-stack">
    <section className="panel">
      <div className="panel-heading"><div><h2>Your loan account</h2><p>Select one of your applications to view servicing details.</p></div></div>
      {loading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading your applications</div> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={retry}><RefreshCw size={14} /> Retry</button></div> : applications.length === 0 ? <p>No applications are available for this account.</p> : <ApplicationPicker applications={applications} value={applicationId} onChange={setApplicationId} />}
    </section>
    {applicationId && children(applicationId)}
  </div>;
}

function LoanAccountSummary({ account }) {
  return <dl className="finance-details">{[
    ["Loan account status", account.status?.replaceAll("_", " ")],
    ["Principal", money(account.principalAmount)],
    ["Annual interest rate", account.annualInterestRate == null ? "-" : `${account.annualInterestRate}%`],
    ["Tenure", account.tenureMonths == null ? "-" : `${account.tenureMonths} months`],
    ["Monthly EMI", money(account.monthlyEmiAmount)],
    ["Outstanding amount", money(account.outstandingAmount)],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>;
}

function installmentOutstanding(installment) {
  const emiCents = Math.round(Number(installment.emiAmount) * 100);
  const paidCents = Math.round(Number(installment.amountPaid || 0) * 100);
  return Math.max(0, emiCents - paidCents) / 100;
}

export function CustomerEmiWorkspace({ user }) {
  return <CustomerApplicationWorkspace user={user}>{(applicationId) => <EmiApplicationDetails key={applicationId} applicationId={applicationId} />}</CustomerApplicationWorkspace>;
}

function EmiApplicationDetails({ applicationId }) {
  const [result, setResult] = useState({ applicationId: null, attempt: -1, account: null, installments: [], error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await getEmiScheduleForApplication(applicationId);
        const rows = await listEmiInstallments(result.loanAccountId);
        if (active) setResult({ applicationId, attempt, account: result, installments: collection(rows), error: "" });
      } catch (failure) {
        if (active) setResult({ applicationId, attempt, account: null, installments: [], error: requestError(failure, { notFound: "No EMI schedule exists for this application." }) });
      }
    }
    load();
    return () => { active = false; };
  }, [applicationId, attempt]);

  const current = result.applicationId === applicationId && result.attempt === attempt;
  const loading = !current;
  const account = current ? result.account : null;
  const installments = current ? result.installments : [];
  const error = current ? result.error : "";

  return <section className="panel">
    <div className="panel-heading"><div><h2>EMI schedule</h2><p>Installment amounts and due dates from your loan account.</p></div><button className="icon-button" type="button" title="Refresh schedule" aria-label="Refresh schedule" disabled={loading} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={17} /></button></div>
    {loading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading EMI schedule</div> : error ? <div className="inline-error" role="alert">{error}</div> : account && <>
      <LoanAccountSummary account={account} />
      {installments.length === 0 ? <p>No installments are available for this loan account.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Installment</th><th>Due date</th><th>Principal</th><th>Interest</th><th>EMI amount</th><th>Amount paid</th><th>Status</th></tr></thead>
        <tbody>{installments.map((installment) => <tr key={installment.emiId}>
          <td>{installment.installmentNumber ?? "-"}</td><td>{formattedDate(installment.dueDate, dateOnly)}</td><td>{money(installment.principalComponent)}</td><td>{money(installment.interestComponent)}</td><td>{money(installment.emiAmount)}</td><td>{money(installment.amountPaid)}</td><td><StatusBadge value={installment.status} /></td>
        </tr>)}</tbody>
      </table></div>}
    </>}
  </section>;
}

export function CustomerRepaymentsWorkspace({ user }) {
  return <CustomerApplicationWorkspace user={user}>{(applicationId) => <RepaymentApplicationDetails key={applicationId} applicationId={applicationId} />}</CustomerApplicationWorkspace>;
}

function RepaymentDetailsDialog({ repaymentId, onClose }) {
  const [repayment, setRepayment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    getRepayment(repaymentId)
      .then((result) => { if (active) setRepayment(result); })
      .catch((failure) => { if (active) setError(requestError(failure, { notFound: "Repayment record not found." })); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [repaymentId]);

  return <DetailDialog title={`Repayment ${repaymentId}`} drawer onClose={onClose}>
    {loading ? <p role="status">Loading repayment details...</p> : error ? <div className="inline-error" role="alert">{error}</div> : <dl className="finance-details">{[
      ["Repayment ID", repayment.repaymentId], ["Loan account ID", repayment.loanAccountId], ["Installment ID", repayment.emiId],
      ["Installment number", repayment.installmentNumber], ["Payment reference", repayment.paymentReference], ["Amount", money(repayment.amount)],
      ["Payment date", formattedDate(repayment.paymentDate)], ["Payment method", repayment.paymentMethod], ["Status", repayment.status],
      ["Recorded by", repayment.recordedBy], ["Remarks", repayment.remarks],
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>}
  </DetailDialog>;
}

function RepaymentApplicationDetails({ applicationId }) {
  const [result, setResult] = useState({ applicationId: null, attempt: -1, account: null, installments: [], repayments: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [paymentError, setPaymentError] = useState("");
  const [repaymentDetailId, setRepaymentDetailId] = useState(null);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const result = await getEmiScheduleForApplication(applicationId);
        const [installmentRows, repaymentRows] = await Promise.all([
          listEmiInstallments(result.loanAccountId),
          listApplicationRepayments(applicationId),
        ]);
        if (active) setResult({ applicationId, attempt, account: result, installments: collection(installmentRows), repayments: collection(repaymentRows), error: "" });
      } catch (failure) {
        if (active) setResult({ applicationId, attempt, account: null, installments: [], repayments: [], error: requestError(failure, { notFound: "No loan account or repayment history exists for this application." }) });
      }
    }
    load();
    return () => { active = false; };
  }, [applicationId, attempt]);

  const current = result.applicationId === applicationId && result.attempt === attempt;
  const loading = !current;
  const account = current ? result.account : null;
  const installments = current ? result.installments : [];
  const repayments = current ? result.repayments : [];
  const error = current ? result.error : "";

  async function pay(installment) {
    const outstanding = installmentOutstanding(installment);
    if (installment.status !== "PENDING" || outstanding <= 0) return;
    setSavingId(installment.emiId);
    setPaymentError("");
    setFeedback("");
    try {
      const result = await createRepayment({
        loanAccountId: account.loanAccountId,
        emiId: installment.emiId,
        amount: outstanding,
        paymentMethod: "SIMULATED",
        remarks: "Simulated payment",
      });
      setFeedback(`Simulated payment recorded for installment ${installment.installmentNumber}.`);
      setAttempt((value) => value + 1);
      if (result?.repaymentId) setRepaymentDetailId(result.repaymentId);
    } catch (failure) {
      setPaymentError(requestError(failure, {
        badRequest: "Payment must equal the exact outstanding EMI amount.",
        conflict: "This installment was already paid. The schedule has been refreshed.",
        fallback: "Unable to record the simulated payment.",
      }));
      if (failure.response?.status === 409) setAttempt((value) => value + 1);
    } finally {
      setSavingId(null);
    }
  }

  return <>
    <section className="panel">
      <div className="panel-heading"><div><h2>Repayment schedule</h2><p>Payments are simulated and do not move money.</p></div><button className="icon-button" type="button" title="Refresh repayments" aria-label="Refresh repayments" disabled={loading || savingId != null} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={17} /></button></div>
      {feedback && <div className="inline-message" role="status">{feedback}</div>}
      {paymentError && <div className="inline-error" role="alert">{paymentError}</div>}
      {loading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading repayment schedule</div> : error ? <div className="inline-error" role="alert">{error}</div> : account && <>
        <LoanAccountSummary account={account} />
        {installments.length === 0 ? <p>No installments are available for this loan account.</p> : <div className="table-wrap"><table>
          <thead><tr><th>Installment</th><th>Due date</th><th>EMI amount</th><th>Paid</th><th>Outstanding</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>{installments.map((installment) => {
            const outstanding = installmentOutstanding(installment);
            const canPay = installment.status === "PENDING" && outstanding > 0;
            return <tr key={installment.emiId}>
              <td>{installment.installmentNumber ?? "-"}</td><td>{formattedDate(installment.dueDate, dateOnly)}</td><td>{money(installment.emiAmount)}</td><td>{money(installment.amountPaid)}</td><td>{money(outstanding)}</td><td><StatusBadge value={installment.status} /></td>
              <td>{canPay && <button className="button button-primary small-button" type="button" disabled={savingId != null} onClick={() => pay(installment)}>{savingId === installment.emiId ? "Processing..." : "Simulated payment"}</button>}</td>
            </tr>;
          })}</tbody>
        </table></div>}
      </>}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Repayment history</h2><p>Recorded repayments for this application.</p></div></div>
      {loading ? <p role="status">Loading repayment history...</p> : !error && repayments.length === 0 ? <p>No repayments have been recorded.</p> : !error && <div className="table-wrap"><table>
        <thead><tr><th>Repayment ID</th><th>Installment</th><th>Amount</th><th>Payment date</th><th>Method</th><th>Status</th><th>Details</th></tr></thead>
        <tbody>{repayments.map((repayment) => <tr key={repayment.repaymentId}>
          <td>{repayment.repaymentId ?? "-"}</td><td>{repayment.installmentNumber ?? "-"}</td><td>{money(repayment.amount)}</td><td>{formattedDate(repayment.paymentDate)}</td><td>{repayment.paymentMethod ?? "-"}</td><td><StatusBadge value={repayment.status} /></td>
          <td><button className="text-link" type="button" disabled={!repayment.repaymentId} onClick={() => setRepaymentDetailId(repayment.repaymentId)}>Details</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    {repaymentDetailId != null && <RepaymentDetailsDialog repaymentId={repaymentDetailId} onClose={() => setRepaymentDetailId(null)} />}
  </>;
}

export function CustomerNotificationsWorkspace({ user }) {
  const [result, setResult] = useState({ userId: null, attempt: -1, notifications: [], unreadCount: 0, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [savingId, setSavingId] = useState(null);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    async function load() {
      try {
        const customer = await getCustomerByUserId(user.id);
        const id = customer.customerId;
        const [notificationRows, unread] = await Promise.all([
          listCustomerNotifications(id),
          getCustomerUnreadNotificationCount(id),
        ]);
        if (active) setResult({ userId: user.id, attempt, notifications: collection(notificationRows), unreadCount: Number(unread.unreadCount) || 0, error: "" });
      } catch (failure) {
        if (active) setResult({ userId: user.id, attempt, notifications: [], unreadCount: 0, error: requestError(failure, { notFound: "Customer notification records were not found.", fallback: "Unable to load your notifications." }) });
      }
    }
    load();
    return () => { active = false; };
  }, [user?.id, attempt]);

  const current = result.userId === user?.id && result.attempt === attempt;
  const loading = Boolean(user?.id) && !current;
  const notifications = current ? result.notifications : [];
  const unreadCount = current ? result.unreadCount : 0;
  const error = !user?.id ? "Your session does not include a user ID." : current ? result.error : "";

  async function markRead(notificationId) {
    setSavingId(notificationId);
    setActionError("");
    try {
      const updated = await markNotificationRead(notificationId);
      setResult((current) => ({
        ...current,
        notifications: current.notifications.map((item) => item.notificationId === notificationId ? { ...item, ...updated } : item),
        unreadCount: Math.max(0, current.unreadCount - 1),
      }));
    } catch (failure) {
      setActionError(requestError(failure, { fallback: "Unable to mark this notification as read." }));
    } finally {
      setSavingId(null);
    }
  }

  return <section className="panel">
    <div className="panel-heading"><div><h2>Notifications</h2><p>{unreadCount} unread</p></div><button className="icon-button" type="button" title="Refresh notifications" aria-label="Refresh notifications" disabled={loading || savingId != null} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={17} /></button></div>
    {!loading && error && <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={14} /> Retry</button></div>}
    {actionError && <div className="inline-error" role="alert">{actionError}</div>}
    {loading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading notifications</div> : !error && notifications.length === 0 ? <p>No notifications are available.</p> : !error && <div className="table-wrap"><table>
      <thead><tr><th>Type</th><th>Channel</th><th>Subject</th><th>Message</th><th>Status</th><th>Created</th><th>Sent</th><th>Read</th><th>Action</th></tr></thead>
      <tbody>{notifications.map((notification) => {
        const unread = notification.status !== "READ";
        return <tr key={notification.notificationId}>
          <td>{notification.type ?? "-"}</td><td>{notification.channel ?? "-"}</td><td>{notification.subject ?? "-"}</td><td>{notification.message ?? "-"}</td><td><StatusBadge value={notification.status} /></td>
          <td>{formattedDate(notification.createdAt)}</td><td>{formattedDate(notification.sentAt)}</td><td>{formattedDate(notification.readAt)}</td>
          <td>{unread && <button className="text-link" type="button" disabled={savingId != null} onClick={() => markRead(notification.notificationId)}>{savingId === notification.notificationId ? "Saving..." : "Mark read"}</button>}</td>
        </tr>;
      })}</tbody>
    </table></div>}
  </section>;
}

const notificationTypes = [
  "APPLICATION_SUBMITTED",
  "APPLICATION_APPROVED",
  "APPLICATION_REJECTED",
  "LOAN_DISBURSED",
  "REPAYMENT_CREATED",
  "EMI_DUE_REMINDER",
  "EMI_PAYMENT_SUCCESS",
  "EMI_OVERDUE",
];

const notificationChannels = ["IN_APP", "EMAIL", "SMS"];
const initialNotificationForm = {
  customerId: "",
  type: "",
  channel: "IN_APP",
  subject: "",
  message: "",
  applicationId: "",
  approvalId: "",
  disbursementId: "",
  repaymentId: "",
  scheduleId: "",
};

function positiveId(value, label, required = false) {
  if (!value && !required) return { value: undefined };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return { error: `${label} must be a positive whole number.` };
  return { value: parsed };
}

function NotificationResponseFields({ notification }) {
  return <dl className="finance-details">{[
    ["Notification ID", notification.notificationId],
    ["Customer ID", notification.customerId],
    ["Application ID", notification.applicationId],
    ["Approval ID", notification.approvalId],
    ["Disbursement ID", notification.disbursementId],
    ["Repayment ID", notification.repaymentId],
    ["Schedule ID", notification.scheduleId],
    ["Type", notification.type],
    ["Channel", notification.channel],
    ["Status", notification.status],
    ["Subject", notification.subject],
    ["Message", notification.message],
    ["Created at", formattedDate(notification.createdAt)],
    ["Sent at", formattedDate(notification.sentAt)],
    ["Read at", formattedDate(notification.readAt)],
  ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>;
}

export function AdminNotificationWorkspace() {
  const [form, setForm] = useState(initialNotificationForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setCreated(null);

    if (!form.type || !notificationTypes.includes(form.type)) {
      setError("Select a valid notification type.");
      return;
    }
    if (!notificationChannels.includes(form.channel)) {
      setError("Select a valid notification channel.");
      return;
    }
    if (!form.subject.trim() || form.subject.trim().length > 200) {
      setError("Subject is required and must be 200 characters or fewer.");
      return;
    }
    if (!form.message.trim() || form.message.trim().length > 1000) {
      setError("Message is required and must be 1000 characters or fewer.");
      return;
    }

    const linkedIds = {};
    for (const [field, label] of [
      ["customerId", "Customer ID"],
      ["applicationId", "Application ID"],
      ["approvalId", "Approval ID"],
      ["disbursementId", "Disbursement ID"],
      ["repaymentId", "Repayment ID"],
      ["scheduleId", "Schedule ID"],
    ]) {
      const parsed = positiveId(form[field], label, field === "customerId");
      if (parsed.error) {
        setError(parsed.error);
        return;
      }
      if (parsed.value !== undefined) linkedIds[field] = parsed.value;
    }

    const payload = {
      ...linkedIds,
      type: form.type,
      channel: form.channel,
      subject: form.subject.trim(),
      message: form.message.trim(),
    };

    setSaving(true);
    try {
      const response = await createNotification(payload);
      setCreated(response);
      setForm(initialNotificationForm);
    } catch (failure) {
      setError(requestError(failure, {
        badRequest: "The notification request is invalid. Check the customer and linked record IDs.",
        notFound: "The customer or a linked record was not found.",
        conflict: "The notification conflicts with the current workflow state.",
        fallback: "Unable to create the internal notification.",
      }));
    } finally {
      setSaving(false);
    }
  }

  return <div className="page-stack">
    <section className="panel">
      <div className="panel-heading"><div><h2>Internal notification</h2><p>Records a notification request in the service. It does not send email or SMS through an external provider.</p></div></div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      <form className="form-grid two-columns" onSubmit={submit}>
        <label className="field"><span>Customer ID</span><input name="customerId" type="number" min="1" step="1" required value={form.customerId} onChange={change} disabled={saving} /></label>
        <label className="field"><span>Notification type</span><select name="type" required value={form.type} onChange={change} disabled={saving}><option value="">Select type</option>{notificationTypes.map((type) => <option key={type} value={type}>{type.replaceAll("_", " ")}</option>)}</select></label>
        <label className="field"><span>Channel</span><select name="channel" required value={form.channel} onChange={change} disabled={saving}>{notificationChannels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select></label>
        <label className="field field-wide"><span>Subject</span><input name="subject" maxLength="200" required value={form.subject} onChange={change} disabled={saving} /></label>
        <label className="field field-wide"><span>Message</span><textarea name="message" rows="4" maxLength="1000" required value={form.message} onChange={change} disabled={saving} /></label>
        <fieldset className="field-wide form-grid two-columns">
          <legend>Optional linked records</legend>
          {[["applicationId", "Application ID"], ["approvalId", "Approval ID"], ["disbursementId", "Disbursement ID"], ["repaymentId", "Repayment ID"], ["scheduleId", "Schedule ID"]].map(([name, label]) => <label className="field" key={name}><span>{label}</span><input name={name} type="number" min="1" step="1" value={form[name]} onChange={change} disabled={saving} /></label>)}
        </fieldset>
        {form.channel !== "IN_APP" && <p className="field-wide" role="note">{form.channel} is recorded as a channel value; external provider delivery is not implemented.</p>}
        <div className="field-wide"><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Creating notification..." : "Create internal notification"}</button></div>
      </form>
    </section>
    {created && <section className="panel"><div className="panel-heading"><div><h2>Created notification</h2><p>Authoritative service response</p></div></div><NotificationResponseFields notification={created} /></section>}
  </div>;
}