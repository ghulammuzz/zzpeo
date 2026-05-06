CREATE TABLE env_var_sets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE env_var_set_items (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    set_id      UUID NOT NULL REFERENCES env_var_sets(id) ON DELETE CASCADE,
    key         TEXT NOT NULL,
    value_enc   BYTEA NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(set_id, key)
);

CREATE TABLE service_env_var_sets (
    service_id  UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    set_id      UUID NOT NULL REFERENCES env_var_sets(id) ON DELETE CASCADE,
    PRIMARY KEY (service_id, set_id)
);
