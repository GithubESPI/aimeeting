// app/meetings/teams/loading.tsx
export default function LoadingTeamsPage() {
    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 rounded-full border-2 border-light-100 border-t-[#005E83] animate-spin" />
                <p className="text-sm text-[#005E83]">
                    Chargement des réunions Teams...
                </p>
            </div>
        </div>
    );
}
