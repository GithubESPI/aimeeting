// lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

type SendMeetingReportEmailParams = {
    to: string;
    subject: string;
    html: string;
    pdfBytes: Uint8Array;
    filename: string;
};

export async function sendMeetingReportEmail({
                                                 to,
                                                 subject,
                                                 html,
                                                 pdfBytes,
                                                 filename,
                                             }: SendMeetingReportEmailParams) {
    const buffer = Buffer.from(pdfBytes);

    return resend.emails.send({
        // ⚠️ utilise une adresse sur le domaine que tu auras VERIFIÉ dans Resend
        from: "ESPI_AI <no-reply@groupe-espi.fr>",
        to,                    // ex: "a.vespuce@groupe-espi.fr"
        subject,
        html,
        attachments: [
            {
                filename,
                content: buffer.toString("base64"),
                contentType: "application/pdf",
            },
        ],
    });
}
