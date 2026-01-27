// app/lib/participants.ts

function normalize(str: string) {
    return (str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

function extractEmailLastName(email: string) {
    const local = (email.split("@")[0] || "").trim();
    const parts = local.split(".");
    const last = parts.length >= 2 ? parts[parts.length - 1] : local;
    return normalize(last);
}

export type FormattedParticipant = {
    name: string | null;
    email: string | null;
    label: string; // "Andy VESPUCE - a.vespuce@..."
};

export function formatParticipants(raw: string[]): FormattedParticipant[] {
    const items = (raw ?? []).map((s) => (s || "").trim()).filter(Boolean);

    const emails: string[] = [];
    const names: string[] = [];

    for (const it of items) {
        if (it.includes("@")) emails.push(it);
        else names.push(it);
    }

    const usedNames = new Set<number>();

    const pairs: FormattedParticipant[] = emails.map((email) => {
        const emailLast = extractEmailLastName(email);

        let foundName: string | null = null;
        let foundIdx = -1;

        for (let i = 0; i < names.length; i++) {
            if (usedNames.has(i)) continue;

            const lastWord = normalize(names[i].split(/\s+/).slice(-1)[0] || "");
            if (lastWord && lastWord === emailLast) {
                foundName = names[i];
                foundIdx = i;
                break;
            }
        }

        if (foundIdx >= 0) usedNames.add(foundIdx);

        return {
            name: foundName,
            email,
            label: foundName ? `${foundName} - ${email}` : email,
        };
    });

    // noms restants sans email
    for (let i = 0; i < names.length; i++) {
        if (!usedNames.has(i)) {
            pairs.push({ name: names[i], email: null, label: names[i] });
        }
    }

    return pairs;
}
