import { useEffect, useState } from "react";
import { ArrowLeft, CreditCard, Eye, Plus, RefreshCw, Search } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { generateEmiSchedule, getLoanAccountForApplication, listAllSchedules, listInstallments } from "../services/emiService";
import { getRepayment, listApplicationRepayments, recordRepayment } from "../services/repaymentService";
import { notifyEmiPaymentSuccess, notifyRepaymentCreated } from "../services/notificationService";
import { listWorkspaceApplications } from "../services/financeApplicationService";

const isPositiveInteger = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const money = (value) => value == null ? "-" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const emiStatusClass = (status) => `status-badge status-${String(status ?? "").toLowerCase()}`;

function validationErrors(error) {
  const errors = error.response?.data?.validationErrors;
  return errors && typeof errors === "object" ? errors : {};
}

function errorMessage(error, fallback) {
  const status = error.response?.status;
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission for this action.";
  const details = Object.entries(validationErrors(error)).map(([field, text]) => `${field}: ${text}`).join("; ");
  const message = error.response?.data?.message || (status === 404 ? "No records were found." : null) || fallback;
  return details ? `${message} (${details})` : message;
}

function list(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["content", "data", "items", "installments", "repayments"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  return response && typeof response === "object" ? [response] : [];
}

const paymentFields = (payment) => [["Repayment ID", payment.repaymentId], ["Payment reference", payment.paymentReference], ["Loan account", payment.loanAccountId], ["EMI ID", payment.emiId], ["Installment", payment.installmentNumber], ["Amount", money(payment.amount)], ["Payment date", payment.paymentDate?.replace("T", " ")], ["Payment method", payment.paymentMethod], ["Status", payment.status], ["Recorded by", payment.recordedBy], ["Remarks", payment.remarks]];

function ApplicationPicker({ user, busy, onSearch }) {
  const isCustomer = user?.role === "CUSTOMER";
  const [value, setValue] = useState("");
  const [applications, setApplications] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isCustomer) return undefined;
    let current = true;
    listWorkspaceApplications(false, user?.id)
      .then((response) => { if (current) setApplications(list(response).filter((item) => String(item.status).toUpperCase() !== "DRAFT")); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load your applications.")); });
    return () => { current = false; };
  }, [isCustomer, user?.id]);

  function submit(event) {
    event.preventDefault();
    if (!isPositiveInteger(value)) {
      setError("Choose a valid application.");
      return;
    }
    setError("");
    onSearch(String(Number(value)));
  }

  return <form className="finance-toolbar" onSubmit={submit}>
    {isCustomer
      ? <label className="field"><span>Application</span><select value={value} onChange={(event) => setValue(event.target.value)} required><option value="">Select an application</option>{applications.map((item) => <option key={item.applicationId} value={item.applicationId}>{item.applicationNumber ?? item.applicationId} - {item.productName ?? "Loan"}</option>)}</select></label>
      : <label className="field"><span>Application ID</span><input type="number" min="1" step="1" required value={value} onChange={(event) => setValue(event.target.value)} /></label>}
    <button className="button button-secondary" type="submit" disabled={busy}><Search size={16} /> Search</button>
    {error && <div className="inline-error" role="alert">{error}</div>}
  </form>;
}

const emptySchedule = { applicationId: "", customerId: "", disbursementId: "", principalAmount: "", annualInterestRate: "", tenureMonths: "", firstDueDate: "" };

function GenerateScheduleDrawer({ onClose, onDone, onViewExisting }) {
  const [form, setForm] = useState(emptySchedule);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [existingId, setExistingId] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setExistingId(null);
    setFieldErrors({});
    if (!["applicationId", "customerId", "disbursementId", "tenureMonths"].every((key) => isPositiveInteger(form[key]))) {
      setError("Application, customer, disbursement IDs and tenure must be positive whole numbers.");
      return;
    }
    const principalAmount = Number(form.principalAmount);
    const annualInterestRate = Number(form.annualInterestRate);
    if (!(principalAmount > 0) || !(annualInterestRate >= 0) || !form.firstDueDate) {
      setError("Enter a positive principal, a valid interest rate and the first due date.");
      return;
    }
    setSaving(true);
    try {
      const schedule = await generateEmiSchedule({ applicationId: Number(form.applicationId), customerId: Number(form.customerId), disbursementId: Number(form.disbursementId), principalAmount, annualInterestRate, tenureMonths: Number(form.tenureMonths), firstDueDate: form.firstDueDate });
      notifyRepaymentCreated({ customerId: Number(form.customerId), applicationId: Number(form.applicationId), disbursementId: Number(form.disbursementId), monthlyEmiAmount: schedule?.monthlyEmiAmount });
      onDone(form.applicationId);
    } catch (failure) {
      const errors = validationErrors(failure);
      setFieldErrors(errors);
      setError(Object.keys(errors).length ? failure.response?.data?.message || "Please correct the highlighted fields." : errorMessage(failure, failure.response?.status === 409 ? "An EMI schedule already exists for this application." : "Unable to generate the EMI schedule."));
      if (failure.response?.status === 409) setExistingId(String(Number(form.applicationId)));
      setSaving(false);
    }
  }

  const field = (name, text, props = {}) => <label className="field"><span>{text}</span><input name={name} value={form[name]} onChange={change} disabled={saving} required aria-invalid={fieldErrors[name] ? true : undefined} {...props} />{fieldErrors[name] && <small className="field-error" role="alert">{fieldErrors[name]}</small>}</label>;
  return <DetailDialog title="Generate EMI schedule" drawer onClose={() => { if (!saving) onClose(); }}>
    {error && <div className="inline-error" role="alert">{error}{existingId && <button className="button button-secondary small-button" type="button" onClick={() => onViewExisting(existingId)}><Eye size={14} /> View existing schedule</button>}</div>}
    <form className="form-grid two-columns" onSubmit={submit}>
      {field("applicationId", "Application ID", { type: "number", min: "1", step: "1" })}
      {field("customerId", "Customer ID", { type: "number", min: "1", step: "1" })}
      {field("disbursementId", "Disbursement ID", { type: "number", min: "1", step: "1" })}
      {field("principalAmount", "Principal amount", { type: "number", min: "1", step: "0.01" })}
      {field("annualInterestRate", "Annual interest rate (%)", { type: "number", min: "0", step: "0.01" })}
      {field("tenureMonths", "Tenure (months)", { type: "number", min: "1", step: "1" })}
      {field("firstDueDate", "First due date", { type: "date" })}
      <div className="field-wide"><button className="button button-primary" type="submit" disabled={saving}><Plus size={16} />{saving ? "Generating..." : "Generate schedule"}</button></div>
    </form>
  </DetailDialog>;
}

function PaymentDrawer({ loanAccountId, account, installment, onClose, onDone }) {
  const { installmentNumber } = installment;
  const amount = Number(installment.emiAmount);
  const [remarks, setRemarks] = useState(`EMI payment for installment ${installment.installmentNumber}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    if (!(amount > 0)) {
      setError("This installment has no payable EMI amount.");
      return;
    }
    setSaving(true);
    try {
      const repayment = await recordRepayment({ loanAccountId: Number(loanAccountId), emiId: installment.emiId, amount: Number(amount), paymentMethod: "SIMULATED", remarks: remarks.trim() });
      notifyEmiPaymentSuccess({ customerId: account?.customerId, applicationId: account?.applicationId, repaymentId: repayment?.repaymentId, scheduleId: installment.emiId, amount });
      onDone(`Payment recorded for installment ${installmentNumber}.`);
    } catch (failure) {
      setError(errorMessage(failure, "Unable to record the payment."));
      setSaving(false);
    }
  }

  return <DetailDialog title={`Pay installment ${installmentNumber}`} drawer onClose={() => { if (!saving) onClose(); }}>
    <dl className="finance-details">
      {[["Due date", installment.dueDate], ["EMI amount", money(installment.emiAmount)], ["Principal", money(installment.principalComponent)], ["Interest", money(installment.interestComponent)], ["Status", <span className={emiStatusClass(installment.status)}>{installment.status}</span>]].map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value ?? "-"}</dd></div>)}
    </dl>
    {error && <div className="inline-error" role="alert">{error}</div>}
    <form className="form-grid" onSubmit={submit}>
      <label className="field"><span>Amount (full EMI)</span><input value={money(amount)} readOnly disabled /></label>
      <label className="field"><span>Payment method</span><input value="SIMULATED" readOnly disabled /></label>
      <label className="field"><span>Remarks</span><textarea rows="3" maxLength="255" value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={saving} /></label>
      <div className="finance-actions">
        <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="button button-primary" type="submit" disabled={saving}><CreditCard size={16} />{saving ? "Recording..." : "Record payment"}</button>
      </div>
    </form>
  </DetailDialog>;
}

export function EmiScheduleWorkspace({ user }) {
  const canGenerate = user?.role === "ADMIN";
  const canPay = ["ADMIN", "CUSTOMER"].includes(user?.role);
  const canBrowseAll = ["ADMIN", "LOAN_OFFICER"].includes(user?.role);
  const [schedules, setSchedules] = useState([]);
  const [listLoading, setListLoading] = useState(canBrowseAll);
  const [listError, setListError] = useState("");
  const [listAttempt, setListAttempt] = useState(0);
  const [summary, setSummary] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showGenerate, setShowGenerate] = useState(false);
  const [payTarget, setPayTarget] = useState(null);

  useEffect(() => {
    if (!canBrowseAll) return undefined;
    let current = true;
    listAllSchedules()
      .then((response) => { if (current) { setSchedules(list(response)); setListError(""); } })
      .catch((failure) => { if (current) setListError(errorMessage(failure, "Unable to load EMI schedules.")); })
      .finally(() => { if (current) setListLoading(false); });
    return () => { current = false; };
  }, [canBrowseAll, listAttempt]);

  async function openSchedule(account) {
    setError("");
    setFeedback("");
    setLoading(true);
    setSummary(account);
    setInstallments([]);
    try {
      setInstallments(list(await listInstallments(account.loanAccountId)));
    } catch (failure) {
      setError(errorMessage(failure, "Unable to load the EMI installments."));
    } finally {
      setLoading(false);
    }
  }

  async function search(applicationId) {
    setError("");
    setLoading(true);
    setSummary(null);
    setInstallments([]);
    try {
      const account = await getLoanAccountForApplication(applicationId);
      if (account?.loanAccountId == null) throw new Error("The loan account has no ID.");
      setSummary(account);
      setInstallments(list(await listInstallments(account.loanAccountId)));
    } catch (failure) {
      setError(errorMessage(failure, "Unable to load the EMI schedule."));
    } finally {
      setLoading(false);
    }
  }

  function backToList() {
    setSummary(null);
    setInstallments([]);
    setError("");
    setFeedback("");
    setListLoading(true);
    setListAttempt((value) => value + 1);
  }

  function refresh() {
    if (summary?.applicationId != null) search(String(summary.applicationId));
    else { setError(""); setListLoading(true); setListAttempt((value) => value + 1); }
  }

  const loanAccountId = summary?.loanAccountId;
  const isPayable = (row) => ["PENDING", "OVERDUE"].includes(String(row.status ?? "").toUpperCase());
  const scheduleFields = (account) => [["Application ID", account.applicationId], ["Customer ID", account.customerId], ["Principal", money(account.principalAmount)], ["Monthly EMI", money(account.monthlyEmiAmount)], ["Tenure", account.tenureMonths != null ? `${account.tenureMonths} months` : null], ["Outstanding", money(account.outstandingAmount)]];
  return <div className="page-stack">
    {feedback && <div className="inline-message" role="status">{feedback}</div>}
    {showGenerate && <GenerateScheduleDrawer onClose={() => setShowGenerate(false)} onDone={(id) => { setShowGenerate(false); setFeedback(`EMI schedule generated for application ${id}.`); search(id); }} onViewExisting={(id) => { setShowGenerate(false); setFeedback(""); search(id); }} />}
    {payTarget && <PaymentDrawer loanAccountId={loanAccountId} account={summary} installment={payTarget} onClose={() => setPayTarget(null)} onDone={(message) => { setPayTarget(null); setFeedback(message); search(String(summary?.applicationId)); }} />}
    <section className="panel">
      <div className="panel-heading"><h2>{summary ? "Loan account" : canBrowseAll ? "All EMI schedules" : "Loan account"}</h2><div className="workspace-tools">
        {canBrowseAll && (summary || error) && <button className="button button-secondary small-button" type="button" onClick={backToList}><ArrowLeft size={14} /> All schedules</button>}
        {canGenerate && <button className="button button-primary small-button" type="button" onClick={() => { setFeedback(""); setShowGenerate(true); }}><Plus size={16} /> Generate schedule</button>}
        <button className="icon-button" type="button" aria-label="Refresh" title="Refresh" disabled={loading || listLoading} onClick={refresh}><RefreshCw size={17} /></button>
      </div></div>
      <ApplicationPicker user={user} busy={loading} onSearch={search} />
      {loading ? <p role="status">Loading EMI schedule...</p> : error ? <div className="inline-error" role="alert">{error}</div> : summary ? <dl className="finance-details">
        {[["Loan account", summary.loanAccountId], ["Application ID", summary.applicationId], ["Customer ID", summary.customerId], ["Disbursement ID", summary.disbursementId], ["Principal", money(summary.principalAmount)], ["Interest rate", summary.annualInterestRate != null ? `${Number(summary.annualInterestRate)}% p.a.` : null], ["Tenure", summary.tenureMonths != null ? `${summary.tenureMonths} months` : null], ["Monthly EMI", money(summary.monthlyEmiAmount)], ["Total payable", money(summary.totalPayableAmount)], ["Outstanding", money(summary.outstandingAmount)], ["Start date", summary.startDate], ["Maturity date", summary.maturityDate], ["Status", summary.status]].map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value ?? "-"}</dd></div>)}
      </dl> : canBrowseAll ? (
        listLoading ? <p role="status">Loading EMI schedules...</p>
          : listError ? <div className="inline-error" role="alert">{listError}</div>
            : schedules.length === 0 ? <p>No EMI schedules generated yet.</p>
              : <div className="schedule-grid">{schedules.map((account) => <article className="schedule-card" key={account.loanAccountId}>
                <div className="schedule-card-head"><h3>Loan account #{account.loanAccountId}</h3><span className={emiStatusClass(account.status)}>{account.status ?? "-"}</span></div>
                <dl>{scheduleFields(account).map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value ?? "-"}</dd></div>)}</dl>
                <button className="button button-secondary small-button" type="button" onClick={() => openSchedule(account)}><Eye size={14} /> View installments</button>
              </article>)}</div>
      ) : <p>Select an application to view its EMI schedule.</p>}
    </section>
    {summary && !loading && !error && <section className="panel">
      <div className="panel-heading"><h2>EMI installments</h2></div>
      {installments.length === 0 ? <p>No installments found.</p> : <div className="table-wrap"><table>
        <thead><tr><th>#</th><th>Due date</th><th>Opening principal</th><th>Principal</th><th>Interest</th><th>EMI</th><th>Paid</th><th>Status</th><th>Paid at</th>{canPay && <th>Action</th>}</tr></thead>
        <tbody>{installments.map((row) => <tr key={row.emiId}>
          <td>{row.installmentNumber}</td><td>{row.dueDate ?? "-"}</td><td>{money(row.openingPrincipal)}</td><td>{money(row.principalComponent)}</td><td>{money(row.interestComponent)}</td><td>{money(row.emiAmount)}</td><td>{money(row.amountPaid)}</td><td><span className={emiStatusClass(row.status)}>{row.status ?? "-"}</span></td><td>{row.paidAt?.replace("T", " ") ?? "-"}</td>
          {canPay && <td>{!isPayable(row) ? "-" : <button className="button button-primary small-button" type="button" onClick={() => { setFeedback(""); setPayTarget(row); }}><CreditCard size={14} /> Pay</button>}</td>}
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </div>;
}

function RepaymentDetails({ repaymentId, onClose }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    getRepayment(repaymentId)
      .then((response) => { if (current) setRecord(response); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load this payment.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [repaymentId]);

  return <DetailDialog title={`Payment ${repaymentId}`} drawer onClose={onClose}>
    {loading ? <p role="status">Loading payment...</p> : error ? <div className="inline-error" role="alert">{error}</div> : <dl className="finance-details">{paymentFields(record).map(([text, value]) => <div key={text}><dt>{text}</dt><dd>{value ?? "-"}</dd></div>)}</dl>}
  </DetailDialog>;
}

export function RepaymentHistoryWorkspace({ user }) {
  const [applicationId, setApplicationId] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!applicationId) return undefined;
    let current = true;
    listApplicationRepayments(applicationId)
      .then((response) => { if (current) setRows(list(response)); })
      .catch((failure) => { if (current) { setRows([]); setError(errorMessage(failure, "Unable to load payment history.")); } })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [applicationId, attempt]);

  function search(id) {
    setError("");
    setLoading(true);
    setApplicationId(id);
    setAttempt((value) => value + 1);
  }

  return <div className="page-stack">
    {selectedId != null && <RepaymentDetails key={selectedId} repaymentId={selectedId} onClose={() => setSelectedId(null)} />}
    <section className="panel">
      <div className="panel-heading"><h2>Payment history</h2>{applicationId && <div className="workspace-tools"><button className="icon-button" type="button" aria-label="Refresh payments" title="Refresh payments" disabled={loading} onClick={() => search(applicationId)}><RefreshCw size={17} /></button></div>}</div>
      <ApplicationPicker user={user} busy={loading} onSearch={search} />
      {!applicationId ? <p>Select an application to view its payments.</p> : loading ? <p role="status">Loading payments...</p> : error ? <div className="inline-error" role="alert">{error}</div> : rows.length === 0 ? <p>No payments recorded yet.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Installment</th><th>Payment reference</th><th>Amount</th><th>Payment date</th><th>Method</th><th>Status</th><th>Recorded by</th><th>Action</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={row.repaymentId}>
          <td>{row.installmentNumber ?? "-"}</td><td>{row.paymentReference ?? "-"}</td><td>{money(row.amount)}</td><td>{row.paymentDate?.replace("T", " ") ?? "-"}</td><td>{row.paymentMethod ?? "-"}</td><td><span className="status-badge">{row.status ?? "-"}</span></td><td>{row.recordedBy ?? "-"}</td>
          <td><button className="text-link" type="button" aria-label={`View payment ${row.paymentReference ?? row.repaymentId}`} onClick={() => setSelectedId(row.repaymentId)}><Eye size={14} /> Details</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
