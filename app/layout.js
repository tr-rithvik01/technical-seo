import "./globals.css";
import NextAuthProvider from "../components/NextAuthProvider";
import Script from "next/script";

export const metadata = {
  title: "Aura | Technical SEO & GEO Auditor 2026",
  description: "Next-generation Technical SEO and Generative Engine Optimization audit platform.",
  verification: {
    google: "2N_ZZVrTjNB_lWi2vOhfhNL9yLTo45bf4q4z5WW9bFQ",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Script src="https://accounts.google.com/gsi/client" strategy="beforeInteractive" />
        <NextAuthProvider>{children}</NextAuthProvider>
      </body>
    </html>
  );
}
