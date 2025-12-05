// lib/graph/syncAllMeetings.ts
import { prisma } from "@/lib/prisma";
import { getGraphAppClient } from "./appClient";

const DAYS_BACK = 365;

/**
 * Synchronise (APP ONLY) toutes les réunions Teams du tenant,
 * mais ne garde en base QUE celles qui ont :
 *  - une transcription Graph
 *  - un enregistrement Graph
 */
export async function syncAllMeetingsAppOnly() {
    const client = await getGraphAppClient();

    const now = new Date();
    const start = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);

    // (optionnel) Si tu veux nettoyer tout ce qui n'est pas "complet", tu peux décommenter :
    /*
    await prisma.meeting.deleteMany({
      where: {
        OR: [
          { hasGraphTranscript: false },
          { hasGraphRecording: false },
          { transcriptSource: null },
        ],
      },
    });
    */

    // 1️⃣ Récupérer une liste d'utilisateurs du tenant
    const users = await client
        .api("/users")
        .select(["id", "mail", "userPrincipalName", "displayName"])
        .top(100) // tu peux augmenter si besoin
        .get();

    for (const user of users.value ?? []) {
        const userId = user.id as string;
        const userEmail =
            (user.mail as string | undefined) ||
            (user.userPrincipalName as string | undefined);

        if (!userId || !userEmail) continue;

        // 2️⃣ Evénements du calendrier de ce user
        const events = await client
            .api(`/users/${userId}/calendar/events`)
            .select([
                "id",
                "subject",
                "start",
                "end",
                "organizer",
                "attendees",
                "onlineMeeting",
                "onlineMeetingUrl",
                "isOnlineMeeting",
            ])
            .filter(
                `start/dateTime ge '${start.toISOString()}' and end/dateTime le '${now.toISOString()}'`
            )
            .orderby("start/dateTime desc")
            .top(100)
            .get();

        for (const event of events.value ?? []) {
            const isOnline =
                event.isOnlineMeeting ||
                !!event.onlineMeeting ||
                !!event.onlineMeetingUrl;
            if (!isOnline) continue;

            const graphId = event.id as string;
            const subject = event.subject || "Sans titre";

            const startDateTime = event.start?.dateTime
                ? new Date(event.start.dateTime)
                : null;
            const endDateTime = event.end?.dateTime
                ? new Date(event.end.dateTime)
                : null;

            const joinUrl =
                event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || null;

            const organizerEmail = event.organizer?.emailAddress?.address ?? null;

            // 3️⃣ retrouver l’onlineMeetingId
            let onlineMeetingId: string | null = null;

            if (joinUrl) {
                const escaped = joinUrl.replace(/'/g, "''");
                try {
                    const onlineRes = await client
                        .api(`/users/${userId}/onlineMeetings`)
                        .version("beta")
                        .filter(`JoinWebUrl eq '${escaped}'`)
                        .get();

                    onlineMeetingId = onlineRes.value?.[0]?.id ?? null;
                } catch (err) {
                    // on ignore pour éviter le spam de logs
                    // (si pas organisateur ou meeting expiré)
                }
            }

            let transcriptJson: any | null = null;
            let hasT = false;
            let hasR = false;

            if (onlineMeetingId) {
                // 4️⃣ Vérifier transcript
                try {
                    const tRes = await client
                        .api(
                            `/users/${userId}/onlineMeetings/${onlineMeetingId}/transcripts?$top=1`
                        )
                        .version("beta")
                        .get();

                    hasT = Array.isArray(tRes.value) && tRes.value.length > 0;
                    transcriptJson = hasT ? tRes.value[0] : null;
                } catch {
                    hasT = false;
                }

                // 5️⃣ Vérifier recording
                try {
                    const rRes = await client
                        .api(
                            `/users/${userId}/onlineMeetings/${onlineMeetingId}/recordings?$top=1`
                        )
                        .version("v1.0")
                        .get();

                    hasR = Array.isArray(rRes.value) && rRes.value.length > 0;
                } catch {
                    hasR = false;
                }

                // ❌ On ne garde QUE si transcript + recording + JSON dispo
                if (!hasT || !hasR || !transcriptJson) {
                    continue;
                }
            } else {
                // pas d’onlineMeetingId -> on ne s’embête pas
                continue;
            }

            // 6️⃣ Upsert en BDD : ces réunions seront visibles par l'admin
            // 6️⃣ Upsert en BDD : ces réunions seront visibles par l'admin
            await prisma.meeting.upsert({
                where: { onlineMeetingId: onlineMeetingId! }, // <- ici aussi
                create: {
                    graphId,
                    title: subject,
                    startDateTime,
                    endDateTime,
                    organizerEmail: organizerEmail ?? undefined,
                    joinUrl: joinUrl ?? undefined,
                    onlineMeetingId: onlineMeetingId!,
                    status: "created",
                    transcriptRaw: transcriptJson
                        ? JSON.stringify(transcriptJson)
                        : undefined,
                    transcriptSource: transcriptJson ? "graph" : null,
                    hasGraphTranscript: !!transcriptJson,
                    hasGraphRecording: hasR,
                    // transcript (VTT) et segments : on peut les remplir plus tard
                },
                update: {
                    graphId,
                    title: subject,
                    startDateTime,
                    endDateTime,
                    organizerEmail: organizerEmail ?? undefined,
                    joinUrl: joinUrl ?? undefined,
                    onlineMeetingId: onlineMeetingId!,
                    transcriptRaw: transcriptJson
                        ? JSON.stringify(transcriptJson)
                        : undefined,
                    transcriptSource: transcriptJson ? "graph" : null,
                    hasGraphTranscript: !!transcriptJson,
                    hasGraphRecording: hasR,
                },
            });

        }
    }
}
