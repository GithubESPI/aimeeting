"use client";

import { signOut } from "next-auth/react";
import Link from "next/link";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Navbar from "@/components/Navbar";

type UserInfo = {
    name: string;
    email: string;
    image: string | null;
};

type Meeting = {
    id: string;
    title: string;
    status: string;
    createdAt: string | Date;
    graphId: string | null;
    summaryJson?: any; // 👈 on récupère la synthèse
};

type DashboardStats = {
    total: number;
    processed: number;
    pending: number;
    readyToSummarize: number;
};

type Props = {
    user: UserInfo;
    meetings: Meeting[];
    stats: DashboardStats;
};

export default function DashboardClient({ user, meetings, stats }: Props) {
    //console.log("📌 Meetings reçues par le dashboard :", meetings);
    const { total, processed, pending } = stats;

    const initials =
        user.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "U";

    const handleSignOut = () => {
        signOut({ callbackUrl: "/" });
    };

    return (
        <section>
            <Navbar />
            <div>
                <h1 className="text-center mt-20">Tableau de bord des réunions</h1>
                <p className="text-center mt-5 text-[#005E83]">
                    Visualisez vos réunions Teams, suivez leur traitement
                    et accédez rapidement aux comptes rendus IA.
                </p>
            </div>

            <div className="mt-20 space-y-7 glass card-shadow rounded-xl px-6 py-5 flex flex-col gap-6">
                {/* Profil utilisateur */}
                <div className="flex items-center gap-3 rounded-lg bg-dark-200 px-4 py-3 border border-border-dark">
                    <Avatar className="h-10 w-10 border border-border-dark">
                        <AvatarImage src={user.image ?? undefined} alt={user.name} />
                        <AvatarFallback className="bg-blue text-black text-xs font-semibold">
                            {initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <p className="text-sm font-medium text-white">{user.name}</p>
                        <p className="truncate text-xs text-light-200">{user.email}</p>
                    </div>
                    <Button
                        variant="outline"
                        size="sm"
                        className="text-xs border-border-dark bg-dark-100 hover:bg-dark-200"
                        onClick={handleSignOut}
                    >
                        Déconnexion
                    </Button>
                </div>

                {/* Stats */}
                <section className="grid gap-4 md:grid-cols-3">
                    <Card className="bg-dark-200 border-border-dark card-shadow rounded-xl">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-light-200 text-xs">
                                Réunions au total
                            </CardDescription>
                            <CardTitle className="text-3xl font-semibold text-white">
                                {total}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-light-200">
                            Toutes les réunions créées (Teams + présentielles).
                        </CardContent>
                    </Card>

                    <Card className="bg-dark-200 border-border-dark card-shadow rounded-xl">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-light-200 text-xs">
                                Réunions en attente de synthèse
                            </CardDescription>
                            <CardTitle className="text-3xl font-semibold text-white">
                                {pending}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-light-200">
                            Réunions sans transcription ou compte rendu final.
                        </CardContent>
                    </Card>

                    <Card className="bg-dark-200 border-border-dark card-shadow rounded-xl">
                        <CardHeader className="pb-2">
                            <CardDescription className="text-light-200 text-xs">
                                Traitées
                            </CardDescription>
                            <CardTitle className="text-3xl font-semibold text-white">
                                {processed}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="text-xs text-light-200">
                            Réunions avec synthèse envoyée aux participants.
                        </CardContent>
                    </Card>
                </section>

                {/* Réunions récentes avec synthèse IA */}
                <Card className="glass card-shadow rounded-xl border-border-dark bg-dark-100/90">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-semibold text-white">
                            Réunions récentes
                        </CardTitle>
                        <CardDescription className="text-xs text-light-200">
                            Dernières réunions disposant d&apos;une synthèse IA.
                        </CardDescription>
                    </CardHeader>

                    <CardContent className="pt-0">
                        {meetings.length === 0 ? (
                            <div className="flex-center py-12 text-sm text-light-200">
                                Aucune synthèse IA pour le moment. Lancez une réunion ou
                                générez une synthèse depuis vos réunions Teams.
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2">
                                {meetings.map((m) => {
                                    const summary = (m.summaryJson ?? {}) as any; // 👈 plutôt que (m.summaryJson || {})

                                    const resume: string =
                                        summary.resume ||
                                        summary.resumé ||
                                        summary.resumé_rapide ||
                                        "";

                                    const resumePreview =
                                        resume.length > 260 ? resume.slice(0, 260) + "…" : resume;

                                    return (
                                        <Card
                                            key={m.id}
                                            className="bg-dark-200 border-border-dark rounded-xl flex flex-col h-full"
                                        >
                                            <CardHeader className="pb-2 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-1">
                                                        <CardTitle className="text-sm font-semibold text-white line-clamp-2">
                                                            {summary.titre || m.title || "Réunion sans titre"}
                                                        </CardTitle>
                                                        <div className="flex flex-wrap gap-2 items-center">
                                                            <Badge
                                                                variant="outline"
                                                                className="border-blue/40 bg-dark-100 text-[11px] font-medium text-blue"
                                                            >
                                                                {m.graphId ? "Teams" : "Présentiel"}
                                                            </Badge>
                                                            <StatusBadge status={m.status} />
                                                        </div>
                                                    </div>
                                                </div>
                                                <p className="text-[11px] text-light-200">
                                                    Créée le{" "}
                                                    {format(
                                                        new Date(m.createdAt),
                                                        "dd MMM yyyy · HH:mm",
                                                        { locale: fr }
                                                    )}
                                                </p>
                                            </CardHeader>

                                            <CardContent className="flex-1 flex flex-col">
                                                {resume ? (
                                                    <p className="text-xs text-light-100 leading-relaxed mb-4">
                                                        {resumePreview}
                                                    </p>
                                                ) : (
                                                    <p className="text-xs text-light-200 mb-4">
                                                        Aucune description courte disponible.
                                                    </p>
                                                )}

                                                <div className="mt-auto flex items-center justify-between pt-2">
                                                    <Button
                                                        asChild
                                                        size="sm"
                                                        variant="ghost"
                                                        className="text-[11px] text-blue hover:bg-dark-300 hover:text-blue px-0"
                                                    >
                                                        <Link href={`/meetings/${m.id}`}>
                                                            Voir la synthèse complète
                                                        </Link>
                                                    </Button>

                                                    <Button
                                                        asChild
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-[11px] border-blue/50 text-blue bg-transparent hover:bg-blue/10"
                                                    >
                                                        <a
                                                            href={`/api/meetings/${m.id}/export-pdf`}
                                                            target="_blank"
                                                        >
                                                            Télécharger le PDF
                                                        </a>
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </section>
    );
}

function StatusBadge({ status }: { status: string }) {
    const normalized = status.toLowerCase();

    if (normalized === "processed" || normalized === "traitee" || normalized === "summarized") {
        return (
            <Badge className="bg-emerald-100 text-[11px] font-medium text-emerald-800 hover:bg-emerald-100">
                Traité
            </Badge>
        );
    }

    if (normalized === "error" || normalized === "erreur") {
        return (
            <Badge className="bg-red-100 text-[11px] font-medium text-red-800 hover:bg-red-100">
                Erreur
            </Badge>
        );
    }

    return (
        <Badge className="bg-amber-100 text-[11px] font-medium text-amber-800 hover:bg-amber-100">
            En attente
        </Badge>
    );
}
