import { useEffect, useState } from "react";
import { Check, Eye, RefreshCw } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { createCreditAssessment, getAssessmentForApplication, listCreditAssessments } from "../services/creditAssessmentService";
import { getAssessmentContext, listAssessmentQueue } from "../services/financeApplicationService";

const queueRoles = ["ADMIN", "CREDIT_ANALYST", "CREDIT_MANAGER"];
const assessmentRoles = ["ADMIN", "CREDIT_ANALYST", "CREDIT_MANAGER"];
const currency = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const dateTime = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" });

function records(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["content", "data", "applications", "assessments", "items"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  throw new Error("The service returned an unexpected response.");
}

function errorMessage(error, fallback) {
  const status = error.response?.status;
  const body = error.response?.data && typeof error.response.data === "object" ? error.response.data : {};
  const message = typeof body.message === "string" && body.message.length <= 400
    && !/(\n\s*at\s|Exception:|Error:)/.test(body.message) ? body.message : "";
  if (status === 400) {
    const errors = body.validationErrors || body.errors;
    const validation = errors && typeof errors === "object" ? Object.values(errors).filter(Boolean).join(" ") : "";
    return validation ? `Validation failed: ${validation}` : message || "The assessment request is invalid. Check the reason and application.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to access or change these assessment records.";
  if (status === 404) return message || "The application or assessment record was not found.";
  if (status === 409) return message || "An assessment already exists for this application. Refresh the queue.";
  if (status === 502 || status === 503) return "The finance or credit service is temporarily unavailable.";
  return fallback;
}

function amount(value) {
  const number = Number(value);
  return value == null || value === "" || !Number.isFinite(number) ? "-" : currency.format(number);
}

function submittedAt(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : dateTime.format(parsed);
}

function AssessmentQueueTable({ applications, assessmentByApplication, onOpen, canCreate, showAssessment = true, assessmentHistoryAvailable = true }) {
  return applications.length === 0 ? <p>No submitted applications are awaiting assessment.</p> : <div className="table-wrap"><table>
    <thead><tr><th>Application ID</th><th>Application number</th><th>Customer ID</th><th>Product</th><th>Requested amount</th><th>Tenure</th><th>Purpose</th><th>Submitted</th><th>Status</th>{showAssessment && <th>Assessment</th>}<th>Action</th></tr></thead>
    <tbody>{applications.map((application) => {
      const assessment = assessmentByApplication[String(application.applicationId)];
      const assessLabel = assessment ? "View" : canCreate && assessmentHistoryAvailable ? "Assess" : "Open";
      return <tr key={application.applicationId}>
        <td>{application.applicationId}</td><td>{application.applicationNumber ?? "-"}</td><td>{application.customerId ?? "-"}</td><td>{application.productName ?? "-"}</td><td>{amount(application.requestedAmount)}</td><td>{application.requestedTenureMonths == null ? "-" : `${application.requestedTenureMonths} months`}</td><td>{application.loanPurpose ?? "-"}</td><td>{submittedAt(application.submittedAt)}</td><td><span className="status-badge">{application.status ?? "-"}</span></td>{showAssessment && <td><span className="status-badge">{assessment?.status?.replaceAll("_", " ") ?? (assessmentHistoryAvailable ? "NOT ASSESSED" : "UNKNOWN")}</span></td>}
        <td><button className="text-link" type="button" onClick={() => onOpen(application)}>{assessment ? <><Eye size={14} /> {assessLabel}</> : canCreate && assessmentHistoryAvailable ? <><Check size={14} /> {assessLabel}</> : <><Eye size={14} /> {assessLabel}</>}</button></td>
      </tr>;
    })}</tbody>
  </table></div>;
}

export function StaffApplicationQueueWorkspace({ userRole }) {
  const [result, setResult] = useState({ attempt: -1, applications: [], error: "" });
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [context, setContext] = useState(null);
  const [contextError, setContextError] = useState("");
  const [contextLoading, setContextLoading] = useState(false);
  const allowed = queueRoles.includes(userRole);
  const current = result.attempt === attempt;
  const loading = allowed && !current;

  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    listAssessmentQueue()
      .then((response) => {
        const applications = records(response).filter((item) => item.status === "SUBMITTED");
        if (active) setResult({ attempt, applications, error: "" });
      })
      .catch((failure) => {
        if (active) setResult({ attempt, applications: [], error: errorMessage(failure, "Unable to load submitted applications.") });
      });
    return () => { active = false; };
  }, [allowed, attempt]);

  async function openApplication(application) {
    setSelected(application);
    setContext(null);
    setContextError("");
    setContextLoading(true);
    try {
      setContext(await getAssessmentContext(application.applicationId));
    } catch (failure) {
      setContextError(errorMessage(failure, "Unable to load the current application assessment context."));
    } finally {
      setContextLoading(false);
    }
  }

  const applications = current ? result.applications : [];
  const error = current ? result.error : "";

  return <div className="page-stack">
    <section className="panel">
      <div className="panel-heading"><div><h2>Submitted application queue</h2><p>Submitted applications from Finance Application Service.</p></div><button className="icon-button" type="button" aria-label="Refresh application queue" title="Refresh application queue" disabled={loading} onClick={() => setAttempt((value) => value + 1)}><RefreshCw size={17} /></button></div>
      {!allowed ? <div className="inline-error" role="alert">Your role cannot access the submitted application queue.</div> : loading ? <p role="status">Loading submitted applications...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div> : <AssessmentQueueTable applications={applications} assessmentByApplication={{}} onOpen={openApplication} canCreate={false} showAssessment={false} />}
    </section>
    {selected && <DetailDialog title={`Application ${selected.applicationId}`} drawer onClose={() => setSelected(null)}>
      {contextLoading ? <p role="status">Loading assessment context...</p> : contextError ? <div className="inline-error" role="alert">{contextError}</div> : context && <dl className="finance-details">
        {[...[ ["Application ID", context.applicationId], ["Application number", selected.applicationNumber], ["Customer ID", selected.customerId], ["Product", selected.productName], ["Requested amount", amount(selected.requestedAmount)], ["Tenure", `${selected.requestedTenureMonths} months`], ["Purpose", selected.loanPurpose], ["Current status", context.status] ]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}
      </dl>}
    </DetailDialog>}
  </div>;
}

function AssessmentDialog({ application, canCreate, onClose, onCreated }) {
  const [result, setResult] = useState({ applicationId: null, attempt: -1, context: null, assessment: null, error: "" });
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState("ELIGIBLE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const current = result.applicationId === application.applicationId && result.attempt === attempt;
  const loading = !current;

  useEffect(() => {
    let active = true;
    Promise.all([
      getAssessmentContext(application.applicationId),
      getAssessmentForApplication(application.applicationId).catch((failure) => {
        if (failure.response?.status === 404) return null;
        throw failure;
      }),
    ])
      .then(([context, assessment]) => {
        if (active) setResult({ applicationId: application.applicationId, attempt, context, assessment, error: "" });
      })
      .catch((failure) => {
        if (active) setResult({ applicationId: application.applicationId, attempt, context: null, assessment: null, error: errorMessage(failure, "Unable to load the application context.") });
      });
    return () => { active = false; };
  }, [application.applicationId, attempt]);

  async function submit(event) {
    event.preventDefault();
    setSaveError("");
    if (!reason.trim() || reason.trim().length < 5) {
      setSaveError("Enter an assessment reason of at least 5 characters.");
      return;
    }
    setSaving(true);
    try {
      await createCreditAssessment({ applicationId: Number(application.applicationId), status, reason: reason.trim() });
      onCreated(`Assessment recorded for application ${application.applicationId}.`);
    } catch (failure) {
      setSaveError(errorMessage(failure, "Unable to create the credit assessment."));
    } finally {
      setSaving(false);
    }
  }

  const assessment = current ? result.assessment : null;
  const context = current ? result.context : null;
  const error = current ? result.error : "";

  return <DetailDialog title={`Application ${application.applicationId}`} drawer onClose={() => { if (!saving) onClose(); }}>
    {loading ? <p role="status">Loading assessment context...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={() => setAttempt((value) => value + 1)}>Retry</button></div> : <>
      <dl className="finance-details">{[
        ["Application ID", context.applicationId], ["Application number", application.applicationNumber], ["Customer ID", application.customerId],
        ["Product", application.productName], ["Requested amount", amount(application.requestedAmount)], ["Tenure", `${application.requestedTenureMonths} months`],
        ["Purpose", application.loanPurpose], ["Current status", context.status],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>
      {assessment ? <section className="panel"><div className="panel-heading"><h3>Existing assessment</h3></div><dl className="finance-details">{[
        ["Assessment ID", assessment.creditAssessmentId], ["Status", assessment.status], ["Reason", assessment.reason],
        ["Assessed by", assessment.assessedBy], ["Assessed at", submittedAt(assessment.assessedAt)],
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl></section>
        : context.status !== "SUBMITTED" ? <div className="inline-error" role="alert">This application is no longer submitted and cannot be assessed. Refresh the queue.</div>
          : canCreate ? <form className="form-grid" onSubmit={submit}>
          {saveError && <div className="inline-error" role="alert">{saveError}</div>}
          <label className="field"><span>Assessment decision</span><select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving}><option value="ELIGIBLE">Eligible</option><option value="NOT_ELIGIBLE">Not eligible</option></select></label>
          <label className="field"><span>Reason (required)</span><textarea rows="4" minLength="5" maxLength="500" required value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label>
          <div className="finance-actions"><button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving assessment..." : "Submit assessment"}</button></div>
        </form> : <p>No assessment exists. This role can view but cannot create one.</p>}
    </>}
  </DetailDialog>;
}

export default function CreditAssessmentsWorkspace({ userRole }) {
  const [result, setResult] = useState({ attempt: -1, applications: [], assessments: [], queueError: "", historyError: "" });
  const [filter, setFilter] = useState("ALL");
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null);
  const [feedback, setFeedback] = useState("");
  const allowed = queueRoles.includes(userRole);
  const canCreate = assessmentRoles.includes(userRole);
  const current = result.attempt === attempt;
  const loading = allowed && !current;

  useEffect(() => {
    if (!allowed) return undefined;
    let active = true;
    Promise.allSettled([listAssessmentQueue(), listCreditAssessments()]).then(([queueResult, historyResult]) => {
      if (!active) return;
      setResult({
        attempt,
        applications: queueResult.status === "fulfilled" ? records(queueResult.value).filter((item) => item.status === "SUBMITTED") : [],
        assessments: historyResult.status === "fulfilled" ? records(historyResult.value) : [],
        queueError: queueResult.status === "rejected" ? errorMessage(queueResult.reason, "Unable to load submitted applications.") : "",
        historyError: historyResult.status === "rejected" ? errorMessage(historyResult.reason, "Unable to load assessment history.") : "",
      });
    });
    return () => { active = false; };
  }, [allowed, attempt]);

  function refresh() {
    setFeedback("");
    setAttempt((value) => value + 1);
  }

  const applications = current ? result.applications : [];
  const assessments = current ? result.assessments : [];
  const assessmentByApplication = Object.fromEntries(assessments.map((item) => [String(item.applicationId), item]));
  const visibleAssessments = assessments.filter((assessment) => filter === "ALL" || assessment.status === filter);

  return <div className="page-stack">
    {feedback && <div className="inline-message" role="status">{feedback}</div>}
    {selected && <AssessmentDialog key={selected.applicationId} application={selected} canCreate={canCreate} onClose={() => setSelected(null)} onCreated={(message) => { setSelected(null); setFeedback(message); refresh(); }} />}
    <section className="panel">
      <div className="panel-heading"><div><h2>Submitted applications</h2><p>Applications returned by the restricted assessment queue.</p></div><button className="icon-button" type="button" aria-label="Refresh assessment queue" title="Refresh assessment queue" disabled={loading} onClick={refresh}><RefreshCw size={17} /></button></div>
      {!allowed ? <div className="inline-error" role="alert">Your role cannot access the assessment queue.</div> : loading ? <p role="status">Loading submitted applications...</p> : result.queueError ? <div className="inline-error" role="alert">{result.queueError}<button className="button button-secondary small-button" type="button" onClick={refresh}>Retry</button></div> : <AssessmentQueueTable applications={applications} assessmentByApplication={assessmentByApplication} onOpen={setSelected} canCreate={canCreate} assessmentHistoryAvailable={!result.historyError} />}
    </section>
    <section className="panel">
      <div className="panel-heading"><div><h2>Credit assessment history</h2><p>Existing assessment records.</p></div><label className="field"><span>Assessment status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All</option><option value="ELIGIBLE">Eligible</option><option value="NOT_ELIGIBLE">Not eligible</option></select></label></div>
      {loading ? <p role="status">Loading assessment history...</p> : result.historyError ? <div className="inline-error" role="alert">{result.historyError}<button className="button button-secondary small-button" type="button" onClick={refresh}>Retry</button></div> : visibleAssessments.length === 0 ? <p>No assessment records found.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Application ID</th><th>Assessment ID</th><th>Status</th><th>Reason</th><th>Assessed by</th><th>Assessed at</th></tr></thead>
        <tbody>{visibleAssessments.map((assessment) => <tr key={assessment.creditAssessmentId}>
          <td>{assessment.applicationId ?? "-"}</td><td>{assessment.creditAssessmentId ?? "-"}</td><td><span className="status-badge">{assessment.status?.replaceAll("_", " ") ?? "-"}</span></td><td>{assessment.reason ?? "-"}</td><td>{assessment.assessedBy ?? "-"}</td><td>{submittedAt(assessment.assessedAt)}</td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}