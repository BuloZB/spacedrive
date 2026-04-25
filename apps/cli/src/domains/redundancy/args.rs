use clap::Args;
use uuid::Uuid;

use sd_core::ops::redundancy::summary::RedundancySummaryInput;

#[derive(Args, Debug)]
pub struct SummaryArgs {
	/// Restrict summary to specific volume UUIDs (can be specified multiple times).
	/// Omit to summarize the entire library.
	#[arg(long = "volume", value_name = "VOLUME_UUID")]
	pub volumes: Option<Vec<Uuid>>,
}

impl From<SummaryArgs> for RedundancySummaryInput {
	fn from(args: SummaryArgs) -> Self {
		Self {
			volume_uuids: args.volumes,
		}
	}
}

#[derive(Args, Debug)]
pub struct AtRiskArgs {
	/// Only return files present on this volume (UUID)
	#[arg(long, value_name = "VOLUME_UUID")]
	pub volume: Option<Uuid>,

	/// Show redundant files (content on 2+ volumes) instead of at-risk (content on 1 volume)
	#[arg(long)]
	pub redundant: bool,

	/// Max number of files to show
	#[arg(long, default_value = "50")]
	pub limit: u32,

	/// Pagination offset
	#[arg(long, default_value = "0")]
	pub offset: u32,
}

#[derive(Args, Debug)]
pub struct CompareArgs {
	/// First volume UUID
	pub volume_a: Uuid,

	/// Second volume UUID
	pub volume_b: Uuid,

	/// What to compare
	#[arg(long, value_enum, default_value = "unique-a")]
	pub mode: CompareMode,

	/// Max number of files to show
	#[arg(long, default_value = "50")]
	pub limit: u32,

	/// Pagination offset
	#[arg(long, default_value = "0")]
	pub offset: u32,
}

#[derive(clap::ValueEnum, Clone, Debug)]
pub enum CompareMode {
	/// Files present on volume A but not on volume B
	UniqueA,
	/// Files present on volume B but not on volume A
	UniqueB,
	/// Files present on both volumes
	Shared,
}
