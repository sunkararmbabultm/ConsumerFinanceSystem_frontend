import { useState } from "react";
import { Search } from "lucide-react";
import { generateEmiSchedule, getEmiScheduleForApplication, listEmiInstallments } from "../services/emiService";
import { getDisbursementForApplication } from "../services/disbursementService";

const emptyForm = {
  applicationId: "",
  customerId: "",
  disbursementId: "",
  principalAmount: "",
  annualInterestRate: "",
  tenureMonths: "",
  firstDueDate: "",
};

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function money(value) {
  const amount = Number(value);
  return value == null || value === "" || !Number.isFinite(amount) ? "-" : inr.format(amount);
}

function responseList(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.content)) return value.content;
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.installments)) return value.installments;
  return [];
}

function requestError(error, operation) {
  const status = error.response?.status;
  if (status === 400) return "The schedule request is invalid. Check the required fields and financial information.";
  if (status === 401) return "Your session has expired. Sign in again.";
  if (status === 403) return "Admin permission is required for this operation.";
  if (status === 404) {
    if (operation === "disbursement") return "No disbursement was found for this application.";
    if (operation === "installments") return "No installments were found for this loan account.";
    return "No EMI schedule was found for this application.";
  }
  if (status === 409) return "An EMI schedule already exists for this application.";
  if (status === 502 || status === 503) return "The EMI or disbursement service is temporarily unavailable. Try again shortly.";
  return operation === "disbursement" ? "Unable to verify the application disbursement." : "Unable to complete the EMI schedule request.";
}

function positiveInteger(value) {
  return Number.isSafeInteger(Number(value)) && Number(value) > 0;
}

function LoanAccountDetails({ account }) {
  const fields = [
    ["Loan account ID", account.loanAccountId],
    ["Application ID", account.applicationId],
    ["Customer ID", account.customerId],
    ["Disbursement ID", account.disbursementId],
    ["Principal amount", money(account.principalAmount)],
    ["Annual interest rate", account.annualInterestRate == null ? "-" : `${account.annualInterestRate}%`],
    ["Tenure", account.tenureMonths == null ? "-" : `${account.tenureMonths} months`],
    ["Monthly EMI", money(account.monthlyEmiAmount)],
    ["Total payable", money(account.totalPayableAmount)],
    ["Outstanding amount", money(account.outstandingAmount)],
    ["Status", account.status],
    ["Start date", account.startDate],
    ["Maturity date", account.maturityDate],
  ];

  return <dl className="finance-details">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value ?? "-"}</dd></div>)}</dl>;
}

function InstallmentTable({ installments }) {
  if (!installments.length) return <p>No installments were returned for this loan account.</p>;
  return <div className="table-wrap"><table>
    <thead><tr><th>Installment #</th><th>Due date</th><th>Opening principal</th><th>Principal component</th><th>Interest component</th><th>EMI amount</th><th>Amount paid</th><th>Status</th><th>Paid at</th></tr></thead>
    <tbody>{installments.map((item) => <tr key={item.emiId ?? item.installmentNumber}>
      <td>{item.installmentNumber ?? "-"}</td>
      <td>{item.dueDate ?? "-"}</td>
      <td>{money(item.openingPrincipal)}</td>
      <td>{money(item.principalComponent)}</td>
      <td>{money(item.interestComponent)}</td>
      <td>{money(item.emiAmount)}</td>
      <td>{money(item.amountPaid)}</td>
      <td>{item.status ?? "-"}</td>
      <td>{item.paidAt?.replace("T", " ") ?? "-"}</td>
    </tr>)}</tbody>
  </table></div>;
}

export default function AdminEmiManagementWorkspace() {
  const [form, setForm] = useState(emptyForm);
  const [verifiedApplicationId, setVerifiedApplicationId] = useState("");
  const [checkingDisbursement, setCheckingDisbursement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [account, setAccount] = useState(null);
  const [installments, setInstallments] = useState([]);
  const [lookupApplicationId, setLookupApplicationId] = useState("");

  function change(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (name === "applicationId" && value !== verifiedApplicationId) {
      setVerifiedApplicationId("");
      setError("");
    }
  }

  async function checkDisbursement(event) {
    event.preventDefault();
    if (!positiveInteger(form.applicationId)) {
      setError("Enter a positive whole application ID.");
      return;
    }
    setCheckingDisbursement(true);
    setError("");
    setSuccess("");
    setVerifiedApplicationId("");
    try {
      const disbursement = await getDisbursementForApplication(Number(form.applicationId));
      if (String(disbursement?.status).toUpperCase() !== "DISBURSED") {
        setError("This application is not disbursed. An EMI schedule cannot be generated.");
        return;
      }
      setForm((current) => ({
        ...current,
        disbursementId: disbursement.disbursementId == null ? current.disbursementId : String(disbursement.disbursementId),
        principalAmount: disbursement.amount == null ? current.principalAmount : String(disbursement.amount),
      }));
      setVerifiedApplicationId(String(Number(form.applicationId)));
      setSuccess("Disbursement verified. Confirm the remaining schedule details before generating.");
    } catch (failure) {
      setError(requestError(failure, "disbursement"));
    } finally {
      setCheckingDisbursement(false);
    }
  }

  async function loadAccount(applicationId, duplicate = false) {
    setSearching(true);
    setError("");
    setAccount(null);
    setInstallments([]);
    try {
      const loanAccount = await getEmiScheduleForApplication(applicationId);
      setAccount(loanAccount);
      if (loanAccount?.loanAccountId == null) {
        setError("The schedule response did not include a loan account ID.");
        return;
      }
      try {
        setInstallments(responseList(await listEmiInstallments(loanAccount.loanAccountId)));
      } catch (failure) {
        setError(requestError(failure, "installments"));
      }
      if (duplicate) setSuccess("An EMI schedule already exists for this application. The existing schedule is shown below.");
    } catch (failure) {
      setError(requestError(failure, "schedule"));
    } finally {
      setSearching(false);
    }
  }

  async function searchSchedule(event) {
    event.preventDefault();
    if (!positiveInteger(lookupApplicationId)) {
      setError("Enter a positive whole application ID to search.");
      return;
    }
    setSuccess("");
    await loadAccount(Number(lookupApplicationId));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    const applicationId = Number(form.applicationId);
    const customerId = Number(form.customerId);
    const disbursementId = Number(form.disbursementId);
    const principalAmount = Number(form.principalAmount);
    const annualInterestRate = Number(form.annualInterestRate);
    const tenureMonths = Number(form.tenureMonths);
    if (String(applicationId) !== verifiedApplicationId) {
      setError("Verify a DISBURSED application before generating its EMI schedule.");
      return;
    }
    if (![form.applicationId, form.customerId, form.disbursementId, form.tenureMonths].every(positiveInteger)) {
      setError("Application, customer, and disbursement IDs and tenure must be positive whole numbers.");
      return;
    }
    if (!Number.isFinite(principalAmount) || principalAmount < 0.01 || !Number.isFinite(annualInterestRate) || annualInterestRate < 0 || !form.firstDueDate) {
      setError("Principal must be at least ₹0.01, interest cannot be negative, and a first due date is required.");
      return;
    }

    setAccount(null);
    setInstallments([]);
    setSaving(true);
    try {
      const created = await generateEmiSchedule({
        applicationId,
        customerId,
        disbursementId,
        principalAmount,
        annualInterestRate,
        tenureMonths,
        firstDueDate: form.firstDueDate,
      });
      setAccount(created);
      setSuccess("EMI schedule generated successfully.");
      if (created?.loanAccountId == null) {
        setError("The schedule was created, but the response did not include a loan account ID.");
        setInstallments([]);
      } else {
        try {
          setInstallments(responseList(await listEmiInstallments(created.loanAccountId)));
        } catch (failure) {
          setInstallments([]);
          setError(requestError(failure, "installments"));
        }
      }
    } catch (failure) {
      if (failure.response?.status === 409) {
        setSuccess("");
        setError("An EMI schedule already exists for this application. Loading the existing schedule.");
        await loadAccount(applicationId, true);
      } else {
        setError(requestError(failure, "schedule"));
      }
    } finally {
      setSaving(false);
    }
  }

  const field = (name, label, props = {}) => <label className="field" key={name}>
    <span>{label}</span>
    <input name={name} value={form[name]} onChange={change} disabled={saving} required {...props} />
  </label>;

  return <div className="page-stack">
    <section className="panel">
      <div className="panel-heading"><div><h2>Generate EMI schedule</h2><p>Verify the application has been disbursed before creating its loan account.</p></div></div>
      {error && <div className="inline-error" role="alert">{error}</div>}
      {success && <div className="inline-message" role="status">{success}</div>}
      <form className="form-grid two-columns" onSubmit={checkDisbursement}>
        {field("applicationId", "Application ID", { type: "number", min: "1", step: "1" })}
        <div className="field"><span>&nbsp;</span><button className="button button-secondary" type="submit" disabled={checkingDisbursement || saving}>{checkingDisbursement ? "Checking..." : "Verify disbursement"}</button></div>
      </form>
      <form className="form-grid two-columns" onSubmit={submit}>
        {field("customerId", "Customer ID", { type: "number", min: "1", step: "1" })}
        {field("disbursementId", "Disbursement ID", { type: "number", min: "1", step: "1" })}
        {field("principalAmount", "Principal amount (INR)", { type: "number", min: "0.01", step: "0.01" })}
        {field("annualInterestRate", "Annual interest rate (%)", { type: "number", min: "0", step: "0.01" })}
        {field("tenureMonths", "Tenure (months)", { type: "number", min: "1", step: "1" })}
        {field("firstDueDate", "First due date", { type: "date" })}
        <div className="field-wide"><button className="button button-primary" type="submit" disabled={saving || checkingDisbursement || verifiedApplicationId !== String(Number(form.applicationId))}>{saving ? "Generating..." : "Generate schedule"}</button></div>
      </form>
    </section>

    <section className="panel">
      <div className="panel-heading"><div><h2>Find existing schedule</h2><p>Search by application ID to inspect a loan account and its installments.</p></div></div>
      <form className="finance-toolbar" onSubmit={searchSchedule}>
        <label className="field"><span>Application ID</span><input type="number" min="1" step="1" required value={lookupApplicationId} onChange={(event) => setLookupApplicationId(event.target.value)} disabled={searching} /></label>
        <button className="button button-secondary" type="submit" disabled={searching}><Search size={16} />{searching ? "Searching..." : "Search"}</button>
      </form>
    </section>

    {account && <>
      <section className="panel"><div className="panel-heading"><div><h2>Loan account</h2><p>Values returned by the EMI service</p></div></div><LoanAccountDetails account={account} /></section>
      <section className="panel"><div className="panel-heading"><h2>Installments</h2></div><InstallmentTable installments={installments} /></section>
    </>}
  </div>;
}
