//! Output for get sync partners operation

use serde::{Deserialize, Serialize};
use specta::Type;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct GetSyncPartnersOutput {
	pub partners: Vec<SyncPartnerInfo>,
	pub debug_info: SyncPartnersDebugInfo,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SyncPartnerInfo {
	pub device_uuid: Uuid,
	pub device_name: String,
	pub is_paired: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct SyncPartnersDebugInfo {
	pub total_devices: usize,
	pub sync_enabled_devices: usize,
	pub paired_devices: usize,
	pub final_sync_partners: usize,
	pub device_details: Vec<DeviceDebugInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Type)]
pub struct DeviceDebugInfo {
	pub uuid: Uuid,
	pub name: String,
	pub sync_enabled: bool,
	pub has_node_id: bool,
	pub node_id: Option<String>,
}
