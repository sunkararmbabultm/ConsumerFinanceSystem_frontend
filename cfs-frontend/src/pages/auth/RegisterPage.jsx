import { useState } from "react";
import { Eye, EyeOff, Landmark } from "lucide-react";
import { Link } from "react-router-dom";
import ThemeToggle from "../../components/ThemeToggle";
import { registerCustomer } from "../../services/authService";

const initialForm = { firstName: "", lastName: "", email: "", password: "", confirmPassword: "", terms: false };

export default function RegisterPage() {
  const [form, setForm] = useState(initialForm);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  function update(event) {
    const { name, value, checked, type } = event.target;
    setForm((current) => ({ ...current, [name]: type === "checkbox" ? checked : value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (form.password.length < 8) return setError("Use at least 8 characters for your password.");
    if (form.password !== form.confirmPassword) return setError("Passwords do not match.");
    if (!form.terms) return setError("Please accept the terms to continue.");

    setLoading(true);
    try {
      const result = await registerCustomer({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      setSuccess(result?.message || "Your account is ready. Sign in to continue.");
      setForm(initialForm);
    } catch (requestError) {
      setError(requestError.response?.data?.message || requestError.message || "Registration failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="auth-topbar"><Link to="/login" className="brand-lockup"><span className="brand-mark"><Landmark size={20} /></span><span>CFS <small>CONSUMER FINANCE</small></span></Link><ThemeToggle /></div>
      <section className="auth-layout">
        <div className="auth-story"><p className="eyebrow">A clearer view of your money</p><h1>Finance that<br />moves with you.</h1><p>One place to manage applications, repayments, and the next step in your plans.</p><div className="story-rule"><span />Thoughtful finance, built around you</div></div>
        <div className="auth-card">
          <div className="auth-heading"><p className="eyebrow">Get started</p><h2>Create your account</h2><p>Set up your customer profile to continue.</p></div>
          {error && <div className="form-alert error" role="alert">{error}</div>}
          {success && <div className="form-alert success" role="status">{success} <Link to="/login">Sign in</Link></div>}
          <form onSubmit={submit} className="auth-form">
            <div className="form-grid two-columns">
              <label className="field"><span>First name</span><input autoComplete="given-name" name="firstName" value={form.firstName} onChange={update} required /></label>
              <label className="field"><span>Last name</span><input autoComplete="family-name" name="lastName" value={form.lastName} onChange={update} required /></label>
            </div>
            <label className="field"><span>Email address</span><input type="email" autoComplete="email" name="email" value={form.email} onChange={update} required /></label>
            <label className="field"><span>Password</span><span className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="new-password" name="password" value={form.password} onChange={update} minLength="8" required /><button className="password-action" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
            <label className="field"><span>Confirm password</span><input type={showPassword ? "text" : "password"} autoComplete="new-password" name="confirmPassword" value={form.confirmPassword} onChange={update} required /></label>
            <label className="check-line"><input type="checkbox" name="terms" checked={form.terms} onChange={update} /><span>I agree to the terms and privacy policy.</span></label>
            <button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading ? <><span className="spinner" />Creating account</> : "Create account"}</button>
          </form>
          <p className="auth-switch">Already have an account? <Link to="/login">Sign in</Link></p>
        </div>
      </section>
      <footer className="auth-legal">Consumer Finance Management System <span>Secure access to your account</span></footer>
    </main>
  );
}
