create table public.gemini_conversations (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  workspace text not null,
  messages jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  updated_at timestamptz not null default now(),
  primary key (user_id, workspace),
  constraint gemini_conversations_workspace_fkey
    foreign key (user_id, workspace) references public.user_workspaces(user_id, slug) on delete cascade,
  constraint gemini_conversations_messages_array check (jsonb_typeof(messages) = 'array')
);

alter table public.gemini_conversations enable row level security;

create policy "Users read their Gemini conversations"
on public.gemini_conversations for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users create their Gemini conversations"
on public.gemini_conversations for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users update their Gemini conversations"
on public.gemini_conversations for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users delete their Gemini conversations"
on public.gemini_conversations for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.gemini_conversations to authenticated;

alter publication supabase_realtime add table public.gemini_conversations;
