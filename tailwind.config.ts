import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'SF Mono', 'monospace'],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
          warm: "hsl(var(--card-warm))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
        },
        status: {
          idea: "hsl(var(--status-idea))",
          draft: "hsl(var(--status-draft))",
          review: "hsl(var(--status-review))",
          approved: "hsl(var(--status-approved))",
          scheduled: "hsl(var(--status-scheduled))",
          published: "hsl(var(--status-published))",
          failed: "hsl(var(--status-failed))",
          rejected: "hsl(var(--status-rejected))",
        },
        "status-review": "hsl(var(--status-review))",
        "status-scheduled": "hsl(var(--status-scheduled))",
        "status-published": "hsl(var(--status-published))",
        aurora: {
          cyan: "hsl(var(--aurora-cyan))",
          violet: "hsl(var(--aurora-violet))",
          pink: "hsl(var(--aurora-pink))",
        },
      },
      borderRadius: {
        "3xl": "1.75rem",
        "2xl": "1.25rem",
        xl: "1rem",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      spacing: {
        "18": "4.5rem",
        "22": "5.5rem",
      },
      backdropBlur: {
        xs: "2px",
      },
      transitionDuration: {
        '250': '250ms',
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
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(20px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          from: { opacity: "0", transform: "translateY(-10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "aurora-float": {
          "0%, 100%": { transform: "translate(0, 0) scale(1)" },
          "25%": { transform: "translate(30px, -20px) scale(1.05)" },
          "50%": { transform: "translate(-20px, 30px) scale(0.95)" },
          "75%": { transform: "translate(-30px, -15px) scale(1.02)" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 20px hsl(195 85% 55% / 0.12)" },
          "50%": { boxShadow: "0 0 40px hsl(195 85% 55% / 0.25)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.4s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
        "slide-down": "slide-down 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "aurora": "aurora-float 20s ease-in-out infinite",
        "glow": "glow-pulse 2s ease-in-out infinite",
      },
      boxShadow: {
        "glass": "0 10px 35px hsl(235 25% 4% / 0.28), inset 0 1px 0 hsl(245 22% 40% / 0.06)",
        "glass-hover": "0 14px 45px hsl(235 25% 4% / 0.38), inset 0 1px 0 hsl(245 22% 45% / 0.10)",
        "soft": "0 2px 12px hsl(220 20% 20% / 0.03), 0 12px 32px hsl(220 20% 20% / 0.02)",
        "soft-lg": "0 4px 16px hsl(220 20% 20% / 0.05), 0 16px 40px hsl(220 20% 20% / 0.04)",
        "glow-sm": "0 0 20px hsl(195 85% 55% / 0.12)",
        "glow-md": "0 0 40px hsl(195 85% 55% / 0.22)",
        "glow-lg": "0 0 60px hsl(195 85% 55% / 0.32)",
        "glow-accent": "0 0 40px hsl(335 75% 60% / 0.18)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;