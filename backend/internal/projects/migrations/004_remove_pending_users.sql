-- Remove accounts created under the old administrator-approval flow.
-- Active administrators, active users, and disabled users are preserved.
DELETE FROM auth_sessions
WHERE user_id IN (SELECT id FROM auth_users WHERE status = 'pending');

DELETE FROM auth_users
WHERE status = 'pending';
