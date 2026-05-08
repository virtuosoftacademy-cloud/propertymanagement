import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function CalendarViewSkeleton() {
  return (
    <Card className="min-h-[600px]">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-32" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-8 w-8" />
              <Skeleton className="h-8 w-8" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Calendar Header - Days of Week */}
          <div className="grid grid-cols-7 gap-2 border-b pb-2">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
              <div key={day} className="p-2 text-center font-medium">
                <Skeleton className="h-4 w-8 mx-auto" />
              </div>
            ))}
          </div>

          {/* Calendar Grid - 6 weeks */}
          {Array.from({ length: 6 }).map((_, weekIndex) => (
            <div key={weekIndex} className="grid grid-cols-7 gap-2">
              {Array.from({ length: 7 }).map((_, dayIndex) => (
                <div
                  key={dayIndex}
                  className="min-h-[120px] p-2 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                >
                  {/* Day Number */}
                  <Skeleton className="h-4 w-6 mb-2" />

                  {/* Events for this day */}
                  <div className="space-y-1">
                    {/* Randomly show events on some days */}
                    {Math.random() > 0.6 && (
                      <div className="space-y-1">
                        <Skeleton className="h-6 w-full rounded text-xs" />
                        {Math.random() > 0.7 && (
                          <Skeleton className="h-6 w-3/4 rounded text-xs" />
                        )}
                        {Math.random() > 0.9 && (
                          <Skeleton className="h-4 w-1/2 rounded text-xs opacity-60" />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
