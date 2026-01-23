//! Remove legacy sync columns from devices table
//!
//! The columns last_sync_at, last_state_watermark, and last_shared_watermark
//! were added in m20251009_000001 but are now superseded by per-resource
//! watermark tracking in sync.db (device_resource_watermarks table).
//!
//! These columns were either never used (last_state_watermark, last_shared_watermark)
//! or used incorrectly as global sync timestamps instead of per-peer tracking (last_sync_at).
//!
//! See docs/core/LEGACY_SYNC_COLUMNS_MIGRATION.md for full context.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
	async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		// SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
		let db = manager.get_connection();

		// Step 1: Create new table without legacy columns
		db.execute_unprepared(
			r#"
			CREATE TABLE devices_new (
				id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
				uuid TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				slug TEXT NOT NULL UNIQUE,
				os TEXT NOT NULL,
				os_version TEXT,
				hardware_model TEXT,
				cpu_model TEXT,
				cpu_architecture TEXT,
				cpu_cores_physical INTEGER,
				cpu_cores_logical INTEGER,
				cpu_frequency_mhz BIGINT,
				memory_total_bytes BIGINT,
				form_factor TEXT,
				manufacturer TEXT,
				gpu_models TEXT,
				boot_disk_type TEXT,
				boot_disk_capacity_bytes BIGINT,
				swap_total_bytes BIGINT,
				network_addresses TEXT NOT NULL DEFAULT '[]',
				is_online INTEGER NOT NULL DEFAULT 0,
				last_seen_at TEXT NOT NULL,
				capabilities TEXT NOT NULL DEFAULT '{}',
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				sync_enabled INTEGER NOT NULL DEFAULT 1
			)
			"#,
		)
		.await?;

		// Step 2: Copy data from old table (excluding dropped columns)
		db.execute_unprepared(
			r#"
			INSERT INTO devices_new (
				id, uuid, name, slug, os, os_version, hardware_model,
				cpu_model, cpu_architecture, cpu_cores_physical, cpu_cores_logical,
				cpu_frequency_mhz, memory_total_bytes, form_factor, manufacturer,
				gpu_models, boot_disk_type, boot_disk_capacity_bytes, swap_total_bytes,
				network_addresses, is_online, last_seen_at, capabilities,
				created_at, updated_at, sync_enabled
			)
			SELECT
				id, uuid, name, slug, os, os_version, hardware_model,
				cpu_model, cpu_architecture, cpu_cores_physical, cpu_cores_logical,
				cpu_frequency_mhz, memory_total_bytes, form_factor, manufacturer,
				gpu_models, boot_disk_type, boot_disk_capacity_bytes, swap_total_bytes,
				network_addresses, is_online, last_seen_at, capabilities,
				created_at, updated_at, sync_enabled
			FROM devices
			"#,
		)
		.await?;

		// Step 3: Drop old table
		db.execute_unprepared("DROP TABLE devices").await?;

		// Step 4: Rename new table to original name
		db.execute_unprepared("ALTER TABLE devices_new RENAME TO devices")
			.await?;

		// Step 5: Recreate indexes
		db.execute_unprepared("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_uuid ON devices(uuid)")
			.await?;

		db.execute_unprepared("CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_slug ON devices(slug)")
			.await?;

		Ok(())
	}

	async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		// Restore columns for rollback
		let db = manager.get_connection();

		db.execute_unprepared(
			"ALTER TABLE devices ADD COLUMN last_sync_at TEXT DEFAULT NULL",
		)
		.await?;

		db.execute_unprepared(
			"ALTER TABLE devices ADD COLUMN last_state_watermark TEXT DEFAULT NULL",
		)
		.await?;

		db.execute_unprepared(
			"ALTER TABLE devices ADD COLUMN last_shared_watermark TEXT DEFAULT NULL",
		)
		.await?;

		Ok(())
	}
}
