import { useEffect, useEffectEvent, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Eye, History, Plus, RefreshCw, Search, Send, X } from "lucide-react";
import { createLoanProduct, getApplicationHistory, getFinanceApplication, getLoanProduct, listCustomerApplications, listLoanProducts, submitFinanceApplication } from "../services/financeApplicationService";

function records(data) {
  if (Array.isArray(data)) return data;
  for (const key of ["content", "data", "products", "loanProducts", "applications", "history", "statusHistory", "items"]) {
    if (Array.isArray(data?.[key])) return data[key];
  }
  return [];
}

function errorMessage(error, fallback) {
  return error.response?.data?.message || fallback;
}

function Fields({ record }) {
  return <dl className="finance-details">{Object.entries(record || {}).map(([key, value]) => <div key={key}>
    <dt>{key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</dt>
    <dd>{value == null ? "-" : typeof value === "object" ? JSON.stringify(value) : String(value)}</dd>
  </div>)}</dl>;
}

export function DetailDialog({ title, onClose, children, drawer = false }) {
  const dialogRef = useRef(null);
  const closeOnEscape = useEffectEvent(() => onClose());
  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = dialogRef.current;
    dialog.querySelector("button")?.focus();
    function handleKey(event) {
      if (event.key === "Escape") closeOnEscape();
      if (event.key !== "Tab") return;
      const controls = [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]')];
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    dialog.addEventListener("keydown", handleKey);
    return () => {
      dialog.removeEventListener("keydown", handleKey);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, []);
  return createPortal(<div className={`modal-backdrop${drawer ? " finance-drawer-backdrop" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}><section ref={dialogRef} className={`confirm-modal finance-dialog${drawer ? " finance-drawer" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-heading"><h2>{title}</h2><button className="icon-button" type="button" aria-label="Close details" title="Close details" onClick={onClose}><X size={18} /></button></div>
    {children}
  </section></div>, document.body);
}

export function ProductDetails({ productId, onClose }) {
  const [product, setProduct] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let current = true;
    getLoanProduct(productId).then((response) => { if (current) setProduct(response); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load this product.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [productId, attempt]);
  return <DetailDialog title="Loan product details" onClose={onClose}>
    {loading ? <p role="status">Loading product...</p> : error ? <div className="inline-error" role="alert">{error}<button className="button button-secondary small-button" onClick={() => { setError(""); setLoading(true); setAttempt((value) => value + 1); }}><RefreshCw size={14} /> Retry</button></div> : <Fields record={product} />}
  </DetailDialog>;
}

function ApplicationStatusHistory({ applicationId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    getApplicationHistory(applicationId)
      .then((response) => { if (current) setHistory(records(response)); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load status history.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [applicationId, attempt]);

  function refresh() {
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  return <section aria-label={`Status history for application ${applicationId}`}>
    <div className="finance-actions"><button className="button button-secondary small-button" type="button" disabled={loading} onClick={refresh}><RefreshCw size={14} />{error ? "Retry history" : "Refresh history"}</button></div>
    {loading ? <p role="status">Loading status history...</p> : error ? <div className="inline-error" role="alert">{error}</div> : history.length === 0 ? <p>No status history yet.</p> : <ol className="finance-history">{history.map((entry, index) => <li key={entry?.historyId || entry?.id || index}><Fields record={typeof entry === "object" && entry !== null ? entry : { status: entry }} /></li>)}</ol>}
  </section>;
}

export function ApplicationDetails({ applicationId, canSubmit = false, onClose, onSubmitted }) {
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [actionError, setActionError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [productId, setProductId] = useState(null);

  useEffect(() => {
    let current = true;
    async function load() {
      try {
        const details = await getFinanceApplication(applicationId);
        if (current) setApplication(details);
      } catch (failure) {
        if (current) setError(errorMessage(failure, "Unable to load this application."));
      } finally {
        if (current) setLoading(false);
      }
    }
    load();
    return () => { current = false; };
  }, [applicationId, attempt]);

  function refresh() {
    setError("");
    setLoading(true);
    setAttempt((value) => value + 1);
  }

  async function submit() {
    setSubmitting(true);
    setActionError("");
    try {
      await submitFinanceApplication(applicationId);
      setSubmitted(true);
      onSubmitted?.();
      refresh();
    } catch (failure) {
      setActionError(errorMessage(failure, "Unable to submit this draft. Check onboarding and KYC, then try again."));
    } finally { setSubmitting(false); }
  }

  const isDraft = String(application?.status || application?.applicationStatus || "").toUpperCase() === "DRAFT";
  const content = <>
      {submitted && <div className="inline-message" role="status">Application submitted successfully.</div>}
      {actionError && <div className="inline-error" role="alert">{actionError}</div>}
      <div className="finance-actions"><button className="button button-secondary small-button" onClick={refresh} disabled={loading || submitting}><RefreshCw size={14} /> Refresh</button></div>
      {loading ? <p role="status">Loading application...</p> : <>
        {error ? <div className="inline-error" role="alert">{error}</div> : <>
          <Fields record={application} />
          <div className="finance-actions">
            {application?.productId != null && <button className="button button-secondary small-button" type="button" onClick={() => setProductId(application.productId)}><Eye size={14} /> View loan product</button>}
            <button className="button button-secondary small-button" type="button" onClick={() => setShowHistory(true)} disabled={submitting}><History size={14} /> Status history</button>
          </div>
          {canSubmit && isDraft && !submitted && <div className="finance-actions"><button className="button button-primary" onClick={submit} disabled={submitting}><Send size={15} />{submitting ? "Submitting..." : "Submit saved draft"}</button></div>}
        </>}
      </>}
  </>;
  return <>
    <DetailDialog title={`Application ${applicationId}${showHistory ? " status history" : ""}`} onClose={onClose} drawer>
      {showHistory ? <><button className="text-link" type="button" onClick={() => setShowHistory(false)}><ArrowLeft size={14} /> Back to details</button><ApplicationStatusHistory key={applicationId} applicationId={applicationId} /></> : content}
    </DetailDialog>
    {productId != null && <ProductDetails key={productId} productId={productId} onClose={() => setProductId(null)} />}
  </>;
}

const initialProduct = { productCode: "", productName: "", minimumAmount: "", maximumAmount: "", minimumTenureMonths: "", maximumTenureMonths: "", minimumInterestRate: "", maximumInterestRate: "", active: true };
const productNumericFields = [
  ["minimumAmount", "Minimum amount", "0.01", "0.01"],
  ["maximumAmount", "Maximum amount", "0.01", "0.01"],
  ["minimumTenureMonths", "Minimum tenure (months)", "1", "1"],
  ["maximumTenureMonths", "Maximum tenure (months)", "1", "1"],
  ["minimumInterestRate", "Minimum annual interest rate (%)", "0", "0.01"],
  ["maximumInterestRate", "Maximum annual interest rate (%)", "0", "0.01"],
];

function productInterestRate(product) {
  const minimum = product.minimumInterestRate;
  const maximum = product.maximumInterestRate;
  if (minimum == null || maximum == null) return product.interestRate == null ? "-" : `${product.interestRate}%`;
  return minimum === maximum ? `${minimum}%` : `${minimum}% - ${maximum}%`;
}

const productCodes = [
  "PERSONAL_LOAN",
  "HOME_LOAN",
  "VEHICLE_LOAN",
  "EDUCATION_LOAN",
  "GOLD_LOAN",
  "BUSINESS_LOAN",
  "CONSUMER_DURABLE_LOAN",
  "LOAN_AGAINST_PROPERTY",
  "AGRI_LOAN",
];

export function LoanProductsWorkspace({ canCreate }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(initialProduct);
  const [attempt, setAttempt] = useState(0);
  const [selectedId, setSelectedId] = useState(null);
  const [lookupId, setLookupId] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let current = true;
    listLoanProducts().then((response) => { if (current) setProducts(records(response)); })
      .catch((failure) => { if (current) setError(errorMessage(failure, "Unable to load active loan products.")); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [attempt]);

  function refresh() { setLoading(true); setError(""); setAttempt((value) => value + 1); }
  function change(event) { const { name, value, type, checked } = event.target; setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value })); }
  async function create(event) {
    event.preventDefault();
    setFormError("");
    setMessage("");
    const payload = { ...form, productCode: form.productCode.trim(), productName: form.productName.trim() };
    for (const [key] of productNumericFields) payload[key] = Number(form[key]);
    const invalidNumber = productNumericFields.some(([key, , min]) => !form[key].trim() || !Number.isFinite(payload[key]) || payload[key] < Number(min));
    if (!payload.productCode || !payload.productName || invalidNumber || !Number.isInteger(payload.minimumTenureMonths) || !Number.isInteger(payload.maximumTenureMonths)) {
      setFormError("Provide a product code and name, positive amounts, whole-month tenures, and non-negative interest rates.");
      return;
    }
    if (payload.minimumAmount > payload.maximumAmount || payload.minimumTenureMonths > payload.maximumTenureMonths || payload.minimumInterestRate > payload.maximumInterestRate) {
      setFormError("Maximum amount, tenure, and interest rate must not be lower than their minimum values.");
      return;
    }
    setSaving(true);
    try {
      const created = await createLoanProduct(payload);
      setMessage(`Loan product ${created?.productName || payload.productName} created successfully.`);
      setForm(initialProduct);
      setShowCreate(false);
      refresh();
    } catch (failure) { setFormError(errorMessage(failure, "Unable to create this loan product.")); }
    finally { setSaving(false); }
  }

  const visible = products.filter((product) => JSON.stringify(product).toLowerCase().includes(query.toLowerCase()));
  return <div className="page-stack">
    <section className="panel">
      <div className="panel-heading loan-products-heading"><h2>Active loan products</h2><div className="workspace-tools">{canCreate && <button className="button button-primary small-button" type="button" onClick={() => { setFormError(""); setShowCreate(true); }}><Plus size={16} /> Create loan product</button>}<button className="icon-button" type="button" title="Refresh products" aria-label="Refresh products" disabled={loading} onClick={refresh}><RefreshCw size={17} /></button></div></div>
      <div className="loan-products-toolbar"><label className="field"><span>Search products</span><span className="table-search"><Search size={15} aria-hidden="true" /><input placeholder="Search by ID, code or name" value={query} onChange={(event) => setQuery(event.target.value)} /></span></label>
        <form className="finance-lookup loan-products-lookup" onSubmit={(event) => { event.preventDefault(); if (lookupId.trim()) setSelectedId(lookupId.trim()); }}><label className="field"><span>Product ID lookup</span><input placeholder="Enter product ID" required value={lookupId} onChange={(event) => setLookupId(event.target.value)} /></label><button className="button button-secondary small-button" type="submit" disabled={!lookupId.trim()}><Eye size={14} /> View product</button></form>
      </div>
      {message && <div className="inline-message" role="status">{message}</div>}
      {loading ? <p role="status">Loading products...</p> : error ? <div className="inline-error" role="alert">{error}</div> : visible.length === 0 ? <p>No matching active loan products.</p> : <div className="table-wrap"><table><thead><tr><th>Product ID</th><th>Code</th><th>Product</th><th>Annual interest rate</th><th>Action</th></tr></thead><tbody>{visible.map((product) => <tr key={product.productId}><td>{product.productId ?? "-"}</td><td>{product.productCode}</td><td>{product.productName}</td><td>{productInterestRate(product)}</td><td><button className="text-link" onClick={() => setSelectedId(product.productId)}><Eye size={14} /> Details</button></td></tr>)}</tbody></table></div>}
    </section>
    {canCreate && showCreate && <DetailDialog title="Create loan product" drawer onClose={() => { if (!saving) setShowCreate(false); }}>
      {formError && <div className="inline-error" role="alert">{formError}</div>}
      <form className="form-grid two-columns" onSubmit={create}>
        <label className="field"><span>Product code</span><select name="productCode" value={form.productCode} onChange={change} required><option value="">Select product code</option>{productCodes.map((code) => <option key={code} value={code}>{code}</option>)}</select></label>
        <label className="field"><span>Product name</span><input name="productName" value={form.productName} onChange={change} required /></label>
        {productNumericFields.map(([name, label, min, step]) => <label className="field" key={name}><span>{label}</span><input name={name} type="number" min={min} step={step} value={form[name]} onChange={change} required /></label>)}
        <label className="finance-checkbox"><input type="checkbox" name="active" checked={form.active} onChange={change} /> Active</label>
        <div className="field-wide finance-actions"><button type="button" className="button button-secondary" disabled={saving} onClick={() => setShowCreate(false)}>Cancel</button><button type="submit" className="button button-primary" disabled={saving}><Plus size={16} />{saving ? "Creating..." : "Create product"}</button></div>
      </form>
    </DetailDialog>}
    {selectedId != null && <ProductDetails key={selectedId} productId={selectedId} onClose={() => setSelectedId(null)} />}
  </div>;
}

export function AdminApplicationsWorkspace() {
  const [mode, setMode] = useState("customer");
  const [lookupId, setLookupId] = useState("");
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  async function search(event) {
    event.preventDefault();
    if (!lookupId.trim()) return;
    setError("");
    if (mode === "application") { setSelectedId(lookupId.trim()); return; }
    setLoading(true);
    setSearched(true);
    try { setApplications(records(await listCustomerApplications(lookupId.trim()))); }
    catch (failure) { setError(errorMessage(failure, "Unable to load this customer's applications.")); }
    finally { setLoading(false); }
  }

  return <section className="panel">
    <div className="panel-heading"><h2>Find applications</h2></div>
    <form className="finance-toolbar" onSubmit={search}>
      <label className="field"><span>Find by</span><select value={mode} disabled={loading} onChange={(event) => { setMode(event.target.value); setSearched(false); setError(""); setApplications([]); }}><option value="customer">Customer ID</option><option value="application">Application ID</option></select></label>
      <label className="field"><span>{mode === "customer" ? "Customer ID" : "Application ID"}</span><input required value={lookupId} disabled={loading} onChange={(event) => setLookupId(event.target.value)} /></label>
      <button type="submit" className="button button-primary" disabled={loading}><Search size={15} />{loading ? "Searching..." : "Search"}</button>
    </form>
    {error && <div className="inline-error" role="alert">{error}</div>}
    {!loading && !error && searched && (applications.length === 0 ? <p>No applications found for this customer.</p> : <div className="table-wrap"><table><thead><tr><th>Application</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>{applications.map((application) => <tr key={application.applicationId}><td>{application.applicationNumber || application.applicationId}</td><td>{application.requestedAmount}</td><td>{application.status || application.applicationStatus}</td><td><button className="text-link" onClick={() => setSelectedId(application.applicationId)}><Eye size={14} /> Details</button></td></tr>)}</tbody></table></div>)}
    {selectedId != null && <ApplicationDetails key={selectedId} applicationId={selectedId} onClose={() => setSelectedId(null)} />}
  </section>;
}