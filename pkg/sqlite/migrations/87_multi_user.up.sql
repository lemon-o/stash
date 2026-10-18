CREATE TABLE IF NOT EXISTS `users` (
  `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  `username` VARCHAR(255) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `is_admin` BOOLEAN NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS `users_scenes_activity` (
  `user_id` INTEGER NOT NULL,
  `scene_id` INTEGER NOT NULL,
  `resume_time` FLOAT NOT NULL DEFAULT 0,
  `play_duration` FLOAT NOT NULL DEFAULT 0,
  `play_count` INTEGER NOT NULL DEFAULT 0,
  `last_played_at` DATETIME,
  PRIMARY KEY(`user_id`, `scene_id`),
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`scene_id`) REFERENCES `scenes`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_users_scenes_activity_user_scene` ON `users_scenes_activity` (`user_id`, `scene_id`);
CREATE INDEX IF NOT EXISTS `idx_users_scenes_activity_user_last_played` ON `users_scenes_activity` (`user_id`, `last_played_at`);

CREATE TABLE IF NOT EXISTS `users_scenes_views` (
  `id` INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  `user_id` INTEGER NOT NULL,
  `scene_id` INTEGER NOT NULL,
  `view_date` DATETIME NOT NULL,
  FOREIGN KEY(`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  FOREIGN KEY(`scene_id`) REFERENCES `scenes`(`id`) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS `idx_users_scenes_views_user_scene` ON `users_scenes_views` (`user_id`, `scene_id`);
