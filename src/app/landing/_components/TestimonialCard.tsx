"use client";

// components/testimonials/TestimonialCard.tsx

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Testimonial } from "@/app/_constant";

interface TestimonialCardProps {
  testimonial: Testimonial;
  /** Whether this card is the focused/active one (brighter border) */
  isActive?: boolean;
}

export default function TestimonialCard({
  testimonial,
  isActive = false,
}: TestimonialCardProps) {
  const { name, rating, review, avatarUrl, avatarInitial } = testimonial;

  return (
    <div
      className={cn(
        "flex flex-col justify-between h-full border p-6 transition-colors duration-300",
        isActive
          ? "border-primary/30 bg-muted/40"
          : "opacity-70 border-muted bg-muted/60"
      )}
    >
      {/* Top: stars + review */}
      <div className="space-y-4">
        {/* Star rating */}
        <div className="flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className="h-4 w-4"
              style={{
                fill: i < rating ? "hsl(45 93% 52%)" : "transparent",
                color: i < rating ? "hsl(45 93% 52%)" : "var(--border)",
              }}
            />
          ))}
        </div>

        {/* Review text — whitespace-pre-line honours \n */}
        <p className="text-sm text-foreground/75 leading-relaxed whitespace-pre-line">
          {review}
        </p>
      </div>

      {/* Bottom: avatar + name */}
      <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border/30">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            className="h-10 w-10 rounded-full object-cover shrink-0"
          />
        ) : (
          <div
            className="h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-primary-foreground shrink-0"
            style={{ background: "var(--gradient-primary)" }}
          >
            {avatarInitial ?? name.charAt(0)}
          </div>
        )}
        <span className="text-sm font-semibold text-foreground/80">{name}</span>
      </div>
    </div>
  );
}