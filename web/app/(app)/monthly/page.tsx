import RollupView from "@/components/RollupView";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  return <RollupView rollupType="monthly" basePath="/monthly" page={page} />;
}
