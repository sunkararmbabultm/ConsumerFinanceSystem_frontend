import { useEffect, useState } from "react";
import { Eye, Plus, RefreshCw, Search, Wallet } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { createDisbursement, getDisbursement, getDisbursementForApplication, listDisbursements } from "../services/disbursementService";
import { notifyLoanDisbursed } from "../services/notificationService";
import { listWorkspaceApplications } from "../services/financeApplicationService";

const isPositiveInteger = (value) => Number.isSafeInteger(Number(value)) && Number(value) > 0;
const money = (value) => value == null ? "-" : Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function errorMessage(error, fallback) {
  if (error.response?.status === 401) return "Your session has expired. Sign in again.";
  if (error.response?.status === 403) return "You do not have permission for this action.";
  return error.response?.data?.message || fallback;
}

function DisbursementFields({ record }) {
  return <dl className="finance-details">
    {[["Disbursement ID", record.disbursementId], ["Application ID", record.applicationId], ["Approval ID", record.approvalId], ["Amount", money(record.amount)], ["Status", record.status], ["Transaction reference", record.transactionReference], ["Processed by", record.processedBy], ["Disbursed at", record.disbursedAt?.replace("T", " ")]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}
  </dl>;
}

function DisbursementDetails({ disbursementId, onClose }) {
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getDisbursement(disbursementId)
      .then((response) => { if (current) setRecord(response); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load this disbursement.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [disbursementId, attempt]);

  return <DetailDialog title={`Disbursement ${disbursementId}`} drawer onClose={onClose}>
    {loading ? <p role="status">Loading disbursement...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={() => { setError(""); setLoading(true); setAttempt((value) => value + 1); }}><RefreshCw size={14} /> Retry</button></div> : record && <DisbursementFields record={record} />}
  </DetailDialog>;
}

function CreateDisbursementDrawer({ onClose, onDone, onViewExisting }) {
  const [form, setForm] = useState({ applicationId: "", amount: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [existingId, setExistingId] = useState(null);

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [event.target.name]: undefined }));
    setError("");
    setExistingId(null);
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setError("");
    setExistingId(null);
    const applicationId = Number(form.applicationId);
    const amount = Number(form.amount);
    const errors = {};
    if (!isPositiveInteger(form.applicationId)) errors.applicationId = "Application ID must be a positive whole number.";
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = "Amount must be greater than zero.";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    setSaving(true);
    try {
      const record = await createDisbursement({ applicationId, amount });
      notifyLoanDisbursed({ customerId: record?.customerId, applicationId, approvalId: record?.approvalId, disbursementId: record?.disbursementId, amount });
      onDone(record);
    } catch (failure) {
      const status = failure.response?.status;
      const validation = failure.response?.data?.validationErrors;
      setFieldErrors(validation && typeof validation === "object" ? validation : {});
      setError(errorMessage(failure, status === 409 ? "Disbursement already exists for this application." : "Unable to disburse funds. The application must have an APPROVED decision."));
      if (status === 409) setExistingId(applicationId);
    } finally {
      setSaving(false);
    }
  }

  return <DetailDialog title="Create disbursement" drawer onClose={() => { if (!saving) onClose(); }}>
    {error && <div className="inline-error" role="alert">{error}{existingId && <button className="button button-secondary small-button" type="button" onClick={() => onViewExisting(existingId)}><Eye size={14} /> View existing disbursement</button>}</div>}
    <form className="form-grid" onSubmit={submit}>
      <label className="field"><span>Approved application ID</span><input name="applicationId" type="number" min="1" step="1" required value={form.applicationId} onChange={change} disabled={saving} aria-invalid={Boolean(fieldErrors.applicationId)} aria-describedby={fieldErrors.applicationId ? "disbursement-application-error" : undefined} />{fieldErrors.applicationId && <small id="disbursement-application-error" className="field-error" role="alert">{fieldErrors.applicationId}</small>}</label>
      <label className="field"><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" required value={form.amount} onChange={change} disabled={saving} aria-invalid={Boolean(fieldErrors.amount)} aria-describedby={fieldErrors.amount ? "disbursement-amount-error" : undefined} />{fieldErrors.amount && <small id="disbursement-amount-error" className="field-error" role="alert">{fieldErrors.amount}</small>}</label>
      <div className="finance-actions"><button className="button button-secondary" type="button" disabled={saving} onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}><Wallet size={16} />{saving ? "Disbursing..." : "Disburse funds"}</button></div>
    </form>
  </DetailDialog>;
}

export default function DisbursementsWorkspace({ user }) {
  const isCustomer = user?.role === "CUSTOMER";
  const canCreate = ["ADMIN", "CREDIT_MANAGER"].includes(user?.role);
  const [records, setRecords] = useState([]);
  const [applications, setApplications] = useState([]);
  const [applicationError, setApplicationError] = useState("");
  const [filter, setFilter] = useState(isCustomer ? "APPLICATION_ID" : "ALL");
  const [lookup, setLookup] = useState("");
  const [request, setRequest] = useState(isCustomer ? null : { filter: "ALL", value: "" });
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(!isCustomer);
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    if (!isCustomer) return undefined;
    let current = true;
    listWorkspaceApplications(false, user?.id)
      .then((response) => {
        const rows = Array.isArray(response) ? response : response?.content ?? response?.data ?? response?.applications ?? [];
        if (current) { setApplications(rows); setApplicationError(""); }
      })
      .catch((failure) => { if (current) setApplicationError(errorMessage(failure, "Unable to load your applications.")); });
    return () => { current = false; };
  }, [isCustomer, user?.id, attempt]);

  useEffect(() => {
    if (!request) return undefined;
    let current = true;
    async function load() {
      try {
        const response = request.filter === "APPLICATION_ID"
          ? await getDisbursementForApplication(request.value)
          : request.filter === "DISBURSEMENT_ID" ? await getDisbursement(request.value) : await listDisbursements();
        if (current) setRecords(Array.isArray(response) ? response : [response]);
      } catch (failure) {
        if (current) { setRecords([]); setError(errorMessage(failure, "Unable to load disbursements.")); }
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [request, attempt]);

  function refresh() {
    setError("");
    setLoading(Boolean(request));
    setAttempt((value) => value + 1);
  }

  function search(event) {
    event.preventDefault();
    if (filter !== "ALL" && !isPositiveInteger(lookup)) {
      setLookupError("Enter a positive whole-number ID.");
      return;
    }
    setLookupError("");
    setError("");
    setLoading(true);
    setRequest({ filter, value: filter === "ALL" ? "" : String(Number(lookup)) });
  }

  function viewApplication(applicationId) {
    setShowCreate(false);
    setFilter("APPLICATION_ID");
    setLookup(String(applicationId));
    setLookupError("");
    setError("");
    setLoading(true);
    setRequest({ filter: "APPLICATION_ID", value: String(applicationId) });
  }

  return <div className="page-stack">
    {feedback && <div className="inline-message" role="status">{feedback}</div>}
    {showCreate && canCreate && <CreateDisbursementDrawer onClose={() => setShowCreate(false)} onDone={(record) => { setFeedback(`Funds disbursed for application ${record.applicationId}. Transaction: ${record.transactionReference}`); viewApplication(record.applicationId); }} onViewExisting={viewApplication} />}
    {selectedId != null && <DisbursementDetails key={selectedId} disbursementId={selectedId} onClose={() => setSelectedId(null)} />}
    <section className="panel">
      <div className="panel-heading"><h2>Disbursements</h2><div className="workspace-tools">
        {canCreate && <button className="button button-primary small-button" type="button" onClick={() => { setFeedback(""); setShowCreate(true); }}><Plus size={16} /> Create disbursement</button>}
        <button className="icon-button" type="button" title="Refresh disbursements" aria-label="Refresh disbursements" disabled={loading} onClick={refresh}><RefreshCw size={17} /></button>
      </div></div>
      <form className="finance-toolbar" onSubmit={search}>
        {!isCustomer && <label className="field"><span>Find disbursements</span><select value={filter} onChange={(event) => { setFilter(event.target.value); setLookup(""); setLookupError(""); }}><option value="ALL">All disbursements</option><option value="DISBURSEMENT_ID">By disbursement ID</option><option value="APPLICATION_ID">By application ID</option></select></label>}
        {isCustomer ? <label className="field"><span>Application</span><select required value={lookup} onChange={(event) => setLookup(event.target.value)}><option value="">Select an application</option>{applications.map((item) => <option key={item.applicationId} value={item.applicationId}>{item.applicationNumber ?? item.applicationId} - {item.productName ?? "Loan"}</option>)}</select></label> : filter !== "ALL" && <label className="field"><span>{filter === "APPLICATION_ID" ? "Application ID" : "Disbursement ID"}</span><input type="number" min="1" step="1" required value={lookup} onChange={(event) => setLookup(event.target.value)} /></label>}
        <button className="button button-secondary" type="submit" disabled={loading}><Search size={16} /> Search</button>
      </form>
      {lookupError && <div className="inline-error" role="alert">{lookupError}</div>}
      {applicationError && <div className="inline-error" role="alert">{applicationError}<button className="button button-secondary small-button" type="button" onClick={refresh}><RefreshCw size={14} /> Retry</button></div>}
      {loading ? <p role="status">Loading disbursements...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={refresh}><RefreshCw size={14} /> Retry</button></div> : !request ? <p>No application selected.</p> : records.length === 0 ? <p>No disbursements found.</p> : isCustomer ? records.map((record) => <DisbursementFields key={record.disbursementId} record={record} />) : <div className="table-wrap"><table>
        <thead><tr><th>Disbursement ID</th><th>Application ID</th><th>Approval ID</th><th>Amount</th><th>Status</th><th>Transaction reference</th><th>Processed by</th><th>Disbursed at</th><th>Action</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.disbursementId}><td>{record.disbursementId}</td><td>{record.applicationId}</td><td>{record.approvalId}</td><td>{money(record.amount)}</td><td><span className="status-badge">{record.status}</span></td><td>{record.transactionReference ?? "-"}</td><td>{record.processedBy ?? "-"}</td><td>{record.disbursedAt?.replace("T", " ") ?? "-"}</td><td><button className="text-link" type="button" onClick={() => setSelectedId(record.disbursementId)}><Eye size={14} /> Details</button></td></tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}