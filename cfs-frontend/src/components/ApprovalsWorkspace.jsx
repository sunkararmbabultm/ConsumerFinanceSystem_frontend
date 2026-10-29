import { useEffect, useState } from "react";
import { Check, ClipboardCheck, Eye, Plus, RefreshCw, X } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { createApproval, getApproval, getApprovalForApplication, getApprovalReview, listApprovals, listApprovalsByReviewer, listApprovalsByStatus, listPendingApprovals } from "../services/approvalService";

function records(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["content", "data", "approvals", "items"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  if (response && typeof response === "object" && response.approvalId != null) return [response];
  throw new Error("The approval service returned an unexpected response.");
}

function errorMessage(error, fallback) {
  return error.response?.data?.message || error.message || fallback;
}

function ApprovalDetails({ approval, onClose }) {
  const [details, setDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        if (approval.approvalId == null) throw new Error("This decision has no approval ID.");
        const response = await getApproval(approval.approvalId);
        const result = records(response);
        if (result.length !== 1) throw new Error("The approval service did not return a single decision.");
        if (current) setDetails(result[0]);
      } catch (failure) {
        if (current) setError(errorMessage(failure, "Unable to load this decision."));
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [approval.approvalId, attempt]);

  return <DetailDialog title={`Approval ${approval.approvalId ?? ""} details`} drawer onClose={onClose}>
    {loading ? <p role="status">Loading approval details...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={() => { setError(""); setLoading(true); setAttempt((value) => value + 1); }}>Retry</button></div> : <dl className="finance-details">
      {Object.entries(details).map(([key, value]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2")}</dt><dd>{value == null ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}
    </dl>}
  </DetailDialog>;
}

function ReviewDrawer({ pending, onClose, onDone }) {
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const eligible = pending.assessmentStatus === "ELIGIBLE";
  const [decision, setDecision] = useState(eligible ? "APPROVED" : "REJECTED");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let current = true;
    getApprovalReview(pending.applicationId)
      .then((response) => { if (current) setReview(response); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load the credit assessment.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [pending.applicationId, attempt]);

  async function submit(event) {
    event.preventDefault();
    setSaveError("");
    if (!remarks.trim()) {
      setSaveError(`Enter a reason to ${decision === "APPROVED" ? "approve" : "reject"} this application.`);
      return;
    }
    setSaving(true);
    try {
      await createApproval({ applicationId: Number(pending.applicationId), creditAssessmentId: Number(review?.creditAssessmentId ?? pending.creditAssessmentId), status: decision, remarks: remarks.trim() });
      onDone(`Application ${pending.applicationId} ${decision.toLowerCase()} successfully.`);
    } catch (failure) {
      setSaveError(errorMessage(failure, "Unable to record the decision."));
      setSaving(false);
    }
  }

  const approving = decision === "APPROVED";
  return <DetailDialog title={`Review application ${pending.applicationId}`} drawer onClose={() => { if (!saving) onClose(); }}>
    <h3>Credit assessment</h3>
    {loading ? <p role="status">Loading credit assessment...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={() => { setError(""); setLoading(true); setAttempt((value) => value + 1); }}>Retry</button></div> : <dl className="finance-details">
      {Object.entries(review ?? {}).map(([key, value]) => <div key={key}><dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</dt><dd>{value == null ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}
    </dl>}
    {!loading && !error && <form className="form-grid" onSubmit={submit}>
      {saveError && <div className="inline-error" role="alert">{saveError}</div>}
      <label className="field"><span>Decision</span><select value={decision} onChange={(event) => setDecision(event.target.value)} disabled={saving}><option value="APPROVED" disabled={!eligible}>Approve</option><option value="REJECTED">Reject</option></select></label>
      <label className="field"><span>Reason for {approving ? "approval" : "rejection"}</span><textarea rows="4" required value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={saving} /></label>
      <div className="finance-actions">
        <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className={`button ${approving ? "button-primary" : "button-danger"}`} type="submit" disabled={saving}>{approving ? <Check size={16} /> : <X size={16} />}{saving ? "Submitting..." : approving ? "Approve" : "Reject"}</button>
      </div>
    </form>}
  </DetailDialog>;
}

export default function ApprovalsWorkspace({ isAdmin }) {
  const [pending, setPending] = useState([]);
  const [pendingLoading, setPendingLoading] = useState(true);
  const [pendingError, setPendingError] = useState("");
  const [pendingAttempt, setPendingAttempt] = useState(0);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [approvals, setApprovals] = useState([]);
  const [filter, setFilter] = useState("ALL");
  const [lookup, setLookup] = useState("");
  const [request, setRequest] = useState({ filter: "ALL", value: "" });
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ applicationId: "", creditAssessmentId: "", status: "APPROVED", remarks: "" });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [selectedApproval, setSelectedApproval] = useState(null);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        let response;
        switch (request.filter) {
          case "APPROVED":
          case "REJECTED":
            response = await listApprovalsByStatus(request.filter);
            break;
          case "APPROVAL_ID":
            response = await getApproval(request.value);
            break;
          case "APPLICATION_ID":
            response = await getApprovalForApplication(request.value);
            break;
          case "REVIEWER":
            if (!isAdmin) throw new Error("Only administrators can search by reviewer.");
            response = await listApprovalsByReviewer(request.value);
            break;
          default:
            response = await listApprovals();
        }
        const result = records(response);
        if (current) setApprovals(result);
      } catch (failure) {
        if (current) setError(errorMessage(failure, "Unable to load approvals."));
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [request, attempt, isAdmin]);

  useEffect(() => {
    let current = true;
    listPendingApprovals()
      .then((response) => {
        if (!Array.isArray(response)) throw new Error("The approval service returned an unexpected pending list.");
        if (current) setPending(response);
      })
      .catch((failure) => { if (current) setPendingError(errorMessage(failure, "Unable to load pending applications.")); })
      .finally(() => { if (current) setPendingLoading(false); });
    return () => { current = false; };
  }, [pendingAttempt]);

  function refreshPending() {
    setPendingError("");
    setPendingLoading(true);
    setPendingAttempt((value) => value + 1);
  }

  function reviewDone(message) {
    setReviewTarget(null);
    setFeedback(message);
    refreshPending();
    refresh();
  }

  function refresh() {
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  function search(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    setRequest({ filter, value: lookup.trim() });
  }

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaveError("");
    setFeedback("");
    const applicationId = Number(form.applicationId);
    const creditAssessmentId = Number(form.creditAssessmentId);
    if (!Number.isSafeInteger(applicationId) || applicationId <= 0 || !Number.isSafeInteger(creditAssessmentId) || creditAssessmentId <= 0) {
      setSaveError("Application ID and credit assessment ID must be positive whole numbers.");
      return;
    }
    if (form.status === "REJECTED" && !form.remarks.trim()) {
      setSaveError("Remarks are required when rejecting an application.");
      return;
    }
    setSaving(true);
    try {
      await createApproval({ applicationId, creditAssessmentId, status: form.status, remarks: form.remarks.trim() });
      setFeedback(`Application ${applicationId} ${form.status.toLowerCase()} successfully.`);
      setForm({ applicationId: "", creditAssessmentId: "", status: "APPROVED", remarks: "" });
      setShowCreate(false);
      refreshPending();
      refresh();
    } catch (failure) {
      setSaveError(errorMessage(failure, "Unable to record the decision."));
    } finally {
      setSaving(false);
    }
  }

  const needsLookup = ["APPROVAL_ID", "APPLICATION_ID", "REVIEWER"].includes(filter);
  const lookupLabel = filter === "REVIEWER" ? "Reviewer email" : filter === "APPLICATION_ID" ? "Application ID" : "Approval ID";

  return <div className="page-stack">
    {feedback && <div className="inline-message" role="status">{feedback}</div>}
    {showCreate && <DetailDialog title="Record an approval decision" drawer onClose={() => { if (!saving) setShowCreate(false); }}>
      <p>Enter the application and its credit assessment to approve or reject it.</p>
      {saveError && <div className="inline-error" role="alert">{saveError}</div>}
      <form className="form-grid two-columns" onSubmit={submit}>
        <label className="field"><span>Application ID</span><input name="applicationId" type="number" min="1" step="1" required value={form.applicationId} onChange={change} disabled={saving} /></label>
        <label className="field"><span>Credit assessment ID</span><input name="creditAssessmentId" type="number" min="1" step="1" required value={form.creditAssessmentId} onChange={change} disabled={saving} /></label>
        <label className="field"><span>Decision</span><select name="status" value={form.status} onChange={change} disabled={saving}><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label>
        <label className="field field-wide"><span>Remarks (required to reject)</span><textarea name="remarks" rows="3" required={form.status === "REJECTED"} value={form.remarks} onChange={change} disabled={saving} /></label>
        <div className="field-wide"><button className="button button-primary" type="submit" disabled={saving}>{saving ? "Saving decision..." : "Submit decision"}</button></div>
      </form>
    </DetailDialog>}
    {selectedApproval && <ApprovalDetails approval={selectedApproval} onClose={() => setSelectedApproval(null)} />}
    {reviewTarget && <ReviewDrawer key={reviewTarget.applicationId} pending={reviewTarget} onClose={() => setReviewTarget(null)} onDone={reviewDone} />}
    <section className="panel">
      <div className="panel-heading"><h2>Pending approvals</h2><div className="workspace-tools"><button className="icon-button" type="button" aria-label="Refresh pending approvals" title="Refresh pending approvals" disabled={pendingLoading} onClick={refreshPending}><RefreshCw size={17} /></button></div></div>
      {pendingLoading ? <p role="status">Loading pending applications...</p> : pendingError ? <div className="inline-error" role="alert">{pendingError}<button className="button button-secondary small-button" type="button" onClick={refreshPending}>Retry</button></div> : pending.length === 0 ? <p>No applications are awaiting approval.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Application ID</th><th>Assessment ID</th><th>Assessment status</th><th>Assessment reason</th><th>Assessed by</th><th>Action</th></tr></thead>
        <tbody>{pending.map((item) => <tr key={item.applicationId}>
          <td>{item.applicationId}</td><td>{item.creditAssessmentId ?? "-"}</td><td><span className="status-badge">{item.assessmentStatus?.replaceAll("_", " ") ?? "-"}</span></td><td>{item.assessmentReason ?? "-"}</td><td>{item.assessedBy ?? "-"}</td>
          <td><button className="button button-primary small-button" type="button" onClick={() => { setFeedback(""); setReviewTarget(item); }}><ClipboardCheck size={14} /> Review</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
    <section className="panel">
      <div className="panel-heading"><h2>Approval history</h2><div className="workspace-tools"><button className="button button-primary small-button" type="button" onClick={() => { setSaveError(""); setFeedback(""); setShowCreate(true); }}><Plus size={16} /> Record decision</button><button className="icon-button" type="button" aria-label="Refresh approvals" title="Refresh approvals" disabled={loading} onClick={refresh}><RefreshCw size={17} /></button></div></div>
      <form className="finance-toolbar" onSubmit={search}>
        <label className="field"><span>Find decisions</span><select value={filter} onChange={(event) => { setFilter(event.target.value); setLookup(""); }}>
          <option value="ALL">All decisions</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="APPROVAL_ID">By approval ID</option><option value="APPLICATION_ID">By application ID</option>{isAdmin && <option value="REVIEWER">By reviewer</option>}
        </select></label>
        {needsLookup && <label className="field"><span>{lookupLabel}</span><input type={filter === "REVIEWER" ? "email" : "number"} min={filter === "REVIEWER" ? undefined : "1"} step={filter === "REVIEWER" ? undefined : "1"} required value={lookup} onChange={(event) => setLookup(event.target.value)} /></label>}
        <button className="button button-secondary" type="submit" disabled={loading}>Search</button>
      </form>
      {loading ? <p role="status">Loading approvals...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={refresh}>Retry</button></div> : approvals.length === 0 ? <p>No decisions found.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Approval ID</th><th>Application ID</th><th>Status</th><th>Reviewer</th><th>Reviewed at</th><th>Action</th></tr></thead>
        <tbody>{approvals.map((approval, index) => <tr key={approval.approvalId ?? index} onClick={() => setSelectedApproval(approval)}>
          <td>{approval.approvalId ?? "-"}</td><td>{approval.applicationId ?? "-"}</td><td>{approval.status ?? "-"}</td><td>{approval.reviewedBy ?? "-"}</td><td>{approval.reviewedAt ?? approval.createdAt ?? "-"}</td><td><button className="text-link" type="button" aria-label={`View approval ${approval.approvalId ?? index + 1}`} onClick={(event) => { event.stopPropagation(); setSelectedApproval(approval); }}><Eye size={14} /> Details</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>
  </div>;
}
