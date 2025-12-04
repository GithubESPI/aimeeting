"use client";

import { Suspense } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

function SignInContent() {
    const sp = useSearchParams();
    const error = sp.get("error");

    return (
        <Card className="w-full max-w-md shadow-xl">
            <CardHeader className="text-center">
                <CardTitle className="text-2xl">Connexion</CardTitle>
                <p className="text-sm text-muted-foreground">
                    Accédez à votre espace de réunions
                </p>
            </CardHeader>

            <CardContent className="space-y-4">
                {error === "AccessDenied" && (
                    <div className="text-sm rounded-md bg-red-50 border border-red-200 text-red-700 p-3">
                        Accès refusé. Utilisez une adresse email autorisée.
                    </div>
                )}
                {error && error !== "AccessDenied" && (
                    <div className="text-sm rounded-md bg-amber-50 border border-amber-200 text-amber-800 p-3">
                        Erreur : {error}
                    </div>
                )}

                <Button
                    variant="outline"
                    onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
                    className="w-full h-11 text-white cursor-pointer"
                >
                    Connectez-vous avec Microsoft
                </Button>

                <Separator className="my-2" />
                <p className="text-xs text-center text-muted-foreground">
                    En continuant, vous acceptez nos conditions d’utilisation et notre
                    politique de confidentialité.
                </p>
            </CardContent>
        </Card>
    );
}

export default function SignInPage() {
    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-b">
            <Suspense fallback={null}>
                <SignInContent />
            </Suspense>
        </div>
    );
}
