import { useQueryClient } from "@tanstack/react-query";
import { 
  useCreateFolder, 
  useUpdateFolder, 
  useDeleteFolder,
  useCreateSample,
  useUpdateSample,
  useDeleteSample,
  useMoveSample,
  getGetFoldersQueryKey,
  getGetSamplesQueryKey,
  getGetSampleQueryKey
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";

// Wrappers around generated hooks to add cache invalidation and toast notifications
export function useFoldersMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createFolder = useCreateFolder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFoldersQueryKey() });
        toast({ title: "Folder created" });
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  });

  const updateFolder = useUpdateFolder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFoldersQueryKey() });
        toast({ title: "Folder updated" });
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  });

  const deleteFolder = useDeleteFolder({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetFoldersQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
        toast({ title: "Folder deleted" });
      },
      onError: (err: any) => toast({ title: "Error", description: err.message, variant: "destructive" })
    }
  });

  return { createFolder, updateFolder, deleteFolder };
}

export function useSamplesMutations() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const createSample = useCreateSample({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
        toast({ title: "Sample recorded successfully" });
      },
      onError: (err: any) => toast({ title: "Error creating sample", description: err.message, variant: "destructive" })
    }
  });

  const updateSample = useUpdateSample({
    mutation: {
      onSuccess: (data: { id: string | number }) => {
        queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSampleQueryKey(data.id) });
        toast({ title: "Sample updated" });
      },
      onError: (err: any) => toast({ title: "Error updating sample", description: err.message, variant: "destructive" })
    }
  });

  const deleteSample = useDeleteSample({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
        toast({ title: "Sample deleted" });
      },
      onError: (err: any) => toast({ title: "Error deleting sample", description: err.message, variant: "destructive" })
    }
  });

  const moveSample = useMoveSample({
    mutation: {
      onSuccess: (data: { id: string | number }) => {
        queryClient.invalidateQueries({ queryKey: getGetSamplesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetSampleQueryKey(data.id) });
        toast({ title: "Sample moved" });
      },
      onError: (err: any) => toast({ title: "Error moving sample", description: err.message, variant: "destructive" })
    }
  });

  return { createSample, updateSample, deleteSample, moveSample };
}
