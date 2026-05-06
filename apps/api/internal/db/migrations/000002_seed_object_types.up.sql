INSERT INTO object_types (name) VALUES
    ('mysql'),
    ('postgres'),
    ('redis'),
    ('rabbitmq'),
    ('mongodb'),
    ('s3'),
    ('elasticsearch')
ON CONFLICT (name) DO NOTHING;
