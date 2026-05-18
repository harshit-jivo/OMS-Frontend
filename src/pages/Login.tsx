import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { loginUser } from "../services/authService";
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

  useEffect(() => {
    localStorage.removeItem("access");
    localStorage.removeItem("refresh");
  }, []);
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
  
const handleLogin = async () => {

  if (!username || !password) {
    showToast("Please fill in all fields.", "error");
    return;
  }

  setLoading(true);
  
  try {
    const data = await loginUser(username, password);

    console.log('datatype'+JSON.stringify(data));
    console.log(data);
    localStorage.setItem("access", data.data.tokens.access);
    localStorage.setItem("refresh", data.data.tokens.refresh);
    localStorage.setItem("username", data.data.user.username);
    localStorage.setItem("name", data.data.user.name);

    console.log("Access Token:", data.data.user.username);

    showToast("Login successful. Redirecting...", "success");

    setTimeout(() => navigate("/Dashboard"), 1000);

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
