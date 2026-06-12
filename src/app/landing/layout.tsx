import React from 'react'
import Navbar from './_components/Navbar';
import Footer from './_components/Footer';


export const metadata = {
    title: "Nexus | Property Management",
    description: "Developed and Designed By Virtuosoft Limited",
};

function LandingLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <>
            <Navbar />
            {children}
            <Footer />
        </>
    )
}

export default LandingLayout