import { AppRoot } from "@/components/app/AppRoot";

export default function WorkspaceLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <AppRoot>{children}</AppRoot>;
}
