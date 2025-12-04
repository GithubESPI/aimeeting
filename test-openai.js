import "dotenv/config";
import OpenAI from "openai";

const client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG_ID
});

const run = async () => {
    const r = await client.responses.create({
        model: "gpt-4o-mini",
        input: "hello world",
    });
    console.log(r.output_text);
};

run();
