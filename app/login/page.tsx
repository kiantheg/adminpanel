"use client";

import { useEffect, useState } from "react";
import { missingSupabaseMessage, supabase } from "@/lib/supabase-browser";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    const oauthError = new URLSearchParams(window.location.search).get("error");
    return oauthError ? `Login error: ${oauthError}` : null;
  });

  useEffect(() => {
    if (!supabase) return;

    (async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        setMsg(error.message);
        return;
      }
      if (data.session) {
        window.location.replace("/");
      }
    })();
  }, []);

  const signInWithGoogle = async () => {
    if (!supabase) {
      setMsg(missingSupabaseMessage);
      return;
    }

    setMsg(null);
    setLoading(true);

    const redirectTo = `${window.location.origin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (error) {
      setMsg(error.message);
      setLoading(false);
    }
  };

  return (
    <main className="page">
      <section className="authCard">
        <h1>Admin Panel Login</h1>
        <p className="muted">Sign in with Google to access your admin panel.</p>
        <div className="authActions">
          <button type="button" onClick={signInWithGoogle} disabled={loading || !supabase}>
            {loading ? "Opening Google..." : "Continue with Google"}
          </button>
        </div>
        {msg && <p className="error">Error: {msg}</p>}
      </section>
    </main>
  );
}
