-- ==============================================================================
-- SnipHub Notifications, Upvotes & Snippets Realtime Setup
-- ==============================================================================

-- 0. Snippets Table UPDATE Policy (Begenilerin ve kopyalama sayisinin guncellenebilmesi icin)
ALTER TABLE IF EXISTS public.snippets REPLICA IDENTITY FULL;

DROP POLICY IF EXISTS "Herkes snippet begeni guncelleyebilir" ON public.snippets;
CREATE POLICY "Herkes snippet begeni guncelleyebilir"
ON public.snippets FOR UPDATE
USING (true)
WITH CHECK (true);

-- 1. Notifications Table
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name TEXT,
  snippet_id UUID REFERENCES public.snippets(id) ON DELETE CASCADE,
  snippet_title TEXT,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Anyone can create notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can delete own notifications" ON public.notifications;

CREATE POLICY "Users can read own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Anyone can create notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id OR user_id IS NULL)
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Users can delete own notifications"
ON public.notifications FOR DELETE
USING (auth.uid() = user_id OR user_id IS NULL);

-- 2. Upvotes Table
CREATE TABLE IF NOT EXISTS public.upvotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  snippet_id UUID REFERENCES public.snippets(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, snippet_id)
);

CREATE INDEX IF NOT EXISTS idx_upvotes_snippet_id ON public.upvotes(snippet_id);
CREATE INDEX IF NOT EXISTS idx_upvotes_user_id ON public.upvotes(user_id);

ALTER TABLE public.upvotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read upvotes" ON public.upvotes;
DROP POLICY IF EXISTS "Authenticated users can toggle upvotes" ON public.upvotes;
DROP POLICY IF EXISTS "Users can delete own upvotes" ON public.upvotes;

CREATE POLICY "Anyone can read upvotes"
ON public.upvotes FOR SELECT
USING (true);

CREATE POLICY "Authenticated users can toggle upvotes"
ON public.upvotes FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can delete own upvotes"
ON public.upvotes FOR DELETE
USING (auth.uid() = user_id OR user_id IS NULL);

-- 3. Enable Realtime on tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'snippets') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.snippets;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'upvotes') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.upvotes;
  END IF;
END $$;
