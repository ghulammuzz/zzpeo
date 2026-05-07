ALTER TABLE services ADD COLUMN domain TEXT;
UPDATE services SET domain = domains[1] WHERE array_length(domains, 1) > 0;
ALTER TABLE services DROP COLUMN domains;
