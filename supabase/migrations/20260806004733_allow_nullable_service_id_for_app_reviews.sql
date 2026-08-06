/* Allow app-level reviews without a service_id (general app feedback) */
ALTER TABLE reviews ALTER COLUMN service_id DROP NOT NULL;
