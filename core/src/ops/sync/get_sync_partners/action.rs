//! Get sync partners action

use crate::context::CoreContext;
use crate::infra::query::{LibraryQuery, QueryError, QueryResult};
use crate::infra::sync::NetworkTransport;
use std::sync::Arc;

use super::{GetSyncPartnersInput, GetSyncPartnersOutput};
use super::output::{DeviceDebugInfo, SyncPartnerInfo, SyncPartnersDebugInfo};

/// Get computed sync partners for the current library
pub struct GetSyncPartners {
	pub input: GetSyncPartnersInput,
}

impl LibraryQuery for GetSyncPartners {
	type Input = GetSyncPartnersInput;
	type Output = GetSyncPartnersOutput;

	fn from_input(input: Self::Input) -> QueryResult<Self> {
		Ok(Self { input })
	}

	async fn execute(
		self,
		context: Arc<CoreContext>,
		session: crate::infra::api::SessionContext,
	) -> QueryResult<Self::Output> {
		use crate::infra::db::entities;
		use sea_orm::{EntityTrait};

		// Get library from session
		let library_id = session
			.current_library_id
			.ok_or_else(|| QueryError::Internal("No library in session".to_string()))?;
		let library = context
			.libraries()
			.await
			.get_library(library_id)
			.await
			.ok_or_else(|| QueryError::LibraryNotFound(library_id))?;

		let db = library.db().conn();

		// Get the sync service
		let sync_service = library
			.sync_service()
			.ok_or_else(|| QueryError::Internal("Sync service not initialized".to_string()))?;

		// Get all library devices first for debug info
		let all_devices = entities::device::Entity::find()
			.all(db)
			.await
			.map_err(|e| QueryError::Database(e.to_string()))?;

		// Get the NetworkTransport from sync service
		let network = sync_service.peer_sync().network();

		// Call get_connected_sync_partners (the same method the Ready state uses)
		let partner_uuids = network
			.get_connected_sync_partners(library_id, db)
			.await
			.map_err(|e| QueryError::Internal(format!("Failed to get sync partners: {}", e)))?;

		// Get the device registry to check NodeId mappings
		let device_registry = context
			.get_networking()
			.await
			.map(|networking| networking.device_registry());

		// Build partner info list
		let mut partners = Vec::new();
		for device_uuid in &partner_uuids {
			if let Some(device) = all_devices.iter().find(|d| &d.uuid == device_uuid) {
				partners.push(SyncPartnerInfo {
					device_uuid: device.uuid,
					device_name: device.name.clone(),
					is_paired: true, // If it's in the list, it must be paired
				});
			}
		}

		// Build debug info
		let sync_enabled_count = all_devices.iter().filter(|d| d.sync_enabled).count();

		let mut paired_count = 0;
		let mut device_details = Vec::new();

		if let Some(registry_arc) = device_registry {
			let registry = registry_arc.read().await;

			for device in &all_devices {
				let node_id = registry.get_node_id_for_device(device.uuid);
				let has_node_id = node_id.is_some();

				if has_node_id {
					paired_count += 1;
				}

				device_details.push(DeviceDebugInfo {
					uuid: device.uuid,
					name: device.name.clone(),
					sync_enabled: device.sync_enabled,
					has_node_id,
					node_id: node_id.map(|id| id.to_string()),
				});
			}
		}

		let debug_info = SyncPartnersDebugInfo {
			total_devices: all_devices.len(),
			sync_enabled_devices: sync_enabled_count,
			paired_devices: paired_count,
			final_sync_partners: partner_uuids.len(),
			device_details,
		};

		Ok(GetSyncPartnersOutput {
			partners,
			debug_info,
		})
	}
}

// Register the query
crate::register_library_query!(GetSyncPartners, "sync.partners");
