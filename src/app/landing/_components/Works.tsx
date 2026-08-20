// components/landing/LandingWorks.tsx

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function LandingWorks() {
  return (
    <section className="mx-auto max-w-360 sm:px-6 py-10 md:py-20">
      <div className="grid grid-cols-1 md:grid-cols-2">

        {/* Left: image */}
        <div className="w-full h-[300px] md:h-auto overflow-hidden">
          <img
            src="assets/landingworks.png"
            alt="Property buildings"
            className="w-full h-full object-cover hover:scale-105 transition duration-400"
          />
        </div>

        {/* Right: text */}
        <div className="flex flex-col justify-center gap-6 px-6 sm:px-14 md:text-left text-center py-16">

          {/* Heading */}
          <h4 className="text-2xl md:text-4xl font-bold text-foreground leading-snug">
            Built for the Way Property
            <br />
            Management Actually{" "}
            <span className="text-primary">Works.</span>
          </h4>

          {/* Body */}
          <div className="font-serif text-sm md:text-lg text-foreground/60 leading-relaxed">
            <p>
              Managing properties isn't just about collecting rent, it's about
              staying on top of dozens of moving parts, all at once. Tenure was
              built to bring order to that complexity. We created a centralized
              platform that gives property managers complete visibility and
              control, from tracking individual rooms within a property, to
              managing tenants, automating billing and keeping every record
              exactly where you need it.
            </p>
            <p>
              Whether you manage one building or twenty, Tenure adapts to your
              scale, so nothing slips through the cracks.
            </p>
          </div>

          {/* CTA */}
          <div>
            <Link href={"/about"}>
              <Button className="p-6 !font-medium hover:text-foreground hover:bg-secondary transition">
                Read More
              </Button>
            </Link>
          </div>

        </div>
      </div>
    </section>
  );
}