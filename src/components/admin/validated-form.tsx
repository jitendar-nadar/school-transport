"use client";

import { useEffect, useMemo, useRef, useState, type FocusEvent, type FormEvent, type ReactNode } from "react";
import { EMPTY_FIELD_ERRORS, FormErrorProvider, type FieldErrors } from "@/components/admin/form-error-context";
import { Notice } from "@/components/admin/ui";
import { ApiError } from "@/lib/admin/api";

export const passwordHint = "Password must be at least 8 characters and include a letter and a number.";
export const passwordPattern = "(?=.*[A-Za-z])(?=.*\\d).{8,}";
export const timePattern = "([01][0-9]|2[0-3]):[0-5][0-9]";
export const timeHint = "Use a time like 09:30.";

function labelFor(element: HTMLElement) {
  const label = element.closest("label");
  const text = label?.querySelector("span")?.textContent?.trim() || element.getAttribute("aria-label") || "";
  return text || "This field";
}

function messageFor(element: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) {
  if (element.disabled || element.type === "hidden" || element.type === "button" || element.type === "submit") return "";
  const label = labelFor(element);
  if (element.validity.valid) {
    if ("minLength" in element && element.minLength > 0 && element.value.length > 0 && element.value.length < element.minLength) {
      return `${label} must be at least ${element.minLength} characters.`;
    }
    return "";
  }
  const validity = element.validity;
  if (validity.valueMissing) {
    if (!(element instanceof HTMLSelectElement)) return `${label} is required.`;
    const noun = label.toLowerCase();
    return `Choose ${/^[aeiou]/.test(noun) ? "an" : "a"} ${noun}.`;
  }
  if (validity.typeMismatch && element instanceof HTMLInputElement && element.type === "email") return "Enter a valid email address.";
  if (validity.typeMismatch) return `${label} is not valid.`;
  if (validity.tooShort) return `${label} must be at least ${"minLength" in element ? element.minLength : element.getAttribute("minlength")} characters.`;
  if (validity.tooLong) return `${label} must be ${"maxLength" in element ? element.maxLength : element.getAttribute("maxlength")} characters or fewer.`;
  if (validity.rangeUnderflow) return `${label} must be at least ${element.getAttribute("min")}.`;
  if (validity.rangeOverflow) return `${label} must be at most ${element.getAttribute("max")}.`;
  if (validity.stepMismatch) return `${label} is not a valid number.`;
  if (validity.patternMismatch) return element.title || `${label} is not in the expected format.`;
  if (validity.badInput) return `Enter a valid ${label.toLowerCase()}.`;
  return element.validationMessage || `${label} is not valid.`;
}

export function invalidFields(form: HTMLFormElement) {
  const errors: FieldErrors = {};
  const elements = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea");
  for (const element of elements) {
    if (!element.name || errors[element.name]) continue;
    const message = messageFor(element);
    if (message) errors[element.name] = message;
  }
  return errors;
}

function summary(errors: FieldErrors) {
  return Object.values(errors).join(" ");
}

export function failureOf(caught: unknown, fallback: string) {
  if (caught instanceof ApiError) return { message: caught.message, fields: caught.fields };
  return {
    message: caught instanceof Error ? caught.message : fallback,
    fields: {} as FieldErrors,
  };
}

export function ValidatedForm({
  className,
  onSubmit,
  serverErrors = EMPTY_FIELD_ERRORS,
  onInvalid,
  children,
}: {
  className?: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  serverErrors?: FieldErrors;
  onInvalid?: () => void;
  children: ReactNode;
}) {
  const [clientErrors, setClientErrors] = useState<FieldErrors>({});
  const [dismissed, setDismissed] = useState<string[]>([]);
  const attempted = useRef(false);
  const serverKey = JSON.stringify(serverErrors);

  useEffect(() => {
    setDismissed([]);
  }, [serverKey]);

  const errors = useMemo(() => {
    const merged = { ...serverErrors, ...clientErrors };
    for (const name of dismissed) delete merged[name];
    return merged;
  }, [serverErrors, clientErrors, dismissed]);

  function focusFirst(form: HTMLFormElement, found: FieldErrors) {
    const name = Object.keys(found)[0];
    if (!name) return;
    const named = form.elements.namedItem(name);
    const element = named instanceof RadioNodeList ? named[0] : named;
    if (element instanceof HTMLElement) element.focus();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    attempted.current = true;
    const found = invalidFields(event.currentTarget);
    setClientErrors(found);
    setDismissed([]);
    if (Object.keys(found).length) {
      event.preventDefault();
      onInvalid?.();
      focusFirst(event.currentTarget, found);
      return;
    }
    setClientErrors({});
    onSubmit(event);
  }

  function clearName(name: string) {
    setDismissed((current) => (current.includes(name) ? current : [...current, name]));
    setClientErrors((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }

  function handleChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (!target.name || target.type === "hidden") return;
    clearName(target.name);
  }

  function handleBlur(event: FocusEvent<HTMLFormElement>) {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    if (!target.name || target.type === "hidden") return;
    const empty = target instanceof HTMLInputElement && target.type !== "checkbox" ? !target.value.trim() : !target.value;
    if (!attempted.current && empty) return;
    const message = messageFor(target);
    if (!attempted.current && !message) return;
    setClientErrors((current) => {
      if (!message && !current[target.name]) return current;
      const next = { ...current };
      if (message) next[target.name] = message;
      else delete next[target.name];
      return next;
    });
    if (message) setDismissed((current) => current.filter((name) => name !== target.name));
  }

  const text = summary(errors);

  return (
    <FormErrorProvider errors={errors}>
      <form className={className} noValidate onBlur={handleBlur} onChange={handleChange} onSubmit={handleSubmit}>
        {text ? <div className={className?.includes("md:grid-cols") ? "md:col-span-3" : undefined}><Notice>{text}</Notice></div> : null}
        {children}
      </form>
    </FormErrorProvider>
  );
}
