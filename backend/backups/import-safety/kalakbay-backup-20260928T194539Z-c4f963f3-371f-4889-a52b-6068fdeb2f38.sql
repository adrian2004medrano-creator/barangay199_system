SET FOREIGN_KEY_CHECKS=0;

DROP TABLE IF EXISTS `behavior_observations`;

CREATE TABLE `behavior_observations` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `category` varchar(100) NOT NULL,
  `severity` enum('mild','moderate','severe') NOT NULL,
  `description` text NOT NULL,
  `action_needed` tinyint(1) NOT NULL DEFAULT 0,
  `action_taken` text DEFAULT NULL,
  `observed_at` datetime NOT NULL,
  `created_by` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `idx_behavior_client_date` (`client_id`,`observed_at`),
  KEY `fk_behavior_author` (`created_by`),
  CONSTRAINT `fk_behavior_author` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  CONSTRAINT `fk_behavior_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `client_documents`;

CREATE TABLE `client_documents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `mime_type` varchar(150) DEFAULT NULL,
  `file_size` bigint(20) NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stored_name` (`stored_name`),
  KEY `idx_client_documents_client_id` (`client_id`),
  CONSTRAINT `fk_client_documents_client` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `clients`;

CREATE TABLE `clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `home_name` varchar(100) NOT NULL,
  `past_picture` varchar(255) DEFAULT NULL,
  `present_picture` varchar(255) DEFAULT NULL,
  `name` varchar(255) NOT NULL,
  `age` int(11) DEFAULT NULL,
  `sex` varchar(50) DEFAULT NULL,
  `civil_status` varchar(100) DEFAULT NULL,
  `religion` varchar(100) DEFAULT NULL,
  `occupation_income` varchar(255) DEFAULT NULL,
  `birthdate` date DEFAULT NULL,
  `birthplace` varchar(255) DEFAULT NULL,
  `city_address` varchar(255) DEFAULT NULL,
  `barangay` varchar(150) DEFAULT NULL,
  `source_of_referral` varchar(255) DEFAULT NULL,
  `date_admitted` date DEFAULT NULL,
  `case_category` varchar(255) DEFAULT NULL,
  `educational_attainment` varchar(255) DEFAULT NULL,
  `school_last_attended` varchar(255) DEFAULT NULL,
  `grade_level` varchar(100) DEFAULT NULL,
  `age_when_found` int(11) DEFAULT NULL,
  `date_time_when_found` datetime DEFAULT NULL,
  `place_where_found` varchar(255) DEFAULT NULL,
  `present_whereabouts` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `first_name` varchar(100) NOT NULL DEFAULT '',
  `middle_initial` varchar(30) DEFAULT NULL,
  `last_name` varchar(150) NOT NULL DEFAULT '',
  `facility_return_count` smallint(5) unsigned NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=48 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `home_reports`;

CREATE TABLE `home_reports` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `home_name` varchar(100) NOT NULL,
  `report_type` enum('monthly','yearly') NOT NULL,
  `report_period` varchar(7) NOT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `mime_type` varchar(150) DEFAULT NULL,
  `file_size` bigint(20) unsigned NOT NULL,
  `uploaded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `stored_name` (`stored_name`),
  KEY `idx_home_reports_period` (`home_name`,`report_type`,`report_period`,`uploaded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `notifications`;

CREATE TABLE `notifications` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `recipient_id` int(11) NOT NULL,
  `actor_id` int(11) DEFAULT NULL,
  `message` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_recipient` (`recipient_id`,`read_at`,`created_at`),
  CONSTRAINT `fk_notifications_recipient` FOREIGN KEY (`recipient_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=102 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `password_reset_codes`;

CREATE TABLE `password_reset_codes` (
  `user_id` int(11) NOT NULL,
  `code_hash` char(64) NOT NULL,
  `expires_at` datetime NOT NULL,
  `attempts` tinyint(3) unsigned NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`user_id`),
  CONSTRAINT `fk_password_reset_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

DROP TABLE IF EXISTS `users`;

CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `first_name` varchar(100) NOT NULL,
  `middle_initial` varchar(30) DEFAULT NULL,
  `last_name` varchar(100) NOT NULL,
  `age` int(11) NOT NULL,
  `email` varchar(150) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `role` varchar(50) NOT NULL DEFAULT 'user',
  `position` varchar(100) NOT NULL DEFAULT '',
  `profile_picture` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=156 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `users` (`id`, `first_name`, `middle_initial`, `last_name`, `age`, `email`, `password`, `created_at`, `role`, `position`, `profile_picture`) VALUES
(1, 'Agnes', 'C.', 'Aragon', 35, 'superadmin@boystown.org', '$2a$10$bxpsfK050/HyFbPGPYV.WeeUOlxSp3EImHD2.NGrZAUrtgGv.xkmq', 'null', 'superadmin', 'Officer-in-Charge', NULL),
(76, 'Adrian', 'Asuncion', 'Medrano', 22, 'adrian2004medrano@gmail.com', '$2a$10$GodPld8zMgtwUUxg4jbTw.ljafFL.axF0hn8/0DgPYHi6aaO.AmlG', 'null', 'social_worker', '', NULL),
(82, 'Adrian', 'Asuncion', 'Medrano', 22, 'medranoadrianasuncion11@gmail.com', '$2a$10$BeuRUCqxhr9xt4nVQTYDhuOqJ/t5OKP4e42qVMX4Ku7x4/1GNdeBi', 'null', 'psychometrician', '', NULL);

SET FOREIGN_KEY_CHECKS=1;
