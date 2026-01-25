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
		// SQLite 3.35.0+ supports ALTER TABLE DROP COLUMN directly.
		// This avoids the table recreation pattern which has FK constraint issues.
		let db = manager.get_connection();

		// Drop last_sync_at column
		db.execute_unprepared("ALTER TABLE devices DROP COLUMN last_sync_at")
			.await?;

		// Drop last_state_watermark column (was never used)
		db.execute_unprepared("ALTER TABLE devices DROP COLUMN last_state_watermark")
			.await?;

		// Drop last_shared_watermark column (was never used)
		db.execute_unprepared("ALTER TABLE devices DROP COLUMN last_shared_watermark")
			.await?;

		Ok(())
	}

	async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		// Restore columns for rollback
		let db = manager.get_connection();

		db.execute_unprepared("ALTER TABLE devices ADD COLUMN last_sync_at TEXT DEFAULT NULL")
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
