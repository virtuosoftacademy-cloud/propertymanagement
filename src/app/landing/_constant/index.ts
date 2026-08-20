// Testimonials

export interface Testimonial {
  id: string;
  name: string;
  rating: number; // out of 5
  review: string;
  avatarUrl?: string; // optional — falls back to initials
  avatarInitial?: string;
}

export const testimonials: Testimonial[] = [
  {
    id: "t-1",
    name: "Zeynep Kara",
    rating: 5,
    review:
      "I enlisted the help of this Accountancy Firm after after i was badly let down from my previous Accountants in London.\nThis Firm has helped me soooo much. They have brought my Company tax affairs in order, and i have never been happier.\nI would highly recommend them! 😊😊😊",
    avatarUrl: "https://randomuser.me/api/portraits/women/44.jpg",
  },
  {
    id: "t-2",
    name: "Faraz Ahmed",
    rating: 5,
    review:
      "I was looking for a good, professional and affordable accountant in London and am very glad to find Alpha Tax & Accounting. I am very pleased with the service and expertise. They are great! Thank you, team.",
    avatarInitial: "F",
  },
  {
    id: "t-3",
    name: "Faizan Ahmed",
    rating: 5,
    review:
      "Professional and problem solver\nUp to date information and to the point advice\nThanks for all the help",
    avatarUrl: "https://randomuser.me/api/portraits/men/32.jpg",
  },
  {
    id: "t-4",
    name: "Sarah Mitchell",
    rating: 5,
    review:
      "Exceptional service from start to finish. The team handled our year-end accounts with complete professionalism. Highly recommended for any SME looking for reliable accountants.",
    avatarInitial: "S",
  },
  {
    id: "t-5",
    name: "Omar Hassan",
    rating: 5,
    review:
      "Switched from our previous accountant and could not be happier. The UAE VAT guidance alone saved us thousands. Responsive, knowledgeable, and genuinely invested in our success.",
    avatarInitial: "O",
  },
  {
    id: "t-6",
    name: "Priya Sharma",
    rating: 5,
    review:
      "Brilliant support setting up our SPV structure. They explained everything clearly and made the whole process stress-free. Will be using them for all future property acquisitions.",
    avatarInitial: "P",
  },
  {
    id: "t-7",
    name: "M. Ismail Nagori",
    rating: 5,
    review:
      "Nexus Accounting provided me with very accurate and prompt accounting services. They are very efficient in providing the accounting and advisory services. I recommend other companies to work with them as well!",
    avatarInitial: "M",
  },
  {
    id: "t-8",
    name: "Zak Dada",
    rating: 5,
    review:
      "I have been using Nexus for years for personal self assessment and business corporation tax and VAT. The owner is very quick and intelligent, they have helped me significantly getting my tax affairs in order. I would highly recommend using Nexus!",
    avatarInitial: "Z",
  },
];



// Pricing
export interface PricingPlan {
  id: string;
  name: string;
  price: string | null;   // null = custom
  period: string | null;
  features: string[];
  cta: string;
  popular?: boolean;
  custom?: boolean;
  note?: string;
}

export const PricingPlans: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    price: "0",
    period: "/mo",
    features: [
      "We offers a free month of service for new customers.",
    ],
    cta: "Free Demo",
  },
  {
    id: "single",
    name: "Single",
    price: "9",
    period: "/mo",
    features: [
      "We offers a free 7 days of service for new customers.",
      "Our Talented & Experienced Marketing Agency.",
    ],
    cta: "Subscribe Now",
  },
  {
    id: "professional",
    name: "Professional",
    price: "49",
    period: "/mo",
    popular: true,
    features: [
      "We offers a free 14 days of service for new customers.",
      "Full Access",
      "Source Files",
      "Free Appointments",
      "Enhanced Security",
      "Free Installment",
    ],
    cta: "Buy Now",
    note: "*T&C Apply",
  },
  {
    id: "custom",
    name: "Custom",
    price: null,
    period: null,
    custom: true,
    features: ["Custom Pricing"],
    cta: "Talk To Us",
  },
];