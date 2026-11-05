import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: { "2xl": "1400px" },
    },
    extend: {
      colors: {
        ink: {
          DEFAULT: "#111418",
          soft: "#666666",
          muted: "#667085",
        },
        surface: "#F7F7F8",
        line: "#E5E5E5",
        background: "#FFFFFF",
        foreground: "#111418",
        primary: { DEFAULT: "#E1251B", foreground: "#FFFFFF" },
        secondary: { DEFAULT: "#F7F7F8", foreground: "#111418" },
        muted: { DEFAULT: "#F7F7F8", foreground: "#666666" },
        destructive: { DEFAULT: "#DC2626", foreground: "#FFFFFF" },
        success: { DEFAULT: "#16A34A", foreground: "#FFFFFF" },
        warning: { DEFAULT: "#D97706", foreground: "#FFFFFF" },
        info: { DEFAULT: "#2563EB", foreground: "#FFFFFF" },
        border: "#E5E5E5",
        input: "#E5E5E5",
        ring: "#111418",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "1rem",
        md: "0.75rem",
        sm: "0.5rem",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(12px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-up": "fade-up 0.5s ease-out both",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
