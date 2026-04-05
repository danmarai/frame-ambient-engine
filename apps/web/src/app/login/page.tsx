"use client";

import { useState } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    setError(null);

    const result = await login(formData);

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-frame-border bg-frame-surface p-8">
        <h1 className="mb-2 text-center text-2xl font-semibold text-frame-text">
          Frame Ambient Engine
        </h1>
        <p className="mb-8 text-center text-sm text-frame-muted">
          Operator Console
        </p>

        <form action={handleSubmit}>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="mb-2 block text-sm text-frame-muted"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full rounded-md border border-frame-border bg-frame-bg px-4 py-2.5 text-frame-text placeholder-frame-muted focus:border-frame-accent focus:outline-none focus:ring-1 focus:ring-frame-accent"
              placeholder="Enter operator password"
            />
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-frame-error/10 px-4 py-2 text-sm text-frame-error">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-frame-accent px-4 py-2.5 font-medium text-white transition-colors hover:bg-frame-accent/90 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
