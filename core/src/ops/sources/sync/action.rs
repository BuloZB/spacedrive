//! Source sync action — dispatches a SourceSyncJob

use super::job::SourceSyncJob;
use crate::{
	context::CoreContext,
	infra::action::{error::ActionError, LibraryAction},
	library::Library,
};
use serde::{Deserialize, Serialize};
use specta::Type;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SyncSourceInput {
	pub source_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSourceAction {
	input: SyncSourceInput,
}

impl LibraryAction for SyncSourceAction {
	type Input = SyncSourceInput;
	type Output = crate::infra::job::handle::JobReceipt;

	fn from_input(input: SyncSourceInput) -> Result<Self, String> {
		if input.source_id.trim().is_empty() {
			return Err("Source ID cannot be empty".to_string());
		}
		Ok(Self { input })
	}

	async fn execute(
		self,
		library: Arc<Library>,
		_context: Arc<CoreContext>,
	) -> Result<Self::Output, ActionError> {
		// Get source name for job display
		if library.source_manager().is_none() {
			library.init_source_manager().await.map_err(|e| {
				ActionError::Internal(format!("Failed to init source manager: {e}"))
			})?;
		}

		let source_manager = library
			.source_manager()
			.ok_or_else(|| ActionError::Internal("Source manager not available".to_string()))?;

		// Look up source name
		let sources = source_manager
			.list_sources()
			.await
			.map_err(|e| ActionError::Internal(e))?;

		let source_name = sources
			.iter()
			.find(|s| s.id == self.input.source_id)
			.map(|s| s.name.clone())
			.unwrap_or_else(|| self.input.source_id.clone());

		let job = SourceSyncJob::new(self.input.source_id, source_name);

		let job_handle = library
			.jobs()
			.dispatch(job)
			.await
			.map_err(ActionError::Job)?;

		Ok(job_handle.into())
	}

	fn action_kind(&self) -> &'static str {
		"sources.sync"
	}
}

crate::register_library_action!(SyncSourceAction, "sources.sync");
