import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PDFDocument, StandardFonts, rgb, PDFPage, PDFFont } from "pdf-lib";
import fs from "fs/promises";
import path from "path";
import { Prisma } from "@prisma/client";
import {sendMeetingReportEmail} from "@/app/email";
import {getServerSession} from "next-auth";
import { authOptions } from "@/lib/authOptions";


// (optionnel mais recommandé, comme tu utilises fs / pdf-lib)
export const runtime = "nodejs";

// --- Couleurs ESPI ---
const colorBlue = rgb(10 / 255, 93 / 255, 129 / 255);   // #0A5D81
const colorGrey = rgb(211 / 255, 219 / 255, 233 / 255); // #D3DBE9
const colorRed = rgb(247 / 255, 106 / 255, 106 / 255);  // #F76A6A
const colorText = rgb(0, 0, 0);
const colorMuted = rgb(90 / 255, 90 / 255, 90 / 255);

// A4
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;

// Layout : on laisse plus de place sous le bandeau
const CONTENT_TOP_Y = PAGE_HEIGHT - 190;
const DETAIL_TOP_Y = PAGE_HEIGHT - 190;
const BOTTOM_MARGIN = 70;

const PDF_MAIN_TITLE = "Compte rendu de réunion";

type PDFContext = {
    pdf: PDFDocument;
    fontRegular: PDFFont;
    fontBold: PDFFont;
    logoImage?: any;
    page: PDFPage;
    y: number;
    subtitle: string;
};

type InfoRow = { label: string; value: string };

// ---------- Utils / ressources ----------

async function loadLogoBytes() {
    try {
        const logoPath = path.join(process.cwd(), "public", "logo_blanc.png");
        const bytes = await fs.readFile(logoPath);
        return bytes;
    } catch (e) {
        console.warn("[export-pdf] Logo introuvable ou non lisible :", e);
        return null;
    }
}

// ---------- Header / Sections ----------

function drawHeader(ctx: PDFContext, title: string, subtitle?: string) {
    const { page, fontBold, logoImage } = ctx;
    const headerHeight = 160;

    page.drawRectangle({
        x: 0,
        y: PAGE_HEIGHT - headerHeight,
        width: PAGE_WIDTH,
        height: headerHeight,
        color: colorBlue,
    });

    if (logoImage) {
        const targetHeight = 46;
        const scale = targetHeight / logoImage.height;
        const w = logoImage.width * scale;
        const h = logoImage.height * scale;

        page.drawImage(logoImage, {
            x: (PAGE_WIDTH - w) / 2,
            y: PAGE_HEIGHT - headerHeight + 80,
            width: w,
            height: h,
        });
    }

    const titleSize = 18;
    const titleWidth = fontBold.widthOfTextAtSize(title, titleSize);
    page.drawText(title, {
        x: (PAGE_WIDTH - titleWidth) / 2,
        y: PAGE_HEIGHT - headerHeight + 46,
        size: titleSize,
        font: fontBold,
        color: rgb(1, 1, 1),
    });

    if (subtitle) {
        const stSize = 12;
        const stWidth = fontBold.widthOfTextAtSize(subtitle, stSize);
        page.drawText(subtitle, {
            x: (PAGE_WIDTH - stWidth) / 2,
            y: PAGE_HEIGHT - headerHeight + 26,
            size: stSize,
            font: fontBold,
            color: rgb(1, 1, 1),
        });
    }
}

function drawSectionTitle(
    ctx: PDFContext,
    label: string,
    color: "blue" | "red" = "blue"
) {
    const { page, fontBold } = ctx;
    const bandColor = color === "blue" ? colorGrey : colorRed;
    const textColor = color === "blue" ? colorBlue : rgb(1, 1, 1);

    ctx.y -= 8;

    page.drawRectangle({
        x: 40,
        y: ctx.y - 4,
        width: PAGE_WIDTH - 80,
        height: 20,
        color: bandColor,
    });

    page.drawText(label, {
        x: 48,
        y: ctx.y,
        size: 10,
        font: fontBold,
        color: textColor,
    });

    ctx.y -= 30;
}

// ---------- Cartes : infos + résumé ----------

function drawInfoCard(ctx: PDFContext, rows: InfoRow[]) {
    const { page, fontRegular, fontBold } = ctx;

    const labelSize = 9;
    const valueSize = 10;
    const lineHeight = 16;

    const paddingX = 16;
    const paddingY = 14;

    const x = 40;
    const width = PAGE_WIDTH - 80;
    const height = paddingY * 2 + rows.length * lineHeight;

    const bottomY = ctx.y - height;

    page.drawRectangle({
        x,
        y: bottomY,
        width,
        height,
        color: colorGrey,
        opacity: 0.45,
    });

    page.drawRectangle({
        x,
        y: bottomY,
        width: 4,
        height,
        color: colorBlue,
    });

    let currentY = ctx.y - paddingY - 2;

    rows.forEach((row) => {
        page.drawText(row.label, {
            x: x + paddingX,
            y: currentY,
            size: labelSize,
            font: fontBold,
            color: colorMuted,
        });

        const text = row.value || "—";

        page.drawText(text, {
            x: x + paddingX + 90,
            y: currentY,
            size: valueSize,
            font: fontRegular,
            color: colorText,
        });

        currentY -= lineHeight;
    });

    ctx.y = bottomY - 28;
}

function drawCalloutBox(ctx: PDFContext, text: string) {
    const { page, fontRegular } = ctx;
    const fontSize = 10;
    const lineHeight = 14;
    const maxWidth = PAGE_WIDTH - 120;

    const paddingX = 16;
    const paddingY = 16;

    const words = text.split(/\s+/);
    let line = "";
    const lines: string[] = [];

    for (const word of words) {
        const candidate = line ? line + " " + word : word;
        const w = fontRegular.widthOfTextAtSize(candidate, fontSize);
        if (w > maxWidth) {
            if (line) lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }
    if (line) lines.push(line);

    const height = paddingY * 2 + lines.length * lineHeight;

    const x = 40;
    const width = PAGE_WIDTH - 80;
    const bottomY = ctx.y - height;

    page.drawRectangle({
        x,
        y: bottomY,
        width,
        height,
        color: colorGrey,
        opacity: 0.25,
    });

    page.drawRectangle({
        x,
        y: bottomY,
        width: 4,
        height,
        color: colorBlue,
    });

    let currentY = ctx.y - paddingY;

    for (const ln of lines) {
        page.drawText(ln, {
            x: x + paddingX,
            y: currentY,
            size: fontSize,
            font: fontRegular,
            color: colorText,
        });
        currentY -= lineHeight;
    }

    ctx.y = bottomY - 28;
}

// ---------- Pagination ----------

function ensureSpaceForDetail(ctx: PDFContext, needed: number) {
    if (ctx.y - needed < BOTTOM_MARGIN) {
        ctx.page = ctx.pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
        drawHeader(ctx, PDF_MAIN_TITLE, ctx.subtitle);
        ctx.y = DETAIL_TOP_Y;
    }
}

// ---------- Cartes : listes à puces ----------

function drawBulletedCard(ctx: PDFContext, items: string[]) {
    const fontRegular = ctx.fontRegular;
    const fontSize = 10;
    const lineHeight = 14;
    const maxWidth = PAGE_WIDTH - 120;

    const paddingX = 16;
    const paddingY = 14;

    type BulletLine = { text: string; firstOfBullet: boolean };
    const bulletLines: BulletLine[] = [];

    for (const item of items) {
        const words = item.split(/\s+/);
        let line = "";
        let first = true;

        for (const word of words) {
            const candidate = line ? line + " " + word : word;
            const w = fontRegular.widthOfTextAtSize(candidate, fontSize);
            if (w > maxWidth) {
                if (line) bulletLines.push({ text: line, firstOfBullet: first });
                line = word;
                first = false;
            } else {
                line = candidate;
            }
        }
        if (line) bulletLines.push({ text: line, firstOfBullet: first });

        bulletLines.push({ text: "", firstOfBullet: false });
    }

    if (bulletLines.length === 0) return;

    const effectiveLines = bulletLines.filter((l) => l.text !== "").length;
    const extraBlank = bulletLines.length - effectiveLines;
    const totalLines = effectiveLines + extraBlank;

    const height = paddingY * 2 + totalLines * lineHeight;

    ensureSpaceForDetail(ctx, height + 10);

    const x = 40;
    const width = PAGE_WIDTH - 80;
    const bottomY = ctx.y - height;

    ctx.page.drawRectangle({
        x,
        y: bottomY,
        width,
        height,
        color: colorGrey,
        opacity: 0.25,
    });

    ctx.page.drawRectangle({
        x,
        y: bottomY,
        width: 4,
        height,
        color: colorBlue,
    });

    let currentY = ctx.y - paddingY;

    for (const l of bulletLines) {
        if (l.text === "") {
            currentY -= lineHeight;
            continue;
        }
        const prefix = l.firstOfBullet ? "• " : "  ";
        ctx.page.drawText(prefix + l.text, {
            x: x + paddingX,
            y: currentY,
            size: fontSize,
            font: fontRegular,
            color: colorText,
        });
        currentY -= lineHeight;
    }

    ctx.y = bottomY - 28;
}

// ---------- Cartes : contenu détaillé ----------

function drawDetailParagraphCards(
    ctx: PDFContext,
    raw: string,
    options?: { fontSize?: number; lineHeight?: number }
) {
    const fontSize = options?.fontSize ?? 10;
    const lineHeight = options?.lineHeight ?? 14;
    const maxWidth = PAGE_WIDTH - 120;
    const fontRegular = ctx.fontRegular;

    const paddingX = 16;
    const paddingY = 14;

    const paragraphs = raw
        .split(/\n{1,}/)
        .map((p) => p.trim())
        .filter(Boolean);

    for (const para of paragraphs) {
        const words = para.split(/\s+/);
        let line = "";
        const lines: string[] = [];

        for (const word of words) {
            const candidate = line ? line + " " + word : word;
            const w = fontRegular.widthOfTextAtSize(candidate, fontSize);
            if (w > maxWidth) {
                if (line) lines.push(line);
                line = word;
            } else {
                line = candidate;
            }
        }
        if (line) lines.push(line);

        const height = paddingY * 2 + lines.length * lineHeight;

        ensureSpaceForDetail(ctx, height + 10);

        const x = 40;
        const width = PAGE_WIDTH - 80;
        const bottomY = ctx.y - height;

        ctx.page.drawRectangle({
            x,
            y: bottomY,
            width,
            height,
            color: colorGrey,
            opacity: 0.18,
        });

        ctx.page.drawRectangle({
            x,
            y: bottomY,
            width: 4,
            height,
            color: colorBlue,
        });

        let currentY = ctx.y - paddingY;

        for (const ln of lines) {
            ctx.page.drawText(ln, {
                x: x + paddingX,
                y: currentY,
                size: fontSize,
                font: fontRegular,
                color: colorText,
            });
            currentY -= lineHeight;
        }

        ctx.y = bottomY - 24;
    }
}

// ---------- Footer ----------

function drawFooters(pdf: PDFDocument, font: PDFFont) {
    const pages = pdf.getPages();
    const total = pages.length;

    pages.forEach((page, idx) => {
        const size = 8;
        const y = 35;

        page.drawRectangle({
            x: 40,
            y: y + 10,
            width: PAGE_WIDTH - 80,
            height: 0.5,
            color: colorGrey,
        });

        page.drawText("ESPI – Synthèse générée par ESPI_AI", {
            x: 40,
            y,
            size,
            font,
            color: colorMuted,
        });

        const label = `Page ${idx + 1} / ${total}`;
        const w = font.widthOfTextAtSize(label, size);
        page.drawText(label, {
            x: PAGE_WIDTH - 40 - w,
            y,
            size,
            font,
            color: colorMuted,
        });
    });
}

// ---------- Helper : génération du PDF pour une réunion ----------

async function generateMeetingPdf(meeting: any, summary: any): Promise<Uint8Array> {
    const pdf = await PDFDocument.create();
    const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

    const logoBytes = await loadLogoBytes();
    let logoImage: any | undefined = undefined;

    if (logoBytes) {
        try {
            logoImage = await pdf.embedPng(logoBytes);
        } catch (e) {
            console.warn("[export-pdf] Impossible d'embarquer le logo :", e);
        }
    }

    const firstPage = pdf.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    const subtitle = summary.titre || meeting.title || "";

    const ctx: PDFContext = {
        pdf,
        fontRegular,
        fontBold,
        logoImage,
        page: firstPage,
        y: CONTENT_TOP_Y,
        subtitle,
    };

    // --- PAGE 1 : header + infos + résumé ---

    drawHeader(ctx, PDF_MAIN_TITLE, subtitle);
    ctx.y = CONTENT_TOP_Y;

    drawSectionTitle(ctx, "Informations générales");

    // 🔹 Date & heure calculées à partir de meeting.startDateTime
    let dateStr = "Non renseignée";
    let timeStr = "Non renseignée";

    if (meeting.startDateTime) {
        const d = new Date(meeting.startDateTime);
        dateStr = d.toLocaleDateString("fr-FR", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        });
        timeStr = d.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
        });
    } else {
        // fallback sur le JSON si vraiment pas de date en BDD
        dateStr = summary.date || "Non renseignée";
        timeStr = summary.heure || "Non renseignée";
    }

    // 🔹 Participants construits depuis la BDD (attendees)
    const participantsFromDb: string[] = Array.isArray(meeting.attendees)
        ? meeting.attendees
            .map(
                (a: any) =>
                    a.participant?.displayName ||
                    a.participant?.email ||
                    null
            )
            .filter((v: string | null): v is string => Boolean(v))
        : [];

    let participantsLabel = "—";

    if (participantsFromDb.length > 0) {
        participantsLabel = participantsFromDb.join(", ");
    } else if (Array.isArray(summary.participants) && summary.participants.length > 0) {
        // fallback : participants venant du JSON de synthèse
        participantsLabel = summary.participants.join(", ");
    } else if (meeting.organizerEmail) {
        participantsLabel = meeting.organizerEmail;
    }

    const infoRows: InfoRow[] = [
        { label: "Titre de la réunion", value: subtitle || "Non renseigné" },
        { label: "Date", value: dateStr },
        { label: "Heure", value: timeStr },
    ];

    if (summary.participants?.length) {
        infoRows.push({
            label: "Participants",
            value: summary.participants.join(", "),
        });
    } else if (meeting.organizerEmail) {
        infoRows.push({
            label: "Organisateur",
            value: meeting.organizerEmail,
        });
    }

    drawInfoCard(ctx, infoRows);

    drawSectionTitle(ctx, "Résumé rapide");
    const resumeText =
        summary.resume ||
        summary.resume_rapide ||
        "Résumé rapide non disponible.";
    drawCalloutBox(ctx, resumeText);

    // --- Décisions / tâches / contenu détaillé ---

    const hasDecisions =
        Array.isArray(summary.decisions) && summary.decisions.length > 0;
    const hasActions =
        Array.isArray(summary.actions) && summary.actions.length > 0;
    const hasDetail = Boolean(summary.contenu_detaille);

    if (hasDecisions) {
        ensureSpaceForDetail(ctx, 80);
        drawSectionTitle(ctx, "Décisions prises", "red");
        const decisions = (summary.decisions as string[]).map((d: string) =>
            d.trim()
        );
        drawBulletedCard(ctx, decisions);
    }

    if (hasActions) {
        ensureSpaceForDetail(ctx, 80);
        drawSectionTitle(ctx, "Tâches à réaliser");
        const items = (summary.actions as any[]).map((a) => {
            const who = a.owner ? ` — ${a.owner}` : "";
            const dl = a.deadline ? ` (échéance : ${a.deadline})` : "";
            return `${a.tache || "Tâche"}${who}${dl}`;
        });
        drawBulletedCard(ctx, items);
    }

    if (hasDetail) {
        ensureSpaceForDetail(ctx, 80);
        drawSectionTitle(ctx, "Contenu détaillé de la réunion");
        drawDetailParagraphCards(ctx, summary.contenu_detaille, {
            fontSize: 10,
            lineHeight: 14,
        });
    }

    drawFooters(pdf, fontRegular);

    const pdfBytes = await pdf.save();
    return pdfBytes;
}

// ---------- GET : téléchargement direct du PDF ----------

export async function GET(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const meetingId = id;

    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
    });

    if (!meeting) {
        return NextResponse.json(
            { error: "Réunion introuvable." },
            { status: 404 }
        );
    }

    if (meeting.summaryJson == null) {
        // == couvre null et undefined
        return NextResponse.json(
            { error: "Aucune synthèse disponible pour cette réunion." },
            { status: 400 }
        );
    }


    const summary = meeting.summaryJson as any;

    const pdfBytes = await generateMeetingPdf(meeting, summary);

    return new Response(pdfBytes as any, {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="Compte-rendu-${meetingId}.pdf"`,
        },
    });
}

// ---------- POST : envoi du PDF par mail à tous les participants ----------

// ---------- POST : envoi du PDF par mail via Microsoft Graph ----------

export async function POST(
    _req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const meetingId = id;

    // 🔐 Récupérer la session pour avoir le accessToken Graph
    const session = await getServerSession(authOptions);

    if (!session || !(session as any).accessToken) {
        return NextResponse.json(
            { error: "Non authentifié ou token Graph manquant" },
            { status: 401 }
        );
    }

    const accessToken = (session as any).accessToken as string;

    // 1️⃣ Récupérer la réunion + participants
    const meeting = await prisma.meeting.findUnique({
        where: { id: meetingId },
        include: {
            attendees: {
                include: {
                    participant: true,
                },
            },
        },
    });

    if (!meeting) {
        return NextResponse.json(
            { error: "Réunion introuvable." },
            { status: 404 }
        );
    }

    if (meeting.summaryJson == null) {
        // == couvre null et undefined
        return NextResponse.json(
            { error: "Aucune synthèse disponible pour cette réunion." },
            { status: 400 }
        );
    }

    const summary = meeting.summaryJson as any;

    // 2️⃣ Générer le PDF
    const pdfBytes = await generateMeetingPdf(meeting, summary);
    const pdfBase64 = Buffer.from(pdfBytes).toString("base64");

    const subtitle: string = summary.titre || meeting.title || "Réunion";

    // 3️⃣ Construire la liste des destinataires (participants + organisateur)
    const participantEmails =
        meeting.attendees
            ?.map((a) => a.participant?.email)
            .filter((e): e is string => Boolean(e)) ?? [];

    const extraEmails: string[] = [];
    if (meeting.organizerEmail) extraEmails.push(meeting.organizerEmail);

    const allRecipients = Array.from(
        new Set([...participantEmails, ...extraEmails])
    );

    if (allRecipients.length === 0) {
        return NextResponse.json(
            { error: "Aucun email de participant/organisateur trouvé." },
            { status: 400 }
        );
    }

    const subject = `Compte rendu de réunion – ${subtitle}`;
    const htmlBody = `
    <p>Bonjour,</p>
    <p>Veuillez trouver ci-joint le compte rendu de la réunion <strong>${subtitle}</strong>.</p>
    <p>Cordialement,<br/>ESPI_AI</p>
  `;

    const filename = `Compte-rendu-${meetingId}.pdf`;

    // 4️⃣ Envoi via Microsoft Graph en tant qu'utilisateur connecté
    const sendMailRes = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            message: {
                subject,
                body: {
                    contentType: "HTML",
                    content: htmlBody,
                },
                toRecipients: allRecipients.map((address) => ({
                    emailAddress: { address },
                })),
                attachments: [
                    {
                        "@odata.type": "#microsoft.graph.fileAttachment",
                        name: filename,
                        contentType: "application/pdf",
                        contentBytes: pdfBase64,
                    },
                ],
            },
            saveToSentItems: true,
        }),
    });

    if (!sendMailRes.ok) {
        const errorText = await sendMailRes.text();
        console.error("Erreur Graph sendMail:", sendMailRes.status, errorText);
        return NextResponse.json(
            { error: "Échec de l'envoi des emails" },
            { status: 500 }
        );
    }

    return NextResponse.json({
        ok: true,
        meetingId,
        sent: allRecipients.length,
    });
}
