export const metadata = {
  title: "Mini Marcenaria — Vendedora IA",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, background: "#fafafa" }}>{children}</body>
    </html>
  );
}
