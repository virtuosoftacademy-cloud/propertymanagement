"use client";

// components/landing/LandingDashboard.tsx

import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";

export default function LandingDashboard() {
    return (
        <section
            className="relative overflow-hidden"
        >
            {/* ── Laptop + dashboard mockup ── */}
            <div className="flex justify-center pt-16 px-6 sm:px-12">
                <div className="relative w-full max-w-6xl">

                    {/* Floating mini card — bottom-left */}
                    <div className="absolute left-0 top-1/2 -translate-x-1/5 -translate-y-28 z-10 hidden md:flex flex-col gap-3">
                        <Image
                            src="/images/dashboardsection.png"
                            alt="Tenure Dashboard"
                            width={600}
                            height={800}
                            className="w-54 h-full object-cover object-top"
                        />
                        {/* <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-foreground/70">Total Properties</p>
                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <span className="text-[9px]" style={{ color: "var(--primary)" }}>⊞</span>
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">0</p>
              <p className="text-[10px] text-foreground/45 mt-0.5">All property listings</p>
            </div>
            
            <div className="h-px bg-border" />
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-semibold text-foreground/70">Total Rent Value</p>
                <div className="w-5 h-5 rounded-full bg-green-50 flex items-center justify-center">
                  <ArrowRight className="h-2.5 w-2.5 text-green-500 rotate-[-45deg]" />
                </div>
              </div>
              <p className="text-2xl font-bold text-foreground">N/A</p>
              <p className="text-[10px] text-foreground/45 mt-0.5">Combined monthly potential</p>
            </div> */}
                    </div>

                    {/* Laptop frame */}
                    <div className="relative">
                        {/* Screen bezel */}
                        {/* <div className="bg-gray-900 rounded-t-2xl pt-3 px-3 pb-0 shadow-2xl"> */}
                        {/* Camera notch */}
                        {/* <div className="flex justify-center mb-2">
                <div className="w-2 h-2 rounded-full bg-gray-700" />
              </div> */}
                        {/* Screen */}
                        {/* <div className="bg-white rounded-t-lg overflow-hidden" style={{ height: "420px" }}> */}
                        <Image
                            src="/images/dashboard.png"
                            alt="Tenure Dashboard"
                            width={1120}
                            height={1120}
                            className="w-340 h-full"
                        />
                        {/* </div> */}
                    </div>
                    {/* Laptop base */}
                    {/* <div className="bg-gray-800 h-4 rounded-b-sm w-full" />
            <div className="bg-gray-700 h-2 rounded-b-xl w-[110%] -mx-[5%]" /> */}
                </div>

            </div>
            {/* </div> */}

            {/* ── Text row below laptop ── */}
            <div className="mx-auto max-w-7xl px-12 sm:px-24 pt-14 pb-16">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-10  items-start">

                    {/* Left */}
                    <div className="flex flex-col gap-3">
                        <p className="text-sm font-semibold uppercase tracking-widest text-white/60">
                            Get Free Trial
                        </p>
                        <h4 className="text-2xl md:text-4xl font-semibold text-accent leading-tight">
                            Your Entire Portfolio.
                            <br />
                            One Screen.
                        </h4>
                    </div>

                    {/* Right */}
                    <div className="flex flex-col gap-4 justify-center">
                        <p className="text-sm md:text-lg text-accent/80 leading-tight font-serif">
                            Everything you need to run your properties, live metrics, payment
                            status, maintenance alerts and lease renewals, all visible the
                            moment you log in. No guesswork. Just clarity.
                        </p>
                        {/* <Link
                            href="#"
                            className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:opacity-75 transition-opacity"
                        >
                            Read More
                            <ArrowRight className="h-4 w-4" />
                        </Link> */}
                    </div>

                </div>
            </div>
            <div className="absolute top-1/2 inset-0 bg-primary -z-10 max-h-3/4 -mt-40"/>

        </section>
    );
}