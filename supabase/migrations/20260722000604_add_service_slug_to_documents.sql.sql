-- Add service_slug to documents for direct division categorization.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS service_slug text;

-- Backfill from the booking's service slug.
UPDATE public.documents d
SET service_slug = s.slug
FROM public.bookings b
JOIN public.services s ON s.id = b.service_id
WHERE d.booking_id = b.id
  AND d.service_slug IS NULL;

-- Index for fast division filtering.
CREATE INDEX IF NOT EXISTS idx_documents_service_slug ON public.documents (service_slug);
