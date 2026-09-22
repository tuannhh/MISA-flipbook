import { PublicReaderRoute } from "@/app/_reader/PublicReaderRoute";

export default async function LegacyEmbedReaderPage({ params }: { params: Promise<{ permalink: string }> }) {
  const { permalink } = await params;
  return <PublicReaderRoute permalink={permalink} embed />;
}
