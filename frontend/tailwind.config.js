/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: "#183A35",
          light: "#244B45",
        },
        surface: "#F3F5F2",
        primary: {
          DEFAULT: "#247768",
          dark: "#195C50",
          light: "#E5F1ED",
        },
        amber: {
          DEFAULT: "#C58B36",
          light: "#F8F0E2",
        },
        risk: {
          DEFAULT: "#C9524D",
          light: "#F8EAE8",
        },
        caution: {
          DEFAULT: "#B77B25",
          light: "#F8F0E2",
        },
        ink900: "#202B28",
        muted: "#66736E",
      },
      fontFamily: {
        display: ["Sora", "sans-serif"],
        body: ["Inter", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(24, 58, 53, 0.04), 0 8px 24px rgba(24, 58, 53, 0.045)",
      },
      borderRadius: {
        xl2: "0.875rem",
      },
    },
  },
  plugins: [],
};
