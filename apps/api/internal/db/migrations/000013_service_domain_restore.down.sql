ALTER TABLE services ADD COLUMN domains TEXT[] NOT NULL DEFAULT '{}';
UPDATE services SET domains = ARRAY[domain] WHERE domain IS NOT NULL;
ALTER TABLE services DROP COLUMN domain;
