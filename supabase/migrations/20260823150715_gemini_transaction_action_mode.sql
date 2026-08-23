alter table public.app_settings
  add column if not exists gemini_transaction_preview boolean not null default true;

comment on column public.app_settings.gemini_transaction_preview is
  'When true, Gemini-created transactions open in the review form. When false, complete transaction actions are posted directly.';
