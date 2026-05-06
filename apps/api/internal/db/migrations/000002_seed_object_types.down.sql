DELETE FROM object_types WHERE name IN (
    'mysql', 'postgres', 'redis', 'rabbitmq', 'mongodb', 's3', 'elasticsearch'
);
