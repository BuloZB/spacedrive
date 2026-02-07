use anyhow::{Context, Result};
use std::path::{Path, PathBuf};
use std::process::Command;

enum FileType {
	CargoToml,
	Json,
}

/// All files that contain the Spacedrive product version
fn version_files(root: &Path) -> Vec<(PathBuf, FileType)> {
	vec![
		(root.join("core/Cargo.toml"), FileType::CargoToml),
		(root.join("apps/server/Cargo.toml"), FileType::CargoToml),
		(root.join("apps/cli/Cargo.toml"), FileType::CargoToml),
		(
			root.join("apps/tauri/src-tauri/Cargo.toml"),
			FileType::CargoToml,
		),
		(
			root.join("apps/tauri/sd-tauri-core/Cargo.toml"),
			FileType::CargoToml,
		),
		(
			root.join("apps/tauri/src-tauri/tauri.conf.json"),
			FileType::Json,
		),
		(root.join("apps/tauri/package.json"), FileType::Json),
	]
}

fn validate_version(version: &str) -> Result<()> {
	let core = version.split('-').next().unwrap_or(version);

	let parts: Vec<&str> = core.split('.').collect();
	if parts.len() != 3 {
		anyhow::bail!(
			"Invalid version: '{}'. Expected format: X.Y.Z or X.Y.Z-pre.N",
			version
		);
	}

	for part in &parts {
		part.parse::<u32>()
			.context(format!("Invalid version number: '{}'", part))?;
	}

	Ok(())
}

fn update_cargo_toml(content: &str, new_version: &str) -> Result<(String, String)> {
	let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
	let mut old_version = String::new();
	let mut in_package = false;
	let mut found = false;

	for line in &mut lines {
		let trimmed = line.trim();

		if trimmed == "[package]" {
			in_package = true;
			continue;
		}
		if trimmed.starts_with('[') {
			in_package = false;
			continue;
		}

		if in_package && !found {
			if let Some(rest) = trimmed.strip_prefix("version") {
				let rest = rest.trim();
				if let Some(rest) = rest.strip_prefix('=') {
					let rest = rest.trim();
					if rest.starts_with('"') && rest.ends_with('"') {
						old_version = rest[1..rest.len() - 1].to_string();
						*line = line.replace(
							&format!("\"{}\"", old_version),
							&format!("\"{}\"", new_version),
						);
						found = true;
					}
				}
			}
		}
	}

	if !found {
		anyhow::bail!("Could not find version in [package] section");
	}

	let mut result = lines.join("\n");
	if content.ends_with('\n') {
		result.push('\n');
	}

	Ok((result, old_version))
}

fn update_json(content: &str, new_version: &str) -> Result<(String, String)> {
	let mut lines: Vec<String> = content.lines().map(|l| l.to_string()).collect();
	let mut old_version = String::new();
	let mut found = false;

	for line in &mut lines {
		let trimmed = line.trim();

		if !found && trimmed.starts_with("\"version\"") {
			if let Some(colon_pos) = trimmed.find(':') {
				let after_colon = trimmed[colon_pos + 1..].trim();
				let version_str = after_colon.trim_end_matches(',');
				if version_str.starts_with('"') && version_str.ends_with('"') {
					old_version = version_str[1..version_str.len() - 1].to_string();
					*line = line.replace(
						&format!("\"{}\"", old_version),
						&format!("\"{}\"", new_version),
					);
					found = true;
				}
			}
		}
	}

	if !found {
		anyhow::bail!("Could not find \"version\" field");
	}

	let mut result = lines.join("\n");
	if content.ends_with('\n') {
		result.push('\n');
	}

	Ok((result, old_version))
}

pub fn bump(root: &Path, new_version: &str) -> Result<()> {
	validate_version(new_version)?;

	println!("Bumping version to {}...", new_version);
	println!();

	for (path, file_type) in version_files(root) {
		let relative = path.strip_prefix(root).unwrap_or(&path);

		if !path.exists() {
			println!("  ⚠ {} (not found, skipping)", relative.display());
			continue;
		}

		let content = std::fs::read_to_string(&path)
			.context(format!("Failed to read {}", relative.display()))?;

		let (new_content, old_version) = match file_type {
			FileType::CargoToml => update_cargo_toml(&content, new_version)?,
			FileType::Json => update_json(&content, new_version)?,
		};

		if content != new_content {
			std::fs::write(&path, &new_content)
				.context(format!("Failed to write {}", relative.display()))?;
			println!(
				"  ✓ {} ({} → {})",
				relative.display(),
				old_version,
				new_version
			);
		} else {
			println!("  - {} (already {})", relative.display(), new_version);
		}
	}

	// Commit version changes and create git tag
	let tag = format!("v{}", new_version);

	let files: Vec<String> = version_files(root)
		.into_iter()
		.filter(|(p, _)| p.exists())
		.map(|(p, _)| p.to_string_lossy().to_string())
		.collect();

	let mut add_args = vec!["add".to_string()];
	add_args.extend(files);

	Command::new("git")
		.args(&add_args)
		.current_dir(root)
		.status()
		.context("Failed to stage version files")?;

	Command::new("git")
		.args(["commit", "-m", &tag])
		.current_dir(root)
		.status()
		.context("Failed to create commit")?;

	Command::new("git")
		.args(["tag", &tag])
		.current_dir(root)
		.status()
		.context("Failed to create tag")?;

	println!();
	println!("Committed and tagged {}. Push with:", tag);
	println!("  git push --tags");

	Ok(())
}
