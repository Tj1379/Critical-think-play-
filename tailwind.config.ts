import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#0f1f1c",
        mint: "#dff7ee",
        leaf: "#1f9d72",
        clay: "#f9efe4"
      }
    }
  },
  plugins: []
};

export default config;
