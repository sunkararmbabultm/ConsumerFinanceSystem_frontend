import { useEffect, useState } from "react";
import { Check, Eye, RefreshCw, X } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { createCreditAssessment, listCreditAssessments } from "../services/creditAssessmentService";
import { listApplications } from "../services/financeApplicationService";

function listOf(response, keys) {
  if (Array.isArray(response)) return response;
  for (const key of keys) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  throw new Error("The service returned an unexpected response.");
}

function errorMessage(error, fallback) {
  const status = error.response?.status;
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to access credit assessments.";
  return error.response?.data?.message || (status === 409 ? "An assessment already exists for this application." : null) || (status === 404 ? "No assessment was found for this ID." : null) || fallback;
}

function FieldList({ record }) {
  return <dl className="finance-details">{Object.entries(record || {}).map(([key, value]) => <div key={key}>
    <dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</dt>
    <dd>{value == null ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
  </div>)}</dl>;
}

function AssessmentDrawer({ application, assessment, initialStatus, onClose, onDone }) {
  const [status, setStatus] = useState(initialStatus ?? "ELIGIBLE");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setSaveError("");
    if (!reason.trim()) {
      setSaveError(`Enter a reason to ${status === "ELIGIBLE" ? "accept" : "reject"} this application.`);
      return;
    }
    setSaving(true);
    try {
      await createCreditAssessment({ applicationId: Number(application.applicationId), status, reason: reason.trim() });
      onDone(`Application ${application.applicationNumber ?? application.applicationId} ${status === "ELIGIBLE" ? "accepted" : "rejected"}.`);
    } catch (failure) {
      setSaveError(errorMessage(failure, "Unable to submit the credit assessment."));
      setSaving(false);
    }
  }

  const accepting = status === "ELIGIBLE";
  const title = assessment ? `Application ${application.applicationNumber ?? application.applicationId}` : `${accepting ? "Accept" : "Reject"} application ${application.applicationNumber ?? application.applicationId}`;
  return <DetailDialog title={title} drawer onClose={() => { if (!saving) onClose(); }}>
    <h3>Application</h3>
    <FieldList record={application} />
    {assessment ? <>
      <h3>Credit assessment</h3>
      <dl className="finance-details">
        {[["Assessment ID", assessment.creditAssessmentId], ["Status", assessment.status?.replaceAll("_", " ")], ["Reason", assessment.reason], ["Assessed by", assessment.assessedBy], ["Assessed at", assessment.assessedAt]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}
      </dl>
    </> : <form className="form-grid" onSubmit={submit}>
      {saveError && <div className="inline-error" role="alert">{saveError}</div>}
      <label className="field"><span>Decision</span><select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving}><option value="ELIGIBLE">Accept (eligible)</option><option value="NOT_ELIGIBLE">Reject (not eligible)</option></select></label>
      <label className="field"><span>Reason for {accepting ? "acceptance" : "rejection"}</span><textarea rows="4" required value={reason} onChange={(event) => setReason(event.target.value)} disabled={saving} /></label>
      <div className="finance-actions">
        <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className={`button ${accepting ? "button-primary" : "button-danger"}`} type="submit" disabled={saving}>{accepting ? <Check size={16} /> : <X size={16} />}{saving ? "Submitting..." : "Submit"}</button>
      </div>
    </form>}
  </DetailDialog>;
}

export default function CreditAssessmentsWorkspace() {
  const [applications, setApplications] = useState([]);
  const [assessments, setAssessments] = useState({});
  const [filter, setFilter] = useState("ALL");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [target, setTarget] = useState(null);

  useEffect(() => {
    let current = true;
    Promise.all([listApplications(), listCreditAssessments()])
      .then(([applicationResponse, assessmentResponse]) => {
        const submitted = listOf(applicationResponse, ["content", "data", "applications", "items"]).filter((item) => String(item.status).toUpperCase() !== "DRAFT");
        const byApplication = Object.fromEntries(listOf(assessmentResponse, ["content", "data", "assessments", "items"]).map((item) => [String(item.applicationId), item]));
        if (current) { setApplications(submitted); setAssessments(byApplication); }
      })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load applications for assessment.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [attempt]);

  function refresh() {
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  const visible = applications.filter((application) => {
    const status = assessments[String(application.applicationId)]?.status ?? "PENDING";
    return filter === "ALL" || status === filter;
  });

  return <div className="page-stack">
    {feedback && <div className="inline-message" role="status">{feedback}</div>}
    {target && <AssessmentDrawer key={`${target.application.applicationId}-${target.status}`} application={target.application} assessment={assessments[String(target.application.applicationId)]} initialStatus={target.status} onClose={() => setTarget(null)} onDone={(message) => { setTarget(null); setFeedback(message); refresh(); }} />}
    <section className="panel">
      <div className="panel-heading"><h2>Applications for assessment</h2><div className="workspace-tools"><button className="icon-button" type="button" aria-label="Refresh applications" title="Refresh applications" disabled={loading} onClick={refresh}><RefreshCw size={17} /></button></div></div>
      <div className="finance-toolbar">
        <label className="field"><span>Assessment status</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="ELIGIBLE">Eligible</option><option value="NOT_ELIGIBLE">Not eligible</option></select></label>
      </div>
      {loading ? <p role="status">Loading applications...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={refresh}><RefreshCw size={14} /> Retry</button></div> : visible.length === 0 ? <p>No applications found.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Application no.</th><th>Customer ID</th><th>Product</th><th>Amount</th><th>Tenure</th><th>Submitted at</th><th>Assessment</th><th>Action</th></tr></thead>
        <tbody>{visible.map((application) => {
          const assessment = assessments[String(application.applicationId)];
          return <tr key={application.applicationId}>
            <td>{application.applicationNumber ?? application.applicationId}</td><td>{application.customerId ?? "-"}</td><td>{application.productName ?? "-"}</td><td>{application.requestedAmount != null ? Number(application.requestedAmount).toLocaleString("en-IN") : "-"}</td><td>{application.requestedTenureMonths != null ? `${application.requestedTenureMonths} months` : "-"}</td><td>{application.submittedAt ?? "-"}</td>
            <td><span className="status-badge">{assessment?.status?.replaceAll("_", " ") ?? "PENDING"}</span></td>
            <td><div className="workspace-tools">
              {assessment ? <button className="text-link" type="button" aria-label={`View application ${application.applicationId}`} onClick={() => setTarget({ application, status: null })}><Eye size={14} /> Details</button> : <>
                <button className="button button-primary small-button" type="button" onClick={() => { setFeedback(""); setTarget({ application, status: "ELIGIBLE" }); }}><Check size={14} /> Accept</button>
                <button className="button button-danger small-button" type="button" onClick={() => { setFeedback(""); setTarget({ application, status: "NOT_ELIGIBLE" }); }}><X size={14} /> Reject</button>
              </>}
            </div></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
  </div>;
}
