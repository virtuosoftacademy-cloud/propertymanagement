import { LoadingSpinner } from "@/components/ui/loading-state";

export default function LeaseEditLoading() {
  return (
    <div className="flex justify-center items-center h-[90vh]">
      <LoadingSpinner message="" size="lg" />
    </div>
  );
}
