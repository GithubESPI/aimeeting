import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/authOptions";

export async function fetchFullTranscript(transcriptUrl: string) {
    const session = await getServerSession(authOptions);
    const token = session?.accessToken as string;

    const res = await fetch(transcriptUrl, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json"
        }
    });

    if (!res.ok) {
        console.error("Erreur Graph transcript:", await res.text());
        return null;
    }

    // Transcript Teams renvoie souvent du JSON ou du VTT
    const text = await res.text();
    return text;
}
