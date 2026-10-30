"use client";

import { createContext, useContext, type ReactNode } from "react";

export type FieldErrors = Record<string, string>;

export const EMPTY_FIELD_ERRORS: FieldErrors = {};

const FormErrorContext = createContext<FieldErrors>(EMPTY_FIELD_ERRORS);

export function FormErrorProvider({ errors, children }: { errors: FieldErrors; children: ReactNode }) {
  return <FormErrorContext.Provider value={errors}>{children}</FormErrorContext.Provider>;
}

export function useFieldError(name: string) {
  return useContext(FormErrorContext)[name] || "";
}
