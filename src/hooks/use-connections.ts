import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ConnectionRow } from "@/lib/types";

export function useConnections() {
  return useQuery<ConnectionRow[]>({
    queryKey: ["connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("connections")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useStartOAuth() {
  return async (provider: "notion" | "confluence") => {
    const { data, error } = await supabase.functions.invoke(
      `auth-${provider}`,
      { body: { action: "connect" } }
    );

    if (error) throw error;
    if (!data?.url) throw new Error("No OAuth URL returned");

    window.location.href = data.url;
  };
}
