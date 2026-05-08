"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Home,
  ArrowLeft,
  Building2,
  Search,
  FileQuestion,
  MapPin,
} from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/20">
      <Card className="max-w-2xl w-full border-border/60 shadow-2xl overflow-hidden">
        <CardContent className="p-0">
          {/* Decorative Header */}
          <div className="relative h-32 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-8 w-32 h-32 rounded-full bg-primary blur-3xl" />
              <div className="absolute bottom-4 right-8 w-40 h-40 rounded-full bg-primary/60 blur-3xl" />
            </div>
            <div className="relative h-full flex items-center justify-center">
              <div className="relative">
                <Building2 className="size-16 text-primary/30 absolute -top-2 -left-2 blur-sm" />
                <FileQuestion className="size-16 text-primary relative z-10" />
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-8 md:p-12 text-center space-y-6">
            {/* Error Code */}
            <div className="space-y-2">
              <h1 className="text-8xl md:text-9xl font-bold bg-gradient-to-br from-primary via-primary/80 to-primary/60 bg-clip-text text-transparent">
                404
              </h1>
              <div className="h-1 w-24 mx-auto rounded-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            </div>

            {/* Message */}
            <div className="space-y-3">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                Page Not Found
              </h2>
              <p className="text-muted-foreground max-w-md mx-auto leading-relaxed">
                The page you&apos;re looking for doesn&apos;t exist or has been
                moved. Let&apos;s get you back on track.
              </p>
            </div>

            {/* Quick Links */}
            <div className="pt-4">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-muted/50 text-sm text-muted-foreground mb-6">
                <MapPin className="size-4" />
                <span>Lost your way?</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button
                onClick={() => router.back()}
                variant="outline"
                size="lg"
                className="gap-2"
              >
                <ArrowLeft className="size-4" />
                Go Back
              </Button>
              <Button asChild size="lg" className="gap-2">
                <Link href="/">
                  <Home className="size-4" />
                  Go Home
                </Link>
              </Button>
            </div>

            {/* Quick Navigation */}
            <div className="pt-8 border-t border-border/50">
              <p className="text-sm text-muted-foreground mb-4">
                Quick links:
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auth/signin">
                    <Search className="size-3 mr-2" />
                    Sign In
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/dashboard">
                    <Building2 className="size-3 mr-2" />
                    Dashboard
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link href="/auth/signup">Sign Up</Link>
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
