import RollupView from "@/components/RollupView";

export default async function QuarterlyPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <RollupView rollupType="quarterly" basePath="/quarterly" page={page} />;
}
