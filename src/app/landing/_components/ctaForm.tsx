"use client";

// components/contact/CtaForm.tsx

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const SERVICES = [
  "UK Accounting & Tax",
  "UAE Accounting & Tax",
  "Property Accounting & Tax",
  "Construction Accounting",
  "Advisory Services",
  "Technology & Solutions",
  "Tax Authority Support",
];

// Paste your Google Apps Script Web App /exec URL here
const GOOGLE_SCRIPT_URL = process.env.NEXT_PUBLIC_GOOGLE_SHEET_WEBHOOK_URL ?? "";

export default function CtaForm() {
  const [email, setEmail]     = useState("");
  const [service, setService] = useState("");
  const [status, setStatus]   = useState<"idle" | "loading" | "success" | "error">("idle");

  const handleSubmit = async () => {
    if (!email || !service) {
      setStatus("error");
      return;
    }

    setStatus("loading");

    // URLSearchParams — same pattern as FormPage.tsx for maximum compatibility
    const params = new URLSearchParams();
    params.append("email",   email);
    params.append("service", service);
    params.append("date",    new Date().toISOString());

    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", // required — Google Apps Script redirects through googleusercontent.com
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: params.toString(),
      });

      // no-cors always returns an opaque response (status 0),
      // so we optimistically treat every non-throw as success
      setStatus("success");
      setEmail("");
      setService("");
    } catch {
      console.error("Failed to submit form");
      setStatus("error");
    }
  };

  return (
    <section className="py-20 px-6 sm:px-12 border my-10 md:my-20">
      <div className="mx-auto max-w-850">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-start">

          {/* ── Left ── */}
          <div className="flex flex-col gap-10">
            <h4 className="text-2xl md:text-[2rem] text-foreground leading-tight">
              Ready to <span className="text-primary">talk?</span>
            </h4>

            <div className="flex flex-col gap-4">
              <p className="text-xl md:text-[2rem] text-foreground">
                I want to talk to your experts in:
              </p>

              <Select
                value={service}
                onValueChange={setService}
                disabled={status === "loading" || status === "success"}
              >
                <SelectTrigger className="w-3xs md:w-lg rounded-none px-0 border-0 border-b border-primary bg-transparent text-2xl md:text-[2rem] pt-5 pb-5 focus:ring-0 focus:border-primary font-semibold">
                  <SelectValue placeholder="Select a service" />
                </SelectTrigger>
                <SelectContent className="space-y-10 md:ml-3">
                  {SERVICES.map((s) => (
                    <SelectItem
                      key={s}
                      value={s}
                      className="text-base md:text-[1.50rem] font-semibold text-accent-foreground/70"
                    >
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* ── Right ── */}
          <div className="flex flex-col gap-6">
            <p className="text-sm md:text-base text-foreground/80 font-serif leading-relaxed">
              Not every enquiry becomes an engagement — and that&apos;s
              intentional. We review each submission carefully to ensure the
              relationship would be focused, proportionate, and genuinely
              useful. Submit your enquiry and a senior advisor will be in touch
              within 1–2 working days.
            </p>

            <Input
              type="email"
              placeholder="Your Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "loading" || status === "success"}
              className="rounded-none bg-transparent border border-foreground/25 text-foreground/60 placeholder:text-foreground/35 focus-visible:ring-0 focus-visible:border-primary py-6 px-4"
            />

            {status === "error" && (
              <p className="text-sm text-red-500">
                Please fill in both fields and try again.
              </p>
            )}
            {status === "success" && (
              <p className="text-sm text-green-600">
                Thank you — we&apos;ll be in touch within 1–2 working days.
              </p>
            )}

            <div>
              <Button
                onClick={handleSubmit}
                disabled={status === "loading" || status === "success"}
                className="px-10 py-6 font-medium text-sm rounded-none hover:bg-secondary hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {status === "loading" ? "Sending…" : status === "success" ? "Sent ✓" : "Contact Us"}
              </Button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}