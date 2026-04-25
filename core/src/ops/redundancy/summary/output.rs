//! Output types for redundancy summary query

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

/// Complete redundancy summary for the library
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct RedundancySummaryOutput {
	/// Per-volume redundancy breakdown
	pub volumes: Vec<VolumeRedundancySummary>,
	/// Library-wide totals
	pub library_totals: LibraryRedundancyTotals,
}

/// Redundancy breakdown for a single volume
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct VolumeRedundancySummary {
	/// Volume UUID
	pub volume_uuid: Uuid,
	/// Display name of the volume
	pub display_name: Option<String>,
	/// Total bytes of file content on this volume (deduplicated within volume)
	pub total_bytes: i64,
	/// Bytes of content unique to this volume (at risk if volume is lost)
	pub at_risk_bytes: i64,
	/// Number of files whose content only exists on this volume
	pub at_risk_file_count: u32,
	/// Bytes of content that also exists on at least one other volume
	pub redundant_bytes: i64,
	/// Number of files whose content exists on other volumes too
	pub redundant_file_count: u32,
	/// Total number of files on this volume
	pub total_file_count: u32,
}

/// Library-wide redundancy totals
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct LibraryRedundancyTotals {
	/// Total unique content bytes across the entire library (deduplicated)
	pub total_unique_content_bytes: i64,
	/// Content bytes that exist on only one volume
	pub total_at_risk_bytes: i64,
	/// Content bytes that exist on two or more volumes
	pub total_redundant_bytes: i64,
	/// Ratio of redundant to total content (0.0 = nothing replicated, 1.0 = everything replicated)
	pub replication_score: f64,
}
