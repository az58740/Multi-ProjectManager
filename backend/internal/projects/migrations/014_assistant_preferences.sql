CREATE TABLE IF NOT EXISTS assistant_preferences (
    user_id TEXT NOT NULL,
    preference_key TEXT NOT NULL CHECK (preference_key IN ('preferredLanguage', 'responseStyle', 'favoriteSection', 'defaultProjectCode')),
    preference_value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, preference_key)
);
