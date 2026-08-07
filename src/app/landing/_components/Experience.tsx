// components/landing/LandingExperience.tsx

import Link from "next/link";
import { TrendingUp, Compass, Command } from "lucide-react";

interface FeatureCard {
  icon: React.ReactNode;
  title: string;
  description: string;
  href: string;
}

const features: FeatureCard[] = [
  {
    icon: <TrendingUp className="h-5 w-5" style={{ color: "var(--primary)" }} />,
    title: "Your Entire Portfolio at One Place",
    description:
      "No more switching between files and folders. Every property, unit and document lives in one organized system, accessible anytime, from anywhere.",
    href: "#",
  },
  {
    icon: <TrendingUp className="h-5 w-5" style={{ color: "var(--primary)" }} />,
    title: "Rent That Collects Itself",
    description:
      "Set it up once and let Tenure handle the rest. Automated billing, payment tracking and reconciliation so your cash flow stays consistent without the follow-up.",
    href: "#",
  },
  {
    icon: <Compass className="h-5 w-5" style={{ color: "var(--primary)" }} />,
    title: "Maintenance, Without the Mess",
    description:
      "Tenants log issues with ease. You assign, oversee and resolve with full visibility into every open and closed request at every stage.",
    href: "#",
  },
  {
    icon: <Command className="h-5 w-5" style={{ color: "var(--primary)" }} />,
    title: "Data That Actually Helps You Grow",
    description:
      "Know exactly how your portfolio is performing. Occupancy trends, revenue snapshots and key metrics presented clearly, so you can act on them quickly.",
    href: "#",
  },
];

export default function LandingExperience() {
  return (
    <section className="bg-foreground/5 py-20">
      <div className="mx-auto max-w-850 px-6 sm:px-14 bg-primary/5">

        {/* ── Heading ── */}
        <div className="flex items-center gap-4 mb-4">
          <div className="flex-1 h-px bg-border" />
          <h4 className="text-2xl md:text-4xl font-bold text-foreground text-center md:whitespace-nowrap">
            Powerful Tools. Simple{" "}
            <span className="text-primary">Experience.</span>
          </h4>
          <div className="flex-1 h-px bg-border" />
        </div>

        <p className="text-sm md:text-lg font-medium text-foreground/55 text-center leading-relaxed font-serif mb-12">
          Every feature in Tenure is designed to remove friction and put you in
          full control of your properties.
        </p>

        {/* ── 4-col cards ── */}
        <div className="flex flex-wrap lg:flex-nowrap mx-auto max-w-360 sm:px-4 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="flex flex-col justify-between border border-border bg-background p-8 gap-8 max-w-xs group hover:bg-primary transition-colors duration-300"
            >
              {/* Top */}
              <div className="flex flex-col gap-5">
                {/* Icon circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-primary/10 group-hover:bg-white transition-colors duration-300">
                  {f.icon}
                </div>

                {/* Title */}
                <h4 className="text-base md:text-xl font-semibold text-foreground group-hover:text-white leading-snug transition-colors duration-300">
                  {f.title}
                </h4>

                {/* Description */}
                <p className="font-serif text-sm md:text-lg text-foreground/55 group-hover:text-accent leading-relaxed transition-colors duration-300">
                  {f.description}
                </p>
              </div>

              {/* Read More */}
              <Link
                href={f.href}
                className="inline-flex items-center gap-1 text-base text-primary group-hover:text-white font-semibold transition-colors duration-300 hover:opacity-70"
              >
                Read More
                <span className="text-xs">▶</span>
              </Link>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}