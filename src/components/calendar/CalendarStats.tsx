"use client";

import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarDays, Clock, TrendingUp, Users } from "lucide-react";

interface CalendarStatsData {
  totalEvents: number;
  upcomingEvents: number;
  todayEvents: number;
  pendingRSVPs: number;
  eventsByType: Record<string, number>;
  eventsByStatus: Record<string, number>;
}

const defaultStats: CalendarStatsData = {
  totalEvents: 0,
  upcomingEvents: 0,
  todayEvents: 0,
  pendingRSVPs: 0,
  eventsByType: {},
  eventsByStatus: {},
};

export function CalendarStats() {
  const [stats, setStats] = useState<CalendarStatsData>(defaultStats);
  const isMountedRef = React.useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    loadStats();
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadStats = async () => {
    try {
      const response = await fetch("/api/calendar/stats");
      if (response.ok && isMountedRef.current) {
        const result = await response.json();
        if (isMountedRef.current) {
          setStats(result.data);
        }
      }
    } catch (error) {
      console.error("Failed to load calendar stats:", error);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Total Events
              </p>
              <p className="text-2xl font-bold">{stats.totalEvents}</p>
            </div>
            <CalendarDays className="h-8 w-8 text-blue-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Upcoming
              </p>
              <p className="text-2xl font-bold">{stats.upcomingEvents}</p>
            </div>
            <Clock className="h-8 w-8 text-green-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">Today</p>
              <p className="text-2xl font-bold">{stats.todayEvents}</p>
            </div>
            <TrendingUp className="h-8 w-8 text-orange-500" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <p className="text-sm font-medium text-muted-foreground">
                Pending RSVPs
              </p>
              <p className="text-2xl font-bold">{stats.pendingRSVPs}</p>
            </div>
            <Users className="h-8 w-8 text-purple-500" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
