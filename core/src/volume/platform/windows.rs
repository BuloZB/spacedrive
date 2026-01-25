//! Windows-specific volume detection helpers

use crate::volume::{
	classification::{get_classifier, VolumeDetectionInfo},
	error::{VolumeError, VolumeResult},
	types::{DiskType, FileSystem, MountType, Volume, VolumeDetectionConfig, VolumeFingerprint},
	utils,
};
use serde::Deserialize;
use std::path::PathBuf;
use std::process::Command;
use tokio::task;
use tracing::{debug, warn};
use uuid::Uuid;

/// Windows volume information from PowerShell/WMI
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct WindowsVolumeInfo {
	pub drive_letter: Option<String>,
	#[serde(rename = "FileSystemLabel")]
	pub label: Option<String>,
	#[serde(default)]
	pub size: u64,
	#[serde(default)]
	pub size_remaining: u64,
	#[serde(rename = "FileSystem", default)]
	pub filesystem: String,
	#[serde(rename = "UniqueId")]
	pub volume_guid: Option<String>,
}

/// Detect Windows volumes using PowerShell
pub async fn detect_volumes(
	device_id: Uuid,
	config: &VolumeDetectionConfig,
) -> VolumeResult<Vec<Volume>> {
	let config = config.clone(); // Clone to move into async block
	task::spawn_blocking(move || {
		// Use PowerShell to get volume information
		let output = Command::new("powershell")
			.args([
				"-Command",
				"Get-Volume | Select-Object DriveLetter,FileSystemLabel,Size,SizeRemaining,FileSystem,UniqueId | ConvertTo-Json"
			])
			.output()
			.map_err(|e| VolumeError::platform(format!("Failed to run PowerShell: {}", e)))?;

		if !output.status.success() {
			warn!("PowerShell Get-Volume command failed, trying fallback method");
			return detect_volumes_fallback(device_id, &config);
		}

		let json_output = String::from_utf8_lossy(&output.stdout);
		parse_powershell_volumes(&json_output, device_id, &config)
	})
	.await
	.map_err(|e| VolumeError::platform(format!("Task join error: {}", e)))?
}

/// Parse PowerShell JSON output into volumes
fn parse_powershell_volumes(
	json_output: &str,
	device_id: Uuid,
	config: &VolumeDetectionConfig,
) -> VolumeResult<Vec<Volume>> {
	let trimmed = json_output.trim();
	if trimmed.is_empty() {
		debug!("PowerShell returned empty output");
		return Ok(Vec::new());
	}

	// PowerShell returns a single object (not array) when there's only one volume
	let volume_infos: Vec<WindowsVolumeInfo> = if trimmed.starts_with('[') {
		serde_json::from_str(trimmed).map_err(|e| {
			VolumeError::platform(format!("Failed to parse PowerShell JSON array: {}", e))
		})?
	} else {
		let single: WindowsVolumeInfo = serde_json::from_str(trimmed).map_err(|e| {
			VolumeError::platform(format!("Failed to parse PowerShell JSON object: {}", e))
		})?;
		vec![single]
	};

	debug!("Parsed {} volumes from PowerShell", volume_infos.len());

	let mut volumes = Vec::new();
	for info in volume_infos {
		// Skip volumes without drive letters or with zero size (unless they have a label)
		if info.drive_letter.is_none() {
			debug!(
				"Skipping volume without drive letter: label={:?}. guid={:?}",
				info.label, info.volume_guid
			);
			continue;
		}

		if info.size == 0 {
			debug!("Skipping volume with zero size: {:?}", info.drive_letter);
			continue;
		}

		match create_volume_from_windows_info(info, device_id) {
			Ok(volume) => {
				if should_include_volume(&volume, config) {
					volumes.push(volume);
				}
			}
			Err(e) => {
				warn!("Failed to create volume from Windows info: {}", e);
			}
		}
	}

	Ok(volumes)
}

/// Fallback method using wmic or fsutil
fn detect_volumes_fallback(
	device_id: Uuid,
	config: &VolumeDetectionConfig,
) -> VolumeResult<Vec<Volume>> {
	let mut volumes = Vec::new();

	// Try using wmic as fallback
	let output = Command::new("wmic")
		.args([
			"logicaldisk",
			"get",
			"size,freespace,caption,filesystem,volumename",
			"/format:csv",
		])
		.output();

	match output {
		Ok(output) if output.status.success() => {
			let csv_output = String::from_utf8_lossy(&output.stdout);
			volumes.extend(parse_wmic_output(&csv_output, device_id, config)?);
		}
		_ => {
			warn!("Both PowerShell and wmic methods failed for Windows volume detection");
		}
	}

	Ok(volumes)
}

/// Parse wmic CSV output
fn parse_wmic_output(
	csv_output: &str,
	device_id: Uuid,
	_config: &VolumeDetectionConfig,
) -> VolumeResult<Vec<Volume>> {
	let mut volumes = Vec::new();

	for line in csv_output.lines().skip(1) {
		// Skip header
		let fields: Vec<&str> = line.split(',').collect();
		if fields.len() >= 6 {
			let caption = fields[1].trim();
			let filesystem = fields[2].trim();
			let freespace_str = fields[3].trim();
			let size_str = fields[5].trim();
			let volume_name = fields[6].trim();

			// Skip if essential fields are empty
			if caption.is_empty() || size_str.is_empty() {
				continue;
			}

			let total_bytes = size_str.parse::<u64>().unwrap_or(0);
			let available_bytes = freespace_str.parse::<u64>().unwrap_or(0);

			if total_bytes == 0 {
				continue;
			}

			let mount_path = PathBuf::from(caption);
			let name = if volume_name.is_empty() {
				format!("Local Disk ({})", caption)
			} else {
				volume_name.to_string()
			};

			let file_system = utils::parse_filesystem_type(filesystem);
			let mount_type = determine_mount_type_windows(caption);
			let disk_type = DiskType::Unknown; // Would need additional WMI queries

			let volume_type = classify_volume(&mount_path, &file_system, &name);

			// Generate stable fingerprint based on volume type
			let fingerprint = match volume_type {
				crate::volume::types::VolumeType::External => {
					// Try to read/create dotfile for external volumes
					if let Some(spacedrive_id) =
						utils::read_or_create_dotfile_sync(&mount_path, device_id, None)
					{
						VolumeFingerprint::from_external_volume(spacedrive_id, device_id)
					} else {
						// Fallback to mount_point + device_id for read-only external volumes
						VolumeFingerprint::from_primary_volume(&mount_path, device_id)
					}
				}
				crate::volume::types::VolumeType::Network => {
					// Use caption as backend identifier for network volumes
					VolumeFingerprint::from_network_volume(caption, &mount_path.to_string_lossy())
				}
				_ => {
					// Primary, UserData, Secondary, System, Virtual, Unknown
					// All use stable mount_point + device_id
					VolumeFingerprint::from_primary_volume(&mount_path, device_id)
				}
			};

			let mut volume = Volume::new(device_id, fingerprint, name.clone(), mount_path);

			volume.mount_type = mount_type;
			volume.volume_type = volume_type;
			volume.disk_type = disk_type;
			volume.file_system = file_system;
			volume.total_capacity = total_bytes;
			volume.available_space = available_bytes;
			volume.is_read_only = false;
			volume.hardware_id = Some(caption.to_string());

			volumes.push(volume);
		}
	}

	Ok(volumes)
}

/// Classify a volume using the platform-specific classifier
fn classify_volume(
	mount_point: &PathBuf,
	file_system: &FileSystem,
	name: &str,
) -> crate::volume::types::VolumeType {
	let classifier = get_classifier();
	let detection_info = VolumeDetectionInfo {
		mount_point: mount_point.clone(),
		file_system: file_system.clone(),
		total_bytes_capacity: 0, // We don't have this info yet in some contexts
		is_removable: None,      // Would need additional detection
		is_network_drive: None,  // Would need additional detection
		device_model: None,      // Would need additional detection
	};

	classifier.classify(&detection_info)
}

/// Determine mount type for Windows drives
fn determine_mount_type_windows(drive_letter: &str) -> MountType {
	match drive_letter.to_uppercase().as_str() {
		"C:\\" | "D:\\" => MountType::System, // Common system drives
		_ => MountType::External,             // Assume external for others
	}
}

/// Get Windows volume info using PowerShell (stub for now)
pub async fn get_windows_volume_info() -> VolumeResult<Vec<WindowsVolumeInfo>> {
	// This would be implemented with proper PowerShell parsing
	// or Windows API calls
	Ok(Vec::new())
}

/// Create volume from Windows info (stub for now)
pub fn create_volume_from_windows_info(
	info: WindowsVolumeInfo,
	device_id: Uuid,
) -> VolumeResult<Volume> {
	let mount_path = match &info.drive_letter {
		Some(drive_letter) => PathBuf::from(format!("{}:\\", drive_letter)),
		None => {
			return Err(VolumeError::platform(format!(
				"Volume without drive letter reached create_volume_from_windows_info: {:?}",
				info.label
			)))
		}
	};

	let name = match &info.label {
		Some(label) if !label.is_empty() => label.clone(),
		_ => format!("Local Disk ({}:)", info.drive_letter.as_ref().unwrap()),
	};

	let file_system = utils::parse_filesystem_type(&info.filesystem);
	let mount_type = if let Some(drive) = &info.drive_letter {
		determine_mount_type_windows(&format!("{}:\\", drive))
	} else {
		MountType::System
	};
	let volume_type = classify_volume(&mount_path, &file_system, &name);

	// Generate stable fingerprint based on volume type
	let fingerprint = match volume_type {
		crate::volume::types::VolumeType::External => {
			// Try to read/create dotfile for external volumes
			if let Some(spacedrive_id) =
				utils::read_or_create_dotfile_sync(&mount_path, device_id, None)
			{
				VolumeFingerprint::from_external_volume(spacedrive_id, device_id)
			} else {
				// Fallback to mount_point + device_id for read-only external volumes
				VolumeFingerprint::from_primary_volume(&mount_path, device_id)
			}
		}
		crate::volume::types::VolumeType::Network => {
			// Use mount path as backend identifier for network volumes
			let path_lossy = mount_path.to_string_lossy();
			let backend_id = info.volume_guid.as_deref().unwrap_or(&path_lossy);
			VolumeFingerprint::from_network_volume(backend_id, &path_lossy)
		}
		_ => {
			// Primary, UserData, Secondary, System, Virtual, Unknown
			// All use stable mount_point + device_id
			VolumeFingerprint::from_primary_volume(&mount_path, device_id)
		}
	};

	let mut volume = Volume::new(device_id, fingerprint, name.clone(), mount_path);

	volume.mount_type = mount_type;
	volume.volume_type = volume_type;
	volume.disk_type = DiskType::Unknown;
	volume.file_system = file_system;
	volume.total_capacity = info.size;
	volume.available_space = info.size_remaining;
	volume.is_read_only = false;
	volume.hardware_id = info.volume_guid;

	Ok(volume)
}

/// Check if volume should be included based on config
pub fn should_include_volume(volume: &Volume, config: &VolumeDetectionConfig) -> bool {
	// Apply filtering based on config
	if !config.include_system && matches!(volume.mount_type, MountType::System) {
		return false;
	}

	// FIX: Use parentheses to call the method
	if !config.include_virtual && volume.total_bytes_capacity() == 0 {
		return false;
	}

	true
}
