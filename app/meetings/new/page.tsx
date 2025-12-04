// app/meetings/new/page.tsx
import Link from "next/link";
import NewMeetingForm from "./new-meeting-form";

export default function NewMeetingPage() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#f9fafb,_#e5e7eb)]">
            <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 pb-10 pt-8">
                {/* Breadcrumb / retour */}
                <div>
                    <Link
                        href="/dashboard"
                        className="inline-flex items-center text-xs font-medium text-purple-600 hover:text-purple-700"
                    >
                        ← Retour au tableau de bord
                    </Link>
                </div>

                {/* Titre & description */}
                <header className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-purple-500">
                        Nouvelle réunion
                    </p>
                    <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                        Créer une réunion présentielle
                    </h1>
                    <p className="max-w-2xl text-sm text-slate-500">
                        Enregistrez une réunion qui n’a pas eu lieu sur Teams. Ajoutez un
                        enregistrement audio/vidéo : il sera transcrit et résumé
                        automatiquement par le système.
                    </p>
                </header>

                <NewMeetingForm />
            </div>
        </div>
    );
}
