//! Input types for redundancy summary query

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// Input for the redundancy summary query
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RedundancySummaryInput {
	/// Optional: restrict summary to specific volumes. None = all volumes.
	#[serde(default)]
	pub volume_uuids: Option<Vec<Uuid>>,
}
