/**
 * PropertyPro - Stripe Client Integration
 * Complete Stripe payment processing with error handling and security
 */

import {
  loadStripe,
  Stripe,
  StripeElements,
  StripeCardElement,
} from "@stripe/stripe-js";
import {
  PropertyProError,
  ErrorType,
  handlePaymentError,
} from "./error-handling";

// Initialize Stripe
let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!);
  }
  return stripePromise;
};

export interface PaymentMethod {
  id: string;
  type: "card" | "bank_account";
  card?: {
    brand: string;
    last4: string;
    exp_month: number;
    exp_year: number;
  };
  bank_account?: {
    bank_name: string;
    last4: string;
    account_type: string;
  };
  billing_details: {
    name: string;
    email: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
}

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "requires_action"
    | "processing"
    | "succeeded"
    | "canceled";
  client_secret: string;
  payment_method?: string;
  last_payment_error?: any;
}

export interface CreatePaymentMethodData {
  type: "card";
  card: StripeCardElement;
  billing_details: {
    name: string;
    email: string;
    address?: {
      line1: string;
      line2?: string;
      city: string;
      state: string;
      postal_code: string;
      country: string;
    };
  };
}

export class StripePaymentClient {
  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;

  async initialize(): Promise<void> {
    this.stripe = await getStripe();
    if (!this.stripe) {
      throw new PropertyProError(
        ErrorType.PAYMENT,
        "Failed to initialize payment system",
        { code: "PAYMENT_INIT_ERROR" }
      );
    }
  }

  createElements(options?: any): StripeElements {
    if (!this.stripe) {
      throw new PropertyProError(
        ErrorType.PAYMENT,
        "Payment system not initialized",
        { code: "PAYMENT_NOT_INITIALIZED" }
      );
    }

    this.elements = this.stripe.elements({
      appearance: {
        theme: "stripe",
        variables: {
          colorPrimary: "#0570de",
          colorBackground: "#ffffff",
          colorText: "#30313d",
          colorDanger: "#df1b41",
          fontFamily: "Inter, system-ui, sans-serif",
          spacingUnit: "4px",
          borderRadius: "6px",
        },
      },
      ...options,
    });

    return this.elements;
  }

  async createPaymentMethod(
    data: CreatePaymentMethodData
  ): Promise<PaymentMethod> {
    if (!this.stripe) {
      throw new PropertyProError(
        ErrorType.PAYMENT,
        "Payment system not initialized",
        { code: "PAYMENT_NOT_INITIALIZED" }
      );
    }

    try {
      const { error, paymentMethod } = await this.stripe.createPaymentMethod(
        data
      );

      if (error) {
        throw handlePaymentError(error);
      }

      if (!paymentMethod) {
        throw new PropertyProError(
          ErrorType.PAYMENT,
          "Failed to create payment method",
          { code: "PAYMENT_METHOD_CREATION_FAILED" }
        );
      }

      return {
        id: paymentMethod.id,
        type: paymentMethod.type as "card" | "bank_account",
        card: paymentMethod.card
          ? {
              brand: paymentMethod.card.brand,
              last4: paymentMethod.card.last4,
              exp_month: paymentMethod.card.exp_month,
              exp_year: paymentMethod.card.exp_year,
            }
          : undefined,
        billing_details: paymentMethod.billing_details as any,
      };
    } catch (error) {
      throw handlePaymentError(error);
    }
  }

  async confirmPayment(
    clientSecret: string,
    paymentMethodId?: string
  ): Promise<PaymentIntent> {
    if (!this.stripe) {
      throw new PropertyProError(
        ErrorType.PAYMENT,
        "Payment system not initialized",
        { code: "PAYMENT_NOT_INITIALIZED" }
      );
    }

    try {
      const { error, paymentIntent } = await this.stripe.confirmPayment({
        clientSecret,
        confirmParams: paymentMethodId
          ? {
              payment_method: paymentMethodId,
            }
          : undefined,
        redirect: "if_required",
      });

      if (error) {
        throw handlePaymentError(error);
      }

      if (!paymentIntent) {
        throw new PropertyProError(
          ErrorType.PAYMENT,
          "Payment confirmation failed",
          { code: "PAYMENT_CONFIRMATION_FAILED" }
        );
      }

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        client_secret: paymentIntent.client_secret!,
        payment_method: paymentIntent.payment_method as string,
        last_payment_error: paymentIntent.last_payment_error,
      };
    } catch (error) {
      throw handlePaymentError(error);
    }
  }

  async retrievePaymentIntent(clientSecret: string): Promise<PaymentIntent> {
    if (!this.stripe) {
      throw new PropertyProError(
        ErrorType.PAYMENT,
        "Payment system not initialized",
        { code: "PAYMENT_NOT_INITIALIZED" }
      );
    }

    try {
      const { error, paymentIntent } = await this.stripe.retrievePaymentIntent(
        clientSecret
      );

      if (error) {
        throw handlePaymentError(error);
      }

      if (!paymentIntent) {
        throw new PropertyProError(
          ErrorType.PAYMENT,
          "Payment intent not found",
          { code: "PAYMENT_INTENT_NOT_FOUND" }
        );
      }

      return {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        client_secret: paymentIntent.client_secret!,
        payment_method: paymentIntent.payment_method as string,
        last_payment_error: paymentIntent.last_payment_error,
      };
    } catch (error) {
      throw handlePaymentError(error);
    }
  }
}

// API client for server-side Stripe operations
export class StripeApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = "/api") {
    this.baseUrl = baseUrl;
  }

  async createPaymentIntent(data: {
    amount: number;
    currency?: string;
    paymentMethodId?: string;
    customerId?: string;
    metadata?: Record<string, string>;
  }): Promise<PaymentIntent> {
    try {
      const response = await fetch(`${this.baseUrl}/stripe/payment-intents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: Math.round(data.amount * 100), // Convert to cents
          currency: data.currency || "usd",
          payment_method: data.paymentMethodId,
          customer: data.customerId,
          metadata: data.metadata,
          automatic_payment_methods: {
            enabled: true,
          },
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new PropertyProError(
          ErrorType.PAYMENT,
          errorData.message || "Failed to create payment intent",
          { code: "PAYMENT_INTENT_CREATION_FAILED", details: errorData }
        );
      }

      const paymentIntent = await response.json();
      return paymentIntent;
    } catch (error) {
      throw handlePaymentError(error);
    }
  }

  async attachPaymentMethod(
    paymentMethodId: string,
    customerId: string
  ): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/stripe/payment-methods/${paymentMethodId}/attach`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            customer: customerId,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new PropertyProError(
          ErrorType.PAYMENT,
          errorData.message || "Failed to attach payment method",
          { code: "PAYMENT_METHOD_ATTACH_FAILED", details: errorData }
        );
      }
    } catch (error) {
      throw handlePaymentError(error);
    }
  }

  async detachPaymentMethod(paymentMethodId: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.baseUrl}/stripe/payment-methods/${paymentMethodId}/detach`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new PropertyProError(
          ErrorType.PAYMENT,
          errorData.message || "Failed to detach payment method",
          { code: "PAYMENT_METHOD_DETACH_FAILED", details: errorData }
        );
      }
    } catch (error) {
      throw handlePaymentError(error);
    }
  }

  async getCustomerPaymentMethods(
    customerId: string
  ): Promise<{ methods: PaymentMethod[]; customerId: string }> {
    try {
      const response = await fetch(
        `${this.baseUrl}/stripe/customers/${customerId}/payment-methods`
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new PropertyProError(
          ErrorType.PAYMENT,
          errorData.message || "Failed to retrieve payment methods",
          { code: "PAYMENT_METHODS_RETRIEVAL_FAILED", details: errorData }
        );
      }

      const { data, customerId: resolvedCustomerId } = await response.json();

      return {
        methods: data,
        customerId: resolvedCustomerId ?? customerId,
      };
    } catch (error) {
      throw handlePaymentError(error);
    }
  }
}

// Singleton instances
export const stripeClient = new StripePaymentClient();
export const stripeApiClient = new StripeApiClient();
