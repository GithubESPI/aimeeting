// app/meetings/new/new-meeting-form.tsx
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
    Card,
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// 👉 adapte ce chemin si ton composant est ailleurs
import RecordingUpload from "@/components/RecordingUpload";
import {useState} from "react";

type FormState = {
    title: string;
    organizerEmail: string;
    notes: string;
    recordingUrl: string | null;
};

export default function NewMeetingForm() {
    const router = useRouter();
    const [form, setForm] = React.useState<FormState>({
        title: "",
        organizerEmail: "",
        notes: "",
        recordingUrl: null,
    });
    const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleChange =
        (field: keyof FormState) =>
            (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
                setForm((prev) => ({ ...prev, [field]: e.target.value }));
            };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!form.title.trim()) {
            setError("Le titre est obligatoire.");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await fetch("/api/meetings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: form.title,
                    organizerEmail:
                        form.organizerEmail.trim() === ""
                            ? null
                            : form.organizerEmail.trim(),
                    localRecordingUrl: form.recordingUrl,
                    notes: form.notes.trim() || null,
                    type: "presentiel",
                }),
            });

            if (!res.ok) {
                const data = (await res.json().catch(() => null)) as
                    | { error?: string }
                    | null;
                throw new Error(data?.error ?? "Erreur lors de la création de la réunion");
            }

            const data = (await res.json()) as { id?: string };
            const meetingId = data.id;
            if (meetingId) {
                router.push(`/meetings/${meetingId}`);
            } else {
                router.push("/dashboard");
            }
        } catch (err: unknown) {
            console.error(err);
            const message =
                err instanceof Error ? err.message : "Une erreur s’est produite.";
            setError(message);
        } finally {
            setIsSubmitting(false);
        }
    };


    return (
        <Card className="border-none bg-white/90 shadow-sm backdrop-blur-sm">
            <form onSubmit={handleSubmit}>
                <CardHeader className="pb-4">
                    <CardTitle className="text-base">
                        Infos de la réunion présentielle
                    </CardTitle>
                    <CardDescription>
                        Renseignez les informations principales et ajoutez l’enregistrement
                        audio/vidéo si vous l’avez déjà.
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-5">
                    {/* Titre */}
                    <div className="space-y-1.5">
                        <Label htmlFor="title">Titre</Label>
                        <Input
                            id="title"
                            placeholder="Ex : Comité pédagogique M1 – 04/04/2025"
                            value={form.title}
                            onChange={handleChange("title")}
                            className="bg-slate-50/70"
                        />
                    </div>

                    {/* Organisateur */}
                    <div className="space-y-1.5">
                        <Label htmlFor="organizerEmail">
                            Email organisateur <span className="text-xs text-slate-400">(optionnel)</span>
                        </Label>
                        <Input
                            id="organizerEmail"
                            type="email"
                            placeholder="prenom.nom@groupe-espi.fr"
                            value={form.organizerEmail}
                            onChange={handleChange("organizerEmail")}
                            className="bg-slate-50/70"
                        />
                    </div>

                    {/* Notes internes */}
                    <div className="space-y-1.5">
                        <Label htmlFor="notes">
                            Notes internes <span className="text-xs text-slate-400">(optionnel)</span>
                        </Label>
                        <Textarea
                            id="notes"
                            placeholder="Contexte, objectifs, participants clés..."
                            value={form.notes}
                            onChange={handleChange("notes")}
                            className="bg-slate-50/70 min-h-[90px]"
                        />
                    </div>

                    {/* Upload enregistrement */}
                    <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="space-y-1">
                                <Label>Enregistrement audio/vidéo</Label>
                                <p className="text-xs text-slate-500">
                                    Uploadez le fichier de la réunion (audio ou vidéo). Il sera
                                    stocké, transcrit puis résumé automatiquement.
                                </p>
                            </div>
                            {form.recordingUrl && (
                                <span className="text-xs font-medium text-emerald-600">Fichier attaché</span>
                            )}
                        </div>

                        {/* Ici on réutilise ton composant UploadThing */}
                        <RecordingUpload onUploadedAction={setRecordingUrl} />

                    </div>

                    {error && (
                        <div className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                            {error}
                        </div>
                    )}
                </CardContent>

                <CardFooter className="flex items-center justify-end gap-3 border-t bg-slate-50/60 py-3">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-xs"
                        onClick={() => history.back()}
                    >
                        Annuler
                    </Button>
                    <Button
                        type="submit"
                        size="sm"
                        className={cn(
                            "bg-gradient-to-r from-purple-600 to-indigo-600 text-xs font-medium text-white shadow-sm hover:from-purple-700 hover:to-indigo-700",
                            isSubmitting && "opacity-80"
                        )}
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? "Création en cours…" : "Créer la réunion"}
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
}
