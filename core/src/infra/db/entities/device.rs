//! Device entity

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "devices")]
pub struct Model {
	#[sea_orm(primary_key)]
	#[serde(default)]
	pub id: i32,
	pub uuid: Uuid,
	pub name: String,
	pub slug: String,
	pub os: String,
	pub os_version: Option<String>,
	pub hardware_model: Option<String>,

	// Hardware specifications
	pub cpu_model: Option<String>,
	pub cpu_architecture: Option<String>,
	pub cpu_cores_physical: Option<u32>,
	pub cpu_cores_logical: Option<u32>,
	pub cpu_frequency_mhz: Option<i64>,
	pub memory_total_bytes: Option<i64>,
	pub form_factor: Option<String>,
	pub manufacturer: Option<String>,
	pub gpu_models: Option<Json>,
	pub boot_disk_type: Option<String>,
	pub boot_disk_capacity_bytes: Option<i64>,
	pub swap_total_bytes: Option<i64>,

	pub network_addresses: Json, // Vec<String> as JSON
	pub is_online: bool,
	pub last_seen_at: DateTimeUtc,
	pub capabilities: Json, // DeviceCapabilities as JSON
	#[serde(default)]
	pub created_at: DateTimeUtc,
	#[serde(default)]
	pub updated_at: DateTimeUtc,

	pub sync_enabled: bool,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
	#[sea_orm(has_many = "super::location::Entity")]
	Locations,
}

impl Related<super::location::Entity> for Entity {
	fn to() -> RelationDef {
		Relation::Locations.def()
	}
}

impl ActiveModelBehavior for ActiveModel {}

// Syncable Implementation
impl crate::infra::sync::Syncable for Model {
	const SYNC_MODEL: &'static str = "device";

	fn sync_id(&self) -> Uuid {
		self.uuid
	}

	fn version(&self) -> i64 {
		// Use updated_at timestamp as version for conflict resolution
		self.updated_at.timestamp()
	}

	fn exclude_fields() -> Option<&'static [&'static str]> {
		Some(&["id", "created_at", "updated_at"])
	}

	fn sync_depends_on() -> &'static [&'static str] {
		&[] // Device has no dependencies (root of dependency graph)
	}

	// FK Lookup Methods (device is FK target for locations, volumes)
	async fn lookup_id_by_uuid(
		uuid: Uuid,
		db: &DatabaseConnection,
	) -> Result<Option<i32>, sea_orm::DbErr> {
		use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
		Ok(Entity::find()
			.filter(Column::Uuid.eq(uuid))
			.one(db)
			.await?
			.map(|d| d.id))
	}

	async fn lookup_uuid_by_id(
		id: i32,
		db: &DatabaseConnection,
	) -> Result<Option<Uuid>, sea_orm::DbErr> {
		Ok(Entity::find_by_id(id).one(db).await?.map(|d| d.uuid))
	}

	async fn batch_lookup_ids_by_uuids(
		uuids: std::collections::HashSet<Uuid>,
		db: &DatabaseConnection,
	) -> Result<std::collections::HashMap<Uuid, i32>, sea_orm::DbErr> {
		use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
		if uuids.is_empty() {
			return Ok(std::collections::HashMap::new());
		}
		let records = Entity::find()
			.filter(Column::Uuid.is_in(uuids))
			.all(db)
			.await?;
		Ok(records.into_iter().map(|r| (r.uuid, r.id)).collect())
	}

	async fn batch_lookup_uuids_by_ids(
		ids: std::collections::HashSet<i32>,
		db: &DatabaseConnection,
	) -> Result<std::collections::HashMap<i32, Uuid>, sea_orm::DbErr> {
		use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
		if ids.is_empty() {
			return Ok(std::collections::HashMap::new());
		}
		let records = Entity::find().filter(Column::Id.is_in(ids)).all(db).await?;
		Ok(records.into_iter().map(|r| (r.id, r.uuid)).collect())
	}

	/// Query devices for sync backfill (shared resources)
	/// Returns ALL devices in library, not filtered by device_id
	async fn query_for_sync(
		_device_id: Option<Uuid>,
		since: Option<chrono::DateTime<chrono::Utc>>,
		_cursor: Option<(chrono::DateTime<chrono::Utc>, Uuid)>,
		batch_size: usize,
		db: &DatabaseConnection,
	) -> Result<Vec<(Uuid, serde_json::Value, chrono::DateTime<chrono::Utc>)>, sea_orm::DbErr> {
		use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QuerySelect};

		let mut query = Entity::find();

		// Filter by timestamp if specified (for incremental sync)
		if let Some(since_time) = since {
			query = query.filter(Column::UpdatedAt.gte(since_time));
		}

		// Apply batch limit
		query = query.limit(batch_size as u64);

		let results = query.all(db).await?;

		// Convert to sync format
		Ok(results
			.into_iter()
			.filter_map(|device| match device.to_sync_json() {
				Ok(json) => Some((device.uuid, json, device.updated_at)),
				Err(e) => {
					tracing::warn!(error = %e, "Failed to serialize device for sync");
					None
				}
			})
			.collect())
	}

	/// Apply shared change with HLC-based conflict resolution
	/// Slug changes propagate to all devices, with collision avoidance only on initial insert
	async fn apply_shared_change(
		entry: crate::infra::sync::SharedChangeEntry,
		db: &DatabaseConnection,
	) -> Result<(), sea_orm::DbErr> {
		use crate::infra::sync::ChangeType;
		use sea_orm::{ActiveValue::NotSet, ColumnTrait, EntityTrait, QueryFilter, Set};

		match entry.change_type {
			ChangeType::Insert | ChangeType::Update => {
				tracing::debug!(
					"[DEVICE_SYNC] Applying shared change: type={:?}, uuid={}",
					entry.change_type,
					entry.record_uuid
				);

				// Extract fields from JSON
				let data = entry.data.as_object().ok_or_else(|| {
					sea_orm::DbErr::Custom("Device data is not an object".to_string())
				})?;

				let uuid: Uuid = serde_json::from_value(
					data.get("uuid")
						.ok_or_else(|| sea_orm::DbErr::Custom("Missing uuid".to_string()))?
						.clone(),
				)
				.map_err(|e| sea_orm::DbErr::Custom(format!("Invalid uuid: {}", e)))?;

				// Check if device already exists
				let existing_device = Entity::find().filter(Column::Uuid.eq(uuid)).one(db).await?;

				// Determine slug to use: collision avoidance only on INSERT
				let slug_from_data: String = serde_json::from_value(
					data.get("slug")
						.cloned()
						.unwrap_or(serde_json::Value::String("unknown".to_string())),
				)
				.unwrap_or_else(|_| "unknown".to_string());

				let slug_to_use = if let Some(existing) = &existing_device {
					// Device exists - use incoming slug (allow slug changes to propagate)
					tracing::debug!(
						"[DEVICE_SYNC] Updating existing device, accepting slug change: {} -> {}",
						existing.slug,
						slug_from_data
					);
					slug_from_data
				} else {
					// New device - check for slug collisions
					tracing::debug!("[DEVICE_SYNC] New device, checking for slug collisions");
					let existing_slugs: Vec<String> = Entity::find()
						.all(db)
						.await?
						.iter()
						.map(|d| d.slug.clone())
						.collect();

					let unique_slug = crate::library::Library::ensure_unique_slug(
						&slug_from_data,
						&existing_slugs,
					);

					if unique_slug != slug_from_data {
						tracing::debug!(
							"[DEVICE_SYNC] Slug collision on insert! Using '{}' instead of '{}'",
							unique_slug,
							slug_from_data
						);
					}

					unique_slug
				};

				// Build ActiveModel for upsert
				let active = ActiveModel {
					id: NotSet,
					uuid: Set(uuid),
					name: Set(serde_json::from_value(
						data.get("name")
							.cloned()
							.unwrap_or(serde_json::Value::String("Unknown".to_string())),
					)
					.unwrap_or_else(|_| "Unknown".to_string())),
					slug: Set(slug_to_use),
					os: Set(serde_json::from_value(
						data.get("os")
							.cloned()
							.unwrap_or(serde_json::Value::String("Unknown".to_string())),
					)
					.unwrap_or_else(|_| "Unknown".to_string())),
					os_version: Set(serde_json::from_value(
						data.get("os_version")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					hardware_model: Set(serde_json::from_value(
						data.get("hardware_model")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					cpu_model: Set(serde_json::from_value(
						data.get("cpu_model")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					cpu_architecture: Set(serde_json::from_value(
						data.get("cpu_architecture")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					cpu_cores_physical: Set(serde_json::from_value(
						data.get("cpu_cores_physical")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					cpu_cores_logical: Set(serde_json::from_value(
						data.get("cpu_cores_logical")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					cpu_frequency_mhz: Set(serde_json::from_value(
						data.get("cpu_frequency_mhz")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					memory_total_bytes: Set(serde_json::from_value(
						data.get("memory_total_bytes")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					form_factor: Set(serde_json::from_value(
						data.get("form_factor")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					manufacturer: Set(serde_json::from_value(
						data.get("manufacturer")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					gpu_models: Set(serde_json::from_value(
						data.get("gpu_models")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					boot_disk_type: Set(serde_json::from_value(
						data.get("boot_disk_type")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					boot_disk_capacity_bytes: Set(serde_json::from_value(
						data.get("boot_disk_capacity_bytes")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					swap_total_bytes: Set(serde_json::from_value(
						data.get("swap_total_bytes")
							.cloned()
							.unwrap_or(serde_json::Value::Null),
					)
					.unwrap()),
					network_addresses: Set(serde_json::from_value(
						data.get("network_addresses")
							.cloned()
							.unwrap_or(serde_json::json!([])),
					)
					.unwrap()),
					is_online: Set(serde_json::from_value(
						data.get("is_online")
							.cloned()
							.unwrap_or(serde_json::Value::Bool(false)),
					)
					.unwrap_or(false)),
					last_seen_at: Set(serde_json::from_value(
						data.get("last_seen_at")
							.cloned()
							.unwrap_or_else(|| serde_json::json!(chrono::Utc::now())),
					)
					.unwrap_or_else(|_| chrono::Utc::now().into())),
					capabilities: Set(serde_json::from_value(
						data.get("capabilities")
							.cloned()
							.unwrap_or(serde_json::json!({})),
					)
					.unwrap()),
					created_at: Set(chrono::Utc::now().into()),
					updated_at: Set(chrono::Utc::now().into()),
					sync_enabled: Set(serde_json::from_value(
						data.get("sync_enabled")
							.cloned()
							.unwrap_or(serde_json::Value::Bool(true)),
					)
					.unwrap_or(true)),
				};

				// Idempotent upsert: insert or update based on UUID
				Entity::insert(active)
					.on_conflict(
						sea_orm::sea_query::OnConflict::column(Column::Uuid)
							.update_columns([
								Column::Name,
								Column::Slug, // Now updated on conflict to allow slug changes
								Column::Os,
								Column::OsVersion,
								Column::HardwareModel,
								Column::CpuModel,
								Column::CpuArchitecture,
								Column::CpuCoresPhysical,
								Column::CpuCoresLogical,
								Column::CpuFrequencyMhz,
								Column::MemoryTotalBytes,
								Column::FormFactor,
								Column::Manufacturer,
								Column::GpuModels,
								Column::BootDiskType,
								Column::BootDiskCapacityBytes,
								Column::SwapTotalBytes,
								Column::NetworkAddresses,
								Column::IsOnline,
								Column::LastSeenAt,
								Column::Capabilities,
								Column::UpdatedAt,
								Column::SyncEnabled,
							])
							.to_owned(),
					)
					.exec(db)
					.await?;
			}

			ChangeType::Delete => {
				// Delete by UUID
				tracing::debug!("[DEVICE_SYNC] Deleting device: uuid={}", entry.record_uuid);
				Entity::delete_many()
					.filter(Column::Uuid.eq(entry.record_uuid))
					.exec(db)
					.await?;
			}
		}

		Ok(())
	}
}

// Register with sync system via inventory as shared resource
crate::register_syncable_shared!(Model, "device", "devices");
