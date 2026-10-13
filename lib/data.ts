"use client";
import { useCallback, useEffect, useState } from "react";
import { RecordModel } from "pocketbase";
import { pb } from "./pb";

export interface Cap extends RecordModel {
  name: string;
  level: number;
  parent: string;
  description: string;
  strategicImportance: number;
  sortOrder: number;
  active: boolean;
}

/** Laedt eine komplette Collection (kleine Stammdaten) und liefert reload() */
export function useList<T extends RecordModel = RecordModel>(collection: string, options: Record<string, unknown> = {}) {
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const key = JSON.stringify(options);
  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await pb.collection(collection).getFullList<T>(JSON.parse(key)));
    } finally {
      setLoading(false);
    }
  }, [collection, key]);
  useEffect(() => {
    reload();
  }, [reload]);
  return { items, loading, reload };
}

export const useCapabilities = () => useList<Cap>("capabilities", { filter: "active=true", sort: "sortOrder" });
