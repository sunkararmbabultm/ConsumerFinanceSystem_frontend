import { Fragment, useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowRight, Check, ChevronLeft, ChevronRight, Eye, EyeOff, FileText, RefreshCw, Search, ShieldCheck, Users, X } from "lucide-react";
import { useAuth } from "../context/useAuth";
import { ApplicationDetails, DetailDialog, LoanProductsWorkspace, ProductDetails } from "../components/FinanceWorkspace";
import ApprovalsWorkspace from "../components/ApprovalsWorkspace";
import CreditAssessmentsWorkspace, { StaffApplicationQueueWorkspace } from "../components/CreditAssessmentsWorkspace";
import { AdminNotificationWorkspace, CustomerEmiWorkspace, CustomerNotificationsWorkspace, CustomerRepaymentsWorkspace, DisbursementsWorkspace } from "../components/LoanServicingWorkspaces";
import AdminEmiManagementWorkspace from "../components/AdminEmiManagementWorkspace";
import { createApproval } from "../services/approvalService";
import { getAssessmentForApplication } from "../services/creditAssessmentService";
import { createInternalUser } from "../services/authService";
import { createCustomer, createCustomerAddress, createCustomerBankAccount, createCustomerDocument, createCustomerEmployment, getCustomerByUserId, getCustomerAddresses, getCustomerEmployment, getCustomerBankAccounts, getCustomerDocuments, getCustomerOnboardingStatus, requestCustomerKycReview } from "../services/customerService";
import { createDraftFinanceApplication, listLoanProducts, listWorkspaceApplications, submitFinanceApplication } from "../services/financeApplicationService";
import { markNotificationRead as updateNotificationRead } from "../services/notificationService";
import { getAdminKycDetails, listAdminKycRecords, rejectCustomerKyc, verifyCustomerKyc } from "../services/kycService";

const titles = {
  profile: "My profile", apply: "Apply for finance", applications: "My applications", disbursement: "Disbursement",
  emi: "EMI schedule", repayments: "Repayment history", notifications: "Notifications", settings: "Settings",
  "review-queue": "Finance application review", customers: "Customers", approvals: "Approval history", users: "Internal users",
  assessments: "Credit assessments", decisions: "Decision queue", kyc: "KYC review", "loan-products": "Loan products",
};

const requiredDocumentTypes = ["PAN", "IDENTITY_PROOF", "ADDRESS_PROOF", "SALARY_SLIP", "BANK_STATEMENT"];

function unwrap(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.content)) return data.content;
  if (Array.isArray(data?.data)) return data.data;
  for (const key of ["products", "loanProducts", "applications", "customers", "notifications", "approvals", "disbursements", "emiSchedule", "schedules", "repayments", "items"]) if (Array.isArray(data?.[key])) return data[key];
  return [];
}

function recordsOrOne(data) {
  const records = unwrap(data);
  return records.length || !data || typeof data !== "object" || Array.isArray(data) ? records : [data];
}

function getValue(record, keys) {
  for (const key of keys) if (record?.[key] !== null && record?.[key] !== undefined) return record[key];
  return "—";
}

async function toApprovalRequest(application, decision, remarks, reviewedBy) {
  const applicationId = application.applicationId ?? application.id;
  if (!applicationId) {
    throw new Error("An application ID is required to record a decision.");
  }
  const creditAssessmentId = application.creditAssessmentId
    ?? (await getAssessmentForApplication(applicationId))?.creditAssessmentId;
  if (!creditAssessmentId) {
    throw new Error("A credit assessment is required before recording a decision.");
  }
  if (!reviewedBy?.trim()) {
    throw new Error("Your signed-in account does not include a reviewer email.");
  }
  return {
    applicationId,
    creditAssessmentId,
    decision,
    reviewedBy: reviewedBy.trim(),
    remarks: remarks.trim() || undefined,
  };
}

function DataWorkspace({ section, isAdmin, user }) {
  const [data, setData] = useState([]);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [productFilter, setProductFilter] = useState("ALL");
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [detailsId, setDetailsId] = useState(null);
  const [decisionReason, setDecisionReason] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [feedback, setFeedback] = useState("");

  const hasService = section === "applications" && !isAdmin;
  const [loading, setLoading] = useState(hasService);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    if (!hasService) return undefined;
    let current = true;
    async function fetchRecords() {
      try {
        const response = await listWorkspaceApplications(false, user?.id);
        if (current) setData(unwrap(response));
      } catch {
        if (current) setError(`Unable to load ${titles[section]?.toLowerCase() || "this information"}.`);
      } finally {
        if (current) setLoading(false);
      }
    }
    fetchRecords();
    return () => { current = false; };
  }, [hasService, isAdmin, section, user?.id, retryCount]);

  function retryLoad() {
    setLoading(true);
    setError("");
    setRetryCount((count) => count + 1);
  }

  const applicationStatuses = [...new Set(data.map((record) => String(record.status || record.applicationStatus || "").toUpperCase()).filter(Boolean))];
  const applicationProducts = [...new Set(data.map((record) => String(record.productType || record.product || "")).filter(Boolean))];
  const visibleData = data
    .filter((record) => section !== "review-queue" || ["SUBMITTED", "UNDER_REVIEW", "PENDING"].includes(String(record.status || record.applicationStatus || "").toUpperCase()))
    .filter((record) => statusFilter === "ALL" || String(record.status || record.applicationStatus || "").toUpperCase() === statusFilter)
    .filter((record) => productFilter === "ALL" || String(record.productType || record.product || "") === productFilter)
    .filter((record) => JSON.stringify(record).toLowerCase().includes(query.toLowerCase()));
  const columns = section === "customers"
    ? [{ title: "Customer ID", keys: ["customerId", "id"] }, { title: "Name", keys: ["fullName", "name"] }, { title: "Email", keys: ["email"] }, { title: "Phone", keys: ["phoneNumber", "phone"] }, { title: "KYC", keys: ["kycStatus"] }, { title: "Account", keys: ["accountStatus", "status"] }]
    : section === "approvals"
      ? [{ title: "Application ID", keys: ["applicationId"] }, { title: "Customer", keys: ["customerName"] }, { title: "Decision", keys: ["status", "decision"] }, { title: "Reason", keys: ["remarks", "decisionReason", "reason"] }, { title: "Reviewer", keys: ["reviewedBy", "reviewerName", "reviewer"] }, { title: "Decision date", keys: ["decisionDate", "createdAt"] }]
      : section === "notifications"
        ? [{ title: "Notification", keys: ["message", "title", "type"] }, { title: "Date", keys: ["createdAt", "timestamp"] }, { title: "Status", keys: ["status", "readStatus"] }]
        : [{ title: "Application", keys: ["applicationNumber", "applicationId", "id"] }, ...(isAdmin ? [{ title: "Customer", keys: ["customerName", "customerFullName"] }] : []), { title: "Product", keys: ["productName", "productType", "product"] }, { title: "Amount", keys: ["requestedAmount", "amount"] }, { title: "Date", keys: ["submittedAt", "createdAt"] }, { title: "Status", keys: ["status", "applicationStatus"] }];

  async function decide(decision) {
    if (decision === "REJECTED" && !decisionReason.trim()) {
      setActionError("A reason is required when rejecting an application.");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      const approval = await toApprovalRequest(selectedApplication, decision, decisionReason, user?.email);
      await createApproval(approval);
      const selectedId = selectedApplication.applicationId || selectedApplication.id;
      setData((current) => current.filter((record) => (record.applicationId || record.id) !== selectedId));
      setFeedback(`Application ${decision.toLowerCase()} successfully.`);
      setSelectedApplication(null);
      setDecisionReason("");
    } catch (requestError) {
      setActionError(kycRequestError(requestError, "The decision could not be recorded. Please try again."));
    } finally {
      setActionLoading(false);
    }
  }

  async function markNotificationRead(notification) {
    const id = notification.notificationId || notification.id;
    if (!id) return;
    try {
      await updateNotificationRead(id);
      setData((current) => current.map((record) => (record.notificationId || record.id) === id ? { ...record, status: "READ", readStatus: "READ", read: true } : record));
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to update this notification.");
    }
  }

  async function markAllNotificationsRead() {
    const unread = data.filter((record) => !["READ", "TRUE"].includes(String(record.status || record.readStatus || record.read || "").toUpperCase()));
    await Promise.all(unread.map((record) => markNotificationRead(record)));
  }

  return (
    <section className="panel data-panel">
      <div className="panel-heading"><div><h2>{titles[section]}</h2><p>{section === "review-queue" ? "Only applications awaiting a decision are shown." : "Records provided by your finance services"}</p></div><div className="workspace-tools">{section === "notifications" && <button className="button button-secondary small-button" type="button" onClick={markAllNotificationsRead}>Mark all read</button>}<label className="table-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search records" aria-label="Search records" /></label></div></div>
      {feedback && <div className="inline-message" role="status">{feedback}</div>}
      {(["applications", "review-queue"].includes(section)) && <div className="filter-row"><label className="field"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{applicationStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><label className="field"><span>Product</span><select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="ALL">All products</option>{applicationProducts.map((product) => <option key={product} value={product}>{product.replaceAll("_", " ")}</option>)}</select></label></div>}
      {error && <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary small-button" onClick={retryLoad}><RefreshCw size={14} /> Retry</button></div>}
      {loading ? <div className="table-placeholder"><span className="spinner" />Loading records</div> : !error && visibleData.length === 0 ? <div className="empty-state"><span className="empty-icon"><FileText size={20} /></span><strong>{query || statusFilter !== "ALL" || productFilter !== "ALL" ? "No matching records" : "Nothing to show yet"}</strong><p>{query || statusFilter !== "ALL" || productFilter !== "ALL" ? "Try changing your search or filters." : "When records are available, they will appear here."}</p></div> : !error && <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.title}>{column.title}</th>)}{section === "applications" && <th>Action</th>}{isAdmin && section === "review-queue" && <th>Action</th>}{section === "notifications" && <th>Action</th>}</tr></thead><tbody>{visibleData.map((record, index) => <tr key={record.id || record.applicationId || index}>{columns.map((column) => <td key={column.title}>{String(getValue(record, column.keys))}</td>)}{section === "applications" && <td><button className="text-link" type="button" onClick={() => setDetailsId(record.applicationId ?? record.id)}><Eye size={14} /> Details</button></td>}{isAdmin && section === "review-queue" && <td><button className="text-link" type="button" onClick={() => { setSelectedApplication(record); setDecisionReason(""); setActionError(""); }}>Review <ArrowRight size={14} /></button></td>}{section === "notifications" && <td>{String(record.status || record.readStatus || "").toUpperCase() !== "READ" && <button className="text-link" type="button" onClick={() => markNotificationRead(record)}>Mark read</button>}</td>}</tr>)}</tbody></table></div>}
      {selectedApplication && <div className="modal-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="review-dialog-title"><div className="modal-heading"><div><p className="eyebrow">APPLICATION DECISION</p><h2 id="review-dialog-title">Review application</h2></div><button className="icon-button" type="button" aria-label="Close dialog" onClick={() => setSelectedApplication(null)}><X size={18} /></button></div><div className="review-summary"><div><span>Application</span><strong>{selectedApplication.applicationId || selectedApplication.id || "—"}</strong></div><div><span>Customer</span><strong>{selectedApplication.customerName || selectedApplication.customerFullName || "—"}</strong></div><div><span>Requested amount</span><strong>{selectedApplication.requestedAmount ?? "—"}</strong></div><div><span>Product</span><strong>{selectedApplication.productType || selectedApplication.product || "—"}</strong></div></div>{actionError && <div className="form-alert error" role="alert">{actionError}</div>}<label className="field"><span>Rejection reason (required to reject)</span><textarea rows="3" value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Explain the decision for the applicant" /></label><p className="modal-note">Approving or rejecting records a decision through the approval service.</p><div className="modal-actions"><button className="button button-secondary" type="button" disabled={actionLoading} onClick={() => setSelectedApplication(null)}>Cancel</button><button className="button button-danger" type="button" disabled={actionLoading} onClick={() => decide("REJECTED")}>{actionLoading ? "Saving…" : "Reject"}</button><button className="button button-primary" type="button" disabled={actionLoading} onClick={() => decide("APPROVED")}>{actionLoading ? "Saving…" : "Approve"}</button></div></section></div>}
    {detailsId != null && <ApplicationDetails key={detailsId} applicationId={detailsId} canSubmit={!isAdmin} onClose={() => setDetailsId(null)} onSubmitted={retryLoad} />}
    </section>
  );
}

function ApplyFinance({ user }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ productId: "", requestedAmount: "", requestedTenureMonths: "", loanPurpose: "" });
  const [loading, setLoading] = useState(false);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [products, setProducts] = useState([]);
  const [productDetailsId, setProductDetailsId] = useState(null);
  const [customerId, setCustomerId] = useState("");
  const [onboarding, setOnboarding] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const steps = ["Product", "Finance details", "Review"];

  useEffect(() => {
    let current = true;
    async function loadOptions() {
      const [productsResult, customerResult] = await Promise.allSettled([
        listLoanProducts(),
        getCustomerByUserId(user?.id),
      ]);
      if (!current) return;
      if (productsResult.status === "fulfilled") {
        setProducts(unwrap(productsResult.value).filter((product) => product.active !== false));
      } else {
        setError("Unable to load available finance products.");
      }
      if (customerResult.status === "fulfilled") {
        const profile = customerResult.value;
        setCustomerId(profile.customerId || "");
        if (profile.customerId) {
          try {
            setOnboarding(await getCustomerOnboardingStatus(profile.customerId));
          } catch {
            setOnboarding(null);
          }
        }
      } else {
        setError("Create a customer profile before applying for finance.");
      }
      if (current) setLoadingOptions(false);
    }
    loadOptions();
    return () => { current = false; };
  }, [user?.id, user?.email]);

  function change(event) { setForm((current) => ({ ...current, [event.target.name]: event.target.value })); }
  function next() {
    const required = step === 0 ? ["productId"] : ["requestedAmount", "requestedTenureMonths", "loanPurpose"];
    const missing = required.some((field) => !form[field].trim());
    if (missing) { setError("Complete the required fields before continuing."); return; }
    if (step === 1 && (!Number.isFinite(Number(form.requestedAmount)) || Number(form.requestedAmount) <= 0 || !Number.isInteger(Number(form.requestedTenureMonths)) || Number(form.requestedTenureMonths) < 1)) {
      setError("Enter a positive amount and a whole number of months.");
      return;
    }
    setError("");
    setStep((current) => Math.min(current + 1, steps.length - 1));
  }
  function requestPayload() {
    return {
      customerId: Number(customerId),
      productId: Number(form.productId),
      requestedAmount: Number(form.requestedAmount),
      requestedTenureMonths: Number(form.requestedTenureMonths),
      loanPurpose: form.loanPurpose.trim(),
    };
  }
  async function saveDraft() {
    setError("");
    setLoading(true);
    try {
      const draft = await createDraftFinanceApplication(requestPayload());
      setResult({ id: draft?.applicationNumber || draft?.applicationId || "—", status: "DRAFT" });
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to save your draft. Please try again.");
    } finally { setLoading(false); }
  }

  async function submit() {
    if (!customerId) {
      setError("A customer profile is required before you can submit an application.");
      return;
    }
    if (onboarding?.onboardingStatus !== "COMPLETED" || onboarding?.kycStatus !== "VERIFIED") {
      setError("Complete customer onboarding and verify KYC before submitting. You can save this as a draft.");
      return;
    }
    setError("");
    setLoading(true);
    let draft;
    try {
      draft = await createDraftFinanceApplication(requestPayload());
      const submitted = await submitFinanceApplication(draft.applicationId);
      setResult({ id: submitted?.applicationNumber || draft?.applicationNumber || submitted?.applicationId || draft?.applicationId || "—", status: "SUBMITTED" });
    } catch (requestError) {
      const detail = requestError.response?.data?.message || "Please try again.";
      if (draft) setResult({ id: draft.applicationNumber || draft.applicationId, status: "DRAFT", warning: `Your draft was saved, but submission failed: ${detail} Open its details in My applications to retry submission.` });
      else setError(detail);
    } finally { setLoading(false); }
  }

  if (result) return <section className="panel success-panel"><span className="success-mark"><Check size={23} /></span><p className="eyebrow">{result.status === "DRAFT" ? "DRAFT SAVED" : "APPLICATION RECEIVED"}</p><h2>{result.status === "DRAFT" ? "Your draft is saved" : "Application submitted successfully"}</h2>{result.warning && <div className="form-alert error" role="alert">{result.warning}</div>}<p>Application reference: <strong>{result.id}</strong>. You can follow its progress in My applications.</p><Link className="button button-primary" to="/customer/applications">View applications <ArrowRight size={16} /></Link></section>;

  return <div className="apply-layout"><aside className="apply-guidance" aria-labelledby="apply-guidance-title"><FileText size={20} aria-hidden="true" /><div><h3 id="apply-guidance-title">Before you begin</h3><p>Submission requires a completed customer profile and verified KYC. The selected product and request details will be reviewed before submission. A draft is created first, then submitted to the Finance Application Service.</p></div></aside><section className="panel apply-panel"><div className="panel-heading"><div><h2>Finance application</h2><p>Tell us a little about what you need.</p></div><span className="step-count">Step {step + 1} of {steps.length}</span></div><div className="stepper">{steps.map((label, index) => <div key={label} className={`step-item ${index === step ? "current" : ""} ${index < step ? "complete" : ""}`}><span>{index < step ? <Check size={14} /> : index + 1}</span><small>{label}</small></div>)}</div>
    {error && <div className="form-alert error" role="alert">{error}</div>}
    {loadingOptions ? <div className="table-placeholder"><span className="spinner" />Loading products and customer profile</div> : <>
      {onboarding && onboarding.onboardingStatus !== "COMPLETED" && <div className="form-alert error" role="status">Complete customer onboarding and KYC before submission. You can save a draft now.</div>}
      {step === 0 && <div className="form-grid"><label className="field"><span>Finance product</span><select name="productId" value={form.productId} onChange={change} required><option value="">Choose an active product</option>{products.map((product) => <option key={product.productId} value={product.productId}>{product.productName} ({product.productCode})</option>)}</select></label>{products.length === 0 && !error && <p className="field-hint">No active finance products are currently available.</p>}</div>}
      {step === 0 && form.productId && <button type="button" className="text-link" onClick={() => setProductDetailsId(form.productId)}><Eye size={14} /> View product details</button>}
      {productDetailsId != null && <ProductDetails key={productDetailsId} productId={productDetailsId} onClose={() => setProductDetailsId(null)} />}
      {step === 1 && <div className="form-grid two-columns"><label className="field"><span>Requested amount</span><input name="requestedAmount" type="number" min="1" value={form.requestedAmount} onChange={change} required /></label><label className="field"><span>Requested tenure (months)</span><input name="requestedTenureMonths" type="number" min="1" value={form.requestedTenureMonths} onChange={change} required /></label><label className="field field-wide"><span>Loan purpose</span><textarea name="loanPurpose" rows="3" value={form.loanPurpose} onChange={change} required /></label></div>}
      {step === 2 && <div className="review-list">{[["Product", products.find((product) => String(product.productId) === form.productId)?.productName || "—"], ["Requested amount", form.requestedAmount], ["Requested tenure", `${form.requestedTenureMonths} months`], ["Loan purpose", form.loanPurpose], ["Customer ID", customerId || "—"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || "—"}</strong></div>)}</div>}
    </>}
    <div className="form-actions">{step > 0 && <button className="button button-secondary" onClick={() => { setError(""); setStep((current) => current - 1); }}><ChevronLeft size={16} /> Previous</button>}<span />{step < steps.length - 1 ? <button className="button button-primary" onClick={next} disabled={loadingOptions || !customerId || products.length === 0}>Continue <ChevronRight size={16} /></button> : <><button className="button button-secondary" onClick={saveDraft} disabled={loading || !customerId}>{loading ? <span className="spinner" /> : null}Save draft</button><button className="button button-primary" onClick={submit} disabled={loading || !customerId || onboarding?.onboardingStatus !== "COMPLETED" || onboarding?.kycStatus !== "VERIFIED"}>{loading ? <><span className="spinner" />Submitting</> : "Submit application"}</button></>}</div>
  </section></div>;
}

function ProfilePage({ user }) {
  const customerName = (user?.name || "").trim().split(/\s+/);
  const [profile, setProfile] = useState(null);
  const [profileMissing, setProfileMissing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(Boolean(user?.id));
  const [retryCount, setRetryCount] = useState(0);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState(user?.id ? "" : "Your login did not include a user ID, so a customer profile cannot be linked.");
  const [message, setMessage] = useState("");
  const [profileForm, setProfileForm] = useState({ firstName: customerName[0] || "", lastName: customerName.slice(1).join(" "), dateOfBirth: "", mobileNumber: "", panNumber: "" });
  const [addressForm, setAddressForm] = useState({ addressType: "CURRENT", addressLine1: "", addressLine2: "", city: "", state: "", pincode: "", country: "India" });
  const [employmentForm, setEmploymentForm] = useState({ employmentType: "SALARIED", employerName: "", designation: "", monthlyIncome: "", existingMonthlyEmi: "", workExperienceMonths: "" });
  const [bankForm, setBankForm] = useState({ accountHolderName: "", bankName: "", accountNumber: "", ifscCode: "", accountType: "SAVINGS", primaryAccount: true });
  const [documentForm, setDocumentForm] = useState({ documentType: "PAN", fileName: "", filePath: "" });
  const [documentInputKey, setDocumentInputKey] = useState(0);

  useEffect(() => {
    if (!user?.id) return undefined;
    let current = true;
    async function loadProfile() {
      setLoading(true);
      setError("");
      try {
        const customer = await getCustomerByUserId(user.id);
        const [addressesResult, employmentResult, banksResult, documentsResult, onboardingResult] = await Promise.allSettled([
          getCustomerAddresses(customer.customerId),
          getCustomerEmployment(customer.customerId),
          getCustomerBankAccounts(customer.customerId),
          getCustomerDocuments(customer.customerId),
          getCustomerOnboardingStatus(customer.customerId),
        ]);
        const address = addressesResult.status === "fulfilled" ? recordsOrOne(addressesResult.value)[0] || {} : {};
        const employment = employmentResult.status === "fulfilled" ? recordsOrOne(employmentResult.value)[0] || {} : {};
        const bank = banksResult.status === "fulfilled" ? recordsOrOne(banksResult.value)[0] || {} : {};
        const documents = documentsResult.status === "fulfilled" ? recordsOrOne(documentsResult.value) : [];
        const documentTypes = documents.map((document) => document.documentType).filter(Boolean);
        const allDocumentsSaved = requiredDocumentTypes.every((type) => documentTypes.includes(type));
        const onboarding = onboardingResult.status === "fulfilled" ? onboardingResult.value : {};
        const accountNumber = bank.accountNumber ? String(bank.accountNumber) : "";
        if (current) {
          setProfile({
            ...customer,
            fullName: [customer.firstName, customer.lastName].filter(Boolean).join(" "),
            email: user.email || "",
            addressLine: [address.addressLine1, address.addressLine2].filter(Boolean).join(", "),
            city: address.city || "", state: address.state || "", pinCode: address.pincode || "",
            employmentType: employment.employmentType || "", employerName: employment.employerName || "",
            monthlyIncome: employment.monthlyIncome ?? "",
            bankAccount: accountNumber ? `Ending in ${accountNumber.slice(-4)}` : "",
            bankHolder: bank.accountHolderName || "", documentCount: documents.length,
            documentTypes,
            kycStatus: customer.kycStatus || onboarding.kycStatus || "PENDING",
            onboardingStatus: onboarding.onboardingStatus || customer.onboardingStatus || "—",
            addressCompleted: Boolean(onboarding.addressCompleted || address.addressId),
            employmentCompleted: Boolean(onboarding.employmentCompleted || employment.employmentId),
            bankCompleted: Boolean(onboarding.bankCompleted || bank.bankAccountId),
            documentsCompleted: allDocumentsSaved,
          });
          const nextDocumentType = requiredDocumentTypes.find((type) => !documentTypes.includes(type)) || requiredDocumentTypes[0];
          setDocumentForm((current) => ({ ...current, documentType: nextDocumentType, fileName: "", filePath: "" }));
          setDocumentInputKey((key) => key + 1);
          const completion = [
            Boolean(onboarding.addressCompleted || address.addressId),
            Boolean(onboarding.employmentCompleted || employment.employmentId),
            Boolean(onboarding.bankCompleted || bank.bankAccountId),
            allDocumentsSaved,
            String(customer.kycStatus || onboarding.kycStatus || "").toUpperCase() === "VERIFIED",
          ];
          const nextStep = completion.findIndex((isComplete) => !isComplete);
          setActiveStep(nextStep === -1 ? completion.length : nextStep);
          setProfileMissing(false);
        }
      } catch (requestError) {
        if (current && requestError.response?.status === 404) {
          setProfile(null);
          setProfileMissing(true);
        } else if (current) {
          setError(requestError.response?.data?.message || "Unable to load your customer profile.");
        }
      } finally {
        if (current) setLoading(false);
      }
    }
    loadProfile();
    return () => { current = false; };
  }, [user?.id, user?.email, retryCount]);

  function updateForm(setForm) {
    return (event) => {
      const { name, value, checked, type } = event.target;
      setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
    };
  }

  async function createProfile(event) {
    event.preventDefault();
    setSaving("profile");
    setError("");
    setMessage("");
    try {
      await createCustomer({
        userId: /^\d+$/.test(String(user.id)) ? Number(user.id) : user.id,
        firstName: profileForm.firstName.trim(),
        lastName: profileForm.lastName.trim(),
        dateOfBirth: profileForm.dateOfBirth,
        mobileNumber: profileForm.mobileNumber.trim(),
        panNumber: profileForm.panNumber.trim().toUpperCase(),
      });
      setMessage("Customer profile created. Continue with the onboarding sections below.");
      setProfileMissing(false);
      setRetryCount((count) => count + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create the customer profile.");
    } finally {
      setSaving("");
    }
  }

  async function saveOnboardingSection(sectionName, action) {
    setSaving(sectionName);
    setError("");
    setMessage("");
    try {
      const response = await action();
      if (sectionName === "KYC review") {
        const kycStatus = response?.kycStatus || "UNDER_REVIEW";
        setProfile((current) => current ? {
          ...current,
          kycStatus,
          onboardingStatus: response?.onboardingStatus || current.onboardingStatus,
        } : current);
        setMessage(`KYC status: ${String(kycStatus).replaceAll("_", " ")}. Your profile and onboarding status have been refreshed.`);
        setActiveStep(5);
      } else if (sectionName === "Document metadata") {
        const nextDocument = requiredDocumentTypes.find((type) => type !== documentForm.documentType && !profile?.documentTypes?.includes(type));
        setMessage(`${documentForm.documentType.replaceAll("_", " ")} metadata saved. ${nextDocument ? "Select the next required document to continue." : "Checking required document records…"} File contents are not uploaded by this API.`);
        setActiveStep(3);
        setDocumentInputKey((key) => key + 1);
      } else {
        setMessage(`${sectionName} saved successfully.`);
        const stepBySection = { Address: 0, "Employment details": 1, "Bank account": 2 };
        setActiveStep(Math.min((stepBySection[sectionName] ?? activeStep) + 1, 5));
      }
      setRetryCount((count) => count + 1);
    } catch (requestError) {
      setError(requestError.response?.data?.message || `Unable to save ${sectionName.toLowerCase()}.`);
    } finally {
      setSaving("");
    }
  }

  const customerId = profile?.customerId;
  const kycComplete = String(profile?.kycStatus || "").toUpperCase() === "VERIFIED";
  const kycSubmitted = ["UNDER_REVIEW", "VERIFIED"].includes(String(profile?.kycStatus || "").toUpperCase());
  const stepComplete = [profile?.addressCompleted, profile?.employmentCompleted, profile?.bankCompleted, profile?.documentsCompleted, kycComplete];
  const onboardingSteps = ["Address", "Employment", "Bank account", "Documents", "KYC review"];
  const completedSteps = stepComplete.filter(Boolean).length;
  const completionPercent = Math.round(completedSteps / onboardingSteps.length * 100);

  return <div className="profile-page">
    {error && <div className="form-alert error" role="alert">{error} {error.includes("Unable to load") && <button className="text-link" type="button" onClick={() => setRetryCount((count) => count + 1)}>Retry</button>}</div>}
    {message && <div className="inline-message" role="status">{message}</div>}
    {loading ? <section className="panel"><div className="table-placeholder"><span className="spinner onboarding-spinner" />Loading your profile and onboarding status</div></section> : profileMissing ? <section className="panel onboarding-panel">
      <div className="panel-heading"><div><h2>Create customer profile</h2><p>This profile is linked to your authenticated user account.</p></div></div>
      <form className="form-grid two-columns" onSubmit={createProfile}>
        <label className="field"><span>First name</span><input name="firstName" value={profileForm.firstName} onChange={updateForm(setProfileForm)} autoComplete="given-name" required /></label>
        <label className="field"><span>Last name</span><input name="lastName" value={profileForm.lastName} onChange={updateForm(setProfileForm)} autoComplete="family-name" required /></label>
        <label className="field"><span>Date of birth</span><input name="dateOfBirth" type="date" value={profileForm.dateOfBirth} onChange={updateForm(setProfileForm)} required /></label>
        <label className="field"><span>Mobile number</span><input name="mobileNumber" type="tel" value={profileForm.mobileNumber} onChange={updateForm(setProfileForm)} autoComplete="tel" required /></label>
        <label className="field field-wide"><span>PAN number</span><input name="panNumber" value={profileForm.panNumber} onChange={updateForm(setProfileForm)} autoCapitalize="characters" required /></label>
        <div className="field-wide admin-user-actions"><button className="button button-primary" type="submit" disabled={saving === "profile"}>{saving === "profile" ? <><span className="spinner" />Creating profile</> : "Create profile"}</button></div>
      </form>
    </section> : profile && <>
      <section className="panel profile-panel profile-overview">
        <div className="panel-heading"><div><h2>{profile.fullName || "Customer profile"}</h2><p>{profile.customerNumber || `Customer ID ${profile.customerId}`}</p></div><span className={`status-badge status-${String(profile.kycStatus || "pending").toLowerCase().replaceAll("_", "-")}`}>KYC {String(profile.kycStatus || "PENDING").replaceAll("_", " ")}</span></div>
        <div className="profile-overview-details"><span>{profile.email || "Email not provided"}</span><span>{profile.mobileNumber || "Mobile not provided"}</span><span>{profile.dateOfBirth || "Date of birth not provided"}</span><span>Onboarding: {String(profile.onboardingStatus || "IN_PROGRESS").replaceAll("_", " ")}</span></div>
      </section>

      <section className="onboarding-flow">
        <div className="onboarding-flow-heading"><div><p className="eyebrow">CUSTOMER SETUP</p><h2>Profile and onboarding</h2></div><span className="step-count" role="status">{completedSteps} of {onboardingSteps.length} completed</span></div>
        <div className="onboarding-progress-summary"><label htmlFor="onboarding-progress">Onboarding progress</label><strong>{completionPercent}% complete</strong></div>
        <progress id="onboarding-progress" className="onboarding-progress" max={onboardingSteps.length} value={completedSteps} aria-valuetext={`${completedSteps} of ${onboardingSteps.length} sections completed`} />
        <nav className="onboarding-stepper" aria-label="Onboarding progress">
          {onboardingSteps.map((label, index) => {
            const isComplete = stepComplete[index];
            const isLocked = !isComplete && index > activeStep;
            return <Fragment key={label}><button className={`onboarding-step ${isComplete ? "complete" : "pending"} ${activeStep === index ? "active" : ""} ${isLocked ? "locked" : ""}`} type="button" disabled={isLocked} aria-current={activeStep === index ? "step" : undefined} onClick={() => setActiveStep(index)}><span className="onboarding-step-number">{isComplete ? <Check size={15} /> : index + 1}</span><span className="onboarding-step-label">{label}</span><span className="onboarding-step-state">{isComplete ? "Completed" : index === 4 && kycSubmitted ? "Pending review" : "Pending"}</span></button>{index < onboardingSteps.length - 1 && <span className={`onboarding-connector${isComplete && stepComplete[index + 1] ? " complete" : ""}`} aria-hidden="true" />}</Fragment>;
          })}
        </nav>

        {activeStep >= onboardingSteps.length ? <section className="panel onboarding-complete"><span className="success-mark"><Check size={23} /></span><div><h3>Onboarding details submitted</h3><p>KYC status: {String(profile.kycStatus || "PENDING").replaceAll("_", " ")}. Your information is now available to the finance service.</p></div></section> : <section className="panel onboarding-panel active-onboarding-panel">
          <div className="panel-heading"><div><p className="eyebrow">STEP {activeStep + 1}</p><h2>{onboardingSteps[activeStep]}</h2><p>{activeStep === 0 ? "Add your current or permanent address." : activeStep === 1 ? "Provide employment and income details." : activeStep === 2 ? "Add an account for finance servicing." : activeStep === 3 ? "Record document metadata for your KYC file." : "Send your onboarding information for KYC review."}</p></div>{saving && <span className="saving-indicator"><span className="spinner onboarding-spinner" />Saving</span>}</div>

          {activeStep === 0 && (stepComplete[0] ? <div className="saved-step-details"><strong>{profile.addressLine || "Address saved"}</strong><span>{[profile.city, profile.state, profile.pinCode].filter(Boolean).join(", ")}</span></div> : <form className="form-grid two-columns" onSubmit={(event) => { event.preventDefault(); saveOnboardingSection("Address", () => createCustomerAddress(customerId, { ...addressForm, pincode: addressForm.pincode.trim() })); }}>
        <label className="field"><span>Address type</span><select name="addressType" value={addressForm.addressType} onChange={updateForm(setAddressForm)}><option value="CURRENT">Current</option><option value="PERMANENT">Permanent</option></select></label>
        <label className="field"><span>Country</span><input name="country" value={addressForm.country} onChange={updateForm(setAddressForm)} required /></label>
        <label className="field field-wide"><span>Address line 1</span><input name="addressLine1" value={addressForm.addressLine1} onChange={updateForm(setAddressForm)} required /></label>
        <label className="field field-wide"><span>Address line 2</span><input name="addressLine2" value={addressForm.addressLine2} onChange={updateForm(setAddressForm)} /></label>
        <label className="field"><span>City</span><input name="city" value={addressForm.city} onChange={updateForm(setAddressForm)} required /></label>
        <label className="field"><span>State</span><input name="state" value={addressForm.state} onChange={updateForm(setAddressForm)} required /></label>
        <label className="field"><span>PIN code</span><input name="pincode" value={addressForm.pincode} onChange={updateForm(setAddressForm)} required /></label>
        <div className="field-wide onboarding-actions"><button className="button button-primary" disabled={Boolean(saving)}>{saving === "Address" ? "Saving address…" : "Save and continue"}</button></div>
      </form>)}

          {activeStep === 1 && (stepComplete[1] ? <div className="saved-step-details"><strong>{profile.employerName}</strong><span>{profile.employmentType} · Monthly income {profile.monthlyIncome}</span></div> : <form className="form-grid two-columns" onSubmit={(event) => { event.preventDefault(); saveOnboardingSection("Employment details", () => createCustomerEmployment(customerId, { ...employmentForm, monthlyIncome: Number(employmentForm.monthlyIncome), existingMonthlyEmi: Number(employmentForm.existingMonthlyEmi || 0), workExperienceMonths: Number(employmentForm.workExperienceMonths || 0) })); }}>
        <label className="field"><span>Employment type</span><select name="employmentType" value={employmentForm.employmentType} onChange={updateForm(setEmploymentForm)}><option value="SALARIED">Salaried</option><option value="SELF_EMPLOYED">Self-employed</option><option value="BUSINESS">Business owner</option><option value="OTHER">Other</option></select></label>
        <label className="field"><span>Employer name</span><input name="employerName" value={employmentForm.employerName} onChange={updateForm(setEmploymentForm)} required /></label>
        <label className="field"><span>Designation</span><input name="designation" value={employmentForm.designation} onChange={updateForm(setEmploymentForm)} required /></label>
        <label className="field"><span>Monthly income</span><input name="monthlyIncome" type="number" min="1" value={employmentForm.monthlyIncome} onChange={updateForm(setEmploymentForm)} required /></label>
        <label className="field"><span>Existing monthly EMI</span><input name="existingMonthlyEmi" type="number" min="0" value={employmentForm.existingMonthlyEmi} onChange={updateForm(setEmploymentForm)} /></label>
        <label className="field"><span>Work experience (months)</span><input name="workExperienceMonths" type="number" min="0" value={employmentForm.workExperienceMonths} onChange={updateForm(setEmploymentForm)} /></label>
        <div className="field-wide onboarding-actions"><button className="button button-primary" disabled={Boolean(saving)}>{saving === "Employment details" ? "Saving details…" : "Save and continue"}</button></div>
      </form>)}

          {activeStep === 2 && (stepComplete[2] ? <div className="saved-step-details"><strong>{profile.bankHolder || "Bank account saved"}</strong><span>{profile.bankAccount} · {bankForm.bankName}</span></div> : <form className="form-grid two-columns" onSubmit={(event) => { event.preventDefault(); saveOnboardingSection("Bank account", () => createCustomerBankAccount(customerId, bankForm)); }}>
        <label className="field"><span>Account holder name</span><input name="accountHolderName" value={bankForm.accountHolderName} onChange={updateForm(setBankForm)} required /></label>
        <label className="field"><span>Bank name</span><input name="bankName" value={bankForm.bankName} onChange={updateForm(setBankForm)} required /></label>
        <label className="field"><span>Account number</span><input name="accountNumber" inputMode="numeric" value={bankForm.accountNumber} onChange={updateForm(setBankForm)} required /></label>
        <label className="field"><span>IFSC code</span><input name="ifscCode" value={bankForm.ifscCode} onChange={updateForm(setBankForm)} required /></label>
        <label className="field"><span>Account type</span><select name="accountType" value={bankForm.accountType} onChange={updateForm(setBankForm)}><option value="SAVINGS">Savings</option><option value="CURRENT">Current</option></select></label>
        <label className="check-line"><input name="primaryAccount" type="checkbox" checked={bankForm.primaryAccount} onChange={updateForm(setBankForm)} /><span>Set as primary account</span></label>
        <div className="field-wide onboarding-actions"><button className="button button-primary" disabled={Boolean(saving)}>{saving === "Bank account" ? "Saving account…" : "Save and continue"}</button></div>
      </form>)}

          {activeStep === 3 && <>
            <ul className="document-checklist" aria-label="Required document metadata">
              {requiredDocumentTypes.map((type) => {
                const complete = profile.documentTypes?.includes(type);
                return <li key={type} className={complete ? "document-complete" : ""}><span className="document-check">{complete ? <Check size={13} /> : ""}</span><span>{type.replaceAll("_", " ")}</span><strong>{complete ? "Saved" : "Required"}</strong></li>;
              })}
            </ul>
            <form className="form-grid two-columns" onSubmit={(event) => { event.preventDefault(); saveOnboardingSection("Document metadata", () => createCustomerDocument(customerId, documentForm)); }}>
              <label className="field"><span>Document type</span><select name="documentType" value={documentForm.documentType} onChange={updateForm(setDocumentForm)}>{requiredDocumentTypes.map((type) => <option key={type} value={type} disabled={profile.documentTypes?.includes(type)}>{type.replaceAll("_", " ")}{profile.documentTypes?.includes(type) ? " (saved)" : ""}</option>)}</select></label>
              <label className="field"><span>Select {documentForm.documentType.replaceAll("_", " ").toLowerCase()}</span><input key={documentInputKey} type="file" accept=".pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0]; if (file) setDocumentForm((current) => ({ ...current, fileName: file.name, filePath: `/documents/customer-${customerId}/${file.name}` })); }} required /></label>
              <div className="field-wide file-metadata-preview"><span>Selected file</span><strong>{documentForm.fileName || "Choose a document to record its metadata"}</strong><small>Only the name and reference path are saved. The current API does not upload file contents.</small></div>
              <div className="field-wide onboarding-actions"><button className="button button-primary" disabled={Boolean(saving) || !documentForm.fileName}>{saving === "Document metadata" ? "Saving metadata…" : "Save this document"}</button></div>
            </form>
          </>}

          {activeStep === 4 && (kycSubmitted ? <div className={`saved-step-details${kycComplete ? "" : " pending-review"}`}><strong>KYC {String(profile.kycStatus).replaceAll("_", " ")}</strong><span>{kycComplete ? "Verification completed." : "Pending verification by the service."}</span></div> : <div className="kyc-review-action"><p>Submit your onboarding information for review. Verification is performed by the service, not by this form.</p><button className="button button-primary" type="button" disabled={Boolean(saving)} onClick={() => saveOnboardingSection("KYC review", () => requestCustomerKycReview(customerId))}>{saving === "KYC review" ? "Submitting review…" : "Request KYC review"}</button></div>)}
        </section>}
      </section>
    </>}
  </div>;
}

function getKycRecords(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ["pendingCustomers", "customers", "content", "data", "items"]) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function kycRequestError(requestError, fallback) {
  const status = requestError.response?.status;
  const body = requestError.response?.data && typeof requestError.response.data === "object" ? requestError.response.data : {};
  const readiness = [body.missingSections, body.missingDocumentTypes]
    .flatMap((items) => Array.isArray(items) ? items : [])
    .map((item) => String(item).replaceAll("_", " ").toLowerCase());
  const message = typeof body.message === "string" && body.message.length <= 400
    && !/(\n\s*at\s|Exception:|Error:)/.test(body.message) ? body.message : "";

  if (status === 400 && readiness.length) return `Complete the required onboarding items before requesting review: ${readiness.join(", ")}.`;
  if (status === 400) {
    const errors = body.validationErrors || body.errors;
    const validation = errors && typeof errors === "object" ? Object.values(errors).filter(Boolean).join(" ") : "";
    return validation ? `Validation failed: ${validation}` : message || "The KYC request is invalid. Check the required onboarding details.";
  }
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "You do not have permission to perform this KYC action.";
  if (status === 404) return "The customer KYC record was not found. Refresh and try again.";
  if (status === 409) return message || "The KYC action conflicts with the current review status. Refresh the profile.";
  if (status === 502 || status === 503) return "The customer service is temporarily unavailable. Try again shortly.";
  return fallback;
}

function maskPan(panNumber) {
  if (!panNumber || panNumber.length < 4) return "Not provided";
  return `${"*".repeat(panNumber.length - 4)}${panNumber.slice(-4)}`;
}

function CustomerDirectory() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [search, setSearch] = useState("");
  const [kycFilter, setKycFilter] = useState("ALL");
  const [onboardingFilter, setOnboardingFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [detailsAttempt, setDetailsAttempt] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    async function loadCustomers() {
      try {
        const response = await listAdminKycRecords();
        if (current) setCustomers(getKycRecords(response));
      } catch (requestError) {
        if (current) setError(kycRequestError(requestError, "Unable to load customer records."));
      } finally {
        if (current) setLoading(false);
      }
    }
    loadCustomers();
    return () => { current = false; };
  }, [retryCount]);

  useEffect(() => {
    if (selectedId == null) return undefined;
    let current = true;
    async function loadCustomerDetails() {
      setDetailsLoading(true);
      setDetails(null);
      setDetailsError("");
      try {
        const response = await getAdminKycDetails(selectedId);
        if (current) setDetails(response?.customer || response);
      } catch (requestError) {
        if (current) setDetailsError(kycRequestError(requestError, "Unable to load customer details."));
      } finally {
        if (current) setDetailsLoading(false);
      }
    }
    loadCustomerDetails();
    return () => { current = false; };
  }, [selectedId, detailsAttempt]);

  const kycStatuses = [...new Set(customers.map((customer) => String(customer.kycStatus || "PENDING").toUpperCase()))];
  const onboardingStatuses = [...new Set(customers.map((customer) => String(customer.onboardingStatus || "UNKNOWN").toUpperCase()))];
  const filteredCustomers = customers
    .filter((customer) => kycFilter === "ALL" || String(customer.kycStatus || "PENDING").toUpperCase() === kycFilter)
    .filter((customer) => onboardingFilter === "ALL" || String(customer.onboardingStatus || "UNKNOWN").toUpperCase() === onboardingFilter)
    .filter((customer) => JSON.stringify(customer).toLowerCase().includes(search.toLowerCase()));
  const selected = customers.find((customer) => String(customer.customerId || customer.id) === String(selectedId));
  const record = details || selected || {};
  const documents = getKycRecords(record.documents || record.documentMetadata || []);

  return <div className="customer-directory">
    {error && <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary small-button" type="button" onClick={() => { setError(""); setLoading(true); setRetryCount((count) => count + 1); }}><RefreshCw size={14} /> Retry</button></div>}
    <section className="panel data-panel customer-directory-list">
      <div className="panel-heading"><div><h2>Customer records</h2><p>Profile, KYC, and onboarding information available from the customer service.</p></div></div>
      <div className="customer-filters">
        <label className="field customer-search"><span>Search customers</span><span className="table-search"><Search size={15} aria-hidden="true" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search by ID, name or mobile" /></span></label>
        <label className="field"><span>KYC status</span><select value={kycFilter} onChange={(event) => setKycFilter(event.target.value)}><option value="ALL">All statuses</option>{kycStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
        <label className="field"><span>Onboarding</span><select value={onboardingFilter} onChange={(event) => setOnboardingFilter(event.target.value)}><option value="ALL">All statuses</option>{onboardingStatuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label>
      </div>
      {loading ? <div className="table-placeholder"><span className="spinner" />Loading customer records</div> : !error && filteredCustomers.length === 0 ? <div className="empty-state"><span className="empty-icon"><Users size={20} /></span><strong>{search || kycFilter !== "ALL" || onboardingFilter !== "ALL" ? "No matching customers" : "No customer records"}</strong><p>{search || kycFilter !== "ALL" || onboardingFilter !== "ALL" ? "Change the search or filters and try again." : "Customer profiles will appear here when available."}</p></div> : !error && <div className="table-wrap"><table><thead><tr><th>Customer ID</th><th>Customer</th><th>Mobile</th><th>Date of birth</th><th>KYC status</th><th>Onboarding</th><th>Action</th></tr></thead><tbody>{filteredCustomers.map((customer, index) => {
        const customerId = customer.customerId || customer.id;
        const customerName = [customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.fullName || "—";
        return <tr key={customerId || index} className={String(selectedId) === String(customerId) ? "customer-row-selected" : ""}><td className="mono">{customerId || "—"}</td><td>{customerName}</td><td>{customer.mobileNumber || "—"}</td><td>{customer.dateOfBirth || "—"}</td><td><span className={`status-badge status-${String(customer.kycStatus || "pending").toLowerCase().replaceAll("_", "-")}`}>{String(customer.kycStatus || "PENDING").replaceAll("_", " ")}</span></td><td>{String(customer.onboardingStatus || "—").replaceAll("_", " ")}</td><td><button className="text-link" type="button" onClick={() => { setDetails(null); setDetailsError(""); setDetailsLoading(true); setSelectedId(customerId); }}>View details <ArrowRight size={14} /></button></td></tr>;
      })}</tbody></table></div>}
    </section>

    {selectedId != null && <DetailDialog title="Customer profile" drawer onClose={() => { setSelectedId(null); setDetails(null); }}>
      {detailsLoading ? <div className="table-placeholder" role="status"><span className="spinner" />Loading customer details</div> : detailsError ? <div className="inline-error" role="alert"><span>{detailsError}</span><button className="button button-secondary small-button" type="button" onClick={() => { setDetailsError(""); setDetailsLoading(true); setDetailsAttempt((count) => count + 1); }}><RefreshCw size={14} /> Retry</button></div> : <>
        <div className="customer-drawer-summary"><h3>{[record.firstName, record.lastName].filter(Boolean).join(" ") || record.fullName || `Customer ${selectedId}`}</h3><p>Customer ID {record.customerId || record.id || selectedId}</p></div>
        <dl className="finance-details">{[["Customer number", record.customerNumber], ["Date of birth", record.dateOfBirth], ["Mobile number", record.mobileNumber], ["KYC status", record.kycStatus], ["Onboarding", record.onboardingStatus], ["PAN", maskPan(record.panNumber)]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value == null || value === "" ? "Not provided" : String(value).replaceAll("_", " ")}</dd></div>)}</dl>
        <section className="customer-documents"><h3>Documents</h3>{documents.length ? <div className="table-wrap"><table className="customer-documents-table"><thead><tr><th>Type</th><th>File name</th><th>Status</th></tr></thead><tbody>{documents.map((document, index) => <tr key={document.id || document.documentId || index}><td>{String(document.documentType || "DOCUMENT").replaceAll("_", " ")}</td><td>{document.fileName || "Unnamed file"}</td><td>{String(document.verificationStatus || "UPLOADED").replaceAll("_", " ")}</td></tr>)}</tbody></table></div> : <p>No document metadata available.</p>}</section>
      </>}
    </DetailDialog>}
  </div>;
}

function AdminKycPage() {
  const [pending, setPending] = useState([]);
  const [loading, setLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [decision, setDecision] = useState("");
  const [reason, setReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    let current = true;
    async function loadPending() {
      try {
        const response = await listAdminKycRecords();
        if (current) setPending(getKycRecords(response));
      } catch (requestError) {
        if (current) setError(kycRequestError(requestError, "Unable to load customer KYC records."));
      } finally {
        if (current) setLoading(false);
      }
    }
    loadPending();
    return () => { current = false; };
  }, [retryCount]);

  useEffect(() => {
    if (selectedId == null) return undefined;
    let current = true;
    async function loadDetails() {
      setDetailsLoading(true);
      setDetails(null);
      setActionError("");
      try {
        const result = await getAdminKycDetails(selectedId);
        if (current) setDetails(result?.customer || result);
      } catch (requestError) {
        if (current) setActionError(kycRequestError(requestError, "Unable to load customer KYC details."));
      } finally {
        if (current) setDetailsLoading(false);
      }
    }
    loadDetails();
    return () => { current = false; };
  }, [selectedId]);

  function openReview(customerId) {
    setSelectedId(customerId);
    setDecision("");
    setReason("");
    setDetails(null);
  }

  function closeReview(force = false) {
    if (actionLoading && !force) return;
    setSelectedId(null);
    setDetails(null);
    setDecision("");
    setReason("");
  }

  async function submitDecision(nextDecision) {
    if (nextDecision === "REJECT" && !reason.trim()) {
      setActionError("Enter a reason before rejecting KYC.");
      return;
    }
    setActionLoading(true);
    setActionError("");
    try {
      if (nextDecision === "VERIFY") await verifyCustomerKyc(selectedId);
      else await rejectCustomerKyc(selectedId, reason.trim());
      setPending((current) => current.map((customer) => String(customer.customerId || customer.id) === String(selectedId)
        ? { ...customer, kycStatus: nextDecision === "VERIFY" ? "VERIFIED" : "REJECTED" }
        : customer));
      setNotice(`KYC ${nextDecision === "VERIFY" ? "verified" : "rejected"} for customer ${selectedId}.`);
      closeReview(true);
    } catch (requestError) {
      setActionError(kycRequestError(requestError, `Unable to ${nextDecision.toLowerCase()} this KYC record.`));
    } finally {
      setActionLoading(false);
    }
  }

  const statuses = [...new Set(pending.map((customer) => String(customer.kycStatus || "PENDING").toUpperCase()))];
  const visiblePending = pending
    .filter((customer) => statusFilter === "ALL" || String(customer.kycStatus || "PENDING").toUpperCase() === statusFilter)
    .filter((customer) => JSON.stringify(customer).toLowerCase().includes(search.toLowerCase()));
  const selected = pending.find((customer) => String(customer.customerId || customer.id) === String(selectedId));
  const record = details || selected || {};
  const documents = getKycRecords(record.documents || record.documentMetadata || []);
  const canDecide = ["PENDING", "UNDER_REVIEW"].includes(String(record.kycStatus || "PENDING").toUpperCase());

  return <div className="kyc-workspace">
    {notice && <div className="inline-message" role="status">{notice}</div>}
    {error && <div className="inline-error" role="alert"><span>{error}</span><button className="button button-secondary small-button" onClick={() => { setError(""); setLoading(true); setRetryCount((count) => count + 1); }}><RefreshCw size={14} /> Retry</button></div>}
    <section className="panel data-panel">
      <div className="panel-heading"><div><h2>Customer KYC records</h2><p>Review identity and document metadata. Decisions are available for pending records.</p></div><div className="workspace-tools"><label className="field kyc-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></label><label className="table-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search customers" aria-label="Search KYC customers" /></label></div></div>
      {loading ? <div className="table-placeholder"><span className="spinner" />Loading customer KYC records</div> : !error && visiblePending.length === 0 ? <div className="empty-state"><span className="empty-icon"><ShieldCheck size={20} /></span><strong>{search || statusFilter !== "ALL" ? "No matching customers" : "No KYC records"}</strong><p>{search || statusFilter !== "ALL" ? "Try changing your search or status filter." : "Customer KYC records will appear here."}</p></div> : !error && <div className="table-wrap"><table><thead><tr><th>Customer ID</th><th>Customer</th><th>Email</th><th>Mobile</th><th>KYC status</th><th>Action</th></tr></thead><tbody>{visiblePending.map((customer, index) => {
        const customerId = customer.customerId || customer.id;
        const kycStatus = String(customer.kycStatus || "PENDING").toUpperCase();
        return <tr key={customerId || index}><td className="mono">{customerId || "—"}</td><td>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.fullName || customer.name || "—"}</td><td>{customer.email || "—"}</td><td>{customer.mobileNumber || customer.phoneNumber || "—"}</td><td><span className={`status-badge status-${kycStatus.toLowerCase().replaceAll("_", "-")}`}>{kycStatus.replaceAll("_", " ")}</span></td><td><button className="text-link" type="button" onClick={() => openReview(customerId)}>{["PENDING", "UNDER_REVIEW"].includes(kycStatus) ? "Review" : "View"} <ArrowRight size={14} /></button></td></tr>;
      })}</tbody></table></div>}
    </section>

    {selectedId != null && <div className="modal-backdrop" role="presentation"><section className="confirm-modal kyc-review-modal" role="dialog" aria-modal="true" aria-labelledby="kyc-review-title"><div className="modal-heading"><div><p className="eyebrow">CUSTOMER VERIFICATION</p><h2 id="kyc-review-title">Review KYC details</h2></div><button className="icon-button" type="button" aria-label="Close review" onClick={closeReview}><X size={18} /></button></div>
      {detailsLoading ? <div className="table-placeholder"><span className="spinner" />Loading customer details</div> : <>
        <div className="kyc-details-grid">{[["Customer ID", record.customerId || record.id || selectedId], ["Name", [record.firstName, record.lastName].filter(Boolean).join(" ") || record.fullName || "—"], ["Date of birth", record.dateOfBirth || "—"], ["Mobile", record.mobileNumber || "—"], ["PAN", maskPan(record.panNumber)], ["KYC status", record.kycStatus || "PENDING"], ["Onboarding", record.onboardingStatus || "—"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{String(value)}</strong></div>)}</div>
        <div className="kyc-documents"><h3>Document metadata</h3>{documents.length ? documents.map((document, index) => <div className="kyc-document-row" key={document.documentId || index}><span>{String(document.documentType || "DOCUMENT").replaceAll("_", " ")}</span><strong>{document.fileName || "Unnamed file"}</strong><small>{document.verificationStatus || "UPLOADED"}</small></div>) : <p>No document metadata was returned.</p>}</div>
        {actionError && <div className="form-alert error" role="alert">{actionError}</div>}
        {!canDecide ? <div className="inline-message" role="status">This KYC record is {String(record.kycStatus || "PENDING").replaceAll("_", " ")}; no decision action is available.</div> : decision === "VERIFY" ? <div className="kyc-decision-confirm"><p>Confirm that customer {selectedId} has passed KYC verification?</p><div className="modal-actions"><button className="button button-secondary" type="button" disabled={actionLoading} onClick={() => setDecision("")}>Cancel</button><button className="button button-primary" type="button" disabled={actionLoading} onClick={() => submitDecision("VERIFY")}>{actionLoading ? "Verifying…" : "Confirm verification"}</button></div></div> : decision === "REJECT" ? <div className="kyc-reject-form"><label className="field"><span>Rejection reason</span><textarea rows="3" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what needs correction" required /></label><div className="modal-actions"><button className="button button-secondary" type="button" disabled={actionLoading} onClick={() => { setDecision(""); setReason(""); }}>Cancel</button><button className="button button-danger" type="button" disabled={actionLoading || !reason.trim()} onClick={() => submitDecision("REJECT")}>{actionLoading ? "Rejecting…" : "Confirm rejection"}</button></div></div> : <div className="modal-actions"><button className="button button-danger" type="button" disabled={actionLoading} onClick={() => setDecision("REJECT")}>Reject</button><button className="button button-primary" type="button" disabled={actionLoading} onClick={() => setDecision("VERIFY")}>Verify KYC</button></div>}
      </>}
    </section></div>}
  </div>;
}

function BackendCapabilityNotice({ title }) {
  return <section className="panel empty-workspace"><span className="empty-icon"><FileText size={20} /></span><h2>{title}</h2><p>This workflow is not included in the current backend API reference. The UI is ready to expand when its API endpoints are implemented.</p></section>;
}

function AdminUsersPage() {
  const initialForm = { firstName: "", lastName: "", email: "", password: "", role: "ROLE_LOAN_OFFICER" };
  const [form, setForm] = useState(initialForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  function change(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setCreated(null);
    if (form.password.length < 8) {
      setError("Use at least 8 characters for the password.");
      return;
    }
    setLoading(true);
    try {
      const result = await createInternalUser({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
        role: form.role,
      });
      setCreated(result);
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError.response?.data?.message || "Unable to create this internal user. Check your access and try again.");
    } finally {
      setLoading(false);
    }
  }

  return <div className="admin-user-layout">
    <section className="panel admin-user-panel">
      <div className="panel-heading"><div><h2>Create internal user</h2><p>Create an internal staff account and assign its role.</p></div></div>
      {error && <div className="form-alert error" role="alert">{error}</div>}
      {created && <div className="form-alert success" role="status">{created.message || "Internal user created successfully."} {created.userId ? `User ID: ${created.userId}.` : ""} {Array.isArray(created.roles) ? `Assigned role: ${created.roles.join(", ")}.` : ""}</div>}
      <form className="form-grid two-columns" onSubmit={submit}>
        <label className="field"><span>First name</span><input name="firstName" value={form.firstName} onChange={change} autoComplete="given-name" required /></label>
        <label className="field"><span>Last name</span><input name="lastName" value={form.lastName} onChange={change} autoComplete="family-name" required /></label>
        <label className="field field-wide"><span>Email address</span><input type="email" name="email" value={form.email} onChange={change} autoComplete="email" required /></label>
        <label className="field"><span>Password</span><span className="password-field"><input type={showPassword ? "text" : "password"} name="password" value={form.password} onChange={change} autoComplete="new-password" minLength="8" required /><button className="password-action" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"} title={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        <label className="field"><span>Assigned role</span><select name="role" value={form.role} onChange={change}><option value="ROLE_LOAN_OFFICER">Loan officer</option><option value="ROLE_CREDIT_ANALYST">Credit analyst</option><option value="ROLE_CREDIT_MANAGER">Credit manager</option><option value="ROLE_ADMIN">Administrator</option></select></label>
        <div className="field-wide admin-user-actions"><button className="button button-primary" type="submit" disabled={loading}>{loading ? <><span className="spinner" />Creating user</> : "Create internal user"}</button></div>
      </form>
    </section>
    <aside className="apply-aside"><span className="aside-icon"><Users size={21} /></span><h3>Internal access</h3><p>The Authentication Service creates the account and assigns its role. The backend remains responsible for authorization.</p><div className="aside-note">The password is sent only in the creation request and is not shown after submission.</div></aside>
  </div>;
}

export default function WorkspacePage() {
  const { section = "" } = useParams();
  const { user } = useAuth();
  const isAdmin = user?.role !== "CUSTOMER";
  const title = section === "emi" && user?.role === "ADMIN" ? "EMI Management" : titles[section] || "Finance workspace";

  if (section === "review-queue") {
    return <Navigate to={user?.role === "LOAN_OFFICER" ? "/admin" : "/admin/applications"} replace />;
  }

  if (section === "settings") {
    return <Navigate to={user?.role === "CUSTOMER" ? "/customer" : "/admin"} replace />;
  }

  if (["apply", "profile", "emi", "kyc", "users"].includes(section)) {
    const customerOnly = ["apply", "profile"].includes(section) || (section === "emi" && user?.role === "CUSTOMER");
    const adminOnly = ["kyc", "users"].includes(section);
    if ((customerOnly && user?.role !== "CUSTOMER") || (adminOnly && user?.role !== "ADMIN")) {
      return <Navigate to={user?.role === "CUSTOMER" ? "/customer" : "/admin"} replace />;
    }
  }

  if (section === "repayments" && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  if (section === "assessments") {
    const canAssess = ["ADMIN", "CREDIT_ANALYST", "CREDIT_MANAGER"].includes(user?.role);
    return <div className="page-stack page-enter">
      <section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{title}</h1></div></section>
      {canAssess ? <CreditAssessmentsWorkspace userRole={user?.role} /> : <div className="inline-error" role="alert">Only administrators, credit analysts, and credit managers can access credit assessments.</div>}
    </div>;
  }

  if (section === "applications" && isAdmin) {
    const canViewQueue = ["ADMIN", "CREDIT_ANALYST", "CREDIT_MANAGER"].includes(user?.role);
    return <div className="page-stack page-enter">
      <section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>Submitted applications</h1></div></section>
      {canViewQueue ? <StaffApplicationQueueWorkspace userRole={user.role} /> : <div className="inline-error" role="alert">Your role cannot access the submitted application queue.</div>}
    </div>;
  }

  if (section === "customers" && user?.role !== "ADMIN") {
    return <div className="page-stack page-enter">
      <section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{title}</h1></div></section>
      <div className="inline-error" role="alert">Only administrators can access customers.</div>
    </div>;
  }

  if (section === "approvals") {
    const canView = ["ADMIN", "CREDIT_MANAGER", "CREDIT_ANALYST"].includes(user?.role);
    const canCreate = ["ADMIN", "CREDIT_MANAGER"].includes(user?.role);
    return <div className="page-stack page-enter">
      <section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{title}</h1><p>{canCreate ? "Review decisions and assess eligible records without an existing decision." : "Read-only approval history."}</p></div></section>
      {canView ? <ApprovalsWorkspace isAdmin={user.role === "ADMIN"} canCreate={canCreate} reviewerEmail={user.email} /> : <div className="inline-error" role="alert">Your role cannot access approval history.</div>}
    </div>;
  }

  if (section === "decisions") {
    const canView = ["ADMIN", "CREDIT_MANAGER"].includes(user?.role);
    return <div className="page-stack page-enter">
      <section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{title}</h1><p>Eligible assessments without an approval decision.</p></div></section>
      {canView ? <ApprovalsWorkspace isAdmin={user.role === "ADMIN"} canCreate={canView} reviewerEmail={user.email} queueOnly /> : <div className="inline-error" role="alert">Only administrators and credit managers can access the decision queue.</div>}
    </div>;
  }

  if (section === "disbursement") {
    if (user?.role === "CUSTOMER") return <Navigate to="/customer" replace />;
    const canManage = ["ADMIN", "CREDIT_MANAGER"].includes(user?.role);
    return <div className="page-stack page-enter"><section className="page-heading"><div><p className="eyebrow">LOAN SERVICING</p><h1>{title}</h1></div></section>
      {canManage ? <DisbursementsWorkspace canManage={canManage} /> : <div className="inline-error" role="alert">Only administrators and credit managers can access disbursements.</div>}
    </div>;
  }

  if (section === "emi" && user?.role === "ADMIN") {
    return <div className="page-stack page-enter"><section className="page-heading"><div><p className="eyebrow">LOAN SERVICING</p><h1>EMI Management</h1><p>Generate and verify loan account schedules for disbursed applications.</p></div></section><AdminEmiManagementWorkspace /></div>;
  }

  if (section === "emi" && user?.role !== "CUSTOMER") {
    return <Navigate to="/admin" replace />;
  }

  if (section === "notifications" && user?.role === "ADMIN") {
    return <div className="page-stack page-enter"><section className="page-heading"><div><p className="eyebrow">ADMINISTRATION</p><h1>{title}</h1></div></section><AdminNotificationWorkspace /></div>;
  }

  if (["emi", "repayments", "notifications"].includes(section) && user?.role === "CUSTOMER") {
    const workspace = section === "emi" ? <CustomerEmiWorkspace user={user} />
      : section === "repayments" ? <CustomerRepaymentsWorkspace user={user} />
        : <CustomerNotificationsWorkspace user={user} />;
    return <div className="page-stack page-enter"><section className="page-heading"><div><p className="eyebrow">CUSTOMER ACCOUNT</p><h1>{title}</h1></div></section>{workspace}</div>;
  }

  if (section === "notifications" && user?.role !== "ADMIN") {
    return <Navigate to="/admin" replace />;
  }

  return <div className="page-stack page-enter"><section className="page-heading"><div><p className="eyebrow">{isAdmin ? "ADMINISTRATION" : "CUSTOMER ACCOUNT"}</p><h1>{title}</h1><p>{section === "apply" ? "A few details will help us understand your request." : "Review and manage information connected to your finance account."}</p></div></section>
    {section === "loan-products" ? <LoanProductsWorkspace canCreate={user?.role === "ADMIN"} /> : section === "kyc" && user?.role === "ADMIN" ? <AdminKycPage /> : section === "customers" && user?.role === "ADMIN" ? <CustomerDirectory /> : section === "users" && user?.role === "ADMIN" ? <AdminUsersPage /> : section === "apply" && !isAdmin ? <ApplyFinance user={user} /> : section === "profile" && !isAdmin ? <ProfilePage user={user} /> : section === "applications" && !isAdmin ? <DataWorkspace key={section} section={section} isAdmin={false} user={user} /> : <BackendCapabilityNotice title={title} />}
  </div>;
}