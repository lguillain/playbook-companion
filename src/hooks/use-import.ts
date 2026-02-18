import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { ImportRow } from "@/lib/types";

export function useImports() {
  return useQuery<ImportRow[]>({
    queryKey: ["imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .order("started_at", { ascending: false });

      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useImportStatus(importId: string | null) {
  return useQuery<ImportRow | null>({
    queryKey: ["import-status", importId],
    queryFn: async () => {
      if (!importId) return null;
      const { data, error } = await supabase
        .from("imports")
        .select("*")
        .eq("id", importId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!importId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Poll while processing
      return status === "processing" || status === "pending" ? 2000 : false;
    },
  });
}

export function useStartImport(onPhaseChange?: (phase: "extracting" | "analyzing") => void) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ provider, content, pdfBase64 }: { provider: string; content?: string; pdfBase64?: string }) => {
      // Step 1: Import — convert to markdown and save sections
      onPhaseChange?.("extracting");
      const { data, error } = await supabase.functions.invoke("import", {
        body: { provider, content, pdfBase64 },
      });
      if (error) throw error;

      // Sections are now in the DB — make them visible immediately
      await queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      await queryClient.invalidateQueries({ queryKey: ["imports"] });

      // Step 2: Analyze — skill mapping on saved sections
      onPhaseChange?.("analyzing");
      const { error: analyzeError } = await supabase.functions.invoke("analyze");
      if (analyzeError) throw analyzeError;

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["health-score"] });
    },
  });
}

export function useStartNotionImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("import-notion");

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

export function useStartConfluenceImport() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (pageIds?: string[]) => {
      const { data, error } = await supabase.functions.invoke("import-confluence", {
        body: pageIds ? { pageIds } : {},
      });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}
