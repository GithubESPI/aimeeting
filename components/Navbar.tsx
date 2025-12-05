"use client";

import Link from "next/link";
import Image from "next/image";

const Navbar = () => {
    return (
        <header className="border-b border-border-dark bg-dark-100">
            <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">

                {/* ---- LOGO ---- */}
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/logo_blanc.png"
                        alt="ESPI AI Logo"
                        width={120}
                        height={40}
                        priority
                        className="h-auto w-auto"
                    />
                </Link>

                {/* ---- MENU ---- */}
                <div className="flex items-center gap-6 text-sm">
                    <Link
                        href="/meetings/teams"
                        className="text-light-100 hover:text-white transition-colors"
                    >
                        Réunions Teams
                    </Link>
                </div>

            </nav>
        </header>
    );
};

export default Navbar;
