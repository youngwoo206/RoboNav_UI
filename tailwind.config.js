export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./src/*.{js,ts,jsx,tsx}",
  ],
  // safelist: [
  //   {
  //     pattern: /grid-cols-./,
  //   },
  // ],
  theme: {
    extend: {
      colors: {
        primary: "#a35a4a",
      },
      fontFamily: {
        sans: ["Helvetica", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};
