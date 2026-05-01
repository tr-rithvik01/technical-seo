import "./globals.css";
import NextAuthProvider from "../components/NextAuthProvider";

export const metadata = {
  title: "Aura | Technical SEO & GEO Auditor 2026",
  description: "Next-generation Technical SEO and Generative Engine Optimization audit platform.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <NextAuthProvider>{children}</NextAuthProvider>
      </body>
    </html>
  );
}
