import { useEffect, useState } from "react";
import { Check, ClipboardCheck, Eye, RefreshCw, X } from "lucide-react";
import { DetailDialog } from "./FinanceWorkspace";
import { createApproval, getApproval, getApprovalForApplication, listApprovals, listApprovalsByReviewer, listApprovalsByStatus } from "../services/approvalService";
import { getAssessmentForApplication, listCreditAssessments } from "../services/creditAssessmentService";

function records(response) {
  if (Array.isArray(response)) return response;
  for (const key of ["content", "data", "approvals", "assessments", "items"]) {
    if (Array.isArray(response?.[key])) return response[key];
  }
  if (response && typeof response === "object" && response.approvalId != null) return [response];
  throw new Error("The approval service returned an unexpected response.");
}

function errorMessage(error, fallback) {
  const status = error.response?.status;
  const body = error.response?.data && typeof error.response.data === "object" ? error.response.data : {};
  const serverMessage = typeof body.message === "string" && body.message.length <= 400
    && !/(\n\s*at\s|Exception:|Error:)/.test(body.message) ? body.message : "";

  if (status === 400) {
    const errors = body.validationErrors || body.errors;
    const validation = errors && typeof errors === "object" ? Object.values(errors).filter(Boolean).join(" ") : "";
    return validation ? `Validation failed: ${validation}` : serverMessage || "The approval request is invalid. Check the IDs and decision.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to access or change approval records.";
  if (status === 404) return "The requested application, assessment, or approval was not found.";
  if (status === 409) return serverMessage || "An approval already exists or the decision conflicts with the current workflow.";
  if (status === 502 || status === 503) return "The approval or assessment service is temporarily unavailable. Try again shortly.";
  if (!status && typeof error.message === "string" && error.message.length <= 300) return error.message;
  return fallback;
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

function ReviewDrawer({ pending, reviewerEmail, onClose, onDone }) {
  const [review, setReview] = useState(null);
  const [alreadyDecided, setAlreadyDecided] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [decision, setDecision] = useState("APPROVED");
  const [remarks, setRemarks] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    let current = true;
    Promise.all([
      getAssessmentForApplication(pending.applicationId),
      getApprovalForApplication(pending.applicationId).catch((failure) => {
        if (failure.response?.status === 404) return null;
        throw failure;
      }),
    ])
      .then(([assessment, existingApproval]) => {
        if (!current) return;
        if (assessment?.status !== "ELIGIBLE") {
          setError("This application no longer has an eligible assessment. Refresh the approval list.");
          return;
        }
        setReview(assessment);
        setAlreadyDecided(Boolean(existingApproval));
      })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load the credit assessment.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [pending.applicationId, attempt]);

  async function submit(event) {
    event.preventDefault();
    setSaveError("");
    if (!reviewerEmail?.trim()) {
      setSaveError("Your signed-in account does not include a reviewer email.");
      return;
    }
    if (!review?.creditAssessmentId) {
      setSaveError("The credit assessment ID is unavailable. Refresh the approval list.");
      return;
    }
    setSaving(true);
    try {
      await createApproval({
        applicationId: Number(pending.applicationId),
        creditAssessmentId: Number(review.creditAssessmentId),
        decision,
        reviewedBy: reviewerEmail.trim(),
        remarks: remarks.trim() || undefined,
      });
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
    {!loading && alreadyDecided && <div className="inline-error" role="alert">A decision already exists for this application. Refresh the approval list.</div>}
    {!loading && !error && !alreadyDecided && <form className="form-grid" onSubmit={submit}>
      {saveError && <div className="inline-error" role="alert">{saveError}</div>}
      {!reviewerEmail && <div className="inline-error" role="alert">Your signed-in account does not include a reviewer email.</div>}
      <label className="field"><span>Decision</span><select value={decision} onChange={(event) => setDecision(event.target.value)} disabled={saving}><option value="APPROVED">Approve</option><option value="REJECTED">Reject</option></select></label>
      <label className="field"><span>Remarks (optional)</span><textarea rows="4" maxLength="500" value={remarks} onChange={(event) => setRemarks(event.target.value)} disabled={saving} /></label>
      <div className="finance-actions">
        <button className="button button-secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button>
        <button className={`button ${approving ? "button-primary" : "button-danger"}`} type="submit" disabled={saving || !reviewerEmail?.trim()}>{approving ? <Check size={16} /> : <X size={16} />}{saving ? "Submitting..." : approving ? "Approve" : "Reject"}</button>
      </div>
    </form>}
  </DetailDialog>;
}

export default function ApprovalsWorkspace({ isAdmin, canCreate = false, reviewerEmail = "", queueOnly = false }) {
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
  const [feedback, setFeedback] = useState("");
  const [selectedApproval, setSelectedApproval] = useState(null);

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
    Promise.all([listCreditAssessments(), listApprovals()])
      .then(([assessmentResponse, approvalResponse]) => {
        const assessments = records(assessmentResponse);
        const decisions = records(approvalResponse);
        const decidedApplications = new Set(decisions.map((item) => String(item.applicationId)));
        if (current) setPending(assessments.filter((item) => item.status === "ELIGIBLE" && !decidedApplications.has(String(item.applicationId))));
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

  const needsLookup = ["APPROVAL_ID", "APPLICATION_ID", "REVIEWER"].includes(filter);
  const lookupLabel = filter === "REVIEWER" ? "Reviewer email" : filter === "APPLICATION_ID" ? "Application ID" : "Approval ID";
  const canRecord = canCreate && Boolean(reviewerEmail?.trim());

  return <div className="page-stack">
    {feedback && <div className="inline-message" role="status">{feedback}</div>}
    {selectedApproval && <ApprovalDetails approval={selectedApproval} onClose={() => setSelectedApproval(null)} />}
    {reviewTarget && canRecord && <ReviewDrawer key={reviewTarget.applicationId} pending={reviewTarget} reviewerEmail={reviewerEmail} onClose={() => setReviewTarget(null)} onDone={reviewDone} />}
    <section className="panel">
      <div className="panel-heading"><h2>Pending approvals</h2><div className="workspace-tools"><button className="icon-button" type="button" aria-label="Refresh pending approvals" title="Refresh pending approvals" disabled={pendingLoading} onClick={refreshPending}><RefreshCw size={17} /></button></div></div>
      {pendingLoading ? <p role="status">Loading eligible assessments...</p> : pendingError ? <div className="inline-error" role="alert">{pendingError}<button className="button button-secondary small-button" type="button" onClick={refreshPending}>Retry</button></div> : pending.length === 0 ? <p>No eligible assessments without an approval decision.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Application ID</th><th>Assessment ID</th><th>Assessment status</th><th>Assessment reason</th><th>Assessed by</th>{canRecord && <th>Action</th>}</tr></thead>
        <tbody>{pending.map((item) => <tr key={item.applicationId}>
          <td>{item.applicationId}</td><td>{item.creditAssessmentId ?? "-"}</td><td><span className="status-badge">{item.status?.replaceAll("_", " ") ?? "-"}</span></td><td>{item.reason ?? "-"}</td><td>{item.assessedBy ?? "-"}</td>
          {canRecord && <td><button className="button button-primary small-button" type="button" onClick={() => { setFeedback(""); setReviewTarget(item); }}><ClipboardCheck size={14} /> Review</button></td>}
        </tr>)}</tbody>
      </table></div>}
    </section>
    {!queueOnly && <section className="panel">
      <div className="panel-heading"><div><h2>Approval history</h2>{canCreate && !canRecord && <p>Decision creation is unavailable because the signed-in account has no email.</p>}</div><div className="workspace-tools"><button className="icon-button" type="button" aria-label="Refresh approvals" title="Refresh approvals" disabled={loading} onClick={refresh}><RefreshCw size={17} /></button></div></div>
      <form className="finance-toolbar" onSubmit={search}>
        <label className="field"><span>Find decisions</span><select value={filter} onChange={(event) => { setFilter(event.target.value); setLookup(""); }}>
          <option value="ALL">All decisions</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="APPROVAL_ID">By approval ID</option><option value="APPLICATION_ID">By application ID</option>{isAdmin && <option value="REVIEWER">By reviewer</option>}
        </select></label>
        {needsLookup && <label className="field"><span>{lookupLabel}</span><input type={filter === "REVIEWER" ? "email" : "number"} min={filter === "REVIEWER" ? undefined : "1"} step={filter === "REVIEWER" ? undefined : "1"} required value={lookup} onChange={(event) => setLookup(event.target.value)} /></label>}
        <button className="button button-secondary" type="submit" disabled={loading}>Search</button>
      </form>
      {loading ? <p role="status">Loading approvals...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" type="button" onClick={refresh}>Retry</button></div> : approvals.length === 0 ? <p>No decisions found.</p> : <div className="table-wrap"><table>
        <thead><tr><th>Approval ID</th><th>Application ID</th><th>Credit assessment ID</th><th>Decision</th><th>Reviewer</th><th>Remarks</th><th>Decision date</th><th>Action</th></tr></thead>
        <tbody>{approvals.map((approval, index) => <tr key={approval.approvalId ?? index} onClick={() => setSelectedApproval(approval)}>
          <td>{approval.approvalId ?? "-"}</td><td>{approval.applicationId ?? "-"}</td><td>{approval.creditAssessmentId ?? "-"}</td><td>{approval.decision ?? "-"}</td><td>{approval.reviewedBy ?? "-"}</td><td>{approval.remarks ?? "-"}</td><td>{approval.decisionDate ?? "-"}</td><td><button className="text-link" type="button" aria-label={`View approval ${approval.approvalId ?? index + 1}`} onClick={(event) => { event.stopPropagation(); setSelectedApproval(approval); }}><Eye size={14} /> Details</button></td>
        </tr>)}</tbody>
      </table></div>}
    </section>}
  </div>;
}
