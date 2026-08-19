"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, Loader2, Mail, MailCheck } from "lucide-react";

/**
 * Request a password reset link.
 *
 * The API deliberately answers the same way whether or not the account exists,
 * so this page must not imply otherwise — no "we couldn't find that email", and
 * the confirmation is phrased conditionally. Saying more would turn the form
 * into an account-enumeration oracle.
 *
 * Layout mirrors /auth/signin so the two read as siblings.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json().catch(() => null);

      // Only a malformed address or a server fault reaches this branch — an
      // unknown address still returns success, by design.
      if (!res.ok || json?.success === false) {
        setError(json?.error || "Could not send the reset link. Try again.");
        return;
      }

      setSent(true);
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-accent/50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full space-y-8">

        {/* Header */}
        <div className="text-center">
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900 dark:text-gray-100">
            Reset your password
          </h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            We&apos;ll email you a link to choose a new one
          </p>
        </div>

        <Card>
          {sent ? (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MailCheck className="h-5 w-5 text-primary" />
                  Check your email
                </CardTitle>
                <CardDescription>
                  If an account exists for{" "}
                  <span className="font-medium">{email}</span>, a reset link is
                  on its way. It expires in one hour.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Nothing arrived? Check your spam folder, then try again —
                  requesting a new link replaces any previous one.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    variant="outline"
                    className="sm:flex-1"
                    onClick={() => {
                      setSent(false);
                      setError("");
                    }}
                  >
                    Use a different email
                  </Button>
                  <Button asChild className="sm:flex-1">
                    <Link href="/auth/signin">Back to sign in</Link>
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader>
                <CardTitle>Forgot your password?</CardTitle>
                <CardDescription>
                  Enter the email address you sign in with
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <Input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        className="pl-10"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      "Send reset link"
                    )}
                  </Button>

                  <Link
                    href="/auth/signin"
                    className="flex items-center justify-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back to sign in
                  </Link>
                </form>
              </CardContent>
            </>
          )}
        </Card>

      </div>
    </div>
  );
}
