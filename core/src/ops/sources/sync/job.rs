//! Source sync job implementation

use crate::infra::job::prelude::*;
use serde::{Deserialize, Serialize};
use std::time::Instant;

/// Job that syncs an archive data source via its adapter script.
#[derive(Debug, Serialize, Deserialize)]
pub struct SourceSyncJob {
	pub source_id: String,
	pub source_name: String,

	#[serde(skip, default = "Instant::now")]
	started_at: Instant,
}

/// Output from a source sync job.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceSyncOutput {
	pub records_upserted: u64,
	pub records_deleted: u64,
	pub duration_ms: u64,
	pub error: Option<String>,
}

impl From<SourceSyncOutput> for JobOutput {
	fn from(o: SourceSyncOutput) -> Self {
		JobOutput::Custom(serde_json::to_value(o).unwrap_or_default())
	}
}

impl Job for SourceSyncJob {
	const NAME: &'static str = "source_sync";
	const RESUMABLE: bool = false;
	const DESCRIPTION: Option<&'static str> = Some("Sync an archive data source");
}

impl crate::infra::job::traits::DynJob for SourceSyncJob {
	fn job_name(&self) -> &'static str {
		Self::NAME
	}
}

impl SourceSyncJob {
	pub fn new(source_id: String, source_name: String) -> Self {
		Self {
			source_id,
			source_name,
			started_at: Instant::now(),
		}
	}
}

#[async_trait::async_trait]
impl JobHandler for SourceSyncJob {
	type Output = SourceSyncOutput;

	async fn run(&mut self, ctx: JobContext<'_>) -> JobResult<Self::Output> {
		ctx.log(format!("Starting sync for source '{}'", self.source_name));
		ctx.progress(Progress::Indeterminate(format!(
			"Syncing {}...",
			self.source_name
		)));

		let library = ctx.library.clone();

		// Initialize source manager if needed
		if library.source_manager().is_none() {
			library.init_source_manager().await.map_err(|e| {
				JobError::ExecutionFailed(format!("Failed to init source manager: {e}"))
			})?;
		}

		let source_manager = library
			.source_manager()
			.ok_or_else(|| JobError::ExecutionFailed("Source manager not available".to_string()))?;

		// Run the sync
		let report = source_manager
			.sync_source(&self.source_id)
			.await
			.map_err(|e| JobError::ExecutionFailed(format!("Sync failed: {e}")))?;

		let duration_ms = self.started_at.elapsed().as_millis() as u64;

		if let Some(ref err) = report.error {
			ctx.add_warning(format!("Sync completed with error: {err}"));
		}

		ctx.log(format!(
			"Sync complete: {} upserted, {} deleted in {:.1}s",
			report.records_upserted,
			report.records_deleted,
			duration_ms as f64 / 1000.0,
		));

		ctx.progress(Progress::Percentage(1.0));

		Ok(SourceSyncOutput {
			records_upserted: report.records_upserted,
			records_deleted: report.records_deleted,
			duration_ms,
			error: report.error,
		})
	}
}
