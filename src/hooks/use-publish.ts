import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function usePublish() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: string) => {
      const { data, error } = await supabase.functions.invoke("publish", {
        body: { provider },
      });

      if (error) throw new Error(error.message || "Publish failed");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
    },
  });
}

export function useNotify() {
  return useMutation({
    mutationFn: async ({ type, message }: { type: string; message?: string }) => {
      const { data, error } = await supabase.functions.invoke("notify", {
        body: { type, message },
      });

      if (error) throw new Error(error.message || "Notification failed");
      return data;
    },
  });
}
