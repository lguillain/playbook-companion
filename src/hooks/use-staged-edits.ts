import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { StagedEdit } from "@/lib/types";

export function useStagedEdits() {
  return useQuery<StagedEdit[]>({
    queryKey: ["staged-edits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staged_edits")
        .select("*, playbook_sections!inner(title)")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return (data ?? []).map((row): StagedEdit => ({
        id: row.id,
        sectionId: row.section_id,
        section: (row.playbook_sections as { title: string }).title,
        before: row.before_text,
        after: row.after_text,
        timestamp: row.created_at,
        status: row.status as StagedEdit["status"],
        source: (row.source as StagedEdit["source"]) ?? undefined,
      }));
    },
  });
}

export function useCreateStagedEdit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (edit: {
      sectionId: string;
      before: string;
      after: string;
      source: "chat" | "manual";
      autoApprove?: boolean;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();

      const row: Record<string, unknown> = {
        section_id: edit.sectionId,
        before_text: edit.before,
        after_text: edit.after,
        source: edit.source,
        created_by: user?.id ?? null,
      };

      if (edit.autoApprove) {
        row.status = "approved";
        row.reviewed_by = user?.id ?? null;
        row.reviewed_at = new Date().toISOString();
      }

      const { error } = await supabase.from("staged_edits").insert(row);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
    },
  });
}

export function useApproveEdit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (editId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase.rpc("approve_staged_edit", {
        edit_id: editId,
        reviewer_id: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
    },
  });
}

export function useRejectEdit() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (editId: string) => {
      const { data: { user } } = await supabase.auth.getUser();

      const { error } = await supabase
        .from("staged_edits")
        .update({
          status: "rejected",
          reviewed_by: user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", editId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
    },
  });
}
