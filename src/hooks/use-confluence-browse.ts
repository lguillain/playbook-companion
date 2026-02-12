import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ConfluenceSpace, ConfluencePageSummary } from "@/lib/types";

export function useConfluenceSpaces(enabled: boolean) {
  return useQuery<ConfluenceSpace[]>({
    queryKey: ["confluence-spaces"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("confluence-browse", {
        body: { action: "list-spaces" },
      });

      if (error) throw error;
      return data.spaces;
    },
    enabled,
  });
}

export function useConfluencePages(spaceId: string | null) {
  return useQuery<ConfluencePageSummary[]>({
    queryKey: ["confluence-pages", spaceId],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("confluence-browse", {
        body: { action: "list-pages", spaceId },
      });

      if (error) throw error;
      return data.pages;
    },
    enabled: !!spaceId,
  });
}
