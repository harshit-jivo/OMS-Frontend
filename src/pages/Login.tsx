import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { landingPathFor } from "../config/pageAccess";
import { loginUser } from "../services/authService";
import { resolveStartupSession } from "../services/api";
import { webDeviceService } from "../services/webDeviceService";
import { loadUILabels, loadUIFields } from "../services/uiConfig";
import "../styles/Login.css";

type ToastProps = {
  message: string;
  type: "error" | "success";
  onClose: () => void;
};

function Toast({ message, type, onClose }: ToastProps) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  
  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        zIndex: 9999,
        display: "flex",
        alignItems: "flex-start",
        gap: "12px",
        background: type === "error" ? "#7f1d1d" : "#14532d",
        border: `1px solid ${type === "error" ? "#b91c1c" : "#15803d"}`,
        padding: "14px 18px",
        borderRadius: "10px",
        minWidth: "280px",
        maxWidth: "360px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.35)",
        fontFamily: "'Inter', sans-serif",
        animation: "toastIn .35s cubic-bezier(.22,1,.36,1)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div
          style={{
            fontSize: ".8rem",
            fontWeight: 700,
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: type === "error" ? "#fca5a5" : "#86efac",
            marginBottom: "4px",
          }}
        >
          {type === "error" ? "Authentication Failed" : "Success"}
        </div>

        <div
          style={{
            fontSize: ".85rem",
            color: "rgba(255,255,255,.8)",
            fontWeight: 400,
            lineHeight: 1.5,
          }}
        >
          {message}
        </div>
      </div>

      <button
        onClick={onClose}
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "rgba(255,255,255,.4)",
          fontSize: "14px",
          padding: 0,
          lineHeight: 1,
          marginTop: "1px",
        }}
      >
        ✕
      </button>
    </div>
  );

}

export default function Login() {

  const navigate = useNavigate();

  // If a valid session already exists (or an expired access token can be
  // silently refreshed), skip the Login screen and go straight into the app.
  // We NEVER clear tokens here — opening Login must not affect any tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const outcome = await resolveStartupSession();
      if (cancelled || outcome !== "authenticated") return;
      // Same landing rule as a fresh login (see handleLogin) — one shared helper,
      // so a restored session can never land somewhere a new login wouldn't.
      const landing = landingPathFor(localStorage.getItem("role"));
      // Preserve any notification deep-link params (openOrderId / notificationId)
      // that a service-worker "openWindow" put on the "/" URL, so the Sidebar's
      // openOrderId effect on the landing route can open the exact Sales Order
      // instead of dropping it on the redirect.
      navigate(`${landing}${window.location.search}`, { replace: true });
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const [username, setUsername] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [showPass, setShowPass] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);

  const [toast, setToast] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  const showToast = (message: string, type: "error" | "success") =>
    setToast({ message, type });

  const closeToast = () => setToast(null);

  // Surface the "session expired" message set by the API layer when a refresh
  // fails and the user is bounced back to login (Task 5).
  useEffect(() => {
    const expiredMessage = sessionStorage.getItem("session_expired");
    if (expiredMessage) {
      sessionStorage.removeItem("session_expired");
      showToast(expiredMessage, "error");
    }
  }, []);
  
const handleLogin = async () => {

  if (!username || !password) {
    showToast("Please fill in all fields.", "error");
    return;
  }

  setLoading(true);
  
  try {
    const data = await loginUser(username, password);
    const user = data.data.user;
    const tokens = data.data.tokens;

    localStorage.setItem("access", tokens.access);
    localStorage.setItem("refresh", tokens.refresh);
    localStorage.setItem("user_id", String(user.id));
    localStorage.setItem("username", user.username);
    localStorage.setItem("name", user.name);
    localStorage.setItem("role", user.role);
    localStorage.setItem("role_display", user.role_display || user.role);
    localStorage.setItem("company_id", String(user.company?.id || ""));
    localStorage.setItem("company_name", user.company?.name || "");
    localStorage.setItem("main_group_id", String(user.main_group?.id || ""));
    localStorage.setItem("main_group_name", user.main_group?.name || "");

    // Register this browser with the backend. Fire-and-forget: best-effort
    // telemetry that must never block, delay or fail login. Retries by itself
    // on the next authenticated session if it fails now.
    void webDeviceService.onAuthenticated("login");

    // Fetch dynamic UI labels once for this session and cache them. Same
    // fire-and-forget contract: never blocks login, and any screen falls back
    // to hardcoded text until it resolves.
    void loadUILabels(true);
    void loadUIFields(true);

    showToast("Login successful. Redirecting...", "success");

    // Landing: tracker users go to their first tracker page (they have no
    // Dashboard); legal reviewers to their workspace; everyone else Dashboard.
    const landingPath = landingPathFor(user.role);
    // Carry any notification deep-link params (openOrderId / notificationId) so
    // a notification tapped while logged out still opens the exact order after
    // login instead of dropping the user on the dashboard.
    const deepLink = window.location.search;
    setTimeout(() => navigate(`${landingPath}${deepLink}`), 1000);

  } catch (error) {
    console.error(error);
    showToast("Invalid username or password.", "error");
  } finally {
    setLoading(false);
  }
};

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleLogin();
  };

  return (
    <>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}

      <div className="lp-page">
        <div className="lp-card-wrap">
          <div className="lp-card">
            <h2 className="lp-heading">Sign in to your account</h2>
            <p className="lp-subtext">Enter your credentials to continue.</p>

            <div className="lp-field">
              <label className="lp-label">Username</label>
              <div className="lp-input-wrap">
                <input
                  className="lp-input"
                  type="text"
                  placeholder="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  onKeyDown={onKey}
                  autoComplete="username"
                />
              </div>
            </div>

            <div className="lp-field">
              <label className="lp-label">Password</label>
              <div className="lp-input-wrap">
                <input
                  className="lp-input"
                  type={showPass ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={onKey}
                  autoComplete="current-password"
                />

                <button
                  className="lp-eye-btn"
                  type="button"
                  onClick={() => setShowPass((prev) => !prev)}
                >
                  {showPass ? (
                    <svg
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M3 3l18 18M10.477 10.477A3 3 0 0013.5 13.5M6.228 6.228A10.45 10.45 0 002.458 12C3.732 16.057 7.523 19 12 19c1.7 0 3.3-.425 4.7-1.175M9.756 4.82A9.568 9.568 0 0112 4.5c4.478 0 8.268 2.943 9.542 7a10.49 10.49 0 01-1.552 3.145"
                      />
                    </svg>
                  ) : (
                    <svg
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              className="lp-btn"
              onClick={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="lp-spinner" />
                  <span>Signing in...</span>
                </>
              ) : (
                <span>Log in to your account</span>
              )}
            </button>
          </div>
        </div>
      </div>

    </>
  );
}
