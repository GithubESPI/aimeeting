// app/providers.tsx (ou components/providers.tsx)
"use client";

import { SessionProvider } from "next-auth/react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import * as React from "react";

export function Providers({ children }: { children: React.ReactNode }) {
    return (
        <SessionProvider>
            <NextThemesProvider
                attribute="class"
                defaultTheme="light"
                enableSystem={false}
                disableTransitionOnChange
            >
                {children}
            </NextThemesProvider>
        </SessionProvider>
    );
}
