export type TranscriptSegment = {
    startMs: number;
    endMs: number;
    speaker: string | null;
    text: string;
};

// hh:mm:ss.mmm -> ms
function timeToMs(time: string): number {
    const [h, m, rest] = time.split(":");
    const [s, ms] = rest.split(".");
    return (
        parseInt(h, 10) * 3600_000 +
        parseInt(m, 10) * 60_000 +
        parseInt(s, 10) * 1000 +
        parseInt(ms, 10)
    );
}

export function parseTeamsVttToSegments(vtt: string): TranscriptSegment[] {
    const segments: TranscriptSegment[] = [];

    const blocks = vtt
        .replace(/\r\n/g, "\n")
        .split(/\n\n+/)
        .map((b) => b.trim())
        .filter((b) => b.length > 0);

    for (const block of blocks) {
        if (block.startsWith("WEBVTT") || block.startsWith("NOTE")) continue;

        const lines = block.split("\n").filter((l) => l.trim() !== "");
        if (lines.length < 2) continue;

        const timeLine = lines[0];
        const timeMatch = timeLine.match(
            /(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/
        );
        if (!timeMatch) continue;

        const startMs = timeToMs(timeMatch[1]);
        const endMs = timeToMs(timeMatch[2]);

        const textLines = lines.slice(1);

        let speaker: string | null = null;
        const textParts: string[] = [];

        for (const line of textLines) {
            const vMatch = line.match(/^<v\s+([^>]+)>(.*)$/i);
            if (vMatch) {
                speaker = vMatch[1].trim();
                const content = vMatch[2].trim();
                if (content) textParts.push(content);
            } else {
                textParts.push(line.trim());
            }
        }

        const text = textParts.join(" ").trim();
        if (!text) continue;

        segments.push({
            startMs,
            endMs,
            speaker,
            text,
        });
    }

    return segments;
}
