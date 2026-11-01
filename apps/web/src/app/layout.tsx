import "./globals.css";
export const metadata = { title: "Anime Video Editor", description: "Voiceover-driven template-based editing" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
