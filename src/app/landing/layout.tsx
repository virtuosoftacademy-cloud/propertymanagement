import React from 'react'
import Navbar from './_components/Navbar';
import Footer from './_components/Footer';
import ReactLenis from 'lenis/react'

export const metadata = {
    title: "Tenure | Property Management",
    description: "Developed and Designed By Virtuosoft Limited",
};

interface LandingLayoutProps {
    children: React.ReactNode;
}

function LandingLayout({ children }: Readonly<LandingLayoutProps>) {
    return (
        <div>
            <ReactLenis root>
                <Navbar />
                {children}
                <Footer />
            </ReactLenis>
        </div>
    )
}

export default LandingLayout