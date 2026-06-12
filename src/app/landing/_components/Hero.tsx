
import { Button } from "@/components/ui/button";

export default function Hero() {
  return (
    <section className="relative overflow-hidden min-h-screen -z-20 flex items-center -mt-25">

      {/* Background image */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('images/herolanding.png')",
        }}
      />

      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/50 pointer-events-none" />

      {/* Content — left-aligned, bottom half */}
      <div className="relative w-full px-6 sm:px-14 pb-24 pt-30 md:pt-60 max-w-6xl">
        <div className="flex flex-col gap-6 text-center md:text-left">

          {/* Heading */}
          <h4 className="text-4xl md:text-[3.5rem] font-medium text-white leading-tight">
            Your Properties. Perfectly Managed
          </h4>

          {/* Subtitle */}
          <p className="text-sm md:text-base text-white/80 leading-relaxed max-w-2xl">
            Stop juggling in spreadsheets and missed calls. Nexus brings every
            lease, payment and tenant conversation under one roof, so you can
            manage smarter, respond faster and grow without the chaos.
          </p>

          {/* CTA */}
          <div className="z-0">
            <Button
              className="cursor-pointer p-6 font-medium px-8 rounded-none text-accent hover:text-foreground bg-primary hover:bg-secondary"
            >
              Start for Free
            </Button>
          </div>

        </div>
      </div>
    </section>
  );
}