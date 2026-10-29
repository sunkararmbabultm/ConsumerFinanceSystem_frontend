import { useState } from "react";
import { Eye, EyeOff, Landmark, LockKeyhole } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import ThemeToggle from "../../components/ThemeToggle";
import { useAuth } from "../../context/useAuth";

export default function LoginPage() {
	const { login } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [remember, setRemember] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState("");

	async function submit(event) {
		event.preventDefault();
		setError("");
		setLoading(true);
		try {
			const user = await login({ email: email.trim(), password }, remember);
			const home = user.role === "CUSTOMER" ? "/customer" : "/admin";
			navigate(location.state?.from?.pathname || home, { replace: true });
		} catch (requestError) {
			setError(requestError.response?.data?.message || requestError.message || "Unable to sign in. Check your details and try again.");
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
					<div className="auth-heading"><p className="eyebrow">Welcome back</p><h2>Sign in to your account</h2><p>Enter your details to access your finance workspace.</p></div>
					{error && <div className="form-alert error" role="alert">{error}</div>}
					<form onSubmit={submit} className="auth-form">
						<label className="field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
						<label className="field"><span>Password</span><span className="password-field"><input type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /><button className="password-action" type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
						<div className="auth-options"><label className="check-line"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /><span>Remember me</span></label><span className="forgot-note"><LockKeyhole size={14} /> Secure sign in</span></div>
						<button className="button button-primary auth-submit" type="submit" disabled={loading}>{loading ? <><span className="spinner" />Signing in</> : "Sign in"}</button>
					</form>
					  <p className="auth-switch">New to CFS? <Link to="/register">Create an account</Link></p>
				</div>
			</section>
			<footer className="auth-legal">Consumer Finance Management System <span>Secure access to your account</span></footer>
		</main>
	);
}
