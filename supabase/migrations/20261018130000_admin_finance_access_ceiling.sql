-- Let the Admin & Finance head grant department and field-app permissions.
INSERT INTO public.division_grant_ceilings (service_id, capability_key)
SELECT s.id, c.key
FROM public.services s
CROSS JOIN public.capability_catalog c
WHERE s.slug = 'admin-finance'
  AND c.grantable = true
  AND c.key IN (
    'div.view',
    'div.manage_documents',
    'div.reports',
    'div.delegate_tasks',
    'field.jobs',
    'field.attendance',
    'field.incidents'
  )
ON CONFLICT DO NOTHING;
