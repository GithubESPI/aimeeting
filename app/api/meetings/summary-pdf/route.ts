import { NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fs from "fs";
import path from "path";
import { formatParticipants } from "@/lib/participants";

export const dynamic = "force-dynamic";

type AiSummary = {
    titre: string;
    date: string;
    heure: string;
    participants: string[];
    synthese_4_5_lignes: string;
    decisions?: string[];
    taches?: Array<{ tache: string; owner: string; deadline: string | null }>;
    compte_rendu_10_points?: string[];
    compte_rendu_10_points_developpes?: string[];
};

function wrapText(text: string, maxWidth: number, font: any, fontSize: number) {
    const words = (text || "").split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let cur = "";

    for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        const width = font.widthOfTextAtSize(test, fontSize);
        if (width <= maxWidth) {
            cur = test;
        } else {
            if (cur) lines.push(cur);
            cur = w;
        }
    }
    if (cur) lines.push(cur);
    return lines;
}


export async function POST(req: Request) {
    try {
        const data = (await req.json()) as AiSummary;

        const pdfDoc = await PDFDocument.create();
        const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

        const logoPath = path.join(process.cwd(), "public", "logo_blanc.png");
        const logoBytes = fs.readFileSync(logoPath);
        const logoImage = await pdfDoc.embedPng(logoBytes);

        const A4 = { w: 595.28, h: 841.89 };
        const margin = 40;

        const teal = rgb(0.06, 0.38, 0.48);
        const lightGray = rgb(0.93, 0.95, 0.97);
        const midGray = rgb(0.82, 0.86, 0.90);
        const red = rgb(0.92, 0.33, 0.36);
        const darkTeal = rgb(0.03, 0.25, 0.33);

        let page = pdfDoc.addPage([A4.w, A4.h]);
        let y = A4.h - margin;

        const drawHeader = (title: string, subtitle?: string) => {
            page.drawRectangle({
                x: 0,
                y: A4.h - 120,
                width: A4.w,
                height: 120,
                color: teal,
            });

            const logoW = 130;
            const logoH = (logoImage.height / logoImage.width) * logoW;
            const logoX = (A4.w - logoW) / 2;
            const logoY = A4.h - 55;

            page.drawImage(logoImage, {
                x: logoX,
                y: logoY,
                width: logoW,
                height: logoH,
            });

            const tSize = 18;
            const tWidth = fontBold.widthOfTextAtSize(title, tSize);
            page.drawText(title, {
                x: (A4.w - tWidth) / 2,
                y: A4.h - 80,
                size: tSize,
                font: fontBold,
                color: rgb(1, 1, 1),
            });

            if (subtitle) {
                const sSize = 12;
                const sWidth = fontRegular.widthOfTextAtSize(subtitle, sSize);
                page.drawText(subtitle, {
                    x: (A4.w - sWidth) / 2,
                    y: A4.h - 105,
                    size: sSize,
                    font: fontRegular,
                    color: rgb(1, 1, 1),
                });
            }

            y = A4.h - 150;
        };

        const ensureSpace = (needed: number) => {
            if (y - needed < margin) {
                page = pdfDoc.addPage([A4.w, A4.h]);
                y = A4.h - margin;
            }
        };

        const sectionTitle = (label: string, color = midGray) => {
            ensureSpace(30);
            page.drawRectangle({ x: margin, y: y - 20, width: A4.w - margin * 2, height: 18, color });
            page.drawText(label, {
                x: margin + 10,
                y: y - 16,
                size: 10,
                font: fontBold,
                color: rgb(0.1, 0.2, 0.25),
            });
            y -= 32;
        };

        // ✅ Nouvelle fonction pour afficher les participants de manière plus propre
        const participantsBox = (participants: string[]) => {
            const formatted = formatParticipants(participants || []);
            if (formatted.length === 0) return;

            const fontSize = 9;
            const lineHeight = 14;

            // largeur utile (padding inclus)
            const contentWidth = A4.w - margin * 2 - 24;

            // wrap si une ligne est trop longue
            const lines: string[] = [];
            for (const p of formatted) {
                const wrapped = wrapText(`• ${p.label}`, contentWidth, fontRegular, fontSize);
                lines.push(...wrapped);
            }

            const boxH = lines.length * lineHeight + 24;
            ensureSpace(boxH);

            page.drawRectangle({
                x: margin,
                y: y - boxH,
                width: A4.w - margin * 2,
                height: boxH,
                color: lightGray,
            });

            let yy = y - 18;
            for (const ln of lines) {
                page.drawText(ln, {
                    x: margin + 12,
                    y: yy,
                    size: fontSize,
                    font: fontRegular,
                    color: rgb(0.15, 0.2, 0.25),
                });
                yy -= lineHeight;
            }

            y -= boxH + 18;
        };


        const infoBox = (rows: Array<[string, string]>) => {
            ensureSpace(120);
            const boxH = rows.length * 18 + 18;
            page.drawRectangle({
                x: margin,
                y: y - boxH,
                width: A4.w - margin * 2,
                height: boxH,
                color: lightGray,
            });

            let yy = y - 22;
            for (const [k, v] of rows) {
                page.drawText(k, { x: margin + 12, y: yy, size: 9, font: fontBold, color: rgb(0.15, 0.2, 0.25) });
                page.drawText(v || "Non précisé", { x: margin + 130, y: yy, size: 9, font: fontRegular, color: rgb(0.15, 0.2, 0.25) });
                yy -= 18;
            }

            y -= boxH + 18;
        };

        const textBlock = (text: string, fontSize = 10, maxLines?: number) => {
            const width = A4.w - margin * 2 - 20;
            const lines = wrapText(text || "", width, fontRegular, fontSize);
            const safeLines = typeof maxLines === "number" ? lines.slice(0, maxLines) : lines;

            const lineH = fontSize + 4;
            ensureSpace(safeLines.length * lineH + 20);

            page.drawRectangle({
                x: margin,
                y: y - (safeLines.length * lineH + 16),
                width: A4.w - margin * 2,
                height: safeLines.length * lineH + 16,
                color: rgb(1, 1, 1),
                borderColor: midGray,
                borderWidth: 1,
            });

            let yy = y - 18;
            for (const ln of safeLines) {
                page.drawText(ln, { x: margin + 10, y: yy, size: fontSize, font: fontRegular, color: rgb(0.12, 0.12, 0.12) });
                yy -= lineH;
            }

            y -= safeLines.length * lineH + 26;
        };

        const bulletBox = (label: string, items: string[], headerColor: any) => {
            if (!items?.length) return;

            ensureSpace(120);

            page.drawRectangle({ x: margin, y: y - 18, width: A4.w - margin * 2, height: 18, color: headerColor });
            page.drawText(label, { x: margin + 10, y: y - 14, size: 10, font: fontBold, color: rgb(1, 1, 1) });
            y -= 26;

            const width = A4.w - margin * 2 - 30;
            const fontSize = 10;
            const lineH = fontSize + 4;

            const linesAll: string[] = [];
            for (const it of items) {
                const lines = wrapText(it, width, fontRegular, fontSize);
                linesAll.push("• " + (lines[0] ?? ""));
                for (let i = 1; i < lines.length; i++) linesAll.push("  " + lines[i]);
                linesAll.push("");
            }

            const boxH = linesAll.length * lineH + 14;
            ensureSpace(boxH);

            page.drawRectangle({
                x: margin,
                y: y - boxH,
                width: A4.w - margin * 2,
                height: boxH,
                color: rgb(1, 1, 1),
                borderColor: midGray,
                borderWidth: 1,
            });

            let yy = y - 18;
            for (const ln of linesAll) {
                if (ln === "") {
                    yy -= lineH / 2;
                    continue;
                }
                page.drawText(ln, { x: margin + 12, y: yy, size: fontSize, font: fontRegular, color: rgb(0.12, 0.12, 0.12) });
                yy -= lineH;
            }

            y -= boxH + 18;
        };

        // ---------- Page 1 ----------
        drawHeader("Compte rendu de réunion", data.titre || "");

        sectionTitle("Informations générales");
        infoBox([
            ["Titre de la réunion", data.titre || "Non précisé"],
            ["Date", data.date || "Non précisé"],
            ["Heure", data.heure || "Non précisé"],
        ]);

        // ✅ Section participants séparée avec un meilleur affichage
        sectionTitle("Participants");
        participantsBox(data.participants || []);

        sectionTitle("Résumé rapide");
        textBlock(data.synthese_4_5_lignes || "Non précisé", 10);

        const decisions = (data.decisions ?? []).filter(Boolean);
        if (decisions.length > 0) {
            sectionTitle("Décisions prises", red);
            bulletBox("Décisions prises", decisions, darkTeal);
        }

        // ✅ Affichage amélioré des tâches
        const taches = (data.taches ?? []).filter(Boolean);
        if (taches.length > 0) {
            sectionTitle("Tâches à réaliser");
            const tachesFormatted = taches.map((t) => {
                let str = t.tache;
                if (t.owner && t.owner !== "Non précisé") str += ` (Owner: ${t.owner})`;
                if (t.deadline) str += ` (Deadline: ${t.deadline})`;
                return str;
            });
            bulletBox("Tâches à réaliser", tachesFormatted, darkTeal);
        }

        sectionTitle("Contenu détaillé de la réunion");

        const dev = data.compte_rendu_10_points_developpes || [];
        y -= 15;
        for (let i = 0; i < dev.length; i++) {
            page.drawText(`Point ${i + 1}`, {
                x: margin,
                y: y,
                size: 12,
                font: fontBold,
                color: rgb(0.1, 0.15, 0.18),
            });

            y -= 18;

            const paragraphs = (dev[i] || "")
                .split("\n")
                .map((p) => p.trim())
                .filter(Boolean);

            for (const p of paragraphs) {
                textBlock(p, 10);
                y -= 8;
            }

            y -= 6;
        }

        // Footer
        const pages = pdfDoc.getPages();
        for (let idx = 0; idx < pages.length; idx++) {
            const p = pages[idx];
            p.drawText(`ESPI — Synthèse générée par ESPI_AI`, { x: margin, y: 20, size: 8, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
            p.drawText(`Page ${idx + 1} / ${pages.length}`, {
                x: A4.w - margin - 60,
                y: 20,
                size: 8,
                font: fontRegular,
                color: rgb(0.4, 0.4, 0.4),
            });
        }

        const pdfBytes = await pdfDoc.save();

        return new NextResponse(Buffer.from(pdfBytes), {
            status: 200,
            headers: {
                "Content-Type": "application/pdf",
                "Content-Disposition": `attachment; filename="compte-rendu-${(data.titre || "reunion").replace(/[^\w\-]+/g, "_")}.pdf"`,
            },
        });
    } catch (e: any) {
        console.error("[PDF] Error:", e);
        return NextResponse.json({ error: e?.message ?? "Erreur PDF" }, { status: 500 });
    }
}