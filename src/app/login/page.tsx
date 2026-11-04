"use client";

import { motion, type Variants } from "framer-motion";
import { Building2, Eye, EyeOff, LoaderCircle, LogIn, School, ShieldCheck, Truck } from "lucide-react";
import Image from "next/image";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { easeOut, MotionProvider } from "@/components/admin/motion";
import { Field, Notice, PrimaryButton, controlClass } from "@/components/admin/ui";
import { fieldErrorMap, formErrorText } from "@/lib/validation/messages";
import { ValidatedForm } from "@/components/admin/validated-form";

const demoAccounts =
  process.env.NODE_ENV === "development"
    ? [
        { label: "School admin", email: "schooladmin@abc.school", password: "ChangeMe123!", icon: School },
        { label: "Platform admin", email: "admin@schooltransport.local", password: "ChangeMe123!", icon: ShieldCheck },
      ]
    : [];

const highlights = [
  { icon: School, title: "Schools", text: "BLE card boarding, live bus location, and alerts for parents." },
  { icon: Building2, title: "Companies", text: "Card-based attendance with out-of-office review and payroll reports." },
  { icon: Truck, title: "Fleets", text: "GPS trucks on a live map, trip playback, and daily reports." },
];

const panelVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};

function BrandPanel() {
  return (
    <section className="relative hidden overflow-hidden bg-linear-to-br from-sidebar via-brand-950 to-sidebar-deep text-white lg:flex lg:w-[52%] lg:flex-col">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full bg-brand-600/25 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -bottom-48 -left-32 h-[460px] w-[460px] rounded-full bg-aqua-500/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-[22%] right-[16%]" aria-hidden="true">
        {[220, 340, 460, 580].map((size, index) => (
          <motion.span
            key={size}
            className="absolute left-1/2 top-1/2 rounded-full border border-aqua-300/15"
            style={{ width: size, height: size, marginLeft: -size / 2, marginTop: -size / 2 }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.15 * index, ease: easeOut }}
          />
        ))}
        <span className="absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full bg-aqua-400/60 motion-safe:animate-ping" />
        <span className="absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full bg-aqua-400 shadow-[0_0_24px_6px_rgba(1,187,225,0.45)]" />
      </div>

      <motion.div className="relative flex flex-1 flex-col px-12 py-10 xl:px-16" variants={panelVariants} initial="hidden" animate="show">
        <motion.div className="flex items-center gap-3" variants={itemVariants}>
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-white shadow-lg shadow-black/20">
            <Image src="/brand/proxitrace-mark.png" alt="" width={40} height={40} preload />
          </span>
          <div>
            <p className="text-xl font-semibold leading-tight tracking-tight">
              Proxi<span className="bg-linear-to-r from-brand-400 to-aqua-300 bg-clip-text text-transparent">Trace</span>
            </p>
            <p className="text-[11px] uppercase tracking-[0.18em] text-aqua-200/80">Smart proximity &amp; tracking platform</p>
          </div>
        </motion.div>

        <div className="my-auto max-w-lg py-12">
          <motion.p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-aqua-200" variants={itemVariants}>
            <span className="h-1.5 w-1.5 rounded-full bg-aqua-400" aria-hidden="true" />
            BLE and GPS in one console
          </motion.p>
          <motion.h2 className="mt-5 text-4xl font-semibold leading-tight tracking-tight xl:text-[2.75rem]" variants={itemVariants}>
            Know who is where,{" "}
            <span className="bg-linear-to-r from-brand-400 via-aqua-300 to-aqua-200 bg-clip-text text-transparent">the moment it matters.</span>
          </motion.h2>
          <motion.p className="mt-4 text-base leading-7 text-slate-300" variants={itemVariants}>
            One place to run student transport, workplace attendance, and fleet tracking, with each organisation&apos;s records kept separate.
          </motion.p>

          <ul className="mt-9 space-y-4">
            {highlights.map((item) => (
              <motion.li key={item.title} className="flex gap-4" variants={itemVariants}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-white/10 bg-white/5 text-aqua-300" aria-hidden="true">
                  <item.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-white">{item.title}</span>
                  <span className="mt-0.5 block text-sm leading-6 text-slate-400">{item.text}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>

        <motion.p className="text-xs text-slate-500" variants={itemVariants}>
          ProxiTrace admin console
        </motion.p>
      </motion.div>
    </section>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
    <ValidatedForm className="w-full" serverErrors={fieldErrors} onInvalid={() => setError("")} onSubmit={onSubmit}>
      <Image src="/brand/proxitrace-logo.png" alt="ProxiTrace, smart proximity and tracking platform" width={960} height={264} sizes="220px" className="mb-8 h-auto w-[220px] mix-blend-multiply lg:hidden" preload />
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Welcome back</h1>
      <p className="mt-2 text-sm leading-6 text-slate-500">Sign in to manage your school, company, or transport fleet.</p>
      {params.get("denied") ? <p className="mt-4 text-sm text-red-700">Use an administrator account for this console.</p> : null}
      <div className="mt-8">
        <Field label="Email">
          <input className={`${controlClass} py-2.5`} name="email" type="email" autoComplete="username" placeholder="you@organisation.com" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </Field>
      </div>
      <div className="relative mt-4">
        <Field label="Password">
          <input className={`${controlClass} py-2.5 pr-11`} name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
        </Field>
        <button
          className="absolute right-1.5 top-[29px] grid h-8 w-8 place-items-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
      {error ? <div className="mt-4"><Notice>{error}</Notice></div> : null}
      <PrimaryButton className="mt-6 w-full gap-2 py-3" disabled={pending}>
        {pending ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogIn className="h-4 w-4" aria-hidden="true" />}
        {pending ? "Signing in..." : "Sign in"}
      </PrimaryButton>
      {demoAccounts.length ? (
        <div className="mt-8">
          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
            <p className="text-xs text-slate-500">Seeded accounts for this local database</p>
            <span className="h-px flex-1 bg-slate-200" aria-hidden="true" />
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {demoAccounts.map((account) => (
              <motion.button
                key={account.email}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-brand-200 hover:bg-brand-50/40"
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => {
                  setEmail(account.email);
                  setPassword(account.password);
                  setError("");
                  setFieldErrors({});
                }}
              >
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700" aria-hidden="true"><account.icon className="h-4 w-4" /></span>
                <span className="min-w-0">
                  {account.label}
                  <span className="mt-0.5 block truncate text-xs text-slate-500">{account.email}</span>
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      ) : null}
    </ValidatedForm>
  );
}

export default function LoginPage() {
  return (
    <MotionProvider>
      <main className="flex min-h-screen bg-background">
        <BrandPanel />
        <section className="relative flex flex-1 items-center justify-center px-6 py-12 sm:px-10">
          <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-brand-50/60 via-transparent to-aqua-50/60 lg:hidden" aria-hidden="true" />
          <motion.div
            className="relative w-full max-w-md"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: easeOut, delay: 0.1 }}
          >
            <Suspense>
              <LoginForm />
            </Suspense>
          </motion.div>
        </section>
      </main>
    </MotionProvider>
  );
}
