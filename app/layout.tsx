import "./globals.css";

export const metadata = {
  title: "Il mio Ricettario",
  description: "Trasforma video e testi in ricette salvate e catalogate."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
