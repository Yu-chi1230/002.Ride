ALTER TABLE public.announcements
ADD COLUMN IF NOT EXISTS notion_page_id text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_announcements_notion_page_id_unique
ON public.announcements (notion_page_id)
WHERE notion_page_id IS NOT NULL;
