
import Hero from "./_components/Hero";
import LandingWorks from "./_components/Works";
import LandingExperience from "./_components/Experience";
import LandingDashboard from "./_components/DashboardScreen";
import LandingPricing from "./_components/Pricing";
import TestimonialsSection from "./_components/Testimonials";
import CtaForm from "./_components/ctaForm";
import { CtaSplitSection } from "./_components/CTA";

const LandingPage = () => {
    return (
        <div className="min-h-screen text-foreground">
            <Hero />
            <LandingWorks />
            <LandingExperience />
            <LandingDashboard />
            <TestimonialsSection />
            <LandingPricing />
            <CtaForm />
            <CtaSplitSection />
        </div>
    );
};

export default LandingPage;
