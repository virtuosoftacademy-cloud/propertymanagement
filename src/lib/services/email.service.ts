/**
 * PropertyPro - Email Service
 * Email sending service with SMTP/Nodemailer support
 */

import { emailConfig } from "@/lib/config/email.config";

export interface EmailData {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  attachments?: Array<{
    filename: string;
    content: string | Buffer;
    contentType?: string;
  }>;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class EmailService {
  private nodemailerTransporter: any;

  constructor() {
    this.initializeProvider();
  }

  private async initializeProvider() {
    try {
      const { createTransport } = await import("nodemailer");
      this.nodemailerTransporter = createTransport({
        host: emailConfig.smtp.host,
        port: emailConfig.smtp.port,
        secure: emailConfig.smtp.secure,
        auth: emailConfig.smtp.auth,
      });

    } catch (error) {
      console.error("Failed to initialize SMTP:", error);
    }
  }

  async sendEmail(emailData: EmailData): Promise<EmailResult> {
    try {
      if (!this.nodemailerTransporter) {
        throw new Error("Email service not configured");
      }

      return await this.sendWithSMTP(emailData);
    } catch (error) {
      console.error("Email sending failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private async sendWithSMTP(emailData: EmailData): Promise<EmailResult> {
    try {
      const mailOptions = {
        from: emailData.from || emailConfig.smtp.from,
        to: Array.isArray(emailData.to)
          ? emailData.to.join(", ")
          : emailData.to,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text,
        replyTo: emailData.replyTo,
        attachments: emailData.attachments,
      };

      const info = await this.nodemailerTransporter.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error: any) {
      console.error("SMTP error:", error);
      return {
        success: false,
        error: error.message || "SMTP sending failed",
      };
    }
  }

  async sendBulkEmails(emails: EmailData[]): Promise<EmailResult[]> {
    const results: EmailResult[] = [];

    // Process emails in batches to avoid rate limits
    const batchSize = 10;
    for (let i = 0; i < emails.length; i += batchSize) {
      const batch = emails.slice(i, i + batchSize);
      const batchPromises = batch.map((email) => this.sendEmail(email));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);

      // Add delay between batches
      if (i + batchSize < emails.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  async verifyConnection(): Promise<boolean> {
    try {
      if (this.nodemailerTransporter) {
        await this.nodemailerTransporter.verify();
        return true;
      }
      return false;
    } catch (error) {
      console.error("Email service verification failed:", error);
      return false;
    }
  }

  getProviderInfo(): { provider: string; configured: boolean } {
    return {
      provider: "smtp",
      configured: !!this.nodemailerTransporter,
    };
  }
}

export const emailService = new EmailService();
