import { type Config } from "tailwindcss";

export default {
    content: [
        "./app/**/*.{ts,tsx}",
        "./components/**/*.{ts,tsx}",
        "./pages/**/*.{ts,tsx}",
    ],
} satisfies Config;
