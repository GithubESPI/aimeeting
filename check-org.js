import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    // NE PAS mettre organization
    // NE PAS mettre project
});

async function run() {
    try {
        const res = await client.responses.create({
            model: "gpt-4o-mini",
            input: "hello from test script",
        });

        //console.log("✅ Réponse OK :", res.output[0].content[0].text);
    } catch (err) {
        console.error("❌ Erreur OpenAI :", err);
    }
}

run();
