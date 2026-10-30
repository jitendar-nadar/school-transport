"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Field, Notice, PrimaryButton, controlClass } from "@/components/admin/ui";
import { fieldErrorMap, formErrorText } from "@/lib/validation/messages";
import { ValidatedForm } from "@/components/admin/validated-form";

const demoAccounts =
  process.env.NODE_ENV === "development"
    ? [
        { label: "School admin", email: "schooladmin@abc.school", password: "ChangeMe123!" },
        { label: "Platform admin", email: "admin@schooltransport.local", password: "ChangeMe123!" },
      ]
    : [];

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (params.get("reauth") !== "1") return;
    fetch("/api/v1/auth/refresh", { method: "POST", credentials: "include" }).then((response) => {
      if (response.ok) router.replace("/admin");
    });
  }, [params, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    setFieldErrors({});
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password: password.trim() }),
    });
    const body = await response.json();
    setPending(false);
    if (!response.ok) {
      const fields = fieldErrorMap(body.error?.details);
      setFieldErrors(fields);
      setError(formErrorText(body.error?.details) || (Object.keys(fields).length ? "" : body.error?.message || "Sign in failed."));
      return;
    }
    if (!["PLATFORM_ADMIN", "SCHOOL_ADMIN", "COMPANY_ADMIN", "COMPANY_HR", "FLEET_ADMIN", "EMPLOYEE"].includes(body.data.user.role)) {
      setError("This console is for administrators. Drivers, attendants, and parents use the mobile apps.");
      await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" });
      return;
    }
    router.replace("/admin");
    router.refresh();
  }

  return (
    <ValidatedForm className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-[0_16px_40px_rgba(16,35,63,0.08)]" serverErrors={fieldErrors} onInvalid={() => setError("")} onSubmit={onSubmit}>
      <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-teal-800">Tracking platform</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Admin sign in</h1>
      <p className="mt-1 text-sm leading-6 text-slate-500">Manage a school, a company, or a transport fleet.</p>
      {params.get("denied") ? <p className="mt-4 text-sm text-red-700">Use an administrator account for this console.</p> : null}
      <div className="mt-6">
        <Field label="Email">
          <input className={controlClass} name="email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
      </div>
      <div className="mt-3">
        <Field label="Password">
          <input className={controlClass} name="password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
      </div>
      {error ? <div className="mt-3"><Notice>{error}</Notice></div> : null}
      {demoAccounts.length ? (
        <div className="mt-5 space-y-2">
          <p className="text-xs text-slate-500">Seeded accounts for this local database</p>
          {demoAccounts.map((account) => (
            <button
              key={account.email}
              className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm transition hover:border-slate-300 hover:bg-slate-50"
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(account.password);
                setError("");
                setFieldErrors({});
              }}
            >
              {account.label}
              <span className="mt-0.5 block text-xs text-slate-500">{account.email}</span>
            </button>
          ))}
        </div>
      ) : null}
      <PrimaryButton className="mt-6 w-full py-2.5" disabled={pending}>
        {pending ? "Signing in..." : "Sign in"}
      </PrimaryButton>
    </ValidatedForm>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
