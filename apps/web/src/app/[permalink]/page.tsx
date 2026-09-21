import type { Metadata } from "next";
import { PublicReaderRoute, publicReaderMetadata } from "@/app/_reader/PublicReaderRoute";

interface RouteProps {
  params: Promise<{ permalink: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}

function parsePage(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const page = Number(raw);
  return Number.isInteger(page) && page > 0 ? page : undefined;
}

export async function generateMetadata({ params }: RouteProps): Promise<Metadata> {
  const { permalink } = await params;
  return publicReaderMetadata(permalink);
}

export default async function PublicReaderPage({ params, searchParams }: RouteProps) {
  const { permalink } = await params;
  return <PublicReaderRoute permalink={permalink} initialPage={parsePage((await searchParams).page)} />;
}
