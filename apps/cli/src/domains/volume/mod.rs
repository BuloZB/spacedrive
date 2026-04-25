mod args;

use anyhow::Result;
use clap::Subcommand;

use crate::util::prelude::*;

use crate::context::Context;
use sd_core::ops::volumes::{
	add_cloud::VolumeAddCloudOutput, remove_cloud::VolumeRemoveCloudOutput,
};

use self::args::*;

#[derive(Subcommand, Debug)]
pub enum VolumeCmd {
	/// Add a cloud storage volume to the library
	AddCloud(VolumeAddCloudArgs),
	/// Remove a cloud storage volume from the library
	RemoveCloud(VolumeRemoveCloudArgs),
	/// List all detected volumes
	List,
	/// Scan for volumes and auto-track eligible ones
	Scan,
}

pub async fn run(ctx: &Context, cmd: VolumeCmd) -> Result<()> {
	match cmd {
		VolumeCmd::AddCloud(args) => {
			let display_name = args.name.clone();
			let service = format!("{:?}", args.service);

			let input = args.validate_and_build().map_err(|e| anyhow::anyhow!(e))?;

			let out: VolumeAddCloudOutput = execute_action!(ctx, input);

			print_output!(ctx, &out, |o: &VolumeAddCloudOutput| {
				println!(
					"Added cloud volume '{}' ({})",
					o.volume_name,
					o.fingerprint.short_id()
				);
				println!("Service: {:?}", o.service);
				println!("Fingerprint: {}", o.fingerprint);
			});
		}
		VolumeCmd::RemoveCloud(args) => {
			let fingerprint_display = args.fingerprint.clone();

			confirm_or_abort(
				&format!(
					"This will remove cloud volume {} from the library. Credentials will be deleted. Continue?",
					fingerprint_display
				),
				args.yes,
			)?;

			let input: sd_core::ops::volumes::remove_cloud::VolumeRemoveCloudInput =
				args.try_into().map_err(|e: String| anyhow::anyhow!(e))?;

			let out: VolumeRemoveCloudOutput = execute_action!(ctx, input);

			print_output!(ctx, &out, |o: &VolumeRemoveCloudOutput| {
				println!("Removed cloud volume {}", o.fingerprint);
			});
		}
		VolumeCmd::List => {
			ctx.require_current_library()?;

			let input = sd_core::ops::volumes::list::query::VolumeListQueryInput {
				filter: sd_core::ops::volumes::VolumeFilter::TrackedOnly,
			};
			let output: sd_core::ops::volumes::list::output::VolumeListOutput =
				execute_query!(ctx, input);

			if output.volumes.is_empty() {
				println!("No volumes tracked in the current library.");
				println!("\nVolumes must be detected and tracked by the backend.");
				return Ok(());
			}

			println!("Tracked {} volume(s):\n", output.volumes.len());

			for volume in output.volumes {
				println!("{}", volume.display_name.as_ref().unwrap_or(&volume.name));
				println!("   ID: {}", volume.id);
				println!("   Fingerprint: {}", volume.fingerprint);
				println!("   Type: {:?}", volume.volume_type);
				println!("   Mount: {}", volume.mount_point.display());
				println!(
					"   Capacity: {} total, {} available",
					format_bytes(volume.total_capacity),
					format_bytes(volume.available_space),
				);
				println!(
					"   Visible: {}, Tracked: {}, Mounted: {}",
					volume.is_user_visible, volume.is_tracked, volume.is_mounted,
				);
				println!();
			}
		}
		VolumeCmd::Scan => {
			println!("Volume scanning must be triggered by the backend.");
			println!("Restart the application to trigger volume detection.");
		}
	}
	Ok(())
}

fn format_bytes(bytes: u64) -> String {
	const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB", "PB"];
	if bytes == 0 {
		return "0 B".to_string();
	}
	let mut value = bytes as f64;
	let mut unit = 0;
	while value >= 1024.0 && unit < UNITS.len() - 1 {
		value /= 1024.0;
		unit += 1;
	}
	if unit == 0 {
		format!("{} {}", bytes, UNITS[unit])
	} else {
		format!("{:.2} {}", value, UNITS[unit])
	}
}
