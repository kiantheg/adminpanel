"use client";

import { useEffect, useState } from "react";
import type { CaptionStatisticsData } from "@/lib/caption-statistics";

let cachedData: CaptionStatisticsData | null = null;
let pendingRequest: Promise<CaptionStatisticsData> | null = null;

async function fetchCaptionStatistics() {
  if (cachedData) return cachedData;
  if (pendingRequest) return pendingRequest;

  pendingRequest = fetch("/api/caption-statistics", { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Failed to load caption statistics.");
      }
      return (await response.json()) as CaptionStatisticsData;
    })
    .then((data) => {
      cachedData = data;
      return data;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

export function useCaptionStatistics() {
  const [data, setData] = useState<CaptionStatisticsData | null>(cachedData);
  const [loading, setLoading] = useState(!cachedData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    void fetchCaptionStatistics()
      .then((result) => {
        if (!isActive) return;
        setData(result);
        setError(null);
      })
      .catch((loadError) => {
        if (!isActive) return;
        setError(loadError instanceof Error ? loadError.message : "Failed to load caption statistics.");
      })
      .finally(() => {
        if (!isActive) return;
        setLoading(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  return { data, error, loading };
}
