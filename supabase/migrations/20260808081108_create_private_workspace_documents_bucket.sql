insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workspace-documents',
  'workspace-documents',
  false,
  20971520,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "workspace_documents_select_own" on storage.objects;
create policy "workspace_documents_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'workspace-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "workspace_documents_insert_own" on storage.objects;
create policy "workspace_documents_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'workspace-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "workspace_documents_update_own" on storage.objects;
create policy "workspace_documents_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'workspace-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'workspace-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "workspace_documents_delete_own" on storage.objects;
create policy "workspace_documents_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'workspace-documents'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);;
