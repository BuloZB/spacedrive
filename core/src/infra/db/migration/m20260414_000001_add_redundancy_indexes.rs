//! Add composite index on entries(content_id, volume_id) for redundancy queries
//!
//! The redundancy feature needs to GROUP BY content_id and COUNT(DISTINCT volume_id)
//! across the entries table. Without this composite index, those queries would
//! require a full table scan on large libraries.

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
	async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		// Composite index for redundancy queries: "which content exists on which volumes?"
		// This covers GROUP BY content_id + COUNT(DISTINCT volume_id) patterns
		manager
			.get_connection()
			.execute_unprepared(
				"CREATE INDEX IF NOT EXISTS idx_entries_content_volume \
				 ON entries(content_id, volume_id) \
				 WHERE content_id IS NOT NULL AND volume_id IS NOT NULL",
			)
			.await?;

		Ok(())
	}

	async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
		manager
			.get_connection()
			.execute_unprepared("DROP INDEX IF EXISTS idx_entries_content_volume")
			.await?;

		Ok(())
	}
}
