"use client";

import { Button } from "@/components/ui/button";
import { ArrowRight, PhoneCall, Briefcase } from "lucide-react";

export function CtaSplitSection() {
  return (
    <section className="flex flex-col md:flex-row bg-primary items-center">
      {/* Business owners */}
      <div
        className="p-16 text-accent relative overflow-hidden">
        {/* Subtle glow */}
        {/* <div
          className="absolute top-0 right-0 w-48 h-48 rounded-full opacity-20 blur-3xl pointer-events-none"
        /> */}
        <div className="relative">
          {/* <p className="text-[10px] tracking-widest uppercase font-bold mb-3 text-primary-foreground/70">
            For Business Owners
          </p> */}
          <p className="text-2xl md:text-4xl font-semibold mb-3 leading-snug text-primary-foreground">
            Reporting gaps, VAT exposure, governance weaknesses — they don't announce themselves. They compound. Until a lender, an auditor, or HMRC asks the question you can't answer cleanly.
          </p>
          {/* <p className="text-sm leading-relaxed mb-7 text-primary-foreground/75">
            Book a no-obligation discovery call and find out how we can help you build something
            that scales.
          </p> */}
          <Button variant={"secondary"}
            className="p-5 hover:bg-accent hover:text-foreground"
          >
            Book a Discovery Call
          </Button>
        </div>
      </div>
    
    </section>
  );
}