// lib/graph.ts
import { Client } from "@microsoft/microsoft-graph-client";

export function getGraphClient(accessToken: string) {
    return Client.init({
        authProvider: (done) => {
            done(null, accessToken);
        },
    });
}

export async function getMeetingRecordings(
    client: Client,
    meetingId: string
) {
    try {
        const response = await client
            .api(`/me/onlineMeetings/${meetingId}/recordings`)
            .get();
        return response.value || [];
    } catch (error) {
        console.error("Erreur lors de la récupération des enregistrements:", error);
        return [];
    }
}

export async function getMeetingTranscripts(
    client: Client,
    meetingId: string
) {
    try {
        const response = await client
            .api(`/me/onlineMeetings/${meetingId}/transcripts`)
            .get();
        return response.value || [];
    } catch (error) {
        console.error("Erreur lors de la récupération des transcriptions:", error);
        return [];
    }
}

export async function getTranscriptContent(
    client: Client,
    meetingId: string,
    transcriptId: string
) {
    try {
        const response = await client
            .api(`/me/onlineMeetings/${meetingId}/transcripts/${transcriptId}/content`)
            .get();
        return response;
    } catch (error) {
        console.error("Erreur lors de la récupération du contenu de transcription:", error);
        return null;
    }
}