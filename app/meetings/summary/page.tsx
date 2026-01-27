// app/meetings/summary/page.tsx
import { Suspense } from "react";
import SummaryClient from "./SummaryClient";

export default function MeetingSummaryPage() {
    return (
        <Suspense fallback={<div className="container mx-auto max-w-4xl px-4 py-8">Chargement…</div>}>
            <SummaryClient />
        </Suspense>
    );
}
