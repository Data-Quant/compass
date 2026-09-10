"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export const fieldClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
export function Status({ children }: { children: string }) {
  return (
    <span className="inline-flex rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
      {children.toLowerCase().replaceAll("_", " ")}
    </span>
  );
}
export function Action({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => Promise<unknown>;
  disabled?: boolean;
  variant?: "default" | "outline" | "ghost";
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <div className="inline-flex max-w-full flex-col items-start gap-1">
      <Button
        type="button"
        variant={variant}
        disabled={busy || disabled}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            await onClick();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Action failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Working…" : children}
      </Button>
      {error && (
        <p role="alert" className="max-w-prose text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
