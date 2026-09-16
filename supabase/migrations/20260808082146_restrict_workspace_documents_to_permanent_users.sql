drop policy if exists "workspace_documents_select_own" on storage.objects;
create policy "workspace_documents_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'workspace-documents'
  and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "workspace_documents_insert_own" on storage.objects;
create policy "workspace_documents_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workspace-documents'
  and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "workspace_documents_update_own" on storage.objects;
create policy "workspace_documents_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'workspace-documents'
  and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'workspace-documents'
  and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "workspace_documents_delete_own" on storage.objects;
create policy "workspace_documents_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workspace-documents'
  and coalesce((auth.jwt()->>'is_anonymous')::boolean, false) = false
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);;
